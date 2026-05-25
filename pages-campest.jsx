/**
 * pages-campest.jsx — Tela 7 PBI Astro: Campanha x Estado x Marca
 *
 * Cruza Google Ads x Tiny. Mostra:
 *   - 4 KPIs (gasto, receita novos, ROAS medio, CAC)
 *   - Filtros (mes/marca - visual; filtra rankings + matriz)
 *   - Tabela rica por UF (13 colunas) com cores em ROAS
 *   - Tabela rica por Marca (13 colunas)
 *   - Heatmap matriz Marca x UF colorida por ROAS
 *   - Combo chart (bar gasto + linha ROAS) top 12 UFs
 *   - Combo chart (bar gasto + linha ROAS) top 12 marcas
 *   - 2 line charts multi-serie: ROAS mensal por marca / por UF
 *
 * Dados: window.CAMPEST_DATA (gerado por scripts/build_campest_data.py).
 * Helpers globais reutilizados de pages-astro.jsx: _fmtBRL, _fmtBRLk, _fmtPct, _fmtNum.
 * Registra PageCampanhaEstado em window pro build-jsx.cjs picar.
 */

const _ceFmtRoas = (v) => {
  if (v == null || !isFinite(v) || v === 0) return '—';
  return `${v.toFixed(2).replace('.', ',')}x`;
};
const _ceRoasColor = (v) => {
  if (v == null || !isFinite(v) || v === 0) return 'var(--mute)';
  if (v >= 3) return '#66bb6a';
  if (v >= 2) return '#a5d6a7';
  if (v >= 1) return '#fdd835';
  return '#ef5350';
};
const _ceRoasBg = (v) => {
  if (v == null || !isFinite(v) || v === 0) return 'transparent';
  if (v >= 5) return 'rgba(102,187,106,0.32)';
  if (v >= 3) return 'rgba(102,187,106,0.20)';
  if (v >= 1) return 'rgba(253,216,53,0.18)';
  return 'rgba(239,83,80,0.18)';
};
const _ceMonth = (am) => {
  if (!am || typeof am !== 'string' || am.length < 7) return am || '';
  const [y, m] = am.split('-');
  const NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const idx = parseInt(m, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx > 11) return am;
  return `${NAMES[idx]}/${y.slice(2)}`;
};

// ===== Combo Chart: barras (gasto) + linha (ROAS) =====
const ComboBarLine = ({ items, labelKey = 'label', barKey = 'gasto', lineKey = 'roas',
                       barFmt = _fmtBRLk, lineFmt = _ceFmtRoas, height = 280, barColor = '#22d3ee', lineColor = '#fdd835' }) => {
  if (!items || !items.length) return <div className="empty" style={{ padding: 20, color: 'var(--mute)' }}>sem dados</div>;
  const N = items.length;
  const W = Math.max(600, 70 * N + 80), H = height;
  const PL = 60, PR = 60, PT = 28, PB = 56;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const bars = items.map(i => i[barKey] || 0);
  const lines = items.map(i => i[lineKey] || 0);
  const barMax = Math.max(...bars, 1) * 1.05;
  const lineMax = Math.max(...lines, 1) * 1.10;
  const lineMin = Math.min(0, ...lines);
  const slot = innerW / N;
  const barW = Math.min(36, slot * 0.55);
  const X = (i) => PL + slot * (i + 0.5);
  const Yb = (v) => PT + innerH - (v / barMax) * innerH;
  const Yl = (v) => PT + innerH - ((v - lineMin) / (lineMax - lineMin)) * innerH;
  const path = items.map((it, i) => `${i === 0 ? 'M' : 'L'} ${X(i)} ${Yl(lines[i])}`).join(' ');

  // Eixo Y bar (esquerda) ticks
  const yTicks = 4;
  const yBarVals = Array.from({ length: yTicks + 1 }, (_, k) => (barMax * k) / yTicks);
  const yLineVals = Array.from({ length: yTicks + 1 }, (_, k) => lineMin + (lineMax - lineMin) * k / yTicks);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* grid horizontal (axes alinhados com bar) */}
        {yBarVals.map((v, k) => (
          <g key={`gy-${k}`}>
            <line x1={PL} y1={Yb(v)} x2={W - PR} y2={Yb(v)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PL - 8} y={Yb(v) + 3} textAnchor="end" fontSize="10" fill="#22d3ee" fontFamily="JetBrains Mono, monospace">{barFmt(v)}</text>
            <text x={W - PR + 8} y={Yl(yLineVals[k]) + 3} textAnchor="start" fontSize="10" fill="#fdd835" fontFamily="JetBrains Mono, monospace">{lineFmt(yLineVals[k])}</text>
          </g>
        ))}
        {/* barras */}
        {items.map((it, i) => {
          const v = bars[i];
          const y = Yb(v);
          return (
            <g key={`b-${i}`}>
              <rect x={X(i) - barW / 2} y={y} width={barW} height={Math.max(2, PT + innerH - y)}
                    fill={barColor} opacity="0.85" rx="3">
                <title>{`${it[labelKey]}: gasto ${barFmt(v)}`}</title>
              </rect>
              <text x={X(i)} y={y - 6} textAnchor="middle" fontSize="9.5" fill="#cbd5e1" fontFamily="JetBrains Mono, monospace">{barFmt(v)}</text>
              <text x={X(i)} y={H - 30} textAnchor="end" transform={`rotate(-35 ${X(i)} ${H - 30})`} fontSize="10.5" fill="#94a3b8">{it[labelKey]}</text>
            </g>
          );
        })}
        {/* line */}
        <path d={path} stroke={lineColor} strokeWidth="2.2" fill="none" />
        {items.map((it, i) => (
          <g key={`l-${i}`}>
            <circle cx={X(i)} cy={Yl(lines[i])} r="3.5" fill={lineColor} stroke="#1a1f2e" strokeWidth="1.5">
              <title>{`${it[labelKey]}: ROAS ${lineFmt(lines[i])}`}</title>
            </circle>
            <text x={X(i)} y={Yl(lines[i]) - 8} textAnchor="middle" fontSize="9.5" fill={lineColor} fontFamily="JetBrains Mono, monospace" fontWeight="700">{lineFmt(lines[i])}</text>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', fontSize: 11, marginTop: 4, color: 'var(--text-2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 10, background: barColor, opacity: 0.85, borderRadius: 2 }} /> Gasto Ads (R$)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: lineColor }} /> ROAS
        </span>
      </div>
    </div>
  );
};

// ===== Multi-line chart (ROAS mensal por marca / UF) =====
const _MULTI_COLORS = ['#22d3ee', '#fdd835', '#66bb6a', '#a78bfa', '#ef5350', '#10b981', '#f59e0b', '#ec4899'];

const CeMultiLine = ({ meses, series, height = 280, fmtY = (v) => v.toFixed(1) }) => {
  const keys = Object.keys(series || {});
  if (!meses || !meses.length || !keys.length) return <div className="empty" style={{ padding: 20, color: 'var(--mute)' }}>sem dados</div>;
  const W = Math.max(760, meses.length * 60 + 100), H = height;
  const PL = 50, PR = 110, PT = 22, PB = 40;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const allVals = keys.flatMap(k => series[k].map(p => p.roas || 0));
  const vMax = Math.max(...allVals, 1) * 1.10;
  const vMin = 0;
  const X = (i) => PL + (i / Math.max(1, meses.length - 1)) * innerW;
  const Y = (v) => PT + innerH - ((v - vMin) / (vMax - vMin)) * innerH;

  const yTicks = 5;
  const yVals = Array.from({ length: yTicks + 1 }, (_, k) => vMin + (vMax - vMin) * k / yTicks);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* grid */}
        {yVals.map((v, k) => (
          <g key={`gy-${k}`}>
            <line x1={PL} y1={Y(v)} x2={W - PR} y2={Y(v)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PL - 6} y={Y(v) + 3} textAnchor="end" fontSize="10" fill="var(--mute)" fontFamily="JetBrains Mono, monospace">{fmtY(v)}</text>
          </g>
        ))}
        {/* x-axis labels */}
        {meses.map((m, i) => {
          const skip = Math.ceil(meses.length / 12);
          if (i % skip !== 0 && i !== meses.length - 1) return null;
          return (
            <text key={`x-${i}`} x={X(i)} y={H - 18} textAnchor="middle" fontSize="10" fill="var(--mute)">{_ceMonth(m)}</text>
          );
        })}
        {/* lines */}
        {keys.map((k, idx) => {
          const color = _MULTI_COLORS[idx % _MULTI_COLORS.length];
          const pts = series[k];
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(i)} ${Y(p.roas || 0)}`).join(' ');
          return (
            <g key={`s-${k}`}>
              <path d={path} stroke={color} strokeWidth="1.8" fill="none" opacity="0.85" />
              {pts.map((p, i) => (
                <circle key={`pt-${k}-${i}`} cx={X(i)} cy={Y(p.roas || 0)} r="2.5" fill={color} opacity={p.roas > 0 ? 1 : 0}>
                  <title>{`${k} · ${_ceMonth(meses[i])}: ${(p.roas || 0).toFixed(2)}x · gasto ${_fmtBRL(p.spend || 0)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {/* legenda lateral */}
        {keys.map((k, idx) => {
          const color = _MULTI_COLORS[idx % _MULTI_COLORS.length];
          return (
            <g key={`lg-${k}`}>
              <rect x={W - PR + 10} y={PT + idx * 18 + 2} width="10" height="10" fill={color} rx="2" />
              <text x={W - PR + 26} y={PT + idx * 18 + 11} fontSize="11" fill="var(--text-2)">{k}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ===== Tabela rica: 13 colunas com sort =====
const RichTable = ({ rows, labelCol, labelKey, max = 28 }) => {
  const [sortKey, setSortKey] = React.useState('gasto');
  const [sortDir, setSortDir] = React.useState('desc');
  if (!rows || !rows.length) return <div className="empty" style={{ padding: 20, color: 'var(--mute)' }}>sem dados</div>;

  const sorted = React.useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'string') return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb);
      return sortDir === 'desc' ? (vb - va) : (va - vb);
    }).slice(0, max);
  }, [rows, sortKey, sortDir, max]);

  // Totalizadores (sobre TODAS as linhas, não só visíveis)
  const total = React.useMemo(() => {
    const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
    const gasto = sum('gasto');
    const valor_novos = sum('valor_novos');
    const n_novos = sum('n_novos');
    const valor_recompra = sum('valor_recompra');
    return {
      clicks: sum('clicks'),
      conversoes: sum('conversoes'),
      taxa_conv: sum('clicks') > 0 ? sum('conversoes') / sum('clicks') : 0,
      valor_novos,
      gasto,
      vendas_novas: sum('vendas_novas'),
      n_novos,
      cac: n_novos > 0 ? gasto / n_novos : 0,
      ticket_novos: sum('vendas_novas') > 0 ? valor_novos / sum('vendas_novas') : 0,
      valor_recompra,
      receita_total: sum('receita_total'),
      roas: gasto > 0 ? valor_novos / gasto : 0,
    };
  }, [rows]);

  const Th = ({ k, label, align = 'right' }) => (
    <th onClick={() => {
      if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
      else { setSortKey(k); setSortDir('desc'); }
    }} style={{
      textAlign: align, padding: '7px 6px', cursor: 'pointer', userSelect: 'none',
      color: sortKey === k ? 'var(--cyan)' : 'var(--mute)',
      fontWeight: 600, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4,
      borderBottom: sortKey === k ? '2px solid var(--cyan)' : '1px solid rgba(255,255,255,0.08)',
      whiteSpace: 'nowrap',
    }}>{label}{sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}</th>
  );

  return (
    <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <tr>
            <Th k={labelKey} label={labelCol} align="left" />
            <Th k="clicks" label="Clicks" />
            <Th k="conversoes" label="Conv." />
            <Th k="taxa_conv" label="Taxa Conv." />
            <Th k="valor_novos" label="Valor Novos" />
            <Th k="gasto" label="Gasto" />
            <Th k="vendas_novas" label="V. Novas" />
            <Th k="cac" label="CAC" />
            <Th k="ticket_novos" label="Tk. Novo" />
            <Th k="ticket_recompra" label="Tk. Rec." />
            <Th k="taxa_recompra" label="% Rec." />
            <Th k="valor_recompra" label="Valor Recompra" />
            <Th k="receita_total" label="Receita Total" />
            <Th k="roas" label="ROAS" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '6px 6px', color: 'var(--text)', fontWeight: 700 }}>{r[labelKey]}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.clicks > 0 ? _fmtNum(r.clicks) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.conversoes > 0 ? _fmtNum(r.conversoes) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.taxa_conv > 0 ? _fmtPct(r.taxa_conv, 2) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.valor_novos > 0 ? _fmtBRL(r.valor_novos) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.gasto > 0 ? _fmtBRL(r.gasto) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.vendas_novas > 0 ? _fmtNum(r.vendas_novas) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.cac > 0 ? _fmtBRL(r.cac) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.ticket_novos > 0 ? _fmtBRL(r.ticket_novos) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.ticket_recompra > 0 ? _fmtBRL(r.ticket_recompra) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.taxa_recompra > 0 ? _fmtPct(r.taxa_recompra, 1) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.valor_recompra > 0 ? _fmtBRL(r.valor_recompra) : '—'}</td>
              <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.receita_total > 0 ? _fmtBRL(r.receita_total) : '—'}</td>
              <td style={{
                padding: '6px 6px', textAlign: 'right',
                color: _ceRoasColor(r.roas),
                background: _ceRoasBg(r.roas),
                fontFamily: 'var(--font-mono)', fontWeight: 700,
              }}>{_ceFmtRoas(r.roas)}</td>
            </tr>
          ))}
          {/* Linha total */}
          <tr style={{ borderTop: '2px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.03)' }}>
            <td style={{ padding: '8px 6px', color: 'var(--text)', fontWeight: 800 }}>Total</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{_fmtNum(total.clicks)}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{_fmtNum(total.conversoes)}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{_fmtPct(total.taxa_conv, 2)}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{_fmtBRL(total.valor_novos)}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{_fmtBRL(total.gasto)}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{_fmtNum(total.vendas_novas)}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{_fmtBRL(total.cac)}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{_fmtBRL(total.ticket_novos)}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>—</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>—</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{_fmtBRL(total.valor_recompra)}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>{_fmtBRL(total.receita_total)}</td>
            <td style={{
              padding: '8px 6px', textAlign: 'right',
              color: _ceRoasColor(total.roas),
              background: _ceRoasBg(total.roas),
              fontFamily: 'var(--font-mono)', fontWeight: 800,
            }}>{_ceFmtRoas(total.roas)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ===== Matriz Marca x UF (heatmap por ROAS) =====
const MatrizMarcaUF = ({ payload }) => {
  if (!payload || !payload.marcas || !payload.marcas.length) return <div className="empty" style={{ padding: 20, color: 'var(--mute)' }}>sem dados</div>;
  const { marcas, ufs, celulas } = payload;
  // Index por marca/uf -> celula
  const idx = React.useMemo(() => {
    const m = {};
    for (const c of celulas) m[`${c.marca}|${c.uf}`] = c;
    return m;
  }, [celulas]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--mute)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Marca \ UF</th>
            {ufs.map(u => (
              <th key={u} style={{ padding: '6px 6px', textAlign: 'center', color: 'var(--mute)', fontSize: 10.5, fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{u}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {marcas.map(m => (
            <tr key={m} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '6px 8px', color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' }}>{m}</td>
              {ufs.map(u => {
                const c = idx[`${m}|${u}`];
                const roas = c ? c.roas : 0;
                const gasto = c ? c.gasto : 0;
                const has = gasto > 0;
                return (
                  <td key={u} style={{
                    padding: '6px 4px', textAlign: 'center', verticalAlign: 'middle',
                    background: _ceRoasBg(roas),
                    color: _ceRoasColor(roas),
                    fontFamily: 'var(--font-mono)', fontWeight: 700,
                    minWidth: 56,
                  }}
                  title={c ? `${m} x ${u}: ROAS ${_ceFmtRoas(roas)} · gasto ${_fmtBRL(gasto)} · receita novos ${_fmtBRL(c.valor_novos)}` : ''}>
                    {has ? _ceFmtRoas(roas) : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, marginTop: 10, color: 'var(--text-2)', justifyContent: 'center' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 10, background: 'rgba(102,187,106,0.32)', verticalAlign: 'middle', marginRight: 4 }} /> ROAS ≥ 5x</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 10, background: 'rgba(102,187,106,0.20)', verticalAlign: 'middle', marginRight: 4 }} /> 3–5x</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 10, background: 'rgba(253,216,53,0.18)', verticalAlign: 'middle', marginRight: 4 }} /> 1–3x</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 10, background: 'rgba(239,83,80,0.18)', verticalAlign: 'middle', marginRight: 4 }} /> &lt; 1x</span>
      </div>
    </div>
  );
};

// ===== PageCampanhaEstado =====
const PageCampanhaEstado = () => {
  const D = window.CAMPEST_DATA;
  const [marcaSel, setMarcaSel] = React.useState('Todas');
  const [mesSel, setMesSel] = React.useState('Todos');

  if (!D) {
    return (
      <div className="page" style={{ padding: 40 }}>
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          campest-data.js não carregado. Rode: <code>python scripts/build_campest_data.py</code>
        </div>
      </div>
    );
  }

  const k = D.kpis;

  // Filtragem visual (apenas UF). Marca filtra a tabela por_marca quando != Todas.
  const ufRowsFiltradas = React.useMemo(() => {
    // Sem filtro UF na tela (matriz e tabela mostram tudo). marcaSel afeta combo de UF se quisermos -- mas v1 mantem.
    return D.por_uf;
  }, [D]);

  const marcaRowsFiltradas = React.useMemo(() => {
    if (marcaSel === 'Todas') return D.por_marca;
    return D.por_marca.filter(r => r.marca === marcaSel);
  }, [D, marcaSel]);

  const ufOptions = ['Todos', ...((D.por_uf || []).map(r => r.uf))];
  const marcaOptions = ['Todas', ...((D.por_marca || []).map(r => r.marca))];
  const mesOptions = ['Todos', ...(D.filtros?.meses || [])];

  return (
    <div className="page bi-dashboard-theme" style={{ padding: '20px 28px 40px' }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Campanha × Estado × Marca</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          {k.ref_start} → {k.ref_end} · 12m
        </span>
      </div>

      {/* Titulo */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{
          fontSize: '1.6rem', fontWeight: 900, lineHeight: 1.1, marginBottom: 6,
          background: 'linear-gradient(135deg, #4fc3f7, #81d4fa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Cruzamento Ads × Estado × Marca
        </h1>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', maxWidth: 980, lineHeight: 1.6 }}>
          Performance de mídia paga cruzada com geografia e marca: <b>onde</b> o real investido
          em Ads gera receita de 1ª compra mais alta, <b>qual marca</b> performa em cada UF e
          como o <b>ROAS evolui mês a mês</b>. Cores: verde &gt; 3x, amarelo 1–3x, vermelho &lt; 1x.
        </p>
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        padding: '10px 14px', marginBottom: 18, background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
      }}>
        <span style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1 }}>Filtros:</span>
        <select value={mesSel} onChange={(e) => setMesSel(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 8px' }}>
          {mesOptions.map(m => <option key={m} value={m}>{m === 'Todos' ? 'Todos os meses' : _ceMonth(m)}</option>)}
        </select>
        <select value={marcaSel} onChange={(e) => setMarcaSel(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 8px' }}>
          {marcaOptions.map(m => <option key={m} value={m}>{m === 'Todas' ? 'Todas as marcas' : m}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)' }}>
          {D.por_uf.length} UFs · {D.por_marca.length} marcas
        </span>
      </div>

      {/* KPIs */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <div className="card kpi-tile cyan">
          <div className="kpi-label">Gasto ADS · 12m</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.gasto_total).replace('R$ ','')}</div>
          <div className="kpi-hint">{_fmtNum(k.clicks_total)} clicks · {_fmtNum(k.conversoes_total)} conv.</div>
        </div>
        <div className="card kpi-tile green">
          <div className="kpi-label">Receita Novos · 12m</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.receita_novos).replace('R$ ','')}</div>
          <div className="kpi-hint">{_fmtNum(k.n_novos)} clientes novos</div>
        </div>
        <div className="card kpi-tile amber">
          <div className="kpi-label">ROAS Médio</div>
          <div className="kpi-value" style={{ color: _ceRoasColor(k.roas_medio) }}>{_ceFmtRoas(k.roas_medio)}</div>
          <div className="kpi-hint">receita 1ª compra ÷ gasto</div>
        </div>
        <div className="card kpi-tile red">
          <div className="kpi-label">CAC</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.cac).replace('R$ ','')}</div>
          <div className="kpi-hint">{_fmtNum(k.vendas_novas)} pedidos novos · tk. {_fmtBRL(k.ticket_novos)}</div>
        </div>
      </div>

      {/* Tabela por UF */}
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 10px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        1 · Performance por Estado
      </h2>
      <div className="card" style={{ padding: 10, marginBottom: 18 }}>
        <RichTable rows={ufRowsFiltradas} labelCol="UF" labelKey="uf" max={28} />
      </div>

      {/* Tabela por Marca */}
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '24px 0 10px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        2 · Performance por Marca
      </h2>
      <div className="card" style={{ padding: 10, marginBottom: 18 }}>
        <RichTable rows={marcaRowsFiltradas} labelCol="Marca" labelKey="marca" max={28} />
      </div>

      {/* Matriz Marca x UF */}
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '24px 0 10px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        3 · Matriz ROAS — Marca × Estado (top 10 × top 10)
      </h2>
      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <MatrizMarcaUF payload={D.por_marca_uf} />
        <p style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 12, lineHeight: 1.5 }}>
          Cada célula = ROAS do par <i>marca × UF</i> nos últimos 12 meses. Hover mostra gasto absoluto e
          receita de 1ª compra. Cruzamentos sem gasto aparecem como "—".
        </p>
      </div>

      {/* Combo UF */}
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '24px 0 10px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        4 · ROAS × Gasto por UF (top 12)
      </h2>
      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <ComboBarLine items={D.combo_uf || []} labelKey="uf" />
      </div>

      {/* Combo Marca */}
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '24px 0 10px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        5 · ROAS × Gasto por Marca (top 12)
      </h2>
      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <ComboBarLine items={D.combo_marca || []} labelKey="marca" barColor="#a78bfa" lineColor="#10b981" />
      </div>

      {/* Top combinacoes */}
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '24px 0 10px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        6 · Top 30 combinações UF × Marca (por gasto)
      </h2>
      <div className="card" style={{ padding: 12, marginBottom: 18 }}>
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: '7px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>UF</th>
                <th style={{ textAlign: 'left', padding: '7px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Marca</th>
                <th style={{ textAlign: 'right', padding: '7px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Gasto</th>
                <th style={{ textAlign: 'right', padding: '7px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Novos</th>
                <th style={{ textAlign: 'right', padding: '7px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Receita Novos</th>
                <th style={{ textAlign: 'right', padding: '7px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>CAC</th>
                <th style={{ textAlign: 'right', padding: '7px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {(D.top_combinacoes || []).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '6px 6px', color: 'var(--text)', fontWeight: 700 }}>{r.uf}</td>
                  <td style={{ padding: '6px 6px', color: 'var(--text-2)' }}>{r.marca}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(r.gasto)}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_fmtNum(r.n_novos)}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.valor_novos > 0 ? _fmtBRL(r.valor_novos) : '—'}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.cac > 0 ? _fmtBRL(r.cac) : '—'}</td>
                  <td style={{
                    padding: '6px 6px', textAlign: 'right',
                    color: _ceRoasColor(r.roas),
                    background: _ceRoasBg(r.roas),
                    fontFamily: 'var(--font-mono)', fontWeight: 700,
                  }}>{_ceFmtRoas(r.roas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROAS mensal por Marca */}
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '24px 0 10px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        7 · ROAS por Ano-Mês e Marca (top 8)
      </h2>
      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <CeMultiLine
          meses={D.roas_mensal_marca?.meses || []}
          series={D.roas_mensal_marca?.series || {}}
          height={300}
          fmtY={(v) => `${v.toFixed(0)}x`}
        />
      </div>

      {/* ROAS mensal por UF */}
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '24px 0 10px', color: 'var(--text)',
                   paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)' }}>
        8 · ROAS por Ano-Mês e UF (top 8)
      </h2>
      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <CeMultiLine
          meses={D.roas_mensal_uf?.meses || []}
          series={D.roas_mensal_uf?.series || {}}
          height={300}
          fmtY={(v) => `${v.toFixed(0)}x`}
        />
      </div>

      <div style={{ textAlign: 'center', color: 'var(--mute)', fontSize: 11, padding: '20px 0' }}>
        Astro BI · Campanha × Estado × Marca · {(D.gerado_em || '').slice(0, 10)} · fonte: Tiny ERP + Google Ads
      </div>
    </div>
  );
};

Object.assign(window, { PageCampanhaEstado });
