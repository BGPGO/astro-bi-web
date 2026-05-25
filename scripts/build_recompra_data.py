"""Le vendas_tiny_bu.parquet (Astro) -> recompra-data.js com agregados pre-calculados.

Gera window.RECOMPRA_DATA com:
- kpis (% receita recompra, ticket recompra/novo, n recorrentes, taxa global recompra)
- top_marcas_recompra (top 15 marcas com >500 pedidos, ordem DESC por taxa_recompra)
- top_marcas_ltv (top 15 marcas por LTV medio do cliente)
- ltv_por_uf (top 15 UFs por LTV medio do cliente)
- serie_recompra_mensal (% recompra por mes, ultimos 18m)
- produtos_gateway (top 20 produtos por seo_title com maior taxa de recompra)

Filtra `situacao != 'Cancelado'` (mesmo filtro do dashboard Streamlit original).
"""
import duckdb
import json
import pathlib

# Mantemos a fonte original do projeto astro-giro-bi como input ate haver
# uma copia em public-data/. cliente_id e Recompra so existem nesse parquet.
PARQUET = pathlib.Path("C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet")
OUT = pathlib.Path(__file__).parent.parent / "recompra-data.js"

if not PARQUET.exists():
    raise SystemExit(f"parquet nao encontrado: {PARQUET}")

con = duckdb.connect()
con.execute(f"""
  CREATE OR REPLACE VIEW v AS
  SELECT * FROM read_parquet('{PARQUET.as_posix()}')
  WHERE situacao <> 'Cancelado'
""")

# orders distintos (1 row por numero) com tipo Recompra/Novo
con.execute("""
  CREATE OR REPLACE VIEW orders AS
  SELECT DISTINCT numero, cliente_id, data_pedido, Recompra,
         strftime(data_pedido, '%Y-%m') AS mes
  FROM v
""")

# receita por pedido (soma dos rateados do pedido)
con.execute("""
  CREATE OR REPLACE VIEW order_receita AS
  SELECT numero,
         any_value(cliente_id) AS cliente_id,
         any_value(Recompra) AS Recompra,
         any_value(strftime(data_pedido, '%Y-%m')) AS mes,
         SUM(valor_rateado) AS receita
  FROM v
  GROUP BY numero
""")


def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0


# === KPIs globais ===
receita_recompra = float(q1("SELECT SUM(receita) FROM order_receita WHERE Recompra='Recompra'"))
receita_novo = float(q1("SELECT SUM(receita) FROM order_receita WHERE Recompra='Novo'"))
receita_total = receita_recompra + receita_novo

n_recompra = int(q1("SELECT COUNT(*) FROM order_receita WHERE Recompra='Recompra'"))
n_novo = int(q1("SELECT COUNT(*) FROM order_receita WHERE Recompra='Novo'"))

ticket_recompra = receita_recompra / n_recompra if n_recompra else 0
ticket_novo = receita_novo / n_novo if n_novo else 0

# Clientes recorrentes: clientes que tem >=1 pedido com Recompra='Recompra'
n_recorrentes = int(q1("""
  SELECT COUNT(DISTINCT cliente_id)
  FROM order_receita
  WHERE Recompra = 'Recompra' AND cliente_id IS NOT NULL
"""))

n_clientes_novos = int(q1("""
  SELECT COUNT(DISTINCT cliente_id)
  FROM order_receita
  WHERE Recompra = 'Novo' AND cliente_id IS NOT NULL
"""))

# Taxa global: % de clientes que comecaram como 'Novo' e tiveram pelo menos 1 pedido 'Recompra'
taxa_global = float(q1("""
  WITH novos AS (
    SELECT DISTINCT cliente_id FROM order_receita
    WHERE Recompra='Novo' AND cliente_id IS NOT NULL
  ),
  voltaram AS (
    SELECT DISTINCT o.cliente_id
    FROM order_receita o
    JOIN novos n USING (cliente_id)
    WHERE o.Recompra='Recompra'
  )
  SELECT (SELECT COUNT(*) FROM voltaram)::DOUBLE / NULLIF((SELECT COUNT(*) FROM novos), 0)
"""))

kpis = {
    "pct_receita_recompra": receita_recompra / receita_total if receita_total else 0,
    "pct_receita_novo": receita_novo / receita_total if receita_total else 0,
    "receita_recompra": receita_recompra,
    "receita_novo": receita_novo,
    "receita_total": receita_total,
    "ticket_recompra": ticket_recompra,
    "ticket_novo": ticket_novo,
    "n_recompra_pedidos": n_recompra,
    "n_novo_pedidos": n_novo,
    "n_recorrentes": n_recorrentes,
    "n_clientes_novos": n_clientes_novos,
    "taxa_global_recompra": taxa_global,
}

# === Top marcas (taxa de recompra) ===
# Marcas com >500 pedidos. taxa_recompra = pedidos Recompra / pedidos totais da marca.
top_marcas_recompra = q("""
  WITH por_marca AS (
    SELECT marca,
           COUNT(DISTINCT numero) AS pedidos_total,
           COUNT(DISTINCT CASE WHEN Recompra='Recompra' THEN numero END) AS pedidos_recompra,
           SUM(valor_rateado) AS receita
    FROM v
    WHERE marca IS NOT NULL
    GROUP BY marca
  )
  SELECT marca,
         pedidos_total::INT AS pedidos,
         pedidos_recompra::INT AS pedidos_recompra,
         receita::DOUBLE AS receita,
         (pedidos_recompra::DOUBLE / NULLIF(pedidos_total, 0)) AS taxa_recompra
  FROM por_marca
  WHERE pedidos_total > 500
  ORDER BY taxa_recompra DESC
  LIMIT 15
""")

# === Top marcas por LTV medio do cliente ===
# LTV = soma de receita por cliente. Considera cliente "da marca" se ele comprou aquela marca.
top_marcas_ltv = q("""
  WITH cli_receita AS (
    SELECT cliente_id, SUM(valor_rateado) AS receita_total
    FROM v
    WHERE cliente_id IS NOT NULL
    GROUP BY cliente_id
  ),
  cli_marca AS (
    SELECT DISTINCT cliente_id, marca
    FROM v
    WHERE cliente_id IS NOT NULL AND marca IS NOT NULL
  )
  SELECT cm.marca,
         AVG(cr.receita_total)::DOUBLE AS ltv_medio,
         COUNT(DISTINCT cm.cliente_id)::INT AS clientes
  FROM cli_marca cm
  JOIN cli_receita cr USING (cliente_id)
  GROUP BY cm.marca
  HAVING COUNT(DISTINCT cm.cliente_id) >= 30
  ORDER BY ltv_medio DESC
  LIMIT 15
""")

# === LTV por UF ===
ltv_por_uf = q("""
  WITH cli AS (
    SELECT cliente_id,
           any_value(cliente_uf) AS uf,
           SUM(valor_rateado) AS receita_total
    FROM v
    WHERE cliente_id IS NOT NULL AND cliente_uf IS NOT NULL
    GROUP BY cliente_id
  )
  SELECT uf,
         AVG(receita_total)::DOUBLE AS ltv_medio,
         COUNT(*)::INT AS clientes
  FROM cli
  GROUP BY uf
  HAVING COUNT(*) >= 30
  ORDER BY ltv_medio DESC
  LIMIT 15
""")

# === Serie mensal: % recompra (pedidos recompra / pedidos totais) ===
serie_recompra_mensal = q("""
  WITH base AS (
    SELECT mes,
           COUNT(DISTINCT numero) AS total,
           COUNT(DISTINCT CASE WHEN Recompra='Recompra' THEN numero END) AS recompra
    FROM order_receita
    GROUP BY mes
  )
  SELECT mes,
         total::INT AS total,
         recompra::INT AS recompra,
         (recompra::DOUBLE / NULLIF(total, 0)) AS pct_recompra
  FROM base
  ORDER BY mes DESC
  LIMIT 18
""")
serie_recompra_mensal.reverse()

# === Produtos gateway: produtos (seo_title) com maior taxa de recompra histórica ===
# Definicao: para cada produto comprado num pedido 'Novo', quantos desses clientes
# voltaram a comprar (qualquer item, qualquer pedido 'Recompra')?
produtos_gateway = q("""
  WITH primeiro_compra AS (
    -- clientes 'Novo': pegar produtos do primeiro pedido (pedido marcado como Novo)
    SELECT DISTINCT v.cliente_id, v.seo_title, v.marca, v.sub_categoria, v.categoria_mae
    FROM v
    WHERE v.Recompra='Novo' AND v.cliente_id IS NOT NULL AND v.seo_title IS NOT NULL
  ),
  voltou AS (
    SELECT DISTINCT cliente_id
    FROM order_receita
    WHERE Recompra='Recompra' AND cliente_id IS NOT NULL
  ),
  por_produto AS (
    SELECT p.seo_title,
           any_value(p.marca) AS marca,
           any_value(p.sub_categoria) AS sub_categoria,
           any_value(p.categoria_mae) AS categoria_mae,
           COUNT(DISTINCT p.cliente_id) AS clientes_1a,
           COUNT(DISTINCT v.cliente_id) AS recompraram
    FROM primeiro_compra p
    LEFT JOIN voltou v USING (cliente_id)
    GROUP BY p.seo_title
  )
  SELECT seo_title,
         marca,
         sub_categoria,
         categoria_mae,
         clientes_1a::INT AS clientes_1a,
         recompraram::INT AS recompraram,
         (recompraram::DOUBLE / NULLIF(clientes_1a, 0)) AS taxa_recompra
  FROM por_produto
  WHERE clientes_1a >= 50  -- filtro de ruido
  ORDER BY taxa_recompra DESC
  LIMIT 20
""")

data = {
    "kpis": kpis,
    "top_marcas_recompra": top_marcas_recompra,
    "top_marcas_ltv": top_marcas_ltv,
    "ltv_por_uf": ltv_por_uf,
    "serie_recompra_mensal": serie_recompra_mensal,
    "produtos_gateway": produtos_gateway,
    "gerado_em": "build-time",
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.RECOMPRA_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)
print(f"OK recompra-data.js gerado em {OUT} ({OUT.stat().st_size} bytes)")
print(f"  Taxa global recompra: {taxa_global*100:.1f}% | % receita recompra: {kpis['pct_receita_recompra']*100:.1f}%")
print(f"  Ticket Recompra: R$ {ticket_recompra:.2f} | Ticket Novo: R$ {ticket_novo:.2f}")
print(f"  Clientes recorrentes: {n_recorrentes:,} | Clientes novos: {n_clientes_novos:,}")
if top_marcas_recompra:
    print("  Top 3 marcas alta recompra:")
    for r in top_marcas_recompra[:3]:
        print(f"    - {r['marca']}: {r['taxa_recompra']*100:.1f}% ({r['pedidos']} pedidos)")
