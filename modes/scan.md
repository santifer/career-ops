# Mode: scan — Portal Scanner (Offer Discovery)

Scan configured job portals, filter by title relevance, and add new offers to the pipeline for later evaluation.

## Recommended Execution

Run as a subagent so it does not consume the main context:

```
Agent(
    subagent_type="general-purpose",
    prompt="[contents of this file + specific data]",
    run_in_background=True
)
```

## Configuration

Read `portals.yml`, which contains:
- `search_queries`: a list of WebSearch queries with portal-specific `site:` filters (broad discovery)
- `tracked_companies`: specific companies with `careers_url` for direct browsing
- `title_filter`: `positive` / `negative` / `seniority_boost` keywords for title filtering

## Discovery Strategy (3 Levels)

### Level 1 — Direct Playwright (PRIMARY)

**For each company in `tracked_companies`:** navigate to its `careers_url` with Playwright (`browser_navigate` + `browser_snapshot`), read ALL visible job listings, and extract the title + URL for each one. This is the most reliable method because:
- It sees the page in real time (not Google's cached results)
- It works with SPAs (Ashby, Lever, Workday)
- It detects new offers immediately
- It does not depend on Google indexing

**Every company MUST have `careers_url` in `portals.yml`.** If it does not, find it once, save it, and use it in future scans.

### Level 2 — ATS APIs / Feeds (SUPPLEMENTARY)

For companies with a public API or structured feed, use the JSON/XML response as a fast complement to Level 1. It is faster than Playwright and reduces visual scraping errors.

**Current support (variables inside `{}`):**
- **Greenhouse**: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- **Ashby**: `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR**: list `https://{company}.bamboohr.com/careers/list`; offer detail `https://{company}.bamboohr.com/careers/{id}/detail`
- **Lever**: `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor**: `https://{company}.teamtailor.com/jobs.rss`
- **Workday**: `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Provider parsing convention:**
- `greenhouse`: `jobs[]` → `title`, `absolute_url`
- `ashby`: GraphQL `ApiJobBoardWithTeams` with `organizationHostedJobsPageName={company}` → `jobBoard.jobPostings[]` (`title`, `id`; build the public URL if it is not in the payload)
- `bamboohr`: list `result[]` → `jobOpeningName`, `id`; build detail URL `https://{company}.bamboohr.com/careers/{id}/detail`; to read the full JD, GET the detail endpoint and use `result.jobOpening` (`jobOpeningName`, `description`, `datePosted`, `minimumExperience`, `compensation`, `jobOpeningShareUrl`)
- `lever`: root array `[]` → `text`, `hostedUrl` (fallback: `applyUrl`)
- `teamtailor`: RSS items → `title`, `link`
- `workday`: `jobPostings[]` / `jobPostings` (depending on tenant) → `title`, `externalPath` or a URL built from the host

### Level 3 — WebSearch Queries (BROAD DISCOVERY)

The `search_queries` with `site:` filters cover portals across providers (all Ashby boards, all Greenhouse boards, etc.). This is useful for discovering NEW companies not yet in `tracked_companies`, but results may be stale.

**Execution priority:**
1. Level 1: Playwright → all `tracked_companies` with `careers_url`
2. Level 2: API → all `tracked_companies` with `api:`
3. Level 3: WebSearch → all `search_queries` with `enabled: true`
4. Level 4: Indeed MCP → all `indeed_queries` with `enabled: true`
5. Level 5: LinkedIn MCP → all `linkedin_queries` with `enabled: true`

The levels are additive — run all of them, merge the results, and deduplicate.

### Level 4 — Indeed MCP (DIRECT API)

**For each query in `indeed_queries` with `enabled: true`:** call `mcp__claude_ai_Indeed__search_jobs` with the `search`, `location`, `country_code`, and (if set) `job_type` fields from the query config. This hits Indeed's live API directly — results are real-time, not Google-cached.

**Why use the Indeed MCP instead of WebSearch with `site:indeed.com`:**
- WebSearch with `site:indeed.com` returns Google-cached results that can be weeks old
- The Indeed MCP calls Indeed's own API and returns current, active listings only
- No Playwright scraping needed — structured data comes back directly

**Parsing the response:**
- Each result includes a job title, company name, location, and an apply URL
- Treat each result as `{title, url, company}` and pass through the standard title filter and dedup pipeline
- Level 4 results are inherently real-time — **no liveness verification needed** (skip step 7.5 for these)

**Note:** Indeed MCP results do NOT need the Playwright liveness check (step 7.5) that Level 3 WebSearch results require — the MCP only returns active listings.

### Level 5 — LinkedIn MCP (DIRECT API)

**For each query in `linkedin_queries` with `enabled: true`:** call `mcp__linkedin__search_jobs` with the fields from the query config. This hits LinkedIn's live job search directly — results reflect LinkedIn's current active listings.

**Why use the LinkedIn MCP instead of WebSearch with `site:linkedin.com`:**
- WebSearch with `site:linkedin.com` returns Google-cached results that can be weeks old
- The LinkedIn MCP calls LinkedIn's own API and returns current, active listings only
- No Playwright scraping needed — structured job IDs come back directly

**Tool signature:** `mcp__linkedin__search_jobs(keywords, location, work_type, job_type, experience_level, date_posted, sort_by, max_pages)`

**Parsing the response:**
- Each result returns `job_ids` — pass them to `mcp__linkedin__get_job_details` for full title, company, and apply URL
- Treat each result as `{title, url, company}` and pass through the standard title filter and dedup pipeline
- Level 5 results are real-time — **no liveness verification needed** (skip step 7.5 for these)

## Workflow

1. **Read configuration**: `portals.yml`
2. **Read history**: `data/scan-history.tsv` → URLs already seen
3. **Read dedup sources**: `data/applications.md` + `data/pipeline.md`

4. **Level 1 — Playwright scan** (parallel in batches of 3-5):
   For each company in `tracked_companies` with `enabled: true` and a defined `careers_url`:
   a. `browser_navigate` to the `careers_url`
   b. `browser_snapshot` to read all job listings
   c. If the page has filters/departments, browse the relevant sections
   d. For each job listing extract: `{title, url, company}`
   e. If the page paginates results, browse additional pages
   f. Accumulate into a candidate list
   g. If `careers_url` fails (404, redirect), try `scan_query` as a fallback and note it for URL updates

5. **Level 2 — ATS APIs / feeds** (parallel):
   For each company in `tracked_companies` with `api:` defined and `enabled: true`:
   a. WebFetch the API/feed URL
   b. If `api_provider` is defined, use its parser; otherwise infer it by domain (`boards-api.greenhouse.io`, `jobs.ashbyhq.com`, `api.lever.co`, `*.bamboohr.com`, `*.teamtailor.com`, `*.myworkdayjobs.com`)
   c. For **Ashby**, send POST with:
      - `operationName: ApiJobBoardWithTeams`
      - `variables.organizationHostedJobsPageName: {company}`
      - GraphQL query for `jobBoardWithTeams` + `jobPostings { id title locationName employmentType compensationTierSummary }`
   d. For **BambooHR**, the list only contains basic metadata. For each relevant item, read `id`, GET `https://{company}.bamboohr.com/careers/{id}/detail`, and extract the full JD from `result.jobOpening`. Use `jobOpeningShareUrl` as the public URL if present; otherwise use the detail URL.
   e. For **Workday**, send POST JSON with at least `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}` and paginate by `offset` until results are exhausted
   f. For each job, extract and normalize: `{title, url, company}`
   g. Accumulate into the candidate list (dedup with Level 1)

6. **Level 3 — WebSearch queries** (parallel if possible):
   For each query in `search_queries` with `enabled: true`:
   a. Run WebSearch with the defined `query`
   b. Extract from each result: `{title, url, company}`
      - **title**: from the result title (before " @ " or " | ")
      - **url**: result URL
      - **company**: after " @ " in the title, or extract from the domain/path
   c. Accumulate into the candidate list (dedup with Levels 1+2)

6b. **Level 4 — Indeed MCP** (parallel if possible):
   For each query in `indeed_queries` with `enabled: true`:
   a. Call `mcp__claude_ai_Indeed__search_jobs` with:
      - `search`: the query's `search` field
      - `location`: the query's `location` field
      - `country_code`: the query's `country_code` field
      - `job_type`: the query's `job_type` field (if set)
   b. For each result extract: `{title, url, company}`
   c. Accumulate into the candidate list (dedup with Levels 1+2+3)
   d. **Do NOT run liveness verification (step 7.5) on these** — Indeed MCP returns active listings only

6c. **Level 5 — LinkedIn MCP** (parallel if possible):
   For each query in `linkedin_queries` with `enabled: true`:
   a. Call `mcp__linkedin__search_jobs` with:
      - `keywords`: the query's `keywords` field
      - `location`: the query's `location` field (if set)
      - `work_type`: the query's `work_type` field (if set, e.g. `remote`, `hybrid`, `on_site`)
      - `job_type`: the query's `job_type` field (if set, e.g. `full_time`, `contract`)
      - `experience_level`: the query's `experience_level` field (if set)
      - `date_posted`: the query's `date_posted` field (if set, e.g. `past_week`, `past_month`)
      - `sort_by`: the query's `sort_by` field (if set, e.g. `date`, `relevance`)
      - `max_pages`: the query's `max_pages` field (default: 3)
   b. For each returned `job_id`, call `mcp__linkedin__get_job_details` to retrieve full title, company, and apply URL
   c. For each result extract: `{title, url, company}`
   d. Accumulate into the candidate list (dedup with Levels 1+2+3+4)
   e. **Do NOT run liveness verification (step 7.5) on these** — LinkedIn MCP returns active listings only

6. **Filter by title** using `title_filter` from `portals.yml`:
   - At least 1 keyword from `positive` must appear in the title (case-insensitive)
   - 0 keywords from `negative` must appear
   - `seniority_boost` keywords get priority but are not mandatory

7. **Deduplicate** against 3 sources:
   - `scan-history.tsv` → exact URL already seen
   - `applications.md` → company + normalized role already evaluated
   - `pipeline.md` → exact URL already pending or processed

7.5. **Verify liveness of WebSearch results (Level 3)** — BEFORE adding them to the pipeline:

   WebSearch results can be stale (Google caches results for weeks or months). To avoid evaluating expired offers, verify with Playwright every new URL coming from Level 3. Levels 1 and 2 are inherently real-time and do not require this verification.

   For each new Level 3 URL (sequential — NEVER run Playwright in parallel):
   a. `browser_navigate` to the URL
   b. `browser_snapshot` to read the content
   c. Classify:
      - **Active**: visible job title + role description + visible Apply/Submit control within the main content. Do not count generic header/navbar/footer text.
      - **Expired** (any of these signals):
        - Final URL contains `?error=true` (Greenhouse redirects this way when a role is closed)
        - Page contains: "job no longer available" / "no longer open" / "position has been filled" / "this job has expired" / "page not found"
        - Only navbar and footer are visible, with no JD content (content < ~300 chars)
   d. If expired: register it in `scan-history.tsv` with status `skipped_expired` and discard it
   e. If active: continue to step 8

   **Do not stop the whole scan if a URL fails.** If `browser_navigate` errors (timeout, 403, etc.), mark it as `skipped_expired` and continue with the next one.

8. **For each new verified offer that passes filters**:
   a. Add it to the "Pending" section in `pipeline.md`: `- [ ] {url} | {company} | {title}`
   b. Register it in `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Offers filtered out by title**: register in `scan-history.tsv` with status `skipped_title`
10. **Duplicate offers**: register with status `skipped_dup`
11. **Expired offers (Level 3)**: register with status `skipped_expired`

## Extracting Title and Company from WebSearch Results

WebSearch results usually come in the format: `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title — Company"`.

Portal extraction patterns:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`

Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Private URLs

If a URL is found that is not publicly accessible:
1. Save the JD to `jds/{company}-{role-slug}.md`
2. Add it to `pipeline.md` as: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan History

`data/scan-history.tsv` tracks ALL URLs seen:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
https://...	2026-02-10	WebSearch — AI PM	PM AI	ClosedCo	skipped_expired
```

## Output Summary

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries executed: N (L1: N companies, L2: N APIs, L3: N WebSearch, L4: N Indeed MCP, L5: N LinkedIn MCP)
Offers found: N total
Filtered by title: N relevant
Duplicates: N (already evaluated or already in the pipeline)
Expired discarded: N (dead links, Level 3 only)
New offers added to pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Run /career-ops pipeline to evaluate the new offers.
```

## `careers_url` Management

Each company in `tracked_companies` must have `careers_url` — the direct URL to its jobs page. This avoids searching for it every time.

**Known platform patterns:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` or `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **BambooHR:** list `https://{company}.bamboohr.com/careers/list`; detail `https://{company}.bamboohr.com/careers/{id}/detail`
- **Teamtailor:** `https://{company}.teamtailor.com/jobs`
- **Workday:** `https://{company}.{shard}.myworkdayjobs.com/{site}`
- **Custom:** the company's own URL (for example `https://openai.com/careers`)

**API/feed patterns by platform:**
- **Ashby API:** `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR API:** list `https://{company}.bamboohr.com/careers/list`; detail `https://{company}.bamboohr.com/careers/{id}/detail` (`result.jobOpening`)
- **Lever API:** `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor RSS:** `https://{company}.teamtailor.com/jobs.rss`
- **Workday API:** `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**If `careers_url` does not exist** for a company:
1. Try the known platform pattern
2. If it fails, run a quick WebSearch: `"{company}" careers jobs`
3. Use Playwright to confirm it works
4. **Save the found URL in `portals.yml`** for future scans

**If `careers_url` returns 404 or redirects:**
1. Note it in the output summary
2. Try `scan_query` as a fallback
3. Mark it for manual update

## `portals.yml` Maintenance

- **ALWAYS save `careers_url`** when a new company is added
- Add new queries as new portals or interesting roles are discovered
- Disable noisy queries with `enabled: false`
- Adjust filtering keywords as target roles evolve
- Add companies to `tracked_companies` when they are worth following closely
- Verify `careers_url` periodically — companies change ATS platforms
