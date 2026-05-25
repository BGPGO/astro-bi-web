/**
 * pages-astro.jsx — Astro BI · Dash V3 (DuckDB-WASM reactive)
 *
 * V3 reescreve PageAstroDash do zero:
 *  - Filtros sticky de 8 dimensões com multiselect customizado.
 *  - Cross-filter por clique em barras UF/Pgto/Transp/Marca.
 *  - 4 KPIs grandes + 6 secundários (todos via SQL reativo).
 *  - 6 charts (linha 1: temporal · linha 2: perfil), com tooltip e click → filtro.
 *  - 2 hierarquias drill-down (Marca→Cat→Sub→SEO e Cat→Sub→SEO) — queries lazy
 *    por nó expandido, NÃO uma tabela pré-calculada.
 *  - Top 30 SEO flat sortable + busca.
 *  - 3 barras bottom (UF, Pgto, Transp) com cross-filter on click.
 *
 * Dados via DuckDB-WASM (view `vendas` registrada no boot do index.html).
 * Tudo recalcula sob mudanças nos filtros.
 *
 * Mantém PagePlanoAcao intacta + helpers globais usados por outras pages-X.jsx.
 */

// ===== Helpers de formatacao =====
const _fmtBRL = (v) => {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
};
const _fmtBRLk = (v) => {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}R$ ${(a/1e9).toFixed(2).replace('.', ',')}B`;
  if (a >= 1e6) return `${s}R$ ${(a/1e6).toFixed(2).replace('.', ',')}M`;
  if (a >= 1e3) return `${s}R$ ${(a/1e3).toFixed(0)}k`;
  return `${s}R$ ${a.toFixed(0)}`;
};
const _fmtNum = (v, d = 0) => {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
};
const _fmtPct = (v, d = 1) => {
  if (v == null || !isFinite(v)) return '—';
  return `${(v*100).toFixed(d).replace('.', ',')}%`;
};

// ===== Mini chart: bar vertical via SVG =====
// Renderiza SVG em tamanho NATIVO (W × H px) dentro de wrapper com scroll-x.
// Sem preserveAspectRatio="none": rx="3" mantém cantos redondos, sem distorcer.
const AstroBarV = ({ values, labels, color = 'cyan', height = 220, fmt = _fmtBRLk, onBarClick, activeIdx }) => {
  if (!values || !values.length) return <div className="empty">sem dados</div>;
  const max = Math.max(...values, 1);
  const palette = { cyan: '#22d3ee', green: '#10b981', amber: '#f59e0b', violet: '#a78bfa', red: '#ef4444' };
  const color1 = palette[color] || palette.cyan;
  const N = values.length;
  const padT = 28, padB = 32, padL = 12, padR = 12;
  // slot por barra: 80 (poucos), 60 (médio), 42 (muitos)
  const barSlot = N <= 4 ? 90 : (N <= 8 ? 65 : (N <= 14 ? 50 : 42));
  const W = Math.max(280, padL + padR + N * barSlot);
  const H = height;
  const innerH = H - padT - padB;
  const barW = Math.min(54, barSlot * 0.62);
  const rotateLabel = N > 8 || labels.some((l) => String(l).length > 5);
  return (
    <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* baseline */}
        <line x1={padL} y1={H - padB + 0.5} x2={W - padR} y2={H - padB + 0.5}
              stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        {values.map((v, i) => {
          const h = (v / max) * innerH;
          const cx = padL + barSlot * (i + 0.5);
          const x = cx - barW / 2;
          const y = padT + (innerH - h);
          const isActive = activeIdx === i;
          const labelY = H - 12;
          return (
            <g key={i} onClick={() => onBarClick && onBarClick(i, v, labels[i])} style={{ cursor: onBarClick ? 'pointer' : 'default' }}>
              <rect
                x={x} y={y} width={barW} height={Math.max(2, h)}
                rx="3"
                fill={color1}
                opacity={isActive ? 1 : (activeIdx != null ? 0.4 : 0.92)}
              >
                <title>{`${labels[i]}: ${fmt(v)}`}</title>
              </rect>
              <text x={cx} y={y - 6} textAnchor="middle"
                    style={{ fontSize: 11, fill: '#cbd5e1', fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none' }}>{fmt(v)}</text>
              {rotateLabel ? (
                <text x={cx} y={labelY} textAnchor="end" transform={`rotate(-35 ${cx} ${labelY})`}
                      style={{ fontSize: 10, fill: '#94a3b8', pointerEvents: 'none' }}>{labels[i]}</text>
              ) : (
                <text x={cx} y={labelY} textAnchor="middle"
                      style={{ fontSize: 11, fill: '#94a3b8', pointerEvents: 'none' }}>{labels[i]}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ===== Mini chart: line area com hover tooltip + marker vertical =====
const AstroLine = ({ values, labels, color = 'var(--cyan)', height = 200, fmt = _fmtBRLk, activeIdx }) => {
  if (!values || !values.length) return <div className="empty">sem dados</div>;
  const [hover, setHover] = useState(null);
  const wrapRef = React.useRef(null);
  const W = 600, H = height, P = 22;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = P + (i / Math.max(1, values.length - 1)) * (W - P*2);
    const y = H - P - ((v - min) / range) * (H - P*2);
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const area = `${path} L ${pts[pts.length-1][0]} ${H-P} L ${pts[0][0]} ${H-P} Z`;
  const gradId = `astro-line-grad-${Math.random().toString(36).slice(2,8)}`;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    // acha indice mais perto
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i][0] - x);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    setHover({ i: bestI, x: pts[bestI][0], y: pts[bestI][1] });
  };

  // pontos de destaque: máximo, mínimo, último
  const idxMax = values.indexOf(max);
  const idxMin = values.indexOf(min);
  const idxLast = values.length - 1;
  const markers = new Set([idxMax, idxMin, idxLast]);
  if (activeIdx != null) markers.add(activeIdx);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}
         onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
           style={{ width: '100%', height, display: 'block' }}
           onMouseMove={onMove}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={path} stroke={color} strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
        {/* marker dots (max/min/last/active) */}
        {pts.map((p, i) => markers.has(i) && (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === activeIdx ? 5 : 3}
                  fill={i === activeIdx ? '#fff' : color} stroke="#0a0f14" strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke" />
        ))}
        {/* valor texto no max */}
        <text x={pts[idxMax][0]} y={Math.max(12, pts[idxMax][1] - 8)} textAnchor="middle"
              style={{ fontSize: 10, fill: '#cbd5e1', fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none' }}>
          {fmt(max)}
        </text>
        {/* linha vertical de hover */}
        {hover && (
          <g pointerEvents="none">
            <line x1={hover.x} y1={P} x2={hover.x} y2={H - P}
                  stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke" />
            <circle cx={hover.x} cy={hover.y} r={5} fill="#fff" stroke={color} strokeWidth="2"
                    vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {/* tooltip flutuante */}
      {hover && (
        <div style={{
          position: 'absolute',
          left: `${(hover.x / W) * 100}%`,
          top: 8,
          transform: 'translateX(-50%)',
          background: 'rgba(8,14,18,0.95)', border: '1px solid var(--border-2)',
          borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#e6edf3',
          fontFamily: 'JetBrains Mono, monospace', pointerEvents: 'none',
          whiteSpace: 'nowrap', zIndex: 5,
        }}>
          <div style={{ opacity: 0.7 }}>{labels && labels[hover.i] || `#${hover.i + 1}`}</div>
          <div style={{ fontWeight: 700, color }}>{fmt(values[hover.i])}</div>
        </div>
      )}
    </div>
  );
};

// ===== Mini chart: bar horizontal (top N) — click reativo =====
const AstroBarH = ({ items, fmt = _fmtBRLk, color = 'cyan', onClick, activeLabel }) => {
  if (!items || !items.length) return <div className="empty">sem dados</div>;
  const max = Math.max(...items.map(it => it.v));
  const palette = { cyan: 'var(--cyan)', green: 'var(--green)', violet: 'var(--violet)', amber: '#f59e0b' };
  return (
    <div className="astro-bar-h" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it, i) => {
        const active = activeLabel === it.label;
        const dim = activeLabel != null && !active;
        return (
          <div
            key={i}
            onClick={() => onClick && onClick(it.label)}
            style={{
              display: 'grid', gridTemplateColumns: '130px 1fr 100px',
              gap: 8, alignItems: 'center', fontSize: 12,
              cursor: onClick ? 'pointer' : 'default',
              opacity: dim ? 0.45 : 1,
              padding: '2px 4px', borderRadius: 4,
              background: active ? 'rgba(34,211,238,0.08)' : 'transparent',
            }}
          >
            <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>{it.label}</span>
            <div style={{ background: 'var(--surface-2)', borderRadius: 4, height: 22, overflow: 'hidden' }}>
              <div style={{
                width: `${(it.v/max)*100}%`,
                height: '100%',
                background: palette[color] || palette.cyan,
                boxShadow: active ? '0 0 12px rgba(34,211,238,0.5)' : '0 0 8px rgba(34,211,238,0.3)',
                borderRadius: 4,
              }} />
            </div>
            <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right' }}>{fmt(it.v)}</span>
          </div>
        );
      })}
    </div>
  );
};

// ===== Donut PF/PJ =====
const AstroDonut = ({ segments, size = 200, onSliceClick, activeLabel }) => {
  if (!segments || !segments.length) return <div className="empty">sem dados</div>;
  const total = segments.reduce((s, x) => s + x.v, 0);
  const R = size/2 - 12, IR = R - 30;
  const COLORS = ['var(--cyan)', 'var(--red)', 'var(--violet)'];
  let acc = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((s, i) => {
          const a1 = (acc / total) * 2 * Math.PI - Math.PI/2;
          acc += s.v;
          const a2 = (acc / total) * 2 * Math.PI - Math.PI/2;
          const cx = size/2, cy = size/2;
          const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
          const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
          const xi1 = cx + IR * Math.cos(a1), yi1 = cy + IR * Math.sin(a1);
          const xi2 = cx + IR * Math.cos(a2), yi2 = cy + IR * Math.sin(a2);
          const large = (a2 - a1) > Math.PI ? 1 : 0;
          const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${IR} ${IR} 0 ${large} 0 ${xi1} ${yi1} Z`;
          const active = activeLabel === s.tipo;
          const dim = activeLabel != null && !active;
          return (
            <path key={i} d={path}
                  fill={COLORS[i % COLORS.length]}
                  opacity={dim ? 0.35 : 0.9}
                  onClick={() => onSliceClick && onSliceClick(s.tipo)}
                  style={{ cursor: onSliceClick ? 'pointer' : 'default' }}>
              <title>{`${s.tipo}: ${_fmtPct(s.v/total)}`}</title>
            </path>
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map((s, i) => (
          <div key={i}
               onClick={() => onSliceClick && onSliceClick(s.tipo)}
               style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: onSliceClick ? 'pointer' : 'default' }}>
            <span style={{ width: 10, height: 10, background: COLORS[i % COLORS.length], borderRadius: 2 }} />
            <span style={{ color: 'var(--text-2)' }}>{s.tipo}</span>
            <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{_fmtPct(s.v/total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ===========================================================================
// DuckDB-WASM helpers
// ===========================================================================

const CFV_PCT_ESTIMADO = 0.0616;

// Escapa string SQL (single-quote → '')
const _sqlEsc = (s) => String(s).replace(/'/g, "''");
const _sqlList = (arr) => arr.map((s) => `'${_sqlEsc(s)}'`).join(',');

// Roda 1 query — usa conexão por chamada (DuckDB-WASM AsyncDuckDB).
const _runQuery = async (sql) => {
  const db = window.__duckdb;
  if (!db) throw new Error('duckdb não inicializado');
  const conn = await db.connect();
  try {
    const result = await conn.query(sql);
    return result.toArray().map((r) => {
      const obj = {};
      for (const k of Object.keys(r)) {
        const v = r[k];
        if (typeof v === 'bigint') obj[k] = Number(v);
        else obj[k] = v;
      }
      return obj;
    });
  } finally {
    await conn.close();
  }
};

// Hook que aguarda DuckDB ready e re-executa quando `sql` muda.
const useDuckDBQuery = (sql, deps) => {
  const [state, setState] = React.useState({ data: null, loading: true, error: null });
  React.useEffect(() => {
    if (!sql) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    const exec = () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      _runQuery(sql)
        .then((rows) => { if (!cancelled) setState({ data: rows, loading: false, error: null }); })
        .catch((err) => { if (!cancelled) setState({ data: null, loading: false, error: String(err) }); });
    };
    if (window.__duckdbReady) {
      exec();
    } else {
      const onReady = () => exec();
      document.addEventListener('duckdb-ready', onReady, { once: true });
      return () => { cancelled = true; document.removeEventListener('duckdb-ready', onReady); };
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps || [sql]);
  return state;
};

// Hook simples pra DuckDB status (ready/loading/erro)
const useDuckDBStatus = () => {
  const [status, setStatus] = React.useState(() => ({
    ready: !!window.__duckdbReady,
    error: window.__duckdbErr || null,
    bootMs: null,
  }));
  React.useEffect(() => {
    const t0 = performance.now();
    if (window.__duckdbReady) return;
    const onReady = () => setStatus({ ready: true, error: null, bootMs: Math.round(performance.now() - t0) });
    const onErr = (e) => setStatus({ ready: false, error: e.detail || 'erro DuckDB', bootMs: null });
    document.addEventListener('duckdb-ready', onReady);
    document.addEventListener('duckdb-error', onErr);
    return () => {
      document.removeEventListener('duckdb-ready', onReady);
      document.removeEventListener('duckdb-error', onErr);
    };
  }, []);
  return status;
};

// ===== Hook: escuta filtro global year/month do Header do template =====
// App.jsx (em build-jsx.cjs) dispatch event 'bgpgo-period-changed' com {year, month}.
// Retorna SQL fragment pronto pra adicionar no WHERE. month=0 = ano todo.
const useGlobalPeriod = () => {
  const [period, setPeriod] = useState(() => (typeof window !== 'undefined' && window.BGPGO_PERIOD) || { year: 0, month: 0 });
  useEffect(() => {
    const h = (e) => setPeriod(e.detail || { year: 0, month: 0 });
    window.addEventListener('bgpgo-period-changed', h);
    return () => window.removeEventListener('bgpgo-period-changed', h);
  }, []);
  return period;
};
const periodSql = (p) => {
  if (!p || !p.year) return null;
  if (p.month && p.month >= 1 && p.month <= 12) {
    return `EXTRACT(YEAR FROM data_pedido) = ${p.year} AND EXTRACT(MONTH FROM data_pedido) = ${p.month}`;
  }
  return `EXTRACT(YEAR FROM data_pedido) = ${p.year}`;
};
const periodAnoMesList = (p) => {
  if (!p || !p.year) return null;
  if (p.month && p.month >= 1 && p.month <= 12) {
    return [`${p.year}-${String(p.month).padStart(2, '0')}`];
  }
  return Array.from({length: 12}, (_, i) => `${p.year}-${String(i+1).padStart(2, '0')}`);
};

// ===========================================================================
// Filtros: estado + builder WHERE
// ===========================================================================

const DEFAULT_FILTERS_ASTRO = {
  anoMes: [],            // multiselect string 'YYYY-MM'
  diaUtil: 'all',        // all | util | fds
  marca: [],
  categoria: [],
  subcat: [],
  transportadora: [],
  recomprador: 'all',    // all | Recompra | Novo
  pessoa: 'all',         // all | F | J
  // cross-filters por clique (qualquer visual)
  xfUf: null,
  xfPgto: null,
  xfTransp: null,
  xfMarca: null,
  xfCategoria: null,
  xfSubcat: null,
  xfSeo: null,
};

const buildWhere = (f, globalPeriod) => {
  const parts = [];
  // NOTA: parquet slim ja filtrou Cancelado no build, nao tem coluna situacao
  parts.push(`data_pedido IS NOT NULL`);
  // Filtro global do Header (year/month) — sobrescrito se user filtrou ano-mes na page
  if ((!f.anoMes || !f.anoMes.length) && globalPeriod) {
    const ps = periodSql(globalPeriod);
    if (ps) parts.push(ps);
  }
  if (f.anoMes && f.anoMes.length) parts.push(`strftime(data_pedido, '%Y-%m') IN (${_sqlList(f.anoMes)})`);
  if (f.diaUtil === 'util') parts.push(`dayofweek(data_pedido) BETWEEN 1 AND 5`);
  if (f.diaUtil === 'fds') parts.push(`dayofweek(data_pedido) IN (0, 6)`);
  if (f.marca && f.marca.length) parts.push(`marca IN (${_sqlList(f.marca)})`);
  if (f.categoria && f.categoria.length) parts.push(`categoria_mae IN (${_sqlList(f.categoria)})`);
  if (f.subcat && f.subcat.length) parts.push(`sub_categoria IN (${_sqlList(f.subcat)})`);
  if (f.transportadora && f.transportadora.length) parts.push(`nome_transportador IN (${_sqlList(f.transportadora)})`);
  if (f.recomprador === 'Recompra') parts.push(`Recompra = 'Recompra'`);
  if (f.recomprador === 'Novo') parts.push(`(Recompra IS NULL OR Recompra <> 'Recompra')`);
  if (f.pessoa === 'F') parts.push(`cliente_tipo_pessoa = 'F'`);
  if (f.pessoa === 'J') parts.push(`cliente_tipo_pessoa = 'J'`);
  if (f.xfUf) parts.push(`cliente_uf = '${_sqlEsc(f.xfUf)}'`);
  if (f.xfPgto) parts.push(`forma_pagamento = '${_sqlEsc(f.xfPgto)}'`);
  if (f.xfTransp) parts.push(`nome_transportador = '${_sqlEsc(f.xfTransp)}'`);
  if (f.xfMarca) parts.push(`marca = '${_sqlEsc(f.xfMarca)}'`);
  if (f.xfCategoria) parts.push(`categoria_mae = '${_sqlEsc(f.xfCategoria)}'`);
  if (f.xfSubcat) parts.push(`sub_categoria = '${_sqlEsc(f.xfSubcat)}'`);
  if (f.xfSeo) parts.push(`seo_title = '${_sqlEsc(f.xfSeo)}'`);
  return parts.join(' AND ');
};

// Mapa col → key xf (pra hierarquia saber qual xf togglar por nível)
const COL_TO_XF = {
  marca: 'xfMarca',
  categoria_mae: 'xfCategoria',
  sub_categoria: 'xfSubcat',
  seo_title: 'xfSeo',
};

// ===========================================================================
// MultiSelect compacto (dropdown nativo · popover sem dependência)
// ===========================================================================

const MultiSelect = ({ label, options, value, onChange, width = 180 }) => {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const filtered = React.useMemo(() => {
    const lo = q.trim().toLowerCase();
    if (!lo) return options;
    return options.filter((o) => String(o).toLowerCase().includes(lo));
  }, [options, q]);
  const toggle = (v) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };
  const summary = value.length === 0 ? 'Todos' : (value.length === 1 ? value[0] : `${value.length} sel`);
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: width }}>
      <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', textAlign: 'left',
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: value.length ? 'var(--cyan-2)' : 'var(--text-2)',
          padding: '7px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <span style={{ fontSize: 10, color: 'var(--mute)' }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          minWidth: '100%', maxWidth: 320,
          background: 'var(--surface-2)', border: '1px solid var(--border-2)',
          borderRadius: 8, zIndex: 50,
          boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
          maxHeight: 360, overflow: 'auto', padding: 6,
        }}>
          <input
            type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar..."
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', padding: '6px 8px', fontSize: 12, borderRadius: 4, marginBottom: 6,
            }}
          />
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])}
                    style={{ width: '100%', padding: '4px 6px', fontSize: 11, color: 'var(--red-2)', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer' }}>
              Limpar seleção
            </button>
          )}
          {filtered.slice(0, 200).map((opt) => (
            <label key={opt} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 6px', fontSize: 12, color: 'var(--text)',
              borderRadius: 4, cursor: 'pointer',
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-3)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={opt}>{opt}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 8, fontSize: 11, color: 'var(--mute)' }}>nenhuma opção</div>
          )}
          {filtered.length > 200 && (
            <div style={{ padding: 6, fontSize: 10, color: 'var(--mute)' }}>... {filtered.length - 200} opções a mais (refine a busca)</div>
          )}
        </div>
      )}
    </div>
  );
};

// Toggle de 3 estados (seg-like)
const SegToggle = ({ label, value, options, onChange }) => (
  <div style={{ minWidth: 130 }}>
    <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
    <div className="seg" style={{ display: 'flex', width: '100%' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
          style={{ flex: 1, padding: '6px 4px', fontSize: 11 }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

// ===========================================================================
// Filtros barra sticky (8 dimensões)
// ===========================================================================

const FilterBarAstro = ({ filters, setF }) => {
  // Pré-carrega opções (DISTINCT) — só roda 1x. Independente dos filtros.
  // Usa JSON arrays pra evitar Arrow ListVector (que não é Array nativo do JS).
  const opcsQ = useDuckDBQuery(`
    WITH base AS (
      SELECT * FROM vendas WHERE data_pedido IS NOT NULL
    )
    SELECT
      (SELECT json_group_array(am) FROM (SELECT DISTINCT strftime(data_pedido, '%Y-%m') AS am FROM base ORDER BY am DESC) t) AS ano_mes,
      (SELECT json_group_array(m) FROM (SELECT DISTINCT marca AS m FROM base WHERE marca IS NOT NULL AND marca <> '' ORDER BY m) t) AS marca,
      (SELECT json_group_array(c) FROM (SELECT DISTINCT categoria_mae AS c FROM base WHERE categoria_mae IS NOT NULL AND categoria_mae <> '' ORDER BY c) t) AS categoria,
      (SELECT json_group_array(s) FROM (SELECT DISTINCT sub_categoria AS s FROM base WHERE sub_categoria IS NOT NULL AND sub_categoria <> '' ORDER BY s) t) AS subcat,
      (SELECT json_group_array(t) FROM (SELECT DISTINCT nome_transportador AS t FROM base WHERE nome_transportador IS NOT NULL AND nome_transportador <> '' ORDER BY t) t) AS transp
  `, []);

  const raw = opcsQ.data && opcsQ.data[0] ? opcsQ.data[0] : {};
  const parse = (s) => { try { return s ? JSON.parse(s) : []; } catch (e) { return []; } };
  const opts = {
    ano_mes: parse(raw.ano_mes),
    marca: parse(raw.marca),
    categoria: parse(raw.categoria),
    subcat: parse(raw.subcat),
    transp: parse(raw.transp),
  };
  const anoMesOpts = opts.ano_mes.slice(0, 36);

  return (
    <div style={{
      background: 'rgba(13,18,22,0.7)',
      borderBottom: '1px solid var(--border)',
      padding: '12px 0', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <MultiSelect label="Ano-Mês" options={anoMesOpts} value={filters.anoMes} onChange={(v) => setF({ anoMes: v })} width={160} />
        <SegToggle label="Dia útil" value={filters.diaUtil}
                    options={[{ value: 'all', label: 'Todos' }, { value: 'util', label: 'Útil' }, { value: 'fds', label: 'FDS' }]}
                    onChange={(v) => setF({ diaUtil: v })} />
        <MultiSelect label="Marca" options={opts.marca || []} value={filters.marca} onChange={(v) => setF({ marca: v })} width={170} />
        <MultiSelect label="Categoria mãe" options={opts.categoria || []} value={filters.categoria} onChange={(v) => setF({ categoria: v })} width={170} />
        <MultiSelect label="Sub-categoria" options={opts.subcat || []} value={filters.subcat} onChange={(v) => setF({ subcat: v })} width={170} />
        <MultiSelect label="Transportadora" options={opts.transp || []} value={filters.transportadora} onChange={(v) => setF({ transportadora: v })} width={180} />
        <SegToggle label="Recomprador" value={filters.recomprador}
                    options={[{ value: 'all', label: 'Todos' }, { value: 'Recompra', label: 'Recompra' }, { value: 'Novo', label: 'Novo' }]}
                    onChange={(v) => setF({ recomprador: v })} />
        <SegToggle label="Pessoa" value={filters.pessoa}
                    options={[{ value: 'all', label: 'Todos' }, { value: 'F', label: 'PF' }, { value: 'J', label: 'PJ' }]}
                    onChange={(v) => setF({ pessoa: v })} />
      </div>
    </div>
  );
};

// ===========================================================================
// Chips de cross-filter ativo
// ===========================================================================

const ActiveChips = ({ filters, setF }) => {
  const chips = [];
  if (filters.xfUf) chips.push({ k: 'xfUf', label: `UF: ${filters.xfUf}` });
  if (filters.xfPgto) chips.push({ k: 'xfPgto', label: `Pgto: ${filters.xfPgto}` });
  if (filters.xfTransp) chips.push({ k: 'xfTransp', label: `Transp: ${filters.xfTransp}` });
  if (filters.xfMarca) chips.push({ k: 'xfMarca', label: `Marca: ${filters.xfMarca}` });
  if (filters.xfCategoria) chips.push({ k: 'xfCategoria', label: `Cat: ${filters.xfCategoria}` });
  if (filters.xfSubcat) chips.push({ k: 'xfSubcat', label: `Sub: ${filters.xfSubcat}` });
  if (filters.xfSeo) chips.push({ k: 'xfSeo', label: `Produto: ${filters.xfSeo.length > 36 ? filters.xfSeo.slice(0, 36) + '…' : filters.xfSeo}` });
  if (filters.anoMes && filters.anoMes.length) chips.push({ k: 'anoMes', label: `Ano-Mês: ${filters.anoMes.length === 1 ? filters.anoMes[0] : filters.anoMes.length + ' sel'}` });
  if (!chips.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Filtros ativos:</span>
      {chips.map((c) => (
        <button key={c.k} onClick={() => setF({ [c.k]: c.k === 'anoMes' ? [] : null })}
                title={c.label}
                style={{
                  background: 'rgba(34,211,238,0.12)', border: '1px solid var(--cyan-dim)',
                  color: 'var(--cyan-2)', borderRadius: 999, padding: '4px 10px', fontSize: 11,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  maxWidth: 280, overflow: 'hidden',
                }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>×</span>
        </button>
      ))}
      <button onClick={() => setF({ xfUf: null, xfPgto: null, xfTransp: null, xfMarca: null, xfCategoria: null, xfSubcat: null, xfSeo: null, anoMes: [] })}
              style={{ background: 'transparent', border: 'none', color: 'var(--mute)', fontSize: 11, cursor: 'pointer' }}>
        limpar todos
      </button>
    </div>
  );
};

// ===========================================================================
// KPIs (1 query agrega tudo)
// ===========================================================================

const KpiBlock = ({ where }) => {
  const sql = React.useMemo(() => `
    WITH base AS (
      SELECT * FROM vendas WHERE ${where}
    ),
    diasut AS (
      SELECT COUNT(DISTINCT CAST(data_pedido AS DATE)) AS d
      FROM base WHERE dayofweek(data_pedido) BETWEEN 1 AND 5
    )
    SELECT
      COALESCE(SUM(valor_rateado), 0)::DOUBLE AS valor_bruto,
      COALESCE(SUM(preco_custo * quantidade), 0)::DOUBLE AS cmv,
      COUNT(DISTINCT numero)::INT AS n_vendas,
      (SELECT d FROM diasut) AS dias_uteis,
      COALESCE(SUM(CASE WHEN dayofweek(data_pedido) BETWEEN 1 AND 5 THEN valor_rateado ELSE 0 END), 0)::DOUBLE AS bruto_util
    FROM base
  `, [where]);
  const { data, loading, error } = useDuckDBQuery(sql, [sql]);

  if (error) {
    return <div className="card" style={{ padding: 16, color: 'var(--red-2)' }}>Erro KPIs: {error}</div>;
  }
  const r = (data && data[0]) || { valor_bruto: 0, cmv: 0, n_vendas: 0, dias_uteis: 0, bruto_util: 0 };
  const valor_bruto = r.valor_bruto || 0;
  const cmv = r.cmv || 0;
  const cfv = valor_bruto * CFV_PCT_ESTIMADO;
  const resultado_bruto = valor_bruto - cmv;
  const valor_liquido = valor_bruto - cfv - cmv;
  const n_vendas = r.n_vendas || 0;
  const ticket = n_vendas ? valor_bruto / n_vendas : 0;
  const venda_dia_util = r.dias_uteis ? (r.bruto_util || 0) / r.dias_uteis : 0;
  const margem_bruta_pct = valor_bruto ? resultado_bruto / valor_bruto : 0;
  const margem_liq_pct = valor_bruto ? valor_liquido / valor_bruto : 0;

  const sk = (txt) => (
    <span style={{ opacity: loading ? 0.45 : 1, transition: 'opacity 220ms' }}>{txt}</span>
  );

  return (
    <>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 14 }}>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Valor Bruto</div>
          <div className="kpi-value"><span className="currency">R$</span>{sk(_fmtBRLk(valor_bruto).replace('R$ ', ''))}</div>
          <div className="kpi-hint">Σ valor_rateado · {_fmtNum(n_vendas)} pedidos</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Resultado Bruto</div>
          <div className="kpi-value"><span className="currency">R$</span>{sk(_fmtBRLk(resultado_bruto).replace('R$ ', ''))}</div>
          <div className="kpi-hint">bruto − CMV</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">CMV</div>
          <div className="kpi-value"><span className="currency">R$</span>{sk(_fmtBRLk(cmv).replace('R$ ', ''))}</div>
          <div className="kpi-hint">preco_custo × qtd · est</div>
        </div>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Valor Líquido</div>
          <div className="kpi-value"><span className="currency">R$</span>{sk(_fmtBRLk(valor_liquido).replace('R$ ', ''))}</div>
          <div className="kpi-hint">bruto − CFV − CMV</div>
        </div>
      </div>

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card kpi-mini">
          <div className="kpi-label">Total Vendas</div>
          <div className="kpi-value">{sk(_fmtNum(n_vendas))}</div>
          <div className="kpi-hint">{r.dias_uteis || 0} dias úteis</div>
        </div>
        <div className="card kpi-mini">
          <div className="kpi-label">Venda/dia útil</div>
          <div className="kpi-value">{sk(_fmtBRLk(venda_dia_util))}</div>
          <div className="kpi-hint">bruto útil ÷ dias</div>
        </div>
        <div className="card kpi-mini">
          <div className="kpi-label">Ticket Médio</div>
          <div className="kpi-value">{sk(_fmtBRL(ticket))}</div>
          <div className="kpi-hint">bruto ÷ pedidos</div>
        </div>
        <div className="card kpi-mini">
          <div className="kpi-label">Margem Bruta %</div>
          <div className="kpi-value">{sk(_fmtPct(margem_bruta_pct))}</div>
          <div className="kpi-hint">1 − CMV/Vendas · est</div>
        </div>
        <div className="card kpi-mini">
          <div className="kpi-label">CFV %</div>
          <div className="kpi-value">{sk(_fmtPct(CFV_PCT_ESTIMADO))}</div>
          <div className="kpi-hint">placeholder · est</div>
        </div>
        <div className="card kpi-mini">
          <div className="kpi-label">Margem Líquida %</div>
          <div className="kpi-value">{sk(_fmtPct(margem_liq_pct))}</div>
          <div className="kpi-hint">líquido ÷ bruto</div>
        </div>
      </div>
    </>
  );
};

// ===========================================================================
// Charts linha 1 (temporal)
// ===========================================================================

const ChartsTemporais = ({ where, filters, setF }) => {
  // Detecta se filtros temporais estão restringindo a um mês específico
  // (todos anoMes selecionados são do mesmo MM)
  const monthFilter = (() => {
    if (!filters.anoMes || !filters.anoMes.length) return null;
    const meses = new Set(filters.anoMes.map((am) => am.slice(5, 7)));
    return meses.size === 1 ? [...meses][0] : null;
  })();
  // 'where' SEM filtro temporal (mantém marca/cat/etc) — pra Anual/N-vendas ignorarem ano-mês.
  // Removemos as cláusulas de strftime/EXTRACT YEAR/MONTH/dayofweek deixando o resto.
  const whereSemTempo = (where || '')
    .split(' AND ')
    .filter((c) => !/strftime\(data_pedido, '%Y-%m'\)/.test(c)
                && !/EXTRACT\(YEAR FROM data_pedido\)/.test(c)
                && !/EXTRACT\(MONTH FROM data_pedido\)/.test(c)
                && !/dayofweek\(data_pedido\)/.test(c))
    .join(' AND ') || '1=1';
  const sql = React.useMemo(() => {
    // Se há monthFilter, Anual = comparativo same-month-other-years
    const anualQuery = monthFilter
      ? `SELECT EXTRACT(YEAR FROM data_pedido)::INT AS y, SUM(valor_rateado)::DOUBLE AS v
         FROM base WHERE EXTRACT(MONTH FROM data_pedido) = ${parseInt(monthFilter, 10)}
         GROUP BY 1 ORDER BY 1`
      : `SELECT EXTRACT(YEAR FROM data_pedido)::INT AS y, SUM(valor_rateado)::DOUBLE AS v
         FROM base GROUP BY 1 ORDER BY 1`;
    return `
    WITH base AS (SELECT * FROM vendas WHERE ${whereSemTempo})
    SELECT
      (SELECT json_group_array(json_object('y', y, 'v', v))
        FROM (${anualQuery}) t) AS anual,
      (SELECT json_group_array(json_object('d', d, 'v', v))
        FROM (
          SELECT strftime(data_pedido, '%d/%m') AS d, SUM(valor_rateado)::DOUBLE AS v, CAST(data_pedido AS DATE) AS dd
          FROM (SELECT * FROM vendas WHERE ${where}) GROUP BY 1, 3 ORDER BY 3 DESC LIMIT 60
        ) t) AS diaria,
      -- mensal: sempre últimos 18m, sem filtro temporal (so com cross-filter de marca/cat/etc)
      (SELECT json_group_array(json_object('am', am, 'n', n, 'v', v))
        FROM (
          SELECT strftime(data_pedido, '%Y-%m') AS am,
                 COUNT(DISTINCT numero)::INT AS n,
                 SUM(valor_rateado)::DOUBLE AS v
          FROM base GROUP BY 1 ORDER BY 1 DESC LIMIT 18
        ) t) AS mensal
  `;
  }, [where, whereSemTempo, monthFilter]);
  const { data, loading, error } = useDuckDBQuery(sql, [sql]);
  if (error) return <div className="card" style={{ color: 'var(--red-2)' }}>Erro charts temporais: {error}</div>;

  const row = (data && data[0]) || {};
  const anual = JSON.parse(row.anual || '[]');
  let diaria = JSON.parse(row.diaria || '[]');
  let mensal = JSON.parse(row.mensal || '[]');
  diaria = diaria.slice().reverse();
  mensal = mensal.slice().reverse();
  // Label do anual: se monthFilter, mostra "Mar 2024", "Mar 2025"; senão só ano
  const MES_PT = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const anualLabels = anual.map((x) => monthFilter
    ? `${MES_PT[parseInt(monthFilter, 10)]}/${String(x.y).slice(-2)}`
    : String(x.y));
  // mês mais recente do filtro (pra destacar no n-vendas)
  const activeAnoMesIdx = (() => {
    if (!filters.anoMes || !filters.anoMes.length) return null;
    // pega o ultimo mes selecionado mais recente
    const latest = [...filters.anoMes].sort().reverse()[0];
    return mensal.findIndex((x) => x.am === latest);
  })();

  // Click handlers reativos
  const onClickAno = async (i, v, lab) => {
    const ano = String(lab);
    // Garante que temos a lista de YYYY-MM (se não, carrega on-demand).
    let amAll = window.__astroAmAll;
    if (!amAll || !amAll.length) {
      try {
        const rows = await _runQuery(`SELECT DISTINCT strftime(data_pedido, '%Y-%m') AS am FROM vendas WHERE data_pedido IS NOT NULL`);
        amAll = rows.map((r) => r.am).sort();
        window.__astroAmAll = amAll;
      } catch (e) { amAll = []; }
    }
    const matched = amAll.filter((am) => am.startsWith(ano));
    setF((prev) => {
      const allSet = prev.anoMes && prev.anoMes.length && matched.every((am) => prev.anoMes.includes(am)) && prev.anoMes.length === matched.length;
      return { anoMes: allSet ? [] : matched };
    });
  };
  const onClickMes = (i, v, lab) => {
    const am = mensal[i] && mensal[i].am;
    if (!am) return;
    setF((prev) => ({ anoMes: prev.anoMes.includes(am) ? prev.anoMes.filter((x) => x !== am) : [...prev.anoMes, am] }));
  };

  // marca ano ativo (todos os ano-mes filtrados pertencem ao mesmo ano)
  const activeAnoIdx = (() => {
    if (!filters.anoMes || !filters.anoMes.length) return null;
    const anos = new Set(filters.anoMes.map((am) => am.slice(0, 4)));
    if (anos.size !== 1) return null;
    const ano = [...anos][0];
    return anual.findIndex((x) => String(x.y) === ano);
  })();

  return (
    <>
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Evolução da Venda Bruta {loading && <span style={{ fontSize: 11, color: 'var(--mute)', fontWeight: 400 }}>· atualizando…</span>}
      </h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">{monthFilter ? `Anual · ${MES_PT[parseInt(monthFilter, 10)]} ano-a-ano` : 'Anual (clique = filtrar ano)'}</h2></div>
          <AstroBarV values={anual.map((x) => x.v)} labels={anualLabels}
                      color="cyan" height={220} onBarClick={onClickAno}
                      activeIdx={activeAnoIdx >= 0 ? activeAnoIdx : null} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Diária · últ 60d</h2></div>
          <AstroLine values={diaria.map((x) => x.v)} labels={diaria.map((x) => x.d)}
                     color="var(--cyan)" height={220} fmt={_fmtBRLk} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Nº Vendas Mensal · 18m {activeAnoMesIdx != null && activeAnoMesIdx >= 0 && <span style={{ fontSize: 10, color: 'var(--cyan)', marginLeft: 6 }}>· filtro destacado</span>}</h2></div>
          <AstroLine values={mensal.map((x) => x.n)} labels={mensal.map((x) => x.am)}
                     color="var(--green)" height={220} fmt={(v) => _fmtNum(v) + ' vendas'}
                     activeIdx={activeAnoMesIdx >= 0 ? activeAnoMesIdx : null} />
        </div>
      </div>
    </>
  );
};

// ===========================================================================
// Charts linha 2 (perfil)
// ===========================================================================

const ChartsPerfil = ({ where, filters, setF }) => {
  const sql = React.useMemo(() => `
    WITH base AS (SELECT * FROM vendas WHERE ${where})
    SELECT
      (SELECT json_group_array(json_object('tipo', tipo, 'v', v))
        FROM (
          SELECT CASE cliente_tipo_pessoa WHEN 'F' THEN 'Pessoa Física' WHEN 'J' THEN 'Pessoa Jurídica' ELSE 'Outros' END AS tipo,
                 SUM(valor_rateado)::DOUBLE AS v
          FROM base GROUP BY 1 ORDER BY v DESC
        ) t) AS donut,
      (SELECT json_group_array(json_object('am', am, 'v', v))
        FROM (
          SELECT strftime(data_pedido, '%Y-%m') AS am, SUM(valor_rateado)::DOUBLE AS v
          FROM base GROUP BY 1 ORDER BY 1 DESC LIMIT 18
        ) t) AS mensal,
      (SELECT json_group_array(json_object('d', d, 'ticket', ticket))
        FROM (
          SELECT strftime(data_pedido, '%d/%m') AS d,
                 (SUM(valor_rateado) / NULLIF(COUNT(DISTINCT numero), 0))::DOUBLE AS ticket,
                 CAST(data_pedido AS DATE) AS dd
          FROM base GROUP BY 1, 3 ORDER BY 3 DESC LIMIT 60
        ) t) AS ticket_diario
  `, [where]);
  const { data, loading, error } = useDuckDBQuery(sql, [sql]);
  if (error) return <div className="card" style={{ color: 'var(--red-2)' }}>Erro charts perfil: {error}</div>;

  const row = (data && data[0]) || {};
  const donut = JSON.parse(row.donut || '[]');
  let mensal = JSON.parse(row.mensal || '[]').slice().reverse();
  let tk = JSON.parse(row.ticket_diario || '[]').slice().reverse();

  const onDonut = (tipo) => {
    const map = { 'Pessoa Física': 'F', 'Pessoa Jurídica': 'J' };
    const v = map[tipo];
    if (!v) return;
    setF((prev) => ({ pessoa: prev.pessoa === v ? 'all' : v }));
  };
  const onClickMesV = (i) => {
    const am = mensal[i] && mensal[i].am;
    if (!am) return;
    setF((prev) => ({ anoMes: prev.anoMes.includes(am) ? prev.anoMes.filter((x) => x !== am) : [...prev.anoMes, am] }));
  };

  const activeDonutLabel = filters.pessoa === 'F' ? 'Pessoa Física' : (filters.pessoa === 'J' ? 'Pessoa Jurídica' : null);
  const activeMesIdx = mensal.findIndex((m) => filters.anoMes.includes(m.am));

  return (
    <>
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Perfil de Vendas {loading && <span style={{ fontSize: 11, color: 'var(--mute)', fontWeight: 400 }}>· atualizando…</span>}
      </h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">PF vs PJ (clique = filtrar)</h2></div>
          <AstroDonut segments={donut.map((d) => ({ tipo: d.tipo, v: d.v }))} size={200}
                      onSliceClick={onDonut} activeLabel={activeDonutLabel} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Mensal · 18m (clique = filtrar)</h2></div>
          <AstroBarV values={mensal.map((x) => x.v)} labels={mensal.map((x) => x.am.slice(2))}
                      color="violet" height={220}
                      onBarClick={onClickMesV} activeIdx={activeMesIdx >= 0 ? activeMesIdx : null} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Ticket Diário · 60d</h2></div>
          <AstroLine values={tk.map((x) => x.ticket || 0)} color="var(--amber)" height={220} />
        </div>
      </div>
    </>
  );
};

// ===========================================================================
// Hierarquia drill-down (queries lazy por nó expandido)
// ===========================================================================

const HierarchyRow = ({ levels, depth, parentPath, where, topN, filters, setF }) => {
  // Cada componente faz sua própria query no nível atual + filtros parent.
  const col = levels[depth];
  const extra = parentPath.map((p) => `${p.col} = '${_sqlEsc(p.val)}'`).join(' AND ');
  const fullWhere = extra ? `(${where}) AND ${extra}` : where;
  const sql = React.useMemo(() => `
    WITH base AS (
      SELECT ${col} AS k,
             SUM(valor_rateado)::DOUBLE AS venda,
             SUM(preco_custo * quantidade)::DOUBLE AS cmv,
             COUNT(DISTINCT numero)::INT AS n
      FROM vendas WHERE ${fullWhere} AND ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY 1
    ),
    tot AS (SELECT SUM(venda) AS t FROM base)
    SELECT k, venda, cmv, n,
           (venda - cmv) AS resultado,
           CASE WHEN venda > 0 THEN (venda - cmv)/venda ELSE 0 END AS margem,
           CASE WHEN (SELECT t FROM tot) > 0 THEN venda/(SELECT t FROM tot) ELSE 0 END AS pct
    FROM base ORDER BY venda DESC LIMIT ${topN}
  `, [fullWhere, col, topN]);
  const { data, loading, error } = useDuckDBQuery(sql, [sql]);

  if (error) return <div style={{ padding: 8, fontSize: 11, color: 'var(--red-2)' }}>err: {error}</div>;
  if (loading && !data) return <div style={{ padding: 8, fontSize: 11, color: 'var(--mute)' }}>carregando...</div>;
  if (!data || !data.length) return <div style={{ padding: 8, fontSize: 11, color: 'var(--mute)' }}>sem dados</div>;

  const hasChildren = depth < levels.length - 1;
  return (
    <>
      {data.map((r) => (
        <HierarchyNode
          key={`${depth}-${r.k}`}
          row={r}
          col={col}
          depth={depth}
          hasChildren={hasChildren}
          levels={levels}
          parentPath={parentPath}
          where={where}
          topN={topN}
          filters={filters}
          setF={setF}
        />
      ))}
    </>
  );
};

const HierarchyNode = ({ row, col, depth, hasChildren, levels, parentPath, where, topN, filters, setF }) => {
  const [open, setOpen] = React.useState(false);
  const marg = row.margem || 0;
  const margColor = marg >= 0.3 ? 'var(--green-2)' : (marg >= 0 ? 'var(--text-2)' : 'var(--red-2)');
  const xfKey = COL_TO_XF[col];
  const activeXf = xfKey && filters && filters[xfKey] === row.k;

  const toggleXf = (e) => {
    e.stopPropagation();
    if (!xfKey || !setF) return;
    setF((prev) => ({ [xfKey]: prev[xfKey] === row.k ? null : row.k }));
  };
  const toggleOpen = () => { if (hasChildren) setOpen((v) => !v); };

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 110px 70px 110px 70px 64px',
          gap: 10, alignItems: 'center',
          padding: '6px 4px',
          paddingLeft: 6 + depth * 18,
          fontSize: 12,
          background: activeXf ? 'rgba(34,211,238,0.08)' : (open ? 'var(--surface-2)' : 'transparent'),
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          borderLeft: activeXf ? '2px solid var(--cyan)' : '2px solid transparent',
          color: depth === 0 ? 'var(--text)' : 'var(--text-2)',
          fontWeight: depth === 0 ? 600 : 400,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
          {hasChildren ? (
            <span
              onClick={toggleOpen}
              title="expandir"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16, color: 'var(--mute)', fontSize: 10,
                transform: open ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 160ms',
                cursor: 'pointer', borderRadius: 3,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >▶</span>
          ) : <span style={{ width: 16 }} />}
          <span
            onClick={toggleXf}
            title={`${row.k} · clique p/ filtrar`}
            style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: xfKey ? 'pointer' : 'default',
              color: activeXf ? 'var(--cyan-2)' : 'inherit',
              padding: '2px 4px', borderRadius: 3,
              flex: 1,
            }}
            onMouseEnter={(e) => { if (xfKey) e.currentTarget.style.background = 'rgba(34,211,238,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >{row.k}</span>
        </span>
        <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(row.venda)}</span>
        <span style={{ textAlign: 'right', color: 'var(--mute)' }}>{_fmtPct(row.pct)}</span>
        <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(row.resultado)}</span>
        <span style={{ textAlign: 'right', color: margColor, fontFamily: 'var(--font-mono)' }}>{_fmtPct(row.margem)}</span>
        <span style={{ textAlign: 'right', color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{_fmtNum(row.n)}</span>
      </div>
      {open && hasChildren && (
        <HierarchyRow
          levels={levels}
          depth={depth + 1}
          parentPath={[...parentPath, { col, val: row.k }]}
          where={where}
          topN={topN}
          filters={filters}
          setF={setF}
        />
      )}
    </>
  );
};

const HierarchyTable = ({ title, levels, where, topN = 15, filters, setF }) => {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="card-title-row" style={{ marginBottom: 10 }}>
        <h2 className="card-title">{title}</h2>
        <span style={{ fontSize: 10, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>top {topN} · ▶ expande · nome filtra</span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 110px 70px 110px 70px 64px',
        gap: 10, fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.4,
        padding: '6px 4px', borderBottom: '1px solid var(--border)', marginBottom: 4,
      }}>
        <span>{levels[0].replace(/_/g, ' ')}</span>
        <span style={{ textAlign: 'right' }}>Venda</span>
        <span style={{ textAlign: 'right' }}>%</span>
        <span style={{ textAlign: 'right' }}>Result.</span>
        <span style={{ textAlign: 'right' }}>Margem</span>
        <span style={{ textAlign: 'right' }}>N°</span>
      </div>
      <div style={{ maxHeight: 540, overflow: 'auto' }}>
        <HierarchyRow levels={levels} depth={0} parentPath={[]} where={where} topN={topN} filters={filters} setF={setF} />
      </div>
    </div>
  );
};

// ===========================================================================
// Top 30 SEO flat (sortable + busca)
// ===========================================================================

const TopSeoFlat = ({ where, filters, setF }) => {
  const [sortKey, setSortKey] = React.useState('venda');
  const [sortDir, setSortDir] = React.useState('desc');
  const [q, setQ] = React.useState('');
  const activeSeo = filters && filters.xfSeo;
  const toggleSeo = (produto) => {
    if (!setF) return;
    setF((prev) => ({ xfSeo: prev.xfSeo === produto ? null : produto }));
  };
  const sql = React.useMemo(() => `
    SELECT seo_title AS produto,
           SUM(valor_rateado)::DOUBLE AS venda,
           SUM(preco_custo * quantidade)::DOUBLE AS cmv,
           COUNT(DISTINCT numero)::INT AS n,
           (SUM(valor_rateado) - SUM(preco_custo * quantidade))::DOUBLE AS resultado,
           CASE WHEN SUM(valor_rateado) > 0
                THEN (SUM(valor_rateado) - SUM(preco_custo * quantidade)) / SUM(valor_rateado)
                ELSE 0 END AS margem
    FROM vendas
    WHERE ${where} AND seo_title IS NOT NULL AND seo_title <> ''
    GROUP BY 1
    ORDER BY venda DESC
    LIMIT 200
  `, [where]);
  const { data, loading, error } = useDuckDBQuery(sql, [sql]);

  const rows = React.useMemo(() => {
    if (!data) return [];
    const lo = q.trim().toLowerCase();
    let r = lo ? data.filter((x) => String(x.produto).toLowerCase().includes(lo)) : data;
    r = r.slice().sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = (typeof av === 'string') ? av.localeCompare(bv) : (av - bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return r.slice(0, 30);
  }, [data, q, sortKey, sortDir]);

  const setSort = (k) => {
    if (sortKey === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };
  const Arrow = ({ k }) => sortKey === k ? <span style={{ fontSize: 9, color: 'var(--cyan)' }}>{sortDir === 'asc' ? '▲' : '▼'}</span> : null;

  return (
    <div className="card" style={{ padding: 14, marginBottom: 22 }}>
      <div className="card-title-row" style={{ marginBottom: 10 }}>
        <h2 className="card-title">Top 30 Produtos (SEO title)</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar produto..."
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12, width: 220 }} />
      </div>
      {error && <div style={{ color: 'var(--red-2)', fontSize: 12 }}>Erro: {error}</div>}
      {loading && !data && <div style={{ color: 'var(--mute)', fontSize: 12, padding: 12 }}>carregando...</div>}
      {data && (
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th onClick={() => setSort('produto')} style={{ cursor: 'pointer' }}>Produto <Arrow k="produto" /></th>
              <th onClick={() => setSort('venda')} style={{ textAlign: 'right', cursor: 'pointer' }}>Venda <Arrow k="venda" /></th>
              <th onClick={() => setSort('resultado')} style={{ textAlign: 'right', cursor: 'pointer' }}>Result. <Arrow k="resultado" /></th>
              <th onClick={() => setSort('margem')} style={{ textAlign: 'right', cursor: 'pointer' }}>Margem <Arrow k="margem" /></th>
              <th onClick={() => setSort('n')} style={{ textAlign: 'right', cursor: 'pointer' }}>N° <Arrow k="n" /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const active = activeSeo === r.produto;
              return (
                <tr key={i}
                    onClick={() => toggleSeo(r.produto)}
                    style={{
                      cursor: 'pointer',
                      background: active ? 'rgba(34,211,238,0.10)' : 'transparent',
                      borderLeft: active ? '2px solid var(--cyan)' : '2px solid transparent',
                    }}
                    title={active ? 'remover filtro' : `filtrar por ${r.produto}`}>
                  <td style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? 'var(--cyan-2)' : 'inherit' }} title={r.produto}>{r.produto}</td>
                  <td className="num">{_fmtBRLk(r.venda)}</td>
                  <td className="num">{_fmtBRLk(r.resultado)}</td>
                  <td className="num" style={{ color: r.margem >= 0.3 ? 'var(--green-2)' : (r.margem >= 0 ? 'var(--text-2)' : 'var(--red-2)') }}>{_fmtPct(r.margem)}</td>
                  <td className="num" style={{ color: 'var(--mute)' }}>{_fmtNum(r.n)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ===========================================================================
// Bottom Bars (3 colunas com cross-filter)
// ===========================================================================

const BottomBars = ({ where, filters, setF }) => {
  const sql = React.useMemo(() => `
    WITH base AS (SELECT * FROM vendas WHERE ${where})
    SELECT
      (SELECT json_group_array(json_object('uf', uf, 'v', v))
        FROM (SELECT cliente_uf AS uf, SUM(valor_rateado)::DOUBLE AS v
              FROM base WHERE cliente_uf IS NOT NULL AND cliente_uf <> ''
              GROUP BY 1 ORDER BY v DESC LIMIT 15) t) AS uf,
      (SELECT json_group_array(json_object('p', p, 'v', v))
        FROM (SELECT forma_pagamento AS p, SUM(valor_rateado)::DOUBLE AS v
              FROM base WHERE forma_pagamento IS NOT NULL AND forma_pagamento <> ''
              GROUP BY 1 ORDER BY v DESC LIMIT 12) t) AS pgto,
      (SELECT json_group_array(json_object('t', t, 'v', v))
        FROM (SELECT nome_transportador AS t, SUM(valor_rateado)::DOUBLE AS v
              FROM base WHERE nome_transportador IS NOT NULL AND nome_transportador <> ''
              GROUP BY 1 ORDER BY v DESC LIMIT 12) t) AS transp
  `, [where]);
  const { data, loading, error } = useDuckDBQuery(sql, [sql]);
  if (error) return <div className="card" style={{ color: 'var(--red-2)' }}>Erro bottom bars: {error}</div>;

  const row = (data && data[0]) || {};
  const ufs = JSON.parse(row.uf || '[]');
  const pgs = JSON.parse(row.pgto || '[]');
  const tps = JSON.parse(row.transp || '[]');

  const setXf = (key, val) => {
    setF((prev) => ({ [key]: prev[key] === val ? null : val }));
  };

  return (
    <>
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Geografia, Pagamento e Logística {loading && <span style={{ fontSize: 11, color: 'var(--mute)', fontWeight: 400 }}>· atualizando…</span>}
      </h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Top 15 UF</h2></div>
          <AstroBarH items={ufs.map((x) => ({ label: x.uf, v: x.v }))} color="cyan"
                      onClick={(lab) => setXf('xfUf', lab)} activeLabel={filters.xfUf} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Forma de Pagamento</h2></div>
          <AstroBarH items={pgs.map((x) => ({ label: x.p, v: x.v }))} color="green"
                      onClick={(lab) => setXf('xfPgto', lab)} activeLabel={filters.xfPgto} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Top Transportadoras</h2></div>
          <AstroBarH items={tps.map((x) => ({ label: x.t, v: x.v }))} color="violet"
                      onClick={(lab) => setXf('xfTransp', lab)} activeLabel={filters.xfTransp} />
        </div>
      </div>
    </>
  );
};

// ===========================================================================
// Periodo/contagem em linha (info bar)
// ===========================================================================

const PeriodInfo = ({ where }) => {
  const sql = React.useMemo(() => `
    SELECT MIN(data_pedido)::DATE AS dmin, MAX(data_pedido)::DATE AS dmax, COUNT(*)::INT AS n
    FROM vendas WHERE ${where}
  `, [where]);
  const { data } = useDuckDBQuery(sql, [sql]);
  const r = (data && data[0]) || {};
  if (!r.n) return null;
  const fmt = (d) => {
    if (!d) return '—';
    const dd = new Date(d);
    if (isNaN(dd)) return String(d);
    return dd.toLocaleDateString('pt-BR');
  };
  return (
    <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 12 }}>
      {_fmtNum(r.n)} linhas · {fmt(r.dmin)} a {fmt(r.dmax)}
    </div>
  );
};

// ===========================================================================
// PageAstroDash (V3 — DuckDB-WASM reativo)
// ===========================================================================

const PageAstroDash = () => {
  const [filters, setFilters] = React.useState(() => ({ ...DEFAULT_FILTERS_ASTRO }));
  const setF = React.useCallback((patch) => {
    setFilters((prev) => {
      const np = typeof patch === 'function' ? patch(prev) : patch;
      return { ...prev, ...np };
    });
  }, []);
  const status = useDuckDBStatus();
  const globalPeriod = useGlobalPeriod();
  const where = React.useMemo(() => buildWhere(filters, globalPeriod), [filters, globalPeriod]);

  // Cache "todos os ano_mes" pra click no chart Anual saber quais YYYY-MM existem.
  React.useEffect(() => {
    if (!window.__duckdbReady || window.__astroAmAll) return;
    _runQuery(`SELECT DISTINCT strftime(data_pedido, '%Y-%m') AS am FROM vendas WHERE data_pedido IS NOT NULL`)
      .then((rows) => { window.__astroAmAll = rows.map((r) => r.am).sort(); })
      .catch(() => {});
  }, [status.ready]);

  if (status.error) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="card" style={{ padding: 24, color: 'var(--red-2)' }}>
          <h3 style={{ marginTop: 0 }}>Erro ao carregar DuckDB-WASM</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{status.error}</pre>
          <p style={{ fontSize: 12, color: 'var(--mute)' }}>
            Verifique se <code>data/vendas_dash.parquet</code> existe e o CDN do DuckDB-WASM está acessível.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Dashboard</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: status.ready ? 'var(--green-2)' : 'var(--mute)' }}>
          {status.ready ? `DuckDB ready${status.bootMs ? ` (${status.bootMs}ms)` : ''}` : 'Carregando 3.8MB parquet...'}
        </span>
      </div>

      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>Dashboard · Astro Distribuidora</h1>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--mute)' }}>
        Réplica reativa do BI Power BI. Filtros + clique em barras cross-filtra tudo. Drill-down completo em hierarquia produto.
      </p>

      <FilterBarAstro filters={filters} setF={setF} />
      <ActiveChips filters={filters} setF={setF} />

      {!status.ready ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--mute)' }}>
          Inicializando DuckDB-WASM (download e carregamento do parquet)…
        </div>
      ) : (
        <>
          <PeriodInfo where={where} />

          <KpiBlock where={where} />

          <ChartsTemporais where={where} filters={filters} setF={setF} />
          <ChartsPerfil where={where} filters={filters} setF={setF} />

          <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>Hierarquia de Produtos (drill-down)</h3>
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 22 }}>
            <HierarchyTable title="Marca → Categoria → Sub → Produto"
                              levels={['marca', 'categoria_mae', 'sub_categoria', 'seo_title']}
                              where={where} topN={15} filters={filters} setF={setF} />
            <HierarchyTable title="Categoria → Sub → Produto"
                              levels={['categoria_mae', 'sub_categoria', 'seo_title']}
                              where={where} topN={15} filters={filters} setF={setF} />
          </div>

          <TopSeoFlat where={where} filters={filters} setF={setF} />

          <BottomBars where={where} filters={filters} setF={setF} />

          <div style={{ marginTop: 24, fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            CMV via <code>preco_custo × quantidade</code> (aproxima Custo Unitário Médio do PBI).
            CFV usa 6,16% fixo como estimativa <span style={{ background: 'rgba(245,158,11,0.18)', color: '#f59e0b', padding: '1px 6px', borderRadius: 3 }}>est</span> até ter taxas reais por canal.
            Queries DuckDB-WASM in-browser sobre <code>data/vendas_dash.parquet</code>.
          </div>
        </>
      )}
    </div>
  );
};

// ===========================================================================
// PagePlanoAcao (mantida intacta da V2)
// ===========================================================================

const PagePlanoAcao = () => {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);
  React.useEffect(() => {
    fetch('data/plano_acao.json').then(r => r.json()).then(setData).catch(e => setErr(String(e)));
  }, []);
  if (err) return <div className="page"><div className="empty">erro: {err}</div></div>;
  if (!data) return <div className="page"><div className="empty">carregando plano...</div></div>;
  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 18 }}><span>Astro BI</span> › <b>Plano de Ação</b></div>
      <p style={{ color: 'var(--text-2)', marginBottom: 20 }}>{data.resumo_executivo.titulo}</p>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {data.resumo_executivo.destaques.map((d, i) => (
          <div key={i} className="card kpi-mini">
            <div className="kpi-label">{d.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{d.valor}</div>
            <div className="kpi-hint">{d.fonte}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.acoes.map(a => (
          <div key={a.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)' }}>{a.id}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--surface-2)', borderRadius: 4, textTransform: 'uppercase', color: 'var(--text-2)' }}>{a.severidade}</span>
              <h2 style={{ margin: 0, fontSize: 15, color: 'var(--text)' }}>#{a.prioridade} · {a.titulo}</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}><b>{a.diagnostico.headline}</b></p>
            <p style={{ fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.5 }}>{a.diagnostico.detalhe}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// Registra no escopo do bundle
Object.assign(window, { PageAstroDash, PagePlanoAcao });
