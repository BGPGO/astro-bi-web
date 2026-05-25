# Adapter Contract — fontes de dados pluráveis

> Cada cliente tem uma ou mais fontes de dados. O BI é fonte-agnóstico:
> consome apenas o **formato canonical** que cada adapter produz.

## Como funciona

1. `bi.config.js > fontes` declara quais adapters usar:
   ```js
   fontes: {
     adapters: ["omie"],         // ou ["conta-azul"], ["bling"], ["manual-xlsx"], ou múltiplos
     omie: { app_key_env: "OMIE_APP_KEY", ... },
     drive: { base_path: "G:/..." },
   }
   ```

2. `build-data.cjs` itera os adapters configurados, chama `pull()` de cada um,
   e merge-eia o output canonical em `data/`.

3. O resto do BI (build-data.cjs cálculos + frontend) consome `data/*.json` no
   formato canonical, agnóstico de fonte.

## Contrato canonical (output que cada adapter DEVE produzir)

Cada adapter expõe `module.exports = { id, label, pull, validate }`:

```js
module.exports = {
  id: "omie",                     // identificador único
  label: "Omie ERP",               // legível pra UI/log
  required_env: ["OMIE_APP_KEY", "OMIE_APP_SECRET"],

  // valida config + env disponíveis. Retorna { ok, errors }
  validate(config) { ... },

  // executa o pull. Escreve JSONs em data/. Retorna { fetched, summary }
  async pull(config, dataDir) { ... },
};
```

### JSONs canonicals esperados em `data/`

```
data/
├─ empresa.json              # { nome_fantasia, codigo, cnpj, cidade, uf }
├─ categorias.json           # [{ codigo, descricao, tipo: 'receita'|'despesa' }]
├─ departamentos.json        # [{ codigo, descricao }]
├─ clientes.json             # [{ codigo, nome_fantasia, razao_social, cnpj, ... }]
├─ contas_correntes.json     # [{ id, nome, banco, codigo_banco, saldo_inicial }]
├─ movimentos.json           # ARRAY canonical (UMA fonte de verdade do BI)
└─ _summary.json             # metadados do pull (timestamp, fonte, contagens)
```

### Schema de `movimentos.json` (canonical)

Cada movimento é uma transação financeira normalizada:

```ts
{
  id: string,                  // único dentro da fonte (ex: nCodTitulo do Omie)
  fonte: string,               // adapter id ('omie', 'conta-azul', etc)
  natureza: 'R' | 'P',         // Receita ou Pagar
  status: 'PAGO' | 'A VENCER' | 'ATRASADO' | 'VENCE HOJE' | 'CANCELADO',
  realizado: boolean,          // status === 'PAGO' || 'RECEBIDO'

  data_emissao: string,        // ISO 8601 'YYYY-MM-DD'
  data_vencimento: string,     // ISO 8601
  data_pagamento: string|null, // ISO 8601 ou null se não realizado

  valor_total: number,         // bruto positivo (ex: 1500.00)
  valor_pago: number,          // 0 se não realizado, valor_total se pago integral
  valor_aberto: number,        // valor a vencer (se não realizado) ou 0

  categoria: string,           // resolvido (não código)
  centro_custo: string,        // departamento, centro de custo
  cliente: string,             // razão social ou nome (resolvido)
  conta_corrente: string,      // banco/conta
  codigo_banco: string,        // ex: '033' (Santander), '748' (Sicredi), '756' (Sicoob)

  observacao: string,          // descrição livre
  tags: string[],              // tags do ERP (se houver)
}
```

**Importante:**
- Valores SEMPRE positivos (sinal vem de `natureza`).
- Datas sempre ISO 8601 — frontend converte pra dd/mm/yyyy.
- Categorias resolvidas (texto), não códigos.
- Cliente sempre resolvido (não ID do cadastro).

## Adapters disponíveis

| Adapter | Status | Lê de | Adequado pra |
|---|---|---|---|
| `omie` | ✅ Pronto | API Omie REST | clientes Omie |
| `conta-azul` | 🟡 Skeleton | API Conta Azul | clientes Conta Azul |
| `fin40` | ✅ Pronto (v2 SOPRA-validated) | Supabase fin40 (BGP Financeira) | clientes do braço financeiro BGP |
| `bling` | ⚪ TODO | API Bling v3 | clientes Bling |
| `tiny` | ⚪ TODO | API Tiny v2 | clientes Tiny |
| `manual-xlsx` | 🟡 Skeleton | XLSX no Drive | clientes sem ERP integrável |
| `f360` | ⚪ TODO | F360 (Bottega) | controladoria F360 |
| `ssw` | ⚪ TODO | Playwright SSW | logística SSW |

### Adapter `fin40` — detalhes

Cliente BGP Financeira já existe no `fin40.com.br`? Use esse adapter.

**Como funciona:**
- Auth JWT (email/senha operador) contra Supabase fin40
- Pull paginado de 6 tabelas filtradas por `project_id` (UUID do cliente)
- Mapeia CR/CP → schema canonical `movimentos.json` (valor positivo + natureza R/P)
- Detecta status via `conciliado` + `data_vencimento` (NÃO usa campo `status` — null em 100%)
- Filtra `desconsiderar=true` por padrão (configurável via `bi.config.js > fontes.fin40.desconsiderar=false`)

**Env vars necessárias:**
```
FIN40_SUPABASE_URL=https://pdyrhdmuqepuznpliehl.supabase.co
FIN40_SUPABASE_ANON=<anon key>
FIN40_EMAIL=<operador@bertuzzipatrimonial.com.br>
FIN40_PASSWORD=<senha>
FIN40_PROJECT_ID=<UUID único do cliente no fin40>
```

**Config:**
```js
fontes: {
  adapters: ["fin40"],
  fin40: {
    regime: "caixa",            // ou "competencia"
    desconsiderar: true,        // filtra fin40 desconsiderar=true (padrão)
    cliente_label: "Nome Bonito",
  },
}
```

**Doc canonical (estado da arte):**
**`BGPGO/sopra-bi-web/FIN40_INTEGRATION_LESSONS.md`** ← LEIA antes de codar.
Substitui o legacy `c2b-incorporadora-bi-web/FIN40_INTEGRATION.md` (que tem 3 claims erradas).

**Validações de paridade conhecidas:**
- C2B: CR Jan-Mar 2026 = R$ 32.623.827,88 (bate com bi_c2b.pbix legado)
- SOPRA: cascata DRE Jan-Abr 2026 bate até centavo com fin40 web (Receita Total, Lucro Bruto, EBITDA, Resultado Operacional, Geração de Caixa)

**Pegadinhas críticas — sem isso, números divergem:**
1. **Lookup de_para é por par `(normalize_cat(categoria), tipo)`** — NÃO "primeira ocorrência". Mesma categoria pode mapear pra grupos diferentes em CR vs CP. SOPRA validou: `"Retenção de IR"` → impostos em CP, receitas em CR.
2. **`normalize_cat()` = unaccent + lower + collapse spaces.** NÃO simples lowercase. Replica `lower(trim(regexp_replace(unaccent(val), '\s+', ' ', 'g')))` da função SQL.
3. **Chame RPCs oficiais** `get_fluxo_caixa_agregado` + `get_orcado_vs_realizado` em vez de reimplementar cascata DRE em JS. RPCs garantem paridade fin40 web. Adapter v2 já chama e salva em `data/fluxo_caixa_rpc.json`.
4. **NUNCA Math.abs(valor).** RET em CR vem negativo pra reduzir receita; refunds em CP vem positivo pra reduzir despesa. Math.abs destrói essa info. Build-data v2 respeita `cfg.fontes.fin40.preserve_sinais` (default true pra fin40).
5. **Categorias sem hit no de_para** → marcar `'⚠️ Sem Grupo'`. fin40 web mostra essa linha — NÃO filtrar fora.

**Pegadinhas de apresentação:**
6. **`pos_operacional` + grupos intra NÃO entram em telas DRE** (Receita/Despesa/EBITDA), SÓ em Fluxo de Caixa (vão até Geração de Caixa).
7. **`status` null em 100% dos rows** na maioria dos clientes (C2B + SOPRA confirmaram). Não use como filtro.
8. **`conciliado=false` em 100%** em alguns clientes (SOPRA: 0/15.085). Heurística fallback: `realizado = conciliado || data_vencimento <= today`.
9. **`centro_custo`** vem como **string JSON** — sempre `JSON.parse` antes. Cliente pode ter múltiplas SPEs (SOPRA: 4 empresas).
10. **Categoria `"Sem Apropriação Financeira"`**: manter, não filtrar (cai em "Outras Movimentações").

**Pegadinhas template (já consertadas no v2):**
- `require('./adapters')` quebra Node 24 → use `require('./adapters/index.cjs')` explícito (fix em `fetch-data.cjs`)
- `bi.config.js` NÃO é gitignored (removido do `.gitignore` template)
- Dockerfile não tem mais `COPY report-*.json` específicos RADKE
- `TRANSFERENCIA_RE` parametrizado em `build-data.cjs` (default true Omie, default false fin40)
- `Math.abs(valor)` parametrizado em `build-data.cjs` via `preserve_sinais`

## Como criar adapter novo

1. Copia `adapters/_template.cjs` pra `adapters/<nome>.cjs`
2. Implementa `validate()` e `pull()` retornando JSONs no schema canonical
3. Adiciona ao `adapters/index.cjs` (registry)
4. Atualiza `bi.config.example.js` com schema do novo adapter
5. Documenta nesse `_CONTRACT.md`

## Multi-fonte

Cliente pode ter múltiplas fontes:

```js
fontes: {
  adapters: ["omie", "manual-xlsx"],   // pull dos dois, merge
  omie: { ... },
  manual_xlsx: {
    files: ["receitas-extras.xlsx"]    // só pra coisas fora do ERP
  },
}
```

`build-data.cjs` faz merge de `movimentos.json` de cada adapter, deduplica por
`(fonte, id)`, e processa.
