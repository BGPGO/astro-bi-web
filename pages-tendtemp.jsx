/**
 * pages-tendtemp.jsx — Tendência Temporal (PBI tela 11).
 *
 * 3 line charts diários empilhados:
 *  1) R$ venda diária (cyan)
 *  2) N° vendas separadas em Recompra (green) + Novo (amber) — 2 linhas no mesmo chart
 *  3) Ticket médio diário (violet)
 *
 * Filtros locais: período (30d/60d/90d/180d). Dados em window.TENDTEMP_DATA
 * (gerado por scripts/build_tendtemp_data.py).
 *
 * KPIs no topo:
 *  - Total venda no período + variação % vs período anterior
 *  - Total vendas + variação %
 *  - Ticket médio + variação %
 *  - Melhor / pior dia em R$
 *
 * Tooltip em cada ponto (hover) mostra data + valor formatado.
 *
 * Não toca outras pages. Helpers globais reusados: _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct.
 */

// ===== Util: formato de data BR =====
const _fmtDiaBR = (s) => {
  if (!s) return '—';
  const [y, m, d] = String(s).split('-');
  return `${d}/${m}`;
};
const _fmtDiaBRLong = (s) => {
  if (!s) return '—';
  const [y, m, d] = String(s).split('-');
  return `${d}/${m}/${y}`;
};

// ===== TendTempChart: line chart SVG com até N séries + tooltip hover por dia =====
const TendTempChart = ({ rows, series, height = 220, fmtY = _fmtBRLk, ariaLabel }) => {
  // rows: [{dia, ...}] em ordem cronológica
  // series: [{ key, color, label }]
  const wrapRef = React.useRef(null);
  const [hover, setHover] = React.useState(null); // index hovered
  const [w, setW] = React.useState(720);

  React.useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cw = Math.max(280, e.contentRect.width);
        setW(cw);
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  if (!rows || !rows.length) {
    return <div className="empty" style={{ padding: 30, textAlign: 'center', color: 'var(--mute)' }}>sem dados</div>;
  }

  const H = height;
  const padL = 48, padR = 16, padT = 18, padB = 32;
  const innerW = Math.max(40, w - padL - padR);
  const innerH = H - padT - padB;

  // domínio Y: max(todas as séries), min = 0 (R$ e contagens são >= 0)
  let yMax = 0;
  for (const s of series) {
    for (const r of rows) {
      const v = Number(r[s.key]) || 0;
      if (v > yMax) yMax = v;
    }
  }
  yMax = yMax || 1;

  const N = rows.length;
  const xAt = (i) => padL + (N === 1 ? innerW / 2 : (i / (N - 1)) * innerW);
  const yAt = (v) => padT + innerH - (v / yMax) * innerH;

  // path por série
  const pathFor = (s) => {
    return rows.map((r, i) => {
      const v = Number(r[s.key]) || 0;
      const x = xAt(i);
      const y = yAt(v);
      return (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
    }).join(' ');
  };

  // ticks Y (4)
  const yTicks = 4;
  const yGrid = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = (yMax / yTicks) * i;
    yGrid.push({ v, y: yAt(v) });
  }

  // ticks X: mostra ~6 labels (data) distribuídas
  const xLabelEvery = Math.max(1, Math.floor(N / 6));
  const xLabels = rows.map((r, i) => i % xLabelEvery === 0 ? r.dia : null);

  // média (linha tracejada) — usa primeira série pra desenhar a média
  const avg = rows.reduce((s, r) => s + (Number(r[series[0].key]) || 0), 0) / N;
  const avgY = yAt(avg);

  // hover overlay
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = (px - padL) / innerW;
    const idx = Math.round(ratio * (N - 1));
    if (idx >= 0 && idx < N) setHover(idx);
    else setHover(null);
  };
  const onLeave = () => setHover(null);

  return (
    <div ref={wrapRef} style={{ width: '100%', position: 'relative' }} aria-label={ariaLabel}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} style={{ display: 'block', cursor: 'crosshair' }}
           onMouseMove={onMove} onMouseLeave={onLeave}>
        {/* grid Y */}
        {yGrid.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={padL - 6} y={g.y + 4} textAnchor="end"
                  style={{ fontSize: 9, fill: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace' }}>{fmtY(g.v)}</text>
          </g>
        ))}

        {/* linha de média (tracejada) */}
        <line x1={padL} y1={avgY} x2={w - padR} y2={avgY}
              stroke="rgba(203,213,225,0.35)" strokeWidth="1" strokeDasharray="4,3" />
        <text x={w - padR - 4} y={avgY - 4} textAnchor="end"
              style={{ fontSize: 9, fill: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace' }}>
          média {fmtY(avg)}
        </text>

        {/* linhas + pontos */}
        {series.map((s, si) => (
          <g key={s.key}>
            <path d={pathFor(s)} stroke={s.color} strokeWidth="2" fill="none" />
            {rows.map((r, i) => {
              const v = Number(r[s.key]) || 0;
              const cx = xAt(i), cy = yAt(v);
              const isHover = hover === i;
              return (
                <circle key={i} cx={cx} cy={cy} r={isHover ? 4 : 2.5}
                        fill={s.color} stroke="#0d1216" strokeWidth="1"
                        opacity={isHover || hover == null ? 1 : 0.6}>
                  <title>{`${_fmtDiaBRLong(r.dia)} · ${s.label}: ${fmtY(v)}`}</title>
                </circle>
              );
            })}
          </g>
        ))}

        {/* labels X */}
        {xLabels.map((lbl, i) => lbl ? (
          <text key={i} x={xAt(i)} y={H - 12} textAnchor="middle"
                style={{ fontSize: 10, fill: 'var(--mute)' }}>{_fmtDiaBR(lbl)}</text>
        ) : null)}

        {/* crosshair vertical no hover */}
        {hover != null && (
          <line x1={xAt(hover)} y1={padT} x2={xAt(hover)} y2={H - padB}
                stroke="rgba(34,211,238,0.4)" strokeWidth="1" strokeDasharray="2,3" />
        )}
      </svg>

      {/* tooltip absoluto */}
      {hover != null && (() => {
        const r = rows[hover];
        const cx = xAt(hover);
        const left = cx < w / 2 ? cx + 12 : cx - 200;
        return (
          <div style={{
            position: 'absolute', top: 6, left, width: 180,
            background: 'rgba(13,18,22,0.96)', border: '1px solid var(--border-2)', borderRadius: 6,
            padding: '8px 10px', fontSize: 11, color: 'var(--text)', pointerEvents: 'none',
            boxShadow: '0 6px 18px rgba(0,0,0,0.5)', zIndex: 5,
          }}>
            <div style={{ fontSize: 10, color: 'var(--mute)', marginBottom: 4 }}>{_fmtDiaBRLong(r.dia)}</div>
            {series.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ width: 8, height: 8, background: s.color, borderRadius: 2 }} />
                <span style={{ color: 'var(--text-2)', flex: 1 }}>{s.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtY(Number(r[s.key]) || 0)}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* legenda */}
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: 'var(--text-2)' }}>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2 }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ===== Variação delta visual (verde/vermelho) =====
const _DeltaPct = ({ v, invert = false }) => {
  if (v == null || !isFinite(v)) return <span style={{ color: 'var(--mute)' }}>—</span>;
  const pos = v >= 0;
  const good = invert ? !pos : pos;
  return (
    <span style={{
      color: good ? 'var(--green-2)' : 'var(--red-2)',
      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
    }}>
      {pos ? '▲' : '▼'} {_fmtPct(Math.abs(v))}
    </span>
  );
};

// ===========================================================================
// PageTendenciaTemporal
// ===========================================================================

const PageTendenciaTemporal = () => {
  const D = window.TENDTEMP_DATA;
  const [janela, setJanela] = React.useState(30); // 30/60/90/180

  if (!D) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          tendtemp-data.js não carregado. Rode: <code>python scripts/build_tendtemp_data.py</code>
        </div>
      </div>
    );
  }

  const serieFull = D.serie_diaria || [];
  const kpi = (D.kpis_periodo && D.kpis_periodo[String(janela)]) || null;

  // Recorta a série para o período selecionado
  const serie = React.useMemo(() => {
    if (!serieFull.length) return [];
    return serieFull.slice(-janela);
  }, [serieFull, janela]);

  const JANELAS = [
    { v: 30, label: '30 dias' },
    { v: 60, label: '60 dias' },
    { v: 90, label: '90 dias' },
    { v: 180, label: '180 dias' },
  ];

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Tendência Temporal</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)' }}>
          {D.meta && `${_fmtDiaBRLong(D.meta.dia_min)} → ${_fmtDiaBRLong(D.meta.dia_max)}`}
        </span>
      </div>

      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>Tendência Temporal</h1>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--mute)' }}>
        Evolução diária de vendas, recompradores vs novos clientes e ticket médio. Réplica da tela TENDENCIA TEMPORAL do PBI.
      </p>

      {/* Filtro de período */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(13,18,22,0.92)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 0', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Período</div>
          <div className="seg" style={{ display: 'flex' }}>
            {JANELAS.map((j) => (
              <button key={j.v}
                      type="button"
                      className={janela === j.v ? 'active' : ''}
                      onClick={() => setJanela(j.v)}
                      style={{ padding: '6px 14px', fontSize: 12 }}>
                {j.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--mute)' }}>
          {serie.length} dias plotados · ancorado no último dia do snapshot ({D.meta && _fmtDiaBRLong(D.meta.dia_max)})
        </div>
      </div>

      {/* KPIs do período */}
      {kpi && (
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 22 }}>
          <div className="card kpi-mini">
            <div className="kpi-label">Total Venda · {janela}d</div>
            <div className="kpi-value">{_fmtBRLk(kpi.total_venda)}</div>
            <div className="kpi-hint">vs anterior: <_DeltaPct v={kpi.var_pct_venda} /></div>
          </div>
          <div className="card kpi-mini">
            <div className="kpi-label">N° Vendas</div>
            <div className="kpi-value">{_fmtNum(kpi.total_vendas)}</div>
            <div className="kpi-hint">vs anterior: <_DeltaPct v={kpi.var_pct_vendas} /></div>
          </div>
          <div className="card kpi-mini">
            <div className="kpi-label">Ticket Médio</div>
            <div className="kpi-value">{_fmtBRL(kpi.ticket_medio)}</div>
            <div className="kpi-hint">vs anterior: <_DeltaPct v={kpi.var_pct_ticket} /></div>
          </div>
          <div className="card kpi-mini">
            <div className="kpi-label">Melhor Dia</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{_fmtBRLk(kpi.melhor_valor)}</div>
            <div className="kpi-hint" style={{ color: 'var(--green-2)' }}>{_fmtDiaBRLong(kpi.melhor_dia)}</div>
          </div>
          <div className="card kpi-mini">
            <div className="kpi-label">Pior Dia</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{_fmtBRLk(kpi.pior_valor)}</div>
            <div className="kpi-hint" style={{ color: 'var(--red-2)' }}>{_fmtDiaBRLong(kpi.pior_dia)}</div>
          </div>
        </div>
      )}

      {/* Mix recompra vs novo no período */}
      {kpi && (kpi.total_recompra + kpi.total_novo) > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 22 }}>
          <div className="card-title-row" style={{ marginBottom: 10 }}>
            <h2 className="card-title">Mix Recompra vs Novo no período</h2>
            <span style={{ fontSize: 10, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
              {_fmtNum(kpi.total_recompra)} recompras · {_fmtNum(kpi.total_novo)} novos
            </span>
          </div>
          {(() => {
            const tot = kpi.total_recompra + kpi.total_novo;
            const pctR = tot ? kpi.total_recompra / tot : 0;
            const pctN = tot ? kpi.total_novo / tot : 0;
            return (
              <div style={{ display: 'flex', width: '100%', height: 28, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pctR * 100}%`, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#0d1216', fontWeight: 700 }}>
                  Recompra {_fmtPct(pctR)}
                </div>
                <div style={{ width: `${pctN * 100}%`, background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#0d1216', fontWeight: 700 }}>
                  Novo {_fmtPct(pctN)}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Chart 1: R$ venda diária */}
      <div className="card" style={{ padding: 14, marginBottom: 18 }}>
        <div className="card-title-row" style={{ marginBottom: 10 }}>
          <h2 className="card-title">Evolução das vendas diárias</h2>
          <span style={{ fontSize: 10, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>R$ · hover p/ tooltip</span>
        </div>
        <TendTempChart rows={serie}
                       series={[{ key: 'valor', color: '#22d3ee', label: 'R$ venda' }]}
                       height={240} fmtY={_fmtBRLk}
                       ariaLabel="Vendas diárias em R$" />
      </div>

      {/* Chart 2: N° vendas por dia — Recompra (green) + Novo (amber) */}
      <div className="card" style={{ padding: 14, marginBottom: 18 }}>
        <div className="card-title-row" style={{ marginBottom: 10 }}>
          <h2 className="card-title">Evolução do número de vendas (Recompra × Novo)</h2>
          <span style={{ fontSize: 10, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>2 séries · hover p/ comparar</span>
        </div>
        <TendTempChart rows={serie}
                       series={[
                         { key: 'n_recompra', color: '#10b981', label: 'Recompra' },
                         { key: 'n_novo',     color: '#f59e0b', label: 'Novo' },
                       ]}
                       height={240} fmtY={(v) => _fmtNum(v)}
                       ariaLabel="Número de vendas por dia, separadas em recompra e novo" />
      </div>

      {/* Chart 3: Ticket médio diário */}
      <div className="card" style={{ padding: 14, marginBottom: 18 }}>
        <div className="card-title-row" style={{ marginBottom: 10 }}>
          <h2 className="card-title">Ticket médio diário</h2>
          <span style={{ fontSize: 10, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>R$ · valor médio por pedido</span>
        </div>
        <TendTempChart rows={serie}
                       series={[{ key: 'ticket_medio', color: '#a78bfa', label: 'Ticket médio' }]}
                       height={240} fmtY={_fmtBRL}
                       ariaLabel="Ticket médio diário em R$" />
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        Dados pré-computados em build-time (<code>scripts/build_tendtemp_data.py</code>).
        N° vendas conta pedidos distintos (<code>numero</code>), não linhas.
        Variação percentual compara o período selecionado contra o período de igual duração imediatamente anterior.
      </div>
    </div>
  );
};

// Registra no escopo do bundle
Object.assign(window, { PageTendenciaTemporal });
