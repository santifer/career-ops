# Modo: auto-pipeline — Pipeline Completo Automático

Cuando el usuario pega un JD (texto o URL) sin sub-comando explícito, ejecutar TODO el pipeline en secuencia:

## Paso 0 — Extraer JD

Si el input es una **URL** (no texto de JD pegado), seguir esta estrategia para extraer el contenido:

**Orden de prioridad:**

1. **Playwright (preferido):** La mayoría de portales de empleo (Lever, Ashby, Greenhouse, Workday) son SPAs. Usar `browser_navigate` + `browser_snapshot` para renderizar y leer el JD.
2. **WebFetch (fallback):** Para páginas estáticas (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (último recurso):** Buscar título del rol + empresa en portales secundarios que indexan el JD en HTML estático.

**Si ningún método funciona:** Pedir al candidato que pegue el JD manualmente o comparta un screenshot.

**Si el input es texto de JD** (no URL): usar directamente, sin necesidad de fetch.

## Paso 1 — Evaluación A-F
Ejecutar exactamente igual que el modo `oferta` (leer `modes/oferta.md` para todos los bloques A-F).

## Paso 2 — Guardar Report .md
Guardar la evaluación completa en `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (ver formato en `modes/oferta.md`).

## Paso 3 — Generar PDF
Ejecutar el pipeline completo de `pdf` (leer `modes/pdf.md`).

## Paso 4 — Draft Application Answers (solo si score >= 4.5)

Si el score final es >= 4.5, generar borrador de respuestas para el formulario de aplicación:

1. **Extraer preguntas del formulario**: Usar Playwright para navegar al formulario y hacer snapshot. Si no se pueden extraer, usar las preguntas genéricas.
2. **Generar respuestas** siguiendo el tono (ver abajo).
3. **Guardar en el report** como sección `## G) Draft Application Answers`.

### Preguntas genéricas (usar si no se pueden extraer del formulario)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tono para Form Answers

**Posición: "I'm choosing you."** el candidato tiene opciones y está eligiendo esta empresa por razones concretas.

**Reglas de tono:**
- **Confiado sin arrogancia**: "I've spent the past year building production AI agent systems — your role is where I want to apply that experience next"
- **Selectivo sin soberbia**: "I've been intentional about finding a team where I can contribute meaningfully from day one"
- **Específico y concreto**: Siempre referenciar algo REAL del JD o de la empresa, y algo REAL de la experiencia del candidato
- **Directo, sin fluff**: 2-4 frases por respuesta. Sin "I'm passionate about..." ni "I would love the opportunity to..."
- **El hook es la prueba, no la afirmación**: En vez de "I'm great at X", decir "I built X that does Y"

**Framework por pregunta:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** → Mencionar algo concreto sobre la empresa. "I've been using [product] for [time/purpose]."
- **Relevant experience?** → Un proof point cuantificado. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Honesto: "Found through [portal/scan], evaluated against my criteria, and it scored highest."

**Idioma**: Siempre en el idioma del JD (EN default). Aplicar `/tech-translate`.

## Paso 5 — Actualizar Tracker
Registrar en `data/applications.md` con todas las columnas incluyendo Location, Remote, Report y PDF en ✅.

Column order: `# | Date | Company | Role | Location | Remote | Score | Status | PDF | Report | Notes`

- **Location**: city/state extracted from JD (e.g. `San Francisco, CA` or `Remote US`)
- **Remote**: `remote`, `on-site`, or `unknown`

## Step 6 — Sync to Obsidian Vault

Write the application note to the `_jobSeeking` vault so the Dataview dashboard picks it up.

**Determine folder:**
- Job US/Americas or explicitly Remote-US → `US Applications`
- Job UK/Europe/EMEA → `UK Applications`
- Unknown / fully remote → `US Applications` (default for this branch)

**File name:** `{###} - {Company Name}.md` (e.g. `002 - Anthropic.md`)

**Run:**
```bash
node obsidian-sync.mjs \
  --file "{###} - {Company Name}.md" \
  --content "reports/{###}-{slug}-{date}.md" \
  --folder "{US Applications|UK Applications}" \
  --geo "{US|UK}" \
  --company "{Company}" \
  --role "{Role Title}" \
  --score "{X.X}" \
  --status "{Canonical Status}" \
  --archetype "{matched archetype from _profile.md}" \
  --url "{JD URL}" \
  --pdf {true|false} \
  --location "{city, state/country from JD — e.g. 'San Francisco, CA' or 'Remote US'}" \
  --remote "{remote|on-site|unknown}"
```

If Obsidian is closed or the API is unreachable, the script exits safely — the pipeline is not blocked.

**Si algún paso falla**, continuar con los siguientes y marcar el paso fallido como pendiente en el tracker.
