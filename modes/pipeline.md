# Mode: pipeline — URL Inbox (Second Brain)

Process accumulated job URLs from `data/pipeline.md`. The user adds URLs whenever and then runs `/career-ops pipeline` to process them all.

## Workflow

1. **Read** `data/pipeline.md` → find `- [ ]` items in "Pending" section
2. **For each pending URL:**
   a. Calculate next `REPORT_NUM` sequentially (read `reports/`, take highest number + 1)
   b. **Extract JD** using agent-browser (`open <url>` + `snapshot -i`) → WebFetch → WebSearch
   c. If URL is inaccessible → mark as `- [!]` with note and continue
   d. **Run full auto-pipeline**: A-F Evaluation → Report .md → PDF (if score >= 3.0) → Tracker
   e. **Move from "Pending" to "Processed"**: `- [x] #NNN | URL | Company | Role | Score/5 | PDF ✅/❌`
3. **If 3+ URLs are pending**, launch agents in parallel (Agent tool with `run_in_background`) to maximize speed.
4. **On completion**, show summary table:

```
| # | Company | Role | Score | PDF | Recommended Action |
```

## pipeline.md Format

```markdown
## Pending
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Error: login required

## Processed
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

## Smart JD Detection from URL

1. **agent-browser (preferred):** `open <url>` + `snapshot -i`. Works on all SPAs.
2. **WebFetch (fallback):** For static pages or when agent-browser is unavailable.
3. **WebSearch (last resort):** Search on secondary portals that index JDs.

**Special cases:**
- **LinkedIn**: May require login → mark `[!]` and ask user to paste text
- **PDF**: If URL points to a PDF, read directly with Read tool
- **`local:` prefix**: Read the local file. Example: `local:jds/linkedin-pm-ai.md` → read `jds/linkedin-pm-ai.md`

## Auto-Numbering

1. List all files in `reports/`
2. Extract the number from the prefix (e.g., `142-medispend...` → 142)
3. New number = max found + 1

## Source Sync

Before processing any URL, verify sync:
```bash
node cv-sync-check.mjs
```
If desync, warn the user before continuing.
