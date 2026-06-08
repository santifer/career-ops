@echo off
:: set-credentials.bat
:: One-time setup: stores job-search credentials as Windows user-level env vars.
:: Run this ONCE (no admin required) — credentials persist across reboots.
::
:: After running, auto-submit.mjs and linkedin-dm.mjs will read from env vars
:: instead of config/profile.yml.  You can still keep profile.yml as fallback,
:: but env vars are the preferred method (Kaizen 4, 2026-05-22).
::
:: Usage:
::   1. Edit the values below with your real credentials
::   2. Double-click this file (or right-click → Run as administrator if setx fails)
::   3. Restart any open Command Prompt / bat windows so they pick up the new values
::
:: IMPORTANT: Do NOT commit this file if you have filled in real passwords.
::            It is listed in .gitignore.

setlocal

:: ── LinkedIn credentials ───────────────────────────────────────────────────────
:: Used by: linkedin-dm.mjs (LinkedInPulse DM automation)
set "LINKEDIN_EMAIL=rahil.nathani@gmail.com"
set "LINKEDIN_PASSWORD=$Imba202@"

:: ── Workday credentials ────────────────────────────────────────────────────────
:: Used by: auto-submit.mjs (Workday login wall)
set "WORKDAY_EMAIL=rahilpmp@gmail.com"
set "WORKDAY_PASSWORD=Aa11bb22cc!!"

:: ── Write to user-level environment (no admin required) ───────────────────────
echo Setting LINKEDIN_EMAIL...
setx LINKEDIN_EMAIL "%LINKEDIN_EMAIL%" >nul
if errorlevel 1 goto :err

echo Setting LINKEDIN_PASSWORD...
setx LINKEDIN_PASSWORD "%LINKEDIN_PASSWORD%" >nul
if errorlevel 1 goto :err

echo Setting WORKDAY_EMAIL...
setx WORKDAY_EMAIL "%WORKDAY_EMAIL%" >nul
if errorlevel 1 goto :err

echo Setting WORKDAY_PASSWORD...
setx WORKDAY_PASSWORD "%WORKDAY_PASSWORD%" >nul
if errorlevel 1 goto :err

echo.
echo ============================================================
echo  Done. Credentials stored as Windows user env vars.
echo  Restart any open Command Prompt windows to pick them up.
echo ============================================================
echo.
echo  To verify, open a new Command Prompt and run:
echo    echo %%LINKEDIN_EMAIL%%
echo    echo %%WORKDAY_EMAIL%%
echo.
goto :done

:err
echo.
echo ERROR: setx failed. Try right-clicking the file and choosing "Run as administrator".
echo.
exit /b 1

:done
endlocal
