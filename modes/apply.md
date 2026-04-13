# Mode: apply — Live Application Assistant

Interactive mode for when the candidate fills a job application form. Reads the page, loads prior offer context, and generates personalized answers for each form question.

## Requirements

- **Best with agent-browser (visible)**: Candidate sees the browser, Claude can interact with the page.
- **Without agent-browser**: Candidate shares a screenshot or pastes form questions manually.

## Workflow

```
1. DETECT     → Read active Chrome tab (screenshot/URL/title)
2. IDENTIFY   → Extract company + role from page
3. LOOKUP     → Match against existing reports in reports/
4. LOAD       → Read full report + Section G (if exists)
5. COMPARE    → Does page role match evaluated role? Changed → warn
6. ANALYZE   → Identify ALL visible form questions
7. GENERATE   → For each question, generate personalized answer
8. PRESENT    → Show formatted answers for copy-paste
```

## Step 1 — Detect the Offer

**With agent-browser:** `agent-browser snapshot -i --json` to read title, URL, and visible content.

**Without:** Ask the candidate to:
- Share a screenshot of the form (Read tool reads images)
- Or paste form questions as text
- Or name company + role so we can search

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

Identificar TODAS las preguntas visibles:
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

## Paso 6 — Post-apply (opcional)

Si el candidato confirma que envió la aplicación:
1. Actualizar estado en `applications.md` de "Evaluada" a "Aplicado"
2. Actualizar Section G del report con las respuestas finales
3. Sugerir siguiente paso: `/career-ops contacto` para LinkedIn outreach

## Scroll handling

Si el formulario tiene más preguntas que las visibles:
- Pedir al candidato que haga scroll y comparta otro screenshot
- O que pegue las preguntas restantes
- Procesar en iteraciones hasta cubrir todo el formulario
