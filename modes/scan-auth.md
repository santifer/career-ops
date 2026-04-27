# Mode: scan-auth — Authenticated portal scanner

Runs the authenticated portal scanner (Playwright with persistent browser profiles), then processes results into the pipeline.

Supported portals: `linkedin` (more coming soon).

## Prerequisites

The user must have logged in at least once for the target portal:
```bash
node scan-auth.mjs --login <portal>
```
If the scanner reports "Not logged in", tell the user to run the above command **in a separate terminal window** (not via `!` prefix or Bash tool — the login flow opens an interactive browser that requires direct user interaction).

## Workflow

### 1. Run the scanner

If a portal is specified, scan only that portal. If no portal is specified, scan **all supported portals** by running `node scan-auth.mjs <portal>` for each one in sequence.

Supported portals: `linkedin`

```bash
node scan-auth.mjs linkedin
```

The scanner:
- Reads `portals.yml` for keywords, experience level, date filter, and employer blocklist
- Launches Chromium with a persistent profile (`~/.scan-auth/<portal>/profile`)
- Searches the portal for each keyword, extracts job details
- Applies title filter and employer blocklist
- Dedupes against `data/scan-history.tsv` (LinkedIn job IDs + company::title keys from all portals)
- Saves accepted JDs to `jds/{company}-{role-slug}.md` with frontmatter
- Appends accepted listings to `data/pipeline.md` as `- [ ] local:{jd_file} | {company} | {title}`
- Records all entries (accepted + skipped) to `data/scan-history.tsv`

The scanner handles everything end-to-end — no post-processing step is needed.

### 2. Print summary

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
- If scanner reports CAPTCHA or login issues, tell the user to run `node scan-auth.mjs --login <portal>` **in a separate terminal window** and browse the portal manually to warm the session
