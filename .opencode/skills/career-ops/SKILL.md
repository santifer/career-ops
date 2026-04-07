---
name: career-ops
description: AI job search command center -- evaluate offers, generate CVs, scan portals, track applications
license: MIT
compatibility: opencode
metadata:
  audience: job-seekers
  workflow: career-automation
---

# career-ops -- Router

## Mode Routing

Determine the mode from `$ARGUMENTS`:

| Input | Mode |
|-------|------|
| (empty / no args) | `discovery` -- Show command menu |
| JD text or URL (no sub-command) | **`auto-pipeline`** |
| `offer` | `offer` |
| `offers` | `offers` |
| `contact` | `contact` |
| `deep` | `deep` |
| `pdf` | `pdf` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |

**Auto-pipeline detection:** If `$ARGUMENTS` is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for", company name + role) or a URL to a JD, execute `auto-pipeline`.

If `$ARGUMENTS` is not a sub-command AND doesn't look like a JD, show discovery.

---

## Discovery Mode (no arguments)

Show this menu:

```
career-ops -- Command Center

Available commands:
  /career-ops {JD}      → AUTO-PIPELINE: evaluate + report + PDF + tracker (paste text or URL)
  /career-ops pipeline  → Process pending URLs from inbox (data/pipeline.md)
  /career-ops offer     → Evaluation only A-F (no auto PDF)
  /career-ops offers    → Compare and rank multiple offers
  /career-ops contact   → LinkedIn power move: find contacts + draft message
  /career-ops deep      → Deep research prompt about company
  /career-ops pdf       → PDF only, ATS-optimized CV
  /career-ops training  → Evaluate course/cert against career goals
  /career-ops project   → Evaluate portfolio project idea
  /career-ops tracker   → Application status overview
  /career-ops apply     → Live application assistant (reads form + generates answers)
  /career-ops scan      → Scan portals and discover new offers
  /career-ops batch     → Batch processing with parallel workers

Inbox: add URLs to data/pipeline.md → /career-ops pipeline
Or paste a JD directly to run the full pipeline.
```

---

## Routing Instructions

Once you've determined the mode:

1. **For discovery mode:** Show the menu above
2. **For all other modes:** Delegate to the corresponding command file in `.opencode/commands/{mode}.md`

The command files are thin wrappers that delegate to the actual mode logic in `modes/`. Follow the instructions in the mode files to execute the workflow.
