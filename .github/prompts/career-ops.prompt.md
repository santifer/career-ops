---
description: "Career-ops command center for evaluating job offers, generating tailored CVs, scanning portals, filling application forms, and tracking applications. Use when the user types /career-ops, pastes a job URL or JD, or asks for scan, pdf, tracker, apply, pipeline, batch, contacto, deep, training, or project."
name: "career-ops"
argument-hint: "[mode, job URL, or job description]"
agent: "agent"
---

Act as the career-ops router for GitHub Copilot.

## Mode Routing

Determine the mode from the provided argument:

| Input | Mode |
|-------|------|
| empty / no args | `discovery` |
| JD text or job URL with no explicit sub-command | `auto-pipeline` |
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

Auto-pipeline detection: if the argument is not a known sub-command and looks like a JD or offer URL, run `auto-pipeline`.

## Discovery Mode

If no argument is provided, show this menu:

```text
career-ops -- Command Center

Available commands:
  /career-ops {JD}      -> AUTO-PIPELINE: evaluate + report + PDF + tracker
  /career-ops pipeline  -> Process pending URLs from inbox (data/pipeline.md)
  /career-ops oferta    -> Evaluation only A-F (no auto PDF)
  /career-ops ofertas   -> Compare and rank multiple offers
  /career-ops contacto  -> LinkedIn outreach research + draft
  /career-ops deep      -> Deep company research prompt
  /career-ops pdf       -> PDF only, ATS-optimized CV
  /career-ops training  -> Evaluate a course or certification
  /career-ops project   -> Evaluate a portfolio project idea
  /career-ops tracker   -> Application status overview
  /career-ops apply     -> Live application assistant
  /career-ops scan      -> Scan portals and discover new offers
  /career-ops batch     -> Batch processing with subagents or optional CLI runner

Inbox: add URLs to data/pipeline.md -> /career-ops pipeline
Or paste a JD directly to run the full pipeline.
```

## Required Context Loading

Before executing any mode:

1. Read [DATA_CONTRACT.md](../../DATA_CONTRACT.md).
2. Read `config/profile.yml`, `modes/_profile.md`, `cv.md`, and `article-digest.md` when they exist and the task depends on them.
3. For `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, and `batch`, read `modes/_shared.md` plus the corresponding mode file.
4. For `tracker`, `deep`, `training`, and `project`, read only the corresponding mode file unless more context is needed.

## Operating Rules

- Never submit an application automatically.
- Do not add new entries directly to `data/applications.md`. Write TSV additions under `batch/tracker-additions/` and then run `node merge-tracker.mjs`.
- Use the existing scripts (`generate-pdf.mjs`, `merge-tracker.mjs`, `verify-pipeline.mjs`, `normalize-statuses.mjs`, `dedup-tracker.mjs`) when they match the task.
- When browser automation is available, verify live offers in-browser. If not, state that verification is unconfirmed.
- For `batch`, prefer orchestrating inside chat or via subagents when working in GitHub Copilot. The standalone `batch/batch-runner.sh` remains an optional external CLI path.