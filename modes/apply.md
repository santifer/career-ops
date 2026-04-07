# Modo: apply — Asistente de Aplicación en Vivo

Modo interactivo para cuando el candidato está rellenando un formulario de aplicación en Chrome. Lee lo que hay en pantalla, carga el contexto previo de la oferta, y genera respuestas personalizadas para cada pregunta del formulario.

> **Browser autonomy patterns**: decision loop, session management, obstacle dismissal, CAPTCHA/2FA detection, submission gate, retry, action logging — see `modes/browser-session.md`

## Requisitos

- **Playwright-first (default)**: Use Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_fill_form`, `browser_type`, `browser_wait_for`) for active browser interaction. The agent reads page state, fills fields, and handles obstacles autonomously — stopping only at HITL gates (submission, CAPTCHA, 2FA).
- **Sin Playwright (fallback)**: Si Playwright no está disponible, el candidato comparte un screenshot o pega las preguntas manualmente. Ver sección "Sin Playwright" abajo.

## Workflow

```
1. DETECTAR    → Leer Chrome tab activa (screenshot/URL/título)
2. IDENTIFICAR → Extraer empresa + rol de la página
3. BUSCAR      → Match contra reports existentes en reports/
4. CARGAR      → Leer report completo + Section G (si existe)
5. COMPARAR    → ¿El rol en pantalla coincide con el evaluado? Si cambió → avisar
6. ANALIZAR    → Identificar TODAS las preguntas del formulario visibles
7. GENERAR     → Para cada pregunta, generar respuesta personalizada
8. PRESENTAR   → Mostrar respuestas formateadas para copy-paste
```

## Paso 1 — Detectar la oferta

**Con Playwright:**
1. If portal has `requires_login: true` in portals.yml, load session from `data/sessions/<portal>.json` per `modes/browser-session.md` → Session Management.
2. `browser_navigate` to the application URL.
3. `browser_snapshot` to read page state.
4. **Obstacle check**: If cookie banner or popup overlay detected, dismiss per `modes/browser-session.md` → Obstacle Dismissal. Re-snapshot after dismissal.
5. Identify the application form from clean snapshot — extract company name, role title, and form structure.

**Sin Playwright:** Pedir al candidato que:
- Comparta un screenshot del formulario (Read tool lee imágenes)
- O pegue las preguntas del formulario como texto
- O diga empresa + rol para que lo busquemos

## Paso 2 — Identificar y buscar contexto

1. Extraer nombre de empresa y título del rol de la página
2. Buscar en `reports/` por nombre de empresa (Grep case-insensitive)
3. Si hay match → cargar el report completo
4. Si hay Section G → cargar los draft answers previos como base
5. Si NO hay match → avisar y ofrecer ejecutar auto-pipeline rápido

## Paso 3 — Detectar cambios en el rol

Si el rol en pantalla difiere del evaluado:
- **Avisar al candidato**: "El rol ha cambiado de [X] a [Y]. ¿Quieres que re-evalúe o adapto las respuestas al nuevo título?"
- **Si adaptar**: Ajustar las respuestas al nuevo rol sin re-evaluar
- **Si re-evaluar**: Ejecutar evaluación A-F completa, actualizar report, regenerar Section G
- **Actualizar tracker**: Cambiar título del rol en applications.md si procede

## Paso 4 — Analizar preguntas del formulario

Identificar TODAS las preguntas visibles usando **decision loop** per `modes/browser-session.md`:
1. `browser_snapshot` → identify all visible form fields (textboxes, dropdowns, checkboxes, textareas)
2. Note each field's ARIA ref (e.g., `textbox "Cover Letter" [ref=e12]`) and label
3. If page is scrollable or has multiple sections: `browser_evaluate` with `window.scrollTo(0, document.body.scrollHeight)` → re-snapshot for newly visible fields
4. Check for "Next"/"Continue" buttons indicating multi-page forms → click → re-snapshot
5. Repeat until all fields found (max 50 iterations per `modes/browser-session.md`)
6. Match each field to profile data from cv.md and config/profile.yml

Field types to identify:
- Campos de texto libre (cover letter, why this role, etc.)
- Dropdowns (how did you hear, work authorization, etc.)
- Yes/No (relocation, visa, etc.)
- Campos de salario (range, expectation)
- Upload fields (resume, cover letter PDF)

Clasificar cada pregunta:
- **Ya respondida en Section G** → adaptar la respuesta existente
- **Nueva pregunta** → generar respuesta desde el report + cv.md

## Paso 5 — Generar respuestas

Para cada pregunta, generar la respuesta siguiendo:

1. **Contexto del report**: Usar proof points del bloque B, historias STAR del bloque F
2. **Section G previa**: Si existe una respuesta draft, usarla como base y refinar
3. **Tono "I'm choosing you"**: Mismo framework del auto-pipeline
4. **Especificidad**: Referenciar algo concreto del JD visible en pantalla
5. **career-ops proof point**: Incluir en "Additional info" si hay campo para ello

**Formato de output:**

```
## Respuestas para [Empresa] — [Rol]

Basado en: Report #NNN | Score: X.X/5 | Arquetipo: [tipo]

---

### 1. [Pregunta exacta del formulario]
> [Respuesta lista para copy-paste]

### 2. [Siguiente pregunta]
> [Respuesta]

...

---

Notas:
- [Cualquier observación sobre el rol, cambios, etc.]
- [Sugerencias de personalización que el candidato debería revisar]
```

## Paso 5b — Fill Form Fields (Playwright only)

For each form field identified in Paso 4, fill using Playwright tools:

1. **Text fields**: `browser_fill_form` with `{ref, value}` pairs, or `browser_type` for individual fields
2. **Dropdowns**: `browser_click` to open dropdown → find option ref → `browser_click` to select
3. **Checkboxes**: `browser_click` to toggle
4. **Multi-page forms**: After filling visible fields, check for "Next"/"Continue" → `browser_click` → `browser_snapshot` for next page fields
5. **After each fill**: Re-snapshot to verify the value was accepted
6. **Action logging**: Log each fill action per `modes/browser-session.md` → Action Logging

**CAPTCHA/2FA during fill**: If CAPTCHA or 2FA detected at any point during form fill, STOP immediately per `modes/browser-session.md`. Wait for user to resolve and type "resume".

**Partial form preservation**: If flow is interrupted, the action log records all filled fields and values for resumption.

## SUBMISSION GATE (CRITICAL — MANDATORY)

**Before clicking ANY Submit/Apply/Send/Bewerben/Absenden button:**

1. **STOP.** Do NOT click the submit button.
2. **Present summary** to the user:
   ```
   ## Submission Review — [Empresa] / [Rol]

   Filled fields:
   - Name: [value]
   - Email: [value]
   - Cover Letter: [first 100 chars]...
   - [All other fields with values]

   Files uploaded: [list]

   ⚠️ Review carefully. Type "go" to submit or "abort" to cancel.
   ```
3. **Wait for user response**:
   - User types `"go"` → `browser_click` the submit button
   - User types `"abort"` → do NOT submit. Ask if they want to save progress.
4. **Log the submission decision** to action log.

**NO EXCEPTIONS.** This enforces the CLAUDE.md ethical rule: "NEVER submit without user review."

## Paso 6 — Post-apply (opcional)

Si el candidato confirma que envió la aplicación:
1. Actualizar estado en `applications.md` de "Evaluada" a "Aplicado"
2. Actualizar Section G del report con las respuestas finales
3. Sugerir siguiente paso: `/career-ops contacto` para LinkedIn outreach

## Scroll handling (Playwright)

Si el formulario tiene más preguntas que las visibles:
- Use `browser_evaluate` with `window.scrollTo(0, document.body.scrollHeight)` to scroll down → re-snapshot for new fields
- For SPAs with lazy-loaded sections: `browser_wait_for` with `networkidle` → re-snapshot
- **Manual fallback**: If browser_evaluate fails, ask the candidate to scroll manually and type "done" when ready → re-snapshot

## Sin Playwright (fallback workflow)

Si Playwright no está disponible, usar el workflow manual:
1. El candidato comparte un screenshot del formulario (Read tool lee imágenes)
2. O pega las preguntas del formulario como texto
3. O dice empresa + rol para buscar en reports/
4. Generate respuestas y presentarlas para copy-paste
5. Para submit: siempre pedir confirmación del candidato antes de que envíe
