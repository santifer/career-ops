# Architecture

## System Overview

```text
                       ┌──────────────────────────────┐
                       │ Adapter entrypoint           │
                       │ Claude / OpenCode / future   │
                       └──────────────┬───────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │ Vendor-neutral runtime  │
                         │ runtime/modes.yml       │
                         │ runtime/context-loading │
                         │ runtime/operating-rules │
                         └────────────┬────────────┘
                                      │
                   ┌──────────────────┼──────────────────┐
                   │                  │                  │
            ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
            │ Single Eval │    │ Portal Scan │    │ Shared mode │
            │ auto-pipeline│   │  scan.md    │    │ business    │
            └──────┬──────┘    └──────┬──────┘    │ modes/* +   │
                   │                  │           │ CLAUDE.md   │
                   └──────────┬───────┘           └──────┬──────┘
                              │                           │
                    ┌─────────▼──────────────────────────▼─────────┐
                    │ Output pipeline: reports, PDFs, tracker TSVs │
                    └──────────────────────┬───────────────────────┘
                                           │
                                 ┌─────────▼─────────┐
                                 │ data/applications │
                                 └───────────────────┘
```

`runtime/modes.yml`, `runtime/context-loading.yml`, and `runtime/operating-rules.md` are the source of truth. Adapters are wrappers over that contract, not alternate implementations.

## Adapter Status

| Adapter | Status | Contract |
|---|---|---|
| Claude | Production-ready | Thin wrapper over the runtime core |
| OpenCode premium | First-class | Same runtime contract, additive-only premium/manual UX |
| Codex CLI | Documented-only | Compatibility guidance only; no shipped parity in this PR |
| Gemini CLI | Documented-only | Compatibility guidance only; no shipped parity in this PR |
| Copilot CLI | Documented-only | Compatibility guidance only; no shipped parity in this PR |

Documented-only adapters must not imply full parity. They exist to show how future adapters should bind to the same canonical core without forking routing, context loading, or safeguards.

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

The repo still contains a Claude-oriented batch system for existing workflows:

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

**Boundary:** batch/background worker abstraction is deferred and not part of this PR. The runtime core in this change standardizes interactive/manual behavior only; it does not claim that OpenCode premium, Codex CLI, Gemini CLI, or Copilot CLI have equivalent worker support.

## Data Flow

```
cv.md                    →  Evaluation context
article-digest.md        →  Proof points for matching
config/profile.yml       →  Candidate identity
portals.yml              →  Scanner configuration
templates/states.yml     →  Canonical status values
templates/cv-template.html → PDF generation template
```

## Runtime Contract Flow

```text
adapter
  -> runtime/modes.yml resolves the mode
  -> runtime/context-loading.yml selects the files
  -> runtime/operating-rules.md enforces safeguards
  -> modes/* + CLAUDE.md provide business logic
```

That split keeps the core vendor-neutral while still allowing adapter-scoped ergonomics.

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

## Dashboard TUI

The `dashboard/` directory contains a standalone Go TUI application that visualizes the pipeline:

- Filter tabs: All, Evaluada, Aplicado, Entrevista, Top >=4, No Aplicar
- Sort modes: Score, Date, Company, Status
- Grouped/flat view
- Lazy-loaded report previews
- Inline status picker
