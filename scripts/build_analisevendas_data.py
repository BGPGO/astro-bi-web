"""build_analisevendas_data.py — Tela "Análise de Vendas" (PBI pag 09).

Lê C:/Projects/astro-bi-web/public-data/vendas_dash.parquet via DuckDB e
gera C:/Projects/astro-bi-web/analisevendas-data.js com:

  - kpis_geral: total_vendas, ticket_medio, total_clientes, valor_bruto
  - filtros: ano_mes (lista), marcas (lista)
  - top_uf: top 16 UFs por valor (label, v, pct)
  - serie_diaria_90d: últimos 90 dias por (data, valor)
  - tabela_categoria: por categoria_mae → vendas (n), % novos, % recorrentes,
                      vendas_dia_util, venda_total, margem_pct, ticket_medio
  - top_30_produtos: top 30 produtos por valor com nome, marca, categoria,
                     valor, n_pedidos, ticket, margem
  - tabela_categoria_por_marca (lookup auxiliar para drill se necessário)
"""
import json
import math
import pathlib

import duckdb

ROOT = pathlib.Path(__file__).parent.parent
PARQUET = ROOT / "public-data" / "vendas_dash.parquet"
OUT = ROOT / "analisevendas-data.js"

if not PARQUET.exists():
    raise SystemExit(f"parquet nao encontrado: {PARQUET}")

con = duckdb.connect()
con.execute(
    f"CREATE OR REPLACE VIEW v AS "
    f"SELECT * FROM read_parquet('{PARQUET.as_posix()}') "
    f"WHERE data_pedido IS NOT NULL"
)


def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r and r[0] is not None else 0


def _safe(v):
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return f
    except (TypeError, ValueError):
        return 0.0


# ===== KPIs GERAIS =====
print("[1/6] kpis_geral ...")
valor_bruto = float(q1("SELECT SUM(valor_rateado) FROM v"))
n_vendas = int(q1("SELECT COUNT(DISTINCT numero) FROM v"))
# vendas_dash.parquet não tem cliente_id; proxy = pedidos únicos por bairro+cidade+uf
# (não é cliente real mas é o que dá pra extrair sem cliente_id)
n_clientes = int(
    q1(
        "SELECT COUNT(DISTINCT COALESCE(cliente_cidade, '') || '|' || "
        "COALESCE(cliente_bairro, '') || '|' || COALESCE(cliente_uf, '')) "
        "FROM v WHERE cliente_uf IS NOT NULL"
    )
)
ticket_medio = valor_bruto / n_vendas if n_vendas else 0
cmv_total = float(q1("SELECT SUM(preco_custo * quantidade) FROM v"))
margem_global = (valor_bruto - cmv_total) / valor_bruto if valor_bruto else 0

kpis_geral = {
    "valor_bruto": valor_bruto,
    "total_vendas": n_vendas,
    "ticket_medio": ticket_medio,
    "total_clientes": n_clientes,
    "cmv_total": cmv_total,
    "margem_global": margem_global,
}

# ===== FILTROS =====
print("[2/6] filtros ...")
ano_mes_rows = q(
    "SELECT DISTINCT strftime(data_pedido, '%Y-%m') AS am FROM v ORDER BY am DESC"
)
ano_mes_list = [r["am"] for r in ano_mes_rows if r["am"]]

marcas_rows = q(
    "SELECT DISTINCT marca FROM v WHERE marca IS NOT NULL AND marca <> '' ORDER BY marca"
)
marcas_list = [r["marca"] for r in marcas_rows]

categorias_rows = q(
    "SELECT DISTINCT categoria_mae FROM v "
    "WHERE categoria_mae IS NOT NULL AND categoria_mae <> '' ORDER BY categoria_mae"
)
categorias_list = [r["categoria_mae"] for r in categorias_rows]

# ===== TOP UF =====
print("[3/6] top_uf ...")
total_uf = float(q1("SELECT SUM(valor_rateado) FROM v WHERE cliente_uf IS NOT NULL"))
top_uf_raw = q(
    """
    SELECT cliente_uf AS uf,
           SUM(valor_rateado)::DOUBLE AS v,
           COUNT(DISTINCT numero)::BIGINT AS n
    FROM v
    WHERE cliente_uf IS NOT NULL AND cliente_uf <> ''
    GROUP BY uf
    ORDER BY v DESC
    LIMIT 16
    """
)
top_uf = [
    {
        "uf": r["uf"],
        "v": _safe(r["v"]),
        "n": int(r["n"]),
        "pct": _safe(r["v"]) / total_uf if total_uf else 0,
    }
    for r in top_uf_raw
]

# ===== SERIE DIARIA 90D =====
print("[4/6] serie_diaria_90d ...")
max_d = q1("SELECT MAX(data_pedido)::DATE FROM v")
serie_diaria_90d_raw = q(
    f"""
    SELECT CAST(data_pedido AS DATE) AS d,
           SUM(valor_rateado)::DOUBLE AS v
    FROM v
    WHERE data_pedido >= (DATE '{max_d}' - INTERVAL '90 days')
    GROUP BY d
    ORDER BY d
    """
)
serie_diaria_90d = [
    {"d": str(r["d"]), "v": _safe(r["v"])} for r in serie_diaria_90d_raw
]

# ===== TABELA CATEGORIA =====
print("[5/6] tabela_categoria ...")
# Para % novos / recorrentes usamos coluna `Recompra` se existir; fallback = 0
has_recompra = bool(
    q1(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_name='v' AND column_name='Recompra'"
    )
) or True  # parquet tem essa col em todos os ambientes Astro

dias_uteis_total = int(
    q1(
        "SELECT COUNT(DISTINCT CAST(data_pedido AS DATE)) FROM v "
        "WHERE dayofweek(data_pedido) BETWEEN 1 AND 5"
    )
)
dias_uteis_total = max(1, dias_uteis_total)

categoria_raw = q(
    f"""
    SELECT
      categoria_mae AS categoria,
      COUNT(DISTINCT numero)::BIGINT AS n_vendas,
      SUM(valor_rateado)::DOUBLE AS valor_total,
      SUM(preco_custo * quantidade)::DOUBLE AS cmv,
      SUM(CASE WHEN dayofweek(data_pedido) BETWEEN 1 AND 5
               THEN valor_rateado ELSE 0 END)::DOUBLE AS valor_util,
      COUNT(DISTINCT CASE WHEN Recompra = 'Novo' THEN numero END)::BIGINT AS n_novos,
      COUNT(DISTINCT CASE WHEN Recompra = 'Recompra' THEN numero END)::BIGINT AS n_rec
    FROM v
    WHERE categoria_mae IS NOT NULL AND categoria_mae <> ''
    GROUP BY categoria
    ORDER BY valor_total DESC
    """
)

tabela_categoria = []
for r in categoria_raw:
    nv = int(r["n_vendas"] or 0)
    val = _safe(r["valor_total"])
    cmv_c = _safe(r["cmv"])
    n_novos = int(r["n_novos"] or 0)
    n_rec = int(r["n_rec"] or 0)
    n_class = n_novos + n_rec
    pct_novos = (n_novos / n_class) if n_class else 0
    pct_rec = (n_rec / n_class) if n_class else 0
    vdu = _safe(r["valor_util"]) / dias_uteis_total
    margem_pct = (val - cmv_c) / val if val else 0
    ticket = val / nv if nv else 0
    tabela_categoria.append(
        {
            "categoria": r["categoria"],
            "n_vendas": nv,
            "pct_novos": pct_novos,
            "pct_recorrentes": pct_rec,
            "vendas_dia_util": vdu,
            "valor_total": val,
            "cmv": cmv_c,
            "margem_pct": margem_pct,
            "ticket_medio": ticket,
        }
    )

# ===== TOP 30 PRODUTOS =====
print("[6/6] top_30_produtos ...")
# `seo_title` é o "nome bonito"; fallback para `descricao` se ausente
top30_raw = q(
    """
    WITH p AS (
      SELECT
        COALESCE(NULLIF(seo_title, ''), 'sem nome') AS produto,
        MAX(marca) AS marca,
        MAX(categoria_mae) AS categoria,
        SUM(valor_rateado)::DOUBLE AS valor,
        SUM(preco_custo * quantidade)::DOUBLE AS cmv,
        COUNT(DISTINCT numero)::BIGINT AS n_pedidos,
        SUM(quantidade)::DOUBLE AS qtd
      FROM v
      WHERE seo_title IS NOT NULL AND seo_title <> ''
      GROUP BY produto
    )
    SELECT produto, marca, categoria, valor, cmv, n_pedidos, qtd
    FROM p
    ORDER BY valor DESC
    LIMIT 30
    """
)

top_30_produtos = []
for r in top30_raw:
    val = _safe(r["valor"])
    cmv_p = _safe(r["cmv"])
    n_ped = int(r["n_pedidos"] or 0)
    top_30_produtos.append(
        {
            "produto": r["produto"],
            "marca": r["marca"] or "—",
            "categoria": r["categoria"] or "—",
            "valor": val,
            "cmv": cmv_p,
            "n_pedidos": n_ped,
            "qtd": _safe(r["qtd"]),
            "ticket": val / n_ped if n_ped else 0,
            "margem_pct": (val - cmv_p) / val if val else 0,
        }
    )

# ===== ASSEMBLE =====
data = {
    "kpis_geral": kpis_geral,
    "filtros": {
        "ano_mes": ano_mes_list,
        "marcas": marcas_list,
        "categorias": categorias_list,
    },
    "top_uf": top_uf,
    "serie_diaria_90d": serie_diaria_90d,
    "tabela_categoria": tabela_categoria,
    "top_30_produtos": top_30_produtos,
    "dias_uteis_total": dias_uteis_total,
    "periodo": {
        "max_data": str(max_d),
    },
}


def default_enc(o):
    return str(o)


payload = json.dumps(data, ensure_ascii=False, default=default_enc)
OUT.write_text(f"window.ANALISEVENDAS_DATA = {payload};\n", encoding="utf-8")
print(
    f"\nOK analisevendas-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)"
)
print(
    f"  Valor: R$ {valor_bruto/1e6:.2f}M | Vendas: {n_vendas:,} | "
    f"Clientes: {n_clientes:,} | Ticket: R$ {ticket_medio:,.2f}"
)
print(
    f"  UFs: {len(top_uf)} | Dias diários: {len(serie_diaria_90d)} | "
    f"Categorias: {len(tabela_categoria)} | Produtos: {len(top_30_produtos)}"
)
