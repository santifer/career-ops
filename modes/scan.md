# Mode: scan — Portal Scanner (Job Discovery)

Scans configured job portals, filters by title relevance, and adds new postings to the pipeline for later evaluation.

## Recommended execution

Run as a subagent to avoid consuming main context:

```
Agent(
    subagent_type="general-purpose",
    prompt="[content of this file + specific data]",
    run_in_background=True
)
```

## Configuration

Read `portals.yml` which contains:
- `search_queries`: List of WebSearch queries with `site:` filters by portal (broad discovery)
- `tracked_companies`: Specific companies with `careers_url` for direct navigation
- `title_filter`: Positive/negative/seniority_boost keywords for title filtering

## Discovery strategy (3 levels)

### Level 1 — Direct Playwright (PRIMARY)

**For each company in `tracked_companies`:** Navigate to its `careers_url` with Playwright (`browser_navigate` + `browser_snapshot`), read ALL visible job listings, and extract title + URL for each. This is the most reliable method because:
- Reads the page in real time (no cached Google results)
- Works with SPAs (Ashby, Lever, Workday)
- Detects new postings instantly
- Does not depend on Google indexing

**Every company MUST have a `careers_url` in portals.yml.** If missing, find it once, save it, and use it in future scans.

### Level 2 — Greenhouse API (SUPPLEMENTARY)

For companies using Greenhouse, the JSON API (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`) returns clean structured data. Use as a fast complement to Level 1 — faster than Playwright but only works with Greenhouse.

### Level 3 — WebSearch queries (BROAD DISCOVERY)

`search_queries` with `site:` filters cover portals cross-sectionally (all Ashby boards, all Greenhouse boards, etc.). Useful for discovering NEW companies not yet in `tracked_companies`, but results may be stale.

**Execution priority:**
1. Level 1: Playwright → all `tracked_companies` with `careers_url`
2. Level 2: API → all `tracked_companies` with `api:`
3. Level 3: WebSearch → all `search_queries` with `enabled: true`

Levels are additive — run all, merge results, then deduplicate.

## Recency Rule — MANDATORY

**Only add postings from the last 7 days to pipeline.md.** This is non-negotiable.

- Calculate the cutoff date: today minus 7 days (e.g., if today is 2026-04-07, cutoff = 2026-03-31)
- **For WebSearch queries:** Append `after:{cutoff-date}` to every query before executing
- **For Playwright direct URLs:** Use the built-in date filter parameters in the `careers_url` (e.g., `fromage=7` for Indeed, `f_TPR=r604800` for LinkedIn)
- **For each posting found:** Look for a visible posting date on the page
  - Date visible + within 7 days → ✅ add to pipeline
  - Date visible + older than 7 days → ❌ skip, log as `skipped_stale` in scan-history.tsv
  - No date visible, but posting page is active with full JD → ✅ add to pipeline with note `[date unknown]`
  - No date visible and page seems inactive or generic → ❌ skip, log as `skipped_stale`

**Scan-history.tsv status values:**
- `added` — passed all filters and added to pipeline
- `skipped_title` — title filter didn't match
- `skipped_dup` — already in scan history, applications, or pipeline
- `skipped_stale` — posting date older than 7 days or unverifiable

## Workflow

1. **Read configuration**: `portals.yml`
2. **Calculate cutoff date**: today minus 7 days (ISO format: YYYY-MM-DD)
3. **Read history**: `data/scan-history.tsv` → URLs already seen
4. **Read dedup sources**: `data/applications.md` + `data/pipeline.md`

5. **Level 1 — Playwright scan** (parallel in batches of 3–5):
   For each company in `tracked_companies` with `enabled: true` and a defined `careers_url`:
   a. `browser_navigate` to the `careers_url`
   b. `browser_snapshot` to read all job listings
   c. If the page has filters/departments, navigate relevant sections
   d. For each job listing extract: `{title, url, company}`
   e. If the page paginates, navigate additional pages
   f. Accumulate in candidate list
   g. If `careers_url` fails (404, redirect), try `scan_query` as fallback and note for URL update

6. **Level 2 — Greenhouse APIs** (parallel):
   For each company in `tracked_companies` with `api:` defined and `enabled: true`:
   a. WebFetch the API URL → JSON with job list
   b. For each job extract: `{title, url, company}`
   c. Accumulate in candidate list (dedup with Level 1)

7. **Level 3 — WebSearch queries** (parallel where possible):
   For each query in `search_queries` with `enabled: true`:
   a. Run WebSearch with the defined `query`
   b. From each result extract: `{title, url, company}`
      - **title**: from the result title (before " @ " or " | ")
      - **url**: result URL
      - **company**: after " @ " in the title, or extract from domain/path
   c. Accumulate in candidate list (dedup with Level 1+2)

8. **Filter by title** using `title_filter` from `portals.yml`:
   - At least 1 keyword from `positive` must appear in the title (case-insensitive)
   - 0 keywords from `negative` must appear
   - `seniority_boost` keywords give priority but are not required

9. **Check recency** (7-day rule — see Recency Rule section above):
   - Check posting date on each result page
   - Skip if older than 7 days → log as `skipped_stale`
   - Proceed if within 7 days or date unknown with active JD

10. **Deduplicate** against 3 sources:
    - `scan-history.tsv` → exact URL already seen
    - `applications.md` → company + normalized role already evaluated
    - `pipeline.md` → exact URL already pending or processed

11. **For each new posting that passes all filters**:
    a. Add to `pipeline.md` under "Pending": `- [ ] {url} | {company} | {title}`
    b. Log in `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

12. **Title-filtered postings**: log in `scan-history.tsv` with status `skipped_title`
13. **Duplicate postings**: log with status `skipped_dup`
14. **Stale postings**: log with status `skipped_stale`

## Title and company extraction from WebSearch results

WebSearch results come in the format: `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title — Company"`.

Extraction patterns by portal:
- **Ashby**: `"Senior HR Generalist (Remote) @ Acme"` → title: `Senior HR Generalist`, company: `Acme`
- **Greenhouse**: `"People Operations Specialist at Pair Team"` → title: `People Operations Specialist`, company: `Pair Team`
- **Lever**: `"HR Manager - Remote @ Contec"` → title: `HR Manager - Remote`, company: `Contec`

Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Private URLs

If a URL is not publicly accessible:
1. Save the JD to `jds/{company}-{role-slug}.md`
2. Add to pipeline.md as: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan History

`data/scan-history.tsv` tracks ALL URLs seen:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Greenhouse — People Ops	People Ops Specialist	Acme	added
https://...	2026-02-10	Greenhouse — HR Gen	HR Coordinator	BigCo	skipped_title
https://...	2026-02-10	WebSearch — HR Generalist	HR Generalist	OldCo	skipped_dup
https://...	2026-02-10	LinkedIn — HR Ops	HR Ops Manager	ClosedCo	skipped_stale
```

## Output summary

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries run: N
Postings found: N total
Filtered by title: N relevant
Duplicates: N (already evaluated or in pipeline)
Stale discarded: N (older than 7 days)
New added to pipeline.md: N

  + {company} | {title} | {source}
  ...

→ Run /career-ops pipeline to evaluate new postings.
```

## careers_url management

Every company in `tracked_companies` should have a `careers_url` — the direct URL to its job listings page. This avoids searching for it every scan.

**Known patterns by platform:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` or `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **Custom:** The company's own URL (e.g., `https://company.com/careers`)

**If `careers_url` is missing** for a company:
1. Try the known pattern for its platform
2. If that fails, run a quick WebSearch: `"{company}" careers jobs`
3. Navigate with Playwright to confirm it works
4. **Save the found URL to portals.yml** for future scans

**If `careers_url` returns 404 or redirects:**
1. Note it in the output summary
2. Try `scan_query` as fallback
3. Flag for manual update

## portals.yml maintenance

- **Always save `careers_url`** when adding a new company
- Add new queries as new portals or interesting roles are discovered
- Disable noisy queries with `enabled: false`
- Adjust filter keywords as target roles evolve
- Add companies to `tracked_companies` when you want to track them closely
- Periodically verify `careers_url` — companies change ATS platforms
