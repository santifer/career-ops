# Project Guidelines

## First Reads

- Read `CLAUDE.md` for repository-specific workflow rules, onboarding behavior, and update handling.
- Read `DATA_CONTRACT.md` before editing files so user-layer data stays separate from system-layer logic.
- Link to `docs/ARCHITECTURE.md`, `docs/SETUP.md`, and `docs/CUSTOMIZATION.md` instead of copying their content into answers or new docs.
- For autonomous browser tasks, also read `modes/browser-session.md` before acting.

## Architecture

- Career-Ops has a strict split between user data (`cv.md`, `config/profile.yml`, `modes/_profile.md`, `data/`, `reports/`, `output/`) and system files (`modes/*.md`, `templates/`, `*.mjs`, `dashboard/`). Keep personal customization in the user layer.
- The core pipeline is: job input -> evaluation report -> optional PDF -> tracker TSV -> merge into `data/applications.md`.
- `dashboard/` is a separate Go TUI; most repository automation lives in Node.js scripts and markdown/yaml data files.

## Build And Validation

- Install dependencies with `npm install`.
- Run `npx playwright install chromium` before relying on PDF generation.
- Use `npm run sync-check` to verify the CV/profile setup.
- Use `npm run verify` after pipeline or tracker changes.
- Use `npm run merge` after writing files into `batch/tracker-additions/`.
- Use `npm run normalize` and `npm run dedup` only when working on tracker status normalization or duplicate cleanup.
- On Windows, `batch/batch-runner.sh` requires Bash via WSL or Git Bash.

## Conventions

- Never add new tracker rows directly to `data/applications.md`; create TSV additions in `batch/tracker-additions/` and merge them.
- You may update existing rows in `data/applications.md` when changing status or notes.
- Keep tracker statuses aligned with `templates/states.yml`.
- Every report must include a `**URL:**` header.
- Write user-specific narrative, archetypes, proof points, and negotiation preferences to `config/profile.yml` or `modes/_profile.md`, not `modes/_shared.md`.
- Never hardcode candidate metrics; read them from `cv.md` and `article-digest.md` when present.
- In browser workflows, stop for submit/apply actions, CAPTCHA, 2FA, and session-expiry gates.