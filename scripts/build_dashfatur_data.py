"""build_dashfatur_data.py - Pre-computa agregados pra PageDashFaturamento.

Gera window.DASHFATUR_DATA em dashfatur-data.js:
  - kpis YTD/PYTD + variacao % (valor, n_vendas, ticket)
  - serie_anual: total por ano (2024, 2025, 2026 YTD)
  - mensal_ano: matriz {ano:{m:valor}} para comparativo bar agrupado por mes
  - rolling12: serie evolutiva mes-a-mes com janela movel 12 meses (soma ultima 12)
  - sazonalidade: media por mes (Jan-Dez) dos ultimos 3 anos
  - tabela_24m: ultimos 24 meses {mes, valor, n_vendas, delta_mom %, delta_yoy %}
  - opcoes: lista de marcas + categorias para o filtro

Lê de data/vendas_dash.parquet (DuckDB). Forma simples - server-side aggregation
(template usa o mesmo padrao do build_astro_data.py).
"""
import duckdb
import json
import pathlib
import datetime

ROOT = pathlib.Path(__file__).parent.parent
PARQUET = ROOT / "data" / "vendas_dash.parquet"
if not PARQUET.exists():
    PARQUET = ROOT / "public-data" / "vendas_dash.parquet"
OUT = ROOT / "dashfatur-data.js"

con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET}')")

def q(sql, params=None):
    if params:
        return con.execute(sql, params).fetchdf().to_dict(orient="records")
    return con.execute(sql).fetchdf().to_dict(orient="records")

def q1(sql, params=None):
    r = con.execute(sql, params).fetchone() if params else con.execute(sql).fetchone()
    return r[0] if r and r[0] is not None else 0

# ============================================================
# Periodo de referencia: ano corrente e mes corrente nos dados
# ============================================================
data_max = con.execute("SELECT MAX(data_pedido)::DATE FROM v").fetchone()[0]
ano_ref = data_max.year
mes_ref = data_max.month  # corte do YTD = ate este mes inclusive

anos_disp = [r["ano"] for r in q("SELECT DISTINCT EXTRACT(YEAR FROM data_pedido)::INT AS ano FROM v ORDER BY ano")]

# ============================================================
# KPIs YTD e PYTD (mesmo mes_ref do ano anterior)
# ============================================================
ytd = q(f"""
  SELECT
    SUM(valor_rateado)::DOUBLE AS valor,
    COUNT(DISTINCT numero)::INT AS n_vendas
  FROM v
  WHERE EXTRACT(YEAR FROM data_pedido) = {ano_ref}
    AND EXTRACT(MONTH FROM data_pedido) <= {mes_ref}
""")[0]
pytd = q(f"""
  SELECT
    SUM(valor_rateado)::DOUBLE AS valor,
    COUNT(DISTINCT numero)::INT AS n_vendas
  FROM v
  WHERE EXTRACT(YEAR FROM data_pedido) = {ano_ref - 1}
    AND EXTRACT(MONTH FROM data_pedido) <= {mes_ref}
""")[0]

def pct_var(a, b):
    if not b: return 0.0
    return (a - b) / b

ticket_ytd = (ytd["valor"] or 0) / ytd["n_vendas"] if ytd["n_vendas"] else 0
ticket_pytd = (pytd["valor"] or 0) / pytd["n_vendas"] if pytd["n_vendas"] else 0

kpis = {
    "ano_ref": ano_ref,
    "mes_ref": mes_ref,
    "valor_ytd": ytd["valor"] or 0,
    "valor_pytd": pytd["valor"] or 0,
    "var_valor": pct_var(ytd["valor"] or 0, pytd["valor"] or 0),
    "n_vendas_ytd": ytd["n_vendas"] or 0,
    "n_vendas_pytd": pytd["n_vendas"] or 0,
    "var_n_vendas": pct_var(ytd["n_vendas"] or 0, pytd["n_vendas"] or 0),
    "ticket_ytd": ticket_ytd,
    "ticket_pytd": ticket_pytd,
    "var_ticket": pct_var(ticket_ytd, ticket_pytd),
}

# ============================================================
# Comparativo anual (total por ano)
# ============================================================
serie_anual = q("""
  SELECT EXTRACT(YEAR FROM data_pedido)::INT AS ano,
         SUM(valor_rateado)::DOUBLE AS valor,
         COUNT(DISTINCT numero)::INT AS n_vendas
  FROM v GROUP BY 1 ORDER BY 1
""")

# ============================================================
# Mensal x ano (bar agrupado): pra cada ano disponivel, valor por mes 1..12
# ============================================================
mensal_ano = {}
for a in anos_disp:
    rows = q(f"""
      SELECT EXTRACT(MONTH FROM data_pedido)::INT AS mes,
             SUM(valor_rateado)::DOUBLE AS valor,
             COUNT(DISTINCT numero)::INT AS n_vendas
      FROM v WHERE EXTRACT(YEAR FROM data_pedido) = {a}
      GROUP BY 1 ORDER BY 1
    """)
    arr_v = [0.0] * 12
    arr_n = [0] * 12
    for r in rows:
        m = r["mes"]
        if 1 <= m <= 12:
            arr_v[m-1] = r["valor"] or 0
            arr_n[m-1] = r["n_vendas"] or 0
    mensal_ano[str(a)] = {"valor": arr_v, "n_vendas": arr_n}

# ============================================================
# Rolling 12 meses (janela movel sobre serie mensal completa)
# ============================================================
mensal_total = q("""
  SELECT strftime(data_pedido, '%Y-%m') AS ym,
         SUM(valor_rateado)::DOUBLE AS valor,
         COUNT(DISTINCT numero)::INT AS n_vendas
  FROM v GROUP BY 1 ORDER BY 1
""")
rolling12 = []
janela_v = []
janela_n = []
for r in mensal_total:
    janela_v.append(r["valor"] or 0)
    janela_n.append(r["n_vendas"] or 0)
    if len(janela_v) > 12:
        janela_v.pop(0)
        janela_n.pop(0)
    rolling12.append({
        "ym": r["ym"],
        "valor_mes": r["valor"] or 0,
        "rolling_valor": sum(janela_v),
        "rolling_n": sum(janela_n),
        "completa": len(janela_v) == 12,
    })

# ============================================================
# Sazonalidade: media por mes Jan-Dez dos ultimos 3 anos
# (exclui mes em curso pra nao distorcer; ou seja, no ano corrente
#  so meses fechados M < mes_ref)
# ============================================================
anos_saz = anos_disp[-3:] if len(anos_disp) >= 3 else anos_disp
sazonalidade = []
for mes in range(1, 13):
    valores = []
    n_vendas_mes = []
    for a in anos_saz:
        # Pra ano corrente, ignora meses ainda nao fechados (mes >= mes_ref)
        # exceto se mes < mes_ref. Pro mes_ref-1 (mes recem-fechado) inclui.
        if a == ano_ref and mes >= mes_ref:
            continue
        row = con.execute(
            f"SELECT SUM(valor_rateado)::DOUBLE, COUNT(DISTINCT numero)::INT FROM v "
            f"WHERE EXTRACT(YEAR FROM data_pedido)={a} AND EXTRACT(MONTH FROM data_pedido)={mes}"
        ).fetchone()
        if row and row[0] is not None and row[0] > 0:
            valores.append(row[0])
            n_vendas_mes.append(row[1] or 0)
    media_valor = sum(valores) / len(valores) if valores else 0
    media_n = sum(n_vendas_mes) / len(n_vendas_mes) if n_vendas_mes else 0
    sazonalidade.append({
        "mes": mes,
        "label": ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][mes-1],
        "valor_medio": media_valor,
        "n_vendas_medio": media_n,
        "n_anos": len(valores),
    })

# ============================================================
# Tabela 24m: ultimos 24 meses cronologico com MoM e YoY
# ============================================================
ultimo_ym = mensal_total[-1]["ym"] if mensal_total else None
# Pega indice (todos os meses ordenados)
idx_ult = len(mensal_total) - 1
inicio = max(0, idx_ult - 23)
janela_24 = mensal_total[inicio:idx_ult+1]

# Map pra lookup YoY: dict ym -> row index
ym_map = {r["ym"]: i for i, r in enumerate(mensal_total)}

tabela24 = []
for r in janela_24:
    ym = r["ym"]
    valor = r["valor"] or 0
    n = r["n_vendas"] or 0
    i = ym_map[ym]
    # MoM
    prev_m = mensal_total[i-1] if i > 0 else None
    delta_mom = pct_var(valor, prev_m["valor"] or 0) if prev_m else None
    # YoY: ym do ano anterior
    y, m = ym.split("-")
    ym_yoy = f"{int(y)-1}-{m}"
    j = ym_map.get(ym_yoy)
    delta_yoy = None
    if j is not None:
        v_yoy = mensal_total[j]["valor"] or 0
        delta_yoy = pct_var(valor, v_yoy)
    tabela24.append({
        "ym": ym,
        "valor": valor,
        "n_vendas": n,
        "delta_mom": delta_mom,
        "delta_yoy": delta_yoy,
    })

# ============================================================
# Opcoes pra filtros (marca/categoria)
# ============================================================
marcas = [r["k"] for r in q("SELECT DISTINCT marca AS k FROM v WHERE marca IS NOT NULL AND marca <> '' ORDER BY 1")]
categorias = [r["k"] for r in q("SELECT DISTINCT categoria_mae AS k FROM v WHERE categoria_mae IS NOT NULL AND categoria_mae <> '' ORDER BY 1")]

# ============================================================
# Output
# ============================================================
data = {
    "kpis": kpis,
    "anos_disp": anos_disp,
    "serie_anual": serie_anual,
    "mensal_ano": mensal_ano,
    "rolling12": rolling12,
    "sazonalidade": sazonalidade,
    "tabela24": tabela24,
    "opcoes": {"marcas": marcas, "categorias": categorias},
    "gerado_em": datetime.datetime.now().isoformat(timespec="seconds"),
}

def default_enc(o):
    if isinstance(o, (datetime.date, datetime.datetime)):
        return o.isoformat()
    return str(o)

OUT.write_text(
    f"window.DASHFATUR_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)
print(f"OK dashfatur-data.js {OUT} ({OUT.stat().st_size/1024:.1f} KB)")
print(f"  ano_ref={ano_ref} mes_ref={mes_ref}")
print(f"  YTD: R$ {kpis['valor_ytd']/1e6:.2f}M ({kpis['n_vendas_ytd']:,} vendas)")
print(f"  PYTD: R$ {kpis['valor_pytd']/1e6:.2f}M ({kpis['n_vendas_pytd']:,} vendas)")
print(f"  var: valor {kpis['var_valor']*100:+.1f}% | n {kpis['var_n_vendas']*100:+.1f}% | ticket {kpis['var_ticket']*100:+.1f}%")
print(f"  rolling12 pontos: {len(rolling12)} | tabela24: {len(tabela24)} meses")
print(f"  sazonalidade: {len(sazonalidade)} meses (media de {[s['n_anos'] for s in sazonalidade]})")
