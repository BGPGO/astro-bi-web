# Prompt — criar BI novo pra um cliente (bootstrap pra qualquer terminal)

> Copia/cola esse bloco inteiro num terminal Claude Code novo. Funciona em qualquer
> máquina com `gh`, `git` e Node 20+ instalados. O Claude vai operar autônomo
> seguindo `CLAUDE.md` do template (não precisa pedir permissão a cada gh/git/npm).

---

## 📋 Cole isso no Claude Code

```
Você vai criar um BI standalone novo pra um cliente da BGP, seguindo o ecossistema
BGP BI (template versionado em BGPGO + deploy Coolify automatizado).

CONTEXTO QUE VOCÊ PRECISA SABER

- Org GitHub: BGPGO (https://github.com/BGPGO)
- Template canonical: BGPGO/bi-template (privado, deve estar acessível com gh CLI)
- Blueprint público: BGPGO/bi-blueprint (BLUEPRINT.md, CHECKLIST.md, ANTI_PATTERNS.md, MASSIFICATION.md)
- Console de fleet: https://bgp-bi-console.187.77.238.125.sslip.io
- Coolify host: 187.77.238.125:8000 (REST API token está no env COOLIFY_TOKEN ou consulta o user)
- Live de cliente existente fica em <slug>.187.77.238.125.sslip.io

OPERAÇÃO: AUTÔNOMO POR PADRÃO

O `CLAUDE.md` do template define que você opera autônomo. Faça SEM perguntar:
- gh repo create, gh repo clone, git add/commit/push
- npm install, node fetch-data.cjs, node bgp-bi.cjs build, node bgp-bi.cjs publish
- Editar bi.config.js, .env (sem commitar .env), Pages JSX
- Trigger Coolify deploy via API REST

Só pergunte ao user quando faltar:
- Decisão de escopo (telas, premissas, branding)
- Credenciais que ele precisa fornecer
- Ambiguidade real (dados não batem entre 2 fontes)

PERGUNTAS QUE VOCÊ PRECISA FAZER NO INÍCIO (em UMA mensagem)

1. Nome do cliente (ex: "Bottega del Mare")
2. Slug pro repo (ex: "bottega" → repo será BGPGO/bottega-bi-web, subdomain bottega-bi.187...)
3. Fonte de dados ERP — uma de:
   - omie (single conta)
   - omie-multi (várias contas Omie via Google Sheets)
   - conta-azul
   - fin40 (BGP Financeira, Supabase) — exige FIN40_PROJECT_ID e creds do operador
   - manual-xlsx (XLSX no Drive G:\, sem ERP integrável)
   - outro (descreva)
4. Telas a entregar — escolha quais:
   - geral: overview, receita, despesa, fluxo, tesouraria, comparativo, relatorio (IA), valuation
   - outros: orcamento, lojas, risco, scorecard, quadrante, capital, stress, bridge, tese, fixovar, faturamento_produto, curva_abc, marketing, hierarquia, detalhado, profunda_cliente, crm, indicators
   - (defaults: overview/receita/despesa/fluxo/tesouraria + relatorio + valuation)
5. Cor primária do cliente (default cyan #22d3ee) e branding adicional (logo URL se tiver)
6. Credenciais da fonte:
   - Omie: APP_KEY + APP_SECRET
   - fin40: PROJECT_ID + email/senha operador (anon key já é compartilhada)
   - Sheets-based: link do Sheets
   - XLSX: caminho no Drive

SCRIPT QUE VOCÊ VAI EXECUTAR

Após coletar respostas, NÃO pergunte por cada passo — execute em sequência:

# 1. Setup workspace (cria se não existe)
mkdir -p ~/projects && cd ~/projects   # ou C:/Projects no Windows

# 2. Clona blueprint público (docs canonical) se não existe
if [ ! -d bi-blueprint ]; then
  gh repo clone BGPGO/bi-blueprint
fi

# 3. LEIA antes de codar (em ordem):
#    bi-blueprint/BLUEPRINT.md         — arquitetura
#    bi-blueprint/ANTI_PATTERNS.md     — 20 bugs reais a evitar
#    bi-blueprint/CHECKLIST.md         — pre-flight
#    bi-blueprint/MASSIFICATION.md     — fleet system

# 4. Cria repo cliente a partir do template
gh repo create BGPGO/<slug>-bi-web --template BGPGO/bi-template --private --clone

cd <slug>-bi-web

# 5. Adiciona topic 'bgp-bi' (pra aparecer no console)
gh repo edit --add-topic bgp-bi

# 6. Install deps
npm install --no-audit --no-fund

# 7. Init interativo (CLI cria bi.config.js + .env.example baseado nas escolhas)
node bgp-bi.cjs init --cliente "<NOME>" --erp <fonte>

# 8. Edita bi.config.js conforme escopo de telas
# 9. Cria .env (NÃO commitar) com as credenciais que o user passou
# 10. Pull dos dados
node fetch-data.cjs

# 11. Build com smoke test obrigatório
node bgp-bi.cjs build
# Verifique: data.js gerado, app.bundle.js sem erro, smoke test em Node passou

# 12. Primeiro push pro GitHub
git add -A && git commit -m "feat: bootstrap BI cliente <NOME>" && git push origin main

# 13. Provisiona app Coolify via REST API (se COOLIFY_TOKEN no env)
#     Doc da API: https://coolify.io/docs/api-reference
#     Template Docker simples (nginx alpine servindo HTML/JSX bundled)

# 14. Configura GitHub Actions diário (cron 00:00 BRT) pra refresh automático
#     Workflow exemplo está em bi-template/.github/workflows/daily-refresh.yml
#     Adicionar secrets do repo com gh CLI (ou via UI GitHub):
#       gh secret set OMIE_APP_KEY -b "<value>"
#       gh secret set OMIE_APP_SECRET -b "<value>"
#       gh secret set COOLIFY_TOKEN -b "<value>"
#       gh secret set COOLIFY_APP_UUID -b "<value>"  # uuid do app Coolify recém-criado

# 15. Trigger primeiro deploy
node bgp-bi.cjs publish
# OU diretamente: curl -X POST com Authorization Bearer COOLIFY_TOKEN

# 16. Valida live
#     https://<slug>-bi.187.77.238.125.sslip.io deve abrir

# 17. Verifica no console
#     https://bgp-bi-console.187.77.238.125.sslip.io
#     Cliente novo deve aparecer na fleet com:
#       - Template version OK
#       - Coolify running
#       - Auto-update detectado (🤖 cron) se o workflow foi configurado
#       - Dados/Deploy/Push timestamps

TEMPO ALVO: 5-10min do prompt ao deploy live.

QUANDO TIVER DÚVIDA, CONSULTE NESSA ORDEM:

1. CLAUDE.md no template (operação autônoma)
2. QUICK_START.md no template (passo a passo onboarding)
3. bi-blueprint/BLUEPRINT.md (arquitetura)
4. bi-blueprint/ANTI_PATTERNS.md (NÃO repita bugs já catalogados)
5. bi-blueprint/CHECKLIST.md (pre-flight)
6. Cliente em produção como referência: BGPGO/radke-bi-web ou BGPGO/grupo-dex-bi-web
7. Pergunta ao user (só se 1-6 não responder)

LIÇÕES JÁ APRENDIDAS (NÃO REPITA)

- NUNCA use `continue-on-error: true` em step de fetch que alimenta build. Se fetch falhar e build seguir, data.js vai zerar e cliente perde BI. Use sanity check (mínimo de registros) e fail-fast.
- NUNCA commite credenciais em texto claro. SEMPRE process.env + GitHub Secrets.
- NUNCA confie em classificações pré-computadas (ABC, status fatura, fase CRM). RECOMPUTE.
- NUNCA crie repo PÚBLICO pra cliente — dados sensíveis. SEMPRE --private.
- Hooks order: useMemo SEMPRE antes de early returns. Hook depois de return condicional = crash.
- Sticky thead: background SÓLIDO (não transparente) — vaza no scroll.
- EXTRATO de receitas e despesas: separar em arrays distintos com slice próprio (slice global desc derruba minoria).

OK, COMECE PERGUNTANDO AS 6 INFOS ACIMA AO USER.
```

---

## Variante curta (se já tem todas as infos)

Use essa se o user já passou nome/slug/fonte/etc:

```
Cliente: <NOME>
Slug: <slug>
Fonte: <omie|omie-multi|fin40|conta-azul|manual-xlsx>
Telas: <lista>
Cor: <hex>
Creds: <passou via env ou .env>

Cria o BI standalone seguindo CLAUDE.md do BGPGO/bi-template. Operação autônoma.
1) gh repo create privado a partir do template
2) clone + npm install + init + edit bi.config
3) .env com creds
4) fetch-data + build + smoke test
5) gh secrets setup (OMIE_*, COOLIFY_*)
6) primeiro publish
7) valida live + console

Não pergunta passo a passo. Se algo bloquear, me avisa com o contexto exato (não genérico).
```

---

## Pra cliente fin40 especificamente

Adapter `fin40.cjs` v2 no template (SOPRA-validated, 2026-05-12) já cuida do crítico:
par `(categoria, tipo)`, `normalize_cat`, RPCs oficiais, preserve sinais, sem-grupo.

**Antes de codar:**
1. LEIA `BGPGO/sopra-bi-web/FIN40_INTEGRATION_LESSONS.md` (estado da arte)
2. NÃO confie em `c2b-incorporadora-bi-web/FIN40_INTEGRATION.md` (3 claims erradas — vide §3 das lessons)

**Setup mínimo:**
```bash
# .env
FIN40_SUPABASE_URL=https://pdyrhdmuqepuznpliehl.supabase.co
FIN40_SUPABASE_ANON=<anon key, mesma pra todos>
FIN40_EMAIL=<operador@bertuzzipatrimonial.com.br>
FIN40_PASSWORD=<senha>
FIN40_PROJECT_ID=<UUID do project no fin40, descobre via UI ou query>

# bi.config.js
fontes: {
  adapters: ["fin40"],
  fin40: {
    cliente_label: "Nome Bonito",
    desconsiderar: true,
    data_inicio: "2026-01-01",
    data_fim: "2026-12-31",
  },
}
```

**Pra clientes fin40-only (sem XLSX no Drive):**
- Desligar pages "outros" no `bi.config.js`: `faturamento_produto`, `curva_abc`, `marketing_ads`, `crm_omie`, `hierarquia`, `detalhado` → todas `hidden`
- `fontes.drive.base_path` pode ficar vazio (build-data-extras detecta e pula branch XLSX)
- PageFluxo deve usar `window.BIT_EXTRAS.dre` (cascata pronta) em vez de FLUXO_RECEITA/DESPESA

**Checklist de paridade após primeiro deploy:**
- [ ] data/_summary.json mostra contas_receber + contas_pagar > 0
- [ ] data/fluxo_caixa_rpc.json não vazio (se vazio = permissões fin40)
- [ ] window.BIT_EXTRAS.dre.por_mes mostra cascata por mês
- [ ] Receita Total / Lucro Bruto / EBITDA / Result.Op / Geração de Caixa batem CENTAVO com fin40 web pra mês mais recente fechado

---

*Doc gerado 2026-05-11. Atualizar quando workflow CLI/Coolify mudar.*
