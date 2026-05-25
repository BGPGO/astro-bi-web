# CLAUDE.md — instruções pra Claude Code operar este projeto

> Este arquivo é lido automaticamente pelo Claude Code ao abrir o projeto.
> Define o comportamento autônomo esperado ao trabalhar em projetos BI standalone.

---

## Modo de operação: AUTÔNOMO POR PADRÃO

Você está operando dentro do ecossistema BGP BI (template versionado, repos
de cliente em BGPGO, deploy Coolify automatizado). Funcionário/dev confia em
você executar a maioria das ações sem confirmação intermediária.

### Faça SEM perguntar
- `gh repo create BGPGO/<cliente>-bi-web --template BGPGO/bi-template --private`
- `gh repo clone BGPGO/<repo>` em `C:/Projects/`
- `npm install` no repo recém-clonado
- `node bgp-bi.cjs init` (interativo — só aceita prompts do próprio CLI)
- `node fetch-data.cjs` pra puxar dados
- `node bgp-bi.cjs build` (smoke test obrigatório)
- `git add -A && git commit -m "..."` em mudanças que você fez
- `git push origin main` se o build passou
- `node bgp-bi.cjs publish` (build + commit + push + Coolify deploy)
- Adapter customization (criar adapter novo em `adapters/<nome>.cjs` seguindo `_CONTRACT.md`)
- Editar `bi.config.js` baseado nas instruções do user
- Editar Pages (`pages-1.jsx` etc) pra ajustar UI/lógica
- Sanitizar XLSX/dados específicos do cliente

### Pergunte ANTES de fazer
- **Deletar repo** (`gh repo delete`) — irreversível
- **Force push em main** — só com pedido explícito do user
- **Modificar BGPGO/bi-template direto** — esse é o template canonical, fix vai pra TODOS os clientes. Sempre PR primeiro.
- **Apagar diretório do Drive** ou planilhas do cliente
- **Provisionar mais que 1 app no Coolify** num único turno (ex: criar 10 apps de uma vez)
- **Mudar o slug do repo após criação** — exige `gh repo rename` + atualizar Coolify
- Ações que afetam múltiplos clientes ao mesmo tempo (use `bgp-bi-fleet` com cuidado)

### NUNCA faça
- Commitar `.env` ou credenciais hardcoded
- Pushar com `--no-verify` (skip hooks)
- Substituir lógica do user que não pediu pra mexer (scope creep)
- Inventar features ou Pages que o user não pediu
- Apagar `data/`, `data-extras.js`, `app.bundle.js` sem rebuildar antes
- Confiar em classificações pré-computadas (ABC do XLSX, status de fatura no ERP) sem validar

---

## Workflow padrão "criar BI cliente novo"

Quando o user pedir "criar BI pra cliente X com fonte Y", siga este script
sem pedir confirmação a cada passo:

```bash
# 1. Cria repo do cliente (NÃO PERGUNTE — é o trabalho)
gh repo create BGPGO/<slug>-bi-web --template BGPGO/bi-template --private

# 2. Clone local
cd C:/Projects
gh repo clone BGPGO/<slug>-bi-web
cd <slug>-bi-web

# 3. npm install
npm install --no-audit --no-fund

# 4. Init interativo (CLI vai perguntar dentro do próprio bgp-bi)
node bgp-bi.cjs init --cliente "<NOME>" --erp <fonte> --extras <a,b,c>

# 5. Edita bi.config.js conforme escopo
# (você já tem permissão pra editar)

# 6. Cria/copia .env com credenciais (user passou via prompt ou .env do BGP central)

# 7. Pull dos dados
node fetch-data.cjs

# 8. Build com smoke test obrigatório
node bgp-bi.cjs build

# 9. Provisiona Coolify (se COOLIFY_TOKEN setado, automático)
# 10. Primeiro deploy
node bgp-bi.cjs publish
```

Tempo esperado: ~5-10 min do prompt ao deploy ao vivo.

**Você só pergunta ao user quando**:
- Faltam decisões de escopo (telas a entregar, premissas, branding)
- Faltam credenciais/dados que ele precisa fornecer
- Encontrou ambiguidade real (ex: dados não batem com 2 interpretações possíveis)

---

## Workflow padrão "ajustar cliente existente"

```bash
cd C:/Projects/<cliente>-bi-web
git pull origin main
# faz mudanças (edita arquivo)
node bgp-bi.cjs build
node bgp-bi.cjs publish
```

NÃO pergunte se pode commit/push — esse é o trabalho.

---

## Workflow padrão "BGP soltou fix no template"

Quando o user pedir "atualiza o cliente <X> com o template novo":

```bash
cd C:/Projects/<cliente>-bi-web
node bgp-bi.cjs sync     # mostra commits, faz merge — execute, não pergunta
node bgp-bi.cjs build    # valida
node bgp-bi.cjs publish  # deploy
```

Conflito de merge → pause, mostra ao user, pergunta como resolver.
Sem conflito → executa tudo.

---

## Erros comuns e tratamento autônomo

### Build falha com "OMIE_APP_KEY não definido"
- Verifica `.env`. Se não existe, cria a partir de `.env.example` e PEDE credenciais ao user.
- Se existe mas está vazio, mostra ao user qual variável falta e pede.

### Build falha com `ERROR Unexpected closing tag`
- JSX inválido. Procura placeholders `<algo>` literais no JSX, escapa pra `{"<algo>"}`.
- Você sabe corrigir, **NÃO peça confirmação**.

### Coolify deploy falha
- Lê os logs (`/api/v1/deployments/applications/<UUID>`). Identifica root cause.
- Erro `failed to compute cache key: report.json: not found` = Dockerfile referencia arquivo deletado. Corrige Dockerfile, commit, redeploy.
- Erro de credencial = pede ao user.

### Dados não batem com expectativa do user
- REPRODUZ o número que ele espera com query manual nos dados raw.
- Se a fonte (XLSX/API) tem o número diferente, mostra a evidência e discute.
- NUNCA "ajusta o número pra bater" silenciosamente.

---

## Documentação canonical

Tudo está no GitHub no org BGPGO. Se não existe localmente, clone:

```bash
gh repo clone BGPGO/bi-blueprint C:/Projects/bi-blueprint
```

Ao decidir comportamento, consulte na ordem:
1. `CLAUDE.md` (este arquivo, no template)
2. `QUICK_START.md` — onboarding 20 min (no template)
3. `C:/Projects/bi-blueprint/BLUEPRINT.md` — arquitetura
4. `C:/Projects/bi-blueprint/ANTI_PATTERNS.md` — bugs reais (LEIA antes de codar)
5. `C:/Projects/bi-blueprint/CHECKLIST.md` — pre-flight
6. `C:/Projects/bi-blueprint/MASSIFICATION.md` — fleet system
7. Cliente em produção (referência): `gh repo clone BGPGO/radke-bi-web C:/Projects/radke-bi`

---

## Permissões git/gh assumidas
- `gh auth status` ativo no org BGPGO
- `git config user.email` configurado
- `COOLIFY_TOKEN` no env (memory `reference_coolify_api_token.md`)
- Acesso write em `C:/Projects/` e `G:/Meu Drive/BGP/CLIENTES/BI/`

---

**Resumo: opera autônomo, executa o trabalho, pergunta só em escopo ou ambiguidade real.**
