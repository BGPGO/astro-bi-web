"""Pre-computa metadados pra PageVendasDiaUtil (heatmap Marca x Mes · Vendas/Dia Util).

Salva `vendasdiautil-data.js` com:
- marcas_top: top 30 marcas por SUM(valor_rateado) (so vendas em dias uteis)
- meses_18: ultimos 18 ano-mes presentes nos dados (string 'YYYY-MM', ordenado ASC)
- updated_at: ISO timestamp pra debug

O Page faz as queries pesadas via DuckDB-WASM (heatmap reativo); estes 2 arrays
servem so pra inicializar UI antes do duckdb estar pronto e como fallback de
estado vazio. Outras queries (matriz, tabela, drill) sao dinamicas in-browser.
"""
import duckdb
import json
import pathlib
import datetime as _dt

PARQUET = pathlib.Path(__file__).parent.parent / "public-data" / "vendas_dash.parquet"
OUT = pathlib.Path(__file__).parent.parent / "vendasdiautil-data.js"

con = duckdb.connect()
con.execute(f"CREATE OR REPLACE VIEW v AS SELECT * FROM read_parquet('{PARQUET}')")

# Top 30 marcas por Sum(valor_rateado) em dias uteis (mesma logica do heatmap).
marcas_top_rows = con.execute(
    """
    SELECT marca AS m, SUM(valor_rateado)::DOUBLE AS v
    FROM v
    WHERE marca IS NOT NULL
      AND marca <> ''
      AND dayofweek(data_pedido) BETWEEN 1 AND 5
      AND data_pedido IS NOT NULL
    GROUP BY marca
    ORDER BY v DESC
    LIMIT 30
    """
).fetchdf()
marcas_top = [str(m) for m in marcas_top_rows["m"].tolist()]

# Ultimos 18 ano-mes presentes nos dados, ASC final.
meses_rows = con.execute(
    """
    SELECT DISTINCT strftime(data_pedido, '%Y-%m') AS am
    FROM v
    WHERE data_pedido IS NOT NULL
    ORDER BY am DESC
    LIMIT 18
    """
).fetchdf()
meses_18 = sorted(str(m) for m in meses_rows["am"].tolist())

data = {
    "marcas_top": marcas_top,
    "meses_18": meses_18,
    "updated_at": _dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
}

OUT.write_text(
    f"window.VDU_DATA = {json.dumps(data, ensure_ascii=False)};\n",
    encoding="utf-8",
)
print(
    f"OK vendasdiautil-data.js gerado em {OUT} "
    f"({OUT.stat().st_size} bytes) | {len(marcas_top)} marcas | {len(meses_18)} meses"
)
