/**
 * pages-campanhas.jsx — Astro · Campanhas × Vendas (V2 PROFUNDA)
 *
 * Tela completa de análise de Ads × novos clientes. Storytelling + estatística.
 * Dados: window.CAMPANHAS_DATA (scripts/build_campanhas_data.py).
 *
 * Reutiliza AstroBarV, _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct de pages-astro.jsx
 * (concatenados pelo build-jsx.cjs antes deste arquivo).
 *
 * Registrado em window pra PAGE_COMPS pegar.
 */

// ===== Helpers locais (formatação ROAS + cores + meses) =====
const _cmpFmtRoas = (v) => {
  if (v == null || !isFinite(v) || v === 0) return '—';
  return `${v.toFixed(2).replace('.', ',')}x`;
};
const _cmpRoasColor = (v) => {
  if (v == null || !isFinite(v) || v === 0) return 'var(--mute)';
  if (v >= 3) return '#66bb6a';
  if (v >= 2) return '#a5d6a7';
  if (v >= 1) return '#fdd835';
  return '#ef5350';
};
const _cmpRoasBg = (v) => {
  if (v == null || !isFinite(v) || v === 0) return 'transparent';
  if (v >= 3) return 'rgba(102,187,106,0.18)';
  if (v >= 1) return 'rgba(253,216,53,0.14)';
  return 'rgba(239,83,80,0.18)';
};
const _cmpMonthLabel = (am) => {
  if (!am || typeof am !== 'string' || am.length < 7) return am || '';
  const [y, m] = am.split('-');
  const NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const idx = parseInt(m, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx > 11) return am;
  return `${NAMES[idx]}/${y.slice(2)}`;
};
const _cmpFmtP = (p) => {
  if (p == null || !isFinite(p)) return '—';
  if (p < 0.001) return p.toExponential(2);
  return p.toFixed(4);
};

// ===== Insight block (border-left cyan) =====
const InsightBlock = ({ children, color = 'var(--cyan)', icon = '◆', title }) => (
  <div style={{
    borderLeft: `3px solid ${color}`,
    background: 'rgba(255,255,255,0.03)',
    padding: '12px 14px',
    borderRadius: 4,
    margin: '12px 0',
    fontSize: 12.5,
    color: 'var(--text-2)',
    lineHeight: 1.7,
  }}>
    {title && (
      <div style={{ color, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {icon} {title}
      </div>
    )}
    {children}
  </div>
);

// ===== Scatter SVG (regressão diária ou eficiência UF) =====
const CampScatter = ({ points, xLabel, yLabel, color = '#22d3ee', height = 380, regLine = null,
                      labelKey = null, xFmt = (v) => v, yFmt = (v) => v, sizeKey = null, highlights = [] }) => {
  if (!points || !points.length) return <div className="empty" style={{ padding: 24, color: 'var(--mute)' }}>sem dados</div>;
  const W = 760, H = height, PL = 60, PR = 30, PT = 24, PB = 50;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xMin = Math.min(0, ...xs), xMax = Math.max(...xs) * 1.05 || 1;
  const yMin = Math.min(0, ...ys), yMax = Math.max(...ys) * 1.10 || 1;
  const X = (v) => PL + ((v - xMin) / (xMax - xMin)) * innerW;
  const Y = (v) => PT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  // Bolha: tamanho proporcional a sizeKey (escala log pra evitar disparada)
  const sizes = sizeKey ? points.map(p => p[sizeKey] || 0) : [];
  const sMax = sizes.length ? Math.max(...sizes, 1) : 1;
  const rOf = (s) => {
    if (!sizeKey) return 4;
    if (s <= 0) return 3;
    return 4 + Math.sqrt(s / sMax) * 18;
  };

  // Ticks
  const xTicks = 5, yTicks = 5;
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => xMin + (xMax - xMin) * i / xTicks);
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (yMax - yMin) * i / yTicks);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      {/* grid horizontal */}
      {yTickVals.map((v, i) => (
        <g key={`yt-${i}`}>
          <line x1={PL} y1={Y(v)} x2={W - PR} y2={Y(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <text x={PL - 8} y={Y(v) + 3} textAnchor="end" fontSize="10" fill="var(--mute)" fontFamily="JetBrains Mono, monospace">{yFmt(v)}</text>
        </g>
      ))}
      {/* grid vertical */}
      {xTickVals.map((v, i) => (
        <g key={`xt-${i}`}>
          <line x1={X(v)} y1={PT} x2={X(v)} y2={H - PB} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          <text x={X(v)} y={H - PB + 14} textAnchor="middle" fontSize="10" fill="var(--mute)" fontFamily="JetBrains Mono, monospace">{xFmt(v)}</text>
        </g>
      ))}
      {/* axis labels */}
      <text x={(PL + W - PR) / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-2)">{xLabel}</text>
      <text x={14} y={(PT + H - PB) / 2} textAnchor="middle" fontSize="11" fill="var(--text-2)"
            transform={`rotate(-90, 14, ${(PT + H - PB) / 2})`}>{yLabel}</text>

      {/* regression line */}
      {regLine && isFinite(regLine.slope) && (
        <line
          x1={X(xMin)} y1={Y(regLine.intercept + regLine.slope * xMin)}
          x2={X(xMax)} y2={Y(regLine.intercept + regLine.slope * xMax)}
          stroke="#66bb6a" strokeWidth="2.2" strokeDasharray="6,3"
        />
      )}

      {/* break-even line (y=x quando eixos compativeis) ... skip por padrao */}

      {/* points */}
      {points.map((p, i) => {
        const hl = labelKey && highlights.includes(p[labelKey]);
        return (
          <g key={i}>
            <circle
              cx={X(p.x)} cy={Y(p.y)}
              r={rOf(p[sizeKey] || 0)}
              fill={hl ? '#f59e0b' : color}
              opacity={hl ? 0.95 : 0.62}
              stroke={hl ? '#fde68a' : 'rgba(0,0,0,0.3)'}
              strokeWidth={hl ? 1.5 : 0.5}
            />
            {labelKey && (rOf(p[sizeKey] || 0) >= 6 || hl) && (
              <text x={X(p.x)} y={Y(p.y) - rOf(p[sizeKey] || 0) - 3} textAnchor="middle"
                    fontSize={hl ? 11 : 9} fill={hl ? '#fde68a' : 'var(--text-2)'} fontWeight={hl ? 700 : 500}>
                {p[labelKey]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ===== Tabela ROAS ordenavel + busca + cor cell =====
const RoasTable = ({ rows, labelCol, labelKey, defaultSort = 'gasto', extraCols = [] }) => {
  const [sortKey, setSortKey] = React.useState(defaultSort);
  const [sortDir, setSortDir] = React.useState('desc');
  const [search, setSearch] = React.useState('');

  if (!rows || !rows.length) return <div className="empty" style={{ padding: 24, color: 'var(--mute)' }}>sem dados</div>;

  const filtered = React.useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      r = r.filter(x => (x[labelKey] || '').toString().toLowerCase().includes(s));
    }
    return [...r].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'string') {
        return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb);
      }
      return sortDir === 'desc' ? (vb - va) : (va - vb);
    });
  }, [rows, sortKey, sortDir, search, labelKey]);

  const Th = ({ k, label, align = 'right' }) => (
    <th
      onClick={() => {
        if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortKey(k); setSortDir('desc'); }
      }}
      style={{
        textAlign: align, padding: '8px 6px', color: sortKey === k ? 'var(--cyan)' : 'var(--mute)',
        fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        borderBottom: sortKey === k ? '2px solid var(--cyan)' : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {label}{sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 10px' }}>
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={`buscar ${labelCol.toLowerCase()}...`}
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, padding: '6px 10px', color: 'var(--text)', fontSize: 12,
            width: 220, fontFamily: 'inherit',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--mute)', marginLeft: 'auto' }}>
          {filtered.length} de {rows.length} {filtered.length === 1 ? 'linha' : 'linhas'}
        </span>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <tr>
              <Th k={labelKey} label={labelCol} align="left" />
              <Th k="gasto" label="Gasto Ads" />
              <Th k="novos" label="Novos" />
              <Th k="receita_novos" label="Receita Novos" />
              <Th k="cac" label="CAC" />
              <Th k="roas" label="ROAS" />
              {extraCols.includes('pop') && <Th k="pop" label="Pop." />}
              {extraCols.includes('gasto_per_capita') && <Th k="gasto_per_capita" label="R$ / 1k hab" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 6px', color: 'var(--text)', fontWeight: 600 }}>{r[labelKey]}</td>
                <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.gasto > 0 ? _fmtBRL(r.gasto) : '—'}</td>
                <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.novos > 0 ? _fmtNum(r.novos) : '—'}</td>
                <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.receita_novos > 0 ? _fmtBRL(r.receita_novos) : '—'}</td>
                <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.cac > 0 ? _fmtBRL(r.cac) : '—'}</td>
                <td style={{
                  padding: '6px 6px', textAlign: 'right',
                  color: _cmpRoasColor(r.roas),
                  background: _cmpRoasBg(r.roas),
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                }}>{_cmpFmtRoas(r.roas)}</td>
                {extraCols.includes('pop') && <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.pop > 0 ? _fmtNum(r.pop) : '—'}</td>}
                {extraCols.includes('gasto_per_capita') && <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.gasto_per_capita > 0 ? r.gasto_per_capita.toFixed(2).replace('.', ',') : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ===== ANOVA table =====
const AnovaTable = ({ rows }) => {
  if (!rows || !rows.length) return <div className="empty" style={{ padding: 16, color: 'var(--mute)' }}>sem dados suficientes para ANOVA</div>;
  const Th = ({ children, align = 'right' }) => (
    <th style={{ textAlign: align, padding: '7px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{children}</th>
  );
  return (
    <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
          <tr>
            <Th align="left">UF</Th>
            <Th>N obs</Th>
            <Th>Baixo</Th>
            <Th>Médio</Th>
            <Th>Alto</Th>
            <Th>F</Th>
            <Th>p-value</Th>
            <Th>Sig.</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '6px 6px', color: 'var(--text)', fontWeight: 600 }}>{r.uf}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.n_obs}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.media_baixo.toFixed(2).replace('.', ',')}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.media_medio.toFixed(2).replace('.', ',')}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.media_alto.toFixed(2).replace('.', ',')}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.F.toFixed(2).replace('.', ',')}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: r.significativo ? '#66bb6a' : 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{_cmpFmtP(r.p_value)}</td>
              <td style={{
                padding: '6px 6px', textAlign: 'center',
                color: r.significativo ? '#66bb6a' : '#ef5350', fontWeight: 700,
              }}>{r.significativo ? 'Sim' : 'Não'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ===== Linha dupla PF/PJ mensal =====
const PfPjLines = ({ points, height = 240 }) => {
  if (!points || !points.length) return <div className="empty" style={{ padding: 24, color: 'var(--mute)' }}>sem dados</div>;
  const W = 760, H = height, PL = 48, PR = 30, PT = 20, PB = 30;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const pf = points.map(p => p.pct_pf * 100);
  const pj = points.map(p => p.pct_pj * 100);
  const X = (i) => PL + (i / Math.max(1, points.length - 1)) * innerW;
  const Y = (v) => PT + (1 - v / 100) * innerH;
  const pathPF = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(i)} ${Y(pf[i])}`).join(' ');
  const pathPJ = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(i)} ${Y(pj[i])}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {[0, 25, 50, 75, 100].map(v => (
          <g key={`g-${v}`}>
            <line x1={PL} y1={Y(v)} x2={W - PR} y2={Y(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={PL - 8} y={Y(v) + 3} textAnchor="end" fontSize="10" fill="var(--mute)" fontFamily="JetBrains Mono, monospace">{v}%</text>
          </g>
        ))}
        <path d={pathPF} stroke="#22d3ee" strokeWidth="2.5" fill="none" />
        <path d={pathPJ} stroke="#a78bfa" strokeWidth="2.5" fill="none" strokeDasharray="6,3" />
        {points.map((p, i) => (
          <g key={`d-${i}`}>
            <circle cx={X(i)} cy={Y(pf[i])} r="3" fill="#22d3ee" />
            <circle cx={X(i)} cy={Y(pj[i])} r="3" fill="#a78bfa" />
          </g>
        ))}
        {points.map((p, i) => {
          const skip = Math.ceil(points.length / 9);
          if (i % skip !== 0 && i !== points.length - 1) return null;
          return (
            <text key={`xl-${i}`} x={X(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--mute)">{_cmpMonthLabel(p.am)}</text>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', fontSize: 12, marginTop: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
          <span style={{ width: 14, height: 3, background: '#22d3ee' }} /> Pessoa Física
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
          <span style={{ width: 14, height: 3, background: '#a78bfa', borderTop: '1px dashed #a78bfa' }} /> Pessoa Jurídica
        </span>
      </div>
    </div>
  );
};

// ===== Tabela regressão (coeficientes) =====
const RegressionTable = ({ reg, title }) => {
  if (!reg || !reg.n) return null;
  // IC 95% aproximado via slope ± 1.96 * stderr
  const slope = reg.slope || 0;
  const se = reg.stderr || 0;
  const ic_low = slope - 1.96 * se, ic_high = slope + 1.96 * se;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '7px 8px', color: 'var(--mute)' }}>N (observações)</td>
          <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{reg.n}</td>
        </tr>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '7px 8px', color: 'var(--mute)' }}>Slope (β₁)</td>
          <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{slope.toFixed(6).replace('.', ',')}</td>
        </tr>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '7px 8px', color: 'var(--mute)' }}>Intercepto (β₀)</td>
          <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{reg.intercept.toFixed(3).replace('.', ',')}</td>
        </tr>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '7px 8px', color: 'var(--mute)' }}>Std. Error</td>
          <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{se.toFixed(6).replace('.', ',')}</td>
        </tr>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '7px 8px', color: 'var(--mute)' }}>IC 95% slope</td>
          <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>[{ic_low.toFixed(5).replace('.', ',')}, {ic_high.toFixed(5).replace('.', ',')}]</td>
        </tr>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '7px 8px', color: 'var(--mute)' }}>R²</td>
          <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{reg.r_squared.toFixed(4).replace('.', ',')} ({(reg.r_squared * 100).toFixed(1)}%)</td>
        </tr>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '7px 8px', color: 'var(--mute)' }}>p-value</td>
          <td style={{ padding: '7px 8px', textAlign: 'right', color: reg.significativo ? '#66bb6a' : '#ef5350', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{_cmpFmtP(reg.p_value)}</td>
        </tr>
        <tr>
          <td style={{ padding: '7px 8px', color: 'var(--mute)' }}>Novos por R$ 1.000</td>
          <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{(reg.novos_por_1k || 0).toFixed(2).replace('.', ',')}</td>
        </tr>
      </tbody>
    </table>
  );
};

// ===== PageCampanhasAds (V2) =====
const PageCampanhasAds = () => {
  const D = window.CAMPANHAS_DATA;
  const [periodo, setPeriodo] = React.useState('12m'); // 3m / 6m / 12m
  const [filtroUF, setFiltroUF] = React.useState('Todos');
  const [filtroMarca, setFiltroMarca] = React.useState('Todas');
  const [mesAtivo, setMesAtivo] = React.useState(null);

  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          campanhas-data.js não carregado. Rode: <code>python scripts/build_campanhas_data.py</code>
        </div>
      </div>
    );
  }
  const k = D.kpis;
  const reg = D.regressao_diaria || D.regressao_mensal || {};
  const anovaG = D.anova_global || {};
  const pico = D.pico_anomalo || {};
  const corrGN = D.correlacao_gasto_x_novos || {};

  // gasto/receita por periodo selecionado
  const gastoPeriodo = periodo === '3m' ? k.gasto_total_3m : (periodo === '6m' ? k.gasto_total_6m : k.gasto_total_12m);

  // serie 18m -> recorte conforme periodo
  const series18 = D.gasto_vs_novos_pareados || D.gasto_vs_novos || [];
  const seriesPeriodo = React.useMemo(() => {
    if (periodo === '3m') return series18.slice(-3);
    if (periodo === '6m') return series18.slice(-6);
    return series18.slice(-12);
  }, [series18, periodo]);

  // filtros UF/Marca
  const ufOptions = React.useMemo(() => ['Todos', ...(D.roas_por_estado || []).map(r => r.uf)], [D]);
  const marcaOptions = React.useMemo(() => ['Todas', ...(D.roas_por_marca || []).map(r => r.marca)], [D]);

  const roasUFFiltrado = React.useMemo(() => {
    if (filtroUF === 'Todos') return D.roas_por_estado || [];
    return (D.roas_por_estado || []).filter(r => r.uf === filtroUF);
  }, [D, filtroUF]);

  const roasMarcaFiltrado = React.useMemo(() => {
    if (filtroMarca === 'Todas') return D.roas_por_marca || [];
    return (D.roas_por_marca || []).filter(r => r.marca === filtroMarca);
  }, [D, filtroMarca]);

  // mes ativo
  const mesAtivoData = mesAtivo != null ? seriesPeriodo[mesAtivo] : null;

  return (
    <div className="page bi-dashboard-theme" style={{ padding: '20px 28px 40px' }}>
      {/* === Breadcrumb === */}
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Campanhas × Vendas</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          {k.ref_start} → {k.ref_end} · {k.meses_periodo}m
        </span>
      </div>

      {/* === Storytelling de abertura === */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{
          fontSize: '1.8rem', fontWeight: 900, lineHeight: 1.1, marginBottom: 6,
          background: 'linear-gradient(135deg, #4fc3f7, #81d4fa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          O aumento de Ads gera novos clientes?
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 920, lineHeight: 1.6 }}>
          Análise de <b>primeira compra</b>: o teste é se cada real investido em Google Ads converte em
          aquisição. O <b>foco é o cliente novo</b>, não a receita total — recompra é outro motor.
          A <b>hipótese</b> testada por regressão linear e ANOVA é simples:
          <i> existe relação estatística entre gasto diário em Ads e número de novos clientes adquiridos?</i>
        </p>
      </div>

      {/* === Filtros === */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        padding: '10px 14px', marginBottom: 18, background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
      }}>
        <span style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1 }}>Filtros:</span>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', padding: 3, borderRadius: 6 }}>
          {['3m', '6m', '12m'].map(p => (
            <button key={p}
              onClick={() => setPeriodo(p)}
              style={{
                padding: '4px 12px', border: 'none', borderRadius: 4, cursor: 'pointer',
                background: periodo === p ? 'var(--cyan)' : 'transparent',
                color: periodo === p ? '#0a0e14' : 'var(--text-2)',
                fontWeight: periodo === p ? 700 : 500, fontSize: 11.5,
              }}
            >{p.toUpperCase()}</button>
          ))}
        </div>
        <select value={filtroUF} onChange={(e) => setFiltroUF(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 8px' }}>
          {ufOptions.map(u => <option key={u} value={u}>{u === 'Todos' ? 'Todos os Estados' : u}</option>)}
        </select>
        <select value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 8px' }}>
          {marcaOptions.map(m => <option key={m} value={m}>{m === 'Todas' ? 'Todas as Marcas' : m}</option>)}
        </select>
      </div>

      {/* === KPIs (5 tiles) === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 22 }}>
        <div className="card kpi-tile cyan">
          <div className="kpi-label">Gasto Ads · {periodo}</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(gastoPeriodo).replace('R$ ','')}</div>
          <div className="kpi-hint">média R$ {_fmtBRLk(k.gasto_medio_mensal).replace('R$ ','')}/mês</div>
        </div>
        <div className="card kpi-tile green">
          <div className="kpi-label">Receita Novos · 12m</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.receita_novos_12m).replace('R$ ','')}</div>
          <div className="kpi-hint">{_fmtNum(k.novos_clientes_12m)} clientes novos</div>
        </div>
        <div className="card kpi-tile amber">
          <div className="kpi-label">ROAS Global</div>
          <div className="kpi-value" style={{ color: _cmpRoasColor(k.roas_global) }}>{_cmpFmtRoas(k.roas_global)}</div>
          <div className="kpi-hint">receita 1ª compra ÷ gasto</div>
        </div>
        <div className="card kpi-tile red">
          <div className="kpi-label">CAC</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.cac_global).replace('R$ ','')}</div>
          <div className="kpi-hint">custo por cliente novo</div>
        </div>
        <div className="card kpi-tile violet">
          <div className="kpi-label">ROAS LTV</div>
          <div className="kpi-value" style={{ color: _cmpRoasColor(k.roas_ltv) }}>{_cmpFmtRoas(k.roas_ltv)}</div>
          <div className="kpi-hint">LTV R$ {_fmtBRLk(k.ltv_medio).replace('R$ ','')} ÷ CAC</div>
        </div>
      </div>

      {/* === SECTION 1: Série mensal gasto Ads (clicável) === */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '8px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        1 · Gasto Ads · evolução mensal (últimos 18 meses)
      </h2>
      <div className="card" style={{ marginBottom: 8 }}>
        <AstroBarV
          values={(D.gasto_mensal_18m || []).map(x => x.valor)}
          labels={(D.gasto_mensal_18m || []).map(x => _cmpMonthLabel(x.am))}
          color="cyan"
          height={220}
          fmt={_fmtBRLk}
          onBarClick={(idx) => setMesAtivo(idx === mesAtivo ? null : idx)}
          activeIdx={mesAtivo}
        />
        {mesAtivoData && (
          <div style={{
            marginTop: 8, padding: 12, background: 'rgba(34,211,238,0.06)',
            border: '1px solid rgba(34,211,238,0.18)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)',
          }}>
            <b style={{ color: 'var(--cyan)' }}>{_cmpMonthLabel(mesAtivoData.am)}:</b>{' '}
            Gasto <b>{_fmtBRL(mesAtivoData.gasto)}</b> · Novos clientes <b>{_fmtNum(mesAtivoData.novos_clientes)}</b> ·
            Receita novos <b>{_fmtBRL(mesAtivoData.receita_novos)}</b> ·
            Conversão por R$ 1k: <b>{mesAtivoData.conversao_por_1k.toFixed(2)}</b> novos ·
            Ticket 1ª compra: <b>{_fmtBRL(mesAtivoData.ticket_novos)}</b>
          </div>
        )}
      </div>
      <InsightBlock color="var(--cyan)" title="leitura" icon="◆">
        Clique numa barra pra ver os detalhes do mês. A correlação <b>mensal Pearson</b> entre gasto e novos clientes é
        <b style={{ color: corrGN.pearson_p < 0.05 ? '#66bb6a' : '#fdd835' }}> r = {(corrGN.pearson_r || 0).toFixed(3)}</b>
        {' '}(p = {_cmpFmtP(corrGN.pearson_p)}, n = {corrGN.n}).
        Já a correlação <b>gasto × receita de novos</b>: r = {(D.correlacao_gasto_x_receita?.pearson_r || 0).toFixed(3)} (p = {_cmpFmtP(D.correlacao_gasto_x_receita?.pearson_p)}).
      </InsightBlock>

      {/* === SECTION 2: Regressão diária (scatter + tabela coef + ANOVA) === */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        2 · Regressão Linear · Gasto Diário → Novos Clientes
      </h2>
      <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 12 }}>
        Cada ponto = um dia. <b>n = {reg.n}</b> observações diárias com gasto + venda no mesmo dia.
        Reta verde tracejada = regressão linear OLS.
      </p>

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <CampScatter
            points={D.scatter_diario || []}
            xLabel="Gasto Diário Ads (R$)"
            yLabel="Novos Clientes / dia"
            color="#22d3ee"
            height={400}
            regLine={reg}
            xFmt={(v) => v >= 1000 ? `R$ ${(v/1000).toFixed(1)}k` : `R$ ${v.toFixed(0)}`}
            yFmt={(v) => v.toFixed(0)}
          />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Coeficientes</div>
          <RegressionTable reg={reg} title="diaria" />
          <div style={{
            marginTop: 12, padding: 10, borderRadius: 6,
            background: reg.significativo ? 'rgba(102,187,106,0.1)' : 'rgba(239,83,80,0.1)',
            border: `1px solid ${reg.significativo ? 'rgba(102,187,106,0.3)' : 'rgba(239,83,80,0.3)'}`,
            color: reg.significativo ? '#66bb6a' : '#ef5350', fontSize: 12, fontWeight: 600,
          }}>
            {reg.significativo ? '✓ SIGNIFICATIVO (p < 0.05)' : '✗ NÃO significativo (p ≥ 0.05)'}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.6 }}>
            <b>Pearson r</b> = {(reg.pearson_r || 0).toFixed(3)} (p = {_cmpFmtP(reg.pearson_p)})<br/>
            <b>Spearman ρ</b> = {(reg.spearman_r || 0).toFixed(3)} (p = {_cmpFmtP(reg.spearman_p)})
          </p>
        </div>
      </div>
      <InsightBlock color={reg.significativo ? '#66bb6a' : '#ef5350'} title="interpretação" icon="∑">
        {reg.interpretacao} <br/>
        {reg.r_squared > 0.4 && (
          <span>R² acima de 0.4 indica que <b>{(reg.r_squared * 100).toFixed(0)}% da variação diária de novos clientes é explicada pelo gasto</b> — sinal forte. Os outros {(100 - reg.r_squared * 100).toFixed(0)}% vêm de fatores não modelados (sazonalidade, política comercial, concorrência, qualidade dos criativos).</span>
        )}
      </InsightBlock>

      {/* === SECTION 3: ANOVA por estado === */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        3 · ANOVA · Faixas de Gasto vs Aquisição
      </h2>
      <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 12 }}>
        Divide os dias em três faixas (Baixo / Médio / Alto, por tercis de gasto) e testa via ANOVA se a média de
        novos clientes diferente significativamente. F alto + p &lt; 0.05 = aumentar gasto, de fato, aumenta aquisição.
      </p>

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>ANOVA Global (todas UFs, 18m)</div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <div style={{ textAlign: 'center', flex: 1, padding: 10, background: 'rgba(239,83,80,0.08)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase' }}>Baixo</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#ef5350', fontFamily: 'var(--font-mono)' }}>{(anovaG.media_baixo || 0).toFixed(2)}</div>
              <div style={{ fontSize: 10, color: 'var(--mute)' }}>novos/dia</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1, padding: 10, background: 'rgba(253,216,53,0.08)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase' }}>Médio</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fdd835', fontFamily: 'var(--font-mono)' }}>{(anovaG.media_medio || 0).toFixed(2)}</div>
              <div style={{ fontSize: 10, color: 'var(--mute)' }}>novos/dia</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1, padding: 10, background: 'rgba(102,187,106,0.08)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase' }}>Alto</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#66bb6a', fontFamily: 'var(--font-mono)' }}>{(anovaG.media_alto || 0).toFixed(2)}</div>
              <div style={{ fontSize: 10, color: 'var(--mute)' }}>novos/dia</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
            <b>F = {(anovaG.F || 0).toFixed(2)}</b> · <b>p = {_cmpFmtP(anovaG.p_value)}</b> · <b>n = {anovaG.n || 0}</b>
            <div style={{
              marginTop: 8, padding: 8, borderRadius: 6,
              background: anovaG.significativo ? 'rgba(102,187,106,0.1)' : 'rgba(239,83,80,0.1)',
              color: anovaG.significativo ? '#66bb6a' : '#ef5350', fontWeight: 600,
            }}>
              {anovaG.significativo ? '✓ Diferença SIGNIFICATIVA' : '✗ Sem diferença significativa'}
            </div>
            <p style={{ marginTop: 8, color: 'var(--text-2)' }}>{anovaG.interpretacao}</p>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>ANOVA por Estado (top 15 UFs)</div>
          <AnovaTable rows={D.anova_por_estado || []} />
        </div>
      </div>

      {/* === SECTION 4: ROAS por Estado (27 UFs) === */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        4 · ROAS por Estado · todos os 27 UFs (12 meses)
      </h2>
      <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 12 }}>
        Clique no header para ordenar. <span style={{ color: '#66bb6a' }}>Verde &gt; 3x</span>,{' '}
        <span style={{ color: '#fdd835' }}>amarelo 1–3x</span>,{' '}
        <span style={{ color: '#ef5350' }}>vermelho &lt; 1x</span>. Inclui R$/1k habitantes para benchmark de saturação.
      </p>
      <div className="card" style={{ padding: 12, marginBottom: 8 }}>
        <RoasTable
          rows={roasUFFiltrado}
          labelCol="UF"
          labelKey="uf"
          defaultSort="gasto"
          extraCols={['pop', 'gasto_per_capita']}
        />
      </div>

      {/* === SECTION 5: Scatter eficiência UF === */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        5 · Scatter Eficiência por UF · gasto per capita × ROAS
      </h2>
      <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 12 }}>
        Eixo X: gasto em Ads <b>por cada mil habitantes</b> (medida de pressão publicitária).
        Eixo Y: ROAS. <b>Tamanho da bolha</b>: número de novos clientes. UFs destacadas em laranja são outliers de interesse.
      </p>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <CampScatter
          points={(D.scatter_eficiencia_uf || []).filter(p => p.x > 0 || p.y > 0)}
          xLabel="Gasto Ads por 1.000 habitantes (R$)"
          yLabel="ROAS (receita ÷ gasto)"
          color="#a78bfa"
          height={420}
          labelKey="uf"
          sizeKey="size"
          xFmt={(v) => v.toFixed(1)}
          yFmt={(v) => `${v.toFixed(1)}x`}
          highlights={['BA', 'PA', 'RJ', 'SP', 'MG']}
        />
      </div>
      <InsightBlock color="#a78bfa" title="outliers" icon="◆">
        UFs com <b>alto ROAS + alto gasto per capita</b> = mercados aquecidos onde o investimento ainda paga.
        UFs com <b>alto gasto per capita + ROAS baixo</b> = saturação ou targeting ruim.
        UFs com <b>baixo gasto per capita + alto ROAS</b> = potencial inexplorado (escala o gasto).
      </InsightBlock>

      {/* === SECTION 6: Análise PICO Jan/26 (ou outro mês detectado) === */}
      {pico.detectado && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 12px', color: 'var(--text)',
                       paddingBottom: 6, borderBottom: '2px solid rgba(245,158,11,0.4)' }}>
            6 · Anomalia · pico em {_cmpMonthLabel(pico.am)}
          </h2>
          <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: '3px solid #f59e0b' }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 14 }}>
              O mês de <b style={{ color: '#fde68a' }}>{_cmpMonthLabel(pico.am)}</b> registrou gasto de{' '}
              <b>{_fmtBRL(pico.gasto)}</b>, o que é <b style={{ color: '#f59e0b' }}>+{pico.delta_pct_vs_media.toFixed(0)}%</b>{' '}
              acima da média dos outros meses do período (R$ {_fmtBRLk(pico.media_outros_meses).replace('R$ ','')}).
              Nesse mês foram adquiridos <b>{_fmtNum(pico.novos)} novos clientes</b> com receita de 1ª compra de
              <b> {_fmtBRL(pico.receita_novos)}</b>.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <div style={{ padding: 10, background: 'rgba(245,158,11,0.08)', borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase' }}>ROAS pico</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: _cmpRoasColor(pico.roas), fontFamily: 'var(--font-mono)' }}>{_cmpFmtRoas(pico.roas)}</div>
              </div>
              <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase' }}>ROAS outros meses</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: _cmpRoasColor(pico.roas_outros_meses), fontFamily: 'var(--font-mono)' }}>{_cmpFmtRoas(pico.roas_outros_meses)}</div>
              </div>
              <div style={{ padding: 10, background: 'rgba(245,158,11,0.08)', borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase' }}>CAC pico</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(pico.cac)}</div>
              </div>
              <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase' }}>CAC outros</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(pico.cac_outros_meses)}</div>
              </div>
            </div>
            <InsightBlock color="#f59e0b" title="hipótese" icon="⚠">
              ROAS no pico foi <b>{pico.deterioracao_roas < 0 ? `${pico.deterioracao_roas.toFixed(0)}%` : `+${pico.deterioracao_roas.toFixed(0)}%`}</b> vs média dos demais meses.
              {pico.deterioracao_roas < -10 && (
                <span> <b>Deterioração relevante</b> sugere saturação do canal ou aquisição de perfis de menor LTV.
                Verifique se houve trimming de criativos, expansão para públicos novos, ou push para PF com ticket menor.</span>
              )}
              {pico.deterioracao_roas >= -10 && pico.deterioracao_roas < 10 && (
                <span> ROAS manteve-se estável apesar do aumento — sinal de que o canal ainda comporta escala.</span>
              )}
              {pico.deterioracao_roas >= 10 && (
                <span> ROAS <b>melhorou</b> com o aumento — momento atípico (campanha sazonal, lançamento, ou criativo de alta conversão).</span>
              )}
            </InsightBlock>
          </div>
        </>
      )}

      {/* === SECTION 7: PF vs PJ trends (18m) === */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        7 · Mix PF vs PJ · evolução mensal (18m)
      </h2>
      <div className="card" style={{ padding: 16, marginBottom: 8 }}>
        <PfPjLines points={D.tendencia_pf_pj_18m || []} height={260} />
      </div>
      <InsightBlock color="#22d3ee" title="leitura PF/PJ" icon="◆">
        Atualmente: <b>{(k.pct_pf_90d * 100).toFixed(0)}% PF</b> e <b>{(k.pct_pj_90d * 100).toFixed(0)}% PJ</b> nos
        últimos 90 dias. Aumento do share PF tende a <b>baixar o ticket médio</b> mas <b>aumenta o volume</b>; aumento
        do share PJ aponta para perfis de maior LTV mas com ciclo de compra mais longo. Cruze com a tabela ROAS por marca
        para ver quais marcas atraem mais PF.
      </InsightBlock>

      {/* === SECTION 8: ROAS por Marca + Scatter Marca x ROAS === */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        8 · ROAS por Marca · top 30
      </h2>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 12 }}>
          <RoasTable
            rows={roasMarcaFiltrado}
            labelCol="Marca"
            labelKey="marca"
            defaultSort="gasto"
          />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Dispersão Marca × ROAS</div>
          <CampScatter
            points={D.dispersao_marca_x_roas || []}
            xLabel="Gasto Ads (R$)"
            yLabel="ROAS"
            color="#10b981"
            height={340}
            labelKey="marca"
            sizeKey="size"
            xFmt={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}
            yFmt={(v) => `${v.toFixed(1)}x`}
          />
        </div>
      </div>

      {/* === SECTION 9: Canais (Pmax/Search) === */}
      {(D.clientes_por_canal && D.clientes_por_canal.length > 0) && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 12px', color: 'var(--text)',
                       paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
            9 · Breakdown por Canal · Performance Max / Search / etc
          </h2>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Canal</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gasto 12m</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Share</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Impressões</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cliques</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>CTR</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>CPC médio</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Conversões</th>
                </tr>
              </thead>
              <tbody>
                {D.clientes_por_canal.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '7px 6px', color: 'var(--text)', fontWeight: 600 }}>{c.canal}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(c.gasto)}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{_fmtPct(c.share)}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_fmtNum(c.impressions)}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_fmtNum(c.clicks)}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_fmtPct(c.ctr, 2)}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{c.cpc > 0 ? _fmtBRL(c.cpc) : '—'}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_fmtNum(c.conversions, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* === SECTION 10: Conclusões & Recomendações === */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '24px 0 12px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        10 · Conclusões e Recomendações
      </h2>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)', marginBottom: 10 }}>O que os dados respondem</h3>
        <ul style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.8, paddingLeft: 18 }}>
          <li>
            <b>Sim, gasto em Ads gera novos clientes</b> — a regressão diária mostra slope = {(reg.slope || 0).toFixed(5).replace('.', ',')}{' '}
            ({reg.significativo ? <span style={{ color: '#66bb6a' }}>significativo</span> : <span style={{ color: '#ef5350' }}>não significativo</span>}, p = {_cmpFmtP(reg.p_value)})
            com R² = {(reg.r_squared || 0).toFixed(3)}, ou seja, <b>{((reg.r_squared || 0) * 100).toFixed(0)}% da variação diária</b> é explicada pelo gasto.
          </li>
          <li>
            <b>ANOVA confirma</b>: dias de gasto alto geram em média <b>{(anovaG.media_alto || 0).toFixed(1)} novos/dia</b> vs{' '}
            <b>{(anovaG.media_baixo || 0).toFixed(1)} novos/dia</b> em dias de gasto baixo (F = {(anovaG.F || 0).toFixed(1)}, p = {_cmpFmtP(anovaG.p_value)}).
          </li>
          <li>
            <b>ROAS global de {_cmpFmtRoas(k.roas_global)}</b> em primeira compra, mas <b>ROAS LTV de {_cmpFmtRoas(k.roas_ltv)}</b>{' '}
            quando se considera o valor de vida — o investimento é largamente lucrativo no horizonte de LTV.
          </li>
          <li>
            <b>CAC R$ {_fmtBRLk(k.cac_global).replace('R$ ','')}</b> contra LTV histórico de <b>R$ {_fmtBRLk(k.ltv_medio).replace('R$ ','')}</b>{' '}
            = <b>razão LTV/CAC ≈ {(k.ltv_medio / Math.max(1, k.cac_global)).toFixed(1)}x</b>. Saudável (benchmark de mercado ≥ 3x).
          </li>
        </ul>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#fde68a', marginTop: 18, marginBottom: 10 }}>Recomendações</h3>
        <ul style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.8, paddingLeft: 18 }}>
          <li>
            <b>Realocar budget</b> dos estados com gasto per capita alto + ROAS &lt; 1x para UFs com baixo gasto per capita + ROAS &gt; 3x{' '}
            (oportunidade não explorada — ver scatter de eficiência).
          </li>
          <li>
            <b>Investigar a anomalia de {_cmpMonthLabel(pico.am)}</b>:{' '}
            {pico.deterioracao_roas < 0 ? 'a deterioração de ROAS sugere que não basta aumentar gasto sem ajustar mix.' : 'o pico veio com ROAS estável — provar se a estratégia foi replicável.'}
          </li>
          <li>
            <b>Marcas com ROAS &lt; 1x</b> na tabela: considerar pausar ou reduzir budget — está pagando para adquirir clientes sem retorno na 1ª compra.
            Só faz sentido se o LTV daquela marca compensar (cruzar com a aba LTV por perfil quando disponível).
          </li>
          <li>
            <b>Acompanhar mix PF/PJ</b>: aumento de PF demanda ajuste em logística (frete) e Atendimento (volume) sem deterioração de ROAS LTV.
          </li>
          <li>
            <b>Próximo passo analítico</b>: regressão com lag (gasto t-1 → novos t) para isolar efeito de delay, e
            decomposição sazonal para limpar efeito de mês/semana antes de inferir causalidade.
          </li>
        </ul>
      </div>

      <div style={{ textAlign: 'center', color: 'var(--mute)', fontSize: 11, padding: '20px 0' }}>
        Astro BI · Campanhas × Vendas · gerado em {(D.gerado_em || '').slice(0, 10)} · fonte: Tiny ERP + Google Ads
      </div>
    </div>
  );
};

// Registra no escopo do bundle
Object.assign(window, { PageCampanhasAds });
