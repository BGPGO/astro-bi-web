/**
 * pages-analisevendas.jsx — Análise de Vendas (PBI pag 09)
 *
 * Tela "Análise de Vendas" do Power BI da Astro. Layout:
 *  - Filtros: ano-mês (dropdown) + marca (dropdown).
 *  - 3 KPIs: Total de vendas (nº), Ticket médio (R$), Total clientes (nº).
 *  - Barras horizontais "Valor total por Estado cliente_uf" (top 16, com cross-filter
 *    por clique → refiltra linha diária e tabela de categoria).
 *  - Linha diária últimos 90 dias.
 *  - Tabela Categoria com: Vendas, % novos, % recorrentes, Vendas/Dia útil, Total.
 *  - Tabela Top 30 produtos.
 *
 * Dados pre-computados em window.ANALISEVENDAS_DATA (scripts/build_analisevendas_data.py).
 * Helpers globais (de pages-astro.jsx): _fmtBRL/_fmtBRLk/_fmtNum/_fmtPct,
 * AstroBarH, AstroLine.
 *
 * Filtros ano-mês + marca → quando aplicados, re-queryam o DuckDB-WASM
 * (window.__duckdb) que carregou `vendas_dash.parquet` via index.html. Sem
 * filtro, usa o snapshot pre-calculado (mais rápido).
 */

// ===== PageAnaliseVendas =====
const PageAnaliseVendas = () => {
  const D = window.ANALISEVENDAS_DATA;
  if (!D) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          analisevendas-data.js não carregado. Rode:{' '}
          <code>python scripts/build_analisevendas_data.py</code>
        </div>
      </div>
    );
  }

  // ===== Estado: filtros + cross-filter UF =====
  const [filtroAnoMes, setFiltroAnoMes] = React.useState('');
  const [filtroMarca, setFiltroMarca] = React.useState('');
  const [xfUf, setXfUf] = React.useState(null);
  const [liveData, setLiveData] = React.useState(null);       // resultado dos filtros server-side
  const [liveLoading, setLiveLoading] = React.useState(false);
  const [liveError, setLiveError] = React.useState(null);

  // Sem filtros ativos = usa snapshot pre-calculado. Com filtros = re-query DuckDB.
  const filtrosAtivos = !!(filtroAnoMes || filtroMarca || xfUf);

  // ===== Re-query reativa via DuckDB-WASM quando filtros mudam =====
  React.useEffect(() => {
    if (!filtrosAtivos) {
      setLiveData(null);
      setLiveError(null);
      return;
    }
    if (typeof _runQuery !== 'function' || !window.__duckdb) {
      setLiveError('DuckDB não disponível — filtros server-side desabilitados');
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLiveLoading(true);
      setLiveError(null);
      try {
        const whereParts = [`data_pedido IS NOT NULL`];
        if (filtroAnoMes) {
          whereParts.push(`strftime(data_pedido, '%Y-%m') = '${_sqlEsc(filtroAnoMes)}'`);
        }
        if (filtroMarca) {
          whereParts.push(`marca = '${_sqlEsc(filtroMarca)}'`);
        }
        if (xfUf) {
          whereParts.push(`cliente_uf = '${_sqlEsc(xfUf)}'`);
        }
        const WHERE = whereParts.join(' AND ');

        // KPIs gerais
        const kpiRows = await _runQuery(`
          SELECT
            COALESCE(SUM(valor_rateado), 0)::DOUBLE AS valor_bruto,
            COUNT(DISTINCT numero)::BIGINT AS total_vendas,
            COUNT(DISTINCT COALESCE(cliente_cidade,'') || '|' ||
                           COALESCE(cliente_bairro,'') || '|' ||
                           COALESCE(cliente_uf,''))::BIGINT AS total_clientes
          FROM vendas WHERE ${WHERE}
        `);
        const kpi = kpiRows[0] || { valor_bruto: 0, total_vendas: 0, total_clientes: 0 };
        const ticket = kpi.total_vendas ? kpi.valor_bruto / kpi.total_vendas : 0;

        // Top UF (não filtra por xfUf — UF é o agregado da tela)
        const whereSemUf = whereParts.filter((w) => !w.includes('cliente_uf =')).join(' AND ');
        const ufRows = await _runQuery(`
          SELECT cliente_uf AS uf,
                 SUM(valor_rateado)::DOUBLE AS v,
                 COUNT(DISTINCT numero)::BIGINT AS n
          FROM vendas
          WHERE ${whereSemUf} AND cliente_uf IS NOT NULL AND cliente_uf <> ''
          GROUP BY uf ORDER BY v DESC LIMIT 16
        `);
        const totalUf = ufRows.reduce((s, r) => s + (r.v || 0), 0);
        const topUf = ufRows.map((r) => ({
          uf: r.uf,
          v: Number(r.v) || 0,
          n: Number(r.n) || 0,
          pct: totalUf ? Number(r.v) / totalUf : 0,
        }));

        // Série diária (90 últimos dias do snapshot da base ou do mês selecionado)
        const serieRows = await _runQuery(`
          SELECT CAST(data_pedido AS DATE) AS d,
                 SUM(valor_rateado)::DOUBLE AS v
          FROM vendas
          WHERE ${WHERE}
          GROUP BY d
          ORDER BY d DESC
          LIMIT 120
        `);
        const serieDiaria = serieRows
          .map((r) => ({ d: String(r.d), v: Number(r.v) || 0 }))
          .reverse();

        // Tabela categoria
        const diasUteisRows = await _runQuery(`
          SELECT COUNT(DISTINCT CAST(data_pedido AS DATE))::BIGINT AS d
          FROM vendas
          WHERE ${WHERE} AND dayofweek(data_pedido) BETWEEN 1 AND 5
        `);
        const dUteis = Math.max(1, Number(diasUteisRows[0]?.d || 1));

        const catRows = await _runQuery(`
          SELECT categoria_mae AS categoria,
                 COUNT(DISTINCT numero)::BIGINT AS n_vendas,
                 SUM(valor_rateado)::DOUBLE AS valor_total,
                 SUM(preco_custo * quantidade)::DOUBLE AS cmv,
                 SUM(CASE WHEN dayofweek(data_pedido) BETWEEN 1 AND 5
                          THEN valor_rateado ELSE 0 END)::DOUBLE AS valor_util,
                 COUNT(DISTINCT CASE WHEN Recompra = 'Novo' THEN numero END)::BIGINT AS n_novos,
                 COUNT(DISTINCT CASE WHEN Recompra = 'Recompra' THEN numero END)::BIGINT AS n_rec
          FROM vendas
          WHERE ${WHERE} AND categoria_mae IS NOT NULL AND categoria_mae <> ''
          GROUP BY categoria
          ORDER BY valor_total DESC
        `);
        const tabelaCategoria = catRows.map((r) => {
          const nv = Number(r.n_vendas) || 0;
          const val = Number(r.valor_total) || 0;
          const cmvC = Number(r.cmv) || 0;
          const nN = Number(r.n_novos) || 0;
          const nR = Number(r.n_rec) || 0;
          const cls = nN + nR;
          return {
            categoria: r.categoria,
            n_vendas: nv,
            pct_novos: cls ? nN / cls : 0,
            pct_recorrentes: cls ? nR / cls : 0,
            vendas_dia_util: (Number(r.valor_util) || 0) / dUteis,
            valor_total: val,
            margem_pct: val ? (val - cmvC) / val : 0,
            ticket_medio: nv ? val / nv : 0,
          };
        });

        // Top 30 produtos
        const prodRows = await _runQuery(`
          WITH p AS (
            SELECT
              COALESCE(NULLIF(seo_title, ''), 'sem nome') AS produto,
              MAX(marca) AS marca,
              MAX(categoria_mae) AS categoria,
              SUM(valor_rateado)::DOUBLE AS valor,
              SUM(preco_custo * quantidade)::DOUBLE AS cmv,
              COUNT(DISTINCT numero)::BIGINT AS n_pedidos
            FROM vendas
            WHERE ${WHERE} AND seo_title IS NOT NULL AND seo_title <> ''
            GROUP BY produto
          )
          SELECT * FROM p ORDER BY valor DESC LIMIT 30
        `);
        const top30 = prodRows.map((r) => {
          const val = Number(r.valor) || 0;
          const cmvP = Number(r.cmv) || 0;
          const nP = Number(r.n_pedidos) || 0;
          return {
            produto: r.produto,
            marca: r.marca || '—',
            categoria: r.categoria || '—',
            valor: val,
            n_pedidos: nP,
            ticket: nP ? val / nP : 0,
            margem_pct: val ? (val - cmvP) / val : 0,
          };
        });

        if (cancelled) return;
        setLiveData({
          kpis_geral: {
            valor_bruto: Number(kpi.valor_bruto) || 0,
            total_vendas: Number(kpi.total_vendas) || 0,
            total_clientes: Number(kpi.total_clientes) || 0,
            ticket_medio: ticket,
          },
          top_uf: topUf,
          serie_diaria_90d: serieDiaria,
          tabela_categoria: tabelaCategoria,
          top_30_produtos: top30,
        });
      } catch (e) {
        if (!cancelled) setLiveError(String(e));
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    };
    if (window.__duckdbReady) {
      run();
    } else {
      const onReady = () => run();
      document.addEventListener('duckdb-ready', onReady, { once: true });
      return () => { cancelled = true; document.removeEventListener('duckdb-ready', onReady); };
    }
    return () => { cancelled = true; };
  }, [filtroAnoMes, filtroMarca, xfUf]);

  // ===== Dataset ativo: live (filtros) ou snapshot =====
  const view = liveData || D;
  const k = view.kpis_geral;

  // ===== UI =====
  return (
    <div className="page" style={{ padding: '20px 28px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Análise de Vendas</b>
      </div>

      {/* Filtros sticky */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg)', padding: '10px 0', marginBottom: 14,
        borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 1 }}>Filtros:</span>
        <select value={filtroAnoMes} onChange={(e) => setFiltroAnoMes(e.target.value)}
                className="filter-select" style={{ minWidth: 130, fontSize: 12 }}>
          <option value="">Todos meses</option>
          {(D.filtros?.ano_mes || []).map((am) => <option key={am} value={am}>{am}</option>)}
        </select>
        <select value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)}
                className="filter-select" style={{ minWidth: 160, fontSize: 12 }}>
          <option value="">Todas marcas</option>
          {(D.filtros?.marcas || []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {(filtroAnoMes || filtroMarca || xfUf) && (
          <button className="btn-ghost" onClick={() => {
            setFiltroAnoMes(''); setFiltroMarca(''); setXfUf(null);
          }}>Limpar</button>
        )}
        <div style={{ flex: 1 }} />
        {liveLoading && <span style={{ fontSize: 11, color: 'var(--cyan)' }}>recomputando...</span>}
        {liveError && <span style={{ fontSize: 11, color: 'var(--red)' }} title={liveError}>erro DuckDB</span>}
        {xfUf && <span style={{ fontSize: 11, color: 'var(--cyan)' }}>UF · {xfUf}</span>}
        {filtroAnoMes && <span style={{ fontSize: 11, color: 'var(--cyan)' }}>mês · {filtroAnoMes}</span>}
        {filtroMarca && <span style={{ fontSize: 11, color: 'var(--cyan)' }}>marca · {filtroMarca}</span>}
      </div>

      {/* 3 KPIs */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Total de Vendas</div>
          <div className="kpi-value">{_fmtNum(k.total_vendas)}</div>
          <div className="kpi-hint">pedidos únicos · {_fmtBRLk(k.valor_bruto)} bruto</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Ticket Médio</div>
          <div className="kpi-value">
            <span className="currency">R$</span>{_fmtBRLk(k.ticket_medio).replace('R$ ', '')}
          </div>
          <div className="kpi-hint">por pedido</div>
        </div>
        <div className="kpi-tile violet">
          <div className="kpi-label">Total Clientes</div>
          <div className="kpi-value">{_fmtNum(k.total_clientes)}</div>
          <div className="kpi-hint">únicos (cidade+bairro+UF)</div>
        </div>
      </div>

      {/* Top 15 UF + Linha diária */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Valor total por Estado</h2>
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>top 16 · clique pra filtrar</span>
          </div>
          <AstroBarH
            items={(view.top_uf || []).map((x) => ({ label: x.uf, v: x.v }))}
            color="cyan"
            fmt={_fmtBRLk}
            onClick={(label) => setXfUf(xfUf === label ? null : label)}
            activeLabel={xfUf}
          />
          {(view.top_uf || []).length > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--mute)', display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
              <span>top: {view.top_uf[0].uf} · {_fmtPct(view.top_uf[0].pct)}</span>
              <span>total UF: {_fmtBRLk((view.top_uf || []).reduce((s, x) => s + x.v, 0))}</span>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Evolução das vendas diárias</h2>
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>últimos 90 dias</span>
          </div>
          <AstroLine
            values={(view.serie_diaria_90d || []).map((x) => x.v)}
            labels={(view.serie_diaria_90d || []).map((x) => x.d)}
            color="var(--cyan)"
            height={240}
          />
          {(view.serie_diaria_90d || []).length > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--mute)', display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
              <span>{(view.serie_diaria_90d[0] || {}).d} → {(view.serie_diaria_90d[view.serie_diaria_90d.length - 1] || {}).d}</span>
              <span>
                média dia: {_fmtBRLk(
                  view.serie_diaria_90d.reduce((s, x) => s + x.v, 0) / Math.max(1, view.serie_diaria_90d.length)
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabela Categoria */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row">
          <h2 className="card-title">Vendas por Categoria</h2>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>{(view.tabela_categoria || []).length} categorias</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-2)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Categoria</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Vendas</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>% Novos</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>% Recorrentes</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Vendas/Dia útil</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Total Venda</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Margem %</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {(view.tabela_categoria || []).map((r, i) => (
                <tr key={r.categoria || i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 10px', color: 'var(--text)' }}>{r.categoria}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(r.n_vendas)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--cyan-2)' }}>{_fmtPct(r.pct_novos)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{_fmtPct(r.pct_recorrentes)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(r.vendas_dia_util)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{_fmtBRLk(r.valor_total)}</td>
                  <td style={{
                    padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                    color: r.margem_pct >= 0.3 ? 'var(--green)' : (r.margem_pct >= 0.15 ? 'var(--amber)' : 'var(--red)'),
                  }}>{_fmtPct(r.margem_pct)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute-2)' }}>{_fmtBRLk(r.ticket_medio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabela Top 30 produtos */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row">
          <h2 className="card-title">Top 30 Produtos · Valor</h2>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>ranking por venda bruta</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-2)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600, width: 30 }}>#</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Produto</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Marca</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Categoria</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Pedidos</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Valor</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Ticket</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--mute)', fontWeight: 600 }}>Margem %</th>
              </tr>
            </thead>
            <tbody>
              {(view.top_30_produtos || []).map((r, i) => (
                <tr key={r.produto || i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.produto}>{r.produto}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-2)' }}>{r.marca}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--mute-2)' }}>{r.categoria}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(r.n_pedidos)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--cyan-2)' }}>{_fmtBRLk(r.valor)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--mute-2)' }}>{_fmtBRLk(r.ticket)}</td>
                  <td style={{
                    padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                    color: r.margem_pct >= 0.3 ? 'var(--green)' : (r.margem_pct >= 0.15 ? 'var(--amber)' : 'var(--red)'),
                  }}>{_fmtPct(r.margem_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, padding: '16px 0', borderTop: '1px solid var(--border)',
                     textAlign: 'center', fontSize: 11, color: 'var(--mute)' }}>
        Astro · Análise de Vendas (PBI pag 09) · snapshot pré-calculado · filtros via DuckDB-WASM ·{' '}
        {filtrosAtivos ? 'filtros ativos · re-query reativo' : 'visão completa'}
      </div>
    </div>
  );
};

Object.assign(window, { PageAnaliseVendas });
