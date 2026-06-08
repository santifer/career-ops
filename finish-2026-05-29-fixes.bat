@echo off
REM ============================================================
REM  Pulse Referral Engine - Finish 2026-05-29 retro fixes
REM  Double-click this file. It checks everything, then commits.
REM  It STOPS at the first problem and tells you what broke.
REM ============================================================
setlocal
cd /d "%~dp0"
echo.
echo ===== STEP 1 of 5: Check the scripts aren't broken =====
call node check-syntax.mjs
if errorlevel 1 goto :fail
echo   OK - scripts are valid.
echo.
echo ===== STEP 2 of 5: Build the dashboard (Go) =====
pushd dashboard
go build ./...
if errorlevel 1 ( popd & goto :fail )
popd
echo   OK - dashboard compiles.
echo.
echo ===== STEP 3 of 5: Run the pipeline health check =====
call node verify-pipeline.mjs
if errorlevel 1 goto :fail
echo   OK - pipeline is clean (warnings are fine).
echo.
echo ===== STEP 4 of 5: Stage the 3 fixed files =====
git add templates/states.yml verify-pipeline.mjs dashboard/internal/data/career.go
if errorlevel 1 goto :fail
echo   OK - files staged.
echo.
echo ===== STEP 5 of 5: Commit =====
git commit -m "fix: add blocked/submitted canonical states + accept letter grades (retro 2026-05-29)"
if errorlevel 1 goto :fail
echo.
echo ============================================================
echo   ALL DONE. Your fixes are committed.
echo   (To send them to GitHub, run:  git push)
echo ============================================================
goto :end
:fail
echo.
echo ************************************************************
echo   STOPPED - something above failed. Nothing was committed.
echo   Copy the red/error text above and send it to Claude.
echo ************************************************************
:end
echo.
pause
