# Mode: batch — Bulk offer processing

Two usage modes: **conductor --chrome** (live portal navigation) or **standalone** (script over URLs you already collected).

## Architecture

```
Claude Conductor (claude --chrome --dangerously-skip-permissions)
  │
  │  Chrome: navigate portals (logged-in sessions)
  │  Read DOM directly — user sees everything live
  │
  ├─ Offer 1: read JD from DOM + URL
  │    └─► claude -p worker → report .md + PDF + tracker line
  │
  ├─ Offer 2: click next, read JD + URL
  │    └─► claude -p worker → report .md + PDF + tracker line
  │
  └─ End: merge tracker-additions → applications.md + summary
```

Each worker is a child `claude -p` with a clean ~200K context window. The conductor only orchestrates.

## Files

```
batch/
  batch-input.tsv               # URLs (from conductor or manual)
  batch-state.tsv               # Progress (auto-generated, gitignored)
  batch-runner.sh               # Standalone orchestrator script
  batch-prompt.md               # Worker prompt template
  logs/                         # One log per offer (gitignored)
  tracker-additions/            # Tracker lines (gitignored)
```

## Mode A: Conductor --chrome

1. **Read state:** `batch/batch-state.tsv` → see what finished
2. **Open portal:** Chrome → search URL
3. **Collect URLs:** Read results DOM → extract URL list → append to `batch-input.tsv`
4. **For each pending URL:**
   a. Chrome: open listing → read JD text from DOM
   b. Save JD to `/tmp/batch-jd-{id}.txt`
   c. Compute next sequential `REPORT_NUM`
   d. Run via Bash:
      ```bash
      claude -p --dangerously-skip-permissions \
        --append-system-prompt-file batch/batch-prompt.md \
        "Process this offer. URL: {url}. JD: /tmp/batch-jd-{id}.txt. Report: {num}. ID: {id}"
      ```
   e. Update `batch-state.tsv` (completed/failed + score + report_num)
   f. Log to `logs/{report_num}-{id}.log`
   g. Chrome: back → next listing
5. **Pagination:** If no more rows → click “Next” → repeat
6. **End:** Merge `tracker-additions/` → `applications.md` + summary

## Mode B: Standalone script

```bash
batch/batch-runner.sh [OPTIONS]
```

Options:
- `--dry-run` — list pending only, no execution
- `--retry-failed` — retry only rows marked failed in state
- `--start-from N` — start from offer ID N
- `--parallel N` — N workers in parallel
- `--max-retries N` — retries per offer (default: 2)

## `batch-state.tsv` format

```
id	url	status	started_at	completed_at	report_num	score	error	retries
1	https://...	completed	2026-...	2026-...	002	4.2	-	0
2	https://...	failed	2026-...	2026-...	-	-	Error msg	1
3	https://...	pending	-	-	-	-	-	0
```

## Resumability

- If the run dies → rerun → reads `batch-state.tsv` → skips completed
- Lock file (`batch-runner.pid`) prevents double runs
- Workers are independent: failure on offer #47 does not block others

## Workers (`claude -p`)

Each worker gets `batch-prompt.md` as system prompt. It is self-contained.

The worker produces:
1. Report `.md` in `reports/`
2. PDF in `output/`
3. Tracker line in `batch/tracker-additions/{id}.tsv`
4. JSON summary on stdout

## Error handling

| Error | Recovery |
|-------|----------|
| URL unreachable | Worker fails → conductor marks `failed`, next |
| JD behind login | Conductor tries DOM read; if fails → `failed` |
| Portal layout changes | Conductor reasons over HTML and adapts |
| Worker crash | Conductor marks `failed`, next. Retry with `--retry-failed` |
| Conductor dies | Rerun → reads state → skips completed |
| PDF fails | Report `.md` still saved; PDF pending |
