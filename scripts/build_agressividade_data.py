"""V2 — Le vendas_tiny_bu.parquet + astro_ads.xlsx -> agressividade-data.js.

Tese (espelha pages/6_Agressividade.py do astro-giro-bi):
aumentos bruscos de verba travam o Google Ads e derrubam performance.

V2 amplia muito a profundidade:
- KPIs: taxa media de aumento, dias agressivos por threshold default, ROAS normal
  vs agressivo, % degradacao, limite recomendado, tempo recovery medio
- serie_diaria_completa: 90 dias uteis com budget, delta_pct, roas, cac,
  novos_clientes, regiao_dominante
- eventos_agressividade: top 30 dias com maiores aumentos
- correlacao_por_estado: 27 estados com correlacao + p-value + sample size
- heatmap_dia_uf: matriz dia x UF com cor por delta ROAS
- faixas_aumento: distribuicao por 5 faixas (Queda >20%, Queda 5-20%, Estavel,
  Aumento 5-20%, Aumento >20%) com n_dias, roas_medio, novos_medio
- recomendacao_limite: regressao isotonica simples - X% onde ROAS cai >5%
- ano_completo_serie: serie diaria com smooth 7d
- dispersao_aumento_x_roas: scatter de TODOS os dias uteis + reta de regressao
- tempo_recovery: apos um dia agressivo, em quantos dias ROAS volta ao baseline?

Filtros padrao do astro-giro-bi:
- exclui sabados/domingos
- desde 2026-03-01 (campanha rodando)
- remove outliers (spend < mean - 3*std)
"""
from __future__ import annotations

import json
import math
import pathlib

import numpy as np
import pandas as pd

# === Paths ===
SRC_PARQUET = pathlib.Path("C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet")
SRC_ADS = pathlib.Path("C:/Projects/astro-giro-bi/data/astro_ads.xlsx")
OUT = pathlib.Path(__file__).resolve().parent.parent / "agressividade-data.js"

STATE_MAP = {
    "State of Acre": "AC", "State of Alagoas": "AL", "State of Amapa": "AP",
    "State of Amazonas": "AM", "State of Bahia": "BA", "Ceara": "CE",
    "Federal District": "DF", "State of Espirito Santo": "ES",
    "State of Goias": "GO", "State of Maranhao": "MA",
    "State of Mato Grosso": "MT", "State of Mato Grosso do Sul": "MS",
    "State of Minas Gerais": "MG", "State of Para": "PA",
    "State of Paraiba": "PB", "State of Parana": "PR",
    "State of Pernambuco": "PE", "State of Piaui": "PI",
    "State of Rio de Janeiro": "RJ", "State of Rio Grande do Norte": "RN",
    "State of Rio Grande do Sul": "RS", "State of Rondonia": "RO",
    "State of Roraima": "RR", "State of Santa Catarina": "SC",
    "State of Sao Paulo": "SP", "State of Sergipe": "SE",
    "State of Tocantins": "TO",
}
CAMPAIGN_START = pd.Timestamp("2026-03-01")
DEFAULT_AGGRESSIVE_THRESHOLD = 20.0  # % > 20% diario = agressivo (default slider)


def _approx_p_value(r: float, n: int) -> float:
    """Aproximacao do p-value de Pearson (two-tailed) sem scipy."""
    if r is None or n < 4 or not np.isfinite(r):
        return None
    r = max(-0.9999, min(0.9999, r))
    t = r * math.sqrt((n - 2) / max(1e-9, 1 - r * r))
    # aproximacao normal pra |t| (suficiente pra ranking - sem scipy)
    # Pr(|Z| > t) ~ erfc(|t|/sqrt(2))
    z = abs(t)
    p = math.erfc(z / math.sqrt(2))
    return float(p)


# === Load vendas ===
if not SRC_PARQUET.exists():
    raise SystemExit(f"Faltam dados de origem: {SRC_PARQUET}")
if not SRC_ADS.exists():
    raise SystemExit(f"Faltam dados de origem: {SRC_ADS}")

df = pd.read_parquet(SRC_PARQUET)
df = df[df["situacao"] != "Cancelado"].copy()
df["data_pedido"] = pd.to_datetime(df["data_pedido"])
df["valor_rateado"] = pd.to_numeric(df["valor_rateado"], errors="coerce").fillna(0)

# === Load ads ===
ads = pd.read_excel(SRC_ADS, sheet_name="Planilha1")
ads["Day"] = pd.to_datetime(ads["Day"])
ads["uf"] = ads["State (Geographic)"].map(STATE_MAP)
ads["spend"] = pd.to_numeric(ads["Cost (Spend)"], errors="coerce").fillna(0)

# === Receita diaria (proxy de retorno) ===
df_rev = df[df["data_pedido"] >= CAMPAIGN_START].copy()
df_rev["data_dia"] = df_rev["data_pedido"].dt.normalize()
receita_diaria = df_rev.groupby("data_dia")["valor_rateado"].sum().reset_index()
receita_diaria.columns = ["day", "receita"]

# novos clientes por dia (proxy CAC)
novos = df_rev[df_rev["Recompra"] == "Novo"].drop_duplicates("numero")
novos_diaria = novos.groupby("data_dia")["cliente_id"].nunique().reset_index()
novos_diaria.columns = ["day", "novos"]

# regiao dominante por dia (receita)
rev_uf_dia = df_rev.groupby(["data_dia", "cliente_uf"])["valor_rateado"].sum().reset_index()
rev_uf_dia.columns = ["day", "uf", "rev"]
# pega UF de maior receita por dia
idx = rev_uf_dia.groupby("day")["rev"].idxmax()
regiao_dominante = rev_uf_dia.loc[idx, ["day", "uf"]].rename(columns={"uf": "regiao_dominante"})

# === Spend diario global ===
ads_recent = ads[ads["Day"] >= CAMPAIGN_START].copy()
spend_diaria = ads_recent.groupby("Day")["spend"].sum().reset_index()
spend_diaria.columns = ["day", "spend"]

# === Merge ===
diario = spend_diaria.merge(receita_diaria, on="day", how="left")
diario = diario.merge(novos_diaria, on="day", how="left")
diario = diario.merge(regiao_dominante, on="day", how="left")
diario["receita"] = diario["receita"].fillna(0)
diario["novos"] = diario["novos"].fillna(0).astype(int)
diario["regiao_dominante"] = diario["regiao_dominante"].fillna("—")

# remove fim de semana
diario["dow"] = diario["day"].dt.dayofweek
diario = diario[diario["dow"] < 5].drop(columns="dow")

# remove outliers (spend < mean - 3*std)
mu, sigma = diario["spend"].mean(), diario["spend"].std()
diario = diario[diario["spend"] >= max(mu - 3 * sigma, 1.0)].copy()
diario = diario.sort_values("day").reset_index(drop=True)

# delta dia-a-dia
diario["spend_prev"] = diario["spend"].shift(1)
diario["delta_pct"] = (diario["spend"] / diario["spend_prev"] - 1) * 100
diario["roas"] = diario["receita"] / diario["spend"].replace(0, np.nan)
diario["cac"] = diario["spend"] / diario["novos"].replace(0, np.nan)
diario = diario.dropna(subset=["delta_pct", "roas"])
diario = diario[np.isfinite(diario["roas"])]
diario = diario.reset_index(drop=True)

# === KPIs principais ===
delta_mean = float(diario["delta_pct"].mean())
delta_median = float(diario["delta_pct"].median())
delta_std = float(diario["delta_pct"].std())
roas_global = float(diario["receita"].sum() / diario["spend"].sum()) if diario["spend"].sum() > 0 else 0.0

# threshold default = 20% (V2 amplia o conceito de "agressivo")
agressivos = diario[diario["delta_pct"] > DEFAULT_AGGRESSIVE_THRESHOLD]
n_dias_agressivos = int(len(agressivos))
roas_agressivo = float(agressivos["roas"].mean()) if len(agressivos) else 0.0

# normal = -5 < delta < 5 (estavel)
normais = diario[(diario["delta_pct"] > -5) & (diario["delta_pct"] < 5)]
roas_normal = float(normais["roas"].mean()) if len(normais) else 0.0
degradacao_pct = ((roas_agressivo - roas_normal) / roas_normal * 100) if roas_normal else 0.0

# === Tempo de recovery: apos dia agressivo, qts dias pra ROAS voltar ao baseline ===
# baseline = roas_normal (medio dos dias estaveis)
baseline_roas = roas_normal if roas_normal > 0 else roas_global
recovery_times = []
recovery_curves = []  # pra mini-line: media de ROAS nos dias +1..+7 apos agressivo

# pre-indexa diario por position
diario_arr = diario.to_dict("records")
n_obs = len(diario_arr)

for i, row in enumerate(diario_arr):
    if row["delta_pct"] <= DEFAULT_AGGRESSIVE_THRESHOLD:
        continue
    # procura recovery
    recov = None
    for j in range(i + 1, min(i + 15, n_obs)):
        if diario_arr[j]["roas"] >= baseline_roas * 0.95:
            recov = j - i
            break
    if recov is not None:
        recovery_times.append(recov)
    # curva: roas nos proximos 7 dias relativo ao baseline
    curve = [row["roas"] / baseline_roas if baseline_roas > 0 else None]
    for k in range(1, 8):
        if i + k < n_obs:
            r_next = diario_arr[i + k]["roas"]
            curve.append(r_next / baseline_roas if baseline_roas > 0 else None)
        else:
            curve.append(None)
    recovery_curves.append(curve)

recovery_medio = float(np.mean(recovery_times)) if recovery_times else None
# media das curvas (ignora None)
recovery_curve_avg = []
for k in range(8):
    vals = [c[k] for c in recovery_curves if c[k] is not None and np.isfinite(c[k])]
    recovery_curve_avg.append({
        "dia_relativo": k,
        "roas_normalizado": float(np.mean(vals)) if vals else None,
        "n": int(len(vals)),
    })

# === Recomendacao limite (V2 - regressao isotonica simples) ===
# Bins fixos + acha onde ROAS comeca a cair > 5%
bins_def = [(-100, -20), (-20, -5), (-5, 5), (5, 20), (20, 50), (50, 100), (100, 1e9)]
labels_def = [
    "Queda >20%",
    "Queda 5-20%",
    "Estavel (-5..+5)",
    "Aumento 5-20%",
    "Aumento 20-50%",
    "Aumento 50-100%",
    "Aumento >100%",
]
faixas = []
for (lo, hi), lab in zip(bins_def, labels_def):
    sub = diario[(diario["delta_pct"] > lo) & (diario["delta_pct"] <= hi)]
    if len(sub) < 2:
        faixas.append({
            "faixa": lab, "lo": lo, "hi": hi,
            "n": int(len(sub)),
            "roas_medio": None, "vs_baseline_pct": None,
            "novos_medio": float(sub["novos"].mean()) if len(sub) else None,
            "cac_medio": None,
        })
        continue
    roas_m = float(sub["roas"].mean())
    vs = ((roas_m - baseline_roas) / baseline_roas * 100) if baseline_roas else None
    cac_vals = sub["cac"].replace([np.inf, -np.inf], np.nan).dropna()
    faixas.append({
        "faixa": lab, "lo": lo, "hi": hi,
        "n": int(len(sub)),
        "roas_medio": roas_m,
        "vs_baseline_pct": vs,
        "novos_medio": float(sub["novos"].mean()),
        "cac_medio": float(cac_vals.mean()) if len(cac_vals) else None,
    })

limite_recomendado = None
for f in faixas:
    if f["roas_medio"] is None or f["lo"] < 0:
        continue
    if f["vs_baseline_pct"] is not None and f["vs_baseline_pct"] >= -5:
        limite_recomendado = f["hi"]
    else:
        break

# === KPIs consolidados ===
kpis = {
    "delta_pct_medio": delta_mean,
    "delta_pct_mediano": delta_median,
    "delta_pct_std": delta_std,
    "n_dias_agressivos": n_dias_agressivos,
    "threshold_agressivo_default": DEFAULT_AGGRESSIVE_THRESHOLD,
    "roas_global": roas_global,
    "roas_em_dias_agressivos": roas_agressivo,
    "roas_em_dias_normais": roas_normal,
    "roas_degradacao_pct": degradacao_pct,
    "recovery_medio_dias": recovery_medio,
    "limite_pct_sugerido": limite_recomendado,
    "n_dias_observados": int(len(diario)),
    "periodo_de": diario["day"].min().strftime("%Y-%m-%d") if len(diario) else None,
    "periodo_ate": diario["day"].max().strftime("%Y-%m-%d") if len(diario) else None,
}

# === Serie diaria completa (V2: ultimos 90 dias com TODOS os campos) ===
serie = diario.tail(90).copy()
serie_diaria_completa = [
    {
        "dia": r["day"].strftime("%Y-%m-%d"),
        "budget": float(r["spend"]),
        "delta_pct": float(r["delta_pct"]),
        "roas": float(r["roas"]),
        "cac": float(r["cac"]) if pd.notna(r["cac"]) and np.isfinite(r["cac"]) else None,
        "novos_clientes": int(r["novos"]),
        "receita": float(r["receita"]),
        "regiao_dominante": str(r["regiao_dominante"]),
    }
    for _, r in serie.iterrows()
]

# === Ano completo serie (smooth 7d) ===
serie_full = diario.copy()
serie_full["roas_smooth7"] = serie_full["roas"].rolling(7, min_periods=1).mean()
serie_full["budget_smooth7"] = serie_full["spend"].rolling(7, min_periods=1).mean()
ano_completo_serie = [
    {
        "dia": r["day"].strftime("%Y-%m-%d"),
        "budget": float(r["spend"]),
        "budget_smooth": float(r["budget_smooth7"]),
        "roas": float(r["roas"]),
        "roas_smooth": float(r["roas_smooth7"]),
    }
    for _, r in serie_full.iterrows()
]

# === Dispersao aumento x roas (todos os dias + regressao) ===
disp_points = [
    {"delta_pct": float(r["delta_pct"]), "roas": float(r["roas"])}
    for _, r in diario.iterrows()
]
# regressao linear OLS simples
x = diario["delta_pct"].values
y = diario["roas"].values
if len(x) >= 3:
    slope, intercept = np.polyfit(x, y, 1)
    # R^2
    y_pred = slope * x + intercept
    ss_res = float(np.sum((y - y_pred) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else None
    r_pearson = float(np.corrcoef(x, y)[0, 1])
    p_global = _approx_p_value(r_pearson, len(x))
else:
    slope = intercept = r_squared = r_pearson = p_global = None

dispersao_aumento_x_roas = {
    "points": disp_points,
    "regressao": {
        "slope": float(slope) if slope is not None else None,
        "intercept": float(intercept) if intercept is not None else None,
        "r_squared": float(r_squared) if r_squared is not None else None,
        "r_pearson": r_pearson,
        "p_value": p_global,
        "x_min": float(x.min()) if len(x) else None,
        "x_max": float(x.max()) if len(x) else None,
    },
    "n_pontos": int(len(disp_points)),
}

# === Eventos: top 30 dias com maior aumento ===
eventos = diario.nlargest(30, "delta_pct")[
    ["day", "spend", "spend_prev", "delta_pct", "roas", "receita", "novos"]
]
eventos_agressividade = []
# tambem precisamos drill: ROAS nos +1..+7 dias relativos
diario_by_day = {r["day"]: i for i, r in enumerate(diario_arr)}
for _, r in eventos.iterrows():
    day = r["day"]
    idx0 = diario_by_day.get(day)
    drill = []
    if idx0 is not None:
        for k in range(1, 8):
            if idx0 + k < n_obs:
                drill.append({
                    "dia_relativo": k,
                    "dia": diario_arr[idx0 + k]["day"].strftime("%Y-%m-%d"),
                    "roas": float(diario_arr[idx0 + k]["roas"]),
                    "delta_pct": float(diario_arr[idx0 + k]["delta_pct"]),
                })
            else:
                drill.append({
                    "dia_relativo": k, "dia": None,
                    "roas": None, "delta_pct": None,
                })
    eventos_agressividade.append({
        "dia": day.strftime("%Y-%m-%d"),
        "spend": float(r["spend"]),
        "spend_anterior": float(r["spend_prev"]) if pd.notna(r["spend_prev"]) else None,
        "delta_pct": float(r["delta_pct"]),
        "roas": float(r["roas"]),
        "receita": float(r["receita"]),
        "novos": int(r["novos"]),
        "drill_recovery": drill,
    })

# === Correlacao por estado (V2: TODOS os estados, nao so top 15) ===
ads_uf = ads_recent[ads_recent["uf"].notna()].copy()
ads_uf_d = ads_uf.groupby(["uf", "Day"])["spend"].sum().reset_index()
ads_uf_d.columns = ["uf", "day", "spend"]
ads_uf_d["dow"] = ads_uf_d["day"].dt.dayofweek
ads_uf_d = ads_uf_d[ads_uf_d["dow"] < 5].drop(columns="dow")

df_uf = df[df["data_pedido"] >= CAMPAIGN_START].copy()
df_uf["data_dia"] = df_uf["data_pedido"].dt.normalize()
rev_uf_d = df_uf.groupby(["cliente_uf", "data_dia"])["valor_rateado"].sum().reset_index()
rev_uf_d.columns = ["uf", "day", "receita"]

merged_uf = ads_uf_d.merge(rev_uf_d, on=["uf", "day"], how="left")
merged_uf["receita"] = merged_uf["receita"].fillna(0)
merged_uf = merged_uf.sort_values(["uf", "day"])
merged_uf["spend_prev"] = merged_uf.groupby("uf")["spend"].shift(1)
merged_uf["delta_pct"] = (merged_uf["spend"] / merged_uf["spend_prev"] - 1) * 100
merged_uf["roas"] = merged_uf["receita"] / merged_uf["spend"].replace(0, np.nan)
merged_uf = merged_uf.dropna(subset=["delta_pct", "roas"])
merged_uf = merged_uf[np.isfinite(merged_uf["roas"])]

correlacao_por_estado = []
for uf, sub in merged_uf.groupby("uf"):
    if len(sub) < 5:
        continue
    try:
        r = float(sub["delta_pct"].corr(sub["roas"]))
    except Exception:
        continue
    if r is None or not np.isfinite(r):
        continue
    p = _approx_p_value(r, len(sub))
    correlacao_por_estado.append({
        "uf": uf,
        "correlacao_aumento_x_roas": r,
        "sample_size": int(len(sub)),
        "p_value": p,
        "significativo": bool(p is not None and p < 0.10),
        "roas_medio": float(sub["roas"].mean()),
        "spend_total": float(sub["spend"].sum()),
        "delta_medio": float(sub["delta_pct"].mean()),
    })
# ordena por |corr| decrescente
correlacao_por_estado.sort(key=lambda x: -abs(x["correlacao_aumento_x_roas"]))

# === Heatmap dia x UF (V2 nova) ===
# matriz: ultimos 30 dias uteis x top 10 UFs por gasto
top_ufs_for_heat = (
    merged_uf.groupby("uf")["spend"].sum().nlargest(10).index.tolist()
)
recent_days = sorted(diario["day"].tail(30).tolist())
heatmap_dia_uf = {
    "dias": [d.strftime("%Y-%m-%d") for d in recent_days],
    "ufs": top_ufs_for_heat,
    "matriz": [],
}
# pra cada UF, pra cada dia: delta ROAS vs roas_medio_uf
for uf in top_ufs_for_heat:
    sub_uf = merged_uf[merged_uf["uf"] == uf].copy()
    if sub_uf.empty:
        heatmap_dia_uf["matriz"].append({"uf": uf, "celulas": [None] * len(recent_days)})
        continue
    roas_med_uf = float(sub_uf["roas"].mean())
    sub_idx = sub_uf.set_index("day")
    row = []
    for d in recent_days:
        if d in sub_idx.index:
            r = sub_idx.loc[d]
            roas_val = r["roas"] if not isinstance(r, pd.DataFrame) else r["roas"].iloc[0]
            delta_pct_val = r["delta_pct"] if not isinstance(r, pd.DataFrame) else r["delta_pct"].iloc[0]
            vs = ((roas_val - roas_med_uf) / roas_med_uf * 100) if roas_med_uf > 0 else None
            row.append({
                "vs_pct": float(vs) if vs is not None else None,
                "delta_pct": float(delta_pct_val),
                "roas": float(roas_val),
            })
        else:
            row.append(None)
    heatmap_dia_uf["matriz"].append({"uf": uf, "celulas": row})

# === Per-day flat data pra reactivity de slider client-side ===
# armazena delta_pct + roas + dia (subset essencial pra recompute)
todos_dias_reactive = [
    {
        "dia": r["day"].strftime("%Y-%m-%d"),
        "delta_pct": float(r["delta_pct"]),
        "roas": float(r["roas"]),
        "novos": int(r["novos"]),
        "spend": float(r["spend"]),
        "uf_dom": str(r["regiao_dominante"]),
    }
    for _, r in diario.iterrows()
]

# === Recomendacao final ===
recomendacao_limite = {
    "limite_pct_sugerido": limite_recomendado,
    "racional": (
        f"Em faixas ate {limite_recomendado}% de aumento dia-a-dia o ROAS se mantem "
        f"acima de 95% do baseline ({baseline_roas:.2f}x). Acima disso comeca a degradacao. "
        f"Recovery medio apos dia agressivo (>{DEFAULT_AGGRESSIVE_THRESHOLD:.0f}%): "
        f"{recovery_medio:.1f} dias uteis pra voltar ao baseline."
        if limite_recomendado is not None and recovery_medio is not None
        else "Sem evidencia estatistica clara de limite — amostra pequena."
    ),
    "roas_baseline": baseline_roas,
}

# === Output ===
data = {
    "kpis": kpis,
    "serie_diaria_completa": serie_diaria_completa,
    "ano_completo_serie": ano_completo_serie,
    "dispersao_aumento_x_roas": dispersao_aumento_x_roas,
    "eventos_agressividade": eventos_agressividade,
    "correlacao_por_estado": correlacao_por_estado,
    "heatmap_dia_uf": heatmap_dia_uf,
    "faixas_aumento": faixas,
    "recomendacao_limite": recomendacao_limite,
    "recovery_curve": recovery_curve_avg,
    "todos_dias_reactive": todos_dias_reactive,
    # backwards compat: mantem campos antigos pra fallback
    "serie_diaria_budget_vs_roas": [
        {
            "dia": r["dia"], "budget": r["budget"],
            "delta_pct_vs_anterior": r["delta_pct"], "roas": r["roas"],
            "receita": r["receita"],
        }
        for r in serie_diaria_completa
    ],
    "correlacao_estado": correlacao_por_estado[:15],
    "recomendacao_taxa_maxima": {
        "limite_pct_sugerido": limite_recomendado,
        "racional": recomendacao_limite["racional"],
        "roas_baseline": baseline_roas,
        "faixas": faixas,
    },
    "meta": {
        "campaign_start": CAMPAIGN_START.strftime("%Y-%m-%d"),
        "fonte": "vendas_tiny_bu.parquet + astro_ads.xlsx",
        "fim_de_semana_excluido": True,
        "outliers_excluidos": "spend < mu - 3*sigma",
        "threshold_default_pct": DEFAULT_AGGRESSIVE_THRESHOLD,
        "versao": "V2",
    },
}

OUT.write_text(
    f"window.AGR_DATA = {json.dumps(data, ensure_ascii=False, default=str)};\n",
    encoding="utf-8",
)
print(f"OK agressividade-data.js V2 gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  Dias observados: {kpis['n_dias_observados']} | Delta medio: {delta_mean:+.2f}% | std: {delta_std:.1f}%")
print(f"  ROAS normal: {roas_normal:.2f} | ROAS agressivo (>{DEFAULT_AGGRESSIVE_THRESHOLD:.0f}%): {roas_agressivo:.2f} | Degradacao: {degradacao_pct:+.1f}%")
print(f"  Recovery medio: {recovery_medio:.1f} dias" if recovery_medio else "  Recovery: sem dados")
print(f"  Recomendacao: ate {limite_recomendado}% de aumento dia-a-dia" if limite_recomendado else "  Recomendacao: amostra insuficiente")
print(f"  Correlacao por estado: {len(correlacao_por_estado)} UFs com >=5 obs")
print(f"  Regressao global: slope={slope:.4f}, R^2={r_squared:.3f}, r={r_pearson:.3f}, p={p_global:.2e}" if slope is not None else "  Regressao: insuficiente")
