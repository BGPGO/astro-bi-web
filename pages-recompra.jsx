/**
 * pages-recompra.jsx — tela "Recompra" portada do Streamlit (astro-giro-bi/dashboard_recompra.py).
 *
 * Foco analítico: KPIs, taxa de recompra por marca, produtos gateway, LTV por UF.
 * Storytelling fica como insight curto em texto, não como narrativa longa.
 *
 * Dados: window.RECOMPRA_DATA (gerado por scripts/build_recompra_data.py).
 * Reutiliza helpers globais já definidos em pages-astro.jsx
 * (_fmtBRL, _fmtBRLk, _fmtNum, _fmtPct, AstroBarV, AstroLine, AstroBarH, AstroDonut).
 *
 * NÃO duplica esses helpers; assume que pages-astro.jsx já foi concatenado antes.
 */

const PageRecompra = () => {
  const D = window.RECOMPRA_DATA;
  if (!D) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          recompra-data.js não carregado. Rode:{' '}
          <code>python scripts/build_recompra_data.py</code>
        </div>
      </div>
    );
  }

  const k = D.kpis;
  const serieValores = D.serie_recompra_mensal.map((x) => x.pct_recompra);
  const serieLabels = D.serie_recompra_mensal.map((x) => x.mes.slice(2));

  // taxa media historica como referencia visual
  const taxaMedia = k.taxa_global_recompra;

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      {/* Breadcrumb */}
      <div
        className="breadcrumb"
        style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Recompra</b>
      </div>

      {/* Insight de abertura — substituto enxuto do storytelling */}
      <div
        className="card"
        style={{
          marginBottom: 18,
          padding: '14px 18px',
          background: 'rgba(34,211,238,0.08)',
          borderLeft: '3px solid var(--cyan)',
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          <b style={{ color: 'var(--cyan)' }}>{_fmtPct(taxaMedia)}</b> dos clientes que entram como
          novos fazem ao menos uma segunda compra. Mas esse número varia muito por marca e por
          produto do primeiro carrinho — veja os <b>gateways</b> abaixo.
        </div>
      </div>

      {/* === KPIs grandes (4) === */}
      <div
        className="grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 22,
        }}
      >
        <div className="kpi-tile cyan">
          <div className="kpi-label">% Receita Recompra</div>
          <div className="kpi-value">{_fmtPct(k.pct_receita_recompra)}</div>
          <div className="kpi-hint">
            {_fmtBRLk(k.receita_recompra)} de {_fmtBRLk(k.receita_total)}
          </div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Ticket Recompra</div>
          <div className="kpi-value">
            <span className="currency">R$</span>
            {_fmtBRLk(k.ticket_recompra).replace('R$ ', '')}
          </div>
          <div className="kpi-hint">{_fmtNum(k.n_recompra_pedidos)} pedidos</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">Ticket Novo</div>
          <div className="kpi-value">
            <span className="currency">R$</span>
            {_fmtBRLk(k.ticket_novo).replace('R$ ', '')}
          </div>
          <div className="kpi-hint">{_fmtNum(k.n_novo_pedidos)} pedidos</div>
        </div>
        <div className="kpi-tile violet">
          <div className="kpi-label">Clientes Recorrentes</div>
          <div className="kpi-value">{_fmtNum(k.n_recorrentes)}</div>
          <div className="kpi-hint">
            de {_fmtNum(k.n_clientes_novos)} novos · taxa {_fmtPct(taxaMedia)}
          </div>
        </div>
      </div>

      {/* === Série mensal % recompra === */}
      <h3
        className="section-title"
        style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}
      >
        Evolução · % de Recompra por Mês (últimos 18m)
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row">
          <h2 className="card-title">% pedidos Recompra ÷ pedidos totais</h2>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>
            {serieLabels[0]} → {serieLabels[serieLabels.length - 1]}
          </span>
        </div>
        <AstroLine values={serieValores} color="var(--cyan)" height={220} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontSize: 11,
            color: 'var(--mute)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>min {_fmtPct(Math.min(...serieValores))}</span>
          <span>
            média{' '}
            {_fmtPct(
              serieValores.reduce((a, b) => a + b, 0) / Math.max(1, serieValores.length)
            )}
          </span>
          <span>max {_fmtPct(Math.max(...serieValores))}</span>
        </div>
      </div>

      {/* === Top marcas com taxa de recompra === */}
      <h3
        className="section-title"
        style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}
      >
        Top 15 Marcas · Taxa de Recompra (marcas com >500 pedidos)
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Marca</th>
              <th style={{ textAlign: 'right' }}>Pedidos</th>
              <th style={{ textAlign: 'right' }}>Receita</th>
              <th style={{ textAlign: 'right' }}>Taxa Recompra</th>
            </tr>
          </thead>
          <tbody>
            {D.top_marcas_recompra.map((r, i) => {
              const high = r.taxa_recompra > 0.8;
              return (
                <tr key={i}>
                  <td>{r.marca}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--mute)',
                    }}
                  >
                    {_fmtNum(r.pedidos)}
                  </td>
                  <td
                    style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                  >
                    {_fmtBRLk(r.receita)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: high ? 'var(--green)' : 'var(--text)',
                    }}
                  >
                    {_fmtPct(r.taxa_recompra)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === Produtos gateway === */}
      <h3
        className="section-title"
        style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}
      >
        Top 20 Produtos Gateway · clientes que entraram com este produto e voltaram
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Marca</th>
              <th>Sub-categoria</th>
              <th style={{ textAlign: 'right' }}>Clientes 1ª</th>
              <th style={{ textAlign: 'right' }}>Voltaram</th>
              <th style={{ textAlign: 'right' }}>Taxa</th>
            </tr>
          </thead>
          <tbody>
            {D.produtos_gateway.map((r, i) => {
              const high = r.taxa_recompra > 0.8;
              return (
                <tr key={i}>
                  <td
                    style={{
                      maxWidth: 320,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={r.seo_title}
                  >
                    {r.seo_title}
                  </td>
                  <td style={{ color: 'var(--text-2)' }}>{r.marca || '—'}</td>
                  <td style={{ color: 'var(--mute)', fontSize: 11 }}>
                    {r.sub_categoria || '—'}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--mute)',
                    }}
                  >
                    {_fmtNum(r.clientes_1a)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-2)',
                    }}
                  >
                    {_fmtNum(r.recompraram)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: high ? 'var(--green)' : 'var(--text)',
                    }}
                  >
                    {_fmtPct(r.taxa_recompra)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === LTV por UF & Top marcas por LTV (linha de baixo) === */}
      <h3
        className="section-title"
        style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}
      >
        LTV Médio do Cliente
      </h3>
      <div
        className="grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}
      >
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Top 15 UFs · LTV médio</h2>
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>
              receita acumulada ÷ clientes
            </span>
          </div>
          <AstroBarH
            items={D.ltv_por_uf.map((x) => ({ label: x.uf, v: x.ltv_medio }))}
            color="cyan"
            fmt={_fmtBRLk}
          />
        </div>
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Top 15 Marcas · LTV médio</h2>
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>
              clientes ≥30 por marca
            </span>
          </div>
          <AstroBarH
            items={D.top_marcas_ltv.map((x) => ({ label: x.marca, v: x.ltv_medio }))}
            color="violet"
            fmt={_fmtBRLk}
          />
        </div>
      </div>
    </div>
  );
};

// Registra no escopo do bundle
Object.assign(window, { PageRecompra });
