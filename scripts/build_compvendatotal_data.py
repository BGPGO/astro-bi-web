"""Le vendas_dash.parquet -> compvendatotal-data.js (Composicao de Venda Total).

Pre-calcula tree_data pra PageComposicaoVendaTotal:
- top 25 marcas (por valor_rateado), com seus top 30 produtos (seo_title) cada
- totais: total geral, n_marcas, n_produtos
- Janela: usa todo o parquet (front filtra por periodo via DuckDB-WASM se quiser)

Tela 15 do PBI Astro: KPI Valor Total = R$ 3,22M + treemap Marca -> Produto.
"""
import duckdb
import json
import pathlib

PARQUET = pathlib.Path(__file__).parent.parent / "public-data" / "vendas_dash.parquet"
OUT = pathlib.Path(__file__).parent.parent / "compvendatotal-data.js"

TOP_MARCAS = 25
TOP_PRODUTOS_POR_MARCA = 30

con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET.as_posix()}') WHERE valor_rateado IS NOT NULL")


def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0


# ===== Totais gerais =====
total_geral = float(q1("SELECT SUM(valor_rateado) FROM v"))
n_marcas_total = int(q1("SELECT COUNT(DISTINCT marca) FROM v WHERE marca IS NOT NULL"))
n_produtos_total = int(q1("SELECT COUNT(DISTINCT seo_title) FROM v WHERE seo_title IS NOT NULL"))

# ===== Top marcas =====
marcas = q(f"""
  SELECT
    COALESCE(marca, '(sem marca)') AS marca,
    SUM(valor_rateado)::DOUBLE AS total_marca,
    COUNT(DISTINCT seo_title)::INT AS n_produtos_marca
  FROM v
  WHERE marca IS NOT NULL
  GROUP BY 1
  ORDER BY total_marca DESC
  LIMIT {TOP_MARCAS}
""")

# ===== Top produtos por marca =====
# Faz uma query unica com window function — mais eficiente que loop.
produtos = q(f"""
  WITH ranked AS (
    SELECT
      marca,
      COALESCE(seo_title, '(sem titulo)') AS seo_title,
      SUM(valor_rateado)::DOUBLE AS valor,
      SUM(quantidade)::DOUBLE AS quantidade,
      ROW_NUMBER() OVER (PARTITION BY marca ORDER BY SUM(valor_rateado) DESC) AS rk
    FROM v
    WHERE marca IS NOT NULL AND seo_title IS NOT NULL
    GROUP BY marca, COALESCE(seo_title, '(sem titulo)')
  )
  SELECT marca, seo_title, valor, quantidade
  FROM ranked
  WHERE rk <= {TOP_PRODUTOS_POR_MARCA}
  ORDER BY marca, valor DESC
""")

# Agrupa produtos por marca em dict
produtos_por_marca = {}
for p in produtos:
    produtos_por_marca.setdefault(p["marca"], []).append({
        "seo_title": p["seo_title"],
        "valor": p["valor"],
        "quantidade": p["quantidade"],
    })

# Monta tree_data filtrando apenas as top marcas
tree_data = []
for m in marcas:
    tree_data.append({
        "marca": m["marca"],
        "total_marca": m["total_marca"],
        "n_produtos_marca": m["n_produtos_marca"],
        "produtos": produtos_por_marca.get(m["marca"], []),
    })

# Periodo coberto
periodo = q("SELECT MIN(data_pedido)::DATE AS dmin, MAX(data_pedido)::DATE AS dmax FROM v")[0]

data = {
    "totais": {
        "total_geral": total_geral,
        "n_marcas_total": n_marcas_total,
        "n_produtos_total": n_produtos_total,
        "n_marcas_top": len(tree_data),
        "total_top_marcas": sum(m["total_marca"] for m in tree_data),
    },
    "tree_data": tree_data,
    "periodo": {
        "data_min": str(periodo["dmin"]) if periodo["dmin"] else None,
        "data_max": str(periodo["dmax"]) if periodo["dmax"] else None,
    },
    "config": {
        "top_marcas": TOP_MARCAS,
        "top_produtos_por_marca": TOP_PRODUTOS_POR_MARCA,
    },
    "gerado_em": "build-time",
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.COMPVENDATOTAL_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)
print(f"OK compvendatotal-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  Total geral: R$ {total_geral/1e6:.2f}M")
print(f"  Marcas (top {TOP_MARCAS}): {len(tree_data)}")
print(f"  Top marca: {tree_data[0]['marca']} = R$ {tree_data[0]['total_marca']/1e6:.2f}M ({len(tree_data[0]['produtos'])} produtos)")
print(f"  Periodo: {periodo['dmin']} -> {periodo['dmax']}")
