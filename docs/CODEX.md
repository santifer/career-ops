# Codex Setup

Career-Ops supports Codex through the root `AGENTS.md` file.

If your Codex client reads project instructions automatically, `AGENTS.md`
is enough for routing and behavior. Codex should reuse the same checked-in
mode files, templates, tracker flow, and scripts that already power the
Claude workflow.

For repo-scoped Codex usage, this repo exposes Career-Ops as a repo skill:

- Skill path: `.agents/skills/career-ops/SKILL.md`

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

## Recommended Starting Prompts

- `Evaluate this job URL with Career-Ops and run the full pipeline.`
- `Scan my configured portals for new roles that match my profile.`
- `Generate the tailored ATS PDF for this role using Career-Ops.`

## Routing Map

| User intent | Files Codex should read |
|-------------|-------------------------|
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

The key point: Codex support is additive. It should route into the existing
Career-Ops modes and scripts rather than introducing a parallel automation
layer.

## Skill Discovery

Codex's official docs recommend direct skill folders for local authoring and
repo-scoped workflows. In this repo, that means launching Codex from the repo
so it can see `.agents/skills/career-ops/SKILL.md`.

Use Career-Ops through the skill system:

- `$career-ops https://company.example/job-posting`
- `$career-ops tracker`
- `$career-ops pdf`
- `Evaluate this job URL with Career-Ops and run the full pipeline.`

Codex docs also describe explicit skill invocation via `/skills` or `$`, and
say enabled skills can appear in the `/` menu. The exact UI surface still
depends on the client build, so if `career-ops` does not appear in the `/`
menu, invoke it directly with `$career-ops` or ask in plain language.

## Behavioral Rules

- Treat raw JD text or a job URL as the full auto-pipeline path unless the user explicitly asks for evaluation only.
- Keep all personalization in `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, or `portals.yml`.
- Never verify a job’s live status with generic web fetch when Playwright is available.
- Never submit an application for the user.
- Never add new tracker rows directly to `data/applications.md`; use the TSV addition flow and `merge-tracker.mjs`.

## Verification

```bash
npm run verify

# optional dashboard build
cd dashboard && go build ./...
```
