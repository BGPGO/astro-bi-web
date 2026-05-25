/**
 * pages-giro.jsx V2 — Giro de Estoque com slider reativo + storytelling completo.
 *
 * Replica todos os blocos do Streamlit (astro-giro-bi/pages/1_Giro_Estoque.py):
 *   Bloco 0  Storytelling + politica (slider corte + checkbox nao-movidos)
 *   Bloco 1  KPIs (Estoque, Slow R$+%, CDI/mes)
 *   Bloco 1b Expander cuidados de dupla-contagem (kits + grade AD)
 *   Bloco 2  Aging dos nao-vendidos 12m + detalhamento por produto (com filtros)
 *   Bloco 3  Familias (seo_title) com mais R$ parado + filtros + drill-down
 *   Bloco 4  Lista flat de produtos slow moving + filtros
 *
 * Dados: window.GIRO_DATA (build_giro_data.py V2).
 * Reusa helpers globais: _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct.
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

  // ===== state reativo =====
  const [corte, setCorte] = useState(6);
  const [incluirNaoMovido, setIncluirNaoMovido] = useState(true);
  const [expanderAberto, setExpanderAberto] = useState(false);

  // filtros Bloco 2 (detalhe nao-vendidos)
  const [nvFaixa, setNvFaixa] = useState('');
  const [nvMarca, setNvMarca] = useState('');
  const [nvCat, setNvCat] = useState('');
  const [nvBusca, setNvBusca] = useState('');

  // filtros Bloco 3 (familias)
  const [famCat, setFamCat] = useState('');
  const [famMarca, setFamMarca] = useState('');
  const [famBusca, setFamBusca] = useState('');
  const [famSel, setFamSel] = useState(null);

  // filtros Bloco 4 (lista flat)
  const [flatMarca, setFlatMarca] = useState('');
  const [flatCat, setFlatCat] = useState('');
  const [flatForn, setFlatForn] = useState('');
  const [flatBusca, setFlatBusca] = useState('');

  const meta = D.metadata || {};
  const cortesDisp = meta.cortes_disponiveis || [3, 6, 9, 12, 18, 24];

  // Cubo KPI ativo: usa corte mais proximo dos pre-computados se nao for exato
  const cubo = useMemo(() => {
    const sub = D.kpis_por_corte[String(corte)];
    if (sub) return incluirNaoMovido ? sub.com_nao_movido : sub.sem_nao_movido;
    // fallback: pega corte mais proximo
    let melhor = cortesDisp[0];
    let dist = Math.abs(corte - melhor);
    for (const c of cortesDisp) {
      const d = Math.abs(corte - c);
      if (d < dist) { dist = d; melhor = c; }
    }
    const s = D.kpis_por_corte[String(melhor)];
    return incluirNaoMovido ? s.com_nao_movido : s.sem_nao_movido;
  }, [corte, incluirNaoMovido]);

  // Familias do corte: usa cubo familias_por_corte (so cortes [6,12,18,24])
  const famCorte = useMemo(() => {
    const disp = meta.familias_cortes_disponiveis || [6, 12, 18, 24];
    let melhor = disp[0];
    let dist = Math.abs(corte - melhor);
    for (const c of disp) {
      const d = Math.abs(corte - c);
      if (d < dist) { dist = d; melhor = c; }
    }
    return { corte: melhor, familias: D.familias_por_corte[String(melhor)] || [] };
  }, [corte]);

  const famTotal = (meta.familias_total_por_corte || {})[String(famCorte.corte)] || famCorte.familias.length;

  // ===== Bloco 2: nao vendidos filtrados =====
  const nvFaixasDisp = useMemo(() => {
    const s = new Set(D.nao_vendidos_detalhe.map((x) => x.faixa));
    return ['Sem venda <3 meses', 'Sem venda 3-6 meses', 'Sem venda 6-12 meses',
            'Sem venda 12-24 meses', 'Sem venda >24 meses', 'Nunca vendido'].filter((f) => s.has(f));
  }, []);
  const nvMarcasDisp = useMemo(() => {
    return [...new Set(D.nao_vendidos_detalhe.map((x) => x.marca).filter(Boolean))].sort();
  }, []);
  const nvCatsDisp = useMemo(() => {
    return [...new Set(D.nao_vendidos_detalhe.map((x) => x.categoria_mae).filter(Boolean))].sort();
  }, []);

  const nvFiltrado = useMemo(() => {
    const q = nvBusca.trim().toLowerCase();
    return D.nao_vendidos_detalhe.filter((p) => {
      if (nvFaixa && p.faixa !== nvFaixa) return false;
      if (nvMarca && p.marca !== nvMarca) return false;
      if (nvCat && p.categoria_mae !== nvCat) return false;
      if (q) {
        const blob = `${p.nome || ''} ${p.seo_title || ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [nvFaixa, nvMarca, nvCat, nvBusca]);

  const nvTot = useMemo(() => {
    let v = 0, c = 0;
    for (const p of nvFiltrado) { v += p.valor_estoque_custo; c += p.cdi_mes; }
    return { v, c };
  }, [nvFiltrado]);

  // ===== Bloco 3: familias filtradas =====
  const famCats = useMemo(() => {
    return [...new Set(famCorte.familias.map((f) => f.categoria_mae).filter(Boolean))].sort();
  }, [famCorte.familias]);
  const famMarcas = useMemo(() => {
    return [...new Set(famCorte.familias.map((f) => f.marca).filter(Boolean))].sort();
  }, [famCorte.familias]);

  const famFiltradas = useMemo(() => {
    const q = famBusca.trim().toLowerCase();
    return famCorte.familias.filter((f) => {
      if (famCat && f.categoria_mae !== famCat) return false;
      if (famMarca && f.marca !== famMarca) return false;
      if (q && !(f.seo_title || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [famCorte.familias, famCat, famMarca, famBusca]);

  const famTotFiltrado = useMemo(() => {
    let v = 0, c = 0;
    for (const f of famFiltradas) { v += f.valor_parado; c += f.cdi_mes; }
    return { v, c };
  }, [famFiltradas]);

  const famVariantes = useMemo(() => {
    if (!famSel) return [];
    return D.produtos_flat
      .filter((p) => p.seo_title === famSel)
      .sort((a, b) => b.valor_estoque_custo - a.valor_estoque_custo);
  }, [famSel]);

  // ===== Bloco 4: lista flat filtrada =====
  const flatFiltrado = useMemo(() => {
    const q = flatBusca.trim().toLowerCase();
    return D.produtos_flat.filter((p) => {
      if (flatMarca && p.marca !== flatMarca) return false;
      if (flatCat && p.categoria_mae !== flatCat) return false;
      if (flatForn && p.nome_fornecedor !== flatForn) return false;
      if (q) {
        const blob = `${p.nome || ''} ${p.codigo || ''} ${p.id_produto || ''} ${p.seo_title || ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [flatMarca, flatCat, flatForn, flatBusca]);

  const flatTot = useMemo(() => {
    let v = 0, c = 0;
    for (const p of flatFiltrado) { v += p.valor_estoque_custo; c += p.cdi_mes; }
    return { v, c };
  }, [flatFiltrado]);

  // ===== formatadores =====
  const fmtCob = (v) => (v == null || !isFinite(v)) ? 'infinito' : v.toFixed(1).replace('.', ',');
  const fmtDias = (v) => (v == null) ? 'Nunca vendido' : String(Math.round(v));

  // Aging max para barras horizontais
  const agingMax = Math.max(...(D.aging_completo || []).map((a) => a.valor), 1);

  // Estilos reusados
  const selectStyle = {
    padding: '6px 8px', background: 'var(--surface-2)', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: 4, fontSize: 12,
  };
  const inputStyle = selectStyle;

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      {/* Breadcrumb */}
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Giro de Estoque</b>
        {meta.data_snapshot ? (
          <span style={{ marginLeft: 'auto', color: 'var(--mute)', fontSize: 12 }}>
            Snapshot: {String(meta.data_snapshot).slice(0, 10)}
          </span>
        ) : null}
      </div>

      {/* === Bloco 0a: Storytelling === */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <p style={{ color: 'var(--text-2)', lineHeight: 1.65, margin: 0, maxWidth: 980 }}>
          <b style={{ color: 'var(--text)' }}>Objetivo.</b> Quantificar o dinheiro parado em
          produtos com baixa velocidade de venda relativa ao estoque, com lista acionavel
          para queima (promocao, e-mail marketing, ajuste de compra).
        </p>
        <p style={{ color: 'var(--text-2)', lineHeight: 1.65, margin: '10px 0 0', maxWidth: 980 }}>
          <b style={{ color: 'var(--text)' }}>Filipe (13/05/2026):</b> "a metrica certa e
          vendas/mes vs estoque (<b>cobertura</b>), nao dias sem venda. Produto pode vender
          1/dia mas ainda ser slow moving se o estoque cobrir 12 meses."
        </p>
        <p style={{ color: 'var(--text-2)', lineHeight: 1.65, margin: '10px 0 0', maxWidth: 980 }}>
          <b style={{ color: 'var(--text)' }}>Definicao operacional.</b>{' '}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>vendas/mes = qtd_12m / 12</span>{' · '}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>cobertura = estoque_atual / vendas_mes</span>{' · '}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>slow moving = cobertura {'>='} corte</span>{' · '}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>nao-movido = qtd_12m == 0</span>.
        </p>
      </div>

      {/* === Bloco 0b: Politica (slider + checkbox) === */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>0. Como voce classifica slow moving</div>
        <p style={{ color: 'var(--mute)', fontSize: 12, lineHeight: 1.5, margin: '0 0 14px' }}>
          A metrica e <b>cobertura em meses</b> = estoque atual / venda media mensal dos
          ultimos 12 meses. Produtos com cobertura acima do corte sao slow moving.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 8 }}>
              Cobertura minima para considerar slow moving (meses):
              <b style={{ color: 'var(--cyan)', marginLeft: 8, fontSize: 16, fontFamily: 'var(--font-mono)' }}>{corte}</b>
            </label>
            <input
              type="range" min="1" max="24" step="1"
              value={corte}
              onChange={(e) => setCorte(parseInt(e.target.value, 10))}
              style={{ width: '100%', maxWidth: 360, accentColor: 'var(--cyan)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 360, fontSize: 10, color: 'var(--mute)', marginTop: 4 }}>
              <span>1m</span><span>6m</span><span>12m</span><span>18m</span><span>24m</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--mute)', margin: '8px 0 0', maxWidth: 360 }}>
              Cortes pre-computados: {cortesDisp.join(', ')}m. Outros valores usam o corte mais proximo.
            </p>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={incluirNaoMovido}
                onChange={(e) => setIncluirNaoMovido(e.target.checked)}
                style={{ accentColor: 'var(--cyan)' }}
              />
              Incluir produtos que nao venderam em 12 meses (qtd_12m = 0)
            </label>
            <p style={{ fontSize: 11, color: 'var(--mute)', margin: '6px 0 0' }}>
              Esses tem cobertura infinita (denominador zero). Trate-os no aging do bloco 2.
            </p>
          </div>
        </div>
      </div>

      {/* === Bloco 1: KPIs (reativos) === */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>1. Quanto dinheiro esta parado</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div className="kpi-tile cyan">
            <div className="kpi-label">Estoque total (a custo)</div>
            <div className="kpi-value">
              <span className="currency">R$</span>{_fmtBRLk(cubo.estoque_total_rs).replace('R$ ', '')}
            </div>
            <div className="kpi-hint">{_fmtNum(meta.n_skus_com_estoque)} SKUs com estoque</div>
          </div>
          <div className="kpi-tile amber">
            <div className="kpi-label">Slow moving (R$ parado)</div>
            <div className="kpi-value">
              <span className="currency">R$</span>{_fmtBRLk(cubo.slow_rs).replace('R$ ', '')}
            </div>
            <div className="kpi-hint">
              {_fmtPct(cubo.slow_pct)} do estoque · {_fmtNum(cubo.n_slow)} produtos
            </div>
          </div>
          <div className="kpi-tile red">
            <div className="kpi-label">CDI/mes perdido</div>
            <div className="kpi-value">
              <span className="currency">R$</span>{_fmtBRLk(cubo.slow_cdi).replace('R$ ', '')}
            </div>
            <div className="kpi-hint">
              se o R$ parado rendesse CDI ({meta.cdi_anual_pct ? `${(meta.cdi_anual_pct*100).toFixed(2).replace('.', ',')}%` : '—'}/ano)
            </div>
          </div>
        </div>
        <p style={{ color: 'var(--mute)', fontSize: 12, margin: '12px 0 0' }}>
          Regra ativa: cobertura {'>='} <b style={{ color: 'var(--text-2)' }}>{corte} meses</b>
          {incluirNaoMovido ? ' (incluindo nao-movidos)' : ' (excluindo nao-movidos)'}.{' '}
          <b style={{ color: 'var(--text-2)' }}>{_fmtNum(cubo.n_slow)}</b> produtos somam{' '}
          <b style={{ color: 'var(--text-2)' }}>{_fmtBRL(cubo.slow_rs)}</b> a custo, que renderiam{' '}
          <b style={{ color: 'var(--text-2)' }}>{_fmtBRL(cubo.slow_cdi)}</b> de CDI por mes.
        </p>
      </div>

      {/* === Bloco 1b: Expander cuidados de dupla-contagem === */}
      <div className="card" style={{ padding: 0, marginBottom: 16, background: 'var(--surface-2)' }}>
        <button
          onClick={() => setExpanderAberto(!expanderAberto)}
          style={{
            width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
            color: 'var(--text-2)', padding: '14px 18px', cursor: 'pointer',
            fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ color: 'var(--mute)' }}>{expanderAberto ? '▼' : '▶'}</span>
          <b>Cuidados aplicados para nao dupla-contar</b>
        </button>
        {expanderAberto ? (
          <div style={{ padding: '0 18px 18px', color: 'var(--text-2)', fontSize: 12, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 10px' }}>
              <b style={{ color: 'var(--text)' }}>Kits que duplicam produto simples.</b>{' '}
              Quando o fornecedor entrega em caixa fechada e a Astro vende a unidade avulsa, o
              ERP guarda os dois. O algoritmo de pareamento (<span style={{ fontFamily: 'var(--font-mono)' }}>dedup_kits.py</span>)
              identificou e zerou os duplicados:
            </p>
            <ul style={{ margin: '0 0 12px 22px', padding: 0 }}>
              <li>Kits removidos: <b style={{ color: 'var(--text)' }}>{_fmtNum(D.kits_dedup.qtd_removido)}</b></li>
              <li>Valor que seria duplicado: <b style={{ color: 'var(--text)' }}>{_fmtBRL(D.kits_dedup.valor_removido)}</b></li>
            </ul>
            <p style={{ margin: 0 }}>
              <b style={{ color: 'var(--text)' }}>Produtos com grade (AD).</b>{' '}
              Snapshot atual nao traz <span style={{ fontFamily: 'var(--font-mono)' }}>id_produto_pai</span> confiavel
              do Tiny. Trabalha-se na granularidade do filho (SKU vendido). Sem dupla contagem
              porque o pai-grade nao tem saldo proprio — o saldo fica nos filhos. A hierarquia
              do bloco 3 agrega filhos por <span style={{ fontFamily: 'var(--font-mono)' }}>seo_title</span> (familia).
            </p>
          </div>
        ) : null}
      </div>

      {/* === Bloco 2: Aging dos nao vendidos 12m === */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>
          2. Produtos que nao venderam nada nos ultimos 12 meses
        </div>
        <p style={{ color: 'var(--mute)', fontSize: 12, margin: '0 0 14px' }}>
          Aging por faixa de tempo sem venda. Produtos com{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>qtd_12m = 0</span> e estoque {'>'} 0.
        </p>

        {/* KPIs do bloco 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 18 }}>
          {(() => {
            const tot = D.aging_completo.reduce((a, x) => ({
              qtd: a.qtd + x.qtd,
              valor: a.valor + x.valor,
              cdi: a.cdi + x.cdi,
            }), { qtd: 0, valor: 0, cdi: 0 });
            return (
              <>
                <div className="kpi-tile amber">
                  <div className="kpi-label">Produtos nao movidos</div>
                  <div className="kpi-value">{_fmtNum(tot.qtd)}</div>
                  <div className="kpi-hint">12m sem nenhuma venda</div>
                </div>
                <div className="kpi-tile red">
                  <div className="kpi-label">R$ parado</div>
                  <div className="kpi-value">
                    <span className="currency">R$</span>{_fmtBRLk(tot.valor).replace('R$ ', '')}
                  </div>
                  <div className="kpi-hint">a custo</div>
                </div>
                <div className="kpi-tile red">
                  <div className="kpi-label">CDI/mes perdido</div>
                  <div className="kpi-value">
                    <span className="currency">R$</span>{_fmtBRLk(tot.cdi).replace('R$ ', '')}
                  </div>
                  <div className="kpi-hint">se aplicado a CDI</div>
                </div>
              </>
            );
          })()}
        </div>

        {/* Aging table */}
        <table className="t" style={{ marginBottom: 18 }}>
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
            {D.aging_completo.map((a, i) => (
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

        {/* Detalhamento por produto */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Detalhamento por produto
          </div>
          <p style={{ color: 'var(--mute)', fontSize: 12, margin: '0 0 12px' }}>
            Lista completa dos produtos sem venda em 12 meses, ordenada por R$ parado.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
            <select value={nvFaixa} onChange={(e) => setNvFaixa(e.target.value)} style={selectStyle}>
              <option value="">Faixa (todas)</option>
              {nvFaixasDisp.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={nvMarca} onChange={(e) => setNvMarca(e.target.value)} style={selectStyle}>
              <option value="">Marca (todas)</option>
              {nvMarcasDisp.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={nvCat} onChange={(e) => setNvCat(e.target.value)} style={selectStyle}>
              <option value="">Categoria (todas)</option>
              {nvCatsDisp.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={nvBusca}
              onChange={(e) => setNvBusca(e.target.value)}
              placeholder="Buscar (nome ou seo_title)"
              style={inputStyle}
            />
          </div>
          <p style={{ color: 'var(--mute)', fontSize: 12, margin: '0 0 10px' }}>
            {_fmtNum(nvFiltrado.length)} produtos · {_fmtBRL(nvTot.v)} parado · {_fmtBRL(nvTot.c)}/mes CDI
          </p>
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table className="t">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Produto</th>
                  <th>Marca</th>
                  <th>Categoria</th>
                  <th style={{ textAlign: 'right' }}>Estoque</th>
                  <th style={{ textAlign: 'right' }}>R$ parado</th>
                  <th style={{ textAlign: 'right' }}>CDI/mes</th>
                  <th style={{ textAlign: 'right' }}>Dias sem venda</th>
                  <th>Faixa</th>
                </tr>
              </thead>
              <tbody>
                {nvFiltrado.slice(0, 200).map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.id_produto}</td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nome}>{p.nome}</td>
                    <td>{p.marca || '—'}</td>
                    <td>{p.categoria_mae || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(p.estoque_atual, 0)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(p.valor_estoque_custo)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(p.cdi_mes)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtDias(p.dias_sem_venda)}</td>
                    <td style={{ fontSize: 11 }}>{p.faixa}</td>
                  </tr>
                ))}
                {nvFiltrado.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--mute)', padding: 16 }}>Nenhum produto bate os filtros.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {nvFiltrado.length > 200 ? (
            <p style={{ color: 'var(--mute)', fontSize: 11, margin: '8px 0 0', textAlign: 'right' }}>
              Mostrando 200 de {_fmtNum(nvFiltrado.length)} (refine os filtros pra ver os demais).
            </p>
          ) : null}
        </div>
      </div>

      {/* === Bloco 3: Familias com mais R$ parado === */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>
          3. Familias (seo_title) com mais dinheiro parado
        </div>
        <p style={{ color: 'var(--mute)', fontSize: 12, margin: '0 0 14px', maxWidth: 920, lineHeight: 1.5 }}>
          Cada <span style={{ fontFamily: 'var(--font-mono)' }}>seo_title</span> agrega as variantes
          (tamanhos, cores) do mesmo produto. O ranking por familia mostra onde a Astro mais perde
          com baixo giro. Cubo carregado: corte <b style={{ color: 'var(--text-2)' }}>{famCorte.corte}m</b>{' '}
          (top {famCorte.familias.length} de {_fmtNum(famTotal)} familias slow). Clique numa familia
          pra abrir as variantes.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
          <select value={famCat} onChange={(e) => setFamCat(e.target.value)} style={selectStyle}>
            <option value="">Categoria (todas)</option>
            {famCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={famMarca} onChange={(e) => setFamMarca(e.target.value)} style={selectStyle}>
            <option value="">Marca (todas)</option>
            {famMarcas.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            value={famBusca}
            onChange={(e) => setFamBusca(e.target.value)}
            placeholder="Buscar familia (seo_title)"
            style={inputStyle}
          />
        </div>

        <p style={{ color: 'var(--mute)', fontSize: 12, margin: '0 0 10px' }}>
          {_fmtNum(famFiltradas.length)} familias · {_fmtBRL(famTotFiltrado.v)} parado · {_fmtBRL(famTotFiltrado.c)}/mes CDI
        </p>

        <div style={{ maxHeight: 480, overflow: 'auto' }}>
          <table className="t">
            <thead>
              <tr>
                <th>Familia</th>
                <th>Marca</th>
                <th>Categoria</th>
                <th style={{ textAlign: 'right' }}>Variantes</th>
                <th style={{ textAlign: 'right' }}>Estoque</th>
                <th style={{ textAlign: 'right' }}>Vendas/mes</th>
                <th style={{ textAlign: 'right' }}>Cob (m)</th>
                <th style={{ textAlign: 'right' }}>Receita 12m</th>
                <th style={{ textAlign: 'right' }}>R$ parado</th>
                <th style={{ textAlign: 'right' }}>CDI/mes</th>
              </tr>
            </thead>
            <tbody>
              {famFiltradas.map((f, i) => (
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
              {famFiltradas.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--mute)', padding: 16 }}>Nenhuma familia bate os filtros.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Drill-down */}
        {famSel ? (
          <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <b style={{ fontSize: 13 }}>Drill-down · {famSel}</b>
              <span style={{ color: 'var(--mute)', fontSize: 12 }}>({famVariantes.length} variantes no top 500)</span>
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
                Nenhuma variante dessa familia esta no top 500 da lista flat (mas pode existir no dataset completo).
              </div>
            ) : (
              <table className="t">
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Produto</th>
                    <th style={{ textAlign: 'right' }}>Estoque</th>
                    <th style={{ textAlign: 'right' }}>Vendas/mes</th>
                    <th style={{ textAlign: 'right' }}>Cob (m)</th>
                    <th style={{ textAlign: 'right' }}>Receita 12m</th>
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
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRLk(p.receita_12m)}</td>
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

      {/* === Bloco 4: Lista flat de produtos slow === */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>
          4. Lista acionavel (produtos individuais)
        </div>
        <p style={{ color: 'var(--mute)', fontSize: 12, margin: '0 0 14px' }}>
          Para quem prefere ver os produtos sem agrupar por familia. Top {D.produtos_flat.length} por
          R$ parado (corte 6m de referencia — universo amplo). Use os filtros pra refinar.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
          <select value={flatMarca} onChange={(e) => setFlatMarca(e.target.value)} style={selectStyle}>
            <option value="">Marca (todas)</option>
            {D.filtros.marcas.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={flatCat} onChange={(e) => setFlatCat(e.target.value)} style={selectStyle}>
            <option value="">Categoria (todas)</option>
            {D.filtros.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={flatForn} onChange={(e) => setFlatForn(e.target.value)} style={selectStyle}>
            <option value="">Fornecedor (todos)</option>
            {D.filtros.fornecedores.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <input
            value={flatBusca}
            onChange={(e) => setFlatBusca(e.target.value)}
            placeholder="Buscar (nome / codigo / ID)"
            style={inputStyle}
          />
        </div>

        <p style={{ color: 'var(--mute)', fontSize: 12, margin: '0 0 10px' }}>
          {_fmtNum(flatFiltrado.length)} produtos · {_fmtBRL(flatTot.v)} parado · {_fmtBRL(flatTot.c)}/mes CDI
        </p>

        <div style={{ maxHeight: 540, overflow: 'auto' }}>
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
              {flatFiltrado.slice(0, 300).map((p, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.codigo}</td>
                  <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nome}>{p.nome}</td>
                  <td>{p.marca || '—'}</td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nome_fornecedor}>{p.nome_fornecedor || '—'}</td>
                  <td>{p.categoria_mae || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(p.estoque_atual, 0)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtNum(p.vendas_mes, 1)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCob(p.cobertura_meses)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtDias(p.dias_sem_venda)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(p.valor_estoque_custo)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{_fmtBRL(p.cdi_mes)}</td>
                </tr>
              ))}
              {flatFiltrado.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--mute)', padding: 16 }}>Nenhum produto bate os filtros.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {flatFiltrado.length > 300 ? (
          <p style={{ color: 'var(--mute)', fontSize: 11, margin: '8px 0 0', textAlign: 'right' }}>
            Mostrando 300 de {_fmtNum(flatFiltrado.length)} (refine os filtros pra ver os demais).
          </p>
        ) : null}
      </div>
    </div>
  );
};

// Registra no escopo do bundle pra PAGE_COMPS do App raiz pegar via referencia direta.
Object.assign(window, { PageGiroEstoque });
