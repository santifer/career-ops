# Modo: pipeline — Inbox de URLs (Second Brain)

Procesa URLs de ofertas acumuladas en `data/pipeline.md`. El usuario agrega URLs cuando quiera y luego ejecuta `/career-ops pipeline` para procesarlas todas.

## Workflow

1. **Leer** `data/pipeline.md` → buscar items `- [ ]` en la sección "Pendientes"
2. **Para cada URL pendiente**:
   a. Calcular siguiente `REPORT_NUM` secuencial (leer `reports/`, tomar el número más alto + 1)
   b. **Extraer JD** usando Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
      - **Obstacle check**: After `browser_snapshot`, check for cookie banners (look for: "Accept all", "Accept cookies", "Allow all"). Dismiss with `browser_click` before reading content. See `modes/browser-session.md` → Obstacle Dismissal.
      - **CAPTCHA detection**: If CAPTCHA signals found ("verify you are human", "recaptcha", "hcaptcha", "I'm not a robot") → mark as `- [!]` with note "CAPTCHA — requires manual resolution". Behavior depends on `captcha_strategy` in portals.yml (default: "stop" per `templates/portals.example.yml`): "stop" → HITL pause; "skip" → mark [!] and continue.
      - **Session handling**: For portals with `requires_login: true` in portals.yml, load session from `data/sessions/<portal>.json` before navigate. If session expired (login redirect), mark as [!] with note "Session expired".
      - **Retry on failure**: If navigate/snapshot fails, retry up to 3 times (2s, 5s, 10s waits) per `modes/browser-session.md` → Retry Policy. After 3 failures → fall back to WebFetch.
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
