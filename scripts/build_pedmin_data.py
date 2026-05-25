"""Pre-compute V2 para PagePedidoMinimo (simulacao reativa via slider).

Origem do estudo - Filipe (29/04/2026):
- "Se eu delimito pedido minimo de R$ X, quanto deixo de vender?"
- Vitor: histograma + linha de corte + LTV cruzado.
- Filipe: CPF que compra <R$200 nao recompra todo mes.
- Vitor: cuidado pra nao descartar cliente que recompra muito.

Saidas V2 (reativas no front via window.PEDMIN_DATA):
- kpis_geral: totais base
- histograma_detalhado: 12 faixas
- cenarios_corte_completo: 12 cortes [50, 100, ..., 2000]
- ltv_por_maior_pedido_faixa: LTV de clientes cujo MAIOR pedido <= X
- pf_vs_pj: split por tipo
- pf_vs_pj_por_faixa: cruzamento faixa x tipo
- top_50_clientes_unicos_baixo: exemplos de descartaveis
- distribuicao_acumulada: curva de Pareto (% pedidos x % receita)

Granularidade: pedido (DISTINCT numero). Filtro: situacao != 'Cancelado' AND total_pedido > 0.
Cliente_chave = cliente_cpf_cnpj limpo (fallback cliente_id).
"""
import duckdb
import json
import pathlib

PARQUET = pathlib.Path("C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet")
OUT = pathlib.Path(__file__).parent.parent / "pedmin-data.js"

# Premissa: custo operacional medio por pedido (separacao, embalagem, NF, atendimento).
# Calibrar com financeiro - default R$ 30.
CUSTO_OP_POR_PEDIDO = 30.0

CORTES = [50, 100, 150, 200, 250, 300, 400, 500, 700, 1000, 1500, 2000]
CORTES_LTV = [200, 300, 500, 700, 1000, 1500, 2000]

# 12 faixas detalhadas
FAIXAS = [
    ("0-50",      0,      50),
    ("50-100",    50,     100),
    ("100-150",   100,    150),
    ("150-200",   150,    200),
    ("200-300",   200,    300),
    ("300-500",   300,    500),
    ("500-700",   500,    700),
    ("700-1k",    700,    1000),
    ("1k-2k",     1000,   2000),
    ("2k-5k",     2000,   5000),
    ("5k-10k",    5000,   10000),
    (">10k",      10000,  10**12),
]

con = duckdb.connect()
con.execute(f"""
  CREATE OR REPLACE VIEW raw AS
  SELECT * FROM read_parquet('{PARQUET.as_posix()}')
""")

# 1 row por pedido (DISTINCT numero). total_pedido eh redundante por item -> MAX.
con.execute("""
  CREATE OR REPLACE VIEW ped AS
  SELECT
    numero,
    MAX(total_pedido) AS total_pedido,
    MAX(situacao) AS situacao,
    MAX(cliente_tipo_pessoa) AS tipo,
    MAX(cliente_id) AS cliente_id,
    REGEXP_REPLACE(COALESCE(MAX(cliente_cpf_cnpj), ''), '[^0-9]', '', 'g') AS cpf_clean,
    MAX(cliente_nome) AS cliente_nome,
    MAX(data_pedido) AS data_pedido
  FROM raw
  GROUP BY numero
""")

con.execute("""
  CREATE OR REPLACE VIEW ped_f AS
  SELECT
    numero,
    total_pedido,
    tipo,
    cliente_nome,
    CASE WHEN cpf_clean = '' OR cpf_clean IS NULL THEN cliente_id ELSE cpf_clean END AS cli,
    data_pedido
  FROM ped
  WHERE situacao != 'Cancelado'
    AND total_pedido > 0
""")

def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")

def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0

# === Totais base ===
total_ped = int(q1("SELECT COUNT(*) FROM ped_f"))
total_rec = float(q1("SELECT SUM(total_pedido) FROM ped_f"))
total_cli = int(q1("SELECT COUNT(DISTINCT cli) FROM ped_f WHERE cli IS NOT NULL AND cli != ''"))
ticket_medio = total_rec / total_ped if total_ped else 0.0
ltv_medio = total_rec / total_cli if total_cli else 0.0

kpis_geral = {
    "total_pedidos": total_ped,
    "total_clientes_unicos": total_cli,
    "receita_total": total_rec,
    "ticket_medio_global": ticket_medio,
    "ltv_medio_global": ltv_medio,
}

# === Cliente agregado (uma vez, reuso em tudo) ===
con.execute("""
  CREATE OR REPLACE VIEW cli_agg AS
  SELECT
    cli,
    MAX(tipo) AS tipo,
    MAX(cliente_nome) AS nome,
    COUNT(*) AS n_pedidos,
    SUM(total_pedido) AS receita,
    MAX(total_pedido) AS maior_pedido,
    AVG(total_pedido) AS ticket_medio,
    MIN(data_pedido) AS primeira,
    MAX(data_pedido) AS ultima
  FROM ped_f
  WHERE cli IS NOT NULL AND cli != ''
  GROUP BY cli
""")

# === Histograma detalhado: 12 faixas ===
histograma_detalhado = []
for label, lo, hi in FAIXAS:
    n = int(q1(f"SELECT COUNT(*) FROM ped_f WHERE total_pedido >= {lo} AND total_pedido < {hi}"))
    rec = float(q1(f"SELECT COALESCE(SUM(total_pedido),0) FROM ped_f WHERE total_pedido >= {lo} AND total_pedido < {hi}"))
    # Clientes distintos na faixa
    n_cli_faixa = int(q1(f"""
      SELECT COUNT(DISTINCT cli) FROM ped_f
      WHERE total_pedido >= {lo} AND total_pedido < {hi}
        AND cli IS NOT NULL AND cli != ''
    """))
    histograma_detalhado.append({
        "faixa": label,
        "lo": lo,
        "hi": hi if hi < 10**12 else None,
        "n_pedidos": n,
        "receita": rec,
        "n_clientes_unicos": n_cli_faixa,
        "pct_pedidos": (n / total_ped) if total_ped else 0.0,
        "pct_receita": (rec / total_rec) if total_rec else 0.0,
        "ticket_medio_faixa": (rec / n) if n else 0.0,
    })

# === Cenarios de corte completo (slider material) ===
cenarios_corte_completo = []
for X in CORTES:
    n_cort = int(q1(f"SELECT COUNT(*) FROM ped_f WHERE total_pedido < {X}"))
    rec_perd = float(q1(f"SELECT COALESCE(SUM(total_pedido),0) FROM ped_f WHERE total_pedido < {X}"))
    n_cli_perd = int(q1(f"SELECT COUNT(*) FROM cli_agg WHERE maior_pedido < {X}"))
    ltv_perd = float(q1(f"SELECT COALESCE(AVG(receita),0) FROM cli_agg WHERE maior_pedido < {X}"))
    rec_hist_perd = float(q1(f"SELECT COALESCE(SUM(receita),0) FROM cli_agg WHERE maior_pedido < {X}"))
    custo_elim = n_cort * CUSTO_OP_POR_PEDIDO
    saldo = custo_elim - rec_perd
    cenarios_corte_completo.append({
        "corte": X,
        "label": f"R$ {X}",
        "n_pedidos_cortados": n_cort,
        "pct_pedidos_cortados": (n_cort / total_ped) if total_ped else 0.0,
        "receita_perdida": rec_perd,
        "pct_receita_perdida": (rec_perd / total_rec) if total_rec else 0.0,
        "n_clientes_perdidos": n_cli_perd,
        "pct_clientes_perdidos": (n_cli_perd / total_cli) if total_cli else 0.0,
        "ltv_medio_perdidos": ltv_perd,
        "receita_historica_perdidos": rec_hist_perd,
        "custo_operacional_eliminado": custo_elim,
        "saldo_liquido": saldo,
        "recomenda": saldo > 0,
    })

# === LTV por maior pedido faixa ===
ltv_por_maior_pedido_faixa = []
for X in CORTES_LTV:
    row = con.execute(f"""
      SELECT
        COUNT(*) AS n_cli,
        COALESCE(AVG(receita), 0) AS ltv,
        COALESCE(AVG(n_pedidos), 0) AS n_ped_medio,
        COALESCE(AVG(ticket_medio), 0) AS ticket,
        COALESCE(SUM(receita), 0) AS rec_total
      FROM cli_agg
      WHERE maior_pedido < {X}
    """).fetchone()
    ltv_por_maior_pedido_faixa.append({
        "corte": X,
        "label": f"Maior pedido < R$ {X}",
        "n_clientes": int(row[0]),
        "ltv_medio": float(row[1]),
        "n_pedidos_medio": float(row[2]),
        "ticket_medio": float(row[3]),
        "receita_total": float(row[4]),
        "pct_base_clientes": (row[0] / total_cli) if total_cli else 0.0,
    })

# === PF vs PJ ===
pf_vs_pj_rows = q("""
  SELECT
    CASE
      WHEN tipo = 'F' THEN 'PF'
      WHEN tipo = 'J' THEN 'PJ'
      ELSE 'Outros'
    END AS tipo_label,
    COUNT(*) AS n_pedidos,
    SUM(total_pedido)::DOUBLE AS receita,
    AVG(total_pedido)::DOUBLE AS ticket_medio,
    COUNT(DISTINCT cli) AS n_clientes
  FROM ped_f
  GROUP BY tipo_label
  ORDER BY receita DESC
""")
pf_vs_pj = []
for r in pf_vs_pj_rows:
    n_cli = int(r['n_clientes']) if r['n_clientes'] else 0
    rec = float(r['receita']) if r['receita'] else 0.0
    pf_vs_pj.append({
        "tipo": r['tipo_label'],
        "n_pedidos": int(r['n_pedidos']),
        "n_clientes": n_cli,
        "receita": rec,
        "ticket_medio": float(r['ticket_medio']) if r['ticket_medio'] else 0.0,
        "ltv_medio": (rec / n_cli) if n_cli else 0.0,
        "pct_receita": (rec / total_rec) if total_rec else 0.0,
    })

# === Cruzamento PF/PJ por faixa ===
pf_vs_pj_por_faixa = []
for label, lo, hi in FAIXAS:
    row = {"faixa": label}
    for tipo_sql, tipo_label in [("F", "PF"), ("J", "PJ")]:
        r = con.execute(f"""
          SELECT
            COUNT(*) AS n_ped,
            COALESCE(SUM(total_pedido),0) AS rec,
            COUNT(DISTINCT cli) AS n_cli
          FROM ped_f
          WHERE total_pedido >= {lo} AND total_pedido < {hi}
            AND tipo = '{tipo_sql}'
        """).fetchone()
        row[f"n_pedidos_{tipo_label}"] = int(r[0])
        row[f"receita_{tipo_label}"] = float(r[1])
        row[f"n_clientes_{tipo_label}"] = int(r[2])
    pf_vs_pj_por_faixa.append(row)

# === Top 50 clientes "descartaveis" (so 1 pedido baixo, < R$ 200) ===
top_50_baixo = q("""
  SELECT
    nome,
    tipo,
    n_pedidos,
    receita,
    maior_pedido,
    ticket_medio,
    primeira::VARCHAR AS primeira,
    ultima::VARCHAR AS ultima
  FROM cli_agg
  WHERE n_pedidos = 1 AND maior_pedido < 200
  ORDER BY maior_pedido DESC
  LIMIT 50
""")
top_50_clientes_unicos_baixo = []
for r in top_50_baixo:
    top_50_clientes_unicos_baixo.append({
        "nome": (r["nome"] or "(sem nome)")[:60],
        "tipo": "PF" if r["tipo"] == "F" else ("PJ" if r["tipo"] == "J" else "?"),
        "n_pedidos": int(r["n_pedidos"]),
        "receita": float(r["receita"]),
        "maior_pedido": float(r["maior_pedido"]),
        "ticket_medio": float(r["ticket_medio"]),
        "primeira": r["primeira"],
        "ultima": r["ultima"],
    })

# === Distribuicao acumulada (Pareto: % pedidos ordenados asc por valor x % receita) ===
# Ordenamos pedidos por total_pedido ASC, acumulamos. Resultado: pra X% pedidos
# (do mais barato pro mais caro), Y% da receita.
# Amostramos em 50 pontos pra payload nao explodir.
con.execute("""
  CREATE OR REPLACE VIEW ped_ord AS
  SELECT
    total_pedido,
    ROW_NUMBER() OVER (ORDER BY total_pedido ASC) AS rn
  FROM ped_f
""")
con.execute(f"""
  CREATE OR REPLACE VIEW ped_acc AS
  SELECT
    rn,
    total_pedido,
    SUM(total_pedido) OVER (ORDER BY rn) AS rec_acc
  FROM ped_ord
""")
n_pontos = 50
distribuicao_acumulada = []
for i in range(n_pontos + 1):
    pct_p = i / n_pontos
    rn_alvo = max(1, int(round(pct_p * total_ped)))
    row = con.execute(f"""
      SELECT total_pedido, rec_acc FROM ped_acc WHERE rn = {rn_alvo}
    """).fetchone()
    if not row:
        continue
    valor_corte = float(row[0])
    rec_acc = float(row[1])
    distribuicao_acumulada.append({
        "pct_pedidos": pct_p,
        "pct_receita": (rec_acc / total_rec) if total_rec else 0.0,
        "valor_corte_neste_ponto": valor_corte,
    })

# === Periodo ===
periodo = con.execute("""
  SELECT MIN(data_pedido) AS dt_min, MAX(data_pedido) AS dt_max
  FROM ped_f
""").fetchone()

data = {
    "kpis_geral": kpis_geral,
    "totais": {  # compat com V1 chamadores
        "n_pedidos": total_ped,
        "n_clientes": total_cli,
        "receita_total": total_rec,
        "ticket_medio": ticket_medio,
        "ltv_medio": ltv_medio,
        "periodo_inicio": str(periodo[0]) if periodo[0] else None,
        "periodo_fim": str(periodo[1]) if periodo[1] else None,
    },
    "periodo": {
        "inicio": str(periodo[0]) if periodo[0] else None,
        "fim": str(periodo[1]) if periodo[1] else None,
    },
    "premissas": {
        "custo_op_por_pedido": CUSTO_OP_POR_PEDIDO,
        "filtro": "situacao != 'Cancelado' e total_pedido > 0",
        "granularidade": "pedido (DISTINCT numero)",
    },
    "histograma_detalhado": histograma_detalhado,
    "cenarios_corte_completo": cenarios_corte_completo,
    "ltv_por_maior_pedido_faixa": ltv_por_maior_pedido_faixa,
    "pf_vs_pj": pf_vs_pj,
    "pf_vs_pj_por_faixa": pf_vs_pj_por_faixa,
    "top_50_clientes_unicos_baixo": top_50_clientes_unicos_baixo,
    "distribuicao_acumulada": distribuicao_acumulada,
    "gerado_em": "build-time",
}

def default_enc(o):
    return str(o)

OUT.write_text(
    f"window.PEDMIN_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)
print(f"OK pedmin-data.js V2 gerado em {OUT} ({OUT.stat().st_size} bytes)")
print(f"  Pedidos: {total_ped:,} | Clientes: {total_cli:,} | Receita: R$ {total_rec/1e6:.2f}M")
print(f"  Periodo: {periodo[0]} -> {periodo[1]}")
print(f"  Faixas (12): {len(histograma_detalhado)}")
print(f"  Cenarios corte: {len(cenarios_corte_completo)} (de R$ {CORTES[0]} a R$ {CORTES[-1]})")
print(f"  Pontos Pareto: {len(distribuicao_acumulada)}")
print(f"  Top descartaveis: {len(top_50_clientes_unicos_baixo)}")
print(f"  Cenarios:")
for c in cenarios_corte_completo:
    rec_pp = c['receita_perdida']
    sal = c['saldo_liquido']
    rec_str = "recomenda" if c['recomenda'] else "destroi"
    print(f"    corte {c['label']:>7}: {c['n_pedidos_cortados']:>6,} ped ({c['pct_pedidos_cortados']*100:5.1f}%) perda R${rec_pp/1e3:8.1f}k ({c['pct_receita_perdida']*100:5.2f}%) saldo R${sal/1e3:8.1f}k [{rec_str}]")
