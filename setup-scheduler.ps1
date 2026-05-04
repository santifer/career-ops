# setup-scheduler.ps1
# Registers two daily Windows Task Scheduler tasks:
#   career-ops-scan-11h  → runs scan-and-notify.mjs at 11:00
#   career-ops-scan-20h  → runs scan-and-notify.mjs at 20:00
#
# Usage (run once as Administrator):
#   powershell -ExecutionPolicy Bypass -File setup-scheduler.ps1
#
# To remove the tasks later:
#   Unregister-ScheduledTask -TaskName "career-ops-scan-11h" -Confirm:$false
#   Unregister-ScheduledTask -TaskName "career-ops-scan-20h" -Confirm:$false

$NodePath  = (Get-Command node -ErrorAction Stop).Source
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath = Join-Path $ScriptDir "scan-and-notify.mjs"

if (-not (Test-Path $ScriptPath)) {
    Write-Error "scan-and-notify.mjs not found at $ScriptPath"
    exit 1
}

function Register-ScanTask {
    param(
        [string]$TaskName,
        [string]$Hour,
        [string]$Minute = "00"
    )

    $action  = New-ScheduledTaskAction `
        -Execute $NodePath `
        -Argument "`"$ScriptPath`"" `
        -WorkingDirectory $ScriptDir

    $trigger = New-ScheduledTaskTrigger `
        -Daily `
        -At "${Hour}:${Minute}"

    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
        -RestartCount 1 `
        -RestartInterval (New-TimeSpan -Minutes 5) `
        -StartWhenAvailable `
        -RunOnlyIfNetworkAvailable

    $principal = New-ScheduledTaskPrincipal `
        -UserId $env:USERNAME `
        -LogonType Interactive `
        -RunLevel Limited

    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "  Removed existing task: $TaskName"
    }

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "career-ops daily portal scan + email notification" | Out-Null

    Write-Host "  Registered: $TaskName  →  runs daily at ${Hour}:${Minute}"
}

Write-Host ""
Write-Host "career-ops — Scheduler Setup"
Write-Host "============================="
Write-Host "Node:   $NodePath"
Write-Host "Script: $ScriptPath"
Write-Host ""

Register-ScanTask -TaskName "career-ops-scan-11h" -Hour "11"
Register-ScanTask -TaskName "career-ops-scan-20h" -Hour "20"

Write-Host ""
Write-Host "Done. Tasks registered:"
Get-ScheduledTask | Where-Object { $_.TaskName -like "career-ops-scan-*" } |
    Format-Table TaskName, State -AutoSize

Write-Host ""
Write-Host "To test immediately:"
Write-Host "  Start-ScheduledTask -TaskName career-ops-scan-11h"
Write-Host ""
Write-Host 'To remove tasks, run:'
Write-Host '  Unregister-ScheduledTask -TaskName career-ops-scan-11h -Confirm:$false'
Write-Host '  Unregister-ScheduledTask -TaskName career-ops-scan-20h -Confirm:$false'
