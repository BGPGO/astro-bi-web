"""Le frete_empresa_rj.csv + vendas_tiny_bu.parquet -> frete-data.js (V2).

Origem:
  - C:/Projects/astro-giro-bi/data/frete_empresa_rj.csv (5013 envios RJ).
  - C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet (pedidos completos)
    pra cruzar o frete com o valor do pedido / cliente / status.

Saida: window.FRETE_DATA = { kpis, por_transportadora, faixas_gap, top_piores,
  frete_zero_por_transp, por_faixa_valor_pedido, cenarios_corte,
  serie_diaria_gap, top_clientes_subsidiados }.

Foco da V2: alem de gap absorvido por transportadora, mostrar cenarios "se
cortar frete gratis acima de R$X". Storytelling Filipe (29/04/2026) sobre
manter o programa cortando a cauda — V1 era so a sangria, V2 mostra
quanto se economiza em cada cenario.
"""
from __future__ import annotations

import json
import pathlib
import unicodedata

import pandas as pd

# === Paths ===
DATA_DIR = pathlib.Path("C:/Projects/astro-giro-bi/data")
SRC_FRETE = DATA_DIR / "frete_empresa_rj.csv"
SRC_VENDAS = DATA_DIR / "vendas_tiny_bu.parquet"
OUT = pathlib.Path(__file__).resolve().parent.parent / "frete-data.js"


def _br_to_float(s):
    """Converte "1.096,71" / "21,61" / "0,00" / "" / NaN -> float."""
    if s is None:
        return 0.0
    if not isinstance(s, str):
        try:
            return float(s)
        except Exception:
            return 0.0
    s = s.strip()
    if s == "":
        return 0.0
    try:
        if "," in s:
            return float(s.replace(".", "").replace(",", "."))
        return float(s)
    except Exception:
        return 0.0


def _norm_transp(name: str) -> str:
    """Normaliza nome de transportadora: tira acento, upper, junta variantes."""
    if not isinstance(name, str) or not name.strip():
        return "OUTROS"
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().upper().strip()
    for pref in ("TRANSPORTADORA ", "TRANSPORTES ", "LTDA"):
        n = n.replace(pref, "").strip()
    n = " ".join(n.split())
    if "JADLOG" in n:
        return "JADLOG"
    if "BRASPRESS" in n:
        return "BRASPRESS"
    if n.startswith("J&T") or n == "J&T EXPRESS":
        return "J&T"
    if "TOTAL EXPRESS" in n:
        return "TOTAL EXPRESS"
    if "RODONAVES" in n:
        return "RODONAVES"
    if "DESTAK" in n:
        return "DESTAK"
    if "PATRUS" in n:
        return "PATRUS"
    if "BAUER" in n:
        return "BAUER"
    return n or "OUTROS"


# === Load frete ===
if not SRC_FRETE.exists():
    raise SystemExit(f"Faltam dados de origem: {SRC_FRETE}")

df = pd.read_csv(SRC_FRETE, dtype=str).fillna("")
df = df.rename(columns={"id_request": "id"})
df["id"] = df["id"].astype(str)
for c in ("frete", "freteEmpresa", "pesoBruto", "pesoLiquido"):
    if c in df.columns:
        df[c] = df[c].map(_br_to_float)
df["transportador_norm"] = df["transportador"].map(_norm_transp)
df["gap"] = df["freteEmpresa"] - df["frete"]
df["dataEnvio_dt"] = pd.to_datetime(
    df["dataEnvio"].str.slice(0, 10), format="%d/%m/%Y", errors="coerce"
)

# === Load vendas (parquet) - cruzar com valor de pedido + cliente + status ===
ped = None
if SRC_VENDAS.exists():
    try:
        v = pd.read_parquet(SRC_VENDAS)
        for c in ("valor_total", "total_pedido", "valor_frete"):
            if c in v.columns:
                v[c] = pd.to_numeric(v[c], errors="coerce").fillna(0)
        ped = v.drop_duplicates("id").copy()
        ped["id"] = ped["id"].astype(str)
        # so RJ pra reduzir overhead (a base do frete ja eh RJ)
        if "cliente_uf" in ped.columns:
            ped = ped[ped["cliente_uf"] == "RJ"]
    except Exception as e:  # noqa: BLE001
        print(f"AVISO: nao consegui ler parquet ({e}). Cruzamentos com pedido virao vazios.")
        ped = None

if ped is not None:
    keep = [
        c for c in (
            "id", "total_pedido", "valor_frete", "situacao", "cliente_nome",
            "cliente_cpf_cnpj", "cliente_id", "cliente_cidade", "data_pedido",
        ) if c in ped.columns
    ]
    df = df.merge(ped[keep], on="id", how="left")
else:
    df["total_pedido"] = 0.0
    df["valor_frete"] = 0.0
    df["situacao"] = ""
    df["cliente_nome"] = ""
    df["cliente_cpf_cnpj"] = ""
    df["cliente_id"] = ""
    df["cliente_cidade"] = ""

# === KPIs base ===
n_envios = int(len(df))
total_cobrado = float(df["frete"].sum())
total_custo = float(df["freteEmpresa"].sum())
gap_total = float(df["gap"].sum())
n_frete_zero = int((df["frete"] == 0).sum())
pct_frete_zero = n_frete_zero / n_envios if n_envios else 0
custo_medio = total_custo / n_envios if n_envios else 0
gap_medio = gap_total / n_envios if n_envios else 0

# janela em meses pra anualizar gap
if df["dataEnvio_dt"].notna().any():
    dmin = df["dataEnvio_dt"].min()
    dmax = df["dataEnvio_dt"].max()
    meses = max(((dmax.year - dmin.year) * 12 + (dmax.month - dmin.month) + 1), 1)
else:
    meses = 1
gap_anualizado = gap_total * (12 / meses) if meses else gap_total

kpis = {
    "n_envios": n_envios,
    "total_cobrado": total_cobrado,
    "total_custo": total_custo,
    "gap_total": gap_total,
    "n_frete_zero": n_frete_zero,
    "pct_frete_zero": pct_frete_zero,
    "custo_medio": custo_medio,
    "gap_medio": gap_medio,
    "meses_janela": meses,
    "gap_anualizado": gap_anualizado,
    "data_min": str(df["dataEnvio_dt"].min().date()) if df["dataEnvio_dt"].notna().any() else "",
    "data_max": str(df["dataEnvio_dt"].max().date()) if df["dataEnvio_dt"].notna().any() else "",
}

# === Por transportadora ===
por_transp = []
for nome, g in df.groupby("transportador_norm"):
    if len(g) == 0:
        continue
    peso_sum = float(g["pesoBruto"].sum())
    cobrado_sum = float(g["frete"].sum())
    custo_sum = float(g["freteEmpresa"].sum())
    n = int(len(g))
    por_transp.append({
        "nome": nome,
        "n": n,
        "peso_med": peso_sum / n if n else 0,
        "frete_cobrado_med": cobrado_sum / n if n else 0,
        "custo_med": custo_sum / n if n else 0,
        "ratio_custo_cobrado": (custo_sum / cobrado_sum) if cobrado_sum > 0 else None,
        "rs_kg_cobrado": (cobrado_sum / peso_sum) if peso_sum > 0 else 0,
        "rs_kg_custo": (custo_sum / peso_sum) if peso_sum > 0 else 0,
        "gap_total": float(g["gap"].sum()),
    })
por_transp.sort(key=lambda r: -r["gap_total"])

# === Faixas de gap (7) ===
faixa_defs = [
    ("Lucro (gap <= 0)", -1e18, 0),
    ("Neutro (0-10)", 0, 10),
    ("Ruim (10-50)", 10, 50),
    ("Sangrento (50-100)", 50, 100),
    ("Catastrofico (100-200)", 100, 200),
    ("Tragico (200-500)", 200, 500),
    ("Apocaliptico (>500)", 500, 1e18),
]
faixas_gap = []
for label, lo, hi in faixa_defs:
    if label.startswith("Lucro"):
        mask = df["gap"] <= 0
    elif hi == 1e18:
        mask = df["gap"] > lo
    else:
        mask = (df["gap"] > lo) & (df["gap"] <= hi)
    sub = df[mask]
    n = int(len(sub))
    faixas_gap.append({
        "faixa": label,
        "n": n,
        "gap_total": float(sub["gap"].sum()),
        "gap_med": float(sub["gap"].mean()) if n else 0,
        "pct": (n / n_envios) if n_envios else 0,
    })

# === Top 50 piores prejuizos individuais ===
piores = df.nlargest(50, "gap")
top_piores = []
for _, r in piores.iterrows():
    top_piores.append({
        "id": str(r.get("id", "")),
        "transportadora": r.get("transportador_norm", ""),
        "peso": float(r.get("pesoBruto", 0) or 0),
        "cobrado": float(r.get("frete", 0) or 0),
        "custo": float(r.get("freteEmpresa", 0) or 0),
        "gap": float(r.get("gap", 0) or 0),
        "valor_pedido": float(r.get("total_pedido", 0) or 0),
        "cliente": str(r.get("cliente_nome", "") or "")[:40],
        "situacao": str(r.get("situacao", "") or ""),
    })

# === Frete zero stats + breakdown por transportadora ===
fz = df[df["frete"] == 0]
frete_zero = {
    "n": int(len(fz)),
    "custo_total": float(fz["freteEmpresa"].sum()),
    "peso_medio": float(fz["pesoBruto"].mean()) if len(fz) else 0,
}

frete_zero_por_transp = []
for nome, g in fz.groupby("transportador_norm"):
    n = int(len(g))
    if n == 0:
        continue
    frete_zero_por_transp.append({
        "nome": nome,
        "n": n,
        "custo_total": float(g["freteEmpresa"].sum()),
        "custo_med": float(g["freteEmpresa"].mean()),
        "peso_med": float(g["pesoBruto"].mean()),
        "pct_do_total_fz": (n / len(fz)) if len(fz) else 0,
    })
frete_zero_por_transp.sort(key=lambda r: -r["custo_total"])

# === Por faixa de valor de pedido (cruza com parquet) ===
# faixas: <100, 100-500, 500-1k, 1k-3k, 3k-10k, >10k
faixa_val_defs = [
    ("< R$ 100", 0, 100),
    ("R$ 100-500", 100, 500),
    ("R$ 500-1k", 500, 1000),
    ("R$ 1k-3k", 1000, 3000),
    ("R$ 3k-10k", 3000, 10000),
    ("> R$ 10k", 10000, 1e18),
]
por_faixa_valor_pedido = []
df_v = df[df["total_pedido"] > 0].copy() if "total_pedido" in df.columns else df.iloc[0:0].copy()
for label, lo, hi in faixa_val_defs:
    if hi == 1e18:
        sub = df_v[df_v["total_pedido"] > lo]
    else:
        sub = df_v[(df_v["total_pedido"] > lo) & (df_v["total_pedido"] <= hi)]
    n = int(len(sub))
    receita = float(sub["total_pedido"].sum())
    custo_frete = float(sub["freteEmpresa"].sum())
    gap = float(sub["gap"].sum())
    por_faixa_valor_pedido.append({
        "faixa": label,
        "n": n,
        "receita_total": receita,
        "custo_frete_total": custo_frete,
        "gap_total": gap,
        "frete_pct_valor": (custo_frete / receita) if receita > 0 else 0,
        "custo_frete_med": (custo_frete / n) if n else 0,
    })

# === Cenarios de corte ===
# "Se cortarmos frete gratis acima de R$X, qual a economia anual?"
# Logica: envios onde frete == 0 (cliente nao pagou nada) E o pedido valor < X
# sao os que ainda receberiam frete gratis. Acima de X, cliente pagaria frete
# completo (cobrado = custo, gap = 0). Economia = gap_atual dos envios onde
# valor_pedido < X removido do total. Equivalente: gap dos envios com pedido
# >= X eh eliminado.
cenarios_corte = []
if "total_pedido" in df.columns:
    base = df.copy()
    base["gap_eliminado"] = base["gap"]
    for X in [0, 200, 500, 700, 1000, 1500, 2000]:
        # cortamos frete gratis pra pedidos >= X (cliente paga, gap -> 0)
        # so afeta envios FRETE GRATIS (frete=0); cobrados ja eram OK
        # pedidos com total_pedido = 0 (sem cruzamento parquet) sao ignorados
        afetados = base[(base["frete"] == 0) & (base["total_pedido"] >= X) & (base["total_pedido"] > 0)]
        eco_periodo = float(afetados["gap"].sum())
        eco_anual = eco_periodo * (12 / meses) if meses else eco_periodo
        cenarios_corte.append({
            "X": X,
            "label": f"Cortar FG acima de R$ {X:,}".replace(",", "."),
            "n_envios_afetados": int(len(afetados)),
            "economia_periodo": eco_periodo,
            "economia_anual": eco_anual,
            "pct_envios": (len(afetados) / n_envios) if n_envios else 0,
        })

# === Serie diaria de gap (ultimos 90 dias) ===
serie_diaria_gap = []
if df["dataEnvio_dt"].notna().any():
    df_d = df.dropna(subset=["dataEnvio_dt"]).copy()
    dmax_d = df_d["dataEnvio_dt"].max()
    cutoff = dmax_d - pd.Timedelta(days=90)
    df_d = df_d[df_d["dataEnvio_dt"] >= cutoff]
    grp = df_d.groupby(df_d["dataEnvio_dt"].dt.date).agg(
        gap=("gap", "sum"),
        n=("id", "count"),
    ).reset_index()
    grp = grp.sort_values("dataEnvio_dt")
    for _, r in grp.iterrows():
        serie_diaria_gap.append({
            "data": str(r["dataEnvio_dt"]),
            "gap": float(r["gap"]),
            "n": int(r["n"]),
        })

# === Top clientes "anti-clientes" - quem mais consumiu subsidio FG ===
# Nota: a base do frete CSV so contem pedidos com dataEnvio (Entregue/Enviado/etc),
# entao cancelados/devolvidos ja foram excluidos pela fonte. Usamos a definicao
# pragmatica: clientes que mais somaram custo de frete absorvido em pedidos FG
# (frete=0). Sao os candidatos naturais a cortar do programa.
top_clientes_subsidiados = []
if "cliente_cpf_cnpj" in df.columns:
    fg = df[df["frete"] == 0].copy()
    if len(fg) > 0:
        fg["cliente_chave"] = fg["cliente_cpf_cnpj"].astype(str)
        fg.loc[fg["cliente_chave"].isin(["", "nan", "None"]), "cliente_chave"] = (
            fg["cliente_id"].astype(str)
        )
        grp = fg.groupby("cliente_chave").agg(
            n_pedidos_fg=("id", "count"),
            custo_frete_absorvido=("freteEmpresa", "sum"),
            valor_pedido_total=("total_pedido", "sum"),
            cliente=("cliente_nome", "first"),
        ).reset_index()
        grp["pct_frete_sobre_pedido"] = grp.apply(
            lambda r: (r["custo_frete_absorvido"] / r["valor_pedido_total"])
            if r["valor_pedido_total"] > 0 else 0,
            axis=1,
        )
        grp = grp.sort_values("custo_frete_absorvido", ascending=False).head(20)
        for _, r in grp.iterrows():
            top_clientes_subsidiados.append({
                "cliente": str(r.get("cliente", "") or "")[:50],
                "n_pedidos_fg": int(r["n_pedidos_fg"]),
                "custo_frete_absorvido": float(r["custo_frete_absorvido"]),
                "valor_pedido_total": float(r["valor_pedido_total"]),
                "pct_frete_sobre_pedido": float(r["pct_frete_sobre_pedido"]),
            })

# === Output ===
data = {
    "kpis": kpis,
    "por_transportadora": por_transp,
    "faixas_gap": faixas_gap,
    "top_piores": top_piores,
    "frete_zero": frete_zero,
    "frete_zero_por_transp": frete_zero_por_transp,
    "por_faixa_valor_pedido": por_faixa_valor_pedido,
    "cenarios_corte": cenarios_corte,
    "serie_diaria_gap": serie_diaria_gap,
    "top_clientes_subsidiados": top_clientes_subsidiados,
    "gerado_em": "build-time",
}

OUT.write_text(
    f"window.FRETE_DATA = {json.dumps(data, ensure_ascii=False, default=str)};\n",
    encoding="utf-8",
)
print(f"OK frete-data.js gerado em {OUT} ({OUT.stat().st_size} bytes)")
print(f"  Envios: {n_envios:,} | Gap total: R$ {gap_total/1000:.1f}k em {meses} meses")
print(f"  Gap anualizado: R$ {gap_anualizado/1000:.1f}k | Frete zero: {pct_frete_zero*100:.1f}%")
br_row = next((t for t in por_transp if t["nome"] == "BRASPRESS"), None)
if br_row:
    print(f"  Braspress: n={br_row['n']}, ratio={br_row['ratio_custo_cobrado']:.2f}x, gap=R$ {br_row['gap_total']/1000:.1f}k")
if cenarios_corte:
    c700 = next((c for c in cenarios_corte if c["X"] == 700), None)
    if c700:
        print(f"  Cenario X=R$700: {c700['n_envios_afetados']} envios, economia anual R$ {c700['economia_anual']/1000:.1f}k")
print(f"  Por faixa valor: {len(por_faixa_valor_pedido)} buckets | Clientes devolvedores: {len(top_clientes_subsidiados)}")
