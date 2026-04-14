param(
  [Parameter(Mandatory = $true)]
  [string]$CodexPath,

  [Parameter(Mandatory = $true)]
  [string]$ProjectDir,

  [Parameter(Mandatory = $true)]
  [string]$OutputSchemaFile,

  [Parameter(Mandatory = $true)]
  [string]$ResultFile,

  [Parameter(Mandatory = $true)]
  [string]$PromptFile
)

$prompt = Get-Content -Raw $PromptFile
$arguments = @(
  "--search",
  "exec",
  "--dangerously-bypass-approvals-and-sandbox",
  "-C",
  $ProjectDir,
  "--output-schema",
  $OutputSchemaFile,
  "-o",
  $ResultFile,
  "-"
)

$prompt | & $CodexPath @arguments
exit $LASTEXITCODE
