/**
 * pages-dashfatur.jsx — Dash · Faturamento (variante historica/comparativa da Dash)
 *
 * Foco: comparacao ano-vs-ano + evolucao rolling 12 meses.
 *
 * Dados:
 *  - window.DASHFATUR_DATA (pre-computado por scripts/build_dashfatur_data.py)
 *    Usado pros graficos base (anual/sazonalidade/rolling/tabela24) — visao sem filtro.
 *  - DuckDB-WASM (view `vendas`) — recalcula tudo quando o usuario aplica filtros
 *    marca/categoria. Mesmo padrao do PageAstroDash.
 *
 * Reusa helpers globais: _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct,
 * AstroBarV, AstroLine, AstroBarH, _runQuery, useDuckDBQuery, useDuckDBStatus,
 * MultiSelect, _sqlEsc, _sqlList.
 */

// ===========================================================================
// AstroBarVGrouped — bar agrupado (varias series por categoria/mes)
// Adapta o padrao AstroBarV pra renderizar N series side-by-side por slot.
// ===========================================================================
const AstroBarVGrouped = ({ groups, series, labels, colors, height = 240, fmt }) => {
  // groups: array de labels do eixo X (ex: ['Jan','Fev',...])
  // series: { name, values:[per group] }
  // labels: legenda das series (mesma ordem)
  // colors: array de cores hex
  if (!groups || !groups.length || !series || !series.length) {
    return <div className="empty">sem dados</div>;
  }
  const fmtFn = fmt || _fmtBRLk;
  const palette = colors || ['#22d3ee', '#10b981', '#a78bfa', '#f59e0b', '#ef4444'];
  let max = 0;
  for (const s of series) for (const v of s.values) if (v > max) max = v;
  if (max === 0) max = 1;
  const N = groups.length;
  const S = series.length;
  const padT = 24, padB = 36, padL = 12, padR = 12;
  const groupSlot = N <= 6 ? 110 : (N <= 12 ? 78 : 60);
  const barW = Math.max(8, (groupSlot * 0.78) / S);
  const W = Math.max(320, padL + padR + N * groupSlot);
  const H = height;
  const innerH = H - padT - padB;

  return (
    <div style={{ width: '100%' }}>
      {/* Legenda */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 6, flexWrap: 'wrap', fontSize: 11 }}>
        {labels.map((lab, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
            <span style={{ width: 10, height: 10, background: palette[i % palette.length], borderRadius: 2 }} />
            {lab}
          </span>
        ))}
      </div>
      <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          <line x1={padL} y1={H - padB + 0.5} x2={W - padR} y2={H - padB + 0.5}
                stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          {groups.map((g, gi) => {
            const slotStart = padL + groupSlot * gi;
            const groupCenter = slotStart + groupSlot / 2;
            const groupInnerW = barW * S + (S - 1) * 3;
            const firstX = groupCenter - groupInnerW / 2;
            return (
              <g key={gi}>
                {series.map((s, si) => {
                  const v = s.values[gi] || 0;
                  const h = (v / max) * innerH;
                  const x = firstX + si * (barW + 3);
                  const y = padT + (innerH - h);
                  return (
                    <rect key={si} x={x} y={y} width={barW} height={Math.max(2, h)}
                          rx="2" fill={palette[si % palette.length]} opacity={0.92}>
                      <title>{`${s.name} · ${g}: ${fmtFn(v)}`}</title>
                    </rect>
                  );
                })}
                <text x={groupCenter} y={H - 14} textAnchor="middle"
                      style={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                  {g}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

// ===========================================================================
// KpiCardDelta — KPI com valor + comparacao % vs anterior
// ===========================================================================
const KpiCardDelta = ({ label, value, prevValue, delta, fmt, hint, accent = 'cyan' }) => {
  const fmtFn = fmt || _fmtBRLk;
  const isPos = delta != null && delta > 0;
  const isNeg = delta != null && delta < 0;
  const deltaColor = isPos ? 'var(--green-2)' : (isNeg ? 'var(--red-2)' : 'var(--mute)');
  const arrow = isPos ? '▲' : (isNeg ? '▼' : '·');
  return (
    <div className={`kpi-tile ${accent}`} style={{ position: 'relative' }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{fmtFn(value)}</div>
      <div className="kpi-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: deltaColor, fontWeight: 600 }}>
          {arrow} {delta != null ? _fmtPct(delta, 1) : '—'}
        </span>
        <span style={{ color: 'var(--mute)' }}>{hint || `vs ${fmtFn(prevValue || 0)}`}</span>
      </div>
    </div>
  );
};

// ===========================================================================
// PageDashFaturamento
// ===========================================================================
const PageDashFaturamento = () => {
  const status = useDuckDBStatus();
  const D = window.DASHFATUR_DATA;

  // Filtros locais (marca/categoria multi)
  const [marca, setMarca] = React.useState([]);
  const [categoria, setCategoria] = React.useState([]);
  const hasFilter = (marca && marca.length > 0) || (categoria && categoria.length > 0);

  // Builder WHERE local (so quando DuckDB esta ready e tem filtro)
  const buildWhere = React.useCallback(() => {
    const parts = ['data_pedido IS NOT NULL'];
    if (marca && marca.length) parts.push(`marca IN (${_sqlList(marca)})`);
    if (categoria && categoria.length) parts.push(`categoria_mae IN (${_sqlList(categoria)})`);
    return parts.join(' AND ');
  }, [marca, categoria]);

  const where = buildWhere();

  // ============================================================
  // Quando filtro ativo: roda 1 query reativa pra recomputar
  // kpis/anual/mensal_ano/rolling/tabela/sazonalidade.
  // Caso contrario, usa o D pre-computado.
  // ============================================================
  const sqlFiltered = React.useMemo(() => {
    if (!hasFilter || !status.ready) return null;
    return `
      WITH base AS (SELECT * FROM vendas WHERE ${where}),
      mensal AS (
        SELECT strftime(data_pedido, '%Y-%m') AS ym,
               EXTRACT(YEAR FROM data_pedido)::INT AS y,
               EXTRACT(MONTH FROM data_pedido)::INT AS m,
               SUM(valor_rateado)::DOUBLE AS valor,
               COUNT(DISTINCT numero)::INT AS n
        FROM base GROUP BY 1,2,3
      ),
      anos_disp AS (SELECT DISTINCT y FROM mensal ORDER BY y),
      max_dt AS (SELECT MAX(data_pedido) AS d FROM base)
      SELECT
        (SELECT EXTRACT(YEAR FROM d)::INT FROM max_dt) AS ano_ref,
        (SELECT EXTRACT(MONTH FROM d)::INT FROM max_dt) AS mes_ref,
        (SELECT json_group_array(y) FROM anos_disp) AS anos_disp,
        (SELECT json_group_array(json_object('ym', ym, 'y', y, 'm', m, 'valor', valor, 'n_vendas', n))
          FROM (SELECT * FROM mensal ORDER BY ym) t) AS mensal
    `;
  }, [where, hasFilter, status.ready]);

  const { data: filteredRows, loading: filtLoading, error: filtError } = useDuckDBQuery(sqlFiltered, [sqlFiltered]);

  // Compute the view (filtered or pre-computed) using same shape as D.
  const view = React.useMemo(() => {
    if (!hasFilter) return D || null;
    if (!filteredRows || !filteredRows[0]) return null;
    const row = filteredRows[0];
    const ano_ref = row.ano_ref;
    const mes_ref = row.mes_ref;
    const anos_disp = JSON.parse(row.anos_disp || '[]');
    const mensal_total = JSON.parse(row.mensal || '[]');
    if (!mensal_total.length) return null;

    // KPIs YTD/PYTD
    const ytd = mensal_total.filter(x => x.y === ano_ref && x.m <= mes_ref)
                            .reduce((a, x) => ({ valor: a.valor + (x.valor||0), n: a.n + (x.n_vendas||0) }), { valor: 0, n: 0 });
    const pytd = mensal_total.filter(x => x.y === ano_ref - 1 && x.m <= mes_ref)
                              .reduce((a, x) => ({ valor: a.valor + (x.valor||0), n: a.n + (x.n_vendas||0) }), { valor: 0, n: 0 });
    const pctVar = (a, b) => (!b ? 0 : (a - b) / b);
    const ticket_ytd = ytd.n ? ytd.valor / ytd.n : 0;
    const ticket_pytd = pytd.n ? pytd.valor / pytd.n : 0;

    // serie_anual
    const anos_set = {};
    for (const r of mensal_total) {
      if (!anos_set[r.y]) anos_set[r.y] = { ano: r.y, valor: 0, n_vendas: 0 };
      anos_set[r.y].valor += r.valor || 0;
      anos_set[r.y].n_vendas += r.n_vendas || 0;
    }
    const serie_anual = Object.values(anos_set).sort((a, b) => a.ano - b.ano);

    // mensal_ano: {ano: {valor:[12], n_vendas:[12]}}
    const mensal_ano = {};
    for (const a of anos_disp) {
      mensal_ano[String(a)] = { valor: Array(12).fill(0), n_vendas: Array(12).fill(0) };
    }
    for (const r of mensal_total) {
      const slot = mensal_ano[String(r.y)];
      if (slot && r.m >= 1 && r.m <= 12) {
        slot.valor[r.m - 1] = r.valor || 0;
        slot.n_vendas[r.m - 1] = r.n_vendas || 0;
      }
    }

    // rolling12
    const mensal_ord = mensal_total.slice().sort((a, b) => a.ym.localeCompare(b.ym));
    const rolling12 = [];
    const wv = [];
    for (const r of mensal_ord) {
      wv.push(r.valor || 0);
      if (wv.length > 12) wv.shift();
      rolling12.push({ ym: r.ym, valor_mes: r.valor || 0, rolling_valor: wv.reduce((a, b) => a + b, 0), completa: wv.length === 12 });
    }

    // sazonalidade: ultimos 3 anos
    const anos_saz = anos_disp.slice(-3);
    const sazonalidade = [];
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    for (let m = 1; m <= 12; m++) {
      const vals = [];
      for (const a of anos_saz) {
        if (a === ano_ref && m >= mes_ref) continue;
        const ent = mensal_total.find(x => x.y === a && x.m === m);
        if (ent && ent.valor > 0) vals.push(ent.valor);
      }
      const media = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
      sazonalidade.push({ mes: m, label: meses[m-1], valor_medio: media, n_anos: vals.length });
    }

    // tabela24
    const ult24 = mensal_ord.slice(-24);
    const ymMap = {};
    mensal_ord.forEach((r, i) => { ymMap[r.ym] = i; });
    const tabela24 = ult24.map(r => {
      const idx = ymMap[r.ym];
      const prev = idx > 0 ? mensal_ord[idx - 1] : null;
      const [y, m] = r.ym.split('-');
      const ymYoy = `${parseInt(y) - 1}-${m}`;
      const yoyIdx = ymMap[ymYoy];
      const yoy = yoyIdx != null ? mensal_ord[yoyIdx] : null;
      return {
        ym: r.ym,
        valor: r.valor || 0,
        n_vendas: r.n_vendas || 0,
        delta_mom: prev ? pctVar(r.valor || 0, prev.valor || 0) : null,
        delta_yoy: yoy ? pctVar(r.valor || 0, yoy.valor || 0) : null,
      };
    });

    return {
      kpis: {
        ano_ref, mes_ref,
        valor_ytd: ytd.valor, valor_pytd: pytd.valor, var_valor: pctVar(ytd.valor, pytd.valor),
        n_vendas_ytd: ytd.n, n_vendas_pytd: pytd.n, var_n_vendas: pctVar(ytd.n, pytd.n),
        ticket_ytd, ticket_pytd, var_ticket: pctVar(ticket_ytd, ticket_pytd),
      },
      anos_disp,
      serie_anual,
      mensal_ano,
      rolling12,
      sazonalidade,
      tabela24,
    };
  }, [hasFilter, filteredRows, D]);

  // ============================================================
  // Render
  // ============================================================
  if (!D && !hasFilter) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          dashfatur-data.js não carregado. Rode: <code>python scripts/build_dashfatur_data.py</code>
        </div>
      </div>
    );
  }

  if (hasFilter && !status.ready) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="empty" style={{ padding: 40, textAlign: 'center', color: 'var(--mute)' }}>
          Inicializando DuckDB-WASM para aplicar filtros…
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="empty" style={{ padding: 40, textAlign: 'center', color: 'var(--mute)' }}>
          {filtLoading ? 'Recomputando agregados…' : 'sem dados pro filtro aplicado'}
        </div>
      </div>
    );
  }

  const opcoes = (D && D.opcoes) || { marcas: [], categorias: [] };
  const k = view.kpis;
  const mesesLabel = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const anosCmp = view.anos_disp || [];
  const COLOR_BY_ANO = ['#22d3ee', '#10b981', '#a78bfa', '#f59e0b', '#ef4444'];

  // Series mensais agrupadas (Jan..Dez × ano)
  const series = anosCmp.map((a, i) => ({
    name: String(a),
    values: (view.mensal_ano[String(a)] || { valor: Array(12).fill(0) }).valor,
  }));

  // Rolling 12 — pega so onde tem janela completa pra evitar comparacao distorcida no inicio
  const rolling12 = view.rolling12 || [];
  const rollingPlot = rolling12.filter(x => x.completa);
  const rollingLabels = rollingPlot.map(x => x.ym.slice(2)); // YY-MM
  const rollingValues = rollingPlot.map(x => x.rolling_valor);

  // Sazonalidade
  const saz = view.sazonalidade || [];

  // Tabela 24m (ordem cronologica)
  const tab = view.tabela24 || [];

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Dash · Faturamento</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: status.ready ? 'var(--green-2)' : 'var(--mute)' }}>
          {hasFilter
            ? (filtLoading ? 'recomputando…' : 'filtro reativo · DuckDB')
            : 'snapshot pré-computado · sem filtro'}
        </span>
      </div>

      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>Dash · Faturamento</h1>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--mute)' }}>
        Comparativo ano-vs-ano + evolução rolling 12 meses. YTD vs PYTD com corte no mês mais recente.
      </p>

      {/* Filtros marca/categoria */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
        padding: '12px 0', marginBottom: 14, borderBottom: '1px solid var(--border)',
      }}>
        <MultiSelect label="Marca" options={opcoes.marcas || []} value={marca} onChange={setMarca} width={180} />
        <MultiSelect label="Categoria mãe" options={opcoes.categorias || []} value={categoria} onChange={setCategoria} width={180} />
        {hasFilter && (
          <button onClick={() => { setMarca([]); setCategoria([]); }}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--mute)', padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
            limpar filtros
          </button>
        )}
        {filtError && <span style={{ color: 'var(--red-2)', fontSize: 11 }}>erro: {filtError}</span>}
      </div>

      {/* KPIs YTD vs PYTD */}
      <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 8 }}>
        Período YTD: <b>{k.ano_ref}</b> · até mês <b>{mesesLabel[(k.mes_ref || 1) - 1]}</b> · comparado com mesmo período em <b>{k.ano_ref - 1}</b>
      </div>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <KpiCardDelta label="Faturamento YTD" value={k.valor_ytd} prevValue={k.valor_pytd}
                       delta={k.var_valor} fmt={_fmtBRLk} accent="cyan" />
        <KpiCardDelta label="Nº Vendas YTD" value={k.n_vendas_ytd} prevValue={k.n_vendas_pytd}
                       delta={k.var_n_vendas} fmt={(v) => _fmtNum(v)} accent="green" />
        <KpiCardDelta label="Ticket Médio YTD" value={k.ticket_ytd} prevValue={k.ticket_pytd}
                       delta={k.var_ticket} fmt={_fmtBRL} accent="amber" />
      </div>

      {/* Comparativo mensal multi-ano */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 12px' }}>
        Comparativo Mensal · {anosCmp.join(' vs ')}
      </h3>
      <div className="card" style={{ padding: 14, marginBottom: 20 }}>
        <div className="card-title-row" style={{ marginBottom: 10 }}>
          <h2 className="card-title">Faturamento por mês (R$)</h2>
          <span style={{ fontSize: 10, color: 'var(--mute)' }}>barras lado-a-lado por ano</span>
        </div>
        <AstroBarVGrouped
          groups={mesesLabel}
          series={series}
          labels={anosCmp.map(String)}
          colors={COLOR_BY_ANO}
          height={260}
          fmt={_fmtBRLk}
        />
      </div>

      {/* Rolling 12 meses */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 12px' }}>
        Evolução · Rolling 12 meses
      </h3>
      <div className="card" style={{ padding: 14, marginBottom: 20 }}>
        <div className="card-title-row" style={{ marginBottom: 10 }}>
          <h2 className="card-title">Faturamento acumulado · janela móvel 12m</h2>
          <span style={{ fontSize: 10, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
            {rollingPlot.length} pontos · {rollingPlot.length ? `${rollingPlot[0].ym} → ${rollingPlot[rollingPlot.length-1].ym}` : '—'}
          </span>
        </div>
        {rollingPlot.length > 0 ? (
          <AstroLine values={rollingValues} labels={rollingLabels} color="var(--cyan)" height={220} />
        ) : (
          <div className="empty" style={{ padding: 24, color: 'var(--mute)' }}>
            série curta demais — precisa de ≥12 meses para janela móvel.
          </div>
        )}
        {rollingPlot.length > 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
            <div className="card kpi-mini">
              <div className="kpi-label">Atual (último 12m)</div>
              <div className="kpi-value">{_fmtBRLk(rollingValues[rollingValues.length-1])}</div>
              <div className="kpi-hint">{rollingPlot[rollingPlot.length-1].ym}</div>
            </div>
            <div className="card kpi-mini">
              <div className="kpi-label">12m atrás</div>
              <div className="kpi-value">{_fmtBRLk(rollingValues[0])}</div>
              <div className="kpi-hint">{rollingPlot[0].ym}</div>
            </div>
            <div className="card kpi-mini">
              <div className="kpi-label">Crescimento</div>
              <div className="kpi-value" style={{
                color: rollingValues[rollingValues.length-1] >= rollingValues[0] ? 'var(--green-2)' : 'var(--red-2)',
              }}>
                {_fmtPct((rollingValues[rollingValues.length-1] - rollingValues[0]) / (rollingValues[0] || 1), 1)}
              </div>
              <div className="kpi-hint">rolling 12m</div>
            </div>
          </div>
        )}
      </div>

      {/* Sazonalidade */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 12px' }}>
        Sazonalidade · média Jan-Dez (últimos 3 anos)
      </h3>
      <div className="card" style={{ padding: 14, marginBottom: 20 }}>
        <div className="card-title-row" style={{ marginBottom: 10 }}>
          <h2 className="card-title">Média mensal histórica</h2>
          <span style={{ fontSize: 10, color: 'var(--mute)' }}>exclui meses ainda não fechados no ano corrente</span>
        </div>
        <AstroBarV
          values={saz.map(s => s.valor_medio)}
          labels={saz.map(s => s.label)}
          color="violet"
          height={220}
          fmt={_fmtBRLk}
        />
      </div>

      {/* Tabela 24 meses */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 12px' }}>
        Detalhamento · últimos 24 meses
      </h3>
      <div className="card" style={{ padding: 14, marginBottom: 20 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="t" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Mês</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th style={{ textAlign: 'right' }}>Nº Vendas</th>
                <th style={{ textAlign: 'right' }}>Δ MoM</th>
                <th style={{ textAlign: 'right' }}>Δ YoY</th>
              </tr>
            </thead>
            <tbody>
              {tab.slice().reverse().map((r, i) => {
                const mColor = r.delta_mom == null ? 'var(--mute)' : (r.delta_mom >= 0 ? 'var(--green-2)' : 'var(--red-2)');
                const yColor = r.delta_yoy == null ? 'var(--mute)' : (r.delta_yoy >= 0 ? 'var(--green-2)' : 'var(--red-2)');
                return (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.ym}</td>
                    <td className="num">{_fmtBRLk(r.valor)}</td>
                    <td className="num" style={{ color: 'var(--mute)' }}>{_fmtNum(r.n_vendas)}</td>
                    <td className="num" style={{ color: mColor }}>{r.delta_mom == null ? '—' : _fmtPct(r.delta_mom, 1)}</td>
                    <td className="num" style={{ color: yColor }}>{r.delta_yoy == null ? '—' : _fmtPct(r.delta_yoy, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        Dados pré-computados via <code>scripts/build_dashfatur_data.py</code>. Quando há filtro de marca/categoria,
        recomputa via DuckDB-WASM sobre <code>data/vendas_dash.parquet</code>. YTD compara janeiro-{mesesLabel[(k.mes_ref||1)-1]} ano corrente vs mesmo período ano anterior.
      </div>
    </div>
  );
};

// Registra no escopo do bundle
Object.assign(window, { PageDashFaturamento });
