/**
 * pages-cohort.jsx — Cohort triangular (Valor + Vendas) · Astro PBI 16 e 17.
 *
 * Replica fielmente as telas do Power BI:
 *  - Linhas = mes da PRIMEIRA compra do cliente (cohort, ex.: 2024-01)
 *  - Colunas = mes de atividade (mesma dimensao temporal)
 *  - Celulas = R$ valor ou contagem n_pedidos daquele cohort naquele mes
 *  - Linha total e coluna total no rodape/direita
 *  - Linha "% retencao" embaixo do cohort focado (= n_clientes_ativos / n_clientes_cohort)
 *
 * Dados: window.COHORT_DATA (scripts/build_cohort_data.py).
 * Helpers globais usados (definidos em pages-astro.jsx): _fmtBRL, _fmtBRLk, _fmtNum.
 *
 * Toggle Valor/Vendas alterna metrica (valor_rateado vs n_pedidos). Hover na celula
 * mostra detalhes; clicar destaca cohort e mostra linha de % retencao.
 */

// ===== Helpers locais =====
const _MES_LABELS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const _fmtMes = (ym) => {
  // "2024-03" -> "mar/24"
  if (!ym || ym.length < 7) return ym || '';
  const [y, m] = ym.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${_MES_LABELS_PT[idx] || m}/${y.slice(2)}`;
};

// gradient surface → cyan (mesma do CoortesHeatmap de pages-recompra.jsx).
const _heatColorC = (v, vMin, vMax) => {
  if (v == null || !isFinite(v) || v <= 0) return 'rgba(255,255,255,0.03)';
  const denom = Math.max(0.0001, vMax - vMin);
  // sqrt pra dar contraste em distribuicoes long-tail (poucos picos enormes na diagonal)
  const t = Math.sqrt(Math.max(0, Math.min(1, (v - vMin) / denom)));
  const r = Math.round(38 + (34 - 38) * t);
  const g = Math.round(42 + (211 - 42) * t);
  const b = Math.round(58 + (238 - 58) * t);
  return `rgba(${r}, ${g}, ${b}, ${0.22 + 0.7 * t})`;
};

const _textOn = (t) => (t > 0.45 ? '#0c111c' : '#cbd5e1');

// ===== Page =====
function PageCohort() {
  const D = window.COHORT_DATA;
  const [metric, setMetric] = useState('valor');   // 'valor' | 'vendas'
  const [focused, setFocused] = useState(null);    // cohort selecionado (string) ou null
  const [hover, setHover] = useState(null);        // {cohort, mes} ou null

  if (!D || !D.cohorts || !D.cells) {
    return (
      <div className="content">
        <div style={{ padding: 24, color: 'var(--mute)' }}>
          window.COHORT_DATA ausente. Rode <code>python scripts/build_cohort_data.py</code> e rebuilde.
        </div>
      </div>
    );
  }

  // ===== Indices reativos =====
  const { cohorts, meses, cellMap, vMax, vTotal, nTotal } = useMemo(() => {
    const cohortsAll = [...D.cohorts].sort();
    const mesesAll = [...D.meses].sort();
    const map = {};
    let vmax = 0, vtot = 0, ntot = 0;
    for (const c of D.cells) {
      const k = c.cohort + '|' + c.mes;
      map[k] = c;
      const val = metric === 'valor' ? c.valor : c.n_pedidos;
      if (val > vmax) vmax = val;
      vtot += c.valor;
      ntot += c.n_pedidos;
    }
    return { cohorts: cohortsAll, meses: mesesAll, cellMap: map, vMax: vmax, vTotal: vtot, nTotal: ntot };
  }, [D, metric]);

  // dominio do heatmap: ignora a diagonal (mes_n=0) que e bem maior pra dar contraste
  // pras retencoes. Calcula max excluindo mes_n=0.
  const vMaxOffDiag = useMemo(() => {
    let m = 0;
    for (const c of D.cells) {
      if (c.mes_n === 0) continue;
      const val = metric === 'valor' ? c.valor : c.n_pedidos;
      if (val > m) m = val;
    }
    return m || vMax;
  }, [D, metric, vMax]);

  // formatador da metrica atual
  const fmt = metric === 'valor' ? _fmtBRL : _fmtNum;
  const fmtK = metric === 'valor' ? _fmtBRLk : ((v) => _fmtNum(v, 0));

  // ===== Render =====
  const cellW = 86, cellH = 22, cohortLabelW = 86, leftPad = 8;
  const tableW = cohortLabelW + cellW * meses.length + 110; // 110 = coluna Total
  const tableH = 36 + cellH * (cohorts.length + 1) + (focused ? 36 : 0); // +1 total row

  return (
    <div className="content" style={{ paddingTop: 12 }}>
      {/* ===== Header com toggle ===== */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 3,
            color: 'var(--cyan)', textTransform: 'uppercase',
          }}>Cohort triangular</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 0', color: 'var(--text)' }}>
            {metric === 'valor' ? 'Cohort do Valor de Vendas' : 'Cohort do Numero de Vendas'}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>
            Linhas = mes da 1a compra · Colunas = mes de atividade · {cohorts.length} cohorts × {meses.length} meses
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 8 }}>
          <button
            onClick={() => setMetric('valor')}
            style={{
              background: metric === 'valor' ? 'var(--cyan)' : 'transparent',
              color: metric === 'valor' ? '#0c111c' : 'var(--text-2)',
              border: 'none', padding: '8px 16px', borderRadius: 6,
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
            }}
          >Valor (R$)</button>
          <button
            onClick={() => setMetric('vendas')}
            style={{
              background: metric === 'vendas' ? 'var(--cyan)' : 'transparent',
              color: metric === 'vendas' ? '#0c111c' : 'var(--text-2)',
              border: 'none', padding: '8px 16px', borderRadius: 6,
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
            }}
          >Vendas (n_pedidos)</button>
        </div>
      </div>

      {/* ===== KPI strip ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="kpi-card" style={_kpiBox}>
          <div style={_kpiLab}>Valor total acumulado</div>
          <div style={_kpiVal}>{_fmtBRLk(vTotal)}</div>
        </div>
        <div className="kpi-card" style={_kpiBox}>
          <div style={_kpiLab}>Pedidos totais</div>
          <div style={_kpiVal}>{_fmtNum(nTotal)}</div>
        </div>
        <div className="kpi-card" style={_kpiBox}>
          <div style={_kpiLab}>Cohorts</div>
          <div style={_kpiVal}>{cohorts.length}</div>
        </div>
        <div className="kpi-card" style={_kpiBox}>
          <div style={_kpiLab}>Clientes (1a compra)</div>
          <div style={_kpiVal}>{_fmtNum(Object.values(D.cohort_sizes).reduce((a, b) => a + b, 0))}</div>
        </div>
      </div>

      {/* ===== Hover tooltip (canto sup. dir.) ===== */}
      {hover && cellMap[hover.cohort + '|' + hover.mes] && (
        <div style={{
          background: 'rgba(13,18,30,0.95)', border: '1px solid var(--cyan)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 10,
          fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)',
          display: 'inline-block',
        }}>
          {(() => {
            const c = cellMap[hover.cohort + '|' + hover.mes];
            const mes_n = c.mes_n;
            return (
              <>
                <b style={{ color: 'var(--cyan)' }}>Cohort {_fmtMes(c.cohort)}</b>
                {' '}× <b>{_fmtMes(c.mes)}</b>
                {' '}(M+{mes_n})
                <br />
                Valor: <b>{_fmtBRL(c.valor)}</b> · Pedidos: <b>{_fmtNum(c.n_pedidos)}</b>
                {' · '}Ativos: <b>{_fmtNum(c.n_clientes_ativos)}</b>
                {' / '}{_fmtNum(c.n_clientes_cohort)} ({((c.n_clientes_ativos/Math.max(1,c.n_clientes_cohort))*100).toFixed(1)}%)
              </>
            );
          })()}
        </div>
      )}

      {/* ===== Matriz triangular ===== */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 8,
        overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <svg width={tableW} height={tableH} viewBox={`0 0 ${tableW} ${tableH}`} style={{ display: 'block' }}>
          {/* header de meses */}
          <text x={leftPad + cohortLabelW/2} y={20} textAnchor="middle"
                style={{ fontSize: 10, fill: 'var(--mute)', fontWeight: 600 }}>Cohort \ Mes</text>
          {meses.map((m, ci) => (
            <text key={m} x={leftPad + cohortLabelW + ci * cellW + cellW/2} y={20}
                  textAnchor="middle"
                  style={{ fontSize: 10, fill: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace' }}>
              {_fmtMes(m)}
            </text>
          ))}
          <text x={leftPad + cohortLabelW + meses.length * cellW + 55} y={20}
                textAnchor="middle"
                style={{ fontSize: 10, fill: 'var(--cyan)', fontWeight: 700 }}>Total</text>

          {/* linhas de cohort */}
          {cohorts.map((cohort, ri) => {
            const rowY = 30 + ri * cellH;
            const isFocused = focused === cohort;
            return (
              <g key={cohort}>
                {/* label do cohort */}
                <text x={leftPad + cohortLabelW - 6} y={rowY + cellH/2 + 4} textAnchor="end"
                      onClick={() => setFocused(isFocused ? null : cohort)}
                      style={{
                        fontSize: 10, cursor: 'pointer',
                        fill: isFocused ? 'var(--cyan)' : 'var(--text-2)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: isFocused ? 700 : 500,
                      }}>
                  {_fmtMes(cohort)}
                </text>

                {meses.map((mes, ci) => {
                  // celula triangular: so renderiza se mes >= cohort
                  if (mes < cohort) {
                    return (
                      <rect key={mes} x={leftPad + cohortLabelW + ci * cellW + 1} y={rowY + 1}
                            width={cellW - 2} height={cellH - 2} fill="rgba(255,255,255,0.015)" rx={2} />
                    );
                  }
                  const c = cellMap[cohort + '|' + mes];
                  if (!c) return null;
                  const val = metric === 'valor' ? c.valor : c.n_pedidos;
                  const isDiag = c.mes_n === 0;
                  // diagonal usa escala propria (max do dominio inteiro) pra ficar saturada
                  const fill = isDiag
                    ? 'rgba(34,211,238,0.65)'
                    : _heatColorC(val, 0, vMaxOffDiag);
                  const tNorm = isDiag
                    ? 0.65
                    : Math.sqrt(Math.max(0, Math.min(1, val / Math.max(1, vMaxOffDiag))));
                  const isHover = hover && hover.cohort === cohort && hover.mes === mes;
                  const rowDim = focused && !isFocused ? 0.35 : 1;
                  return (
                    <g key={mes}
                       onMouseEnter={() => setHover({ cohort, mes })}
                       onMouseLeave={() => setHover(null)}
                       onClick={() => setFocused(isFocused ? null : cohort)}
                       style={{ cursor: 'pointer', opacity: rowDim }}>
                      <rect
                        x={leftPad + cohortLabelW + ci * cellW + 1}
                        y={rowY + 1}
                        width={cellW - 2}
                        height={cellH - 2}
                        fill={fill}
                        stroke={isHover ? 'var(--cyan)' : (isFocused ? 'rgba(34,211,238,0.5)' : 'transparent')}
                        strokeWidth={isHover ? 1.5 : (isFocused ? 1 : 0)}
                        rx={2}
                      />
                      {val > 0 && (
                        <text
                          x={leftPad + cohortLabelW + ci * cellW + cellW/2}
                          y={rowY + cellH/2 + 3.5}
                          textAnchor="middle"
                          style={{
                            fontSize: 9, fill: _textOn(tNorm),
                            fontFamily: 'JetBrains Mono, monospace',
                            pointerEvents: 'none',
                            fontWeight: isDiag ? 700 : 500,
                          }}>
                          {fmtK(val)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* total da linha */}
                {(() => {
                  const tot = D.totals_row[cohort];
                  if (!tot) return null;
                  const v = metric === 'valor' ? tot.valor : tot.n_pedidos;
                  return (
                    <g>
                      <rect x={leftPad + cohortLabelW + meses.length * cellW + 6} y={rowY + 1}
                            width={100} height={cellH - 2} fill="rgba(34,211,238,0.12)" rx={2} />
                      <text x={leftPad + cohortLabelW + meses.length * cellW + 56} y={rowY + cellH/2 + 3.5}
                            textAnchor="middle"
                            style={{ fontSize: 9, fill: 'var(--cyan)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmtK(v)}
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* linha total (coluna por coluna = total daquele mes) */}
          {(() => {
            const rowY = 30 + cohorts.length * cellH + 4;
            return (
              <g>
                <text x={leftPad + cohortLabelW - 6} y={rowY + cellH/2 + 4} textAnchor="end"
                      style={{ fontSize: 10, fill: 'var(--cyan)', fontWeight: 700 }}>
                  Total
                </text>
                {meses.map((mes, ci) => {
                  const tot = D.totals_col[mes];
                  if (!tot) return null;
                  const v = metric === 'valor' ? tot.valor : tot.n_pedidos;
                  return (
                    <g key={mes}>
                      <rect x={leftPad + cohortLabelW + ci * cellW + 1} y={rowY + 1}
                            width={cellW - 2} height={cellH - 2}
                            fill="rgba(34,211,238,0.12)" rx={2} />
                      <text x={leftPad + cohortLabelW + ci * cellW + cellW/2} y={rowY + cellH/2 + 3.5}
                            textAnchor="middle"
                            style={{ fontSize: 9, fill: 'var(--cyan)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmtK(v)}
                      </text>
                    </g>
                  );
                })}
                {/* grand total */}
                <g>
                  <rect x={leftPad + cohortLabelW + meses.length * cellW + 6} y={rowY + 1}
                        width={100} height={cellH - 2} fill="rgba(34,211,238,0.25)" rx={2} />
                  <text x={leftPad + cohortLabelW + meses.length * cellW + 56} y={rowY + cellH/2 + 3.5}
                        textAnchor="middle"
                        style={{ fontSize: 9, fill: '#0c111c', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmtK(metric === 'valor' ? vTotal : nTotal)}
                  </text>
                </g>
              </g>
            );
          })()}

          {/* linha de % retencao (so quando cohort focado) */}
          {focused && (() => {
            const rowY = 30 + cohorts.length * cellH + cellH + 12;
            const size = D.totals_row[focused]?.n_clientes_cohort || 1;
            return (
              <g>
                <text x={leftPad + cohortLabelW - 6} y={rowY + cellH/2 + 4} textAnchor="end"
                      style={{ fontSize: 10, fill: 'var(--amber)', fontWeight: 700 }}>
                  % Retencao
                </text>
                {meses.map((mes, ci) => {
                  if (mes < focused) return null;
                  const c = cellMap[focused + '|' + mes];
                  if (!c) return null;
                  const pct = c.n_clientes_ativos / Math.max(1, size);
                  return (
                    <g key={mes}>
                      <rect x={leftPad + cohortLabelW + ci * cellW + 1} y={rowY + 1}
                            width={cellW - 2} height={cellH - 2}
                            fill={`rgba(245,158,11,${0.15 + pct * 0.6})`} rx={2} />
                      <text x={leftPad + cohortLabelW + ci * cellW + cellW/2} y={rowY + cellH/2 + 3.5}
                            textAnchor="middle"
                            style={{ fontSize: 9, fill: pct > 0.4 ? '#0c111c' : 'var(--amber)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                        {(pct * 100).toFixed(0)}%
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })()}
        </svg>
      </div>

      {focused && (
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: 'rgba(245,158,11,0.06)', borderLeft: '3px solid var(--amber)',
          borderRadius: 6, fontSize: 12, color: 'var(--text-2)',
        }}>
          Cohort <b>{_fmtMes(focused)}</b> selecionado · {_fmtNum(D.totals_row[focused]?.n_clientes_cohort || 0)} clientes adquiridos.
          {' '}<button onClick={() => setFocused(null)} style={{
            background: 'transparent', color: 'var(--cyan)', border: 'none', cursor: 'pointer',
            textDecoration: 'underline', fontSize: 12,
          }}>limpar selecao</button>
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
        <b>Como ler:</b> cada linha e um cohort (mes da 1a compra do cliente). A diagonal (M+0)
        mostra o valor inicial. As celulas a direita mostram quanto aquele cohort gastou nos
        meses seguintes — quanto mais brilhante o ciano, maior o valor (escala compativel entre
        cohorts, exclui a diagonal pra dar contraste). Clique no rotulo do cohort pra ver a linha
        de % retencao em laranja.
      </div>
    </div>
  );
}

// Style helpers locais (mesmo padrao das outras pages-astro)
const _kpiBox = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10, padding: '12px 14px',
};
const _kpiLab = {
  fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
  color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 4,
};
const _kpiVal = {
  fontSize: 22, fontWeight: 700, color: 'var(--cyan)',
  fontFamily: 'JetBrains Mono, monospace',
};

// Registra no window pro App raiz montar via PAGE_COMPS
window.PageCohort = PageCohort;
