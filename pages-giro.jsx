/**
 * pages-giro.jsx — tela Giro de Estoque portada do Streamlit
 * (astro-giro-bi/pages/1_Giro_Estoque.py).
 *
 * Dados: window.GIRO_DATA (gerado por scripts/build_giro_data.py em build-time).
 * Politica fixa: slow moving = cobertura >= 6 meses (incluindo nao-movidos).
 *
 * Reusa helpers globais do bundle definidos em pages-astro.jsx:
 *   _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct, AstroBarH (top familias)
 */

const PageGiroEstoque = () => {
  const D = window.GIRO_DATA;
  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          giro-data.js nao carregado. Rode: <code>python scripts/build_giro_data.py</code>
        </div>
      </div>
    );
  }

  const k = D.kpis;
  const meta = D.meta || {};
  const kitD = D.kit_dedup || { qtd_dup_removido: 0, valor_dup_removido: 0 };

  // ===== filtros locais (lista plana de produtos) =====
  const [fMarca, setFMarca] = useState('');
  const [fCat, setFCat] = useState('');
  const [fForn, setFForn] = useState('');
  const [busca, setBusca] = useState('');
  // drilldown: seo_title selecionado pra mostrar variantes
  const [famSel, setFamSel] = useState(null);

  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return D.produtos.filter((p) => {
      if (fMarca && p.marca !== fMarca) return false;
      if (fCat && p.categoria_mae !== fCat) return false;
      if (fForn && p.nome_fornecedor !== fForn) return false;
      if (q) {
        const blob = `${p.nome} ${p.codigo} ${p.id_produto} ${p.seo_title}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [D.produtos, fMarca, fCat, fForn, busca]);

  const totFilt = useMemo(() => {
    let v = 0, c = 0;
    for (const p of produtosFiltrados) { v += p.valor_estoque_custo; c += p.cdi_mes; }
    return { v, c };
  }, [produtosFiltrados]);

  // ===== formatadores helpers locais =====
  const fmtCob = (v) => (v == null || !isFinite(v)) ? 'infinito' : v.toFixed(1).replace('.', ',');
  const fmtDias = (v) => (v == null) ? 'Nunca vendido' : String(Math.round(v));

  // ===== bar horizontal de aging (reusando padrao Astro) =====
  const agingMax = Math.max(...D.aging.map(a => a.valor), 1);

  // ===== drilldown variants do family selecionado =====
  const famVariantes = useMemo(() => {
    if (!famSel) return [];
    return D.produtos
      .filter(p => p.seo_title === famSel)
      .sort((a, b) => b.valor_estoque_custo - a.valor_estoque_custo);
  }, [famSel, D.produtos]);

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Giro de Estoque</b>
        {meta.snapshot_em ? (
          <span style={{ marginLeft: 'auto', color: 'var(--mute)', fontSize: 12 }}>
            Snapshot: {String(meta.snapshot_em).slice(0, 10)}
          </span>
        ) : null}
      </div>

      <p style={{ color: 'var(--text-2)', marginBottom: 20, maxWidth: 920, lineHeight: 1.5 }}>
        Quanto de dinheiro a Astro tem parado em produtos lentos. Metrica: <b>cobertura em meses</b>
        {' = '}estoque atual / venda media mensal dos ultimos 12m.
        <b> Slow moving</b> = cobertura {'>='} <b>{k.corte_meses} meses</b> (politica Filipe, inclui nao-movidos).
      </p>

      {/* === Bloco 1: KPIs === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 14 }}>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Estoque total (custo)</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.valor_estoque_custo).replace('R$ ', '')}</div>
          <div className="kpi-hint">{_fmtNum(k.total_skus_com_estoque)} SKUs com estoque</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">Slow moving (R$ parado)</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.slow_rs).replace('R$ ', '')}</div>
          <div className="kpi-hint">{_fmtPct(k.slow_pct)} do estoque · {_fmtNum(k.slow_qtd)} produtos</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">CDI/mes perdido</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.slow_cdi).replace('R$ ', '')}</div>
          <div className="kpi-hint">se o R$ parado rendesse CDI</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Nao vendidos 12m</div>
          <div className="kpi-value">{_fmtNum(k.nao_mov_qtd)}</div>
          <div className="kpi-hint">{_fmtBRLk(k.nao_mov_rs)} parado · {_fmtBRLk(k.nao_mov_cdi)}/mes CDI</div>
        </div>
      </div>

      {/* === Dedup de kits === */}
      <div className="card" style={{ padding: 14, marginBottom: 20, background: 'var(--surface-2)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
          <b>Cuidados de nao dupla-contar:</b> kits que duplicam SKU simples removidos do calculo —
          <b> {_fmtNum(kitD.qtd_dup_removido)}</b> kits, <b>{_fmtBRL(kitD.valor_dup_removido)}</b> que seriam duplicados.
          Produtos com grade (AD): trabalha-se na granularidade do filho (SKU vendido), sem dupla contagem.
        </div>
      </div>

      {/* === Bloco 2: Aging dos nao vendidos === */}
      <div className="card" style={{ padding: 18, marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Aging — produtos que nao venderam nada nos ultimos 12 meses</div>
        <table className="t">
          <thead>
            <tr>
              <th>Faixa</th>
              <th style={{ textAlign: 'right' }}>Qtd produtos</th>
              <th style={{ textAlign: 'right' }}>R$ parado</th>
              <th style={{ textAlign: 'right' }}>CDI/mes</th>
              <th style={{ width: '30%' }}></th>
            </tr>
          </thead>
          <tbody>
            {D.aging.map((a, i) => (
              <tr key={i}>
                <td>{a.faixa}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(a.qtd)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(a.valor)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(a.cdi)}</td>
                <td>
                  <div style={{ background: 'var(--surface-2)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                    <div style={{
                      width: `${(a.valor / agingMax) * 100}%`,
                      height: '100%',
                      background: 'var(--amber)',
                      borderRadius: 4,
                    }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* === Bloco 3: top familias slow === */}
      <div className="card" style={{ padding: 18, marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>
          Top {Math.min(D.familias.length, 30)} familias (seo_title) com mais R$ parado
        </div>
        <p style={{ fontSize: 12, color: 'var(--mute)', margin: '0 0 12px' }}>
          {_fmtNum(D.familias_total)} familias slow moving no total. Clique numa linha pra ver as variantes.
        </p>
        <table className="t">
          <thead>
            <tr>
              <th>Familia</th>
              <th>Marca</th>
              <th>Categoria</th>
              <th style={{ textAlign: 'right' }}>Variantes</th>
              <th style={{ textAlign: 'right' }}>Estoque</th>
              <th style={{ textAlign: 'right' }}>Vendas/mes</th>
              <th style={{ textAlign: 'right' }}>Cobertura (m)</th>
              <th style={{ textAlign: 'right' }}>Receita 12m</th>
              <th style={{ textAlign: 'right' }}>R$ parado</th>
              <th style={{ textAlign: 'right' }}>CDI/mes</th>
            </tr>
          </thead>
          <tbody>
            {D.familias.map((f, i) => (
              <tr
                key={i}
                onClick={() => setFamSel(famSel === f.seo_title ? null : f.seo_title)}
                style={{
                  cursor: 'pointer',
                  background: famSel === f.seo_title ? 'rgba(34,211,238,0.08)' : undefined,
                }}
              >
                <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.seo_title}>{f.seo_title}</td>
                <td>{f.marca || '—'}</td>
                <td>{f.categoria_mae || '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(f.qtd_produtos)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(f.estoque, 0)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(f.vendas_mes, 1)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCob(f.cobertura_meses)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(f.receita_12m)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(f.valor_parado)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(f.cdi_mes)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* drill-down */}
        {famSel ? (
          <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <b style={{ fontSize: 13 }}>Drill-down · {famSel}</b>
              <span style={{ color: 'var(--mute)', fontSize: 12 }}>({famVariantes.length} variantes slow no top 100)</span>
              <button
                onClick={() => setFamSel(null)}
                style={{
                  marginLeft: 'auto',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', padding: '4px 10px', borderRadius: 4,
                  cursor: 'pointer', fontSize: 11,
                }}
              >
                fechar
              </button>
            </div>
            {famVariantes.length === 0 ? (
              <div style={{ color: 'var(--mute)', fontSize: 12 }}>
                Nenhuma variante dessa familia esta no top 100 da lista flat (mas pode existir no dataset completo).
              </div>
            ) : (
              <table className="t">
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Produto</th>
                    <th style={{ textAlign: 'right' }}>Estoque</th>
                    <th style={{ textAlign: 'right' }}>Vendas/mes</th>
                    <th style={{ textAlign: 'right' }}>Cobertura (m)</th>
                    <th style={{ textAlign: 'right' }}>R$ parado</th>
                    <th style={{ textAlign: 'right' }}>CDI/mes</th>
                  </tr>
                </thead>
                <tbody>
                  {famVariantes.map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.codigo}</td>
                      <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nome}>{p.nome}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(p.estoque_atual, 0)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(p.vendas_mes, 1)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCob(p.cobertura_meses)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(p.valor_estoque_custo)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(p.cdi_mes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>

      {/* === Bloco 4: lista flat de produtos slow === */}
      <div className="card" style={{ padding: 18, marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>
          Lista acionavel — produtos individuais (top {D.produtos.length} por R$ parado)
        </div>
        <p style={{ fontSize: 12, color: 'var(--mute)', margin: '0 0 14px' }}>
          {_fmtNum(produtosFiltrados.length)} produtos · {_fmtBRL(totFilt.v)} parado · {_fmtBRL(totFilt.c)}/mes CDI
        </p>

        {/* filtros */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          <select
            value={fMarca}
            onChange={(e) => setFMarca(e.target.value)}
            style={{ padding: '6px 8px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
          >
            <option value="">Marca (todas)</option>
            {D.filtros.marcas.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={fCat}
            onChange={(e) => setFCat(e.target.value)}
            style={{ padding: '6px 8px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
          >
            <option value="">Categoria (todas)</option>
            {D.filtros.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={fForn}
            onChange={(e) => setFForn(e.target.value)}
            style={{ padding: '6px 8px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
          >
            <option value="">Fornecedor (todos)</option>
            {D.filtros.fornecedores.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar (nome / codigo / ID)"
            style={{ padding: '6px 8px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
          />
        </div>

        <table className="t">
          <thead>
            <tr>
              <th>Codigo</th>
              <th>Produto</th>
              <th>Marca</th>
              <th>Fornecedor</th>
              <th>Categoria</th>
              <th style={{ textAlign: 'right' }}>Estoque</th>
              <th style={{ textAlign: 'right' }}>Vendas/mes</th>
              <th style={{ textAlign: 'right' }}>Cob (m)</th>
              <th style={{ textAlign: 'right' }}>Dias sem venda</th>
              <th style={{ textAlign: 'right' }}>R$ parado</th>
              <th style={{ textAlign: 'right' }}>CDI/mes</th>
            </tr>
          </thead>
          <tbody>
            {produtosFiltrados.map((p, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.codigo}</td>
                <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nome}>{p.nome}</td>
                <td>{p.marca || '—'}</td>
                <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nome_fornecedor}>{p.nome_fornecedor || '—'}</td>
                <td>{p.categoria_mae || '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(p.estoque_atual, 0)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(p.vendas_mes, 1)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCob(p.cobertura_meses)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtDias(p.dias_sem_venda)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(p.valor_estoque_custo)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(p.cdi_mes)}</td>
              </tr>
            ))}
            {produtosFiltrados.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--mute)', padding: 16 }}>Nenhum produto bate os filtros.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Registra no escopo do bundle pra PAGE_COMPS do App raiz pegar via referencia direta.
Object.assign(window, { PageGiroEstoque });
