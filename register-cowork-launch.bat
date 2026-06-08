@echo off
:: register-cowork-launch.bat
:: Registers a Windows Task Scheduler job that launches Cowork at 5:55am daily
:: so the Cowork 6am JobPulse refresh fires on time.
::
:: MUST BE RUN AS ADMINISTRATOR (right-click → "Run as administrator").

setlocal

set "TASK_NAME=CoworkLaunch-555am"
set "BAT_PATH=C:\Users\rahil\career-ops\launch-cowork.bat"

echo Registering scheduled task: %TASK_NAME%
echo Launch time: 05:55 daily
echo Script: %BAT_PATH%
echo.

:: Delete existing task silently (in case of re-registration)
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Create the task
:: /sc DAILY /st 05:55      — runs every day at 5:55am
:: /ru "%USERNAME%"          — runs as current user (so Cowork window is visible)
:: /rl HIGHEST               — highest privilege available to the user
:: /f                        — force-overwrite if exists
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "\"%BAT_PATH%\"" ^
  /sc DAILY ^
  /st 05:55 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

if errorlevel 1 (
  echo.
  echo ERROR: Task registration failed.
  echo Make sure you ran this bat as Administrator ^(right-click → Run as administrator^).
  exit /b 1
)

echo.
echo Task "%TASK_NAME%" registered successfully.
echo.
echo Next step — enable "Wake the computer to run this task":
echo   1. Open Task Scheduler ^(Start → search "Task Scheduler"^)
echo   2. Find "%TASK_NAME%" in the task list
echo   3. Right-click → Properties → Conditions tab
echo   4. Check "Wake the computer to run this task"
echo   5. Click OK
echo.
echo Also do the same for "\JobPulse-AutoSubmit" while you're there.
echo.

endlocal
