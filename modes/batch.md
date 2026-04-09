# Mode: batch -- Bulk Offer Processing

Two usage modes: **conductor --chrome** (navigates portals in real time) or **standalone** (script for pre-collected URLs).

## Architecture

```
Claude Conductor (claude --chrome --dangerously-skip-permissions)
  │
  │  Chrome: navigates portals (logged-in sessions)
  │  Reads DOM directly -- the user sees everything in real time
  │
  ├─ Offer 1: reads JD from DOM + URL
  │    └─► claude -p worker → report .md + PDF + tracker-line
  │
  ├─ Offer 2: click next, reads JD + URL
  │    └─► claude -p worker → report .md + PDF + tracker-line
  │
  └─ End: merge tracker-additions → applications.md + summary
```

Each worker is a `claude -p` child with a clean 200K token context. The conductor only orchestrates.

## Files

```
batch/
  batch-input.tsv               # URLs (from conductor or manual)
  batch-state.tsv               # Progress (auto-generated, gitignored)
  batch-runner.sh               # Standalone orchestrator script
  batch-prompt.md               # Prompt template for workers
  logs/                         # One log per offer (gitignored)
  tracker-additions/            # Tracker lines (gitignored)
```

## Mode A: Conductor --chrome

1. **Read state**: `batch/batch-state.tsv` → know what was already processed
2. **Navigate portal**: Chrome → search URL
3. **Extract URLs**: Read DOM of results → extract URL list → append to `batch-input.tsv`
4. **For each pending URL**:
   a. Chrome: click on the offer → read JD text from DOM
   b. Save JD to `/tmp/batch-jd-{id}.txt`
   c. Calculate next sequential REPORT_NUM
   d. Execute via Bash:
      ```bash
      claude -p --dangerously-skip-permissions \
        --append-system-prompt-file batch/batch-prompt.md \
        "Process this offer. URL: {url}. JD: /tmp/batch-jd-{id}.txt. Report: {num}. ID: {id}"
      ```
   e. Update `batch-state.tsv` (completed/failed + score + report_num)
   f. Log to `logs/{report_num}-{id}.log`
   g. Chrome: go back → next offer
5. **Pagination**: If no more offers → click "Next" → repeat
6. **End**: Merge `tracker-additions/` → `applications.md` + summary

## Mode B: Standalone script

```bash
batch/batch-runner.sh [OPTIONS]
```

Options:
- `--dry-run` — list pending without executing
- `--retry-failed` — only retry failed ones
- `--start-from N` — start from ID N
- `--parallel N` — N workers in parallel
- `--max-retries N` — attempts per offer (default: 2)

## batch-state.tsv format

```
id	url	status	started_at	completed_at	report_num	score	error	retries
1	https://...	completed	2026-...	2026-...	002	4.2	-	0
2	https://...	failed	2026-...	2026-...	-	-	Error msg	1
3	https://...	pending	-	-	-	-	-	0
```

## Resumability

- If it dies → re-run → reads `batch-state.tsv` → skips completed
- Lock file (`batch-runner.pid`) prevents double execution
- Each worker is independent: failure on offer #47 does not affect the rest

## Workers (claude -p)

Each worker receives `batch-prompt.md` as system prompt. It is self-contained.

The worker produces:
1. Report `.md` in `reports/`
2. PDF in `output/`
3. Tracker line in `batch/tracker-additions/{id}.tsv`
4. JSON result via stdout

## Error handling

| Error | Recovery |
|-------|----------|
| URL inaccessible | Worker fails → conductor marks `failed`, next |
| JD behind login | Conductor tries to read DOM. If fails → `failed` |
| Portal changes layout | Conductor reasons about HTML, adapts |
| Worker crashes | Conductor marks `failed`, next. Retry with `--retry-failed` |
| Conductor dies | Re-run → reads state → skips completed |
| PDF fails | Report .md is saved. PDF remains pending |
