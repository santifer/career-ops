# Modo: render — Re-renderizar CV MD a PDF (sin tailoring)

Propósito: toma un CV markdown **ya tailored** (y posiblemente hand-editado por el usuario) y lo convierte en un PDF nuevo, pasando por el mismo template HTML que usa el modo `pdf` — pero **sin ninguna reescritura, tailoring, o keyword injection**. El contenido del MD es autoritativo.

## Cuándo usar

- El usuario corrió `auto-pipeline` o `pdf`, revisó el MD tailored en `output/markdown/`, y editó algunas frases a mano.
- El usuario quiere rehacer el PDF con sus ediciones aplicadas.
- El usuario quiere generar un PDF desde cualquier archivo markdown con la estructura de `cv.md`.

## Invocación

```
/career-ops render <NNN>              # shorthand por número (busca output/markdown/{NNN}-*.md)
/career-ops render --cv=<NNN>         # equivalente
/career-ops render <path-a-md>        # path explícito a cualquier archivo markdown
/career-ops render <NNN> --format=a4  # override del formato de papel
```

## Resolución del argumento

1. **Si el argumento es numérico** (matches `^\d+$`, con o sin padding):
   - Zero-pad a 3 dígitos (ej: `3` → `003`).
   - Glob: `output/markdown/{NNN}-*.md`.
   - **0 matches** → error: "No se encontró CV con número {NNN}. Archivos disponibles: ..." (listar). Abortar.
   - **1 match** → usar ese archivo.
   - **2+ matches** → error: "Múltiples matches para {NNN}: ..." (listar). Abortar. (No debería pasar con numeración estricta.)
2. **Si el argumento es un path** (contiene `/` o termina en `.md`): usar directamente. Verificar que existe.
3. **Si no se puede resolver**: pedir al usuario que provea un NNN o path válido.

## Paso 1 — Leer metadata del MD

Parsear el **HTML comment de render-context** del comienzo del archivo (ver `modes/pdf.md` → "Output Markdown"). Ejemplo:

```
<!-- career-ops:render format=letter language=en company="Bitovi" date=2026-04-12 number=001 -->
```

Campos esperados:
- `format` → `letter` o `a4`. Default si ausente: `letter`.
- `language` → código ISO (`en`, `es`, etc.). Default: `en`.
- `company` → slug para el filename output. Default si ausente: derivar del filename.
- `date` → YYYY-MM-DD. Default: hoy.
- `number` → 3-dígitos NNN. Default: derivar del filename (o calcular next si es path externo).

**CLI flags overriden metadata embebida.** Si el usuario pasa `--format=a4`, usar `a4` independiente de la metadata.

**Si el comment está ausente** (ej: usuario pasó un archivo externo sin metadata):
- Intentar derivar del filename (`{NNN}-cv-{candidate}-{company}-{date}.md` → extraer número, empresa, fecha).
- Para campos no derivables, usar defaults + ask user si es crítico.

## Paso 2 — Parsear el MD como `cv.md`

El archivo input **debe seguir el shape de `cv.md`** (misma jerarquía de headings, misma estructura de bullets, mismas líneas de empresa/rol). El pipeline de render lo parsea con la misma lógica que usa para `cv.md` hoy, excepto que **no hace tailoring**:

- NO reescribe el Professional Summary
- NO selecciona top N proyectos (incluye todos los que estén en el MD)
- NO reordena bullets
- NO inyecta keywords
- NO extrae competencies del JD (usa lo que esté en la sección "Core Competencies" del MD)

En otras palabras: el contenido del MD va al HTML **verbatim**, solo con el layout/formatting del template aplicado.

## Paso 3 — Fill del template

Aplicar el mismo fill-del-template que `modes/pdf.md` Pasos 12-13, pero con las secciones parseadas del MD (no con contenido tailored). Leer `templates/cv-template.html` y sustituir placeholders desde el MD.

**Mapeo MD → placeholders del template:**

| Sección del MD | Placeholder(s) |
|----------------|----------------|
| `# {Name}` | `{{NAME}}` |
| Bold line después del nombre | (descartado — no hay placeholder de título en el template actual; si necesitamos uno, es follow-up) |
| Línea de contacto | `{{EMAIL}}`, `{{LINKEDIN_URL}}`, `{{LINKEDIN_DISPLAY}}`, `{{PORTFOLIO_URL}}`, `{{PORTFOLIO_DISPLAY}}`, `{{LOCATION}}` |
| `## Professional Summary` | `{{SUMMARY_TEXT}}` (primer párrafo, HTML-escaped) |
| `## Core Competencies` bullets | `{{COMPETENCIES}}` (cada bullet → `<span class="competency-tag">bullet</span>`) |
| `## Professional Experience` bloques | `{{EXPERIENCE}}` (cada H3 → `<div class="job">` con header + role + ul/li) |
| `## Projects` bloques | `{{PROJECTS}}` (cada H3 → `<div class="project">` con título + badge + descripción + stack) |
| `## Education` | `{{EDUCATION}}` |
| `## Professional Certifications` | `{{CERTIFICATIONS}}` |
| `## Technical Skills` | `{{SKILLS}}` |
| Section headers | `{{SECTION_*}}` (traducir según `language`) |
| `{{LANG}}` | valor del campo `language` |
| `{{PAGE_WIDTH}}` | `8.5in` si `format=letter`, `210mm` si `format=a4` |

## Paso 4 — Asegurar directorios

```bash
mkdir -p output/pdf output/markdown
```

## Paso 5 — Escribir HTML intermedio + PDF

1. Escribir HTML a `/tmp/cv-{candidate}-{company}-render.html`.
2. Ejecutar:
   ```bash
   node generate-pdf.mjs /tmp/cv-{candidate}-{company}-render.html output/pdf/{NNN}-cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}
   ```
3. **Sobrescribe** el PDF existente en esa ruta (no mintea nuevo número).

## Paso 6 — Actualizar MD mirror

Después de renderizar, re-escribir el MD input al path canónico con:
- Metadata comment actualizado (con fecha de hoy si cambió)
- Contenido inalterado

Esto asegura que el MD y PDF siempre tengan metadata consistente.

**Caso borde:** si el usuario pasó un path externo (no en `output/markdown/`), **no** sobre-escribirlo. Preguntar si quiere copiarlo a `output/markdown/{NNN}-...` con un nuevo NNN, o dejarlo donde está.

## Paso 7 — Reportar

Mostrar al usuario:
- Path del PDF generado
- Número de páginas
- Path del MD (si fue actualizado)
- Diff conciso del MD input vs. el último tailored (si hay commit previo en git — opcional, nice-to-have)
- Recordatorio: "Si el PDF no se ve como esperabas, edita `{NNN}-cv-...-{date}.md` y vuelve a correr `/career-ops render {NNN}`."

## Ética

Igual que todos los modos de career-ops:
- **NUNCA** hacer submit automático.
- El PDF generado es para que el usuario revise y use cuando decida aplicar.
- Si el usuario editó el MD para agregar claims no verificables, es su responsabilidad — este modo es mecánico, no hace fact-checking.

## Errores comunes

| Síntoma | Causa | Fix |
|---------|-------|-----|
| "No se encontró CV con número X" | NNN no existe en `output/markdown/` | Correr `ls output/markdown/` para ver disponibles, o pasar path directo |
| MD parece OK pero el PDF sale mal | MD no sigue shape de `cv.md` | Comparar con `cv.md`: H1 para nombre, H2 para secciones, H3 para roles/proyectos |
| PDF generado pero faltan secciones | Sección del MD no matcheó ningún H2 reconocido | Usar exactamente los nombres: Professional Summary, Core Competencies, Technical Skills, Professional Experience, Projects, Education, Professional Certifications |
| `mkdir -p output/pdf` falla | Permisos | Correr desde la raíz del proyecto career-ops |
