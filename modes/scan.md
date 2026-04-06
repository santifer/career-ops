# Modo: scan — Portal Scanner (Descubrimiento de Ofertas)

Escanea portales de empleo configurados, filtra por relevancia de título, y añade nuevas ofertas al pipeline para evaluación posterior.

## Ejecución recomendada

Ejecutar como subagente para no consumir contexto del main:

```
Agent(
    subagent_type="general-purpose",
    prompt="[contenido de este archivo + datos específicos]",
    run_in_background=True
)
```

## Configuración

Leer `portals.yml` que contiene:
- `search_queries`: Lista de queries WebSearch con `site:` filters por portal (descubrimiento amplio)
- `tracked_companies`: Empresas específicas con `careers_url` para navegación directa
- `title_filter`: Keywords positive/negative/seniority_boost para filtrado de títulos
- `linkedin`: Configuración de LinkedIn Jobs scan via browser-use CLI

## Estrategia de descubrimiento (4 niveles)

### Nivel 1 — Playwright directo (PRINCIPAL)

**Para cada empresa en `tracked_companies`:** Navegar a su `careers_url` con Playwright (`browser_navigate` + `browser_snapshot`), leer TODOS los job listings visibles, y extraer título + URL de cada uno. Este es el método más fiable porque:
- Ve la página en tiempo real (no resultados cacheados de Google)
- Funciona con SPAs (Ashby, Lever, Workday)
- Detecta ofertas nuevas al instante
- No depende de la indexación de Google

**Cada empresa DEBE tener `careers_url` en portals.yml.** Si no la tiene, buscarla una vez, guardarla, y usar en futuros scans.

### Nivel 2 — Greenhouse API (COMPLEMENTARIO)

Para empresas con Greenhouse, la API JSON (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`) devuelve datos estructurados limpios. Usar como complemento rápido de Nivel 1 — es más rápido que Playwright pero solo funciona con Greenhouse.

### Nivel 3 — WebSearch queries (DESCUBRIMIENTO AMPLIO)

Los `search_queries` con `site:` filters cubren portales de forma transversal (todos los Ashby, todos los Greenhouse, etc.). Útil para descubrir empresas NUEVAS que aún no están en `tracked_companies`, pero los resultados pueden estar desfasados.

### Nivel 4 — LinkedIn Jobs (browser-use)

Busca en LinkedIn Jobs usando la sesión de Chrome del usuario via `browser-use` CLI con `--profile`. Construye búsquedas a partir de los keywords en `title_filter.positive` y aplica filtros de ubicación/tipo de trabajo desde la sección `linkedin` de portals.yml.

Requiere: browser-use CLI instalado (`pip install browser-use`), perfil de Chrome con sesión de LinkedIn activa.

**CRÍTICO: browser-use y Playwright ambos lanzan Chrome. Los Niveles 1-3 DEBEN completarse y cerrar su navegador ANTES de iniciar el Nivel 4. Después del Nivel 4, ejecutar `browser-use close` antes de cualquier operación posterior con Playwright.**

**Prioridad de ejecución:**
1. Nivel 1: Playwright → todas las `tracked_companies` con `careers_url`
2. Nivel 2: API → todas las `tracked_companies` con `api:`
3. Nivel 3: WebSearch → todos los `search_queries` con `enabled: true`
4. Nivel 4: LinkedIn → keywords de `title_filter.positive` (si `linkedin.enabled`)

Los niveles son aditivos — se ejecutan todos, los resultados se mezclan y deduplican.

## Workflow

1. **Leer configuración**: `portals.yml`
2. **Leer historial**: `data/scan-history.tsv` → URLs ya vistas
3. **Leer dedup sources**: `data/applications.md` + `data/pipeline.md`

4. **Nivel 1 — Playwright scan** (paralelo en batches de 3-5):
   Para cada empresa en `tracked_companies` con `enabled: true` y `careers_url` definida:
   a. `browser_navigate` a la `careers_url`
   b. `browser_snapshot` para leer todos los job listings
   c. Si la página tiene filtros/departamentos, navegar las secciones relevantes
   d. Para cada job listing extraer: `{title, url, company}`
   e. Si la página pagina resultados, navegar páginas adicionales
   f. Acumular en lista de candidatos
   g. Si `careers_url` falla (404, redirect), intentar `scan_query` como fallback y anotar para actualizar la URL

5. **Nivel 2 — Greenhouse APIs** (paralelo):
   Para cada empresa en `tracked_companies` con `api:` definida y `enabled: true`:
   a. WebFetch de la URL de API → JSON con lista de jobs
   b. Para cada job extraer: `{title, url, company}`
   c. Acumular en lista de candidatos (dedup con Nivel 1)

6. **Nivel 3 — WebSearch queries** (paralelo si posible):
   Para cada query en `search_queries` con `enabled: true`:
   a. Ejecutar WebSearch con el `query` definido
   b. De cada resultado extraer: `{title, url, company}`
      - **title**: del título del resultado (antes del " @ " o " | ")
      - **url**: URL del resultado
      - **company**: después del " @ " en el título, o extraer del dominio/path
   c. Acumular en lista de candidatos (dedup con Nivel 1+2)

7. **Nivel 4 — LinkedIn Jobs** (secuencial, DESPUÉS de cerrar Playwright):

   **Pre-check:** Verificar `linkedin.enabled: true` en portals.yml. Si es false o no existe, saltar.
   Verificar que `browser-use` está instalado (Bash: `which browser-use`). Si no, saltar con mensaje.
   **CRÍTICO:** Cerrar el navegador Playwright ANTES de iniciar browser-use.

   a. Leer config `linkedin` de portals.yml
   b. Determinar ubicación: usar `linkedin.location` si está definido, sino `config/profile.yml` → `location.country`
   c. Construir queries de búsqueda desde `title_filter.positive`:
      - Términos multi-palabra (ej: "Data Scientist") → búsquedas individuales
      - Términos de una palabra (ej: "AI", "ML") → combinar con OR (ej: "AI OR ML")
      - Limitar a `max_queries` (priorizar términos multi-palabra)
   d. Mapear `time_posted`: "24h"→`r86400`, "7d"→`r604800`, "30d"→`r2592000`
   e. Mapear `work_type`: "onsite"→`f_WT=1`, "remote"→`f_WT=2`, "hybrid"→`f_WT=3`, "any"→omitir
   f. Para cada query:
      i.   `browser-use --profile "{chrome_profile}" open "https://www.linkedin.com/jobs/search/?keywords={encoded}&location={location}&f_TPR={time}&sortBy=DD{&f_WT=N}"`
      ii.  `browser-use state` → verificar que cargó (no página de login)
      iii. Si detecta página de login (presencia de "Sign in", redirect a `/login`) → abortar Nivel 4 con warning, `browser-use close`, continuar
      iv.  Extraer jobs via `browser-use eval` con JS que busca job cards en el DOM:
           ```javascript
           JSON.stringify(Array.from(document.querySelectorAll(
             '.job-card-container, .jobs-search-results__list-item, [data-job-id]'
           )).map(card => {
             const titleEl = card.querySelector('.job-card-list__title, .job-card-container__link');
             const companyEl = card.querySelector('.job-card-container__primary-description, .job-card-container__company-name');
             const href = titleEl?.href || titleEl?.closest('a')?.href || '';
             const jobId = href.match(/\/jobs\/view\/(\d+)/)?.[1] || card.getAttribute('data-job-id') || '';
             return {
               title: titleEl?.textContent?.trim() || '',
               company: companyEl?.textContent?.trim() || '',
               url: jobId ? 'https://www.linkedin.com/jobs/view/' + jobId + '/' : href,
               jobId: jobId
             };
           }).filter(j => j.title && j.jobId))
           ```
      v.   Si eval retorna vacío → fallback: `browser-use state` y parsear elementos con links a `/jobs/view/`
      vi.  Si `max_results_per_query > 25`: `browser-use scroll down`, esperar 2s, re-extraer, merge
      vii. Acumular resultados: `{title, url, company}`
      viii. Esperar `delay_between_searches` segundos antes del siguiente query
   g. `browser-use close` (OBLIGATORIO — libera Chrome para futuro uso de Playwright)
   h. Merge resultados con candidatos de Niveles 1-3

8. **Filtrar por título** usando `title_filter` de `portals.yml`:
   - Al menos 1 keyword de `positive` debe aparecer en el título (case-insensitive)
   - 0 keywords de `negative` deben aparecer
   - `seniority_boost` keywords dan prioridad pero no son obligatorios

9. **Deduplicar** contra 3 fuentes:
   - `scan-history.tsv` → URL exacta ya vista
   - `applications.md` → empresa + rol normalizado ya evaluado
   - `pipeline.md` → URL exacta ya en pendientes o procesadas

   **Dedup cross-platform (Nivel 4):** Las URLs de LinkedIn difieren de las de Greenhouse/Ashby para el mismo puesto. Para resultados de LinkedIn, además del dedup por URL, verificar si `company + título normalizado` ya existe en los resultados de Niveles 1-3, pipeline.md, o applications.md. Normalización: lowercase, eliminar info entre paréntesis. Registrar como `skipped_dup_xplatform`.

10. **Para cada oferta nueva que pase filtros**:
    a. Añadir a `pipeline.md` sección "Pendientes": `- [ ] {url} | {company} | {title}`
    b. Registrar en `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`
    Para resultados de LinkedIn, usar `linkedin-jobs` como portal en scan-history.tsv.

11. **Ofertas filtradas por título**: registrar en `scan-history.tsv` con status `skipped_title`
12. **Ofertas duplicadas**: registrar con status `skipped_dup` o `skipped_dup_xplatform`

## Extracción de título y empresa de WebSearch results

Los resultados de WebSearch vienen en formato: `"Job Title @ Company"` o `"Job Title | Company"` o `"Job Title — Company"`.

Patrones de extracción por portal:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`

Regex genérico: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## URLs privadas

Si se encuentra una URL no accesible públicamente:
1. Guardar el JD en `jds/{company}-{role-slug}.md`
2. Añadir a pipeline.md como: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan History

`data/scan-history.tsv` trackea TODAS las URLs vistas:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
```

## Resumen de salida

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries ejecutados: N (Playwright: N, API: N, WebSearch: N, LinkedIn: N)
Ofertas encontradas: N total
Filtradas por título: N relevantes
Duplicadas: N (ya evaluadas o en pipeline)
  - URL dups: N
  - Cross-platform dups: N
Nuevas añadidas a pipeline.md: N

  + {company} | {title} | {source}
  ...

→ Ejecuta /career-ops pipeline para evaluar las nuevas ofertas.
```

## Gestión de careers_url

Cada empresa en `tracked_companies` debe tener `careers_url` — la URL directa a su página de ofertas. Esto evita buscarlo cada vez.

**Patrones conocidos por plataforma:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` o `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **Custom:** La URL propia de la empresa (ej: `https://openai.com/careers`)

**Si `careers_url` no existe** para una empresa:
1. Intentar el patrón de su plataforma conocida
2. Si falla, hacer un WebSearch rápido: `"{company}" careers jobs`
3. Navegar con Playwright para confirmar que funciona
4. **Guardar la URL encontrada en portals.yml** para futuros scans

**Si `careers_url` devuelve 404 o redirect:**
1. Anotar en el resumen de salida
2. Intentar scan_query como fallback
3. Marcar para actualización manual

## Mantenimiento del portals.yml

- **SIEMPRE guardar `careers_url`** cuando se añade una empresa nueva
- Añadir nuevos queries según se descubran portales o roles interesantes
- Desactivar queries con `enabled: false` si generan demasiado ruido
- Ajustar keywords de filtrado según evolucionen los roles target
- Añadir empresas a `tracked_companies` cuando interese seguirlas de cerca
- Verificar `careers_url` periódicamente — las empresas cambian de plataforma ATS
