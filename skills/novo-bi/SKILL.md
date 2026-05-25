---
name: novo-bi
description: Cria BI standalone novo pra cliente BGP em ~30min (default fin40, suporta omie/conta-azul/manual-xlsx). Provisiona repo BGPGO + fetch dados + build + Coolify deploy + workflow GHA diário + validação paridade. Use quando o user pedir "criar bi pra cliente X", "novo bi", ou invocar /novo-bi.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /novo-bi — Cria BI standalone novo pra cliente BGP

Você é o operador BGP criando um BI standalone novo. Adapter v2 SOPRA-validated
(2026-05-12) cobre o crítico — você só configura. Modo autônomo conforme
`CLAUDE.md` do template (não pede permissão pra gh/git/npm/coolify — é o trabalho).

## Contexto fixo

- **Org GitHub**: BGPGO
- **Template canonical**: `BGPGO/bi-template` (privado)
- **Blueprint público**: `BGPGO/bi-blueprint` (BLUEPRINT, ANTI_PATTERNS, CHECKLIST)
- **Console fleet**: https://bgp-bi-console.187.77.238.125.sslip.io
- **Coolify**: 187.77.238.125:8000 (token em env `COOLIFY_TOKEN` ou memory `reference_coolify_api_token.md`)

## Doc canonical fin40 (LEIA antes de codar, se cliente é fin40)

1. `BGPGO/sopra-bi-web/FIN40_INTEGRATION_LESSONS.md` — estado da arte
2. `BGPGO/bi-template/adapters/_CONTRACT.md` — schema + 10 pegadinhas
3. `BGPGO/bi-template/PROMPT_NEW_FIN40_CLIENT.md` — playbook detalhado
4. **IGNORAR**: `c2b-incorporadora-bi-web/FIN40_INTEGRATION.md` (legacy, 3 claims erradas)

## Passo 1 — Pergunte em UMA mensagem (use AskUserQuestion)

1. **Nome do cliente** (ex: "Aria Empreendimentos")
2. **Slug** (ex: "aria" → repo `BGPGO/aria-bi-web`, subdomain `aria-bi`)
3. **Fonte de dados**: fin40 (default) | omie | conta-azul | manual-xlsx
4. **Credencial-chave da fonte**:
   - fin40 → `FIN40_PROJECT_ID` (UUID do project)
   - omie → `OMIE_APP_KEY` + `OMIE_APP_SECRET`
   - conta-azul → `CA_CLIENT_ID/SECRET/REFRESH_TOKEN`
   - manual-xlsx → caminho base no Drive
5. **Pares mês/ano pra validar paridade** (ex: "2026-01 a 2026-04 fechados")
6. **Cor primária** (default `#22d3ee` cyan)

Se fin40: pergunte também se há múltiplas SPEs em `centro_custo.EMPRESA` — filtrar uma ou agregar.

## Passo 2 — Execute o script sem perguntar

```bash
# 2.1 Cria repo privado a partir do template
gh repo create BGPGO/<slug>-bi-web --template BGPGO/bi-template --private --clone
cd <slug>-bi-web
gh repo edit --add-topic bgp-bi
npm install --no-audit --no-fund

# 2.2 Cria bi.config.js (tracked, sem secrets)
# Use o template fin40 do PROMPT_NEW_FIN40_CLIENT.md no bi-template.
# Pra omie/conta-azul/manual-xlsx, ajusta o bloco fontes.<adapter>.

# 2.3 Cria .env (NÃO commitar, .gitignore já cuida)
# fin40:
#   FIN40_SUPABASE_URL=https://pdyrhdmuqepuznpliehl.supabase.co
#   FIN40_SUPABASE_ANON=<peça ao user — memory pode ter>
#   FIN40_EMAIL=<operador@bertuzzipatrimonial.com.br>
#   FIN40_PASSWORD=<peça ao user>
#   FIN40_PROJECT_ID=<UUID do passo 1>

# 2.4 Pull + build + smoke
node fetch-data.cjs
# fin40: valida que data/fluxo_caixa_rpc.json e orcado_realizado_rpc.json não vazios.
# Vazios → permissões fin40 do operador. Para e avisa user.

node bgp-bi.cjs build
# Espera: data.js + data-extras.js com BIT_EXTRAS.dre.por_mes (fin40) gerados sem erro.

# 2.5 VALIDAR PARIDADE — não pula
# fin40: extraia cascata DRE dos meses pedidos. Compare com fin40 web aba Fluxo de Caixa.
# Diff > R$ 0,01 em qualquer subtotal (Receita Total, Lucro Bruto, EBITDA,
# Resultado Operacional, Geração de Caixa) → ABORT, mostra ao user antes de seguir.

# 2.6 Primeiro commit + push
git add -A
git commit -m "feat: bootstrap BI <fonte> <NOME>"
git push origin main

# 2.7 Provisiona Coolify + secrets pro workflow + primeiro publish
node bgp-bi.cjs publish
# Pega o app UUID retornado, set no GH secret COOLIFY_APP_UUID + OMIE_*/FIN40_*

# 2.8 Adiciona workflow daily-refresh.yml se ainda não existe
# Template tem .github/workflows/daily-refresh.yml — herda do gh repo create.

# 2.9 Valida live
curl -sf https://<slug>-bi.187.77.238.125.sslip.io > /dev/null && echo "LIVE OK"

# 2.10 Valida no console (https://bgp-bi-console.187.77.238.125.sslip.io)
# - Cliente aparece na fleet
# - Última atualização recente
# - Auto-update detectado (cron diário 00h BRT)
```

## Regras que NÃO podem ser quebradas

- **Repo SEMPRE `--private`** — dados sensíveis do cliente
- **fin40: NUNCA `Math.abs(valor)`** — `preserve_sinais=true` no bi.config (RET/refunds têm sinal real)
- **fin40: NUNCA filtre categorias "Transferências entre contas"** — são pos_operacional legítimo (`filtrar_transferencias: false`)
- **fin40: lookup `de_para` SEMPRE por par `(normalize_cat(cat), tipo)`** — adapter v2 já faz
- **NUNCA `continue-on-error: true`** em fetch que alimenta build (incidente Radke 11/05/26 zerou data.js)
- **Validação paridade COMPULSÓRIA** antes do primeiro publish
- **Sem credencial → PEÇA ao user**, não invente

## Quando travar e perguntar

- RPC fin40 retorna 0 rows → user precisa habilitar operador no fin40 do cliente
- de_para tem muitas categorias `'⚠️ Sem Grupo'` → user preenche no fin40 web antes
- `centro_custo` múltiplas SPEs → confirma com user filtra ou agrega
- Cascata DRE não bate centavo → mostra mês/secao/diff e PARA

## Lições já aprendidas (NÃO repita)

- `continue-on-error` em fetch → Radke zerou em 11/05
- Hooks order: useMemo SEMPRE antes de early returns
- Sticky thead: background SÓLIDO (não transparente)
- EXTRATO receitas+despesas: separar em arrays distintos com slice próprio
- ABC/status/fase CRM: NUNCA confiar em classificação pré-computada, RECOMPUTE

## Tempo alvo

30 min (vs 2h15 SOPRA pré-lições). Se passar de 1h, pause e mostre onde travou.

## Após criar — integração com BGP OS (sistema do CEO)

Cliente fin40 (sopra, esa, c2b, futuros): **aparece automaticamente** na tabela `projects` do Supabase fin40, então o BGP OS (`G:\Meu Drive\BGP\DIRETORIA\4. CONTROLADORIA\BI\BGP OS\`) já consegue consultar dados desse cliente sem update. CEO pode perguntar "quanto cliente X recebeu em abril?" e funciona.

Cliente NÃO-fin40 (Omie, Conta Azul, XLSX custom): dados ficam **só** no BI standalone. Pro CEO conseguir consultar via BGP OS, considere:
- Cliente estratégico → adicione query template em `sources/<fonte>.md` do BGP OS
- Cliente só-dashboard → não precisa fazer nada, fica isolado no BI standalone

Ver memory `reference_bgp_os.md` pra detalhes de como BGP OS funciona (modular, 7 fontes, edge fn `bgp-os-query`).

## Auto-aprendizado: quando descobrir algo novo sobre fin40

Se você descobrir uma pegadinha nova durante o bootstrap do cliente (algo NÃO catalogado em `sopra-bi-web/FIN40_INTEGRATION_LESSONS.md` nem `_CONTRACT.md`):
1. Adicione ao `aprendizados.md` do BGP OS (formato no CLAUDE.md §"REGRA CRITICA")
2. Atualize `sources/fin40.md` do BGP OS se for esquema/query
3. Considere PR no `BGPGO/bi-template/adapters/_CONTRACT.md` se afeta todo cliente fin40 futuro
4. Atualize memory `reference_fin40_engine.md` (versão condensada pra terminal)
