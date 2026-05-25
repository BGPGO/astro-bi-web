"""build_tendprod_data.py — pre-compute YTD vs PYTD por Categoria/Sub/SEO + tendencia.

Replica a tela "Tendencia Produtos" do PBI Astro (pagina 12):
  - YTD: ano corrente (REF_YEAR=2026) ate hoje (cap 2026-05-12 = max(data_pedido))
  - PYTD: ano anterior, mesmo periodo (cap dia/mes)
  - Tendencia Linear (R$/mes): slope da regressao linear ordinaria sobre receita mensal (ultimos 12m)
  - Tendencia % Mensal (log): slope da regressao linear sobre log(receita) mensal -> taxa exp = exp(slope) - 1

Saida: window.TENDPROD_DATA em tendprod-data.js.
"""
import duckdb
import json
import math
import pathlib

PARQUET = pathlib.Path(__file__).parent.parent / "public-data" / "vendas_dash.parquet"
OUT = pathlib.Path(__file__).parent.parent / "tendprod-data.js"

con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET.as_posix()}')")

# Determinar periodo: YTD = ano corrente ate max(data_pedido), PYTD = ano-1 mesmo cap
max_d = con.execute("SELECT MAX(data_pedido)::DATE FROM v").fetchone()[0]
ref_year = max_d.year
ref_month = max_d.month
ref_day = max_d.day
prev_year = ref_year - 1

ytd_ini = f"{ref_year}-01-01"
ytd_fim = max_d.isoformat()
pytd_ini = f"{prev_year}-01-01"
# PYTD termina no mesmo dia/mes do ano anterior
try:
    pytd_fim = max_d.replace(year=prev_year).isoformat()
except ValueError:
    # 29-fev em ano nao-bissexto: pega 28-fev
    pytd_fim = max_d.replace(year=prev_year, day=28).isoformat()


def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0


# ============================================================
# Helpers de regressao em Python (DuckDB nao tem regr_slope universal facil)
# ============================================================
def linreg_slope(xs, ys):
    """Slope da OLS y = a*x + b. Retorna a (R$/mes)."""
    n = len(xs)
    if n < 2:
        return 0.0
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    den = sum((xs[i] - mx) ** 2 for i in range(n))
    return num / den if den else 0.0


def log_slope(xs, ys):
    """Slope da OLS log(y) = a*x + b. Retorna taxa mensal = exp(a) - 1."""
    pairs = [(x, math.log(y)) for x, y in zip(xs, ys) if y and y > 0]
    if len(pairs) < 2:
        return 0.0
    xs2 = [p[0] for p in pairs]
    ys2 = [p[1] for p in pairs]
    a = linreg_slope(xs2, ys2)
    return math.exp(a) - 1.0


# ============================================================
# Serie mensal por dimensao -> usado pra regressoes e mini-spark
# ============================================================
def build_for(dim_col, top_n=30):
    """Pra cada valor da dimensao (top_n por valor YTD), monta:
       { key, ytd, pytd, delta, growth_pct, trend_lin, trend_log_pct, mensal:[{am,v}] }
    """
    # Top N por YTD
    top = q(f"""
      SELECT {dim_col} AS k, SUM(valor_rateado)::DOUBLE AS ytd
      FROM v
      WHERE {dim_col} IS NOT NULL
        AND data_pedido::DATE BETWEEN DATE '{ytd_ini}' AND DATE '{ytd_fim}'
      GROUP BY k
      ORDER BY ytd DESC
      LIMIT {top_n}
    """)
    keys = [r["k"] for r in top]
    if not keys:
        return []

    # PYTD pros mesmos keys
    plac = ",".join([f"'{str(k).replace(chr(39), chr(39)*2)}'" for k in keys])
    pytd_rows = q(f"""
      SELECT {dim_col} AS k, SUM(valor_rateado)::DOUBLE AS pytd
      FROM v
      WHERE {dim_col} IN ({plac})
        AND data_pedido::DATE BETWEEN DATE '{pytd_ini}' AND DATE '{pytd_fim}'
      GROUP BY k
    """)
    pytd_map = {r["k"]: r["pytd"] for r in pytd_rows}

    # Serie mensal ultimos 12m (cap = max_d)
    mensal_rows = q(f"""
      SELECT {dim_col} AS k,
             strftime(data_pedido, '%Y-%m') AS am,
             SUM(valor_rateado)::DOUBLE AS v
      FROM v
      WHERE {dim_col} IN ({plac})
        AND data_pedido::DATE >= DATE '{ytd_fim}' - INTERVAL 11 MONTH
        AND data_pedido::DATE <= DATE '{ytd_fim}'
      GROUP BY k, am
      ORDER BY k, am
    """)
    mensal_map = {}
    for r in mensal_rows:
        mensal_map.setdefault(r["k"], []).append({"am": r["am"], "v": float(r["v"] or 0)})

    out = []
    for r in top:
        k = r["k"]
        ytd = float(r["ytd"] or 0)
        pytd = float(pytd_map.get(k, 0) or 0)
        delta = ytd - pytd
        growth = (delta / pytd) if pytd > 0 else None
        mensal = mensal_map.get(k, [])
        if mensal:
            xs = list(range(len(mensal)))
            ys = [m["v"] for m in mensal]
            trend_lin = linreg_slope(xs, ys)
            trend_log = log_slope(xs, ys)
        else:
            trend_lin = 0.0
            trend_log = 0.0
        out.append({
            "k": k,
            "ytd": ytd,
            "pytd": pytd,
            "delta": delta,
            "growth_pct": growth,
            "trend_lin": trend_lin,
            "trend_log_pct": trend_log,
            "mensal": mensal,
        })
    return out


categorias = build_for("categoria_mae", top_n=30)
subcategorias = build_for("sub_categoria", top_n=30)
seo_titles = build_for("seo_title", top_n=30)

# Totais
total_ytd = float(q1(f"SELECT SUM(valor_rateado) FROM v WHERE data_pedido::DATE BETWEEN DATE '{ytd_ini}' AND DATE '{ytd_fim}'") or 0)
total_pytd = float(q1(f"SELECT SUM(valor_rateado) FROM v WHERE data_pedido::DATE BETWEEN DATE '{pytd_ini}' AND DATE '{pytd_fim}'") or 0)
total_delta = total_ytd - total_pytd
total_growth = (total_delta / total_pytd) if total_pytd > 0 else None

# Serie mensal total (line chart no topo, ultimos 18m)
serie_total = q(f"""
  SELECT strftime(data_pedido, '%Y-%m') AS am,
         SUM(valor_rateado)::DOUBLE AS v
  FROM v
  WHERE data_pedido::DATE >= DATE '{ytd_fim}' - INTERVAL 17 MONTH
    AND data_pedido::DATE <= DATE '{ytd_fim}'
  GROUP BY am ORDER BY am
""")

# Serie mensal por categoria (line multi-serie no topo)
top_cats = [c["k"] for c in categorias[:8]]
plac_cats = ",".join([f"'{str(c).replace(chr(39), chr(39)*2)}'" for c in top_cats])
serie_por_cat = []
if plac_cats:
    serie_por_cat = q(f"""
      SELECT categoria_mae AS k,
             strftime(data_pedido, '%Y-%m') AS am,
             SUM(valor_rateado)::DOUBLE AS v
      FROM v
      WHERE categoria_mae IN ({plac_cats})
        AND data_pedido::DATE >= DATE '{ytd_fim}' - INTERVAL 17 MONTH
        AND data_pedido::DATE <= DATE '{ytd_fim}'
      GROUP BY k, am
      ORDER BY am, k
    """)

# ============================================================
# OUTPUT
# ============================================================
data = {
    "meta": {
        "ref_year": ref_year,
        "prev_year": prev_year,
        "ytd_ini": ytd_ini,
        "ytd_fim": ytd_fim,
        "pytd_ini": pytd_ini,
        "pytd_fim": pytd_fim,
        "max_data": max_d.isoformat(),
    },
    "totais": {
        "ytd": total_ytd,
        "pytd": total_pytd,
        "delta": total_delta,
        "growth_pct": total_growth,
    },
    "categorias": categorias,
    "subcategorias": subcategorias,
    "seo_titles": seo_titles,
    "serie_total": serie_total,
    "serie_por_cat": serie_por_cat,
    "gerado_em": "build-time",
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.TENDPROD_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)
print(f"OK tendprod-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  Periodo YTD: {ytd_ini} -> {ytd_fim}  (vs PYTD: {pytd_ini} -> {pytd_fim})")
print(f"  YTD total: R$ {total_ytd/1e6:.2f}M | PYTD: R$ {total_pytd/1e6:.2f}M | Delta: {(total_growth or 0)*100:+.2f}%")
print(f"  Categorias: {len(categorias)} | Sub: {len(subcategorias)} | SEO: {len(seo_titles)}")
if categorias[:3]:
    for c in categorias[:3]:
        gp = (c['growth_pct'] or 0) * 100
        print(f"    {c['k'][:30]:30s} YTD R$ {c['ytd']/1e3:>8.1f}k  growth {gp:+6.2f}%  trend_lin {c['trend_lin']:+8.1f}/m  log_pct {c['trend_log_pct']*100:+5.2f}%")
