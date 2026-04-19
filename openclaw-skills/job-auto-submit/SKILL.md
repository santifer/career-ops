---
name: job-auto-submit
description: Apply to jobs individually or in batch mode. Single-apply handles one job at a time with Playwright automation across LinkedIn, Indeed, Glassdoor. Batch mode processes multiple JDs sequentially with state tracking, dedup, and error recovery. Use when user says "apply to jobs", "auto-apply", "batch apply", or wants to automate application submission.
---

# Job Auto-Submit

Automate job application submission. Supports single-apply and batch modes.

## Modes

| Mode | Trigger | Use Case |
|------|---------|----------|
| **Single** | Apply to one specific job | Manual, one-at-a-time |
| **Batch** | Process multiple JDs from a list | Automated pipeline after scan/evaluate |

Both modes share the same scoring, form-filling, and safety logic.

---

## Single Apply

### Phase 1 — Setup

1. Verify Playwright + Chromium installed
2. Load user profile from `assets/job_profile.json`

### Phase 2 — Search Parameters

```json
{
  "job_titles": ["Software Engineer"],
  "locations": ["Sheffield", "Remote"],
  "remote": true,
  "keywords_required": ["Python", "C++"],
  "keywords_excluded": ["senior", "lead", "manager"],
  "platforms": ["linkedin", "indeed"],
  "max_applications": 10,
  "dry_run": false
}
```

### Phase 3 — Search & Score

Score each job (minimum 60% to proceed):
- Keywords match (40%), Location (20%), Experience level (20%), Salary (10%), Visa (10%)

### Phase 4 — Auto-Apply

1. Check platform-specific apply flow
2. Fill forms from profile
3. Upload resume, answer screening questions
4. Rate limit: random 30–90s delays; max 10/session, 50/day

### Phase 5 — Log

Record to applications tracker. Append to daily memory log.

### Safety

- **Dry run first** — always test without submitting
- **Stop on CAPTCHA** — halt and notify user

---

## Batch Mode

Process multiple job URLs sequentially. Each job runs as an independent worker via `sessions_spawn`.

### Setup

Create `batch-input.tsv` with URLs to process:

```
id	url	source
1	https://jobs.lever.co/acme/abc123	evaluate
2	https://boards-api.greenhouse.io/acme/jobs/456	evaluate
3	https://indeed.com/viewjob?jk=xyz789	apply
```

### State Tracking

`batch-state.tsv` (auto-generated):

```
id	url	status	started_at	completed_at	score	error	retries
1	https://...	completed	2026-...	2026-...	4.2	-	0
2	https://...	failed	2026-...	-	-	Timeout	1
3	https://...	pending	-	-	-	-	0
```

Status values: `pending`, `in_progress`, `completed`, `failed`, `skipped`

### Batch Workflow

1. **Read state** — load `batch-state.tsv`, identify pending items
2. **Dedup check** — verify URL not already in applications tracker
3. **For each pending URL**, spawn worker via `sessions_spawn`:
   ```
   sessions_spawn({
     label: "📋 Apply: {company} — {title}",
     task: "Read the JD from {url}, evaluate against profile, generate tailored resume + cover letter, and submit application. Score must be ≥ 60%.",
     mode: "run",
     runTimeoutSeconds: 300
   })
   ```
4. **Update state** after each worker completes
5. **Log** each result to applications tracker

### Dedup Pipeline

Before processing any URL, check:
1. `batch-state.tsv` — already `completed` → skip
2. Applications tracker — same company + role → skip
3. Scan history — same URL → skip

### Error Recovery

| Error | Action |
|-------|--------|
| URL inaccessible | Mark `failed`, log error, continue |
| JD behind login | Mark `failed`, continue |
| Worker crash | Mark `failed`, can retry later |
| Score < 60% | Mark `skipped`, log score |
| CAPTCHA | Halt batch, notify user |

**Resume:** Re-run batch → reads `batch-state.tsv` → skips completed items.

**Retry failed:** Only re-process items with status `failed` and `retries < max_retries` (default: 2).

### Batch Output Summary

```
Batch — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━
Total: N | Completed: N | Failed: N | Skipped: N
Scored ≥ 60%: N | Applied: N

  ✓ {company} | {title} | score {X}
  ✗ {company} | {title} | {error}
```
