/**
 * pages-pedmin.jsx — tela "Pedido Minimo x LTV" portada de astro-giro-bi.
 *
 * Dados: window.PEDMIN_DATA (scripts/build_pedmin_data.py sobre vendas_tiny_bu.parquet).
 *
 * Pergunta orientadora (Filipe, 29/04/2026):
 *   "Instituir pedido minimo de R$ X custaria quanto em receita,
 *    e os clientes excluidos - qual o LTV deles?"
 *
 * Helpers/charts: reaproveitados de pages-astro.jsx (AstroBarV, AstroDonut, _fmtBRL, etc).
 */

const PagePedidoMinimo = () => {
  const D = window.PEDMIN_DATA;
  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          pedmin-data.js nao carregado. Rode: <code>python scripts/build_pedmin_data.py</code>
        </div>
      </div>
    );
  }

  const T = D.totais;
  const H = D.histograma;
  const L = D.ltv_por_faixa_max_pedido;
  const PJ = D.pf_vs_pj;
  const C = D.cenarios_corte;

  // Cor do saldo liquido (custo eliminado - receita perdida). Negativo = destroi valor.
  const saldoColor = (s) => s >= 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Pedido Mínimo</b>
      </div>

      {/* === Hero === */}
      <div className="card" style={{ padding: 20, marginBottom: 18, background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(139,92,246,0.06))' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0, marginBottom: 8 }}>
          Instituir ticket mínimo de R$ X custaria quanto?
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
          Os clientes que ficariam de fora — têm LTV alto (perda real) ou são compradores únicos (perda baixa)?
          Análise sobre <b>{_fmtNum(T.n_pedidos)}</b> pedidos de <b>{_fmtNum(T.n_clientes)}</b> clientes
          ({T.periodo_inicio} → {T.periodo_fim}).
        </p>
      </div>

      {/* === KPIs base === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Pedidos</div>
          <div className="kpi-value">{_fmtNum(T.n_pedidos)}</div>
          <div className="kpi-hint">não cancelados</div>
        </div>
        <div className="kpi-tile violet">
          <div className="kpi-label">Clientes únicos</div>
          <div className="kpi-value">{_fmtNum(T.n_clientes)}</div>
          <div className="kpi-hint">CPF/CNPJ distinto</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Receita</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(T.receita_total).replace('R$ ', '')}</div>
          <div className="kpi-hint">Σ total_pedido</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">Ticket médio · LTV</div>
          <div className="kpi-value">{_fmtBRL(T.ticket_medio)}</div>
          <div className="kpi-hint">LTV {_fmtBRL(T.ltv_medio)}</div>
        </div>
      </div>

      {/* === Histograma por faixa === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>Distribuição dos pedidos por faixa</h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Nº de pedidos por faixa</h2></div>
          <AstroBarV
            values={H.map(h => h.n_pedidos)}
            labels={H.map(h => h.faixa)}
            color="cyan"
            height={240}
            fmt={(v) => _fmtNum(v)}
          />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Receita por faixa</h2></div>
          <AstroBarV
            values={H.map(h => h.receita_total)}
            labels={H.map(h => h.faixa)}
            color="green"
            height={240}
            fmt={_fmtBRLk}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row"><h2 className="card-title">Detalhe por faixa</h2></div>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Faixa</th>
              <th style={{ textAlign: 'right' }}>Nº pedidos</th>
              <th style={{ textAlign: 'right' }}>% pedidos</th>
              <th style={{ textAlign: 'right' }}>Receita</th>
              <th style={{ textAlign: 'right' }}>% receita</th>
              <th style={{ textAlign: 'right' }}>Ticket médio</th>
            </tr>
          </thead>
          <tbody>
            {H.map((h, i) => (
              <tr key={i}>
                <td><b>{h.faixa}</b></td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(h.n_pedidos)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{_fmtPct(h.pct_pedidos)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(h.receita_total)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{_fmtPct(h.pct_receita)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtBRL(h.ticket_medio_faixa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* === Cenarios de corte === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Cenários de corte — receita perdida vs custo operacional eliminado
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row">
          <h2 className="card-title">Trade-off por corte</h2>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>
            premissa: R$ {D.premissas.custo_op_por_pedido}/pedido (separação + emissão NF + atendimento)
          </span>
        </div>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Pedido mínimo</th>
              <th style={{ textAlign: 'right' }}>Pedidos cortados</th>
              <th style={{ textAlign: 'right' }}>% pedidos</th>
              <th style={{ textAlign: 'right' }}>Receita perdida</th>
              <th style={{ textAlign: 'right' }}>% receita</th>
              <th style={{ textAlign: 'right' }}>Custo elim.</th>
              <th style={{ textAlign: 'right' }}>Saldo líquido</th>
              <th style={{ textAlign: 'right' }}>Clientes perdidos</th>
              <th style={{ textAlign: 'right' }}>LTV perdidos</th>
            </tr>
          </thead>
          <tbody>
            {C.map((c, i) => (
              <tr key={i}>
                <td><b>{c.label}</b></td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(c.n_pedidos_cortados)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{_fmtPct(c.pct_pedidos_cortados)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{_fmtBRLk(c.receita_perdida)}</td>
                <td style={{ textAlign: 'right', color: 'var(--red)' }}>{_fmtPct(c.pct_receita_perdida, 2)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{_fmtBRLk(c.custo_operacional_eliminado)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: saldoColor(c.saldo_liquido), fontWeight: 600 }}>{_fmtBRLk(c.saldo_liquido)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{_fmtNum(c.n_clientes_perdidos)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute)' }}>{_fmtBRL(c.ltv_medio_perdidos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
          <b>Saldo líquido</b> = custo eliminado − receita perdida. Verde = corte gera caixa; vermelho = destrói valor.
          Cliente "perdido" = nunca fez pedido acima do corte (LTV médio mostra perda real, não nominal).
        </div>
      </div>

      {/* === LTV por faixa de cliente === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Clientes pequenos — vale a pena perder?
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row">
          <h2 className="card-title">LTV dos clientes cujo maior pedido foi abaixo do corte</h2>
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
                <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{_fmtNum(l.n_pedidos_medio, 1)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(l.receita_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--mute)', lineHeight: 1.5 }}>
          Quanto menor o LTV médio destes clientes, mais "descartável" é o segmento.
          LTV próximo do ticket = compraram 1 vez e sumiram (perda baixa).
          LTV muito acima do ticket = recompram pequeno mas com frequência (perda alta).
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
            Hipótese de Filipe: "se o cara compra pelo CPF que compra menos de R$ 200, não é um cara que vai ter que comprar todo mês".
            Compare o LTV de PF e PJ — se LTV PF mais elevado vier de pedidos pequenos, descartar destrói valor.
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PagePedidoMinimo });
