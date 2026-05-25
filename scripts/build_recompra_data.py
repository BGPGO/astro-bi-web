"""V2 PROFUNDA - pre-compute completo para Recompra.

Lê vendas_tiny_bu.parquet (Astro) → gera recompra-data.js com TODOS os agregados
do dashboard_recompra.py (1224 linhas, 14+ blocos analíticos).

Estrutura de window.RECOMPRA_DATA:
  kpis_principais          : KPIs (% receita, ticket, n_recorrentes, taxa_global, freq_média)
  serie_mensal_recompra    : últimos 18m, % + n_clientes + receita
  recompra_pf_pj_serie     : série mensal % recompra separada PF/PJ
  taxa_recompra_por_marca  : TODAS as marcas com >=100 pedidos
  ltv_por_marca            : top 30 marcas por LTV
  ltv_por_uf               : 27 UFs com LTV, n_clientes, taxa_recompra local
  ltv_por_cat              : top 20 categorias_mae
  produtos_gateway         : top 30 produtos com maior taxa recompra subsequente
  produtos_segunda_compra  : top 20 produtos comprados na 2ª compra
  gateway_to_marca         : mapa (seo_gateway -> top marca da 2a compra)
  coortes_mensais          : matriz 12x12 retenção
  tempo_entre_compras      : histograma dias 1ª → 2ª compra
  clientes_por_tipo        : PF vs PJ → taxa, LTV, ticket
  dispersao_marca_x_uf     : matriz top 10 marcas × top 10 UFs
  filtros                  : lista UFs e categorias para selects
"""
import duckdb
import json
import pathlib

PARQUET = pathlib.Path("C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet")
OUT = pathlib.Path(__file__).parent.parent / "recompra-data.js"

if not PARQUET.exists():
    raise SystemExit(f"parquet nao encontrado: {PARQUET}")

con = duckdb.connect()
con.execute(f"""
  CREATE OR REPLACE VIEW v AS
  SELECT * FROM read_parquet('{PARQUET.as_posix()}')
  WHERE situacao <> 'Cancelado'
""")

# Lista de colunas (defensiva — depende do parquet)
cols = [r[0] for r in con.execute("DESCRIBE v").fetchall()]
HAS_TIPO_PESSOA = "cliente_tipo_pessoa" in cols
HAS_CAT_MAE = "categoria_mae" in cols
HAS_SUBCAT = "sub_categoria" in cols
HAS_UF = "cliente_uf" in cols

# orders distintos com mes ISO
con.execute("""
  CREATE OR REPLACE VIEW orders AS
  SELECT DISTINCT numero, cliente_id, data_pedido, Recompra,
         strftime(data_pedido, '%Y-%m') AS mes
  FROM v
""")

# receita agregada por pedido
con.execute("""
  CREATE OR REPLACE VIEW order_receita AS
  SELECT numero,
         any_value(cliente_id) AS cliente_id,
         any_value(Recompra) AS Recompra,
         any_value(strftime(data_pedido, '%Y-%m')) AS mes,
         any_value(data_pedido) AS data_pedido,
         SUM(valor_rateado) AS receita
  FROM v
  GROUP BY numero
""")


def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0


# ============================================================
# 1) KPIs PRINCIPAIS
# ============================================================
receita_recompra = float(q1("SELECT SUM(receita) FROM order_receita WHERE Recompra='Recompra'") or 0)
receita_novo = float(q1("SELECT SUM(receita) FROM order_receita WHERE Recompra='Novo'") or 0)
receita_total = receita_recompra + receita_novo

n_recompra = int(q1("SELECT COUNT(*) FROM order_receita WHERE Recompra='Recompra'") or 0)
n_novo = int(q1("SELECT COUNT(*) FROM order_receita WHERE Recompra='Novo'") or 0)

ticket_recompra = receita_recompra / n_recompra if n_recompra else 0
ticket_novo = receita_novo / n_novo if n_novo else 0
ticket_delta_pct = (ticket_recompra - ticket_novo) / ticket_novo if ticket_novo else 0

n_recorrentes = int(q1("""
  SELECT COUNT(DISTINCT cliente_id)
  FROM order_receita
  WHERE Recompra = 'Recompra' AND cliente_id IS NOT NULL
""") or 0)

n_clientes_novos = int(q1("""
  SELECT COUNT(DISTINCT cliente_id)
  FROM order_receita
  WHERE Recompra = 'Novo' AND cliente_id IS NOT NULL
""") or 0)

taxa_global = float(q1("""
  WITH novos AS (
    SELECT DISTINCT cliente_id FROM order_receita
    WHERE Recompra='Novo' AND cliente_id IS NOT NULL
  ),
  voltaram AS (
    SELECT DISTINCT o.cliente_id
    FROM order_receita o JOIN novos n USING (cliente_id)
    WHERE o.Recompra='Recompra'
  )
  SELECT (SELECT COUNT(*) FROM voltaram)::DOUBLE / NULLIF((SELECT COUNT(*) FROM novos), 0)
""") or 0)

# freq média entre compras (dias entre pedidos do mesmo cliente)
freq_media_dias = float(q1("""
  WITH ord AS (
    SELECT cliente_id, data_pedido,
           LAG(data_pedido) OVER (PARTITION BY cliente_id ORDER BY data_pedido) AS prev_data
    FROM order_receita
    WHERE cliente_id IS NOT NULL
  )
  SELECT AVG(DATE_DIFF('day', prev_data, data_pedido))
  FROM ord WHERE prev_data IS NOT NULL
""") or 0)

kpis_principais = {
    "pct_receita_recompra": receita_recompra / receita_total if receita_total else 0,
    "pct_receita_novo": receita_novo / receita_total if receita_total else 0,
    "receita_recompra": receita_recompra,
    "receita_novo": receita_novo,
    "receita_total": receita_total,
    "ticket_recompra": ticket_recompra,
    "ticket_novo": ticket_novo,
    "ticket_delta_pct": ticket_delta_pct,
    "n_recompra_pedidos": n_recompra,
    "n_novo_pedidos": n_novo,
    "n_recorrentes": n_recorrentes,
    "n_clientes_novos": n_clientes_novos,
    "taxa_global_recompra": taxa_global,
    "freq_media_dias_recompra": freq_media_dias,
}

# ============================================================
# 2) SÉRIE MENSAL RECOMPRA (18m) — pedidos + clientes + receita
# ============================================================
serie_mensal_recompra = q("""
  WITH base AS (
    SELECT mes,
           COUNT(DISTINCT numero) AS total_pedidos,
           COUNT(DISTINCT CASE WHEN Recompra='Recompra' THEN numero END) AS pedidos_recompra,
           COUNT(DISTINCT CASE WHEN Recompra='Novo' THEN numero END) AS pedidos_novos,
           COUNT(DISTINCT CASE WHEN Recompra='Recompra' THEN cliente_id END) AS n_clientes_recorrentes,
           COUNT(DISTINCT CASE WHEN Recompra='Novo' THEN cliente_id END) AS n_clientes_novos,
           SUM(CASE WHEN Recompra='Recompra' THEN receita ELSE 0 END) AS receita_recompra,
           SUM(CASE WHEN Recompra='Novo' THEN receita ELSE 0 END) AS receita_novos
    FROM order_receita
    GROUP BY mes
  )
  SELECT mes,
         CAST(total_pedidos AS INT) AS total_pedidos,
         CAST(pedidos_recompra AS INT) AS pedidos_recompra,
         CAST(pedidos_novos AS INT) AS pedidos_novos,
         CAST(n_clientes_recorrentes AS INT) AS n_clientes_recorrentes,
         CAST(n_clientes_novos AS INT) AS n_clientes_novos,
         CAST(receita_recompra AS DOUBLE) AS receita_recompra,
         CAST(receita_novos AS DOUBLE) AS receita_novos,
         (pedidos_recompra::DOUBLE / NULLIF(total_pedidos, 0)) AS pct_recompra
  FROM base
  ORDER BY mes DESC
  LIMIT 18
""")
serie_mensal_recompra.reverse()

# ============================================================
# 3) TAXA RECOMPRA POR MARCA — TODAS com >= 100 pedidos
# ============================================================
taxa_recompra_por_marca = q("""
  WITH por_marca AS (
    SELECT marca,
           COUNT(DISTINCT numero) AS pedidos_total,
           COUNT(DISTINCT CASE WHEN Recompra='Recompra' THEN numero END) AS pedidos_recompra,
           COUNT(DISTINCT CASE WHEN Recompra='Novo' THEN numero END) AS pedidos_novos,
           SUM(valor_rateado) AS receita,
           SUM(CASE WHEN Recompra='Recompra' THEN valor_rateado ELSE 0 END) AS rec_recompra,
           SUM(CASE WHEN Recompra='Novo' THEN valor_rateado ELSE 0 END) AS rec_novo
    FROM v
    WHERE marca IS NOT NULL
    GROUP BY marca
  )
  SELECT marca,
         pedidos_total::INT AS n_pedidos,
         pedidos_recompra::INT AS pedidos_recompra,
         pedidos_novos::INT AS pedidos_novos,
         receita::DOUBLE AS receita,
         (pedidos_recompra::DOUBLE / NULLIF(pedidos_total, 0)) AS taxa_recompra,
         CASE WHEN pedidos_recompra > 0
              THEN rec_recompra / pedidos_recompra
              ELSE 0 END AS ticket_medio_recompra,
         CASE WHEN pedidos_novos > 0
              THEN rec_novo / pedidos_novos
              ELSE 0 END AS ticket_medio_novo
  FROM por_marca
  WHERE pedidos_total >= 100
  ORDER BY taxa_recompra DESC
""")

# ============================================================
# 4) PRODUTOS GATEWAY — top 30 com >=50 clientes 1ª compra
# ============================================================
produtos_gateway = q("""
  WITH primeiro_compra AS (
    SELECT DISTINCT v.cliente_id, v.seo_title, v.marca, v.sub_categoria, v.categoria_mae
    FROM v
    WHERE v.Recompra='Novo' AND v.cliente_id IS NOT NULL AND v.seo_title IS NOT NULL
  ),
  voltou AS (
    SELECT DISTINCT cliente_id
    FROM order_receita
    WHERE Recompra='Recompra' AND cliente_id IS NOT NULL
  ),
  valor_1a AS (
    -- receita media do 1o pedido por cliente que comprou este produto
    SELECT seo_title, AVG(receita) AS valor_medio_1a
    FROM (
      SELECT v.seo_title, v.cliente_id, MIN(SUM(v.valor_rateado)) OVER (PARTITION BY v.cliente_id) AS receita
      FROM v
      WHERE v.Recompra='Novo' AND v.seo_title IS NOT NULL
      GROUP BY v.seo_title, v.cliente_id, v.numero
    )
    GROUP BY seo_title
  ),
  por_produto AS (
    SELECT p.seo_title,
           any_value(p.marca) AS marca,
           any_value(p.sub_categoria) AS sub_categoria,
           any_value(p.categoria_mae) AS categoria_mae,
           COUNT(DISTINCT p.cliente_id) AS clientes_1a,
           COUNT(DISTINCT v.cliente_id) AS recompraram
    FROM primeiro_compra p
    LEFT JOIN voltou v USING (cliente_id)
    GROUP BY p.seo_title
  )
  SELECT pp.seo_title, pp.marca, pp.sub_categoria, pp.categoria_mae,
         pp.clientes_1a::INT AS clientes_1a,
         pp.recompraram::INT AS recompraram,
         (pp.recompraram::DOUBLE / NULLIF(pp.clientes_1a, 0)) AS taxa_recompra,
         COALESCE(v1.valor_medio_1a, 0)::DOUBLE AS valor_venda_1a
  FROM por_produto pp
  LEFT JOIN valor_1a v1 USING (seo_title)
  WHERE pp.clientes_1a >= 50
  ORDER BY taxa_recompra DESC
  LIMIT 30
""")

# ============================================================
# 5) LTV POR MARCA — top 30
# ============================================================
ltv_por_marca = q("""
  WITH cli_receita AS (
    SELECT cliente_id,
           SUM(valor_rateado) AS receita_total,
           COUNT(DISTINCT numero) AS n_compras
    FROM v
    WHERE cliente_id IS NOT NULL
    GROUP BY cliente_id
  ),
  cli_marca AS (
    SELECT DISTINCT cliente_id, marca
    FROM v
    WHERE cliente_id IS NOT NULL AND marca IS NOT NULL
  )
  SELECT cm.marca,
         AVG(cr.receita_total)::DOUBLE AS ltv_medio,
         AVG(cr.n_compras)::DOUBLE AS n_compras_medio,
         AVG(cr.receita_total / NULLIF(cr.n_compras, 0))::DOUBLE AS ticket_medio,
         COUNT(DISTINCT cm.cliente_id)::INT AS n_clientes
  FROM cli_marca cm
  JOIN cli_receita cr USING (cliente_id)
  GROUP BY cm.marca
  HAVING COUNT(DISTINCT cm.cliente_id) >= 30
  ORDER BY ltv_medio DESC
  LIMIT 30
""")

# ============================================================
# 6) LTV POR UF — todas as UFs
# ============================================================
ltv_por_uf = q("""
  WITH cli AS (
    SELECT cliente_id,
           any_value(cliente_uf) AS uf,
           SUM(valor_rateado) AS receita_total,
           COUNT(DISTINCT numero) AS n_compras,
           MAX(CASE WHEN Recompra='Recompra' THEN 1 ELSE 0 END) AS recomprou
    FROM v
    WHERE cliente_id IS NOT NULL AND cliente_uf IS NOT NULL
    GROUP BY cliente_id
  )
  SELECT uf,
         AVG(receita_total)::DOUBLE AS ltv_medio,
         AVG(n_compras)::DOUBLE AS n_compras_medio,
         COUNT(*)::INT AS n_clientes,
         AVG(recomprou::DOUBLE)::DOUBLE AS taxa_recompra
  FROM cli
  GROUP BY uf
  HAVING COUNT(*) >= 20
  ORDER BY ltv_medio DESC
""")

# ============================================================
# 7) LTV POR CATEGORIA — top 20
# ============================================================
if HAS_CAT_MAE:
    ltv_por_cat = q("""
      WITH cli_receita AS (
        SELECT cliente_id,
               SUM(valor_rateado) AS receita_total,
               COUNT(DISTINCT numero) AS n_compras
        FROM v WHERE cliente_id IS NOT NULL GROUP BY cliente_id
      ),
      cli_cat AS (
        SELECT DISTINCT cliente_id, categoria_mae
        FROM v WHERE cliente_id IS NOT NULL AND categoria_mae IS NOT NULL
      )
      SELECT cc.categoria_mae AS categoria,
             AVG(cr.receita_total)::DOUBLE AS ltv_medio,
             AVG(cr.n_compras)::DOUBLE AS n_compras_medio,
             COUNT(DISTINCT cc.cliente_id)::INT AS n_clientes
      FROM cli_cat cc JOIN cli_receita cr USING (cliente_id)
      GROUP BY cc.categoria_mae
      HAVING COUNT(DISTINCT cc.cliente_id) >= 30
      ORDER BY ltv_medio DESC LIMIT 20
    """)
else:
    ltv_por_cat = []

# ============================================================
# 8) COORTES MENSAIS — matriz retenção (12 cohorts × 12 meses)
# ============================================================
coortes_mensais = q("""
  WITH primeiros AS (
    SELECT cliente_id, MIN(data_pedido) AS data_1a
    FROM order_receita
    WHERE cliente_id IS NOT NULL
    GROUP BY cliente_id
  ),
  base AS (
    SELECT p.cliente_id,
           strftime(p.data_1a, '%Y-%m') AS cohort,
           strftime(o.data_pedido, '%Y-%m') AS mes,
           DATE_DIFF('month', date_trunc('month', p.data_1a), date_trunc('month', o.data_pedido)) AS m_offset
    FROM primeiros p
    JOIN order_receita o ON o.cliente_id = p.cliente_id
  ),
  cohort_size AS (
    SELECT cohort, COUNT(DISTINCT cliente_id) AS n_total
    FROM primeiros p
    CROSS JOIN (SELECT strftime(data_1a, '%Y-%m') AS cohort, data_1a FROM primeiros) sub
    WHERE strftime(p.data_1a, '%Y-%m') = sub.cohort
    GROUP BY cohort
  ),
  retencao AS (
    SELECT b.cohort, b.m_offset,
           COUNT(DISTINCT b.cliente_id) AS n_ativos
    FROM base b
    WHERE b.m_offset BETWEEN 0 AND 11
    GROUP BY b.cohort, b.m_offset
  ),
  ult_cohorts AS (
    SELECT DISTINCT cohort FROM retencao ORDER BY cohort DESC LIMIT 12
  )
  SELECT r.cohort,
         r.m_offset::INT AS m_offset,
         r.n_ativos::INT AS n_ativos,
         (SELECT COUNT(DISTINCT cliente_id) FROM primeiros WHERE strftime(data_1a, '%Y-%m') = r.cohort)::INT AS cohort_size
  FROM retencao r
  WHERE r.cohort IN (SELECT cohort FROM ult_cohorts)
  ORDER BY r.cohort, r.m_offset
""")

# ============================================================
# 9) TEMPO ENTRE COMPRAS — histograma dias 1ª → 2ª compra
# ============================================================
tempo_entre_compras = q("""
  WITH primeira_segunda AS (
    SELECT cliente_id, data_pedido,
           ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY data_pedido) AS rn
    FROM order_receita
    WHERE cliente_id IS NOT NULL
  ),
  diff AS (
    SELECT a.cliente_id,
           DATE_DIFF('day', a.data_pedido, b.data_pedido) AS dias
    FROM primeira_segunda a
    JOIN primeira_segunda b
      ON a.cliente_id = b.cliente_id AND a.rn = 1 AND b.rn = 2
  )
  SELECT
    CASE
      WHEN dias <= 30 THEN '0-30'
      WHEN dias <= 60 THEN '30-60'
      WHEN dias <= 90 THEN '60-90'
      WHEN dias <= 180 THEN '90-180'
      WHEN dias <= 365 THEN '180-365'
      ELSE '365+'
    END AS faixa,
    COUNT(*)::INT AS n_clientes,
    AVG(dias)::DOUBLE AS dias_medio_na_faixa
  FROM diff
  GROUP BY faixa
""")

# Reordena pra ordem natural
ORDEM_FAIXAS = ['0-30', '30-60', '60-90', '90-180', '180-365', '365+']
tempo_entre_compras = sorted(tempo_entre_compras, key=lambda x: ORDEM_FAIXAS.index(x['faixa']) if x['faixa'] in ORDEM_FAIXAS else 99)

# ============================================================
# 10) PF vs PJ — taxa, LTV, ticket
# ============================================================
if HAS_TIPO_PESSOA:
    clientes_por_tipo = q("""
      WITH cli AS (
        SELECT cliente_id,
               any_value(cliente_tipo_pessoa) AS tipo,
               SUM(valor_rateado) AS receita_total,
               COUNT(DISTINCT numero) AS n_compras,
               MAX(CASE WHEN Recompra='Recompra' THEN 1 ELSE 0 END) AS recomprou
        FROM v
        WHERE cliente_id IS NOT NULL AND cliente_tipo_pessoa IS NOT NULL
        GROUP BY cliente_id
      )
      SELECT tipo,
             COUNT(*)::INT AS n_clientes,
             AVG(recomprou::DOUBLE)::DOUBLE AS taxa_recompra,
             AVG(receita_total)::DOUBLE AS ltv_medio,
             AVG(receita_total/NULLIF(n_compras,0))::DOUBLE AS ticket_medio,
             AVG(n_compras::DOUBLE)::DOUBLE AS n_compras_medio
      FROM cli
      GROUP BY tipo
      ORDER BY n_clientes DESC
    """)

    # Série PF vs PJ
    recompra_pf_pj_serie = q("""
      WITH cli_tipo AS (
        SELECT DISTINCT cliente_id, any_value(cliente_tipo_pessoa) AS tipo
        FROM v WHERE cliente_id IS NOT NULL AND cliente_tipo_pessoa IS NOT NULL
        GROUP BY cliente_id
      ),
      base AS (
        SELECT o.mes, ct.tipo,
               COUNT(DISTINCT o.numero) AS total,
               COUNT(DISTINCT CASE WHEN o.Recompra='Recompra' THEN o.numero END) AS recompra
        FROM order_receita o
        JOIN cli_tipo ct ON o.cliente_id = ct.cliente_id
        GROUP BY o.mes, ct.tipo
      )
      SELECT mes, tipo,
             total::INT AS total,
             recompra::INT AS recompra,
             (recompra::DOUBLE/NULLIF(total,0)) AS pct_recompra
      FROM base
      WHERE mes IN (SELECT mes FROM base GROUP BY mes ORDER BY mes DESC LIMIT 12)
      ORDER BY mes, tipo
    """)
else:
    clientes_por_tipo = []
    recompra_pf_pj_serie = []

# ============================================================
# 11) DISPERSÃO MARCA × UF — top 10 marcas × top 10 UFs (LTV)
# ============================================================
if HAS_UF:
    top10_marcas = [r['marca'] for r in ltv_por_marca[:10]]
    top10_ufs = [r['uf'] for r in ltv_por_uf[:10]]
    placeholders_m = ",".join([f"'{m.replace(chr(39), chr(39)*2)}'" for m in top10_marcas]) or "''"
    placeholders_u = ",".join([f"'{u}'" for u in top10_ufs]) or "''"

    dispersao_marca_x_uf = q(f"""
      WITH cli AS (
        SELECT cliente_id,
               any_value(cliente_uf) AS uf,
               SUM(valor_rateado) AS receita_total,
               COUNT(DISTINCT numero) AS n_compras
        FROM v WHERE cliente_id IS NOT NULL AND cliente_uf IS NOT NULL
        GROUP BY cliente_id
      ),
      cli_marca AS (
        SELECT DISTINCT cliente_id, marca
        FROM v WHERE cliente_id IS NOT NULL AND marca IS NOT NULL
      )
      SELECT cm.marca, c.uf,
             AVG(c.receita_total)::DOUBLE AS ltv_medio,
             AVG(c.receita_total/NULLIF(c.n_compras,0))::DOUBLE AS ticket_medio,
             COUNT(DISTINCT c.cliente_id)::INT AS n_clientes
      FROM cli_marca cm JOIN cli c USING (cliente_id)
      WHERE cm.marca IN ({placeholders_m})
        AND c.uf IN ({placeholders_u})
      GROUP BY cm.marca, c.uf
      HAVING COUNT(DISTINCT c.cliente_id) >= 3
    """)
else:
    dispersao_marca_x_uf = []

# ============================================================
# 12) PRODUTOS SEGUNDA COMPRA — top comprados após a 1ª
# ============================================================
produtos_segunda_compra = q("""
  WITH primeiros AS (
    SELECT cliente_id, MIN(data_pedido) AS data_1a
    FROM order_receita WHERE cliente_id IS NOT NULL
    GROUP BY cliente_id
  ),
  segundos AS (
    SELECT v.cliente_id, v.seo_title, v.marca, v.sub_categoria, v.valor_rateado, v.data_pedido
    FROM v
    JOIN primeiros p USING (cliente_id)
    WHERE v.data_pedido > p.data_1a
      AND v.seo_title IS NOT NULL
  )
  SELECT seo_title,
         any_value(marca) AS marca,
         any_value(sub_categoria) AS sub_categoria,
         COUNT(DISTINCT cliente_id)::INT AS n_clientes,
         SUM(valor_rateado)::DOUBLE AS receita
  FROM segundos
  GROUP BY seo_title
  ORDER BY n_clientes DESC
  LIMIT 20
""")

# ============================================================
# 13) GATEWAY → MARCA — para clientes que entraram com top 10 gateways,
#     qual a marca mais comprada na 2ª compra
# ============================================================
gateway_to_marca = []
try:
    top_gateways = [r['seo_title'] for r in produtos_gateway[:10]]
    if top_gateways:
        placeholders_g = ",".join([f"'{g.replace(chr(39), chr(39)*2)}'" for g in top_gateways])
        gateway_to_marca = q(f"""
          WITH primeira_compra_clientes AS (
            SELECT DISTINCT v.seo_title AS gateway, v.cliente_id
            FROM v
            WHERE v.Recompra='Novo' AND v.cliente_id IS NOT NULL
              AND v.seo_title IN ({placeholders_g})
          ),
          segundas AS (
            SELECT pcc.gateway, v.marca, v.cliente_id
            FROM primeira_compra_clientes pcc
            JOIN v ON v.cliente_id = pcc.cliente_id
            WHERE v.Recompra='Recompra' AND v.marca IS NOT NULL
          ),
          ranked AS (
            SELECT gateway, marca,
                   COUNT(DISTINCT cliente_id) AS n_clientes,
                   ROW_NUMBER() OVER (PARTITION BY gateway ORDER BY COUNT(DISTINCT cliente_id) DESC) AS rk
            FROM segundas
            GROUP BY gateway, marca
          )
          SELECT gateway, marca, n_clientes::INT AS n_clientes
          FROM ranked
          WHERE rk <= 3
          ORDER BY gateway, rk
        """)
except Exception as e:
    print(f"  WARN gateway_to_marca: {e}")
    gateway_to_marca = []

# ============================================================
# 14) FILTROS — UFs e categorias disponíveis
# ============================================================
filtros_ufs = [r['uf'] for r in q("SELECT DISTINCT cliente_uf AS uf FROM v WHERE cliente_uf IS NOT NULL ORDER BY uf")]
filtros_cats = []
if HAS_CAT_MAE:
    filtros_cats = [r['cat'] for r in q("SELECT DISTINCT categoria_mae AS cat FROM v WHERE categoria_mae IS NOT NULL ORDER BY cat")]


# ============================================================
# OUTPUT
# ============================================================
data = {
    "kpis_principais": kpis_principais,
    "serie_mensal_recompra": serie_mensal_recompra,
    "recompra_pf_pj_serie": recompra_pf_pj_serie,
    "taxa_recompra_por_marca": taxa_recompra_por_marca,
    "produtos_gateway": produtos_gateway,
    "ltv_por_marca": ltv_por_marca,
    "ltv_por_uf": ltv_por_uf,
    "ltv_por_cat": ltv_por_cat,
    "coortes_mensais": coortes_mensais,
    "tempo_entre_compras": tempo_entre_compras,
    "clientes_por_tipo": clientes_por_tipo,
    "dispersao_marca_x_uf": dispersao_marca_x_uf,
    "produtos_segunda_compra": produtos_segunda_compra,
    "gateway_to_marca": gateway_to_marca,
    "filtros": {
        "ufs": filtros_ufs,
        "categorias": filtros_cats,
    },
    # backwards-compat: V1 keys (mantem PageRecompra antiga funcionando se rollback)
    "kpis": kpis_principais,
    "top_marcas_recompra": taxa_recompra_por_marca[:15],
    "top_marcas_ltv": ltv_por_marca[:15],
    "serie_recompra_mensal": serie_mensal_recompra,
    "gerado_em": "build-time-v2",
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.RECOMPRA_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)

print(f"OK recompra-data.js V2 gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  Taxa global: {taxa_global*100:.1f}% | % receita recompra: {kpis_principais['pct_receita_recompra']*100:.1f}%")
print(f"  Ticket Recompra: R$ {ticket_recompra:.2f} | Ticket Novo: R$ {ticket_novo:.2f} | Delta: {ticket_delta_pct*100:+.1f}%")
print(f"  Clientes: {n_recorrentes:,} recorrentes / {n_clientes_novos:,} novos")
print(f"  Freq média entre compras: {freq_media_dias:.0f} dias")
print(f"  Marcas analisadas: {len(taxa_recompra_por_marca)} (>=100 pedidos)")
print(f"  Produtos gateway: {len(produtos_gateway)} | LTV marcas: {len(ltv_por_marca)} | LTV UFs: {len(ltv_por_uf)}")
print(f"  Cohorts: {len(coortes_mensais)} linhas | Hist tempo: {len(tempo_entre_compras)} faixas")
print(f"  PF/PJ: {len(clientes_por_tipo)} tipos | Dispersao M×UF: {len(dispersao_marca_x_uf)} celulas")
print(f"  2a compra: {len(produtos_segunda_compra)} produtos | Gateway->Marca: {len(gateway_to_marca)} linhas")
