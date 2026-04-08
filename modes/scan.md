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

## Estrategia de descubrimiento (3 niveles)

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

**Prioridad de ejecución:**
1. Nivel 1: Playwright → todas las `tracked_companies` con `careers_url`
2. Nivel 2: API → todas las `tracked_companies` con `api:`
3. Nivel 3: WebSearch → todos los `search_queries` con `enabled: true`

Los niveles son aditivos — se ejecutan todos, los resultados se mezclan y deduplicar.

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

6. **Filtrar por título** usando `title_filter` de `portals.yml`:
   - Al menos 1 keyword de `positive` debe aparecer en el título (case-insensitive)
   - 0 keywords de `negative` deben aparecer
   - `seniority_boost` keywords dan prioridad pero no son obligatorios

7. **Deduplicar** contra 3 fuentes:
   - `scan-history.tsv` → URL exacta ya vista
   - `applications.md` → empresa + rol normalizado ya evaluado
   - `pipeline.md` → URL exacta ya en pendientes o procesadas

7.5. **Verificar en el sitio del EMPLEADOR — OBLIGATORIO para TODOS los niveles**

   **REGLA CRÍTICA: Un puesto solo es real si aparece en la página de empleo del empleador o su ATS directo.** Los agregadores (Flexionis, Indeed, ZipRecruiter, Glassdoor, Lensa, CyberSecJobs, TeaHQ, DailyRemote, etc.) scrappean datos obsoletos, fabrican listings, y enlazan a ofertas expiradas. NUNCA confiar en un agregador como prueba de que un puesto existe.

   **Workflow de validación (aplica a TODOS los niveles, no solo Nivel 3):**

   Para cada URL nueva candidata (secuencial — NUNCA Playwright en paralelo):

   **Paso A — Identificar URL canónica del empleador:**
   - Si la URL ya está en el ATS del empleador (Greenhouse, Ashby, Lever, Workable, iCIMS, careers page propia) → usar directamente
   - Si la URL es de un agregador → buscar la página de careers del empleador (revisar `portals.yml` o buscar `"{company}" careers`)
   - Navegar a la careers page del empleador con Playwright y buscar/filtrar el puesto

   **Paso B — Verificar liveness en el sitio del empleador:**
   a. `browser_navigate` a la URL canónica del empleador
   b. `browser_snapshot` para leer el contenido
   c. Clasificar:
      - **Activa**: título del puesto visible + descripción del rol + botón Apply/Submit/Solicitar
      - **Expirada** (cualquiera de estas señales):
        - URL final contiene `?error=true` (Greenhouse redirige así cuando la oferta está cerrada)
        - Página contiene: "job no longer available" / "no longer open" / "position has been filled" / "this job has expired" / "page not found"
        - Solo navbar y footer visibles, sin contenido JD (contenido < ~300 chars)
      - **No encontrada en sitio del empleador**: el puesto NO aparece en su careers page → tratar como stale/fake

   **Paso C — Clasificar resultado:**
   - Si activa en sitio del empleador → continuar al paso 8, usando la URL canónica del empleador (NO la del agregador)
   - Si expirada: registrar en `scan-history.tsv` con status `skipped_expired` y descartar
   - Si no encontrada en sitio del empleador: registrar con status `skipped_unverified` y descartar
   - Si `browser_navigate` da error (timeout, 403, etc.): marcar como `skipped_unverified` y continuar

   **No interrumpir el scan entero si una URL falla.** Continuar con la siguiente.

   **URLs canónicas**: La URL que se guarda en pipeline.md y reports SIEMPRE es la del empleador directo, NUNCA la del agregador.

8. **Para cada oferta nueva verificada que pase filtros**:
   a. Añadir a `pipeline.md` sección "Pendientes": `- [ ] {url} | {company} | {title}`
   b. Registrar en `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Ofertas filtradas por título**: registrar en `scan-history.tsv` con status `skipped_title`
10. **Ofertas duplicadas**: registrar con status `skipped_dup`
11. **Ofertas expiradas**: registrar con status `skipped_expired`
12. **Ofertas no verificables en sitio del empleador**: registrar con status `skipped_unverified` (solo existía en agregadores)

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
https://...	2026-02-10	WebSearch — AI PM	PM AI	ClosedCo	skipped_expired
```

## Resumen de salida

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries ejecutados: N
Ofertas encontradas: N total
Filtradas por título: N relevantes
Duplicadas: N (ya evaluadas o en pipeline)
Expiradas descartadas: N (links muertos, Nivel 3)
Nuevas añadidas a pipeline.md: N

  + {company} | {title} | {query_name}
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

## Búsqueda ampliada para roles ejecutivos (VP+/C-suite)

Los Niveles 1-3 están optimizados para roles IC-to-Director. Para roles VP+/C-suite, añadir estas estrategias:

### Nivel 4 — Greenhouse/Ashby/Lever API bulk scan (EXECUTIVE DISCOVERY)

Muchas empresas top usan Greenhouse, Ashby, o Lever. Sus APIs devuelven JSON con TODOS los roles abiertos — filtrar por título es rápido y confiable.

**Greenhouse API pattern:**
```
curl -s https://boards-api.greenhouse.io/v1/boards/{slug}/jobs | jq '.jobs[] | select(.title | test("VP|Vice President|Head of|Director|Chief|Principal|SVP|Senior Director"; "i")) | {title, location: .location.name, url: .absolute_url}'
```

**Ashby GraphQL pattern:**
```
curl -s "https://jobs.ashbyhq.com/api/non-user-graphql?operationName=ApiJobBoardWithTeams" \
  -H "Content-Type: application/json" \
  -d '{"operationName":"ApiJobBoardWithTeams","variables":{"organizationHostedJobsPageName":"{slug}"},"query":"query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { teams { name jobPostings { id title locationName } } } }"}'
```

**Lever API pattern:**
```
curl -s https://api.lever.co/v0/postings/{slug}?mode=json | jq '.[] | select(.text | test("VP|Head|Director|Chief"; "i")) | {title: .text, location: .categories.location, url: .hostedUrl}'
```

**Empresas recomendadas para bulk scan ejecutivo:** Databricks, Datadog, Stripe, Cloudflare, GitLab, Elastic, Okta, MongoDB, Brex, Scale AI, OpenAI, Palantir, Salesforce, HashiCorp, Twilio — además de todas las `tracked_companies` con `api:` field.

### Nivel 5 — Startup discovery (BROADER NET)

Para descubrir startups que no están en `tracked_companies`:
1. **Exa/parallel.ai semantic search:** Buscar "Head of AI" OR "VP AI" at recently funded startups
2. **LinkedIn search:** `site:linkedin.com/jobs "VP AI" OR "Head of AI" remote`
3. **Wellfound/AngelList:** `site:wellfound.com "Head of AI" OR "CTO" remote`
4. **YC companies:** `site:ycombinator.com/companies "hiring" "Head of" OR "CTO" AI`
5. **Gemini CLI:** Use `gemini -m gemini-3.1-pro-preview -p "search query"` for grounded web search

**REGLA: Nivel 5 results SIEMPRE require employer-site verification (Paso 7.5).** Estos canales devuelven mixed quality — LinkedIn especially links to aggregator mirrors.

### Lesson aprendida: Aggregator staleness rates

De testing empírico (Abril 2026):
- **Greenhouse/Ashby/Lever API:** ~100% reliable (live employer data)
- **Employer careers page via Playwright:** ~95% reliable
- **WebSearch with site: filters:** ~70% reliable (Google caches for weeks)
- **Aggregators (Flexionis, Indeed, ZipRecruiter, etc.):** ~30% reliable for exec roles (high staleness, some fabricated)

**SIEMPRE preferir API > Playwright > WebSearch > Aggregator.**

## Mantenimiento del portals.yml

- **SIEMPRE guardar `careers_url`** cuando se añade una empresa nueva
- Añadir nuevos queries según se descubran portales o roles interesantes
- Desactivar queries con `enabled: false` si generan demasiado ruido
- Ajustar keywords de filtrado según evolucionen los roles target
- Añadir empresas a `tracked_companies` cuando interese seguirlas de cerca
- Verificar `careers_url` periódicamente — las empresas cambian de plataforma ATS
