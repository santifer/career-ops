---
name: career-ops
description: Run the local career-ops job search command center from Codex. Use when the user types `/career-ops`, asks to evaluate a job/JD, process `data/pipeline.md`, scan for jobs, generate tailored resumes/PDFs, track applications, prepare interviews, draft outreach/follow-ups, or otherwise wants Codex to operate the career-ops project.
---

# Career-Ops For Codex

Treat `/career-ops` as a chat command, not a shell command.

When the user message starts with `/career-ops`, strip that prefix and route the remaining text. Also trigger this skill when the user says "run career-ops", "career-ops pipeline", "evaluate this JD with career-ops", or similar.

## Project Root

If the current directory is not the career-ops repo, locate it by checking for `AGENTS.md`, `package.json`, `modes/`, and `data/`. Use the discovered repository root for all relative paths.

## Startup Checks

At the start of a career-ops request:

1. Read `AGENTS.md` for the data contract and current workflow rules.
2. Ensure these files exist: `cv.md`, `config/profile.yml`, `portals.yml`, `data/applications.md`.
3. If `modes/_profile.md` is missing, copy `modes/_profile.template.md` to `modes/_profile.md`.
4. Run `node update-system.mjs check`; only mention it if an update is available.
5. Use `node doctor.mjs` when setup looks suspicious.

Never put user-specific profile content in system-layer mode files. Put it in `config/profile.yml`, `modes/_profile.md`, `cv.md`, `article-digest.md`, `portals.yml`, or `data/*`.

## Command Routing

Route the argument after `/career-ops`:

| Input | Mode |
|---|---|
| empty | discovery |
| JD text or a job URL | auto-pipeline |
| `pipeline` | pipeline |
| `scan` | scan |
| `oferta` or `evaluate` | oferta |
| `ofertas` or `compare` | ofertas |
| `pdf` | pdf |
| `tracker` | tracker |
| `apply` | apply |
| `contacto` or `outreach` | contacto |
| `deep` | deep |
| `interview-prep` | interview-prep |
| `training` | training |
| `project` | project |
| `batch` | batch |
| `patterns` | patterns |
| `followup` | followup |

If the argument is not a known mode but contains JD signals such as a URL, responsibilities, requirements, qualifications, about the role, company, or role title, run `auto-pipeline`.

## Context Loading

For `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, and `batch`, read:

- `modes/_shared.md`
- `modes/_profile.md` if present
- `modes/{mode}.md` or `modes/auto-pipeline.md`
- `cv.md`
- `config/profile.yml`

For `tracker`, `deep`, `interview-prep`, `training`, `project`, `patterns`, and `followup`, read the relevant `modes/{mode}.md` plus user context files as needed.

## Discovery Response

If no argument is provided, show:

```text
career-ops -- Codex Command Center

/career-ops {JD or URL}       evaluate + report + optional PDF + tracker
/career-ops pipeline          process pending URLs from data/pipeline.md
/career-ops scan              discover new jobs and add them to pipeline
/career-ops tracker           show application status
/career-ops pdf               generate a tailored resume PDF
/career-ops apply             help fill an application, stop before submit
/career-ops interview-prep    create company-specific interview prep
/career-ops deep              research a company
/career-ops contacto          draft outreach messages
/career-ops followup          check follow-up cadence and draft messages
```

## Execution Rules

- In Codex chat, `/career-ops` is interpreted by the agent. Do not try to run it as a PowerShell command.
- Use project scripts for deterministic checks: `npm run doctor`, `npm run verify`, `npm run sync-check`, `npm run scan`, `node merge-tracker.mjs`.
- `npm run scan` is API-oriented and may miss job boards that do not expose supported structured APIs. For those sources, use web research and append vetted results to `data/pipeline.md`.
- For job liveness, prefer a real browser/Playwright when available. If using web search only, mark verification as unconfirmed.
- Never submit applications for the user. Draft, prepare, and stop before final submit.
- For new tracker entries, follow `AGENTS.md`: write TSV files into `batch/tracker-additions/`, then run `node merge-tracker.mjs`.
- After changing tracker data, run `npm run verify`.

## Headless Codex Usage

For batch-style terminal use:

```powershell
cd path\to\career-ops
codex exec "Use the career-ops skill. Run /career-ops pipeline and process data/pipeline.md."
```
