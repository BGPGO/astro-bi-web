"""Le vendas_dash.parquet -> tendcomp-data.js para PageTendenciaComposicao.

Tela 10 do PBI Astro: 2 matrizes pivot Marca×Mês e Categoria×Mês.

Estrutura:
- anos: lista de anos disponíveis (pra selector)
- por_ano: { 2024: {...}, 2025: {...}, 2026: {...} }
  - marca_x_mes: top 20 marcas, células {marca, am, valor, pct_mes, pct_total_marca}
  - cat_x_mes:   top categorias_mae, mesma estrutura
  - totais_mes:  total venda por mês (1..12) para normalização
  - meses_com_dados: lista de m (1..12) presentes
  - total_ano: SUM de tudo no ano
  - top_marcas: lista ordenada das top 20 marcas (pra header da tabela)
  - top_cats:   lista ordenada das categorias_mae
"""
import duckdb
import json
import pathlib

PARQUET = pathlib.Path(__file__).parent.parent / "public-data" / "vendas_dash.parquet"
OUT = pathlib.Path(__file__).parent.parent / "tendcomp-data.js"
TOP_MARCAS = 20
TOP_CATS = 20  # categorias_mae raramente >12 mas deixa folga

con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET}')")

def q(sql, params=None):
    if params:
        return con.execute(sql, params).fetchdf().to_dict(orient="records")
    return con.execute(sql).fetchdf().to_dict(orient="records")

def q1(sql, params=None):
    if params:
        r = con.execute(sql, params).fetchone()
    else:
        r = con.execute(sql).fetchone()
    return r[0] if r else 0

anos = [int(r["ano"]) for r in q("SELECT DISTINCT EXTRACT(YEAR FROM data_pedido)::INT ano FROM v ORDER BY ano")]

por_ano = {}
for ano in anos:
    # totais por mês
    totais_mes_rows = q(
        """
        SELECT EXTRACT(MONTH FROM data_pedido)::INT m, SUM(valor_rateado)::DOUBLE v
        FROM v WHERE EXTRACT(YEAR FROM data_pedido) = ?
        GROUP BY m ORDER BY m
        """,
        [ano],
    )
    totais_mes = {int(r["m"]): float(r["v"]) for r in totais_mes_rows}
    meses_com_dados = sorted(totais_mes.keys())
    total_ano = float(sum(totais_mes.values()))

    # top 20 marcas do ano por venda total
    top_marcas_rows = q(
        """
        SELECT marca, SUM(valor_rateado)::DOUBLE v
        FROM v WHERE marca IS NOT NULL AND EXTRACT(YEAR FROM data_pedido) = ?
        GROUP BY marca ORDER BY v DESC LIMIT ?
        """,
        [ano, TOP_MARCAS],
    )
    top_marcas = [{"marca": r["marca"], "total": float(r["v"])} for r in top_marcas_rows]
    top_marca_names = [r["marca"] for r in top_marcas_rows]

    # marca × mês — só pras top marcas
    marca_x_mes = []
    if top_marca_names:
        rows = q(
            """
            SELECT marca, EXTRACT(MONTH FROM data_pedido)::INT m, SUM(valor_rateado)::DOUBLE v
            FROM v
            WHERE EXTRACT(YEAR FROM data_pedido) = ?
              AND marca IN (SELECT UNNEST(?))
            GROUP BY marca, m
            """,
            [ano, top_marca_names],
        )
        for r in rows:
            m = int(r["m"])
            valor = float(r["v"])
            tot_mes = totais_mes.get(m, 0) or 0
            marca_total = next((mm["total"] for mm in top_marcas if mm["marca"] == r["marca"]), 0)
            marca_x_mes.append({
                "marca": r["marca"],
                "m": m,
                "valor": valor,
                "pct_mes": (valor / tot_mes) if tot_mes else 0,
                "pct_total_marca": (valor / marca_total) if marca_total else 0,
            })

    # top categorias_mae do ano
    top_cats_rows = q(
        """
        SELECT categoria_mae, SUM(valor_rateado)::DOUBLE v
        FROM v WHERE categoria_mae IS NOT NULL AND EXTRACT(YEAR FROM data_pedido) = ?
        GROUP BY categoria_mae ORDER BY v DESC LIMIT ?
        """,
        [ano, TOP_CATS],
    )
    top_cats = [{"categoria": r["categoria_mae"], "total": float(r["v"])} for r in top_cats_rows]
    top_cat_names = [r["categoria_mae"] for r in top_cats_rows]

    cat_x_mes = []
    if top_cat_names:
        rows = q(
            """
            SELECT categoria_mae, EXTRACT(MONTH FROM data_pedido)::INT m, SUM(valor_rateado)::DOUBLE v
            FROM v
            WHERE EXTRACT(YEAR FROM data_pedido) = ?
              AND categoria_mae IN (SELECT UNNEST(?))
            GROUP BY categoria_mae, m
            """,
            [ano, top_cat_names],
        )
        for r in rows:
            m = int(r["m"])
            valor = float(r["v"])
            tot_mes = totais_mes.get(m, 0) or 0
            cat_total = next((cc["total"] for cc in top_cats if cc["categoria"] == r["categoria_mae"]), 0)
            cat_x_mes.append({
                "categoria": r["categoria_mae"],
                "m": m,
                "valor": valor,
                "pct_mes": (valor / tot_mes) if tot_mes else 0,
                "pct_total_cat": (valor / cat_total) if cat_total else 0,
            })

    por_ano[str(ano)] = {
        "marca_x_mes": marca_x_mes,
        "cat_x_mes": cat_x_mes,
        "totais_mes": totais_mes,
        "meses_com_dados": meses_com_dados,
        "total_ano": total_ano,
        "top_marcas": top_marcas,
        "top_cats": top_cats,
    }

ano_default = max(anos) if anos else None

data = {
    "anos": anos,
    "ano_default": ano_default,
    "por_ano": por_ano,
    "gerado_em": "build-time",
}

def default_enc(o):
    return str(o)

OUT.write_text(
    f"window.TENDCOMP_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)
print(f"OK tendcomp-data.js gerado em {OUT} ({OUT.stat().st_size} bytes)")
print(f"  Anos: {anos} | default: {ano_default}")
for ano in anos:
    d = por_ano[str(ano)]
    print(f"  {ano}: {len(d['top_marcas'])} marcas, {len(d['top_cats'])} cats, total R$ {d['total_ano']/1e6:.2f}M, meses {d['meses_com_dados']}")
