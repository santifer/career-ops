# Project Context: Career Ops

Career Ops is an AI-assisted job search command center. It evaluates job postings, generates tailored CV PDFs, scans portals, tracks applications, supports batch evaluation, and exposes a Go dashboard for browsing the pipeline.

This file is the fast context entrypoint for Codex. It does not replace `DATA_CONTRACT.md`, `AGENTS.md`, or the mode files. It summarizes how to navigate the repository without breaking the system.

## Core Rule

The most important architectural rule is the separation between user layer and system layer.

User layer files contain personal data, preferences, applications, reports, generated CVs, and job-search history. Do not overwrite them during system updates. Personalization belongs here.

System layer files contain reusable logic, scripts, shared prompts, templates, dashboard code, and project documentation. System behavior changes belong here unless the change is user-specific.

Read `DATA_CONTRACT.md` whenever a change might cross that boundary.

## User Layer

Treat these as user-owned working data:

- `cv.md`
- `config/profile.yml`
- `modes/_profile.md`
- `article-digest.md`
- `portals.yml`
- `data/*`
- `reports/*`
- `output/*`
- `jds/*`
- `interview-prep/*`

When the user asks to customize archetypes, targeting, compensation policy, negotiation scripts, location preferences, proof points, or filtering preferences, write to `modes/_profile.md`, `config/profile.yml`, or `article-digest.md`. Do not put personal customization into `modes/_shared.md`.

## System Layer

Treat these as reusable system code or instructions:

- `AGENTS.md`, `PROJECT_CONTEXT.md`, and local `AGENTS.md` files
- `*.mjs` scripts
- `modes/_shared.md` and mode instruction files except `modes/_profile.md`
- `templates/*`
- `batch/*`
- `dashboard/*`
- `.agents/*`, `.opencode/*`, `.github/*`
- `docs/*`, `examples/*`, `fonts/*`

## Runtime Checks

At session start, the project expects:

```bash
node update-system.mjs check
```

Say nothing if the output is `up-to-date`, `dismissed`, or `offline`. If an update is available, tell the user and ask before applying it.

Before evaluations, scans, or PDF work, make sure the onboarding basics exist:

- `cv.md`
- `config/profile.yml`
- `modes/_profile.md`
- `portals.yml`

If `modes/_profile.md` is missing, copy `modes/_profile.template.md` to `modes/_profile.md` before continuing.

## Main Workflows

Evaluation flow:

1. Read the relevant mode file under `modes/`.
2. Read `cv.md`, `config/profile.yml`, and `modes/_profile.md`.
3. Verify job posting liveness with Playwright when possible.
4. Create a numbered report under `reports/`.
5. Generate a CV/PDF under `output/` only when the workflow calls for it.
6. Add tracker rows through TSV files in `batch/tracker-additions/`, then run `node merge-tracker.mjs`.

Tracker integrity:

- Do not add new rows directly to `data/applications.md`.
- Updating existing rows is allowed.
- Valid statuses come from `templates/states.yml`.
- After batch evaluations, run `node merge-tracker.mjs`.
- Use `node verify-pipeline.mjs` for health checks.

PDF generation:

- `generate-pdf.mjs` renders HTML to PDF with Playwright.
- `templates/cv-template.html` controls visual structure.
- `fonts/` stores self-hosted fonts used by the template.

Portal scanning:

- `scan.mjs` reads `portals.yml`.
- `data/scan-history.tsv` is the dedup history.
- Scanning should discover opportunities, not spam applications.

Dashboard:

- Go code lives in `dashboard/`.
- Run dashboard tests from `dashboard/` with `go test ./...`.
- The dashboard reads pipeline data; it should not redefine tracker states outside `templates/states.yml`.

## Ethical Boundary

This system is for quality, not mass application spam. Never submit an application without the user's final review. If a role scores below 4.0/5, recommend against applying unless the user explicitly overrides the recommendation.

## Verification Commands

Use the narrowest useful check:

```bash
node verify-pipeline.mjs
node test-all.mjs
node doctor.mjs
node cv-sync-check.mjs
```

For dashboard changes:

```bash
cd dashboard
go test ./...
```

## Git Notes

This working copy is intentionally private and may include personal data and generated artifacts. Do not assume files are safe to publish publicly. Before public release, remove or re-ignore user-layer data, generated outputs, browser snapshots, and dependency folders such as `node_modules/`.
