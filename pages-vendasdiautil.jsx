/**
 * pages-vendasdiautil.jsx — Astro BI · Vendas / Dia Util (heatmap Marca x Mes)
 *
 * Replica a tela "Vendas/Dia util" do PBI Astro (pagina 3):
 *  - Linha do tempo no topo: SUM(valor_rateado) por mes (so dias uteis), 18m.
 *  - Heatmap matricial Marca (top 20) x Mes (18m) com celula = R$/dia util.
 *    Cor gradient surface -> cyan, hover = tooltip com valor exato + dias uteis,
 *    clique = cross-filter (filtra Dash daquela marca + ano-mes via window xf).
 *  - Filtros opcionais: multi ano-mes + multi marca.
 *  - Tabela embaixo: TOP 30 (marca, mes) por R$/dia util com link drill.
 *
 * Stack:
 *  - Reusa helpers globais de pages-astro.jsx: _fmtBRL, _fmtBRLk, _fmtNum,
 *    _runQuery, useDuckDBQuery, useDuckDBStatus, MultiSelect, _sqlList, _sqlEsc.
 *  - VDU_DATA (vendasdiautil-data.js) e fallback inicial — pode nao existir
 *    no boot; se nao existir, a propria query DuckDB descobre marcas/meses.
 *
 * Drill por clique numa celula: seta window.__vduDrill = { marca, am } e
 * dispara CustomEvent 'astro-xf' que a Dash (PageAstroDash) pode escutar pra
 * sincronizar filtros (xfMarca + anoMes). Se a Dash nao escutar, o clique
 * apenas marca a celula localmente. Mantemos a tela auto-contida.
 */

// ===== Helpers locais =====

// Gradient surface (frio) -> cyan (quente). 0 -> sem dado.
const _vduCellColor = (v, vMin, vMax) => {
  if (v == null || !isFinite(v) || v <= 0) return 'rgba(255,255,255,0.03)';
  const t = (v - vMin) / Math.max(0.0001, vMax - vMin);
  const tc = Math.max(0, Math.min(1, t));
  // surface (38,42,58) -> cyan (34,211,238)
  const r = Math.round(38 + (34 - 38) * tc);
  const g = Math.round(42 + (211 - 42) * tc);
  const b = Math.round(58 + (238 - 58) * tc);
  return `rgba(${r}, ${g}, ${b}, ${0.18 + 0.78 * tc})`;
};

// Label compacto "mai/25"
const _vduFmtAm = (am) => {
  if (!am || am.length < 7) return am;
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const m = parseInt(am.slice(5, 7), 10);
  return `${meses[m-1] || am.slice(5,7)}/${am.slice(2,4)}`;
};

// Filtros locais — mesma forma do FilterBar da Dash, mas reduzido pra esta tela.
const DEFAULT_FILTERS_VDU = {
  anoMes: [],      // multi (string YYYY-MM); vazio = todos os meses presentes
  marca: [],       // multi (string); vazio = top 20 do heatmap
  diaUtil: 'util', // util | all (essa tela ESPERA dia util; deixamos toggle pra inspecao)
};

const _buildWhereVDU = (f) => {
  const parts = [];
  parts.push(`data_pedido IS NOT NULL`);
  // Tela é "últimos 12 meses fixos" — não escuta Header global nem anoMes da page
  parts.push(`data_pedido >= (current_date - INTERVAL 12 MONTH)`);
  if (f.diaUtil === 'util') parts.push(`dayofweek(data_pedido) BETWEEN 1 AND 5`);
  if (f.anoMes && f.anoMes.length) parts.push(`strftime(data_pedido, '%Y-%m') IN (${_sqlList(f.anoMes)})`);
  if (f.marca && f.marca.length) parts.push(`marca IN (${_sqlList(f.marca)})`);
  return parts.join(' AND ');
};

// ===== Heatmap SVG (top N marcas x M meses) =====
const VduHeatmap = ({ rows, marcas, meses, onCellClick, activeCell }) => {
  if (!rows || !rows.length || !marcas.length || !meses.length) {
    return <div className="empty">sem dados</div>;
  }
  // index rapido (marca, am) -> { rs_dia_util, v, dias_uteis }
  const byKey = {};
  for (const r of rows) {
    byKey[`${r.marca}||${r.am}`] = r;
  }
  // dominio: min/max do rs_dia_util > 0
  const vals = rows.map((r) => r.rs_dia_util).filter((v) => v != null && isFinite(v) && v > 0);
  const vMin = vals.length ? Math.min(...vals) : 0;
  const vMax = vals.length ? Math.max(...vals) : 1;

  const labelW = 130;
  const cellH = 26;
  const cellW = 64;
  const padTop = 36;
  const padBot = 24;
  const W = labelW + cellW * meses.length + 24;
  const H = padTop + cellH * marcas.length + padBot;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', minWidth: W }}>
        {/* Cabecalho meses */}
        {meses.map((am, ci) => {
          const cx = labelW + ci * cellW + cellW / 2;
          return (
            <text key={`h-${am}`} x={cx} y={padTop - 10} textAnchor="middle"
                  style={{ fontSize: 10, fill: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace' }}>
              {_vduFmtAm(am)}
            </text>
          );
        })}
        {/* Linhas */}
        {marcas.map((marca, ri) => {
          const y = padTop + ri * cellH;
          return (
            <g key={`r-${marca}`}>
              {/* Label marca */}
              <text x={labelW - 8} y={y + cellH / 2 + 4} textAnchor="end"
                    style={{ fontSize: 11, fill: 'var(--text-2)' }}>
                {marca.length > 16 ? marca.slice(0, 15) + '…' : marca}
                <title>{marca}</title>
              </text>
              {/* Celulas */}
              {meses.map((am, ci) => {
                const rec = byKey[`${marca}||${am}`];
                const v = rec ? rec.rs_dia_util : null;
                const x = labelW + ci * cellW;
                const fill = _vduCellColor(v, vMin, vMax);
                const isActive = activeCell && activeCell.marca === marca && activeCell.am === am;
                const isDimmed = activeCell && !isActive;
                const tooltip = rec
                  ? `${marca} · ${am}\nR$/dia util: ${_fmtBRL(v)}\nTotal mes: ${_fmtBRLk(rec.v)}\nDias uteis: ${rec.dias_uteis}`
                  : `${marca} · ${am}\nsem vendas`;
                return (
                  <g key={`c-${marca}-${am}`}
                     onClick={() => v != null && onCellClick && onCellClick({ marca, am, ...rec })}
                     style={{ cursor: v != null && onCellClick ? 'pointer' : 'default' }}>
                    <rect x={x + 1} y={y + 1} width={cellW - 2} height={cellH - 2}
                          rx={3} fill={fill}
                          stroke={isActive ? 'var(--cyan)' : 'transparent'}
                          strokeWidth={isActive ? 2 : 0}
                          opacity={isDimmed ? 0.35 : 1}>
                      <title>{tooltip}</title>
                    </rect>
                    {v != null && cellW > 48 && (
                      <text x={x + cellW / 2} y={y + cellH / 2 + 4} textAnchor="middle"
                            style={{ fontSize: 10, fill: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none' }}>
                        {(() => {
                          const a = Math.abs(v);
                          if (a >= 1e6) return `${(v/1e6).toFixed(1).replace('.', ',')}M`;
                          if (a >= 1e3) return `${(v/1e3).toFixed(0)}k`;
                          return v.toFixed(0);
                        })()}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ===== Sparkline mes-a-mes (MEDIA por dia util, nao total) =====
const VduSparkMensal = ({ rows }) => {
  if (!rows || !rows.length) return <div className="empty">sem dados</div>;
  // rs_dia_util = SUM(valor_rateado) / DISTINCT(dias_uteis_mes)
  const values = rows.map((r) => r.rs_dia_util || 0);
  const labels = rows.map((r) => _vduFmtAm(r.am));
  return <AstroBarV values={values} labels={labels} color="cyan" height={200} fmt={_fmtBRLk} />;
};

// ===== Pagina principal =====
const PageVendasDiaUtil = () => {
  const [filters, setFilters] = React.useState(() => ({ ...DEFAULT_FILTERS_VDU }));
  const [activeCell, setActiveCell] = React.useState(null);
  const status = useDuckDBStatus();
  const setF = React.useCallback((np) => setFilters((prev) => ({ ...prev, ...np })), []);

  // Vendas/Dia Util é janela FIXA últimos 12 meses — não escuta o filtro global
  const where = React.useMemo(() => _buildWhereVDU(filters), [filters]);

  // === Opcoes de filtro (DISTINCT global; nao depende dos filtros) ===
  // VDU_DATA pode existir como fallback; se nao, query 1x via DuckDB.
  const seed = (typeof window !== 'undefined' && window.VDU_DATA) || { marcas_top: [], meses_18: [] };
  const optsQ = useDuckDBQuery(`
    WITH base AS (
      SELECT * FROM vendas
      WHERE data_pedido IS NOT NULL
    )
    SELECT
      (SELECT json_group_array(am) FROM (
        SELECT DISTINCT strftime(data_pedido, '%Y-%m') AS am FROM base ORDER BY am DESC
      ) t) AS ano_mes,
      (SELECT json_group_array(m) FROM (
        SELECT DISTINCT marca AS m FROM base WHERE marca IS NOT NULL AND marca <> '' ORDER BY m
      ) t) AS marca
  `, []);
  const optsRaw = optsQ.data && optsQ.data[0] ? optsQ.data[0] : {};
  const _parseJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch (e) { return fb; } };
  const opts = {
    ano_mes: _parseJson(optsRaw.ano_mes, seed.meses_18.slice().reverse()),
    marca: _parseJson(optsRaw.marca, seed.marcas_top),
  };

  // === Matriz Marca x Mes (heatmap principal) ===
  const matrizSql = React.useMemo(() => `
    WITH base AS (SELECT * FROM vendas WHERE ${where} AND marca IS NOT NULL AND marca <> ''),
    dias_uteis AS (
      SELECT strftime(data_pedido, '%Y-%m') AS am,
             COUNT(DISTINCT CAST(data_pedido AS DATE)) AS du
      FROM base
      GROUP BY 1
    ),
    vendas_marca_mes AS (
      SELECT marca,
             strftime(data_pedido, '%Y-%m') AS am,
             SUM(valor_rateado)::DOUBLE AS v
      FROM base
      GROUP BY 1, 2
    ),
    -- Restringe a TOP 20 marcas pelo total no recorte filtrado
    top_marcas AS (
      SELECT marca FROM vendas_marca_mes
      GROUP BY marca
      ORDER BY SUM(v) DESC
      LIMIT 20
    ),
    -- Restringe aos ULTIMOS 18 ano-mes presentes (ja considerando filtro)
    top_meses AS (
      SELECT am FROM (SELECT DISTINCT am FROM vendas_marca_mes ORDER BY am DESC LIMIT 18) t
    )
    SELECT v.marca,
           v.am,
           v.v,
           d.du AS dias_uteis,
           (v.v / NULLIF(d.du, 0))::DOUBLE AS rs_dia_util
    FROM vendas_marca_mes v
    JOIN dias_uteis d USING (am)
    WHERE v.marca IN (SELECT marca FROM top_marcas)
      AND v.am IN (SELECT am FROM top_meses)
    ORDER BY v.am ASC, rs_dia_util DESC
  `, [where]);
  const matrizQ = useDuckDBQuery(matrizSql, [matrizSql]);

  // === Evolucao mensal (linha do topo, agregada de TODAS as marcas no recorte) ===
  const mensalSql = React.useMemo(() => `
    WITH base AS (SELECT * FROM vendas WHERE ${where})
    SELECT strftime(data_pedido, '%Y-%m') AS am,
           SUM(valor_rateado)::DOUBLE AS v_total,
           COUNT(DISTINCT CAST(data_pedido AS DATE))::INT AS dias_uteis,
           (SUM(valor_rateado) / NULLIF(COUNT(DISTINCT CAST(data_pedido AS DATE)), 0))::DOUBLE AS rs_dia_util
    FROM base
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 18
  `, [where]);
  const mensalQ = useDuckDBQuery(mensalSql, [mensalSql]);

  // === TOP 30 (marca, mes) por R$/dia util ===
  const topSql = React.useMemo(() => `
    WITH base AS (SELECT * FROM vendas WHERE ${where} AND marca IS NOT NULL AND marca <> ''),
    dias_uteis AS (
      SELECT strftime(data_pedido, '%Y-%m') AS am,
             COUNT(DISTINCT CAST(data_pedido AS DATE)) AS du
      FROM base GROUP BY 1
    ),
    vm AS (
      SELECT marca, strftime(data_pedido, '%Y-%m') AS am,
             SUM(valor_rateado)::DOUBLE AS v,
             COUNT(DISTINCT numero)::INT AS n
      FROM base
      GROUP BY 1, 2
    )
    SELECT vm.marca, vm.am, vm.v, vm.n,
           d.du AS dias_uteis,
           (vm.v / NULLIF(d.du, 0))::DOUBLE AS rs_dia_util
    FROM vm JOIN dias_uteis d USING(am)
    ORDER BY rs_dia_util DESC NULLS LAST
    LIMIT 30
  `, [where]);
  const topQ = useDuckDBQuery(topSql, [topSql]);

  // === Derivados pro heatmap (lista de marcas + meses ordenados) ===
  const matrizRows = matrizQ.data || [];
  const marcasHeat = React.useMemo(() => {
    const set = new Map();
    for (const r of matrizRows) {
      set.set(r.marca, (set.get(r.marca) || 0) + (r.v || 0));
    }
    return [...set.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }, [matrizRows]);
  const mesesHeat = React.useMemo(() => {
    const set = new Set(matrizRows.map((r) => r.am));
    return [...set].sort();
  }, [matrizRows]);

  // === KPIs cabecalho ===
  const totalGeral = React.useMemo(
    () => matrizRows.reduce((s, r) => s + (r.v || 0), 0),
    [matrizRows]
  );
  const rsDiaUtilGeral = React.useMemo(() => {
    const mensal = mensalQ.data || [];
    const totV = mensal.reduce((s, r) => s + (r.v_total || 0), 0);
    const totD = mensal.reduce((s, r) => s + (r.dias_uteis || 0), 0);
    return totD ? totV / totD : 0;
  }, [mensalQ.data]);

  // === Cross-filter on click numa celula ===
  const onCellClick = React.useCallback((rec) => {
    setActiveCell((prev) => (prev && prev.marca === rec.marca && prev.am === rec.am) ? null : { marca: rec.marca, am: rec.am });
    // Notifica a Dash via window — opt-in (PageAstroDash decide se escuta).
    try {
      window.__vduDrill = { marca: rec.marca, am: rec.am };
      window.dispatchEvent(new CustomEvent('astro-xf', { detail: { source: 'vdu', marca: rec.marca, am: rec.am } }));
    } catch (e) { /* noop */ }
  }, []);

  const loading = matrizQ.loading || mensalQ.loading || topQ.loading;
  const queryErr = matrizQ.error || mensalQ.error || topQ.error;

  if (status.error) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="card" style={{ padding: 24, color: 'var(--red-2)' }}>
          <h3 style={{ marginTop: 0 }}>Erro ao carregar DuckDB-WASM</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{status.error}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Vendas / Dia útil</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: status.ready ? 'var(--green-2)' : 'var(--mute)' }}>
          {status.ready ? 'DuckDB ready' : 'Carregando parquet…'}
        </span>
      </div>

      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>Vendas / Dia útil · Marca × Mês</h1>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--mute)' }}>
        Heatmap reativo: cada célula = SUM(valor_rateado) ÷ DISTINCT(dias_uteis) daquela marca naquele mês.
        Clique numa célula pra cross-filtrar a Dash.
      </p>

      {/* Filtros sticky compactos */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(13,18,22,0.92)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 0', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <MultiSelect label="Ano-Mês" options={opts.ano_mes || []} value={filters.anoMes}
                       onChange={(v) => setF({ anoMes: v })} width={170} />
          <MultiSelect label="Marca" options={opts.marca || []} value={filters.marca}
                       onChange={(v) => setF({ marca: v })} width={200} />
          <div style={{ minWidth: 130 }}>
            <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Dia útil</div>
            <div className="seg" style={{ display: 'flex' }}>
              {[{ value: 'util', label: 'Útil' }, { value: 'all', label: 'Todos' }].map((opt) => (
                <button key={opt.value} type="button"
                        className={filters.diaUtil === opt.value ? 'active' : ''}
                        onClick={() => setF({ diaUtil: opt.value })}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 11 }}>{opt.label}</button>
              ))}
            </div>
          </div>
          {(filters.anoMes.length || filters.marca.length || activeCell) ? (
            <button onClick={() => { setFilters({ ...DEFAULT_FILTERS_VDU }); setActiveCell(null); }}
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--mute)',
                             padding: '7px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
              LIMPAR
            </button>
          ) : null}
        </div>
      </div>

      {!status.ready ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--mute)' }}>
          Inicializando DuckDB-WASM…
        </div>
      ) : (
        <>
          {/* KPIs topo */}
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <div className="card kpi-mini">
              <div className="kpi-label">Vendas/Dia útil (período)</div>
              <div className="kpi-value">{_fmtBRLk(rsDiaUtilGeral)}</div>
              <div className="kpi-hint">soma valor ÷ soma dias úteis</div>
            </div>
            <div className="card kpi-mini">
              <div className="kpi-label">Total no recorte</div>
              <div className="kpi-value">{_fmtBRLk(totalGeral)}</div>
              <div className="kpi-hint">{marcasHeat.length} marcas × {mesesHeat.length} meses</div>
            </div>
            <div className="card kpi-mini">
              <div className="kpi-label">Status</div>
              <div className="kpi-value" style={{ fontSize: 14, color: loading ? 'var(--amber)' : 'var(--green)' }}>
                {loading ? 'atualizando…' : 'ok'}
              </div>
              <div className="kpi-hint">{queryErr ? String(queryErr).slice(0, 64) : 'queries DuckDB-WASM'}</div>
            </div>
          </div>

          {/* Evolução mensal */}
          <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
            Evolução das vendas mensais (18m){' '}
            {mensalQ.loading && <span style={{ fontSize: 11, color: 'var(--mute)', fontWeight: 400 }}>· atualizando…</span>}
          </h3>
          <div className="card" style={{ marginBottom: 22 }}>
            <VduSparkMensal rows={(mensalQ.data || []).slice().reverse()} />
          </div>

          {/* Heatmap principal */}
          <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
            Matriz Marca × Mês · R$/Dia útil{' '}
            {matrizQ.loading && <span style={{ fontSize: 11, color: 'var(--mute)', fontWeight: 400 }}>· atualizando…</span>}
          </h3>
          <div className="card" style={{ marginBottom: 22 }}>
            {queryErr ? (
              <div style={{ color: 'var(--red-2)', fontSize: 12, padding: 12 }}>Erro: {String(queryErr)}</div>
            ) : (
              <VduHeatmap rows={matrizRows} marcas={marcasHeat} meses={mesesHeat}
                          onCellClick={onCellClick} activeCell={activeCell} />
            )}
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--mute)' }}>
              Top 20 marcas × últimos 18 meses dentro do recorte. Cor = R$/dia útil normalizado (frio → quente).
            </div>
          </div>

          {/* Top 30 marca-mes */}
          <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
            TOP 30 (Marca × Mês) por R$/Dia útil
          </h3>
          <div className="card" style={{ marginBottom: 22, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', color: 'var(--mute)', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.4 }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>#</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Marca</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Mês</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>R$/Dia útil</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total mês</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Dias úteis</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {(topQ.data || []).map((r, i) => {
                  const isActive = activeCell && activeCell.marca === r.marca && activeCell.am === r.am;
                  return (
                    <tr key={`${r.marca}-${r.am}`}
                        onClick={() => onCellClick(r)}
                        style={{
                          borderTop: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: isActive ? 'rgba(34,211,238,0.08)' : 'transparent',
                        }}>
                      <td style={{ padding: '8px 12px', color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace' }}>{i + 1}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{r.marca}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace' }}>{_vduFmtAm(r.am)} ({r.am})</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--cyan-2)', fontFamily: 'JetBrains Mono, monospace' }}>{_fmtBRL(r.rs_dia_util)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{_fmtBRLk(r.v)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace' }}>{r.dias_uteis}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace' }}>{_fmtNum(r.n)}</td>
                    </tr>
                  );
                })}
                {!topQ.loading && (topQ.data || []).length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--mute)', fontSize: 12 }}>sem dados no recorte</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            Métrica: <code>SUM(valor_rateado) / COUNT(DISTINCT data_pedido::DATE)</code> com dayofweek BETWEEN 1 AND 5.
            Fonte: <code>vendas_dash.parquet</code> via DuckDB-WASM.
          </div>
        </>
      )}
    </div>
  );
};

// Registra no escopo do bundle (mesmo padrao de pages-astro.jsx)
Object.assign(window, { PageVendasDiaUtil });
