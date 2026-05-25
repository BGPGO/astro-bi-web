/**
 * Adapter: Omie ERP
 *
 * Lê via API REST app.omie.com.br/api/v1.
 * Pull paginado, resumable (cache em data/_cache/), tolerante a rate limit.
 *
 * Output: data/empresa.json, categorias.json, departamentos.json, clientes.json,
 * contas_correntes.json, movimentos.json (canonical).
 *
 * Configuração mínima em bi.config.js:
 *   fontes: {
 *     adapters: ["omie"],
 *     omie: {
 *       app_key_env: "OMIE_APP_KEY",
 *       app_secret_env: "OMIE_APP_SECRET",
 *       bancos_ok: ["033", "748", "756"],   // opcional — filtra movimentos
 *     }
 *   }
 *
 * Variáveis env: OMIE_APP_KEY, OMIE_APP_SECRET (lidas via .env)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://app.omie.com.br/api/v1';
const PAGE_SIZE = 500;
const PAGE_DELAY_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  id: 'omie',
  label: 'Omie ERP',
  required_env: ['OMIE_APP_KEY', 'OMIE_APP_SECRET'],

  validate(config) {
    const errors = [];
    for (const v of this.required_env) {
      if (!process.env[v]) errors.push(`env ${v} não definido`);
    }
    if (!config.fontes || !config.fontes.omie) {
      errors.push('config.fontes.omie não definido');
    }
    return { ok: errors.length === 0, errors };
  },

  async pull(config, dataDir) {
    const APP_KEY = process.env.OMIE_APP_KEY;
    const APP_SECRET = process.env.OMIE_APP_SECRET;
    fs.mkdirSync(dataDir, { recursive: true });

    async function call(p, method, params, retries = 8) {
      const body = JSON.stringify({ call: method, app_key: APP_KEY, app_secret: APP_SECRET, param: [params] });
      let res;
      try {
        res = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      } catch (netErr) {
        if (retries > 0) {
          await sleep(Math.min(30000, 2000 * (9 - retries)));
          return call(p, method, params, retries - 1);
        }
        throw netErr;
      }
      let j;
      try { j = await res.json(); }
      catch (e) {
        if (retries > 0) { await sleep(2000); return call(p, method, params, retries - 1); }
        throw new Error(`${method}: bad JSON (${res.status})`);
      }
      if (j.faultstring) {
        const transient = /Consumo|consumo|excedido|simultaneas|simult|Many|busy|Broken response|Application Server|BG|temporariamente|gateway|timeout|503|502|504|SOAP-ERROR/i.test(j.faultstring);
        if (transient && retries > 0) {
          await sleep(Math.min(30000, 2000 * (9 - retries)));
          return call(p, method, params, retries - 1);
        }
        throw new Error(`${method}: ${j.faultstring}`);
      }
      return j;
    }

    async function fetchAllPaginated(apiPath, method, baseParam, dataKey, label, opts) {
      const cacheDir = path.join(dataDir, '_cache', label);
      fs.mkdirSync(cacheDir, { recursive: true });
      const pageFile = (n) => path.join(cacheDir, `page-${String(n).padStart(5, '0')}.json`);
      const readCachedPage = (n) => {
        try { return JSON.parse(fs.readFileSync(pageFile(n), 'utf8')); } catch { return null; }
      };
      const writePage = (n, arr) => fs.writeFileSync(pageFile(n), JSON.stringify(arr));
      const style = (opts && opts.style) || 'snake';
      const buildParams = (page, size) => style === 'camel'
        ? { ...baseParam, nPagina: page, nRegPorPagina: size }
        : { ...baseParam, pagina: page, registros_por_pagina: size };
      const readMeta = (resp) => style === 'camel'
        ? { total: resp.nTotRegistros, pages: resp.nTotPaginas }
        : { total: resp.total_de_registros, pages: resp.total_de_paginas };

      const first = await call(apiPath, method, buildParams(1, PAGE_SIZE));
      const meta = readMeta(first);
      const totalPages = meta.pages || 1;
      writePage(1, first[dataKey] || []);
      console.log(`  [${label}] ${meta.total || 0} registros em ${totalPages} paginas`);

      let failed = 0;
      for (let p = 2; p <= totalPages; p++) {
        let arr = readCachedPage(p);
        if (!arr) {
          await sleep(PAGE_DELAY_MS);
          try {
            const r = await call(apiPath, method, buildParams(p, PAGE_SIZE));
            arr = r[dataKey] || [];
            writePage(p, arr);
          } catch (e) {
            failed++;
            console.error(`\n  [${label}] pag ${p} FAIL: ${e.message.slice(0, 80)}`);
            if (failed > 50) break;
            continue;
          }
        }
        if (p % 10 === 0 || p === totalPages) process.stdout.write(`  [${label}] pag ${p}/${totalPages}\r`);
      }

      const all = [];
      for (let p = 1; p <= totalPages; p++) {
        all.push(...(readCachedPage(p) || []));
      }
      console.log(`  [${label}] OK ${all.length} registros                              `);
      return all;
    }

    console.log('=== Omie pull ===');
    const empresas = await call('/geral/empresas/', 'ListarEmpresas', { pagina: 1, registros_por_pagina: 50, apenas_importado_api: 'N' });
    const empresa = empresas.empresas_cadastro?.[0] || null;
    fs.writeFileSync(path.join(dataDir, 'empresa.json'), JSON.stringify(empresa, null, 2));

    const [categoriasRaw, departamentosRaw] = await Promise.all([
      fetchAllPaginated('/geral/categorias/', 'ListarCategorias', {}, 'categoria_cadastro', 'categorias'),
      fetchAllPaginated('/geral/depart/', 'ListarDepartamentos', {}, 'departamentos', 'departamentos'),
    ]);
    fs.writeFileSync(path.join(dataDir, 'categorias.json'), JSON.stringify(categoriasRaw, null, 2));
    fs.writeFileSync(path.join(dataDir, 'departamentos.json'), JSON.stringify(departamentosRaw, null, 2));

    const clientes = await fetchAllPaginated('/geral/clientes/', 'ListarClientes', {}, 'clientes_cadastro', 'clientes');
    fs.writeFileSync(path.join(dataDir, 'clientes.json'), JSON.stringify(clientes, null, 2));

    const contasCorrentes = await fetchAllPaginated(
      '/geral/contacorrente/', 'ListarContasCorrentes', {}, 'ListarContasCorrentes', 'contas_correntes'
    ).catch(() => []);
    fs.writeFileSync(path.join(dataDir, 'contas_correntes.json'), JSON.stringify(contasCorrentes, null, 2));

    // Movimentos financeiros (fonte canonica)
    let movimentosOmie = [];
    try {
      movimentosOmie = await fetchAllPaginated(
        '/financas/mf/', 'ListarMovimentos', { cExibirDepartamentos: 'S' }, 'movimentos', 'movimentos', { style: 'camel' }
      );
    } catch (e) {
      console.error('  movs erro:', e.message);
    }

    // Mapas pra resolver IDs
    const catMap = new Map(categoriasRaw.map(c => [c.codigo, c.descricao]));
    const deptMap = new Map(departamentosRaw.map(d => [d.codigo, d.descricao]));
    const cliMap = new Map(clientes.map(c => [c.codigo_cliente_omie, c.nome_fantasia || c.razao_social]));
    const ccMap = new Map(contasCorrentes.map(cc => [cc.nCodCC, { nome: cc.cDesc, banco: cc.cCodCC || '', codigo_banco: (cc.cCodBanco || '').padStart(3, '0') }]));

    // Normaliza pra schema canonical
    const movimentosCanonical = [];
    for (const m of movimentosOmie) {
      const det = m.detalhes || {};
      const res = m.resumo || {};
      const dept = (m.departamentos && m.departamentos[0]) || {};
      const status = (det.cStatus || '').toUpperCase();
      const realizado = status === 'PAGO' || status === 'RECEBIDO';
      const cc = ccMap.get(det.nCodCC) || {};
      const dt = (s) => s ? s.split('/').reverse().join('-') : null; // dd/mm/aaaa → yyyy-mm-dd
      movimentosCanonical.push({
        id: String(det.nCodTitulo || m.nCodTitulo || ''),
        fonte: 'omie',
        natureza: det.cNatureza === 'R' ? 'R' : 'P',
        status: status,
        realizado,
        data_emissao: dt(det.dDtEmissao),
        data_vencimento: dt(det.dDtVenc),
        data_pagamento: dt(det.dDtPagamento),
        valor_total: Number(det.nValorTitulo || res.nValPago || 0),
        valor_pago: Number(res.nValPago || 0),
        valor_aberto: Number(res.nValAberto || 0),
        categoria: catMap.get(det.cCodCategoria) || det.cCodCategoria || '',
        centro_custo: deptMap.get(dept.cCodDepartamento) || '',
        cliente: cliMap.get(det.nCodCliente) || '',
        conta_corrente: cc.nome || '',
        codigo_banco: cc.codigo_banco || '',
        observacao: det.cObs || '',
        tags: [],
      });
    }

    fs.writeFileSync(path.join(dataDir, 'movimentos.json'), JSON.stringify(movimentosCanonical, null, 2));
    fs.writeFileSync(path.join(dataDir, '_summary.json'), JSON.stringify({
      adapter: 'omie',
      timestamp: new Date().toISOString(),
      empresa: empresa?.nome_fantasia || null,
      records: movimentosCanonical.length,
      counts: {
        movimentos: movimentosCanonical.length,
        categorias: categoriasRaw.length,
        departamentos: departamentosRaw.length,
        clientes: clientes.length,
        contas_correntes: contasCorrentes.length,
      },
    }, null, 2));

    console.log(`\n=== Omie OK: ${movimentosCanonical.length} movimentos canonical ===`);
    return { fetched: movimentosCanonical.length, summary: { adapter: 'omie', records: movimentosCanonical.length } };
  },
};
