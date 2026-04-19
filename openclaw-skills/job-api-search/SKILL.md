---
name: job-api-search
description: Multi-level job scanner combining browser scanning, ATS APIs, web search, and job board APIs. Use when searching for jobs, scanning company career pages, discovering new openings, or running automated job discovery. Supports 3-level scanning with title filtering, dedup, liveness checks, and scan history tracking.
---

# Job API Search — 3-Level Scanner

Scan for jobs across three discovery levels: direct browser, ATS APIs, and web search.

## When to Use

- Daily/weekly automated job scan
- Scanning specific company career pages
- Discovering new openings across job boards
- Any job search task

## Discovery Levels

### Level 1 — Direct Browser Scan (PRIMARY)

For each company in `tracked_companies` with a `careers_url`:

1. `browser` tool → navigate to `careers_url`
2. `snapshot` to read all visible job listings
3. Navigate paginated results and filter sections if present
4. Extract `{title, url, company}` per listing

**Most reliable** — sees live pages, works with SPAs, catches new postings instantly.

**If `careers_url` fails (404, redirect):**
1. Try `scan_query` as fallback
2. Annotate for URL update

### Level 2 — ATS APIs / Feeds (COMPLEMENTARY)

Structured API access per ATS provider. Faster than browser, supplements Level 1.

| Provider | URL Pattern | Parse |
|----------|------------|-------|
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/{company}/jobs` | `jobs[]` → `title`, `absolute_url` |
| Ashby | POST `https://jobs.ashbyhq.com/api/non-user-graphql` with `operationName: ApiJobBoardWithTeams` | `jobBoard.jobPostings[]` → `title`, `id` |
| Lever | `https://api.lever.co/v0/postings/{company}?mode=json` | `[]` → `text`, `hostedUrl` |
| Workday | POST `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs` with `{"appliedFacets":{},"limit":20,"offset":0}` | `jobPostings[]` → `title`, `externalPath` |
| BambooHR | GET `https://{company}.bamboohr.com/careers/list` then `https://{company}.bamboohr.com/careers/{id}/detail` | `result[]` → `jobOpeningName`, `id`; detail → full JD |
| Teamtailor | `https://{company}.teamtailor.com/jobs.rss` | RSS items → `title`, `link` |

Use `web_fetch` for GET endpoints. For POST (Ashby, Workday), use `exec` with `curl`.

### Level 3 — Web Search (BROAD DISCOVERY)

Uses `web_search` with `site:` filters for broad discovery across job boards and career pages.

Good for finding new companies not yet in `tracked_companies`. Results may be stale — requires liveness check (see below).

### Execution Priority

1. Level 1: Browser → all tracked companies
2. Level 2: ATS API → all companies with `api:` defined
3. Level 3: Web search → all enabled queries

Levels are additive — results merge and dedup.

## Title Filtering

Use `title_filter` from configuration:

- **positive**: At least 1 keyword must appear (case-insensitive)
- **negative**: 0 keywords may appear
- **seniority_boost**: Priority keywords (not required)

## Deduplication

Check against three sources before adding:
1. `scan-history.tsv` — URL exact match already seen
2. Applications tracker — company + normalized role
3. Pipeline / pending list — URL exact match

## Liveness Check (Level 3 results only)

Web search results can be cached for weeks. Verify each new Level 3 URL:

1. `browser` navigate to URL
2. `snapshot` to read content
3. **Active**: job title visible + role description + Apply/Submit button in main content
4. **Expired** (any signal):
   - URL contains `?error=true`
   - Page says "no longer available" / "position has been filled" / "expired"
   - Only navbar/footer visible, no JD content (< ~300 chars)
5. If expired: log as `skipped_expired`, discard
6. If browser fails (timeout, 403): log as `skipped_expired`, continue

**Never run browser in parallel.** Sequential only.

## Scan History

`data/scan-history.tsv` tracks all URLs seen:

```
url	first_seen	source	title	company	status
```

Status values: `added`, `skipped_title`, `skipped_dup`, `skipped_expired`

## Output Summary

```
Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━
Queries run: N
Found: N total
Title filtered: N relevant
Duplicates: N
Expired (Level 3): N
New added to pipeline: N

  + {company} | {title} | {source}
  ...
```
