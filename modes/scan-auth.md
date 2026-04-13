# Mode: scan-auth — LinkedIn job scanner

Runs the LinkedIn scanner (Playwright with persistent authenticated session), then processes results into the pipeline.

## Prerequisites

The user must have logged in at least once:
```bash
node scan-auth.mjs --login
```
If the scanner reports "Not logged in", tell the user to run the above command first.

## Workflow

### 1. Run the scanner

```bash
node scan-auth.mjs
```

The scanner:
- Reads `portals.yml` for keywords, experience level, date filter, and employer blocklist
- Launches Chromium with a persistent profile (`~/.scan-auth/profile`)
- Searches LinkedIn for each keyword, clicks each job card, expands the description
- Applies title filter and employer blocklist
- Dedupes against `data/scan-history.tsv`
- Saves JDs to `jds/{company}-{role-slug}.md` with frontmatter
- Writes results to `data/linkedin-scan-results.json`

### 2. Process results

Read `data/linkedin-scan-results.json`. For each listing:

a. **Dedupe** against `data/pipeline.md` and `data/applications.md` (by company + role title, normalized)
b. **Skip** if already present

c. **Append to `data/pipeline.md`** under Pending:
   - If `application_url` exists (external apply link): `- [ ] {application_url} | {company} | {title}`
   - Otherwise use local JD: `- [ ] local:{jd_file} | {company} | {title}`

d. **Log to `data/scan-history.tsv`**:
   `{linkedin_url}\t{date}\tLinkedIn\t{title}\t{company}\tadded`

e. Duplicates: log with status `skipped_dup`

### 3. Print summary

```
LinkedIn Scan — {YYYY-MM-DD}
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
- If `linkedin-scan-results.json` has entries in `errors`, report them
- If scanner reports CAPTCHA or login issues, tell the user to run `node scan-auth.mjs --login` and browse LinkedIn manually to warm the session
