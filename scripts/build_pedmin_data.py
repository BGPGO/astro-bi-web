"""Le vendas_tiny_bu.parquet -> pedmin-data.js com agregados pre-calculados pra PagePedidoMinimo.

Estudo solicitado por Filipe (29/04/2026):
- "Se eu delimito pedido minimo de R$ X, quanto deixo de vender?"
- Cruzar com LTV dos clientes excluidos (compradores unicos vs recompradores).
- PF vs PJ leitura separada.

Granularidade: pedido (DISTINCT numero). Filtro: situacao != 'Cancelado' e
total_pedido > 0. Cliente_chave = cliente_cpf_cnpj limpo (fallback cliente_id).

Saidas pre-calculadas:
- histograma: faixas de valor de pedido com n_pedidos, receita, pct
- ltv_por_faixa_max_pedido: LTV de clientes cujo maior pedido <= X
- pf_vs_pj: split por tipo_pessoa
- cenarios_corte: pra cada corte, pedidos perdidos, receita perdida, custo eliminado
"""
import duckdb
import json
import pathlib

PARQUET = pathlib.Path("C:/Projects/astro-giro-bi/data/vendas_tiny_bu.parquet")
OUT = pathlib.Path(__file__).parent.parent / "pedmin-data.js"

# Premissa: cada pedido tem custo operacional medio de R$ 30 (separacao, embalagem,
# emissao NF, atendimento, frete subsidiado). Numero a calibrar com financeiro.
CUSTO_OP_POR_PEDIDO = 30.0

con = duckdb.connect()
con.execute(f"""
  CREATE OR REPLACE VIEW raw AS
  SELECT * FROM read_parquet('{PARQUET.as_posix()}')
""")

# Pedido (1 row por numero). Dado o parquet ser linha por item, agrupamos.
# total_pedido eh redundante (mesmo valor por linha do pedido), entao MAX.
con.execute("""
  CREATE OR REPLACE VIEW ped AS
  SELECT
    numero,
    MAX(total_pedido) AS total_pedido,
    MAX(situacao) AS situacao,
    MAX(cliente_tipo_pessoa) AS tipo,
    MAX(cliente_id) AS cliente_id,
    REGEXP_REPLACE(COALESCE(MAX(cliente_cpf_cnpj), ''), '[^0-9]', '', 'g') AS cpf_clean,
    MAX(data_pedido) AS data_pedido
  FROM raw
  GROUP BY numero
""")

con.execute("""
  CREATE OR REPLACE VIEW ped_f AS
  SELECT
    numero,
    total_pedido,
    tipo,
    CASE WHEN cpf_clean = '' OR cpf_clean IS NULL THEN cliente_id ELSE cpf_clean END AS cli,
    data_pedido
  FROM ped
  WHERE situacao != 'Cancelado'
    AND total_pedido > 0
""")

def q(sql):
    return con.execute(sql).fetchdf().to_dict(orient="records")

def q1(sql):
    r = con.execute(sql).fetchone()
    return r[0] if r else 0

# === Totais base ===
total_ped = int(q1("SELECT COUNT(*) FROM ped_f"))
total_rec = float(q1("SELECT SUM(total_pedido) FROM ped_f"))
total_cli = int(q1("SELECT COUNT(DISTINCT cli) FROM ped_f WHERE cli IS NOT NULL AND cli != ''"))
ticket_medio = total_rec / total_ped if total_ped else 0.0
ltv_medio = total_rec / total_cli if total_cli else 0.0

# === Histograma por faixa ===
FAIXAS = [
    ('<200',     0,    200),
    ('200-500',  200,  500),
    ('500-1k',   500,  1000),
    ('1k-3k',    1000, 3000),
    ('3k-10k',   3000, 10000),
    ('>10k',     10000, 10**12),
]
histograma = []
for label, lo, hi in FAIXAS:
    n = int(q1(f"SELECT COUNT(*) FROM ped_f WHERE total_pedido >= {lo} AND total_pedido < {hi}"))
    rec = float(q1(f"SELECT COALESCE(SUM(total_pedido),0) FROM ped_f WHERE total_pedido >= {lo} AND total_pedido < {hi}"))
    histograma.append({
        "faixa": label,
        "lo": lo,
        "hi": hi if hi < 10**12 else None,
        "n_pedidos": n,
        "receita_total": rec,
        "pct_pedidos": (n / total_ped) if total_ped else 0.0,
        "pct_receita": (rec / total_rec) if total_rec else 0.0,
        "ticket_medio_faixa": (rec / n) if n else 0.0,
    })

# === LTV por faixa de maior pedido (clientes excluidos = maior_pedido <= X) ===
con.execute("""
  CREATE OR REPLACE VIEW cli_agg AS
  SELECT
    cli,
    MAX(tipo) AS tipo,
    COUNT(*) AS n_pedidos,
    SUM(total_pedido) AS receita,
    MAX(total_pedido) AS maior_pedido,
    AVG(total_pedido) AS ticket_medio
  FROM ped_f
  WHERE cli IS NOT NULL AND cli != ''
  GROUP BY cli
""")

ltv_por_faixa_max_pedido = []
for X in [200, 500, 1000, 2000, 5000]:
    row = con.execute(f"""
      SELECT
        COUNT(*) AS n_clientes,
        COALESCE(AVG(receita), 0) AS ltv_medio,
        COALESCE(AVG(n_pedidos), 0) AS n_pedidos_medio,
        COALESCE(SUM(receita), 0) AS receita_total,
        COALESCE(AVG(ticket_medio), 0) AS ticket_medio
      FROM cli_agg
      WHERE maior_pedido < {X}
    """).fetchone()
    ltv_por_faixa_max_pedido.append({
        "corte": X,
        "label": f"Maior pedido < R$ {X}",
        "n_clientes": int(row[0]),
        "ltv_medio": float(row[1]),
        "n_pedidos_medio": float(row[2]),
        "receita_total": float(row[3]),
        "ticket_medio": float(row[4]),
        "pct_base_clientes": (row[0] / total_cli) if total_cli else 0.0,
    })

# === PF vs PJ ===
pf_vs_pj_rows = q("""
  SELECT
    CASE
      WHEN tipo = 'F' THEN 'PF'
      WHEN tipo = 'J' THEN 'PJ'
      ELSE 'Outros'
    END AS tipo_label,
    COUNT(*) AS n_pedidos,
    SUM(total_pedido)::DOUBLE AS receita,
    AVG(total_pedido)::DOUBLE AS ticket_medio,
    COUNT(DISTINCT cli) AS n_clientes
  FROM ped_f
  GROUP BY tipo_label
  ORDER BY receita DESC
""")
pf_vs_pj = []
for r in pf_vs_pj_rows:
    n_cli = int(r['n_clientes']) if r['n_clientes'] else 0
    rec = float(r['receita']) if r['receita'] else 0.0
    pf_vs_pj.append({
        "tipo": r['tipo_label'],
        "n_pedidos": int(r['n_pedidos']),
        "n_clientes": n_cli,
        "receita": rec,
        "ticket_medio": float(r['ticket_medio']) if r['ticket_medio'] else 0.0,
        "ltv_medio": (rec / n_cli) if n_cli else 0.0,
        "pct_receita": (rec / total_rec) if total_rec else 0.0,
    })

# === Cenarios de corte ===
cenarios = []
for X in [200, 300, 500, 700, 1000]:
    n_cortado = int(q1(f"SELECT COUNT(*) FROM ped_f WHERE total_pedido < {X}"))
    rec_perdida = float(q1(f"SELECT COALESCE(SUM(total_pedido),0) FROM ped_f WHERE total_pedido < {X}"))
    # Clientes que NUNCA passaram do corte (efetivamente perdidos)
    n_cli_perdidos = int(q1(f"SELECT COUNT(*) FROM cli_agg WHERE maior_pedido < {X}"))
    ltv_perdidos = float(q1(f"SELECT COALESCE(AVG(receita),0) FROM cli_agg WHERE maior_pedido < {X}"))
    custo_eliminado = n_cortado * CUSTO_OP_POR_PEDIDO
    cenarios.append({
        "corte": X,
        "label": f"R$ {X}",
        "n_pedidos_cortados": n_cortado,
        "pct_pedidos_cortados": (n_cortado / total_ped) if total_ped else 0.0,
        "receita_perdida": rec_perdida,
        "pct_receita_perdida": (rec_perdida / total_rec) if total_rec else 0.0,
        "custo_operacional_eliminado": custo_eliminado,
        "saldo_liquido": custo_eliminado - rec_perdida,  # se negativo, corte destroi valor
        "n_clientes_perdidos": n_cli_perdidos,
        "pct_clientes_perdidos": (n_cli_perdidos / total_cli) if total_cli else 0.0,
        "ltv_medio_perdidos": ltv_perdidos,
    })

# === Periodo coberto (pra contextualizar) ===
periodo = con.execute("""
  SELECT MIN(data_pedido) AS dt_min, MAX(data_pedido) AS dt_max
  FROM ped_f
""").fetchone()

data = {
    "totais": {
        "n_pedidos": total_ped,
        "n_clientes": total_cli,
        "receita_total": total_rec,
        "ticket_medio": ticket_medio,
        "ltv_medio": ltv_medio,
        "periodo_inicio": str(periodo[0]) if periodo[0] else None,
        "periodo_fim": str(periodo[1]) if periodo[1] else None,
    },
    "premissas": {
        "custo_op_por_pedido": CUSTO_OP_POR_PEDIDO,
        "filtro": "situacao != 'Cancelado' e total_pedido > 0",
        "granularidade": "pedido (DISTINCT numero)",
    },
    "histograma": histograma,
    "ltv_por_faixa_max_pedido": ltv_por_faixa_max_pedido,
    "pf_vs_pj": pf_vs_pj,
    "cenarios_corte": cenarios,
    "gerado_em": "build-time",
}

def default_enc(o):
    return str(o)

OUT.write_text(
    f"window.PEDMIN_DATA = {json.dumps(data, ensure_ascii=False, default=default_enc)};\n",
    encoding="utf-8",
)
print(f"OK pedmin-data.js gerado em {OUT} ({OUT.stat().st_size} bytes)")
print(f"  Pedidos: {total_ped:,} | Clientes: {total_cli:,} | Receita: R$ {total_rec/1e6:.2f}M")
print(f"  Periodo: {periodo[0]} -> {periodo[1]}")
print(f"  Histograma:")
for h in histograma:
    print(f"    {h['faixa']:>10}: {h['n_pedidos']:>7,} pedidos ({h['pct_pedidos']*100:5.1f}%) | R$ {h['receita_total']/1e6:6.2f}M ({h['pct_receita']*100:5.1f}%)")
print(f"  Cenarios:")
for c in cenarios:
    print(f"    corte {c['label']:>7}: {c['n_pedidos_cortados']:>6,} ped ({c['pct_pedidos_cortados']*100:4.1f}%) -> perda R$ {c['receita_perdida']/1e3:8.0f}k ({c['pct_receita_perdida']*100:4.2f}%) | clientes perdidos {c['n_clientes_perdidos']:,} (LTV R$ {c['ltv_medio_perdidos']:,.0f})")
