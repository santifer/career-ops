# Mode: pdf2 — Batch PDF Generation (Parallel)

Generates ATS-optimized CVs for multiple jobs in parallel. Each job runs through the full single-job `pdf` pipeline in its own subagent. Use `/career-ops pdf` for a single job.

## Accepted Input Formats

| Format | Example |
|--------|---------|
| Multiple URLs pasted inline | Two or more `https://` URLs, one per line or space-separated |
| Plain text file | `--file urls.txt` or just a path ending in `.txt` |
| TSV file | `.tsv` — first column = URL, second = company (optional), third = role (optional) |
| `pipeline.md`-style | Lines matching `- [ ] https://…` or `- [ ] https://… \| Company \| Role` |
| `local:` entries | `local:jds/file.md` — reads the local file as JD text |

If only one URL or JD is provided, tell the user to use `/career-ops pdf` instead and exit.

## Step 1 — Parse Inputs

1. Detect the input format from the user's message or argument
2. Read the source (file or inline) and extract a list of jobs:
   ```
   [{ url, company (optional), role (optional) }, ...]
   ```
3. Deduplicate by URL. If the same URL appears twice, keep the first.
4. If parsing yields 0 jobs, tell the user no valid URLs were found.

**File reading:**
- `.txt`: Read with Read tool. One URL per line. Skip blank lines and lines starting with `#`.
- `.tsv`: First column = URL, second = company, third = role. Skip header row if it starts with `url` or `URL`.
- `pipeline.md`-style: Match `- [ ] https://…` lines. Parse optional `| Company | Role` suffix.

## Step 2 — Pre-flight

```bash
node cv-sync-check.mjs
```

If CV/profile are out of sync, warn the user (show the specific mismatch) and ask whether to continue. Default: continue.

Report the job list to the user before spawning workers:
```
Found N jobs to process:
  1. https://… (Acme Corp — AI PM)
  2. https://… (BigTech — ML Engineer)
  …
Launching parallel workers…
```

## Step 3 — Spawn One Subagent Per Job

Read `modes/_shared.md` and `modes/pdf.md` into memory once (do not re-read per job).

For each job, call Agent with `run_in_background: true`:

```
Agent(
  subagent_type="general-purpose",
  run_in_background=true,
  description="pdf2 worker: {company or url}",
  prompt="""
{full content of modes/_shared.md}

{full content of modes/pdf.md}

---
Process exactly ONE job for PDF generation. Follow the single-job pipeline in modes/pdf.md above.
Do not ask for input — all information is provided below.

URL: {url}
Company: {company or "unknown"}
Role: {role or "unknown"}

After generating the PDF:
- Write a tracker TSV to batch/tracker-additions/ as usual
- Write your result to batch/pdf2-results/{job_index}.json:
  {"status":"ok","company":"{company}","role":"{role}","pdf":"{output path}"}
  or on failure:
  {"status":"error","url":"{url}","reason":"{short reason}"}
"""
)
```

**Concurrency:** Spawn all workers in the same response (single message with multiple Agent calls). Do not wait for one to finish before starting the next.

## Step 4 — Consolidate Results

If a worker appears stuck after 10+ minutes, tell the user to retry that URL individually with `/career-ops pdf`.

After all subagents complete, read each `batch/pdf2-results/{job_index}.json` file to build the summary. Then run:
```bash
node merge-tracker.mjs
```

Show a summary table:

```
pdf2 — Batch Complete (N jobs)

| # | Company      | Role        | PDF | Output                                         |
|---|-------------|-------------|-----|------------------------------------------------|
| 1 | Acme Corp   | AI PM       | ✅  | output/cv-jane-doe-acme-corp-2026-05-04.pdf    |
| 2 | BigTech     | ML Engineer | ✅  | output/cv-jane-doe-bigtech-2026-05-04.pdf      |
| 3 | StartupXY   | CTO         | ❌  | URL inaccessible                               |
```

If any job failed, list the failed URLs and reasons below the table so the user can retry individually with `/career-ops pdf`.
