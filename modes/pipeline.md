# Modo: pipeline — Inbox de URLs (Second Brain)

Procesa URLs de ofertas acumuladas en `data/pipeline.md`. El usuario agrega URLs cuando quiera y luego ejecuta `/career-ops pipeline` para procesarlas todas.

## Workflow

1. **Leer** `data/pipeline.md` → buscar items `- [ ]` en la sección "Pendientes"
2. **Para cada URL pendiente**:
   a. Calcular siguiente `REPORT_NUM` secuencial (leer `reports/`, tomar el número más alto + 1)
   b. **Extraer JD** usando Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. Si la URL no es accesible → marcar como `- [!]` con nota y continuar
   d. **Ejecutar auto-pipeline completo**: Evaluación A-F → Report .md → PDF (si score >= 3.0) → Tracker
   e. **Mover de "Pendientes" a "Procesadas"**: `- [x] #NNN | URL | Empresa | Rol | Score/5 | PDF ✅/❌`
3. **Si hay 3+ URLs pendientes**, lanzar agentes en paralelo (Agent tool con `run_in_background`) para maximizar velocidad.
4. **Al terminar**, mostrar tabla resumen:

```
| # | Empresa | Rol | Score | PDF | Acción recomendada |
```

## Formato de pipeline.md

```markdown
## Pendientes
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Error: login required

## Procesadas
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

## Detección inteligente de JD desde URL

1. **Playwright (preferido):** `browser_navigate` + `browser_snapshot`. Funciona con todas las SPAs.
2. **WebFetch (fallback):** Para páginas estáticas o cuando Playwright no está disponible.
3. **WebSearch (último recurso):** Buscar en portales secundarios que indexan el JD.

**Casos especiales:**
- **LinkedIn**: Puede requerir login → marcar `[!]` y pedir al usuario que pegue el texto
- **PDF**: Si la URL apunta a un PDF, leerlo directamente con Read tool
- **`local:` prefix**: Leer el archivo local. Ejemplo: `local:jds/linkedin-pm-ai.md` → leer `jds/linkedin-pm-ai.md`

## Manejo de JDs locales (`local:` prefix)

Cuando el item tiene prefijo `local:` (e.g., `local:jds/yahoo-senior-frontend-engineer.md`):

### 1. Leer frontmatter y decidir si saltar

Antes de extraer y evaluar, leer el archivo y parsear el bloque YAML frontmatter:

```yaml
---
evaluated: 2026-04-16   # fecha de última evaluación (vacío = nunca evaluado)
score: 3.6/5
status: pending
---
```

**Regla de salto (skip):**
- Leer `jd_reeval_days` de `portals.yml` (default: 30 si no existe)
- Si `evaluated` está vacío o no existe → evaluar normalmente
- Si `evaluated` tiene fecha:
  - `hoy - evaluated < jd_reeval_days` → **saltar**: marcar como `- [=]` con nota `"skipped: evaluated YYYY-MM-DD (within N days)"`
  - `hoy - evaluated >= jd_reeval_days` → re-evaluar (la evaluación anterior es obsoleta)

### 2. Actualizar frontmatter tras evaluación

Después de completar la evaluación y guardar el report, actualizar el archivo JD:
- Escribir `evaluated: YYYY-MM-DD` (fecha de hoy)
- Escribir `score: X.X/5` (del reporte)
- Dejar el resto del frontmatter intacto

### Formato en pipeline.md para JDs saltados

```markdown
## Procesadas
- [=] local:jds/yahoo-senior-frontend-engineer.md | Yahoo | Senior Frontend Engineer | skipped: evaluated 2026-04-16 (within 30 days)
```

## Numeración automática

1. Listar todos los archivos en `reports/`
2. Extraer el número del prefijo (e.g., `142-medispend...` → 142)
3. Nuevo número = máximo encontrado + 1

## Sincronización de fuentes

Antes de procesar cualquier URL, verificar sync:
```bash
node cv-sync-check.mjs
```
Si hay desincronización, advertir al usuario antes de continuar.
