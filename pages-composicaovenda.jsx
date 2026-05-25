/**
 * pages-composicaovenda.jsx — Astro · Composição de Venda (Drill encadeado)
 *
 * Migra a tela 14 do PBI Astro (pbi_14.png / pbi_14.txt) — "COMPOSIÇÃO DE
 * VENDA…" no menu. Visual original:
 *
 *   Categoria → Marca → SubCategoria → UF → Transportadora
 *
 * Cada nível é uma coluna com Top 10 (bar horizontal). Clique numa barra
 * "ancora" aquele valor no path do drill e refresca os níveis seguintes,
 * que passam a mostrar Top 10 condicionado ao path completo.
 *
 * Métrica do PBI: "Vendas/Dia útil" (R$ bruto sobre dias úteis no período).
 * Aqui usamos o mesmo cálculo: SUM(valor_rateado) / COUNT(DISTINCT data útil).
 *
 * Stack: DuckDB-WASM via window.__duckdb. Reusa helpers globais de
 *   pages-astro.jsx: AstroBarH, _runQuery, useDuckDBQuery, useDuckDBStatus,
 *   buildWhere, DEFAULT_FILTERS_ASTRO, FilterBarAstro, ActiveChips, _sqlEsc,
 *   _fmtBRL, _fmtBRLk.
 *
 * Sem build_*_data.py — tudo runtime.
 */

// Hierarquia fixa do drill encadeado (na ordem do PBI 14)
const COMP_VENDA_LEVELS = [
  { col: 'categoria_mae',      label: 'Categoria' },
  { col: 'marca',              label: 'Marca' },
  { col: 'sub_categoria',      label: 'SubCategoria' },
  { col: 'cliente_uf',         label: 'UF' },
  { col: 'nome_transportador', label: 'Transportadora' },
];

const COMP_VENDA_COLORS = ['cyan', 'violet', 'green', 'amber', 'cyan'];

// =====================================================================
// Coluna de um nível: Top 10 + click pra ancorar no path
// =====================================================================

const ComposicaoLevel = ({ level, depth, path, where, onPick, color }) => {
  // path = [{ col, val }, ...]  — só os níveis ANTES deste
  const extra = path.map((p) => `${p.col} = '${_sqlEsc(p.val)}'`).join(' AND ');
  const fullWhere = extra ? `(${where}) AND ${extra}` : where;
  const col = level.col;
  const sql = React.useMemo(() => `
    WITH base AS (
      SELECT ${col} AS k,
             SUM(valor_rateado)::DOUBLE AS venda,
             COUNT(DISTINCT CAST(data_pedido AS DATE)) FILTER (WHERE dayofweek(data_pedido) BETWEEN 1 AND 5) AS dias_uteis,
             SUM(CASE WHEN dayofweek(data_pedido) BETWEEN 1 AND 5 THEN valor_rateado ELSE 0 END)::DOUBLE AS venda_util
      FROM vendas
      WHERE ${fullWhere} AND ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY 1
    )
    SELECT k, venda,
           CASE WHEN dias_uteis > 0 THEN venda_util / dias_uteis ELSE 0 END AS vendas_dia_util
    FROM base
    ORDER BY vendas_dia_util DESC
    LIMIT 10
  `, [fullWhere, col]);
  const { data, loading, error } = useDuckDBQuery(sql, [sql]);

  const picked = path.length > depth ? null : null; // safety
  const activeVal = (() => {
    // o "filho" deste nível é path[depth] — se existir, é a barra ancorada AQUI
    // path armazena os pais; o pick do nível atual fica no próximo render.
    // Aqui inferimos a partir do `path` recebido por NÍVEIS POSTERIORES.
    // Como cada coluna só vê os pais, o "ativo" desta coluna vem do nível seguinte
    // — passamos via prop `activeLabel` (calculado em ComposicaoVendaInner).
    return null;
  })();

  const items = (data || []).map((r) => ({ label: r.k, v: r.vendas_dia_util || 0 }));

  return (
    <div className="card" style={{ padding: 12, minWidth: 0 }}>
      <div className="card-title-row" style={{ marginBottom: 8 }}>
        <h2 className="card-title" style={{ fontSize: 13 }}>
          {level.label}
          {loading && <span style={{ fontSize: 10, color: 'var(--mute)', fontWeight: 400, marginLeft: 6 }}>…</span>}
        </h2>
        <span style={{ fontSize: 9, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>top 10</span>
      </div>
      {error && <div style={{ color: 'var(--red-2)', fontSize: 11 }}>err</div>}
      {!error && !loading && !items.length && <div className="empty" style={{ fontSize: 11, padding: 12 }}>sem dados</div>}
      {!error && items.length > 0 && (
        <AstroBarH items={items} color={color || 'cyan'} onClick={(lab) => onPick(level.col, lab)} />
      )}
    </div>
  );
};

// =====================================================================
// KPIs do path: Vendas/Dia útil filtrado pelo path atual
// =====================================================================

const ComposicaoKpis = ({ where, path }) => {
  const extra = path.map((p) => `${p.col} = '${_sqlEsc(p.val)}'`).join(' AND ');
  const fullWhere = extra ? `(${where}) AND ${extra}` : where;
  const sql = React.useMemo(() => `
    WITH base AS (SELECT * FROM vendas WHERE ${fullWhere}),
    diasut AS (
      SELECT COUNT(DISTINCT CAST(data_pedido AS DATE)) AS d
      FROM base WHERE dayofweek(data_pedido) BETWEEN 1 AND 5
    )
    SELECT
      COALESCE(SUM(valor_rateado), 0)::DOUBLE AS valor_bruto,
      COALESCE(SUM(CASE WHEN dayofweek(data_pedido) BETWEEN 1 AND 5 THEN valor_rateado ELSE 0 END), 0)::DOUBLE AS bruto_util,
      (SELECT d FROM diasut) AS dias_uteis,
      COUNT(DISTINCT numero)::INT AS n_vendas
    FROM base
  `, [fullWhere]);
  const { data, loading } = useDuckDBQuery(sql, [sql]);
  const r = (data && data[0]) || { valor_bruto: 0, bruto_util: 0, dias_uteis: 0, n_vendas: 0 };
  const dias = r.dias_uteis || 0;
  const venda_dia_util = dias ? (r.bruto_util || 0) / dias : 0;
  const sk = (txt) => <span style={{ opacity: loading ? 0.45 : 1, transition: 'opacity 200ms' }}>{txt}</span>;
  return (
    <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
      <div className="kpi-tile cyan">
        <div className="kpi-label">Vendas / Dia útil</div>
        <div className="kpi-value"><span className="currency">R$</span>{sk(_fmtBRLk(venda_dia_util).replace('R$ ', ''))}</div>
        <div className="kpi-hint">bruto útil ÷ {dias} dias úteis</div>
      </div>
      <div className="card kpi-mini">
        <div className="kpi-label">Valor Bruto (período)</div>
        <div className="kpi-value">{sk(_fmtBRLk(r.valor_bruto || 0))}</div>
        <div className="kpi-hint">filtros + path do drill</div>
      </div>
      <div className="card kpi-mini">
        <div className="kpi-label">N° Vendas</div>
        <div className="kpi-value">{sk((r.n_vendas || 0).toLocaleString('pt-BR'))}</div>
        <div className="kpi-hint">pedidos distintos</div>
      </div>
      <div className="card kpi-mini">
        <div className="kpi-label">Path do drill</div>
        <div className="kpi-value" style={{ fontSize: 14 }}>{path.length}/{COMP_VENDA_LEVELS.length}</div>
        <div className="kpi-hint">{path.length === 0 ? 'sem âncora' : path.map((p) => p.val).join(' › ')}</div>
      </div>
    </div>
  );
};

// =====================================================================
// Breadcrumb do drill — clicável (volta pro nível)
// =====================================================================

const ComposicaoBreadcrumb = ({ path, onResetTo }) => {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      marginBottom: 14, fontSize: 12,
    }}>
      <span style={{ fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Drill encadeado:
      </span>
      <button
        onClick={() => onResetTo(0)}
        style={{
          background: path.length === 0 ? 'rgba(34,211,238,0.15)' : 'var(--surface-2)',
          border: '1px solid ' + (path.length === 0 ? 'var(--cyan-dim)' : 'var(--border)'),
          color: path.length === 0 ? 'var(--cyan-2)' : 'var(--text-2)',
          padding: '4px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
        }}
      >Todos</button>
      {path.map((p, i) => {
        const lvl = COMP_VENDA_LEVELS.find((l) => l.col === p.col);
        const label = lvl ? lvl.label : p.col;
        return (
          <React.Fragment key={i}>
            <span style={{ color: 'var(--mute)' }}>›</span>
            <button
              onClick={() => onResetTo(i + 1)}
              title={`${label}: ${p.val} — clique pra remover níveis abaixo`}
              style={{
                background: 'rgba(34,211,238,0.10)',
                border: '1px solid var(--cyan-dim)',
                color: 'var(--cyan-2)',
                padding: '4px 10px', borderRadius: 999, fontSize: 11,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                maxWidth: 220, overflow: 'hidden',
              }}
            >
              <span style={{ fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase' }}>{label}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.val}</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>×</span>
            </button>
          </React.Fragment>
        );
      })}
      {path.length > 0 && (
        <button
          onClick={() => onResetTo(0)}
          style={{ background: 'transparent', border: 'none', color: 'var(--mute)', fontSize: 11, cursor: 'pointer', marginLeft: 4 }}
        >limpar drill</button>
      )}
    </div>
  );
};

// =====================================================================
// Componente interno: rende N colunas, cada uma reage ao path
// =====================================================================

const ComposicaoVendaInner = ({ where }) => {
  // path = [{col, val}] na MESMA ORDEM dos níveis. Cada item ancora 1 nível.
  const [path, setPath] = React.useState([]);

  const onPick = (col, val) => {
    setPath((prev) => {
      // Encontrar índice do nível no array de níveis
      const lvlIdx = COMP_VENDA_LEVELS.findIndex((l) => l.col === col);
      if (lvlIdx === -1) return prev;
      // Se o usuário clicou no MESMO valor que já está ancorado nesse nível,
      // desancorar (= remover este e todos os filhos).
      if (prev[lvlIdx] && prev[lvlIdx].val === val) {
        return prev.slice(0, lvlIdx);
      }
      // Se clicou em outro valor (ou ainda sem âncora) — substitui esse nível
      // e DESCARTA os níveis filhos (que ficaram inválidos).
      const next = prev.slice(0, lvlIdx);
      next[lvlIdx] = { col, val };
      return next;
    });
  };

  const onResetTo = (n) => setPath((prev) => prev.slice(0, n));

  return (
    <>
      <ComposicaoKpis where={where} path={path} />
      <ComposicaoBreadcrumb path={path} onResetTo={onResetTo} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${COMP_VENDA_LEVELS.length}, minmax(0, 1fr))`,
        gap: 12,
      }}>
        {COMP_VENDA_LEVELS.map((lvl, depth) => {
          // O `path` passado pra coluna é APENAS os pais (níveis anteriores ancorados
          // CONTÍGUOS a partir de 0). Se houver buraco no path (raro: o usuário pula
          // níveis), respeita: pega só os contíguos.
          const parents = [];
          for (let i = 0; i < depth; i++) {
            if (path[i] && path[i].col === COMP_VENDA_LEVELS[i].col) {
              parents.push(path[i]);
            } else {
              break;
            }
          }
          return (
            <ComposicaoLevelWithActive
              key={lvl.col}
              level={lvl}
              depth={depth}
              path={parents}
              where={where}
              onPick={onPick}
              color={COMP_VENDA_COLORS[depth % COMP_VENDA_COLORS.length]}
              activeVal={path[depth] && path[depth].col === lvl.col ? path[depth].val : null}
            />
          );
        })}
      </div>
    </>
  );
};

// Wrapper que passa activeVal pro AstroBarH (highlight da barra ancorada)
const ComposicaoLevelWithActive = ({ level, depth, path, where, onPick, color, activeVal }) => {
  const extra = path.map((p) => `${p.col} = '${_sqlEsc(p.val)}'`).join(' AND ');
  const fullWhere = extra ? `(${where}) AND ${extra}` : where;
  const col = level.col;
  const sql = React.useMemo(() => `
    WITH base AS (
      SELECT ${col} AS k,
             COUNT(DISTINCT CAST(data_pedido AS DATE)) FILTER (WHERE dayofweek(data_pedido) BETWEEN 1 AND 5) AS dias_uteis,
             SUM(CASE WHEN dayofweek(data_pedido) BETWEEN 1 AND 5 THEN valor_rateado ELSE 0 END)::DOUBLE AS venda_util
      FROM vendas
      WHERE ${fullWhere} AND ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY 1
    )
    SELECT k,
           CASE WHEN dias_uteis > 0 THEN venda_util / dias_uteis ELSE 0 END AS vendas_dia_util
    FROM base
    ORDER BY vendas_dia_util DESC
    LIMIT 10
  `, [fullWhere, col]);
  const { data, loading, error } = useDuckDBQuery(sql, [sql]);
  const items = (data || []).map((r) => ({ label: r.k, v: r.vendas_dia_util || 0 }));

  return (
    <div className="card" style={{ padding: 12, minWidth: 0 }}>
      <div className="card-title-row" style={{ marginBottom: 8 }}>
        <h2 className="card-title" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, borderRadius: 4,
            background: 'var(--surface-3)', color: 'var(--mute)',
            fontSize: 10, fontFamily: 'var(--font-mono)',
          }}>{depth + 1}</span>
          {level.label}
          {activeVal && <span style={{ color: 'var(--cyan)', fontSize: 11 }}>×</span>}
          {loading && <span style={{ fontSize: 10, color: 'var(--mute)', fontWeight: 400, marginLeft: 4 }}>…</span>}
        </h2>
        <span style={{ fontSize: 9, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>top 10</span>
      </div>
      {activeVal && (
        <div style={{
          fontSize: 11, color: 'var(--cyan-2)',
          padding: '4px 8px', marginBottom: 8,
          background: 'rgba(34,211,238,0.08)', borderRadius: 4,
          border: '1px solid var(--cyan-dim)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={activeVal}>
          ancorado: {activeVal}
        </div>
      )}
      {error && <div style={{ color: 'var(--red-2)', fontSize: 11 }}>err: {String(error).slice(0, 80)}</div>}
      {!error && !loading && !items.length && <div className="empty" style={{ fontSize: 11, padding: 12 }}>sem dados</div>}
      {!error && items.length > 0 && (
        <AstroBarH
          items={items}
          color={color}
          onClick={(lab) => onPick(level.col, lab)}
          activeLabel={activeVal}
        />
      )}
    </div>
  );
};

// =====================================================================
// PageComposicaoVenda — top-level
// =====================================================================

const PageComposicaoVenda = () => {
  const [filters, setFilters] = React.useState(() => ({ ...DEFAULT_FILTERS_ASTRO }));
  const setF = React.useCallback((patch) => {
    setFilters((prev) => {
      const np = typeof patch === 'function' ? patch(prev) : patch;
      return { ...prev, ...np };
    });
  }, []);
  const status = useDuckDBStatus();
  const where = React.useMemo(() => buildWhere(filters), [filters]);

  if (status.error) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="card" style={{ padding: 24, color: 'var(--red-2)' }}>
          <h3 style={{ marginTop: 0 }}>Erro ao carregar DuckDB-WASM</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{status.error}</pre>
          <p style={{ fontSize: 12, color: 'var(--mute)' }}>
            Verifique <code>data/vendas_dash.parquet</code> e a conexão ao CDN.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <span>Power BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Composição de Venda</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: status.ready ? 'var(--green-2)' : 'var(--mute)' }}>
          {status.ready ? `DuckDB ready${status.bootMs ? ` (${status.bootMs}ms)` : ''}` : 'Carregando parquet…'}
        </span>
      </div>

      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Composição de Venda · Drill encadeado</h1>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--mute)' }}>
        Réplica reativa do PBI 14. Cinco níveis em cascata: Categoria → Marca → SubCategoria → UF → Transportadora.
        Clique numa barra pra ancorar o valor no path do drill; cada nível seguinte recalcula o Top 10 restrito ao path. Métrica: Vendas/Dia útil.
      </p>

      <FilterBarAstro filters={filters} setF={setF} />
      <ActiveChips filters={filters} setF={setF} />

      {!status.ready ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--mute)' }}>
          Inicializando DuckDB-WASM (download e carregamento do parquet)…
        </div>
      ) : (
        <ComposicaoVendaInner where={where} />
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        Vendas/Dia útil = SUM(valor_rateado) restrito a dias úteis (seg-sex) ÷ COUNT(DISTINCT data útil) no recorte
        atual (filtros sticky + path do drill). Queries DuckDB-WASM in-browser sobre <code>data/vendas_dash.parquet</code> —
        sem build_*_data.py.
      </div>
    </div>
  );
};

Object.assign(window, { PageComposicaoVenda });
