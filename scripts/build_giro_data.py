"""Le engine_output/ -> giro-data.js com tudo pre-calculado pra PageGiroEstoque.

Equivale ao Streamlit em astro-giro-bi/pages/1_Giro_Estoque.py mas:
- Tudo agregado em build-time (slider de cobertura fica estatico em 6m por padrao).
- Slow moving = cobertura_meses >= 6 (incluindo nao-movidos qtd_12m=0).
- Aging por faixa de dias_sem_venda dos produtos nao-vendidos.
- Top 30 familias slow + lista plana de 100 produtos slow.
- Dedup de kits lida em kits_pareados_v2.csv (qtd + R$).

Output: window.GIRO_DATA = { kpis, aging, familias, produtos, kit_dedup, meta }.
"""
from __future__ import annotations

import csv
import json
import math
import pathlib
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINE = ROOT / "raw-data" / "engine_output"
OUT = ROOT / "giro-data.js"

CORTE_COB_MESES = 6  # politica default Filipe: cobertura >= 6m == slow moving
TOP_FAMILIAS = 30
TOP_PRODUTOS = 100

# ---------- helpers ----------
def _num(v):
    """Converte pra float, tratando None/NaN/inf como 0."""
    if v is None:
        return 0.0
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return f
    except (TypeError, ValueError):
        return 0.0


def _str(v):
    if v is None:
        return ""
    return str(v).strip()


def _load_json(name):
    p = ENGINE / name
    if not p.exists():
        return None
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------- carga ----------
dim = _load_json("dim_produto.json") or []
meta = _load_json("meta.json") or {}
kpis_raw = _load_json("kpis.json") or {}

# Normaliza campos numericos e derivados
for r in dim:
    r["qtd_12m"] = _num(r.get("qtd_12m"))
    r["estoque_atual"] = _num(r.get("estoque_atual"))
    r["valor_estoque_custo"] = _num(r.get("valor_estoque_custo"))
    r["valor_estoque_venda"] = _num(r.get("valor_estoque_venda"))
    r["cdi_mes"] = _num(r.get("cdi_mes"))
    r["receita_12m"] = _num(r.get("receita_12m"))
    r["dias_sem_venda"] = _num(r.get("dias_sem_venda"))
    r["vendas_mes"] = r["qtd_12m"] / 12.0
    r["cobertura_meses"] = (
        (r["estoque_atual"] / r["vendas_mes"]) if r["vendas_mes"] > 0 else float("inf")
    )
    r["is_nao_movido"] = r["qtd_12m"] == 0
    # tratamento dedup de kits: pula quem ja foi marcado como duplicador
    r["kit_duplica_simples"] = bool(r.get("kit_duplica_simples"))

# remove kits que duplicam simples (mesma regra do Streamlit)
dedup = [r for r in dim if not r["kit_duplica_simples"]]

# considera apenas produtos com estoque > 0 pra giro (sem estoque nao e slow)
estoque = [r for r in dedup if r["estoque_atual"] > 0]


def is_slow(r):
    # incluir_nao_movido = True (default do streamlit): cobertura >= corte OU nao-movido
    cob = r["cobertura_meses"]
    if r["is_nao_movido"]:
        return True
    if not math.isfinite(cob):
        return True
    return cob >= CORTE_COB_MESES


slow = [r for r in estoque if is_slow(r)]

# ---------- KPIs ----------
total_rs = sum(r["valor_estoque_custo"] for r in estoque)
slow_rs = sum(r["valor_estoque_custo"] for r in slow)
slow_cdi = sum(r["cdi_mes"] for r in slow)
slow_pct = (slow_rs / total_rs) if total_rs else 0.0

nao_mov = [r for r in estoque if r["is_nao_movido"]]
nao_mov_rs = sum(r["valor_estoque_custo"] for r in nao_mov)
nao_mov_cdi = sum(r["cdi_mes"] for r in nao_mov)

kpis = {
    "valor_estoque_custo": total_rs,
    "slow_rs": slow_rs,
    "slow_cdi": slow_cdi,
    "slow_pct": slow_pct,
    "slow_qtd": len(slow),
    "nao_mov_qtd": len(nao_mov),
    "nao_mov_rs": nao_mov_rs,
    "nao_mov_cdi": nao_mov_cdi,
    "corte_meses": CORTE_COB_MESES,
    "total_skus_com_estoque": len(estoque),
}

# ---------- Aging dos nao-vendidos ----------
def _faixa(dias):
    if dias is None or not math.isfinite(dias) or dias >= 99999:
        return "Nunca vendido"
    if dias < 90:
        return "Sem venda <3 meses"
    if dias < 180:
        return "Sem venda 3-6 meses"
    if dias < 365:
        return "Sem venda 6-12 meses"
    if dias < 730:
        return "Sem venda 12-24 meses"
    return "Sem venda >24 meses"


ORDEM_FAIXAS = [
    "Sem venda <3 meses",
    "Sem venda 3-6 meses",
    "Sem venda 6-12 meses",
    "Sem venda 12-24 meses",
    "Sem venda >24 meses",
    "Nunca vendido",
]

aging_map = defaultdict(lambda: {"qtd": 0, "valor": 0.0, "cdi": 0.0})
for r in nao_mov:
    f = _faixa(r["dias_sem_venda"])
    aging_map[f]["qtd"] += 1
    aging_map[f]["valor"] += r["valor_estoque_custo"]
    aging_map[f]["cdi"] += r["cdi_mes"]

aging = []
for f in ORDEM_FAIXAS:
    if f in aging_map:
        aging.append(
            {
                "faixa": f,
                "qtd": aging_map[f]["qtd"],
                "valor": aging_map[f]["valor"],
                "cdi": aging_map[f]["cdi"],
            }
        )

# ---------- Familias (seo_title) slow ----------
fam_agg = defaultdict(
    lambda: {
        "qtd_produtos": 0,
        "estoque": 0.0,
        "qtd_12m": 0.0,
        "receita_12m": 0.0,
        "valor_parado": 0.0,
        "cdi_mes": 0.0,
        "marca": "",
        "categoria_mae": "",
    }
)
for r in slow:
    seo = _str(r.get("seo_title")) or "(sem seo_title)"
    a = fam_agg[seo]
    a["qtd_produtos"] += 1
    a["estoque"] += r["estoque_atual"]
    a["qtd_12m"] += r["qtd_12m"]
    a["receita_12m"] += r["receita_12m"]
    a["valor_parado"] += r["valor_estoque_custo"]
    a["cdi_mes"] += r["cdi_mes"]
    if not a["marca"]:
        a["marca"] = _str(r.get("marca"))
    if not a["categoria_mae"]:
        a["categoria_mae"] = _str(r.get("categoria_mae"))

familias_full = []
for seo, a in fam_agg.items():
    vendas_mes = a["qtd_12m"] / 12.0
    cob = (a["estoque"] / vendas_mes) if vendas_mes > 0 else float("inf")
    familias_full.append(
        {
            "seo_title": seo,
            "marca": a["marca"],
            "categoria_mae": a["categoria_mae"],
            "qtd_produtos": a["qtd_produtos"],
            "estoque": a["estoque"],
            "vendas_mes": vendas_mes,
            "cobertura_meses": cob if math.isfinite(cob) else None,
            "receita_12m": a["receita_12m"],
            "valor_parado": a["valor_parado"],
            "cdi_mes": a["cdi_mes"],
        }
    )

familias_full.sort(key=lambda x: x["valor_parado"], reverse=True)
familias = familias_full[:TOP_FAMILIAS]

# ---------- Produtos slow flat (top 100 por valor parado) ----------
slow_sorted = sorted(slow, key=lambda r: r["valor_estoque_custo"], reverse=True)
produtos = []
for r in slow_sorted[:TOP_PRODUTOS]:
    cob = r["cobertura_meses"]
    produtos.append(
        {
            "codigo": _str(r.get("codigo")),
            "id_produto": _str(r.get("id_produto")),
            "nome": _str(r.get("nome")),
            "seo_title": _str(r.get("seo_title")),
            "marca": _str(r.get("marca")),
            "nome_fornecedor": _str(r.get("nome_fornecedor")),
            "categoria_mae": _str(r.get("categoria_mae")),
            "estoque_atual": r["estoque_atual"],
            "vendas_mes": r["vendas_mes"],
            "cobertura_meses": cob if math.isfinite(cob) else None,
            "valor_estoque_custo": r["valor_estoque_custo"],
            "cdi_mes": r["cdi_mes"],
            "dias_sem_venda": r["dias_sem_venda"]
            if math.isfinite(r["dias_sem_venda"]) and r["dias_sem_venda"] < 99999
            else None,
        }
    )

# Filtros possiveis (universo da lista mostrada)
def _uniq_sorted(items, key):
    s = sorted({it[key] for it in items if it[key]})
    return s


filtros = {
    "marcas": _uniq_sorted(produtos, "marca"),
    "categorias": _uniq_sorted(produtos, "categoria_mae"),
    "fornecedores": _uniq_sorted(produtos, "nome_fornecedor"),
}

# ---------- Kit dedup ----------
kit_csv = ENGINE / "kits_pareados_v2.csv"
qtd_dup = sum(1 for r in dim if r["kit_duplica_simples"])
valor_dup = 0.0
if kit_csv.exists():
    with open(kit_csv, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            valor_dup += _num(row.get("kit_valor_estoque"))

kit_dedup = {
    "qtd_dup_removido": qtd_dup,
    "valor_dup_removido": valor_dup,
}

# ---------- payload final ----------
payload = {
    "kpis": kpis,
    "aging": aging,
    "familias": familias,
    "familias_total": len(familias_full),
    "produtos": produtos,
    "produtos_total": len(slow),
    "filtros": filtros,
    "kit_dedup": kit_dedup,
    "meta": {
        "snapshot_em": meta.get("gerado_em"),
        "snapshot_estoque": meta.get("snapshot_estoque"),
        "cdi_anual": meta.get("cdi_anual"),
        "corte_cobertura_meses": CORTE_COB_MESES,
    },
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.GIRO_DATA = {json.dumps(payload, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)

size_kb = OUT.stat().st_size / 1024
print(f"OK giro-data.js gerado em {OUT} ({size_kb:.1f} KB)")
print(
    f"  Estoque total custo: R$ {total_rs/1e6:.2f}M  |  Slow (cob>={CORTE_COB_MESES}m): "
    f"R$ {slow_rs/1e6:.2f}M ({slow_pct*100:.1f}%)  |  CDI/mes perdido: R$ {slow_cdi/1e3:.1f}k"
)
print(
    f"  Slow produtos: {len(slow):,}  |  Nao-movidos: {len(nao_mov):,}  |  Familias slow: {len(familias_full):,}"
)
print(
    f"  Kit dedup: {qtd_dup} kits ({valor_dup/1e3:.1f}k R$ removidos)"
)
