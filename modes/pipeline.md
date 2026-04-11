# Mode: pipeline — URL Inbox (Second Brain)

Processes offer URLs accumulated in `data/pipeline.md`. The user adds URLs whenever they want, then runs `/career-ops pipeline` to process them all.

## Workflow

1. **Read** `data/pipeline.md` → find `- [ ]` items in the "Pending" section
2. **For each pending URL**:
   a. Calculate the next sequential `REPORT_NUM` (read `reports/`, take the highest number + 1)
   b. **Extract JD** using Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. If the URL is not accessible → mark as `- [!]` with a note and continue
   d. **Save raw JD** to `jds/{company}-{role-slug}.md` (create `jds/` if it doesn't exist). Use the same slug format as reports: lowercase, hyphens, no special chars. Skip if the URL already has a `local:` prefix (JD already saved). If the JD was pasted as text rather than fetched from a URL, still save it.
   e. **Run the full auto-pipeline**: A-F Evaluation → Report .md → PDF (if score >= 3.0) → Tracker
   f. **Move from "Pending" to "Processed"**: `- [x] #NNN | URL | Company | Role | Score/5 | PDF ✅/❌`
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
2. **WebFetch (fallback):** For static pages or when Playwright is not available.
3. **WebSearch (last resort):** Search secondary portals that index the JD.

**Special cases:**
- **LinkedIn**: May require login → mark `[!]` and ask user to paste the text
- **PDF**: If the URL points to a PDF, read it directly with the Read tool
- **`local:` prefix**: Read the local file. Example: `local:jds/linkedin-pm-ai.md` → read `jds/linkedin-pm-ai.md`

## JD file naming and format

Save as: `jds/{company-slug}-{role-slug}.md`

- Use the same slug conventions as report filenames: lowercase, hyphens, ASCII only
- Example: `Braintrust · Senior ML Engineer` → `jds/braintrust-senior-ml-engineer.md`
- If a `local:` URL was already pointing to an existing file in `jds/`, do not overwrite it — just update the `report` frontmatter field.

File structure: **two parts separated by `---`**

```markdown
---
url: https://jobs.example.com/posting/123
fetched: YYYY-MM-DD
report: reports/{num}-{company-slug}-{date}.md
---

# {Job Title}

**Company:** ...
**Location:** ...
**Employment Type:** ...

## About the Company
...

## Role Description
...

## Key Responsibilities
- ...

## Required Qualifications
- ...

## Compensation
- ...

---

## Raw JD

{verbatim text from the page, exactly as fetched — no edits}
```

- The structured section above `---` is a clean markdown summary (reformatted for readability).
- The `## Raw JD` section below `---` is the verbatim text captured from the page snapshot, preserved exactly.
- The `report` field links the saved JD back to its evaluation. Fill it in after the report is created.

## Auto-numbering

1. List all files in `reports/`
2. Extract the number from the prefix (e.g., `142-medispend...` → 142)
3. New number = highest found + 1

## Source sync

Before processing any URL, verify sync:
```bash
node cv-sync-check.mjs
```
If there's a desync, warn the user before continuing.
