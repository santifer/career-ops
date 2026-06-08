@echo off
:: launch-cowork.bat
:: Launches the Claude desktop app (Cowork mode) at 5:55am so the 6am
:: scheduled task (JobPulse 6am refresh) fires on time.
::
:: Cowork is NOT a separate exe — it is the Claude desktop app, installed
:: as a Windows Store package (Claude_pzs8sxrjxfjjc).  Launch via the
:: shell:AppsFolder shortcut; do NOT search for Cowork.exe (it doesn't exist).
::
:: Register: run register-cowork-launch.bat as Administrator (once)

setlocal

:: ── Check if Claude is already running ───────────────────────────────────────
tasklist /FI "IMAGENAME eq Claude.exe" 2>nul | find /i "Claude.exe" >nul
if not errorlevel 1 (
  echo [%date% %time%] Claude is already running — skipping launch.
  exit /b 0
)

:: ── Launch Claude desktop app (Cowork) via Windows app package ───────────────
echo [%date% %time%] Launching Claude (Cowork) via Windows app package...
start shell:AppsFolder\Claude_pzs8sxrjxfjjc!App

:: Give it 30 s to start before the 6am task fires
timeout /t 30 /nobreak >nul

echo [%date% %time%] Claude launch complete.
endlocal
