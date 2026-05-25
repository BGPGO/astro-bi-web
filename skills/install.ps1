# Instala todas as skills do BGP em ~/.claude/skills/
# Uso: .\install.ps1

$ErrorActionPreference = "Stop"
$src = Join-Path $PSScriptRoot "."
$dst = Join-Path $env:USERPROFILE ".claude\skills"

New-Item -ItemType Directory -Force -Path $dst | Out-Null

$skills = Get-ChildItem -Path $src -Directory | Where-Object { Test-Path (Join-Path $_.FullName "SKILL.md") }

if ($skills.Count -eq 0) {
    Write-Host "Nenhuma skill encontrada em $src"
    exit 1
}

foreach ($skill in $skills) {
    $name = $skill.Name
    $target = Join-Path $dst $name
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -Force "$($skill.FullName)\SKILL.md" "$target\SKILL.md"
    # Copia subdiretorios opcionais (references/, examples/, etc)
    Get-ChildItem -Path $skill.FullName -Directory | ForEach-Object {
        Copy-Item -Recurse -Force $_.FullName $target
    }
    Write-Host "  installed: /$name"
}

Write-Host ""
Write-Host "Instalado $($skills.Count) skill(s) em $dst"
Write-Host "Reabra o Claude Code pra ver no autocomplete /"
