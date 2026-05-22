@echo off
cd /d "C:\Users\ASUS\OneDrive\Desktop\career\career-ops"
if not exist logs mkdir logs
node morning-berlin-scan.mjs >> logs\morning-scan.log 2>&1
