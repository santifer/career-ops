# Mode: pipeline — URL Inbox (Second Brain)

Process offer URLs accumulated in `data/pipeline.md`. The user adds URLs whenever they want and then runs `/career-ops pipeline` to process them all.

## Workflow

1. **Read** `data/pipeline.md` → find `- [ ]` items in the "Pending" section
2. **For each pending URL**:
   a. Compute the next sequential `REPORT_NUM` (read `reports/`, take the highest number + 1)
   b. **Extract the JD** using Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. If the URL isn't accessible → mark as `- [!]` with a note and continue
   d. **Run the full auto-pipeline**: A-F Evaluation → Report .md → PDF (if score >= 3.0) → Tracker
   e. **Move from "Pending" to "Processed"**: `- [x] #NNN | URL | Company | Role | Score/5 | PDF ✅/❌`
3. **If there are 3+ pending URLs**, launch agents in parallel (Agent tool with `run_in_background`) to maximize speed.
4. **When done**, show a summary table:

```
| # | Company | Role | Score | PDF | Recommended action |
```

## pipeline.md format

```markdown
## Pending
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Error: login required

## Processed
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

## Smart JD detection from URL

1. **Playwright (preferred):** `browser_navigate` + `browser_snapshot`. Works with all SPAs.
2. **WebFetch (fallback):** For static pages or when Playwright isn't available.
3. **WebSearch (last resort):** Search secondary portals that index the JD.

**Special cases:**
- **LinkedIn**: Most LinkedIn job URLs require login. Workflow:
  1. Try WebFetch first — public canonical URLs (`linkedin.com/jobs/view/{id}`) sometimes return enough JD to evaluate.
  2. If login-walled (or returns generic boilerplate), mark `[!]` next to the entry and ask the user to paste the JD text or save it to `jds/linkedin-{slug}.md`.
  3. Once pasted, treat as if the JD were in-context — proceed with auto-pipeline normally.
  4. **Tip for the user**: when finding interesting LinkedIn jobs, the cleanest path is to paste the JD text directly into a new pipeline entry rather than the URL. Format: `- [ ] local:jds/linkedin-{company}-{role-slug}.md | {company} | {title}` after saving the JD text to that file.
  5. **Do not** scrape LinkedIn with authenticated sessions or scraper services — violates LinkedIn ToS.
- **PDF**: If the URL points to a PDF, read it directly with the Read tool
- **`local:` prefix**: Read the local file. Example: `local:jds/linkedin-pm-ai.md` → read `jds/linkedin-pm-ai.md`

## Automatic numbering

1. List all files in `reports/`
2. Extract the number from the prefix (e.g. `142-medispend...` → 142)
3. New number = max found + 1

## Source synchronization

Before processing any URL, verify sync:
```bash
node cv-sync-check.mjs
```
If there's a desync, warn the user before continuing.
