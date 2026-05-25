#!/bin/bash
# Instala todas as skills do BGP em ~/.claude/skills/
# Uso: bash install.sh

set -e

src="$(cd "$(dirname "$0")" && pwd)"
dst="${HOME}/.claude/skills"

mkdir -p "$dst"

count=0
for skill_dir in "$src"/*/; do
  [ -d "$skill_dir" ] || continue
  [ -f "${skill_dir}SKILL.md" ] || continue

  name=$(basename "$skill_dir")
  target="${dst}/${name}"
  mkdir -p "$target"
  cp -f "${skill_dir}SKILL.md" "${target}/SKILL.md"

  # Copia subdiretórios opcionais (references/, examples/, etc)
  for sub in "${skill_dir}"*/; do
    [ -d "$sub" ] || continue
    cp -rf "$sub" "$target/"
  done

  echo "  installed: /$name"
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "Nenhuma skill encontrada em $src"
  exit 1
fi

echo ""
echo "Instalado $count skill(s) em $dst"
echo "Reabra o Claude Code pra ver no autocomplete /"
