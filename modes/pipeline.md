# Modo: pipeline — Inbox de URLs (Second Brain)

Procesa URLs de ofertas acumuladas en `data/pipeline.md`. El usuario agrega URLs cuando quiera y luego ejecuta `/career-ops pipeline` para procesarlas todas.

## Workflow

1. **Leer** `data/pipeline.md` → buscar items `- [ ]` en la sección "Pendientes"
2. **Para cada URL pendiente**:
   a. Calcular siguiente `REPORT_NUM` secuencial (leer `reports/`, tomar el número más alto + 1)
   b. **Extraer JD** usando Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. **Freshness pre-filter** (NUEVO — antes de evaluar):
      Ejecutar `node check-liveness.mjs --fetch-mode --json <url>`. Parsear el JSON resultado:
      - Si `result: "expired"` o `freshness: "expired"` → **NO evaluar**. Escribir un report mínimo `SKIPPED_STALE` (ver formato abajo). Tracker TSV con status `Discarded` y nota `stale_posting`. Saltar al siguiente URL — ahorra tokens en links muertos.
      - Si `freshness: "stale"` → continuar a la evaluación, pero el evaluador aplicará automáticamente penalización -0.5 a Red Flags (ver `_shared.md`).
      - Si `result: "active"` y `freshness: "fresh"` → continuar normalmente.
      - Si el script falla por completo (timeout/network error) → marcar el report header con `**Posted:** unverified` y continuar a la evaluación.
   d. Si la URL no es accesible → marcar como `- [!]` con nota y continuar
   e. **Ejecutar auto-pipeline completo**: Evaluación A-F → Report .md → PDF (si score >= 3.0) → Tracker
   f. **Mover de "Pendientes" a "Procesadas"**: `- [x] #NNN | URL | Empresa | Rol | Score/5 | PDF ✅/❌`
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
- [x] #145 | https://stale.url/job/old | OldCo | Eng | SKIPPED_STALE | PDF ❌
```

## Report Header — required fields

Every report (full or skipped) MUST include this header block, in this order:

```markdown
# {Company} — {Role}

**Score:** {X.X}/5 | SKIPPED_STALE | SKIPPED_INACCESSIBLE
**URL:** {url}
**Posted:** {YYYY-MM-DD} ({N} days ago) | unverified
**PDF:** ✅ | ❌
**Date:** {YYYY-MM-DD}
```

The `**Posted:**` field is mandatory. If the freshness check could not extract a date, write `unverified` — never omit the field.

## SKIPPED_STALE report format (minimal — no A-F evaluation)

When the freshness check classifies a URL as `expired`, write a minimal report and skip evaluation entirely:

```markdown
# {Company} — {Role}

**Score:** SKIPPED_STALE
**URL:** {url}
**Posted:** {YYYY-MM-DD} ({N} days ago)
**PDF:** ❌
**Date:** {today}
**Reason:** Posting exceeds max_age_days (configured threshold from portals.yml)

This posting was filtered before evaluation because the listing date is older than the freshness window. No tokens spent on A-F scoring. To override, add the URL manually to pipeline.md after `freshness.max_age_days` is increased in portals.yml.
```

Tracker TSV for skipped: status = `Discarded`, score = `0.0/5`, note = `stale_posting`

## Detección inteligente de JD desde URL

1. **Playwright (preferido):** `browser_navigate` + `browser_snapshot`. Funciona con todas las SPAs.
2. **WebFetch (fallback):** Para páginas estáticas o cuando Playwright no está disponible.
3. **WebSearch (último recurso):** Buscar en portales secundarios que indexan el JD.

**Casos especiales:**
- **LinkedIn**: Puede requerir login → marcar `[!]` y pedir al usuario que pegue el texto
- **PDF**: Si la URL apunta a un PDF, leerlo directamente con Read tool
- **`local:` prefix**: Leer el archivo local. Ejemplo: `local:jds/linkedin-pm-ai.md` → leer `jds/linkedin-pm-ai.md`

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
