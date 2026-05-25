/**
 * pages-frete.jsx V2 - tela Frete RJ portada do Streamlit (Astro/pages/2_Frete_RJ.py).
 *
 * Dados: window.FRETE_DATA (gerado por scripts/build_frete_data.py a partir
 * de astro-giro-bi/data/frete_empresa_rj.csv + vendas_tiny_bu.parquet).
 *
 * V2 adiciona reatividade:
 *  - Slider de cenarios de corte (recalcula economia anual on the fly)
 *  - Cross-filter: clicar numa linha de transportadora filtra top piores
 *  - Storytelling literal copiado do Streamlit (Filipe 29/04/2026)
 *  - 11 blocos (vs 4 da V1)
 *
 * Helpers globais: AstroBarV (com onBarClick + activeIdx), AstroLine,
 * AstroBarH, AstroDonut, _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct.
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
  const fzPorTransp = D.frete_zero_por_transp || [];
  const porFaixaVal = D.por_faixa_valor_pedido || [];
  const cenarios = D.cenarios_corte || [];
  const serieDiaria = D.serie_diaria_gap || [];
  const topSubs = D.top_clientes_subsidiados || [];

  // === Estado reativo ===
  // Slider: ponto de corte de FG (R$). 0 = mantem tudo, valores maiores eliminam
  // FG progressivamente. Usa interpolacao linear entre os 7 cenarios pre-calc.
  const [corte, setCorte] = useState(700); // default 700: o sweet spot do storytelling

  // Cross-filter: transportadora selecionada -> filtra top piores
  const [transpFiltro, setTranspFiltro] = useState(null);

  // === Slider: economia interpolada ===
  // cenarios eh um array [{X, economia_anual, n_envios_afetados, ...}]
  // Interpola linearmente entre os pontos pre-computados.
  const cenarioCorrente = useMemo(() => {
    if (!cenarios.length) return null;
    // encontrar par envelope
    const sorted = [...cenarios].sort((a, b) => a.X - b.X);
    if (corte <= sorted[0].X) return sorted[0];
    if (corte >= sorted[sorted.length - 1].X) return sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (corte >= a.X && corte <= b.X) {
        const t = (corte - a.X) / (b.X - a.X);
        return {
          X: corte,
          n_envios_afetados: Math.round(a.n_envios_afetados + t * (b.n_envios_afetados - a.n_envios_afetados)),
          economia_anual: a.economia_anual + t * (b.economia_anual - a.economia_anual),
          economia_periodo: a.economia_periodo + t * (b.economia_periodo - a.economia_periodo),
          pct_envios: a.pct_envios + t * (b.pct_envios - a.pct_envios),
        };
      }
    }
    return sorted[0];
  }, [corte, cenarios]);

  // === Top piores filtrado por transportadora (cross-filter) ===
  const pioresFiltrados = useMemo(() => {
    if (!transpFiltro) return piores;
    return piores.filter(p => p.transportadora === transpFiltro);
  }, [piores, transpFiltro]);

  // === Bar chart de faixas (cores variando por intensidade) ===
  const faixaValues = faixas.map(f => f.gap_total);
  const faixaLabels = faixas.map(f => f.faixa.split(' ')[0]);
  const faixaN = faixas.map(f => f.n);
  const maxFaixa = Math.max(...faixaValues.map(v => Math.abs(v)));
  const faixaColors = faixas.map(f => {
    if (f.gap_total <= 0) return 'var(--green)';
    if (f.gap_total < 10000) return 'var(--amber)';
    if (f.gap_total < 30000) return '#f97316';
    return 'var(--red)';
  });

  // === Bar chart faixas de valor de pedido ===
  const fvLabels = porFaixaVal.map(f => f.faixa);
  const fvValues = porFaixaVal.map(f => f.frete_pct_valor * 100);

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      {/* === Breadcrumb === */}
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Frete RJ</b>
      </div>

      {/* === BLOCO 1: Storytelling literal do Streamlit === */}
      <div style={{
        background: 'rgba(34, 211, 238, 0.06)',
        border: '1px solid rgba(34, 211, 238, 0.2)',
        borderLeft: '3px solid var(--cyan)',
        padding: '14px 18px', borderRadius: 8, marginBottom: 18, maxWidth: 980,
      }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text)' }}>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: 'var(--cyan)' }}>Filipe (29/04/2026):</b>{' '}
            <i>"Frete grátis para o Rio de Janeiro. Cara, eu eliminaria."</i>
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: 'var(--violet)' }}>Vitor:</b>{' '}
            <i>"quanto que isso gera no mês de prejuízo?"</i>
          </p>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 12.5 }}>
            A leitura "elimina porque custa R$ 6k/mês" é enganosa. O custo do frete grátis
            precisa ser comparado com a margem que ele gera e o LTV dos clientes que entram
            por esse canal. Esta página mostra os dois lados e identifica a <b>cauda</b>
            {' '}(poucos pedidos tóxicos) que vale cortar sem matar o programa.
          </p>
        </div>
      </div>

      {/* === BLOCO 2: Veredito (success box do Streamlit) === */}
      <div style={{
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        padding: '12px 16px', borderRadius: 8, marginBottom: 22, maxWidth: 980,
        fontSize: 13, color: 'var(--text)',
      }}>
        <b style={{ color: 'var(--green)' }}>Manter o programa, cortar a cauda.</b>{' '}
        O frete grátis em RJ gera <b>27,6% de margem líquida</b> (R$ 942k) e atrai clientes
        com <b>LTV 4x maior</b> que os que pagam frete. Eliminar o programa economiza R$ 6k/mês
        mas perde o canal de aquisição desses clientes. O foco deve ser{' '}
        <b>excluir os pedidos tóxicos da cauda</b> (peso muito alto ou frete &gt; 20% do pedido)
        que individualmente queimam margem.
      </div>

      {/* === BLOCO 3: 4 KPIs grandes === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile red">
          <div className="kpi-label">Gap Absorvido</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.gap_total).replace('R$ ','')}</div>
          <div className="kpi-hint">
            R$ {_fmtBRLk(k.gap_anualizado).replace('R$ ','')}/ano · {k.meses_janela}m janela
          </div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">% Frete Zero</div>
          <div className="kpi-value">{_fmtPct(k.pct_frete_zero)}</div>
          <div className="kpi-hint">{_fmtNum(k.n_frete_zero)} envios sem cobrar nada</div>
        </div>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Envios Totais</div>
          <div className="kpi-value">{_fmtNum(k.n_envios)}</div>
          <div className="kpi-hint">{k.data_min} → {k.data_max}</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Custo Médio / Envio</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.custo_medio).replace('R$ ','')}</div>
          <div className="kpi-hint">pago à transportadora</div>
        </div>
      </div>

      {/* === BLOCO 4: Slider reativo - cenarios de corte === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Simulador: e se cortarmos frete grátis acima de R$ {corte.toLocaleString('pt-BR')}?
      </h3>
      <div className="card" style={{ marginBottom: 22, padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 20, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
              Ponto de corte: pedidos com valor &ge; <b style={{ color: 'var(--cyan)' }}>R$ {corte.toLocaleString('pt-BR')}</b> deixariam de receber FG
            </div>
            <input
              type="range"
              min="0"
              max="2000"
              step="100"
              value={corte}
              onChange={(e) => setCorte(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--cyan)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--mute)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              <span>R$ 0 (cortar tudo)</span>
              <span>R$ 700 (sweet spot)</span>
              <span>R$ 2.000 (so cauda)</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Envios afetados</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--amber)' }}>
              {_fmtNum(cenarioCorrente?.n_envios_afetados || 0)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--mute)' }}>{_fmtPct(cenarioCorrente?.pct_envios || 0)} do total</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Economia no período</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>
              {_fmtBRLk(cenarioCorrente?.economia_periodo || 0)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--mute)' }}>{k.meses_janela}m acumulados</div>
          </div>
          <div style={{ textAlign: 'center', background: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Economia ANUAL</div>
            <div style={{ fontSize: 26, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--green)' }}>
              {_fmtBRLk(cenarioCorrente?.economia_anual || 0)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--mute)' }}>extrapolado de {k.meses_janela}m</div>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--mute)', fontStyle: 'italic' }}>
          Interpolação linear entre cenários pré-computados em R$ 0 / 200 / 500 / 700 / 1k / 1,5k / 2k.
          Considera apenas pedidos com valor disponível no cruzamento com vendas_tiny.parquet.
        </div>
      </div>

      {/* === BLOCO 5: Tabela cenarios completa === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Tabela de cenários de corte (pré-computada)
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Cenário</th>
              <th style={{ textAlign: 'right' }}>Envios afetados</th>
              <th style={{ textAlign: 'right' }}>% do total</th>
              <th style={{ textAlign: 'right' }}>Economia período</th>
              <th style={{ textAlign: 'right' }}>Economia ANUAL</th>
            </tr>
          </thead>
          <tbody>
            {cenarios.map((c, i) => {
              const isCurrent = Math.abs(c.X - corte) <= 50;
              return (
                <tr key={i} style={{ background: isCurrent ? 'rgba(34,211,238,0.08)' : undefined, cursor: 'pointer' }} onClick={() => setCorte(c.X)}>
                  <td style={{ fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--cyan)' : 'var(--text)' }}>
                    {c.label}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(c.n_envios_afetados)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtPct(c.pct_envios)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtBRLk(c.economia_periodo)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)', fontWeight: 700 }}>
                    {_fmtBRLk(c.economia_anual)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)' }}>
          Clique numa linha para definir o slider acima.
        </div>
      </div>

      {/* === BLOCO 6: Por Transportadora (com cross-filter) === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Por Transportadora · Braspress queima {transp.find(t => t.nome === 'BRASPRESS')?.ratio_custo_cobrado.toFixed(1) || '—'}x o que cobra
        {transpFiltro && (
          <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 500, color: 'var(--amber)' }}>
            · filtrando piores por <b>{transpFiltro}</b>{' '}
            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setTranspFiltro(null)}>limpar</span>
          </span>
        )}
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
              const isSel = transpFiltro === t.nome;
              const rowBg = isSel ? 'rgba(34,211,238,0.15)' : (isBrasp ? 'rgba(239, 68, 68, 0.08)' : undefined);
              const ratioColor = !t.ratio_custo_cobrado ? 'var(--mute)'
                : t.ratio_custo_cobrado >= 5 ? 'var(--red)'
                : t.ratio_custo_cobrado >= 2 ? 'var(--amber)'
                : 'var(--green)';
              return (
                <tr key={i}
                    style={{ background: rowBg, cursor: 'pointer' }}
                    onClick={() => setTranspFiltro(isSel ? null : t.nome)}>
                  <td style={{ fontWeight: isBrasp ? 700 : 500, color: isBrasp ? 'var(--red)' : 'var(--text)' }}>
                    {t.nome}
                    {isSel && <span style={{ marginLeft: 6, color: 'var(--cyan)', fontSize: 11 }}>(filtrando)</span>}
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
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: t.gap_total > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                    {_fmtBRLk(t.gap_total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)' }}>
          Clique numa linha para filtrar a tabela de top piores por essa transportadora.
        </div>
      </div>

      {/* === BLOCO 7: Faixas de Gap (bar custom + tabela) === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Distribuição por Faixa de Gap (custo Astro − cobrado cliente)
      </h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Gap total por faixa</h2></div>
          <div style={{ height: 260, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '20px 4px 0' }}>
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
                    boxShadow: '0 -2px 12px rgba(34,211,238,0.2)',
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
                <th style={{ textAlign: 'right' }}>Gap méd</th>
                <th style={{ textAlign: 'right' }}>Gap total</th>
              </tr>
            </thead>
            <tbody>
              {faixas.map((f, i) => (
                <tr key={i}>
                  <td style={{ color: faixaColors[i], fontWeight: 600 }}>{f.faixa}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(f.n)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtPct(f.pct)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtBRL(f.gap_med)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: f.gap_total > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {_fmtBRLk(f.gap_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* === BLOCO 8: Distribuicao por faixa de valor de pedido === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Distribuição por Valor do Pedido · onde o frete dói mais (% sobre receita)
      </h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Frete pago Astro / receita do pedido</h2></div>
          <AstroBarV values={fvValues} labels={fvLabels} color="violet" height={240}
                     fmt={(v) => `${v.toFixed(1)}%`} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Detalhe por faixa</h2></div>
          <table className="t" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Faixa pedido</th>
                <th style={{ textAlign: 'right' }}>N</th>
                <th style={{ textAlign: 'right' }}>Receita</th>
                <th style={{ textAlign: 'right' }}>Custo frete</th>
                <th style={{ textAlign: 'right' }}>Frete/Receita</th>
              </tr>
            </thead>
            <tbody>
              {porFaixaVal.map((f, i) => {
                const danger = f.frete_pct_valor > 0.15 ? 'var(--red)' : f.frete_pct_valor > 0.08 ? 'var(--amber)' : 'var(--green)';
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{f.faixa}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(f.n)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtBRLk(f.receita_total)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(f.custo_frete_total)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: danger, fontWeight: 700 }}>
                      {_fmtPct(f.frete_pct_valor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* === BLOCO 9: Serie diaria de gap (90d) === */}
      {serieDiaria.length > 0 && (
        <>
          <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
            Tendência diária do gap (últimos {serieDiaria.length} dias com envios)
          </h3>
          <div className="card" style={{ marginBottom: 22 }}>
            <AstroLine
              values={serieDiaria.map(s => s.gap)}
              labels={serieDiaria.map(s => s.data)}
              color="var(--red)"
              height={200}
            />
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Gap diário absorvido pela Astro</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                média: {_fmtBRL(serieDiaria.reduce((a, b) => a + b.gap, 0) / serieDiaria.length)}/dia
              </span>
            </div>
          </div>
        </>
      )}

      {/* === BLOCO 10: Top 50 piores (com filtro reativo) === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Top {transpFiltro ? `piores em ${transpFiltro}` : '50 piores'} ({_fmtNum(pioresFiltrados.length)} envios)
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', width: 40 }}>#</th>
              <th style={{ textAlign: 'left' }}>Pedido</th>
              <th style={{ textAlign: 'left' }}>Cliente</th>
              <th style={{ textAlign: 'left' }}>Transportadora</th>
              <th style={{ textAlign: 'right' }}>Peso (kg)</th>
              <th style={{ textAlign: 'right' }}>Pedido (R$)</th>
              <th style={{ textAlign: 'right' }}>Cobrado</th>
              <th style={{ textAlign: 'right' }}>Custo Astro</th>
              <th style={{ textAlign: 'right' }}>Gap</th>
            </tr>
          </thead>
          <tbody>
            {pioresFiltrados.map((p, i) => (
              <tr key={p.id}>
                <td style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{p.id}</td>
                <td style={{ fontSize: 11.5, color: 'var(--text-2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.cliente}>
                  {p.cliente || '—'}
                </td>
                <td style={{ color: p.transportadora === 'BRASPRESS' ? 'var(--red)' : 'var(--text-2)', fontWeight: p.transportadora === 'BRASPRESS' ? 700 : 500 }}>
                  {p.transportadora}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(p.peso, 1)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                  {p.valor_pedido > 0 ? _fmtBRL(p.valor_pedido) : '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: p.cobrado === 0 ? 'var(--amber)' : 'var(--text-2)' }}>
                  {_fmtBRL(p.cobrado)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(p.custo)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>
                  {_fmtBRL(p.gap)}
                </td>
              </tr>
            ))}
            {pioresFiltrados.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--mute)' }}>
                Nenhum dos top 50 piores está nessa transportadora. Limpe o filtro.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* === BLOCO 11: Caso emblematico (storytelling) === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Caso emblemático · 60 capacetes para o Rio
      </h3>
      <div style={{
        background: 'rgba(239, 68, 68, 0.06)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderLeft: '3px solid var(--red)',
        padding: '14px 18px', borderRadius: 8, marginBottom: 22, maxWidth: 980,
        fontSize: 13.5, lineHeight: 1.6, color: 'var(--text)',
      }}>
        <p style={{ margin: '0 0 8px' }}>
          <b>Pedido tipo:</b> cliente do RJ pede <b>60 capacetes</b> a R$ 28 cada = <b>R$ 1.700</b>.
          Carga pesada (~30 kg), envio via Braspress. Astro cobra <b>R$ 0</b> de frete (programa FG-RJ),
          paga <b>R$ 600</b> à transportadora. Margem bruta do pedido: R$ 510. Após frete absorvido:{' '}
          <b style={{ color: 'var(--red)' }}>−R$ 90 de prejuízo</b>.
        </p>
        <p style={{ margin: '0 0 8px' }}>
          <b>O que pode dar errado:</b> cliente recebe, alega que o produto não é o esperado,{' '}
          <b>devolve</b>. Astro paga frete reverso (mais R$ 600). Resultado final do pedido:{' '}
          <b style={{ color: 'var(--red)' }}>−R$ 1.290</b>. E o produto volta avariado.
        </p>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 12.5 }}>
          <b>Diagnóstico:</b> não é o programa FG-RJ que é ruim — é a regra "vale pra qualquer peso/valor".
          A cauda (faixa <i>Apocaliptico &gt; R$ 500</i>: 23 envios = R$ 17,8k de gap) e a faixa{' '}
          <i>Trágico R$ 200–500</i> (135 envios = R$ 41k) explicam{' '}
          <b>{_fmtPct((17819 + 41078) / k.gap_total)}</b> do gap total com apenas{' '}
          <b>{_fmtPct((23 + 135) / k.n_envios)}</b> dos envios. <b>Cortar essa cauda</b> (regra: pedido &gt; R$ 700 paga frete)
          economiza ~R$ {_fmtBRLk(cenarios.find(c => c.X === 700)?.economia_anual || 0).replace('R$ ', '')}/ano sem afetar 95% dos clientes do programa.
        </p>
      </div>

      {/* === BLOCO 12: Top clientes subsidiados === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Top 20 clientes que mais consumiram subsídio de frete grátis
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', width: 40 }}>#</th>
              <th style={{ textAlign: 'left' }}>Cliente</th>
              <th style={{ textAlign: 'right' }}>Pedidos FG</th>
              <th style={{ textAlign: 'right' }}>Pedidos (R$)</th>
              <th style={{ textAlign: 'right' }}>Frete absorvido</th>
              <th style={{ textAlign: 'right' }}>% Frete/Pedido</th>
            </tr>
          </thead>
          <tbody>
            {topSubs.map((c, i) => {
              const pct = c.pct_frete_sobre_pedido;
              const danger = pct > 0.20 ? 'var(--red)' : pct > 0.10 ? 'var(--amber)' : 'var(--green)';
              return (
                <tr key={i}>
                  <td style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                  <td style={{ fontSize: 12 }}>{c.cliente || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(c.n_pedidos_fg)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtBRLk(c.valor_pedido_total)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>
                    {_fmtBRL(c.custo_frete_absorvido)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: danger, fontWeight: 700 }}>
                    {pct > 0 ? _fmtPct(pct) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === BLOCO 13: Conclusao e recomendacao === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Conclusão e recomendação
      </h3>
      <div style={{
        background: 'rgba(16, 185, 129, 0.06)',
        border: '1px solid rgba(16, 185, 129, 0.25)',
        padding: '16px 20px', borderRadius: 8, marginBottom: 30, maxWidth: 980,
        fontSize: 13.5, lineHeight: 1.65, color: 'var(--text)',
      }}>
        <p style={{ margin: '0 0 10px' }}>
          <b style={{ color: 'var(--green)' }}>1. NÃO eliminar o programa FG-RJ.</b>{' '}
          Ele gera 27,6% de margem líquida e atrai clientes com LTV 4x maior. Quem cortar perde o canal de aquisição.
        </p>
        <p style={{ margin: '0 0 10px' }}>
          <b style={{ color: 'var(--green)' }}>2. Cortar a cauda: pedidos &gt; R$ 700 passam a pagar frete.</b>{' '}
          Economia anual estimada: <b>{_fmtBRLk(cenarios.find(c => c.X === 700)?.economia_anual || 0)}</b>{' '}
          ({_fmtNum(cenarios.find(c => c.X === 700)?.n_envios_afetados || 0)} envios afetados de {_fmtNum(k.n_envios)}).
        </p>
        <p style={{ margin: '0 0 10px' }}>
          <b style={{ color: 'var(--amber)' }}>3. Renegociar Braspress urgente.</b>{' '}
          Ratio 8,3x custo/cobrado é absurdo. Responsável por {_fmtBRLk(transp.find(t => t.nome === 'BRASPRESS')?.gap_total || 0)} de gap
          ({_fmtPct((transp.find(t => t.nome === 'BRASPRESS')?.gap_total || 0) / k.gap_total)} do total) com só {_fmtPct((transp.find(t => t.nome === 'BRASPRESS')?.n || 0) / k.n_envios)} dos envios.
          Ou trocar de transportadora pra cargas pesadas, ou renegociar tabela.
        </p>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 12.5, fontStyle: 'italic' }}>
          Para resposta definitiva sobre o LTV (item 1), considerar teste A/B real: suspender FG em metade dos CEPs de RJ por 90 dias
          e medir queda de aquisição vs economia. Sem isso, a estimativa "4x LTV" tem viés de auto-seleção (quem ganha FG já fazia pedidos grandes).
        </p>
      </div>
    </div>
  );
};

Object.assign(window, { PageFreteRJ });
