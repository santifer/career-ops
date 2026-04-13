# Mode: scan — Portal Scanner

Scans configured portals, filters by title relevance, adds new offers to pipeline for evaluation.

## Browser Engine

**agent-browser** CLI. NOT Patchright.

Core commands:
```
agent-browser open <url> --timeout N --json
agent-browser snapshot -i --json      # interactive elements
agent-browser eval "<js>" --json
agent-browser close --json
```

For auth-gated portals: `--session-name <portal>` to load saved session.

## Configuration

Read `portals.yml`:
- `search_queries`: WebSearch queries with `site:` filters
- `tracked_companies`: Companies with `careers_url` for direct navigation
- `title_filter`: positive/negative keywords for title filtering

## Discovery (3 Levels)

### Level 1 — agent-browser (PRIMARY)

Navigate to `careers_url` for each company in `tracked_companies`. Extract all job listings with title + URL. Real-time, works with SPAs.

### Level 2 — ATS APIs / Feeds

- **Greenhouse**: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- **Ashby**: POST `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR**: list `https://{company}.bamboohr.com/careers/list`
- **Lever**: `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor**: `https://{company}.teamtailor.com/jobs.rss`
- **Workday**: `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

Parse by domain. Extract `{title, url, company}` per job.

### Level 3 — WebSearch (BROAD DISCOVERY)

Run each `search_queries` with `enabled: true`. Extract from results.

## Workflow

1. Read: `portals.yml`, `data/scan-history.tsv`, `data/applications.md`, `data/pipeline.md`

2. **Level 1**: agent-browser per company with `careers_url`
   - `agent-browser open <url> --timeout 20000 --json`
   - `agent-browser snapshot -i --json` to extract job listings

3. **Level 2**: WebFetch each API/feed URL, parse by provider

4. **Level 3**: WebSearch queries, extract from results

5. **Filter** by `title_filter`: at least 1 `positive` keyword, 0 `negative`

6. **Deduplicate** against: `scan-history.tsv`, `applications.md`, `pipeline.md`

7. **Verify liveness** of Level 3 URLs (Level 1+2 are real-time):
   - agent-browser open + snapshot
   - **Active**: title + description + apply control visible
   - **Expired**: `?error=true`, "no longer available", <300 chars content
   - Expired → log `skipped_expired` to `scan-history.tsv`

8. **Add new verified offers** to `data/pipeline.md`:
   `- [ ] {url} | {company} | {title}`

9. Log to `data/scan-history.tsv`: added, skipped_title, skipped_dup, skipped_expired

## Output

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries: N | Found: N | Relevant: N | New: N

  + {company} | {title} | {source}
```
