# Prompt template — bootstrap pra qualquer máquina

Use este prompt em **qualquer terminal Claude Code**, qualquer máquina. Ele NÃO
assume que existem pastas locais — clona tudo do GitHub.

---

## Versão BOOTSTRAP (cole no terminal Claude Code, qualquer máquina)

```
Vou trabalhar no ecossistema BGP BI. Estou começando do zero nessa máquina.

PRIMEIRO PASSO — bootstrap:
1. Garanta que existe a pasta C:\Projects\ (ou %USERPROFILE%\Projects\ no Windows,
   ~/Projects no Mac/Linux). Se não existir, crie.
2. Se C:\Projects\bi-blueprint não existe ainda, clone:
   gh repo clone BGPGO/bi-blueprint C:/Projects/bi-blueprint
3. Se C:\Projects\bi-template não existe ainda, clone:
   gh repo clone BGPGO/bi-template C:/Projects/bi-template
4. LEIA NESTA ORDEM:
   - C:\Projects\bi-template\CLAUDE.md       ← define modo AUTÔNOMO. Lê primeiro.
   - C:\Projects\bi-template\QUICK_START.md  (20-min onboarding)
   - C:\Projects\bi-blueprint\BLUEPRINT.md   (arquitetura)
   - C:\Projects\bi-blueprint\ANTI_PATTERNS.md  (20 bugs reais)
   - C:\Projects\bi-blueprint\CHECKLIST.md   (pre-flight)
   - C:\Projects\bi-blueprint\MASSIFICATION.md  (fleet)

COMPORTAMENTO (do CLAUDE.md):
- Modo autônomo. Você JÁ TEM permissão pra: gh repo create no org BGPGO, gh
  repo clone, npm install, node bgp-bi.cjs (qualquer subcomando), git
  add/commit/push, editar arquivos, criar adapters, ajustar bi.config.js.
- NÃO pergunta "posso rodar X?" pra comandos padrão de git/gh/npm/node.
- Pergunta APENAS em decisões de escopo (telas, branding, cliente),
  credenciais que faltam, ou ambiguidade real de dados.

PRÉ-REQUISITOS (verifica antes; se falhar, avisa o user):
- node --version  (>= 18)
- gh auth status  (logado em github.com no org BGPGO)
- git --version

REGRAS NÃO-NEGOCIÁVEIS:
1. Hooks no topo do componente, antes de early returns. Anti-pattern A2.
2. Todo filtro/dropdown na UI tem que filtrar de fato. Decorativo = REMOVE.
3. Cards reativos a (year, month, statusFilter, drilldown) — useMemo(getBit).
4. Smoke test obrigatório antes de push: node bgp-bi.cjs build.
5. Pre-flight CHECKLIST.md antes de mostrar pro cliente.
6. NUNCA confie em classificações pré-computadas em XLSX. Recompute.
7. Faturamento ERP: validar com cliente. PEDIDO+Autorizado padrão.

REPOS DISPONÍVEIS NO ORG BGPGO:
- BGPGO/bi-blueprint   docs canonicals (blueprint + anti-patterns + checklist)
- BGPGO/bi-template    template canonical pra clonar (Template Repository)
- BGPGO/<cliente>-bi-web  repos de cliente individual

CLIENTE EM PRODUÇÃO COMO REFERÊNCIA: BGPGO/radke-bi-web
- Live: https://radke-bi.187.77.238.125.sslip.io
- ~30 ondas de iteração, casos reais documentados em ANTI_PATTERNS.md

MEU OBJETIVO AGORA:
[ESCOLHA E APAGUE AS OUTRAS]

A) Continuar trabalho em cliente existente <CLIENTE>:
   - Repo: BGPGO/<cliente>-bi-web
   - Tarefa: <descrição do que precisa fazer>

B) Criar BI novo pro cliente <NOME>:
   - Slug do repo: <nome>-bi-web
   - Fontes: <omie | conta-azul | manual-xlsx | adapter customizado>
   - Pages active: <overview, receita, despesa, fluxo, comparativo, ...>
   - Pages upsell PRO (mostra mas sem dados): <valuation, relatorio_ia, ...>
   - Path Drive (se aplicável): G:\Meu Drive\BGP\CLIENTES\BI\<numero>. <NOME>\BASES
   - Especificidades: <multi-empresa, filtro extra, etc>

C) Atualizar cliente <X> com fix do template:
   <descrição do fix>

D) Outro: <descreva>

EXECUTE: faz o bootstrap (passos 1-4), confirma os pré-requisitos, resume
em 3 linhas o que entendeu do objetivo, e começa a executar.
NÃO pede permissão pra clonar/install/build — só pra escopo.
```

---

## Versão CURTA (pra dev experiente que já tem tudo localizado)

```
Modo autônomo BGP BI.

Lê primeiro: C:\Projects\bi-template\CLAUDE.md

Tarefa: <descrição direta>

Executa o workflow padrão. Pergunta só em decisão de escopo.
```

---

## Quando usar qual

| Versão | Pra quem | Estado da máquina |
|---|---|---|
| **Bootstrap** | Qualquer pessoa, qualquer terminal | Zero — vai clonar tudo |
| **Curta** | Dev experiente | Já tem `bi-template` + `bi-blueprint` clonados |

---

## Como saber se já tem tudo

Roda esses comandos no terminal — se TODOS retornarem path, está bootstrappado:

```bash
ls C:\Projects\bi-blueprint\BLUEPRINT.md
ls C:\Projects\bi-template\CLAUDE.md
gh auth status
node --version
```

Se algum falhar, use a versão Bootstrap.
