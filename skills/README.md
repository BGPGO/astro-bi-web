# Claude Code Skills do time BGP

Skills compartilhadas pelo time pra usar com Claude Code. Cada skill é um diretório
com `SKILL.md` que o Claude carrega quando o user digita `/<nome-da-skill>`.

## Skills disponíveis

| Skill | O que faz |
|---|---|
| `/novo-bi` | Cria BI standalone novo pra cliente BGP em ~30min (default fin40, suporta omie/conta-azul/manual-xlsx). Provisiona repo + adapter + Coolify + workflow GHA + validação paridade. |

## Como instalar (uma vez por máquina)

### Windows (PowerShell)

```powershell
# Clona o template se ainda não tem
gh repo clone BGPGO/bi-template C:\Projects\bi-template

# Roda o instalador
C:\Projects\bi-template\skills\install.ps1
```

### Mac / Linux

```bash
gh repo clone BGPGO/bi-template ~/projects/bi-template
bash ~/projects/bi-template/skills/install.sh
```

O script copia cada skill pra `~/.claude/skills/<nome>/SKILL.md`. Reabre o Claude
Code e a skill aparece no autocomplete `/`.

## Como atualizar quando time mexer numa skill

```bash
cd <pasta do bi-template>
git pull
# roda o install de novo (sobrescreve)
./skills/install.sh   # ou install.ps1
```

## Como adicionar skill nova (devs do time)

1. Cria diretório `skills/<nome>/`
2. Cria `SKILL.md` com frontmatter:
   ```
   ---
   name: <nome>
   description: <quando o claude deve usar>
   allowed-tools: Bash, Read, Write, Edit, ...
   ---

   # /<nome> — <título>

   <instruções pro Claude>
   ```
3. Atualiza tabela acima
4. Commit + push
5. Time roda `git pull && ./skills/install.sh`

## Diferença: skill vs prompt

- **Skill** (`/novo-bi`): registrada localmente em `~/.claude/skills/`. Aparece no
  autocomplete `/`, é descoberta automaticamente pelo Claude quando user pede algo
  relacionado.
- **Prompt** (ex: `PROMPT_NEW_FIN40_CLIENT.md`): texto pra colar manualmente quando
  você não tem a skill instalada. Mesma intenção, manual.

Pra desenvolvedores BGP, sempre instale as skills. Pra parceiros/freelas que vão
mexer pontualmente, mande o `PROMPT_*.md`.
