"""build_cohort_data.py — Cohort triangular Valor + Vendas (Astro PBI 16 e 17).

Le vendas_tiny_bu.parquet → identifica mes da PRIMEIRA compra de cada cliente
(cohort) e mede atividade subsequente (valor R$ + n_pedidos) por mes_n.

Output: cohort-data.js exporta:
  window.COHORT_DATA = {
    cohorts: [ "2024-01", "2024-02", ... ],     // ordem cronologica
    meses:   [ "2024-01", "2024-02", ... ],     // mesmo dominio
    cells:   [ { cohort, mes, mes_n, valor, n_pedidos, n_clientes_ativos, n_clientes_cohort } ],
    totals_col: { mes -> { valor, n_pedidos } },
    totals_row: { cohort -> { valor, n_pedidos, n_clientes_cohort } },
    gerado_em: "build-time",
  }

Onde:
  cohort = strftime(data_primeira_compra, '%Y-%m') do cliente
  mes    = strftime(data_pedido, '%Y-%m') do pedido
  mes_n  = DATE_DIFF('month', cohort, mes)  (0 = mes da aquisicao)

Replica exatamente o Cohort do PowerBI (pbi_16/pbi_17): linhas=cohort, colunas=mes,
celulas=valor ou n_pedidos. Como cada cliente so tem 1 cohort, somar todos cohorts
em uma coluna 'mes' reconstroi o total de vendas/valor daquele mes.
"""
import duckdb
import json
import pathlib

PARQUET = pathlib.Path("C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet")
OUT = pathlib.Path(__file__).parent.parent / "cohort-data.js"

if not PARQUET.exists():
    raise SystemExit(f"parquet nao encontrado: {PARQUET}")

con = duckdb.connect()
con.execute(f"""
  CREATE OR REPLACE VIEW v AS
  SELECT * FROM read_parquet('{PARQUET.as_posix()}')
  WHERE situacao <> 'Cancelado'
    AND cliente_id IS NOT NULL
    AND data_pedido IS NOT NULL
""")

# 1 row por pedido (numero) com receita somada + cliente
con.execute("""
  CREATE OR REPLACE VIEW orders AS
  SELECT
    numero,
    any_value(cliente_id) AS cliente_id,
    any_value(data_pedido) AS data_pedido,
    strftime(any_value(data_pedido), '%Y-%m') AS mes,
    SUM(valor_rateado) AS receita
  FROM v
  GROUP BY numero
""")

# Cohort por cliente = mes da PRIMEIRA compra observada nos dados
con.execute("""
  CREATE OR REPLACE VIEW cliente_cohort AS
  SELECT
    cliente_id,
    MIN(data_pedido) AS data_1a,
    strftime(MIN(data_pedido), '%Y-%m') AS cohort
  FROM orders
  GROUP BY cliente_id
""")

# Cells: somar valor + contar pedidos + clientes ativos por (cohort, mes)
cells_rows = con.execute("""
  WITH joined AS (
    SELECT
      cc.cohort,
      o.mes,
      o.numero,
      o.cliente_id,
      o.receita,
      DATE_DIFF('month',
                date_trunc('month', cc.data_1a),
                date_trunc('month', o.data_pedido))::INT AS mes_n
    FROM orders o
    JOIN cliente_cohort cc USING (cliente_id)
  )
  SELECT
    cohort,
    mes,
    mes_n::INT AS mes_n,
    SUM(receita)::DOUBLE AS valor,
    COUNT(DISTINCT numero)::INT AS n_pedidos,
    COUNT(DISTINCT cliente_id)::INT AS n_clientes_ativos
  FROM joined
  WHERE mes_n >= 0
  GROUP BY cohort, mes, mes_n
  ORDER BY cohort, mes
""").fetchdf().to_dict(orient="records")

# Tamanho do cohort (clientes que adquiriram naquele mes)
cohort_sizes = {
    r["cohort"]: int(r["n"])
    for r in con.execute("""
      SELECT cohort, COUNT(*)::INT AS n
      FROM cliente_cohort
      GROUP BY cohort
    """).fetchdf().to_dict(orient="records")
}

# Universo de cohorts + meses (ordenados crescente)
cohorts = sorted(cohort_sizes.keys())
meses = sorted(set(r["mes"] for r in cells_rows))

# Totais coluna (por mes — equivale aa linha Total do PBI)
totals_col = {}
for r in cells_rows:
    m = r["mes"]
    if m not in totals_col:
        totals_col[m] = {"valor": 0.0, "n_pedidos": 0}
    totals_col[m]["valor"] += float(r["valor"] or 0)
    totals_col[m]["n_pedidos"] += int(r["n_pedidos"] or 0)

# Totais linha (por cohort — equivale aa coluna Total do PBI)
totals_row = {}
for r in cells_rows:
    c = r["cohort"]
    if c not in totals_row:
        totals_row[c] = {
            "valor": 0.0,
            "n_pedidos": 0,
            "n_clientes_cohort": cohort_sizes.get(c, 0),
        }
    totals_row[c]["valor"] += float(r["valor"] or 0)
    totals_row[c]["n_pedidos"] += int(r["n_pedidos"] or 0)

# Enxuga cells: serializa apenas o que UI precisa
cells_out = [
    {
        "cohort": r["cohort"],
        "mes": r["mes"],
        "mes_n": int(r["mes_n"]),
        "valor": float(r["valor"] or 0),
        "n_pedidos": int(r["n_pedidos"] or 0),
        "n_clientes_ativos": int(r["n_clientes_ativos"] or 0),
        "n_clientes_cohort": cohort_sizes.get(r["cohort"], 0),
    }
    for r in cells_rows
]

data = {
    "cohorts": cohorts,
    "meses": meses,
    "cells": cells_out,
    "cohort_sizes": cohort_sizes,
    "totals_col": totals_col,
    "totals_row": totals_row,
    "gerado_em": "build-time",
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.COHORT_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)

print(f"OK cohort-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  Cohorts: {len(cohorts)} ({cohorts[0]} .. {cohorts[-1]})")
print(f"  Meses unicos: {len(meses)}")
print(f"  Celulas: {len(cells_out)}")
total_valor = sum(t["valor"] for t in totals_col.values())
total_pedidos = sum(t["n_pedidos"] for t in totals_col.values())
print(f"  Valor total: R$ {total_valor:,.2f}")
print(f"  Pedidos total: {total_pedidos:,}")
