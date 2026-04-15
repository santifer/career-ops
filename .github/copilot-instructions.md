# Career-Ops Copilot Instructions

Use the workspace prompt in [.github/prompts/career-ops.prompt.md](./prompts/career-ops.prompt.md) for the main career-ops workflow.

## Core Rules

- Respect the user/system split in [DATA_CONTRACT.md](../DATA_CONTRACT.md). Do not modify user-layer files unless the user explicitly asks you to personalize the system.
- Write personalization to `config/profile.yml` or `modes/_profile.md`. Do not put user-specific narrative or archetypes into `modes/_shared.md`.
- Read `cv.md`, `config/profile.yml`, `modes/_profile.md`, and `article-digest.md` when they exist before scoring offers or generating PDFs.
- Never invent metrics, employers, dates, or proof points. Pull them from the user's files.
- Never submit an application automatically. Draft answers, prepare PDFs, and stop before the final submit action.
- Do not add new tracker rows directly to `data/applications.md`. Write a TSV line to `batch/tracker-additions/` and then run `node merge-tracker.mjs`.
- After a batch of evaluations, run `node merge-tracker.mjs`. If the pipeline may have drifted, also run `node verify-pipeline.mjs`.
- When browser automation is available, verify job postings with Playwright/browser tools. If running in a context without browser automation, mark verification as unconfirmed.

## Project Conventions

- Reuse the existing scripts instead of ad hoc file edits whenever a script already exists.
- Keep reports, PDFs, and tracker artifacts in their existing folders and naming conventions.
- Scores below `4.0/5` should be framed as a recommendation not to apply unless the user gives a specific override.