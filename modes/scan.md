# Mode: scan — Job portal discovery

Scans configured job sources, filters by title relevance, and appends new listings to the pipeline for later evaluation.

## Recommended execution

Run as a subagent so the main context is not consumed:

```
Agent(
    subagent_type="general-purpose",
    prompt="[contents of this file + specific data]",
    run_in_background=True
)
```

## Configuration

Read `portals.yml`, which defines:
- `search_queries`: WebSearch queries with `site:` filters per board (broad discovery)
- `tracked_companies`: Specific companies with `careers_url` for direct navigation
- `title_filter`: `positive` / `negative` / `seniority_boost` keywords for title filtering

## Discovery strategy (3 levels)

### Level 1 — Direct Playwright (PRIMARY)

**For each company in `tracked_companies`:** Open `careers_url` with Playwright (`browser_navigate` + `browser_snapshot`), read **all** visible job rows, extract title + URL. Most reliable because:
- Sees the live page (not stale Google snippets)
- Works on SPAs (Ashby, Lever, Workday)
- Picks up new posts immediately
- Does not depend on Google indexing

**Every company should have `careers_url` in portals.yml.** If missing, find it once, save it, reuse on future scans.

### Nivel 2 — ATS APIs / Feeds (COMPLEMENTARIO)

Para empresas con API pública o feed estructurado, usar la respuesta JSON/XML como complemento rápido de Nivel 1. Es más rápido que Playwright y reduce errores de scraping visual.

**Soporte actual (variables entre `{}`):**
- **Greenhouse**: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- **Ashby**: `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR**: lista `https://{company}.bamboohr.com/careers/list`; detalle de una oferta `https://{company}.bamboohr.com/careers/{id}/detail`
- **Lever**: `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor**: `https://{company}.teamtailor.com/jobs.rss`
- **Workday**: `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Convención de parsing por provider:**
- `greenhouse`: `jobs[]` → `title`, `absolute_url`
- `ashby`: GraphQL `ApiJobBoardWithTeams` con `organizationHostedJobsPageName={company}` → `jobBoard.jobPostings[]` (`title`, `id`; construir URL pública si no viene en payload)
- `bamboohr`: lista `result[]` → `jobOpeningName`, `id`; construir URL de detalle `https://{company}.bamboohr.com/careers/{id}/detail`; para leer el JD completo, hacer GET del detalle y usar `result.jobOpening` (`jobOpeningName`, `description`, `datePosted`, `minimumExperience`, `compensation`, `jobOpeningShareUrl`)
- `lever`: array raíz `[]` → `text`, `hostedUrl` (fallback: `applyUrl`)
- `teamtailor`: RSS items → `title`, `link`
- `workday`: `jobPostings[]`/`jobPostings` (según tenant) → `title`, `externalPath` o URL construida desde el host

### Level 3 — WebSearch queries (BROAD DISCOVERY)

`search_queries` with `site:` filters sweep whole boards (all Ashby, all Greenhouse, etc.). Good for finding **new** companies not yet in `tracked_companies`; results can be stale.

**Run order:**
1. Level 1: Playwright → all `tracked_companies` with `careers_url`
2. Level 2: API → all `tracked_companies` with `api:`
3. Level 3: WebSearch → all `search_queries` with `enabled: true`

Levels are additive — run all, merge and dedupe.

## Workflow

1. **Read config:** `portals.yml`
2. **Read history:** `data/scan-history.tsv` → URLs already seen
3. **Read dedup sources:** `data/applications.md` + `data/pipeline.md`

4. **Level 1 — Playwright scan** (parallel batches of 3–5):
   For each `tracked_companies` row with `enabled: true` and a defined `careers_url`:
   a. `browser_navigate` to `careers_url`
   b. `browser_snapshot` to read all listings
   c. If the page has filters/departments, open relevant sections
   d. For each listing extract `{title, url, company}`
   e. If paginated, walk pages
   f. Append to candidate list
   g. If `careers_url` fails (404, redirect), try `scan_query` as fallback and note to fix the URL

5. **Nivel 2 — ATS APIs / feeds** (paralelo):
   Para cada empresa en `tracked_companies` con `api:` definida y `enabled: true`:
   a. WebFetch de la URL de API/feed
   b. Si `api_provider` está definido, usar su parser; si no está definido, inferir por dominio (`boards-api.greenhouse.io`, `jobs.ashbyhq.com`, `api.lever.co`, `*.bamboohr.com`, `*.teamtailor.com`, `*.myworkdayjobs.com`)
   c. Para **Ashby**, enviar POST con:
      - `operationName: ApiJobBoardWithTeams`
      - `variables.organizationHostedJobsPageName: {company}`
      - query GraphQL de `jobBoardWithTeams` + `jobPostings { id title locationName employmentType compensationTierSummary }`
   d. Para **BambooHR**, la lista solo trae metadatos básicos. Para cada item relevante, leer `id`, hacer GET a `https://{company}.bamboohr.com/careers/{id}/detail`, y extraer el JD completo desde `result.jobOpening`. Usar `jobOpeningShareUrl` como URL pública si viene; si no, usar la URL de detalle.
   e. Para **Workday**, enviar POST JSON con al menos `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}` y paginar por `offset` hasta agotar resultados
   f. Para cada job extraer y normalizar: `{title, url, company}`
   g. Acumular en lista de candidatos (dedup con Nivel 1)

6. **Level 3 — WebSearch queries** (parallel when possible):
   For each `search_queries` entry with `enabled: true`:
   a. Run WebSearch with the defined `query`
   b. From each result extract `{title, url, company}`
      - **title:** from result title (before `" @ "` or `" | "`)
      - **url:** result URL
      - **company:** after `" @ "` in the title, or infer from domain/path
   c. Append to candidate list (dedupe with Levels 1+2)

6. **Title filter** using `title_filter` in `portals.yml`:
   - At least one `positive` keyword must appear in the title (case-insensitive)
   - Zero `negative` keywords may appear
   - `seniority_boost` keywords add priority but are not required

7. **Dedupe** against three sources:
   - `scan-history.tsv` → exact URL already seen
   - `applications.md` → normalized company + role already evaluated
   - `pipeline.md` → exact URL already pending or processed

7.5. **Liveness check for WebSearch results (Level 3)** — before adding to pipeline:

   WebSearch hits can be weeks old. For **each new URL that came only from Level 3**, verify with Playwright. Levels 1 and 2 are live and skip this.

   Para cada URL nueva de Nivel 3 (secuencial — NUNCA Playwright en paralelo):
   a. `browser_navigate` a la URL
   b. `browser_snapshot` para leer el contenido
   c. Clasificar:
      - **Activa**: título del puesto visible + descripción del rol + control visible de Apply/Submit/Solicitar dentro del contenido principal. No contar texto genérico de header/navbar/footer.
      - **Expirada** (cualquiera de estas señales):
        - URL final contiene `?error=true` (Greenhouse redirige así cuando la oferta está cerrada)
        - Página contiene: "job no longer available" / "no longer open" / "position has been filled" / "this job has expired" / "page not found"
        - Solo navbar y footer visibles, sin contenido JD (contenido < ~300 chars)
   d. Si expirada: registrar en `scan-history.tsv` con status `skipped_expired` y descartar
   e. Si activa: continuar al paso 8

   **Do not abort the whole scan on one failure.** On navigate errors (timeout, 403), mark `skipped_expired` and continue.

8. **For each new verified listing that passes filters:**
   a. Append to `pipeline.md` under **Pending**: `- [ ] {url} | {company} | {title}`
   b. Log in `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Title-filtered out:** log in `scan-history.tsv` with status `skipped_title`
10. **Duplicates:** log with status `skipped_dup`
11. **Expired (Level 3):** log with status `skipped_expired`

## Parsing title and company from WebSearch

Results often look like `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title — Company"`.

Examples:
- **Ashby:** `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`
- **Greenhouse:** `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`
- **Lever:** `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`

Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Private URLs

If a URL is not publicly accessible:
1. Save the JD to `jds/{company}-{role-slug}.md`
2. Add to pipeline as: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan history

`data/scan-history.tsv` tracks **every** URL touched:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
https://...	2026-02-10	WebSearch — AI PM	PM AI	ClosedCo	skipped_expired
```

## Output summary

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries run: N
Listings found: N total
Passed title filter: N relevant
Duplicates: N (already evaluated or in pipeline)
Expired dropped: N (dead links, Level 3)
New rows added to pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Run /career-ops pipeline to evaluate new listings.
```

## Maintaining `careers_url`

Each `tracked_companies` entry should have `careers_url` — the direct jobs page. Avoid rediscovering it every scan.

**Known patterns:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` or `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **BambooHR:** lista `https://{company}.bamboohr.com/careers/list`; detalle `https://{company}.bamboohr.com/careers/{id}/detail`
- **Teamtailor:** `https://{company}.teamtailor.com/jobs`
- **Workday:** `https://{company}.{shard}.myworkdayjobs.com/{site}`
- **Custom:** La URL propia de la empresa (ej: `https://openai.com/careers`)

**Patrones de API/feed por plataforma:**
- **Ashby API:** `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR API:** lista `https://{company}.bamboohr.com/careers/list`; detalle `https://{company}.bamboohr.com/careers/{id}/detail` (`result.jobOpening`)
- **Lever API:** `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor RSS:** `https://{company}.teamtailor.com/jobs.rss`
- **Workday API:** `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Si `careers_url` no existe** para una empresa:
1. Intentar el patrón de su plataforma conocida
2. Si falla, hacer un WebSearch rápido: `"{company}" careers jobs`
3. Navegar con Playwright para confirmar que funciona
4. **Guardar la URL encontrada en portals.yml** para futuros scans

**If `careers_url` 404s or redirects:**
1. Note in scan summary
2. Try `scan_query` fallback
3. Flag for manual fix

## Maintaining `portals.yml`

- **Always persist `careers_url`** when adding a company
- Add queries as you discover new boards or role types
- Disable noisy queries with `enabled: false`
- Adjust title keywords as targets change
- Add companies to `tracked_companies` when you want close tracking
- Re-verify `careers_url` periodically — companies change ATS
