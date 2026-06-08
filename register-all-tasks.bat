@echo off
:: register-all-tasks.bat
:: Registers ALL three JobPulse + LinkedIn scheduled tasks in one shot:
::   1. CoworkLaunch-555am    — wakes Claude at 5:55am
::   2. JobPulse-AutoSubmit   — runs Windows bat at 6:45am (Playwright submissions — moved from 6:10 to avoid refresh collision)
::   3. LinkedInDM-10am       — daily LinkedIn DM automation at 10:00am
::
:: MUST BE RUN AS ADMINISTRATOR (right-click → "Run as administrator").
:: Re-running is safe — deletes and recreates each task cleanly.

setlocal
set "DIR=C:\Users\rahil\career-ops"

echo.
echo ===================================================
echo  JobPulse + LinkedIn Task Registration
echo ===================================================
echo.

:: ── 1. CoworkLaunch-555am ─────────────────────────────────────────────────────
echo [1/3] Registering CoworkLaunch-555am (5:55am daily)...
schtasks /delete /tn "CoworkLaunch-555am" /f >nul 2>&1
schtasks /create ^
  /tn "CoworkLaunch-555am" ^
  /tr "\"%DIR%\launch-cowork.bat\"" ^
  /sc DAILY ^
  /st 05:55 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f
if errorlevel 1 (
  echo   ERROR: CoworkLaunch-555am registration FAILED.
  echo   Are you running as Administrator?
  goto :error
)
echo   OK - CoworkLaunch-555am registered.

:: ── 2. JobPulse-AutoSubmit ────────────────────────────────────────────────────
echo.
echo [2/3] Registering JobPulse-AutoSubmit (6:45am daily)...
schtasks /delete /tn "JobPulse-AutoSubmit" /f >nul 2>&1
schtasks /create ^
  /tn "JobPulse-AutoSubmit" ^
  /tr "\"%DIR%\run-autosubmit.bat\"" ^
  /sc DAILY ^
  /st 06:45 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f
if errorlevel 1 (
  echo   ERROR: JobPulse-AutoSubmit registration FAILED.
  goto :error
)
echo   OK - JobPulse-AutoSubmit registered.

:: ── 3. LinkedInDM-10am ────────────────────────────────────────────────────────
echo.
echo [3/3] Registering LinkedInDM-10am (10:00am daily)...
schtasks /delete /tn "LinkedInDM-10am" /f >nul 2>&1
schtasks /create ^
  /tn "LinkedInDM-10am" ^
  /tr "\"%DIR%\run-linkedin-dm.bat\"" ^
  /sc DAILY ^
  /st 10:00 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f
if errorlevel 1 (
  echo   ERROR: LinkedInDM-10am registration FAILED.
  goto :error
)
echo   OK - LinkedInDM-10am registered.

:: ── Enable "Wake the computer" via PowerShell ─────────────────────────────────
echo.
echo Enabling "Wake the computer" on all three tasks...

powershell -NoProfile -Command ^
  "$s = New-Object -ComObject Schedule.Service; $s.Connect(); " ^
  "$f = $s.GetFolder('\'); " ^
  "foreach ($tn in @('CoworkLaunch-555am','JobPulse-AutoSubmit','LinkedInDM-10am')) { " ^
  "  try { " ^
  "    $t = $f.GetTask($tn); " ^
  "    $def = $t.Definition; " ^
  "    $def.Settings.WakeToRun = $true; " ^
  "    $f.RegisterTaskDefinition($tn, $def, 4, $null, $null, 3); " ^
  "    Write-Host ('  OK - WakeToRun enabled: ' + $tn); " ^
  "  } catch { Write-Host ('  WARN: Could not set WakeToRun on ' + $tn + ': ' + $_.Exception.Message) } " ^
  "}"

echo.
echo ===================================================
echo  All three tasks registered successfully.
echo ===================================================
echo.
echo Tasks are set to run daily and wake the computer from sleep:
echo.
echo   CoworkLaunch-555am    → 5:55am  (wakes Claude)
echo   JobPulse-AutoSubmit   → 6:45am  (Playwright job submissions)
echo   LinkedInDM-10am       → 10:00am (LinkedIn DM automation)
echo.
echo Verify in Task Scheduler (Start → search "Task Scheduler").
echo.
goto :done

:error
echo.
echo Registration incomplete. Right-click this bat and choose "Run as administrator".
echo.
exit /b 1

:done
endlocal
