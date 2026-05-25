/**
 * pages-compvendatotal.jsx — Composicao de Venda (TOTAL): treemap Marca -> Produto.
 *
 * Tela 15 do PBI Astro. Reproduz o KPI "Valor Total" (R$ 3,22M no PBI filtrado por abr/2026)
 * + visao hierarquica top marcas -> top produtos (seo_title).
 *
 * - Reativo via DuckDB-WASM (window.__duckdb), igual PageAstroDash.
 * - Filtro de periodo: 1m (mes atual) | 3m | 6m | 12m (default) | 24m | tudo.
 * - Treemap SVG squarified (algoritmo recursivo: maior valor pega area maior em formato proximo de quadrado).
 * - Cor por marca (palette categorica 12 cores).
 * - Click numa marca seleciona-a e mostra detalhe (top 30 produtos como sub-treemap).
 * - Lista lateral top 20 marcas com barras proporcionais.
 *
 * Reusa helpers globais (pages-astro.jsx): _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct, useDuckDBQuery, useDuckDBStatus.
 * Fallback: se DuckDB nao subir, le window.COMPVENDATOTAL_DATA (pre-calculado, periodo = tudo).
 */

// ===== Helpers locais (fallback se pages-astro nao carregou) =====
const _ct_fmtBRL = (typeof _fmtBRL === 'function')
  ? _fmtBRL
  : (v) => v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const _ct_fmtBRLk = (typeof _fmtBRLk === 'function')
  ? _fmtBRLk
  : (v) => {
      if (v == null || !isFinite(v)) return '—';
      const a = Math.abs(v), s = v < 0 ? '-' : '';
      if (a >= 1e9) return `${s}R$ ${(a/1e9).toFixed(2).replace('.', ',')}B`;
      if (a >= 1e6) return `${s}R$ ${(a/1e6).toFixed(2).replace('.', ',')}M`;
      if (a >= 1e3) return `${s}R$ ${(a/1e3).toFixed(0)}k`;
      return `${s}R$ ${a.toFixed(0)}`;
    };
const _ct_fmtNum = (typeof _fmtNum === 'function')
  ? _fmtNum
  : (v, d = 0) => v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const _ct_fmtPct = (typeof _fmtPct === 'function')
  ? _fmtPct
  : (v, d = 1) => v == null || !isFinite(v) ? '—' : `${(v*100).toFixed(d).replace('.', ',')}%`;

// ===== Palette categorica para marcas =====
const COMPVENDA_PALETTE = [
  '#22d3ee', // cyan
  '#10b981', // green
  '#a78bfa', // violet
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#ec4899', // pink
  '#84cc16', // lime
  '#06b6d4', // sky
  '#f97316', // orange
  '#8b5cf6', // purple
  '#14b8a6', // teal
  '#facc15', // yellow
  '#fb7185', // rose
  '#6366f1', // indigo
  '#a3e635', // lime-bright
  '#eab308', // gold
  '#0ea5e9', // cyan-deep
  '#d946ef', // fuchsia
  '#22c55e', // emerald
  '#94a3b8', // slate
  '#fb923c', // orange-light
  '#c084fc', // violet-light
  '#34d399', // mint
  '#f472b6', // pink-light
];

const _colorForMarca = (idx) => COMPVENDA_PALETTE[idx % COMPVENDA_PALETTE.length];

// ===========================================================================
// Squarified Treemap algorithm (Bruls/Huijbregts/van Wijk, 2000)
// Recursivamente coloca retangulos para minimizar aspect ratio.
// ===========================================================================

// Calcula o pior aspect ratio de uma row de retangulos com area total `s` na linha `w`.
const _worstAspect = (row, w) => {
  if (!row.length) return Infinity;
  let rMin = Infinity, rMax = -Infinity, s = 0;
  for (const v of row) {
    if (v < rMin) rMin = v;
    if (v > rMax) rMax = v;
    s += v;
  }
  const s2 = s * s;
  const w2 = w * w;
  return Math.max((w2 * rMax) / s2, s2 / (w2 * rMin));
};

// Layout uma "row" (sequencia de retangulos lado a lado) dentro do rect dado.
const _layoutRow = (row, items, rect) => {
  const horizontal = rect.w >= rect.h;
  const total = row.reduce((s, v) => s + v, 0);
  const out = [];
  if (horizontal) {
    // Row ocupa toda altura, largura = total / h
    const rowW = total / rect.h;
    let y = rect.y;
    for (let i = 0; i < row.length; i++) {
      const h = row[i] / rect.h * (rect.h / total) * total / rect.h * rect.h; // simplifica
      const itemH = (row[i] / total) * rect.h;
      out.push({
        item: items[i],
        x: rect.x, y, w: rowW, h: itemH,
      });
      y += itemH;
    }
    return { rects: out, leftover: { x: rect.x + rowW, y: rect.y, w: rect.w - rowW, h: rect.h } };
  } else {
    // Row ocupa toda largura, altura = total / w
    const rowH = total / rect.w;
    let x = rect.x;
    for (let i = 0; i < row.length; i++) {
      const itemW = (row[i] / total) * rect.w;
      out.push({
        item: items[i],
        x, y: rect.y, w: itemW, h: rowH,
      });
      x += itemW;
    }
    return { rects: out, leftover: { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH } };
  }
};

// Squarify principal — retorna array de { item, x, y, w, h } com mesmo escala do rect.
const squarify = (items, rect) => {
  if (!items.length) return [];
  // Normaliza valores pra somar a area do rect (assim trabalha em "area space")
  const totalValue = items.reduce((s, it) => s + (it.value || 0), 0);
  if (totalValue <= 0) return [];
  const area = rect.w * rect.h;
  const scale = area / totalValue;
  const scaled = items.map((it) => ({ ...it, scaledValue: (it.value || 0) * scale }));
  // Ordena DESC
  scaled.sort((a, b) => b.scaledValue - a.scaledValue);

  const results = [];
  let remaining = { ...rect };
  let queue = scaled.slice();

  while (queue.length) {
    const w = Math.min(remaining.w, remaining.h);
    if (w <= 0) break;
    let row = [];
    let rowItems = [];
    let i = 0;
    while (i < queue.length) {
      const next = queue[i].scaledValue;
      const newRow = [...row, next];
      const worstNew = _worstAspect(newRow, w);
      const worstCur = _worstAspect(row, w);
      if (row.length === 0 || worstNew <= worstCur) {
        row = newRow;
        rowItems.push(queue[i]);
        i++;
      } else {
        break;
      }
    }
    if (!row.length) break;
    // Layout esta row
    const { rects, leftover } = _layoutRow(row, rowItems, remaining);
    results.push(...rects);
    remaining = leftover;
    queue = queue.slice(i);
  }
  return results;
};

// ===========================================================================
// CompVendaTreemap — SVG componente reutilizavel
// ===========================================================================

const CompVendaTreemap = ({ items, width, height, getColor, onClick, activeKey, getLabel, getValue, getTotal, padding = 1 }) => {
  if (!items || !items.length) return <div className="empty">sem dados</div>;
  const rects = React.useMemo(
    () => squarify(items.map((it, i) => ({ key: it.key, value: it.value, _i: i, _orig: it })), { x: 0, y: 0, w: width, h: height }),
    [items, width, height]
  );
  const totalAll = items.reduce((s, it) => s + (it.value || 0), 0);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {rects.map((r, idx) => {
        const orig = r.item._orig;
        const isActive = activeKey === orig.key;
        const dim = activeKey != null && !isActive;
        const fill = getColor(orig, r.item._i);
        const showLabel = r.w > 60 && r.h > 26;
        const showValue = r.w > 60 && r.h > 42;
        const pad = padding;
        return (
          <g
            key={orig.key + '-' + idx}
            onClick={() => onClick && onClick(orig)}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
          >
            <rect
              x={r.x + pad}
              y={r.y + pad}
              width={Math.max(0, r.w - pad * 2)}
              height={Math.max(0, r.h - pad * 2)}
              fill={fill}
              opacity={dim ? 0.25 : (isActive ? 1 : 0.85)}
              stroke={isActive ? '#fff' : 'rgba(0,0,0,0.25)'}
              strokeWidth={isActive ? 2 : 1}
              rx={2}
            >
              <title>{`${getLabel ? getLabel(orig) : orig.key}: ${_ct_fmtBRL(orig.value)} (${_ct_fmtPct(orig.value / (totalAll || 1))})`}</title>
            </rect>
            {showLabel && (
              <text
                x={r.x + 6}
                y={r.y + 16}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  fill: '#0b1220',
                  fontFamily: 'Inter, sans-serif',
                  pointerEvents: 'none',
                  textShadow: '0 1px 1px rgba(255,255,255,0.3)',
                }}
              >
                {(() => {
                  const lbl = getLabel ? getLabel(orig) : orig.key;
                  const maxChars = Math.floor((r.w - 12) / 6.5);
                  return lbl.length > maxChars ? lbl.slice(0, Math.max(3, maxChars - 1)) + '…' : lbl;
                })()}
              </text>
            )}
            {showValue && (
              <text
                x={r.x + 6}
                y={r.y + 32}
                style={{
                  fontSize: 10,
                  fill: '#0b1220',
                  fontFamily: 'JetBrains Mono, monospace',
                  pointerEvents: 'none',
                  opacity: 0.85,
                }}
              >
                {_ct_fmtBRLk(orig.value)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ===========================================================================
// PageComposicaoVendaTotal
// ===========================================================================

const PageComposicaoVendaTotal = () => {
  const [periodo, setPeriodo] = React.useState('12m');
  const [marcaSel, setMarcaSel] = React.useState(null);
  const [containerW, setContainerW] = React.useState(800);
  const containerRef = React.useRef(null);

  // Mede largura do container reativo (resize)
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth || 800;
      setContainerW(Math.max(360, w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  // Status DuckDB
  const ddStatus = (typeof useDuckDBStatus === 'function') ? useDuckDBStatus() : { ready: !!window.__duckdbReady, error: window.__duckdbErr };

  // Filtro WHERE periodo
  // Obs: parquet nao tem coluna `situacao` — outras pages-astro filtram em runtime mas aqui
  // apenas exigimos valor_rateado nao nulo + janela de meses.
  const whereSql = React.useMemo(() => {
    const parts = [];
    parts.push("data_pedido IS NOT NULL");
    parts.push("valor_rateado IS NOT NULL");
    if (periodo !== 'tudo') {
      const monthsMap = { '1m': 1, '3m': 3, '6m': 6, '12m': 12, '24m': 24 };
      const months = monthsMap[periodo] || 12;
      parts.push(`data_pedido >= (SELECT MAX(data_pedido) - INTERVAL ${months} MONTH FROM vendas)`);
    }
    return parts.join(' AND ');
  }, [periodo]);

  // Query 1: KPIs (total geral, n_marcas, n_produtos)
  const kpiSql = `
    SELECT
      SUM(valor_rateado)::DOUBLE AS total,
      COUNT(DISTINCT marca)::INT AS n_marcas,
      COUNT(DISTINCT seo_title)::INT AS n_produtos
    FROM vendas
    WHERE ${whereSql}
  `;
  const kpiState = (typeof useDuckDBQuery === 'function') ? useDuckDBQuery(kpiSql, [whereSql]) : { data: null, loading: true };

  // Query 2: Top 25 marcas (todas as marcas pra treemap; recorta visualmente)
  const marcasSql = `
    SELECT
      COALESCE(marca, '(sem marca)') AS marca,
      SUM(valor_rateado)::DOUBLE AS total_marca,
      COUNT(DISTINCT seo_title)::INT AS n_produtos
    FROM vendas
    WHERE ${whereSql} AND marca IS NOT NULL
    GROUP BY 1
    ORDER BY total_marca DESC
    LIMIT 25
  `;
  const marcasState = (typeof useDuckDBQuery === 'function') ? useDuckDBQuery(marcasSql, [whereSql]) : { data: null, loading: true };

  // Query 3: Top 30 produtos da marca selecionada (so quando marcaSel != null)
  const produtosSql = marcaSel ? `
    SELECT
      COALESCE(seo_title, '(sem titulo)') AS seo_title,
      SUM(valor_rateado)::DOUBLE AS valor,
      SUM(quantidade)::DOUBLE AS quantidade
    FROM vendas
    WHERE ${whereSql}
      AND marca = '${String(marcaSel).replace(/'/g, "''")}'
      AND seo_title IS NOT NULL
    GROUP BY 1
    ORDER BY valor DESC
    LIMIT 30
  ` : null;
  const produtosState = (typeof useDuckDBQuery === 'function') ? useDuckDBQuery(produtosSql, [produtosSql]) : { data: null, loading: false };

  // Fallback: se DuckDB nao subiu, le snapshot estatico
  const fallbackData = !ddStatus.ready && window.COMPVENDATOTAL_DATA ? window.COMPVENDATOTAL_DATA : null;

  const usingFallback = !!fallbackData && (!kpiState.data || ddStatus.error);

  const kpi = usingFallback
    ? {
        total: fallbackData.totais.total_geral,
        n_marcas: fallbackData.totais.n_marcas_total,
        n_produtos: fallbackData.totais.n_produtos_total,
      }
    : (kpiState.data && kpiState.data[0]) || null;

  const marcasData = usingFallback
    ? fallbackData.tree_data.map((m) => ({ marca: m.marca, total_marca: m.total_marca, n_produtos: m.n_produtos_marca }))
    : (marcasState.data || []);

  const produtosData = usingFallback
    ? (marcaSel && fallbackData.tree_data.find((m) => m.marca === marcaSel)?.produtos.map((p) => ({ seo_title: p.seo_title, valor: p.valor, quantidade: p.quantidade })) || [])
    : (produtosState.data || []);

  // Mapeia indice de cor por marca (estavel: top1 = cor0, top2 = cor1...)
  const marcaColorIdx = React.useMemo(() => {
    const m = {};
    marcasData.forEach((it, i) => { m[it.marca] = i; });
    return m;
  }, [marcasData]);

  // Items pro treemap principal (marcas)
  const treemapItems = React.useMemo(() => marcasData.map((m) => ({
    key: m.marca,
    value: m.total_marca,
    n_produtos: m.n_produtos,
  })), [marcasData]);

  // Items pro sub-treemap (produtos da marca selecionada)
  const subItems = React.useMemo(() => produtosData.map((p) => ({
    key: p.seo_title,
    value: p.valor,
    quantidade: p.quantidade,
  })), [produtosData]);

  // Top 20 marcas pra lista lateral
  const topListaMarcas = marcasData.slice(0, 20);
  const maxLista = topListaMarcas.length ? Math.max(...topListaMarcas.map((m) => m.total_marca)) : 1;

  // Layout treemap principal
  const treemapH = 520;

  return (
    <div className="page" style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Composição de Venda (Total)</h2>
        <span style={{ fontSize: 12, color: 'var(--mute)' }}>Treemap Marca → Produto · clique numa marca pra detalhar produtos</span>
      </div>

      {/* Filtro periodo */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Período</span>
        {[
          { id: '1m', label: '1 mês' },
          { id: '3m', label: '3 meses' },
          { id: '6m', label: '6 meses' },
          { id: '12m', label: '12 meses' },
          { id: '24m', label: '24 meses' },
          { id: 'tudo', label: 'Tudo' },
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            style={{
              background: periodo === p.id ? 'var(--cyan)' : 'var(--surface)',
              color: periodo === p.id ? '#0b1220' : 'var(--text-2)',
              border: '1px solid ' + (periodo === p.id ? 'var(--cyan)' : 'var(--border)'),
              padding: '5px 10px',
              borderRadius: 4,
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: periodo === p.id ? 700 : 500,
            }}
          >
            {p.label}
          </button>
        ))}
        {marcaSel && (
          <button
            onClick={() => setMarcaSel(null)}
            style={{
              marginLeft: 16,
              background: 'rgba(239,68,68,0.15)',
              color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.35)',
              padding: '5px 10px',
              borderRadius: 4,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ✕ Limpar marca {marcaSel}
          </button>
        )}
        {usingFallback && (
          <span style={{ marginLeft: 16, fontSize: 10, color: '#f59e0b' }}>⚠ DuckDB indisponível — usando snapshot estático</span>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Valor Total</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'JetBrains Mono, monospace' }}>{kpi ? _ct_fmtBRLk(kpi.total) : '—'}</div>
          <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>{kpi ? _ct_fmtBRL(kpi.total) : ''}</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Marcas</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{kpi ? _ct_fmtNum(kpi.n_marcas) : '—'}</div>
          <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>distintas no período</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Produtos</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{kpi ? _ct_fmtNum(kpi.n_produtos) : '—'}</div>
          <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>SEO títulos únicos</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Top {marcasData.length} marcas</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
            {kpi ? _ct_fmtPct(marcasData.reduce((s, m) => s + m.total_marca, 0) / (kpi.total || 1)) : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>do total exibido</div>
        </div>
      </div>

      {/* Layout principal: treemap + lista lateral */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16 }}>
        {/* Treemap area */}
        <div ref={containerRef} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
              {marcaSel ? (
                <>Produtos de <span style={{ color: _colorForMarca(marcaColorIdx[marcaSel] || 0) }}>{marcaSel}</span> · top {subItems.length}</>
              ) : (
                <>Treemap por Marca · top {treemapItems.length}</>
              )}
            </h3>
            {(kpiState.loading || marcasState.loading || produtosState.loading) && !usingFallback && (
              <span style={{ fontSize: 10, color: 'var(--mute)' }}>carregando…</span>
            )}
          </div>
          {!ddStatus.ready && !fallbackData ? (
            <div style={{ height: treemapH, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute)', fontSize: 12 }}>
              {ddStatus.error ? `Erro DuckDB: ${ddStatus.error}` : 'Inicializando DuckDB…'}
            </div>
          ) : marcaSel ? (
            <CompVendaTreemap
              items={subItems}
              width={containerW - 24}
              height={treemapH}
              getColor={() => _colorForMarca(marcaColorIdx[marcaSel] || 0)}
              onClick={null}
              activeKey={null}
              getLabel={(it) => it.key}
            />
          ) : (
            <CompVendaTreemap
              items={treemapItems}
              width={containerW - 24}
              height={treemapH}
              getColor={(it) => _colorForMarca(marcaColorIdx[it.key] || 0)}
              onClick={(it) => setMarcaSel(it.key)}
              activeKey={null}
              getLabel={(it) => it.key}
            />
          )}
        </div>

        {/* Lista lateral top 20 marcas */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', fontWeight: 600, marginBottom: 10 }}>Top 20 Marcas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: treemapH, overflowY: 'auto' }}>
            {topListaMarcas.map((m, i) => {
              const isActive = marcaSel === m.marca;
              const dim = marcaSel != null && !isActive;
              const color = _colorForMarca(marcaColorIdx[m.marca] || i);
              const pct = m.total_marca / maxLista;
              return (
                <div
                  key={m.marca}
                  onClick={() => setMarcaSel(isActive ? null : m.marca)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '20px 1fr 80px',
                    gap: 8,
                    alignItems: 'center',
                    padding: '4px 6px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    opacity: dim ? 0.45 : 1,
                    background: isActive ? 'rgba(34,211,238,0.08)' : 'transparent',
                    border: isActive ? '1px solid rgba(34,211,238,0.35)' : '1px solid transparent',
                  }}
                  title={`${m.marca}: ${_ct_fmtBRL(m.total_marca)} · ${m.n_produtos} produtos`}
                >
                  <span style={{ fontSize: 10, color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.marca}</div>
                    <div style={{ background: 'var(--surface-2)', borderRadius: 3, height: 6, overflow: 'hidden', marginTop: 2 }}>
                      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{_ct_fmtBRLk(m.total_marca)}</span>
                </div>
              );
            })}
            {!topListaMarcas.length && (
              <div className="empty" style={{ padding: 20, textAlign: 'center', color: 'var(--mute)', fontSize: 11 }}>sem dados</div>
            )}
          </div>
        </div>
      </div>

      {/* Detalhe da marca selecionada: tabela de produtos */}
      {marcaSel && produtosData.length > 0 && (
        <div style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <h3 style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', fontWeight: 600, marginBottom: 10 }}>
            Detalhe · {marcaSel} · top {produtosData.length} produtos
          </h3>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table className="t" style={{ width: '100%', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                <tr>
                  <th style={{ width: 40, textAlign: 'right' }}>#</th>
                  <th>Produto (seo_title)</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Valor</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Qtd</th>
                  <th style={{ width: 70, textAlign: 'right' }}>% marca</th>
                </tr>
              </thead>
              <tbody>
                {produtosData.map((p, i) => {
                  const totalMarcaSel = produtosData.reduce((s, x) => s + (x.valor || 0), 0);
                  return (
                    <tr key={p.seo_title}>
                      <td style={{ textAlign: 'right', color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace' }}>{i + 1}</td>
                      <td title={p.seo_title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>{p.seo_title}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{_ct_fmtBRL(p.valor)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-2)' }}>{_ct_fmtNum(p.quantidade)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-2)' }}>{_ct_fmtPct(p.valor / (totalMarcaSel || 1))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// Registra no escopo do bundle
Object.assign(window, { PageComposicaoVendaTotal });
