# BGP BI Template

Repositório-template pra criar BIs de cliente standalone. Cada cliente novo
clona deste template e tem CLI próprio (`bgp-bi`) pra build, deploy e sync.

> **Marcado como "Template repository" no GitHub.** Para criar repo cliente:
> `gh repo create BGPGO/<cliente>-bi-web --template BGPGO/bi-template --private`

---

## Quick start

```bash
# 1) Cria repo do cliente a partir deste template
gh repo create BGPGO/<cliente>-bi-web --template BGPGO/bi-template --private
gh repo clone BGPGO/<cliente>-bi-web
cd <cliente>-bi-web

# 2) Setup inicial — bi.config.js, .env, Coolify provisioning
node bgp-bi.cjs init

# 3) Preenche credenciais em .env

# 4) Build local (com smoke test obrigatório)
node bgp-bi.cjs build

# 5) Primeiro deploy
node bgp-bi.cjs publish
```

---

## Estrutura

```
bi-template/
├─ bgp-bi.cjs                # CLI: init, build, publish, sync
├─ bi.config.example.js      # Template do bi.config.js (cliente copia)
├─ ONBOARDING.md             # Guia funcionário novo (1h até deploy)
├─ COMMANDS.md               # Cheatsheet
├─ package.json              # com templateVersion semver
├─ index.html
├─ styles.css
├─ build-data.cjs            # ETL Omie (genérico)
├─ build-data-extras.cjs     # ETL XLSX (lê paths do bi.config.js)
├─ build-jsx.cjs             # Bundle JSX (lê pages do bi.config.js)
├─ Dockerfile + nginx.conf
├─ assets/                   # Logos placeholder (cliente substitui)
├─ components.jsx            # UI core
├─ pages-core/               # Pages obrigatórias
└─ pages-extras/             # Pages opcionais (cliente ativa via bi.config.js)
```

---

## CLI `bgp-bi`

| Comando | O que faz |
|---|---|
| `init` | Cria `bi.config.js` + `.env` + provisiona app no Coolify |
| `build` | Build (data + extras + jsx) + smoke test (parse + runtime). Aborta em erro. |
| `publish` | Build → commit → push → Coolify deploy → polling até OK |
| `sync` | Pull updates deste template via merge |

Detalhes: `node bgp-bi.cjs --help`

---

## Versionamento

`package.json > templateVersion` segue semver.
- `1.0.x` — bug fixes
- `1.x.0` — features novas (Page nova catalogada)
- `2.0.0` — breaking change (schema bi.config.js)

---

## Documentação

- **`ONBOARDING.md`** — funcionário novo, primeiro deploy
- **`COMMANDS.md`** — cheatsheet de comandos
- **`bi-blueprint/`** (Drive: `00. PADRÕES`) — arquitetura, anti-patterns, checklist

---

## Política

- **Não mexa nesse template direto.** Abra issue ou PR pra revisão.
- Bug genérico encontrado num cliente? Cria PR aqui após resolver lá.
- BGP core (Thomas + seniors) merge no template.
- Cada release tem changelog em `CHANGELOG.md` (TODO).

---

Última atualização: 2026-05-05
