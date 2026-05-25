"""Pre-compute serie diaria + KPIs por janela pra PageTendenciaTemporal (PBI tela 11).

Le public-data/vendas_dash.parquet -> tendtemp-data.js com window.TENDTEMP_DATA:

  serie_diaria: lista de dias dos ultimos 180d com
    - dia (YYYY-MM-DD)
    - valor (R$ venda total)
    - n_vendas (pedidos distintos)
    - n_recompra (pedidos Recompra)
    - n_novo (pedidos Novo)
    - ticket_medio (valor / n_vendas)

  kpis_periodo: pra cada janela (30/60/90/180), totais + variacao vs periodo anterior
    - dias (janela em dias)
    - total_venda, total_vendas, total_recompra, total_novo, ticket_medio
    - prev_total_venda, prev_total_vendas, prev_ticket_medio
    - var_pct_venda, var_pct_vendas, var_pct_ticket
    - melhor_dia, pior_dia (em termos de R$ venda)

  meta:
    - dia_min, dia_max (data range)
    - n_total (rows na janela 180d)
"""
import duckdb
import json
import pathlib
from datetime import datetime, timedelta

PARQUET = pathlib.Path(__file__).parent.parent / "public-data" / "vendas_dash.parquet"
OUT = pathlib.Path(__file__).parent.parent / "tendtemp-data.js"

if not PARQUET.exists():
    raise SystemExit(f"parquet nao encontrado: {PARQUET}")

con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET.as_posix()}')")


def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0


# Ancora "hoje" = max(data_pedido) no parquet (dados sao snapshot, nao live)
dmax = con.execute("SELECT MAX(data_pedido)::DATE FROM v").fetchone()[0]
if dmax is None:
    raise SystemExit("parquet sem data_pedido")

print(f"data_max no parquet: {dmax}")

# ============================================================
# 1) SERIE DIARIA ULTIMOS 180d
# ============================================================
# Calculamos n_recompra e n_novo POR PEDIDO (numero), nao por linha — um pedido
# pode ter varias linhas (multiplos itens). Recompra/Novo eh atributo do pedido.
serie_sql = f"""
WITH pedidos AS (
  SELECT numero,
         CAST(data_pedido AS DATE) AS dia,
         any_value(Recompra) AS recomp,
         SUM(valor_rateado) AS valor
  FROM v
  WHERE data_pedido >= DATE '{dmax}' - INTERVAL 180 DAY
    AND data_pedido <= DATE '{dmax}'
  GROUP BY numero, dia
),
agg AS (
  SELECT dia,
         SUM(valor)::DOUBLE AS valor,
         COUNT(*)::INT AS n_vendas,
         COUNT(*) FILTER (WHERE recomp = 'Recompra')::INT AS n_recompra,
         COUNT(*) FILTER (WHERE recomp = 'Novo' OR recomp IS NULL)::INT AS n_novo
  FROM pedidos
  GROUP BY dia
)
SELECT strftime(dia, '%Y-%m-%d') AS dia,
       valor,
       n_vendas,
       n_recompra,
       n_novo,
       (valor / NULLIF(n_vendas, 0))::DOUBLE AS ticket_medio
FROM agg
ORDER BY dia
"""
serie_diaria = q(serie_sql)
print(f"serie_diaria: {len(serie_diaria)} dias")

# ============================================================
# 2) KPIs POR JANELA (30/60/90/180) + variacao vs periodo anterior
# ============================================================
JANELAS = [30, 60, 90, 180]
kpis_periodo = {}

for janela in JANELAS:
    # Periodo atual: ultimos `janela` dias contando dmax
    # Periodo anterior: os `janela` dias antes desse periodo
    sql_atual = f"""
    WITH pedidos AS (
      SELECT numero,
             CAST(data_pedido AS DATE) AS dia,
             any_value(Recompra) AS recomp,
             SUM(valor_rateado) AS valor
      FROM v
      WHERE data_pedido > DATE '{dmax}' - INTERVAL {janela} DAY
        AND data_pedido <= DATE '{dmax}'
      GROUP BY numero, dia
    )
    SELECT
      COALESCE(SUM(valor), 0)::DOUBLE AS total_venda,
      COUNT(*)::INT AS total_vendas,
      COUNT(*) FILTER (WHERE recomp = 'Recompra')::INT AS total_recompra,
      COUNT(*) FILTER (WHERE recomp = 'Novo' OR recomp IS NULL)::INT AS total_novo
    FROM pedidos
    """
    a = q(sql_atual)[0]

    sql_prev = f"""
    WITH pedidos AS (
      SELECT numero,
             CAST(data_pedido AS DATE) AS dia,
             SUM(valor_rateado) AS valor
      FROM v
      WHERE data_pedido > DATE '{dmax}' - INTERVAL {janela * 2} DAY
        AND data_pedido <= DATE '{dmax}' - INTERVAL {janela} DAY
      GROUP BY numero, dia
    )
    SELECT
      COALESCE(SUM(valor), 0)::DOUBLE AS total_venda,
      COUNT(*)::INT AS total_vendas
    FROM pedidos
    """
    p = q(sql_prev)[0]

    # Melhor/pior dia em R$ venda dentro do periodo atual
    sql_bestworst = f"""
    WITH pedidos AS (
      SELECT numero,
             CAST(data_pedido AS DATE) AS dia,
             SUM(valor_rateado) AS valor
      FROM v
      WHERE data_pedido > DATE '{dmax}' - INTERVAL {janela} DAY
        AND data_pedido <= DATE '{dmax}'
      GROUP BY numero, dia
    ),
    por_dia AS (
      SELECT dia, SUM(valor)::DOUBLE AS valor, COUNT(*)::INT AS n
      FROM pedidos GROUP BY dia
    )
    SELECT
      (SELECT strftime(dia, '%Y-%m-%d') FROM por_dia ORDER BY valor DESC LIMIT 1) AS melhor_dia,
      (SELECT MAX(valor) FROM por_dia) AS melhor_valor,
      (SELECT strftime(dia, '%Y-%m-%d') FROM por_dia ORDER BY valor ASC LIMIT 1) AS pior_dia,
      (SELECT MIN(valor) FROM por_dia) AS pior_valor
    """
    bw = q(sql_bestworst)[0]

    total_venda = a["total_venda"]
    total_vendas = a["total_vendas"]
    ticket_atual = total_venda / total_vendas if total_vendas else 0
    prev_venda = p["total_venda"]
    prev_vendas = p["total_vendas"]
    prev_ticket = prev_venda / prev_vendas if prev_vendas else 0

    def var_pct(novo, velho):
        if not velho:
            return None
        return (novo - velho) / velho

    kpis_periodo[str(janela)] = {
        "dias": janela,
        "total_venda": total_venda,
        "total_vendas": total_vendas,
        "total_recompra": a["total_recompra"],
        "total_novo": a["total_novo"],
        "ticket_medio": ticket_atual,
        "prev_total_venda": prev_venda,
        "prev_total_vendas": prev_vendas,
        "prev_ticket_medio": prev_ticket,
        "var_pct_venda": var_pct(total_venda, prev_venda),
        "var_pct_vendas": var_pct(total_vendas, prev_vendas),
        "var_pct_ticket": var_pct(ticket_atual, prev_ticket),
        "melhor_dia": bw["melhor_dia"],
        "melhor_valor": bw["melhor_valor"],
        "pior_dia": bw["pior_dia"],
        "pior_valor": bw["pior_valor"],
    }
    print(f"  {janela}d: R$ {total_venda:>14,.0f} | {total_vendas:>5} vendas | var {var_pct(total_venda, prev_venda) or 0:+.1%}")

# ============================================================
# OUTPUT
# ============================================================
data = {
    "serie_diaria": serie_diaria,
    "kpis_periodo": kpis_periodo,
    "meta": {
        "dia_min": serie_diaria[0]["dia"] if serie_diaria else None,
        "dia_max": serie_diaria[-1]["dia"] if serie_diaria else None,
        "n_total": len(serie_diaria),
    },
    "gerado_em": "build-time",
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.TENDTEMP_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)

print(f"\nOK tendtemp-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  serie_diaria: {len(serie_diaria)} dias | dia_min: {data['meta']['dia_min']} | dia_max: {data['meta']['dia_max']}")
