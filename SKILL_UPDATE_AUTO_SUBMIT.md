# SKILL_UPDATE_AUTO_SUBMIT.md — Manual paste into job-pulse-1am-refresh/SKILL.md

**Rahil: paste the block below as Step 5 in your OneDrive scheduled task SKILL.md.**
Insert AFTER Step 4 (Cover Letters) and BEFORE the existing Step 5 (AutoSubmit).
The existing Step 5 becomes Step 6.

Sandbox cannot write to OneDrive directly (see BUGS.md K-2026-06-05-3).

---

## Step 5 — Auto-Submit DRY-RUN (inspect before committing)

**Safety rail: default is DRY-RUN. No applications are submitted without explicit review.**

After cover letter generation, run the auto-submit inspector:

```bash
cd C:/Users/rahil/career-ops
node scripts/auto-submit.mjs \
  --kanban dashboard/job-pulse-kanban.html \
  --limit 5 \
  --dry-run
```

This reads the Kanban, finds cards in `new-hot` / `autosubmit-ready` columns with grade A/B (non-referral), and reports:
- What ATS each job uses (Greenhouse, Lever, Ashby, Workday, etc.)
- Whether the form is fillable (Playwright support level)
- Whether a cover letter exists in `cover-letters/`
- Which cards WOULD be submitted if run with `--live`

Output: `data/auto-submit-dry-run-{date}.json`

**For LIVE submission (irreversible — review dry-run first):**
```bash
node scripts/auto-submit.mjs \
  --kanban dashboard/job-pulse-kanban.html \
  --limit 5 \
  --live
```
Hard cap: 10 per day. Screenshot of each form saved to `data/screenshots/`.
Exit codes: 0=success, 1=fatal, 2=SuS-blocked, 3=form-blocked.

**⚠️ Live submit is intentionally incomplete** — the actual form-fill+click is a stub.
Rahil must review the dry-run JSON and greenlight before implementing live click.
This prevents runaway automation. See BUGS.md K-2026-06-08-2.

**Per-card override:**
```bash
node scripts/auto-submit.mjs --kanban dashboard/job-pulse-kanban.html --card live-42 --dry-run
```

**Final Report counts:**
- eligible_total, processed, would_submit, partial, blocked
