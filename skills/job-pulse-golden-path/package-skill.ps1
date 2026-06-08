# package-skill.ps1
# ----------------------------------------------------------------
# Package the job-pulse-golden-path skill folder into a .skill file
# (which is just a zip archive renamed). Run from PowerShell on
# Windows.
#
# Usage (from the skill folder):
#   .\package-skill.ps1
#
# Or from anywhere:
#   powershell -ExecutionPolicy Bypass -File "C:\Users\rahil\career-ops\skills\job-pulse-golden-path\package-skill.ps1"
# ----------------------------------------------------------------

param(
  [string]$SkillDir = "$PSScriptRoot",
  [string]$OutputDir = "$env:USERPROFILE\career-ops\output"
)

$skillName = Split-Path -Leaf $SkillDir
$zipPath   = Join-Path $OutputDir "$skillName.zip"
$skillPath = Join-Path $OutputDir "$skillName.skill"

# Sanity checks
if (-not (Test-Path (Join-Path $SkillDir "SKILL.md"))) {
  Write-Error "SKILL.md not found in $SkillDir — is this really a skill folder?"
  exit 2
}
if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Clean prior outputs
if (Test-Path $zipPath)   { Remove-Item $zipPath   -Force }
if (Test-Path $skillPath) { Remove-Item $skillPath -Force }

Write-Host "Packaging skill from: $SkillDir"
Write-Host "  -> $skillPath"
Write-Host ""

# Zip everything in the skill folder. Compress-Archive preserves
# subdirectories. We pass the folder contents (with trailing \*)
# so the zip's top level matches the skill name when unzipped.
Compress-Archive `
  -Path (Join-Path $SkillDir "*") `
  -DestinationPath $zipPath `
  -CompressionLevel Optimal

# Rename .zip -> .skill
Rename-Item -Path $zipPath -NewName "$skillName.skill"

if (Test-Path $skillPath) {
  $size = (Get-Item $skillPath).Length
  Write-Host ""
  Write-Host "OK: $skillPath" -ForegroundColor Green
  Write-Host "    size: $size bytes"
  Write-Host ""
  Write-Host "Install in any Cowork chat by dragging the .skill file into the chat,"
  Write-Host "or via the skills installer in your Claude desktop app."
} else {
  Write-Error "Packaging failed — $skillPath was not created."
  exit 3
}
