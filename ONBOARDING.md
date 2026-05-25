# ONBOARDING — Funcionário novo criando BI cliente

Bem-vindo. Este guia leva você do zero ao **primeiro deploy em ~1 hora**.

---

## Pré-requisitos (5 min)

Confirme que tem instalado:
- **Node.js 18+** — `node -v`
- **Git** — `git --version`
- **GitHub CLI** — `gh --version`
- **Claude Code** — para usar prompts no terminal

E credenciais:
- Acesso ao org `BGPGO` no GitHub (peça pro gerente)
- Token Coolify (.env do template tem placeholder)
- Credenciais do ERP do cliente (Omie/Conta Azul/etc)
- Acesso à pasta `G:\Meu Drive\BGP\CLIENTES\BI\` no Drive

---

## Passo 1 — criar repo do cliente (5 min)

Abra Claude Code no terminal e use este prompt:

```
crie um BI novo pro cliente <NOME DO CLIENTE> usando o template
BGPGO/bi-template, com fonte de dados Omie e as Pages
faturamento_produto, curva_abc, e crm_omie.
```

Claude Code vai executar:

```bash
gh repo create BGPGO/<cliente>-bi-web --template BGPGO/bi-template --private
gh repo clone BGPGO/<cliente>-bi-web
cd <cliente>-bi-web
node bgp-bi.cjs init --cliente "<NOME>" --erp omie --extras faturamento_produto,curva_abc,crm_omie
```

Você vai ser perguntado:
- Subdomain pro Coolify (default = `<cliente>-bi`)
- Provisionar Coolify agora? (S/n)

---

## Passo 2 — preencher credenciais (10 min)

Abra `.env` e preencha:

```
OMIE_APP_KEY=<key do cliente>
OMIE_APP_SECRET=<secret do cliente>
COOLIFY_TOKEN=<token compartilhado BGP>
ANTHROPIC_API_KEY=<opcional, pra relatório IA on-the-fly>
```

Abra `bi.config.js` e ajuste:

```js
fontes: {
  drive: {
    base_path: "G:/Meu Drive/BGP/CLIENTES/BI/<NUMERO>. <CLIENTE>/BASES",
  },
  omie: {
    bancos_ok: ["033", "748", "756"],   // confirmar com o cliente
  },
},
```

---

## Passo 3 — primeiro build (5 min)

```bash
node bgp-bi.cjs build
```

Vai rodar:
1. `build-data.cjs` — pull Omie completo (~30s)
2. `build-data-extras.cjs` — lê XLSX do Drive (se tiver Pages opcionais ativadas)
3. `build-jsx.cjs` — bundle JSX
4. Smoke test (parse + runtime)

Se algum passo falhar, leia a mensagem e corrija. Padrões comuns:
- `OMIE_APP_KEY` errada → revisar .env
- Path Drive não existe → conferir `bi.config.js > fontes.drive.base_path`
- TDZ ou hooks order → contatar o gerente (provavelmente bug do template)

---

## Passo 4 — primeiro deploy (5 min)

```bash
node bgp-bi.cjs publish
```

Vai fazer:
1. Build (de novo, segurança)
2. `git add -A && git commit && git push`
3. Trigger Coolify deploy via API
4. Polling até `status=finished`
5. Imprimir URL final

Em ~30 seg, vai aparecer:
```
✓ deploy OK em https://<cliente>-bi.187.77.238.125.sslip.io
```

Abre no browser, valida que carrega. **Pronto, primeiro BI no ar.**

---

## Passo 5 — adaptar pro cliente (variável)

Customizações típicas:
- **Branding**: trocar logo em `assets/`, ajustar cor primária
- **Banco filter**: confirmar `bancos_ok` (códigos diferem por cliente)
- **Pages opcionais**: ativar/desativar conforme demanda
- **Metas CRM**: ajustar `meta.metas_crm` em bi.config.js
- **Premissas Valuation**: ajustar `meta.valuation_premissas`

Pra cada mudança:
```bash
node bgp-bi.cjs build      # valida
node bgp-bi.cjs publish    # deploy
```

---

## Passo 6 — validar com cliente

Antes de mostrar pro cliente, leia o **CHECKLIST.md** do bi-blueprint e verifica
TODOS os 12 grupos. Não pula.

Ponto-chave: **dados do BI batem com a fonte oficial do cliente** (PBI, Excel,
ERP). Se não bater, NÃO mostra. Investiga primeiro.

---

## Manutenção contínua

### Cliente reporta bug ou feature
```bash
gh repo clone BGPGO/<cliente>-bi-web
cd <cliente>-bi-web
# edita arquivos
node bgp-bi.cjs build
node bgp-bi.cjs publish
```

### Update do template (mensal ou quando BGP soltar fix)
```bash
node bgp-bi.cjs sync     # mostra commits novos do template, faz merge
node bgp-bi.cjs build    # valida
node bgp-bi.cjs publish  # deploy
```

### Cliente saiu (offboarding)
```bash
gh repo archive BGPGO/<cliente>-bi-web
# avise gerente pra deletar app no Coolify
```

---

## FAQ

**Q: deploy falhou com `failed to compute cache key: report.json: not found`**
A: Dockerfile referencia arquivo deletado. Edita Dockerfile, remove a linha COPY problemática.

**Q: tela preta após deploy**
A: Bug clássico de hooks order ou TDZ. Roda `node bgp-bi.cjs build` localmente — o smoke test deveria pegar antes do deploy. Se passou no smoke mas tela preta no browser, abra DevTools (F12) e veja Console — provavelmente "Rendered more hooks" ou "Cannot access X before init".

**Q: filtro de mês não funciona**
A: Componente recebe `month` prop? Bug clássico. Veja anti-pattern A13 no bi-blueprint/ANTI_PATTERNS.md.

**Q: número não bate com o cliente**
A: Pegar o número exato que ele espera, reproduzir. Se a fonte (XLSX/API) tem o número diferente, mostrar e discutir. Não invente.

**Q: como saber se template está atualizado?**
A: `node bgp-bi.cjs sync` mostra delta. Ou `cat package.json | grep templateVersion` e compare com `BGPGO/bi-template`.

---

## Recursos

- `bi-blueprint/BLUEPRINT.md` — arquitetura completa
- `bi-blueprint/CHECKLIST.md` — pre-flight de release
- `bi-blueprint/ANTI_PATTERNS.md` — 20 bugs reais e como evitar
- `bi-blueprint/MASSIFICATION.md` — sistema de fleet
- `COMMANDS.md` — cheatsheet de comandos comuns
- Issues do `BGPGO/bi-template` no GitHub
- Discord/Slack do BGP em `#bi-team`

---

**Bem-vindo ao time. Bom trampo.**
