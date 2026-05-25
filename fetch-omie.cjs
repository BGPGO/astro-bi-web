#!/usr/bin/env node
/**
 * Pull completo Omie. Lê credenciais do .env (OMIE_APP_KEY / OMIE_APP_SECRET).
 * Saida: ./data/*.json
 *
 * Estrategia:
 *  - Paginado, 500 reg/pagina, 5 paginas em paralelo (rate limit ~30 req/s da Omie)
 *  - Backoff exp em rate-limit (425 / "consumo excedido")
 *  - Resolve cliente/fornecedor + categoria + depto IN MEMORY (mapas)
 *  - Status preservado (PAGO / A VENCER / ATRASADO / VENCE HOJE / CANCELADO)
 */
'use strict';

const fs = require('node:fs');
const path_mod = require('node:path');
const path = path_mod;

// Carrega .env do repo
try { require('dotenv').config({ path: path_mod.join(__dirname, '.env') }); } catch (e) {}
const APP_KEY = process.env.OMIE_APP_KEY;
const APP_SECRET = process.env.OMIE_APP_SECRET;
if (!APP_KEY || !APP_SECRET) {
  console.error('ERRO: defina OMIE_APP_KEY e OMIE_APP_SECRET em .env');
  process.exit(1);
}
const BASE = 'https://app.omie.com.br/api/v1';
const OUT = path_mod.join(__dirname, 'data');
const PAGE_SIZE = 500;
// Omie restringe chamadas paralelas DO MESMO metodo (1 por vez).
// Paginacao dentro de um metodo SEMPRE sequencial. Paralelismo eh entre
// metodos diferentes (ex: ListarCategorias + ListarDepartamentos + ListarClientes
// simultaneos, mas cada um internamente sequencial).
const PAGE_DELAY_MS = 200; // pausa entre paginas do mesmo metodo

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(p, method, params, retries = 8) {
  const body = JSON.stringify({ call: method, app_key: APP_KEY, app_secret: APP_SECRET, param: [params] });
  let res;
  try {
    res = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  } catch (netErr) {
    if (retries > 0) {
      const wait = Math.min(30000, 2000 * (9 - retries));
      console.error(`  [network] ${method} → ${netErr.message} → wait ${wait}ms (retries left ${retries - 1})`);
      await sleep(wait);
      return call(p, method, params, retries - 1);
    }
    throw netErr;
  }
  let j;
  try {
    j = await res.json();
  } catch (e) {
    if (retries > 0) {
      await sleep(2000);
      return call(p, method, params, retries - 1);
    }
    throw new Error(`${method}: bad JSON (${res.status})`);
  }
  if (j.faultstring) {
    // Erros transitorios: rate-limit, broken response, gateway timeout etc.
    const transient = /Consumo|consumo|excedido|simultaneas|simult|Many|busy|Broken response|Application Server|BG|temporariamente|gateway|timeout|503|502|504|SOAP-ERROR/i.test(j.faultstring);
    if (transient && retries > 0) {
      const wait = Math.min(30000, 2000 * (9 - retries));
      console.error(`  [retry] ${method} pag ${params.pagina || params.nPagina || '?'} → ${j.faultstring.slice(0,60)} → wait ${wait}ms (left ${retries - 1})`);
      await sleep(wait);
      return call(p, method, params, retries - 1);
    }
    throw new Error(`${method}: ${j.faultstring}`);
  }
  return j;
}

async function fetchAllPaginated(path, method, baseParam, dataKey, label, opts) {
  // Cache por pagina em disco — script eh REENTRANTE.
  const cacheDir = path_mod.join(OUT, '_cache', label);
  fs.mkdirSync(cacheDir, { recursive: true });

  const pageFile = (n) => path_mod.join(cacheDir, `page-${String(n).padStart(5, '0')}.json`);
  const readCachedPage = (n) => {
    try {
      const buf = fs.readFileSync(pageFile(n), 'utf8');
      const arr = JSON.parse(buf);
      return Array.isArray(arr) ? arr : null;
    } catch { return null; }
  };
  const writePage = (n, arr) => fs.writeFileSync(pageFile(n), JSON.stringify(arr));

  // Estilo de pagination — alguns endpoints usam pagina/total_de_paginas (snake),
  // outros usam nPagina/nTotPaginas (camelCase numerico). Detecta via opts.style.
  const style = (opts && opts.style) || 'snake';
  const buildParams = (page, size) => style === 'camel'
    ? { ...baseParam, nPagina: page, nRegPorPagina: size }
    : { ...baseParam, pagina: page, registros_por_pagina: size };
  const readMeta = (resp) => style === 'camel'
    ? { total: resp.nTotRegistros, pages: resp.nTotPaginas }
    : { total: resp.total_de_registros, pages: resp.total_de_paginas };

  const first = await call(path, method, buildParams(1, PAGE_SIZE));
  const meta = readMeta(first);
  const totalPages = meta.pages || 1;
  const totalRegs = meta.total || (first[dataKey] || []).length;
  writePage(1, first[dataKey] || []);
  console.log(`  [${label}] ${totalRegs} registros em ${totalPages} paginas`);

  let failed = 0;
  for (let p = 2; p <= totalPages; p++) {
    let arr = readCachedPage(p);
    if (!arr) {
      await sleep(PAGE_DELAY_MS);
      try {
        const r = await call(path, method, buildParams(p, PAGE_SIZE));
        arr = r[dataKey] || [];
        writePage(p, arr);
      } catch (e) {
        failed++;
        console.error(`\n  [${label}] pag ${p} FAIL: ${e.message.slice(0, 80)} — pulando, segue`);
        if (failed > 50) {
          console.error(`  [${label}] ABORT: >50 falhas seguidas, parando esse metodo`);
          break;
        }
        continue;
      }
    }
    if (p % 10 === 0 || p === totalPages) process.stdout.write(`  [${label}] pag ${p}/${totalPages}\r`);
  }

  const all = [];
  for (let p = 1; p <= totalPages; p++) {
    const arr = readCachedPage(p) || [];
    all.push(...arr);
  }
  console.log(`  [${label}] OK ${all.length} registros                                          `);
  return all;
}

(async () => {
  console.log('=== Probe / empresa ===');
  const empresas = await call('/geral/empresas/', 'ListarEmpresas', { pagina: 1, registros_por_pagina: 50, apenas_importado_api: 'N' });
  console.log('  Empresa:', empresas.empresas_cadastro?.[0]?.nome_fantasia, '|', empresas.empresas_cadastro?.[0]?.codigo_cliente_omie);
  fs.writeFileSync(path.join(OUT, 'empresa.json'), JSON.stringify(empresas.empresas_cadastro?.[0] || null, null, 2));

  // === Lookup tables (categorias, depts, clientes/fornecedores) ===
  console.log('\n=== Lookup tables (paralelo) ===');
  const [categorias, departamentos] = await Promise.all([
    fetchAllPaginated('/geral/categorias/', 'ListarCategorias', {}, 'categoria_cadastro', 'categorias'),
    fetchAllPaginated('/geral/depart/', 'ListarDepartamentos', {}, 'departamentos', 'departamentos'),
  ]);
  fs.writeFileSync(path.join(OUT, 'categorias.json'), JSON.stringify(categorias, null, 2));
  fs.writeFileSync(path.join(OUT, 'departamentos.json'), JSON.stringify(departamentos, null, 2));

  console.log('\n=== Clientes/Fornecedores ===');
  const clientes = await fetchAllPaginated('/geral/clientes/', 'ListarClientes', {}, 'clientes_cadastro', 'clientes');
  fs.writeFileSync(path.join(OUT, 'clientes.json'), JSON.stringify(clientes, null, 2));

  console.log('\n=== Contas Correntes (bancos) ===');
  const contasCorrentes = await fetchAllPaginated('/geral/contacorrente/', 'ListarContasCorrentes', {}, 'ListarContasCorrentes', 'contas_correntes').catch((e) => { console.error('  cc erro:', e.message); return []; });
  fs.writeFileSync(path.join(OUT, 'contas_correntes.json'), JSON.stringify(contasCorrentes, null, 2));

  // === Movimentos: contas pagar e receber em paralelo (cada um paginado internamente) ===
  console.log('\n=== Contas pagar + receber (em paralelo) ===');
  const [contasPagar, contasReceber] = await Promise.all([
    fetchAllPaginated('/financas/contapagar/', 'ListarContasPagar', { apenas_importado_api: 'N' }, 'conta_pagar_cadastro', 'contas_pagar'),
    fetchAllPaginated('/financas/contareceber/', 'ListarContasReceber', { apenas_importado_api: 'N' }, 'conta_receber_cadastro', 'contas_receber'),
  ]);
  fs.writeFileSync(path.join(OUT, 'contas_pagar.json'), JSON.stringify(contasPagar, null, 2));
  fs.writeFileSync(path.join(OUT, 'contas_receber.json'), JSON.stringify(contasReceber, null, 2));

  // === Movimentos financeiros (ListarMovimentos — fonte canonica do PBI) ===
  // Schema oficial usado pelo Power BI: { detalhes: {dDtPagamento, cNatureza, cStatus, cGrupo, ...}, resumo: {nValPago, nValLiquido, ...}, departamentos: [...] }
  // Param exato copiado do M code do PBI do cliente.
  console.log('\n=== Movimentos financeiros (ListarMovimentos) ===');
  let movimentos = [];
  try {
    movimentos = await fetchAllPaginated('/financas/mf/', 'ListarMovimentos', {
      cExibirDepartamentos: 'S',
    }, 'movimentos', 'movimentos', { style: 'camel' }).catch((e) => { console.error('  movs erro:', e.message); return []; });
    fs.writeFileSync(path.join(OUT, 'movimentos.json'), JSON.stringify(movimentos, null, 2));
  } catch (e) {
    console.error('  movs falhou:', e.message);
  }

  // === Resumo ===
  const summary = {
    fetched_at: new Date().toISOString(),
    empresa: empresas.empresas_cadastro?.[0]?.nome_fantasia || null,
    counts: {
      contas_pagar: contasPagar.length,
      contas_receber: contasReceber.length,
      categorias: categorias.length,
      departamentos: departamentos.length,
      clientes_fornecedores: clientes.length,
      movimentos: movimentos.length,
    },
  };
  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== DONE ===');
  console.log(JSON.stringify(summary, null, 2));
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
