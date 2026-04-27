# /career-ops

## Description
AI job search command center -- evaluate offers, generate CVs, scan portals, track applications.

## Usage
/career-ops [mode] [arguments]

If the user provides a job description or URL, evaluate it automatically.
If the user provides a mode name, execute that mode.
If the user provides no arguments, show the command menu.

## Mode Routing

| Input | Mode |
|-------|------|
| (empty / no args) | Show discovery menu below |
| JD text or URL | **auto-pipeline** (evaluate + report + PDF + tracker) |
| `pipeline` | Process pending URLs from `data/pipeline.md` |
| `oferta` / `evaluate` | Evaluation only A-F (no auto PDF) |
| `ofertas` / `compare` | Compare and rank multiple offers |
| `contacto` / `contact` | LinkedIn power move: find contacts + draft message |
| `deep` | Deep research prompt about company |
| `pdf` | PDF only, ATS-optimized CV |
| `training` | Evaluate course/cert against North Star |
| `project` | Evaluate portfolio project idea |
| `tracker` | Application status overview |
| `apply` | Live application assistant |
| `scan` | Scan portals and discover new offers |
| `batch` | Batch processing with parallel workers |
| `patterns` | Analyze rejection patterns and improve targeting |
| `followup` | Follow-up cadence tracker |

## Discovery Menu (no arguments)
Show this to the user:

```
career-ops -- Command Center

Available commands:
  /career-ops {JD}      → AUTO-PIPELINE: evaluate + report + PDF + tracker (paste text or URL)
  /career-ops pipeline  → Process pending URLs from inbox (data/pipeline.md)
  /career-ops oferta    → Evaluation only A-F (no auto PDF)
  /career-ops ofertas   → Compare and rank multiple offers
  /career-ops contacto  → LinkedIn power move: find contacts + draft message
  /career-ops deep      → Deep research prompt about company
  /career-ops pdf       → PDF only, ATS-optimized CV
  /career-ops training  → Evaluate course/cert against North Star
  /career-ops project   → Evaluate portfolio project idea
  /career-ops tracker   → Application status overview
  /career-ops apply     → Live application assistant (reads form + generates answers)
  /career-ops scan      → Scan portals and discover new offers
  /career-ops batch     → Batch processing with parallel workers
  /career-ops patterns  → Analyze rejection patterns and improve targeting
  /career-ops followup  → Follow-up cadence tracker: flag overdue, generate drafts

Inbox: add URLs to data/pipeline.md → /career-ops pipeline
Or paste a JD directly to run the full pipeline.
```

## Context Loading

### Modes that require `_shared.md` + their mode file:
Read `modes/_shared.md` + `modes/{mode}.md`
Applies to: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, `batch`

### Standalone modes (only their mode file):
Read `modes/{mode}.md`
Applies to: `tracker`, `deep`, `training`, `project`, `patterns`, `followup`

## Critical Rules
1. **NEVER submit an application without the user reviewing it first.** Fill forms, draft answers, generate PDFs — but always STOP before clicking Submit/Send/Apply.
2. **NEVER edit `data/applications.md` to ADD new entries** — Write TSV in `batch/tracker-additions/` and `merge-tracker.mjs` handles the merge.
3. **YES you can edit `data/applications.md` to UPDATE status/notes of existing entries.**
4. Read `cv.md` and `config/profile.yml` before any evaluation.
5. All reports MUST include `**URL:**` in the header.
6. Report numbering: sequential 3-digit zero-padded, max existing + 1.
