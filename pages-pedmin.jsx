/**
 * pages-pedmin.jsx V2 — "Pedido Minimo x LTV" REATIVO com slider.
 *
 * Dados: window.PEDMIN_DATA (scripts/build_pedmin_data.py sobre vendas_tiny_bu.parquet).
 *
 * Estudo solicitado por Filipe (29/04/2026). Storytelling preservado literal.
 * Slider de corte (R$ 50-2000, step 50) recomputa instantaneamente todos KPIs
 * abaixo via useMemo + interpolacao linear sobre cenarios pre-computados.
 *
 * Helpers globais: AstroBarV, AstroDonut, _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct.
 */

const PagePedidoMinimo = () => {
  const D = window.PEDMIN_DATA;
  const { useState, useMemo } = React;

  // Hooks devem ser chamados antes de qualquer early return
  const [corte, setCorte] = useState(500);
  const [faixaAtiva, setFaixaAtiva] = useState(null);

  // Cenario interpolado pra valor exato do slider ----------------------------
  // Como pre-computamos cenarios em pontos discretos [50,100,...,2000],
  // pra qualquer X entre eles fazemos interpolacao linear (suave + barato).
  const cenarioInterp = useMemo(() => {
    if (!D || !D.cenarios_corte_completo) return null;
    const arr = D.cenarios_corte_completo;
    // se bate exato em um ponto
    const exato = arr.find(c => c.corte === corte);
    if (exato) return exato;
    // interpolar entre 2 pontos vizinhos
    let lo = arr[0], hi = arr[arr.length - 1];
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i].corte <= corte && arr[i+1].corte >= corte) {
        lo = arr[i]; hi = arr[i+1]; break;
      }
    }
    if (corte <= arr[0].corte) return arr[0];
    if (corte >= arr[arr.length-1].corte) return arr[arr.length-1];
    const t = (corte - lo.corte) / (hi.corte - lo.corte || 1);
    const lerp = (a, b) => a + (b - a) * t;
    const lerpInt = (a, b) => Math.round(a + (b - a) * t);
    return {
      corte,
      label: `R$ ${corte}`,
      n_pedidos_cortados: lerpInt(lo.n_pedidos_cortados, hi.n_pedidos_cortados),
      pct_pedidos_cortados: lerp(lo.pct_pedidos_cortados, hi.pct_pedidos_cortados),
      receita_perdida: lerp(lo.receita_perdida, hi.receita_perdida),
      pct_receita_perdida: lerp(lo.pct_receita_perdida, hi.pct_receita_perdida),
      n_clientes_perdidos: lerpInt(lo.n_clientes_perdidos, hi.n_clientes_perdidos),
      pct_clientes_perdidos: lerp(lo.pct_clientes_perdidos, hi.pct_clientes_perdidos),
      ltv_medio_perdidos: lerp(lo.ltv_medio_perdidos, hi.ltv_medio_perdidos),
      receita_historica_perdidos: lerp(lo.receita_historica_perdidos, hi.receita_historica_perdidos),
      custo_operacional_eliminado: lerp(lo.custo_operacional_eliminado, hi.custo_operacional_eliminado),
      saldo_liquido: lerp(lo.saldo_liquido, hi.saldo_liquido),
      recomenda: lerp(lo.saldo_liquido, hi.saldo_liquido) > 0,
    };
  }, [D, corte]);

  // Faixa do histograma onde o corte atual cai (pra desenhar linha vertical)
  const faixaIdxCorte = useMemo(() => {
    if (!D || !D.histograma_detalhado) return -1;
    for (let i = 0; i < D.histograma_detalhado.length; i++) {
      const f = D.histograma_detalhado[i];
      const hi = f.hi == null ? Infinity : f.hi;
      if (corte >= f.lo && corte < hi) return i;
    }
    return -1;
  }, [D, corte]);

  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          pedmin-data.js nao carregado. Rode: <code>python scripts/build_pedmin_data.py</code>
        </div>
      </div>
    );
  }

  const K = D.kpis_geral;
  const H = D.histograma_detalhado;
  const C = D.cenarios_corte_completo;
  const L = D.ltv_por_maior_pedido_faixa;
  const PJ = D.pf_vs_pj;
  const PJFaixa = D.pf_vs_pj_por_faixa;
  const TopBaixo = D.top_50_clientes_unicos_baixo;
  const Pareto = D.distribuicao_acumulada;
  const periodo = D.periodo;

  const saldoColor = (s) => s >= 0 ? 'var(--green)' : 'var(--red)';

  // === Histograma SVG custom com linha vertical de corte ====================
  const HistogramaComCorte = ({ values, labels, color, height, fmt, corteFaixaIdx }) => {
    if (!values || !values.length) return <div className="empty">sem dados</div>;
    const max = Math.max(...values, 1);
    const palette = { cyan: '#22d3ee', green: '#10b981', amber: '#f59e0b', violet: '#a78bfa', red: '#ef4444' };
    const color1 = palette[color] || palette.cyan;
    const N = values.length;
    const W = 600, H = height || 240;
    const padT = 28, padB = 26, padL = 8, padR = 8;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const barW = Math.min(48, (innerW / N) * 0.7);
    const gap = (innerW - barW * N) / Math.max(1, N - 1) || 0;
    // posicao x do corte (centro da faixa onde cai)
    let corteX = null;
    if (corteFaixaIdx != null && corteFaixaIdx >= 0) {
      corteX = padL + corteFaixaIdx * (barW + gap) + barW + gap/2;
    }
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
        {values.map((v, i) => {
          const h = (v / max) * innerH;
          const x = padL + i * (barW + gap);
          const y = padT + (innerH - h);
          const isActive = faixaAtiva === i;
          return (
            <g key={i}
               onClick={() => setFaixaAtiva(faixaAtiva === i ? null : i)}
               style={{ cursor: 'pointer' }}>
              <rect
                x={x} y={y} width={barW} height={Math.max(2, h)}
                rx="4"
                fill={color1}
                opacity={isActive ? 1 : (faixaAtiva != null ? 0.45 : 0.9)}
              />
              <text x={x + barW/2} y={y - 6} textAnchor="middle"
                    style={{ fontSize: 11, fill: '#cbd5e1', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(v)}</text>
              <text x={x + barW/2} y={H - 8} textAnchor="middle"
                    style={{ fontSize: 10, fill: '#94a3b8' }}>{labels[i]}</text>
            </g>
          );
        })}
        {corteX != null && (
          <g>
            <line x1={corteX} y1={padT - 8} x2={corteX} y2={H - padB + 6}
                  stroke="#ef4444" strokeWidth="2" strokeDasharray="5,3" />
            <rect x={corteX - 38} y={padT - 22} width={76} height={16} rx="3" fill="#ef4444" opacity="0.9" />
            <text x={corteX} y={padT - 10} textAnchor="middle"
                  style={{ fontSize: 10, fill: '#fff', fontWeight: 600 }}>
              corte R$ {corte}
            </text>
          </g>
        )}
      </svg>
    );
  };

  // === Curva de Pareto SVG ==================================================
  const ParetoCurve = ({ data, corte, height }) => {
    if (!data || !data.length) return <div className="empty">sem dados</div>;
    const W = 600, H = height || 260;
    const padL = 40, padR = 14, padT = 18, padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const pts = data.map(d => {
      const x = padL + d.pct_pedidos * innerW;
      const y = padT + innerH - d.pct_receita * innerH;
      return [x, y];
    });
    const path = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
    const area = `${path} L ${pts[pts.length-1][0]} ${padT + innerH} L ${pts[0][0]} ${padT + innerH} Z`;
    // valor_corte_neste_ponto: achar pct_pedidos onde valor >= corte
    let corteXPct = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i].valor_corte_neste_ponto >= corte) {
        corteXPct = data[i].pct_pedidos;
        break;
      }
      corteXPct = data[i].pct_pedidos;
    }
    const corteX = padL + corteXPct * innerW;
    const gradId = `pareto-grad-${Math.random().toString(36).slice(2,8)}`;
    // Pra achar pct_receita no ponto do corte
    let corteY = padT + innerH;
    for (let i = 0; i < data.length; i++) {
      if (data[i].valor_corte_neste_ponto >= corte) {
        corteY = padT + innerH - data[i].pct_receita * innerH;
        break;
      }
      corteY = padT + innerH - data[i].pct_receita * innerH;
    }
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid e eixos */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
          <g key={i}>
            <line x1={padL} y1={padT + innerH - pct * innerH} x2={padL + innerW} y2={padT + innerH - pct * innerH}
                  stroke="#334155" strokeWidth="0.5" strokeDasharray="2,3" />
            <text x={padL - 6} y={padT + innerH - pct * innerH + 4} textAnchor="end"
                  style={{ fontSize: 10, fill: '#94a3b8' }}>{Math.round(pct*100)}%</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
          <text key={i} x={padL + pct * innerW} y={H - 8} textAnchor="middle"
                style={{ fontSize: 10, fill: '#94a3b8' }}>{Math.round(pct*100)}%</text>
        ))}
        {/* Linha 45 grau referencia */}
        <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT} stroke="#475569" strokeWidth="0.5" strokeDasharray="3,3" />
        {/* Area + curva */}
        <path d={area} fill={`url(#${gradId})`} />
        <path d={path} stroke="#22d3ee" strokeWidth="2" fill="none" />
        {/* Linha de corte vertical */}
        <line x1={corteX} y1={padT} x2={corteX} y2={padT + innerH}
              stroke="#ef4444" strokeWidth="2" strokeDasharray="5,3" />
        <circle cx={corteX} cy={corteY} r="5" fill="#ef4444" />
        <rect x={Math.min(corteX + 6, W - 130)} y={corteY - 18} width={120} height={32} rx="3" fill="#0f172a" stroke="#ef4444" />
        <text x={Math.min(corteX + 12, W - 124)} y={corteY - 4}
              style={{ fontSize: 10, fill: '#fff' }}>
          corte R$ {corte}
        </text>
        <text x={Math.min(corteX + 12, W - 124)} y={corteY + 9}
              style={{ fontSize: 10, fill: '#cbd5e1' }}>
          {_fmtPct(corteXPct)} ped · {_fmtPct(data.find(d => d.valor_corte_neste_ponto >= corte)?.pct_receita || 0, 2)} rec
        </text>
        {/* Labels eixos */}
        <text x={padL + innerW/2} y={H - 1} textAnchor="middle"
              style={{ fontSize: 10, fill: '#94a3b8' }}>% pedidos acumulados (ordem crescente de valor)</text>
        <text x={10} y={padT + innerH/2} textAnchor="middle" transform={`rotate(-90 10 ${padT + innerH/2})`}
              style={{ fontSize: 10, fill: '#94a3b8' }}>% receita acumulada</text>
      </svg>
    );
  };

  // === Detalhe da faixa ativa ===
  const detalheFaixaAtiva = faixaAtiva != null && H[faixaAtiva] ? H[faixaAtiva] : null;

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Pedido Mínimo</b>
      </div>

      {/* === Hero / Storytelling === */}
      <div className="card" style={{ padding: 22, marginBottom: 18, background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(139,92,246,0.06))' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0, marginBottom: 10 }}>
          Pedido mínimo × LTV do cliente — vale a pena cortar?
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, marginBottom: 14, lineHeight: 1.55 }}>
          Instituir pedido mínimo de R$ X custaria quanto em receita? Os clientes que ficariam de fora — têm LTV alto (perda real) ou são compradores únicos (perda baixa)? Análise sobre <b>{_fmtNum(K.total_pedidos)}</b> pedidos de <b>{_fmtNum(K.total_clientes_unicos)}</b> clientes ({periodo.inicio} → {periodo.fim}).
        </p>
        <div style={{
          padding: '12px 14px',
          background: 'rgba(15,23,42,0.5)',
          borderLeft: '3px solid var(--cyan)',
          borderRadius: 4,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: 'var(--text-2)',
        }}>
          <div style={{ marginBottom: 6 }}>
            <b style={{ color: 'var(--cyan)' }}>Filipe (29/04/26):</b> <i>"Se eu delimito um pedido mínimo de R$ 500, quanto que eu deixo de vender se eu analisar os últimos meses? Chegar a 0,3%."</i>
          </div>
          <div style={{ marginBottom: 6 }}>
            <b style={{ color: 'var(--violet)' }}>Vitor:</b> <i>"Faz um histograma, bota uma linha dos R$ 500, só pra enxergar, pra baixo, quantos por cento ficam, e olha o LTV desses clientes também. Daí a gente faz um cruzamento."</i>
          </div>
          <div style={{ marginBottom: 6 }}>
            <b style={{ color: 'var(--cyan)' }}>Filipe:</b> <i>"se o cara compra pelo CPF, que compra menos de R$ 200, não é um cara que vai ter que comprar todo mês."</i>
          </div>
          <div>
            <b style={{ color: 'var(--violet)' }}>Vitor:</b> <i>cuidado pra não descartar cliente que recompra muito.</i>
          </div>
        </div>
      </div>

      {/* === KPIs gerais === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Pedidos</div>
          <div className="kpi-value">{_fmtNum(K.total_pedidos)}</div>
          <div className="kpi-hint">não cancelados</div>
        </div>
        <div className="kpi-tile violet">
          <div className="kpi-label">Clientes únicos</div>
          <div className="kpi-value">{_fmtNum(K.total_clientes_unicos)}</div>
          <div className="kpi-hint">CPF/CNPJ distinto</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Receita total</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(K.receita_total).replace('R$ ', '')}</div>
          <div className="kpi-hint">Σ total_pedido</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">Ticket médio · LTV</div>
          <div className="kpi-value">{_fmtBRL(K.ticket_medio_global)}</div>
          <div className="kpi-hint">LTV {_fmtBRL(K.ltv_medio_global)}</div>
        </div>
      </div>

      {/* === SIMULADOR REATIVO === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Simulador — "se o pedido mínimo fosse R$ X"
      </h3>
      <div className="card" style={{ padding: 20, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>Pedido mínimo (R$)</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'JetBrains Mono, monospace' }}>
              R$ {corte.toLocaleString('pt-BR')}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <input
              type="range"
              min="50"
              max="2000"
              step="50"
              value={corte}
              onChange={(e) => setCorte(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer', height: 6 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--mute)', marginTop: 4 }}>
              <span>R$ 50</span>
              <span>R$ 500</span>
              <span>R$ 1.000</span>
              <span>R$ 1.500</span>
              <span>R$ 2.000</span>
            </div>
          </div>
        </div>

        {/* 4 KPI tiles dinâmicos */}
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 12 }}>
          <div className="kpi-tile red">
            <div className="kpi-label">Receita perdida</div>
            <div className="kpi-value" style={{ color: 'var(--red)' }}>{_fmtBRLk(cenarioInterp.receita_perdida)}</div>
            <div className="kpi-hint">{_fmtPct(cenarioInterp.pct_receita_perdida, 2)} da receita · {_fmtNum(cenarioInterp.n_pedidos_cortados)} pedidos cortados</div>
          </div>
          <div className="kpi-tile amber">
            <div className="kpi-label">Clientes perdidos (efetivos)</div>
            <div className="kpi-value">{_fmtNum(cenarioInterp.n_clientes_perdidos)}</div>
            <div className="kpi-hint">{_fmtPct(cenarioInterp.pct_clientes_perdidos)} da base · nunca passou do corte</div>
          </div>
          <div className="kpi-tile violet">
            <div className="kpi-label">LTV médio dos perdidos</div>
            <div className="kpi-value">{_fmtBRL(cenarioInterp.ltv_medio_perdidos)}</div>
            <div className="kpi-hint">se &lt; ticket médio, são "descartáveis"</div>
          </div>
          <div className="kpi-tile" style={{
            background: cenarioInterp.saldo_liquido >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            borderColor: cenarioInterp.saldo_liquido >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
          }}>
            <div className="kpi-label">Saldo líquido</div>
            <div className="kpi-value" style={{ color: saldoColor(cenarioInterp.saldo_liquido), fontWeight: 700 }}>
              {_fmtBRLk(cenarioInterp.saldo_liquido)}
            </div>
            <div className="kpi-hint">
              custo elim. {_fmtBRLk(cenarioInterp.custo_operacional_eliminado)} − receita perdida
              {cenarioInterp.saldo_liquido >= 0 ? ' → ✓ recomenda' : ' → ✗ destrói valor'}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--mute)', lineHeight: 1.5, marginTop: 8 }}>
          Premissa de custo operacional: <b>R$ {D.premissas.custo_op_por_pedido}/pedido</b> (separação + embalagem + emissão NF + atendimento + frete subsidiado). Calibrar com financeiro.
          Cenários pré-computados em pontos discretos; valor entre eles interpolado linearmente.
        </div>
      </div>

      {/* === Histograma + linha de corte === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Distribuição dos pedidos por faixa
        <span style={{ fontSize: 11, color: 'var(--mute)', fontWeight: 400, marginLeft: 12 }}>
          (clique numa faixa pra ver detalhe abaixo · linha vermelha = corte do slider)
        </span>
      </h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Nº de pedidos por faixa</h2></div>
          <HistogramaComCorte
            values={H.map(h => h.n_pedidos)}
            labels={H.map(h => h.faixa)}
            color="cyan"
            height={260}
            fmt={(v) => _fmtNum(v)}
            corteFaixaIdx={faixaIdxCorte}
          />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Receita por faixa</h2></div>
          <HistogramaComCorte
            values={H.map(h => h.receita)}
            labels={H.map(h => h.faixa)}
            color="green"
            height={260}
            fmt={_fmtBRLk}
            corteFaixaIdx={faixaIdxCorte}
          />
        </div>
      </div>

      {/* Detalhe da faixa clicada */}
      {detalheFaixaAtiva && (
        <div className="card" style={{ marginBottom: 22, background: 'rgba(34,211,238,0.04)', borderColor: 'rgba(34,211,238,0.2)' }}>
          <div className="card-title-row">
            <h2 className="card-title">Faixa selecionada: <span style={{ color: 'var(--cyan)' }}>{detalheFaixaAtiva.faixa}</span></h2>
            <button onClick={() => setFaixaAtiva(null)} style={{
              background: 'transparent', border: '1px solid var(--border-2)', color: 'var(--mute)',
              padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}>limpar</button>
          </div>
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, fontSize: 12 }}>
            <div><div style={{ color: 'var(--mute)' }}>Nº pedidos</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>{_fmtNum(detalheFaixaAtiva.n_pedidos)}</div><div style={{ color: 'var(--text-2)' }}>{_fmtPct(detalheFaixaAtiva.pct_pedidos)}</div></div>
            <div><div style={{ color: 'var(--mute)' }}>Receita</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(detalheFaixaAtiva.receita)}</div><div style={{ color: 'var(--text-2)' }}>{_fmtPct(detalheFaixaAtiva.pct_receita)}</div></div>
            <div><div style={{ color: 'var(--mute)' }}>Clientes únicos</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>{_fmtNum(detalheFaixaAtiva.n_clientes_unicos)}</div></div>
            <div><div style={{ color: 'var(--mute)' }}>Ticket médio</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>{_fmtBRL(detalheFaixaAtiva.ticket_medio_faixa)}</div></div>
            <div><div style={{ color: 'var(--mute)' }}>Receita / cliente</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>{_fmtBRL(detalheFaixaAtiva.receita / Math.max(1, detalheFaixaAtiva.n_clientes_unicos))}</div></div>
          </div>
        </div>
      )}

      {/* === Curva de Pareto === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Curva de Pareto — concentração de receita
        <span style={{ fontSize: 11, color: 'var(--mute)', fontWeight: 400, marginLeft: 12 }}>
          (X% dos pedidos mais baratos respondem por Y% da receita · linha = corte atual)
        </span>
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <ParetoCurve data={Pareto} corte={corte} height={300} />
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
          Eixo X: % de pedidos ordenados do mais barato pro mais caro. Eixo Y: % da receita acumulada até aquele ponto.
          Quanto mais a curva fica "colada no chão" à esquerda, mais concentrada está a receita nos pedidos grandes (cortar embaixo dói pouco).
          Linha tracejada = 45°: distribuição perfeitamente uniforme (referência).
        </div>
      </div>

      {/* === Tabela de cenários === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Cenários de corte — todos os pontos lado a lado
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row">
          <h2 className="card-title">Trade-off por corte</h2>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>
            premissa: R$ {D.premissas.custo_op_por_pedido}/pedido · linha realçada = corte mais próximo do slider
          </span>
        </div>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Corte</th>
              <th style={{ textAlign: 'right' }}>Pedidos cortados</th>
              <th style={{ textAlign: 'right' }}>% pedidos</th>
              <th style={{ textAlign: 'right' }}>Receita perdida</th>
              <th style={{ textAlign: 'right' }}>% receita</th>
              <th style={{ textAlign: 'right' }}>Clientes perdidos</th>
              <th style={{ textAlign: 'right' }}>LTV perdidos</th>
              <th style={{ textAlign: 'right' }}>Custo elim.</th>
              <th style={{ textAlign: 'right' }}>Saldo líquido</th>
              <th style={{ textAlign: 'center' }}>Recomenda</th>
            </tr>
          </thead>
          <tbody>
            {C.map((c, i) => {
              const isClose = Math.abs(c.corte - corte) <= 25;
              return (
                <tr key={i} style={isClose ? { background: 'rgba(34,211,238,0.08)' } : {}}>
                  <td><b>{c.label}</b></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(c.n_pedidos_cortados)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{_fmtPct(c.pct_pedidos_cortados)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{_fmtBRLk(c.receita_perdida)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--red)' }}>{_fmtPct(c.pct_receita_perdida, 2)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(c.n_clientes_perdidos)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtBRL(c.ltv_medio_perdidos)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{_fmtBRLk(c.custo_operacional_eliminado)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: saldoColor(c.saldo_liquido), fontWeight: 600 }}>{_fmtBRLk(c.saldo_liquido)}</td>
                  <td style={{ textAlign: 'center', color: c.recomenda ? 'var(--green)' : 'var(--red)' }}>
                    {c.recomenda ? '✓' : '✗'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === LTV por faixa de maior pedido === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Clientes pequenos — perfil de quem seria descartado
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row">
          <h2 className="card-title">LTV dos clientes cujo MAIOR pedido foi abaixo do corte</h2>
        </div>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Segmento</th>
              <th style={{ textAlign: 'right' }}>Nº clientes</th>
              <th style={{ textAlign: 'right' }}>% base</th>
              <th style={{ textAlign: 'right' }}>LTV médio</th>
              <th style={{ textAlign: 'right' }}>Ticket médio</th>
              <th style={{ textAlign: 'right' }}>Nº pedidos médio</th>
              <th style={{ textAlign: 'right' }}>Receita total</th>
            </tr>
          </thead>
          <tbody>
            {L.map((l, i) => (
              <tr key={i}>
                <td><b>{l.label}</b></td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(l.n_clientes)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{_fmtPct(l.pct_base_clientes)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>{_fmtBRL(l.ltv_medio)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtBRL(l.ticket_medio)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{l.n_pedidos_medio.toFixed(1).replace('.', ',')}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(l.receita_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
          LTV próximo do ticket = compraram 1 vez e sumiram (perda baixa, "descartáveis").
          LTV muito acima do ticket = recompram pequeno mas com frequência (perda alta — atenção ao alerta do Vitor).
        </div>
      </div>

      {/* === PF vs PJ === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>PF vs PJ — leitura separada</h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">% Receita por tipo</h2></div>
          <AstroDonut
            segments={PJ.map(p => ({ tipo: p.tipo, v: p.receita }))}
            size={200}
          />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Comparação detalhada</h2></div>
          <table className="t" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Nº pedidos</th>
                <th style={{ textAlign: 'right' }}>Nº clientes</th>
                <th style={{ textAlign: 'right' }}>Receita</th>
                <th style={{ textAlign: 'right' }}>% receita</th>
                <th style={{ textAlign: 'right' }}>Ticket médio</th>
                <th style={{ textAlign: 'right' }}>LTV médio</th>
              </tr>
            </thead>
            <tbody>
              {PJ.map((p, i) => (
                <tr key={i}>
                  <td><b>{p.tipo}</b></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(p.n_pedidos)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(p.n_clientes)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(p.receita)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{_fmtPct(p.pct_receita)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{_fmtBRL(p.ticket_medio)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--violet)' }}>{_fmtBRL(p.ltv_medio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
            Hipótese de Filipe: <i>"se o cara compra pelo CPF que compra menos de R$ 200, não é um cara que vai ter que comprar todo mês"</i>.
            Compare LTV de PF e PJ. Se LTV PF for elevado mas vier de pedidos pequenos recorrentes, descartá-lo destrói valor (alerta do Vitor).
          </div>
        </div>
      </div>

      {/* === Cruzamento faixa x tipo === */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row">
          <h2 className="card-title">Cruzamento — faixa de pedido × tipo de pessoa</h2>
        </div>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Faixa</th>
              <th style={{ textAlign: 'right' }}>PF · pedidos</th>
              <th style={{ textAlign: 'right' }}>PF · receita</th>
              <th style={{ textAlign: 'right' }}>PF · clientes</th>
              <th style={{ textAlign: 'right' }}>PJ · pedidos</th>
              <th style={{ textAlign: 'right' }}>PJ · receita</th>
              <th style={{ textAlign: 'right' }}>PJ · clientes</th>
              <th style={{ textAlign: 'right' }}>Mix PF/PJ (rec)</th>
            </tr>
          </thead>
          <tbody>
            {PJFaixa.map((f, i) => {
              const totRec = f.receita_PF + f.receita_PJ;
              const mixPF = totRec ? f.receita_PF / totRec : 0;
              return (
                <tr key={i}>
                  <td><b>{f.faixa}</b></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(f.n_pedidos_PF)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(f.receita_PF)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(f.n_clientes_PF)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(f.n_pedidos_PJ)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(f.receita_PJ)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(f.n_clientes_PJ)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{_fmtPct(mixPF)} / {_fmtPct(1-mixPF)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === Top 50 clientes descartáveis === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Exemplos — clientes que fizeram só 1 pedido baixo (&lt; R$ 200)
        <span style={{ fontSize: 11, color: 'var(--mute)', fontWeight: 400, marginLeft: 12 }}>
          (top 50 por valor do único pedido · candidatos a "descartáveis sem custo")
        </span>
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="t" style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Único pedido</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {TopBaixo.map((c, i) => (
                <tr key={i}>
                  <td>{c.nome}</td>
                  <td>{c.tipo}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(c.maior_pedido)}</td>
                  <td style={{ color: 'var(--text-2)' }}>{c.primeira}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* === Recomendação final === */}
      <div className="card" style={{
        padding: 20,
        marginBottom: 22,
        background: cenarioInterp.saldo_liquido >= 0
          ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(34,211,238,0.05))'
          : 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(245,158,11,0.05))',
        borderColor: cenarioInterp.saldo_liquido >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 10, color: saldoColor(cenarioInterp.saldo_liquido) }}>
          Recomendação para corte de R$ {corte}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, marginBottom: 8, lineHeight: 1.6 }}>
          Cortar pedidos abaixo de <b>R$ {corte}</b> elimina <b>{_fmtNum(cenarioInterp.n_pedidos_cortados)} pedidos</b>{' '}
          ({_fmtPct(cenarioInterp.pct_pedidos_cortados)} do total) e custaria <b style={{ color: 'var(--red)' }}>{_fmtBRLk(cenarioInterp.receita_perdida)}</b>{' '}
          em receita ({_fmtPct(cenarioInterp.pct_receita_perdida, 2)}). Cliente efetivamente perdido: <b>{_fmtNum(cenarioInterp.n_clientes_perdidos)}</b>{' '}
          ({_fmtPct(cenarioInterp.pct_clientes_perdidos)} da base), com LTV médio de <b>{_fmtBRL(cenarioInterp.ltv_medio_perdidos)}</b>.
        </p>
        <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6, fontWeight: 600, color: saldoColor(cenarioInterp.saldo_liquido) }}>
          {cenarioInterp.saldo_liquido >= 0
            ? `✓ Saldo líquido positivo: ${_fmtBRLk(cenarioInterp.saldo_liquido)}. O custo operacional eliminado compensa a perda de receita. RECOMENDA cortar.`
            : `✗ Saldo líquido negativo: ${_fmtBRLk(cenarioInterp.saldo_liquido)}. A receita perdida supera o custo operacional eliminado. NÃO recomenda cortar nesse patamar.`
          }
        </p>
        <p style={{ fontSize: 12, color: 'var(--mute)', margin: '10px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
          Atenção (Vitor): mesmo com saldo positivo no agregado, antes de aplicar verifique a tabela de LTV acima.
          Se o LTV médio dos clientes que seriam perdidos for muito maior que o ticket médio deles, são <b>recompradores frequentes em pequenos pedidos</b> — e descartá-los destrói relacionamento de longo prazo.
        </p>
      </div>
    </div>
  );
};

Object.assign(window, { PagePedidoMinimo });
