/**
 * pages-filipe.jsx — "Tela Filipe": análise de clientes (RFM, churn, recompra).
 *
 * Pedido do Filipe: entender clientes com padrão de recompra, sazonalidade e
 * produtos. Seções:
 *   1. Ranking comparativo de clientes em DOIS períodos escolhidos pelo usuário.
 *   2. RFM (Recência / Frequência / Monetary) — segmentação.
 *   3. Churn (e-commerce) — Ativo / Em risco / Churned + lista de win-back.
 *   4. Cliente × Produto — o que cada cliente compra (drill ao clicar no cliente).
 *   5. Sazonalidade — heatmap Cliente × Mês.
 *
 * Dados: window.FILIPE_DATA (scripts/build_filipe_data.py — fonte vendas_tiny_bu
 * com CPF/CNPJ). Chave de cliente = CPF/CNPJ. Helpers globais (pages-astro.jsx):
 * _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct, AstroBarH.
 */

// ===== Helpers locais =====
const _fmtCpf = (s) => {
  if (!s) return '—';
  const d = String(s).replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return s;
};
const _mesLabel = (am) => {
  if (!am || am.length < 7) return am || '';
  const N = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${N[parseInt(am.slice(5, 7), 10) - 1] || am.slice(5, 7)}/${am.slice(2, 4)}`;
};

const SEG_COR = {
  'Campeões': '#10b981',
  'Leais': '#22d3ee',
  'Novos / Promissores': '#3b82f6',
  'Precisam Atenção': '#facc15',
  'Em Risco (alto valor)': '#f59e0b',
  'Hibernando': '#a78bfa',
  'Perdidos': '#ef4444',
};
const CHURN_COR = { 'Ativo': '#10b981', 'Em risco': '#f59e0b', 'Churned': '#ef4444' };

// Heatmap compacto Cliente × Mês (sazonalidade)
const _heatCor = (v, vMax) => {
  if (!v || v <= 0) return 'rgba(255,255,255,0.03)';
  const t = Math.max(0, Math.min(1, v / Math.max(1, vMax)));
  return `rgba(34, 211, 238, ${0.12 + 0.8 * t})`;
};

const PageFilipe = () => {
  const D = window.FILIPE_DATA;
  if (!D) {
    return (
      <div className="page" style={{ padding: '20px 28px 40px' }}>
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          filipe-data.js não carregado. Rode: <code>python scripts/build_filipe_data.py</code>
        </div>
      </div>
    );
  }

  const meta = D.meta;
  const meses = meta.meses || [];
  const clientes = D.clientes || [];

  // Índices
  const cliMeta = React.useMemo(() => {
    const m = {};
    for (const c of clientes) m[c.cpf_cnpj] = c;
    return m;
  }, [clientes]);

  const mesPorCli = React.useMemo(() => {
    const m = {};
    for (const r of (D.cliente_mes || [])) {
      (m[r.k] || (m[r.k] = {}))[r.am] = r;
    }
    return m;
  }, [D.cliente_mes]);

  const prodPorCli = React.useMemo(() => {
    const m = {};
    for (const r of (D.cliente_produto || [])) (m[r.k] || (m[r.k] = [])).push(r);
    return m;
  }, [D.cliente_produto]);

  // ===== Seção 1: Ranking comparativo (dois períodos escolhidos) =====
  const n = meses.length;
  const [pa, setPa] = React.useState({ de: meses[Math.max(0, n - 3)], ate: meses[n - 1] });
  const [pb, setPb] = React.useState({ de: meses[Math.max(0, n - 6)], ate: meses[Math.max(0, n - 4)] });

  const somaPeriodo = React.useCallback((k, p) => {
    const reg = mesPorCli[k];
    if (!reg) return 0;
    let s = 0;
    for (const am of meses) {
      if (am >= p.de && am <= p.ate && reg[am]) s += reg[am].receita;
    }
    return s;
  }, [mesPorCli, meses]);

  const ranking = React.useMemo(() => {
    const rows = clientes.map((c) => {
      const a = somaPeriodo(c.cpf_cnpj, pa);
      const b = somaPeriodo(c.cpf_cnpj, pb);
      const delta = a - b;
      let status = 'Estável';
      if (b === 0 && a > 0) status = 'Novo no período';
      else if (a === 0 && b > 0) status = 'Sumiu';
      else if (b > 0 && delta / b > 0.1) status = 'Cresceu';
      else if (b > 0 && delta / b < -0.1) status = 'Caiu';
      return { ...c, recA: a, recB: b, delta, growth: b > 0 ? delta / b : null, status };
    }).filter((r) => r.recA > 0 || r.recB > 0);
    rows.sort((x, y) => y.recA - x.recA);
    return rows;
  }, [clientes, somaPeriodo, pa, pb]);

  const [cliSel, setCliSel] = React.useState(null);
  const cliAtivo = cliSel || (ranking[0] && ranking[0].cpf_cnpj) || (clientes[0] && clientes[0].cpf_cnpj);

  const MesSelect = ({ value, onChange }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 6px' }}>
      {meses.map((m) => <option key={m} value={m}>{_mesLabel(m)}</option>)}
    </select>
  );

  // ===== Seção 5: Sazonalidade heatmap (top 20 por monetary) =====
  const heatClientes = clientes.slice(0, 20);
  const heatMeses = meses.slice(-18);
  const heatMax = React.useMemo(() => {
    let mx = 0;
    for (const c of heatClientes) for (const am of heatMeses) {
      const v = mesPorCli[c.cpf_cnpj] && mesPorCli[c.cpf_cnpj][am] ? mesPorCli[c.cpf_cnpj][am].receita : 0;
      if (v > mx) mx = v;
    }
    return mx;
  }, [heatClientes, heatMeses, mesPorCli]);

  const prodCli = (prodPorCli[cliAtivo] || []).slice().sort((a, b) => b.receita - a.receita);
  const metaCliAtivo = cliMeta[cliAtivo] || {};

  const th = { textAlign: 'left', padding: '7px 8px', color: 'var(--mute)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, position: 'sticky', top: 0, background: 'var(--surface)' };
  const thR = { ...th, textAlign: 'right' };
  const tdN = { padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 };

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Tela Filipe · Análise de Clientes</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          {_fmtNum(meta.n_clientes)} clientes · base até {meta.max_data}
        </span>
      </div>

      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--mute)', maxWidth: 1000, lineHeight: 1.5 }}>
        Cliente identificado por <b>CPF/CNPJ</b>. RFM por quintis (1–5). Churn pelo padrão de recompra
        (mediana <b>{Math.round(meta.mediana_recompra_dias)}d</b>): Ativo &lt; {meta.churn_ativo_d}d ·
        Em risco {meta.churn_ativo_d}–{meta.churn_churn_d}d · Churned &gt; {meta.churn_churn_d}d.
        Ranking e sazonalidade cobrem o Top {_fmtNum(meta.n_clientes_top)} clientes por receita.
      </p>

      {/* ====================== SEÇÃO 2: RFM ====================== */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '4px 0 12px', borderBottom: '2px solid rgba(34,211,238,0.3)', paddingBottom: 6 }}>
        RFM · Segmentação de Clientes
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        {(D.rfm_resumo || []).map((s) => (
          <div key={s.segmento} className="card" style={{ padding: 12, borderTop: `3px solid ${SEG_COR[s.segmento] || 'var(--cyan)'}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: SEG_COR[s.segmento] || 'var(--text)' }}>{s.segmento}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 4 }}>{_fmtNum(s.n_clientes)}</div>
            <div style={{ fontSize: 11, color: 'var(--mute)' }}>
              {_fmtPct(s.pct_clientes)} clientes · {_fmtBRLk(s.receita)} ({_fmtPct(s.pct_receita)} receita)
            </div>
            <div style={{ fontSize: 10, color: 'var(--mute-2)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
              R~{Math.round(s.recency_med)}d · F~{s.freq_med.toFixed(1)} · {_fmtBRLk(s.monetary_med)}
            </div>
          </div>
        ))}
      </div>

      {/* ====================== SEÇÃO 3: CHURN ====================== */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 12px', borderBottom: '2px solid rgba(239,68,68,0.3)', paddingBottom: 6 }}>
        Churn · Status da Base
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        {(D.churn_resumo || []).map((s) => (
          <div key={s.status} className="card kpi-tile" style={{ borderLeft: `3px solid ${CHURN_COR[s.status]}` }}>
            <div className="kpi-label" style={{ color: CHURN_COR[s.status] }}>{s.status}</div>
            <div className="kpi-value">{_fmtNum(s.n_clientes)}</div>
            <div className="kpi-hint">{_fmtPct(s.pct_clientes)} da base · {_fmtBRLk(s.receita)} ({_fmtPct(s.pct_receita)} receita) · recência ~{Math.round(s.recency_med)}d</div>
          </div>
        ))}
      </div>
      {/* Win-back: churned de maior valor (entre top clientes) */}
      <div className="card" style={{ marginBottom: 8, padding: 0 }}>
        <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--amber)', borderBottom: '1px solid var(--border)' }}>
          Alvos de win-back · maiores clientes hoje churned ou em risco
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>
              <th style={th}>Cliente</th><th style={th}>Segmento</th><th style={th}>Status</th>
              <th style={thR}>Sem comprar</th><th style={thR}>Pedidos</th><th style={thR}>Receita total</th>
            </tr></thead>
            <tbody>
              {clientes.filter((c) => c.churn_status !== 'Ativo').slice(0, 25).map((c) => (
                <tr key={c.cpf_cnpj} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => setCliSel(c.cpf_cnpj)}>
                  <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{c.nome}<span style={{ color: 'var(--mute-2)', fontSize: 10, marginLeft: 6 }}>{c.tipo} · {c.cidade}/{c.uf}</span></td>
                  <td style={{ padding: '6px 8px', color: SEG_COR[c.segmento] || 'var(--mute)', fontSize: 11 }}>{c.segmento}</td>
                  <td style={{ padding: '6px 8px', color: CHURN_COR[c.churn_status], fontSize: 11 }}>{c.churn_status}</td>
                  <td style={tdN}>{c.recency}d</td>
                  <td style={tdN}>{c.frequency}</td>
                  <td style={{ ...tdN, color: 'var(--amber)' }}>{_fmtBRL(c.monetary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ====================== SEÇÃO 1: RANKING COMPARATIVO ====================== */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '22px 0 10px', borderBottom: '2px solid rgba(16,185,129,0.3)', paddingBottom: 6 }}>
        Ranking de Clientes · Comparativo de 2 Períodos
      </h2>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)' }}>Período A:</span>
          <MesSelect value={pa.de} onChange={(v) => setPa((p) => ({ ...p, de: v }))} /> <span style={{ color: 'var(--mute)' }}>→</span>
          <MesSelect value={pa.ate} onChange={(v) => setPa((p) => ({ ...p, ate: v }))} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet)' }}>Período B:</span>
          <MesSelect value={pb.de} onChange={(v) => setPb((p) => ({ ...p, de: v }))} /> <span style={{ color: 'var(--mute)' }}>→</span>
          <MesSelect value={pb.ate} onChange={(v) => setPb((p) => ({ ...p, ate: v }))} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--mute)', marginLeft: 'auto' }}>Δ compara A vs B · clique num cliente pra ver produtos</span>
      </div>
      <div className="card" style={{ marginBottom: 8, padding: 0 }}>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>
              <th style={th}>#</th><th style={th}>Cliente</th><th style={th}>Segmento</th>
              <th style={thR}>Receita A</th><th style={thR}>Receita B</th><th style={thR}>Δ R$</th><th style={thR}>Δ %</th><th style={th}>Movimento</th>
            </tr></thead>
            <tbody>
              {ranking.slice(0, 60).map((r, i) => (
                <tr key={r.cpf_cnpj}
                  onClick={() => setCliSel(r.cpf_cnpj)}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: cliAtivo === r.cpf_cnpj ? 'rgba(34,211,238,0.08)' : 'transparent' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{r.nome}<span style={{ color: 'var(--mute-2)', fontSize: 10, marginLeft: 6 }}>{r.cidade}/{r.uf}</span></td>
                  <td style={{ padding: '6px 8px', color: SEG_COR[r.segmento] || 'var(--mute)', fontSize: 11 }}>{r.segmento}</td>
                  <td style={tdN}>{_fmtBRLk(r.recA)}</td>
                  <td style={{ ...tdN, color: 'var(--mute)' }}>{_fmtBRLk(r.recB)}</td>
                  <td style={{ ...tdN, color: r.delta >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.delta >= 0 ? '+' : ''}{_fmtBRLk(r.delta)}</td>
                  <td style={{ ...tdN, color: r.growth == null ? 'var(--mute-2)' : r.growth >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.growth == null ? '—' : _fmtPct(r.growth)}</td>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: r.status === 'Cresceu' || r.status === 'Novo no período' ? 'var(--green)' : (r.status === 'Caiu' || r.status === 'Sumiu') ? 'var(--red)' : 'var(--mute)' }}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ====================== SEÇÃO 4: CLIENTE × PRODUTO ====================== */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '22px 0 10px', borderBottom: '2px solid rgba(59,130,246,0.3)', paddingBottom: 6 }}>
        Cliente × Produto · {metaCliAtivo.nome || '—'}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14, marginBottom: 8 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 8 }}>Perfil do cliente selecionado</div>
          {metaCliAtivo.cpf_cnpj ? (
            <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
              <div><b>{metaCliAtivo.nome}</b></div>
              <div style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{_fmtCpf(metaCliAtivo.cpf_cnpj)} · {metaCliAtivo.tipo} · {metaCliAtivo.cidade}/{metaCliAtivo.uf}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span>Segmento: <b style={{ color: SEG_COR[metaCliAtivo.segmento] }}>{metaCliAtivo.segmento}</b></span>
                <span>Status: <b style={{ color: CHURN_COR[metaCliAtivo.churn_status] }}>{metaCliAtivo.churn_status}</b></span>
              </div>
              <div style={{ marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>
                <span>R/F/M: {metaCliAtivo.r_score}/{metaCliAtivo.f_score}/{metaCliAtivo.m_score}</span>
                <span>{metaCliAtivo.frequency} pedidos</span>
                <span>{_fmtBRL(metaCliAtivo.monetary)} total</span>
                <span>ticket {_fmtBRL(metaCliAtivo.ticket_medio)}</span>
                <span>1ª: {metaCliAtivo.primeira_compra} · últ: {metaCliAtivo.ultima_compra}</span>
              </div>
            </div>
          ) : <div className="empty" style={{ color: 'var(--mute)' }}>selecione um cliente na tabela acima</div>}
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 8 }}>Top produtos do cliente</div>
          {prodCli.length ? (
            <AstroBarH items={prodCli.slice(0, 10).map((p) => ({ label: p.produto, v: p.receita }))} color="blue" fmt={_fmtBRLk} />
          ) : <div className="empty" style={{ color: 'var(--mute)', fontSize: 11 }}>sem detalhe de produto pra este cliente (fora do Top {_fmtNum(500)})</div>}
        </div>
      </div>

      {/* ====================== SEÇÃO 5: SAZONALIDADE ====================== */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '22px 0 10px', borderBottom: '2px solid rgba(167,139,250,0.3)', paddingBottom: 6 }}>
        Sazonalidade · Top 20 Clientes × Mês (receita)
      </h2>
      <div className="card" style={{ padding: 12, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--mute)', position: 'sticky', left: 0, background: 'var(--surface)' }}>Cliente</th>
              {heatMeses.map((am) => <th key={am} style={{ padding: '4px 3px', color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 9, minWidth: 34 }}>{_mesLabel(am)}</th>)}
            </tr>
          </thead>
          <tbody>
            {heatClientes.map((c) => (
              <tr key={c.cpf_cnpj} onClick={() => setCliSel(c.cpf_cnpj)} style={{ cursor: 'pointer' }}>
                <td style={{ padding: '3px 8px', color: 'var(--text-2)', position: 'sticky', left: 0, background: 'var(--surface)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.nome}>{c.nome}</td>
                {heatMeses.map((am) => {
                  const v = mesPorCli[c.cpf_cnpj] && mesPorCli[c.cpf_cnpj][am] ? mesPorCli[c.cpf_cnpj][am].receita : 0;
                  return <td key={am} title={`${c.nome} · ${_mesLabel(am)}: ${_fmtBRL(v)}`}
                    style={{ background: _heatCor(v, heatMax), height: 22, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 8, color: v > heatMax * 0.5 ? '#0a0e14' : 'var(--mute-2)' }}>
                    {v >= 1000 ? Math.round(v / 1000) + 'k' : ''}
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mute)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        Fonte: vendas Tiny (CPF/CNPJ) via <code>scripts/build_filipe_data.py</code> · gerado {(D.gerado_em || '')}. RFM por quintis;
        churn pelo padrão de recompra (mediana {Math.round(meta.mediana_recompra_dias)}d).
      </div>
    </div>
  );
};

Object.assign(window, { PageFilipe });
