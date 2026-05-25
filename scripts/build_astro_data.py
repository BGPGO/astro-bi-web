"""Le vendas_dash.parquet -> astro-data.js com agregados pre-calculados pra PageAstroDash.

Gera o equivalente a window.ASTRO_DASH com tudo que a Dash do PBI precisa:
- kpis (valor_bruto, cmv, resultado, liquido, total_vendas, ticket, venda_dia_util, margens)
- serie_anual (bar 4 anos)
- serie_diaria (line ultimos 60d)
- serie_mensal (bar/line ultimos 18m + n_vendas)
- donut_tipo (PF/PJ)
- ticket_diario (line 60d)
- top_uf, top_pgto, top_transp (bar horizontal)
- hier_marca, hier_categoria (top 12)
"""
import duckdb
import json
import pathlib

PARQUET = pathlib.Path(__file__).parent.parent / "public-data" / "vendas_dash.parquet"
OUT = pathlib.Path(__file__).parent.parent / "astro-data.js"
CFV_PCT = 0.0616

con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET}')")

def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")

def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0

# === KPIs ===
valor_bruto = float(q1("SELECT SUM(valor_rateado) FROM v"))
cmv = float(q1("SELECT SUM(preco_custo * quantidade) FROM v"))
n_vendas = int(q1("SELECT COUNT(DISTINCT numero) FROM v"))
dias_uteis = int(q1("SELECT COUNT(DISTINCT data_pedido::DATE) FROM v WHERE dayofweek(data_pedido) BETWEEN 1 AND 5"))
valor_bruto_util = float(q1("SELECT SUM(valor_rateado) FROM v WHERE dayofweek(data_pedido) BETWEEN 1 AND 5"))
cfv = valor_bruto * CFV_PCT
resultado_bruto = valor_bruto - cmv
valor_liquido = valor_bruto - cfv - cmv
ticket = valor_bruto / n_vendas if n_vendas else 0
venda_dia_util = valor_bruto_util / dias_uteis if dias_uteis else 0
margem_bruta_pct = resultado_bruto / valor_bruto if valor_bruto else 0
margem_liq_pct = valor_liquido / valor_bruto if valor_bruto else 0

kpis = {
    "valor_bruto": valor_bruto,
    "cmv": cmv,
    "resultado_bruto": resultado_bruto,
    "valor_liquido": valor_liquido,
    "n_vendas": n_vendas,
    "ticket": ticket,
    "venda_dia_util": venda_dia_util,
    "dias_uteis": dias_uteis,
    "cfv_pct": CFV_PCT,
    "margem_bruta_pct": margem_bruta_pct,
    "margem_liq_pct": margem_liq_pct,
}

# === Series ===
serie_anual = q("SELECT EXTRACT(YEAR FROM data_pedido)::INT ano, SUM(valor_rateado)::DOUBLE v FROM v GROUP BY ano ORDER BY ano")
serie_diaria = q("SELECT data_pedido::DATE d, SUM(valor_rateado)::DOUBLE v FROM v GROUP BY d ORDER BY d DESC LIMIT 60")
serie_diaria.reverse()
serie_mensal = q("SELECT strftime(data_pedido, '%Y-%m') am, SUM(valor_rateado)::DOUBLE v, COUNT(DISTINCT numero)::INT n FROM v GROUP BY am ORDER BY am DESC LIMIT 18")
serie_mensal.reverse()
ticket_diario = q("""
  WITH d AS (SELECT data_pedido::DATE d, SUM(valor_rateado) v, COUNT(DISTINCT numero) n FROM v GROUP BY d)
  SELECT d, v / NULLIF(n, 0) AS ticket FROM (SELECT * FROM d ORDER BY d DESC LIMIT 60) ORDER BY d
""")

donut_tipo = q("""
  SELECT
    CASE WHEN cliente_tipo_pessoa = 'F' THEN 'Pessoa Fisica'
         WHEN cliente_tipo_pessoa = 'J' THEN 'Pessoa Juridica'
         ELSE 'Outros' END AS tipo,
    SUM(valor_rateado)::DOUBLE v
  FROM v GROUP BY tipo ORDER BY v DESC
""")

top_uf = q("SELECT cliente_uf uf, SUM(valor_rateado)::DOUBLE v FROM v WHERE cliente_uf IS NOT NULL GROUP BY uf ORDER BY v DESC LIMIT 15")
top_pgto = q("SELECT forma_pagamento pgto, SUM(valor_rateado)::DOUBLE v FROM v WHERE forma_pagamento IS NOT NULL GROUP BY pgto ORDER BY v DESC LIMIT 12")
top_transp = q("SELECT nome_transportador t, SUM(valor_rateado)::DOUBLE v FROM v WHERE nome_transportador IS NOT NULL GROUP BY t ORDER BY v DESC LIMIT 12")

hier_marca = q("""
  SELECT marca k, SUM(valor_rateado)::DOUBLE venda, SUM(preco_custo*quantidade)::DOUBLE cmv, COUNT(DISTINCT numero)::INT n
  FROM v WHERE marca IS NOT NULL GROUP BY marca ORDER BY venda DESC LIMIT 12
""")
hier_cat = q("""
  SELECT categoria_mae k, SUM(valor_rateado)::DOUBLE venda, SUM(preco_custo*quantidade)::DOUBLE cmv, COUNT(DISTINCT numero)::INT n
  FROM v WHERE categoria_mae IS NOT NULL GROUP BY categoria_mae ORDER BY venda DESC LIMIT 12
""")

data = {
    "kpis": kpis,
    "serie_anual": serie_anual,
    "serie_diaria": serie_diaria,
    "serie_mensal": serie_mensal,
    "ticket_diario": ticket_diario,
    "donut_tipo": donut_tipo,
    "top_uf": top_uf,
    "top_pgto": top_pgto,
    "top_transp": top_transp,
    "hier_marca": hier_marca,
    "hier_cat": hier_cat,
    "gerado_em": "build-time",
}

# Custom encoder pra date
def default_enc(o):
    return str(o)

OUT.write_text(f"window.ASTRO_DASH = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n", encoding="utf-8")
print(f"OK astro-data.js gerado em {OUT} ({OUT.stat().st_size} bytes)")
print(f"  Valor Bruto: R$ {valor_bruto/1e6:.2f}M | Vendas: {n_vendas:,} | Margem: {margem_bruta_pct*100:.1f}%")
