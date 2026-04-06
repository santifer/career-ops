# Career-Ops -- Canonical Agent Instructions

This file is the vendor-neutral source of truth for agent behavior in this repository.

- `CLAUDE.md` is the Claude Code wrapper.
- `GEMINI.md` is the Gemini CLI wrapper.
- `.github/copilot-instructions.md` is the GitHub Copilot wrapper.
- Agent-specific files should inherit this document, not diverge from it.

## What this repo is

Career-Ops is an AI-assisted job-search command center. It helps the candidate:

- evaluate job offers with a structured score
- tailor ATS-friendly CVs and PDFs
- scan portals for new roles
- track applications in one pipeline
- prepare interview stories and application answers

The valuable core of the system is portable:

- prompt files in `modes/`
- scripts in `.mjs`
- Markdown/YAML/TSV data files
- HTML CV template in `templates/`

## First-run onboarding

Before doing anything else, silently check whether the basics exist:

1. `cv.md`
2. `config/profile.yml`
3. `portals.yml`

If any are missing, switch into onboarding mode.

### 1. CV (required)
If `cv.md` is missing, ask the user for one of:
- their CV pasted into chat
- a LinkedIn/profile URL they want converted
- a short career summary to draft from

Create `cv.md` in clean Markdown with standard sections.

### 2. Profile (required)
If `config/profile.yml` is missing:
- copy from `config/profile.example.yml`
- gather the user’s name, email, location, timezone, target roles, and comp target
- fill the profile

### 3. Portals (recommended)
If `portals.yml` is missing:
- copy `templates/portals.example.yml` to `portals.yml`
- adapt search terms to the target roles when possible

### 4. Tracker
If `data/applications.md` does not exist, create:

```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

### 5. Ready
Once the basics exist, suggest the main entrypoints:
- paste a job URL or JD
- run the scan mode
- run the tracker mode
- customize archetypes, scoring, or tracked companies

## Personalization

The repository is designed to be customized by the active coding agent.

Common requests:
- change archetypes → edit `modes/_shared.md`
- translate or rewrite modes → edit `modes/`
- add companies or filters → edit `portals.yml`
- update profile → edit `config/profile.yml`
- change PDF design → edit `templates/cv-template.html`
- adjust scoring logic → edit `modes/_shared.md` and `batch/batch-prompt.md`

## Mode routing

| User intent | Mode |
|-------------|------|
| paste JD text or a job URL | `auto-pipeline` |
| evaluate one offer | `oferta` |
| compare offers | `ofertas` |
| LinkedIn outreach | `contacto` |
| deep company research | `deep` |
| generate PDF | `pdf` |
| evaluate course/cert | `training` |
| evaluate project | `project` |
| check application status | `tracker` |
| fill an application | `apply` |
| scan portals | `scan` |
| process pending URLs | `pipeline` |
| batch evaluate offers | `batch` |

The router assets live in the skill wrappers and `modes/` files.

## Core sources of truth

Always read these before evaluating a role:
- `cv.md`
- `config/profile.yml`
- `article-digest.md` if present
- `modes/_shared.md`
- the relevant file in `modes/`

Rules:
- never hardcode candidate metrics
- never invent experience
- prefer `article-digest.md` over stale CV numbers when both exist

## Ethical use -- mandatory

This system is for quality, not spam.

- Never submit an application without explicit human review.
- Discourage low-fit applications.
- Prefer fewer, higher-fit applications.
- Respect recruiters’ time.

## Offer verification

Do not trust search snippets alone to decide whether a role is active.

Preferred order:
1. browser automation when available
2. HTTP fetch / static page extraction
3. web search as a fallback discovery layer

If the runtime lacks browser automation, mark verification as unconfirmed instead of pretending certainty.

## Batch and automation guidance

`batch/` contains the parallel worker flow.

Important rules:
- workers must be self-contained
- each evaluation should write a report, PDF status, and tracker addition
- after batch processing, merge tracker additions and verify the pipeline
- backend-specific commands belong in the runner, not in the business logic

## Pipeline integrity rules

1. Do not append new rows directly to `data/applications.md`.
2. Write tracker additions to `batch/tracker-additions/*.tsv`.
3. Use `merge-tracker.mjs` to merge them.
4. Every report must include `**URL:**` in the header.
5. Canonical statuses live in `templates/states.yml`.

## Stack and conventions

- Node.js `.mjs` scripts
- Playwright for PDF generation and browser-heavy flows
- Markdown/YAML/TSV for data
- Go dashboard in `dashboard/`

Conventions:
- reports: `{###}-{company-slug}-{YYYY-MM-DD}.md`
- PDFs: `cv-candidate-{company-slug}-{YYYY-MM-DD}.pdf`
- tracker TSVs: `batch/tracker-additions/{id}.tsv`

## Verification

Before claiming completion:
- run relevant script checks
- inspect output, not just exit codes
- call out remaining gaps honestly
