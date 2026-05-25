"""Le vendas_tiny_bu.parquet (DuckDB) + astro_ads.xlsx (pandas/openpyxl).

Gera C:/Projects/astro-bi-web/campanhas-data.js com window.CAMPANHAS_DATA = {...}
contendo:
  - kpis           gasto total Ads (12m), receita novos clientes (12m), ROAS, CAC, gasto medio mensal, %PF/%PJ
  - gasto_mensal   serie mensal ultimos 18m de gasto Ads
  - gasto_vs_novos mes x { gasto, novos_clientes, receita_novos } ultimos 18m
  - roas_por_estado top 15 UFs com gasto_estimado_uf, receita_novos_uf, novos_uf, roas, cac
  - roas_por_marca  top 15 marcas com gasto, receita_novos, novos, roas, cac
  - tendencia_pf_vs_pj  % novos PF vs PJ ultimos 90d

Fontes (NAO modificar):
  - C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet
  - C:/Projects/astro-giro-bi/data/astro_ads.xlsx
"""
import json
import pathlib
import re

import duckdb
import pandas as pd

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

# ===== CONSTANTS (espelham dashboard_campanhas.py) =====
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


# ===== LOAD =====
print("[1/6] carregando ads.xlsx ...")
ads = pd.read_excel(ADS_XLSX, sheet_name="Planilha1")
ads["Day"] = pd.to_datetime(ads["Day"])
ads["uf"] = ads["State (Geographic)"].map(STATE_MAP)
ads["marca"] = ads["Campaign Name"].apply(_extract_marca)
ads["spend"] = pd.to_numeric(ads["Cost (Spend)"], errors="coerce").fillna(0)

print(f"     ads rows={len(ads)} spend_total={ads['spend'].sum():.2f}")

ADS_MAX_DAY = ads["Day"].max()
ADS_MIN_DAY = ads["Day"].min()

print("[2/6] abrindo parquet via duckdb ...")
con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET.as_posix()}') WHERE situacao != 'Cancelado'")


def q(sql, params=None):
    return con.execute(sql, params or []).fetchdf()


def q1(sql, params=None):
    r = con.execute(sql, params or []).fetchone()
    return r[0] if r and r[0] is not None else 0


# ===== JANELA 12m =====
# Define janela como max(min(ads_max_day, vendas_max_day)) - 365d
VENDAS_MAX = pd.Timestamp(q1("SELECT MAX(data_pedido) FROM v"))
REF_END = min(ADS_MAX_DAY, VENDAS_MAX)
REF_START_12M = REF_END - pd.Timedelta(days=365)
REF_START_18M = (REF_END - pd.Timedelta(days=550)).replace(day=1)
REF_START_90D = REF_END - pd.Timedelta(days=90)

print(f"     janela ref: {REF_START_12M.date()}  ..  {REF_END.date()}")

# ===== KPIs =====
print("[3/6] kpis ...")
gasto_12m = float(ads[(ads["Day"] >= REF_START_12M) & (ads["Day"] <= REF_END)]["spend"].sum())

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

roas_global = (receita_novos_12m / gasto_12m) if gasto_12m else 0
cac_global = (gasto_12m / n_novos_12m) if n_novos_12m else 0

# meses no periodo
meses_dist = ads[(ads["Day"] >= REF_START_12M) & (ads["Day"] <= REF_END)]["Day"].dt.to_period("M").nunique()
gasto_medio_mensal = gasto_12m / meses_dist if meses_dist else 0

# PF vs PJ ultimos 90d
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
    "receita_novos_12m": receita_novos_12m,
    "novos_clientes_12m": n_novos_12m,
    "roas_global": roas_global,
    "cac_global": cac_global,
    "gasto_medio_mensal": gasto_medio_mensal,
    "meses_periodo": int(meses_dist),
    "pct_pf_90d": pct_pf,
    "pct_pj_90d": pct_pj,
    "novos_pf_90d": n_pf,
    "novos_pj_90d": n_pj,
    "ref_start": str(REF_START_12M.date()),
    "ref_end": str(REF_END.date()),
}

# ===== SERIE MENSAL gasto Ads (ultimos 18m) =====
print("[4/6] serie mensal + gasto_vs_novos ...")
ads_18m = ads[(ads["Day"] >= REF_START_18M) & (ads["Day"] <= REF_END)].copy()
ads_18m["am"] = ads_18m["Day"].dt.to_period("M").astype(str)
gasto_mensal = (
    ads_18m.groupby("am")["spend"].sum().reset_index()
    .sort_values("am")
    .rename(columns={"spend": "valor"})
)
gasto_mensal_list = gasto_mensal.to_dict(orient="records")

# ===== gasto vs novos (mes a mes) =====
novos_mensal = q(f"""
  SELECT
    strftime(data_pedido, '%Y-%m') am,
    COUNT(DISTINCT cliente_id)::BIGINT novos_clientes,
    SUM(valor_rateado)::DOUBLE receita_novos
  FROM v
  WHERE Recompra = 'Novo'
    AND data_pedido BETWEEN '{REF_START_18M.date()}' AND '{REF_END.date()}'
  GROUP BY am
  ORDER BY am
""")

gvn = gasto_mensal.merge(novos_mensal, on="am", how="outer").fillna(0).sort_values("am")
gvn_list = [
    {
        "am": r.am,
        "gasto": float(r.valor),
        "novos_clientes": int(r.novos_clientes),
        "receita_novos": float(r.receita_novos),
    }
    for r in gvn.itertuples(index=False)
]

# ===== ROAS por estado =====
print("[5/6] roas_por_estado ...")
ads_uf_12m = (
    ads[(ads["Day"] >= REF_START_12M) & (ads["Day"] <= REF_END) & ads["uf"].notna()]
    .groupby("uf")["spend"].sum().reset_index()
    .rename(columns={"uf": "uf", "spend": "gasto_estimado_uf"})
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

roas_uf = ads_uf_12m.merge(novos_uf_12m, on="uf", how="outer").fillna(0)
roas_uf["roas"] = roas_uf.apply(
    lambda r: (r["receita_novos_uf"] / r["gasto_estimado_uf"]) if r["gasto_estimado_uf"] > 0 else 0,
    axis=1,
)
roas_uf["cac"] = roas_uf.apply(
    lambda r: (r["gasto_estimado_uf"] / r["novos_uf"]) if r["novos_uf"] > 0 else 0,
    axis=1,
)
roas_uf = roas_uf.sort_values("gasto_estimado_uf", ascending=False).head(15)
roas_estado_list = [
    {
        "uf": r.uf,
        "gasto": float(r.gasto_estimado_uf),
        "novos": int(r.novos_uf),
        "receita_novos": float(r.receita_novos_uf),
        "roas": float(r.roas),
        "cac": float(r.cac),
    }
    for r in roas_uf.itertuples(index=False)
]

# ===== ROAS por marca =====
print("[6/6] roas_por_marca ...")
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
roas_marca = roas_marca.sort_values("gasto_estimado_marca", ascending=False).head(15)
roas_marca_list = [
    {
        "marca": r.marca,
        "gasto": float(r.gasto_estimado_marca),
        "novos": int(r.novos_marca),
        "receita_novos": float(r.receita_novos_marca),
        "roas": float(r.roas),
        "cac": float(r.cac),
    }
    for r in roas_marca.itertuples(index=False)
]

# ===== tendencia PF vs PJ ultimos 90d (serie semanal) =====
tendencia = q(f"""
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
tendencia_list = []
if not tendencia.empty:
    pivot = tendencia.pivot_table(index="wk", columns="tipo", values="n", fill_value=0).sort_index()
    for wk, row in pivot.iterrows():
        pf = int(row.get("F", 0))
        pj = int(row.get("J", 0))
        tot = pf + pj
        tendencia_list.append({
            "wk": str(pd.Timestamp(wk).date()),
            "pf": pf,
            "pj": pj,
            "pct_pf": (pf / tot) if tot else 0,
            "pct_pj": (pj / tot) if tot else 0,
        })

# ===== ASSEMBLE & WRITE =====
data = {
    "kpis": kpis,
    "gasto_mensal": gasto_mensal_list,
    "gasto_vs_novos": gvn_list,
    "roas_por_estado": roas_estado_list,
    "roas_por_marca": roas_marca_list,
    "tendencia_pf_vs_pj": tendencia_list,
    "gerado_em": pd.Timestamp.now().isoformat(),
}


def default_enc(o):
    return str(o)


payload = json.dumps(data, ensure_ascii=False, default=default_enc)
OUT.write_text(f"window.CAMPANHAS_DATA = {payload};\n", encoding="utf-8")
print(f"OK campanhas-data.js gerado em {OUT} ({OUT.stat().st_size} bytes)")
print(f"  Gasto 12m: R$ {gasto_12m:,.0f}  |  Novos: {n_novos_12m:,}  |  Receita novos: R$ {receita_novos_12m:,.0f}")
print(f"  ROAS global: {roas_global:.2f}  |  CAC: R$ {cac_global:,.0f}  |  PF/PJ 90d: {pct_pf*100:.0f}% / {pct_pj*100:.0f}%")
if roas_estado_list:
    best_uf = max(roas_estado_list, key=lambda x: x["roas"])
    print(f"  Melhor UF (ROAS): {best_uf['uf']} = {best_uf['roas']:.2f}")
if roas_marca_list:
    best_marca = max(roas_marca_list, key=lambda x: x["roas"])
    print(f"  Melhor marca (ROAS): {best_marca['marca']} = {best_marca['roas']:.2f}")
