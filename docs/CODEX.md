# Codex Setup

Career-Ops supports Codex in two layers:

1. Root `AGENTS.md` for baseline repo behavior
2. A repo-local plugin under `plugins/career-ops/` for discoverable skills

## Prerequisites

- A Codex client that can work with project `AGENTS.md`
- Node.js 18+
- Playwright Chromium installed for PDF generation and reliable job verification
- Go 1.21+ if you want the TUI dashboard

## Install

```bash
npm install
npx playwright install chromium
```

## Repo-Local Plugin

The repo ships a local marketplace entry at `.agents/plugins/marketplace.json` and a plugin at `plugins/career-ops/`.

If your Codex client supports repo-local plugins, install or enable the `Career-Ops` plugin from the repo marketplace. If it does not, the repo still works through `AGENTS.md` plus the checked-in skill folders.

## Recommended Starting Prompts

- `Evaluate this job URL with Career-Ops and run the full pipeline.`
- `Scan my configured portals for new roles that match my profile.`
- `Generate the tailored ATS PDF for this role using Career-Ops.`

## Skill Map

| Codex skill | Purpose | Source files |
|-------------|---------|--------------|
| `career-ops-core` | Discovery, routing, onboarding, compare-offers fallback | `AGENTS.md`, `.claude/skills/career-ops/SKILL.md` |
| `career-ops-evaluate` | Raw JD/URL auto-pipeline, single evaluation, compare flow handoff | `modes/_shared.md`, `modes/auto-pipeline.md`, `modes/oferta.md`, `modes/ofertas.md` |
| `career-ops-scan` | Portal scanning | `modes/_shared.md`, `modes/scan.md` |
| `career-ops-pdf` | ATS PDF generation | `modes/_shared.md`, `modes/pdf.md`, `generate-pdf.mjs` |
| `career-ops-batch` | Batch evaluation | `modes/_shared.md`, `modes/batch.md`, `batch/batch-prompt.md`, `batch/batch-runner.sh` |
| `career-ops-tracker` | Tracker summaries and status updates | `modes/tracker.md`, `data/applications.md` |
| `career-ops-apply` | Form filling assistance with stop-before-submit | `modes/_shared.md`, `modes/apply.md` |
| `career-ops-pipeline` | Process queued URLs | `modes/_shared.md`, `modes/pipeline.md` |
| `career-ops-contact` | Outreach drafting | `modes/_shared.md`, `modes/contacto.md` |
| `career-ops-deep` | Deep company research | `modes/deep.md` |
| `career-ops-training` | Course/cert evaluation | `modes/training.md` |
| `career-ops-project` | Portfolio project evaluation | `modes/project.md` |

## Behavioral Rules

- Treat raw JD text or a job URL as the full auto-pipeline path unless the user explicitly asks for evaluation only.
- Keep all personalization in `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, or `portals.yml`.
- Never verify a job’s live status with generic web fetch when Playwright is available.
- Never submit an application for the user.
- Never add new tracker rows directly to `data/applications.md`; use the TSV addition flow and `merge-tracker.mjs`.

## Verification

```bash
npm run verify
npm run verify:codex
cd dashboard && go build ./...
```
