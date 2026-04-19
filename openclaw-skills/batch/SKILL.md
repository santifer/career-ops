---
name: batch
description: Batch process job postings — navigate portals in real-time or script URLs already collected, spawning workers for each posting.
---

# Mode: batch — Bulk Job Processing

Two modes of use: **browser conductor** (navigates portals in real-time) or **standalone** (script for already-collected URLs).

## Architecture

```
Main Agent (browser conductor)
  │
  │  Browser: navigates portals (logged-in sessions)
  │  Reads DOM directly — user sees everything in real-time
  │
  ├─ Posting 1: reads JD from DOM + URL
  │    └─► sessions_spawn worker → report .md + PDF + tracker-line
  │
  ├─ Posting 2: click next, reads JD + URL
  │    └─► sessions_spawn worker → report .md + PDF + tracker-line
  │
  └─ End: merge tracker-additions → applications.md + summary
```

Each worker is a `sessions_spawn` child with clean context. The conductor only orchestrates.

## Files

```
batch/
  batch-input.tsv               # URLs (by conductor or manual)
  batch-state.tsv               # Progress (auto-generated, gitignored)
  batch-runner.sh               # Standalone orchestrator script
  batch-prompt.md               # Prompt template for workers
  logs/                         # One log per posting (gitignored)
  tracker-additions/            # Tracker lines (gitignored)
```

## Mode A: Browser Conductor

1. **Read state**: `batch/batch-state.tsv` → know what was already processed
2. **Navigate portal**: Browser → search URL
3. **Extract URLs**: Read DOM of results → extract URL list → append to `batch-input.tsv`
4. **For each pending URL**:
   a. Browser: click on the posting → read JD text from DOM
   b. Save JD to `/tmp/batch-jd-{id}.txt`
   c. Calculate next sequential REPORT_NUM
   d. Execute via sessions_spawn:
      ```
      sessions_spawn({
        label: "📄 Process posting {id}",
        task: "[batch-prompt.md content] Process this posting. URL: {url}. JD: /tmp/batch-jd-{id}.txt. Report: {num}. ID: {id}",
        mode: "run",
        runTimeoutSeconds: 300
      })
      ```
   e. Update `batch-state.tsv` (completed/failed + score + report_num)
   f. Log to `logs/{report_num}-{id}.log`
   g. Browser: go back → next posting
5. **Pagination**: If no more postings → click "Next" → repeat
6. **End**: Merge `tracker-additions/` → `applications.md` + summary

## Mode B: Standalone Script

```bash
batch/batch-runner.sh [OPTIONS]
```

Options:
- `--dry-run` — list pending without executing
- `--retry-failed` — only retry failed ones
- `--start-from N` — start from ID N
- `--parallel N` — N workers in parallel
- `--max-retries N` — attempts per posting (default: 2)

## batch-state.tsv Format

```
id	url	status	started_at	completed_at	report_num	score	error	retries
1	https://...	completed	2026-...	2026-...	002	4.2	-	0
2	https://...	failed	2026-...	2026-...	-	-	Error msg	1
3	https://...	pending	-	-	-	-	-	0
```

## Resumability

- If it dies → re-run → reads `batch-state.tsv` → skip completed
- Lock file (`batch-runner.pid`) prevents double execution
- Each worker is independent: failure in posting #47 doesn't affect others

## Workers (sessions_spawn)

Each worker receives `batch-prompt.md` as system prompt. It is self-contained.

The worker produces:
1. Report `.md` in `reports/`
2. PDF in `output/`
3. Tracker line in `batch/tracker-additions/{id}.tsv`
4. JSON result via stdout

## Error Handling

| Error | Recovery |
|-------|----------|
| URL inaccessible | Worker fails → conductor marks `failed`, next |
| JD behind login | Conductor tries to read DOM. If fails → `failed` |
| Portal changes layout | Conductor reasons about HTML, adapts |
| Worker crashes | Conductor marks `failed`, next. Retry with `--retry-failed` |
| Conductor dies | Re-run → reads state → skip completed |
| PDF fails | Report .md is saved. PDF remains pending |
