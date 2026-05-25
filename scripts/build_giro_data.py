"""build_giro_data.py V2 — pre-computa 6 cubos reativos para PageGiroEstoque.

Equivale ao Streamlit em astro-giro-bi/pages/1_Giro_Estoque.py, mas pre-calcula
6 valores possiveis do slider de cobertura (corte_meses in [3,6,9,12,18,24])
e tambem inclui o universo COMPLETO (sem nao-movidos) pra checkbox reativo.

Output: window.GIRO_DATA = {
  metadata,
  kpis_por_corte: { '3': {...}, '6': {...}, ..., '24': {...} },
  aging_completo: [{faixa, qtd, valor, cdi}, ...],
  kits_dedup: { qtd_removido, valor_removido },
  familias_por_corte: { '6': [top 50], '12': [...], '18': [...], '24': [...] },
  produtos_flat: [top 500 do corte 6m, completo],
  filtros: { marcas, categorias, fornecedores },
}

Cada cubo de kpis_por_corte tem DOIS sub-cubos:
  - 'com_nao_movido': inclui qtd_12m=0
  - 'sem_nao_movido': exclui qtd_12m=0
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

CORTES = [3, 6, 9, 12, 18, 24]
TOP_FAMILIAS = 50
TOP_PRODUTOS = 500


# ---------- helpers ----------
def _num(v):
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
dim_raw = _load_json("dim_produto.json") or []
meta_raw = _load_json("meta.json") or {}

dim = []
for r in dim_raw:
    rec = dict(r)
    rec["qtd_12m"] = _num(rec.get("qtd_12m"))
    rec["estoque_atual"] = _num(rec.get("estoque_atual"))
    rec["valor_estoque_custo"] = _num(rec.get("valor_estoque_custo"))
    rec["cdi_mes"] = _num(rec.get("cdi_mes"))
    rec["receita_12m"] = _num(rec.get("receita_12m"))
    rec["dias_sem_venda"] = _num(rec.get("dias_sem_venda"))
    rec["vendas_mes"] = rec["qtd_12m"] / 12.0
    if rec["vendas_mes"] > 0:
        rec["cobertura_meses"] = rec["estoque_atual"] / rec["vendas_mes"]
    else:
        rec["cobertura_meses"] = float("inf")
    rec["is_nao_movido"] = rec["qtd_12m"] == 0
    rec["kit_duplica_simples"] = bool(rec.get("kit_duplica_simples"))
    dim.append(rec)

# dedup kits
dedup = [r for r in dim if not r["kit_duplica_simples"]]

# So produtos com estoque > 0 sao candidatos a giro
estoque = [r for r in dedup if r["estoque_atual"] > 0]

total_rs = sum(r["valor_estoque_custo"] for r in estoque)


# ---------- KPIs por corte (slider reativo) ----------
def kpis_for(corte, incluir_nao_mov):
    """Retorna KPIs do universo slow moving para (corte, incluir_nao_mov)."""
    slow = []
    for r in estoque:
        cob = r["cobertura_meses"]
        if r["is_nao_movido"]:
            if not incluir_nao_mov:
                continue
            slow.append(r)
        elif math.isfinite(cob) and cob >= corte:
            slow.append(r)
    s_rs = sum(r["valor_estoque_custo"] for r in slow)
    s_cdi = sum(r["cdi_mes"] for r in slow)
    return {
        "estoque_total_rs": total_rs,
        "slow_rs": s_rs,
        "slow_cdi": s_cdi,
        "slow_pct": (s_rs / total_rs) if total_rs else 0.0,
        "n_slow": len(slow),
    }


kpis_por_corte = {}
for c in CORTES:
    kpis_por_corte[str(c)] = {
        "com_nao_movido": kpis_for(c, True),
        "sem_nao_movido": kpis_for(c, False),
    }


# ---------- Aging completo dos nao-vendidos (independente de corte) ----------
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

nao_mov = [r for r in estoque if r["is_nao_movido"]]
aging_map = defaultdict(lambda: {"qtd": 0, "valor": 0.0, "cdi": 0.0})
for r in nao_mov:
    f = _faixa(r["dias_sem_venda"])
    aging_map[f]["qtd"] += 1
    aging_map[f]["valor"] += r["valor_estoque_custo"]
    aging_map[f]["cdi"] += r["cdi_mes"]

aging_completo = []
for f in ORDEM_FAIXAS:
    if f in aging_map:
        aging_completo.append({
            "faixa": f,
            "qtd": aging_map[f]["qtd"],
            "valor": aging_map[f]["valor"],
            "cdi": aging_map[f]["cdi"],
        })

# Detalhamento por produto: TODOS os nao-vendidos (Bloco 2 detalhado)
nao_vendidos_detalhe = []
for r in sorted(nao_mov, key=lambda x: x["valor_estoque_custo"], reverse=True):
    nao_vendidos_detalhe.append({
        "id_produto": _str(r.get("id_produto")),
        "nome": _str(r.get("nome")),
        "seo_title": _str(r.get("seo_title")),
        "marca": _str(r.get("marca")),
        "categoria_mae": _str(r.get("categoria_mae")),
        "nome_fornecedor": _str(r.get("nome_fornecedor")),
        "estoque_atual": r["estoque_atual"],
        "valor_estoque_custo": r["valor_estoque_custo"],
        "cdi_mes": r["cdi_mes"],
        "dias_sem_venda": (
            r["dias_sem_venda"] if math.isfinite(r["dias_sem_venda"]) and r["dias_sem_venda"] < 99999 else None
        ),
        "faixa": _faixa(r["dias_sem_venda"]),
    })


# ---------- Familias por corte ----------
def familias_for(corte):
    """Retorna lista (ja sorted desc por valor_parado, top TOP_FAMILIAS) das familias slow."""
    fam_agg = defaultdict(lambda: {
        "qtd_produtos": 0,
        "estoque": 0.0,
        "qtd_12m": 0.0,
        "receita_12m": 0.0,
        "valor_parado": 0.0,
        "cdi_mes": 0.0,
        "marca": "",
        "categoria_mae": "",
    })
    for r in estoque:
        cob = r["cobertura_meses"]
        is_slow = r["is_nao_movido"] or (math.isfinite(cob) and cob >= corte)
        if not is_slow:
            continue
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

    out = []
    for seo, a in fam_agg.items():
        vm = a["qtd_12m"] / 12.0
        cob = (a["estoque"] / vm) if vm > 0 else float("inf")
        out.append({
            "seo_title": seo,
            "marca": a["marca"],
            "categoria_mae": a["categoria_mae"],
            "qtd_produtos": a["qtd_produtos"],
            "estoque": a["estoque"],
            "vendas_mes": vm,
            "cobertura_meses": cob if math.isfinite(cob) else None,
            "receita_12m": a["receita_12m"],
            "valor_parado": a["valor_parado"],
            "cdi_mes": a["cdi_mes"],
        })
    out.sort(key=lambda x: x["valor_parado"], reverse=True)
    return out


# Pre-computa para cortes relevantes (slider usa estes; demais cortes intermediarios
# o frontend mostra usando o cubo mais proximo se nao for um dos 4 chave).
FAMILIAS_CORTES = [6, 12, 18, 24]
familias_por_corte = {}
familias_total_por_corte = {}
for c in FAMILIAS_CORTES:
    full = familias_for(c)
    familias_total_por_corte[str(c)] = len(full)
    familias_por_corte[str(c)] = full[:TOP_FAMILIAS]


# ---------- Produtos flat (corte 6m, completo top 500) ----------
def slow_list_for(corte):
    out = []
    for r in estoque:
        cob = r["cobertura_meses"]
        if r["is_nao_movido"] or (math.isfinite(cob) and cob >= corte):
            out.append(r)
    return out


slow_6m = slow_list_for(6)
slow_6m_sorted = sorted(slow_6m, key=lambda r: r["valor_estoque_custo"], reverse=True)
produtos_flat = []
for r in slow_6m_sorted[:TOP_PRODUTOS]:
    produtos_flat.append({
        "codigo": _str(r.get("codigo")),
        "id_produto": _str(r.get("id_produto")),
        "nome": _str(r.get("nome")),
        "seo_title": _str(r.get("seo_title")),
        "marca": _str(r.get("marca")),
        "nome_fornecedor": _str(r.get("nome_fornecedor")),
        "categoria_mae": _str(r.get("categoria_mae")),
        "estoque_atual": r["estoque_atual"],
        "vendas_mes": r["vendas_mes"],
        "cobertura_meses": r["cobertura_meses"] if math.isfinite(r["cobertura_meses"]) else None,
        "valor_estoque_custo": r["valor_estoque_custo"],
        "cdi_mes": r["cdi_mes"],
        "receita_12m": r["receita_12m"],
        "dias_sem_venda": (
            r["dias_sem_venda"] if math.isfinite(r["dias_sem_venda"]) and r["dias_sem_venda"] < 99999 else None
        ),
    })


def _uniq_sorted(items, key):
    return sorted({it[key] for it in items if it.get(key)})


# Filtros globais (universo: estoque > 0)
filtros = {
    "marcas": _uniq_sorted(produtos_flat, "marca"),
    "categorias": _uniq_sorted(produtos_flat, "categoria_mae"),
    "fornecedores": _uniq_sorted(produtos_flat, "nome_fornecedor"),
}


# ---------- Kits dedup ----------
kit_csv = ENGINE / "kits_pareados_v2.csv"
qtd_dup = sum(1 for r in dim if r["kit_duplica_simples"])
valor_dup = 0.0
if kit_csv.exists():
    with open(kit_csv, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            valor_dup += _num(row.get("kit_valor_estoque"))

kits_dedup = {
    "qtd_removido": qtd_dup,
    "valor_removido": valor_dup,
}


# ---------- Metadata ----------
metadata = {
    "data_snapshot": meta_raw.get("gerado_em"),
    "snapshot_estoque": meta_raw.get("snapshot_estoque"),
    "cdi_anual_pct": meta_raw.get("cdi_anual"),
    "linhas_dim_produto": meta_raw.get("linhas_dim_produto"),
    "n_skus_com_estoque": len(estoque),
    "cortes_disponiveis": CORTES,
    "familias_cortes_disponiveis": FAMILIAS_CORTES,
    "familias_total_por_corte": familias_total_por_corte,
    "n_top_familias": TOP_FAMILIAS,
    "n_top_produtos": TOP_PRODUTOS,
    "n_nao_vendidos_detalhe": len(nao_vendidos_detalhe),
}


# ---------- payload final ----------
payload = {
    "metadata": metadata,
    "kpis_por_corte": kpis_por_corte,
    "aging_completo": aging_completo,
    "nao_vendidos_detalhe": nao_vendidos_detalhe,
    "kits_dedup": kits_dedup,
    "familias_por_corte": familias_por_corte,
    "produtos_flat": produtos_flat,
    "filtros": filtros,
}


def _default_enc(o):
    return str(o)


OUT.write_text(
    f"window.GIRO_DATA = {json.dumps(payload, ensure_ascii=False, default=_default_enc)};\n",
    encoding="utf-8",
)

size_kb = OUT.stat().st_size / 1024
print(f"OK giro-data.js V2 gerado em {OUT} ({size_kb:.1f} KB)")
print(f"  Estoque total custo: R$ {total_rs/1e6:.2f}M  |  SKUs com estoque: {len(estoque):,}")
print(f"  Cortes pre-computados: {CORTES}")
for c in CORTES:
    k = kpis_por_corte[str(c)]["com_nao_movido"]
    print(
        f"    corte {c:>2}m (com nao-mov): slow R$ {k['slow_rs']/1e6:.2f}M ({k['slow_pct']*100:.1f}%) | "
        f"{k['n_slow']:,} produtos | CDI/m R$ {k['slow_cdi']/1e3:.1f}k"
    )
print(f"  Familias pre-comp pra cortes: {FAMILIAS_CORTES}  |  Top {TOP_FAMILIAS} cada")
print(f"  Produtos flat (corte 6m): {len(produtos_flat)} top 500 de {len(slow_6m):,} slow")
print(f"  Nao-vendidos detalhe: {len(nao_vendidos_detalhe):,} produtos completos")
print(f"  Aging faixas presentes: {[a['faixa'] for a in aging_completo]}")
print(f"  Kits dedup: {qtd_dup} kits ({valor_dup/1e3:.1f}k R$)")
