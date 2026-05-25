"""Le vendas_tiny_bu.parquet -> abc-data.js com Curva ABC por produto (seo_title).

Pre-calcula em DuckDB tudo que a PageCurvaABC precisa:
- kpis: n_produtos total, pct_receita_classe_a, n_produtos_a
- curva: array ordenado DESC por receita com { rank, seo_title, sku, marca,
  quantidade, receita, pct_indiv, pct_acum, classe (A/B/C) }
- classes_resumo: A/B/C com n_produtos, pct_receita_total, ticket_medio
- top_50: top 50 produtos classe A
- marca_breakdown: distribuicao de classes A/B/C por marca (top 15 por receita)

Filtros: exclui situacao='Cancelado'. Granularidade: seo_title (descarta NULL).
Curva canonica: A = top 80% receita acum, B = 80%-95%, C = 95%-100%.
"""
import duckdb
import json
import pathlib

# Mesmo parquet usado pelo wrapper Streamlit original
PARQUET = pathlib.Path("C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet")
# Fallback: se o parquet do projeto Astro nao existir, usa o do projeto astro-bi-web
if not PARQUET.exists():
    PARQUET = pathlib.Path(__file__).parent.parent / "public-data" / "vendas_dash.parquet"

OUT = pathlib.Path(__file__).parent.parent / "abc-data.js"

con = duckdb.connect()
con.execute(f"""
CREATE OR REPLACE VIEW v AS
  SELECT
    seo_title,
    codigo AS sku,
    marca,
    CAST(quantidade AS DOUBLE) AS quantidade,
    CAST(valor_rateado AS DOUBLE) AS valor_rateado,
    situacao
  FROM read_parquet('{PARQUET.as_posix()}')
  WHERE seo_title IS NOT NULL
    AND (situacao IS NULL OR situacao <> 'Cancelado')
""")


def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0


# ===== 1. Agregacao base por seo_title =====
con.execute("""
CREATE OR REPLACE TEMP TABLE agg AS
  SELECT
    seo_title,
    any_value(sku) AS sku,
    any_value(marca) AS marca,
    SUM(quantidade) AS quantidade,
    SUM(valor_rateado) AS receita
  FROM v
  GROUP BY seo_title
""")

total_receita = float(q1("SELECT SUM(receita) FROM agg WHERE receita > 0"))
if total_receita <= 0:
    raise SystemExit("ERR: total de receita <= 0, abortando")

# ===== 2. Curva ordenada com pct_indiv e pct_acum =====
con.execute(f"""
CREATE OR REPLACE TEMP TABLE curva AS
  SELECT
    ROW_NUMBER() OVER (ORDER BY receita DESC, seo_title) AS rank,
    seo_title,
    sku,
    marca,
    quantidade,
    receita,
    receita / {total_receita} AS pct_indiv,
    SUM(receita / {total_receita}) OVER (ORDER BY receita DESC, seo_title
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS pct_acum,
    CASE
      WHEN SUM(receita / {total_receita}) OVER (ORDER BY receita DESC, seo_title
                                                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) <= 0.80 THEN 'A'
      WHEN SUM(receita / {total_receita}) OVER (ORDER BY receita DESC, seo_title
                                                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) <= 0.95 THEN 'B'
      ELSE 'C'
    END AS classe
  FROM agg
  WHERE receita > 0
""")

# ===== 3. KPIs =====
n_produtos_total = int(q1("SELECT COUNT(*) FROM curva"))
n_produtos_a = int(q1("SELECT COUNT(*) FROM curva WHERE classe = 'A'"))
receita_classe_a = float(q1("SELECT SUM(receita) FROM curva WHERE classe = 'A'"))
pct_receita_a = receita_classe_a / total_receita if total_receita else 0.0

kpis = {
    "n_produtos_total": n_produtos_total,
    "n_produtos_a": n_produtos_a,
    "pct_receita_classe_a": pct_receita_a,
    "receita_total": total_receita,
    "receita_classe_a": receita_classe_a,
}

# ===== 4. Resumo por classe =====
classes_resumo = q(f"""
  SELECT
    classe,
    COUNT(*)::INT AS n_produtos,
    SUM(receita)::DOUBLE AS receita,
    (SUM(receita) / {total_receita})::DOUBLE AS pct_receita_total,
    (SUM(receita) / NULLIF(COUNT(*), 0))::DOUBLE AS ticket_medio
  FROM curva
  GROUP BY classe
  ORDER BY classe
""")

# ===== 5. Curva completa (array para SVG / drilldown) =====
# Para o SVG nao precisamos de todos os ~10k pontos individuais.
# Mas pra grafico AstroLine, exportamos pct_acum amostrado:
# - sempre primeiros e ultimos 50
# - resto: ~500 pontos com sampling uniforme
curva_full = q("""
  SELECT rank::INT AS rank, seo_title, sku, marca,
         quantidade::DOUBLE AS quantidade, receita::DOUBLE AS receita,
         pct_indiv::DOUBLE AS pct_indiv, pct_acum::DOUBLE AS pct_acum, classe
  FROM curva
  ORDER BY rank
""")

# Amostragem para o grafico: max ~600 pontos
TARGET_POINTS = 600
if len(curva_full) <= TARGET_POINTS:
    curva_sample = curva_full
else:
    step = max(1, len(curva_full) // TARGET_POINTS)
    curva_sample = curva_full[::step]
    # Garante ultimo ponto
    if curva_sample[-1]["rank"] != curva_full[-1]["rank"]:
        curva_sample.append(curva_full[-1])

# ===== 6. Top 50 classe A =====
top_50 = q("""
  SELECT rank::INT AS rank, seo_title, sku, marca,
         quantidade::DOUBLE AS quantidade, receita::DOUBLE AS receita,
         pct_indiv::DOUBLE AS pct_indiv, pct_acum::DOUBLE AS pct_acum, classe
  FROM curva
  WHERE classe = 'A'
  ORDER BY rank
  LIMIT 50
""")

# ===== 7. Breakdown por marca: top 15 marcas por receita total =====
marca_breakdown = q("""
  WITH marca_total AS (
    SELECT marca, SUM(receita) AS receita_marca
    FROM curva
    WHERE marca IS NOT NULL
    GROUP BY marca
    ORDER BY receita_marca DESC
    LIMIT 15
  )
  SELECT
    c.marca AS marca,
    mt.receita_marca::DOUBLE AS receita_marca,
    COUNT(*)::INT AS n_total,
    SUM(CASE WHEN c.classe = 'A' THEN 1 ELSE 0 END)::INT AS n_a,
    SUM(CASE WHEN c.classe = 'B' THEN 1 ELSE 0 END)::INT AS n_b,
    SUM(CASE WHEN c.classe = 'C' THEN 1 ELSE 0 END)::INT AS n_c,
    SUM(CASE WHEN c.classe = 'A' THEN c.receita ELSE 0 END)::DOUBLE AS receita_a,
    SUM(CASE WHEN c.classe = 'B' THEN c.receita ELSE 0 END)::DOUBLE AS receita_b,
    SUM(CASE WHEN c.classe = 'C' THEN c.receita ELSE 0 END)::DOUBLE AS receita_c
  FROM curva c
  INNER JOIN marca_total mt ON c.marca = mt.marca
  GROUP BY c.marca, mt.receita_marca
  ORDER BY mt.receita_marca DESC
""")

# ===== 8. Top 3 SKUs A (para reporte do operador) =====
top_3_a = q("""
  SELECT seo_title, sku, receita::DOUBLE AS receita, pct_indiv::DOUBLE AS pct_indiv
  FROM curva
  WHERE classe = 'A'
  ORDER BY rank
  LIMIT 3
""")

data = {
    "kpis": kpis,
    "curva": curva_sample,
    "classes_resumo": classes_resumo,
    "top_50": top_50,
    "marca_breakdown": marca_breakdown,
    "gerado_em": "build-time",
    "fonte_parquet": str(PARQUET),
    "total_pontos_curva": len(curva_full),
    "pontos_amostrados": len(curva_sample),
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.ABC_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)
print(f"OK abc-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  Produtos total: {n_produtos_total:,}")
print(f"  Classe A: {n_produtos_a:,} ({n_produtos_a/n_produtos_total*100:.1f}% dos produtos) -> {pct_receita_a*100:.2f}% da receita")
print(f"  Receita total: R$ {total_receita/1e6:.2f}M")
print(f"  Top 3 classe A:")
for r in top_3_a:
    print(f"    #{1+top_3_a.index(r)}: {r['seo_title'][:60]:60s} | SKU {r['sku']} | R$ {r['receita']/1e3:.1f}k ({r['pct_indiv']*100:.2f}%)")
