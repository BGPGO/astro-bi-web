#!/usr/bin/env node
/**
 * Pre-compila JSX → JS minificado em UM unico bundle.
 * Antes: 3 .jsx files transformados em runtime pelo Babel-standalone (~5MB CDN
 * + parse + transform a cada page load → muito lento).
 * Agora: 1 app.bundle.js minificado (~50-100KB), zero runtime.
 *
 * Os .jsx originais usam variaveis globais cross-file (Icon, DATE_RANGES,
 * Sidebar, etc) — nao sao modulos. Estrategia: concatena ordem importa
 * (components.jsx → pages-1.jsx → pages-2.jsx → app.jsx do index.html)
 * e roda esbuild --transform pra resolver tudo em escopo unico.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = __dirname;
const SOURCES = [
  'components.jsx',
  'pages-1.jsx',
  'pages-2.jsx',
  'pages-3.jsx',
  'pages-4.jsx',
  'upsell-pages.jsx',
  'pages-astro.jsx',
  // Telas Astro migradas do Streamlit (vêm DEPOIS de pages-astro pra reusar Astro* + _fmt*).
  // Ordem importa: pages-abc.jsx redefine PageCurvaABC (sobrescrevendo a fin40 de pages-3.jsx).
  'pages-giro.jsx',
  'pages-frete.jsx',
  'pages-pedmin.jsx',
  'pages-recompra.jsx',
  'pages-campanhas.jsx',
  'pages-agressividade.jsx',
  'pages-abc.jsx',
  'pages-tendcomp.jsx',
  'pages-composicaovenda.jsx',
  'pages-tendprod.jsx',
  'pages-tendtemp.jsx',
  'pages-tendmarcas.jsx',
  'pages-cohort.jsx',
  'pages-compvendatotal.jsx',
  'pages-analisevendas.jsx',
  'pages-dashfatur.jsx',
  'pages-campest.jsx',
  'pages-vendasdiautil.jsx',
  'pages-cfv.jsx',
  'pages-geral.jsx',
];

// Lê bi.config.js (se existir) pra injetar BI_PAGE_MODE
let pageModes = {};
try {
  const cfg = require(path.join(ROOT, 'bi.config.js'));
  const flat = (obj) => {
    const out = {};
    for (const k of Object.keys(obj || {})) out[k] = obj[k];
    return out;
  };
  pageModes = { ...flat(cfg.pages?.geral), ...flat(cfg.pages?.outros) };
} catch (e) {
  // Sem config — todas as pages ativas (default)
}
const PAGE_MODE_INJECT = `\n// Injetado por build-jsx.cjs a partir de bi.config.js > pages\nwindow.BI_PAGE_MODE = ${JSON.stringify(pageModes)};\n`;

(async () => {
  // Cada .jsx redeclara `const { useState } = React;` no topo (era pra Babel-
  // standalone funcionar com escopo isolado por <script>). Concatenado vira
  // duplicate declaration. Strip e re-injeta uma vez no inicio do bundle.
  const HOIST_HEADER = `\nvar { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect, Fragment } = React;\n`;
  const stripReactHooks = (src) => src.replace(/^\s*const\s*\{[^}]*\}\s*=\s*React\s*;?\s*$/gm, '');

  const concat = HOIST_HEADER + SOURCES.map((f) => {
    const body = stripReactHooks(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    return `\n/* ===== ${f} ===== */\n${body}`;
  }).join('\n');

  // O App.jsx original esta inline no index.html. Movemos pra ca pra ficar
  // bundlado tambem. SE o operador editar index.html, manter a IIFE de boot.
  const APP_BODY = `
/* ===== App (raiz) ===== */
(function () {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var PAGE_LABELS = {
    overview: '01 Visão geral',
    indicators: '02 Indicadores',
    receita: '03 Receita',
    despesa: '04 Despesa',
    fluxo: '05 Fluxo de caixa',
    tesouraria: '06 Tesouraria',
    comparativo: '07 Comparativo',
    relatorio: '08 Relatório IA',
    faturamento_produto: '09 Faturamento por Produto',
    curva_abc: '10 Curva ABC',
    marketing: '11 Marketing ADS',
    valuation: '12 Valuation',
    hierarquia: '13 Hierarquia ADS',
    detalhado: '14 Detalhado',
    profunda_cliente: '15 Profunda Cliente',
    crm: '16 CRM',
    astro_dash: 'Astro · Dash',
    astro_dashfatur: 'Astro · Dash Faturamento',
    plano_acao: 'Astro · Plano de Ação',
    astro_giro: 'Astro · Giro Estoque',
    astro_frete: 'Astro · Frete RJ',
    astro_pedmin: 'Astro · Pedido Mínimo',
    astro_recompra: 'Astro · Recompra',
    astro_campanhas: 'Astro · Campanhas Ads',
    astro_agressividade: 'Astro · Agressividade',
    astro_abc: 'Astro · Curva ABC',
    pbi_tend_composicao: 'Astro · Tendência Composição',
    pbi_composicao_vendas: 'Astro · Composição de Venda',
    pbi_tend_produtos: 'Astro · Tendência Produtos',
    pbi_tend_marcas: 'Astro · Tendências Marcas',
    pbi_tend_temporais: 'Astro · Tendência Temporal',
    pbi_composicao_total: 'Astro · Composição de Venda (Total)',
    pbi_coorte: 'Astro · Cohort (Valor + Vendas)',
    pbi_analise_vendas: 'Astro · Análise de Vendas',
    pbi_campest: 'Astro · Campanha × Estado',
    pbi_vendas_dia_util: 'Astro · Vendas / Dia Útil',
    pbi_cfv: 'Astro · CFV (Custo Financeiro Venda)',
    pbi_geral: 'Astro · Visão Comercial Geral',
  };
  function App() {
    var p = useState('astro_dash'); var page = p[0], setPage = p[1];
    var f = useState(Object.assign({}, DEFAULT_FILTERS)); var filters = f[0], setFilters = f[1];
    var fo = useState(false); var filtersOpen = fo[0], setFiltersOpen = fo[1];
    var so = useState(false); var sidebarOpen = so[0], setSidebarOpen = so[1];
    var sf = useState(function () {
      try { return localStorage.getItem('bi.statusFilter') || 'realizado'; } catch (e) { return 'realizado'; }
    });
    var statusFilter = sf[0], setStatusFilter = sf[1];
    // Drilldown global: setado quando o usuario clica numa barra/linha de grafico.
    var dd = useState(null);
    var drilldown = dd[0], setDrilldown = dd[1];
    // Year selector: padrao = ano corrente (window.REF_YEAR)
    var ys = useState(function () {
      try { var y = parseInt(localStorage.getItem('bi.year'), 10); return y > 1900 ? y : (window.REF_YEAR || new Date().getFullYear()); } catch (e) { return window.REF_YEAR || new Date().getFullYear(); }
    });
    var year = ys[0], setYear = ys[1];
    var ms = useState(function () {
      try { var m = parseInt(localStorage.getItem('bi.month'), 10); return (m >= 0 && m <= 12) ? m : 0; } catch (e) { return 0; }
    });
    var month = ms[0], setMonth = ms[1];

    // BI export multi-tela: array de page-ids ou null. Quando setado, renderiza
    // todas as telas em sequencia + chama window.print() depois do layout pintar.
    var pp = useState(null); var printPages = pp[0], setPrintPages = pp[1];
    useEffect(function () {
      window.startBiExport = function (pages) {
        document.body.classList.add('bi-print-mode');
        setPrintPages(pages);
      };
      return function () { window.startBiExport = null; };
    }, []);
    useEffect(function () {
      if (!printPages) return;
      var cancelled = false;
      var waitReady = function () {
        // 1) fonts
        var fontsP = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
        // 2) imagens (todas as <img> do bi-print-root tem que ter terminado)
        var imgsP = new Promise(function (resolve) {
          var imgs = Array.prototype.slice.call(document.querySelectorAll('.bi-print-root img'));
          var pending = imgs.filter(function (i) { return !i.complete; });
          if (pending.length === 0) return resolve();
          var done = 0;
          pending.forEach(function (i) {
            var fin = function () { done++; if (done >= pending.length) resolve(); };
            i.addEventListener('load', fin, { once: true });
            i.addEventListener('error', fin, { once: true });
          });
          // safety net
          setTimeout(resolve, 5000);
        });
        // 3) PageRelatorio: se foi incluído no export, esperar até ele renderizar conteudo
        //    (carrega async via fetch). Damos até 30s, polling a cada 200ms.
        var hasRelatorio = printPages.indexOf('relatorio') !== -1;
        var relatorioP = !hasRelatorio ? Promise.resolve() : new Promise(function (resolve) {
          var deadline = Date.now() + 30000;
          var poll = function () {
            if (cancelled) return resolve();
            // Sinal: PageRelatorio renderizou .report-cover OU mensagem de erro/help
            var rendered = document.querySelector('.bi-print-root .report-cover')
              || document.querySelector('.bi-print-root .report');
            if (rendered) return resolve();
            if (Date.now() > deadline) return resolve();
            setTimeout(poll, 200);
          };
          poll();
        });
        Promise.all([fontsP, imgsP, relatorioP]).then(function () {
          if (cancelled) return;
          // 2 frames pra garantir reflow final + 400ms pra layout estabilizar
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              setTimeout(function () {
                if (cancelled) return;
                window.print();
                setTimeout(function () {
                  document.body.classList.remove('bi-print-mode');
                  setPrintPages(null);
                }, 800);
              }, 400);
            });
          });
        });
      };
      waitReady();
      return function () { cancelled = true; };
    }, [printPages]);

    useEffect(function () {
      try { localStorage.setItem('bi.statusFilter', statusFilter); } catch (e) {}
      if (typeof window._makeBit === 'function') {
        window.BIT = window._makeBit(statusFilter);
      }
      setDrilldown(null);
    }, [statusFilter]);

    useEffect(function () {
      try { localStorage.setItem('bi.year', String(year)); } catch (e) {}
      setDrilldown(null);
    }, [year]);

    useEffect(function () {
      try { localStorage.setItem('bi.month', String(month)); } catch (e) {}
      setDrilldown(null);
    }, [month]);

    var handleSetPage = function (newPage) {
      setPage(newPage);
      setSidebarOpen(false);
      setDrilldown(null);
    };

    var PAGE_COMPS = {
      overview: PageOverview,
      indicators: PageIndicators,
      receita: PageReceita,
      despesa: PageDespesa,
      fluxo: PageFluxo,
      tesouraria: PageTesouraria,
      comparativo: PageComparativo,
      relatorio: PageRelatorio,
      faturamento_produto: PageFaturamentoProduto,
      curva_abc: PageCurvaABC,
      marketing: PageMarketing,
      valuation: PageValuation,
      hierarquia: PageHierarquia,
      detalhado: PageDetalhado,
      profunda_cliente: PageProfundaCliente,
      crm: PageCRM,
      astro_dash: typeof PageAstroDash !== 'undefined' ? PageAstroDash : null,
      astro_dashfatur: typeof PageDashFaturamento !== 'undefined' ? PageDashFaturamento : null,
      plano_acao: typeof PagePlanoAcao !== 'undefined' ? PagePlanoAcao : null,
      astro_giro: typeof PageGiroEstoque !== 'undefined' ? PageGiroEstoque : null,
      astro_frete: typeof PageFreteRJ !== 'undefined' ? PageFreteRJ : null,
      astro_pedmin: typeof PagePedidoMinimo !== 'undefined' ? PagePedidoMinimo : null,
      astro_recompra: typeof PageRecompra !== 'undefined' ? PageRecompra : null,
      astro_campanhas: typeof PageCampanhasAds !== 'undefined' ? PageCampanhasAds : null,
      astro_agressividade: typeof PageAgressividade !== 'undefined' ? PageAgressividade : null,
      astro_abc: typeof PageCurvaABCAstro !== 'undefined' ? PageCurvaABCAstro : null,
      pbi_tend_composicao: typeof PageTendenciaComposicao !== 'undefined' ? PageTendenciaComposicao : null,
      pbi_composicao_vendas: typeof PageComposicaoVenda !== 'undefined' ? PageComposicaoVenda : null,
      pbi_tend_produtos: typeof PageTendenciaProdutos !== 'undefined' ? PageTendenciaProdutos : null,
      pbi_tend_marcas: typeof PageTendenciaMarcas !== 'undefined' ? PageTendenciaMarcas : null,
      pbi_tend_temporais: typeof PageTendenciaTemporal !== 'undefined' ? PageTendenciaTemporal : null,
      pbi_composicao_total: typeof PageComposicaoVendaTotal !== 'undefined' ? PageComposicaoVendaTotal : null,
      pbi_coorte: typeof PageCohort !== 'undefined' ? PageCohort : null,
      pbi_analise_vendas: typeof PageAnaliseVendas !== 'undefined' ? PageAnaliseVendas : null,
      pbi_campest: typeof PageCampanhaEstado !== 'undefined' ? PageCampanhaEstado : null,
      pbi_vendas_dia_util: typeof PageVendasDiaUtil !== 'undefined' ? PageVendasDiaUtil : null,
      pbi_cfv: typeof PageCFV !== 'undefined' ? PageCFV : null,
      pbi_geral: typeof PageGeralComercial !== 'undefined' ? PageGeralComercial : null,
    };
    // Modo da page atual: 'active' (default), 'upsell' (mostra UpsellPage), 'hidden' (não renderiza)
    var pageMode = (window.BI_PAGE_MODE && window.BI_PAGE_MODE[page]) || 'active';
    var PageComp = (pageMode === 'upsell' && window.UpsellPage)
      ? function (props) { return React.createElement(window.UpsellPage, { pageId: page }); }
      : PAGE_COMPS[page];

    var commonProps = {
      filters: filters,
      setFilters: setFilters,
      onOpenFilters: function () { setFiltersOpen(true); },
      statusFilter: statusFilter,
      year: year,
      setYear: setYear,
      month: month,
      setMonth: setMonth,
      drilldown: drilldown,
      setDrilldown: setDrilldown,
    };

    // Modo print multi-tela: renderiza todas as paginas selecionadas em sequencia
    if (printPages && printPages.length > 0) {
      return (
        <div className="app bi-print-root">
          {printPages.map(function (id, i) {
            var Comp = PAGE_COMPS[id];
            if (!Comp) return null;
            return (
              <div key={id + '-' + i} className="bi-print-page">
                <div className="bi-print-header">
                  <img src="assets/bgp-logo-white.png" alt="BGP" className="bi-print-logo" />
                  <div className="bi-print-title">
                    <div className="bi-print-pagenum">{PAGE_LABELS[id] || id}</div>
                    <div className="bi-print-brand">BI Financeiro</div>
                  </div>
                </div>
                <Comp {...commonProps} />
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className={'app ' + (sidebarOpen ? 'sidebar-open' : '')} data-screen-label={PAGE_LABELS[page]}>
        <Sidebar active={page} onSelect={handleSetPage} open={sidebarOpen} />
        <div className="sidebar-backdrop" onClick={function () { setSidebarOpen(false); }} />
        <div className="main">
          <Header
            page={page}
            onToggleSidebar={function () { setSidebarOpen(function (o) { return !o; }); }}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            year={year}
            setYear={setYear}
            month={month}
            setMonth={setMonth}
          />
          <PageComp {...commonProps} />
        </div>
        <FiltersDrawer open={filtersOpen} onClose={function () { setFiltersOpen(false); }} filters={filters} setFilters={setFilters} />
      </div>
    );
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
`;

  const finalSource = PAGE_MODE_INJECT + concat + '\n' + APP_BODY;

  const result = await esbuild.transform(finalSource, {
    loader: 'jsx',
    jsx: 'transform',
    minify: true,
    target: ['es2017'],
  });

  const out = path.join(ROOT, 'app.bundle.js');
  fs.writeFileSync(out, result.code);
  const sizeKB = (result.code.length / 1024).toFixed(1);
  console.log(`OK app.bundle.js (${sizeKB} KB) — concat de ${SOURCES.length} .jsx + App raiz`);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
