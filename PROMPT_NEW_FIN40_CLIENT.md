# Prompt — criar BI fin40 novo (playbook detalhado)

> Use este doc se está num terminal sem a skill `/novo-bi` instalada. Caso contrário,
> só invoque `/novo-bi` e o Claude segue o fluxo abaixo automaticamente.

Adapter v2 SOPRA-validated (2026-05-12) cuida do crítico. Você só configura.
Tempo alvo: **30 min** (vs ~2h15 SOPRA pré-lições).

---

## Cole isso num terminal Claude Code novo

```
Vou criar um BI standalone fin40 novo pra cliente da BGP, adapter v2 SOPRA-validated.

CONTEXTO

- Org GitHub: BGPGO
- Template: BGPGO/bi-template (privado, modo autônomo por CLAUDE.md)
- Blueprint: BGPGO/bi-blueprint (público — BLUEPRINT/ANTI_PATTERNS/CHECKLIST)
- Console: https://bgp-bi-console.187.77.238.125.sslip.io
- Coolify: 187.77.238.125:8000 (token via COOLIFY_TOKEN env)

LEITURA OBRIGATÓRIA ANTES DE CODAR

1. BGPGO/sopra-bi-web/FIN40_INTEGRATION_LESSONS.md — estado da arte fin40
2. BGPGO/bi-template/adapters/_CONTRACT.md — schema canonical + 10 pegadinhas
3. BGPGO/bi-template/CLAUDE.md — operação autônoma
4. IGNORAR: c2b-incorporadora-bi-web/FIN40_INTEGRATION.md (legacy, 3 claims erradas)

PERGUNTE EM UMA MENSAGEM SÓ

1) Nome do cliente (ex: "Aria Empreendimentos")
2) Slug (ex: "aria" → repo BGPGO/aria-bi-web, subdomain aria-bi)
3) FIN40_PROJECT_ID (UUID do project no fin40)
4) Pares mes/ano que vou validar paridade (ex: "2026-01 a 2026-04 fechados")
5) Cliente tem múltiplas SPEs em centro_custo.EMPRESA? Filtrar por uma só ou agregar todas?
6) Cor primária do BI (default #22d3ee cyan)

SCRIPT (executa sem perguntar passo a passo)

# 1. Criar repo privado a partir do template
gh repo create BGPGO/<slug>-bi-web --template BGPGO/bi-template --private --clone
cd <slug>-bi-web
gh repo edit --add-topic bgp-bi
npm install --no-audit --no-fund

# 2. bi.config.js (tracked, sem secrets)
cat > bi.config.js <<'EOF'
module.exports = {
  cliente: {
    nome: "<NOME>",
    subdomain: "<slug>-bi",
    coolify_app_uuid: "",
    cor_primaria: "<cor>",
  },
  fontes: {
    adapters: ["fin40"],
    fin40: {
      cliente_label: "<NOME>",
      regime: "caixa",
      use_competencia: false,
      desconsiderar: true,
      data_inicio: "2025-01-01",
      data_fim: "2026-12-31",
      centro_custo: null,           // filtra EMPRESA da SPE ou null pra todas
      filtrar_transferencias: false,
      preserve_sinais: true,
      excluir_pos_operacional: true,
    },
    drive: { base_path: "" },        // fin40-only não precisa Drive
  },
  pages: {
    geral: {
      overview: "active", receita: "active", despesa: "active",
      fluxo: "active", tesouraria: "active", comparativo: "active",
      relatorio_ia: "upsell", valuation: "upsell",
    },
    outros: {                         // todas hidden pra fin40-only
      faturamento_produto: "hidden", curva_abc: "hidden",
      marketing_ads: "hidden", crm_omie: "hidden",
      hierarquia: "hidden", detalhado: "hidden", profunda_cliente: "hidden",
    },
  },
  meta: { ano_corrente: 2026 },
  template: { version_when_created: "1.1.0", version_last_synced: "1.1.0" },
};
EOF

# 3. .env (NÃO commitar)
cat > .env <<'EOF'
FIN40_SUPABASE_URL=https://pdyrhdmuqepuznpliehl.supabase.co
FIN40_SUPABASE_ANON=<anon key — peça ao user se não souber>
FIN40_EMAIL=<operador@bertuzzipatrimonial.com.br>
FIN40_PASSWORD=<senha — peça ao user>
FIN40_PROJECT_ID=<UUID do cliente>
EOF

# 4. Pull + build + smoke
node fetch-data.cjs
# Espera: data/fluxo_caixa_rpc.json + orcado_realizado_rpc.json não vazios.
# Se vazios → permissões fin40 do operador. Para e me avisa.

node bgp-bi.cjs build
# Espera: data.js + data-extras.js com BIT_EXTRAS.dre.por_mes[mes].cascata.

# 5. Validar paridade ANTES de publicar
node -e '
const fs = require("fs");
const js = fs.readFileSync("data-extras.js", "utf8");
const ctx = { window: {} };
new Function("window", js)(ctx.window);
const dre = ctx.window.BIT_EXTRAS.dre.por_mes;
for (const m of dre) console.log(m.mes, JSON.stringify(m.cascata));
'
# Compare com fin40 web > Fluxo de Caixa pros meses que o user pediu.
# Diff > R$ 0,01 em qualquer subtotal → ABORT, mostra evidência ao user.

# 6. Primeiro commit + push
git add -A && git commit -m "feat: bootstrap BI fin40 <NOME>" && git push origin main

# 7. Coolify provision via API + GH secrets pro workflow + primeiro publish
node bgp-bi.cjs publish

# 8. Set secrets pro daily-refresh.yml
gh secret set FIN40_SUPABASE_ANON --body "<value>"
gh secret set FIN40_EMAIL --body "<value>"
gh secret set FIN40_PASSWORD --body "<value>"
gh secret set FIN40_PROJECT_ID --body "<value>"
gh secret set COOLIFY_TOKEN --body "<value>"
gh secret set COOLIFY_APP_UUID --body "<UUID do passo 7>"

# 9. Trigger primeiro workflow run pra validar GHA
gh workflow run daily-refresh.yml

# 10. Validar live
curl -sf https://<slug>-bi.187.77.238.125.sslip.io > /dev/null && echo OK

# 11. Verificar console (https://bgp-bi-console.187.77.238.125.sslip.io)
# - cliente aparece na fleet
# - última atualização recente
# - auto-update detectado (cron diário)

REGRAS QUE NÃO PODEM SER QUEBRADAS

- repo SEMPRE --private (dados sensíveis do cliente)
- Math.abs(valor) NUNCA (preserve_sinais=true) — RET/refunds têm sinal real
- NUNCA filtre categorias "Transferências entre contas" pra fin40 — são pos_operacional legítimo
- de_para lookup SEMPRE por par (normalize_cat(cat), tipo) — adapter v2 já faz
- NUNCA continue-on-error em fetch que alimenta build (zerou Radke 11/05)
- Validação centavo COMPULSÓRIA antes do primeiro publish
- Se faltar credencial, PEÇA ao user. Não invente.

QUANDO TRAVAR

- RPC retorna 0 rows → user precisa habilitar operador no fin40 do cliente
- de_para tem muitas categorias '⚠️ Sem Grupo' → user preenche no fin40 web antes
- centro_custo múltiplas SPEs → confirma com user se filtra ou agrega
- Cascata DRE não bate até centavo → mostra mês/secao/diff e PARA

Comece perguntando as 6 infos acima.
```

---

## Versão one-shot (todas as infos no prompt)

Se já tem todas as infos:

```
Cliente: <NOME>
Slug: <slug>
FIN40_PROJECT_ID: <UUID>
Meses validar: <ex: 2026-01 a 2026-04>
Múltiplas SPEs: <sim, agregar | sim, filtrar X | não>
Cor: <hex ou default>
Credenciais fin40: <peço pelo email/senha do operador BGP>

Crie o BI fin40 standalone seguindo BGPGO/bi-template/PROMPT_NEW_FIN40_CLIENT.md.
Modo autônomo. Não pergunta passo a passo. Valide paridade até centavo antes de publish.
Se travar, mostra contexto exato.
```

---

*Cross-references:*
- *Skill local (atalho `/novo-bi`):* `~/.claude/skills/novo-bi/SKILL.md`
- *Doc canonical lições SOPRA:* `BGPGO/sopra-bi-web/FIN40_INTEGRATION_LESSONS.md`
- *Memória global:* `~/.claude/projects/C--Projects/memory/reference_fin40_engine.md`
