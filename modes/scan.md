# Mode: scan — Portal Scanner (Offer Discovery)

Scan configured job portals, filter by title relevance, and add new offers to the pipeline for later evaluation.

## Recommended execution

Run it as a subagent so the main agent does not burn context:

```
Agent(
    subagent_type="general-purpose",
    prompt="[content of this file + specific data]",
    run_in_background=True
)
```

## Configuration

Read `portals.yml`, which contains:
- `search_queries`: WebSearch queries with portal-specific `site:` filters (broad discovery)
- `tracked_companies`: specific companies with `careers_url` for direct navigation
- `title_filter`: positive/negative/seniority_boost title filtering keywords

## Discovery strategy (3 levels)

### Level 1 — Direct Playwright (PRIMARY)

**For each company in `tracked_companies`:** navigate to its `careers_url` with Playwright (`browser_navigate` + `browser_snapshot`), read ALL visible job listings, and extract the title + URL for each one. This is the most reliable method because:
- It sees the page in real time (not cached search results)
- It works with SPAs (Ashby, Lever, Workday)
- It detects new openings immediately
- It does not depend on Google indexing

**Every company MUST have `careers_url` in `portals.yml`.** If it does not, find it once, save it, and use it in future scans.

### Level 2 — Greenhouse API (SUPPLEMENTARY)

For Greenhouse companies, the JSON API (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`) returns clean structured data. Use it as a fast supplement to Level 1. It is faster than Playwright but only works for Greenhouse.

### Level 3 — WebSearch queries (BROAD DISCOVERY)

The `search_queries` with `site:` filters cover portals horizontally (all Ashby boards, all Greenhouse boards, etc.). Useful for discovering NEW companies not yet in `tracked_companies`, but the results can be stale.

**Execution priority:**
1. Level 1: Playwright -> all `tracked_companies` with `careers_url`
2. Level 2: API -> all `tracked_companies` with `api:`
3. Level 3: WebSearch -> all `search_queries` with `enabled: true`

The levels are additive. Run all of them, merge the results, and deduplicate.

## Workflow

1. **Read configuration**: `portals.yml`
2. **Read history**: `data/scan-history.tsv` -> URLs already seen
3. **Read dedup sources**: `data/applications.md` + `data/pipeline.md`

4. **Level 1 — Playwright scan** (parallel in batches of 3-5):
   For each company in `tracked_companies` with `enabled: true` and a defined `careers_url`:
   a. `browser_navigate` to the `careers_url`
   b. `browser_snapshot` to read all visible job listings
   c. If the page has filters/departments, navigate the relevant sections
   d. For each listing, extract: `{title, url, company}`
   e. If the page is paginated, navigate additional pages
   f. Accumulate them into the candidate list
   g. If `careers_url` fails (404, redirect), try `scan_query` as a fallback and note that the URL should be updated

5. **Level 2 — Greenhouse APIs** (parallel):
   For each company in `tracked_companies` with `api:` defined and `enabled: true`:
   a. WebFetch the API URL -> JSON job list
   b. For each job, extract: `{title, url, company}`
   c. Accumulate into the candidate list (dedup with Level 1)

6. **Level 3 — WebSearch queries** (parallel if possible):
   For each query in `search_queries` with `enabled: true`:
   a. Run WebSearch with the configured `query`
   b. For each result, extract: `{title, url, company}`
      - **title**: from the result title (before `" @ "` or `" | "`)
      - **url**: the result URL
      - **company**: after `" @ "` in the title, or inferred from the domain/path
   c. Accumulate into the candidate list (dedup with Levels 1+2)

6. **Filter by title** using `title_filter` from `portals.yml`:
   - At least 1 keyword from `positive` must appear in the title (case-insensitive)
   - 0 keywords from `negative` may appear
   - `seniority_boost` keywords increase priority but are not required

7. **Deduplicate** against 3 sources:
   - `scan-history.tsv` -> exact URL already seen
   - `applications.md` -> normalized company + role already evaluated
   - `pipeline.md` -> exact URL already pending or processed

7.5. **Verify liveness for WebSearch results (Level 3)** — BEFORE adding to the pipeline:

   WebSearch results can be stale (Google caches them for weeks or months). To avoid evaluating expired offers, verify every new Level 3 URL with Playwright. Levels 1 and 2 are already real-time and do not need this verification.

   For each new Level 3 URL (sequentially — NEVER run Playwright in parallel):
   a. `browser_navigate` to the URL
   b. `browser_snapshot` to read the content
   c. Classify it:
      - **Active**: role title visible + role description + Apply/Submit button
      - **Expired** (any of these signals):
        - Final URL contains `?error=true` (Greenhouse redirects like this when the posting is closed)
        - Page contains: `"job no longer available"` / `"no longer open"` / `"position has been filled"` / `"this job has expired"` / `"page not found"`
        - Only navbar and footer are visible, with no JD content (content < ~300 chars)
   d. If expired: record it in `scan-history.tsv` with status `skipped_expired` and discard it
   e. If active: continue to step 8

   **Do not interrupt the whole scan if one URL fails.** If `browser_navigate` errors (timeout, 403, etc.), mark it as `skipped_expired` and continue.

8. **For each new verified offer that passes filters**:
   a. Add it to the `pipeline.md` "Pending" section: `- [ ] {url} | {company} | {title}`
   b. Record it in `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Title-filtered offers**: record them in `scan-history.tsv` with status `skipped_title`
10. **Duplicate offers**: record them with status `skipped_dup`
11. **Expired offers (Level 3)**: record them with status `skipped_expired`

## Title and company extraction from WebSearch results

WebSearch results usually come in formats like: `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title — Company"`.

Portal-specific extraction patterns:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` -> title: `Senior AI PM`, company: `EverAI`
- **Greenhouse**: `"AI Engineer at Anthropic"` -> title: `AI Engineer`, company: `Anthropic`
- **Lever**: `"Product Manager - AI @ Temporal"` -> title: `Product Manager - AI`, company: `Temporal`

Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Private URLs

If a URL is not publicly accessible:
1. Save the JD to `jds/{company}-{role-slug}.md`
2. Add it to `pipeline.md` as: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan history

`data/scan-history.tsv` tracks ALL URLs seen:

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
Offers found: N total
Filtered by title: N relevant
Duplicates: N (already evaluated or already in pipeline)
Expired discarded: N (dead links, Level 3)
New offers added to pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Run /career-ops pipeline to evaluate the new offers.
```

## `careers_url` management

Each company in `tracked_companies` should have a `careers_url` — the direct URL to its jobs page. This avoids rediscovering it on every scan.

**Known platform patterns:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` or `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **Custom:** the company’s own jobs page (for example `https://openai.com/careers`)

**If `careers_url` does not exist** for a company:
1. Try the known platform pattern
2. If it fails, run a quick WebSearch: `"{company}" careers jobs`
3. Use Playwright to confirm it works
4. **Save the discovered URL in `portals.yml`** for future scans

**If `careers_url` returns 404 or redirects:**
1. Note it in the output summary
2. Try `scan_query` as a fallback
3. Flag it for manual update

## `portals.yml` maintenance

- **ALWAYS save `careers_url`** when adding a new company
- Add new queries as you discover interesting portals or role patterns
- Disable noisy queries with `enabled: false`
- Adjust filtering keywords as the target roles evolve
- Add companies to `tracked_companies` when they matter enough to track closely
- Recheck `careers_url` periodically — companies do change ATS platforms
