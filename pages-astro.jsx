/**
 * pages-astro.jsx — telas Astro Distribuidora portadas do Power BI.
 *
 * Dados: window.ASTRO_DASH (gerado por scripts/build_astro_data.py a partir
 * de public-data/vendas_dash.parquet). Pre-calculados em build-time.
 *
 * Pages registradas em window pra PAGE_COMPS do App raiz pegar.
 */

// ===== Helpers de formatacao (sem window.BIT.fmt do template fin40) =====
const _fmtBRL = (v) => {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
};
const _fmtBRLk = (v) => {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}R$ ${(a/1e9).toFixed(2).replace('.', ',')}B`;
  if (a >= 1e6) return `${s}R$ ${(a/1e6).toFixed(2).replace('.', ',')}M`;
  if (a >= 1e3) return `${s}R$ ${(a/1e3).toFixed(0)}k`;
  return `${s}R$ ${a.toFixed(0)}`;
};
const _fmtNum = (v, d = 0) => {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
};
const _fmtPct = (v, d = 1) => {
  if (v == null || !isFinite(v)) return '—';
  return `${(v*100).toFixed(d).replace('.', ',')}%`;
};

// ===== Mini chart: bar vertical simples (sem SVG) =====
const AstroBarV = ({ values, labels, color = 'cyan', height = 200, fmt = _fmtBRLk }) => {
  if (!values || !values.length) return <div className="empty">sem dados</div>;
  const max = Math.max(...values);
  const palette = { cyan: 'var(--cyan)', green: 'var(--green)', amber: 'var(--amber)', violet: 'var(--violet)' };
  return (
    <div className="astro-bar-v" style={{ height, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '20px 4px 0' }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{fmt(v)}</span>
          <div style={{
            width: '100%', maxWidth: 56,
            background: palette[color] || palette.cyan,
            height: `${Math.max(2, (v/max)*100)}%`,
            borderRadius: '6px 6px 0 0',
            boxShadow: '0 -2px 12px rgba(34,211,238,0.25)'
          }} />
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
};

// ===== Mini chart: line area (SVG simples) =====
const AstroLine = ({ values, labels, color = 'var(--cyan)', height = 200 }) => {
  if (!values || !values.length) return <div className="empty">sem dados</div>;
  const W = 600, H = height, P = 30;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = P + (i / Math.max(1, values.length - 1)) * (W - P*2);
    const y = H - P - ((v - min) / range) * (H - P*2);
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const area = `${path} L ${pts[pts.length-1][0]} ${H-P} L ${pts[0][0]} ${H-P} Z`;
  const gradId = `astro-line-grad-${Math.random().toString(36).slice(2,8)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
};

// ===== Mini chart: bar horizontal (top N) =====
const AstroBarH = ({ items, fmt = _fmtBRLk, color = 'cyan' }) => {
  if (!items || !items.length) return <div className="empty">sem dados</div>;
  const max = Math.max(...items.map(it => it.v));
  const palette = { cyan: 'var(--cyan)', green: 'var(--green)', violet: 'var(--violet)' };
  return (
    <div className="astro-bar-h" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>{it.label}</span>
          <div style={{ background: 'var(--surface-2)', borderRadius: 4, height: 22, overflow: 'hidden' }}>
            <div style={{
              width: `${(it.v/max)*100}%`,
              height: '100%',
              background: palette[color] || palette.cyan,
              boxShadow: '0 0 8px rgba(34,211,238,0.3)',
              borderRadius: 4,
            }} />
          </div>
          <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right' }}>{fmt(it.v)}</span>
        </div>
      ))}
    </div>
  );
};

// ===== Donut PF/PJ =====
const AstroDonut = ({ segments, size = 200 }) => {
  if (!segments || !segments.length) return <div className="empty">sem dados</div>;
  const total = segments.reduce((s, x) => s + x.v, 0);
  const R = size/2 - 12, IR = R - 30;
  const COLORS = ['var(--cyan)', 'var(--red)', 'var(--violet)'];
  let acc = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((s, i) => {
          const a1 = (acc / total) * 2 * Math.PI - Math.PI/2;
          acc += s.v;
          const a2 = (acc / total) * 2 * Math.PI - Math.PI/2;
          const cx = size/2, cy = size/2;
          const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
          const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
          const xi1 = cx + IR * Math.cos(a1), yi1 = cy + IR * Math.sin(a1);
          const xi2 = cx + IR * Math.cos(a2), yi2 = cy + IR * Math.sin(a2);
          const large = (a2 - a1) > Math.PI ? 1 : 0;
          const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${IR} ${IR} 0 ${large} 0 ${xi1} ${yi1} Z`;
          return <path key={i} d={path} fill={COLORS[i % COLORS.length]} opacity="0.9" />;
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, background: COLORS[i % COLORS.length], borderRadius: 2 }} />
            <span style={{ color: 'var(--text-2)' }}>{s.tipo}</span>
            <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{_fmtPct(s.v/total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ===== PageAstroDash =====
const PageAstroDash = () => {
  const D = window.ASTRO_DASH;
  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          astro-data.js nao carregado. Rode: <code>python scripts/build_astro_data.py</code>
        </div>
      </div>
    );
  }
  const k = D.kpis;

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Dashboard</b>
      </div>

      {/* === KPIs grandes === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 14 }}>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Valor Bruto</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.valor_bruto).replace('R$ ','')}</div>
          <div className="kpi-hint">Σ valor_rateado</div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Resultado Bruto</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.resultado_bruto).replace('R$ ','')}</div>
          <div className="kpi-hint">bruto − CMV</div>
        </div>
        <div className="kpi-tile amber">
          <div className="kpi-label">CMV</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.cmv).replace('R$ ','')}</div>
          <div className="kpi-hint">custo dos produtos · est</div>
        </div>
        <div className="kpi-tile cyan">
          <div className="kpi-label">Valor Líquido</div>
          <div className="kpi-value"><span className="currency">R$</span>{_fmtBRLk(k.valor_liquido).replace('R$ ','')}</div>
          <div className="kpi-hint">bruto − CFV − CMV</div>
        </div>
      </div>

      {/* === KPIs secundários === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card kpi-mini">
          <div className="kpi-label">Total Vendas</div>
          <div className="kpi-value">{_fmtNum(k.n_vendas)}</div>
          <div className="kpi-hint">{k.dias_uteis} dias úteis</div>
        </div>
        <div className="card kpi-mini">
          <div className="kpi-label">Venda/dia útil</div>
          <div className="kpi-value">{_fmtBRLk(k.venda_dia_util)}</div>
          <div className="kpi-hint">bruto útil ÷ dias</div>
        </div>
        <div className="card kpi-mini">
          <div className="kpi-label">Ticket Médio</div>
          <div className="kpi-value">{_fmtBRL(k.ticket)}</div>
          <div className="kpi-hint">bruto ÷ pedidos</div>
        </div>
        <div className="card kpi-mini">
          <div className="kpi-label">Margem Bruta %</div>
          <div className="kpi-value">{_fmtPct(k.margem_bruta_pct)}</div>
          <div className="kpi-hint">1 − CMV/Vendas · est</div>
        </div>
        <div className="card kpi-mini">
          <div className="kpi-label">CFV %</div>
          <div className="kpi-value">{_fmtPct(k.cfv_pct)}</div>
          <div className="kpi-hint">placeholder · est</div>
        </div>
        <div className="card kpi-mini">
          <div className="kpi-label">Margem Líquida %</div>
          <div className="kpi-value">{_fmtPct(k.margem_liq_pct)}</div>
          <div className="kpi-hint">líquido ÷ bruto</div>
        </div>
      </div>

      {/* === Charts linha 1 === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>Evolução da Venda Bruta</h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Anual</h2></div>
          <AstroBarV values={D.serie_anual.map(x => x.v)} labels={D.serie_anual.map(x => String(x.ano))} color="cyan" height={220} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Diária · últimos 60d</h2></div>
          <AstroLine values={D.serie_diaria.map(x => x.v)} color="var(--cyan)" height={220} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Nº Vendas Mensal · 18m</h2></div>
          <AstroLine values={D.serie_mensal.map(x => x.n)} color="var(--green)" height={220} />
        </div>
      </div>

      {/* === Charts linha 2 === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>Perfil de Vendas</h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Tipo de Comprador</h2></div>
          <AstroDonut segments={D.donut_tipo} size={200} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Mensal · 18m</h2></div>
          <AstroBarV values={D.serie_mensal.map(x => x.v)} labels={D.serie_mensal.map(x => x.am.slice(2))} color="violet" height={220} />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Ticket Diário · 60d</h2></div>
          <AstroLine values={D.ticket_diario.map(x => x.ticket)} color="var(--amber)" height={220} />
        </div>
      </div>

      {/* === Hierarquia === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>Hierarquia de Produtos</h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Top 12 Marcas</h2></div>
          <table className="t" style={{ width: '100%' }}>
            <thead><tr><th>Marca</th><th style={{textAlign:'right'}}>Venda</th><th style={{textAlign:'right'}}>Margem</th><th style={{textAlign:'right'}}>N° Vendas</th></tr></thead>
            <tbody>
              {D.hier_marca.map((r, i) => (
                <tr key={i}>
                  <td>{r.k}</td>
                  <td style={{textAlign:'right', fontFamily:'var(--font-mono)'}}>{_fmtBRLk(r.venda)}</td>
                  <td style={{textAlign:'right', color: r.venda - r.cmv > 0 ? 'var(--green)' : 'var(--red)'}}>{_fmtPct((r.venda - r.cmv)/r.venda)}</td>
                  <td style={{textAlign:'right', color:'var(--mute)'}}>{_fmtNum(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Top 12 Categorias</h2></div>
          <table className="t" style={{ width: '100%' }}>
            <thead><tr><th>Categoria</th><th style={{textAlign:'right'}}>Venda</th><th style={{textAlign:'right'}}>Margem</th><th style={{textAlign:'right'}}>N° Vendas</th></tr></thead>
            <tbody>
              {D.hier_cat.map((r, i) => (
                <tr key={i}>
                  <td>{r.k}</td>
                  <td style={{textAlign:'right', fontFamily:'var(--font-mono)'}}>{_fmtBRLk(r.venda)}</td>
                  <td style={{textAlign:'right', color: r.venda - r.cmv > 0 ? 'var(--green)' : 'var(--red)'}}>{_fmtPct((r.venda - r.cmv)/r.venda)}</td>
                  <td style={{textAlign:'right', color:'var(--mute)'}}>{_fmtNum(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* === Bottom Bars === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>Geografia, Pagamento e Logística</h3>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Top 15 UF</h2></div>
          <AstroBarH items={D.top_uf.map(x => ({ label: x.uf, v: x.v }))} color="cyan" />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Forma de Pagamento</h2></div>
          <AstroBarH items={D.top_pgto.map(x => ({ label: x.pgto, v: x.v }))} color="green" />
        </div>
        <div className="card">
          <div className="card-title-row"><h2 className="card-title">Top Transportadoras</h2></div>
          <AstroBarH items={D.top_transp.map(x => ({ label: x.t, v: x.v }))} color="violet" />
        </div>
      </div>
    </div>
  );
};

// ===== PagePlanoAcao — placeholder simples por enquanto =====
const PagePlanoAcao = () => {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);
  React.useEffect(() => {
    fetch('data/plano_acao.json').then(r => r.json()).then(setData).catch(e => setErr(String(e)));
  }, []);
  if (err) return <div className="page"><div className="empty">erro: {err}</div></div>;
  if (!data) return <div className="page"><div className="empty">carregando plano...</div></div>;
  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 18 }}><span>Astro BI</span> › <b>Plano de Ação</b></div>
      <p style={{ color: 'var(--text-2)', marginBottom: 20 }}>{data.resumo_executivo.titulo}</p>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {data.resumo_executivo.destaques.map((d, i) => (
          <div key={i} className="card kpi-mini">
            <div className="kpi-label">{d.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{d.valor}</div>
            <div className="kpi-hint">{d.fonte}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.acoes.map(a => (
          <div key={a.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--mute)' }}>{a.id}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--surface-2)', borderRadius: 4, textTransform: 'uppercase', color: 'var(--text-2)' }}>{a.severidade}</span>
              <h2 style={{ margin: 0, fontSize: 15, color: 'var(--text)' }}>#{a.prioridade} · {a.titulo}</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}><b>{a.diagnostico.headline}</b></p>
            <p style={{ fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.5 }}>{a.diagnostico.detalhe}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// Registra no escopo do bundle (PAGE_COMPS do App raiz pega via referência direta)
Object.assign(window, { PageAstroDash, PagePlanoAcao });
