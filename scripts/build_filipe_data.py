"""build_filipe_data.py — "Tela Filipe": análise de clientes (RFM, churn, recompra).

Fonte: C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet (tem cliente_cpf_cnpj,
cliente_nome — o slim vendas_dash.parquet NÃO tem). Chave de cliente = CPF/CNPJ
(1:1 com cliente_id nesta base).

Gera window.FILIPE_DATA:
  meta            : datas, mediana de recompra, thresholds de churn, lista de meses
  rfm_resumo      : segmento RFM -> n_clientes, receita (TODA a base)
  churn_resumo    : status (Ativo/Em risco/Churned) -> n_clientes, receita (TODA a base)
  clientes        : TOP-N por receita, detalhado (R/F/M, segmento, churn, recência...)
  cliente_mes     : TOP-N x mês -> receita, pedidos  (ranking 2 períodos + sazonalidade)
  cliente_produto : TOP-N x top produtos -> receita, qtd, pedidos  (cliente × produto)

Métrica de churn ("baseado no padrão"): intervalo mediano de recompra ~43d →
  Ativo < 90d | Em risco 90–180d | Churned > 180d  (≈ 2× e 4× o ciclo).
RFM: scores 1–5 por quintil (NTILE) sobre recência (invertida), frequência, monetary.
"""
import duckdb
import json
import pathlib

SRC = pathlib.Path("C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet")
OUT = pathlib.Path(__file__).parent.parent / "filipe-data.js"

TOP_N = 1000          # clientes detalhados + cliente_mes
TOP_N_PROD = 500      # clientes no cruzamento cliente × produto
TOP_PROD_POR_CLI = 12
CHURN_ATIVO_D = 90
CHURN_CHURN_D = 180

if not SRC.exists():
    raise SystemExit(f"fonte não encontrada: {SRC}")

con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{SRC.as_posix()}') WHERE cliente_cpf_cnpj IS NOT NULL AND cliente_cpf_cnpj <> ''")

max_d = con.execute("SELECT MAX(data_pedido)::DATE FROM v").fetchone()[0]


def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else None


# Intervalo mediano de recompra (dias entre pedidos do mesmo cliente)
mediana_recompra = q1("""
  WITH ped AS (SELECT DISTINCT cliente_cpf_cnpj k, data_pedido FROM v),
       g AS (SELECT k, data_pedido,
                    LAG(data_pedido) OVER (PARTITION BY k ORDER BY data_pedido) prev
             FROM ped)
  SELECT median(date_diff('day', prev, data_pedido)) FROM g WHERE prev IS NOT NULL
""")

# ============================================================
# Base por cliente (TODA a base) — RFM + churn
# ============================================================
con.execute(f"""
  CREATE OR REPLACE TABLE cli AS
  WITH base AS (
    SELECT cliente_cpf_cnpj                          AS k,
           any_value(cliente_nome)                   AS nome,
           any_value(cliente_tipo_pessoa)            AS tipo,
           any_value(cliente_cidade)                 AS cidade,
           any_value(cliente_uf)                     AS uf,
           MIN(data_pedido)                          AS primeira_compra,
           MAX(data_pedido)                          AS ultima_compra,
           date_diff('day', MAX(data_pedido), DATE '{max_d}') AS recency,
           COUNT(DISTINCT numero)                    AS frequency,
           SUM(valor_rateado)::DOUBLE                AS monetary
    FROM v
    GROUP BY cliente_cpf_cnpj
  )
  SELECT *,
         (monetary / NULLIF(frequency, 0))           AS ticket_medio,
         -- R: menor recência = score maior (5). F e M: maior = 5.
         (6 - NTILE(5) OVER (ORDER BY recency ASC))::INT  AS r_score,
         NTILE(5) OVER (ORDER BY frequency ASC)::INT       AS f_score,
         NTILE(5) OVER (ORDER BY monetary ASC)::INT        AS m_score,
         CASE WHEN recency < {CHURN_ATIVO_D} THEN 'Ativo'
              WHEN recency < {CHURN_CHURN_D} THEN 'Em risco'
              ELSE 'Churned' END                     AS churn_status
  FROM base
""")


def segmento(r, f):
    """Segmentação RFM simplificada (modelo R×F), 7 grupos."""
    if r >= 4 and f >= 4:
        return "Campeões"
    if r >= 3 and f >= 3:
        return "Leais"
    if r >= 4 and f <= 2:
        return "Novos / Promissores"
    if r == 3 and f <= 2:
        return "Precisam Atenção"
    if r <= 2 and f >= 3:
        return "Em Risco (alto valor)"
    if r == 2 and f <= 2:
        return "Hibernando"
    return "Perdidos"


# Aplica segmento em Python (row a row) e devolve pro DuckDB via tabela temporária
cli_rows = q("SELECT k, r_score, f_score, m_score FROM cli")
seg_map = {row["k"]: segmento(int(row["r_score"]), int(row["f_score"])) for row in cli_rows}
con.execute("CREATE OR REPLACE TABLE seg (k VARCHAR, segmento VARCHAR)")
con.executemany("INSERT INTO seg VALUES (?, ?)", list(seg_map.items()))
con.execute("""
  CREATE OR REPLACE TABLE cli2 AS
  SELECT cli.*, seg.segmento FROM cli JOIN seg USING (k)
""")

# ============================================================
# Resumos (TODA a base)
# ============================================================
n_clientes = int(q1("SELECT COUNT(*) FROM cli2"))

rfm_resumo = q("""
  SELECT segmento,
         COUNT(*)::INT          AS n_clientes,
         SUM(monetary)::DOUBLE  AS receita,
         AVG(recency)::DOUBLE   AS recency_med,
         AVG(frequency)::DOUBLE AS freq_med,
         AVG(monetary)::DOUBLE  AS monetary_med
  FROM cli2 GROUP BY segmento ORDER BY receita DESC
""")
tot_rec = sum(s["receita"] for s in rfm_resumo) or 1
for s in rfm_resumo:
    s["pct_clientes"] = s["n_clientes"] / n_clientes
    s["pct_receita"] = s["receita"] / tot_rec

churn_resumo = q(f"""
  SELECT churn_status AS status,
         COUNT(*)::INT         AS n_clientes,
         SUM(monetary)::DOUBLE AS receita,
         AVG(recency)::DOUBLE  AS recency_med
  FROM cli2 GROUP BY churn_status
""")
ordem = {"Ativo": 0, "Em risco": 1, "Churned": 2}
churn_resumo.sort(key=lambda x: ordem.get(x["status"], 9))
for s in churn_resumo:
    s["pct_clientes"] = s["n_clientes"] / n_clientes
    s["pct_receita"] = s["receita"] / tot_rec

# ============================================================
# TOP-N clientes detalhados
# ============================================================
clientes = q(f"""
  SELECT k AS cpf_cnpj, nome, tipo, cidade, uf,
         primeira_compra::VARCHAR AS primeira_compra,
         ultima_compra::VARCHAR   AS ultima_compra,
         recency::INT             AS recency,
         frequency::INT           AS frequency,
         monetary::DOUBLE         AS monetary,
         ticket_medio::DOUBLE     AS ticket_medio,
         r_score, f_score, m_score, segmento, churn_status
  FROM cli2 ORDER BY monetary DESC LIMIT {TOP_N}
""")
top_keys = [c["cpf_cnpj"] for c in clientes]
plac = ",".join("'" + str(k).replace("'", "''") + "'" for k in top_keys)

# cliente × mês (ranking 2 períodos + sazonalidade)
cliente_mes = q(f"""
  SELECT cliente_cpf_cnpj AS k,
         strftime(data_pedido, '%Y-%m') AS am,
         SUM(valor_rateado)::DOUBLE     AS receita,
         COUNT(DISTINCT numero)::INT    AS pedidos
  FROM v WHERE cliente_cpf_cnpj IN ({plac})
  GROUP BY 1, 2
""")

# cliente × produto (top produtos por cliente, só TOP_N_PROD clientes)
prod_keys = top_keys[:TOP_N_PROD]
plac_p = ",".join("'" + str(k).replace("'", "''") + "'" for k in prod_keys)
cliente_produto = q(f"""
  WITH cp AS (
    SELECT cliente_cpf_cnpj AS k,
           COALESCE(NULLIF(seo_title, ''), descricao) AS produto,
           any_value(marca)               AS marca,
           any_value(categoria_mae)       AS categoria,
           SUM(valor_rateado)::DOUBLE     AS receita,
           SUM(quantidade)::DOUBLE        AS qtd,
           COUNT(DISTINCT numero)::INT    AS pedidos
    FROM v WHERE cliente_cpf_cnpj IN ({plac_p})
    GROUP BY 1, 2
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY k ORDER BY receita DESC) AS rn FROM cp
  )
  SELECT k, produto, marca, categoria, receita, qtd, pedidos
  FROM ranked WHERE rn <= {TOP_PROD_POR_CLI}
""")

meses = sorted({r["am"] for r in cliente_mes})

# ============================================================
# OUTPUT
# ============================================================
data = {
    "meta": {
        "max_data": str(max_d),
        "mediana_recompra_dias": float(mediana_recompra or 0),
        "n_clientes": n_clientes,
        "n_clientes_top": len(clientes),
        "churn_ativo_d": CHURN_ATIVO_D,
        "churn_churn_d": CHURN_CHURN_D,
        "meses": meses,
    },
    "rfm_resumo": rfm_resumo,
    "churn_resumo": churn_resumo,
    "clientes": clientes,
    "cliente_mes": cliente_mes,
    "cliente_produto": cliente_produto,
    "gerado_em": "build-time",
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.FILIPE_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)
print(f"OK filipe-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  Clientes (base): {n_clientes:,} | mediana recompra: {mediana_recompra}d | max data: {max_d}")
print(f"  RFM segmentos: {len(rfm_resumo)} | churn: {[(s['status'], s['n_clientes']) for s in churn_resumo]}")
print(f"  Top clientes: {len(clientes)} | cliente_mes: {len(cliente_mes):,} | cliente_produto: {len(cliente_produto):,} | meses: {len(meses)}")
for s in rfm_resumo:
    print(f"    {s['segmento']:24s} {s['n_clientes']:>6,} clientes  R$ {s['receita']/1e6:>6.2f}M  ({s['pct_receita']*100:4.1f}%)")
