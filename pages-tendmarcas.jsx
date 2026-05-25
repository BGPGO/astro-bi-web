/**
 * pages-tendmarcas.jsx — Astro · Tendencias Marcas (PBI tela 13)
 *
 * Migracao da tela "TENDENCIAS MARCAS" do Power BI. Mesma estrutura da tela
 * "Tendencia Produtos" mas pivotada por marca. Dados pre-computados em
 * scripts/build_tendmarcas_data.py -> window.TENDMARCAS_DATA.
 *
 * Layout:
 *  - Header + KPIs (YTD vs PYTD totalizado, crescimento %, n marcas)
 *  - Line chart top 10 marcas (serie mensal do ano YTD)
 *  - Bar chart top 20 marcas por crescimento %
 *  - Tabela rica: marca x { YTD R$, PYTD R$, Delta R$, Δ %, Tend. Linear, Tend. % Mensal (log), Sparkline 12m }
 *
 * Reutiliza _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct de pages-astro.jsx (concatenados
 * antes deste arquivo pelo build-jsx.cjs).
 *
 * Helper local: TendmarcasSpark (mini sparkline SVG por linha).
 */

// ===== Helpers locais =====
const _tmFmtPctDelta = (v, d = 1) => {
  if (v == null || !isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(d).replace('.', ',')}%`;
};

const _tmGrowthColor = (v) => {
  if (v == null || !isFinite(v)) return 'var(--mute)';
  if (v >= 10) return '#10b981';      // verde forte
  if (v > 0) return '#a5d6a7';        // verde suave
  if (v >= -10) return '#fdd835';     // amarelo
  return '#ef5350';                    // vermelho
};

const _tmGrowthBg = (v) => {
  if (v == null || !isFinite(v)) return 'transparent';
  if (v >= 10) return 'rgba(16,185,129,0.12)';
  if (v > 0) return 'rgba(165,214,167,0.08)';
  if (v >= -10) return 'rgba(253,216,53,0.10)';
  return 'rgba(239,83,80,0.14)';
};

// ===== Sparkline mini (SVG, sem dependencia) =====
const TendmarcasSpark = ({ values, width = 110, height = 28, color = '#22d3ee' }) => {
  if (!values || values.length < 2) return <span style={{ color: 'var(--mute)', fontSize: 10 }}>—</span>;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = (max - min) || 1;
  const P = 2;
  const pts = values.map((v, i) => {
    const x = P + (i / Math.max(1, values.length - 1)) * (width - P * 2);
    const y = height - P - ((v - min) / range) * (height - P * 2);
    return [x, y];
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  );
};

// ===== Line chart top 10 marcas (serie mensal do ano YTD) =====
const TendmarcasMultiLine = ({ series, labels, height = 280 }) => {
  if (!series || !series.length) return <div className="empty" style={{ padding: 24, color: 'var(--mute)' }}>sem dados</div>;
  // 10 cores distintas
  const PAL = ['#22d3ee', '#10b981', '#f59e0b', '#a78bfa', '#ef4444',
               '#3b82f6', '#fde68a', '#34d399', '#f472b6', '#94a3b8'];
  const W = 820, H = height, PL = 70, PR = 24, PT = 16, PB = 36;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const N = labels.length;
  // valor max global pra escala compartilhada
  let maxV = 0;
  series.forEach((s) => s.serie.forEach((v) => { if (v > maxV) maxV = v; }));
  if (maxV <= 0) maxV = 1;
  const X = (i) => PL + (i / Math.max(1, N - 1)) * innerW;
  const Y = (v) => PT + (1 - v / maxV) * innerH;

  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => maxV * (1 - i / yTicks));

  const [hovered, setHovered] = React.useState(null); // marca highlight

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {/* grid + y labels */}
        {yTickVals.map((v, i) => (
          <g key={`yt-${i}`}>
            <line x1={PL} y1={Y(v)} x2={W - PR} y2={Y(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={PL - 8} y={Y(v) + 3} textAnchor="end" fontSize="10" fill="var(--mute)" fontFamily="JetBrains Mono, monospace">{_fmtBRLk(v)}</text>
          </g>
        ))}
        {/* x labels */}
        {labels.map((lab, i) => (
          <text key={`xl-${i}`} x={X(i)} y={H - 12} textAnchor="middle" fontSize="10.5" fill="var(--mute)">{lab}</text>
        ))}
        {/* lines */}
        {series.map((s, idx) => {
          const path = s.serie.map((v, i) => `${i === 0 ? 'M' : 'L'} ${X(i)} ${Y(v)}`).join(' ');
          const dim = hovered != null && hovered !== idx;
          const hl = hovered === idx;
          return (
            <g key={s.marca}>
              <path d={path} stroke={PAL[idx % PAL.length]}
                    strokeWidth={hl ? 3 : 2}
                    opacity={dim ? 0.18 : 1}
                    fill="none" vectorEffect="non-scaling-stroke" />
              {/* pontos visiveis no hover */}
              {hl && s.serie.map((v, i) => (
                <circle key={`p-${i}`} cx={X(i)} cy={Y(v)} r="3.5" fill={PAL[idx % PAL.length]} />
              ))}
            </g>
          );
        })}
      </svg>
      {/* legenda */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10,
        fontSize: 11.5, color: 'var(--text-2)', paddingLeft: PL, paddingRight: PR,
      }}>
        {series.map((s, idx) => (
          <span
            key={s.marca}
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              cursor: 'pointer',
              opacity: hovered != null && hovered !== idx ? 0.5 : 1,
              fontWeight: hovered === idx ? 700 : 400,
            }}
          >
            <span style={{ width: 12, height: 3, background: PAL[idx % PAL.length], borderRadius: 1 }} />
            {s.marca}
          </span>
        ))}
      </div>
    </div>
  );
};

// ===== Bar chart top 20 marcas por crescimento % =====
const TendmarcasGrowthBars = ({ items, height = 460 }) => {
  if (!items || !items.length) return <div className="empty" style={{ padding: 24, color: 'var(--mute)' }}>sem dados</div>;
  const sorted = [...items].sort((a, b) => (b.growth_pct || 0) - (a.growth_pct || 0));
  const max = Math.max(...sorted.map((it) => Math.abs(it.growth_pct || 0)), 1);
  const W = 720;
  const ROW_H = Math.max(20, Math.floor((height - 20) / sorted.length));
  const PL = 130, PR = 90;
  const innerW = W - PL - PR;
  const ZERO_X = PL + innerW / 2;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      {/* eixo zero */}
      <line x1={ZERO_X} y1={8} x2={ZERO_X} y2={height - 8} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      {sorted.map((it, i) => {
        const g = it.growth_pct || 0;
        const barW = (Math.abs(g) / max) * (innerW / 2);
        const y = 8 + i * ROW_H;
        const positive = g >= 0;
        const x = positive ? ZERO_X : (ZERO_X - barW);
        const color = _tmGrowthColor(g);
        return (
          <g key={it.marca}>
            <text x={PL - 8} y={y + ROW_H * 0.62} textAnchor="end"
                  fontSize="11" fill="var(--text-2)" fontFamily="inherit">
              <title>{it.marca}</title>
              {it.marca.length > 18 ? it.marca.slice(0, 17) + '…' : it.marca}
            </text>
            <rect x={x} y={y + 3} width={Math.max(1, barW)} height={ROW_H - 6} rx="2"
                  fill={color} opacity="0.92">
              <title>{`${it.marca}: ${_tmFmtPctDelta(g)} (Δ ${_fmtBRLk(it.delta)})`}</title>
            </rect>
            <text
              x={positive ? x + barW + 6 : x - 6}
              y={y + ROW_H * 0.62}
              textAnchor={positive ? 'start' : 'end'}
              fontSize="10.5" fill={color}
              fontFamily="JetBrains Mono, monospace" fontWeight="600">
              {_tmFmtPctDelta(g)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ===== Tabela rica =====
const TendmarcasTable = ({ rows, totalRow, meta }) => {
  const [sortKey, setSortKey] = React.useState('ytd');
  const [sortDir, setSortDir] = React.useState('desc');
  const [query, setQuery] = React.useState('');

  const filtered = React.useMemo(() => {
    let r = rows;
    if (query.trim()) {
      const s = query.trim().toLowerCase();
      r = r.filter((x) => (x.marca || '').toLowerCase().includes(s));
    }
    return [...r].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      return sortDir === 'desc' ? (vb - va) : (va - vb);
    });
  }, [rows, sortKey, sortDir, query]);

  const Th = ({ k, label, align = 'right', sortable = true }) => (
    <th
      onClick={() => {
        if (!sortable) return;
        if (sortKey === k) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
        else { setSortKey(k); setSortDir('desc'); }
      }}
      style={{
        textAlign: align, padding: '8px 8px', color: sortKey === k ? 'var(--cyan)' : 'var(--mute)',
        fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
        cursor: sortable ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
        borderBottom: sortKey === k ? '2px solid var(--cyan)' : '1px solid rgba(255,255,255,0.08)',
        background: 'var(--surface)',
        position: 'sticky', top: 0, zIndex: 1,
      }}
    >
      {label}{sortable && sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 10px' }}>
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="buscar marca..."
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, padding: '6px 10px', color: 'var(--text)', fontSize: 12,
            width: 220, fontFamily: 'inherit',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--mute)', marginLeft: 'auto' }}>
          {filtered.length} de {rows.length} marcas
        </span>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 640, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <Th k="marca" label="Marca" align="left" sortable={false} />
              <Th k="ytd" label={`Vendas YTD (${meta.ano_ytd})`} />
              <Th k="pytd" label={`Vendas PYTD (${meta.ano_pytd})`} />
              <Th k="growth_pct" label="Cresc. %" />
              <Th k="delta" label="Delta R$" />
              <Th k="linear_slope" label="Tend. Linear" />
              <Th k="log_slope_pct_mensal" label="Tend. % Mês (log)" />
              <th style={{
                textAlign: 'center', padding: '8px 8px', color: 'var(--mute)',
                fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
                borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'var(--surface)',
                position: 'sticky', top: 0, zIndex: 1,
              }}>Sparkline 12m</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const g = r.growth_pct;
              return (
                <tr key={r.marca} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '7px 8px', color: 'var(--text)', fontWeight: 600 }}>{r.marca}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(r.ytd)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.pytd > 0 ? _fmtBRL(r.pytd) : '—'}</td>
                  <td style={{
                    padding: '7px 8px', textAlign: 'right',
                    color: _tmGrowthColor(g), background: _tmGrowthBg(g),
                    fontFamily: 'var(--font-mono)', fontWeight: 700,
                  }}>{_tmFmtPctDelta(g)}</td>
                  <td style={{
                    padding: '7px 8px', textAlign: 'right',
                    color: r.delta >= 0 ? '#a5d6a7' : '#ef5350',
                    fontFamily: 'var(--font-mono)',
                  }}>{(r.delta >= 0 ? '+' : '') + _fmtBRLk(r.delta).replace('R$ ', 'R$ ')}</td>
                  <td style={{
                    padding: '7px 8px', textAlign: 'right',
                    color: r.linear_slope >= 0 ? 'var(--text-2)' : '#ef5350',
                    fontFamily: 'var(--font-mono)',
                  }}>{(r.linear_slope >= 0 ? '+' : '') + (r.linear_slope || 0).toFixed(2).replace('.', ',')}</td>
                  <td style={{
                    padding: '7px 8px', textAlign: 'right',
                    color: _tmGrowthColor(r.log_slope_pct_mensal),
                    fontFamily: 'var(--font-mono)',
                  }}>{_tmFmtPctDelta(r.log_slope_pct_mensal, 2)}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                    <TendmarcasSpark
                      values={r.sparkline_12m || []}
                      color={g >= 0 ? '#10b981' : '#ef5350'}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totalRow && (
            <tfoot>
              <tr style={{
                borderTop: '2px solid rgba(34,211,238,0.4)',
                background: 'rgba(34,211,238,0.06)', fontWeight: 700,
              }}>
                <td style={{ padding: '8px', color: 'var(--cyan)' }}>{totalRow.marca}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(totalRow.ytd)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(totalRow.pytd)}</td>
                <td style={{
                  padding: '8px', textAlign: 'right',
                  color: _tmGrowthColor(totalRow.growth_pct),
                  fontFamily: 'var(--font-mono)',
                }}>{_tmFmtPctDelta(totalRow.growth_pct)}</td>
                <td style={{
                  padding: '8px', textAlign: 'right',
                  color: totalRow.delta >= 0 ? '#10b981' : '#ef5350',
                  fontFamily: 'var(--font-mono)',
                }}>{(totalRow.delta >= 0 ? '+' : '') + _fmtBRLk(totalRow.delta).replace('R$ ', 'R$ ')}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{(totalRow.linear_slope >= 0 ? '+' : '') + (totalRow.linear_slope || 0).toFixed(2).replace('.', ',')}</td>
                <td style={{
                  padding: '8px', textAlign: 'right',
                  color: _tmGrowthColor(totalRow.log_slope_pct_mensal),
                  fontFamily: 'var(--font-mono)',
                }}>{_tmFmtPctDelta(totalRow.log_slope_pct_mensal, 2)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

// ===== Page =====
const PageTendenciaMarcas = () => {
  const D = window.TENDMARCAS_DATA;
  if (!D) {
    return (
      <div className="page" style={{ padding: 32 }}>
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          tendmarcas-data.js não carregado. Rode:{' '}
          <code>python scripts/build_tendmarcas_data.py</code>
        </div>
      </div>
    );
  }
  const meta = D.meta;
  const rows = D.tabela_marcas || [];
  const totalRow = D.total_row;
  const top10 = D.serie_top10_ytd || [];
  const ytdLabels = meta.ytd_month_labels || [];

  // contagens visuais
  const n_pos = rows.filter((r) => (r.growth_pct || 0) > 10).length;
  const n_neg = rows.filter((r) => (r.growth_pct || 0) < -10).length;
  const n_stable = rows.length - n_pos - n_neg;

  return (
    <div className="page bi-dashboard-theme" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Tendências · Marcas</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          YTD {meta.ano_ytd} (jan-{meta.mes_ref_label}) vs PYTD {meta.ano_pytd} · top {meta.n_marcas_top} marcas
        </span>
      </div>

      <h1 style={{
        fontSize: '1.6rem', fontWeight: 900, lineHeight: 1.15, marginBottom: 6,
        background: 'linear-gradient(135deg, #4fc3f7, #81d4fa)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      }}>
        Tendências de Marcas · YTD vs PYTD
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 920, lineHeight: 1.6, marginBottom: 18 }}>
        Compara o acumulado do ano (até {meta.mes_ref_label}/{meta.ano_ytd}) contra o mesmo recorte do ano anterior,
        marca a marca. Inclui regressão linear (vendas/mês) e regressão log (% de crescimento mensal sustentado)
        sobre toda a série histórica de cada marca.
      </p>

      {/* KPIs */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <div className="card kpi-tile cyan">
          <div className="kpi-label">Vendas YTD {meta.ano_ytd}</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(totalRow.ytd).replace('R$ ', '')}</div>
          <div className="kpi-hint">jan..{meta.mes_ref_label} · top 30 marcas</div>
        </div>
        <div className="card kpi-tile violet">
          <div className="kpi-label">Vendas PYTD {meta.ano_pytd}</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(totalRow.pytd).replace('R$ ', '')}</div>
          <div className="kpi-hint">mesmo recorte do ano anterior</div>
        </div>
        <div className="card kpi-tile green">
          <div className="kpi-label">Crescimento %</div>
          <div className="kpi-value" style={{ color: _tmGrowthColor(totalRow.growth_pct) }}>
            {_tmFmtPctDelta(totalRow.growth_pct)}
          </div>
          <div className="kpi-hint">Δ R$ {_fmtBRLk(totalRow.delta).replace('R$ ', '')}</div>
        </div>
        <div className="card kpi-tile amber">
          <div className="kpi-label">Distribuição</div>
          <div className="kpi-value" style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: '#10b981' }}>{n_pos}</span>
            <span style={{ color: 'var(--mute)' }}> · </span>
            <span style={{ color: '#fdd835' }}>{n_stable}</span>
            <span style={{ color: 'var(--mute)' }}> · </span>
            <span style={{ color: '#ef5350' }}>{n_neg}</span>
          </div>
          <div className="kpi-hint">
            <span style={{ color: '#10b981' }}>&gt;+10%</span> · estável · <span style={{ color: '#ef5350' }}>&lt;-10%</span>
          </div>
        </div>
      </div>

      {/* Line chart top 10 */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '8px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        Evolução mensal · top 10 marcas (YTD {meta.ano_ytd})
      </h2>
      <div className="card" style={{ padding: 16, marginBottom: 22 }}>
        <TendmarcasMultiLine series={top10} labels={ytdLabels} height={300} />
      </div>

      {/* Bar growth + Tabela rica side-by-side em telas largas */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '8px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        Crescimento % · top 20 marcas (YTD vs PYTD)
      </h2>
      <div className="card" style={{ padding: 16, marginBottom: 22 }}>
        <TendmarcasGrowthBars items={rows.slice(0, 20)} height={Math.max(420, 20 * 26)} />
      </div>

      {/* Tabela completa */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '8px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        Tabela completa · {rows.length} marcas
      </h2>
      <div className="card" style={{ padding: 12, marginBottom: 22 }}>
        <TendmarcasTable rows={rows} totalRow={totalRow} meta={meta} />
      </div>

      <div style={{ textAlign: 'center', color: 'var(--mute)', fontSize: 11, padding: '14px 0' }}>
        Astro BI · Tendências de Marcas · espelho da tela PBI tela 13 · fonte: vendas_dash.parquet
      </div>
    </div>
  );
};

// Registra no escopo global do bundle
Object.assign(window, { PageTendenciaMarcas });
