# Mode: batch — Large-Volume Job Processing

There are two ways to use batch mode:
- conductor mode with a live browser session
- standalone mode for already collected URLs

## Architecture

```text
Conductor agent
  -> navigates job portals
  -> reads JD content
  -> hands each offer to a worker backend
  -> merges tracker additions at the end
```

The worker backend can be:
- `claude`
- `codex`
- `manual`

## Files

```text
batch/
  batch-input.tsv
  batch-state.tsv
  batch-runner.sh
  batch-runner.ps1
  batch-prompt.md
  batch-output-schema.json
  logs/
  tracker-additions/
  manual-work-items/
```

## Conductor Flow

1. Read `batch/batch-state.tsv`
2. Navigate the portal
3. Collect job URLs into `batch/batch-input.tsv`
4. For each pending URL:
   - read the JD
   - save the JD text if needed
   - compute the next report number
   - run the worker backend
   - update state
   - move to the next result
5. Merge tracker additions into `data/applications.md`

## Standalone Scripts

Unix-like:

```bash
batch/batch-runner.sh [OPTIONS]
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\batch\batch-runner.ps1 [OPTIONS]
```

Important options:
- `--agent` or `-Agent` with `claude|codex|manual|auto`
- dry run mode
- retry failed mode
- start from a specific ID
- max retries
- parallel worker count where supported

## State File

```text
id	url	status	started_at	completed_at	report_num	score	error	retries
```

## Resumability

- completed rows are skipped by default
- failed rows are only retried when retry mode is explicitly requested
- lock files prevent double execution
- one failed job must not block the rest of the queue

## Worker Outputs

Each successful worker should produce:
1. a Markdown report in `reports/`
2. a PDF in `output/`
3. one tracker TSV line in `batch/tracker-additions/`
4. one structured JSON result

## Error Handling

| Failure | Recovery |
|---|---|
| inaccessible URL | mark failed and continue |
| login-only JD | mark failed unless the conductor can read the DOM |
| portal layout change | adapt extraction if possible, otherwise fail cleanly |
| worker crash | mark failed and continue |
| PDF failure | keep the report and mark PDF as missing |

### Language Rule

All generated batch artifacts must be English only.
