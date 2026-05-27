"""Le vendas_dash.parquet -> geral-data.js com KPIs Marketing/Comercial mes-a-mes.

Replica a tela PBI "Geral" (pbi_05.png) que e um dashboard de marketing do mes atual,
mas pre-computa para os ultimos 18 meses para permitir navegacao temporal.

Estrutura window.GERAL_DATA:
  meses           : lista ['2024-12', '2025-01', ...] ultimos 18m (asc)
  kpis_por_mes    : dict {mes: {valor_total, valor_recompra, valor_novo, n_pedidos,
                                n_recompra, n_novo, pct_recompra, pct_novo, ticket_total,
                                ticket_recompra, ticket_novo, gasto_ads, cac, roas, cmv, cfv,
                                resultado_bruto, valor_liquido}}
  top_marca_por_mes  : dict {mes: [{marca, valor, pct}, ...] top 15}
  top_cat_por_mes    : dict {mes: [{cat, valor, pct}, ...] top 15}
  top_uf_por_mes     : dict {mes: [{uf, valor, pct}, ...] top 15}
  top_produtos_por_mes: dict {mes: [{produto, marca, valor, qtd}, ...] top 20}
  categorias_disponiveis : lista de categorias_mae (filtro)
  mes_default     : ultimo mes com dados

Notas:
  - Gasto ADS nao temos por mes especifico nesse parquet — estimado heuristicamente
    com base no parquet de campanhas se disponivel; senao 0/null.
  - CFV %  estimado em 6,06% (constante do PBI). CMV via preco_custo * quantidade.
"""
import duckdb
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent.parent
PARQUET = ROOT / "public-data" / "vendas_dash.parquet"
OUT = ROOT / "geral-data.js"
CAMPANHAS = ROOT / "campanhas-data.js"

CFV_PCT = 0.0616

if not PARQUET.exists():
    sys.exit(f"parquet nao encontrado: {PARQUET}")

con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET.as_posix()}')")

cols = [r[0] for r in con.execute("DESCRIBE v").fetchall()]
HAS_RECOMPRA = "Recompra" in cols
HAS_CAT = "categoria_mae" in cols
HAS_UF = "cliente_uf" in cols
HAS_SEO = "seo_title" in cols


def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0


# ============================================================
# 1) Lista de meses (ultimos 18 com pedido)
# ============================================================
meses_rows = q("""
  SELECT strftime(data_pedido, '%Y-%m') AS mes
  FROM v
  GROUP BY mes
  ORDER BY mes DESC
  LIMIT 18
""")
meses = sorted([r["mes"] for r in meses_rows])  # asc
if not meses:
    sys.exit("sem meses na fonte")

# Default = ultimo mes COMPLETO. Abrir a tela no mes parcial em curso (ex: dados
# ate dia 12) subcontaria TODOS os KPIs vs o mes fechado anterior e divergiria do
# PBI (que sempre mostra o mes fechado). Detecta parcial comparando o ultimo dia
# com dados contra o ultimo dia do calendario daquele mes.
import calendar
_max_date = q1("SELECT MAX(data_pedido) FROM v")
_y, _m = map(int, meses[-1].split("-"))
_ult_dia_mes = calendar.monthrange(_y, _m)[1]
_mes_completo = (_max_date is not None) and (_max_date.day >= _ult_dia_mes)
mes_default = meses[-1] if (_mes_completo or len(meses) == 1) else meses[-2]

# ============================================================
# 2) Tenta carregar gasto ADS por mes a partir de campanhas-data.js
# ============================================================
gasto_ads_por_mes = {}
if CAMPANHAS.exists():
    try:
        txt = CAMPANHAS.read_text(encoding="utf-8")
        # window.CAMPANHAS_DATA = {...};
        start = txt.find("{")
        end = txt.rfind("}") + 1
        if start >= 0 and end > start:
            blob = json.loads(txt[start:end])
            for r in (blob.get("gasto_mensal_18m") or []):
                am = r.get("am")
                gasto = r.get("valor") or r.get("gasto") or 0
                if am:
                    gasto_ads_por_mes[am] = float(gasto)
            # se gasto_vs_novos tem ADS, mistura
            for r in (blob.get("gasto_vs_novos_pareados") or blob.get("gasto_vs_novos") or []):
                am = r.get("am")
                gasto = r.get("gasto")
                if am and gasto is not None and am not in gasto_ads_por_mes:
                    gasto_ads_por_mes[am] = float(gasto)
    except Exception as e:
        print(f"  WARN: nao foi possivel parsear campanhas-data.js: {e}")

# ============================================================
# 3) KPIs por mes
# ============================================================
kpis_rows = q("""
  WITH base AS (
    SELECT strftime(data_pedido, '%Y-%m') AS mes,
           numero,
           any_value(Recompra) AS recompra,
           SUM(valor_rateado) AS valor,
           SUM(preco_custo * quantidade) AS cmv
    FROM v
    GROUP BY mes, numero
  )
  SELECT mes,
         COUNT(DISTINCT numero)::INT AS n_pedidos,
         COUNT(DISTINCT CASE WHEN recompra='Recompra' THEN numero END)::INT AS n_recompra,
         COUNT(DISTINCT CASE WHEN recompra='Novo' THEN numero END)::INT AS n_novo,
         SUM(valor)::DOUBLE AS valor_total,
         SUM(CASE WHEN recompra='Recompra' THEN valor ELSE 0 END)::DOUBLE AS valor_recompra,
         SUM(CASE WHEN recompra='Novo' THEN valor ELSE 0 END)::DOUBLE AS valor_novo,
         SUM(cmv)::DOUBLE AS cmv_total
  FROM base
  GROUP BY mes
  ORDER BY mes
""")

kpis_por_mes = {}
for r in kpis_rows:
    mes = r["mes"]
    if mes not in meses:
        continue
    valor_total = float(r["valor_total"] or 0)
    valor_recompra = float(r["valor_recompra"] or 0)
    valor_novo = float(r["valor_novo"] or 0)
    n_pedidos = int(r["n_pedidos"] or 0)
    n_recompra = int(r["n_recompra"] or 0)
    n_novo = int(r["n_novo"] or 0)
    cmv = float(r["cmv_total"] or 0)
    cfv = valor_total * CFV_PCT
    resultado_bruto = valor_total - cmv
    valor_liquido = valor_total - cmv - cfv
    gasto_ads = float(gasto_ads_por_mes.get(mes, 0))
    cac = (gasto_ads / n_novo) if (gasto_ads > 0 and n_novo > 0) else 0
    roas = (valor_novo / gasto_ads) if gasto_ads > 0 else 0
    kpis_por_mes[mes] = {
        "valor_total": valor_total,
        "valor_recompra": valor_recompra,
        "valor_novo": valor_novo,
        "n_pedidos": n_pedidos,
        "n_recompra": n_recompra,
        "n_novo": n_novo,
        "pct_recompra": (n_recompra / n_pedidos) if n_pedidos else 0,
        "pct_novo": (n_novo / n_pedidos) if n_pedidos else 0,
        "pct_valor_recompra": (valor_recompra / valor_total) if valor_total else 0,
        "pct_valor_novo": (valor_novo / valor_total) if valor_total else 0,
        "ticket_total": (valor_total / n_pedidos) if n_pedidos else 0,
        "ticket_recompra": (valor_recompra / n_recompra) if n_recompra else 0,
        "ticket_novo": (valor_novo / n_novo) if n_novo else 0,
        "cmv": cmv,
        "cfv": cfv,
        "resultado_bruto": resultado_bruto,
        "valor_liquido": valor_liquido,
        "gasto_ads": gasto_ads,
        "cac": cac,
        "roas": roas,
        "margem_bruta_pct": (resultado_bruto / valor_total) if valor_total else 0,
        "margem_liq_pct": (valor_liquido / valor_total) if valor_total else 0,
    }


# ============================================================
# 4) Tops por mes (Marca / Categoria / UF / Produto)
# ============================================================
def top_por_mes(dim_col, alias, where_extra="", limit=15):
    rows = q(f"""
      WITH per_mes AS (
        SELECT strftime(data_pedido, '%Y-%m') AS mes,
               {dim_col} AS k,
               SUM(valor_rateado)::DOUBLE AS v
        FROM v
        WHERE {dim_col} IS NOT NULL {('AND ' + where_extra) if where_extra else ''}
        GROUP BY mes, k
      ),
      tot AS (
        SELECT mes, SUM(v) AS tot_mes FROM per_mes GROUP BY mes
      ),
      rk AS (
        SELECT pm.mes, pm.k, pm.v,
               (pm.v / NULLIF(t.tot_mes, 0))::DOUBLE AS pct,
               ROW_NUMBER() OVER (PARTITION BY pm.mes ORDER BY pm.v DESC) AS rn
        FROM per_mes pm JOIN tot t USING (mes)
      )
      SELECT mes, k AS {alias}, v, pct
      FROM rk
      WHERE rn <= {limit}
      ORDER BY mes, v DESC
    """)
    out = {}
    for r in rows:
        out.setdefault(r["mes"], []).append({
            alias: r[alias],
            "valor": float(r["v"] or 0),
            "pct": float(r["pct"] or 0),
        })
    return out


top_marca_por_mes = top_por_mes("marca", "marca")
top_cat_por_mes = top_por_mes("categoria_mae", "cat") if HAS_CAT else {}
top_uf_por_mes = top_por_mes("cliente_uf", "uf") if HAS_UF else {}

# Top produtos por mes
top_produtos_por_mes = {}
if HAS_SEO:
    prod_rows = q("""
      WITH per_mes AS (
        SELECT strftime(data_pedido, '%Y-%m') AS mes,
               seo_title AS produto,
               any_value(marca) AS marca,
               SUM(valor_rateado)::DOUBLE AS v,
               SUM(quantidade)::DOUBLE AS qtd,
               COUNT(DISTINCT numero)::INT AS n
        FROM v
        WHERE seo_title IS NOT NULL
        GROUP BY mes, produto
      ),
      rk AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY mes ORDER BY v DESC) AS rn FROM per_mes
      )
      SELECT mes, produto, marca, v, qtd, n
      FROM rk
      WHERE rn <= 20
      ORDER BY mes, v DESC
    """)
    for r in prod_rows:
        top_produtos_por_mes.setdefault(r["mes"], []).append({
            "produto": r["produto"],
            "marca": r["marca"],
            "valor": float(r["v"] or 0),
            "qtd": float(r["qtd"] or 0),
            "n_pedidos": int(r["n"] or 0),
        })

# ============================================================
# 5) Filtros disponiveis
# ============================================================
categorias_disponiveis = []
if HAS_CAT:
    categorias_disponiveis = [
        r["c"] for r in q("SELECT DISTINCT categoria_mae AS c FROM v WHERE categoria_mae IS NOT NULL ORDER BY c")
    ]

# ============================================================
# OUTPUT
# ============================================================
data = {
    "meses": meses,
    "mes_default": mes_default,
    "kpis_por_mes": kpis_por_mes,
    "top_marca_por_mes": top_marca_por_mes,
    "top_cat_por_mes": top_cat_por_mes,
    "top_uf_por_mes": top_uf_por_mes,
    "top_produtos_por_mes": top_produtos_por_mes,
    "categorias_disponiveis": categorias_disponiveis,
    "cfv_pct": CFV_PCT,
    "gasto_ads_disponivel": len(gasto_ads_por_mes) > 0,
    "gerado_em": "build-time",
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.GERAL_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)

last = kpis_por_mes.get(mes_default, {})
print(f"OK geral-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  Meses: {len(meses)} ({meses[0]} -> {meses[-1]})")
print(f"  Mes default: {mes_default}")
print(f"  Last KPIs: valor_total=R$ {last.get('valor_total', 0)/1e6:.2f}M | n_pedidos={last.get('n_pedidos', 0):,} | %recompra={last.get('pct_recompra', 0)*100:.1f}%")
print(f"  ADS por mes: {len(gasto_ads_por_mes)} meses com gasto carregado de campanhas-data.js")
print(f"  Top marca: {sum(len(v) for v in top_marca_por_mes.values())} linhas | Top cat: {sum(len(v) for v in top_cat_por_mes.values())} | Top uf: {sum(len(v) for v in top_uf_por_mes.values())}")
