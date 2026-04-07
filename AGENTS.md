# Career-Ops for Codex

## What This Repo Is

Career-Ops is a file-based, agent-driven job search system. It evaluates offers, generates tailored PDFs, scans portals, processes batches, and tracks everything in Markdown, YAML, TSV, and HTML templates.

Codex support is additive. Do not replace the existing Node, Playwright, Go, Markdown, YAML, TSV, or Claude workflows with parallel logic. Use the checked-in files and scripts that already power the repo.

## Data Contract

Read `DATA_CONTRACT.md` before changing anything.

### User layer

These files are user-owned and must never be overwritten by system updates:

- `cv.md`
- `config/profile.yml`
- `modes/_profile.md`
- `article-digest.md`
- `interview-prep/story-bank.md`
- `portals.yml`
- `data/*`
- `reports/*`
- `output/*`
- `jds/*`

### System layer

These files can be updated from upstream:

- `CLAUDE.md`
- `AGENTS.md`
- `modes/_shared.md` and the system mode files
- `*.mjs`
- `batch/*`
- `dashboard/*`
- `templates/*`
- `fonts/*`
- `.claude/skills/*`
- `plugins/career-ops/*`
- `.agents/plugins/marketplace.json`
- `docs/*`
- `VERSION`
- `DATA_CONTRACT.md`

### Rule

When the user asks to customize archetypes, narrative, deal-breakers, targeting, negotiation style, location policy, or comp targets, write to `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, or `portals.yml`.

Never put user-specific customization into `modes/_shared.md`.

## Update Check

On the first message of each session, run this silently:

```bash
node update-system.mjs check
```

If the JSON says `update-available`, tell the user:

> career-ops update available (v{local} → v{remote}). Your data will not be touched. Want me to update?

If the result is `up-to-date`, `dismissed`, or `offline`, say nothing.

Use:

- `node update-system.mjs apply`
- `node update-system.mjs rollback`
- `node update-system.mjs dismiss`

## First Run Onboarding

Before doing anything else, silently check for:

1. `cv.md`
2. `config/profile.yml`
3. `modes/_profile.md`
4. `portals.yml`

If `modes/_profile.md` is missing, create it from `modes/_profile.template.md`.

If any required file is missing, do onboarding before evaluations, scans, or tracker work:

1. Create `cv.md` from pasted CV, LinkedIn info, or user-provided experience.
2. Copy `config/profile.example.yml` to `config/profile.yml` and fill it with the user’s details.
3. Copy `templates/portals.example.yml` to `portals.yml` when portal scanning is needed.
4. Create `data/applications.md` if it does not exist.
5. Store personalization in `config/profile.yml`, `modes/_profile.md`, and `article-digest.md`, not in system prompts.

Once the basics exist, point the user to:

- raw JD or job URL paste for the full auto-pipeline
- the plugin skills
- `docs/CODEX.md`

## Routing

### Default behavior

- Raw JD text or a job URL means full auto-pipeline.
- A request for a single evaluation means `modes/oferta.md`.
- A request to compare multiple offers means `modes/ofertas.md`.
- A request to process queued URLs means `modes/pipeline.md`.
- A request to scan portals means `modes/scan.md`.
- A request to generate a CV/PDF means `modes/pdf.md`.
- A request to fill an application means `modes/apply.md`.
- A request for outreach means `modes/contacto.md`.
- A request for company research means `modes/deep.md`.
- A request for training or certification evaluation means `modes/training.md`.
- A request for project evaluation means `modes/project.md`.
- A request for application status means `modes/tracker.md`.
- A request for batch evaluation means `modes/batch.md`.

### Files to load

- For `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, and `batch`: read `modes/_shared.md` plus the mode file.
- For `tracker`, `deep`, `training`, and `project`: read only the mode file.

Repo-local Codex skills under `plugins/career-ops/skills/` mirror this routing and should be preferred when they match the request.

## Ethical Use

- Never submit an application on the user’s behalf.
- Stop before the final submit/send/apply click.
- Strongly discourage low-fit applications.
- Prefer fewer, better applications over volume.
- Treat recruiter time and candidate time as scarce.

## Offer Verification

Never use generic web search or fetch to verify whether a role is active when Playwright is available.

Use Playwright to:

1. navigate to the URL
2. inspect the rendered page
3. confirm the JD body and apply action still exist

If Playwright is unavailable in a headless batch-style path, mark the verification as unconfirmed instead of pretending the role is live.

## Pipeline Integrity

- Never add new tracker rows directly to `data/applications.md`.
- For new evaluations, write TSV additions in `batch/tracker-additions/` and merge them with `node merge-tracker.mjs`.
- You may update existing tracker rows in `data/applications.md`.
- Every report must include `**URL:**` in the header.
- Status values must stay canonical per `templates/states.yml`.
- After each batch of evaluations, run `node merge-tracker.mjs`.
- Health check with `node verify-pipeline.mjs`.
- Normalize statuses with `node normalize-statuses.mjs`.
- Deduplicate with `node dedup-tracker.mjs`.

## Tooling

- Keep `npm` as the primary package manager.
- Reuse the checked-in Node scripts instead of inventing parallel automation.
- Build the dashboard from `dashboard/` with Go when needed.
- Use `npm run verify:codex` to validate the Codex layer and Claude/Codex parity.
