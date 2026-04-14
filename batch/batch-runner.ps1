param(
  [ValidateSet("codex", "manual", "auto")]
  [string]$Agent = "auto",

  [int]$Parallel = 1,

  [switch]$DryRun,

  [switch]$RetryFailed,

  [int]$StartFrom = 0,

  [int]$MaxRetries = 2
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$InputFile = Join-Path $ScriptDir "batch-input.tsv"
$StateFile = Join-Path $ScriptDir "batch-state.tsv"
$PromptFile = Join-Path $ScriptDir "batch-prompt.md"
$OutputSchemaFile = Join-Path $ScriptDir "batch-output-schema.json"
$LogsDir = Join-Path $ScriptDir "logs"
$TrackerDir = Join-Path $ScriptDir "tracker-additions"
$ManualDir = Join-Path $ScriptDir "manual-work-items"
$ReportsDir = Join-Path $ProjectDir "reports"
$LockFile = Join-Path $ScriptDir "batch-runner.pid"

function Resolve-AgentMode {
  param([string]$Requested)

  if ($Requested -eq "auto") {
    if (Get-Command codex -ErrorAction SilentlyContinue) { return "codex" }
    return "manual"
  }

  return $Requested
}

function Ensure-Prerequisites {
  if (!(Test-Path $InputFile)) { throw "ERROR: $InputFile not found. Add offers first." }
  if (!(Test-Path $PromptFile)) { throw "ERROR: $PromptFile not found." }
  if (!(Test-Path $OutputSchemaFile)) { throw "ERROR: $OutputSchemaFile not found." }

  New-Item -ItemType Directory -Force $LogsDir, $TrackerDir, $ReportsDir, $ManualDir | Out-Null
}

function Acquire-Lock {
  if (Test-Path $LockFile) {
    $oldPid = Get-Content $LockFile -ErrorAction SilentlyContinue
    if ($oldPid) {
      $existing = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
      if ($existing) {
        throw "ERROR: Another batch runner is already running (PID $oldPid)"
      }
    }

    Remove-Item $LockFile -ErrorAction SilentlyContinue
  }

  Set-Content $LockFile $PID
}

function Release-Lock {
  if (Test-Path $LockFile) {
    Remove-Item $LockFile -ErrorAction SilentlyContinue
  }
}

function Initialize-StateFile {
  if (!(Test-Path $StateFile)) {
    Set-Content $StateFile "id`turl`tstatus`tstarted_at`tcompleted_at`treport_num`tscore`terror`tretries"
  }
}

function Read-StateRows {
  if (!(Test-Path $StateFile)) { return @() }

  $rows = @()
  foreach ($line in Get-Content $StateFile) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("id`t")) { continue }

    $parts = $line -split "`t", 9
    if ($parts.Count -lt 9) { continue }

    $rows += [pscustomobject]@{
      id = $parts[0]
      url = $parts[1]
      status = $parts[2]
      started_at = $parts[3]
      completed_at = $parts[4]
      report_num = $parts[5]
      score = $parts[6]
      error = $parts[7]
      retries = $parts[8]
    }
  }

  return $rows
}

function Get-StateRow {
  param([string]$Id)

  return (Read-StateRows | Where-Object { $_.id -eq $Id } | Select-Object -First 1)
}

function Get-Status {
  param([string]$Id)

  $row = Get-StateRow $Id
  if ($row) { return $row.status }
  return "none"
}

function Get-Retries {
  param([string]$Id)

  $row = Get-StateRow $Id
  if ($row -and $row.retries) { return [int]$row.retries }
  return 0
}

function Update-State {
  param(
    [string]$Id,
    [string]$Url,
    [string]$Status,
    [string]$StartedAt,
    [string]$CompletedAt,
    [string]$ReportNum,
    [string]$Score,
    [string]$Error,
    [int]$Retries
  )

  Initialize-StateFile
  $rows = @(Read-StateRows | Where-Object { $_.id -ne $Id })
  $rows += [pscustomobject]@{
    id = $Id
    url = $Url
    status = $Status
    started_at = $StartedAt
    completed_at = $CompletedAt
    report_num = $ReportNum
    score = $Score
    error = $Error
    retries = [string]$Retries
  }

  $lines = @("id`turl`tstatus`tstarted_at`tcompleted_at`treport_num`tscore`terror`tretries")
  foreach ($row in ($rows | Sort-Object { [int]$_.id })) {
    $lines += "$($row.id)`t$($row.url)`t$($row.status)`t$($row.started_at)`t$($row.completed_at)`t$($row.report_num)`t$($row.score)`t$($row.error)`t$($row.retries)"
  }

  Set-Content $StateFile $lines
}

function Get-NextReportNum {
  $maxNum = 0

  if (Test-Path $ReportsDir) {
    Get-ChildItem $ReportsDir -Filter *.md | ForEach-Object {
      if ($_.BaseName -match '^(\d+)-') {
        $num = [int]$matches[1]
        if ($num -gt $maxNum) { $maxNum = $num }
      }
    }
  }

  foreach ($row in Read-StateRows) {
    if ($row.report_num -and $row.report_num -ne "-") {
      $num = [int]$row.report_num
      if ($num -gt $maxNum) { $maxNum = $num }
    }
  }

  return "{0:D3}" -f ($maxNum + 1)
}

function Extract-JsonField {
  param(
    [string]$Path,
    [string]$Field
  )

  if (!(Test-Path $Path)) { return $null }

  try {
    $json = Get-Content $Path -Raw | ConvertFrom-Json
    return $json.$Field
  } catch {
    return $null
  }
}

function Invoke-CodexWorker {
  param(
    [string]$ResolvedPrompt,
    [string]$ResultFile,
    [string]$LogFile
  )

  $command = 'codex --search exec --dangerously-bypass-approvals-and-sandbox -C "{0}" --output-schema "{1}" -o "{2}" - < "{3}" > "{4}" 2>&1' -f $ProjectDir, $OutputSchemaFile, $ResultFile, $ResolvedPrompt, $LogFile
  & cmd.exe /d /c $command
  $exitCode = $LASTEXITCODE
  return $exitCode
}

function Prepare-ManualWorkItem {
  param(
    [string]$ResolvedPrompt,
    [string]$ManualItemDir,
    [string]$ResultFile,
    [string]$LogFile
  )

  New-Item -ItemType Directory -Force $ManualItemDir | Out-Null
  Copy-Item $ResolvedPrompt (Join-Path $ManualItemDir "prompt.md") -Force

  @"
{
  "status": "prepared",
  "agent": "manual",
  "instructions": "Open prompt.md in Claude Code or Codex and execute the job manually. Save the final JSON result to result.json and generated outputs to the standard repo paths.",
  "prepared_at": "$(Get-Date -AsUTC -Format s)Z"
}
"@ | Set-Content (Join-Path $ManualItemDir "metadata.json")

  @"
{
  "status": "prepared",
  "id": null,
  "report_num": null,
  "company": null,
  "role": null,
  "score": null,
  "pdf": null,
  "report": null,
  "error": null
}
"@ | Set-Content $ResultFile

  @"
Prepared manual work item:
  prompt: $(Join-Path $ManualItemDir "prompt.md")
  metadata: $(Join-Path $ManualItemDir "metadata.json")
"@ | Set-Content $LogFile

  return 0
}

function Process-Offer {
  param(
    [pscustomobject]$Offer,
    [string]$ResolvedAgentMode
  )

  $id = [string]$Offer.id
  $url = $Offer.url
  $reportNum = Get-NextReportNum
  $date = Get-Date -Format "yyyy-MM-dd"
  $startedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  $retries = Get-Retries $id

  Write-Output "--- Processing offer #${id}: $url (report $reportNum, attempt $($retries + 1))"
  Update-State -Id $id -Url $url -Status "processing" -StartedAt $startedAt -CompletedAt "-" -ReportNum $reportNum -Score "-" -Error "-" -Retries $retries

  $resolvedPromptPath = Join-Path $ScriptDir ".resolved-prompt-$id.md"
  $resultFile = Join-Path $LogsDir "$reportNum-$id.result.json"
  $logFile = Join-Path $LogsDir "$reportNum-$id.log"
  $manualItemDir = Join-Path $ManualDir "$reportNum-$id"

  $resolvedPrompt = (Get-Content $PromptFile -Raw).
    Replace("{{URL}}", $url).
    Replace("{{JD_FILE}}", "/tmp/batch-jd-$id.txt").
    Replace("{{REPORT_NUM}}", $reportNum).
    Replace("{{DATE}}", $date).
    Replace("{{ID}}", $id)

  Set-Content $resolvedPromptPath $resolvedPrompt

  if ($ResolvedAgentMode -eq "codex") {
    $exitCode = Invoke-CodexWorker -ResolvedPrompt $resolvedPromptPath -ResultFile $resultFile -LogFile $logFile
  } else {
    $exitCode = Prepare-ManualWorkItem -ResolvedPrompt $resolvedPromptPath -ManualItemDir $manualItemDir -ResultFile $resultFile -LogFile $logFile
  }

  Remove-Item $resolvedPromptPath -ErrorAction SilentlyContinue

  $completedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

  if ($exitCode -eq 0) {
    $status = Extract-JsonField -Path $resultFile -Field "status"
    if ($status -eq "prepared") {
      Update-State -Id $id -Url $url -Status "prepared" -StartedAt $startedAt -CompletedAt $completedAt -ReportNum $reportNum -Score "-" -Error "-" -Retries $retries
      Write-Output "    Prepared manual work item (report: $reportNum)"
      return
    }

    if ($status -eq "failed") {
      $errorMessage = Extract-JsonField -Path $resultFile -Field "error"
      if ([string]::IsNullOrWhiteSpace($errorMessage)) { $errorMessage = "Worker returned failed status without an error message." }
      Update-State -Id $id -Url $url -Status "failed" -StartedAt $startedAt -CompletedAt $completedAt -ReportNum $reportNum -Score "-" -Error $errorMessage -Retries ($retries + 1)
      Write-Output "    Failed (worker returned failed status)"
      return
    }

    $score = Extract-JsonField -Path $resultFile -Field "score"
    if ($null -eq $score -or $score -eq "") { $score = "-" }
    Update-State -Id $id -Url $url -Status "completed" -StartedAt $startedAt -CompletedAt $completedAt -ReportNum $reportNum -Score ([string]$score) -Error "-" -Retries $retries
    Write-Output "    Completed (score: $score, report: $reportNum)"
    return
  }

  $retries += 1
  $errorMessage = ""
  if (Test-Path $logFile) {
    $errorMessage = ((Get-Content $logFile | Select-Object -Last 5) -join " ")
    if ($errorMessage.Length -gt 200) { $errorMessage = $errorMessage.Substring(0, 200) }
  }
  if ([string]::IsNullOrWhiteSpace($errorMessage)) { $errorMessage = "Unknown error (exit code $exitCode)" }
  Update-State -Id $id -Url $url -Status "failed" -StartedAt $startedAt -CompletedAt $completedAt -ReportNum $reportNum -Score "-" -Error $errorMessage -Retries $retries
  Write-Output "    Failed (attempt $retries, exit code $exitCode)"
}

function Merge-And-Verify {
  Write-Output ""
  Write-Output "=== Merging tracker additions ==="
  node (Join-Path $ProjectDir "merge-tracker.mjs")
  Write-Output ""
  Write-Output "=== Verifying pipeline integrity ==="
  try {
    node (Join-Path $ProjectDir "verify-pipeline.mjs")
  } catch {
    Write-Warning "Verification found issues."
  }
}

function Print-Summary {
  Write-Output ""
  Write-Output "=== Batch Summary ==="

  if (!(Test-Path $StateFile)) {
    Write-Output "No state file found."
    return
  }

  $rows = Read-StateRows
  $completed = @($rows | Where-Object { $_.status -eq "completed" }).Count
  $prepared = @($rows | Where-Object { $_.status -eq "prepared" }).Count
  $failed = @($rows | Where-Object { $_.status -eq "failed" }).Count
  $pending = @($rows | Where-Object { $_.status -notin @("completed", "prepared", "failed") }).Count
  Write-Output "Total: $($rows.Count) | Completed: $completed | Prepared: $prepared | Failed: $failed | Pending: $pending"
}

function Get-PendingOffers {
  $offers = @()

  foreach ($line in Get-Content $InputFile) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("id`t")) { continue }

    $parts = $line -split "`t", 4
    if ($parts.Count -lt 4) { continue }
    if ([int]$parts[0] -lt $StartFrom) { continue }

    $id = [string]$parts[0]
    $status = Get-Status $id

    if ($RetryFailed) {
      if ($status -ne "failed") { continue }
      if ((Get-Retries $id) -ge $MaxRetries) { continue }
    } else {
      if ($status -eq "completed" -or $status -eq "prepared" -or $status -eq "failed") { continue }
    }

    $offers += [pscustomobject]@{
      id = $parts[0]
      url = $parts[1]
      source = $parts[2]
      notes = $parts[3]
    }
  }

  return @($offers)
}

function Invoke-BatchRunner {
  $lockAcquired = $false
  $inputCount = @(Get-Content $InputFile | Where-Object { $_ -and -not $_.StartsWith("id`t") }).Count

  Ensure-Prerequisites
  $resolvedAgentMode = Resolve-AgentMode $Agent

  if ($Parallel -gt 1) {
    Write-Warning "Parallel execution is not implemented in batch-runner.ps1 yet. Running sequentially."
    $Parallel = 1
  }

  if (-not $DryRun) {
    Acquire-Lock
    $lockAcquired = $true
  }

  Initialize-StateFile
  $offers = @(Get-PendingOffers)

  Write-Output "=== career-ops batch runner (PowerShell) ==="
  Write-Output "Agent: $resolvedAgentMode"
  Write-Output "Parallel: $Parallel | Max retries: $MaxRetries"
  Write-Output "Input: $inputCount offers"
  Write-Output ""

  if ($offers.Count -eq 0) {
    Write-Output "No offers to process."
    Print-Summary
    if ($lockAcquired) { Release-Lock }
    return
  }

  Write-Output "Pending: $($offers.Count) offers"
  Write-Output ""

  if ($DryRun) {
    Write-Output "=== DRY RUN (no processing) ==="
    foreach ($offer in $offers) {
      $status = Get-Status ([string]$offer.id)
      Write-Output "  #$($offer.id): $($offer.url) [$($offer.source)] (status: $status)"
    }
    Write-Output ""
    Write-Output "Would process $($offers.Count) offers"
    return
  }

  foreach ($offer in $offers) {
    Process-Offer -Offer $offer -ResolvedAgentMode $resolvedAgentMode
  }

  Merge-And-Verify
  Print-Summary

  if ($lockAcquired) { Release-Lock }
}

Invoke-BatchRunner
