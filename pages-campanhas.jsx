/**
 * pages-campanhas.jsx — tela Astro · Campanhas (Google Ads × Novos clientes)
 *
 * Dados: window.CAMPANHAS_DATA (gerado por scripts/build_campanhas_data.py
 * a partir de vendas_tiny_bu.parquet + astro_ads.xlsx). Pre-calculados.
 *
 * Renomeado pra PageCampanhasAds pra nao colidir com PageCampanhas (caso o
 * template fin40 tenha esse nome). Registrado em window pro App raiz pegar.
 */

// ===== Helpers de formatacao =====
const _cmpFmtBRL = (v) => {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};
const _cmpFmtBRLk = (v) => {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}R$ ${(a/1e9).toFixed(2).replace('.', ',')}B`;
  if (a >= 1e6) return `${s}R$ ${(a/1e6).toFixed(2).replace('.', ',')}M`;
  if (a >= 1e3) return `${s}R$ ${(a/1e3).toFixed(0)}k`;
  return `${s}R$ ${a.toFixed(0)}`;
};
const _cmpFmtNum = (v, d = 0) => {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
};
const _cmpFmtPct = (v, d = 1) => {
  if (v == null || !isFinite(v)) return '—';
  return `${(v*100).toFixed(d).replace('.', ',')}%`;
};
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
const _cmpMonthLabel = (am) => {
  // 'YYYY-MM' -> 'MMM/YY'
  if (!am || typeof am !== 'string' || am.length < 7) return am || '';
  const [y, m] = am.split('-');
  const NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const idx = parseInt(m, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx > 11) return am;
  return `${NAMES[idx]}/${y.slice(2)}`;
};

// ===== Bar vertical (gasto mensal) =====
const CampanhasBarV = ({ values, labels, color = 'var(--cyan)', height = 220, fmt = _cmpFmtBRLk }) => {
  if (!values || !values.length) return <div className="empty" style={{ padding: 24, color: 'var(--mute)' }}>sem dados</div>;
  const max = Math.max(...values);
  return (
    <div className="campanhas-bar-v" style={{ height, display: 'flex', alignItems: 'flex-end', gap: 6, padding: '20px 4px 0', overflowX: 'auto' }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: '1 0 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 30 }}>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{fmt(v)}</span>
          <div style={{
            width: '100%', maxWidth: 36,
            background: color,
            height: `${Math.max(2, max > 0 ? (v/max)*100 : 0)}%`,
            borderRadius: '4px 4px 0 0',
            boxShadow: '0 -2px 12px rgba(34,211,238,0.25)'
          }} />
          <span style={{ fontSize: 10, color: 'var(--mute)', whiteSpace: 'nowrap' }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
};

// ===== Dual-line: 2 series comparativas com eixo Y dual (gasto vs novos) =====
const CampanhasDualLine = ({ points, height = 260 }) => {
  if (!points || !points.length) return <div className="empty" style={{ padding: 24, color: 'var(--mute)' }}>sem dados</div>;
  const W = 700, H = height, P_L = 48, P_R = 48, P_T = 20, P_B = 30;
  const innerW = W - P_L - P_R;
  const innerH = H - P_T - P_B;

  const gastos = points.map(p => p.gasto);
  const novos = points.map(p => p.novos_clientes);
  const maxG = Math.max(...gastos, 1);
  const maxN = Math.max(...novos, 1);

  const xAt = (i) => P_L + (i / Math.max(1, points.length - 1)) * innerW;
  const yGasto = (v) => P_T + (1 - v / maxG) * innerH;
  const yNovos = (v) => P_T + (1 - v / maxN) * innerH;

  const pathG = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yGasto(p.gasto)}`).join(' ');
  const pathN = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yNovos(p.novos_clientes)}`).join(' ');

  // y-axis ticks
  const yTicks = 4;
  const tickValsG = Array.from({ length: yTicks + 1 }, (_, i) => (maxG / yTicks) * (yTicks - i));
  const tickValsN = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxN / yTicks) * (yTicks - i)));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {/* grid + y ticks gasto (esq, cyan) */}
        {tickValsG.map((v, i) => {
          const y = P_T + (i / yTicks) * innerH;
          return (
            <g key={`tg-${i}`}>
              <line x1={P_L} y1={y} x2={W - P_R} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={P_L - 6} y={y + 3} textAnchor="end" fontSize="10" fill="var(--cyan)" fontFamily="var(--font-mono)">{_cmpFmtBRLk(v)}</text>
            </g>
          );
        })}
        {/* y ticks novos (dir, green) */}
        {tickValsN.map((v, i) => {
          const y = P_T + (i / yTicks) * innerH;
          return (
            <text key={`tn-${i}`} x={W - P_R + 6} y={y + 3} textAnchor="start" fontSize="10" fill="var(--green)" fontFamily="var(--font-mono)">{v}</text>
          );
        })}
        {/* lines */}
        <path d={pathG} stroke="var(--cyan)" strokeWidth="2.5" fill="none" />
        <path d={pathN} stroke="var(--green)" strokeWidth="2.5" fill="none" strokeDasharray="6,3" />
        {/* dots */}
        {points.map((p, i) => (
          <g key={`d-${i}`}>
            <circle cx={xAt(i)} cy={yGasto(p.gasto)} r="3" fill="var(--cyan)" />
            <circle cx={xAt(i)} cy={yNovos(p.novos_clientes)} r="3" fill="var(--green)" />
          </g>
        ))}
        {/* x labels (a cada 2 ou 3) */}
        {points.map((p, i) => {
          const skip = Math.ceil(points.length / 10);
          if (i % skip !== 0 && i !== points.length - 1) return null;
          return (
            <text key={`xl-${i}`} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--mute)">{_cmpMonthLabel(p.am)}</text>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', fontSize: 12, marginTop: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
          <span style={{ width: 14, height: 3, background: 'var(--cyan)' }} /> Gasto Ads (R$)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
          <span style={{ width: 14, height: 3, background: 'var(--green)', borderTop: '1px dashed var(--green)' }} /> Novos clientes
        </span>
      </div>
    </div>
  );
};

// ===== Tabela ROAS (estado/marca) =====
const CampanhasTableRoas = ({ rows, labelCol, labelKey }) => {
  if (!rows || !rows.length) return <div className="empty" style={{ padding: 24, color: 'var(--mute)' }}>sem dados</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{labelCol}</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gasto Ads</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Novos</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Receita novos</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>CAC</th>
            <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--mute)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>ROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: '7px 6px', color: 'var(--text)', fontWeight: 600 }}>{r[labelKey]}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_cmpFmtBRL(r.gasto)}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_cmpFmtNum(r.novos)}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{_cmpFmtBRL(r.receita_novos)}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{r.cac > 0 ? _cmpFmtBRL(r.cac) : '—'}</td>
              <td style={{
                padding: '7px 6px',
                textAlign: 'right',
                color: _cmpRoasColor(r.roas),
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
              }}>{_cmpFmtRoas(r.roas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ===== PageCampanhasAds =====
const PageCampanhasAds = () => {
  const D = window.CAMPANHAS_DATA;
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

  return (
    <div className="page bi-dashboard-theme" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Campanhas</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          {k.ref_start} → {k.ref_end} · 12m
        </span>
      </div>

      {/* === KPIs grandes === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="card kpi-tile cyan">
          <div className="kpi-label">Gasto Ads · 12m</div>
          <div className="kpi-value"><span className="currency">R$</span>{_cmpFmtBRLk(k.gasto_total_12m).replace('R$ ','')}</div>
          <div className="kpi-hint">média R$ {_cmpFmtBRLk(k.gasto_medio_mensal).replace('R$ ','')}/mês · {k.meses_periodo}m</div>
        </div>
        <div className="card kpi-tile green">
          <div className="kpi-label">ROAS Global</div>
          <div className="kpi-value" style={{ color: _cmpRoasColor(k.roas_global) }}>{_cmpFmtRoas(k.roas_global)}</div>
          <div className="kpi-hint">receita novos ÷ gasto Ads</div>
        </div>
        <div className="card kpi-tile amber">
          <div className="kpi-label">CAC</div>
          <div className="kpi-value"><span className="currency">R$</span>{_cmpFmtBRLk(k.cac_global).replace('R$ ','')}</div>
          <div className="kpi-hint">{_cmpFmtNum(k.novos_clientes_12m)} novos clientes</div>
        </div>
        <div className="card kpi-tile violet">
          <div className="kpi-label">PF / PJ · 90d</div>
          <div className="kpi-value" style={{ fontSize: '1.4rem' }}>
            {_cmpFmtPct(k.pct_pf_90d, 0)} / {_cmpFmtPct(k.pct_pj_90d, 0)}
          </div>
          <div className="kpi-hint">{_cmpFmtNum(k.novos_pf_90d)} PF · {_cmpFmtNum(k.novos_pj_90d)} PJ</div>
        </div>
      </div>

      {/* === Serie mensal gasto Ads === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 12px', color: 'var(--text)' }}>Gasto Ads · evolução mensal (últimos 18m)</h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <CampanhasBarV
          values={D.gasto_mensal.map(x => x.valor)}
          labels={D.gasto_mensal.map(x => _cmpMonthLabel(x.am))}
          color="var(--cyan)"
          height={220}
        />
      </div>

      {/* === Scatter/dual line gasto x novos === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 12px', color: 'var(--text)' }}>Gasto Ads × Novos clientes · comparativo mensal</h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <CampanhasDualLine points={D.gasto_vs_novos} height={280} />
        <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--cyan)' }}>Leitura:</b> meses onde a linha pontilhada (novos clientes)
          acompanha a linha sólida (gasto) sugerem que o investimento em Ads está convertendo em primeira compra.
          Descolamentos indicam saturação, falha de targeting, ou fatores externos (sazonalidade, política comercial).
        </div>
      </div>

      {/* === Tabelas lado a lado === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">ROAS por Estado · top 15 (12m)</h2></div>
          <CampanhasTableRoas rows={D.roas_por_estado} labelCol="UF" labelKey="uf" />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">ROAS por Marca · top 15 (12m)</h2></div>
          <CampanhasTableRoas rows={D.roas_por_marca} labelCol="Marca" labelKey="marca" />
        </div>
      </div>

      {/* === Tendência PF vs PJ === */}
      {D.tendencia_pf_vs_pj && D.tendencia_pf_vs_pj.length > 0 && (
        <>
          <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 12px', color: 'var(--text)' }}>Mix PF/PJ · últimos 90d (semanal)</h3>
          <div className="card" style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'stretch', height: 80, padding: '8px 4px' }}>
              {D.tendencia_pf_vs_pj.map((w, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 24 }} title={`${w.wk}: ${w.pf} PF / ${w.pj} PJ`}>
                  <div style={{ flex: w.pct_pf, background: 'var(--cyan)', borderRadius: '3px 3px 0 0', minHeight: 2 }} />
                  <div style={{ flex: w.pct_pj, background: 'var(--violet)', borderRadius: '0 0 3px 3px', minHeight: 2 }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 12, marginTop: 8, color: 'var(--text-2)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, background: 'var(--cyan)', borderRadius: 2 }} /> Pessoa Física
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, background: 'var(--violet)', borderRadius: 2 }} /> Pessoa Jurídica
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Registra no escopo do bundle (PAGE_COMPS do App raiz pega via referência direta)
Object.assign(window, { PageCampanhasAds });
