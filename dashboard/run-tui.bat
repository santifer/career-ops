@echo off
cd /d "%~dp0"
echo Starting Career Pipeline TUI...
"C:\Program Files\Go\bin\go.exe" run main.go -path ..
pause
