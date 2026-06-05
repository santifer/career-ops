---
name: job-pulse-9am-refresh
description: Daily 9am job search refresh — API-verifies every URL (<2% dead-link target), routes through SuS/whitelist gate, auto-submits Fortune 500 + whitelisted, queues unknowns for user review
---

You are the Job Pulse daily refresh agent for Rahil Nathani. This skill enforces the 2026-05-02 ethical-use revision in `CLAUDE.md`.

## Rahil's Profile
- 13 years exp, PMP, A-CSM, LeSS, SAFe SSM 5.0
- Target roles: Sr. Scrum Master, Program Manager, Agile Coach, Agile Project Manager, Delivery Manager, Senior Program Manager, Technical Program Manager
- Location: Dallas TX, open to remote/hybrid
- Comp floor: $130K base — skip anything confirmed below
- Industries: Technology, Healthcare, Financial Services, Manufacturing, E-Commerce

## STABLE PATHS
- Kanban: `C:\Users\rahil\career-ops\dashboard\job-pulse-kanban.html`
- AutoSubmit script: `C:\Users\rahil\career-ops\auto-submit.mjs`
- Cover letter output: `C:\Users\rahil\career-ops\output\`
- Whitelist (per-company AutoSubmit approvals): `C:\Users\rahil\career-ops\data\autosubmit-whitelist.json`
- Dead-URL audit log: `C:\Users\rahil\career-ops\data\dead-url-history.json`
- Fortune 500 set: hardcoded in `dashboard/job-pulse-kanban.html` as `FORTUNE_500`
- Project ethical-use rule: `C:\Users\rahil\career-ops\CLAUDE.md` (the AutoSubmit Gate section is the source of truth)

---

## Step 1 — Source candidate URLs (last 8 hours)

Run WebSearch queries with current-date freshness terms ("today", "posted today", `2026`):
1. "Senior Scrum Master" OR "Sr Scrum Master" site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:workday.com 2026
2. "Program Manager" agile scrum remote OR dallas site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:workday.com 2026
3. "Technical Program Manager" agile scrum site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:workday.com 2026
4. "Delivery Manager" OR "Agile Project Manager" site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:workday.com 2026
5. "Agile Coach" OR "Release Train Engineer" site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:workday.com 2026

For each candidate URL collect: company, role, ATS, full URL, key skills, grade (A/B/C/D/F per existing rubric), connection check.

Skip D/F immediately.

---

## Step 1.5 — URL VERIFICATION GATE (HARD <2% failure rule)

**Search-engine attestation alone is NEVER enough.** Hit the ATS API for every candidate URL.

| ATS | Verification call | Pass | Fail |
|---|---|---|---|
| Greenhouse (`job-boards.greenhouse.io/{board}/jobs/{id}`) | GET `https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}` | HTTP 200 + JSON has `title` | HTTP 404 → DROP |
| Lever (`jobs.lever.co/{company}/{id}`) | GET `https://api.lever.co/v0/postings/{company}/{id}?mode=json` | HTTP 200 | HTTP 404 → DROP |
| Ashby (`jobs.ashbyhq.com/{company}/{id}`) | GET `https://api.ashbyhq.com/posting-api/job-board/{company}` and confirm `{id}` is in `jobs[].id` | id present | id absent → DROP |
| Workday | Fetch URL, parse for job data; absence of "no longer accepting applications" / "Job not found" / a redirect to `/careers` root. If ambiguous → SuS column. | unambiguous live | else → SuS column |

Every URL the gate rejects → append to `data/dead-url-history.json`.

**Aggregate the rejection rate for this run.** If >2% (more than 1 in 50), the scanner has a defect — flag it loudly in the final report. The hard rule means the user expects this to converge on near-zero.

---

## Step 2 — Read existing Kanban

Read `dashboard/job-pulse-kanban.html`. Find:
- current `SEED_VERSION`
- live card block boundaries
- `FORTUNE_500` set (for AutoSubmit gating)
- Read `data/autosubmit-whitelist.json` (for per-company approvals)

---

## Step 3 — Route each VERIFIED-LIVE card to the right column

For each verified card, evaluate against the AutoSubmit Gate (CLAUDE.md, Ethical Use section). Initial column assignment:

```
if hasConnection (warm referral):
    columnId = 'referral-review'
elif company is in FORTUNE_500 (case-insensitive match):
    columnId = 'autosubmit-ready'   // pre-approved per ethical-use rule
elif company is in autosubmit-whitelist.json (case-insensitive match on same ATS board):
    columnId = 'autosubmit-ready'   // user previously approved this company
else:
    columnId = 'sus-blocked'         // unknown — user must validate before any auto-submit
```

Cards in `sus-blocked` get a clear `jobDescText` prefix: `"[NEEDS VALIDATION] Move to AutoSubmit Ready to whitelist {company} and submit. ..."`. This makes the gate visible.

Inject all verified cards into the Kanban using existing live-N format.

---

## Step 4 — Generate cover letters for grades A/B (referral, F500, whitelisted, AND sus-blocked)

Cover letter rules (unchanged):
- Hard cap 249 words.
- Mirror 5+ verbatim keywords from JD.
- 3 paragraphs (hook / 2-3 proof points / close).
- Filename: `cl_{company-slug}_{role-slug}_{YYYY-MM-DD}.txt` in `output/`.

Generating CLs for sus-blocked cards is intentional — the moment the user moves the card to AutoSubmit Ready, the CL is already there and AutoSubmit can run immediately without delay.

---

## Step 5 — AutoSubmit (only for cards in `autosubmit-ready` and `referral-review` is SKIPPED)

For each card with `columnId == 'autosubmit-ready'`:
1. Find the matching CL in `output/`
2. Run via Bash: `node C:\Users\rahil\career-ops\auto-submit.mjs --url "{url}" --grade {A|B|C} --cl "{cl_path}"`
3. Capture exit code:
   - **0 (submitted)** → set `columnId='new-fresh'`, set `closedAt = now`. If the company was not in FORTUNE_500, **add it to `autosubmit-whitelist.json`** as a successful submission record (this preserves the whitelist's "validated by user via column move" intent — successful F500 submissions are tracked in `submission_history` only, not promoted into the whitelist proper).
   - **2 (SuS)** → move card to `sus-blocked`, log in `data/sus-db.json`
   - **3 (blocked)** → leave in `autosubmit-ready`, note in final report with blocked field list
   - **1 (error)** → leave in `autosubmit-ready`, log error

Cards in `referral-review`: do NOT auto-submit. The user pursues warm intros manually.
Cards in `sus-blocked`: do NOTHING. Wait for the user to move them.

Run AutoSubmit sequentially.

---

## Step 6 — Whitelist updates after successful runs

After each Step 5 success on a non-F500 company, append to `data/autosubmit-whitelist.json` under `whitelist[{company-name-lower}]`:
```json
{
  "ats_boards": ["greenhouse:{board-token}"],
  "validated_at": "{ISO timestamp}",
  "validated_via_card_id": "{live-N}",
  "validated_role": "{title}",
  "submission_history": [{"date": "...", "url": "...", "outcome": "submitted", "notes": ""}],
  "comp_floor_override": null,
  "notes": ""
}
```

Note: an entry only gets created if the user had previously moved a card for this company from `sus-blocked` → `autosubmit-ready`. If the entry doesn't exist yet, that move just happened in this run, so we're creating its first record. If the entry already existed, append to `submission_history`.

---

## Step 7 — Bump SEED_VERSION

`v{N+1}-api-verified` (or whatever version label tracks the most recent rule revision).

---

## Step 8 — Save Kanban

Write back to `dashboard/job-pulse-kanban.html`.

---

## Step 8.5 — Write last-refresh.json summary

After saving the Kanban, write a summary file for the 8am report to consume instantly (no scanning of data files needed):

Run via Bash — replace every `REPLACE_*` token with the actual integer/string values tallied during this run before executing:

```bash
node -e "
const fs = require('fs');
const summary = {
  ran_at: new Date().toISOString(),
  date: new Date().toISOString().slice(0, 10),
  attempted: REPLACE_attempted,
  submitted: REPLACE_submitted,
  blocked: REPLACE_blocked,
  sus_new: REPLACE_sus_new,
  sus_pending: REPLACE_sus_pending,
  errors: REPLACE_errors,
  cls_generated: REPLACE_cls_generated,
  grade_a: REPLACE_grade_a,
  grade_b: REPLACE_grade_b,
  grade_c: REPLACE_grade_c,
  referral_count: REPLACE_referral_count,
  cards_injected: REPLACE_cards_injected,
  workday_jobs_found: REPLACE_workday_jobs_found,
  seed_version: 'REPLACE_seed_version',
  ats_mix: {
    greenhouse: REPLACE_greenhouse_count,
    lever: REPLACE_lever_count,
    ashby: REPLACE_ashby_count,
    workday: REPLACE_workday_count,
    linkedin: REPLACE_linkedin_count,
    indeed: REPLACE_indeed_count,
    theladders: REPLACE_theladders_count,
    hiringcafe: REPLACE_hiringcafe_count,
    icims: REPLACE_icims_count
  }
};
fs.mkdirSync('data', {recursive:true});
fs.writeFileSync('data/last-refresh.json', JSON.stringify(summary, null, 2));
console.log('last-refresh.json written');
"
```

**Rules:**
- Always write this file even if all counts are 0 — the 8am report depends on it existing.
- `sus_pending` = total cards currently in `sus-blocked` column after this run (read from Kanban before saving).
- `sus_new` = cards that entered `sus-blocked` **this run only** (new injections routed there + any exit-code-2 from AutoSubmit).
- `seed_version` = the new SEED_VERSION string written in Step 7.
- `ats_mix` counts reflect API-200 verified cards only (dead URLs excluded).

---

## Step 9 — Validate

Confirm:
- SEED_VERSION bumped
- 0 cards have `verification: "search-only"` or `"unconfirmed"` — every card must reference an API-200 result
- Dead-URL rate for this run is <2%
- Cards in `sus-blocked` have `[NEEDS VALIDATION]` prefix in jobDescText
- F500 / whitelisted cards routed to `autosubmit-ready`
- AutoSubmit only ran on `autosubmit-ready` and `referral-review` was untouched
- Whitelist updated for any new successful non-F500 submissions

---

## Final Report

```
=== JOB PULSE 9AM REFRESH — {DATE} ===
Sources searched:                   {N}
Candidate URLs surfaced:            {N}
URL verification gate:
  - API-200 live:                   {N}
  - API-404 dead:                   {N}
  - Other (Workday ambiguous → SuS):{N}
  - Dead-link rate this run:        {X}%   ← MUST be <2%, flag if not
Cards injected:                     {N} (A:{n} B:{n} C:{n})
Routing:
  - Referral Review (warm):         {N}
  - AutoSubmit Ready (F500):        {N}
  - AutoSubmit Ready (whitelisted): {N}
  - SuS / Blocked (needs review):   {N}
CLs generated:                      {N}
AutoSubmit results (auto-ready only):
  - Submitted:                      {N} → moved to Submitted/Applied; whitelist updated for {N} new companies
  - SuS:                            {N} → moved to sus-blocked
  - Blocked:                        {N} → manual takeover
  - Errors:                         {N}
SEED_VERSION:                       {new}
================================
```
