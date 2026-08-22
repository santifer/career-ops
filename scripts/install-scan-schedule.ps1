$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$taskName = 'career-ops recurring scan'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$script = Join-Path $root 'scripts\scheduled-jobs-runner.mjs'

if (-not (Test-Path -LiteralPath $script)) {
  throw "Scheduled job runner not found: $script"
}

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $root
$start = (Get-Date).AddMinutes(1)
$trigger = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes 15)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Career Ops scheduled-jobs queue worker every 15 minutes (local-only, zero-token)' -Force | Out-Null
Write-Output "Installed '$taskName'."
