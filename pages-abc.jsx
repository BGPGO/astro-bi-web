/**
 * pages-abc.jsx V2 — Curva ABC por produto (seo_title), PROFUNDA + REATIVA.
 *
 * Migrado do Streamlit C:/Projects/astro-giro-bi/abc_curva.py (versao V2).
 * Dados em window.ABC_DATA.por_status[excluindo_cancelado | incluindo_cancelado].
 *
 * Reatividade:
 *  - Toggle "Excluir Cancelado" troca de snapshot e recarrega toda a tela
 *  - Dropdown marca / categoria / classe + busca texto -> tabela top 100 filtrada
 *  - Sort por click no header da tabela
 *  - Hover na curva mostra produto naquele rank
 *
 * Classes (sobre receita acumulada DESC):
 *   A = top 80% receita | B = 80-95% | C = 95-100%
 *
 * Helpers globais (definidos em pages-astro.jsx): _fmtBRL / _fmtBRLk / _fmtNum / _fmtPct, AstroBarH.
 */

// ===== Mini helpers locais (fallback) =====
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

// ===== Cores classe =====
const ABC_CORES = {
  A: { bg: 'rgba(16,185,129,0.15)', fg: '#10b981', border: 'rgba(16,185,129,0.35)', hex: '#10b981' },
  B: { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b', border: 'rgba(245,158,11,0.35)', hex: '#f59e0b' },
  C: { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444', border: 'rgba(239,68,68,0.35)', hex: '#ef4444' },
};

const ClasseBadge = ({ classe }) => {
  const c = ABC_CORES[classe] || ABC_CORES.C;
  return (
    <span style={{
      display: 'inline-block', minWidth: 22, textAlign: 'center',
      padding: '2px 8px', fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      borderRadius: 4, fontFamily: 'var(--font-mono)',
    }}>{classe}</span>
  );
};

// ===== SVG curva ABC com Pareto ideal + hover =====
const AbcCurveSVG = ({ pareto_real, pareto_ideal, curva_completa, height = 420 }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  if (!pareto_real || !pareto_real.length) return <div className="empty">sem dados</div>;

  const W = 800, H = height, PAD_L = 56, PAD_R = 16, PAD_T = 20, PAD_B = 44;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xOf = (pctProd) => PAD_L + pctProd * innerW;
  const yOf = (pctRec) => PAD_T + (1 - pctRec) * innerH;

  const pathFromXY = (pts, xKey = 'pct_produtos', yKey = 'pct_receita') =>
    pts.map((p, i) => {
      const cmd = i === 0 ? 'M' : 'L';
      return `${cmd} ${xOf(p[xKey]).toFixed(1)} ${yOf(p[yKey]).toFixed(1)}`;
    }).join(' ');

  // Segmenta a curva real por classe (A/B/C) baseado em pct_receita
  const ptsA = pareto_real.filter(p => p.pct_receita <= 0.80);
  const ptsB = pareto_real.filter(p => p.pct_receita > 0.80 && p.pct_receita <= 0.95);
  const ptsC = pareto_real.filter(p => p.pct_receita > 0.95);
  if (ptsA.length && ptsB.length) ptsB.unshift(ptsA[ptsA.length - 1]);
  if (ptsB.length && ptsC.length) ptsC.unshift(ptsB[ptsB.length - 1]);

  const lineY80 = yOf(0.80);
  const lineY95 = yOf(0.95);

  // Hover: mapeia mouse x → rank → produto na curva_completa
  const total = curva_completa ? curva_completa.length : 0;
  const handleMove = (e) => {
    if (!total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width * W;
    if (xRel < PAD_L || xRel > W - PAD_R) { setHoverIdx(null); return; }
    const pct = (xRel - PAD_L) / innerW;
    const idx = Math.max(0, Math.min(total - 1, Math.round(pct * (total - 1))));
    setHoverIdx(idx);
  };
  const handleLeave = () => setHoverIdx(null);

  const hoverProd = (hoverIdx != null && curva_completa) ? curva_completa[hoverIdx] : null;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {/* Grid horizontal */}
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((p) => (
          <line key={`hg-${p}`} x1={PAD_L} x2={W - PAD_R} y1={yOf(p)} y2={yOf(p)} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 4" />
        ))}
        {/* Eixos */}
        <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--mute)" strokeWidth="0.8" />
        <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B} stroke="var(--mute)" strokeWidth="0.8" />
        {/* Labels Y */}
        {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((p) => (
          <text key={`yl-${p}`} x={PAD_L - 6} y={yOf(p) + 4} textAnchor="end" fontSize="10" fill="var(--text-2)" fontFamily="var(--font-mono)">
            {(p * 100).toFixed(0)}%
          </text>
        ))}
        {/* Labels X */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <text key={`xl-${p}`} x={PAD_L + p * innerW} y={H - PAD_B + 16} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="var(--font-mono)">
            {(p * 100).toFixed(0)}%
          </text>
        ))}
        {/* Linha 80/20 ideal (pontilhada) */}
        <path d={pathFromXY(pareto_ideal)} stroke="var(--mute)" strokeWidth="1.4" fill="none" strokeDasharray="4 4" opacity="0.7" />
        {/* Cortes 80% e 95% */}
        <line x1={PAD_L} x2={W - PAD_R} y1={lineY80} y2={lineY80} stroke="#10b981" strokeDasharray="6 4" strokeWidth="1" />
        <text x={W - PAD_R - 4} y={lineY80 - 4} textAnchor="end" fontSize="10" fill="#10b981" fontWeight="600">80% · Corte Classe A</text>
        <line x1={PAD_L} x2={W - PAD_R} y1={lineY95} y2={lineY95} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth="1" />
        <text x={W - PAD_R - 4} y={lineY95 - 4} textAnchor="end" fontSize="10" fill="#f59e0b" fontWeight="600">95% · Corte Classe B</text>
        {/* Curva real segmentada */}
        <path d={pathFromXY(ptsA)} stroke="#10b981" strokeWidth="2.2" fill="none" />
        <path d={pathFromXY(ptsB)} stroke="#f59e0b" strokeWidth="2.2" fill="none" />
        <path d={pathFromXY(ptsC)} stroke="#ef4444" strokeWidth="2.2" fill="none" />
        {/* Hover marker */}
        {hoverProd && (
          <g>
            <line
              x1={xOf(hoverProd.rank / total)} x2={xOf(hoverProd.rank / total)}
              y1={PAD_T} y2={H - PAD_B}
              stroke="var(--text-2)" strokeWidth="0.8" strokeDasharray="2 2"
            />
            <circle
              cx={xOf(hoverProd.rank / total)}
              cy={yOf(hoverProd.pct_acum)}
              r="4"
              fill={ABC_CORES[hoverProd.classe].hex}
              stroke="var(--bg)"
              strokeWidth="1.5"
            />
          </g>
        )}
        {/* Labels eixos */}
        <text x={PAD_L + innerW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-2)">% acumulado de produtos (ranking)</text>
        <text x={16} y={PAD_T + innerH / 2} textAnchor="middle" fontSize="11" fill="var(--text-2)" transform={`rotate(-90 16 ${PAD_T + innerH / 2})`}>% acumulado da receita</text>
        {/* Legenda inline canto inferior direito */}
        <g transform={`translate(${W - PAD_R - 220}, ${H - PAD_B - 60})`}>
          <rect x="0" y="0" width="200" height="56" fill="var(--surface)" stroke="var(--border)" rx="4" opacity="0.92" />
          <line x1="8" x2="22" y1="14" y2="14" stroke="#10b981" strokeWidth="2.2" />
          <text x="28" y="17" fontSize="10" fill="var(--text-2)">Curva real (A · B · C)</text>
          <line x1="8" x2="22" y1="30" y2="30" stroke="var(--mute)" strokeWidth="1.4" strokeDasharray="3 3" />
          <text x="28" y="33" fontSize="10" fill="var(--text-2)">Pareto ideal 80/20</text>
          <line x1="8" x2="22" y1="46" y2="46" stroke="#10b981" strokeWidth="1" strokeDasharray="4 2" />
          <text x="28" y="49" fontSize="10" fill="var(--text-2)">Cortes 80% / 95%</text>
        </g>
      </svg>
      {/* Tooltip hover */}
      {hoverProd && (
        <div style={{
          position: 'absolute', top: 8, left: 12,
          background: 'var(--surface)', border: '1px solid var(--border)',
          padding: '8px 12px', borderRadius: 6, fontSize: 12,
          pointerEvents: 'none', maxWidth: 340, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <ClasseBadge classe={hoverProd.classe} />
            <span style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              rank #{hoverProd.rank} · {hoverProd.codigo || '—'}
            </span>
          </div>
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{hoverProd.seo_title}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 11 }}>
            {_abc_fmtBRLk(hoverProd.receita)} · {_abc_fmtPct(hoverProd.pct_indiv, 3)} indiv · {_abc_fmtPct(hoverProd.pct_acum, 2)} acum
          </div>
        </div>
      )}
    </div>
  );
};

// ===== Barra horizontal classe-stacked (% por marca/categoria) =====
const StackedABCBar = ({ n_a, n_b, n_c }) => {
  const total = (n_a || 0) + (n_b || 0) + (n_c || 0) || 1;
  const pA = (n_a / total) * 100;
  const pB = (n_b / total) * 100;
  const pC = (n_c / total) * 100;
  return (
    <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-2)', minWidth: 80 }}>
      {pA > 0 && <div title={`A: ${n_a}`} style={{ width: `${pA}%`, background: '#10b981' }} />}
      {pB > 0 && <div title={`B: ${n_b}`} style={{ width: `${pB}%`, background: '#f59e0b' }} />}
      {pC > 0 && <div title={`C: ${n_c}`} style={{ width: `${pC}%`, background: '#ef4444' }} />}
    </div>
  );
};

// ===== Header sortable =====
const SortableTh = ({ label, sortKey, current, dir, onSort, align = 'left', width }) => {
  const active = current === sortKey;
  return (
    <th
      style={{ textAlign: align, width, cursor: 'pointer', userSelect: 'none', color: active ? 'var(--cyan)' : undefined }}
      onClick={() => onSort(sortKey)}
      title="Ordenar"
    >
      {label}{active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );
};

// ===== Tabela de produtos filtravel + sortable =====
const ProdutosTabela = ({ rows, sortKey, sortDir, setSort }) => {
  const totalRows = rows.length;
  const view = rows.slice(0, 100);
  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 8 }}>
        Mostrando {view.length} de {_abc_fmtNum(totalRows)} produtos filtrados · click no header pra ordenar
      </div>
      <table className="t" style={{ width: '100%' }}>
        <thead>
          <tr>
            <SortableTh label="Rank" sortKey="rank" current={sortKey} dir={sortDir} onSort={setSort} align="left" width={60} />
            <SortableTh label="Código" sortKey="codigo" current={sortKey} dir={sortDir} onSort={setSort} align="left" width={90} />
            <SortableTh label="Produto" sortKey="seo_title" current={sortKey} dir={sortDir} onSort={setSort} align="left" />
            <SortableTh label="Marca" sortKey="marca" current={sortKey} dir={sortDir} onSort={setSort} align="left" width={120} />
            <SortableTh label="Categoria" sortKey="categoria_mae" current={sortKey} dir={sortDir} onSort={setSort} align="left" width={140} />
            <SortableTh label="Qtd" sortKey="quantidade" current={sortKey} dir={sortDir} onSort={setSort} align="right" width={75} />
            <SortableTh label="Receita" sortKey="receita" current={sortKey} dir={sortDir} onSort={setSort} align="right" width={100} />
            <SortableTh label="% Indiv" sortKey="pct_indiv" current={sortKey} dir={sortDir} onSort={setSort} align="right" width={80} />
            <SortableTh label="% Acum" sortKey="pct_acum" current={sortKey} dir={sortDir} onSort={setSort} align="right" width={80} />
            <SortableTh label="Classe" sortKey="classe" current={sortKey} dir={sortDir} onSort={setSort} align="left" width={70} />
          </tr>
        </thead>
        <tbody>
          {view.length === 0 && (
            <tr>
              <td colSpan="10" style={{ textAlign: 'center', padding: 20, color: 'var(--mute)' }}>nenhum produto pra esses filtros</td>
            </tr>
          )}
          {view.map((r) => (
            <tr key={r.rank}>
              <td style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{r.rank}</td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>{r.codigo || '—'}</td>
              <td title={r.seo_title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{r.seo_title}</td>
              <td style={{ color: 'var(--text-2)', fontSize: 12 }}>{r.marca || '—'}</td>
              <td style={{ color: 'var(--text-2)', fontSize: 12 }}>{r.categoria_mae || '—'}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtNum(r.quantidade)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(r.receita)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtPct(r.pct_indiv, 3)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtPct(r.pct_acum, 2)}</td>
              <td><ClasseBadge classe={r.classe} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

// ===== Breakdown por marca/categoria (top 20 por receita) =====
const BreakdownTable = ({ rows, label, totalRows }) => {
  return (
    <table className="t" style={{ width: '100%' }}>
      <thead>
        <tr>
          <th>{label}</th>
          <th style={{ width: 100, textAlign: 'right' }}>Receita</th>
          <th style={{ width: 60, textAlign: 'right' }}>% Total</th>
          <th style={{ width: 50, textAlign: 'right' }}>Nº</th>
          <th style={{ width: 50, textAlign: 'right', color: '#10b981' }}>A</th>
          <th style={{ width: 50, textAlign: 'right', color: '#f59e0b' }}>B</th>
          <th style={{ width: 50, textAlign: 'right', color: '#ef4444' }}>C</th>
          <th style={{ width: 130 }}>Distribuição</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const key = r.marca || r.categoria;
          const receita = r.receita_marca != null ? r.receita_marca : r.receita_categoria;
          return (
            <tr key={i}>
              <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }} title={key}>{key}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(receita)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtPct(r.pct_receita_total, 1)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{r.n_total}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.n_a ? '#10b981' : 'var(--mute)' }}>{r.n_a}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.n_b ? '#f59e0b' : 'var(--mute)' }}>{r.n_b}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.n_c ? '#ef4444' : 'var(--mute)' }}>{r.n_c}</td>
              <td><StackedABCBar n_a={r.n_a} n_b={r.n_b} n_c={r.n_c} /></td>
            </tr>
          );
        })}
        {totalRows > rows.length && (
          <tr>
            <td colSpan="8" style={{ textAlign: 'center', padding: 8, color: 'var(--mute)', fontSize: 11 }}>
              … exibindo top {rows.length} de {totalRows}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

// ===== PageCurvaABCAstro V2 =====
const PageCurvaABCAstro = () => {
  const RAW = window.ABC_DATA;
  if (!RAW || !RAW.por_status) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          abc-data.js nao carregado ou desatualizado. Rode: <code>python scripts/build_abc_data.py</code>
        </div>
      </div>
    );
  }

  // ===== Estado reativo =====
  const [excluirCanc, setExcluirCanc] = useState(true);
  const [fMarca, setFMarca] = useState('');
  const [fCat, setFCat] = useState('');
  const [fClasse, setFClasse] = useState('');
  const [busca, setBusca] = useState('');
  const [sortKey, setSortKey] = useState('rank');
  const [sortDir, setSortDir] = useState('asc');

  // ===== Snapshot atual =====
  const D = excluirCanc ? RAW.por_status.excluindo_cancelado : RAW.por_status.incluindo_cancelado;
  const k = D.kpis;

  const setSort = (key) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      // Numericos default desc, textuais asc
      setSortDir(['receita', 'quantidade', 'pct_indiv'].indexOf(key) !== -1 ? 'desc' : 'asc');
    }
  };

  // ===== Produtos filtrados + ordenados =====
  const produtosFiltrados = useMemo(() => {
    let rows = D.curva_completa;
    if (fMarca) rows = rows.filter(r => (r.marca || '(sem marca)') === fMarca);
    if (fCat) rows = rows.filter(r => (r.categoria_mae || '(sem categoria)') === fCat);
    if (fClasse) rows = rows.filter(r => r.classe === fClasse);
    if (busca) {
      const q = busca.toLowerCase().trim();
      rows = rows.filter(r =>
        (r.seo_title && r.seo_title.toLowerCase().indexOf(q) !== -1) ||
        (r.codigo && String(r.codigo).toLowerCase().indexOf(q) !== -1)
      );
    }
    // Sort
    const sorted = rows.slice();
    sorted.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [D, fMarca, fCat, fClasse, busca, sortKey, sortDir]);

  // ===== Indicador Pareto Real x Ideal =====
  const paretoReal = k.pct_produtos_para_80pct_receita;
  const paretoStatus = paretoReal <= 0.20 ? 'Pareto perfeito' :
                       paretoReal <= 0.30 ? 'Próximo do ideal' :
                       'Mais espalhado que 80/20';

  // Top 20 breakdown por receita
  const marcasTop20 = D.por_marca.slice(0, 20);
  const categoriasTop20 = D.por_categoria.slice(0, 20);

  const classes = D.classes_resumo || [];

  return (
    <div className="page bi-dashboard-theme" style={{ padding: '20px 28px 40px' }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Curva ABC</b>
      </div>

      {/* === Storytelling === */}
      <div className="card" style={{ padding: 18, marginBottom: 22, borderLeft: '3px solid var(--cyan)' }}>
        <h2 className="card-title" style={{ marginBottom: 8 }}>Curva ABC · Concentração de receita por produto</h2>
        <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
          A Curva ABC identifica os produtos que concentram a receita. Cada produto (granularidade <code style={{ color: 'var(--cyan)' }}>seo_title</code>) é ordenado pela receita acumulada e classificado em três faixas:
          {' '}<ClasseBadge classe="A" /> os primeiros que somam até 80% da receita (alta concentração — manter foco),
          {' '}<ClasseBadge classe="B" /> entre 80% e 95% (revisar mix),
          {' '}<ClasseBadge classe="C" /> de 95% a 100% (candidatos a racionalização).
          {' '}Pelo princípio de Pareto, esperamos que ~20% dos SKUs respondam por 80% da receita — quanto mais próximo dessa razão, mais concentrado e gerenciável o portfólio.
        </p>
      </div>

      {/* === Toggle Excluir Cancelado === */}
      <div className="card" style={{ padding: 12, marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={excluirCanc} onChange={(e) => setExcluirCanc(e.target.checked)} style={{ width: 16, height: 16 }} />
            <span style={{ color: 'var(--text)' }}>Excluir vendas canceladas</span>
          </label>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>
            (default ON — toggle altera todos os números abaixo)
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          snapshot: <span style={{ color: excluirCanc ? 'var(--green)' : 'var(--amber)' }}>{excluirCanc ? 'excluindo_cancelado' : 'incluindo_cancelado'}</span>
        </div>
      </div>

      {/* === KPIs principais (4) === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Produtos no portfólio</div>
          <div className="kpi-value">{_abc_fmtNum(k.n_produtos_total)}</div>
          <div className="kpi-hint">seo_title distintos · {_abc_fmtBRLk(k.receita_total)} de receita</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">% Receita Classe A</div>
          <div className="kpi-value">{_abc_fmtPct(k.pct_receita_classe_a, 2)}</div>
          <div className="kpi-hint">{_abc_fmtBRLk(k.receita_classe_a)} concentrados nos top {k.n_produtos_a}</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">Produtos Classe A</div>
          <div className="kpi-value">{_abc_fmtNum(k.n_produtos_a)}</div>
          <div className="kpi-hint">{_abc_fmtPct(k.n_produtos_a / k.n_produtos_total, 1)} do catálogo gera ~80% da receita</div>
        </div>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Pareto Real vs 80/20</div>
          <div className="kpi-value">{_abc_fmtPct(paretoReal, 1)}</div>
          <div className="kpi-hint">{paretoStatus} (ideal: 20% prod = 80% rec)</div>
        </div>
      </div>

      {/* === Curva ABC SVG === */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="card-title">Curva ABC · % receita acumulada × % produtos acumulados</h2>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>
            passe o mouse sobre a curva para ver o produto no rank
          </span>
        </div>
        <AbcCurveSVG
          pareto_real={D.pareto_real}
          pareto_ideal={D.pareto_ideal}
          curva_completa={D.curva_completa}
          height={420}
        />
      </div>

      {/* === Resumo por classe === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>Resumo por classe</h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Classe</th>
              <th style={{ textAlign: 'right' }}>Nº produtos</th>
              <th style={{ textAlign: 'right' }}>% Catálogo</th>
              <th style={{ textAlign: 'right' }}>Receita</th>
              <th style={{ textAlign: 'right' }}>% Receita Total</th>
              <th style={{ textAlign: 'right' }}>Ticket médio</th>
              <th style={{ textAlign: 'right' }}>Margem estimada</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.classe}>
                <td><ClasseBadge classe={c.classe} /></td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtNum(c.n_produtos)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtPct(c.n_produtos / k.n_produtos_total, 1)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(c.receita)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtPct(c.pct_receita_total, 2)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtBRLk(c.ticket_medio)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                  {_abc_fmtBRLk(c.margem_estimada_valor)} <span style={{ fontSize: 10, color: 'var(--mute)' }}>({_abc_fmtPct(c.margem_estimada_pct, 0)})</span>
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
              <td>TOTAL</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtNum(k.n_produtos_total)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>100,0%</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(k.receita_total)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>100,00%</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(k.receita_total / k.n_produtos_total)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {_abc_fmtBRLk(classes.reduce((s, c) => s + (c.margem_estimada_valor || 0), 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* === Tabela reativa de produtos === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Explorar produtos
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        {/* Filtros reativos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: 10, marginBottom: 14, alignItems: 'center' }}>
          <select
            value={fMarca}
            onChange={(e) => setFMarca(e.target.value)}
            style={{ padding: '6px 8px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
          >
            <option value="">Marca (todas)</option>
            {D.filtros.marcas.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={fCat}
            onChange={(e) => setFCat(e.target.value)}
            style={{ padding: '6px 8px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
          >
            <option value="">Categoria (todas)</option>
            {D.filtros.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={fClasse}
            onChange={(e) => setFClasse(e.target.value)}
            style={{ padding: '6px 8px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
          >
            <option value="">Classe (todas)</option>
            <option value="A">Apenas A</option>
            <option value="B">Apenas B</option>
            <option value="C">Apenas C</option>
          </select>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar (seo_title ou código)"
            style={{ padding: '6px 8px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, gridColumn: 'span 2' }}
          />
          <button
            onClick={() => { setFMarca(''); setFCat(''); setFClasse(''); setBusca(''); setSortKey('rank'); setSortDir('asc'); }}
            style={{ padding: '6px 12px', background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
            title="Limpar filtros"
          >
            limpar
          </button>
        </div>
        <ProdutosTabela rows={produtosFiltrados} sortKey={sortKey} sortDir={sortDir} setSort={setSort} />
      </div>

      {/* === Breakdown marca + categoria lado a lado === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
        <div>
          <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
            Distribuição A/B/C por marca · Top {Math.min(20, D.por_marca.length)} de {D.por_marca.length}
          </h3>
          <div className="card">
            <BreakdownTable rows={marcasTop20} label="Marca" totalRows={D.por_marca.length} />
          </div>
        </div>
        <div>
          <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
            Distribuição A/B/C por categoria · Top {Math.min(20, D.por_categoria.length)} de {D.por_categoria.length}
          </h3>
          <div className="card">
            <BreakdownTable rows={categoriasTop20} label="Categoria" totalRows={D.por_categoria.length} />
          </div>
        </div>
      </div>

      {/* === Recomendações: top 50 A e bottom 50 C === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Recomendações de ação
      </h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
        {/* Manter foco */}
        <div className="card" style={{ borderLeft: '3px solid #10b981', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#10b981', marginBottom: 2 }}>MANTER FOCO · Top 50 Classe A</div>
            <div style={{ fontSize: 11, color: 'var(--mute)' }}>
              Estes 50 SKUs respondem por {_abc_fmtPct((D.top_50.reduce((s, r) => s + r.receita, 0)) / k.receita_total, 1)} da receita. Garantir estoque + capital de giro.
            </div>
          </div>
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table className="t" style={{ width: '100%', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Produto</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Receita</th>
                  <th style={{ width: 60, textAlign: 'right' }}>% Acum</th>
                </tr>
              </thead>
              <tbody>
                {D.top_50.map((r) => (
                  <tr key={r.rank}>
                    <td style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{r.rank}</td>
                    <td title={r.seo_title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{r.seo_title}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(r.receita)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtPct(r.pct_acum, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Avaliar descontinuar */}
        <div className="card" style={{ borderLeft: '3px solid #ef4444', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#ef4444', marginBottom: 2 }}>AVALIAR · Bottom 50 Classe C</div>
            <div style={{ fontSize: 11, color: 'var(--mute)' }}>
              Receita marginal · {_abc_fmtPct((D.bottom_50.reduce((s, r) => s + r.receita, 0)) / k.receita_total, 3)} do total nestes 50. Candidatos a racionalização do catálogo.
            </div>
          </div>
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table className="t" style={{ width: '100%', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                <tr>
                  <th style={{ width: 50 }}>Rank</th>
                  <th>Produto</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Receita</th>
                  <th style={{ width: 60, textAlign: 'right' }}>Qtd</th>
                </tr>
              </thead>
              <tbody>
                {D.bottom_50.map((r) => (
                  <tr key={r.rank}>
                    <td style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{r.rank}</td>
                    <td title={r.seo_title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{r.seo_title}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_abc_fmtBRLk(r.receita)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_abc_fmtNum(r.quantidade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// Registra no escopo do bundle pra PAGE_COMPS do App raiz pegar
Object.assign(window, { PageCurvaABCAstro });
