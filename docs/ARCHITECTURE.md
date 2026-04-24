# Architecture

## System Overview

```
                    ┌─────────────────────────────────┐
                    │         Claude Code Agent        │
                    │   (reads CLAUDE.md + modes/*.md) │
                    └──────────┬──────────────────────┘
                               │
            ┌──────────────────┼──────────────────────┐
            │                  │                       │
     ┌──────▼──────┐   ┌──────▼──────┐   ┌───────────▼────────┐
     │ Single Eval  │   │ Portal Scan │   │   Batch Process    │
     │ (auto-pipe)  │   │  (scan.md)  │   │   (batch-runner)   │
     └──────┬──────┘   └──────┬──────┘   └───────────┬────────┘
            │                  │                       │
            │           ┌──────▼──────┐          ┌────▼─────┐
            │           │ pipeline.md │          │ N workers│
            │           │ (URL inbox) │          │ (claude -p)
            │           └─────────────┘          └────┬─────┘
            │                                          │
     ┌──────▼──────────────────────────────────────────▼──────┐
     │                    Output Pipeline                      │
     │  ┌──────────┐  ┌────────────┐  ┌───────────────────┐  │
     │  │ Report.md│  │  PDF (HTML  │  │ Tracker TSV       │  │
     │  │ (A-F eval)│  │  → Puppeteer)│  │ (merge-tracker)  │  │
     │  └──────────┘  └────────────┘  └───────────────────┘  │
     └────────────────────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  data/applications.md │
                    │  (canonical tracker)  │
                    └──────────────────────┘
```

## Evaluation Flow (Single Offer)

1. **Input**: User pastes JD text or URL
2. **Extract**: Playwright/WebFetch extracts JD from URL
3. **Classify**: Detect archetype (1 of 6 types)
4. **Evaluate**: 6 blocks (A-F):
   - A: Role summary
   - B: CV match (gaps + mitigation)
   - C: Level strategy
   - D: Comp research (WebSearch)
   - E: CV personalization plan
   - F: Interview prep (STAR stories)
5. **Score**: Weighted average across 10 dimensions (1-5)
6. **Report**: Save as `reports/{num}-{company}-{date}.md`
7. **PDF**: Generate ATS-optimized CV (`generate-pdf.mjs`)
8. **Track**: Write TSV to `batch/tracker-additions/`, auto-merged

## Batch Processing

The batch system processes multiple offers in parallel:

```
batch-input.tsv    →  batch-runner.sh  →  N × claude -p workers
(id, url, source)     (orchestrator)       (self-contained prompt)
                           │
                    batch-state.tsv
                    (tracks progress)
```

Each worker is a headless Claude instance (`claude -p`) that receives the full `batch-prompt.md` as context. Workers produce:
- Report .md
- PDF
- Tracker TSV line

The orchestrator manages parallelism, state, retries, and resume.

## Data Flow

```
cv.md                    →  Evaluation context
article-digest.md        →  Proof points for matching
config/profile.yml       →  Candidate identity
portals.yml              →  Scanner configuration
templates/states.yml     →  Canonical status values
templates/cv-template.html → PDF generation template
```

## File Naming Conventions

- Reports: `{###}-{company-slug}-{YYYY-MM-DD}.md` (3-digit zero-padded)
- PDFs: `cv-candidate-{company-slug}-{YYYY-MM-DD}.pdf`
- Tracker TSVs: `batch/tracker-additions/{id}.tsv`

## Pipeline Integrity

Scripts maintain data consistency:

| Script | Purpose |
|--------|---------|
| `merge-tracker.mjs` | Merges batch TSV additions into applications.md |
| `verify-pipeline.mjs` | Health check: statuses, duplicates, links |
| `dedup-tracker.mjs` | Removes duplicate entries by company+role |
| `normalize-statuses.mjs` | Maps status aliases to canonical values |
| `cv-sync-check.mjs` | Validates setup consistency |
| `check-liveness.mjs` | Liveness + freshness check (see below) |

## Freshness Filtering

Both `scan` and `pipeline` modes call `check-liveness.mjs` to filter out stale or expired job postings before they consume evaluation tokens.

**Two execution modes:**
- **Playwright** (default): renders SPAs, follows redirects, sees `innerText`. Use when running scan interactively.
- **`--fetch-mode`**: HTTP-only via `fetch()`. No JS execution, no browser. Use in batch workers (`claude -p`) where Playwright is unavailable. JSON-LD payloads are embedded server-side on Greenhouse, Ashby, and Lever, so fetch-mode catches dates on those platforms.

**Detection signals (priority order):**
1. **LinkedIn URL ID heuristic** — sequential job IDs leak posting year. Catches 2-year-old postings at zero network cost.
2. **JSON-LD `datePosted`** — embedded by all major ATS platforms. Survives WebFetch summarization.
3. **Inline `"datePosted":"..."` patterns** — for minified embeds outside JSON-LD blocks.
4. **Visible text patterns** — `Posted on YYYY-MM-DD`, `Posted on Aug 15, 2025`, `Posted N days ago`, etc.
5. **Greenhouse `?error=true` redirect** — definitive closed-job signal.
6. **Body text patterns** — "no longer accepting applications", "position has been filled", etc.

**Classification:**
- `fresh`: age ≤ `warn_age_days` (default 30d)
- `stale`: `warn_age_days` < age ≤ `max_age_days` (default 60d) — still evaluated but Red Flags penalty applies
- `expired`: age > `max_age_days` — pipeline.md skips entirely with `SKIPPED_STALE` minimal report
- `unverified`: no date found AND `require_date: true` — treated as expired in strict mode

**Configuration:** `freshness:` block in `portals.yml`. See `docs/CUSTOMIZATION.md` for tuning guidance.

**CLI:**
```bash
node check-liveness.mjs --fetch-mode --json <url>     # structured output
node check-liveness.mjs --fetch-mode --classify <url> # just "fresh|stale|expired"
node check-liveness.mjs <url>                          # interactive Playwright mode
```

**Tests:** `node test-freshness.mjs` (40 unit tests; runs as part of `node test-all.mjs`).

## Dashboard TUI

The `dashboard/` directory contains a standalone Go TUI application that visualizes the pipeline:

- Filter tabs: All, Evaluada, Aplicado, Entrevista, Top >=4, No Aplicar
- Sort modes: Score, Date, Company, Status
- Grouped/flat view
- Lazy-loaded report previews
- Inline status picker
