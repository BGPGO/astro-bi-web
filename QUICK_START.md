# QUICK START — Caio

> Continuação direta do trabalho do Thomas. Você tem ~20 min pra estar produtivo.
> Pula teoria, executa. Documentação completa em ONBOARDING.md depois.

---

## 0. Conceitos-chave (2 min)

**Multi-fonte de dados** (NOVO v1.1.0)
Cada cliente pode ter uma ou mais fontes (Omie, Conta Azul, XLSX manual, etc).
- `bi.config.js > fontes.adapters[]` declara quais usar
- Adapters disponíveis em `adapters/` — cada um normaliza pra schema canonical
- `node fetch-data.cjs` invoca adapters e gera `data/movimentos.json` único
- Adicionar fonte nova: copiar `adapters/_template.cjs`, implementar `pull()`

**Pages com 3 modos** (NOVO v1.1.0)
Cada page no menu tem um `mode`:
- `"active"` — funciona normal com dados reais
- `"upsell"` — aparece com badge **PRO**, click mostra tela explicativa + CTA contratação. Sem dados reais. Útil pra futuros upsells.
- `"hidden"` — não aparece no menu

Configurado em `bi.config.js > pages.{geral,outros}`. Permite vender plano básico (overview, receita, despesa) e oferecer Valuation/Relatório IA/Marketing como upsell visível.

---

## 1. O que existe (1 min)

**Repo template canonical:** https://github.com/BGPGO/bi-template
- Marcado "Template repository" — `gh repo create --template` clona ele.
- Source de verdade: `C:\Projects\bi-template\` (já no seu disco)

**Espelho leitura:** `G:\Meu Drive\BGP\CLIENTES\BI\00. PADRÕES\bi-template\`

**Cliente em produção** (referência de como ficou pronto):
- Repo: https://github.com/BGPGO/radke-bi-web
- Live: https://radke-bi.187.77.238.125.sslip.io
- Local: `C:\Projects\radke-bi\`

**Documentação completa:** `C:\Projects\bi-blueprint\` (sincronizado com Drive `00. PADRÕES`)
- `BLUEPRINT.md` — arquitetura
- `ANTI_PATTERNS.md` — 20 bugs reais (LEIA antes de codar)
- `MASSIFICATION.md` — sistema de fleet
- `CHECKLIST.md` — pre-flight de release

---

## 2. Pré-requisitos (1 min — confirma)

```bash
node -v        # >= 18
gh --version   # qualquer
gh auth status # logado em github.com como thomas-bgp
```

Credenciais que vai precisar:
- **OMIE_APP_KEY / SECRET** do cliente (cada cliente tem o seu — pega no painel Omie)
- **COOLIFY_TOKEN** compartilhado BGP. Memory entry: `C:\Users\bertu\.claude\projects\C--Projects\memory\reference_coolify_api_token.md`
- **ANTHROPIC_API_KEY** — opcional, só se for gerar relatório IA on-the-fly

---

## 3. Cenário A — Continuar trabalhando no radke-bi (5 min)

```bash
cd C:/Projects/radke-bi
git pull origin main
node build-data.cjs && node build-radke-extras.cjs && node build-jsx.cjs
# faz mudanças
git add -A && git commit -m "fix: <o que>"
git push origin main
# trigger deploy via API:
curl -s -H "Authorization: Bearer 43|3NIKe50qNGpaXwg5H8yQQ2qbWfEAxqe9Pth7CbhF5c61c212" \
  "http://187.77.238.125:8000/api/v1/deploy?uuid=o13ocoiraspr0ekjryg13u7v&force=false"
```

UUID radke-bi-web: `o13ocoiraspr0ekjryg13u7v`

---

## 4. Cenário B — Criar BI novo pra cliente novo (10 min)

```bash
# 1) Cria repo do cliente a partir do template (substitui <cliente> pelo slug)
gh repo create BGPGO/<cliente>-bi-web --template BGPGO/bi-template --private

# 2) Clona localmente
cd C:/Projects
gh repo clone BGPGO/<cliente>-bi-web
cd <cliente>-bi-web

# 3) Setup interativo (vai perguntar nome, ERP, extras)
node bgp-bi.cjs init

# 4) Edita .env com credenciais
code .env
# preenche: OMIE_APP_KEY, OMIE_APP_SECRET, COOLIFY_TOKEN, etc

# 5) Edita bi.config.js (ajusta path Drive, bancos_ok)
code bi.config.js

# 6) Build local com smoke test obrigatório
node bgp-bi.cjs build

# 7) Provisiona Coolify (manual por enquanto):
#    - Login Coolify dashboard: http://187.77.238.125:8000
#    - Cria new application > Public repo > GitHub > BGPGO/<cliente>-bi-web > Dockerfile
#    - Domain: <cliente>-bi.187.77.238.125.sslip.io
#    - Pega o UUID do app na URL após criar e cola em bi.config.js > cliente.coolify_app_uuid
#    (alternativa: API REST — ver memory reference_coolify_api_token.md)

# 8) Primeiro deploy
node bgp-bi.cjs publish
```

---

## 5. Cenário C — BGP soltou fix no template (3 min)

Quando há fix no `BGPGO/bi-template` que precisa propagar pros clientes:

```bash
# Em cada repo de cliente:
cd C:/Projects/<cliente>-bi-web
node bgp-bi.cjs sync     # mostra commits novos do template, faz merge
node bgp-bi.cjs build    # valida não quebrou
node bgp-bi.cjs publish  # deploy
```

Pra fazer em batch (TODO: testar antes de produção):
```bash
node C:/Projects/bi-blueprint/bgp-bi-fleet.cjs status        # vê quem tá desatualizado
node C:/Projects/bi-blueprint/bgp-bi-fleet.cjs sync --all    # abre PR em cada
```

---

## 6. Onde botar a mão se algo der errado

### radke-bi tá quebrado / tela preta
1. Roda smoke test em Node (instruções em `bi-blueprint/COMMANDS.md` ou `ANTI_PATTERNS.md` A20)
2. Se for hooks order, ler `ANTI_PATTERNS.md` A2
3. Se for TDZ em data.js, ler `ANTI_PATTERNS.md` A3
4. Browser cache: `Ctrl+F5` antes de assumir bug

### Filtro novo não filtra
- Audit cascata: `useState` → `useMemo(() => filter)` → todos os charts derivam disso?
- Se não, ler `ANTI_PATTERNS.md` A1 e A13

### Coolify deploy falhou
```bash
curl -s -H "Authorization: Bearer 43|3NIKe50qNGpaXwg5H8yQQ2qbWfEAxqe9Pth7CbhF5c61c212" \
  "http://187.77.238.125:8000/api/v1/deployments/applications/<UUID>" | \
  node -e "const c=require('fs').readFileSync(0,'utf8');const d=JSON.parse(c);console.log(d.deployments[0]||'no deploy')"
```
Erro comum: `failed to compute cache key` = Dockerfile referencia arquivo deletado.

### Dados não batem com o cliente
- NUNCA invente. Reproduz o número que ele espera.
- Se a fonte (Omie/XLSX) tem o número diferente, mostra e discute.
- ANTI_PATTERNS A6 (faturamento dedup) e A7 (cards globais) são os 2 erros mais comuns.

---

## 7. Convenções obrigatórias (não negocia)

1. **Hooks no topo do componente** — antes de `if (loading) return`. Senão = tela preta.
2. **TODO filtro visível tem que filtrar** — se não funciona, REMOVE do JSX.
3. **Cards reativos a `(year, month, statusFilter, drilldown)`** — nunca usa `window.BIT` direto.
4. **Smoke test antes de push** — `node -e "new Function(require('fs').readFileSync('app.bundle.js','utf8'))"`.
5. **Pre-flight checklist** (`CHECKLIST.md`) antes de mostrar pro cliente.

---

## 8. Status do trabalho atual

**Fechado e em produção** (radke-bi):
- 30 ondas de iteração (Wave A → Wave X)
- Todas as telas do PBI replicadas + extras (Faturamento, ABC, Marketing ADS, CRM, Valuation, Tesouraria com análise de risco)
- Reports IA pré-escritos pra Jan/Fev/Mar/Abr/Mai 2026 + YTD
- BI Export PDF multi-tela
- Tesouraria com banner de risco de caixa + chart de saldo dia-a-dia projetado

**Pendente local (não foi push)**:
- PageMarketing aceita filtro de mês (precisa esperar dados ADS de 2026 do cliente)
- `build-data-extras.cjs` parsing de Início/Término dos ADS (idem)

**Próximos passos sugeridos**:
1. Modularizar `pages-1/2/3/4.jsx` em `pages-core/` + `pages-extras/` (catalog reusável)
2. Implementar provisionamento Coolify automático em `bgp-bi.cjs init` (hoje só placeholder)
3. Migrar `radke-bi` pra usar o template (testa fluxo `sync` real, primeiro caso de produção do massificado)
4. Aplicar template em segundo cliente real

---

## 9. Atalhos de Claude Code

Memory entries úteis:
- `reference_coolify_api_token.md` — token Coolify + UUIDs apps
- `reference_coolify_access.md` — dashboard
- `feedback_bgpserver.md` — não SSH BGPSERVER sem permissão
- `project_fin50_todo_radke.md` — pendências fin50

Prompts úteis:
- `"continuar projeto radke"` — Claude lê memory e segue
- `"criar BI novo pra <cliente> com Omie"` — Claude executa workflow completo
- `"fix bug no <cliente>: <descrição>"` — Claude investiga + corrige

---

**Boa. Qualquer dúvida, lê o BLUEPRINT.md ou pergunta no canal.**
