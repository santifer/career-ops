@echo off
:: check-refresh-health.bat
:: Reads data\last-refresh.json, compares ran_at to today's date.
:: Writes data\refresh-health-alert.txt with OK or MISSED status.
:: Run via Task Scheduler at ~9am daily.
::
:: No external dependencies — pure cmd/PowerShell inline.

setlocal EnableDelayedExpansion

set "REFRESH_JSON=%~dp0data\last-refresh.json"
set "ALERT_FILE=%~dp0data\refresh-health-alert.txt"

:: Get today's date as YYYY-MM-DD via PowerShell
for /f "delims=" %%D in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd'"') do set "TODAY=%%D"
for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format 'HH:mm:ss'"') do set "NOW_TIME=%%T"

if not exist "%REFRESH_JSON%" (
    echo [%TODAY% %NOW_TIME%] REFRESH MISSED ^(no last-refresh.json found^) > "%ALERT_FILE%"
    echo ALERT: last-refresh.json missing. See %ALERT_FILE%
    exit /b 1
)

:: Extract ran_at from last-refresh.json via PowerShell
for /f "delims=" %%V in ('powershell -NoProfile -Command ^
    "try { $j = Get-Content '%REFRESH_JSON%' -Raw | ConvertFrom-Json; Write-Output $j.ran_at } catch { Write-Output 'ERROR' }"^
) do set "RAN_AT=%%V"

if "%RAN_AT%"=="ERROR" (
    echo [%TODAY% %NOW_TIME%] REFRESH CHECK ERROR ^(could not parse last-refresh.json^) > "%ALERT_FILE%"
    echo ERROR: could not parse last-refresh.json
    exit /b 1
)

if "%RAN_AT%"=="" (
    echo [%TODAY% %NOW_TIME%] REFRESH MISSED ^(ran_at is empty in last-refresh.json^) > "%ALERT_FILE%"
    echo ALERT: ran_at is empty. See %ALERT_FILE%
    exit /b 1
)

:: Extract date portion (first 10 chars: YYYY-MM-DD)
set "RAN_DATE=%RAN_AT:~0,10%"

if "%RAN_DATE%"=="%TODAY%" (
    echo [%TODAY% %NOW_TIME%] OK -- refreshed at %RAN_AT% > "%ALERT_FILE%"
    echo OK: Job Pulse refreshed at %RAN_AT%
    exit /b 0
) else (
    echo [%TODAY% %NOW_TIME%] REFRESH MISSED -- last ran %RAN_AT% ^(expected %TODAY%^) > "%ALERT_FILE%"
    echo [%TODAY% %NOW_TIME%] Run manually: node scan.mjs >> "%ALERT_FILE%"
    echo ALERT: Refresh missed! Last ran %RAN_AT%, expected %TODAY%. See %ALERT_FILE%
    exit /b 1
)
