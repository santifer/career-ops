@echo off
REM career-ops daily ATS scan runner
REM Hits 16 Greenhouse/Ashby/Lever endpoints, filters, dedups, emails via Resend
REM Triggered by Windows Task Scheduler at 12:00 CEST (10:00 UTC) daily

cd /d "C:\Users\Claude\career-ops"

REM Log start
echo [%date% %time%] career-ops daily scan starting >> logs\scan.log

REM Run scan and append output to log
node daily-ats-scan.mjs >> logs\scan.log 2>&1

echo [%date% %time%] career-ops daily scan finished (exit code %ERRORLEVEL%) >> logs\scan.log
echo. >> logs\scan.log
