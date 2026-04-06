# AGENTS.md

## Purpose

This repo is a job-search operating system. Claude Code is the native workflow, but Codex can use the same file-based system if it follows the rules below.

## Start-of-session checks

Before doing anything else, silently verify that these files exist:

- `cv.md`
- `config/profile.yml`
- `portals.yml`
- `data/applications.md`

If any are missing, create them before running evaluations or scans.

## Sources of truth

- `cv.md` is the canonical resume source.
- `article-digest.md` contains higher-signal proof points and framing.
- `config/profile.yml` is the canonical identity, target-role, and search-strategy file.
- `portals.yml` controls scanner keywords, search queries, and tracked companies.

Do not invent experience or metrics. If a number is missing, leave it out or mark it for follow-up.

## Current candidate profile

- Candidate: Cristofer Hippleheuser
- Primary search lanes:
  - Product/frontend upside
  - Commerce/Shopify probability
- Strongest themes:
  - commercial frontend execution
  - accessibility and performance
  - analytics, experimentation, and cross-functional delivery
  - pragmatic AI-assisted development
- Real constraints:
  - remote-first preference
  - selective DFW hybrid is acceptable for strong roles
  - LeetCode-heavy loops carry real prep cost and should be evaluated consciously

## Mode mapping

Claude uses slash commands from `.claude/skills/career-ops/SKILL.md`.

Codex should map natural-language requests to the same underlying mode files:

- "Evaluate this job" -> `modes/auto-pipeline.md`
- "Scan for jobs" -> `modes/scan.md`
- "Generate a tailored PDF" -> `modes/pdf.md`
- "Show tracker status" -> `modes/tracker.md`
- "Process my pipeline" -> `modes/pipeline.md`
- "Batch process these jobs" -> `modes/batch.md`

When a mode requires shared context, read both:

- `modes/_shared.md`
- `modes/{mode}.md`

## Agent compatibility notes

- Claude-native features:
  - slash-command routing in `.claude/skills/`
- Codex-compatible today:
  - all markdown, YAML, tracker, report, and PDF source files
  - manual or shell-driven execution of evaluations and tracker updates
  - natural-language use of the mode files
  - standalone batch processing through `batch/batch-runner.sh --agent codex`
- Shared batch runner:
  - `batch/batch-runner.sh --agent claude`
  - `batch/batch-runner.sh --agent codex`
  - `batch/batch-runner.sh --agent manual`

## Tracker rules

- Never add new tracker rows by directly hand-editing the table if the workflow already expects TSV additions and merge scripts.
- Do update existing status or notes in `data/applications.md` when needed.
- Keep statuses aligned with `templates/states.yml`.

## Safety

- Never submit an application automatically.
- Never inflate qualifications.
- Prefer fewer, higher-fit applications over mass volume.
