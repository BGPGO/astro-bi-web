"""build_filipe_data.py — "Tela Filipe": análise de clientes (RFM + churn por CICLO).

Fonte: C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet (tem cliente_cpf_cnpj /
cliente_nome — o slim vendas_dash.parquet NÃO tem). Chave = CPF/CNPJ (1:1 c/ cliente_id).

CHURN POR CICLO (sazonalidade do próprio cliente) — alinhado à literatura de
inter-purchase time / purchase cycle em settings não-contratuais (base do
Pareto/NBD — Schmittlein 1987 — e BG/NBD — Fader, Hardie & Lee 2005):

  intervalo_tipico = mediana dos gaps entre compras do cliente (robusto a outliers).
                     Clientes com 1 só pedido usam a mediana global (fallback).
  overdue_ratio    = recencia_dias / intervalo_tipico
  status_ciclo:
     Novo          : 1 pedido só, ainda dentro do 1º ciclo esperado
     No ritmo      : overdue <= 1.3  (comprou dentro do ciclo dele)
     Esfriando     : 1.3 < overdue <= 2.0   (atrasado — começa alerta)
     Para retomar  : 2.0 < overdue <= 3.5   (bem atrasado, ainda recuperável)
     Churned       : overdue > 3.5          (muito além do ciclo)

  Ex.: compra a cada 180d e parou há 210d → 1.17× (ok); há 240d → 1.33× (alerta).
       compra a cada 30d e sumiu há 90d → 3× (problema).

COERÊNCIA RFM↔CHURN: o score R do RFM é derivado do status_ciclo (não de um quintil
independente), então "Perdidos" no RFM = Churned no ciclo. F por bandas de valor
(estável — evita o ruído de quintil com muitos empates em 1 pedido). M por quintil.

Gera window.FILIPE_DATA:
  meta, lifecycle_resumo, rfm_resumo, clientes (top-N c/ ciclo), cliente_mes,
  cliente_produto.
"""
import duckdb
import json
import pathlib

SRC = pathlib.Path("C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet")
OUT = pathlib.Path(__file__).parent.parent / "filipe-data.js"

TOP_N = 1200          # clientes detalhados + cliente_mes
TOP_N_PROD = 600      # clientes no cruzamento cliente × produto
TOP_PROD_POR_CLI = 12

# Thresholds de ciclo (múltiplos do intervalo típico do cliente)
T_RITMO = 1.3
T_ESFRIANDO = 2.0
T_RETOMAR = 3.5

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


# Mediana global de intervalo entre compras (fallback p/ quem tem 1 pedido)
global_med = q1("""
  WITH occ AS (SELECT DISTINCT cliente_cpf_cnpj k, data_pedido d FROM v),
       g AS (SELECT k, date_diff('day', LAG(d) OVER (PARTITION BY k ORDER BY d), d) gap FROM occ)
  SELECT median(gap) FROM g WHERE gap IS NOT NULL
""") or 43.0
global_med = float(global_med)

# ============================================================
# Base por cliente — cadência + RFM + status de ciclo
# ============================================================
con.execute(f"""
  CREATE OR REPLACE TABLE cli AS
  WITH occ AS (SELECT DISTINCT cliente_cpf_cnpj k, data_pedido d FROM v),
  gaps AS (SELECT k, date_diff('day', LAG(d) OVER (PARTITION BY k ORDER BY d), d) gap FROM occ),
  ipt AS (SELECT k, median(gap) AS med_ipt FROM gaps WHERE gap IS NOT NULL GROUP BY k),
  agg AS (
    SELECT cliente_cpf_cnpj                AS k,
           any_value(cliente_nome)         AS nome,
           any_value(cliente_tipo_pessoa)  AS tipo,
           any_value(cliente_cidade)       AS cidade,
           any_value(cliente_uf)           AS uf,
           MIN(data_pedido)                AS primeira_compra,
           MAX(data_pedido)                AS ultima_compra,
           date_diff('day', MAX(data_pedido), DATE '{max_d}') AS recency,
           date_diff('day', MIN(data_pedido), DATE '{max_d}') AS idade,
           COUNT(DISTINCT numero)          AS frequency,
           SUM(valor_rateado)::DOUBLE      AS monetary
    FROM v GROUP BY cliente_cpf_cnpj
  )
  SELECT a.*,
         i.med_ipt,
         CASE WHEN a.frequency >= 2 AND i.med_ipt IS NOT NULL AND i.med_ipt > 0
              THEN i.med_ipt ELSE {global_med} END                        AS ciclo_tipico,
         a.recency / (CASE WHEN a.frequency >= 2 AND i.med_ipt IS NOT NULL AND i.med_ipt > 0
              THEN i.med_ipt ELSE {global_med} END)                       AS overdue_ratio,
         (a.monetary / NULLIF(a.frequency, 0))                            AS ticket_medio,
         -- F por bandas de valor (estável, sem ruído de quintil)
         CASE WHEN a.frequency >= 10 THEN 5 WHEN a.frequency >= 5 THEN 4
              WHEN a.frequency >= 3 THEN 3 WHEN a.frequency = 2 THEN 2 ELSE 1 END AS f_score,
         NTILE(5) OVER (ORDER BY a.monetary ASC)::INT                     AS m_score
  FROM agg a LEFT JOIN ipt i USING (k)
""")

# Status de ciclo + R coerente
con.execute(f"""
  CREATE OR REPLACE TABLE cli2 AS
  SELECT *,
    CASE
      WHEN frequency = 1 AND recency <= ciclo_tipico THEN 'Novo'
      WHEN overdue_ratio <= {T_RITMO}      THEN 'No ritmo'
      WHEN overdue_ratio <= {T_ESFRIANDO}  THEN 'Esfriando'
      WHEN overdue_ratio <= {T_RETOMAR}    THEN 'Para retomar'
      ELSE 'Churned'
    END AS status_ciclo,
    CASE
      WHEN frequency = 1 AND recency <= ciclo_tipico THEN 4
      WHEN overdue_ratio <= {T_RITMO}      THEN 5
      WHEN overdue_ratio <= {T_ESFRIANDO}  THEN 3
      WHEN overdue_ratio <= {T_RETOMAR}    THEN 2
      ELSE 1
    END AS r_score
  FROM cli
""")


def segmento(r, f):
    """RFM com R derivado do ciclo (coerente com status_ciclo)."""
    if r >= 4 and f >= 4:
        return "Campeões"
    if r >= 4 and f >= 2:
        return "Leais"
    if r >= 4:
        return "Novos / Promissores"      # recente, pouca frequência ainda
    if r == 3:
        return "Esfriando"                 # atrasando
    if r == 2:
        return "Em Risco (retomar)"        # bem atrasado
    if f >= 3:
        return "Perdido (era frequente)"   # churned que comprava muito → prioridade
    return "Perdido"


rows = q("SELECT k, r_score, f_score FROM cli2")
seg_map = {r["k"]: segmento(int(r["r_score"]), int(r["f_score"])) for r in rows}
con.execute("CREATE OR REPLACE TABLE seg (k VARCHAR, segmento VARCHAR)")
con.executemany("INSERT INTO seg VALUES (?, ?)", list(seg_map.items()))
con.execute("CREATE OR REPLACE TABLE cli3 AS SELECT c.*, s.segmento FROM cli2 c JOIN seg s USING (k)")

n_clientes = int(q1("SELECT COUNT(*) FROM cli3"))
tot_rec = float(q1("SELECT SUM(monetary) FROM cli3")) or 1.0

# ============================================================
# Resumos (TODA a base)
# ============================================================
lifecycle_resumo = q("""
  SELECT status_ciclo AS status, COUNT(*)::INT AS n_clientes,
         SUM(monetary)::DOUBLE AS receita, AVG(recency)::DOUBLE AS recency_med,
         AVG(ciclo_tipico)::DOUBLE AS ciclo_med
  FROM cli3 GROUP BY status_ciclo
""")
ordem = {"Novo": 0, "No ritmo": 1, "Esfriando": 2, "Para retomar": 3, "Churned": 4}
lifecycle_resumo.sort(key=lambda x: ordem.get(x["status"], 9))
for s in lifecycle_resumo:
    s["pct_clientes"] = s["n_clientes"] / n_clientes
    s["pct_receita"] = s["receita"] / tot_rec

rfm_resumo = q("""
  SELECT segmento, COUNT(*)::INT AS n_clientes, SUM(monetary)::DOUBLE AS receita,
         AVG(recency)::DOUBLE AS recency_med, AVG(frequency)::DOUBLE AS freq_med,
         AVG(monetary)::DOUBLE AS monetary_med
  FROM cli3 GROUP BY segmento ORDER BY receita DESC
""")
for s in rfm_resumo:
    s["pct_clientes"] = s["n_clientes"] / n_clientes
    s["pct_receita"] = s["receita"] / tot_rec

# ============================================================
# TOP-N clientes detalhados (com ciclo)
# ============================================================
clientes = q(f"""
  SELECT k AS cpf_cnpj, nome, tipo, cidade, uf,
         primeira_compra::VARCHAR AS primeira_compra,
         ultima_compra::VARCHAR   AS ultima_compra,
         recency::INT             AS recency,
         frequency::INT           AS frequency,
         monetary::DOUBLE         AS monetary,
         ticket_medio::DOUBLE     AS ticket_medio,
         round(ciclo_tipico)::INT AS ciclo_tipico,
         round(overdue_ratio, 2)::DOUBLE AS overdue_ratio,
         r_score, f_score, m_score, segmento, status_ciclo
  FROM cli3 ORDER BY monetary DESC LIMIT {TOP_N}
""")
top_keys = [c["cpf_cnpj"] for c in clientes]
plac = ",".join("'" + str(k).replace("'", "''") + "'" for k in top_keys)

cliente_mes = q(f"""
  SELECT cliente_cpf_cnpj AS k, strftime(data_pedido, '%Y-%m') AS am,
         SUM(valor_rateado)::DOUBLE AS receita, COUNT(DISTINCT numero)::INT AS pedidos
  FROM v WHERE cliente_cpf_cnpj IN ({plac}) GROUP BY 1, 2
""")

prod_keys = top_keys[:TOP_N_PROD]
plac_p = ",".join("'" + str(k).replace("'", "''") + "'" for k in prod_keys)
cliente_produto = q(f"""
  WITH cp AS (
    SELECT cliente_cpf_cnpj AS k,
           COALESCE(NULLIF(seo_title, ''), descricao) AS produto,
           any_value(marca) AS marca, any_value(categoria_mae) AS categoria,
           SUM(valor_rateado)::DOUBLE AS receita, SUM(quantidade)::DOUBLE AS qtd,
           COUNT(DISTINCT numero)::INT AS pedidos
    FROM v WHERE cliente_cpf_cnpj IN ({plac_p}) GROUP BY 1, 2
  ),
  ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY k ORDER BY receita DESC) rn FROM cp)
  SELECT k, produto, marca, categoria, receita, qtd, pedidos FROM ranked WHERE rn <= {TOP_PROD_POR_CLI}
""")

meses = sorted({r["am"] for r in cliente_mes})

data = {
    "meta": {
        "max_data": str(max_d),
        "ciclo_global_mediano": global_med,
        "n_clientes": n_clientes,
        "n_clientes_top": len(clientes),
        "thresholds": {"ritmo": T_RITMO, "esfriando": T_ESFRIANDO, "retomar": T_RETOMAR},
        "meses": meses,
        "metodo": "overdue_ratio = recência ÷ intervalo típico do cliente (mediana dos gaps); literatura IPT / BG-NBD",
    },
    "lifecycle_resumo": lifecycle_resumo,
    "rfm_resumo": rfm_resumo,
    "clientes": clientes,
    "cliente_mes": cliente_mes,
    "cliente_produto": cliente_produto,
    "gerado_em": "build-time",
}


def default_enc(o):
    return str(o)


OUT.write_text(f"window.FILIPE_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n", encoding="utf-8")
print(f"OK filipe-data.js ({OUT.stat().st_size:,} bytes) | base {n_clientes:,} clientes | ciclo global {global_med:.0f}d | max {max_d}")
print("  STATUS DE CICLO:")
for s in lifecycle_resumo:
    print(f"    {s['status']:14s} {s['n_clientes']:>6,} ({s['pct_clientes']*100:4.1f}%)  R$ {s['receita']/1e6:6.2f}M ({s['pct_receita']*100:4.1f}%)  recência~{s['recency_med']:.0f}d ciclo~{s['ciclo_med']:.0f}d")
print("  RFM:")
for s in rfm_resumo:
    print(f"    {s['segmento']:22s} {s['n_clientes']:>6,} ({s['pct_clientes']*100:4.1f}%)  R$ {s['receita']/1e6:6.2f}M")
