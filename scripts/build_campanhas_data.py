"""V2 PROFUNDA — build_campanhas_data.py

Le vendas_tiny_bu.parquet (DuckDB) + astro_ads.xlsx (pandas/openpyxl).
Gera C:/Projects/astro-bi-web/campanhas-data.js com window.CAMPANHAS_DATA = {...}.

V2 adiciona:
  - kpis (gasto, receita_novos, ROAS, CAC, ROAS LTV, gasto_medio_mensal)
  - gasto_mensal_18m (serie + correlacao com novos)
  - gasto_vs_novos_pareados (18m pares: gasto, novos, receita, conversao)
  - roas_por_estado (TODOS 27 UFs)
  - roas_por_marca (top 30)
  - regressao_gasto_x_novos (slope, intercept, R2, p-value)
  - anova_por_estado (F, p-value)
  - correlacao_gasto_x_receita (Pearson + Spearman)
  - tendencia_pf_pj (% mensal 18m)
  - pico_jan_26 (analise do mes anomalo)
  - scatter_eficiencia (UF × gasto_per_capita × ROAS × novos)
  - dispersao_marca_x_roas (top 20 scatter)
  - clientes_por_canal (Pmax/Search/etc)

Fontes (NAO modificar):
  - C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet
  - C:/Projects/astro-giro-bi/data/astro_ads.xlsx
"""
import json
import pathlib
import re
import math

import duckdb
import numpy as np
import pandas as pd
from scipy.stats import linregress, pearsonr, spearmanr, f_oneway

# ===== PATHS =====
ROOT = pathlib.Path(__file__).parent.parent
SRC_DIR = pathlib.Path("C:/Projects/astro-giro-bi/data")
PARQUET = SRC_DIR / "vendas_tiny_bu.parquet"
ADS_XLSX = SRC_DIR / "astro_ads.xlsx"
OUT = ROOT / "campanhas-data.js"

if not PARQUET.exists():
    raise SystemExit(f"parquet nao encontrado: {PARQUET}")
if not ADS_XLSX.exists():
    raise SystemExit(f"xlsx nao encontrado: {ADS_XLSX}")

# ===== CONSTANTS =====
STATE_MAP = {
    'State of Acre': 'AC', 'State of Alagoas': 'AL', 'State of Amapa': 'AP',
    'State of Amazonas': 'AM', 'State of Bahia': 'BA', 'Ceara': 'CE',
    'Federal District': 'DF', 'State of Espirito Santo': 'ES', 'State of Goias': 'GO',
    'State of Maranhao': 'MA', 'State of Mato Grosso': 'MT',
    'State of Mato Grosso do Sul': 'MS', 'State of Minas Gerais': 'MG',
    'State of Para': 'PA', 'State of Paraiba': 'PB', 'State of Parana': 'PR',
    'State of Pernambuco': 'PE', 'State of Piaui': 'PI',
    'State of Rio de Janeiro': 'RJ', 'State of Rio Grande do Norte': 'RN',
    'State of Rio Grande do Sul': 'RS', 'State of Rondonia': 'RO',
    'State of Roraima': 'RR', 'State of Santa Catarina': 'SC',
    'State of Sao Paulo': 'SP', 'State of Sergipe': 'SE', 'State of Tocantins': 'TO',
}

# Populacao estimada por UF (IBGE 2022) — para gasto_per_capita
UF_POP_2022 = {
    'AC': 906876, 'AL': 3127683, 'AM': 3941613, 'AP': 733759, 'BA': 14141626,
    'CE': 8794957, 'DF': 2817381, 'ES': 3833712, 'GO': 7056495, 'MA': 6776699,
    'MG': 20538718, 'MS': 2757013, 'MT': 3658649, 'PA': 8120131, 'PB': 3974687,
    'PE': 9058931, 'PI': 3271199, 'PR': 11444380, 'RJ': 16054524, 'RN': 3303953,
    'RO': 1581196, 'RR': 636303, 'RS': 10882965, 'SC': 7610361, 'SE': 2210004,
    'SP': 44411238, 'TO': 1511460,
}

MARCA_NORMALIZE = {
    "3M": "3M", "Biosolvit": "Biosolvit", "Bracol": "Bracol", "Camper": "Camper",
    "Cartom": "Cartom", "Danny": "Danny", "Delta Plus": "Delta Plus",
    "Fujiwara": "Fujiwara", "Imbat": "Imbat", "Innpro": "Innpro",
    "Kadesh": "Kadesh", "Kalipso": "Kalipso", "MG Cinto": "MG Cinto",
    "Maicol": "Maicol", "Marluvas": "Marluvas", "Medix": "Medix",
    "Nutriex": "Nutriex", "Soft Work": "Soft Works", "SuperSafety": "Super Safety",
    "Volk": "Volk",
}


def _extract_marca(camp):
    if not isinstance(camp, str):
        return None
    m = re.match(r"\[Pmax\]\s*-\s*(.+)", camp)
    if m:
        return MARCA_NORMALIZE.get(m.group(1).strip())
    if "Marluvas" in camp:
        return "Marluvas"
    if "Cartom" in camp:
        return "Cartom"
    return None


def _extract_canal(camp):
    """Classifica a campanha por tipo: Pmax / Search / Display / Outros."""
    if not isinstance(camp, str):
        return "Outros"
    s = camp.lower()
    if "[pmax]" in s or "pmax" in s:
        return "Performance Max"
    if "[s]" in s or "search" in s:
        return "Search"
    if "display" in s:
        return "Display"
    if "shopping" in s:
        return "Shopping"
    if "video" in s or "youtube" in s:
        return "Video"
    return "Outros"


def _safe(v):
    if v is None:
        return 0.0
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return f
    except (TypeError, ValueError):
        return 0.0


# ===== LOAD =====
print("[1/12] carregando ads.xlsx ...")
ads = pd.read_excel(ADS_XLSX, sheet_name="Planilha1")
ads["Day"] = pd.to_datetime(ads["Day"])
ads["uf"] = ads["State (Geographic)"].map(STATE_MAP)
ads["marca"] = ads["Campaign Name"].apply(_extract_marca)
ads["canal"] = ads["Campaign Name"].apply(_extract_canal)
ads["spend"] = pd.to_numeric(ads["Cost (Spend)"], errors="coerce").fillna(0)
ads["clicks"] = pd.to_numeric(ads["Clicks"], errors="coerce").fillna(0)
ads["impressions"] = pd.to_numeric(ads["Impressions"], errors="coerce").fillna(0)
ads["conversions"] = pd.to_numeric(ads["Conversions"], errors="coerce").fillna(0)
print(f"     ads rows={len(ads)} spend_total={ads['spend'].sum():.2f}")

ADS_MAX_DAY = ads["Day"].max()
ADS_MIN_DAY = ads["Day"].min()

print("[2/12] abrindo parquet via duckdb ...")
con = duckdb.connect()
con.execute(
    f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET.as_posix()}') "
    f"WHERE situacao != 'Cancelado'"
)


def q(sql):
    return con.execute(sql).fetchdf()


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r and r[0] is not None else 0


# ===== JANELAS =====
VENDAS_MAX = pd.Timestamp(q1("SELECT MAX(data_pedido) FROM v"))
REF_END = min(ADS_MAX_DAY, VENDAS_MAX)
REF_START_12M = REF_END - pd.Timedelta(days=365)
REF_START_18M = (REF_END - pd.Timedelta(days=550)).replace(day=1)
REF_START_6M = REF_END - pd.Timedelta(days=180)
REF_START_3M = REF_END - pd.Timedelta(days=90)
REF_START_90D = REF_END - pd.Timedelta(days=90)
print(f"     janela ref 12m: {REF_START_12M.date()} .. {REF_END.date()}")
print(f"     janela ref 18m: {REF_START_18M.date()} .. {REF_END.date()}")

# ===== KPIs =====
print("[3/12] kpis ...")
gasto_12m = float(ads[(ads["Day"] >= REF_START_12M) & (ads["Day"] <= REF_END)]["spend"].sum())
gasto_3m = float(ads[(ads["Day"] >= REF_START_3M) & (ads["Day"] <= REF_END)]["spend"].sum())
gasto_6m = float(ads[(ads["Day"] >= REF_START_6M) & (ads["Day"] <= REF_END)]["spend"].sum())

novos_12m = q(f"""
  SELECT
    COUNT(DISTINCT cliente_id)::BIGINT n,
    SUM(valor_rateado)::DOUBLE rec
  FROM v
  WHERE Recompra = 'Novo'
    AND data_pedido BETWEEN '{REF_START_12M.date()}' AND '{REF_END.date()}'
""").iloc[0]
n_novos_12m = int(novos_12m["n"])
receita_novos_12m = float(novos_12m["rec"])

# LTV historico: media de receita TOTAL por cliente (todo periodo histórico)
ltv_row = q("""
  WITH client_rev AS (
    SELECT cliente_id, SUM(valor_rateado) AS receita_total
    FROM v
    GROUP BY cliente_id
  )
  SELECT AVG(receita_total)::DOUBLE AS ltv_medio,
         COUNT(*)::BIGINT AS n_clientes
  FROM client_rev
""").iloc[0]
ltv_medio = float(ltv_row["ltv_medio"])

roas_global = (receita_novos_12m / gasto_12m) if gasto_12m else 0
cac_global = (gasto_12m / n_novos_12m) if n_novos_12m else 0
roas_ltv = (ltv_medio / cac_global) if cac_global else 0  # LTV/CAC

meses_dist = ads[(ads["Day"] >= REF_START_12M) & (ads["Day"] <= REF_END)]["Day"].dt.to_period("M").nunique()
gasto_medio_mensal = gasto_12m / meses_dist if meses_dist else 0

# PF vs PJ 90d
pfpj = q(f"""
  SELECT cliente_tipo_pessoa tipo, COUNT(DISTINCT cliente_id)::BIGINT n
  FROM v
  WHERE Recompra = 'Novo'
    AND data_pedido BETWEEN '{REF_START_90D.date()}' AND '{REF_END.date()}'
    AND cliente_tipo_pessoa IN ('F','J')
  GROUP BY cliente_tipo_pessoa
""")
n_pf = int(pfpj.loc[pfpj.tipo == 'F', 'n'].sum()) if not pfpj.empty else 0
n_pj = int(pfpj.loc[pfpj.tipo == 'J', 'n'].sum()) if not pfpj.empty else 0
n_total = n_pf + n_pj
pct_pf = n_pf / n_total if n_total else 0
pct_pj = n_pj / n_total if n_total else 0

kpis = {
    "gasto_total_12m": gasto_12m,
    "gasto_total_6m": gasto_6m,
    "gasto_total_3m": gasto_3m,
    "receita_novos_12m": receita_novos_12m,
    "novos_clientes_12m": n_novos_12m,
    "roas_global": roas_global,
    "cac_global": cac_global,
    "ltv_medio": ltv_medio,
    "roas_ltv": roas_ltv,
    "gasto_medio_mensal": gasto_medio_mensal,
    "meses_periodo": int(meses_dist),
    "pct_pf_90d": pct_pf,
    "pct_pj_90d": pct_pj,
    "novos_pf_90d": n_pf,
    "novos_pj_90d": n_pj,
    "ref_start": str(REF_START_12M.date()),
    "ref_end": str(REF_END.date()),
}

# ===== SERIE MENSAL gasto Ads 18m =====
print("[4/12] serie mensal 18m + correlacao ...")
ads_18m = ads[(ads["Day"] >= REF_START_18M) & (ads["Day"] <= REF_END)].copy()
ads_18m["am"] = ads_18m["Day"].dt.to_period("M").astype(str)
gasto_mensal = (
    ads_18m.groupby("am")["spend"].sum().reset_index()
    .sort_values("am")
    .rename(columns={"spend": "valor"})
)

# novos clientes mensal
novos_mensal = q(f"""
  SELECT
    strftime(data_pedido, '%Y-%m') am,
    COUNT(DISTINCT cliente_id)::BIGINT novos_clientes,
    SUM(valor_rateado)::DOUBLE receita_novos,
    COUNT(DISTINCT numero)::BIGINT pedidos_novos
  FROM v
  WHERE Recompra = 'Novo'
    AND data_pedido BETWEEN '{REF_START_18M.date()}' AND '{REF_END.date()}'
  GROUP BY am
  ORDER BY am
""")

gvn = gasto_mensal.merge(novos_mensal, on="am", how="outer").fillna(0).sort_values("am")
gvn["conversao"] = gvn.apply(
    lambda r: (r["novos_clientes"] / r["valor"] * 1000) if r["valor"] > 0 else 0, axis=1
)
gvn["ticket_novos"] = gvn.apply(
    lambda r: (r["receita_novos"] / r["novos_clientes"]) if r["novos_clientes"] > 0 else 0, axis=1
)
gvn_list = [
    {
        "am": r.am,
        "gasto": _safe(r.valor),
        "novos_clientes": int(r.novos_clientes),
        "receita_novos": _safe(r.receita_novos),
        "pedidos_novos": int(r.pedidos_novos),
        "conversao_por_1k": _safe(r.conversao),
        "ticket_novos": _safe(r.ticket_novos),
    }
    for r in gvn.itertuples(index=False)
]

gasto_mensal_list = [{"am": r["am"], "valor": _safe(r["valor"])} for _, r in gasto_mensal.iterrows()]

# correlacao gasto x novos (mensal)
g_arr = gvn["valor"].astype(float).values
n_arr = gvn["novos_clientes"].astype(float).values
r_arr = gvn["receita_novos"].astype(float).values

corr_mensal_gn = {"pearson_r": 0.0, "pearson_p": 1.0, "spearman_r": 0.0, "spearman_p": 1.0, "n": 0}
corr_mensal_gr = {"pearson_r": 0.0, "pearson_p": 1.0, "spearman_r": 0.0, "spearman_p": 1.0, "n": 0}
if len(g_arr) >= 3 and np.std(g_arr) > 0 and np.std(n_arr) > 0:
    pr, pp = pearsonr(g_arr, n_arr)
    sr, sp = spearmanr(g_arr, n_arr)
    corr_mensal_gn = {"pearson_r": _safe(pr), "pearson_p": _safe(pp), "spearman_r": _safe(sr), "spearman_p": _safe(sp), "n": int(len(g_arr))}
if len(g_arr) >= 3 and np.std(g_arr) > 0 and np.std(r_arr) > 0:
    pr2, pp2 = pearsonr(g_arr, r_arr)
    sr2, sp2 = spearmanr(g_arr, r_arr)
    corr_mensal_gr = {"pearson_r": _safe(pr2), "pearson_p": _safe(pp2), "spearman_r": _safe(sr2), "spearman_p": _safe(sp2), "n": int(len(g_arr))}

# ===== REGRESSAO LINEAR (mensal) =====
print("[5/12] regressao linear mensal ...")
regressao = {"n": 0, "slope": 0, "intercept": 0, "r_squared": 0, "p_value": 1, "stderr": 0,
             "novos_por_1k": 0, "significativo": False, "interpretacao": ""}
if len(g_arr) >= 3 and np.std(g_arr) > 0:
    slope, intercept, r, p, se = linregress(g_arr, n_arr)
    sig = bool(p < 0.05)
    interp = ""
    if sig and slope > 0:
        interp = f"Cada R$ 1.000 a mais em ads gera ~{slope*1000:.1f} novos clientes (p={p:.3f})."
    elif sig and slope < 0:
        interp = f"Relação inversa significativa — algo está saturado (p={p:.3f})."
    else:
        interp = f"Sem efeito significativo de gasto em novos clientes neste recorte (p={p:.3f})."
    regressao = {
        "n": int(len(g_arr)),
        "slope": _safe(slope),
        "intercept": _safe(intercept),
        "r_squared": _safe(r ** 2),
        "p_value": _safe(p),
        "stderr": _safe(se),
        "novos_por_1k": _safe(slope * 1000),
        "significativo": sig,
        "interpretacao": interp,
    }

# ===== REGRESSAO DIARIA (todo historico, max poder estatistico) =====
print("[6/12] regressao diaria (todo historico) ...")
# Novos diarios
novos_diario = q("""
  SELECT
    CAST(data_pedido AS DATE) dia,
    COUNT(DISTINCT cliente_id)::BIGINT n_novos,
    SUM(valor_rateado)::DOUBLE receita_novos
  FROM v
  WHERE Recompra = 'Novo'
  GROUP BY dia
""")
gasto_diario = ads.groupby(ads["Day"].dt.date)["spend"].sum().reset_index()
gasto_diario.columns = ["dia", "spend"]
gasto_diario["dia"] = pd.to_datetime(gasto_diario["dia"])
novos_diario["dia"] = pd.to_datetime(novos_diario["dia"])
diario = gasto_diario.merge(novos_diario, on="dia", how="inner")

regressao_diaria = {"n": 0, "slope": 0, "intercept": 0, "r_squared": 0, "p_value": 1,
                    "pearson_r": 0, "pearson_p": 1, "spearman_r": 0, "spearman_p": 1,
                    "novos_por_1k": 0, "significativo": False, "interpretacao": ""}
if len(diario) >= 15 and np.std(diario["spend"]) > 0:
    x = diario["spend"].values
    y = diario["n_novos"].values
    slope_d, intercept_d, r_d, p_d, se_d = linregress(x, y)
    pr_d, pp_d = pearsonr(x, y)
    sr_d, sp_d = spearmanr(x, y)
    sig_d = bool(p_d < 0.05)
    interp_d = ""
    if sig_d and slope_d > 0:
        interp_d = f"Cada R$ 1.000 diário em ads gera ~{slope_d*1000:.1f} novos clientes (R²={r_d**2:.3f}, p<{0.05 if p_d<0.05 else p_d:.3f})."
    else:
        interp_d = f"Sem relação significativa diária (R²={r_d**2:.3f}, p={p_d:.3f})."
    regressao_diaria = {
        "n": int(len(diario)),
        "slope": _safe(slope_d),
        "intercept": _safe(intercept_d),
        "r_squared": _safe(r_d ** 2),
        "p_value": _safe(p_d),
        "stderr": _safe(se_d),
        "pearson_r": _safe(pr_d),
        "pearson_p": _safe(pp_d),
        "spearman_r": _safe(sr_d),
        "spearman_p": _safe(sp_d),
        "novos_por_1k": _safe(slope_d * 1000),
        "significativo": sig_d,
        "interpretacao": interp_d,
    }

# ===== SCATTER DIARIO (amostra para plot) =====
scatter_diario = []
if len(diario) > 0:
    # Amostra de até 500 pontos pra não inflar bundle
    samp = diario.sample(min(500, len(diario)), random_state=42) if len(diario) > 500 else diario
    for r in samp.itertuples(index=False):
        scatter_diario.append({
            "x": _safe(r.spend),
            "y": int(r.n_novos),
            "dia": r.dia.strftime("%Y-%m-%d"),
        })

# ===== ROAS por estado (TODOS 27 UFs) =====
print("[7/12] roas_por_estado (TODOS 27) ...")
ads_uf_12m = (
    ads[(ads["Day"] >= REF_START_12M) & (ads["Day"] <= REF_END) & ads["uf"].notna()]
    .groupby("uf")["spend"].sum().reset_index()
    .rename(columns={"spend": "gasto_estimado_uf"})
)

novos_uf_12m = q(f"""
  SELECT
    cliente_uf uf,
    COUNT(DISTINCT cliente_id)::BIGINT novos_uf,
    SUM(valor_rateado)::DOUBLE receita_novos_uf
  FROM v
  WHERE Recompra = 'Novo'
    AND cliente_uf IS NOT NULL
    AND data_pedido BETWEEN '{REF_START_12M.date()}' AND '{REF_END.date()}'
  GROUP BY cliente_uf
""")

# UNION de todos os 27 estados + agregados
all_ufs = pd.DataFrame({"uf": list(STATE_MAP.values())})
roas_uf = all_ufs.merge(ads_uf_12m, on="uf", how="left").merge(novos_uf_12m, on="uf", how="left").fillna(0)
roas_uf["roas"] = roas_uf.apply(
    lambda r: (r["receita_novos_uf"] / r["gasto_estimado_uf"]) if r["gasto_estimado_uf"] > 0 else 0,
    axis=1,
)
roas_uf["cac"] = roas_uf.apply(
    lambda r: (r["gasto_estimado_uf"] / r["novos_uf"]) if r["novos_uf"] > 0 else 0,
    axis=1,
)
roas_uf["pop"] = roas_uf["uf"].map(UF_POP_2022).fillna(0)
roas_uf["gasto_per_capita"] = roas_uf.apply(
    lambda r: (r["gasto_estimado_uf"] / r["pop"] * 1000) if r["pop"] > 0 else 0,  # R$ por 1k habitantes
    axis=1,
)
roas_uf = roas_uf.sort_values("gasto_estimado_uf", ascending=False)

roas_estado_list = [
    {
        "uf": r.uf,
        "gasto": _safe(r.gasto_estimado_uf),
        "novos": int(r.novos_uf),
        "receita_novos": _safe(r.receita_novos_uf),
        "roas": _safe(r.roas),
        "cac": _safe(r.cac),
        "pop": int(r.pop),
        "gasto_per_capita": _safe(r.gasto_per_capita),
    }
    for r in roas_uf.itertuples(index=False)
]

# ===== ROAS por marca (top 30) =====
print("[8/12] roas_por_marca ...")
ads_marca_12m = (
    ads[(ads["Day"] >= REF_START_12M) & (ads["Day"] <= REF_END) & ads["marca"].notna()]
    .groupby("marca")["spend"].sum().reset_index()
    .rename(columns={"spend": "gasto_estimado_marca"})
)

novos_marca_12m = q(f"""
  SELECT
    marca,
    COUNT(DISTINCT cliente_id)::BIGINT novos_marca,
    SUM(valor_rateado)::DOUBLE receita_novos_marca
  FROM v
  WHERE Recompra = 'Novo'
    AND marca IS NOT NULL
    AND data_pedido BETWEEN '{REF_START_12M.date()}' AND '{REF_END.date()}'
  GROUP BY marca
""")

roas_marca = ads_marca_12m.merge(novos_marca_12m, on="marca", how="outer").fillna(0)
roas_marca["roas"] = roas_marca.apply(
    lambda r: (r["receita_novos_marca"] / r["gasto_estimado_marca"]) if r["gasto_estimado_marca"] > 0 else 0,
    axis=1,
)
roas_marca["cac"] = roas_marca.apply(
    lambda r: (r["gasto_estimado_marca"] / r["novos_marca"]) if r["novos_marca"] > 0 else 0,
    axis=1,
)
roas_marca = roas_marca.sort_values("gasto_estimado_marca", ascending=False).head(30)
roas_marca_list = [
    {
        "marca": r.marca,
        "gasto": _safe(r.gasto_estimado_marca),
        "novos": int(r.novos_marca),
        "receita_novos": _safe(r.receita_novos_marca),
        "roas": _safe(r.roas),
        "cac": _safe(r.cac),
    }
    for r in roas_marca.itertuples(index=False)
]

# ===== ANOVA por estado (faixas de gasto -> novos clientes) =====
print("[9/12] anova_por_estado ...")
# Dataset diario por UF: spend × novos
ads_uf_dia = (
    ads[(ads["Day"] >= REF_START_18M) & (ads["Day"] <= REF_END) & ads["uf"].notna()]
    .groupby(["uf", ads["Day"].dt.date.rename("dia")])["spend"].sum().reset_index()
)
ads_uf_dia["dia"] = pd.to_datetime(ads_uf_dia["dia"])

novos_uf_dia = q(f"""
  SELECT
    cliente_uf uf,
    CAST(data_pedido AS DATE) dia,
    COUNT(DISTINCT cliente_id)::BIGINT n_novos
  FROM v
  WHERE Recompra = 'Novo'
    AND cliente_uf IS NOT NULL
    AND data_pedido BETWEEN '{REF_START_18M.date()}' AND '{REF_END.date()}'
  GROUP BY cliente_uf, dia
""")
novos_uf_dia["dia"] = pd.to_datetime(novos_uf_dia["dia"])

reg_uf = ads_uf_dia.merge(novos_uf_dia, on=["uf", "dia"], how="inner")

# ANOVA: combina TODOS os estados — testa se faixas (Baixo/Medio/Alto) gerar diferentes contagens
anova_estado_list = []
anova_global = {"F": 0, "p_value": 1, "n": 0, "significativo": False, "media_baixo": 0, "media_medio": 0, "media_alto": 0, "interpretacao": ""}

if len(reg_uf) >= 30 and np.std(reg_uf["spend"]) > 0:
    try:
        tercis = pd.qcut(reg_uf["spend"], 3, labels=["Baixo", "Médio", "Alto"], duplicates="drop")
        groups = [reg_uf.loc[tercis == lbl, "n_novos"].values for lbl in ["Baixo", "Médio", "Alto"]]
        groups = [g for g in groups if len(g) >= 5]
        if len(groups) >= 2:
            f_stat, p_val = f_oneway(*groups)
            mb = float(np.mean(groups[0])) if len(groups) > 0 else 0
            mm = float(np.mean(groups[1])) if len(groups) > 1 else 0
            ma = float(np.mean(groups[2])) if len(groups) > 2 else 0
            sig = bool(p_val < 0.05)
            anova_global = {
                "F": _safe(f_stat),
                "p_value": _safe(p_val),
                "n": int(len(reg_uf)),
                "significativo": sig,
                "media_baixo": _safe(mb),
                "media_medio": _safe(mm),
                "media_alto": _safe(ma),
                "interpretacao": (
                    f"Dias de gasto Alto geram média de {ma:.1f} novos/dia vs {mb:.1f} em Baixo. "
                    f"Diferença {'SIGNIFICATIVA' if sig else 'NÃO significativa'} (F={f_stat:.2f}, p={p_val:.4f})."
                ),
            }
    except Exception as e:
        print(f"     ANOVA global falhou: {e}")

# ANOVA por estado individual (top 10 UFs por gasto)
top_ufs = roas_uf.head(15)["uf"].tolist()
for uf in top_ufs:
    sub = reg_uf[reg_uf["uf"] == uf]
    if len(sub) < 30 or np.std(sub["spend"]) == 0:
        continue
    try:
        tercis = pd.qcut(sub["spend"], 3, labels=["Baixo", "Médio", "Alto"], duplicates="drop")
        groups = [sub.loc[tercis == lbl, "n_novos"].values for lbl in ["Baixo", "Médio", "Alto"]]
        groups = [g for g in groups if len(g) >= 5]
        if len(groups) < 2:
            continue
        f_stat, p_val = f_oneway(*groups)
        anova_estado_list.append({
            "uf": uf,
            "n_obs": int(len(sub)),
            "F": _safe(f_stat),
            "p_value": _safe(p_val),
            "media_baixo": _safe(np.mean(groups[0])) if len(groups) > 0 else 0,
            "media_medio": _safe(np.mean(groups[1])) if len(groups) > 1 else 0,
            "media_alto": _safe(np.mean(groups[2])) if len(groups) > 2 else 0,
            "significativo": bool(p_val < 0.05),
        })
    except Exception:
        continue

anova_estado_list.sort(key=lambda x: x["F"], reverse=True)

# ===== TENDENCIA PF vs PJ MENSAL 18m =====
print("[10/12] tendencia PF vs PJ 18m ...")
tendencia_18m = q(f"""
  SELECT
    strftime(data_pedido, '%Y-%m') am,
    cliente_tipo_pessoa tipo,
    COUNT(DISTINCT cliente_id)::BIGINT n
  FROM v
  WHERE Recompra = 'Novo'
    AND cliente_tipo_pessoa IN ('F','J')
    AND data_pedido BETWEEN '{REF_START_18M.date()}' AND '{REF_END.date()}'
  GROUP BY am, tipo
  ORDER BY am
""")
tendencia_list = []
if not tendencia_18m.empty:
    pivot = tendencia_18m.pivot_table(index="am", columns="tipo", values="n", fill_value=0).sort_index()
    for am, row in pivot.iterrows():
        pf = int(row.get("F", 0))
        pj = int(row.get("J", 0))
        tot = pf + pj
        tendencia_list.append({
            "am": str(am),
            "pf": pf,
            "pj": pj,
            "pct_pf": (pf / tot) if tot else 0,
            "pct_pj": (pj / tot) if tot else 0,
            "total": tot,
        })

# tendencia PF vs PJ semanal 90d (mantida para granularidade fina)
tendencia_90d = q(f"""
  WITH base AS (
    SELECT
      DATE_TRUNC('week', data_pedido) wk,
      cliente_tipo_pessoa tipo,
      COUNT(DISTINCT cliente_id) n
    FROM v
    WHERE Recompra = 'Novo'
      AND cliente_tipo_pessoa IN ('F','J')
      AND data_pedido BETWEEN '{REF_START_90D.date()}' AND '{REF_END.date()}'
    GROUP BY wk, tipo
  )
  SELECT wk, tipo, n FROM base ORDER BY wk
""")
tendencia_90d_list = []
if not tendencia_90d.empty:
    pivot_w = tendencia_90d.pivot_table(index="wk", columns="tipo", values="n", fill_value=0).sort_index()
    for wk, row in pivot_w.iterrows():
        pf = int(row.get("F", 0))
        pj = int(row.get("J", 0))
        tot = pf + pj
        tendencia_90d_list.append({
            "wk": str(pd.Timestamp(wk).date()),
            "pf": pf,
            "pj": pj,
            "pct_pf": (pf / tot) if tot else 0,
            "pct_pj": (pj / tot) if tot else 0,
        })

# ===== PICO JAN/26 — analise especifica =====
print("[11/12] analise pico jan/26 ...")
# Detecta o mes com maior gasto e checa anomalia
pico_data = {"detectado": False}
if not gvn.empty:
    gvn_sorted = gvn.sort_values("valor", ascending=False)
    top_mes = gvn_sorted.iloc[0]
    mediana = float(gvn["valor"].median())
    media_outros = float(gvn[gvn["am"] != top_mes["am"]]["valor"].mean()) if len(gvn) > 1 else 0
    delta_pct = (float(top_mes["valor"]) / media_outros - 1) * 100 if media_outros > 0 else 0
    # ROAS do mes pico
    roas_pico = (float(top_mes["receita_novos"]) / float(top_mes["valor"])) if top_mes["valor"] > 0 else 0
    cac_pico = (float(top_mes["valor"]) / float(top_mes["novos_clientes"])) if top_mes["novos_clientes"] > 0 else 0
    # Compare ROAS pico vs media outros
    out = gvn[gvn["am"] != top_mes["am"]]
    roas_outros = (float(out["receita_novos"].sum()) / float(out["valor"].sum())) if out["valor"].sum() > 0 else 0
    cac_outros = (float(out["valor"].sum()) / float(out["novos_clientes"].sum())) if out["novos_clientes"].sum() > 0 else 0
    pico_data = {
        "detectado": True,
        "am": str(top_mes["am"]),
        "gasto": _safe(top_mes["valor"]),
        "novos": int(top_mes["novos_clientes"]),
        "receita_novos": _safe(top_mes["receita_novos"]),
        "roas": _safe(roas_pico),
        "cac": _safe(cac_pico),
        "delta_pct_vs_media": _safe(delta_pct),
        "mediana_outros_meses": _safe(mediana),
        "media_outros_meses": _safe(media_outros),
        "roas_outros_meses": _safe(roas_outros),
        "cac_outros_meses": _safe(cac_outros),
        "deterioracao_roas": _safe((roas_pico - roas_outros) / roas_outros * 100) if roas_outros > 0 else 0,
    }

# ===== SCATTER EFICIENCIA UF (x=gasto_per_capita, y=roas, size=n_novos) =====
print("[12/12] scatter eficiencia + dispersao marca + canal ...")
scatter_uf = []
for r in roas_uf.itertuples(index=False):
    if r.gasto_estimado_uf == 0 and r.novos_uf == 0:
        continue
    scatter_uf.append({
        "uf": r.uf,
        "x": _safe(r.gasto_per_capita),   # R$/mil hab
        "y": _safe(r.roas),
        "size": int(r.novos_uf),
        "gasto": _safe(r.gasto_estimado_uf),
        "novos": int(r.novos_uf),
        "receita": _safe(r.receita_novos_uf),
    })

# ===== DISPERSAO MARCA × ROAS (top 20) =====
scatter_marca = []
for r in roas_marca.head(20).itertuples(index=False):
    if r.gasto_estimado_marca == 0:
        continue
    scatter_marca.append({
        "marca": r.marca,
        "x": _safe(r.gasto_estimado_marca),
        "y": _safe(r.roas),
        "size": int(r.novos_marca),
        "cac": _safe(r.cac),
        "receita": _safe(r.receita_novos_marca),
    })

# ===== CLIENTES POR CANAL (Pmax/Search/Display) =====
ads_canal_12m = ads[(ads["Day"] >= REF_START_12M) & (ads["Day"] <= REF_END)].copy()
canal_agg = (
    ads_canal_12m.groupby("canal")
    .agg(spend=("spend", "sum"), clicks=("clicks", "sum"),
         impressions=("impressions", "sum"), conversions=("conversions", "sum"))
    .reset_index()
    .sort_values("spend", ascending=False)
)
clientes_por_canal = []
total_spend_canal = float(canal_agg["spend"].sum())
for r in canal_agg.itertuples(index=False):
    clientes_por_canal.append({
        "canal": r.canal,
        "gasto": _safe(r.spend),
        "clicks": int(r.clicks),
        "impressions": int(r.impressions),
        "conversions": _safe(r.conversions),
        "ctr": _safe(r.clicks / r.impressions) if r.impressions > 0 else 0,
        "cpc": _safe(r.spend / r.clicks) if r.clicks > 0 else 0,
        "share": _safe(r.spend / total_spend_canal) if total_spend_canal > 0 else 0,
    })

# ===== ASSEMBLE =====
data = {
    "kpis": kpis,
    "gasto_mensal": gasto_mensal_list,        # legado V1
    "gasto_vs_novos": gvn_list,                 # legado V1 + extras V2
    "roas_por_estado": roas_estado_list,       # AGORA 27 UFs
    "roas_por_marca": roas_marca_list,         # AGORA top 30
    "tendencia_pf_vs_pj": tendencia_90d_list,  # legado V1 (semanal 90d)
    # === V2 novos ===
    "gasto_mensal_18m": gasto_mensal_list,
    "gasto_vs_novos_pareados": gvn_list,
    "regressao_mensal": regressao,
    "regressao_diaria": regressao_diaria,
    "scatter_diario": scatter_diario,
    "correlacao_gasto_x_novos": corr_mensal_gn,
    "correlacao_gasto_x_receita": corr_mensal_gr,
    "anova_global": anova_global,
    "anova_por_estado": anova_estado_list,
    "tendencia_pf_pj_18m": tendencia_list,
    "pico_anomalo": pico_data,
    "scatter_eficiencia_uf": scatter_uf,
    "dispersao_marca_x_roas": scatter_marca,
    "clientes_por_canal": clientes_por_canal,
    "uf_populacao": UF_POP_2022,
    "gerado_em": pd.Timestamp.now().isoformat(),
}


def default_enc(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        v = float(o)
        return v if (not math.isnan(v) and not math.isinf(v)) else 0.0
    if isinstance(o, (pd.Timestamp,)):
        return str(o)
    return str(o)


payload = json.dumps(data, ensure_ascii=False, default=default_enc)
OUT.write_text(f"window.CAMPANHAS_DATA = {payload};\n", encoding="utf-8")
print(f"\nOK campanhas-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  Gasto 12m: R$ {gasto_12m:,.0f}  |  Novos: {n_novos_12m:,}  |  Receita novos: R$ {receita_novos_12m:,.0f}")
print(f"  ROAS global: {roas_global:.2f}  |  CAC: R$ {cac_global:,.0f}  |  LTV: R$ {ltv_medio:,.0f}  |  ROAS LTV: {roas_ltv:.2f}x")
print(f"  Regressao mensal: slope={regressao['slope']:.4f}, R2={regressao['r_squared']:.3f}, p={regressao['p_value']:.4f}, sig={regressao['significativo']}")
print(f"  Regressao diaria: slope={regressao_diaria['slope']:.4f}, R2={regressao_diaria['r_squared']:.3f}, p={regressao_diaria['p_value']:.4e}, n={regressao_diaria['n']}")
print(f"  ANOVA global: F={anova_global['F']:.2f}, p={anova_global['p_value']:.4f}, sig={anova_global['significativo']}")
print(f"  Pico: {pico_data.get('am')} R$ {pico_data.get('gasto',0):,.0f} (+{pico_data.get('delta_pct_vs_media',0):.0f}% vs media)")
print(f"  UFs no scatter: {len(scatter_uf)} | Marcas no dispersao: {len(scatter_marca)} | Canais: {len(clientes_por_canal)}")
print(f"  ANOVA por estado: {len(anova_estado_list)} UFs analisadas")
