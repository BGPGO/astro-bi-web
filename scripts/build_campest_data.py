"""build_campest_data.py — Tela 7 PBI Astro: Campanha × Estado × Marca.

Cruza Google Ads (gasto/clicks/conversoes) com Tiny (novos clientes, receita,
recompra) por UF, Marca, e par UF×Marca. Saida: window.CAMPEST_DATA.

Fontes:
  - C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet (Tiny)
  - C:/Projects/astro-giro-bi/data/astro_ads.xlsx (Google Ads)

Estrutura de saida (campest-data.js):
  kpis                  : gasto, receita_novos, roas_medio, cac, n_novos, n_recompra, ticket_*
  filtros               : meses (lista AM), marcas (lista)
  por_uf                : top UF com gasto, clicks, conv, taxa_conv, novos, receita_novos, cac,
                          ticket_novos, ticket_recompra, recompra %, valor_recompra, receita_total, roas
  por_marca             : analogo por marca
  por_marca_uf          : matriz top 10 marcas x top 10 UFs (ROAS por celula)
  top_combinacoes       : top 30 pares UF-Marca por gasto, com ROAS
  combo_uf              : top 12 UFs (gasto bar + roas line)
  combo_marca           : top 12 marcas (gasto bar + roas line)
  roas_mensal_marca     : top 8 marcas x meses (linha multi serie)
  roas_mensal_uf        : top 8 UFs x meses (linha multi serie)
"""
import json
import math
import pathlib
import re

import duckdb
import pandas as pd

ROOT = pathlib.Path(__file__).parent.parent
SRC = pathlib.Path("C:/Projects/astro-giro-bi/data")
PARQUET = SRC / "vendas_tiny_bu.parquet"
ADS_XLSX = SRC / "astro_ads.xlsx"
OUT = ROOT / "campest-data.js"

if not PARQUET.exists():
    raise SystemExit(f"parquet nao encontrado: {PARQUET}")
if not ADS_XLSX.exists():
    raise SystemExit(f"xlsx nao encontrado: {ADS_XLSX}")

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


# ===== LOAD ADS =====
print("[1/8] carregando ads.xlsx ...")
ads = pd.read_excel(ADS_XLSX, sheet_name="Planilha1")
ads["Day"] = pd.to_datetime(ads["Day"])
ads["uf"] = ads["State (Geographic)"].map(STATE_MAP)
ads["marca"] = ads["Campaign Name"].apply(_extract_marca)
ads["spend"] = pd.to_numeric(ads["Cost (Spend)"], errors="coerce").fillna(0)
ads["clicks"] = pd.to_numeric(ads["Clicks"], errors="coerce").fillna(0)
ads["impressions"] = pd.to_numeric(ads["Impressions"], errors="coerce").fillna(0)
ads["conversions"] = pd.to_numeric(ads["Conversions"], errors="coerce").fillna(0)
ads["am"] = ads["Day"].dt.to_period("M").astype(str)
print(f"     ads rows={len(ads)} gasto_total={ads['spend'].sum():.2f}")

# ===== LOAD VENDAS (DuckDB) =====
print("[2/8] abrindo parquet ...")
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


# Janela: ultimos 12 meses ate o min(maxAds, maxVendas)
ADS_MAX = ads["Day"].max()
VENDAS_MAX = pd.Timestamp(q1("SELECT MAX(data_pedido) FROM v"))
REF_END = min(ADS_MAX, VENDAS_MAX)
REF_START = REF_END - pd.Timedelta(days=365)
print(f"     janela: {REF_START.date()} .. {REF_END.date()}")

ads12 = ads[(ads["Day"] >= REF_START) & (ads["Day"] <= REF_END)].copy()


# ===== KPIs GLOBAIS =====
print("[3/8] kpis globais ...")
gasto_total = float(ads12["spend"].sum())
clicks_total = int(ads12["clicks"].sum())
conv_total = int(ads12["conversions"].sum())
taxa_conv_total = (clicks_total > 0) and (conv_total / clicks_total) or 0.0

novos_g = q(f"""
  SELECT COUNT(DISTINCT cliente_id)::BIGINT n,
         SUM(valor_rateado)::DOUBLE rec
  FROM v
  WHERE Recompra = 'Novo'
    AND data_pedido BETWEEN '{REF_START.date()}' AND '{REF_END.date()}'
""").iloc[0]
n_novos = int(novos_g["n"]); receita_novos = float(novos_g["rec"])

recomp_g = q(f"""
  SELECT COUNT(DISTINCT cliente_id)::BIGINT n,
         SUM(valor_rateado)::DOUBLE rec
  FROM v
  WHERE Recompra <> 'Novo'
    AND data_pedido BETWEEN '{REF_START.date()}' AND '{REF_END.date()}'
""").iloc[0]
n_recompra = int(recomp_g["n"]); receita_recompra = float(recomp_g["rec"])

vendas_novas = int(q1(f"""
  SELECT COUNT(DISTINCT numero) FROM v
  WHERE Recompra = 'Novo'
    AND data_pedido BETWEEN '{REF_START.date()}' AND '{REF_END.date()}'
"""))

ticket_novos = (receita_novos / vendas_novas) if vendas_novas else 0
roas = (receita_novos / gasto_total) if gasto_total else 0
cac = (gasto_total / n_novos) if n_novos else 0

kpis = {
    "gasto_total": gasto_total,
    "clicks_total": clicks_total,
    "conversoes_total": conv_total,
    "taxa_conversao": taxa_conv_total,
    "n_novos": n_novos,
    "receita_novos": receita_novos,
    "n_recompra": n_recompra,
    "receita_recompra": receita_recompra,
    "ticket_novos": ticket_novos,
    "roas_medio": roas,
    "cac": cac,
    "vendas_novas": vendas_novas,
    "ref_start": str(REF_START.date()),
    "ref_end": str(REF_END.date()),
}


# ===== POR UF =====
print("[4/8] por_uf ...")
ads_uf = (
    ads12[ads12["uf"].notna()]
    .groupby("uf").agg(
        gasto=("spend", "sum"),
        clicks=("clicks", "sum"),
        conversoes=("conversions", "sum"),
    ).reset_index()
)

vendas_uf = q(f"""
  WITH base AS (
    SELECT
      cliente_uf AS uf,
      Recompra,
      numero,
      cliente_id,
      valor_rateado
    FROM v
    WHERE cliente_uf IS NOT NULL
      AND data_pedido BETWEEN '{REF_START.date()}' AND '{REF_END.date()}'
  )
  SELECT
    uf,
    COUNT(DISTINCT CASE WHEN Recompra = 'Novo' THEN cliente_id END)::BIGINT n_novos,
    SUM(CASE WHEN Recompra = 'Novo' THEN valor_rateado ELSE 0 END)::DOUBLE valor_novos,
    COUNT(DISTINCT CASE WHEN Recompra = 'Novo' THEN numero END)::BIGINT vendas_novas,
    COUNT(DISTINCT CASE WHEN Recompra <> 'Novo' THEN cliente_id END)::BIGINT n_recompra,
    SUM(CASE WHEN Recompra <> 'Novo' THEN valor_rateado ELSE 0 END)::DOUBLE valor_recompra,
    COUNT(DISTINCT CASE WHEN Recompra <> 'Novo' THEN numero END)::BIGINT vendas_recompra,
    COUNT(DISTINCT cliente_id)::BIGINT n_clientes,
    SUM(valor_rateado)::DOUBLE receita_total
  FROM base
  GROUP BY uf
""")

por_uf = ads_uf.merge(vendas_uf, on="uf", how="outer").fillna(0)
por_uf["taxa_conv"] = por_uf.apply(lambda r: (r.conversoes / r.clicks) if r.clicks > 0 else 0, axis=1)
por_uf["cac"] = por_uf.apply(lambda r: (r.gasto / r.n_novos) if r.n_novos > 0 else 0, axis=1)
por_uf["ticket_novos"] = por_uf.apply(lambda r: (r.valor_novos / r.vendas_novas) if r.vendas_novas > 0 else 0, axis=1)
por_uf["ticket_recompra"] = por_uf.apply(lambda r: (r.valor_recompra / r.vendas_recompra) if r.vendas_recompra > 0 else 0, axis=1)
por_uf["taxa_recompra"] = por_uf.apply(
    lambda r: (r.n_recompra / r.n_clientes) if r.n_clientes > 0 else 0, axis=1
)
por_uf["roas"] = por_uf.apply(lambda r: (r.valor_novos / r.gasto) if r.gasto > 0 else 0, axis=1)
por_uf = por_uf.sort_values("gasto", ascending=False)

por_uf_list = [
    {
        "uf": str(r.uf),
        "clicks": int(r.clicks),
        "conversoes": int(r.conversoes),
        "taxa_conv": _safe(r.taxa_conv),
        "valor_novos": _safe(r.valor_novos),
        "gasto": _safe(r.gasto),
        "vendas_novas": int(r.vendas_novas),
        "n_novos": int(r.n_novos),
        "cac": _safe(r.cac),
        "ticket_novos": _safe(r.ticket_novos),
        "ticket_recompra": _safe(r.ticket_recompra),
        "taxa_recompra": _safe(r.taxa_recompra),
        "valor_recompra": _safe(r.valor_recompra),
        "receita_total": _safe(r.receita_total),
        "roas": _safe(r.roas),
    }
    for r in por_uf.itertuples(index=False)
]


# ===== POR MARCA =====
print("[5/8] por_marca ...")
ads_marca = (
    ads12[ads12["marca"].notna()]
    .groupby("marca").agg(
        gasto=("spend", "sum"),
        clicks=("clicks", "sum"),
        conversoes=("conversions", "sum"),
    ).reset_index()
)

vendas_marca = q(f"""
  WITH base AS (
    SELECT marca, Recompra, numero, cliente_id, valor_rateado
    FROM v
    WHERE marca IS NOT NULL
      AND data_pedido BETWEEN '{REF_START.date()}' AND '{REF_END.date()}'
  )
  SELECT
    marca,
    COUNT(DISTINCT CASE WHEN Recompra = 'Novo' THEN cliente_id END)::BIGINT n_novos,
    SUM(CASE WHEN Recompra = 'Novo' THEN valor_rateado ELSE 0 END)::DOUBLE valor_novos,
    COUNT(DISTINCT CASE WHEN Recompra = 'Novo' THEN numero END)::BIGINT vendas_novas,
    COUNT(DISTINCT CASE WHEN Recompra <> 'Novo' THEN cliente_id END)::BIGINT n_recompra,
    SUM(CASE WHEN Recompra <> 'Novo' THEN valor_rateado ELSE 0 END)::DOUBLE valor_recompra,
    COUNT(DISTINCT CASE WHEN Recompra <> 'Novo' THEN numero END)::BIGINT vendas_recompra,
    COUNT(DISTINCT cliente_id)::BIGINT n_clientes,
    SUM(valor_rateado)::DOUBLE receita_total
  FROM base
  GROUP BY marca
""")

por_marca = ads_marca.merge(vendas_marca, on="marca", how="outer").fillna(0)
por_marca["taxa_conv"] = por_marca.apply(lambda r: (r.conversoes / r.clicks) if r.clicks > 0 else 0, axis=1)
por_marca["cac"] = por_marca.apply(lambda r: (r.gasto / r.n_novos) if r.n_novos > 0 else 0, axis=1)
por_marca["ticket_novos"] = por_marca.apply(lambda r: (r.valor_novos / r.vendas_novas) if r.vendas_novas > 0 else 0, axis=1)
por_marca["ticket_recompra"] = por_marca.apply(lambda r: (r.valor_recompra / r.vendas_recompra) if r.vendas_recompra > 0 else 0, axis=1)
por_marca["taxa_recompra"] = por_marca.apply(
    lambda r: (r.n_recompra / r.n_clientes) if r.n_clientes > 0 else 0, axis=1
)
por_marca["roas"] = por_marca.apply(lambda r: (r.valor_novos / r.gasto) if r.gasto > 0 else 0, axis=1)
por_marca = por_marca.sort_values("gasto", ascending=False)

por_marca_list = [
    {
        "marca": str(r.marca),
        "clicks": int(r.clicks),
        "conversoes": int(r.conversoes),
        "taxa_conv": _safe(r.taxa_conv),
        "valor_novos": _safe(r.valor_novos),
        "gasto": _safe(r.gasto),
        "vendas_novas": int(r.vendas_novas),
        "n_novos": int(r.n_novos),
        "cac": _safe(r.cac),
        "ticket_novos": _safe(r.ticket_novos),
        "ticket_recompra": _safe(r.ticket_recompra),
        "taxa_recompra": _safe(r.taxa_recompra),
        "valor_recompra": _safe(r.valor_recompra),
        "receita_total": _safe(r.receita_total),
        "roas": _safe(r.roas),
    }
    for r in por_marca.itertuples(index=False)
]


# ===== MATRIZ MARCA x UF (top 10 x top 10) =====
print("[6/8] matriz marca x uf ...")
top_marcas_10 = [r["marca"] for r in por_marca_list[:10] if r["marca"]]
top_ufs_10 = [r["uf"] for r in por_uf_list[:10] if r["uf"]]

ads_mu = (
    ads12[ads12["uf"].isin(top_ufs_10) & ads12["marca"].isin(top_marcas_10)]
    .groupby(["marca", "uf"]).agg(gasto=("spend", "sum")).reset_index()
)

vendas_mu = q(f"""
  SELECT marca, cliente_uf AS uf,
         SUM(valor_rateado)::DOUBLE valor_novos,
         COUNT(DISTINCT cliente_id)::BIGINT n_novos
  FROM v
  WHERE Recompra = 'Novo'
    AND data_pedido BETWEEN '{REF_START.date()}' AND '{REF_END.date()}'
    AND marca IN ({','.join("'" + m.replace("'", "''") + "'" for m in top_marcas_10)})
    AND cliente_uf IN ({','.join("'" + u + "'" for u in top_ufs_10)})
  GROUP BY marca, cliente_uf
""")

mu = ads_mu.merge(vendas_mu, on=["marca", "uf"], how="outer").fillna(0)
mu["roas"] = mu.apply(lambda r: (r.valor_novos / r.gasto) if r.gasto > 0 else 0, axis=1)

# Pivot: marcas como rows, ufs como cols, valor = roas, e payload extra
por_marca_uf = {
    "marcas": top_marcas_10,
    "ufs": top_ufs_10,
    "celulas": [
        {
            "marca": str(r.marca),
            "uf": str(r.uf),
            "gasto": _safe(r.gasto),
            "valor_novos": _safe(r.valor_novos),
            "n_novos": int(r.n_novos),
            "roas": _safe(r.roas),
        }
        for r in mu.itertuples(index=False)
    ],
}


# ===== TOP COMBINACOES UF-MARCA (top 30 por gasto) =====
print("[7/8] top_combinacoes ...")
ads_all_mu = (
    ads12[ads12["uf"].notna() & ads12["marca"].notna()]
    .groupby(["marca", "uf"]).agg(gasto=("spend", "sum")).reset_index()
)
top_pairs = ads_all_mu.sort_values("gasto", ascending=False).head(30)

if not top_pairs.empty:
    marcas_in = list(set(top_pairs["marca"]))
    ufs_in = list(set(top_pairs["uf"]))
    vendas_pairs = q(f"""
      SELECT marca, cliente_uf AS uf,
             SUM(CASE WHEN Recompra = 'Novo' THEN valor_rateado ELSE 0 END)::DOUBLE valor_novos,
             COUNT(DISTINCT CASE WHEN Recompra = 'Novo' THEN cliente_id END)::BIGINT n_novos
      FROM v
      WHERE data_pedido BETWEEN '{REF_START.date()}' AND '{REF_END.date()}'
        AND marca IN ({','.join("'" + m.replace("'", "''") + "'" for m in marcas_in)})
        AND cliente_uf IN ({','.join("'" + u + "'" for u in ufs_in)})
      GROUP BY marca, cliente_uf
    """)
    tp = top_pairs.merge(vendas_pairs, on=["marca", "uf"], how="left").fillna(0)
    tp["roas"] = tp.apply(lambda r: (r.valor_novos / r.gasto) if r.gasto > 0 else 0, axis=1)
    tp["cac"] = tp.apply(lambda r: (r.gasto / r.n_novos) if r.n_novos > 0 else 0, axis=1)
    top_combinacoes = [
        {
            "marca": str(r.marca), "uf": str(r.uf),
            "gasto": _safe(r.gasto), "valor_novos": _safe(r.valor_novos),
            "n_novos": int(r.n_novos), "roas": _safe(r.roas), "cac": _safe(r.cac),
        }
        for r in tp.itertuples(index=False)
    ]
else:
    top_combinacoes = []


# ===== COMBO UF / Marca (top 12) e ROAS mensal por marca / uf =====
print("[8/8] combo + roas mensal ...")
combo_uf = [
    {"uf": r["uf"], "gasto": r["gasto"], "roas": r["roas"]}
    for r in por_uf_list[:12] if r["gasto"] > 0
]
combo_marca = [
    {"marca": r["marca"], "gasto": r["gasto"], "roas": r["roas"]}
    for r in por_marca_list[:12] if r["gasto"] > 0
]

# Janela 18m para a linha temporal de ROAS mensal
REF_START_18M = (REF_END - pd.Timedelta(days=550)).replace(day=1)
ads18 = ads[(ads["Day"] >= REF_START_18M) & (ads["Day"] <= REF_END)].copy()
meses_18m = sorted(ads18["am"].dropna().unique().tolist())

top_marcas_8 = [r["marca"] for r in por_marca_list[:8] if r["marca"]]
top_ufs_8 = [r["uf"] for r in por_uf_list[:8] if r["uf"]]

# ADS mensal por marca / uf
ads_mes_marca = ads18[ads18["marca"].isin(top_marcas_8)].groupby(["marca", "am"])["spend"].sum().reset_index()
ads_mes_uf = ads18[ads18["uf"].isin(top_ufs_8)].groupby(["uf", "am"])["spend"].sum().reset_index()

# Vendas mensal por marca / uf
def _q_list(vals):
    return ",".join("'" + v.replace("'", "''") + "'" for v in vals) if vals else "''"


vendas_mes_marca = q(f"""
  SELECT marca, strftime(data_pedido, '%Y-%m') AS am,
         SUM(valor_rateado)::DOUBLE receita
  FROM v
  WHERE Recompra = 'Novo'
    AND data_pedido BETWEEN '{REF_START_18M.date()}' AND '{REF_END.date()}'
    AND marca IN ({_q_list(top_marcas_8)})
  GROUP BY marca, am
""")
vendas_mes_uf = q(f"""
  SELECT cliente_uf AS uf, strftime(data_pedido, '%Y-%m') AS am,
         SUM(valor_rateado)::DOUBLE receita
  FROM v
  WHERE Recompra = 'Novo'
    AND data_pedido BETWEEN '{REF_START_18M.date()}' AND '{REF_END.date()}'
    AND cliente_uf IN ({_q_list(top_ufs_8)})
  GROUP BY cliente_uf, am
""")

mm = ads_mes_marca.merge(vendas_mes_marca, on=["marca", "am"], how="outer").fillna(0)
mm["roas"] = mm.apply(lambda r: (r.receita / r.spend) if r.spend > 0 else 0, axis=1)
mu_uf = ads_mes_uf.merge(vendas_mes_uf, on=["uf", "am"], how="outer").fillna(0)
mu_uf["roas"] = mu_uf.apply(lambda r: (r.receita / r.spend) if r.spend > 0 else 0, axis=1)

def _serie_mensal(df, key_col, top_vals):
    out = {}
    for k in top_vals:
        sub = df[df[key_col] == k].set_index("am")
        out[k] = [
            {"am": m, "roas": _safe(sub.loc[m, "roas"]) if m in sub.index else 0,
             "spend": _safe(sub.loc[m, "spend"]) if m in sub.index else 0}
            for m in meses_18m
        ]
    return out

roas_mensal_marca = {
    "meses": meses_18m,
    "series": _serie_mensal(mm, "marca", top_marcas_8),
}
roas_mensal_uf = {
    "meses": meses_18m,
    "series": _serie_mensal(mu_uf, "uf", top_ufs_8),
}


# ===== FILTROS =====
filtros = {
    "meses": meses_18m,
    "marcas": ["Todas"] + [m for m in top_marcas_10 if m],
    "ufs": ["Todos"] + [u for u in top_ufs_10 if u],
}


payload = {
    "kpis": kpis,
    "filtros": filtros,
    "por_uf": por_uf_list,
    "por_marca": por_marca_list,
    "por_marca_uf": por_marca_uf,
    "top_combinacoes": top_combinacoes,
    "combo_uf": combo_uf,
    "combo_marca": combo_marca,
    "roas_mensal_marca": roas_mensal_marca,
    "roas_mensal_uf": roas_mensal_uf,
    "gerado_em": pd.Timestamp.now().isoformat(),
}

OUT.write_text(
    "window.CAMPEST_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
    encoding="utf-8",
)
print(f"OK {OUT} ({OUT.stat().st_size/1024:.1f} KB)")
print(f"     por_uf: {len(por_uf_list)} · por_marca: {len(por_marca_list)} · combinacoes: {len(top_combinacoes)}")
print(f"     KPIs: gasto={gasto_total:.0f} novos={n_novos} ROAS={roas:.2f}x CAC={cac:.2f}")
