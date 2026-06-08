@echo off
REM ============================================================
REM  Pulse Referral Engine - DEPLOY TO PRODUCTION
REM  Runs the Dispatch validation gate, then commits + pushes.
REM  STOPS at the first failure. Safe to double-click.
REM ============================================================
setlocal
cd /d "%~dp0"
echo.
echo ===== STEP 1 of 4: Dispatch validation relay (gate) =====
call node dispatch-relay.mjs --item "scheduled production deploy" --files ""
if errorlevel 1 goto :fail
echo.
echo ===== STEP 2 of 4: Build dashboard (Go) =====
pushd dashboard
go build ./...
if errorlevel 1 ( popd & goto :fail )
popd
echo   OK - dashboard compiles.
echo.
echo ===== STEP 3 of 4: Commit any pending changes =====
git add -A
git commit -m "deploy: production push (validated via Dispatch relay)" || echo   (nothing new to commit)
echo.
echo ===== STEP 4 of 4: Push to production (GitHub) =====
git push
if errorlevel 1 goto :fail
echo.
echo ============================================================
echo   DEPLOYED. Production is up to date.
echo ============================================================
goto :end
:fail
echo.
echo ************************************************************
echo   STOPPED - a step failed. Nothing was pushed.
echo   Copy the error text above and send it to Claude.
echo ************************************************************
:end
echo.
pause
