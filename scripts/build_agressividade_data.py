"""Le vendas_tiny_bu.parquet + astro_ads.xlsx -> agressividade-data.js.

Tese (espelha pages/6_Agressividade.py do astro-giro-bi):
aumentos bruscos de verba travam o Google Ads e derrubam performance.

Aqui medimos a TESE no nivel global (sem segmentar por marca/estado pro
serial diario): dia-a-dia o que acontece com ROAS quando a verba sobe?

Saida: window.AGR_DATA = {
  kpis,
  serie_diaria_budget_vs_roas,  # ultimos 90d
  correlacao_estado,            # top 15 UFs
  eventos_agressividade,        # top 20 dias com maior delta_pct
  recomendacao_taxa_maxima,
  meta,
}

Filtros padrao do astro-giro-bi:
- exclui sabados/domingos
- desde 2026-03-01 (campanha rodando)
- remove outliers (spend > 3 desvios)
"""
from __future__ import annotations

import json
import pathlib
import re

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
# valor_rateado por dia (todo o pedido, sem filtrar PMax — campanhas geram demanda global).
df_rev = df[df["data_pedido"] >= CAMPAIGN_START].copy()
df_rev["data_dia"] = df_rev["data_pedido"].dt.normalize()
receita_diaria = df_rev.groupby("data_dia")["valor_rateado"].sum().reset_index()
receita_diaria.columns = ["day", "receita"]

# === Spend diario global ===
ads_recent = ads[ads["Day"] >= CAMPAIGN_START].copy()
spend_diaria = ads_recent.groupby("Day")["spend"].sum().reset_index()
spend_diaria.columns = ["day", "spend"]

# === Merge ===
diario = spend_diaria.merge(receita_diaria, on="day", how="left")
diario["receita"] = diario["receita"].fillna(0)

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
diario = diario.dropna(subset=["delta_pct", "roas"])
diario = diario[np.isfinite(diario["roas"])]

# === KPIs ===
delta_mean = float(diario["delta_pct"].mean())
delta_median = float(diario["delta_pct"].median())
roas_global = float(diario["receita"].sum() / diario["spend"].sum()) if diario["spend"].sum() > 0 else 0.0

# dias agressivos = delta > 50%
agressivos = diario[diario["delta_pct"] > 50]
n_dias_agressivos = int(len(agressivos))
roas_agressivo = float(agressivos["roas"].mean()) if len(agressivos) else 0.0

# normal = -10 < delta < 10 (estavel)
normais = diario[(diario["delta_pct"] > -10) & (diario["delta_pct"] < 10)]
roas_normal = float(normais["roas"].mean()) if len(normais) else 0.0
degradacao_pct = ((roas_agressivo - roas_normal) / roas_normal * 100) if roas_normal else 0.0

kpis = {
    "delta_pct_medio": delta_mean,
    "delta_pct_mediano": delta_median,
    "n_dias_agressivos": n_dias_agressivos,
    "roas_global": roas_global,
    "roas_em_dias_agressivos": roas_agressivo,
    "roas_em_dias_normais": roas_normal,
    "roas_degradacao_pct": degradacao_pct,
    "n_dias_observados": int(len(diario)),
    "periodo_de": diario["day"].min().strftime("%Y-%m-%d") if len(diario) else None,
    "periodo_ate": diario["day"].max().strftime("%Y-%m-%d") if len(diario) else None,
}

# === Serie diaria ultimos 90d ===
serie = diario.tail(90).copy()
serie_diaria = [
    {
        "dia": r["day"].strftime("%Y-%m-%d"),
        "budget": float(r["spend"]),
        "delta_pct_vs_anterior": float(r["delta_pct"]),
        "roas": float(r["roas"]),
        "receita": float(r["receita"]),
    }
    for _, r in serie.iterrows()
]

# === Correlacao por estado ===
# por dia x UF: spend, novos clientes, receita
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

correlacao_estado = []
for uf, sub in merged_uf.groupby("uf"):
    if len(sub) < 8:
        continue
    try:
        r = float(sub["delta_pct"].corr(sub["roas"]))
    except Exception:
        r = None
    if r is None or not np.isfinite(r):
        continue
    correlacao_estado.append({
        "uf": uf,
        "correlacao_aumento_x_roas": r,
        "sample_size": int(len(sub)),
        "roas_medio": float(sub["roas"].mean()),
        "spend_total": float(sub["spend"].sum()),
    })
# pega top 15 por volume gasto
correlacao_estado.sort(key=lambda x: -x["spend_total"])
correlacao_estado = correlacao_estado[:15]

# === Eventos agressividade: top 20 dias com maior aumento ===
eventos = diario.nlargest(20, "delta_pct")[["day", "spend", "spend_prev", "delta_pct", "roas", "receita"]]
eventos_agressividade = [
    {
        "dia": r["day"].strftime("%Y-%m-%d"),
        "spend": float(r["spend"]),
        "spend_anterior": float(r["spend_prev"]) if pd.notna(r["spend_prev"]) else None,
        "delta_pct": float(r["delta_pct"]),
        "roas": float(r["roas"]),
        "receita": float(r["receita"]),
    }
    for _, r in eventos.iterrows()
]

# === Recomendacao taxa maxima ===
# Bins de delta: pra cada bin, calcula ROAS medio. Acha onde ROAS cai abaixo
# de 95% do ROAS em dias estaveis.
bins = [(-100, -20), (-20, -5), (-5, 5), (5, 20), (20, 50), (50, 100), (100, 1e9)]
labels = ["Queda >20%", "Queda 5-20%", "Estavel", "Aumento 5-20%", "Aumento 20-50%", "Aumento 50-100%", "Aumento >100%"]
faixas = []
roas_baseline = roas_normal if roas_normal else roas_global
for (lo, hi), lab in zip(bins, labels):
    sub = diario[(diario["delta_pct"] > lo) & (diario["delta_pct"] <= hi)]
    if len(sub) < 2:
        faixas.append({"faixa": lab, "lo": lo, "hi": hi, "n": int(len(sub)), "roas_medio": None, "vs_baseline_pct": None})
        continue
    roas_m = float(sub["roas"].mean())
    vs = ((roas_m - roas_baseline) / roas_baseline * 100) if roas_baseline else None
    faixas.append({
        "faixa": lab, "lo": lo, "hi": hi,
        "n": int(len(sub)),
        "roas_medio": roas_m,
        "vs_baseline_pct": vs,
    })

# recomendacao: ultima faixa de aumento que mantem >= 95% do baseline
limite_recomendado = None
for f in faixas:
    if f["roas_medio"] is None or f["lo"] < 0:
        continue
    if f["vs_baseline_pct"] is not None and f["vs_baseline_pct"] >= -5:
        limite_recomendado = f["hi"]
    else:
        break

recomendacao_taxa_maxima = {
    "limite_pct_sugerido": limite_recomendado,
    "racional": (
        f"Em faixas ate {limite_recomendado}% de aumento dia-a-dia o ROAS se mantem "
        f"acima de 95% do baseline ({roas_baseline:.2f}). Acima disso ha degradacao."
        if limite_recomendado is not None
        else "Sem evidencia estatistica clara de limite — amostra pequena."
    ),
    "roas_baseline": roas_baseline,
    "faixas": faixas,
}

# === Output ===
data = {
    "kpis": kpis,
    "serie_diaria_budget_vs_roas": serie_diaria,
    "correlacao_estado": correlacao_estado,
    "eventos_agressividade": eventos_agressividade,
    "recomendacao_taxa_maxima": recomendacao_taxa_maxima,
    "meta": {
        "campaign_start": CAMPAIGN_START.strftime("%Y-%m-%d"),
        "fonte": "vendas_tiny_bu.parquet + astro_ads.xlsx",
        "fim_de_semana_excluido": True,
        "outliers_excluidos": "spend < mu - 3*sigma",
    },
}

OUT.write_text(
    f"window.AGR_DATA = {json.dumps(data, ensure_ascii=False, default=str)};\n",
    encoding="utf-8",
)
print(f"OK agressividade-data.js gerado em {OUT} ({OUT.stat().st_size} bytes)")
print(f"  Dias observados: {kpis['n_dias_observados']} | Delta medio: {delta_mean:+.2f}%")
print(f"  ROAS normal: {roas_normal:.2f} | ROAS agressivo (>50%): {roas_agressivo:.2f} | Degradacao: {degradacao_pct:+.1f}%")
print(f"  Dias agressivos (>50%): {n_dias_agressivos}")
print(f"  Recomendacao: ate {limite_recomendado}% de aumento dia-a-dia" if limite_recomendado else "  Recomendacao: amostra insuficiente")
