# auto-pipeline.ps1
# Pulse Engine 3.0 - Automated job pipeline
# Runs: Scan -> Referral Check -> Auto-Apply -> Log
# Schedule via Windows Task Scheduler (daily, headless)

param(
  [switch]$DryRun,
  [switch]$ScanOnly
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$logFile = Join-Path $ScriptDir "data\pipeline.log"

function Log($msg) {
  $line = "[$timestamp] $msg"
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

Log "=== auto-pipeline START ==="
Log "DryRun: $DryRun | ScanOnly: $ScanOnly"

# Step 1: Scan for new jobs
Log "Running scan.mjs..."
try {
  $scanOutput = node scan.mjs 2>&1
  Log "Scan complete."
} catch {
  Log "ERROR during scan: $_"
  exit 1
}

if ($ScanOnly) {
  Log "ScanOnly mode - stopping after scan."
  exit 0
}

# Step 2: Read scan results from reports/
$reportsDir = Join-Path $ScriptDir "reports"
$newReports = Get-ChildItem -Path $reportsDir -Filter "*.json" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-2) } |
  Sort-Object LastWriteTime -Descending

Log "Found $($newReports.Count) new report(s) in last 2 hours."

$autoApplyJobs = @()
$referralJobs = @()

foreach ($report in $newReports) {
  $data = Get-Content $report.FullName | ConvertFrom-Json -ErrorAction SilentlyContinue
  if (-not $data) { continue }

  $company = $data.company
  $title   = $data.title
  $url     = $data.url
  $grade   = $data.grade

  if ($grade -in @("D","F")) {
    Log "SKIP [$grade] $title @ $company"
    continue
  }

  # Step 3: Referral check
  Log "Checking referral for: $company"
  $refResult = node referral-check.mjs $company 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue

  if ($refResult -and $refResult.isReferral) {
    Log "REFERRAL [$grade] $title @ $company - $($refResult.matchCount) connection(s)"
    $referralJobs += @{
      company  = $company
      title    = $title
      url      = $url
      grade    = $grade
      lane     = "referral"
      contacts = $refResult.matches
    }
  } else {
    Log "AUTO-APPLY [$grade] $title @ $company"
    $autoApplyJobs += @{
      company = $company
      title   = $title
      url     = $url
      grade   = $grade
      lane    = "auto-apply"
    }
  }
}

Log "Routing: $($autoApplyJobs.Count) auto-apply | $($referralJobs.Count) referral"

# Step 4: Auto-apply (non-referral A/B grade jobs)
foreach ($job in $autoApplyJobs) {
  if ($DryRun) {
    Log "[DRY RUN] Would auto-apply: $($job.title) @ $($job.company)"
    continue
  }

  Log "AUTO-APPLY: $($job.title) @ $($job.company) - $($job.url)"
  try {
    $prompt = "Apply to this job using cv.md and the cover letter rubric in career-ops-setup/_profile.md. Job URL: $($job.url). Company: $($job.company). Role: $($job.title). Grade: $($job.grade). Generate and submit cover letter, fill application form, log result to data/applications.md."
    echo $prompt | claude --print 2>&1 | Tee-Object -Append -FilePath $logFile
  } catch {
    Log "ERROR applying to $($job.title) @ $($job.company): $_"
  }
}

# Step 5: Log referral jobs
if ($referralJobs.Count -gt 0) {
  Log "--- REFERRAL LANE (manual outreach needed) ---"
  foreach ($job in $referralJobs) {
    Log "REFERRAL: $($job.title) @ $($job.company) | $($job.url)"
    foreach ($contact in $job.contacts) {
      Log "  -> $($contact.name) | $($contact.position) | $($contact.linkedinUrl)"
    }
  }
}

# Step 6: Update Kanban via pulse-bridge
Log "Running pulse-bridge.mjs..."
try {
  node pulse-bridge.mjs 2>&1 | Tee-Object -Append -FilePath $logFile
} catch {
  Log "WARNING: pulse-bridge failed (non-critical): $_"
}

Log "=== auto-pipeline COMPLETE ==="
