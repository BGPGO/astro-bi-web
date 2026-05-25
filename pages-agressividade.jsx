/**
 * pages-agressividade.jsx — tela "Agressividade de Budget" portada do
 * Streamlit pages/6_Agressividade.py (astro-giro-bi).
 *
 * Tese: aumentos bruscos de verba travam o Google Ads e derrubam performance.
 * Mostra % aumento de budget dia-a-dia × ROAS resultante + correlacao por UF.
 *
 * Dados: window.AGR_DATA (gerado por scripts/build_agressividade_data.py
 * a partir de vendas_tiny_bu.parquet + astro_ads.xlsx).
 *
 * Reusa helpers globais (_fmtBRL, _fmtBRLk, _fmtNum, _fmtPct, AstroLine) de
 * pages-astro.jsx — eles vivem em escopo global apos o bundle.
 */

// ===== Mini chart: bar horizontal pra correlacao (range -1..+1, vermelho/verde) =====
const AgrCorrBar = ({ items }) => {
  if (!items || !items.length) return <div className="empty">sem dados</div>;
  const max = 1; // correlacao max
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it, i) => {
        const r = it.correlacao_aumento_x_roas;
        const widthPct = (Math.abs(r) / max) * 100;
        const isNeg = r < 0;
        const isStrong = Math.abs(r) > 0.15;
        const color = isNeg
          ? (isStrong ? 'var(--red)' : 'rgba(239,83,80,0.5)')
          : (isStrong ? 'var(--green)' : 'rgba(102,187,106,0.5)');
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 50px', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{it.uf}</span>
            <div style={{ position: 'relative', height: 18, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', left: '50%', top: 0, height: '100%',
                width: `${widthPct/2}%`,
                background: color,
                transform: isNeg ? 'translateX(-100%)' : 'translateX(0)',
              }} />
              <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.2)' }} />
            </div>
            <span style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 11 }}>
              {r.toFixed(3)}
            </span>
            <span style={{ color: 'var(--mute)', fontSize: 11, textAlign: 'right' }}>n={it.sample_size}</span>
          </div>
        );
      })}
    </div>
  );
};

// ===== Mini chart: duplo line (budget + ROAS lado-a-lado, eixos independentes) =====
const AgrDualLine = ({ data }) => {
  if (!data || !data.length) return <div className="empty">sem dados</div>;
  const budget = data.map(d => d.budget);
  const roas = data.map(d => d.roas);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 4 }}>
          Budget diário · max {_fmtBRLk(Math.max(...budget))}
        </div>
        <AstroLine values={budget} color="var(--amber)" height={180} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 4 }}>
          ROAS (receita/gasto) · max {Math.max(...roas).toFixed(1)}x · min {Math.min(...roas).toFixed(1)}x
        </div>
        <AstroLine values={roas} color="var(--cyan)" height={180} />
      </div>
    </div>
  );
};

// ===== PageAgressividade =====
const PageAgressividade = () => {
  const D = window.AGR_DATA;
  if (!D) {
    return (
      <div className="page">
        <div className="empty" style={{ padding: 60, textAlign: 'center', color: 'var(--mute)' }}>
          agressividade-data.js nao carregado. Rode: <code>python scripts/build_agressividade_data.py</code>
        </div>
      </div>
    );
  }

  const k = D.kpis;
  const rec = D.recomendacao_taxa_maxima;
  const degradacao = k.roas_degradacao_pct;
  const cor_degradacao = degradacao < -10 ? 'var(--red)' : (degradacao < 0 ? 'var(--amber)' : 'var(--green)');

  return (
    <div className="page" style={{ padding: '20px 28px 40px' }}>
      <div className="breadcrumb" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Astro BI</span>
        <span style={{ color: 'var(--mute)' }}>›</span>
        <b>Agressividade</b>
      </div>

      {/* === Hero === */}
      <div className="card" style={{ marginBottom: 20, padding: '20px 24px', background: 'linear-gradient(135deg, rgba(239,83,80,0.08), rgba(249,168,37,0.06))', borderLeft: '3px solid var(--red)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
          Aumentos bruscos travam o Google Ads?
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--text-2)', fontSize: 13 }}>
          Quando o budget sobe demais de um dia pro outro, o algoritmo do Google
          nao consegue otimizar e o ROAS cai. Medimos a variacao diaria do gasto
          vs ROAS resultante desde {k.periodo_de} ({k.n_dias_observados} dias úteis observados,
          sem sábado/domingo, sem outliers).
        </p>
      </div>

      {/* === 3 KPIs principais === */}
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 22 }}>
        <div className="kpi-tile amber">
          <div className="kpi-label">Taxa média de aumento</div>
          <div className="kpi-value">{(k.delta_pct_medio >= 0 ? '+' : '') + k.delta_pct_medio.toFixed(1)}%</div>
          <div className="kpi-hint">
            mediana {(k.delta_pct_mediano >= 0 ? '+' : '') + k.delta_pct_mediano.toFixed(1)}% · {k.n_dias_agressivos} dia(s) com aumento &gt;50%
          </div>
        </div>
        <div className="kpi-tile" style={{ borderLeft: `3px solid ${cor_degradacao}` }}>
          <div className="kpi-label">ROAS em dias agressivos</div>
          <div className="kpi-value">{k.roas_em_dias_agressivos.toFixed(2)}x</div>
          <div className="kpi-hint" style={{ color: cor_degradacao }}>
            vs {k.roas_em_dias_normais.toFixed(2)}x normal · {(degradacao >= 0 ? '+' : '') + degradacao.toFixed(1)}%
          </div>
        </div>
        <div className="kpi-tile green">
          <div className="kpi-label">Recomendação</div>
          <div className="kpi-value">
            {rec.limite_pct_sugerido != null ? `+${rec.limite_pct_sugerido}%` : 'n/d'}
          </div>
          <div className="kpi-hint">aumento máx. dia-a-dia · ROAS baseline {rec.roas_baseline.toFixed(2)}x</div>
        </div>
      </div>

      {/* === Serie diaria budget x ROAS === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Série diária · Budget vs ROAS (últimos 90 dias úteis)
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row" style={{ marginBottom: 12 }}>
          <h2 className="card-title">Budget × ROAS por dia</h2>
          <span style={{ fontSize: 11, color: 'var(--mute)' }}>
            {D.serie_diaria_budget_vs_roas.length} dias plotados
          </span>
        </div>
        <AgrDualLine data={D.serie_diaria_budget_vs_roas} />
      </div>

      {/* === Recomendacao: faixas === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        ROAS por faixa de agressividade
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Faixa</th>
              <th style={{textAlign:'right'}}>N dias</th>
              <th style={{textAlign:'right'}}>ROAS médio</th>
              <th style={{textAlign:'right'}}>vs baseline</th>
            </tr>
          </thead>
          <tbody>
            {rec.faixas.map((f, i) => {
              const vs = f.vs_baseline_pct;
              const cor = vs == null ? 'var(--mute)' : (vs < -5 ? 'var(--red)' : (vs > 5 ? 'var(--green)' : 'var(--text-2)'));
              return (
                <tr key={i}>
                  <td>{f.faixa}</td>
                  <td style={{textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--mute)'}}>{f.n}</td>
                  <td style={{textAlign:'right', fontFamily:'var(--font-mono)'}}>{f.roas_medio != null ? f.roas_medio.toFixed(2) + 'x' : '—'}</td>
                  <td style={{textAlign:'right', fontFamily:'var(--font-mono)', color: cor}}>
                    {vs != null ? (vs >= 0 ? '+' : '') + vs.toFixed(1) + '%' : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === Top 20 eventos === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Top 20 dias com maior aumento de budget
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <table className="t" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Dia</th>
              <th style={{textAlign:'right'}}>Spend anterior</th>
              <th style={{textAlign:'right'}}>Spend</th>
              <th style={{textAlign:'right'}}>Δ %</th>
              <th style={{textAlign:'right'}}>Receita</th>
              <th style={{textAlign:'right'}}>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {D.eventos_agressividade.map((e, i) => (
              <tr key={i}>
                <td style={{ fontFamily:'var(--font-mono)', fontSize: 11 }}>{e.dia}</td>
                <td style={{textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--mute)'}}>
                  {e.spend_anterior != null ? _fmtBRLk(e.spend_anterior) : '—'}
                </td>
                <td style={{textAlign:'right', fontFamily:'var(--font-mono)'}}>{_fmtBRLk(e.spend)}</td>
                <td style={{textAlign:'right', fontFamily:'var(--font-mono)', color: e.delta_pct > 50 ? 'var(--red)' : 'var(--amber)'}}>
                  +{e.delta_pct.toFixed(1)}%
                </td>
                <td style={{textAlign:'right', fontFamily:'var(--font-mono)'}}>{_fmtBRLk(e.receita)}</td>
                <td style={{textAlign:'right', fontFamily:'var(--font-mono)', color: e.roas < 5 ? 'var(--red)' : (e.roas > 8 ? 'var(--green)' : 'var(--text-2)')}}>
                  {e.roas.toFixed(2)}x
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* === Correlacao por estado === */}
      <h3 className="section-title" style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 12px' }}>
        Correlação Aumento × ROAS por estado (top 15 por gasto)
      </h3>
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-title-row" style={{ marginBottom: 12 }}>
          <h2 className="card-title">Pearson r — quanto mais negativo, mais o estado "trava" com aumentos bruscos</h2>
        </div>
        <AgrCorrBar items={D.correlacao_estado} />
        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--mute)' }}>
          <span style={{ color: 'var(--red)' }}>■</span> r &lt; -0.15 (trava) ·{' '}
          <span style={{ color: 'var(--green)' }}>■</span> r &gt; 0.15 (saudável) ·{' '}
          cinza = sem efeito significativo
        </div>
      </div>

      {/* === Recomendacao texto === */}
      <div className="card" style={{ background: 'rgba(249,168,37,0.06)', borderLeft: '3px solid var(--amber)', padding: '16px 20px' }}>
        <h4 style={{ margin: 0, color: 'var(--amber)', fontSize: 14 }}>Recomendação operacional</h4>
        <p style={{ margin: '6px 0 0', color: 'var(--text-2)', fontSize: 13 }}>{rec.racional}</p>
        <p style={{ margin: '6px 0 0', color: 'var(--mute)', fontSize: 11 }}>
          Fonte: {D.meta.fonte} · campanha desde {D.meta.campaign_start} ·
          fim-de-semana excluído · outliers (spend &lt; μ-3σ) removidos.
        </p>
      </div>
    </div>
  );
};

Object.assign(window, { PageAgressividade });
