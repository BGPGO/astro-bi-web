"""Le vendas_tiny_bu.parquet -> abc-data.js V2 PROFUNDA.

Pre-calcula TUDO que a PageCurvaABCAstro V2 precisa:

1. por_status:
   - excluindo_cancelado: { curva_completa (todos os ~931), kpis }
   - incluindo_cancelado: idem
   Reativo: toggle no front troca entre os dois.

2. classes_resumo: A/B/C com n_produtos, pct_receita, ticket_medio, margem_estimada
3. por_marca: distribuicao A/B/C por TODAS as marcas (n_produtos, % receita)
4. por_categoria: idem por categoria_mae
5. top_50_classe_A, bottom_50_classe_C (candidatos a descontinuar)
6. pareto_real_vs_ideal: pares (% produtos, % receita) + linha 80/20 ideal
7. filtros: lista de marcas e categorias para dropdowns

Classes: A = ate 80% receita acum, B = 80-95%, C = 95-100%.
"""
import duckdb
import json
import pathlib

# Mesmo parquet usado pelo wrapper Streamlit original
PARQUET = pathlib.Path("C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet")
if not PARQUET.exists():
    PARQUET = pathlib.Path(__file__).parent.parent / "public-data" / "vendas_dash.parquet"

OUT = pathlib.Path(__file__).parent.parent / "abc-data.js"

con = duckdb.connect()


def q(sql, params=None):
    return con.execute(sql, params or []).fetchdf().to_dict(orient="records")


def q1(sql, params=None):
    r = con.execute(sql, params or []).fetchone()
    return r[0] if r else 0


def build_curva_view(incluir_cancelado: bool):
    """Cria view 'v' filtrada e popula tabela temp 'curva'."""
    filtro_situacao = "" if incluir_cancelado else "AND (situacao IS NULL OR situacao <> 'Cancelado')"
    con.execute(f"""
    CREATE OR REPLACE VIEW v AS
      SELECT
        seo_title,
        codigo AS sku,
        marca,
        categoria_mae,
        CAST(quantidade AS DOUBLE) AS quantidade,
        CAST(valor_rateado AS DOUBLE) AS valor_rateado,
        situacao
      FROM read_parquet('{PARQUET.as_posix()}')
      WHERE seo_title IS NOT NULL
        {filtro_situacao}
    """)

    con.execute("""
    CREATE OR REPLACE TEMP TABLE agg AS
      SELECT
        seo_title,
        any_value(sku) AS sku,
        any_value(marca) AS marca,
        any_value(categoria_mae) AS categoria_mae,
        SUM(quantidade) AS quantidade,
        SUM(valor_rateado) AS receita
      FROM v
      GROUP BY seo_title
    """)

    total_receita = float(q1("SELECT SUM(receita) FROM agg WHERE receita > 0"))
    if total_receita <= 0:
        return None

    con.execute(f"""
    CREATE OR REPLACE TEMP TABLE curva AS
      SELECT
        ROW_NUMBER() OVER (ORDER BY receita DESC, seo_title) AS rank,
        seo_title,
        sku,
        marca,
        categoria_mae,
        quantidade,
        receita,
        receita / {total_receita} AS pct_indiv,
        SUM(receita / {total_receita}) OVER (
          ORDER BY receita DESC, seo_title
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS pct_acum,
        CASE
          WHEN SUM(receita / {total_receita}) OVER (
            ORDER BY receita DESC, seo_title
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) <= 0.80 THEN 'A'
          WHEN SUM(receita / {total_receita}) OVER (
            ORDER BY receita DESC, seo_title
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) <= 0.95 THEN 'B'
          ELSE 'C'
        END AS classe
      FROM agg
      WHERE receita > 0
    """)
    return total_receita


def snapshot_status(incluir_cancelado: bool):
    """Retorna dict { curva_completa, kpis, classes_resumo,
    por_marca, por_categoria, top_50, bottom_50, pareto_real_vs_ideal,
    filtros }."""
    total = build_curva_view(incluir_cancelado)
    if total is None:
        return None

    # ---- KPIs principais ----
    n_total = int(q1("SELECT COUNT(*) FROM curva"))
    n_a = int(q1("SELECT COUNT(*) FROM curva WHERE classe = 'A'"))
    n_b = int(q1("SELECT COUNT(*) FROM curva WHERE classe = 'B'"))
    n_c = int(q1("SELECT COUNT(*) FROM curva WHERE classe = 'C'"))
    rec_a = float(q1("SELECT SUM(receita) FROM curva WHERE classe = 'A'"))
    rec_b = float(q1("SELECT SUM(receita) FROM curva WHERE classe = 'B'"))
    rec_c = float(q1("SELECT SUM(receita) FROM curva WHERE classe = 'C'"))

    # % produtos para chegar a 80% (pareto real)
    pct_prod_para_80 = float(q1("""
      SELECT MIN(rank) * 1.0 / (SELECT COUNT(*) FROM curva)
      FROM curva WHERE pct_acum >= 0.80
    """) or 0.0)

    kpis = {
        "n_produtos_total": n_total,
        "n_produtos_a": n_a,
        "n_produtos_b": n_b,
        "n_produtos_c": n_c,
        "receita_total": total,
        "receita_classe_a": rec_a,
        "receita_classe_b": rec_b,
        "receita_classe_c": rec_c,
        "pct_receita_classe_a": rec_a / total if total else 0,
        "pct_produtos_para_80pct_receita": pct_prod_para_80,
    }

    # ---- Resumo por classe ----
    classes_resumo = q(f"""
      SELECT
        classe,
        COUNT(*)::INT AS n_produtos,
        SUM(receita)::DOUBLE AS receita,
        (SUM(receita) / {total})::DOUBLE AS pct_receita_total,
        (SUM(receita) / NULLIF(COUNT(*), 0))::DOUBLE AS ticket_medio,
        -- margem estimada: A = 40%, B = 30%, C = 20% (heuristica de mix)
        CASE classe WHEN 'A' THEN 0.40 WHEN 'B' THEN 0.30 ELSE 0.20 END AS margem_estimada_pct,
        (SUM(receita) * CASE classe WHEN 'A' THEN 0.40 WHEN 'B' THEN 0.30 ELSE 0.20 END)::DOUBLE AS margem_estimada_valor
      FROM curva
      GROUP BY classe
      ORDER BY classe
    """)

    # ---- Curva completa (TODOS os produtos pra tabela reativa + SVG) ----
    curva_completa = q("""
      SELECT
        rank::INT AS rank,
        seo_title,
        sku AS codigo,
        marca,
        categoria_mae,
        quantidade::DOUBLE AS quantidade,
        receita::DOUBLE AS receita,
        pct_indiv::DOUBLE AS pct_indiv,
        pct_acum::DOUBLE AS pct_acum,
        classe
      FROM curva
      ORDER BY rank
    """)

    # ---- Por marca (TODAS) ----
    por_marca = q(f"""
      SELECT
        COALESCE(marca, '(sem marca)') AS marca,
        COUNT(*)::INT AS n_total,
        SUM(CASE WHEN classe = 'A' THEN 1 ELSE 0 END)::INT AS n_a,
        SUM(CASE WHEN classe = 'B' THEN 1 ELSE 0 END)::INT AS n_b,
        SUM(CASE WHEN classe = 'C' THEN 1 ELSE 0 END)::INT AS n_c,
        SUM(receita)::DOUBLE AS receita_marca,
        (SUM(receita) / {total})::DOUBLE AS pct_receita_total,
        SUM(CASE WHEN classe = 'A' THEN receita ELSE 0 END)::DOUBLE AS receita_a,
        SUM(CASE WHEN classe = 'B' THEN receita ELSE 0 END)::DOUBLE AS receita_b,
        SUM(CASE WHEN classe = 'C' THEN receita ELSE 0 END)::DOUBLE AS receita_c
      FROM curva
      GROUP BY COALESCE(marca, '(sem marca)')
      ORDER BY receita_marca DESC
    """)

    # ---- Por categoria_mae (TODAS) ----
    por_categoria = q(f"""
      SELECT
        COALESCE(categoria_mae, '(sem categoria)') AS categoria,
        COUNT(*)::INT AS n_total,
        SUM(CASE WHEN classe = 'A' THEN 1 ELSE 0 END)::INT AS n_a,
        SUM(CASE WHEN classe = 'B' THEN 1 ELSE 0 END)::INT AS n_b,
        SUM(CASE WHEN classe = 'C' THEN 1 ELSE 0 END)::INT AS n_c,
        SUM(receita)::DOUBLE AS receita_categoria,
        (SUM(receita) / {total})::DOUBLE AS pct_receita_total,
        SUM(CASE WHEN classe = 'A' THEN receita ELSE 0 END)::DOUBLE AS receita_a,
        SUM(CASE WHEN classe = 'B' THEN receita ELSE 0 END)::DOUBLE AS receita_b,
        SUM(CASE WHEN classe = 'C' THEN receita ELSE 0 END)::DOUBLE AS receita_c
      FROM curva
      GROUP BY COALESCE(categoria_mae, '(sem categoria)')
      ORDER BY receita_categoria DESC
    """)

    # ---- Top 50 classe A (manter foco) ----
    top_50 = q("""
      SELECT rank::INT AS rank, seo_title, sku AS codigo, marca, categoria_mae,
             quantidade::DOUBLE AS quantidade, receita::DOUBLE AS receita,
             pct_indiv::DOUBLE AS pct_indiv, pct_acum::DOUBLE AS pct_acum, classe
      FROM curva WHERE classe = 'A'
      ORDER BY rank LIMIT 50
    """)

    # ---- Bottom 50 classe C (candidatos a descontinuar) ----
    bottom_50 = q("""
      SELECT rank::INT AS rank, seo_title, sku AS codigo, marca, categoria_mae,
             quantidade::DOUBLE AS quantidade, receita::DOUBLE AS receita,
             pct_indiv::DOUBLE AS pct_indiv, pct_acum::DOUBLE AS pct_acum, classe
      FROM curva WHERE classe = 'C'
      ORDER BY rank DESC LIMIT 50
    """)

    # ---- Pareto real vs ideal (amostrado pra SVG, ~120 pontos) ----
    n = n_total
    target_pts = min(n, 120)
    step = max(1, n // target_pts)
    pareto_real = q(f"""
      SELECT
        (rank * 1.0 / {n})::DOUBLE AS pct_produtos,
        pct_acum::DOUBLE AS pct_receita
      FROM curva
      WHERE rank % {step} = 0 OR rank IN (1, {n})
      ORDER BY rank
    """)
    # Linha 80/20 ideal: 20% dos produtos = 80% receita; depois inclinacao se reduz
    pareto_ideal = []
    for i in range(0, 101, 5):
        x = i / 100.0
        # Curva 80/20 idealizada: pct_receita = 1 - (1 - x)^log(0.2)/log(0.8) aprox
        # Mais simples: piecewise linear (0,0) -> (0.2, 0.8) -> (1.0, 1.0)
        if x <= 0.2:
            y = (x / 0.2) * 0.8
        else:
            y = 0.8 + ((x - 0.2) / 0.8) * 0.2
        pareto_ideal.append({"pct_produtos": x, "pct_receita": y})

    # ---- Filtros: marcas e categorias para dropdowns ----
    filtros_marcas = [r["marca"] for r in q(
        "SELECT DISTINCT COALESCE(marca, '(sem marca)') AS marca FROM curva ORDER BY 1"
    )]
    filtros_categorias = [r["categoria"] for r in q(
        "SELECT DISTINCT COALESCE(categoria_mae, '(sem categoria)') AS categoria FROM curva ORDER BY 1"
    )]

    return {
        "kpis": kpis,
        "classes_resumo": classes_resumo,
        "curva_completa": curva_completa,
        "por_marca": por_marca,
        "por_categoria": por_categoria,
        "top_50": top_50,
        "bottom_50": bottom_50,
        "pareto_real": pareto_real,
        "pareto_ideal": pareto_ideal,
        "filtros": {
            "marcas": filtros_marcas,
            "categorias": filtros_categorias,
        },
    }


# ===== Build dois snapshots: com e sem 'Cancelado' =====
print("Construindo snapshot excluindo Cancelado...")
excluindo = snapshot_status(incluir_cancelado=False)
if excluindo is None:
    raise SystemExit("ERR: snapshot excluindo Cancelado vazio")

print("Construindo snapshot incluindo Cancelado...")
incluindo = snapshot_status(incluir_cancelado=True)
if incluindo is None:
    raise SystemExit("ERR: snapshot incluindo Cancelado vazio")


data = {
    "por_status": {
        "excluindo_cancelado": excluindo,
        "incluindo_cancelado": incluindo,
    },
    "default_status": "excluindo_cancelado",
    "gerado_em": "build-time",
    "fonte_parquet": str(PARQUET),
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.ABC_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)

# Reporte
k = excluindo["kpis"]
print(f"OK abc-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  [Excluindo Cancelado]")
print(f"    Produtos: {k['n_produtos_total']:,}")
print(f"    Classe A: {k['n_produtos_a']} produtos ({k['n_produtos_a']/k['n_produtos_total']*100:.1f}%) -> {k['pct_receita_classe_a']*100:.2f}% da receita")
print(f"    Classe B: {k['n_produtos_b']}  Classe C: {k['n_produtos_c']}")
print(f"    Receita total: R$ {k['receita_total']/1e6:.2f}M")
print(f"    {k['pct_produtos_para_80pct_receita']*100:.1f}% dos produtos = 80% da receita (Pareto real)")
print(f"    Marcas: {len(excluindo['por_marca'])}  Categorias: {len(excluindo['por_categoria'])}")
ki = incluindo["kpis"]
print(f"  [Incluindo Cancelado]")
print(f"    Produtos: {ki['n_produtos_total']:,}   Receita: R$ {ki['receita_total']/1e6:.2f}M")
