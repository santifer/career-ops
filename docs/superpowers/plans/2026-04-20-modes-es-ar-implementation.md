# modes/es/ (Argentina-First Spanish) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `modes/es/` as a rioplatense + Argentina-first localization for career-ops, plus an `templates/portals.ar.example.yml` starter list and the integration glue, without modifying any `.mjs` script or existing English mode files.

**Architecture:** Additive i18n following the `modes/fr/` precedent. Four mode files (`_shared.md`, `oferta.md`, `aplicar.md`, `pipeline.md`) plus `README.md` live in `modes/es/`. User-specific content (archetypes, narrative, scripts) is explicitly kept OUT of `modes/es/_shared.md` and referenced back to `modes/_profile.md`. A new parallel portals template captures AR-native, LATAM-regional, and global-with-AR-team companies. Activation happens via an existing agent-resolved convention (`language.modes_dir` in `config/profile.yml`); we only document it and extend the example file.

**Tech Stack:** Markdown (modes), YAML (portals + profile config), Node.js (verification scripts: `test-all.mjs`, `verify-pipeline.mjs`). No new scripts, no dependencies.

**Related docs:**
- Spec: `docs/superpowers/specs/2026-04-20-modes-es-ar-design.md`
- Precedent: `modes/fr/_shared.md`, `modes/fr/offre.md`, `modes/fr/postuler.md`, `modes/fr/pipeline.md`
- Schema reference: `templates/portals.example.yml`
- Integration: `CLAUDE.md` § "Language Modes", `config/profile.example.yml`

**Verification baseline (run BEFORE starting):**
```bash
cd /Users/fernacri/Developer/git/career-ops
node test-all.mjs 2>&1 | tail -5
node verify-pipeline.mjs 2>&1 | tail -5
```
Capture the output. The same commands must pass at the end with the same structural signal.

---

## File Structure

Files created or modified by this plan:

| File | Action | Purpose |
|---|---|---|
| `modes/es/README.md` | create | Scope, activation, forking guide |
| `modes/es/_shared.md` | create | System context (Spanish) + "Mercado argentino" section |
| `modes/es/oferta.md` | create | A-G evaluation with AR additions in blocks C, F |
| `modes/es/aplicar.md` | create | Live-apply assistant with AR form hints |
| `modes/es/pipeline.md` | create | URL queue processor (translation, no logic delta) |
| `templates/portals.ar.example.yml` | create | 50-company starter for AR/LATAM/global-AR-remote |
| `config/profile.example.yml` | modify | Add optional `language.modes_dir` key + docstring |
| `CLAUDE.md` | modify | Extend "Language Modes" section with Spanish (AR) entry |

Files explicitly NOT touched (out of scope, per spec):
- Any `.mjs` script
- Any mode file under `modes/` that is not in `modes/es/`
- `templates/cv-template.{html,tex}`, `templates/states.yml`, `templates/portals.example.yml`
- Dashboard, batch prompt (reviewer flagged `batch/batch-prompt.md` as advisory; handled only if Task 10 verification exposes a real break)

---

## Task 1: Scaffold `modes/es/` directory with placeholder files

**Files:**
- Create: `modes/es/README.md` (placeholder, final content in Task 6)
- Create: `modes/es/_shared.md` (placeholder, final content in Task 2)
- Create: `modes/es/oferta.md` (placeholder, final content in Task 3)
- Create: `modes/es/aplicar.md` (placeholder, final content in Task 4)
- Create: `modes/es/pipeline.md` (placeholder, final content in Task 5)

**Rationale:** Establish the directory and commit placeholders so subsequent per-file tasks have a clean, isolated diff. Each placeholder has a frontmatter-like header so `test-all.mjs` does not fail on empty files (if it checks).

- [ ] **Step 1: Verify we are on the feature branch**

Run:
```bash
cd /Users/fernacri/Developer/git/career-ops && git branch --show-current
```
Expected output: `feature/Argentina-ES`

If it says `main` or anything else, STOP and ask the user.

- [ ] **Step 2: Run the baseline verification**

Run:
```bash
cd /Users/fernacri/Developer/git/career-ops && node test-all.mjs 2>&1 | tail -10
cd /Users/fernacri/Developer/git/career-ops && node verify-pipeline.mjs 2>&1 | tail -10
```
Record the exit status and the last 10 lines. This is your regression baseline for Task 10.

- [ ] **Step 3: Create directory and placeholder files**

Write each file with a short placeholder that names the file's role and a TODO marker. Example for `modes/es/_shared.md`:

```markdown
# Contexto compartido -- career-ops (Español, Argentina)

<!-- TODO(Task 2): contenido completo pendiente. -->
```

Do the same for the other four files, adjusting the H1 title per file:
- `modes/es/README.md` → `# career-ops -- Modos en español (Argentina)`
- `modes/es/oferta.md` → `# Modo: oferta -- Evaluación Completa A-G (ES)`
- `modes/es/aplicar.md` → `# Modo: aplicar -- Asistente de Postulación en Vivo (ES)`
- `modes/es/pipeline.md` → `# Modo: pipeline -- Procesamiento de URLs Pendientes (ES)`

- [ ] **Step 4: Verify the files exist and the directory listing matches the precedent**

Run:
```bash
ls /Users/fernacri/Developer/git/career-ops/modes/es/
```
Expected: `README.md _shared.md aplicar.md oferta.md pipeline.md` (in alphabetical order)

- [ ] **Step 5: Commit the scaffold**

```bash
cd /Users/fernacri/Developer/git/career-ops
git add modes/es/
git commit -m "$(cat <<'EOF'
feat(modes/es): scaffold directory with placeholders

Adds empty modes/es/{README,_shared,oferta,aplicar,pipeline}.md
to track the new localized directory in git. Content populated in
subsequent commits per the implementation plan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Write `modes/es/_shared.md`

**Files:**
- Modify: `modes/es/_shared.md` (replace placeholder with full content, ~220 lines)

**Reference source:** `modes/_shared.md` (161 lines, English) — structural skeleton and section order.
**Reference precedent:** `modes/fr/_shared.md` (205 lines) — localization pattern, especially the market-specific section.

**Sections to include (in this order):**
1. Header + comentario explicativo (este archivo es auto-updatable, user data va en `_profile.md`)
2. Fuentes de verdad (tabla)
3. Sistema de scoring A-G (tabla + interpretación)
4. Block G Posting Legitimacy (tiers + señales)
5. Reglas globales -- NUNCA / SIEMPRE
6. Herramientas (Playwright obligatorio, fallback WebFetch para batch mode)
7. **Mercado argentino -- Especificidades** (sección nueva, detallada abajo)
8. Referencia a `modes/_profile.md` para archetypes/narrativa/scripts de negociación

**Content rules:**
- Voseo consistente (vos, tenés, querés, sabés, podés). NO tuteo.
- Spanish rioplatense: "acá", "laburo" OK en contexto informal pero NO en rules/technical sections.
- Preserve English technical terms that are job-market conventions: "proof points", "hero metric", "seniority", "offer", "interview", "pipeline", "evals", "HITL". Translate when a Spanish term is already conventional: "ATS" stays, "currículum vitae" NO (use "CV").
- NO user-specific archetypes inline. Section 8 just points to `modes/_profile.md`.

**"Mercado argentino -- Especificidades" section must contain:**

```markdown
## Mercado argentino -- Especificidades (IMPORTANTE)

### Modalidades de contratación típicas
- **Relación de dependencia (RD):** empleo formal bajo LCT. SAC (aguinaldo), vacaciones, ART, obra social obligatoria, indemnización (art. 245), período de prueba 3 meses, preaviso.
- **Monotributo facturando USD:** contratación como monotributista, factura mensual. Sin SAC/ART/indemnización. Riesgo: no hay amparo LCT si rescinden.
- **Contractor / consultoría:** similar a monotributo pero a veces LLC/SA. Frecuente en roles remotos globales.
- **Híbrido:** base RD en ARS + bonos/comisiones en USD.

### Red flags de compensación
Marcar en bloque C (rationale, no sumar dimensión nueva):
- ARS fijo anual SIN cláusula de ajuste por inflación (IPC).
- "Sueldo competitivo" / "a convenir" sin rango.
- Pago solo en pesos sin hedge para roles globales (cuando mercado comparable paga USD).
- Bonos "a discreción" sin criterio publicado.

### Green flags de compensación
- Pago en USD o equivalente (dólar MEP/CCL, cripto estable).
- Ajustes trimestrales o semestrales por IPC con fórmula publicada.
- USD-equivalent explícito aun cuando se liquide en ARS.
- Rango publicado en el JD.

### Vocabulario LCT a detectar o preguntar
Si la JD NO especifica alguno de estos, flaggear como pregunta para el recruiter en bloque F:
- Modalidad (RD vs monotributo vs contractor)
- Moneda de pago y cláusula de ajuste
- SAC (aguinaldo)
- ART (riesgos del trabajo)
- Obra social y prepaga
- Vacaciones (mínimo LCT + días por antigüedad)
- Período de prueba (default 3 meses)
- Preaviso (default 1-2 meses según antigüedad)
- Indemnización (art. 245, para RD)

### Reglas de evaluación AR
- NUNCA bajar el score global por modalidad no declarada. Convertirlo en pregunta para bloque F.
- Si la JD declara explícitamente "USD" o "ajuste por IPC" → tratar como señal positiva en rationale de bloque C.
- Si la JD dice solo "ARS fijo" y el rol es comparable a mercado global que paga USD → penalización explícita en bloque C (narrativa, no sub-dimensión nueva).
- Este modo NO brinda asesoramiento legal. Es orientación orientativa para decidir dónde aplicar.
```

- [ ] **Step 1: Read the source files to anchor the translation**

Run:
```bash
cat /Users/fernacri/Developer/git/career-ops/modes/_shared.md
cat /Users/fernacri/Developer/git/career-ops/modes/fr/_shared.md
```
Hold both in context. The English file defines structure; the French file shows the market-section pattern.

- [ ] **Step 2: Write `modes/es/_shared.md` in full**

Replace the placeholder with the complete content following the section order above. Aim for ~200-230 lines.

- [ ] **Step 3: Structural-parity check**

Run:
```bash
cd /Users/fernacri/Developer/git/career-ops
echo "Spanish H2 count:" && grep -c "^## " modes/es/_shared.md
echo "Spanish H3 count:" && grep -c "^### " modes/es/_shared.md
echo "English H2 count:" && grep -c "^## " modes/_shared.md
echo "English H3 count:" && grep -c "^### " modes/_shared.md
```
Expected: Spanish H2 count = English H2 count + 1 (new "Mercado argentino" section). Spanish H3 count ≥ English H3 count (new section has sub-headings).

If the delta is unexpected, re-check the outline before moving on.

- [ ] **Step 4: English-leakage check**

Run:
```bash
cd /Users/fernacri/Developer/git/career-ops
grep -nE "\b(the|and|with|this|that|always|never|should|must|when|where|which)\b" modes/es/_shared.md | grep -v "^\s*<!--" | head -30
```
Expected: only matches inside code blocks, proper nouns, or intentional English technical terms (e.g., "proof points", "HITL"). Any prose line with raw English is a translation miss — fix and re-run.

- [ ] **Step 5: Voseo consistency check**

Run:
```bash
cd /Users/fernacri/Developer/git/career-ops
grep -nE "\b(tú|tu eres|tu tienes|tu debes|tus)\b" modes/es/_shared.md
```
Expected: no matches (we use voseo: vos, tenés, querés). False positives: "tu CV" (possessive, NOT the pronoun "tú"). Scan the results manually; fix any pronoun slips.

- [ ] **Step 6: Verify references to `_profile.md` are intact**

Run:
```bash
grep -n "_profile.md" /Users/fernacri/Developer/git/career-ops/modes/es/_shared.md
```
Expected: at least 2 matches (user-layer reference in sources-of-truth table + end-of-file pointer).

- [ ] **Step 7: Commit**

```bash
cd /Users/fernacri/Developer/git/career-ops
git add modes/es/_shared.md
git commit -m "$(cat <<'EOF'
feat(modes/es): write _shared.md with AR market section

Spanish (rioplatense) translation of modes/_shared.md structure plus a
dedicated "Mercado argentino" section covering contratación modalities,
comp red/green flags, and LCT vocabulary to detect or ask for in Block F.
User-specific archetypes and narrative remain in modes/_profile.md per
the system/user layer separation rule in CLAUDE.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Write `modes/es/oferta.md`

**Files:**
- Modify: `modes/es/oferta.md` (replace placeholder with full content, ~230 lines)

**Reference source:** `modes/oferta.md` (216 lines, already Spanish-leaning) — structural skeleton.
**Delta vs source:**
1. Full voseo pass (the root `oferta.md` mixes tuteo and voseo inconsistently).
2. Block C gets a new subsection "Chequeo de modalidad AR" (detect modality, flag if missing, note ARS-vs-USD signal).
3. Block F gets a new subsection "Preguntas sobre contratación AR" (dynamic list populated from LCT items missing in JD).
4. Post-evaluation footer unchanged (same report filename, same tracker TSV columns, same headers: `**Score:**`, `**URL:**`, `**Legitimacy:**`).

**Contract to preserve (critical — breaking these breaks `merge-tracker.mjs`, `verify-pipeline.mjs`, etc.):**
- Block letters A through G, in order.
- Report filename format: `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.
- Report header fields in this order: Company/Role, Fecha, Arquetipo, Score, URL, Legitimacy, PDF.
- TSV output instructions must reference the 9 columns defined in CLAUDE.md ("TSV Format for Tracker Additions").
- Canonical states from `templates/states.yml` stay in English identifiers (`Evaluated`, `Applied`, etc.). In Spanish narrative you can reference them as "estado `Evaluated`" but do NOT translate the identifier itself.

- [ ] **Step 1: Read the source**

```bash
cat /Users/fernacri/Developer/git/career-ops/modes/oferta.md
```

- [ ] **Step 2: Write `modes/es/oferta.md`**

Reproduce the A-G structure exactly. Translate to rioplatense with full voseo. Insert the two AR-specific subsections:

**Inside Block C, append after the existing sub-items:**
```markdown
### Chequeo de modalidad AR

1. **Modalidad declarada en la JD:** RD / monotributo / contractor / no declarada.
2. **Moneda de pago:** ARS / USD / mixto / no declarada.
3. **Cláusula de ajuste:** IPC / sin cláusula / no aplica (si es USD) / no declarada.
4. Si alguno de los 3 quedó en "no declarada" → agregar a bloque F como pregunta obligatoria.
5. Si la moneda es ARS y NO hay cláusula de ajuste → nota explícita en el rationale de comp: "penalización por ausencia de protección contra inflación".
6. Si la moneda es USD o hay cláusula de ajuste clara → nota positiva en el rationale de comp: "comp protegida contra inflación".
```

**Inside Block F, append as a mandatory subsection (only populate items that were flagged missing in Block C):**
```markdown
### Preguntas sobre contratación AR

Incluir SOLO las preguntas que corresponden a items NO declarados en la JD:
- Si modalidad no declarada: "¿La contratación es en relación de dependencia, monotributo, o contractor?"
- Si moneda no declarada: "¿En qué moneda se liquida el pago? ¿Hay cláusula de ajuste por inflación?"
- Si SAC/ART/obra social no mencionados: "¿Se incluyen SAC (aguinaldo), ART y cobertura de obra social? ¿Hay prepaga cubierta por la empresa?"
- Si vacaciones no mencionadas: "¿Cuántos días de vacaciones? ¿Incluye los días adicionales por antigüedad del art. 150 LCT?"
- Si período de prueba no mencionado: "¿Cuál es el período de prueba? ¿Es el estándar de 3 meses?"
- Si preaviso no mencionado: "¿Cuál es el preaviso estipulado para ambas partes?"

Si TODAS las preguntas anteriores están cubiertas en la JD → omitir esta subsección del bloque F (no incluir un encabezado vacío).
```

- [ ] **Step 3: Structural-parity check (blocks A-G intact)**

```bash
cd /Users/fernacri/Developer/git/career-ops
for block in "A" "B" "C" "D" "E" "F" "G"; do
  count=$(grep -cE "^## Bloque ${block}" modes/es/oferta.md)
  echo "Bloque ${block}: ${count}"
done
```
Expected: each block appears exactly once (count = 1). Anything else is a regression.

- [ ] **Step 4: Report-header contract check**

```bash
cd /Users/fernacri/Developer/git/career-ops
grep -E "\*\*Score:\*\*|\*\*URL:\*\*|\*\*Legitimacy:\*\*|\*\*PDF:\*\*|\*\*Fecha:\*\*" modes/es/oferta.md
```
Expected: all five header fields present in the "Formato del report" example. These are the field names `verify-pipeline.mjs` greps for in generated reports.

- [ ] **Step 5: Tracker-TSV contract check**

```bash
cd /Users/fernacri/Developer/git/career-ops
echo "-- path reference --"
grep -nE "tracker-additions|\.tsv" modes/es/oferta.md
echo "-- 9-column enumeration (num, date, company, role, status, score, pdf, report, notes) --"
grep -ciE "9.*(columna|column)" modes/es/oferta.md
echo "-- canonical column order mention (status BEFORE score in TSV) --"
grep -iE "status.*score|estado.*score|estado.*puntaje" modes/es/oferta.md | head -3
echo "-- forbidden: direct edits to applications.md for NEW entries --"
grep -iE "editar.*applications\.md.*(nuevo|nueva|agregar)|agregar.*applications\.md" modes/es/oferta.md
```
Expected:
- Path reference: at least one match for `batch/tracker-additions/...tsv`.
- 9-column enumeration: at least one match (e.g., "9 columnas tab-separadas" or equivalent).
- TSV column-order mention: at least one match — the CLAUDE.md TSV rule says **status BEFORE score** in TSV, even though tracker shows **score BEFORE status**. This inversion must be called out.
- Forbidden-edit check: zero matches for instructions to edit `applications.md` directly for NEW entries (the rule is TSV-only for adds; updates to existing entries are OK).

If the 9-column enumeration or column-order mention is missing, the translation dropped critical contract detail from the root `modes/oferta.md` — go back and restore it before committing.

- [ ] **Step 6: Canonical-state check**

```bash
cd /Users/fernacri/Developer/git/career-ops
grep -nE "Evaluada|Aplicada|Respondida|Rechazada|Descartada" modes/es/oferta.md
```
Expected: **zero matches**. Canonical states stay in English (`Evaluated`, `Applied`, etc.). If any Spanish state name appears, replace with its English canonical form.

- [ ] **Step 7: English-leakage and voseo checks**

Same as Task 2, Steps 4 and 5, against `modes/es/oferta.md`.

- [ ] **Step 8: Commit**

```bash
cd /Users/fernacri/Developer/git/career-ops
git add modes/es/oferta.md
git commit -m "$(cat <<'EOF'
feat(modes/es): write oferta.md with AR additions to blocks C and F

Rioplatense translation of the A-G evaluation flow. Block C adds an AR
modality/currency/adjustment-clause check that feeds mandatory recruiter
questions in Block F when any item is missing from the JD. Report
headers, block letters, and tracker TSV contract preserved verbatim to
keep verify-pipeline.mjs and merge-tracker.mjs compatible. Canonical
states stay in English identifiers per templates/states.yml.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Write `modes/es/aplicar.md`

**Files:**
- Modify: `modes/es/aplicar.md` (replace placeholder with full content, ~130 lines)

**Reference source:** `modes/apply.md` (107 lines, English).

**Deltas vs source:**
1. Translation to rioplatense.
2. Add AR form-field guidance (CUIT/CUIL, localidad/provincia, disponibilidad de viajar).
3. Add "Expected salary" branching by modality.
4. Restate the ethical rule in Spanish: "NUNCA enviar sin revisión del candidato."

- [ ] **Step 1: Read the source**

```bash
cat /Users/fernacri/Developer/git/career-ops/modes/apply.md
```

- [ ] **Step 2: Write `modes/es/aplicar.md`**

Reproduce the section order, translated. Insert these two AR-specific blocks where appropriate:

**"Expected salary" / "Pretensiones salariales" handling:**
```markdown
### Pretensiones salariales (AR)

Ramificar según la modalidad detectada en la evaluación (bloque C):
- **Relación de dependencia en ARS:** sugerir un rango en ARS con la nota "sujeto a cláusula de ajuste por IPC o equivalente".
- **Monotributo en USD:** sugerir el número USD neto directo (el candidato factura el bruto).
- **Contractor / LLC:** sugerir USD bruto y dejar que el candidato ajuste según costos.
- **Modalidad no declarada:** NO dar número. Recomendar: "Antes de dar un número concreto, ¿podés confirmarme si la contratación es en relación de dependencia o monotributo, y en qué moneda se liquida?"

En todos los casos, leer `config/profile.yml` y `modes/_profile.md` para el rango target del candidato. NUNCA inventar un número.
```

**Campos típicos en forms AR:**
```markdown
### Campos comunes en forms AR

- **CUIT / CUIL:** leer de `config/profile.yml` si está. Si no está, preguntar al candidato y NO inventar.
- **Localidad / Provincia:** dar la dirección canónica del candidato (no improvisar).
- **Disponibilidad para viajar:** leer la preferencia declarada en `modes/_profile.md` o `config/profile.yml`. Si no está, preguntar antes de responder.
- **Situación laboral actual:** manejar con cuidado ("activo y buscando cambio", "disponible para inicio en 30-60 días") -- nunca decir que el candidato está desempleado si no lo está.
- **Referido por:** si el candidato tiene un contacto, incluir su nombre; si no, dejar vacío (NO inventar referencias).
```

**Ethical gate (in Spanish, reinforcing CLAUDE.md):**
```markdown
### Regla crítica -- NUNCA enviar sin revisión

Antes de apretar Submit / Enviar / Apply:
1. Mostrar al candidato el resumen completo de todos los campos.
2. Esperar confirmación explícita ("sí, enviar" / "dale" / similar).
3. Si hay duda o si el candidato no respondió, NO enviar.
4. Guardar un borrador local del form completado antes de enviar, por si la página falla.

Este punto NO es negociable. CLAUDE.md lo exige como principio ético del sistema.
```

- [ ] **Step 3: Structural-parity check**

```bash
cd /Users/fernacri/Developer/git/career-ops
echo "ES H2:" && grep -c "^## " modes/es/aplicar.md
echo "EN H2:" && grep -c "^## " modes/apply.md
```
Expected: Spanish ≥ English (Spanish adds the two AR sections and the ethical gate).

- [ ] **Step 4: Ethical-rule presence check**

```bash
grep -nE "NUNCA.*(enviar|submit|apretar)" /Users/fernacri/Developer/git/career-ops/modes/es/aplicar.md
```
Expected: at least one match.

- [ ] **Step 5: English-leakage and voseo checks**

Same as Task 2, Steps 4 and 5, against `modes/es/aplicar.md`.

- [ ] **Step 6: Commit**

```bash
cd /Users/fernacri/Developer/git/career-ops
git add modes/es/aplicar.md
git commit -m "$(cat <<'EOF'
feat(modes/es): write aplicar.md with AR form guidance

Rioplatense translation of modes/apply.md plus AR-specific sections:
pretensiones salariales branched by modality, handling of common AR form
fields (CUIT/CUIL, localidad/provincia, disponibilidad), and the
ethical gate restated in Spanish. NUNCA enviar sin revisión.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Write `modes/es/pipeline.md`

**Files:**
- Modify: `modes/es/pipeline.md` (replace placeholder with full content, ~70 lines)

**Reference source:** `modes/pipeline.md` (57 lines, English).

**Delta vs source:** pure translation. The AR-specific logic already lives in `_shared.md` and `oferta.md`, and `pipeline.md` just orchestrates them. No AR additions here.

- [ ] **Step 1: Read the source**

```bash
cat /Users/fernacri/Developer/git/career-ops/modes/pipeline.md
```

- [ ] **Step 2: Write `modes/es/pipeline.md`**

Direct translation preserving section order and any referenced file paths verbatim (`data/pipeline.md`, `data/applications.md`, `reports/`, `batch/tracker-additions/`).

- [ ] **Step 3: Structural-parity check**

```bash
cd /Users/fernacri/Developer/git/career-ops
diff <(grep -c "^## " modes/pipeline.md) <(grep -c "^## " modes/es/pipeline.md)
```
Expected: no output (counts equal).

- [ ] **Step 4: Referenced-path intactness**

```bash
cd /Users/fernacri/Developer/git/career-ops
grep -E "data/pipeline\.md|data/applications\.md|batch/tracker-additions|reports/" modes/es/pipeline.md
```
Expected: all four paths present (same as English source).

- [ ] **Step 5: English-leakage and voseo checks**

Same as Task 2, Steps 4 and 5, against `modes/es/pipeline.md`.

- [ ] **Step 6: Commit**

```bash
cd /Users/fernacri/Developer/git/career-ops
git add modes/es/pipeline.md
git commit -m "$(cat <<'EOF'
feat(modes/es): write pipeline.md

Rioplatense translation of modes/pipeline.md. Orchestration logic only;
AR-specific evaluation rules live in _shared.md and oferta.md, which this
mode invokes. File paths and tracker-additions contract unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Write `modes/es/README.md`

**Files:**
- Modify: `modes/es/README.md` (replace placeholder with full content, ~60 lines)

**Reference precedent:** `modes/fr/README.md` (read first to match voice and sections).

**Required sections:**
1. Scope statement: rioplatense + Argentina-first. Explicit note that other Spanish-speaking markets should fork.
2. How to activate: `language.modes_dir: modes/es` in `config/profile.yml`, OR ask the agent to use Spanish modes inline.
3. What is localized: `_shared.md`, `oferta.md`, `aplicar.md`, `pipeline.md`.
4. What is NOT localized (stays in English for now): `scan`, `patterns`, `followup`, `batch`, `pdf`, `latex`, `tracker`, `deep`, `contacto`, `interview-prep`, `training`, `project`, `auto-pipeline`, `ofertas`. Users can request specific modes in Spanish.
5. Note about the mixed-state root `modes/oferta.md`: it is partly Spanish for historical reasons; `modes/es/oferta.md` is the proper, consistent version reached via `language.modes_dir`.
6. Fork guide for other es-* markets: copy to `modes/es-mx/` (or similar), replace the "Mercado argentino" section, adjust voseo → tuteo if needed.
7. Starter portals file: `templates/portals.ar.example.yml` (created in Task 7).

- [ ] **Step 1: Read the precedent**

```bash
cat /Users/fernacri/Developer/git/career-ops/modes/fr/README.md
```

- [ ] **Step 2: Write `modes/es/README.md`**

Match the French README's voice (direct, practical) but in rioplatense.

- [ ] **Step 3: Reference integrity check**

```bash
cd /Users/fernacri/Developer/git/career-ops
grep -E "modes/oferta\.md|modes/_profile\.md|language\.modes_dir|portals\.ar\.example\.yml" modes/es/README.md
```
Expected: all four strings present.

- [ ] **Step 4: Commit**

```bash
cd /Users/fernacri/Developer/git/career-ops
git add modes/es/README.md
git commit -m "$(cat <<'EOF'
docs(modes/es): write README with scope, activation and fork guide

Documents rioplatense/AR-first scope, activation via language.modes_dir,
the four localized files, the English-still modes, the mixed-state root
modes/oferta.md caveat, and a fork guide for es-mx/es-cl/etc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Create `templates/portals.ar.example.yml`

**Files:**
- Create: `templates/portals.ar.example.yml` (~450-500 lines expected)

**Reference source:** `templates/portals.example.yml` (896 lines) — YAML schema that `scan.mjs` expects. DO NOT diverge from the schema.

**Structure to reproduce (top-level keys in order):**
1. Header comment block (adapted to AR scope: mention rioplatense, `modes/es/`, branded careers_url rule, copy-to-`portals.yml` workflow).
2. `title_filter.positive` (Spanish + English keywords).
3. `title_filter.negative` (AR-specific additions on top of the base negatives).
4. `search_queries` (AR boards + LATAM-remote boards).
5. `tracked_companies` (~50 entries, distribution below).

**`title_filter.positive` — add these Spanish keywords** on top of the English base (reuse the English block from `portals.example.yml`):
- "Ingeniero/a de IA", "Ingeniero/a de Machine Learning", "Desarrollador/a", "Analista", "Líder Técnico/a", "Arquitecto/a", "Consultor/a", "Especialista", "Product Manager de IA".

**`title_filter.negative` — add:**
- "Pasantía", "Practicante", "Becario/a" (if the user is senior).
- "Reemplazo por maternidad" (non-ideal — temporary).
- "Staffing", "Body shopping" without a disclosed client.

**`search_queries` — include these AR-specific queries:**
- `site:bumeran.com.ar "{role keyword}"`
- `site:ar.computrabajo.com "{role keyword}"`
- `site:getonbrd.com "{role keyword}" Argentina`
- LinkedIn AR geo filter (documented query template, no hardcoded URL).
- LATAM-remote: `site:lever.co OR site:greenhouse.io "remote" "Argentina"` (or variants).

**`tracked_companies` — 50 entries, approximate distribution:**

- **~30 AR-native:** Mercado Libre, Globant, Despegar, MODO, Ualá, Pomelo, OLX, Etermax, Digital House, TiendaNube (Nuvemshop), Mudafy, Satellogic, Ripio, Lemon Cash, Buenbit, Prisma Medios de Pago, Naranja X, Brubank, 10Pines, Jampp, Auth0 (AR heritage), Personal Pay / Movistar Money, Reba, Quilla, Bigbox/Bigbox, Wildlife Studios AR, Bitfarms, Rapid7 AR team, Tiendanube alternatives (avoid duplicates), etc.
- **~10 LATAM regional with AR presence:** Belvo, Bitso, Kushki, NotCo, Fintual, Kavak, Rappi, dLocal, Betterfly, Nubank LATAM.
- **~10 global with known AR-remote teams:** Stripe, Deel, Remote, GitLab, Canonical, DataDog, Turing, Toptal, Andela LATAM, Modak.

**For each company:**
- Verify the branded careers URL before committing. If no branded page exists, use the ATS URL and add a YAML comment: `# ATS fallback -- no branded careers page found on {date}`.
- Set `enabled: true` for the ~15 most likely-high-fit. Set `enabled: false` for the rest (user can flip).
- Follow the exact schema from `portals.example.yml` (fields: `name`, `careers_url`, `ats` if applicable, `enabled`, `notes`).

- [ ] **Step 1: Read the schema**

```bash
cat /Users/fernacri/Developer/git/career-ops/templates/portals.example.yml | head -200
cat /Users/fernacri/Developer/git/career-ops/templates/portals.example.yml | grep -A 5 "^tracked_companies:" | head -40
```

Identify the exact fields used per company entry. Copy that shape.

- [ ] **Step 2: Draft the header, filters, and queries**

Write the top of `templates/portals.ar.example.yml` (sections 1-4 above). Keep the schema identical to the English example. Deviate only in the values (keywords, queries).

- [ ] **Step 3: Draft the 50-company list**

For each of the 50 companies, verify the branded careers URL via `WebFetch` or a quick browse. DO NOT guess URLs. If uncertain, use the ATS URL and add the YAML comment.

- [ ] **Step 4: YAML-parse sanity check**

Run:
```bash
cd /Users/fernacri/Developer/git/career-ops
node -e "const yaml=require('js-yaml'); const fs=require('fs'); try { const data=yaml.load(fs.readFileSync('templates/portals.ar.example.yml','utf8')); console.log('OK companies:',data.tracked_companies.length); } catch(e){ console.error('YAML ERROR:', e.message); process.exit(1); }"
```
Expected: `OK companies: 50` (or ±1 if a last-minute add/drop). Any YAML parse error must be fixed before proceeding.

If `js-yaml` is not installed locally, fall back to a Python one-liner:
```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('templates/portals.ar.example.yml')); print('OK companies:', len(d.get('tracked_companies', [])))"
```

- [ ] **Step 5: Schema-parity check**

```bash
cd /Users/fernacri/Developer/git/career-ops
diff <(awk '/^[a-z_]+:/{print $1}' templates/portals.example.yml | sort -u) <(awk '/^[a-z_]+:/{print $1}' templates/portals.ar.example.yml | sort -u)
```
Expected: no output (top-level keys identical). If a key is added or removed, investigate before committing.

- [ ] **Step 6: Branded-URL rule check**

```bash
cd /Users/fernacri/Developer/git/career-ops
grep -cE "greenhouse\.io|lever\.co|workday|ashbyhq|myworkdayjobs" templates/portals.ar.example.yml
```
Expected: as low as possible. Every ATS URL should have a nearby `# ATS fallback` comment. Count should generally be ≤ 10 out of 50 companies.

- [ ] **Step 7: Commit**

```bash
cd /Users/fernacri/Developer/git/career-ops
git add templates/portals.ar.example.yml
git commit -m "$(cat <<'EOF'
feat(templates): add portals.ar.example.yml starter for AR/LATAM

50-company starter list (~30 AR-native, ~10 LATAM regional, ~10 global
with AR-remote teams) plus AR-specific title_filter entries and search
queries for Bumeran, Computrabajo AR, GetOnBoard, LinkedIn AR. Schema
matches portals.example.yml verbatim; scan.mjs can consume either.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Extend `config/profile.example.yml` with `language.modes_dir`

**Files:**
- Modify: `config/profile.example.yml` (add new top-level `language:` block)

**Insertion point:** After the `candidate:` block, before `target_roles:`. Keep the file well-organized.

- [ ] **Step 1: Re-read the current file**

```bash
cat /Users/fernacri/Developer/git/career-ops/config/profile.example.yml
```

- [ ] **Step 2: Add the `language:` block**

Insert after `candidate:` block (line ~18) and before `target_roles:`:

```yaml
# Optional: localized modes.
# If set, career-ops reads evaluation/apply/pipeline modes from this
# directory instead of the default modes/. See CLAUDE.md § Language Modes.
# Supported: modes/de, modes/es, modes/fr, modes/ja, modes/pt, modes/ru
# Unset or omitted → uses modes/ (English / mixed).
# language:
#   modes_dir: modes/es   # example: Argentine Spanish

```

The block stays commented out so the example file works for English users out of the box. The comment documents the options.

- [ ] **Step 3: YAML-parse sanity check**

```bash
cd /Users/fernacri/Developer/git/career-ops
node -e "const yaml=require('js-yaml'); const fs=require('fs'); try { const d=yaml.load(fs.readFileSync('config/profile.example.yml','utf8')); console.log('candidate:', d.candidate ? 'ok' : 'MISSING'); console.log('target_roles:', d.target_roles ? 'ok' : 'MISSING'); } catch(e){ console.error('YAML ERROR:', e.message); process.exit(1); }"
```
Expected: `candidate: ok` + `target_roles: ok`. YAML must still parse with the new block (commented) present.

- [ ] **Step 4: Verify the insertion did not break existing users**

Run:
```bash
cd /Users/fernacri/Developer/git/career-ops
node test-all.mjs 2>&1 | tail -5
```
Expected: same exit status and summary lines as the baseline recorded in Task 1, Step 2.

- [ ] **Step 5: Commit**

```bash
cd /Users/fernacri/Developer/git/career-ops
git add config/profile.example.yml
git commit -m "$(cat <<'EOF'
feat(config): document language.modes_dir in profile.example.yml

Adds commented-out language.modes_dir block with supported values
(modes/{de,es,fr,ja,pt,ru}). Matches the convention already documented
in CLAUDE.md § Language Modes and consumed by the agent at mode read
time. No behavior change for users who do not set the key.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Update `CLAUDE.md` § Language Modes

**Files:**
- Modify: `CLAUDE.md` (extend "Language Modes" section around line 216-239)

**Edits:**
1. Add a fourth bullet to the "Additional language-specific modes available" list: Spanish (Argentina).
2. Add a fourth "When to use..." block after the Japanese one.
3. Update the Skill Modes / mode-files references if any call out specific English-only mode files (spot-check).

- [ ] **Step 1: Read the target section**

```bash
sed -n '216,240p' /Users/fernacri/Developer/git/career-ops/CLAUDE.md
```

- [ ] **Step 2: Apply the edit**

Insert a new bullet in the language list (after the Japanese bullet, before "**When to use German modes:**"):

```markdown
- **Spanish (Argentina market):** `modes/es/` — rioplatense Spanish translations with Argentina-specific vocabulary (relación de dependencia, monotributo, SAC/aguinaldo, ART, obra social, art. 245 LCT indemnización, período de prueba, preaviso, cláusula de ajuste IPC, etc.). Includes `_shared.md`, `oferta.md` (evaluation), `aplicar.md` (apply), `pipeline.md`.
```

Insert a new "When to use..." block after the Japanese one (before "**When NOT to:**"):

```markdown
**When to use Spanish (AR) modes:** If the user is targeting Argentine job postings, lives in Argentina, or asks for Spanish output. Either:
1. User says "use Spanish modes" / "usa los modos en español" → read from `modes/es/` instead of `modes/`
2. User sets `language.modes_dir: modes/es` in `config/profile.yml` → always use Spanish modes
3. You detect a Spanish/rioplatense JD for an Argentine role → suggest switching to Spanish modes

For Spanish-speaking users targeting other markets (MX/CL/CO/UY/PE), recommend forking `modes/es/` into a market-specific directory (`modes/es-mx/`, etc.) and replacing the "Mercado argentino" section.
```

Update the final "**When NOT to:**" line to list Spanish alongside the others:

```markdown
**When NOT to:** If the user applies to English-language roles, even at Argentine, French, German, or Japanese companies, use the default English modes.
```

- [ ] **Step 3: Verify the insertion**

```bash
cd /Users/fernacri/Developer/git/career-ops
grep -nE "Spanish \(Argentina|Spanish \(AR|rioplatense" CLAUDE.md
```
Expected: at least three matches (bullet + when-to-use block + when-not-to line).

- [ ] **Step 4: Whole-file sanity check**

```bash
cd /Users/fernacri/Developer/git/career-ops
node test-all.mjs 2>&1 | tail -5
```
Expected: same pass/fail signal as baseline (test-all.mjs reads CLAUDE.md; must not break).

- [ ] **Step 5: Commit**

```bash
cd /Users/fernacri/Developer/git/career-ops
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(CLAUDE.md): document modes/es/ (Argentina) in Language Modes

Adds Spanish (Argentina) entry to the language-specific modes list,
explains when to use modes/es/ (user request, modes_dir config, JD
detection), and updates the "When NOT to" line to include Argentine
companies with English-language postings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: End-to-end verification and smoke test

**Files:** no file changes — verification and cleanup only.

- [ ] **Step 1: Full static verification**

```bash
cd /Users/fernacri/Developer/git/career-ops
node test-all.mjs 2>&1 | tail -15
node verify-pipeline.mjs 2>&1 | tail -15
```
Expected: same pass/fail signal as the baseline captured in Task 1, Step 2. No new failures.

If failures appear, diagnose which file change introduced them:
```bash
git log --oneline feature/Argentina-ES ^main
git diff main...feature/Argentina-ES --stat
```

- [ ] **Step 2: Directory-parity sanity**

```bash
cd /Users/fernacri/Developer/git/career-ops
for d in de fr ja pt ru es; do
  echo "=== modes/${d}/ ==="
  ls modes/${d}/ 2>/dev/null || echo "(missing)"
done
```
Expected: `modes/es/` lists `README.md _shared.md aplicar.md oferta.md pipeline.md`. Other dirs unchanged.

- [ ] **Step 3: Contract-string spot check across new files**

```bash
cd /Users/fernacri/Developer/git/career-ops
echo "-- Score header --"
grep -c "\*\*Score:\*\*" modes/es/oferta.md modes/oferta.md
echo "-- URL header --"
grep -c "\*\*URL:\*\*" modes/es/oferta.md modes/oferta.md
echo "-- Legitimacy header --"
grep -c "\*\*Legitimacy:\*\*" modes/es/oferta.md modes/oferta.md
echo "-- tracker-additions ref --"
grep -c "tracker-additions" modes/es/oferta.md modes/oferta.md
```
Expected: each count ≥ 1 in `modes/es/oferta.md`. If any is zero, Task 3 is incomplete.

- [ ] **Step 4: Functional smoke test (user-assisted)**

This step requires the user because it needs a real URL and human judgment on prose quality. Announce:

> "Task 10 step 4: smoke test. Please set `language.modes_dir: modes/es` in `config/profile.yml` (if you haven't already) and paste an Argentine job URL. I'll run the evaluation in Spanish and we'll verify the report is structurally valid and the AR additions fire correctly."

Wait for the user. Then:
1. Run the evaluation in Spanish mode (paste the URL, follow `oferta.md`).
2. Verify the generated `reports/NNN-slug-YYYY-MM-DD.md` has all required headers: `**Score:**`, `**URL:**`, `**Legitimacy:**`, `**Fecha:**`, `**PDF:**`.
3. Verify Block F includes the "Preguntas sobre contratación AR" subsection IF the JD was missing LCT items (not always — if the JD is complete, the subsection should be absent).
4. Run `node merge-tracker.mjs` and confirm it ingests the new TSV without error.
5. Run `node verify-pipeline.mjs` and confirm it still passes with the new report present.

- [ ] **Step 5: Spot-check `batch/batch-prompt.md` for Spanish-mode awareness**

The spec reviewer flagged this as advisory. Check now:

```bash
cd /Users/fernacri/Developer/git/career-ops
grep -nE "language\.modes_dir|modes/fr|modes/de|modes/ja" batch/batch-prompt.md 2>&1 || echo "(no existing language-mode references in batch-prompt.md)"
```

If the batch prompt has NO language-mode awareness, leave it alone — it is out of scope per the spec. If it references other localized dirs but not Spanish, open a follow-up task (do NOT modify in this plan).

- [ ] **Step 6: Final commit (only if any doc fixes surfaced)**

If steps 1-5 surfaced any real issue and you fixed it, commit here. Otherwise, skip.

```bash
cd /Users/fernacri/Developer/git/career-ops
git status
# only if there are changes:
git add -p
git commit -m "..."
```

- [ ] **Step 7: Summarize for the user**

Report:
- All commits made on `feature/Argentina-ES`.
- `test-all.mjs` and `verify-pipeline.mjs` status (pass/fail).
- Any deferred follow-ups (e.g., batch-prompt update, `modes/es/` expansion to other mode files).
- Next step for the user: review the branch, run their own smoke test, merge or request changes.

---

## Deferred / out-of-scope follow-ups (not part of this plan)

- Spanish versions of the other 14 mode files (`scan.md`, `patterns.md`, etc.).
- Mexican / Chilean / Colombian / Spanish (Spain) variants.
- Updating `batch/batch-prompt.md` for Spanish mode awareness (only if verification surfaces a real break).
- PR creation (user will decide merge target and timing).

## Rollback plan (if needed)

The entire implementation lives on `feature/Argentina-ES` and every task commits separately. To undo:

```bash
cd /Users/fernacri/Developer/git/career-ops
git checkout main
git branch -D feature/Argentina-ES   # only if you want to abandon entirely
```

If only some tasks need to be undone, use `git log --oneline feature/Argentina-ES ^main` to list commits and `git revert <sha>` for the ones to undo. Prefer revert over reset to preserve history.
