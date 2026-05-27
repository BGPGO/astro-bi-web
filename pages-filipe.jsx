/**
 * pages-filipe.jsx — "Tela Filipe": análise de clientes (RFM + churn por CICLO).
 *
 * Churn relativo ao ritmo de cada cliente (inter-purchase time): overdue_ratio =
 * recência ÷ intervalo típico do cliente. Status: Novo / No ritmo / Esfriando /
 * Para retomar / Churned. RFM coerente (R deriva do ciclo).
 *
 * Cards clicáveis → filtram a lista de clientes. Listas rápidas: Para retomar,
 * Esfriando, Churned. Cliente × Produto e Sazonalidade no fim.
 *
 * Dados: window.FILIPE_DATA (scripts/build_filipe_data.py). Helpers globais
 * (pages-astro.jsx): _fmtBRL, _fmtBRLk, _fmtNum, _fmtPct, AstroBarH.
 */

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
// Ciclo: dias → "~Xd" ou "~X meses"
const _ciclo = (d) => {
  if (!d) return '—';
  if (d >= 60) return `~${(d / 30).toFixed(d >= 300 ? 0 : 1).replace('.', ',')} meses`;
  return `~${Math.round(d)}d`;
};
const _atraso = (r) => (r == null ? '—' : `${r.toFixed(1).replace('.', ',')}×`);

const STATUS_COR = {
  'Novo': '#3b82f6', 'No ritmo': '#10b981', 'Esfriando': '#f59e0b',
  'Para retomar': '#fb923c', 'Churned': '#ef4444',
};
const STATUS_ORDEM = ['Novo', 'No ritmo', 'Esfriando', 'Para retomar', 'Churned'];
const SEG_COR = {
  'Campeões': '#10b981', 'Leais': '#22d3ee', 'Novos / Promissores': '#3b82f6',
  'Esfriando': '#f59e0b', 'Em Risco (retomar)': '#fb923c',
  'Perdido (era frequente)': '#ec4899', 'Perdido': '#ef4444',
};
const _corAtraso = (r) => (r == null ? 'var(--mute)' : r <= 1.3 ? 'var(--green)' : r <= 2 ? 'var(--amber)' : r <= 3.5 ? '#fb923c' : 'var(--red)');

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

  const mesPorCli = React.useMemo(() => {
    const m = {};
    for (const r of (D.cliente_mes || [])) (m[r.k] || (m[r.k] = {}))[r.am] = r;
    return m;
  }, [D.cliente_mes]);
  const prodPorCli = React.useMemo(() => {
    const m = {};
    for (const r of (D.cliente_produto || [])) (m[r.k] || (m[r.k] = [])).push(r);
    return m;
  }, [D.cliente_produto]);
  const cliMeta = React.useMemo(() => {
    const m = {}; for (const c of clientes) m[c.cpf_cnpj] = c; return m;
  }, [clientes]);

  // Filtro ativo (clicar num card) + cliente selecionado (drill de produto)
  const [filtro, setFiltro] = React.useState({ tipo: 'status', val: 'Para retomar' });
  const [cliSel, setCliSel] = React.useState(null);

  const lista = React.useMemo(() => {
    let arr = clientes;
    if (filtro.tipo === 'status') arr = arr.filter((c) => c.status_ciclo === filtro.val);
    else if (filtro.tipo === 'segmento') arr = arr.filter((c) => c.segmento === filtro.val);
    return arr.slice().sort((a, b) => b.monetary - a.monetary);
  }, [clientes, filtro]);

  const cliAtivo = cliSel || (lista[0] && lista[0].cpf_cnpj) || (clientes[0] && clientes[0].cpf_cnpj);
  const metaCli = cliMeta[cliAtivo] || {};
  const prodCli = (prodPorCli[cliAtivo] || []).slice().sort((a, b) => b.receita - a.receita);

  // ===== Ranking comparativo (2 períodos) =====
  const n = meses.length;
  const [pa, setPa] = React.useState({ de: meses[Math.max(0, n - 3)], ate: meses[n - 1] });
  const [pb, setPb] = React.useState({ de: meses[Math.max(0, n - 6)], ate: meses[Math.max(0, n - 4)] });
  const somaPeriodo = React.useCallback((k, p) => {
    const reg = mesPorCli[k]; if (!reg) return 0;
    let s = 0; for (const am of meses) if (am >= p.de && am <= p.ate && reg[am]) s += reg[am].receita;
    return s;
  }, [mesPorCli, meses]);
  const ranking = React.useMemo(() => {
    const rows = clientes.map((c) => {
      const a = somaPeriodo(c.cpf_cnpj, pa), b = somaPeriodo(c.cpf_cnpj, pb);
      const delta = a - b; let status = 'Estável';
      if (b === 0 && a > 0) status = 'Novo no período';
      else if (a === 0 && b > 0) status = 'Sumiu';
      else if (b > 0 && delta / b > 0.1) status = 'Cresceu';
      else if (b > 0 && delta / b < -0.1) status = 'Caiu';
      return { ...c, recA: a, recB: b, delta, growth: b > 0 ? delta / b : null, mov: status };
    }).filter((r) => r.recA > 0 || r.recB > 0);
    rows.sort((x, y) => y.recA - x.recA);
    return rows;
  }, [clientes, somaPeriodo, pa, pb]);

  // ===== Sazonalidade heatmap =====
  const heatClientes = clientes.slice(0, 20);
  const heatMeses = meses.slice(-18);
  const heatMax = React.useMemo(() => {
    let mx = 0; for (const c of heatClientes) for (const am of heatMeses) {
      const v = mesPorCli[c.cpf_cnpj] && mesPorCli[c.cpf_cnpj][am] ? mesPorCli[c.cpf_cnpj][am].receita : 0;
      if (v > mx) mx = v;
    } return mx;
  }, [heatClientes, heatMeses, mesPorCli]);

  const MesSelect = ({ value, onChange }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 6px' }}>
      {meses.map((m) => <option key={m} value={m}>{_mesLabel(m)}</option>)}
    </select>
  );

  const th = { textAlign: 'left', padding: '7px 8px', color: 'var(--mute)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, position: 'sticky', top: 0, background: 'var(--surface)' };
  const thR = { ...th, textAlign: 'right' };
  const tdN = { padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 };
  const isFiltro = (t, v) => filtro.tipo === t && filtro.val === v;

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span><span style={{ color: 'var(--mute)' }}>›</span>
        <b>Tela Filipe · Clientes (RFM + Churn por ciclo)</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
          {_fmtNum(meta.n_clientes)} clientes · base até {meta.max_data}
        </span>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--mute)', maxWidth: 1040, lineHeight: 1.5 }}>
        Churn medido pelo <b>ritmo de cada cliente</b> (inter-purchase time): <b>atraso = recência ÷ intervalo típico</b> do
        cliente. Quem compra a cada 6 meses e parou há 7 está no ritmo (1,2×); a cada mês e sumiu há 3 está churned (3×).
        Clique num card pra ver a lista. RFM coerente com o ciclo (mesmos clientes).
      </p>

      {/* ===== CARDS DE STATUS (clicáveis) ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 8 }}>
        {STATUS_ORDEM.map((st) => {
          const s = (D.lifecycle_resumo || []).find((x) => x.status === st) || { n_clientes: 0, receita: 0, pct_clientes: 0, pct_receita: 0, ciclo_med: 0 };
          const on = isFiltro('status', st);
          return (
            <button key={st} onClick={() => { setFiltro({ tipo: 'status', val: st }); setCliSel(null); }}
              className="card" style={{
                padding: 12, textAlign: 'left', cursor: 'pointer', borderTop: `3px solid ${STATUS_COR[st]}`,
                outline: on ? `2px solid ${STATUS_COR[st]}` : 'none', background: on ? 'rgba(255,255,255,0.04)' : undefined,
              }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: STATUS_COR[st] }}>{st}</div>
              <div style={{ fontSize: 19, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{_fmtNum(s.n_clientes)}</div>
              <div style={{ fontSize: 10.5, color: 'var(--mute)' }}>{_fmtPct(s.pct_clientes)} · {_fmtBRLk(s.receita)} ({_fmtPct(s.pct_receita)})</div>
            </button>
          );
        })}
      </div>
      {/* Atalhos das 3 listas pedidas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--mute)', alignSelf: 'center' }}>Listas de ação:</span>
        {[['Para retomar', '⚡ Clientes para retomar'], ['Esfriando', '❄️ Clientes esfriando'], ['Churned', '💀 Clientes churned']].map(([st, lbl]) => (
          <button key={st} onClick={() => { setFiltro({ tipo: 'status', val: st }); setCliSel(null); }}
            style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', fontWeight: 600,
              border: `1px solid ${STATUS_COR[st]}`,
              background: isFiltro('status', st) ? STATUS_COR[st] : 'transparent',
              color: isFiltro('status', st) ? '#0a0e14' : STATUS_COR[st],
            }}>{lbl}</button>
        ))}
      </div>

      {/* ===== LISTA FILTRADA DE CLIENTES ===== */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '4px 0 8px' }}>
        Clientes · <span style={{ color: filtro.tipo === 'status' ? STATUS_COR[filtro.val] : (SEG_COR[filtro.val] || 'var(--cyan)') }}>{filtro.val}</span>
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--mute)', marginLeft: 8 }}>({_fmtNum(lista.length)} no Top {_fmtNum(meta.n_clientes_top)} · ordenado por receita)</span>
      </h2>
      <div className="card" style={{ marginBottom: 18, padding: 0 }}>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>
              <th style={th}>Cliente</th><th style={th}>Segmento</th>
              <th style={thR}>Compra a cada</th><th style={thR}>Sem comprar</th><th style={thR}>Atraso</th>
              <th style={thR}>Pedidos</th><th style={thR}>Receita total</th>
            </tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--mute)' }}>nenhum cliente neste filtro (dentro do Top {_fmtNum(meta.n_clientes_top)})</td></tr>}
              {lista.slice(0, 100).map((c) => (
                <tr key={c.cpf_cnpj} onClick={() => setCliSel(c.cpf_cnpj)}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: cliAtivo === c.cpf_cnpj ? 'rgba(34,211,238,0.08)' : 'transparent' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{c.nome}<span style={{ color: 'var(--mute-2)', fontSize: 10, marginLeft: 6 }}>{c.tipo} · {c.cidade}/{c.uf}</span></td>
                  <td style={{ padding: '6px 8px', color: SEG_COR[c.segmento] || 'var(--mute)', fontSize: 11 }}>{c.segmento}</td>
                  <td style={tdN}>{_ciclo(c.ciclo_tipico)}</td>
                  <td style={tdN}>{c.recency}d</td>
                  <td style={{ ...tdN, color: _corAtraso(c.overdue_ratio), fontWeight: 700 }}>{_atraso(c.overdue_ratio)}</td>
                  <td style={tdN}>{c.frequency}</td>
                  <td style={{ ...tdN, color: 'var(--amber)' }}>{_fmtBRL(c.monetary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== RFM (cards clicáveis, coerentes) ===== */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '18px 0 10px', borderBottom: '2px solid rgba(34,211,238,0.3)', paddingBottom: 6 }}>
        RFM · Segmentação (coerente com o ciclo) <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--mute)' }}>· clique pra filtrar a lista acima</span>
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 6 }}>
        {(D.rfm_resumo || []).map((s) => {
          const on = isFiltro('segmento', s.segmento);
          return (
            <button key={s.segmento} onClick={() => { setFiltro({ tipo: 'segmento', val: s.segmento }); setCliSel(null); }}
              className="card" style={{ padding: 11, textAlign: 'left', cursor: 'pointer', borderLeft: `3px solid ${SEG_COR[s.segmento] || 'var(--cyan)'}`, outline: on ? `2px solid ${SEG_COR[s.segmento]}` : 'none' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: SEG_COR[s.segmento] || 'var(--text)' }}>{s.segmento}</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{_fmtNum(s.n_clientes)}</div>
              <div style={{ fontSize: 10, color: 'var(--mute)' }}>{_fmtPct(s.pct_clientes)} · {_fmtBRLk(s.receita)} ({_fmtPct(s.pct_receita)})</div>
            </button>
          );
        })}
      </div>

      {/* ===== RANKING COMPARATIVO ===== */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '22px 0 10px', borderBottom: '2px solid rgba(16,185,129,0.3)', paddingBottom: 6 }}>
        Ranking de Clientes · Comparativo de 2 Períodos
      </h2>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)' }}>Período A:</span>
          <MesSelect value={pa.de} onChange={(v) => setPa((p) => ({ ...p, de: v }))} /><span style={{ color: 'var(--mute)' }}>→</span><MesSelect value={pa.ate} onChange={(v) => setPa((p) => ({ ...p, ate: v }))} /></div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--violet)' }}>Período B:</span>
          <MesSelect value={pb.de} onChange={(v) => setPb((p) => ({ ...p, de: v }))} /><span style={{ color: 'var(--mute)' }}>→</span><MesSelect value={pb.ate} onChange={(v) => setPb((p) => ({ ...p, ate: v }))} /></div>
        <span style={{ fontSize: 11, color: 'var(--mute)', marginLeft: 'auto' }}>clique num cliente pra ver produtos</span>
      </div>
      <div className="card" style={{ marginBottom: 8, padding: 0 }}>
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>
              <th style={th}>#</th><th style={th}>Cliente</th><th style={th}>Status</th>
              <th style={thR}>Receita A</th><th style={thR}>Receita B</th><th style={thR}>Δ R$</th><th style={thR}>Δ %</th><th style={th}>Movimento</th>
            </tr></thead>
            <tbody>
              {ranking.slice(0, 60).map((r, i) => (
                <tr key={r.cpf_cnpj} onClick={() => setCliSel(r.cpf_cnpj)}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: cliAtivo === r.cpf_cnpj ? 'rgba(34,211,238,0.08)' : 'transparent' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{r.nome}<span style={{ color: 'var(--mute-2)', fontSize: 10, marginLeft: 6 }}>{r.cidade}/{r.uf}</span></td>
                  <td style={{ padding: '6px 8px', color: STATUS_COR[r.status_ciclo], fontSize: 11 }}>{r.status_ciclo}</td>
                  <td style={tdN}>{_fmtBRLk(r.recA)}</td>
                  <td style={{ ...tdN, color: 'var(--mute)' }}>{_fmtBRLk(r.recB)}</td>
                  <td style={{ ...tdN, color: r.delta >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.delta >= 0 ? '+' : ''}{_fmtBRLk(r.delta)}</td>
                  <td style={{ ...tdN, color: r.growth == null ? 'var(--mute-2)' : r.growth >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.growth == null ? '—' : _fmtPct(r.growth)}</td>
                  <td style={{ padding: '6px 8px', fontSize: 11, color: r.mov === 'Cresceu' || r.mov === 'Novo no período' ? 'var(--green)' : (r.mov === 'Caiu' || r.mov === 'Sumiu') ? 'var(--red)' : 'var(--mute)' }}>{r.mov}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== CLIENTE × PRODUTO ===== */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '22px 0 10px', borderBottom: '2px solid rgba(59,130,246,0.3)', paddingBottom: 6 }}>
        Cliente × Produto · {metaCli.nome || '—'}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14, marginBottom: 8 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 8 }}>Perfil do cliente selecionado</div>
          {metaCli.cpf_cnpj ? (
            <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
              <div><b>{metaCli.nome}</b></div>
              <div style={{ color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{_fmtCpf(metaCli.cpf_cnpj)} · {metaCli.tipo} · {metaCli.cidade}/{metaCli.uf}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span>Status: <b style={{ color: STATUS_COR[metaCli.status_ciclo] }}>{metaCli.status_ciclo}</b></span>
                <span>Segmento: <b style={{ color: SEG_COR[metaCli.segmento] }}>{metaCli.segmento}</b></span>
              </div>
              <div style={{ marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>
                <span>compra a cada <b>{_ciclo(metaCli.ciclo_tipico)}</b></span>
                <span>parado há <b>{metaCli.recency}d</b></span>
                <span style={{ color: _corAtraso(metaCli.overdue_ratio) }}>atraso <b>{_atraso(metaCli.overdue_ratio)}</b></span>
                <span>{metaCli.frequency} pedidos · {_fmtBRL(metaCli.monetary)} · ticket {_fmtBRL(metaCli.ticket_medio)}</span>
                <span>1ª {metaCli.primeira_compra} · últ {metaCli.ultima_compra}</span>
              </div>
            </div>
          ) : <div className="empty" style={{ color: 'var(--mute)' }}>selecione um cliente</div>}
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 8 }}>Top produtos do cliente</div>
          {prodCli.length ? (
            <AstroBarH items={prodCli.slice(0, 10).map((p) => ({ label: p.produto, v: p.receita }))} color="blue" fmt={_fmtBRLk} />
          ) : <div className="empty" style={{ color: 'var(--mute)', fontSize: 11 }}>sem detalhe de produto (cliente fora do Top {_fmtNum(600)})</div>}
        </div>
      </div>

      {/* ===== SAZONALIDADE ===== */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '22px 0 10px', borderBottom: '2px solid rgba(167,139,250,0.3)', paddingBottom: 6 }}>
        Sazonalidade · Top 20 Clientes × Mês (receita)
      </h2>
      <div className="card" style={{ padding: 12, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr>
            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--mute)', position: 'sticky', left: 0, background: 'var(--surface)' }}>Cliente</th>
            {heatMeses.map((am) => <th key={am} style={{ padding: '4px 3px', color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 9, minWidth: 34 }}>{_mesLabel(am)}</th>)}
          </tr></thead>
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
        Cliente = CPF/CNPJ. Churn por ciclo (IPT): atraso = recência ÷ intervalo típico do cliente (mediana dos gaps; quem tem 1 pedido usa
        a mediana global {Math.round(meta.ciclo_global_mediano)}d). Faixas: No ritmo ≤{meta.thresholds.ritmo}× · Esfriando ≤{meta.thresholds.esfriando}× ·
        Para retomar ≤{meta.thresholds.retomar}× · Churned &gt; {meta.thresholds.retomar}×. Literatura: inter-purchase time / BG-NBD.
        Fonte vendas Tiny via <code>build_filipe_data.py</code>.
      </div>
    </div>
  );
};

Object.assign(window, { PageFilipe });
