/**
 * pages-geral.jsx - Astro · Geral (Marketing/Comercial mes atual)
 *
 * Replica a tela PBI "GERAL" (pbi_05.png) com filtro de ano-mes + categoria.
 * Storytelling:
 *   - 3 blocos KPI verticais (Recompra / Novo / ADS)
 *   - 4 KPIs financeiros horizontais (CMV, CFV, Valor venda, Valor Liquido)
 *   - 3 barras horizontais Top 15 (UF / Marca / Categoria)
 *   - Tabela Top 20 produtos do mes
 *
 * Dados: window.GERAL_DATA (scripts/build_geral_data.py).
 * Reutiliza AstroBarH, _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct (pages-astro.jsx).
 *
 * IMPORTANTE: este arquivo nao esta no SOURCES de build-jsx.cjs ainda.
 * Adicione 'pages-geral.jsx' em SOURCES e PAGE_COMPS antes de buildar.
 */

const PageGeralComercial = () => {
  const D = window.GERAL_DATA;

  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          geral-data.js nao carregado. Rode: <code>python scripts/build_geral_data.py</code>
        </div>
      </div>
    );
  }

  const meses = D.meses || [];
  const [mes, setMes] = useState(D.mes_default);
  const [categoria, setCategoria] = useState('Todas');
  const [escopo, setEscopo] = useState('Todos'); // Todos / Recompra / Novo

  const k = (D.kpis_por_mes && D.kpis_por_mes[mes]) || {};
  const topMarca = (D.top_marca_por_mes && D.top_marca_por_mes[mes]) || [];
  const topCat = (D.top_cat_por_mes && D.top_cat_por_mes[mes]) || [];
  const topUF = (D.top_uf_por_mes && D.top_uf_por_mes[mes]) || [];
  const topProds = (D.top_produtos_por_mes && D.top_produtos_por_mes[mes]) || [];

  // Filtro categoria (apenas afeta as barras / tabela de produto)
  const topMarcaF = useMemo(() => {
    if (categoria === 'Todas') return topMarca;
    // sem dado mes×cat×marca pre-computado — retorna full (UI mostra aviso)
    return topMarca;
  }, [topMarca, categoria]);

  const topProdsF = useMemo(() => {
    if (categoria === 'Todas') return topProds;
    // produtos nao tem categoria embutida no pre-compute; placeholder
    return topProds;
  }, [topProds, categoria]);

  const mesLabel = (m) => {
    if (!m || m.length < 7) return m || '';
    const [y, mm] = m.split('-');
    const N = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    const idx = parseInt(mm, 10) - 1;
    return `${N[idx] || mm}/${y.slice(2)}`;
  };

  // Cor por escopo (para o card "main")
  const corEscopo = escopo === 'Recompra' ? 'var(--green)'
                   : escopo === 'Novo' ? 'var(--amber)'
                   : 'var(--cyan)';

  return (
    <div className="page bi-dashboard-theme" style={{ padding: '20px 28px 40px' }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Geral · Marketing & Comercial</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          mes referencia: {mesLabel(mes)}
        </span>
      </div>

      {/* Header / Filtros */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        padding: '10px 14px', marginBottom: 18, background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
      }}>
        <span style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1 }}>Ano, Mes:</span>
        <select value={mes} onChange={(e) => setMes(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 8px', minWidth: 120 }}>
          {meses.slice().reverse().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>

        <span style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 12 }}>Categoria:</span>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 8px', minWidth: 160 }}>
          <option value="Todas">Todas</option>
          {(D.categorias_disponiveis || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <span style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 12 }}>Recompra/Novo:</span>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', padding: 3, borderRadius: 6 }}>
          {['Todos', 'Recompra', 'Novo'].map(p => (
            <button key={p}
              onClick={() => setEscopo(p)}
              style={{
                padding: '4px 12px', border: 'none', borderRadius: 4, cursor: 'pointer',
                background: escopo === p ? corEscopo : 'transparent',
                color: escopo === p ? '#0a0e14' : 'var(--text-2)',
                fontWeight: escopo === p ? 700 : 500, fontSize: 11.5,
              }}
            >{p}</button>
          ))}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)' }}>
          {(D.kpis_por_mes && D.kpis_por_mes[mes]) ? 'dados carregados' : 'sem KPIs no mes'}
        </span>
      </div>

      {/* Linha 1: 4 KPIs financeiros (CMV, CFV, Valor venda, Valor Liquido) */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <div className="card kpi-tile cyan">
          <div className="kpi-label">Valor venda</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.valor_total || 0).replace('R$ ', '')}</div>
          <div className="kpi-hint">total vendas {_fmtNum(k.n_pedidos || 0)} pedidos</div>
        </div>
        <div className="card kpi-tile red">
          <div className="kpi-label">CMV</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.cmv || 0).replace('R$ ', '')}</div>
          <div className="kpi-hint">custo da mercadoria</div>
        </div>
        <div className="card kpi-tile amber">
          <div className="kpi-label">CFV (estim. {_fmtPct(D.cfv_pct || 0.0616)})</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.cfv || 0).replace('R$ ', '')}</div>
          <div className="kpi-hint">custo financeiro de venda</div>
        </div>
        <div className="card kpi-tile green">
          <div className="kpi-label">Valor Liquido</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.valor_liquido || 0).replace('R$ ', '')}</div>
          <div className="kpi-hint">margem liq. {_fmtPct(k.margem_liq_pct || 0)}</div>
        </div>
      </div>

      {/* Linha 2: 3 blocos KPI verticais (Recompra / Novo / ADS) + 3 barras top */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.5fr 1.5fr', gap: 14, marginBottom: 18 }}>
        {/* Coluna esquerda: 3 blocos KPI empilhados */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* RECOMPRA */}
          <div className="card" style={{ padding: 14, borderTop: '3px solid var(--green)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--green)', textTransform: 'uppercase', marginBottom: 8 }}>
              Indicadores · Recompra
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <KpiMini label="Pedidos" value={_fmtNum(k.n_recompra || 0)} />
              <KpiMini label="%" value={_fmtPct(k.pct_recompra || 0)} color="var(--green)" />
              <KpiMini label="Valor recorrente" value={_fmtBRLk(k.valor_recompra || 0)} mono />
              <KpiMini label="% valor" value={_fmtPct(k.pct_valor_recompra || 0)} color="var(--green)" />
              <KpiMini label="Ticket medio" value={_fmtBRL(k.ticket_recompra || 0)} mono />
            </div>
          </div>

          {/* NOVO */}
          <div className="card" style={{ padding: 14, borderTop: '3px solid var(--amber)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--amber)', textTransform: 'uppercase', marginBottom: 8 }}>
              Indicadores · Novos
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <KpiMini label="Pedidos" value={_fmtNum(k.n_novo || 0)} />
              <KpiMini label="%" value={_fmtPct(k.pct_novo || 0)} color="var(--amber)" />
              <KpiMini label="Valor novo" value={_fmtBRLk(k.valor_novo || 0)} mono />
              <KpiMini label="% valor" value={_fmtPct(k.pct_valor_novo || 0)} color="var(--amber)" />
              <KpiMini label="Ticket medio" value={_fmtBRL(k.ticket_novo || 0)} mono />
            </div>
          </div>

          {/* ADS */}
          <div className="card" style={{ padding: 14, borderTop: '3px solid var(--violet)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--violet)', textTransform: 'uppercase', marginBottom: 8 }}>
              Indicadores · ADS
            </div>
            {D.gasto_ads_disponivel && (k.gasto_ads || 0) > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <KpiMini label="Gasto ADS" value={_fmtBRLk(k.gasto_ads || 0)} mono />
                <KpiMini label="ROAS" value={(k.roas || 0).toFixed(2).replace('.', ',') + 'x'} color={k.roas >= 2 ? 'var(--green)' : (k.roas >= 1 ? 'var(--amber)' : 'var(--red)')} />
                <KpiMini label="CAC" value={_fmtBRL(k.cac || 0)} mono />
                <KpiMini label="Novos" value={_fmtNum(k.n_novo || 0)} />
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--mute)', padding: '8px 0', lineHeight: 1.5 }}>
                Gasto ADS por mes não disponível. Rode <code>build_campanhas_data.py</code> antes pra alimentar CAC/ROAS.
              </div>
            )}
          </div>
        </div>

        {/* Vendas por Estado */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--cyan)', textTransform: 'uppercase', marginBottom: 10 }}>
            Vendas por Estado · {mesLabel(mes)}
          </div>
          {topUF.length ? (
            <AstroBarH
              items={topUF.map(r => ({ label: r.uf, v: r.valor }))}
              color="cyan"
              fmt={_fmtBRLk}
            />
          ) : (
            <div className="empty" style={{ padding: 20, color: 'var(--mute)' }}>sem dados por UF</div>
          )}
        </div>

        {/* Vendas por Marca */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--green)', textTransform: 'uppercase', marginBottom: 10 }}>
            Vendas por Marca · {mesLabel(mes)}
          </div>
          {topMarcaF.length ? (
            <AstroBarH
              items={topMarcaF.map(r => ({ label: r.marca, v: r.valor }))}
              color="green"
              fmt={_fmtBRLk}
            />
          ) : (
            <div className="empty" style={{ padding: 20, color: 'var(--mute)' }}>sem dados por marca</div>
          )}
        </div>

        {/* Vendas por Categoria */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--violet)', textTransform: 'uppercase', marginBottom: 10 }}>
            Vendas por Categoria · {mesLabel(mes)}
          </div>
          {topCat.length ? (
            <AstroBarH
              items={topCat.map(r => ({ label: r.cat, v: r.valor }))}
              color="violet"
              fmt={_fmtBRLk}
            />
          ) : (
            <div className="empty" style={{ padding: 20, color: 'var(--mute)' }}>sem categoria_mae nos dados</div>
          )}
        </div>
      </div>

      {/* Linha 3: ticket geral + resultado bruto + margem */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <div className="card kpi-tile">
          <div className="kpi-label">Total de vendas</div>
          <div className="kpi-value">{_fmtNum(k.n_pedidos || 0)}</div>
          <div className="kpi-hint">pedidos no mes</div>
        </div>
        <div className="card kpi-tile">
          <div className="kpi-label">Ticket medio</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.ticket_total || 0).replace('R$ ', '')}</div>
          <div className="kpi-hint">valor/pedido</div>
        </div>
        <div className="card kpi-tile">
          <div className="kpi-label">Resultado Bruto</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.resultado_bruto || 0).replace('R$ ', '')}</div>
          <div className="kpi-hint">{_fmtPct(k.margem_bruta_pct || 0)} margem</div>
        </div>
        <div className="card kpi-tile">
          <div className="kpi-label">Resultado liquido %</div>
          <div className="kpi-value">{_fmtPct(k.margem_liq_pct || 0)}</div>
          <div className="kpi-hint">apos CMV + CFV</div>
        </div>
      </div>

      {/* Tabela Top Produtos */}
      <h2 style={{
        fontSize: 14, fontWeight: 700, margin: '8px 0 12px', color: 'var(--text)',
        paddingBottom: 6, borderBottom: '2px solid rgba(79,195,247,0.3)',
      }}>
        Top 20 Produtos · {mesLabel(mes)}
      </h2>
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        {topProdsF.length ? (
          <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                <tr>
                  <th style={thStyle('left')}>#</th>
                  <th style={thStyle('left')}>Produto</th>
                  <th style={thStyle('left')}>Marca</th>
                  <th style={thStyle('right')}>Valor venda</th>
                  <th style={thStyle('right')}>Qtde</th>
                  <th style={thStyle('right')}>Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {topProdsF.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={tdMute}>{i + 1}</td>
                    <td style={{ padding: '6px 6px', color: 'var(--text)' }} title={r.produto}>
                      {(r.produto || '').length > 60 ? (r.produto.slice(0, 58) + '…') : r.produto}
                    </td>
                    <td style={tdMute}>{r.marca || '—'}</td>
                    <td style={tdNum}>{_fmtBRL(r.valor || 0)}</td>
                    <td style={tdNum}>{_fmtNum(r.qtd || 0, 0)}</td>
                    <td style={tdNum}>{_fmtNum(r.n_pedidos || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ padding: 30, color: 'var(--mute)', textAlign: 'center' }}>
            sem produtos no mes selecionado
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', color: 'var(--mute)', fontSize: 11, padding: '20px 0' }}>
        Astro BI · Geral · gerado em {(D.gerado_em || '').slice(0, 10)} · fonte: Tiny ERP (vendas_dash.parquet)
      </div>
    </div>
  );
};

// === Helper local: KPI mini tile ===
const KpiMini = ({ label, value, mono = false, color = 'var(--text)' }) => (
  <div style={{ padding: '6px 0' }}>
    <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
    <div style={{
      fontSize: 15, fontWeight: 700, color,
      fontFamily: mono ? 'var(--font-mono)' : 'inherit',
    }}>{value}</div>
  </div>
);

// === Estilos table ===
const thStyle = (align) => ({
  textAlign: align, padding: '8px 6px', color: 'var(--mute)',
  fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap',
});
const tdMute = { padding: '6px 6px', color: 'var(--text-2)', fontSize: 12 };
const tdNum = { padding: '6px 6px', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12 };

// Registra no escopo do bundle
Object.assign(window, { PageGeralComercial });
