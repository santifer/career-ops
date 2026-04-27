# Mode: pipeline — URL Inbox (Second Brain)

Processes job offer URLs accumulated in `data/pipeline.md`. The user adds URLs at any time and then runs `/career-ops pipeline` to process them all.

## Workflow

1. **Read** `data/pipeline.md` → find `- [ ]` items in the "Pending" section
2. **For each pending URL**:
   a. Calculate next sequential `REPORT_NUM` (read `reports/`, take highest number + 1)
   b. **Extract JD** using Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. If URL is not accessible → mark as `- [!]` with note and continue
   d. **Scoring Logic**:
      - Read `scoring.method` from `config/profile.yml` (defaults to `zero-waste` if unset).
      - If `scoring.method` is `zero-waste` (default): Run **Early Fit Gate**. 
        - If gate PASSES (score >= 4.0) -> Proceed to full eval.
        - If gate REJECTS (score < 4.0) -> Execute rejection workflow.
      - If `scoring.method` is `original`: Skip gate. Proceed directly to full A-G evaluation.
   e. **Move from "Pending" to "Processed"**:
      - Processed: `- [x] `#NNN` | URL | Company | Role | Score/5 | PDF ✅/❌`
      - Rejected (Zero-Waste only): `- [~] URL | Company | Role | score/5 | mismatch`
3. **If 3+ URLs pending**, launch agents in parallel (Agent tool with `run_in_background`) to maximise speed.
4. **On completion**, show summary table:

```
| # | Company | Role | Gate | Score | PDF | Recommended Action |
```

---

## Early Fit Gate

**Purpose:** Cheap role-profile fit check before committing to a full A-G evaluation. Saves tokens on roles that would never make the cut.

**Reads:** `cv.md` + `modes/_profile.md` only. No WebSearch. No comp lookup.

**Scores 3 dimensions only:**

| Dimension | What it measures |
|-----------|-----------------|
| Profile match | Skills, experience, archetype alignment against cv.md |
| North Star alignment | How well the role fits target archetypes from _profile.md |
| Red flags | Hard blockers (wrong geography with no remote, seniority mismatch, excluded tech stack) |

**Output:** A single fit score (1.0-5.0) with a one-line reason.

**Decision:**

- **Score >= 4.0** → Gate passes. Proceed to full A-G evaluation.
- **Score < 4.0** → Gate rejects. Execute rejection workflow below.

**Gate output format (shown to user before proceeding or rejecting):**
```
Fit Gate: [Company] — [Role]
Score: X.X/5 | [PASS / REJECT]
Reason: [one sentence]
```

---

## Gate Rejection Workflow

When a role scores below 4.0, execute ALL of the following — no exceptions:

### 1. Log to scan-history.tsv
```
{url}	{date}	pipeline-gate	{title}	{company}	skipped_mismatch
```

### 2. Extract mismatch signals
From the JD and fit score reasoning, identify:
- **Title patterns** that are poor matches (e.g. "Data Analyst", "DevOps", "Sales Engineer")
- **Archetype** that does not align (e.g. pure MLOps engineering, non-technical PM)
- **Hard blockers** (e.g. requires specific certification, onsite-only in wrong country)

### 3. Append to portals.yml learned_negative
Add extracted title patterns to the `learned_negative` section under `title_filter` in `portals.yml`. This tightens future scans automatically.

Format to append:
```yaml
  learned_negative:
    - pattern: "[title keyword or phrase]"
      reason: "[one sentence why this is a mismatch]"
      date: "[YYYY-MM-DD]"
      source: "[company] — [role]"
```

If `learned_negative` section does not exist yet, create it directly under the `negative` list in `title_filter`.

### 4. Do NOT touch applications.md
Rejected roles are NOT logged as applications. They are scan noise, not evaluated opportunities.

### 5. Mark pipeline.md item
Move to "Processed" as:
```
- [~] {url} | {company} | {role} | {score}/5 | mismatch
```

---

## Full Auto-Pipeline (Gate Passed Only)

Runs only after a role clears the 4.0 gate:

1. **Full A-G evaluation** (see `modes/oferta.md`)
2. **Save report .md** to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`
3. **Generate PDF** if score >= 4.0 (gate already ensures this)
4. **Register in tracker** via TSV in `batch/tracker-additions/`

---

## JD Extraction

1. **Playwright (preferred):** `browser_navigate` + `browser_snapshot`. Works with all SPAs.
2. **WebFetch (fallback):** For static pages or when Playwright is unavailable.
3. **WebSearch (last resort):** Search secondary portals that index the JD.

**Special cases:**
- **LinkedIn**: May require login → mark `[!]` and ask user to paste the text
- **PDF**: If URL points to a PDF, read it directly with Read tool
- **`local:` prefix**: Read the local file. Example: `local:jds/linkedin-pm-ai.md` → read `jds/linkedin-pm-ai.md`

---

## Sequential Numbering

1. List all files in `reports/`
2. Extract number from prefix (e.g. `142-medispend...` → 142)
3. New number = maximum found + 1

---

## Source Sync Check

Before processing any URL, verify sync:
```bash
node cv-sync-check.mjs
```
If out of sync, warn the user before continuing.

---

## pipeline.md Format

```markdown
## Pending
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Error: login required

## Processed
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 4.1/5 | PDF ✅
- [~] https://jobs.example.com/posting/999 | DataCo | Data Analyst | 2.8/5 | mismatch
```
