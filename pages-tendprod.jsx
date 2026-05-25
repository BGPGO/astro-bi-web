/**
 * pages-tendprod.jsx — Tendencia Produtos (YTD vs PYTD por Categoria)
 *
 * Portagem da tela "TENDENCIA PRODUTOS" do PBI Astro (pagina 12):
 *   - Line chart multi-serie no topo (top 8 categorias mae, 18m)
 *   - Tabela rica: categoria × {YTD, PYTD, Δ R$, Δ %, Tend Linear, Tend % log, sparkline}
 *   - Bar chart top 15 categorias por crescimento %
 *   - Toggle granularidade: categoria_mae | sub_categoria | seo_title (top 30)
 *
 * Dados: window.TENDPROD_DATA (scripts/build_tendprod_data.py).
 * Helpers globais: _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct (de pages-astro.jsx).
 */

// ===== Mini sparkline (SVG inline pra tabela) =====
const _TendSpark = ({ values, width = 90, height = 26 }) => {
  if (!values || values.length < 2) return <div style={{ color: 'var(--mute)', fontSize: 10 }}>—</div>;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  // Cor: verde se cresce, vermelho se cai
  const trend = values[values.length - 1] - values[0];
  const color = trend >= 0 ? '#10b981' : '#ef4444';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

// ===== Multi-serie line chart (top categorias, 18m) =====
const _TendMultiLine = ({ series, labels, height = 260 }) => {
  // series: [{ k, points: [v0, v1, ...] }, ...]; labels: ['25-01', '25-02', ...]
  if (!series || !series.length || !labels || !labels.length) return <div className="empty">sem dados</div>;
  const W = 900, H = height, P = 36;
  const all = series.flatMap(s => s.points).filter(v => isFinite(v));
  const max = Math.max(...all, 1);
  const COLORS = ['#22d3ee', '#a78bfa', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6'];
  const n = labels.length;
  const xOf = (i) => P + (i / Math.max(1, n - 1)) * (W - P * 1.5);
  const yOf = (v) => H - P - (v / max) * (H - P * 1.8);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 600, height, display: 'block' }}>
        {/* Y axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = yOf(max * t);
          return (
            <g key={i}>
              <line x1={P} y1={y} x2={W - P / 2} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={P - 4} y={y + 3} textAnchor="end" style={{ fontSize: 9, fill: 'var(--mute)' }}>
                {(max * t / 1000).toFixed(0)}k
              </text>
            </g>
          );
        })}
        {/* X labels (cada 2) */}
        {labels.map((lab, i) => i % 2 === 0 && (
          <text key={i} x={xOf(i)} y={H - P / 2 + 8} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--mute)' }}>
            {lab}
          </text>
        ))}
        {/* Series */}
        {series.map((s, si) => {
          const color = COLORS[si % COLORS.length];
          const path = s.points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(v || 0)}`).join(' ');
          return (
            <g key={s.k}>
              <path d={path} stroke={color} strokeWidth="1.8" fill="none" opacity="0.85" vectorEffect="non-scaling-stroke" />
              {s.points.map((v, i) => (
                <circle key={i} cx={xOf(i)} cy={yOf(v || 0)} r="2" fill={color} opacity="0.6">
                  <title>{`${s.k} · ${labels[i]}: ${(v / 1000).toFixed(1)}k`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {/* Legenda */}
        {series.map((s, si) => {
          const color = COLORS[si % COLORS.length];
          const cols = 4;
          const col = si % cols;
          const row = Math.floor(si / cols);
          const lx = P + col * 200;
          const ly = 14 + row * 14;
          return (
            <g key={`leg-${s.k}`}>
              <rect x={lx} y={ly - 7} width="10" height="10" fill={color} opacity="0.85" rx="2" />
              <text x={lx + 14} y={ly + 1} style={{ fontSize: 10, fill: 'var(--text-2)' }}>
                {String(s.k).length > 22 ? String(s.k).slice(0, 22) + '…' : s.k}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const PageTendenciaProdutos = () => {
  const D = window.TENDPROD_DATA;
  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          tendprod-data.js nao carregado. Rode: <code>python scripts/build_tendprod_data.py</code>
        </div>
      </div>
    );
  }

  const [granularidade, setGranularidade] = useState('categoria_mae');
  const [sortKey, setSortKey] = useState('ytd');
  const [sortDir, setSortDir] = useState('desc');
  const [busca, setBusca] = useState('');

  const m = D.meta || {};
  const t = D.totais || {};

  // Fonte de dados pela granularidade selecionada
  const fonte = granularidade === 'sub_categoria' ? (D.subcategorias || [])
    : granularidade === 'seo_title' ? (D.seo_titles || [])
    : (D.categorias || []);

  // Sort + filtro
  const linhas = React.useMemo(() => {
    let arr = [...fonte];
    if (busca) {
      const q = busca.toLowerCase();
      arr = arr.filter(r => String(r.k || '').toLowerCase().includes(q));
    }
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av == null) av = -Infinity;
      if (bv == null) bv = -Infinity;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return arr;
  }, [fonte, busca, sortKey, sortDir]);

  const toggleSort = (k) => {
    if (sortKey === k) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  const sortIcon = (k) => sortKey !== k ? '' : (sortDir === 'desc' ? ' ▼' : ' ▲');

  // ===== Line chart multi-serie: top 8 categorias × 18m =====
  const lineData = React.useMemo(() => {
    if (granularidade !== 'categoria_mae') return null;
    const rows = D.serie_por_cat || [];
    if (!rows.length) return null;
    const labelsSet = new Set(rows.map(r => r.am));
    const labels = Array.from(labelsSet).sort();
    const byCat = {};
    rows.forEach(r => {
      if (!byCat[r.k]) byCat[r.k] = {};
      byCat[r.k][r.am] = r.v;
    });
    const series = Object.keys(byCat).map(k => ({
      k,
      points: labels.map(am => byCat[k][am] || 0),
    }));
    return { series, labels: labels.map(l => l.slice(2)) };
  }, [D.serie_por_cat, granularidade]);

  // ===== Bar chart top 15 por crescimento % =====
  const topCrescimento = React.useMemo(() => {
    const arr = (fonte || []).filter(r => r.growth_pct != null && r.pytd > 0);
    arr.sort((a, b) => (b.growth_pct || 0) - (a.growth_pct || 0));
    return arr.slice(0, 15);
  }, [fonte]);

  // ===== UI =====
  return (
    <div className="page" style={{ padding: '20px 28px 40px', maxWidth: 1500, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Tendência Produtos · YTD vs PYTD</b>
      </div>

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34,211,238,0.06), rgba(167,139,250,0.04))',
        borderRadius: 12, padding: '24px 28px', marginBottom: 18,
        border: '1px solid rgba(34,211,238,0.15)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(3, 1fr)', gap: 16, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 2 }}>
              YTD {m.ref_year} vs PYTD {m.prev_year}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}>
              Comparação Year-to-Date: <b>{m.ytd_ini}</b> → <b>{m.ytd_fim}</b> vs mesmo período de {m.prev_year}.
              Tendências calculadas via regressão linear sobre últimos 12 meses (R$/mês) e log-linear (taxa exponencial mensal).
            </div>
          </div>
          <div className="kpi-tile" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="kpi-label">YTD</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>{_fmtBRLk(t.ytd)}</div>
          </div>
          <div className="kpi-tile" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="kpi-label">PYTD</div>
            <div className="kpi-value" style={{ fontSize: 22, color: 'var(--mute)' }}>{_fmtBRLk(t.pytd)}</div>
          </div>
          <div className="kpi-tile" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="kpi-label">Crescimento</div>
            <div className="kpi-value" style={{
              fontSize: 24,
              color: (t.growth_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)',
            }}>
              {(t.growth_pct || 0) >= 0 ? '▲' : '▼'} {_fmtPct(Math.abs(t.growth_pct || 0), 2)}
            </div>
            <div className="kpi-hint">Δ {_fmtBRLk(t.delta)}</div>
          </div>
        </div>
      </div>

      {/* Toggle granularidade + busca */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        padding: '10px 0', marginBottom: 14, borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1 }}>Granularidade:</span>
        <div className="seg" style={{ display: 'inline-flex' }}>
          {[
            { id: 'categoria_mae', label: 'Categoria Mãe' },
            { id: 'sub_categoria', label: 'Sub-Categoria' },
            { id: 'seo_title', label: 'Produto (SEO)' },
          ].map(opt => (
            <button
              key={opt.id}
              className={granularidade === opt.id ? 'active' : ''}
              onClick={() => setGranularidade(opt.id)}
              style={{
                padding: '6px 12px', fontSize: 12,
                background: granularidade === opt.id ? 'var(--cyan)' : 'transparent',
                color: granularidade === opt.id ? '#0a0a0a' : 'var(--text-2)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                borderRadius: 4,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="filter-select"
          style={{ minWidth: 200, fontSize: 12 }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--mute)' }}>{linhas.length} linha(s)</span>
      </div>

      {/* Line chart multi-serie (so na granularidade categoria_mae) */}
      {lineData && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-title-row">
            <h2 className="card-title">Evolução Mensal · Top 8 Categorias (últimos 18 meses)</h2>
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>
              {lineData.labels[0]} → {lineData.labels[lineData.labels.length - 1]}
            </span>
          </div>
          <_TendMultiLine series={lineData.series} labels={lineData.labels} height={280} />
        </div>
      )}

      {/* Tabela rica */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title-row">
          <h2 className="card-title">
            Detalhe · {granularidade === 'categoria_mae' ? 'Categoria Mãe'
              : granularidade === 'sub_categoria' ? 'Sub-Categoria'
              : 'Produto (SEO Title)'}
          </h2>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>clique nos cabeçalhos para ordenar</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--mute)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 6px', minWidth: 200 }}>Categoria</th>
                <th style={{ padding: '8px 6px', cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('ytd')}>YTD{sortIcon('ytd')}</th>
                <th style={{ padding: '8px 6px', cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('pytd')}>PYTD{sortIcon('pytd')}</th>
                <th style={{ padding: '8px 6px', cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('delta')}>Δ R${sortIcon('delta')}</th>
                <th style={{ padding: '8px 6px', cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('growth_pct')}>Crescimento %{sortIcon('growth_pct')}</th>
                <th style={{ padding: '8px 6px', cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('trend_lin')}>Tend Linear (R$/mês){sortIcon('trend_lin')}</th>
                <th style={{ padding: '8px 6px', cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('trend_log_pct')}>Tend % Mensal (log){sortIcon('trend_log_pct')}</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', minWidth: 100 }}>Spark 12m</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r, i) => {
                const sparkVals = (r.mensal || []).map(x => x.v);
                const growthColor = r.growth_pct == null ? 'var(--mute)'
                  : r.growth_pct >= 0.15 ? 'var(--green)'
                  : r.growth_pct >= 0 ? 'var(--text)'
                  : r.growth_pct >= -0.15 ? 'var(--amber)'
                  : 'var(--red)';
                const linColor = (r.trend_lin || 0) >= 0 ? 'var(--green)' : 'var(--red)';
                const logColor = (r.trend_log_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)';
                return (
                  <tr key={r.k + '-' + i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 6px', color: 'var(--text)' }} title={r.k}>
                      {String(r.k || '').length > 50 ? String(r.k).slice(0, 50) + '…' : r.k || '(vazio)'}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(r.ytd)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtBRLk(r.pytd)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: (r.delta || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {(r.delta || 0) >= 0 ? '+' : ''}{_fmtBRLk(r.delta)}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: growthColor, fontWeight: 600 }}>
                      {r.growth_pct == null ? '—' : `${r.growth_pct >= 0 ? '+' : ''}${_fmtPct(r.growth_pct, 2)}`}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: linColor }}>
                      {(r.trend_lin || 0) >= 0 ? '+' : ''}{_fmtNum(r.trend_lin, 0)}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: logColor }}>
                      {(r.trend_log_pct || 0) >= 0 ? '+' : ''}{_fmtPct(r.trend_log_pct || 0, 2)}
                    </td>
                    <td style={{ padding: '6px', textAlign: 'center' }}>
                      <_TendSpark values={sparkVals} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 15 crescimento % */}
      {topCrescimento.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-title-row">
            <h2 className="card-title">Top 15 por Crescimento % YTD vs PYTD</h2>
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>apenas linhas com PYTD &gt; 0</span>
          </div>
          <AstroBarH
            items={topCrescimento.map(r => ({
              label: String(r.k || '').slice(0, 30),
              v: r.growth_pct,
            }))}
            fmt={(v) => _fmtPct(v, 1)}
            color="green"
          />
        </div>
      )}

      {/* Footer info */}
      <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 24, textAlign: 'center', lineHeight: 1.6 }}>
        Período de referência · {m.ytd_ini} a {m.ytd_fim} (vs {m.pytd_ini} a {m.pytd_fim})<br/>
        Tendência Linear = slope OLS sobre receita mensal nos últimos 12 meses. Tendência % Log = exp(slope) − 1 sobre log da receita.
      </div>
    </div>
  );
};
