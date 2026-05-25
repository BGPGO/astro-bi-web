/**
 * pages-abc.jsx — Curva ABC por produto (seo_title).
 *
 * Migrado do Streamlit C:/Projects/astro-giro-bi/abc_curva.py.
 * Dados pre-calculados em window.ABC_DATA via scripts/build_abc_data.py.
 *
 * Classes (sobre receita acumulada DESC):
 *   A = top 80% receita
 *   B = 80%-95% receita
 *   C = 95%-100% receita
 *
 * Helpers globais: AstroLine (de pages-astro.jsx) + _fmtBRL / _fmtBRLk / _fmtNum / _fmtPct.
 * Tema: classes molde do template (.page, .card, .kpi-tile, .t, .breadcrumb).
 */

// ===== Mini helpers locais (no caso de pages-astro nao carregar antes) =====
const _abc_fmtBRL = (typeof _fmtBRL === 'function')
  ? _fmtBRL
  : (v) => v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const _abc_fmtBRLk = (typeof _fmtBRLk === 'function')
  ? _fmtBRLk
  : (v) => {
      if (v == null || !isFinite(v)) return '—';
      const a = Math.abs(v), s = v < 0 ? '-' : '';
      if (a >= 1e9) return `${s}R$ ${(a/1e9).toFixed(2).replace('.', ',')}B`;
      if (a >= 1e6) return `${s}R$ ${(a/1e6).toFixed(2).replace('.', ',')}M`;
      if (a >= 1e3) return `${s}R$ ${(a/1e3).toFixed(0)}k`;
      return `${s}R$ ${a.toFixed(0)}`;
    };
const _abc_fmtNum = (typeof _fmtNum === 'function')
  ? _fmtNum
  : (v, d = 0) => v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const _abc_fmtPct = (typeof _fmtPct === 'function')
  ? _fmtPct
  : (v, d = 1) => v == null || !isFinite(v) ? '—' : `${(v*100).toFixed(d).replace('.', ',')}%`;

// ===== Curva ABC SVG (% receita acum × % produtos acum) =====
// Implementacao local em vez de reaproveitar AstroLine porque precisamos:
// - linhas de corte 80% e 95%
// - segmentar A/B/C por cor (verde/ambar/vermelho)
// - eixos com labels (rank / pct)
const AbcCurveSVG = ({ curva, height = 380 }) => {
  if (!curva || !curva.length) return <div className="empty">sem dados</div>;
  const W = 800, H = height, PAD_L = 50, PAD_R = 16, PAD_T = 16, PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const nTotal = curva[curva.length - 1].rank; // rank do ultimo ponto = total real
  const xOf = (rank) => PAD_L + (rank / nTotal) * innerW;
  const yOf = (pct) => PAD_T + (1 - pct) * innerH;

  // Quebra em 3 paths (A, B, C) com cores distintas. Como pct_acum eh monotonico,
  // sabemos onde A termina (primeira vez pct_acum > 0.80) e onde B termina (> 0.95).
  const ptsA = [], ptsB = [], ptsC = [];
  curva.forEach((p) => {
    const xy = [xOf(p.rank), yOf(p.pct_acum)];
    if (p.classe === 'A') ptsA.push(xy);
    else if (p.classe === 'B') ptsB.push(xy);
    else ptsC.push(xy);
  });
  // Para suavizar transicao, joga primeiro ponto de B/C como ultimo do anterior
  if (ptsA.length && ptsB.length) ptsB.unshift(ptsA[ptsA.length - 1]);
  if (ptsB.length && ptsC.length) ptsC.unshift(ptsB[ptsB.length - 1]);

  const pathFrom = (pts) => pts.length
    ? pts.map((p, i) => (i === 0 ? `M ${p[0].toFixed(1)} ${p[1].toFixed(1)}` : `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)).join(' ')
    : '';

  const lineY80 = yOf(0.80);
  const lineY95 = yOf(0.95);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      {/* Grid horizontal a cada 20% */}
      {[0.2, 0.4, 0.6, 0.8, 1.0].map((p) => (
        <line key={p} x1={PAD_L} x2={W - PAD_R} y1={yOf(p)} y2={yOf(p)} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 4" />
      ))}
      {/* Eixos */}
      <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--mute)" strokeWidth="0.8" />
      <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B} stroke="var(--mute)" strokeWidth="0.8" />
      {/* Labels do eixo Y (pct acum) */}
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((p) => (
        <text key={p} x={PAD_L - 6} y={yOf(p) + 4} textAnchor="end" fontSize="10" fill="var(--text-2)" fontFamily="var(--font-mono)">
          {(p * 100).toFixed(0)}%
        </text>
      ))}
      {/* Labels do eixo X (rank) */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <text key={p} x={PAD_L + p * innerW} y={H - PAD_B + 16} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="var(--font-mono)">
          {Math.round(p * nTotal)}
        </text>
      ))}
      {/* Linha 80% (corte A) */}
      <line x1={PAD_L} x2={W - PAD_R} y1={lineY80} y2={lineY80} stroke="#10b981" strokeDasharray="6 4" strokeWidth="1" />
      <text x={W - PAD_R - 4} y={lineY80 - 4} textAnchor="end" fontSize="10" fill="#10b981" fontWeight="600">80% · Classe A</text>
      {/* Linha 95% (corte B) */}
      <line x1={PAD_L} x2={W - PAD_R} y1={lineY95} y2={lineY95} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth="1" />
      <text x={W - PAD_R - 4} y={lineY95 - 4} textAnchor="end" fontSize="10" fill="#f59e0b" fontWeight="600">95% · Classe B</text>
      {/* Curvas */}
      <path d={pathFrom(ptsA)} stroke="#10b981" strokeWidth="2.2" fill="none" />
      <path d={pathFrom(ptsB)} stroke="#f59e0b" strokeWidth="2.2" fill="none" />
      <path d={pathFrom(ptsC)} stroke="#ef4444" strokeWidth="2.2" fill="none" />
      {/* Labels eixos */}
      <text x={PAD_L + innerW / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--text-2)">Produtos (rank)</text>
      <text x={14} y={PAD_T + innerH / 2} textAnchor="middle" fontSize="11" fill="var(--text-2)" transform={`rotate(-90 14 ${PAD_T + innerH / 2})`}>% acumulado da receita</text>
    </svg>
  );
};

// ===== Badge de classe (A / B / C) =====
const ClasseBadge = ({ classe }) => {
  const cores = {
    A: { bg: 'rgba(16,185,129,0.15)', fg: '#10b981', border: 'rgba(16,185,129,0.35)' },
    B: { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b', border: 'rgba(245,158,11,0.35)' },
    C: { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444', border: 'rgba(239,68,68,0.35)' },
  };
  const c = cores[classe] || cores.C;
  return (
    <span style={{
      display: 'inline-block', minWidth: 22, textAlign: 'center',
      padding: '2px 8px', fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      borderRadius: 4, fontFamily: 'var(--font-mono)',
    }}>{classe}</span>
  );
};

// ===== Stack horizontal por marca (A/B/C) =====
const MarcaStack = ({ row }) => {
  const total = row.n_total || 1;
  const pA = (row.n_a / total) * 100;
  const pB = (row.n_b / total) * 100;
  const pC = (row.n_c / total) * 100;
  return (
    <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-2)' }}>
      {pA > 0 && <div title={`A: ${row.n_a}`} style={{ width: `${pA}%`, background: '#10b981' }} />}
      {pB > 0 && <div title={`B: ${row.n_b}`} style={{ width: `${pB}%`, background: '#f59e0b' }} />}
      {pC > 0 && <div title={`C: ${row.n_c}`} style={{ width: `${pC}%`, background: '#ef4444' }} />}
    </div>
  );
};

// ===== PageCurvaABCAstro =====
const PageCurvaABCAstro = () => {
  const D = window.ABC_DATA;
  if (!D) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          abc-data.js nao carregado. Rode: <code>python scripts/build_abc_data.py</code>
        </div>
      </div>
    );
  }

  const k = D.kpis;
  const classes = D.classes_resumo || [];
  const top50 = D.top_50 || [];
  const marcas = D.marca_breakdown || [];

  return (
    <div className="page bi-dashboard-theme" style={{ padding: '20px 28px 40px' }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Curva ABC</b>
      </div>

      {/* === KPIs principais === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Produtos únicos</div>
          <div className="kpi-value">{_abc_fmtNum(k.n_produtos_total)}</div>
          <div className="kpi-hint">distintos · seo_title (excl. Cancelado)</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">% Receita Classe A</div>
          <div className="kpi-value">{_abc_fmtPct(k.pct_receita_classe_a, 2)}</div>
          <div className="kpi-hint">{_abc_fmtBRLk(k.receita_classe_a)} de {_abc_fmtBRLk(k.receita_total)}</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">Produtos Classe A</div>
          <div className="kpi-value">{_abc_fmtNum(k.n_produtos_a)}</div>
          <div className="kpi-hint">{_abc_fmtPct(k.n_produtos_a / k.n_produtos_total, 1)} do catálogo concentra ~80% da receita</div>
        </div>
      </div>

      {/* === Curva ABC === */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="card-title">Curva ABC · % receita acumulada × % produtos acumulados</h2>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>
            {_abc_fmtNum(D.pontos_amostrados)} pontos amostrados de {_abc_fmtNum(D.total_pontos_curva)}
          </span>
        </div>
        <AbcCurveSVG curva={D.curva} height={400} />
      </div>

      {/* === Resumo por classe === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>Resumo por classe</h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Classe</th>
              <th style={{ textAlign: 'right' }}>Nº produtos</th>
              <th style={{ textAlign: 'right' }}>Receita</th>
              <th style={{ textAlign: 'right' }}>% Receita Total</th>
              <th style={{ textAlign: 'right' }}>Ticket médio</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.classe}>
                <td><ClasseBadge classe={c.classe} /></td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtNum(c.n_produtos)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(c.receita)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtPct(c.pct_receita_total, 2)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtBRLk(c.ticket_medio)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
              <td>TOTAL</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtNum(k.n_produtos_total)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(k.receita_total)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>100,00%</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(k.receita_total / k.n_produtos_total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* === Top 50 produtos classe A === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Top 50 produtos · Classe A
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 50 }}>Rank</th>
              <th style={{ width: 90 }}>SKU</th>
              <th>Produto (seo_title)</th>
              <th style={{ width: 130 }}>Marca</th>
              <th style={{ width: 90, textAlign: 'right' }}>Qtd</th>
              <th style={{ width: 110, textAlign: 'right' }}>Receita</th>
              <th style={{ width: 80, textAlign: 'right' }}>% Indiv</th>
              <th style={{ width: 80, textAlign: 'right' }}>% Acum</th>
              <th style={{ width: 50 }}>Classe</th>
            </tr>
          </thead>
          <tbody>
            {top50.map((r) => (
              <tr key={r.rank}>
                <td style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{r.rank}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>{r.sku || '—'}</td>
                <td title={r.seo_title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{r.seo_title}</td>
                <td style={{ color: 'var(--text-2)', fontSize: 12 }}>{r.marca || '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtNum(r.quantidade)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(r.receita)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtPct(r.pct_indiv, 2)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtPct(r.pct_acum, 2)}</td>
                <td><ClasseBadge classe={r.classe} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* === Breakdown por marca === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Distribuição A/B/C por marca · Top 15 marcas por receita
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Marca</th>
              <th style={{ width: 110, textAlign: 'right' }}>Receita</th>
              <th style={{ width: 70, textAlign: 'right' }}>Nº</th>
              <th style={{ width: 60, textAlign: 'right', color: '#10b981' }}>A</th>
              <th style={{ width: 60, textAlign: 'right', color: '#f59e0b' }}>B</th>
              <th style={{ width: 60, textAlign: 'right', color: '#ef4444' }}>C</th>
              <th style={{ width: 200 }}>Distribuição</th>
            </tr>
          </thead>
          <tbody>
            {marcas.map((r, i) => (
              <tr key={i}>
                <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }} title={r.marca}>{r.marca}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(r.receita_marca)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtNum(r.n_total)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.n_a ? '#10b981' : 'var(--mute)' }}>{r.n_a}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.n_b ? '#f59e0b' : 'var(--mute)' }}>{r.n_b}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.n_c ? '#ef4444' : 'var(--mute)' }}>{r.n_c}</td>
                <td><MarcaStack row={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Registra no escopo do bundle pra PAGE_COMPS do App raiz pegar
Object.assign(window, { PageCurvaABCAstro });
