---
description: AI job search command center -- evaluate offers, generate CVs, scan portals, track applications
---

# career-ops -- Router

Career-ops router. Arguments provided: "$ARGUMENTS"

## Mode Detection

Determine the mode from the arguments:

| Input | Mode |
|-------|------|
| (empty / no args) | `discovery` -- Show command menu |
| JD text or URL (no sub-command) | `auto-pipeline` |
| `oferta` | `oferta` |
| `ofertas` | `ofertas` |
| `contacto` | `contacto` |
| `deep` | `deep` |
| `pdf` | `pdf` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |
| `patterns` | `patterns` |
| `followup` | `followup` |

**Auto-pipeline detection:** If the argument is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for") or a URL, execute `auto-pipeline`.

If the argument is not a sub-command AND doesn't look like a JD, show discovery.

## Discovery Mode (no arguments)

Show this menu:

```
career-ops -- Command Center

Available commands:
  career-ops {JD}      → AUTO-PIPELINE: evaluate + report + PDF + tracker (paste text or URL)
  career-ops pipeline  → Process pending URLs from inbox (data/pipeline.md)
  career-ops oferta    → Evaluation only A-F (no auto PDF)
  career-ops ofertas   → Compare and rank multiple offers
  career-ops contacto  → LinkedIn power move: find contacts + draft message
  career-ops deep      → Deep research prompt about company
  career-ops pdf       → PDF only, ATS-optimized CV
  career-ops training  → Evaluate course/cert against North Star
  career-ops project   → Evaluate portfolio project idea
  career-ops tracker   → Application status overview
  career-ops apply     → Live application assistant (reads form + generates answers)
  career-ops scan      → Scan portals and discover new offers
  career-ops batch     → Batch processing with parallel workers
  career-ops patterns  → Analyze rejection patterns and improve targeting
  career-ops followup  → Follow-up cadence tracker: flag overdue, generate drafts

Inbox: add URLs to data/pipeline.md → career-ops pipeline
Or paste a JD directly to run the full pipeline.
```

## Context Loading by Mode

After determining the mode, read the necessary files before executing:

### Modes that require `_shared.md` + their mode file:
Read `modes/_shared.md` then `modes/{mode}.md`

Applies to: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, `batch`

### Standalone modes (only their mode file):
Read `modes/{mode}.md`

Applies to: `tracker`, `deep`, `training`, `project`, `patterns`, `followup`

Execute the instructions from the loaded mode file.
