# Copilot CLI Setup

Career-Ops supports GitHub Copilot CLI through `.github/copilot-instructions.md`.

If your Copilot CLI reads project instructions automatically,
`.github/copilot-instructions.md` is enough for routing and behavior.
Copilot CLI should reuse the same checked-in mode files, templates, tracker
flow, and scripts that already power the Claude workflow.

## Prerequisites

- [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) installed and configured
- Node.js 18+
- Playwright Chromium installed for PDF generation and reliable job verification
- Go 1.21+ if you want the TUI dashboard

## Install

```bash
npm install
npx playwright install chromium
```

## Recommended Starting Prompts

Copilot CLI uses natural language instead of slash commands:

- `Evaluate this job URL with Career-Ops and run the full pipeline.`
- `Scan my configured portals for new roles that match my profile.`
- `Generate the tailored ATS PDF for this role using Career-Ops.`
- `Compare these three offers and rank them.`
- `Show my application tracker status.`

## Routing Map

| User intent | Files Copilot CLI should read |
|-------------|-------------------------------|
| Raw JD text or job URL | `modes/_shared.md` + `modes/auto-pipeline.md` |
| Single evaluation only | `modes/_shared.md` + `modes/oferta.md` |
| Multiple offers | `modes/_shared.md` + `modes/ofertas.md` |
| Portal scan | `modes/_shared.md` + `modes/scan.md` |
| PDF generation | `modes/_shared.md` + `modes/pdf.md` |
| Live application help | `modes/_shared.md` + `modes/apply.md` |
| Pipeline inbox processing | `modes/_shared.md` + `modes/pipeline.md` |
| Tracker status | `modes/tracker.md` |
| Deep company research | `modes/deep.md` |
| Training / certification review | `modes/training.md` |
| Project evaluation | `modes/project.md` |
| LinkedIn outreach | `modes/_shared.md` + `modes/contacto.md` |
| Interview prep | `modes/_shared.md` + `modes/interview-prep.md` |
| Batch evaluation | `modes/_shared.md` + `modes/batch.md` |
| Rejection pattern analysis | `modes/_shared.md` + `modes/patterns.md` |
| Follow-up tracking | `modes/_shared.md` + `modes/followup.md` |

## Behavioral Rules

- Treat raw JD text or a job URL as the full auto-pipeline path unless the user explicitly asks for evaluation only.
- Keep all personalization in `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, or `portals.yml`.
- Never verify a job's live status with generic web fetch when browser DevTools are available.
- Never submit an application for the user.
- Never add new tracker rows directly to `data/applications.md`; use the TSV addition flow and `merge-tracker.mjs`.

## Verification

```bash
npm run verify

# optional dashboard build
cd dashboard && go build ./...
```
