/**
 * pages-agressividade.jsx — V2 PROFUNDA da tela "Agressividade de Budget"
 * portada do Streamlit dashboard_agressividade.py.
 *
 * Tese: aumentos bruscos de verba travam o Google Ads e derrubam performance.
 * V2: storytelling + 4 KPIs + slider reativo de threshold + dual-line 90d +
 *     scatter c/ regressao + heatmap dia x UF + faixas + top 30 eventos c/ drill
 *     + correlacao por UF + recovery curve + conclusao.
 *
 * Dados: window.AGR_DATA (gerado por scripts/build_agressividade_data.py).
 * Reusa helpers _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct, AstroLine de pages-astro.jsx
 * em escopo global apos o bundle.
 */

// ===== Mini chart: bar horizontal pra correlacao (range -1..+1, vermelho/verde) =====
const AgrCorrBar = ({ items, sortKey, onSortChange }) => {
  if (!items || !items.length) return <div className="empty">sem dados</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((it, i) => {
        const r = it.correlacao_aumento_x_roas;
        const widthPct = (Math.abs(r) / 1) * 100;
        const isNeg = r < 0;
        const sig = it.significativo;
        const color = isNeg
          ? (sig ? 'var(--red)' : 'rgba(239,83,80,0.4)')
          : (sig ? 'var(--green)' : 'rgba(102,187,106,0.4)');
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 70px 60px 50px', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{it.uf}</span>
            <div style={{ position: 'relative', height: 18, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', left: '50%', top: 0, height: '100%',
                width: `${widthPct/2}%`,
                background: color,
                transform: isNeg ? 'translateX(-100%)' : 'translateX(0)',
              }} />
              <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.2)' }} />
            </div>
            <span style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 11 }}>
              {r.toFixed(3)}
            </span>
            <span style={{ color: sig ? 'var(--amber)' : 'var(--mute)', fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 10 }}>
              {it.p_value != null ? 'p=' + it.p_value.toExponential(1) : '—'}
            </span>
            <span style={{ color: 'var(--mute)', fontSize: 11, textAlign: 'right' }}>n={it.sample_size}</span>
          </div>
        );
      })}
    </div>
  );
};

// ===== Dual line SVG: budget + ROAS no mesmo eixo X, eixos Y independentes =====
const AgrDualLineCombo = ({ data, height = 260 }) => {
  if (!data || !data.length) return <div className="empty">sem dados</div>;
  const W = 900, H = height;
  const padL = 50, padR = 50, padT = 18, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const budgets = data.map(d => d.budget);
  const roas = data.map(d => d.roas);
  const bMax = Math.max(...budgets);
  const bMin = 0;
  const rMax = Math.max(...roas);
  const rMin = Math.min(...roas);
  const rRange = rMax - rMin || 1;

  const xAt = (i) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const yBudget = (v) => padT + (1 - (v - bMin) / (bMax - bMin || 1)) * innerH;
  const yRoas = (v) => padT + (1 - (v - rMin) / rRange) * innerH;

  const ptsB = data.map((d, i) => [xAt(i), yBudget(d.budget)]);
  const ptsR = data.map((d, i) => [xAt(i), yRoas(d.roas)]);
  const path = (pts) => pts.map((p, i) => (i === 0 ? `M ${p[0].toFixed(1)} ${p[1].toFixed(1)}` : `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)).join(' ');
  const areaB = `${path(ptsB)} L ${ptsB[ptsB.length-1][0]} ${padT + innerH} L ${ptsB[0][0]} ${padT + innerH} Z`;

  // ticks Y: budget (esquerda) e ROAS (direita)
  const yTicks = 4;
  const budgetTicks = Array.from({ length: yTicks + 1 }, (_, i) => bMax * (i / yTicks));
  const roasTicks = Array.from({ length: yTicks + 1 }, (_, i) => rMin + rRange * (i / yTicks));

  // grid
  const gradId = `agr-budget-grad-${Math.random().toString(36).slice(2,8)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* grid horizontal */}
      {budgetTicks.map((tv, i) => {
        const y = padT + innerH - (i / yTicks) * innerH;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={padL + innerW} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 4"/>
            <text x={padL - 6} y={y + 3} textAnchor="end" style={{ fontSize: 10, fill: '#f59e0b', fontFamily: 'JetBrains Mono, monospace' }}>
              {tv >= 1000 ? `${(tv/1000).toFixed(0)}k` : tv.toFixed(0)}
            </text>
            <text x={padL + innerW + 6} y={y + 3} textAnchor="start" style={{ fontSize: 10, fill: '#22d3ee', fontFamily: 'JetBrains Mono, monospace' }}>
              {roasTicks[i].toFixed(1)}x
            </text>
          </g>
        );
      })}
      {/* area budget */}
      <path d={areaB} fill={`url(#${gradId})`} />
      {/* budget line */}
      <path d={path(ptsB)} stroke="#f59e0b" strokeWidth="2" fill="none" />
      {/* roas line */}
      <path d={path(ptsR)} stroke="#22d3ee" strokeWidth="2" fill="none" />
      {/* legendas */}
      <g>
        <rect x={padL} y={4} width={12} height={2} fill="#f59e0b" />
        <text x={padL + 18} y={9} style={{ fontSize: 10, fill: '#cbd5e1' }}>Budget (esq · R$)</text>
        <rect x={padL + 130} y={4} width={12} height={2} fill="#22d3ee" />
        <text x={padL + 148} y={9} style={{ fontSize: 10, fill: '#cbd5e1' }}>ROAS (dir · x)</text>
      </g>
      {/* x labels (5 pontos esparsos) */}
      {[0, Math.floor(data.length/4), Math.floor(data.length/2), Math.floor(3*data.length/4), data.length-1].map((i, k) => (
        i < data.length && (
          <text key={k} x={xAt(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 10, fill: '#94a3b8' }}>
            {data[i].dia.slice(5)}
          </text>
        )
      ))}
    </svg>
  );
};

// ===== Scatter delta% x ROAS com reta de regressao =====
const AgrScatter = ({ points, reg, height = 320 }) => {
  if (!points || !points.length) return <div className="empty">sem dados</div>;
  const W = 900, H = height;
  const padL = 50, padR = 18, padT = 20, padB = 38;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xs = points.map(p => p.delta_pct);
  const ys = points.map(p => p.roas);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 0);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xR = xMax - xMin || 1, yR = yMax - yMin || 1;
  const px = (v) => padL + ((v - xMin) / xR) * innerW;
  const py = (v) => padT + (1 - (v - yMin) / yR) * innerH;
  // reta de regressao
  let regLine = null;
  if (reg && reg.slope != null && reg.intercept != null) {
    const x1 = xMin, x2 = xMax;
    const y1 = reg.slope * x1 + reg.intercept;
    const y2 = reg.slope * x2 + reg.intercept;
    regLine = { x1: px(x1), y1: py(y1), x2: px(x2), y2: py(y2) };
  }
  // ticks
  const xTicks = 5, yTicks = 5;
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => xMin + xR * (i / xTicks));
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => yMin + yR * (i / yTicks));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      {/* grid */}
      {yTickVals.map((v, i) => {
        const y = py(v);
        return (
          <g key={'y'+i}>
            <line x1={padL} y1={y} x2={padL + innerW} y2={y} stroke="rgba(255,255,255,0.04)" strokeDasharray="3 4"/>
            <text x={padL - 6} y={y + 3} textAnchor="end" style={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>{v.toFixed(1)}x</text>
          </g>
        );
      })}
      {xTickVals.map((v, i) => {
        const x = px(v);
        return (
          <g key={'x'+i}>
            <line x1={x} y1={padT} x2={x} y2={padT + innerH} stroke="rgba(255,255,255,0.04)" strokeDasharray="3 4"/>
            <text x={x} y={H - 18} textAnchor="middle" style={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>{v >= 0 ? '+' : ''}{v.toFixed(0)}%</text>
          </g>
        );
      })}
      {/* eixo zero (delta=0) destacado */}
      <line x1={px(0)} y1={padT} x2={px(0)} y2={padT + innerH} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 3"/>
      {/* pontos: cor = sinal (vermelho se delta>20, cinza estavel, verde queda) */}
      {points.map((p, i) => {
        const isAgr = p.delta_pct > 20;
        const isQueda = p.delta_pct < -10;
        const color = isAgr ? '#ef4444' : (isQueda ? '#22d3ee' : 'rgba(148,163,184,0.7)');
        return (
          <circle key={i} cx={px(p.delta_pct)} cy={py(p.roas)} r="3.5" fill={color} opacity={0.8}>
            <title>{`Δ ${p.delta_pct.toFixed(1)}% · ROAS ${p.roas.toFixed(2)}x`}</title>
          </circle>
        );
      })}
      {/* reta de regressao */}
      {regLine && (
        <line x1={regLine.x1} y1={regLine.y1} x2={regLine.x2} y2={regLine.y2}
              stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6 4" />
      )}
      {/* labels eixos */}
      <text x={padL + innerW/2} y={H - 4} textAnchor="middle" style={{ fontSize: 11, fill: '#cbd5e1' }}>
        Δ% Budget dia-a-dia
      </text>
      <text x={14} y={padT + innerH/2} textAnchor="middle" transform={`rotate(-90 14 ${padT + innerH/2})`} style={{ fontSize: 11, fill: '#cbd5e1' }}>
        ROAS (receita/gasto)
      </text>
      {/* R^2 box */}
      {reg && reg.r_squared != null && (
        <g>
          <rect x={W - padR - 130} y={padT + 4} width={120} height={42} rx="4"
                fill="rgba(245,158,11,0.12)" stroke="rgba(245,158,11,0.4)" strokeWidth="1" />
          <text x={W - padR - 70} y={padT + 19} textAnchor="middle" style={{ fontSize: 10, fill: '#f59e0b', fontFamily: 'JetBrains Mono, monospace' }}>
            slope={reg.slope.toFixed(4)}
          </text>
          <text x={W - padR - 70} y={padT + 33} textAnchor="middle" style={{ fontSize: 10, fill: '#cbd5e1', fontFamily: 'JetBrains Mono, monospace' }}>
            r={reg.r_pearson.toFixed(3)} · R²={reg.r_squared.toFixed(3)}
          </text>
        </g>
      )}
    </svg>
  );
};

// ===== Heatmap dia x UF =====
const AgrHeatmap = ({ data }) => {
  if (!data || !data.dias || !data.dias.length) return <div className="empty">sem dados</div>;
  const { dias, ufs, matriz } = data;
  // cor por vs_pct: vermelho < 0, verde > 0
  const cellColor = (cell) => {
    if (cell == null || cell.vs_pct == null) return 'rgba(148,163,184,0.06)';
    const v = cell.vs_pct;
    const a = Math.min(1, Math.abs(v) / 50);
    if (v < 0) return `rgba(239,68,68,${0.15 + a * 0.6})`;
    return `rgba(34,197,94,${0.15 + a * 0.6})`;
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'inline-grid', gridTemplateColumns: `40px repeat(${dias.length}, 22px)`, gap: 2, fontSize: 10 }}>
        <div></div>
        {dias.map((d, i) => (
          <div key={i} style={{
            transform: 'rotate(-60deg)', transformOrigin: 'left bottom',
            width: 22, height: 60, color: 'var(--mute)', fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap', alignSelf: 'end',
          }}>
            {d.slice(5)}
          </div>
        ))}
        {matriz.map((row, ri) => (
          <React.Fragment key={ri}>
            <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 11, alignSelf: 'center' }}>{row.uf}</div>
            {row.celulas.map((cell, ci) => (
              <div key={ci}
                title={cell ? `${row.uf} · ${dias[ci]}\nROAS ${cell.roas.toFixed(2)}x (vs media: ${cell.vs_pct >= 0 ? '+' : ''}${cell.vs_pct?.toFixed(1)}%)\nΔ${cell.delta_pct >= 0 ? '+' : ''}${cell.delta_pct.toFixed(1)}%` : 'sem dados'}
                style={{
                  width: 22, height: 22, background: cellColor(cell),
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: 2, cursor: 'pointer',
                }}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: 'var(--mute)' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(239,68,68,0.6)', verticalAlign: 'middle', borderRadius: 2 }} /> ROAS abaixo da média da UF</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(34,197,94,0.6)', verticalAlign: 'middle', borderRadius: 2 }} /> ROAS acima da média da UF</span>
      </div>
    </div>
  );
};

// ===== Recovery curve (linha relativa pos-evento) =====
const AgrRecoveryLine = ({ curve }) => {
  if (!curve || !curve.length) return <div className="empty">sem dados</div>;
  const W = 600, H = 220;
  const padL = 50, padR = 18, padT = 24, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const vals = curve.map(c => c.roas_normalizado).filter(v => v != null);
  const yMin = Math.min(0.5, ...vals);
  const yMax = Math.max(1.5, ...vals);
  const yR = yMax - yMin || 1;
  const px = (i) => padL + (i / Math.max(1, curve.length - 1)) * innerW;
  const py = (v) => padT + (1 - (v - yMin) / yR) * innerH;
  const pts = curve.map((c, i) => c.roas_normalizado != null ? [px(i), py(c.roas_normalizado)] : null).filter(p => p != null);
  const path = pts.length ? pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ') : '';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
      {/* linha baseline = 1.0 */}
      <line x1={padL} y1={py(1)} x2={padL + innerW} y2={py(1)} stroke="rgba(34,197,94,0.5)" strokeDasharray="4 4" />
      <text x={padL + innerW + 4} y={py(1) + 3} style={{ fontSize: 10, fill: '#22c55e' }}>baseline 1.0x</text>
      {/* linha 0.95 */}
      <line x1={padL} y1={py(0.95)} x2={padL + innerW} y2={py(0.95)} stroke="rgba(239,68,68,0.4)" strokeDasharray="2 3" />
      <text x={padL + innerW + 4} y={py(0.95) + 3} style={{ fontSize: 10, fill: '#ef4444' }}>0.95x</text>
      {/* dia 0 verticalmente */}
      <line x1={px(0)} y1={padT} x2={px(0)} y2={padT + innerH} stroke="rgba(245,158,11,0.4)" strokeDasharray="3 3" />
      <text x={px(0)} y={padT - 4} textAnchor="middle" style={{ fontSize: 10, fill: '#f59e0b' }}>evento</text>
      {/* y ticks */}
      {[yMin, yMin + yR*0.5, yMax].map((v, i) => (
        <text key={i} x={padL - 6} y={py(v) + 3} textAnchor="end" style={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>{v.toFixed(2)}x</text>
      ))}
      {/* linha */}
      {path && <path d={path} stroke="#22d3ee" strokeWidth="2.5" fill="none" />}
      {/* pontos */}
      {curve.map((c, i) => c.roas_normalizado != null && (
        <g key={i}>
          <circle cx={px(i)} cy={py(c.roas_normalizado)} r="4" fill="#22d3ee">
            <title>{`Dia +${c.dia_relativo}: ROAS ${c.roas_normalizado.toFixed(2)}x baseline (n=${c.n})`}</title>
          </circle>
          <text x={px(i)} y={H - 14} textAnchor="middle" style={{ fontSize: 10, fill: '#cbd5e1' }}>+{c.dia_relativo}d</text>
        </g>
      ))}
      <text x={padL + innerW/2} y={H - 2} textAnchor="middle" style={{ fontSize: 10, fill: '#94a3b8' }}>Dias após evento agressivo</text>
    </svg>
  );
};

// ===== PageAgressividade V2 =====
const PageAgressividade = () => {
  const D = window.AGR_DATA;

  // === Slider state: threshold de "agressivo" em % (default 20)
  const [threshold, setThreshold] = useState(20);
  const [ufFilter, setUfFilter] = useState('TODOS');
  const [sortCorrBy, setSortCorrBy] = useState('abs_corr');
  const [drillEvent, setDrillEvent] = useState(null);

  // === Recompute reativo dos KPIs baseados no slider ===
  const reactive = useMemo(() => {
    if (!D || !D.todos_dias_reactive) return null;
    const all = D.todos_dias_reactive;
    const filtered = ufFilter === 'TODOS' ? all : all.filter(d => d.uf_dom === ufFilter);
    if (filtered.length < 2) {
      return { n: 0, n_agr: 0, roas_agr: null, roas_normal: null, degradacao: null, delta_medio: null };
    }
    const agr = filtered.filter(d => d.delta_pct > threshold);
    const normal = filtered.filter(d => d.delta_pct > -5 && d.delta_pct < 5);
    const roas_agr = agr.length ? agr.reduce((s, d) => s + d.roas, 0) / agr.length : null;
    const roas_normal = normal.length ? normal.reduce((s, d) => s + d.roas, 0) / normal.length : null;
    const degr = (roas_agr != null && roas_normal) ? ((roas_agr - roas_normal) / roas_normal * 100) : null;
    const delta_medio = filtered.reduce((s, d) => s + d.delta_pct, 0) / filtered.length;
    return {
      n: filtered.length,
      n_agr: agr.length,
      roas_agr,
      roas_normal,
      degradacao: degr,
      delta_medio,
    };
  }, [D, threshold, ufFilter]);

  // === Faixas recomputadas com threshold do slider ===
  const faixasReactive = useMemo(() => {
    if (!D || !D.todos_dias_reactive) return [];
    const all = D.todos_dias_reactive;
    const filtered = ufFilter === 'TODOS' ? all : all.filter(d => d.uf_dom === ufFilter);
    const baseline = (() => {
      const normal = filtered.filter(d => d.delta_pct > -5 && d.delta_pct < 5);
      return normal.length ? normal.reduce((s, d) => s + d.roas, 0) / normal.length : null;
    })();
    const buckets = [
      { faixa: 'Queda >20%', lo: -1e9, hi: -20 },
      { faixa: 'Queda 5-20%', lo: -20, hi: -5 },
      { faixa: 'Estável -5..+5%', lo: -5, hi: 5 },
      { faixa: 'Aumento 5-20%', lo: 5, hi: 20 },
      { faixa: `Aumento >${threshold}%`, lo: threshold, hi: 1e9 },
    ];
    return buckets.map(b => {
      const sub = filtered.filter(d => d.delta_pct > b.lo && d.delta_pct <= b.hi);
      const roas_medio = sub.length ? sub.reduce((s, d) => s + d.roas, 0) / sub.length : null;
      const novos_medio = sub.length ? sub.reduce((s, d) => s + d.novos, 0) / sub.length : null;
      const vs = (roas_medio != null && baseline) ? ((roas_medio - baseline) / baseline * 100) : null;
      return {
        ...b,
        n: sub.length,
        roas_medio,
        vs_baseline_pct: vs,
        novos_medio,
      };
    });
  }, [D, threshold, ufFilter]);

  // === Correlacao ordenada ===
  const corrSorted = useMemo(() => {
    if (!D || !D.correlacao_por_estado) return [];
    const arr = [...D.correlacao_por_estado];
    if (sortCorrBy === 'abs_corr') arr.sort((a, b) => Math.abs(b.correlacao_aumento_x_roas) - Math.abs(a.correlacao_aumento_x_roas));
    else if (sortCorrBy === 'corr') arr.sort((a, b) => a.correlacao_aumento_x_roas - b.correlacao_aumento_x_roas);
    else if (sortCorrBy === 'spend') arr.sort((a, b) => b.spend_total - a.spend_total);
    else if (sortCorrBy === 'pval') arr.sort((a, b) => (a.p_value ?? 1) - (b.p_value ?? 1));
    return arr;
  }, [D, sortCorrBy]);

  // === UFs disponiveis pra filtro ===
  const ufsDisponiveis = useMemo(() => {
    if (!D || !D.todos_dias_reactive) return [];
    return ['TODOS', ...new Set(D.todos_dias_reactive.map(d => d.uf_dom))].filter(u => u !== '—' && u !== undefined);
  }, [D]);

  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          agressividade-data.js nao carregado. Rode: <code>python scripts/build_agressividade_data.py</code>
        </div>
      </div>
    );
  }

  const k = D.kpis;
  const rec = D.recomendacao_limite || D.recomendacao_taxa_maxima;
  const degRct = reactive?.degradacao ?? k.roas_degradacao_pct;
  const cor_degradacao = degRct < -10 ? 'var(--red)' : (degRct < 0 ? 'var(--amber)' : 'var(--green)');

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      {/* === Breadcrumb === */}
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span style={{ color: 'var(--mute)' }}>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b style={{ color: 'var(--text)' }}>Agressividade de Budget</b>
      </div>

      {/* === HERO + STORYTELLING TESE === */}
      <div className="card" style={{ marginBottom: 20, padding: '20px 24px', background: 'linear-gradient(135deg, rgba(239,83,80,0.08), rgba(249,168,37,0.06))', borderLeft: '3px solid var(--red)' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
          Aumentos bruscos de budget travam o Google Ads?
        </h1>
        <p style={{ margin: '10px 0 0', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>
          <b style={{ color: 'var(--amber)' }}>Hipótese central:</b> quando o budget sobe demais
          de um dia pro outro, o algoritmo do Google entra em fase de re-aprendizado,
          não consegue otimizar leilões e o ROAS resultante cai. <b>Contexto:</b> medimos
          a variação diária do gasto vs ROAS resultante desde {k.periodo_de} ({k.n_dias_observados} dias úteis,
          sem sábado/domingo, sem outliers acima de 3σ). A análise abaixo é interativa:
          arraste o slider de threshold pra redefinir o que é "dia agressivo".
        </p>
      </div>

      {/* === 4 KPIs principais === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <div className="kpi-tile amber">
          <div className="kpi-label">Taxa média de aumento</div>
          <div className="kpi-value">{(reactive?.delta_medio ?? k.delta_pct_medio) >= 0 ? '+' : ''}{(reactive?.delta_medio ?? k.delta_pct_medio).toFixed(1)}%</div>
          <div className="kpi-hint">
            mediana {k.delta_pct_mediano >= 0 ? '+' : ''}{k.delta_pct_mediano.toFixed(1)}% · σ={k.delta_pct_std?.toFixed(1)}% · {reactive?.n_agr ?? k.n_dias_agressivos} dia(s) ≥ threshold
          </div>
        </div>
        <div className="kpi-tile" style={{ borderLeft: `3px solid ${cor_degradacao}` }}>
          <div className="kpi-label">ROAS agressivos vs normal</div>
          <div className="kpi-value">
            {reactive?.roas_agr != null ? reactive.roas_agr.toFixed(2) : k.roas_em_dias_agressivos.toFixed(2)}x
            <span style={{ fontSize: 14, color: 'var(--mute)', marginLeft: 8 }}>
              / {(reactive?.roas_normal ?? k.roas_em_dias_normais).toFixed(2)}x
            </span>
          </div>
          <div className="kpi-hint" style={{ color: cor_degradacao }}>
            {degRct >= 0 ? '+' : ''}{degRct.toFixed(1)}% {degRct < 0 ? '(degradação)' : '(saudável)'}
          </div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Limite recomendado</div>
          <div className="kpi-value">
            {rec.limite_pct_sugerido != null ? `+${rec.limite_pct_sugerido}%` : '—'}
          </div>
          <div className="kpi-hint">aumento máx · ROAS baseline {rec.roas_baseline.toFixed(2)}x</div>
        </div>
        <div className="kpi-tile" style={{ borderLeft: '3px solid var(--cyan)' }}>
          <div className="kpi-label">Recovery médio</div>
          <div className="kpi-value">{k.recovery_medio_dias != null ? `${k.recovery_medio_dias.toFixed(1)}d` : '—'}</div>
          <div className="kpi-hint">dias úteis pra ROAS voltar ao baseline após evento</div>
        </div>
      </div>

      {/* === SLIDER REATIVO === */}
      <div className="card" style={{ marginBottom: 22, padding: '16px 20px', background: 'rgba(245,158,11,0.04)', borderLeft: '3px solid var(--amber)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px 1fr', gap: 18, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
              Threshold de "dia agressivo": <span style={{ color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>Δ &gt; {threshold}%</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
              Arraste pra redefinir o que é agressivo. KPIs e tabelas embaixo recomputam.
            </div>
          </div>
          <input
            type="range" min="5" max="100" step="5"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--amber)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'end' }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              Filtro UF dominante:
              <select
                value={ufFilter}
                onChange={e => setUfFilter(e.target.value)}
                style={{ marginLeft: 8, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12 }}
              >
                {ufsDisponiveis.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 11, color: 'var(--mute)' }}>
              n = {reactive?.n ?? 0} dias filtrados
            </div>
          </div>
        </div>
      </div>

      {/* === Serie diaria budget x ROAS dual-line === */}
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px', color: 'var(--text)' }}>
        1. Série diária · Budget vs ROAS (últimos 90 dias úteis)
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>
            Eixos compartilham X (tempo). Y esquerdo = budget (R$ âmbar) · Y direito = ROAS (x ciano).
          </span>
          <span style={{ fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
            {D.serie_diaria_completa.length} pontos
          </span>
        </div>
        <AgrDualLineCombo data={D.serie_diaria_completa} height={280} />
      </div>

      {/* === Scatter aumento x ROAS === */}
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px', color: 'var(--text)' }}>
        2. Dispersão Δ% × ROAS · regressão linear
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--mute)' }}>
          Cada ponto = 1 dia útil. Reta tracejada âmbar = regressão OLS. Se slope &lt; 0, a tese se confirma.
        </div>
        <AgrScatter points={D.dispersao_aumento_x_roas.points} reg={D.dispersao_aumento_x_roas.regressao} />
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--mute)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', borderRadius: '50%', verticalAlign: 'middle' }} /> Δ &gt; 20% (agressivo)</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(148,163,184,0.7)', borderRadius: '50%', verticalAlign: 'middle' }} /> Estável</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#22d3ee', borderRadius: '50%', verticalAlign: 'middle' }} /> Δ &lt; -10% (queda)</span>
        </div>
      </div>

      {/* === Heatmap dia x UF === */}
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px', color: 'var(--text)' }}>
        3. Heatmap dia × UF · ROAS vs média histórica do estado
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--mute)' }}>
          Últimos 30 dias úteis × top 10 UFs por gasto. Verde = ROAS acima da média histórica da UF; vermelho = abaixo.
        </div>
        <AgrHeatmap data={D.heatmap_dia_uf} />
      </div>

      {/* === Faixas de aumento (reativa) === */}
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px', color: 'var(--text)' }}>
        4. ROAS médio por faixa de agressividade <span style={{ color: 'var(--amber)', fontWeight: 400, fontSize: 13 }}>(recompute com slider)</span>
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Faixa</th>
              <th style={{ textAlign: 'right' }}>N dias</th>
              <th style={{ textAlign: 'right' }}>ROAS médio</th>
              <th style={{ textAlign: 'right' }}>vs baseline</th>
              <th style={{ textAlign: 'right' }}>Novos/dia</th>
            </tr>
          </thead>
          <tbody>
            {faixasReactive.map((f, i) => {
              const vs = f.vs_baseline_pct;
              const cor = vs == null ? 'var(--mute)' : (vs < -5 ? 'var(--red)' : (vs > 5 ? 'var(--green)' : 'var(--text-2)'));
              return (
                <tr key={i}>
                  <td>{f.faixa}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{f.n}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{f.roas_medio != null ? f.roas_medio.toFixed(2) + 'x' : '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: cor }}>
                    {vs != null ? (vs >= 0 ? '+' : '') + vs.toFixed(1) + '%' : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>
                    {f.novos_medio != null ? f.novos_medio.toFixed(1) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === Top 30 eventos + drill === */}
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px', color: 'var(--text)' }}>
        5. Top 30 dias com maior aumento de budget <span style={{ color: 'var(--mute)', fontWeight: 400, fontSize: 12 }}>(clique pra ver recovery dos próximos 7 dias)</span>
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Dia</th>
              <th style={{ textAlign: 'right' }}>Spend ant.</th>
              <th style={{ textAlign: 'right' }}>Spend</th>
              <th style={{ textAlign: 'right' }}>Δ %</th>
              <th style={{ textAlign: 'right' }}>Receita</th>
              <th style={{ textAlign: 'right' }}>ROAS</th>
              <th style={{ textAlign: 'right' }}>Novos</th>
            </tr>
          </thead>
          <tbody>
            {D.eventos_agressividade.map((e, i) => (
              <React.Fragment key={i}>
                <tr style={{ cursor: 'pointer', background: drillEvent === i ? 'rgba(34,211,238,0.05)' : 'transparent' }}
                    onClick={() => setDrillEvent(drillEvent === i ? null : i)}>
                  <td style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{e.dia}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>
                    {e.spend_anterior != null ? _fmtBRLk(e.spend_anterior) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(e.spend)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: e.delta_pct > 50 ? 'var(--red)' : 'var(--amber)' }}>
                    +{e.delta_pct.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(e.receita)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: e.roas < 5 ? 'var(--red)' : (e.roas > 8 ? 'var(--green)' : 'var(--text-2)') }}>
                    {e.roas.toFixed(2)}x
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{e.novos}</td>
                </tr>
                {drillEvent === i && e.drill_recovery && (
                  <tr>
                    <td colSpan="8" style={{ background: 'var(--surface-2)', padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 6 }}>
                        Recovery próximos 7 dias úteis após {e.dia}:
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {e.drill_recovery.map((d, di) => (
                          <div key={di} style={{
                            background: 'var(--surface)', padding: '6px 10px', borderRadius: 4,
                            border: `1px solid ${d.roas == null ? 'transparent' : (d.roas >= rec.roas_baseline * 0.95 ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.3)')}`,
                            fontSize: 11, minWidth: 90, textAlign: 'center',
                          }}>
                            <div style={{ color: 'var(--mute)' }}>+{d.dia_relativo}d</div>
                            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                              {d.roas != null ? d.roas.toFixed(2) + 'x' : '—'}
                            </div>
                            <div style={{ color: 'var(--mute)', fontSize: 10 }}>
                              {d.delta_pct != null ? (d.delta_pct >= 0 ? '+' : '') + d.delta_pct.toFixed(0) + '%' : '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* === Correlacao por estado (ordenavel) === */}
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px', color: 'var(--text)' }}>
        6. Correlação Δ Budget × ROAS por estado <span style={{ color: 'var(--mute)', fontWeight: 400, fontSize: 12 }}>({corrSorted.length} UFs)</span>
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>
            r &lt; -0.15 + p &lt; 0.10 = estado "trava" com aumentos bruscos
          </span>
          <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
            <button onClick={() => setSortCorrBy('abs_corr')}
                    style={{ background: sortCorrBy === 'abs_corr' ? 'var(--amber)' : 'var(--surface-2)', color: sortCorrBy === 'abs_corr' ? '#000' : 'var(--text-2)', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}>
              |r|
            </button>
            <button onClick={() => setSortCorrBy('corr')}
                    style={{ background: sortCorrBy === 'corr' ? 'var(--amber)' : 'var(--surface-2)', color: sortCorrBy === 'corr' ? '#000' : 'var(--text-2)', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}>
              r ↑
            </button>
            <button onClick={() => setSortCorrBy('pval')}
                    style={{ background: sortCorrBy === 'pval' ? 'var(--amber)' : 'var(--surface-2)', color: sortCorrBy === 'pval' ? '#000' : 'var(--text-2)', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}>
              p-value
            </button>
            <button onClick={() => setSortCorrBy('spend')}
                    style={{ background: sortCorrBy === 'spend' ? 'var(--amber)' : 'var(--surface-2)', color: sortCorrBy === 'spend' ? '#000' : 'var(--text-2)', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}>
              Spend
            </button>
          </div>
        </div>
        <AgrCorrBar items={corrSorted} />
        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mute)' }}>
          <span style={{ color: 'var(--red)' }}>■</span> r &lt; 0 + p &lt; 0.10 (trava significativo) ·{' '}
          <span style={{ color: 'rgba(239,83,80,0.4)' }}>■</span> r &lt; 0 sem significância ·{' '}
          <span style={{ color: 'var(--green)' }}>■</span> r &gt; 0 + p &lt; 0.10 (saudável)
        </div>
      </div>

      {/* === Recovery curve === */}
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px', color: 'var(--text)' }}>
        7. Recovery curve · ROAS médio nos dias após evento agressivo
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--mute)' }}>
          Cada ponto = ROAS médio normalizado pelo baseline ({rec.roas_baseline.toFixed(2)}x = 1.0). Dia 0 = evento agressivo (Δ &gt; {k.threshold_agressivo_default}%).
        </div>
        <AgrRecoveryLine curve={D.recovery_curve} />
      </div>

      {/* === Conclusao === */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(34,197,94,0.04))', borderLeft: '3px solid var(--amber)', padding: '20px 24px' }}>
        <h4 style={{ margin: 0, color: 'var(--amber)', fontSize: 16, fontWeight: 700 }}>Conclusão · Recomendação operacional</h4>
        <p style={{ margin: '10px 0 0', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>
          {rec.limite_pct_sugerido != null ? (
            <>
              <b style={{ color: 'var(--green)' }}>Limitar o aumento de budget a +{rec.limite_pct_sugerido}%/dia útil</b> mantém
              o ROAS dentro de 95% do baseline ({rec.roas_baseline.toFixed(2)}x).
              Acima disso, observamos degradação média de {Math.abs(degRct).toFixed(1)}% e recovery
              de {k.recovery_medio_dias != null ? `${k.recovery_medio_dias.toFixed(1)} dias úteis` : 'múltiplos dias'} pra normalizar.
            </>
          ) : (
            <>
              <b>Amostra ainda insuficiente</b> pra cravar limite estatístico —
              {' '}{k.n_dias_observados} dias observados. Recomendação interina: aumentos progressivos
              de +15% a +20%/dia útil, monitorando recovery semana a semana.
            </>
          )}
        </p>
        <p style={{ margin: '10px 0 0', color: 'var(--mute)', fontSize: 11 }}>
          Período: {k.periodo_de} → {k.periodo_ate} · {k.n_dias_observados} dias úteis · campanha desde {D.meta.campaign_start} ·
          fim-de-semana excluído · outliers (spend &lt; μ - 3σ) removidos · fonte: {D.meta.fonte} · build {D.meta.versao}.
        </p>
      </div>
    </div>
  );
};

Object.assign(window, { PageAgressividade });
