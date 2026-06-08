@echo off
:: run-autosubmit.bat
:: Runs AutoSubmit natively on Windows (where Playwright/Chromium is available).
:: Scheduled via Windows Task Scheduler at 6:10am — runs after Cowork 6am refresh.
:: Tallies exit codes and merges results into data/last-refresh.json so the
:: 8am health report sees actual submission counts.
::
:: Register: schtasks /create /tn "JobPulse-AutoSubmit" /tr "C:\Users\rahil\career-ops\run-autosubmit.bat" /sc daily /st 06:10 /f
::
:: Rewritten 2026-05-13: extracted inline node -e JS to .mjs helpers.
:: Windows CMD cannot run multiline node -e "..." blocks (treats JS keywords
:: like const/let/try as batch commands). Logic is now in three clean scripts:
::   build-autosubmit-queue.mjs    — reads Kanban, writes queue JSON
::   process-autosubmit-queue.mjs  — runs auto-submit.mjs per card, writes results JSON
::   merge-bat-results.mjs         — merges tallies into last-refresh.json

setlocal
cd /d C:\Users\rahil\career-ops

echo [%date% %time%] JobPulse AutoSubmit starting...

:: ── Step 0: Pre-flight syntax guard ─────────────────────────────────────────
echo [0/4] Running syntax guard...
node check-syntax.mjs
if %ERRORLEVEL% neq 0 (
  echo ABORT: Syntax errors detected. Fix files before running bat.
  echo See output above for which files failed.
  exit /b 1
)
echo Syntax guard passed.

:: ── Step 0.5: Clean AI watermarks from all CLs before submission ─────────────
node clean-cl.mjs

:: ── Step 1: Build eligible card queue from Kanban ──────────────────────────
node build-autosubmit-queue.mjs
if errorlevel 1 (
  echo [%date% %time%] Queue build failed. Aborting.
  goto :writeback_zero
)

:: ── Step 2: Process queue, tally results ───────────────────────────────────
node process-autosubmit-queue.mjs
if errorlevel 1 goto :writeback_zero

:: ── Step 3: Merge results into last-refresh.json ───────────────────────────
node merge-bat-results.mjs
goto :done

:writeback_zero
echo [%date% %time%] Writing zero-result bat-merge to last-refresh.json...
node write-refresh-status.mjs --bat-merge --submitted 0 --blocked 0 --sus-new 0 --errors 0 --notes "bat aborted early — see output above"

:done
echo [%date% %time%] JobPulse AutoSubmit complete.
endlocal
