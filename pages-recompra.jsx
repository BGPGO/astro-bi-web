/**
 * pages-recompra.jsx — V2 PROFUNDA · A História da Recompra (Astro Distribuidora)
 *
 * Portagem completa de astro-giro-bi/dashboard_recompra.py (1224 linhas).
 * 14+ blocos analíticos, storytelling embutido, filtros reativos (UF + Categoria + busca),
 * cross-filter no calendário, drill-down em produto gateway, heatmap de coortes,
 * histograma de tempo entre compras, dispersão Marca × UF, PF vs PJ, gateway→marca.
 *
 * Dados: window.RECOMPRA_DATA (scripts/build_recompra_data.py).
 * Helpers globais (já carregados antes via pages-astro.jsx):
 *   _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct
 *   AstroBarV, AstroLine, AstroBarH, AstroDonut
 */

// ===== Helpers locais =====
const _bandColor = (pct, mean) => {
  if (pct == null) return 'var(--mute)';
  if (pct >= mean * 1.15) return 'var(--green)';
  if (pct <= mean * 0.85) return 'var(--red)';
  return 'var(--text)';
};

const _heatColor = (v, vMin, vMax) => {
  // gradient surface (frio) → cyan (quente)
  if (v == null || !isFinite(v)) return 'rgba(255,255,255,0.04)';
  const t = (v - vMin) / Math.max(0.0001, vMax - vMin);
  const tc = Math.max(0, Math.min(1, t));
  // r,g,b: surface (38,42,58) → cyan (34, 211, 238)
  const r = Math.round(38 + (34 - 38) * tc);
  const g = Math.round(42 + (211 - 42) * tc);
  const b = Math.round(58 + (238 - 58) * tc);
  return `rgba(${r}, ${g}, ${b}, ${0.18 + 0.72 * tc})`;
};

// Story block helper — caixa cyan com borda lateral
const _Story = ({ children, tone = 'cyan' }) => {
  const tones = {
    cyan: { bg: 'rgba(34,211,238,0.06)', border: 'var(--cyan)' },
    amber: { bg: 'rgba(245,158,11,0.06)', border: 'var(--amber)' },
    green: { bg: 'rgba(16,185,129,0.06)', border: 'var(--green)' },
    violet: { bg: 'rgba(167,139,250,0.06)', border: 'var(--violet)' },
  };
  const t = tones[tone] || tones.cyan;
  return (
    <div style={{
      background: t.bg,
      borderLeft: `3px solid ${t.border}`,
      padding: '14px 18px',
      borderRadius: 8,
      margin: '16px 0',
      fontSize: 13,
      lineHeight: 1.6,
      color: 'var(--text-2)',
    }}>
      {children}
    </div>
  );
};

const _SectionTitle = ({ num, title, desc }) => (
  <div style={{ margin: '32px 0 12px' }}>
    {num && (
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 3,
        color: 'var(--cyan)', textTransform: 'uppercase', marginBottom: 4,
      }}>{num}</div>
    )}
    <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>{title}</h3>
    {desc && <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>{desc}</div>}
  </div>
);

// ===== Heatmap Coortes (SVG custom) =====
const CoortesHeatmap = ({ rows, height = 320 }) => {
  if (!rows || !rows.length) return <div className="empty">sem dados de coorte</div>;
  // group por cohort
  const byCohort = {};
  rows.forEach((r) => {
    if (!byCohort[r.cohort]) byCohort[r.cohort] = { cohort_size: r.cohort_size, cells: {} };
    byCohort[r.cohort].cells[r.m_offset] = r.n_ativos / Math.max(1, r.cohort_size);
  });
  const cohorts = Object.keys(byCohort).sort();
  const offsets = Array.from({ length: 12 }, (_, i) => i);
  const cellW = 60, cellH = 28, labelW = 70;
  const W = labelW + cellW * offsets.length + 80;
  const H = 30 + cellH * cohorts.length + 40;

  // domínio (0% a 1.0 mas saturar em 0.6 pra dar contraste — m_offset=0 sempre 100%)
  const vMin = 0, vMax = 0.5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
      {/* header */}
      <text x={labelW/2} y={20} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--mute)' }}>Cohort</text>
      {offsets.map((o) => (
        <text key={o} x={labelW + o * cellW + cellW/2} y={20} textAnchor="middle"
              style={{ fontSize: 10, fill: 'var(--mute)' }}>M+{o}</text>
      ))}
      {cohorts.map((cohort, ri) => {
        const r = byCohort[cohort];
        return (
          <g key={cohort}>
            <text x={labelW - 6} y={30 + ri * cellH + cellH/2 + 4} textAnchor="end"
                  style={{ fontSize: 10, fill: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{cohort.slice(2)}</text>
            <text x={labelW + offsets.length * cellW + 6} y={30 + ri * cellH + cellH/2 + 4}
                  style={{ fontSize: 9, fill: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{r.cohort_size}</text>
            {offsets.map((o) => {
              const v = r.cells[o];
              const fill = v == null ? 'transparent' : (o === 0 ? 'rgba(34,211,238,0.4)' : _heatColor(v, vMin, vMax));
              return (
                <g key={o}>
                  <rect x={labelW + o * cellW + 1} y={30 + ri * cellH + 1}
                        width={cellW - 2} height={cellH - 2}
                        fill={fill} rx={2} />
                  {v != null && (
                    <text x={labelW + o * cellW + cellW/2} y={30 + ri * cellH + cellH/2 + 4}
                          textAnchor="middle" style={{
                            fontSize: 9, fill: v > 0.25 ? '#0c111c' : 'var(--text-2)',
                            fontFamily: 'var(--font-mono)',
                          }}>{(v * 100).toFixed(0)}%</text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
};

// ===== Matriz Marca × UF (LTV) =====
const DispersaoMatriz = ({ cells, top10marcas, top10ufs }) => {
  if (!cells || !cells.length) return <div className="empty">sem dados</div>;
  // mapa rápido
  const map = {};
  let vMin = Infinity, vMax = -Infinity;
  cells.forEach((c) => {
    map[`${c.marca}|${c.uf}`] = c;
    if (c.ltv_medio < vMin) vMin = c.ltv_medio;
    if (c.ltv_medio > vMax) vMax = c.ltv_medio;
  });
  const cellW = 64, cellH = 28, labelW = 110;
  const W = labelW + cellW * top10ufs.length + 20;
  const H = 32 + cellH * top10marcas.length + 30;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block', minWidth: W }}>
        {/* header UFs */}
        {top10ufs.map((uf, i) => (
          <text key={uf} x={labelW + i * cellW + cellW/2} y={22} textAnchor="middle"
                style={{ fontSize: 11, fill: 'var(--text-2)', fontWeight: 600 }}>{uf}</text>
        ))}
        {top10marcas.map((marca, mi) => (
          <g key={marca}>
            <text x={labelW - 6} y={32 + mi * cellH + cellH/2 + 4} textAnchor="end"
                  style={{ fontSize: 10, fill: 'var(--text-2)' }}>
              {marca.length > 15 ? marca.slice(0, 14) + '…' : marca}
            </text>
            {top10ufs.map((uf, ui) => {
              const c = map[`${marca}|${uf}`];
              return (
                <g key={uf}>
                  <rect x={labelW + ui * cellW + 1} y={32 + mi * cellH + 1}
                        width={cellW - 2} height={cellH - 2}
                        fill={c ? _heatColor(c.ltv_medio, vMin, vMax) : 'rgba(255,255,255,0.02)'}
                        rx={2} />
                  {c && (
                    <text x={labelW + ui * cellW + cellW/2} y={32 + mi * cellH + cellH/2 + 4}
                          textAnchor="middle"
                          style={{ fontSize: 9, fill: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                      {_fmtBRLk(c.ltv_medio).replace('R$ ', '')}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
};

// ===== Main Page =====
const PageRecompra = () => {
  const D = window.RECOMPRA_DATA;
  if (!D) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          recompra-data.js não carregado. Rode: <code>python scripts/build_recompra_data.py</code>
        </div>
      </div>
    );
  }

  // ===== Filtros reativos =====
  const [filtroUF, setFiltroUF] = React.useState('');
  const [filtroCat, setFiltroCat] = React.useState('');
  const [buscaMarca, setBuscaMarca] = React.useState('');
  const [buscaProduto, setBuscaProduto] = React.useState('');
  const [marcaSort, setMarcaSort] = React.useState('taxa_recompra'); // ou 'n_pedidos', 'receita'
  const [marcaSortDir, setMarcaSortDir] = React.useState('desc');
  const [mesSelecionado, setMesSelecionado] = React.useState(null);
  const [produtoGatewaySelecionado, setProdutoGatewaySelecionado] = React.useState(null);
  const [tempoFaixaSel, setTempoFaixaSel] = React.useState(null);

  const k = D.kpis_principais || D.kpis;
  const taxaMedia = k.taxa_global_recompra;

  // ===== Série mensal =====
  const serie = D.serie_mensal_recompra || [];
  const serieLabels = serie.map((x) => x.mes.slice(2));
  const seriePct = serie.map((x) => x.pct_recompra);

  // ===== Marcas (com filtros) =====
  const marcasFiltradas = React.useMemo(() => {
    let arr = [...(D.taxa_recompra_por_marca || [])];
    if (buscaMarca) {
      const q = buscaMarca.toLowerCase();
      arr = arr.filter((m) => (m.marca || '').toLowerCase().includes(q));
    }
    arr.sort((a, b) => {
      const av = a[marcaSort] || 0, bv = b[marcaSort] || 0;
      return marcaSortDir === 'desc' ? bv - av : av - bv;
    });
    return arr;
  }, [D.taxa_recompra_por_marca, buscaMarca, marcaSort, marcaSortDir]);

  // ===== Produtos gateway (com filtros) =====
  const gatewayFiltrados = React.useMemo(() => {
    let arr = [...(D.produtos_gateway || [])];
    if (filtroCat) arr = arr.filter((p) => p.categoria_mae === filtroCat);
    if (buscaProduto) {
      const q = buscaProduto.toLowerCase();
      arr = arr.filter((p) => (p.seo_title || '').toLowerCase().includes(q));
    }
    return arr;
  }, [D.produtos_gateway, filtroCat, buscaProduto]);

  // ===== Gateway -> Marca lookup =====
  const gatewayMarcaMap = React.useMemo(() => {
    const map = {};
    (D.gateway_to_marca || []).forEach((r) => {
      if (!map[r.gateway]) map[r.gateway] = [];
      map[r.gateway].push(r);
    });
    return map;
  }, [D.gateway_to_marca]);

  // Top 10 marcas / UFs para dispersão
  const top10marcas = (D.ltv_por_marca || []).slice(0, 10).map((m) => m.marca);
  const top10ufs = (D.ltv_por_uf || []).slice(0, 10).map((u) => u.uf);

  // ===== PF vs PJ =====
  const tipoLabel = (t) => t === 'F' ? 'PF' : (t === 'J' ? 'PJ' : t);
  const pfpjData = (D.clientes_por_tipo || []).map((t) => ({
    ...t, tipo_label: tipoLabel(t.tipo),
  }));

  // best/worst marca
  const bestMarca = marcasFiltradas[0];
  const worstMarca = marcasFiltradas[marcasFiltradas.length - 1];

  // best/worst gateway
  const bestGw = gatewayFiltrados[0];
  const worstGw = gatewayFiltrados[gatewayFiltrados.length - 1];

  // mês detalhado (cross-filter)
  const mesDetalhe = mesSelecionado != null ? serie[mesSelecionado] : null;

  // total histograma tempo
  const totalTempo = (D.tempo_entre_compras || []).reduce((s, x) => s + x.n_clientes, 0);

  // ===== UI =====
  return (
    <div className="page" style={{ padding: '20px 28px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>A História da Recompra</b>
      </div>

      {/* ====== STORYTELLING ABERTURA ====== */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34,211,238,0.05), rgba(167,139,250,0.05))',
        borderRadius: 12, padding: '28px 32px', marginBottom: 18,
        border: '1px solid rgba(34,211,238,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{
              fontSize: 64, fontWeight: 900, lineHeight: 1,
              background: 'linear-gradient(135deg, var(--cyan), var(--violet))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              fontFamily: 'var(--font-mono)',
            }}>{_fmtPct(taxaMedia, 0)}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, maxWidth: 540, lineHeight: 1.5 }}>
              dos seus clientes novos fazem uma <b>segunda compra</b>. Mas esse número muda <b style={{ color: 'var(--cyan)' }}>drasticamente</b> dependendo do que eles compram no primeiro carrinho — e desta marca, e desta UF, e deste perfil.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, flex: 1, minWidth: 240 }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{_fmtNum(k.n_clientes_novos)}</div>
              <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1 }}>clientes novos analisados</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{_fmtNum(k.n_recorrentes)}</div>
              <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1 }}>fizeram recompra</div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== FILTROS STICKY ====== */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg)', padding: '10px 0', marginBottom: 14,
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1 }}>Filtros:</span>
        <select value={filtroUF} onChange={(e) => setFiltroUF(e.target.value)}
                className="filter-select" style={{ minWidth: 100, fontSize: 12 }}>
          <option value="">Todas UFs</option>
          {(D.filtros?.ufs || []).map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
        <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}
                className="filter-select" style={{ minWidth: 160, fontSize: 12 }}>
          <option value="">Todas categorias</option>
          {(D.filtros?.categorias || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" placeholder="Buscar marca/produto"
               value={buscaMarca} onChange={(e) => { setBuscaMarca(e.target.value); setBuscaProduto(e.target.value); }}
               className="filter-select" style={{ minWidth: 200, fontSize: 12 }} />
        {(filtroUF || filtroCat || buscaMarca || buscaProduto) && (
          <button className="btn-ghost" onClick={() => {
            setFiltroUF(''); setFiltroCat(''); setBuscaMarca(''); setBuscaProduto('');
          }}>Limpar</button>
        )}
        <div style={{ flex: 1 }} />
        {filtroUF && <span style={{ fontSize: 11, color: 'var(--cyan)' }}>UF · {filtroUF}</span>}
        {filtroCat && <span style={{ fontSize: 11, color: 'var(--cyan)' }}>cat · {filtroCat.slice(0, 30)}</span>}
      </div>

      {/* ====== 4 KPIs GRANDES ====== */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile cyan">
          <div className="kpi-label">% Receita Recompra</div>
          <div className="kpi-value">{_fmtPct(k.pct_receita_recompra)}</div>
          <div className="kpi-hint">{_fmtBRLk(k.receita_recompra)} de {_fmtBRLk(k.receita_total)}</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Ticket Recompra</div>
          <div className="kpi-value">
            <span className="currency">R$</span>{_fmtBRLk(k.ticket_recompra).replace('R$ ', '')}
          </div>
          <div className="kpi-hint" style={{ color: k.ticket_delta_pct > 0 ? 'var(--green)' : 'var(--red)' }}>
            {k.ticket_delta_pct > 0 ? '▲' : '▼'} {(Math.abs(k.ticket_delta_pct) * 100).toFixed(1).replace('.', ',')}% vs novo ({_fmtBRLk(k.ticket_novo)})
          </div>
        </div>
        <div className="kpi-tile violet">
          <div className="kpi-label">Clientes Recorrentes</div>
          <div className="kpi-value">{_fmtNum(k.n_recorrentes)}</div>
          <div className="kpi-hint">de {_fmtNum(k.n_clientes_novos)} novos · taxa {_fmtPct(taxaMedia)}</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">Freq · Recompra</div>
          <div className="kpi-value" style={{ fontFamily: 'var(--font-mono)' }}>
            {Math.round(k.freq_media_dias_recompra)}<span style={{ fontSize: 14, color: 'var(--mute)', marginLeft: 4 }}>dias</span>
          </div>
          <div className="kpi-hint">média entre pedidos do mesmo cliente</div>
        </div>
      </div>

      {/* ====== 01 · EVOLUÇÃO MENSAL ====== */}
      <_SectionTitle num="01" title="A evolução temporal" desc="Cada barra é um mês. Clique pra ver detalhes." />
      <_Story>
        Mês a mês, a Astro converte uma fatia diferente do tráfego em <b>recompra</b>. Picos em meses como Black Friday escondem que muitos clientes da campanha são novos — a recompra demora 2–3 meses pra aparecer.
        Use o gráfico abaixo pra encontrar meses onde a recompra colapsou (provável escassez de estoque ou queda de variedade) ou explodiu (efeito sazonal de consumíveis).
      </_Story>
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="card-title-row">
          <h2 className="card-title">% Pedidos Recompra · últimos {serie.length} meses</h2>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>
            {serieLabels[0]} → {serieLabels[serieLabels.length - 1]}
          </span>
        </div>
        <AstroBarV
          values={seriePct}
          labels={serieLabels}
          color="cyan"
          height={220}
          fmt={(v) => _fmtPct(v, 0)}
          onBarClick={(i) => setMesSelecionado(i === mesSelecionado ? null : i)}
          activeIdx={mesSelecionado}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8,
                       fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          <span>min {_fmtPct(Math.min(...seriePct), 1)}</span>
          <span>média {_fmtPct(seriePct.reduce((a, b) => a + b, 0) / Math.max(1, seriePct.length), 1)}</span>
          <span>max {_fmtPct(Math.max(...seriePct), 1)}</span>
        </div>
      </div>

      {/* Detalhe do mês clicado */}
      {mesDetalhe && (
        <div className="card" style={{ marginBottom: 22, borderLeft: '3px solid var(--cyan)' }}>
          <h3 style={{ fontSize: 14, margin: '0 0 10px', color: 'var(--cyan)' }}>
            Detalhes · {mesDetalhe.mes}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
            <div>
              <div style={{ color: 'var(--mute)', fontSize: 10, textTransform: 'uppercase' }}>Pedidos novos</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text)' }}>{_fmtNum(mesDetalhe.pedidos_novos)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--mute)', fontSize: 10, textTransform: 'uppercase' }}>Pedidos recompra</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--cyan)' }}>{_fmtNum(mesDetalhe.pedidos_recompra)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--mute)', fontSize: 10, textTransform: 'uppercase' }}>Clientes recorrentes</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--violet)' }}>{_fmtNum(mesDetalhe.n_clientes_recorrentes)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--mute)', fontSize: 10, textTransform: 'uppercase' }}>Receita total</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--green)' }}>
                {_fmtBRLk(mesDetalhe.receita_novos + mesDetalhe.receita_recompra)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== 02 · MARCAS — TAXA DE RECOMPRA ====== */}
      <_SectionTitle num="02"
        title="A marca importa quase tanto quanto o produto"
        desc={`${marcasFiltradas.length} marcas com >= 100 pedidos. Clique no header pra ordenar.`} />
      <_Story tone="violet">
        Cada marca tem um "DNA de recompra": a {bestMarca?.marca || '—'} tem <b style={{ color: 'var(--green)' }}>{_fmtPct(bestMarca?.taxa_recompra || 0)}</b> de recompra,
        enquanto a {worstMarca?.marca || '—'} fica em <b style={{ color: 'var(--red)' }}>{_fmtPct(worstMarca?.taxa_recompra || 0)}</b>. Marcas de <b>consumíveis</b> (luvas, respiradores) dominam o topo.
        Marcas de <b>durável</b> (calçados, cintos) ficam no fundo porque o cliente não precisa repor com frequência.
      </_Story>
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table className="t" style={{ width: '100%', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => { setMarcaSort('marca'); setMarcaSortDir(d => d === 'desc' ? 'asc' : 'desc'); }}>
                  Marca {marcaSort === 'marca' ? (marcaSortDir === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => { setMarcaSort('n_pedidos'); setMarcaSortDir(d => d === 'desc' ? 'asc' : 'desc'); }}>
                  Pedidos {marcaSort === 'n_pedidos' ? (marcaSortDir === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => { setMarcaSort('receita'); setMarcaSortDir(d => d === 'desc' ? 'asc' : 'desc'); }}>
                  Receita {marcaSort === 'receita' ? (marcaSortDir === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => { setMarcaSort('ticket_medio_recompra'); setMarcaSortDir(d => d === 'desc' ? 'asc' : 'desc'); }}>
                  Tk Recompra
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => { setMarcaSort('ticket_medio_novo'); setMarcaSortDir(d => d === 'desc' ? 'asc' : 'desc'); }}>
                  Tk Novo
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => { setMarcaSort('taxa_recompra'); setMarcaSortDir(d => d === 'desc' ? 'asc' : 'desc'); }}>
                  Taxa Recompra {marcaSort === 'taxa_recompra' ? (marcaSortDir === 'desc' ? '▼' : '▲') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {marcasFiltradas.map((r, i) => {
                const above = r.taxa_recompra >= taxaMedia;
                const high = r.taxa_recompra > 0.8;
                return (
                  <tr key={i} style={{ background: above ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                    <td style={{ fontWeight: 600 }}>{r.marca}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtNum(r.n_pedidos)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(r.receita)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtBRLk(r.ticket_medio_recompra)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtBRLk(r.ticket_medio_novo)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700,
                                  color: high ? 'var(--green)' : (above ? 'var(--cyan)' : 'var(--text)') }}>
                      {_fmtPct(r.taxa_recompra)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ====== 03 · PRODUTOS GATEWAY ====== */}
      <_SectionTitle num="03"
        title="Produtos gateway · o primeiro carrinho que prende"
        desc={`${gatewayFiltrados.length} produtos com >= 50 clientes na primeira compra. Clique pra ver o que compram depois.`} />
      <_Story tone="green">
        Estes são os SKUs que <b>abrem a porta</b> da Astro. Quem entra comprando um destes tem chance acima da média de voltar — e historicamente vira cliente recorrente de outras marcas também.
        Use como anúncio principal no Google Shopping e como CTA do e-mail de boas-vindas.
      </_Story>
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table className="t" style={{ width: '100%', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <tr>
                <th>Produto</th>
                <th>Marca</th>
                <th>Sub-cat</th>
                <th style={{ textAlign: 'right' }}>Cli 1ª</th>
                <th style={{ textAlign: 'right' }}>Voltaram</th>
                <th style={{ textAlign: 'right' }}>Valor 1ª</th>
                <th style={{ textAlign: 'right' }}>Taxa</th>
              </tr>
            </thead>
            <tbody>
              {gatewayFiltrados.map((r, i) => {
                const high = r.taxa_recompra > 0.8;
                const isSel = produtoGatewaySelecionado === r.seo_title;
                return (
                  <tr key={i}
                      onClick={() => setProdutoGatewaySelecionado(isSel ? null : r.seo_title)}
                      style={{
                        cursor: 'pointer',
                        background: isSel ? 'rgba(34,211,238,0.10)' : 'transparent',
                      }}>
                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.seo_title}>
                      {isSel && '▸ '}{r.seo_title}
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{r.marca || '—'}</td>
                    <td style={{ color: 'var(--mute)', fontSize: 11 }}>{r.sub_categoria || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtNum(r.clientes_1a)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(r.recompraram)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtBRLk(r.valor_venda_1a)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700,
                                  color: high ? 'var(--green)' : 'var(--text)' }}>{_fmtPct(r.taxa_recompra)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill: gateway selecionado → top marcas da 2a compra */}
      {produtoGatewaySelecionado && gatewayMarcaMap[produtoGatewaySelecionado] && (
        <div className="card" style={{ marginBottom: 22, borderLeft: '3px solid var(--cyan)' }}>
          <h3 style={{ fontSize: 13, margin: '0 0 10px', color: 'var(--cyan)' }}>
            ▸ {produtoGatewaySelecionado.slice(0, 60)}... · top marcas da 2ª compra
          </h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {gatewayMarcaMap[produtoGatewaySelecionado].map((r, i) => (
              <div key={i} style={{
                background: 'var(--surface-2)', borderRadius: 6, padding: '8px 12px',
                fontSize: 12,
              }}>
                <b style={{ color: 'var(--text)' }}>#{i + 1} {r.marca}</b>
                <span style={{ color: 'var(--mute)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
                  {_fmtNum(r.n_clientes)} clientes
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ====== 04 · LTV POR MARCA & UF ====== */}
      <_SectionTitle num="04"
        title="LTV — onde está o cliente mais valioso?"
        desc="Receita acumulada por cliente que comprou a marca / mora no estado." />
      <_Story tone="amber">
        LTV alto pode esconder dois efeitos: (a) cliente fiel comprando muito e (b) ticket único alto. Marcas como <b>{D.ltv_por_marca[0]?.marca}</b> conseguem ambos — venda recorrente <em>e</em> ticket robusto.
        UFs com poucos clientes mas LTV altíssimo (canto direito do ranking) são mercados de <b>nicho B2B</b> — vale concentrar Google Ads nesses estados em vez de espalhar.
      </_Story>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 18 }}>
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Top 15 Marcas · LTV médio</h2>
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>{D.ltv_por_marca.length} marcas no total</span>
          </div>
          <AstroBarH
            items={D.ltv_por_marca.slice(0, 15).map((x) => ({ label: x.marca, v: x.ltv_medio }))}
            color="violet" fmt={_fmtBRLk}
          />
        </div>
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Top 15 UFs · LTV médio</h2>
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>{D.ltv_por_uf.length} UFs com >=20 clientes</span>
          </div>
          <AstroBarH
            items={D.ltv_por_uf.slice(0, 15).map((x) => ({ label: x.uf, v: x.ltv_medio }))}
            color="cyan" fmt={_fmtBRLk}
          />
        </div>
      </div>

      {/* LTV por Categoria */}
      {D.ltv_por_cat && D.ltv_por_cat.length > 0 && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="card-title-row">
            <h2 className="card-title">Top 15 Categorias-mãe · LTV médio</h2>
          </div>
          <AstroBarH
            items={D.ltv_por_cat.slice(0, 15).map((x) => ({ label: x.categoria, v: x.ltv_medio }))}
            color="green" fmt={_fmtBRLk}
          />
        </div>
      )}

      {/* ====== 05 · COORTE HEATMAP ====== */}
      <_SectionTitle num="05"
        title="Coortes mensais — quanto da safra sobrevive?"
        desc="Cada linha é um mês de entrada. Cada coluna é quantos meses depois. % = clientes ainda comprando." />
      <_Story>
        A coluna <b>M+0</b> é sempre 100% (todos compraram no mês de entrada). Mas a partir de <b>M+1</b> a coorte começa a vazar.
        Em uma loja saudável, a retenção em M+3 fica entre 15% e 25% — abaixo disso é sinal de que a aquisição é "barata por motivo": clientes vindo de leilão de preço sem volta.
        Coortes pós Black Friday tipicamente caem mais rápido que coortes orgânicas.
      </_Story>
      <div className="card" style={{ marginBottom: 22, overflowX: 'auto' }}>
        <CoortesHeatmap rows={D.coortes_mensais || []} />
      </div>

      {/* ====== 06 · TEMPO ENTRE COMPRAS ====== */}
      <_SectionTitle num="06"
        title="Quanto tempo até a 2ª compra?"
        desc="Histograma de dias entre a 1ª e a 2ª compra dos clientes que retornaram." />
      <_Story tone="green">
        A maioria dos clientes que voltam volta nos primeiros <b>90 dias</b>. Se você não rebobinou o cliente até lá com um e-mail de "tá faltando alguma coisa?", ele esquece da Astro e vai pro Mercado Livre.
        Cliente que demora <b>365+</b> pra voltar é cliente "evento" (uma obra, uma reforma) — não é onde está sua receita recorrente.
      </_Story>
      <div className="card" style={{ marginBottom: 22 }}>
        <AstroBarV
          values={(D.tempo_entre_compras || []).map((x) => x.n_clientes)}
          labels={(D.tempo_entre_compras || []).map((x) => x.faixa + 'd')}
          color="amber" height={240}
          fmt={(v) => `${_fmtNum(v)} (${_fmtPct(v / Math.max(1, totalTempo), 0)})`}
          onBarClick={(i) => setTempoFaixaSel(i === tempoFaixaSel ? null : i)}
          activeIdx={tempoFaixaSel}
        />
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--mute)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{_fmtNum(totalTempo)} clientes que tiveram 2ª compra</span>
          {tempoFaixaSel != null && (
            <span style={{ color: 'var(--cyan)' }}>
              dias médios na faixa <b>{D.tempo_entre_compras[tempoFaixaSel].faixa}</b>:{' '}
              {Math.round(D.tempo_entre_compras[tempoFaixaSel].dias_medio_na_faixa)} dias
            </span>
          )}
        </div>
      </div>

      {/* ====== 07 · PF vs PJ ====== */}
      {pfpjData.length > 0 && (
        <>
          <_SectionTitle num="07"
            title="Perfil — PF vs PJ"
            desc="Pessoa física compra menos, mas volta mais vezes. PJ compra mais alto e some." />
          <_Story tone="violet">
            A Astro é uma distribuidora B2B-friendly: <b>PJ</b> tipicamente tem ticket maior mas recompra menor (cliente de obra única).
            <b> PF</b> compra menos e volta mais vezes — eles são revenda/lojistas pequenos que abastecem. Trate os dois canais com mensagens diferentes.
          </_Story>
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, marginBottom: 18 }}>
            <div className="card">
              <div className="card-title-row"><h2 className="card-title">Distribuição</h2></div>
              <AstroDonut segments={pfpjData.map((t) => ({ tipo: t.tipo_label, v: t.n_clientes }))} size={180} />
            </div>
            <div className="card">
              <div className="card-title-row"><h2 className="card-title">Comparativo PF vs PJ</h2></div>
              <table className="t" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th style={{ textAlign: 'right' }}>Clientes</th>
                    <th style={{ textAlign: 'right' }}>Taxa Recompra</th>
                    <th style={{ textAlign: 'right' }}>LTV Médio</th>
                    <th style={{ textAlign: 'right' }}>Ticket Médio</th>
                    <th style={{ textAlign: 'right' }}>Compras/Cli</th>
                  </tr>
                </thead>
                <tbody>
                  {pfpjData.map((t, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{t.tipo_label}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(t.n_clientes)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{_fmtPct(t.taxa_recompra)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{_fmtBRLk(t.ltv_medio)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(t.ticket_medio)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{(t.n_compras_medio || 0).toFixed(2).replace('.', ',')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ====== 08 · DISPERSÃO MARCA × UF ====== */}
      {D.dispersao_marca_x_uf && D.dispersao_marca_x_uf.length > 0 && (
        <>
          <_SectionTitle num="08"
            title="Matriz Marca × UF · LTV"
            desc="Top 10 marcas × Top 10 UFs. Cor mais saturada = LTV mais alto. Pista clara pra Google Ads regional." />
          <_Story tone="amber">
            Esta matriz responde a pergunta da diretoria comercial: <b>onde investir mais dinheiro em ads?</b> Marca × UF com cor saturada = ROI alto provável. Branco/cinza = volume insuficiente, não cole orçamento ali.
          </_Story>
          <div className="card" style={{ marginBottom: 22 }}>
            <DispersaoMatriz cells={D.dispersao_marca_x_uf} top10marcas={top10marcas} top10ufs={top10ufs} />
          </div>
        </>
      )}

      {/* ====== 09 · PRODUTOS DA 2ª COMPRA ====== */}
      {D.produtos_segunda_compra && D.produtos_segunda_compra.length > 0 && (
        <>
          <_SectionTitle num="09"
            title="Produtos preferidos na 2ª compra"
            desc="O que o cliente Astro compra DEPOIS da primeira vez." />
          <_Story>
            Compare esta lista com a de <b>gateway</b>: se os produtos forem os mesmos, sua oferta de cross-sell está fraca (o cliente compra a mesma coisa).
            Se forem diferentes, você tem uma <b>jornada de marca</b> — o cliente entrou por um SKU e está explorando seu catálogo.
          </_Story>
          <div className="card" style={{ marginBottom: 22 }}>
            <table className="t" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Produto</th>
                  <th>Marca</th>
                  <th>Sub-cat</th>
                  <th style={{ textAlign: 'right' }}>Clientes</th>
                  <th style={{ textAlign: 'right' }}>Receita</th>
                </tr>
              </thead>
              <tbody>
                {D.produtos_segunda_compra.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                    <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.seo_title}>{r.seo_title}</td>
                    <td style={{ color: 'var(--text-2)' }}>{r.marca || '—'}</td>
                    <td style={{ color: 'var(--mute)', fontSize: 11 }}>{r.sub_categoria || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(r.n_clientes)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{_fmtBRLk(r.receita)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ====== 10 · RECOMENDAÇÕES FINAIS ====== */}
      <_SectionTitle num="10" title="O que fazer com isto?" desc="Conclusões acionáveis a partir das 9 seções acima." />

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
        <_Story tone="green">
          <b style={{ color: 'var(--green)', fontSize: 13, display: 'block', marginBottom: 6 }}>▸ E-mail Marketing</b>
          Dispare campanha de "produtos que você ainda não experimentou" em D+45 do primeiro pedido (antes do pico de esquecimento aos 90d). Use os top 10 produtos da 2ª compra como CTAs.
        </_Story>
        <_Story tone="cyan">
          <b style={{ color: 'var(--cyan)', fontSize: 13, display: 'block', marginBottom: 6 }}>▸ Google Ads</b>
          Concentre orçamento em [Marca, UF] da matriz onde cor está saturada. Não desperdice em [marca, UF] de baixo volume — você vai pagar caro pra adquirir cliente que não tem LTV.
        </_Story>
        <_Story tone="violet">
          <b style={{ color: 'var(--violet)', fontSize: 13, display: 'block', marginBottom: 6 }}>▸ Curadoria de catálogo</b>
          Os top 10 <b>produtos gateway</b> são candidatos óbvios pra "produtos em destaque" na home e em retargeting. Garanta estoque sempre — ruptura aqui mata aquisição.
        </_Story>
        <_Story tone="amber">
          <b style={{ color: 'var(--amber)', fontSize: 13, display: 'block', marginBottom: 6 }}>▸ Segmentação PF vs PJ</b>
          PF (revendedores) recebe campanhas de mix novo, frete frequente. PJ (obra) recebe campanhas de "lembrete de fim de obra" pra forçar 2ª compra. Tratar igual mata 30% da conversão.
        </_Story>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, padding: '16px 0', borderTop: '1px solid var(--border)',
                     textAlign: 'center', fontSize: 11, color: 'var(--mute)' }}>
        Astro · Análise de Recompra · Filtra <code>situacao != 'Cancelado'</code> · {_fmtNum(k.n_clientes_novos)} clientes novos · {_fmtNum(D.taxa_recompra_por_marca?.length || 0)} marcas analisadas
      </div>
    </div>
  );
};

Object.assign(window, { PageRecompra });
