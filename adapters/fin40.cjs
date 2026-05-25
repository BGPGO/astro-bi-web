/**
 * Adapter: fin40 (BGP Financeira — Supabase multi-tenant)
 *
 * Lê dados financeiros do fin40.com.br via Supabase REST + RPCs oficiais.
 * Cada cliente é um `project` com UUID próprio. Operador BGP autentica com
 * email/senha, recebe JWT, faz GET filtrado por project_id + POST nas RPCs.
 *
 * DOC CANONICAL (estado da arte, validado em SOPRA):
 *   BGPGO/sopra-bi-web/FIN40_INTEGRATION_LESSONS.md
 *
 * REGRAS CRÍTICAS (sem isso, números divergem):
 *   1. Lookup de_para por par (normalize_cat(categoria_original), tipo) — NÃO "primeira ocorrência"
 *   2. normalize_cat = unaccent + lower + collapse spaces (não simples lowercase)
 *   3. Chamar RPCs oficiais (get_fluxo_caixa_agregado + get_orcado_vs_realizado)
 *      e salvar resultados pra cascata DRE pronta
 *   4. NUNCA Math.abs(valor) — sinais embutidos identificam RET/refunds/redutores
 *   5. Categorias sem de_para hit → '⚠️ Sem Grupo' (fin40 web mostra)
 *
 * HEURÍSTICAS:
 *   - status null em 100% dos rows na maioria dos clientes → não use como filtro
 *   - conciliado=false em 100% em alguns clientes → fallback data_vencimento <= today
 *
 * Variáveis env esperadas:
 *   FIN40_SUPABASE_URL       (default https://pdyrhdmuqepuznpliehl.supabase.co)
 *   FIN40_SUPABASE_ANON      anon key fin40 (mesma pra todos os clientes)
 *   FIN40_EMAIL              operador@bertuzzipatrimonial.com.br
 *   FIN40_PASSWORD           senha do operador
 *   FIN40_PROJECT_ID         UUID do project no fin40 (único por cliente)
 *
 * Config em bi.config.js:
 *   fontes: {
 *     adapters: ["fin40"],
 *     fin40: {
 *       regime: "caixa",                  // ou "competencia"
 *       desconsiderar: true,              // pula rows com desconsiderar=true (default)
 *       data_inicio: "2026-01-01",        // janela RPC (default: 2 anos atrás)
 *       data_fim: "2026-12-31",           // (default: hoje + 1 mês)
 *       centro_custo: null,               // filtra por EMPRESA (default: todos)
 *       use_competencia: false,           // RPC switch (default false = regime caixa)
 *       cliente_label: "Nome Bonito",
 *     },
 *   }
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SUPABASE_URL_DEFAULT = 'https://pdyrhdmuqepuznpliehl.supabase.co';
const PAGE_SIZE = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Equivalente JS da função SQL normalize_cat() do fin40:
 *   SELECT lower(trim(regexp_replace(unaccent(COALESCE(val, '')), '\s+', ' ', 'g')))
 *
 * Usado pra match estável categoria_original ↔ de_para.categoria_original
 * (resistente a acentos e múltiplos espaços).
 */
function normalizeCat(val) {
  if (!val) return '';
  const noAccent = String(val).normalize('NFD').replace(/[̀-ͯ]/g, '');
  return noAccent.toLowerCase().trim().replace(/\s+/g, ' ');
}

async function login(supabaseUrl, anonKey, email, password) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`fin40 login falhou: HTTP ${res.status} ${await res.text()}`);
  const j = await res.json();
  if (!j.access_token) throw new Error(`fin40 login sem access_token: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function fetchTablePaginated(supabaseUrl, anonKey, jwt, table, projectId) {
  const all = [];
  let offset = 0;
  for (;;) {
    const url = `${supabaseUrl}/rest/v1/${table}?project_id=eq.${projectId}&offset=${offset}&limit=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${jwt}`,
      },
    });
    if (!res.ok) throw new Error(`fin40 GET ${table}: HTTP ${res.status} ${await res.text()}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(`fin40 ${table}: resposta não-array`);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await sleep(120);
  }
  return all;
}

/**
 * Chama RPC via PostgREST /rest/v1/rpc/<name>. Paginação manual via offset/limit no body.
 */
async function callRpcPaginated(supabaseUrl, anonKey, jwt, name, params) {
  const all = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}?offset=${offset}&limit=${PAGE_SIZE}`, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=none',
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`fin40 RPC ${name}: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) {
      // Algumas RPCs podem retornar único objeto — tratar como single row
      return [rows];
    }
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await sleep(80);
  }
  return all;
}

function parseCentroCusto(raw) {
  if (!raw) return '';
  if (typeof raw === 'object') return raw.EMPRESA || '';
  try { const obj = JSON.parse(raw); return obj.EMPRESA || ''; } catch { return ''; }
}

/**
 * Lookup de_para por par (normalize_cat(categoria_original), tipo).
 *
 * Mapa de duas chaves:
 *   ('<cat normalizada>', 'pagar')   → { grupo, secao, sinal }
 *   ('<cat normalizada>', 'receber') → { grupo, secao, sinal }
 *
 * NÃO "primeira ocorrência" — a mesma categoria pode ter grupos/seções
 * diferentes em CR vs CP (SOPRA: "Retenção de IR" → impostos em CP, receitas em CR).
 */
function buildDeParaIndex(dePara, gruposIndex) {
  const idx = new Map();
  for (const dp of dePara) {
    const key = `${normalizeCat(dp.categoria_original)}|${dp.tipo || ''}`;
    if (idx.has(key)) continue; // dentro do mesmo par, primeira ocorrência basta
    const grupoMeta = gruposIndex.get((dp.grupo || '').toLowerCase()) || null;
    idx.set(key, {
      grupo: dp.grupo || '⚠️ Sem Grupo',
      secao: grupoMeta?.secao || null,
      sinal: grupoMeta?.sinal || null,
      ordem: grupoMeta?.ordem || 9999,
    });
  }
  return idx;
}

function buildGruposIndex(grupos) {
  const idx = new Map();
  for (const g of grupos) {
    idx.set((g.nome || '').toLowerCase(), g);
  }
  return idx;
}

function lookupGrupo(deParaIdx, categoriaOriginal, tipo) {
  const key = `${normalizeCat(categoriaOriginal)}|${tipo}`;
  return deParaIdx.get(key) || { grupo: '⚠️ Sem Grupo', secao: null, sinal: null, ordem: 9999 };
}

/**
 * Heurística realizado:
 *   1. row.conciliado === true → PAGO
 *   2. status text não-null → usar (raro)
 *   3. data_vencimento <= today (fallback — funciona quando cliente não usa conciliado)
 */
function deriveStatus(row, today) {
  if (row.conciliado === true) return { status: 'PAGO', realizado: true };
  if (row.status && typeof row.status === 'string') {
    const s = row.status.toUpperCase();
    if (s.includes('PAGO') || s.includes('RECEB')) return { status: 'PAGO', realizado: true };
    return { status: s, realizado: false };
  }
  if (row.data_vencimento && row.data_vencimento <= today) {
    return { status: 'ATRASADO', realizado: false };
  }
  if (row.data_vencimento === today) return { status: 'VENCE HOJE', realizado: false };
  return { status: 'A VENCER', realizado: false };
}

/**
 * Mapeia row fin40 (CR ou CP) pra SHIM no formato Omie-style que o build-data.cjs
 * do template entende (detalhes.cStatus/cNatureza/cGrupo + resumo.nValPago/nValAberto).
 *
 * IMPORTANTE: mantém sinal do valor (NÃO Math.abs). RET em CR vem negativo
 * pra reduzir receita; refunds em CP vem positivo pra reduzir despesa.
 */
function toOmieShim(row, deParaIdx, today) {
  const isCR = row._tipo === 'receber';
  const { status, realizado } = deriveStatus(row, today);
  const meta = lookupGrupo(deParaIdx, row.categoria, row._tipo);

  // grupo Omie-style (CONTA_CORRENTE_REC, CONTA_A_RECEBER, etc) — pro filtro DAX do build-data
  let cGrupo;
  if (isCR) cGrupo = realizado ? 'CONTA_CORRENTE_REC' : 'CONTA_A_RECEBER';
  else cGrupo = realizado ? 'CONTA_CORRENTE_PAG' : 'CONTA_A_PAGAR';

  const cStatus = realizado ? (isCR ? 'RECEBIDO' : 'PAGO') : status;
  const cNatureza = isCR ? 'R' : 'P';

  const valor = Number(row.valor) || 0;
  const valorAbs = Math.abs(valor);

  return {
    detalhes: {
      nCodTitulo: row.id,
      cNatureza,
      cStatus,
      cGrupo,
      cCodCateg: row.categoria || '',
      nCodCliente: row.cliente || row.fornecedor || '',
      dDtVenc: row.data_vencimento ? isoToBr(row.data_vencimento) : '',
      dDtPagamento: realizado && row.data_vencimento ? isoToBr(row.data_vencimento) : '',
      dDtEmissao: row.data_competencia ? isoToBr(row.data_competencia) : '',
      cNumDocFiscal: '',
      cNumParcela: '',
      nValorTitulo: valorAbs,
      nCodCC: '',
    },
    resumo: {
      nValPago: realizado ? valorAbs : 0,
      nValAberto: realizado ? 0 : valorAbs,
      nValLiquido: valor, // PRESERVA sinal pra adapters que checarem
    },
    departamentos: [],
    // Anotações fin40-específicas que adapter-aware code pode consumir:
    _fin40: {
      tipo: row._tipo,
      categoria_original: row.categoria,
      grupo: meta.grupo,
      secao: meta.secao,
      sinal: meta.sinal,
      centro_custo: parseCentroCusto(row.centro_custo),
      valor_signed: valor, // sinal preservado
      desconsiderar: !!row.desconsiderar,
      conciliado: !!row.conciliado,
    },
  };
}

function isoToBr(iso) {
  if (!iso || iso.length < 10) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Resolve cliente nome amigável a partir do row (CR.cliente ou CP.fornecedor são livre-texto) */
function resolveClienteCadastro(rowsCR, rowsCP) {
  const set = new Set();
  for (const r of rowsCR) if (r.cliente) set.add(r.cliente);
  for (const r of rowsCP) if (r.fornecedor) set.add(r.fornecedor);
  return [...set].map((nome, i) => ({
    codigo_cliente: `fin40_${i + 1}`,
    codigo_cliente_omie: `fin40_${i + 1}`,
    nome_fantasia: nome,
    razao_social: nome,
  }));
}

function resolveCategoriasCadastro(rowsCR, rowsCP, deParaIdx) {
  const seen = new Set();
  const out = [];
  for (const r of [...rowsCR, ...rowsCP]) {
    const cat = r.categoria;
    if (!cat || seen.has(cat)) continue;
    seen.add(cat);
    const meta = lookupGrupo(deParaIdx, cat, r._tipo);
    out.push({
      codigo: cat,
      descricao: cat,
      grupo: meta.grupo,
      secao: meta.secao,
    });
  }
  return out;
}

module.exports = {
  id: 'fin40',
  label: 'fin40 (BGP Financeira)',
  required_env: ['FIN40_SUPABASE_ANON', 'FIN40_EMAIL', 'FIN40_PASSWORD', 'FIN40_PROJECT_ID'],

  validate(config) {
    const errors = [];
    for (const v of this.required_env) {
      if (!process.env[v]) errors.push(`env ${v} não definido`);
    }
    const f = config?.fontes?.fin40;
    if (!f) errors.push('bi.config.js > fontes.fin40 ausente');
    return { ok: errors.length === 0, errors };
  },

  async pull(config, dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    const supabaseUrl = process.env.FIN40_SUPABASE_URL || SUPABASE_URL_DEFAULT;
    const anon = process.env.FIN40_SUPABASE_ANON;
    const email = process.env.FIN40_EMAIL;
    const password = process.env.FIN40_PASSWORD;
    const projectId = process.env.FIN40_PROJECT_ID;
    const fcfg = config.fontes.fin40 || {};

    const today = new Date().toISOString().slice(0, 10);
    const dataInicio = fcfg.data_inicio || (() => {
      const d = new Date(); d.setFullYear(d.getFullYear() - 2); return d.toISOString().slice(0, 10);
    })();
    const dataFim = fcfg.data_fim || (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10);
    })();
    const useCompetencia = fcfg.use_competencia === true;
    const centroCustoFilter = fcfg.centro_custo || null;

    console.log(`  [fin40] login ${email}`);
    const jwt = await login(supabaseUrl, anon, email, password);

    console.log(`  [fin40] pull tabelas (project_id=${projectId.slice(0, 8)}…)`);
    const [CR, CP, dePara, grupos, saldos, orcamentos] = await Promise.all([
      fetchTablePaginated(supabaseUrl, anon, jwt, 'contas_receber', projectId),
      fetchTablePaginated(supabaseUrl, anon, jwt, 'contas_pagar', projectId),
      fetchTablePaginated(supabaseUrl, anon, jwt, 'de_para', projectId),
      fetchTablePaginated(supabaseUrl, anon, jwt, 'grupos_plano_contas', projectId),
      fetchTablePaginated(supabaseUrl, anon, jwt, 'saldos_bancarios', projectId),
      fetchTablePaginated(supabaseUrl, anon, jwt, 'orcamentos', projectId),
    ]);

    CR.forEach(r => r._tipo = 'receber');
    CP.forEach(r => r._tipo = 'pagar');

    console.log(`  [fin40] RPCs oficiais (paridade fin40 web — ${dataInicio} a ${dataFim})`);
    const [fluxoCaixaRpc, orcadoRealizadoRpc] = await Promise.all([
      callRpcPaginated(supabaseUrl, anon, jwt, 'get_fluxo_caixa_agregado', {
        p_project_id: projectId,
        p_data_inicio: dataInicio,
        p_data_fim: dataFim,
        p_use_competencia: useCompetencia,
        p_centro_custo: centroCustoFilter,
      }).catch(e => { console.warn(`    ⚠ get_fluxo_caixa_agregado falhou: ${e.message}`); return []; }),
      callRpcPaginated(supabaseUrl, anon, jwt, 'get_orcado_vs_realizado', {
        p_project_id: projectId,
        p_data_inicio: dataInicio,
        p_data_fim: dataFim,
        p_centro_custo: centroCustoFilter,
      }).catch(e => { console.warn(`    ⚠ get_orcado_vs_realizado falhou: ${e.message}`); return []; }),
    ]);

    fs.writeFileSync(path.join(dataDir, 'fluxo_caixa_rpc.json'), JSON.stringify(fluxoCaixaRpc, null, 2));
    fs.writeFileSync(path.join(dataDir, 'orcado_realizado_rpc.json'), JSON.stringify(orcadoRealizadoRpc, null, 2));

    // Filtros
    const desconsiderar = fcfg.desconsiderar !== false;
    const rowsBrutas = [...CR, ...CP];
    const rowsValidas = desconsiderar ? rowsBrutas.filter(r => !r.desconsiderar) : rowsBrutas;

    // Índices pra resolução
    const gruposIndex = buildGruposIndex(grupos);
    const deParaIdx = buildDeParaIndex(dePara, gruposIndex);

    // Emite SHIM Omie-style em movimentos.json (build-data.cjs do template consome esse shape).
    // Quando build-data.cjs for refatorado pra canonical, migrar pra schema canonical de _CONTRACT.md.
    const movimentos = rowsValidas.map(r => toOmieShim(r, deParaIdx, today));
    fs.writeFileSync(path.join(dataDir, 'movimentos.json'), JSON.stringify(movimentos, null, 2));

    // Categorias raw (com resolução de_para) + departamentos vazios + clientes derivados
    const categoriasResolved = resolveCategoriasCadastro(CR, CP, deParaIdx);
    fs.writeFileSync(path.join(dataDir, 'categorias.json'), JSON.stringify(categoriasResolved, null, 2));
    fs.writeFileSync(path.join(dataDir, 'departamentos.json'), JSON.stringify([], null, 2));
    fs.writeFileSync(path.join(dataDir, 'clientes.json'), JSON.stringify(resolveClienteCadastro(CR, CP), null, 2));

    // Empresa
    const empresa = {
      nome_fantasia: fcfg.cliente_label || 'fin40 Client',
      codigo: projectId,
      codigo_cliente_omie: projectId,
    };
    fs.writeFileSync(path.join(dataDir, 'empresa.json'), JSON.stringify(empresa, null, 2));

    // Contas correntes a partir dos bancos vistos em saldos + movimentos
    const bancosSet = new Set();
    for (const s of saldos) if (s.banco) bancosSet.add(s.banco);
    for (const r of rowsValidas) if (r.banco) bancosSet.add(r.banco);
    const contasCorrentes = [...bancosSet].map((b, i) => ({
      codigo_conta_corrente: `fin40_${i + 1}`,
      descricao: b,
      banco: b,
      saldo_inicial: 0,
    }));
    fs.writeFileSync(path.join(dataDir, 'contas_correntes.json'), JSON.stringify(contasCorrentes, null, 2));

    // Salva raw das tabelas auxiliares (build-data-extras consome pra montar cascata DRE)
    fs.writeFileSync(path.join(dataDir, 'saldos_bancarios.json'), JSON.stringify(saldos, null, 2));
    fs.writeFileSync(path.join(dataDir, 'grupos_plano_contas.json'), JSON.stringify(grupos, null, 2));
    fs.writeFileSync(path.join(dataDir, 'orcamentos.json'), JSON.stringify(orcamentos, null, 2));
    fs.writeFileSync(path.join(dataDir, 'de_para.json'), JSON.stringify(dePara, null, 2));

    const semGrupo = rowsValidas.filter(r => {
      const meta = lookupGrupo(deParaIdx, r.categoria, r._tipo);
      return meta.grupo === '⚠️ Sem Grupo';
    }).length;

    const summary = {
      adapter: this.id,
      timestamp: new Date().toISOString(),
      project_id: projectId,
      data_inicio: dataInicio,
      data_fim: dataFim,
      use_competencia: useCompetencia,
      records: movimentos.length,
      counts: {
        movimentos: movimentos.length,
        contas_pagar: CP.length,
        contas_receber: CR.length,
      },
      breakdown: {
        contas_receber: CR.length,
        contas_pagar: CP.length,
        desconsiderados: rowsBrutas.length - rowsValidas.length,
        sem_grupo: semGrupo,
        categorias: categoriasResolved.length,
        de_para: dePara.length,
        grupos: grupos.length,
        saldos: saldos.length,
        orcamentos: orcamentos.length,
        fluxo_caixa_rpc_rows: fluxoCaixaRpc.length,
        orcado_realizado_rpc_rows: orcadoRealizadoRpc.length,
      },
    };

    console.log(`  [fin40] OK: ${movimentos.length} movs (CR ${CR.length} + CP ${CP.length}, ${rowsBrutas.length - rowsValidas.length} desconsiderados, ${semGrupo} sem-grupo)`);
    if (semGrupo > 0) {
      console.log(`  [fin40] ⚠ ${semGrupo} rows sem hit no de_para — preencher no fin40 web pra entrarem no DRE`);
    }
    if (fluxoCaixaRpc.length === 0) {
      console.warn(`  [fin40] ⚠ RPC get_fluxo_caixa_agregado retornou 0 rows — verifique permissões do operador no fin40`);
    }
    return { fetched: movimentos.length, summary };
  },

  // Exports auxiliares pra build-data-extras.cjs e tests
  _internal: { normalizeCat, buildDeParaIndex, buildGruposIndex, lookupGrupo, deriveStatus, toOmieShim },
};
