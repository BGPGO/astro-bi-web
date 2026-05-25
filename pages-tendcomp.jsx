/**
 * pages-tendcomp.jsx — Tela 10 do PBI Astro: Tendência de Composição
 *
 * 2 matrizes pivot lado a lado (Marca × Mês e Categoria × Mês) com:
 *  - Linhas: top 20 marcas / categorias do ano filtrado
 *  - Colunas: meses do ano (apenas meses com dados)
 *  - Células: R$ venda + % do mês (heatmap por participação no total do mês)
 *  - Sort por qualquer mês ou pelo total
 *
 * Dados: window.TENDCOMP_DATA (gerado por scripts/build_tendcomp_data.py).
 * Helpers globais reutilizados de pages-astro.jsx: _fmtBRL, _fmtBRLk, _fmtPct, _fmtNum.
 */

const MES_LABEL = [
  '', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

// Color scale para heatmap: pct in [0,1] -> rgba cyan com alpha proporcional
const _heatCellBg = (pct) => {
  if (!pct || !isFinite(pct)) return 'transparent';
  const a = Math.min(0.55, Math.max(0.03, pct * 1.6));
  return `rgba(34, 211, 238, ${a.toFixed(3)})`;
};
const _heatCellColor = (pct) => {
  if (pct >= 0.20) return '#22d3ee';
  if (pct >= 0.08) return '#cbd5e1';
  return '#94a3b8';
};

const _PivotMatrix = ({ titulo, linhas, valorPorLinhaMes, totaisMes, meses, totaisLinha, sortKey, setSortKey, fmtCell }) => {
  // sortKey: 'total' ou número do mês (1..12)
  const linhasOrdenadas = React.useMemo(() => {
    const arr = [...linhas];
    if (sortKey === 'total') {
      arr.sort((a, b) => (totaisLinha[b.key] || 0) - (totaisLinha[a.key] || 0));
    } else {
      const m = Number(sortKey);
      arr.sort((a, b) => {
        const va = (valorPorLinhaMes[a.key] && valorPorLinhaMes[a.key][m]?.valor) || 0;
        const vb = (valorPorLinhaMes[b.key] && valorPorLinhaMes[b.key][m]?.valor) || 0;
        return vb - va;
      });
    }
    return arr;
  }, [linhas, valorPorLinhaMes, totaisLinha, sortKey]);

  const totalGeral = meses.reduce((acc, m) => acc + (totaisMes[m] || 0), 0);

  return (
    <div className="card" style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
      <div className="card-title-row">
        <h2 className="card-title">{titulo}</h2>
        <span style={{ fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          {linhasOrdenadas.length} linhas × {meses.length} meses
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="t" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th
                style={{ textAlign: 'left', position: 'sticky', left: 0, background: 'var(--panel)', zIndex: 2, minWidth: 160, cursor: 'pointer' }}
                onClick={() => setSortKey('total')}
                title="Ordenar pelo total"
              >
                {titulo.includes('Marca') ? 'Marca' : 'Categoria'}
              </th>
              {meses.map((m) => (
                <th
                  key={m}
                  style={{
                    textAlign: 'right', minWidth: 100, cursor: 'pointer',
                    color: sortKey === m ? 'var(--cyan)' : 'var(--text-2)',
                  }}
                  onClick={() => setSortKey(m)}
                  title={`Ordenar por ${MES_LABEL[m]}`}
                >
                  {MES_LABEL[m]}
                </th>
              ))}
              <th
                style={{
                  textAlign: 'right', minWidth: 110, fontWeight: 700, cursor: 'pointer',
                  color: sortKey === 'total' ? 'var(--cyan)' : 'var(--text)',
                }}
                onClick={() => setSortKey('total')}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.map((row, i) => {
              const linhaTot = totaisLinha[row.key] || 0;
              return (
                <tr key={row.key}>
                  <td
                    style={{
                      textAlign: 'left', position: 'sticky', left: 0,
                      background: 'var(--panel)', zIndex: 1,
                      fontWeight: 500, color: 'var(--text)',
                      borderRight: '1px solid var(--border)',
                    }}
                    title={row.key}
                  >
                    <span style={{ color: 'var(--mute)', marginRight: 6, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{i + 1}.</span>
                    {row.key}
                  </td>
                  {meses.map((m) => {
                    const cel = (valorPorLinhaMes[row.key] && valorPorLinhaMes[row.key][m]) || null;
                    const valor = cel?.valor || 0;
                    const pct = cel?.pct_mes || 0;
                    return (
                      <td
                        key={m}
                        style={{
                          textAlign: 'right', fontFamily: 'var(--font-mono)',
                          background: _heatCellBg(pct),
                          color: _heatCellColor(pct),
                          fontWeight: pct >= 0.15 ? 600 : 400,
                          padding: '6px 8px',
                        }}
                        title={`${row.key} · ${MES_LABEL[m]}: ${fmtCell(valor)} (${(pct*100).toFixed(1)}% do mês)`}
                      >
                        {valor > 0 ? (
                          <>
                            <div>{fmtCell(valor)}</div>
                            <div style={{ fontSize: 9.5, color: 'var(--mute)', marginTop: 1 }}>
                              {(pct * 100).toFixed(1)}%
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--mute)' }}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td
                    style={{
                      textAlign: 'right', fontFamily: 'var(--font-mono)',
                      fontWeight: 700, color: 'var(--cyan)',
                      borderLeft: '1px solid var(--border)',
                    }}
                  >
                    {fmtCell(linhaTot)}
                    <div style={{ fontSize: 9.5, color: 'var(--mute)', marginTop: 1 }}>
                      {totalGeral ? ((linhaTot / totalGeral) * 100).toFixed(1) : '0.0'}%
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Linha de totais por mês */}
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderTop: '2px solid var(--border)' }}>
              <td
                style={{
                  textAlign: 'left', position: 'sticky', left: 0,
                  background: 'var(--panel)', zIndex: 1,
                  fontWeight: 700, color: 'var(--text)',
                  borderRight: '1px solid var(--border)',
                }}
              >
                Total mês
              </td>
              {meses.map((m) => (
                <td
                  key={m}
                  style={{
                    textAlign: 'right', fontFamily: 'var(--font-mono)',
                    fontWeight: 700, color: 'var(--text)',
                  }}
                >
                  {fmtCell(totaisMes[m] || 0)}
                </td>
              ))}
              <td
                style={{
                  textAlign: 'right', fontFamily: 'var(--font-mono)',
                  fontWeight: 800, color: 'var(--green)',
                  borderLeft: '1px solid var(--border)',
                }}
              >
                {fmtCell(totalGeral)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)' }}>
        Heatmap por participação % do mês. Clique no cabeçalho para ordenar.
      </div>
    </div>
  );
};

const PageTendenciaComposicao = () => {
  const D = window.TENDCOMP_DATA;
  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          tendcomp-data.js não carregado. Rode: <code>python scripts/build_tendcomp_data.py</code>
        </div>
      </div>
    );
  }

  const anos = D.anos || [];
  const [ano, setAno] = useState(D.ano_default || (anos[anos.length - 1]));
  const [sortMarca, setSortMarca] = useState('total');
  const [sortCat, setSortCat] = useState('total');

  const dadosAno = D.por_ano[String(ano)] || null;

  // Reduz marca_x_mes em mapa { marca: { m: {valor, pct_mes} } } pra lookup O(1)
  const { marcaLookup, marcaTotais, catLookup, catTotais } = React.useMemo(() => {
    const mL = {};
    const mT = {};
    const cL = {};
    const cT = {};
    if (!dadosAno) return { marcaLookup: mL, marcaTotais: mT, catLookup: cL, catTotais: cT };
    for (const r of (dadosAno.marca_x_mes || [])) {
      if (!mL[r.marca]) mL[r.marca] = {};
      mL[r.marca][r.m] = { valor: r.valor, pct_mes: r.pct_mes };
      mT[r.marca] = (mT[r.marca] || 0) + r.valor;
    }
    for (const r of (dadosAno.cat_x_mes || [])) {
      if (!cL[r.categoria]) cL[r.categoria] = {};
      cL[r.categoria][r.m] = { valor: r.valor, pct_mes: r.pct_mes };
      cT[r.categoria] = (cT[r.categoria] || 0) + r.valor;
    }
    return { marcaLookup: mL, marcaTotais: mT, catLookup: cL, catTotais: cT };
  }, [dadosAno]);

  if (!dadosAno) {
    return (
      <div className="page" style={{ padding: '20px 28px' }}>
        <div className="empty">Sem dados para o ano {ano}.</div>
      </div>
    );
  }

  const meses = dadosAno.meses_com_dados || [];
  const linhasMarcas = (dadosAno.top_marcas || []).map((m) => ({ key: m.marca }));
  const linhasCats = (dadosAno.top_cats || []).map((c) => ({ key: c.categoria }));

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      {/* === Breadcrumb === */}
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <span style={{ color: 'var(--mute)' }}>Power BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Tendência de Composição</b>
      </div>

      {/* === Header: título + filtro ano === */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Tendência de Composição</h2>
          <div style={{ color: 'var(--mute)', fontSize: 12.5, marginTop: 4 }}>
            Como cada marca e categoria evolui mês a mês dentro do ano. Top 20 por venda total.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>Ano:</span>
          {anos.map((a) => (
            <button
              key={a}
              className={`btn-chip ${a === ano ? 'active' : ''}`}
              onClick={() => setAno(a)}
              style={{
                padding: '6px 14px',
                background: a === ano ? 'var(--cyan)' : 'transparent',
                color: a === ano ? '#0a1118' : 'var(--text-2)',
                border: '1px solid ' + (a === ano ? 'var(--cyan)' : 'var(--border)'),
                borderRadius: 6,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* === KPIs do ano === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Total {ano}</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(dadosAno.total_ano).replace('R$ ','')}</div>
          <div className="kpi-hint">{meses.length} meses com dados</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Top marca {ano}</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{dadosAno.top_marcas[0]?.marca || '—'}</div>
          <div className="kpi-hint">
            {dadosAno.top_marcas[0] ? _fmtBRLk(dadosAno.top_marcas[0].total) : '—'}
            {' · '}
            {dadosAno.top_marcas[0] && dadosAno.total_ano ? _fmtPct(dadosAno.top_marcas[0].total / dadosAno.total_ano) : ''}
          </div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">Top categoria {ano}</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{dadosAno.top_cats[0]?.categoria || '—'}</div>
          <div className="kpi-hint">
            {dadosAno.top_cats[0] ? _fmtBRLk(dadosAno.top_cats[0].total) : '—'}
            {' · '}
            {dadosAno.top_cats[0] && dadosAno.total_ano ? _fmtPct(dadosAno.top_cats[0].total / dadosAno.total_ano) : ''}
          </div>
        </div>
        <div className="kpi-tile violet">
          <div className="kpi-label">Concentração top 5 marcas</div>
          <div className="kpi-value">
            {(() => {
              const top5 = (dadosAno.top_marcas || []).slice(0, 5).reduce((a, m) => a + m.total, 0);
              return dadosAno.total_ano ? _fmtPct(top5 / dadosAno.total_ano) : '—';
            })()}
          </div>
          <div className="kpi-hint">% do total {ano} nas top 5</div>
        </div>
      </div>

      {/* === 2 matrizes lado a lado (empilha em mobile) === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18, marginBottom: 22 }}>
        <_PivotMatrix
          titulo={`Vendas por Marca × Mês · ${ano}`}
          linhas={linhasMarcas}
          valorPorLinhaMes={marcaLookup}
          totaisMes={dadosAno.totais_mes}
          meses={meses}
          totaisLinha={marcaTotais}
          sortKey={sortMarca}
          setSortKey={setSortMarca}
          fmtCell={_fmtBRLk}
        />
        <_PivotMatrix
          titulo={`Vendas por Categoria × Mês · ${ano}`}
          linhas={linhasCats}
          valorPorLinhaMes={catLookup}
          totaisMes={dadosAno.totais_mes}
          meses={meses}
          totaisLinha={catTotais}
          sortKey={sortCat}
          setSortKey={setSortCat}
          fmtCell={_fmtBRLk}
        />
      </div>

      {/* === Nota === */}
      <div style={{
        background: 'rgba(34, 211, 238, 0.04)',
        border: '1px solid rgba(34, 211, 238, 0.15)',
        borderLeft: '3px solid var(--cyan)',
        padding: '12px 16px', borderRadius: 8, marginBottom: 22, maxWidth: 980,
        fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-2)',
      }}>
        <b style={{ color: 'var(--cyan)' }}>Como ler:</b> a célula mostra o valor de venda da marca/categoria
        naquele mês e, em cinza, o <b>% do mês</b> (participação dentro do mês). A intensidade do fundo cyan
        cresce com a participação — meses onde a marca dominou aparecem mais saturados. A coluna{' '}
        <b>Total</b> à direita mostra o total da marca/categoria no ano + sua participação no total anual.
        Clique nos cabeçalhos para ordenar pelo mês escolhido.
      </div>
    </div>
  );
};

Object.assign(window, { PageTendenciaComposicao });
