# Mode: scan-auth — Authenticated portal scanner

Runs the authenticated portal scanner (Playwright with persistent browser profiles), then processes results into the pipeline.

Supported portals: `linkedin` (more coming soon).

## Prerequisites

The user must have logged in at least once for the target portal:
```bash
node scan-auth.mjs --login <portal>
```
If the scanner reports "Not logged in", tell the user to run the above command first.

## Workflow

### 1. Run the scanner

```bash
node scan-auth.mjs <portal>
```

Optional flags:
- `--search "keyword"` — scan a single keyword only
- `--max N` — cap results per search keyword
- `--dry-run` — extract but don't write files

The scanner:
- Reads `portals.yml` for keywords, experience level, date filter, and employer blocklist
- Launches Chromium with a persistent profile (`~/.scan-auth/<portal>/profile`)
- Searches the portal for each keyword, extracts job details
- Applies title filter and employer blocklist
- Dedupes against `data/scan-history.tsv`
- Saves accepted listings to `jds/{company}-{role-slug}.md` with frontmatter
- Writes results to `data/<portal>-scan-results.json`

Note: The scanner itself handles scan history dedup, employer blocklist, and title filtering internally. The orchestrator (`scan-auth.mjs`) only writes JD files and results output.

### 2. Process results

Read `data/<portal>-scan-results.json`. For each listing:

a. **Dedupe** against `data/pipeline.md` and `data/applications.md` (by company + role title, normalized)
b. **Skip** if already present

c. **Append to `data/pipeline.md`** under Pending:
   - If `application_url` exists (external apply link): `- [ ] {application_url} | {company} | {title}`
   - Otherwise use local JD: `- [ ] local:{jd_file} | {company} | {title}`

d. **Log to `data/scan-history.tsv`**:
   `{source_url}\t{date}\t{portal}\t{title}\t{company}\tadded`

e. Duplicates: log with status `skipped_dup`

### 3. Print summary

```
{Portal} Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scanner found: N listings
New to pipeline: N
Duplicates skipped: N
Errors: N

  + {company} | {title}
  ...

→ Run /career-ops pipeline to evaluate new listings.
```

## Error handling

- If the scanner exits with an error, show the error message to the user
- If `<portal>-scan-results.json` has entries in `errors`, report them
- If scanner reports CAPTCHA or login issues, tell the user to run `node scan-auth.mjs --login <portal>` and browse the portal manually to warm the session
