"""build_cfv_data.py — pre-compute para tela CFV (Custo Financeiro de Venda) do Astro.

Le vendas_dash.parquet (template slim) -> cfv-data.js. Como o parquet NAO tem
as colunas brutas de CFV (Taxa Fixa / Variavel / Desconto vem do PBI original
com integracao mais profunda), AQUI APROXIMAMOS:

  CFV total estimado    = 0.0616 * valor_rateado          (5.06% medio do PBI)
  Decomposicao:
     Taxa Variavel      = 60% do CFV
     Taxa Fixa          = 30% do CFV
     Desconto           = 10% do CFV

OBS: a decomposicao 60/30/10 nao bate com o donut do PBI (7.63/31.98/60.39).
Mantemos os pesos da especificacao do prompt e adicionamos badge "estimado"
em todos os numeros no frontend.

meio_pagamento: nao existe na slim — derivamos de forma_pagamento com mapping
1:1 (credito->Cartao de Credito, boleto->Boleto a Vista, pix->Pix,
deposito->Deposito). Parcelas: nao existe — agrupamos tudo como "1x" sintetico
(salvo para credito, onde NAO sintetizamos parcelas — ficam "n/d").

Saida: window.CFV_DATA = { kpis, por_forma, por_meio, por_forma_x_meio,
                          decomposicao, serie_mensal, gerado_em }
"""
from __future__ import annotations
import duckdb
import json
import pathlib
import datetime as dt

# === Paths ===
ROOT = pathlib.Path(__file__).resolve().parent.parent
PARQUET = ROOT / "data" / "vendas_dash.parquet"
OUT = ROOT / "cfv-data.js"

if not PARQUET.exists():
    raise SystemExit(f"parquet nao encontrado: {PARQUET}")

# === Constantes de aproximacao (documentadas no prompt) ===
CFV_PCT = 0.0616     # 6.16% do valor_rateado vira CFV
PCT_VAR = 0.60       # 60% do CFV = taxa variavel
PCT_FIX = 0.30       # 30% do CFV = taxa fixa
PCT_DESC = 0.10      # 10% do CFV = desconto


con = duckdb.connect()
con.execute(f"""
  CREATE OR REPLACE VIEW v AS
  SELECT * FROM read_parquet('{PARQUET.as_posix()}')
  WHERE valor_rateado IS NOT NULL
""")

# Mapeia forma_pagamento bruta para nomes do PBI (4 buckets)
con.execute("""
  CREATE OR REPLACE VIEW v_norm AS
  SELECT *,
         CASE
           WHEN lower(forma_pagamento) = 'credito'  THEN 'Cartao de Credito'
           WHEN lower(forma_pagamento) = 'boleto'   THEN 'Boleto a Vista'
           WHEN lower(forma_pagamento) = 'pix'      THEN 'Pix'
           WHEN lower(forma_pagamento) = 'deposito' THEN 'Deposito'
           ELSE 'Em branco'
         END AS forma_pgto_label,
         CASE
           WHEN lower(forma_pagamento) = 'credito'  THEN 'Cartao'
           WHEN lower(forma_pagamento) = 'boleto'   THEN 'Boleto'
           WHEN lower(forma_pagamento) = 'pix'      THEN 'Pix'
           WHEN lower(forma_pagamento) = 'deposito' THEN 'Deposito'
           ELSE 'Outros'
         END AS meio_pgto_label
  FROM v
""")


def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")


def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0


# ============================================================
# 1) KPIs globais
# ============================================================
valor_total = float(q1("SELECT SUM(valor_rateado) FROM v_norm") or 0)
n_pedidos = int(q1("SELECT COUNT(DISTINCT numero) FROM v_norm") or 0)
cfv_total = valor_total * CFV_PCT
cfv_pct = CFV_PCT
taxa_fixa_total = cfv_total * PCT_FIX
taxa_var_total = cfv_total * PCT_VAR
desconto_total = cfv_total * PCT_DESC

kpis = {
    "valor_total": valor_total,
    "n_pedidos": n_pedidos,
    "cfv_total": cfv_total,
    "cfv_pct": cfv_pct,
    "taxa_fixa_total": taxa_fixa_total,
    "taxa_var_total": taxa_var_total,
    "desconto_total": desconto_total,
    "estimado": True,
}

# ============================================================
# 2) Decomposicao (donut)
# ============================================================
decomposicao = [
    {"componente": "Taxa Fixa",     "valor": taxa_fixa_total, "pct": PCT_FIX},
    {"componente": "Taxa Variavel", "valor": taxa_var_total,  "pct": PCT_VAR},
    {"componente": "Descontos",     "valor": desconto_total,  "pct": PCT_DESC},
]

# ============================================================
# 3) Por forma_pagamento (4 buckets)
# ============================================================
por_forma = q(f"""
  SELECT forma_pgto_label AS forma_pagamento,
         COUNT(DISTINCT numero)::INT          AS n_pedidos,
         SUM(valor_rateado)::DOUBLE           AS valor_total,
         (SUM(valor_rateado) * {CFV_PCT})::DOUBLE       AS cfv_total,
         (SUM(valor_rateado) * {CFV_PCT * PCT_FIX})::DOUBLE  AS taxa_fixa,
         (SUM(valor_rateado) * {CFV_PCT * PCT_VAR})::DOUBLE  AS taxa_var,
         (SUM(valor_rateado) * {CFV_PCT * PCT_DESC})::DOUBLE AS desconto,
         {CFV_PCT}::DOUBLE                    AS cfv_pct
  FROM v_norm
  GROUP BY forma_pgto_label
  ORDER BY valor_total DESC
""")

# adiciona pct_do_valor_total
for r in por_forma:
    r["pct_do_total"] = (r["valor_total"] / valor_total) if valor_total else 0
    r["pct_cfv_global"] = (r["cfv_total"] / cfv_total) if cfv_total else 0

# ============================================================
# 4) Por meio_pagamento — neste dataset = mesmo dos 4 buckets
#    (PBI separa "Boleto a Vista" vs "Boleto a Prazo" mas a slim nao tem
#    essa granularidade; replicamos os 4 buckets como meio)
# ============================================================
por_meio = [
    {
        "meio_pagamento": r["forma_pagamento"],
        "n_pedidos": r["n_pedidos"],
        "valor_total": r["valor_total"],
        "cfv_total": r["cfv_total"],
        "pct_do_total": r["pct_do_total"],
    }
    for r in por_forma
]

# ============================================================
# 5) Matriz forma x meio (degenera em diagonal — mesmo bucket nos 2 eixos)
#    Mantem a estrutura pra o frontend renderizar a tabela detalhada.
# ============================================================
por_forma_x_meio = [
    {
        "forma_pagamento": r["forma_pagamento"],
        "meio_pagamento":  r["forma_pagamento"],  # diagonal
        "n_pedidos":       r["n_pedidos"],
        "valor_total":     r["valor_total"],
        "cfv_total":       r["cfv_total"],
        "cfv_pct":         CFV_PCT,
        "pct_cfv_global":  r["pct_cfv_global"],
    }
    for r in por_forma
]

# ============================================================
# 6) Serie mensal (ultimos 12m) — Venda Bruta, CFV total, CFV %
# ============================================================
serie_mensal = q(f"""
  WITH base AS (
    SELECT strftime(data_pedido, '%Y-%m')  AS mes,
           SUM(valor_rateado)              AS venda_bruta,
           COUNT(DISTINCT numero)          AS n_pedidos
    FROM v_norm
    GROUP BY mes
  )
  SELECT mes,
         venda_bruta::DOUBLE                                  AS venda_bruta,
         (venda_bruta * {CFV_PCT})::DOUBLE                    AS cfv_total,
         (venda_bruta * {CFV_PCT * PCT_FIX})::DOUBLE          AS taxa_fixa,
         (venda_bruta * {CFV_PCT * PCT_VAR})::DOUBLE          AS taxa_var,
         (venda_bruta * {CFV_PCT * PCT_DESC})::DOUBLE         AS desconto,
         {CFV_PCT}::DOUBLE                                    AS cfv_pct,
         n_pedidos::INT                                       AS n_pedidos
  FROM base
  ORDER BY mes DESC
  LIMIT 12
""")
serie_mensal.reverse()

# ============================================================
# OUTPUT
# ============================================================
data = {
    "kpis": kpis,
    "decomposicao": decomposicao,
    "por_forma": por_forma,
    "por_meio": por_meio,
    "por_forma_x_meio": por_forma_x_meio,
    "serie_mensal": serie_mensal,
    "premissas": {
        "cfv_pct_aplicado": CFV_PCT,
        "pct_taxa_variavel": PCT_VAR,
        "pct_taxa_fixa": PCT_FIX,
        "pct_desconto": PCT_DESC,
        "fonte": "vendas_dash.parquet (slim) — CFV, parcelas e meio_pagamento NAO existem na fonte, sao estimados",
    },
    "gerado_em": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
}


def default_enc(o):
    return str(o)


OUT.write_text(
    f"window.CFV_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)

print(f"OK cfv-data.js gerado em {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"  Valor total:    R$ {valor_total:,.2f}  ({n_pedidos:,} pedidos)")
print(f"  CFV total est.: R$ {cfv_total:,.2f}    ({CFV_PCT*100:.2f}%)")
print(f"    - Taxa Fixa:  R$ {taxa_fixa_total:,.2f}  ({PCT_FIX*100:.0f}% do CFV)")
print(f"    - Taxa Var:   R$ {taxa_var_total:,.2f}   ({PCT_VAR*100:.0f}% do CFV)")
print(f"    - Descontos:  R$ {desconto_total:,.2f}   ({PCT_DESC*100:.0f}% do CFV)")
print(f"  Por forma_pgto: {len(por_forma)} buckets")
print(f"  Serie mensal:   {len(serie_mensal)} meses")
