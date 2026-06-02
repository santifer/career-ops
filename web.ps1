# Lanceur dashboard career-ops (PowerShell)
# Usage : .\web.ps1   (depuis n'importe ou)
# Fixe le workaround TLS Windows (--use-system-ca) puis lance le serveur web.

$ErrorActionPreference = 'Stop'

# Se placer a la racine du projet (dossier de ce script), pas dans .git
Set-Location -LiteralPath $PSScriptRoot

$env:NODE_OPTIONS = '--use-system-ca'

Write-Host "career-ops dashboard -> http://127.0.0.1:5757/  (Ctrl+C pour arreter)" -ForegroundColor Cyan
npm run web
