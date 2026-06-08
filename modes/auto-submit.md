# Mode: auto-submit — AutoSubmit Orchestrator

Invoked with `/career-ops auto-submit` or after auto-pipeline when Rahil says "submit it".

---

## What AutoSubmit does

AutoSubmit runs `node auto-submit.mjs` to fill remaining ATS fields and submit job applications automatically using Playwright. It runs **POST-SpeedyApply** — SpeedyApply handles resume upload and basic fields; AutoSubmit handles everything SpeedyApply misses (custom dropdowns, salary, cover letter, EEO, final submit click).

---

## Sub-commands

| Invocation | Action |
|------------|--------|
| `/career-ops auto-submit <url> <grade>` | Submit one job — runs the full script |
| `/career-ops auto-submit --cl <path> <url> <grade>` | Submit with explicit cover letter path |
| `/career-ops sus` | Review the SuS queue (alias, see below) |
| `/career-ops sus confirm <company>` | Whitelist a company in sus-db |
| `/career-ops sus skip <company>` | Mark company as skipped in sus-db |
| `/career-ops sus list` | Show pending SuS entries |

---

## Workflow: Submitting a job

### Step 1 — Pre-flight checks

Before running the script, verify:

1. **Does the URL look like a direct application form?** (greenhouse.io/jobs/, jobs.lever.co/, jobs.ashbyhq.com/, myworkdayjobs.com/)  
   - If it's a JD page, not a form: tell Rahil "This is the JD page — find the Apply button and copy that URL instead."
2. **Has this job been evaluated?** Grep `reports/` for the company name.  
   - If yes: remind Rahil of the score and grade. Ask for confirmation if score < 4.0: "Score was 3.8 — are you sure you want to auto-submit?"
   - If no evaluation exists: warn "No evaluation found. Want me to evaluate first?"
3. **Cover letter**: Check `output/` for a recent CL matching the company. Show the file it will use: "Will use: output/cover-letter-[company]-[date].pdf"

### Step 2 — SuS check (preview)

Run: `node auto-submit.mjs --url <url> --grade <grade> --cl <cl-path>`

If exit code 2 (SuS): Show Rahil the company that was flagged.

```
⚠ SuS flag: "[Company]" is not in your known connections or confirmed list.

Options:
  1. Confirm it — adds to sus-db, then submit
  2. Skip it — marks as skipped, abort
  3. Abort — do nothing
```

Wait for Rahil's choice. If confirm: run `node auto-submit.mjs --confirm "[Company]"` then re-run the submit command.

### Step 3 — Execute

Run the script. Monitor output in real time (stream stdout to user).

### Step 4 — Handle exit codes

| Exit code | Meaning | Action |
|-----------|---------|--------|
| 0 | Submitted | ✅ Confirm to Rahil. Show screenshot path. The tracker was already updated by the script. |
| 1 | Unhandled error | Show last 20 lines of `data/pipeline.log`. Offer to retry or debug. |
| 2 | SuS | Run SuS sub-flow (Step 2 above). |
| 3 | Blocked | Show `data/blocked-jobs.json` (latest entry). List the blocked fields. Offer: "Want to open the form so you can fill these manually?" |

### Step 5 — Post-submit

After a successful submit (exit 0):
- Show the screenshot: "Screenshot: `data/screenshots/[company]-[date].png`"
- Confirm tracker update: "Added to applications.md as Applied | Grade: [grade]"
- Suggest follow-up cadence: "Want me to set a follow-up reminder for 5 business days from now?"

---

## Workflow: SuS Queue Review

Invoked with `/career-ops sus` or `/career-ops sus list`.

1. Read `data/sus-db.json`
2. Show pending companies in a table:

```
🔍 SuS Queue — Companies pending validation

#  Company              URL                                  Flagged
1  acme corp            jobs.lever.co/acmecorp/...           2026-04-29
2  startup inc          jobs.ashbyhq.com/startupinc/...      2026-04-29

Options for each: [C]onfirm | [S]kip | [V]iew JD
Or: run `node sus-review.mjs` for interactive terminal review.
```

3. For each company Rahil confirms: `node auto-submit.mjs --confirm "[Company]"`
4. Update sus-db.json `skipped` array for skipped companies.

---

## Cover Letter Resolution

AutoSubmit resolves the cover letter in this priority order:

1. `--cl` flag provided AND file exists → use that file
2. Search `output/` for a file matching `cover-letter*[company-slug]*` pattern → use latest match
3. Search `output/` for any `cover-letter*` file → use latest (most recently modified)
4. No CL found → log warning and continue without CL

**Always show Rahil which CL will be used before executing.**

---

## Grade → Submit Decision

| Grade | Score range | Auto-submit? |
|-------|-------------|--------------|
| A | 4.5+ | Yes — submit immediately |
| B | 4.0–4.4 | Yes — but confirm once |
| C | 3.5–3.9 | Ask: "Score is [X] — still want to submit?" |
| D/F | < 3.5 | Refuse: "Score too low for auto-submit. Apply manually if you have a specific reason." |

---

## Safety Rules

- **NEVER submit without showing Rahil the pre-flight summary first** (company, role, grade, CL path, ATS platform).
- **NEVER submit Workday if login is required** — log as blocked, tell Rahil to submit manually.
- **EEO fields are always "Prefer not to say"** — never fill from inclusion-db EEO fields directly.
- **Do not retry a blocked job automatically** — always ask Rahil first.
- **Respect the SuS gate** — new companies must be confirmed before submitting.

---

## Files read/written by this mode

| File | Operation |
|------|-----------|
| `data/inclusion-db.json` | Read — profile data + field map |
| `data/sus-db.json` | Read + Write — SuS tracking |
| `data/blocked-jobs.json` | Write — blocked submissions |
| `data/screenshots/` | Write — post-submit screenshots |
| `data/applications.md` | Append — application record |
| `data/pipeline.log` | Append — error log |
| `output/` | Read — find cover letter |
| `reports/` | Read — check for existing evaluation |
