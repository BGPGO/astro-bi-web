# COMMANDS — Cheatsheet de comandos comuns

## bgp-bi (CLI principal)

| Comando | O que faz |
|---|---|
| `node bgp-bi.cjs init` | Setup inicial (bi.config.js, .env, Coolify provisioning) |
| `node bgp-bi.cjs build` | Build + smoke test (data + extras + jsx + runtime check) |
| `node bgp-bi.cjs publish` | Build + commit + push + Coolify deploy + polling |
| `node bgp-bi.cjs sync` | Pull updates do bi-template via git merge |
| `node bgp-bi.cjs --help` | Ajuda |

## ETL granular (raramente usado, prefira `bgp-bi build`)

| Comando | O que faz |
|---|---|
| `node build-data.cjs` | Pull Omie completo, gera `data.js` |
| `node build-data-extras.cjs` | Lê XLSX do Drive, gera `data-extras.js` |
| `node build-jsx.cjs` | Bundle de `components.jsx + pages-*.jsx` em `app.bundle.js` |
| `node generate-report.cjs` | Gera `report.json` via Anthropic API (offline) |

## Git + GitHub (gh CLI)

| Comando | O que faz |
|---|---|
| `gh repo create BGPGO/<cliente>-bi-web --template BGPGO/bi-template --private` | Cria repo do cliente |
| `gh repo clone BGPGO/<cliente>-bi-web` | Clona localmente |
| `gh repo archive BGPGO/<cliente>-bi-web` | Arquiva (offboarding) |
| `git remote -v` | Lista remotes |
| `git remote add template git@github.com:BGPGO/bi-template.git` | Adiciona template como remote |
| `git fetch template main` | Pull updates do template |
| `git log local..template/main --oneline` | Ver commits novos do template |

## Coolify (via API REST)

```bash
# Listar apps
curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "http://$COOLIFY_HOST/api/v1/applications" | jq '.[] | {name, uuid, fqdn, status}'

# Trigger deploy manual
curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "http://$COOLIFY_HOST/api/v1/deploy?uuid=<APP_UUID>&force=false"

# Status do último deploy
curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "http://$COOLIFY_HOST/api/v1/deployments/applications/<APP_UUID>" | jq '.deployments[0] | {status, commit}'
```

## Validação manual

```bash
# Bundle parseia?
node -e "new Function(require('fs').readFileSync('app.bundle.js','utf8')); console.log('OK')"

# data.js executa?
node -e "global.window={};window.BIT_FILTER='realizado';eval(require('fs').readFileSync('data.js','utf8'));console.log(Object.keys(window.BIT))"

# Quantos lançamentos a-vencer >= hoje?
node -e "
const fs=require('fs');
global.window={};window.BIT_FILTER='realizado';
eval(fs.readFileSync('data.js','utf8'));
const apr=window.ALL_TX.filter(r=>r[6]===0);
const today=new Date().toISOString().slice(0,7);
const futuras=apr.filter(r=>r[1]>=today);
console.log('A-vencer >= hoje:', futuras.length);
"

# MD5 do bundle local vs deployado
md5sum app.bundle.js
curl -s "https://<subdomain>.187.77.238.125.sslip.io/app.bundle.js" | md5sum
```

## Debug típico

```bash
# Tela preta após deploy → testar bundle em Node
node -e "
const fs=require('fs');
const stub = \`
  const __React = { useState: i => [typeof i==='function'?i():i,()=>{}], useEffect:()=>{}, useMemo: f=>f(), useRef: i=>({current:i}), Fragment:'F', createElement: (t,p,...c)=>typeof t==='function'?t(p||{}):{t,p,c} };
  global.window={}; window.BIT_FILTER='realizado';
  global.document={getElementById:()=>({}),body:{classList:{add:()=>{},remove:()=>{}}},querySelectorAll:()=>[],fonts:{ready:Promise.resolve()}};
  global.localStorage={getItem:()=>null,setItem:()=>{}};
  global.fetch=()=>Promise.resolve({ok:false,status:404});
  global.React=__React; global.ReactDOM={createRoot:()=>({render:()=>{}})};
  global.requestAnimationFrame=f=>setTimeout(f,0); global.cancelAnimationFrame=()=>{};
\`;
try {
  new Function(stub + fs.readFileSync('data.js','utf8') + ';' + fs.readFileSync('data-extras.js','utf8') + ';' + fs.readFileSync('app.bundle.js','utf8'))();
  console.log('runtime OK');
} catch(e) {
  console.error('CRASH:', e.message, e.stack.split('\n')[0]);
}
"

# Testar Page específica
# (substitua PageX pelo nome do componente)
```

## Limpeza/reset

```bash
# Apagar build artifacts (regenera com bgp-bi build)
rm -f data.js data-extras.js app.bundle.js
rm -rf data/ data-extras/

# Apagar reports cacheados (força regeneração)
rm -f report*.json
```

## Prompts úteis pra Claude Code

```
"adapte o bi.config.js pra esse cliente: <descrição>"
"o build-data falhou com X, descubra a causa raiz"
"adicione a Page <nome> ao bi.config.js e faça build"
"preciso debug: a tela <X> mostra <comportamento errado>"
"sync com o template e me diga o que mudou"
```

---

Última atualização: 2026-05-05
