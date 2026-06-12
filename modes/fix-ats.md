# Mode: fix-ats — ATS Board URL Repair

Finds correct ATS board URLs for companies in `portals.yml` whose current `careers_url` or `api:` returns 404, then updates the file.

## When to use

Run after a scan reports 404 errors, or any time you suspect `portals.yml` has stale ATS slugs.

## Inputs

- `portals.yml` — source of truth for company ATS config
- Optional: a user-supplied list of specific companies to fix (e.g. "fix Rippling, Notion, Canva")

## Step 1 — Build the work list

If the user supplied company names, use those. Otherwise, run the scanner to collect errors:

```bash
node scan.mjs 2>&1
```

Parse stdout for lines matching `✗ {Company}: HTTP 404`. Extract the company names. These are the candidates.

## Step 2 — For each broken company

Work through the list sequentially. For each company:

### 2a — Identify current ATS platform

Look at the existing `careers_url` and `api:` in `portals.yml`:

| URL pattern | Platform |
|-------------|----------|
| `job-boards.greenhouse.io/{slug}` or `boards-api.greenhouse.io/v1/boards/{slug}` | Greenhouse |
| `jobs.ashbyhq.com/{slug}` | Ashby |
| `jobs.lever.co/{slug}` or `api.lever.co/v0/postings/{slug}` | Lever |
| `*.bamboohr.com/careers` | BambooHR |
| `*.myworkdayjobs.com` | Workday |

### 2b — Try known slug variants first (zero-cost)

Before searching, try common slug patterns for the same platform:

**Greenhouse slug variants** (try in order):
1. `{slug}` (current)
2. `{company-name-lowercase-hyphenated}` — e.g. `hinge-health`
3. `{companyname}` — no hyphens, e.g. `hingehealth`
4. `{company}inc`, `{company}hq`, `{company}jobs`

Use WebFetch on `https://boards-api.greenhouse.io/v1/boards/{variant}/jobs` — if it returns JSON with a `jobs` array (even empty), the slug is valid.

**Ashby slug variants** (try in order):
Use the Ashby GraphQL endpoint:
```
POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams
Body: {"operationName":"ApiJobBoardWithTeams","variables":{"organizationHostedJobsPageName":"{slug}"},"query":"{ jobBoard { jobPostings { id title } } }"}
```
Try: current slug → lowercase → hyphenated → no hyphens.

**Lever slug variants** (try in order):
`https://api.lever.co/v0/postings/{variant}?mode=json` — 200 + JSON array = valid.

### 2c — Search if variants fail

If all slug variants 404, use WebSearch to find the current careers page:

```
"{company name}" careers jobs site:job-boards.greenhouse.io OR site:jobs.ashbyhq.com OR site:jobs.lever.co OR site:jobs.lever.co OR site:apply.workable.com OR site:boards.eu.greenhouse.io
```

Also try: `"{company name}" site:linkedin.com/company careers` to spot an "ATS" link, or `"{company name}" careers jobs` to find the branded careers page.

### 2d — Detect new platform

If the company moved ATS, identify the new one from search results. Extract the new slug from the URL pattern.

Verify by fetching the API endpoint directly:
- Greenhouse: `https://boards-api.greenhouse.io/v1/boards/{new-slug}/jobs` → must return JSON
- Ashby: GraphQL POST as above → must return `jobBoard`
- Lever: `https://api.lever.co/v0/postings/{new-slug}?mode=json` → must return array

### 2e — Check if company still exists

If search returns no careers page at all:
- Search `"{company name}" acquired OR shutdown OR closed 2024 OR 2025 OR 2026`
- If acquired: note the acquirer and check if roles moved to parent company's board
- If shutdown: mark for removal

## Step 3 — Classify each company

| Result | Action |
|--------|--------|
| Found new slug (same platform) | Update slug in `portals.yml` |
| Found new platform | Update `careers_url`, `api:`, `scan_method` in `portals.yml` |
| No open jobs but board exists | Update URL, add note `"No open roles as of {date}"` |
| Company acquired | Update entry to point to acquirer's board, update `notes:` |
| Company shut down | Set `enabled: false`, update `notes:` with shutdown context |
| Cannot determine | Leave unchanged, note as `# TODO: manual verification needed` |

## Step 4 — Update portals.yml

For each fix, edit the relevant entry in `portals.yml`. Rules:

- **Only change `careers_url`, `api:`, `scan_method`, `notes:`, `enabled:`** — never touch `title_filter`, `location_filter`, or `search_queries` unless explicitly asked
- Preserve all other fields on the entry
- When updating `careers_url` to a branded page, also update `api:` if the new ATS supports it
- Add a comment `# Updated {YYYY-MM-DD}: {reason}` on the line above the entry when the change is non-trivial

## Step 5 — Report

Print a summary table:

```
ATS Board Repair — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Companies checked: N
Fixed (new URL found): N
  ✓ {Company} → {new slug/platform}
  ...
No open roles (board exists): N
  ○ {Company} — board valid, 0 jobs
  ...
Disabled (shutdown/acquired): N
  ✗ {Company} — {reason}
  ...
Could not resolve: N
  ? {Company} — manual check needed
  ...
```

End with:
> "`portals.yml` updated. Run `/career-ops scan` to verify the fixed boards return results."
