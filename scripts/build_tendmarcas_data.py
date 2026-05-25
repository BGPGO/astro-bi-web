"""build_tendmarcas_data.py — Astro · Tendencias Marcas (PBI tela 13)

Le vendas_dash.parquet (DuckDB) e gera tendmarcas-data.js com:

  - meta: ano YTD, ano PYTD, mes_ref, total_marcas
  - tabela_marcas[]: top 30 marcas com:
      marca, ytd, pytd, delta, growth_pct,
      linear_slope (vendas/mes), log_slope_pct_mensal,
      sparkline_12m (array float)
  - serie_top: pra cada uma das top 10 marcas, serie mensal completa do ano corrente

Output: tendmarcas-data.js -> window.TENDMARCAS_DATA = {...}.

NAO toca outros artefatos; le apenas o parquet ja existente em public-data/.
"""
from __future__ import annotations

import json
import math
import pathlib

import duckdb
import numpy as np

ROOT = pathlib.Path(__file__).parent.parent
PARQUET = ROOT / "public-data" / "vendas_dash.parquet"
OUT = ROOT / "tendmarcas-data.js"

if not PARQUET.exists():
    raise SystemExit(f"parquet nao encontrado: {PARQUET}")

con = duckdb.connect()
con.execute(
    f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET.as_posix()}') "
    f"WHERE data_pedido IS NOT NULL "
    f"  AND marca IS NOT NULL AND marca <> ''"
)


def q(sql):
    return con.execute(sql).fetchdf()


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r and r[0] is not None else 0


# ===== Janelas: usa MAX(data_pedido) pra determinar ano corrente + mes ref =====
# Se MAX cai meio mes, recua pra ultimo mes COMPLETO (igual PBI mostra "abril").
max_dt = con.execute("SELECT MAX(data_pedido) FROM v").fetchone()[0]
ANO_YTD = int(max_dt.year)
ANO_PYTD = ANO_YTD - 1
# Considera o mes do MAX como incompleto se dia < 25 -> usa o mes anterior.
MES_REF = int(max_dt.month) if max_dt.day >= 25 else (int(max_dt.month) - 1)
if MES_REF < 1:
    MES_REF = 12
    ANO_YTD -= 1
    ANO_PYTD -= 1
print(f"[1/5] janela: YTD={ANO_YTD} (jan..mes {MES_REF})  PYTD={ANO_PYTD} (mesmo recorte)")


# ===== Agregado YTD vs PYTD por marca =====
agg = q(
    f"""
    WITH base AS (
      SELECT marca,
             EXTRACT(YEAR FROM data_pedido)::INT  AS ano,
             EXTRACT(MONTH FROM data_pedido)::INT AS mes,
             valor_rateado
      FROM v
      WHERE EXTRACT(YEAR FROM data_pedido) IN ({ANO_YTD}, {ANO_PYTD})
        AND EXTRACT(MONTH FROM data_pedido) <= {MES_REF}
    )
    SELECT
      marca,
      SUM(CASE WHEN ano = {ANO_YTD}  THEN valor_rateado ELSE 0 END)::DOUBLE AS ytd,
      SUM(CASE WHEN ano = {ANO_PYTD} THEN valor_rateado ELSE 0 END)::DOUBLE AS pytd
    FROM base
    GROUP BY marca
    HAVING SUM(valor_rateado) > 0
    ORDER BY ytd DESC NULLS LAST
    LIMIT 30
    """
)
print(f"     marcas no top: {len(agg)}")


# ===== Pra cada marca: serie mensal completa (todo historico) pra slopes + sparkline 12m =====
# Pega min/max do dataset
min_year = int(q1("SELECT EXTRACT(YEAR FROM MIN(data_pedido))::INT FROM v"))
max_year = ANO_YTD

# Tudo num shot: serie marca x ano-mes
hist = q(
    f"""
    WITH base AS (
      SELECT marca,
             DATE_TRUNC('month', data_pedido)::DATE AS mes_dt,
             SUM(valor_rateado)::DOUBLE AS valor
      FROM v
      WHERE marca IN ({",".join(f"'{m.replace(chr(39), chr(39)*2)}'" for m in agg['marca'].tolist())})
      GROUP BY 1, 2
    )
    SELECT marca, mes_dt, valor FROM base ORDER BY marca, mes_dt
    """
)
print(f"[2/5] historico mensal: {len(hist)} linhas")


def _safe(x):
    try:
        f = float(x)
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return f
    except (TypeError, ValueError):
        return 0.0


def _linear_slope(values):
    """Slope OLS de y ~ x (x = indices 0..n-1). Retorna 0 se variancia nula ou n<3."""
    arr = np.asarray(values, dtype=float)
    n = len(arr)
    if n < 3 or np.std(arr) == 0:
        return 0.0
    x = np.arange(n, dtype=float)
    # OLS analitica
    xm = x.mean()
    ym = arr.mean()
    cov = np.sum((x - xm) * (arr - ym))
    var = np.sum((x - xm) ** 2)
    if var == 0:
        return 0.0
    return _safe(cov / var)


def _log_slope_pct_monthly(values):
    """Slope log: y = a + b*x onde y = log(valor). Retorna b convertido pra % mensal (exp(b)-1)*100.
    Usa log1p pra estabilidade (zero-safe). Retorna 0 se sem variacao."""
    arr = np.asarray(values, dtype=float)
    arr = np.where(arr < 0, 0, arr)
    n = len(arr)
    if n < 3:
        return 0.0
    # Filtra trailing zeros consecutivos? Nao: mantem a serie como o PBI faz.
    # log(0) bomba; usa log1p (log(1+x)) — pequena distorcao pra valores >> 1
    # mas dominante: o slope captura tendencia. Para valores em reais (centenas/milhares)
    # log1p ~ log(x) pra x >> 1, entao OK.
    y = np.log1p(arr)
    if np.std(y) == 0:
        return 0.0
    x = np.arange(n, dtype=float)
    xm = x.mean()
    ym = y.mean()
    cov = np.sum((x - xm) * (y - ym))
    var = np.sum((x - xm) ** 2)
    if var == 0:
        return 0.0
    b = cov / var  # crescimento log por mes
    pct_mensal = (math.exp(b) - 1) * 100
    return _safe(pct_mensal)


# ===== Monta linhas finais =====
def _month_label(d):
    NAMES = ["jan", "fev", "mar", "abr", "mai", "jun",
             "jul", "ago", "set", "out", "nov", "dez"]
    return f"{NAMES[d.month - 1]}/{str(d.year)[-2:]}"


# index hist por marca
hist_by_marca = {}
for _, row in hist.iterrows():
    hist_by_marca.setdefault(row["marca"], []).append((row["mes_dt"], _safe(row["valor"])))

# Determina ultimos 12 meses possiveis (do dataset)
# Pega lista distinta de mes_dt ordenada
all_months_df = q("SELECT DISTINCT DATE_TRUNC('month', data_pedido)::DATE AS m FROM v ORDER BY m")
all_months = [r["m"] for _, r in all_months_df.iterrows()]
last_12_months = all_months[-12:] if len(all_months) >= 12 else all_months
last_12_labels = [_month_label(d) for d in last_12_months]

# Tambem prepara serie completa do ano YTD pra o line chart top10 (so meses <= MES_REF)
ytd_months = [d for d in all_months if d.year == ANO_YTD and d.month <= MES_REF]
ytd_month_labels = [_month_label(d) for d in ytd_months]

tabela = []
serie_top10 = []  # {marca, serie: [valor por mes do YTD]}
print("[3/5] calculando slopes e sparklines por marca...")

for _, r in agg.iterrows():
    marca = r["marca"]
    ytd = _safe(r["ytd"])
    pytd = _safe(r["pytd"])
    delta = ytd - pytd
    growth = (delta / pytd * 100) if pytd > 0 else None

    series = hist_by_marca.get(marca, [])
    series_by_month = {d: v for d, v in series}
    # serie completa em ordem cronologica
    full_values = [series_by_month.get(d, 0.0) for d in all_months]
    linear_slope = _linear_slope(full_values)
    log_slope_pct = _log_slope_pct_monthly(full_values)

    # sparkline = ultimos 12 meses
    spark = [series_by_month.get(d, 0.0) for d in last_12_months]

    tabela.append({
        "marca": str(marca),
        "ytd": ytd,
        "pytd": pytd,
        "delta": delta,
        "growth_pct": _safe(growth) if growth is not None else None,
        "linear_slope": linear_slope,
        "log_slope_pct_mensal": log_slope_pct,
        "sparkline_12m": [_safe(v) for v in spark],
    })

# Top 10 por YTD pro line chart principal
top10_marcas = [t["marca"] for t in tabela[:10]]
for m in top10_marcas:
    series_by_month = {d: v for d, v in hist_by_marca.get(m, [])}
    serie_ytd = [_safe(series_by_month.get(d, 0.0)) for d in ytd_months]
    serie_top10.append({"marca": m, "serie": serie_ytd})

print(f"[4/5] tabela: {len(tabela)} marcas | top10 line: {len(serie_top10)} series")

# ===== Totais (linha total) =====
tot_ytd = sum(t["ytd"] for t in tabela)
tot_pytd = sum(t["pytd"] for t in tabela)
tot_delta = tot_ytd - tot_pytd
tot_growth = (tot_delta / tot_pytd * 100) if tot_pytd > 0 else None
# slope/log_slope agregado a partir da soma mensal de TODAS marcas (nao apenas top30)
agg_total = q(
    f"""
    SELECT DATE_TRUNC('month', data_pedido)::DATE AS mes_dt,
           SUM(valor_rateado)::DOUBLE AS v
    FROM v GROUP BY 1 ORDER BY 1
    """
)
total_series = {r["mes_dt"]: _safe(r["v"]) for _, r in agg_total.iterrows()}
total_full = [total_series.get(d, 0.0) for d in all_months]
total_linear = _linear_slope(total_full)
total_logpct = _log_slope_pct_monthly(total_full)

total_row = {
    "marca": "Total (top 30)",
    "ytd": _safe(tot_ytd),
    "pytd": _safe(tot_pytd),
    "delta": _safe(tot_delta),
    "growth_pct": _safe(tot_growth) if tot_growth is not None else None,
    "linear_slope": _safe(total_linear),
    "log_slope_pct_mensal": _safe(total_logpct),
}

meta = {
    "ano_ytd": ANO_YTD,
    "ano_pytd": ANO_PYTD,
    "mes_ref": MES_REF,
    "mes_ref_label": ["jan", "fev", "mar", "abr", "mai", "jun",
                      "jul", "ago", "set", "out", "nov", "dez"][MES_REF - 1],
    "n_marcas_top": len(tabela),
    "sparkline_labels_12m": last_12_labels,
    "ytd_month_labels": ytd_month_labels,
}

payload = {
    "meta": meta,
    "tabela_marcas": tabela,
    "total_row": total_row,
    "serie_top10_ytd": serie_top10,
    "gerado_em": "build-time",
}


def default_enc(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        v = float(o)
        return v if (not math.isnan(v) and not math.isinf(v)) else 0.0
    return str(o)


OUT.write_text(
    f"window.TENDMARCAS_DATA = {json.dumps(payload, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)
print(f"[5/5] OK {OUT.name} ({OUT.stat().st_size:,} bytes)")
print(f"  YTD {ANO_YTD}: R$ {tot_ytd/1e6:.2f}M  |  PYTD {ANO_PYTD}: R$ {tot_pytd/1e6:.2f}M  |  crescimento: {(tot_growth or 0):.1f}%")
print(f"  Top 3 marcas YTD: {', '.join(t['marca'] for t in tabela[:3])}")
