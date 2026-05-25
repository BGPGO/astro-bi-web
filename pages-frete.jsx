/**
 * pages-frete.jsx - tela Frete RJ portada do Streamlit (Astro/pages/2_Frete_RJ.py).
 *
 * Dados: window.FRETE_DATA (gerado por scripts/build_frete_data.py a partir
 * de astro-giro-bi/data/frete_empresa_rj.csv). Pre-calculados em build-time.
 *
 * Helpers de chart e formatacao (AstroBarV, AstroBarH, _fmtBRL, etc) sao
 * declarados em pages-astro.jsx no MESMO bundle (esbuild concat) -- estao
 * disponiveis no escopo via build-jsx.cjs.
 *
 * Foco: gap absorvido (custo real Astro - cobrado cliente), distribuicao
 * de prejuizo por faixa, e ranking de transportadoras (Braspress queima
 * 8x mais que cobra).
 */

const PageFreteRJ = () => {
  const D = window.FRETE_DATA;
  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          frete-data.js nao carregado. Rode: <code>python scripts/build_frete_data.py</code>
        </div>
      </div>
    );
  }

  const k = D.kpis;
  const transp = D.por_transportadora || [];
  const faixas = D.faixas_gap || [];
  const piores = D.top_piores || [];

  // === KPI Tiles (4 grandes) ===
  // 1: Gap absorvido (custo - cobrado). Quanto a Astro tirou do bolso. RED.
  // 2: % frete zero (envios sem cobrar nada do cliente). AMBER.
  // 3: n envios totais analisados. CYAN.
  // 4: Custo medio por envio. GREEN.

  // === Bar chart faixas: usa AstroBarV mas com cores variaveis por sinal ===
  // Como AstroBarV nao suporta cor por barra, montamos custom inline.
  const faixaValues = faixas.map(f => f.gap_total);
  const faixaLabels = faixas.map(f => f.faixa.split(' ')[0]);
  const faixaN = faixas.map(f => f.n);
  const maxFaixa = Math.max(...faixaValues.map(v => Math.abs(v)));

  const faixaColors = faixas.map(f => {
    if (f.gap_total <= 0) return 'var(--green)';
    if (f.gap_total < 10000) return 'var(--amber)';
    if (f.gap_total < 30000) return '#f97316'; // orange
    return 'var(--red)';
  });

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Frete RJ</b>
      </div>

      <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 20, maxWidth: 880 }}>
        Frete gratis para o Rio de Janeiro: <b>{_fmtNum(k.n_envios)}</b> envios analisados.
        A Astro cobrou <b>{_fmtBRL(k.total_cobrado)}</b> e pagou <b>{_fmtBRL(k.total_custo)}</b> as
        transportadoras — diferenca absorvida pela operacao: <b style={{ color: 'var(--red)' }}>{_fmtBRL(k.gap_total)}</b>.
      </p>

      {/* === 4 KPIs grandes === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile red">
          <div className="kpi-label">Gap Absorvido</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.gap_total).replace('R$ ','')}</div>
          <div className="kpi-hint">custo Astro − cobrado cliente</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">% Frete Zero</div>
          <div className="kpi-value">{_fmtPct(k.pct_frete_zero)}</div>
          <div className="kpi-hint">{_fmtNum(k.n_frete_zero)} envios sem cobrar nada</div>
        </div>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Envios Totais</div>
          <div className="kpi-value">{_fmtNum(k.n_envios)}</div>
          <div className="kpi-hint">base RJ analisada</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Custo Medio / Envio</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.custo_medio).replace('R$ ','')}</div>
          <div className="kpi-hint">pago a transportadora</div>
        </div>
      </div>

      {/* === Por Transportadora === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Por Transportadora · Braspress queima {transp.find(t => t.nome === 'BRASPRESS')?.ratio_custo_cobrado.toFixed(1) || '—'}x o que cobra
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Transportadora</th>
              <th style={{ textAlign: 'right' }}>N</th>
              <th style={{ textAlign: 'right' }}>Peso médio (kg)</th>
              <th style={{ textAlign: 'right' }}>Cobrado médio</th>
              <th style={{ textAlign: 'right' }}>Custo médio</th>
              <th style={{ textAlign: 'right' }}>Ratio C/Cobrado</th>
              <th style={{ textAlign: 'right' }}>R$/kg cobrado</th>
              <th style={{ textAlign: 'right' }}>R$/kg custo</th>
              <th style={{ textAlign: 'right' }}>Gap total</th>
            </tr>
          </thead>
          <tbody>
            {transp.map((t, i) => {
              const isBrasp = t.nome === 'BRASPRESS';
              const rowBg = isBrasp ? 'rgba(239, 68, 68, 0.08)' : undefined;
              const ratioColor = !t.ratio_custo_cobrado ? 'var(--mute)'
                : t.ratio_custo_cobrado >= 5 ? 'var(--red)'
                : t.ratio_custo_cobrado >= 2 ? 'var(--amber)'
                : 'var(--green)';
              return (
                <tr key={i} style={{ background: rowBg }}>
                  <td style={{ fontWeight: isBrasp ? 700 : 500, color: isBrasp ? 'var(--red)' : 'var(--text)' }}>
                    {t.nome}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(t.n)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(t.peso_med, 1)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(t.frete_cobrado_med)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(t.custo_med)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: ratioColor }}>
                    {t.ratio_custo_cobrado != null ? `${t.ratio_custo_cobrado.toFixed(2)}x` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtBRL(t.rs_kg_cobrado)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtBRL(t.rs_kg_custo)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: t.gap_total > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {_fmtBRLk(t.gap_total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === Faixas de Gap === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Distribuicao por Faixa de Gap
      </h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Gap total por faixa</h2></div>
          <div style={{ height: 240, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '20px 4px 0' }}>
            {faixaValues.map((v, i) => {
              const pct = (Math.abs(v) / maxFaixa) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                    {_fmtBRLk(v)}
                  </span>
                  <div style={{
                    width: '100%', maxWidth: 56,
                    background: faixaColors[i],
                    height: `${Math.max(2, pct)}%`,
                    borderRadius: '6px 6px 0 0',
                    boxShadow: '0 -2px 12px rgba(34,211,238,0.2)'
                  }} />
                  <span style={{ fontSize: 10, color: 'var(--mute)', textAlign: 'center', lineHeight: 1.2 }}>
                    {faixaLabels[i]}<br/><span style={{ fontFamily: 'var(--font-mono)' }}>n={_fmtNum(faixaN[i])}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Detalhe por faixa</h2></div>
          <table className="t" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Faixa</th>
                <th style={{ textAlign: 'right' }}>N</th>
                <th style={{ textAlign: 'right' }}>%</th>
                <th style={{ textAlign: 'right' }}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {faixas.map((f, i) => (
                <tr key={i}>
                  <td style={{ color: faixaColors[i], fontWeight: 600 }}>{f.faixa}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(f.n)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtPct(f.pct)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: f.gap_total > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {_fmtBRLk(f.gap_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* === Top 20 piores === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Top 20 piores prejuizos individuais
      </h3>
      <div className="card">
        <table className="t" style={{ width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', width: 50 }}>#</th>
              <th style={{ textAlign: 'left' }}>Pedido</th>
              <th style={{ textAlign: 'left' }}>Transportadora</th>
              <th style={{ textAlign: 'right' }}>Peso (kg)</th>
              <th style={{ textAlign: 'right' }}>Cobrado</th>
              <th style={{ textAlign: 'right' }}>Custo Astro</th>
              <th style={{ textAlign: 'right' }}>Gap</th>
            </tr>
          </thead>
          <tbody>
            {piores.map((p, i) => (
              <tr key={p.id}>
                <td style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{p.id}</td>
                <td style={{ color: p.transportadora === 'BRASPRESS' ? 'var(--red)' : 'var(--text-2)', fontWeight: p.transportadora === 'BRASPRESS' ? 700 : 500 }}>
                  {p.transportadora}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(p.peso, 1)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: p.cobrado === 0 ? 'var(--amber)' : 'var(--text-2)' }}>
                  {_fmtBRL(p.cobrado)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(p.custo)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>
                  {_fmtBRL(p.gap)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

Object.assign(window, { PageFreteRJ });
