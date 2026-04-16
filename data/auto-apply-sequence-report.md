# Secuencia de Auto-Apply

Fecha: 2026-04-15T17:20:31.794Z

## test-auto-apply
- Comando: `node test-auto-apply.mjs`
- Resultado: **OK**
- Código de salida: 0
- Salida del comando:
```

[34m═════════════════════════════════════[0m
[34m  Auto-Apply System Test[0m
[34m═════════════════════════════════════[0m

[34m→ 1. Checking required files[0m
  [32m✓ cv.md exists[0m
  [32m✓ config/profile.yml exists[0m
  [32m✓ config/credentials.yml exists[0m
  [32m✓ data/pipeline.md exists[0m
  [32m✓ .gitignore exists[0m

[34m→ 2. Validating profile.yml[0m
  [32m✓ profile.yml parses correctly[0m
  [32m✓ Name: Cristian Camilo Montes Teheran[0m
  [32m✓ Email: camilo59940@...[0m
  [32m✓ Phone: +57 3143663821[0m
  [32m✓ Location: Bogotá DC, Colombia[0m

[34m→ 3. Validating credentials.yml[0m
  [32m✓ credentials.yml parses correctly[0m
  [32m✓ Computrabajo: cm3642263@...[0m
  [32m✓ LinkedIn: cm3642263@...[0m

[34m→ 4. Checking job pipeline[0m
  [32m✓ Pipeline format is valid[0m
  [33m• 4 pending jobs[0m
  [33m• 0 completed jobs[0m

[34m→ 5. Testing network connectivity[0m
  [32m✓ Computrabajo is reachable[0m
  [32m✓ LinkedIn is reachable[0m

[34m→ 6. Testing browser automation[0m
  [32m✓ Launched Chromium browser[0m
  [32m✓ Created browser context and page[0m
  [32m✓ Navigated to Computrabajo.com[0m
  [33m• Found 0 inputs, 0 buttons[0m
  [33m• No apply buttons found on homepage (expected)[0m
  [32m✓ Browser closed cleanly[0m

[34m→ 7. Testing form auto-fill logic[0m
  [32m✓ nombre → Cristian Camilo Montes Teheran[0m
  [32m✓ email → camilo59940@gmail.com[0m
  [32m✓ teléfono → +57 3143663821[0m
  [32m✓ location → Bogotá DC, Colombia[0m

[34m→ 8. Checking Git security[0m
  [32m✓ credentials.yml is in .gitignore[0m
  [33m• logs/ not in .gitignore (optional)[0m

[34m═════════════════════════════════════[0m
[34m  Test Summary[0m
[34m═════════════════════════════════════[0m

[32mPassed: 25[0m/25
[31mFailed: 0[0m/25
Health: [32m100%[0m

[32m✓ All tests passed! System is ready.[0m

Next steps:
  [34m1. node auto-apply.mjs scan bogota[0m  (find jobs)
  [34m2. node auto-apply.mjs apply[0m        (apply to jobs)
  [34m3. node auto-apply.mjs status[0m       (check results)



```

## scan-bogota
- Comando: `node auto-apply.mjs scan bogota`
- Resultado: **OK**
- Código de salida: 0
- Salida del comando:
```

──────────────────────────────────────────────────────────────────────
SCANNING FOR JOBS
──────────────────────────────────────────────────────────────────────

• 🇨🇴 Scanning Bogotá jobs
Scanning 73 companies via API (17 skipped — no API detected)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Portal Scan — 2026-04-15
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Companies scanned:     73
Total jobs found:      5004
Filtered by title:     4551 removed
Duplicates:            453 skipped
New offers added:      0

Errors (10):
  ✗ Ada: HTTP 404
  ✗ Rappi: HTTP 404
  ✗ Factorial: HTTP 404
  ✗ Tinybird: HTTP 404
  ✗ Travelperk: HTTP 404
  ✗ Weights & Biases: HTTP 404
  ✗ Clarity AI: HTTP 404
  ✗ Forto: HTTP 404
  ✗ Vinted: HTTP 404
  ✗ Runway: HTTP 404

→ Run /career-ops pipeline to evaluate new offers.
→ Share results and get help: https://discord.gg/8pRpHETxa4
Searching: site:computrabajo.com.co "desarrollador full stack" OR "desarrollador backend" OR "desarrollador frontend" "Bogotá" OR "Cundinamarca"
Searching: site:computrabajo.com.co "RPA" OR "automatización" OR "n8n" "desarrollador" "Bogotá" OR "Cundinamarca"
Searching: site:co.indeed.com "desarrollador full stack" OR "desarrollador backend" OR "desarrollador frontend" "Bogotá"
Searching: site:glassdoor.com.co "desarrollador" OR "ingeniero" "software" "Bogotá" OR "Colombia"
Searching: site:linkedin.com/jobs "desarrollador" "Colombia" "Bogotá" full stack" OR "desarrollador backend" OR "desarrollador frontend" "Bogotá" "Colombia" "solicitud sencilla"
Searching: site:linkedin.com/jobs "RPA" "Colombia" "Bogotá" OR "automatización" "desarrollador" "Bogotá" "Colombia" "solicitud sencilla"
Added 0 offers from websearch.
Filtered pipeline.md to Bogotá/Colombia offers only.
• ✅ Scan complete


```

## apply
- Comando: `node auto-apply.mjs apply`
- Resultado: **OK**
- Código de salida: 0
- Salida del comando:
```

──────────────────────────────────────────────────────────────────────
APPLYING TO JOBS
──────────────────────────────────────────────────────────────────────

• Applying to 3 jobs...
Processing 3 jobs...
-> Computrabajo | Desarrollador Junior
-> Computrabajo | Desarrollador
-> Computrabajo | Desarrollador Full Stack

Report saved to data/applications-log.md
• ✅ Apply cycle complete


```

## status
- Comando: `node auto-apply.mjs status`
- Resultado: **OK**
- Código de salida: 0
- Salida del comando:
```

──────────────────────────────────────────────────────────────────────
STATUS REPORT
──────────────────────────────────────────────────────────────────────

• Version: 1.0.0
• Timestamp: 15/4/2026, 12:20:47 p.m.

──────────────────────────────────────────────────────────────────────
System Health
──────────────────────────────────────────────────────────────────────

✓ ✓ cv.md
✓ ✓ config/profile.yml
✓ ✓ config/credentials.yml
✓ ✓ data/pipeline.md

──────────────────────────────────────────────────────────────────────
Pipeline Status
──────────────────────────────────────────────────────────────────────

• Pending: 3
• Completed: 0
• Total applications: 0

──────────────────────────────────────────────────────────────────────
Application Results
──────────────────────────────────────────────────────────────────────

• ✅ Successful submissions: 0
• ❌ Errors: 0
• ⏭️  Already applied: 0


```

# Secuencia de Auto-Apply

Fecha: 2026-04-15T17:25:25.568Z

## test-auto-apply
- Comando: `node test-auto-apply.mjs`
- Resultado: **OK**
- Código de salida: 0
- Salida del comando:
```

[34m═════════════════════════════════════[0m
[34m  Auto-Apply System Test[0m
[34m═════════════════════════════════════[0m

[34m→ 1. Checking required files[0m
  [32m✓ cv.md exists[0m
  [32m✓ config/profile.yml exists[0m
  [32m✓ config/credentials.yml exists[0m
  [32m✓ data/pipeline.md exists[0m
  [32m✓ .gitignore exists[0m

[34m→ 2. Validating profile.yml[0m
  [32m✓ profile.yml parses correctly[0m
  [32m✓ Name: Cristian Camilo Montes Teheran[0m
  [32m✓ Email: camilo59940@...[0m
  [32m✓ Phone: +57 3143663821[0m
  [32m✓ Location: Bogotá DC, Colombia[0m

[34m→ 3. Validating credentials.yml[0m
  [32m✓ credentials.yml parses correctly[0m
  [32m✓ Computrabajo: cm3642263@...[0m
  [32m✓ LinkedIn: cm3642263@...[0m

[34m→ 4. Checking job pipeline[0m
  [32m✓ Pipeline format is valid[0m
  [33m• 3 pending jobs[0m
  [33m• 0 completed jobs[0m

[34m→ 5. Testing network connectivity[0m
  [32m✓ Computrabajo is reachable[0m
  [32m✓ LinkedIn is reachable[0m

[34m→ 6. Testing browser automation[0m
  [32m✓ Launched Chromium browser[0m
  [32m✓ Created browser context and page[0m
  [32m✓ Navigated to Computrabajo.com[0m
  [33m• Found 0 inputs, 0 buttons[0m
  [33m• No apply buttons found on homepage (expected)[0m
  [32m✓ Browser closed cleanly[0m

[34m→ 7. Testing form auto-fill logic[0m
  [32m✓ nombre → Cristian Camilo Montes Teheran[0m
  [32m✓ email → camilo59940@gmail.com[0m
  [32m✓ teléfono → +57 3143663821[0m
  [32m✓ location → Bogotá DC, Colombia[0m

[34m→ 8. Checking Git security[0m
  [32m✓ credentials.yml is in .gitignore[0m
  [33m• logs/ not in .gitignore (optional)[0m

[34m═════════════════════════════════════[0m
[34m  Test Summary[0m
[34m═════════════════════════════════════[0m

[32mPassed: 25[0m/25
[31mFailed: 0[0m/25
Health: [32m100%[0m

[32m✓ All tests passed! System is ready.[0m

Next steps:
  [34m1. node auto-apply.mjs scan bogota[0m  (find jobs)
  [34m2. node auto-apply.mjs apply[0m        (apply to jobs)
  [34m3. node auto-apply.mjs status[0m       (check results)



```

## scan-bogota
- Comando: `node auto-apply.mjs scan bogota`
- Resultado: **OK**
- Código de salida: 0
- Salida del comando:
```

──────────────────────────────────────────────────────────────────────
SCANNING FOR JOBS
──────────────────────────────────────────────────────────────────────

• 🇨🇴 Scanning Bogotá jobs
Scanning 73 companies via API (17 skipped — no API detected)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Portal Scan — 2026-04-15
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Companies scanned:     73
Total jobs found:      5005
Filtered by title:     4552 removed
Duplicates:            453 skipped
New offers added:      0

Errors (10):
  ✗ Ada: HTTP 404
  ✗ Rappi: HTTP 404
  ✗ Weights & Biases: HTTP 404
  ✗ Factorial: HTTP 404
  ✗ Tinybird: HTTP 404
  ✗ Clarity AI: HTTP 404
  ✗ Travelperk: HTTP 404
  ✗ Forto: HTTP 404
  ✗ Runway: HTTP 404
  ✗ Vinted: HTTP 404

→ Run /career-ops pipeline to evaluate new offers.
→ Share results and get help: https://discord.gg/8pRpHETxa4
Searching: site:computrabajo.com.co "desarrollador full stack" OR "desarrollador backend" OR "desarrollador frontend" "Bogotá" OR "Cundinamarca"
Searching: site:computrabajo.com.co "RPA" OR "automatización" OR "n8n" "desarrollador" "Bogotá" OR "Cundinamarca"
Searching: site:co.indeed.com "desarrollador full stack" OR "desarrollador backend" OR "desarrollador frontend" "Bogotá"
Searching: site:glassdoor.com.co "desarrollador" OR "ingeniero" "software" "Bogotá" OR "Colombia"
Searching: site:linkedin.com/jobs "desarrollador" "Colombia" "Bogotá" full stack" OR "desarrollador backend" OR "desarrollador frontend" "Bogotá" "Colombia" "solicitud sencilla"
Searching: site:linkedin.com/jobs "RPA" "Colombia" "Bogotá" OR "automatización" "desarrollador" "Bogotá" "Colombia" "solicitud sencilla"
Added 0 offers from websearch.
Filtered pipeline.md to Bogotá/Colombia offers only.
• ✅ Scan complete


```

## apply
- Comando: `node auto-apply.mjs apply`
- Resultado: **OK**
- Código de salida: 0
- Salida del comando:
```

──────────────────────────────────────────────────────────────────────
APPLYING TO JOBS
──────────────────────────────────────────────────────────────────────

• Applying to 3 jobs...
Processing 3 jobs...
-> Computrabajo | Desarrollador Junior
-> Computrabajo | Desarrollador
-> Computrabajo | Desarrollador Full Stack

Report saved to data/applications-log.md
• ✅ Apply cycle complete


```

## status
- Comando: `node auto-apply.mjs status`
- Resultado: **OK**
- Código de salida: 0
- Salida del comando:
```

──────────────────────────────────────────────────────────────────────
STATUS REPORT
──────────────────────────────────────────────────────────────────────

• Version: 1.0.0
• Timestamp: 15/4/2026, 12:25:48 p.m.

──────────────────────────────────────────────────────────────────────
System Health
──────────────────────────────────────────────────────────────────────

✓ ✓ cv.md
✓ ✓ config/profile.yml
✓ ✓ config/credentials.yml
✓ ✓ data/pipeline.md

──────────────────────────────────────────────────────────────────────
Pipeline Status
──────────────────────────────────────────────────────────────────────

• Pending: 3
• Completed: 0
• Total applications: 0

──────────────────────────────────────────────────────────────────────
Application Results
──────────────────────────────────────────────────────────────────────

• ✅ Successful submissions: 0
• ❌ Errors: 0
• ⏭️  Already applied: 0


```

