"""Le frete_empresa_rj.csv -> frete-data.js com agregados pre-calculados pra PageFreteRJ.

Origem: C:/Projects/astro-giro-bi/data/frete_empresa_rj.csv (5013 envios RJ).
Formato BR: "1.096,71" tem . como milhar e , como decimal — limpa antes do float().

Saida: window.FRETE_DATA = {
  kpis, por_transportadora, faixas_gap, top_piores, frete_zero
}

Migracao da Streamlit pages/2_Frete_RJ.py (Astro). Foco: gap absorvido (custo
real Astro vs cobrado cliente), distribuicao de prejuizo, e quais
transportadoras geram mais sangria.
"""
from __future__ import annotations

import json
import pathlib
import unicodedata

import pandas as pd

# === Paths ===
SRC = pathlib.Path("C:/Projects/astro-giro-bi/data/frete_empresa_rj.csv")
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
            # formato BR: remove ponto (milhar) e troca virgula por ponto
            return float(s.replace(".", "").replace(",", "."))
        # so digitos / ponto -> ja eh formato US
        return float(s)
    except Exception:
        return 0.0


def _norm_transp(name: str) -> str:
    """Normaliza nome de transportadora: tira acento, upper, junta variantes."""
    if not isinstance(name, str) or not name.strip():
        return "OUTROS"
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().upper().strip()
    # remove prefixos
    for pref in ("TRANSPORTADORA ", "TRANSPORTES ", "LTDA"):
        n = n.replace(pref, "").strip()
    n = " ".join(n.split())  # collapse spaces
    # mapeia variantes
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


# === Load ===
if not SRC.exists():
    raise SystemExit(f"Faltam dados de origem: {SRC}")

df = pd.read_csv(SRC, dtype=str).fillna("")
for c in ("frete", "freteEmpresa", "pesoBruto", "pesoLiquido"):
    if c in df.columns:
        df[c] = df[c].map(_br_to_float)
df["transportador_norm"] = df["transportador"].map(_norm_transp)
df["gap"] = df["freteEmpresa"] - df["frete"]  # custo Astro - cobrado cliente

n_envios = int(len(df))
total_cobrado = float(df["frete"].sum())
total_custo = float(df["freteEmpresa"].sum())
gap_total = float(df["gap"].sum())
n_frete_zero = int((df["frete"] == 0).sum())
pct_frete_zero = n_frete_zero / n_envios if n_envios else 0
custo_medio = total_custo / n_envios if n_envios else 0
gap_medio = gap_total / n_envios if n_envios else 0

kpis = {
    "n_envios": n_envios,
    "total_cobrado": total_cobrado,
    "total_custo": total_custo,
    "gap_total": gap_total,
    "n_frete_zero": n_frete_zero,
    "pct_frete_zero": pct_frete_zero,
    "custo_medio": custo_medio,
    "gap_medio": gap_medio,
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
por_transp.sort(key=lambda r: -r["n"])

# === Faixas de gap (custo - cobrado por envio) ===
# Negativo / zero = Astro lucrou; positivo = Astro absorveu (prejuizo).
faixa_defs = [
    ("Lucro (gap ≤ 0)", -1e18, 0),
    ("Neutro (0–10)", 0, 10),
    ("Ruim (10–50)", 10, 50),
    ("Sangrento (50–100)", 50, 100),
    ("Catastrofico (100–200)", 100, 200),
    ("Tragico (200–500)", 200, 500),
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
    faixas_gap.append({
        "faixa": label,
        "n": int(len(sub)),
        "gap_total": float(sub["gap"].sum()),
        "pct": (len(sub) / n_envios) if n_envios else 0,
    })

# === Top 20 piores prejuizos individuais ===
piores = df.nlargest(20, "gap")
top_piores = []
for _, r in piores.iterrows():
    top_piores.append({
        "id": str(r.get("id_request", "")),
        "transportadora": r.get("transportador_norm", ""),
        "peso": float(r.get("pesoBruto", 0) or 0),
        "cobrado": float(r.get("frete", 0) or 0),
        "custo": float(r.get("freteEmpresa", 0) or 0),
        "gap": float(r.get("gap", 0) or 0),
    })

# === Frete zero stats ===
fz = df[df["frete"] == 0]
frete_zero = {
    "n": int(len(fz)),
    "custo_total": float(fz["freteEmpresa"].sum()),
    "peso_medio": float(fz["pesoBruto"].mean()) if len(fz) else 0,
}

# === Output ===
data = {
    "kpis": kpis,
    "por_transportadora": por_transp,
    "faixas_gap": faixas_gap,
    "top_piores": top_piores,
    "frete_zero": frete_zero,
    "gerado_em": "build-time",
}

OUT.write_text(
    f"window.FRETE_DATA = {json.dumps(data, ensure_ascii=False, default=str)};\n",
    encoding="utf-8",
)
print(f"OK frete-data.js gerado em {OUT} ({OUT.stat().st_size} bytes)")
print(f"  Envios: {n_envios:,} | Gap total: R$ {gap_total/1000:.1f}k | Frete zero: {pct_frete_zero*100:.1f}%")
br_row = next((t for t in por_transp if t["nome"] == "BRASPRESS"), None)
if br_row:
    print(f"  Braspress: n={br_row['n']}, ratio custo/cobrado={br_row['ratio_custo_cobrado']:.2f}x")
