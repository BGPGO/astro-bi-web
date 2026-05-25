/**
 * pages-cfv.jsx — tela CFV (Custo Financeiro de Venda) migrada do PBI Astro.
 *
 * Dados: window.CFV_DATA (gerado por scripts/build_cfv_data.py a partir de
 * data/vendas_dash.parquet — slim).
 *
 * IMPORTANTE: o parquet slim NÃO tem as colunas brutas do CFV (Taxa Fixa /
 * Variável / Desconto vêm do PBI original com integração mais profunda).
 * Aplicamos uma APROXIMAÇÃO documentada:
 *
 *   CFV total ≈ 6,16% × valor_rateado (constante)
 *   Decomposição:
 *     60% Taxa Variável | 30% Taxa Fixa | 10% Descontos
 *
 * Todos os valores recebem badge "estimado" na UI. A tela respeita layout do
 * PBI (4 KPIs + bar por forma_pagamento + bar por meio + donut decomposição
 * + tabela detalhada por forma × meio + série mensal).
 *
 * Helpers globais (definidos em pages-astro.jsx): AstroBarV, AstroLine,
 * AstroBarH, AstroDonut, _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct.
 */

const PageCFV = () => {
  const D = window.CFV_DATA;
  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          cfv-data.js não carregado. Rode: <code>python scripts/build_cfv_data.py</code>
        </div>
      </div>
    );
  }

  const k = D.kpis;
  const decomp = D.decomposicao || [];
  const porForma = D.por_forma || [];
  const porMeio = D.por_meio || [];
  const matriz = D.por_forma_x_meio || [];
  const serieMensal = D.serie_mensal || [];
  const premissas = D.premissas || {};

  // Cross-filter por forma_pagamento (clique em barra → realça tabela)
  const [formaSel, setFormaSel] = useState(null);

  // === Badge "estimado" reutilizável ===
  const ESTIM_BADGE = (
    <span style={{
      display: 'inline-block',
      fontSize: 9,
      letterSpacing: 0.4,
      padding: '1px 6px',
      borderRadius: 3,
      border: '1px solid rgba(245, 158, 11, 0.45)',
      color: '#f59e0b',
      background: 'rgba(245, 158, 11, 0.08)',
      fontWeight: 600,
      marginLeft: 8,
      verticalAlign: 'middle',
      textTransform: 'uppercase',
    }}>estimado</span>
  );

  // === Dados para Bar V por forma_pagamento ===
  const formaLabels = porForma.map(f => f.forma_pagamento);
  const formaCfv = porForma.map(f => f.cfv_total);
  const formaIdxSel = formaSel ? porForma.findIndex(f => f.forma_pagamento === formaSel) : null;

  // === Dados para Bar V por meio_pagamento (% do total de vendas) ===
  const meioLabels = porMeio.map(m => m.meio_pagamento);
  const meioVendas = porMeio.map(m => m.valor_total);

  // === Donut decomposição (componentes do CFV) ===
  const decompSegments = decomp.map(d => ({ tipo: d.componente, v: d.valor }));

  // === Matriz filtrada por cross-filter ===
  const matrizFiltrada = useMemo(() => {
    if (!formaSel) return matriz;
    return matriz.filter(r => r.forma_pagamento === formaSel);
  }, [matriz, formaSel]);

  // === Bar H por forma — CFV % do CFV global ===
  const barFormaItems = porForma.map(f => ({
    label: f.forma_pagamento,
    v: f.cfv_total,
  }));

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      {/* === Breadcrumb === */}
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>CFV — Custo Financeiro de Venda</b>
      </div>

      {/* === Storytelling === */}
      <div style={{
        background: 'rgba(245, 158, 11, 0.06)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderLeft: '3px solid #f59e0b',
        padding: '14px 18px', borderRadius: 8, marginBottom: 18, maxWidth: 980,
      }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text)' }}>
          <p style={{ margin: '0 0 8px' }}>
            <b style={{ color: '#f59e0b' }}>CFV (Custo Financeiro de Venda)</b>{' '}
            é a taxa cobrada por canal de pagamento sobre cada venda (gateway de cartão,
            tarifa de boleto, depósito de Pix). Decompõe em <b>Taxa Fixa</b> (R$ por
            transação), <b>Taxa Variável</b> (% sobre o valor) e <b>Descontos</b>
            (concedidos para incentivar meio mais barato, ex: Pix).
          </p>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 12.5 }}>
            <b style={{ color: '#f59e0b' }}>Nota:</b> os valores nesta tela são{' '}
            <b>estimados</b> a partir de <code>vendas_dash.parquet</code> com a premissa{' '}
            <b>CFV ≈ 6,16% × Venda Bruta</b> (média histórica). A decomposição usa pesos
            fixos (60% variável / 30% fixa / 10% desconto). O PBI original calcula com
            as taxas reais de cada gateway/banco — para paridade total, precisamos das
            colunas <code>taxa_fixa</code>, <code>taxa_variavel</code> e{' '}
            <code>valor_desconto</code> na fonte. {ESTIM_BADGE}
          </p>
        </div>
      </div>

      {/* === 4 KPIs === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile red">
          <div className="kpi-label">CFV Total {ESTIM_BADGE}</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.cfv_total).replace('R$ ','')}</div>
          <div className="kpi-hint">{_fmtNum(k.n_pedidos)} pedidos · R$ {_fmtBRLk(k.valor_total).replace('R$ ','')} venda bruta</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">% CFV {ESTIM_BADGE}</div>
          <div className="kpi-value">{_fmtPct(k.cfv_pct, 2)}</div>
          <div className="kpi-hint">média aplicada uniformemente</div>
        </div>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Taxa Fixa {ESTIM_BADGE}</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.taxa_fixa_total).replace('R$ ','')}</div>
          <div className="kpi-hint">{_fmtPct((k.taxa_fixa_total / k.cfv_total) || 0)} do CFV</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Taxa Variável {ESTIM_BADGE}</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.taxa_var_total).replace('R$ ','')}</div>
          <div className="kpi-hint">{_fmtPct((k.taxa_var_total / k.cfv_total) || 0)} do CFV</div>
        </div>
      </div>

      {/* === BAR CFV por forma_pagamento + DONUT decomposição === */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 22 }}>
        <div className="card" style={{ padding: 16 }}>
          <h3 className="section-title" style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px' }}>
            CFV por Forma de Pagamento {ESTIM_BADGE}
            {formaSel && (
              <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 500, color: 'var(--cyan)' }}>
                · filtrado por <b>{formaSel}</b>{' '}
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setFormaSel(null)}>
                  limpar
                </span>
              </span>
            )}
          </h3>
          <AstroBarV
            values={formaCfv}
            labels={formaLabels}
            color="amber"
            height={240}
            activeIdx={formaIdxSel}
            onBarClick={(i, _v, label) => setFormaSel(label === formaSel ? null : label)}
          />
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--mute)' }}>
            Clique numa barra para filtrar a tabela abaixo.
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <h3 className="section-title" style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px' }}>
            Decomposição do CFV {ESTIM_BADGE}
          </h3>
          <AstroDonut segments={decompSegments} size={200} />
          <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.5 }}>
            Pesos fixos: <b>60% variável</b> · <b>30% fixa</b> · <b>10% descontos</b>.
            O PBI original mostra 31,98% / 7,63% / 60,39% — diverge porque calcula com taxas
            reais por gateway que não temos na slim.
          </div>
        </div>
      </div>

      {/* === Bar V por meio_pagamento (% das vendas) === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        % do Total de Vendas por Meio de Pagamento
      </h3>
      <div className="card" style={{ marginBottom: 22, padding: 16 }}>
        <AstroBarV
          values={meioVendas}
          labels={meioLabels}
          color="cyan"
          height={220}
          fmt={_fmtBRLk}
        />
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, porMeio.length)}, 1fr)`, gap: 8 }}>
          {porMeio.map((m, i) => (
            <div key={i} style={{ fontSize: 11.5, color: 'var(--text-2)', textAlign: 'center' }}>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{m.meio_pagamento}</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 14 }}>
                {_fmtPct(m.pct_do_total)}
              </div>
              <div style={{ color: 'var(--mute)' }}>{_fmtNum(m.n_pedidos)} pedidos</div>
            </div>
          ))}
        </div>
      </div>

      {/* === Tabela detalhada por forma × meio === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Detalhamento Forma × Meio de Pagamento {ESTIM_BADGE}
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Forma de Pagamento</th>
              <th style={{ textAlign: 'left' }}>Meio</th>
              <th style={{ textAlign: 'right' }}>CFV total</th>
              <th style={{ textAlign: 'right' }}>% CFV</th>
              <th style={{ textAlign: 'right' }}>Valor total</th>
              <th style={{ textAlign: 'right' }}>Vendas</th>
            </tr>
          </thead>
          <tbody>
            {matrizFiltrada.map((r, i) => {
              const isSel = formaSel === r.forma_pagamento;
              return (
                <tr key={i}
                    style={{ background: isSel ? 'rgba(34,211,238,0.10)' : undefined, cursor: 'pointer' }}
                    onClick={() => setFormaSel(isSel ? null : r.forma_pagamento)}>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>{r.forma_pagamento}</td>
                  <td style={{ color: 'var(--text-2)' }}>{r.meio_pagamento}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>{_fmtBRL(r.cfv_total)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtPct(r.pct_cfv_global)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{_fmtBRL(r.valor_total)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(r.n_pedidos)}</td>
                </tr>
              );
            })}
            {/* Totais */}
            <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
              <td colSpan="2" style={{ color: 'var(--text)' }}>Total</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>{_fmtBRL(k.cfv_total)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>100,0%</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(k.valor_total)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(k.n_pedidos)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)' }}>
          Clique numa linha para realçar; o PBI original detalha por parcelas (1x, 2x, ...10x) que não existem na slim.
        </div>
      </div>

      {/* === Série mensal === */}
      {serieMensal.length > 0 && (
        <>
          <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
            Evolução Mensal — Venda Bruta × CFV {ESTIM_BADGE}
          </h3>
          <div className="card" style={{ marginBottom: 22, padding: 16 }}>
            <table className="t" style={{ width: '100%', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Mês</th>
                  <th style={{ textAlign: 'right' }}>Venda Bruta</th>
                  <th style={{ textAlign: 'right' }}>Taxa Variável</th>
                  <th style={{ textAlign: 'right' }}>Taxa Fixa</th>
                  <th style={{ textAlign: 'right' }}>Desconto</th>
                  <th style={{ textAlign: 'right' }}>CFV total</th>
                  <th style={{ textAlign: 'right' }}>CFV %</th>
                  <th style={{ textAlign: 'right' }}>Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {serieMensal.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{r.mes}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{_fmtBRL(r.venda_bruta)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtBRL(r.taxa_var)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtBRL(r.taxa_fixa)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtBRL(r.desconto)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--amber)', fontWeight: 600 }}>{_fmtBRL(r.cfv_total)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtPct(r.cfv_pct, 2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(r.n_pedidos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* === Premissas / metodologia === */}
      <div style={{
        background: 'rgba(34, 211, 238, 0.04)',
        border: '1px dashed rgba(34, 211, 238, 0.25)',
        padding: '12px 16px', borderRadius: 8, marginBottom: 22, maxWidth: 980,
        fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6,
      }}>
        <b style={{ color: 'var(--cyan)' }}>Premissas usadas</b>
        <ul style={{ margin: '6px 0 0 0', paddingLeft: 18 }}>
          <li>CFV % aplicado: <b>{_fmtPct(premissas.cfv_pct_aplicado || 0.0616, 2)}</b> × Venda Bruta</li>
          <li>Decomposição: <b>{_fmtPct(premissas.pct_taxa_variavel || 0.6)}</b> variável · <b>{_fmtPct(premissas.pct_taxa_fixa || 0.3)}</b> fixa · <b>{_fmtPct(premissas.pct_desconto || 0.1)}</b> desconto</li>
          <li>Fonte: <code>{premissas.fonte || 'vendas_dash.parquet'}</code></li>
          <li>Gerado em: <code>{D.gerado_em}</code></li>
        </ul>
      </div>
    </div>
  );
};

Object.assign(window, { PageCFV });
