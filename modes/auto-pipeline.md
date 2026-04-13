# Mode: auto-pipeline — Full automatic pipeline

When the user pastes a JD (text or URL) without an explicit sub-command, run the **entire** pipeline in order:

## Step 0 — Extract JD

If the input is a **URL** (not pasted JD text), use this order to get content:

**Priority:**

1. **Playwright (preferred):** Most job boards (Lever, Ashby, Greenhouse, Workday) are SPAs. Use `browser_navigate` + `browser_snapshot` to render and read the JD.
2. **WebFetch (fallback):** Static pages (ZipRecruiter, WeLoveProduct, some company career pages).
3. **WebSearch (last resort):** Search role title + company on secondary sites that host static HTML copies of the JD.

**If nothing works:** Ask the candidate to paste the JD manually or share a screenshot.

**If the input is JD text** (not a URL): use it directly — no fetch.

## Paso 1 — Evaluación A-G
Ejecutar exactamente igual que el modo `oferta` (leer `modes/oferta.md` para todos los bloques A-F + Block G Posting Legitimacy).

## Paso 2 — Guardar Report .md
Guardar la evaluación completa en `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (ver formato en `modes/oferta.md`).
Include Block G in the saved report. Add `**Legitimacy:** {tier}` to the report header.

## Step 2 — Save report `.md`

Save the full evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (format in `modes/oferta.md`).

## Step 3 — Generate PDF

1. **Extraer preguntas del formulario**: Usar Playwright para navegar al formulario y hacer snapshot. Si no se pueden extraer, usar las preguntas genéricas.
2. **Generar respuestas** siguiendo el tono (ver abajo).
3. **Guardar en el report** como sección `## H) Draft Application Answers`.

## Step 4 — Draft application answers (only if score >= 4.5)

If the final score is >= 4.5, draft answers for the application form:

1. **Extract form questions:** Use Playwright to open the form and snapshot. If you cannot extract, use generic questions below.
2. **Generate answers** using the tone guidelines below.
3. **Save in the report** as section `## G) Draft application answers`.

### Generic questions (if you cannot read the form)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tone for form answers

**Stance: “I’m choosing you.”** The candidate has options and is picking this company for concrete reasons.

**Rules:**
- **Confident, not arrogant:** e.g. “I’ve spent the past year building production AI agent systems — your role is where I want to apply that next.”
- **Selective, not smug:** e.g. “I’ve been intentional about finding a team where I can contribute meaningfully from day one.”
- **Specific:** Always tie something real in the JD or company to something real in the candidate’s experience.
- **Direct, no fluff:** 2–4 sentences per answer. No “I’m passionate about…” or “I would love the opportunity to…”
- **Proof over claims:** Instead of “I’m great at X,” say “I built X that did Y.”

**Per-question pattern:**
- **Why this role?** → “Your [specific thing] maps directly to [specific thing I built].”
- **Why this company?** → Something concrete about the company. e.g. “I’ve been using [product] for [time/purpose].”
- **Relevant experience?** → One quantified proof point. e.g. “Built [X] that [metric]. …”
- **Good fit?** → “I sit at the intersection of [A] and [B], which is where this role lives.”
- **How did you hear?** → Honest: “Found via [portal/scan], scored it against my criteria, and it ranked highest.”

**Language:** Match the JD language (English default). Apply `/tech-translate` if your stack uses it.

## Step 5 — Update tracker

Register in `data/applications.md` with all columns including Report and PDF (✅ where applicable).

**If any step fails**, continue with the rest and mark the failed step as pending in the tracker.
