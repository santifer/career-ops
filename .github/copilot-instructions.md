# Career-Ops -- GitHub Copilot instructions

Read `AGENTS.md` first. It is the canonical, vendor-neutral instruction file for this repository.

## Operating model
- Treat `modes/_shared.md` plus the relevant `modes/{mode}.md` file as the task prompt source.
- Keep business logic in portable Markdown and scripts, not in Copilot-only instructions.
- Never submit applications automatically; draft and prepare only.
- Prefer browser automation for live JD verification when tools are available.
- If live browser access is unavailable, fall back to HTTP fetch, then web search, and clearly mark unconfirmed verification.

## Repo hotspots
- `modes/` → evaluation and workflow prompts
- `batch/` → batch orchestration and worker prompt
- `templates/` → CV/PDF template and canonical statuses
- `generate-pdf.mjs`, `merge-tracker.mjs`, `verify-pipeline.mjs` → portable core scripts

## Data integrity
- Do not directly append new tracker rows to `data/applications.md`.
- Write TSV additions to `batch/tracker-additions/` and merge with `merge-tracker.mjs`.
- Every report must include `**URL:**` in the header.
