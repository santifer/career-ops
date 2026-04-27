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

Hyper-personalized CV flow (`/headhunter`):

The skill `/headhunter` orquestra um time de 3 subagents (`vaga-analyst`, `cv-strategist`, `recruiter-reviewer`) com perspectiva de recrutador para gerar CV ATS-otimizado a partir de uma vaga específica. Vive em `.claude/skills/headhunter/SKILL.md`. Reaproveita `modes/pdf.md` na Fase 5 para a geração final do PDF. Princípio operacional: realçar conteúdo real do `cv.md` sem inventar — se a vaga pede skill que o candidato não tem, o sistema admite o gap.

Fluxo: pré-flight (verifica `cv.md`, `modes/pdf.md`, `.claude/references/recruiter-lens.md`) → modelagem do recrutador → análise da vaga → blueprint de personalização → crítica do recrutador (GO/REVISE/STOP) → geração do PDF via `modes/pdf.md` → relatório consolidado.

Comandos granulares para uso cirúrgico de cada agent isolado: `/cv-analyze` (só decodifica vaga), `/cv-strategy` (só blueprint), `/cv-recruiter-check` (só auditoria de CV existente). O comando legado `/tailor-cv` é alias da skill `/headhunter`.

Artefatos persistidos em `output/tailor-runs/{YYYY-MM-DD}-{slug-empresa}/` para auditoria local.

Bases de conhecimento consultadas pelos 3 agents: `.claude/references/cv-playbook-2026.md` (melhores práticas Harvard MCS / Jobscan / etc) e `.claude/references/recruiter-lens.md` (filtro mental do recrutador segmentado por nível e família funcional — Controller, Consolidation, FP&A, Financeiro).

Tracker integrity:

- Do not add new rows directly to `data/applications.md`.
- Updating existing rows is allowed.
- Valid statuses come from `templates/states.yml`.
- After batch evaluations, run `node merge-tracker.mjs`.
- Use `node verify-pipeline.mjs` for health checks.

Learning loop (`/career-ops reflect`, `correct`, `learn-now`):

- The system closes the loop between predicted score and real outcome.
- `lib/learn/scoring-parser.mjs` reads `data/applications.md` + `reports/`, applies `lib/learn/inference-rules.yml`, and appends events to `data/learn/scoring-events.jsonl` (gitignored).
- Parser is idempotent: SHA-256 hash of tracker as short-circuit, delta-based via `processed_keys` set. Re-running emits 0 events when nothing changed.
- `/career-ops reflect` runs `lib/learn/reflect-analyzer.mjs` (quórum ≥5 new events; bypass with `--force`), groups by `archetype × score bucket`, proposes adjustments via `AskUserQuestion`. Each approved adjustment is one Git commit on `data/scoring-calibration.yml` (User layer, committed). Memorize in `~/.claude/projects/D--Career-Ops/memory/scoring-learnings.md`.
- `/career-ops correct <report_id> <outcome> [reason]` writes a manual override event without touching the tracker.
- `modes/oferta.md` Passo 0.5 reads `data/scoring-calibration.yml` and includes `**Calibrações ativas:** N` in every report header.
- Schema reserves `loop_type` for future loops (recruiter-lens, archetype, CV variation, scan).

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
- The browser cockpit lives in `dashboard/cockpit/` and serves static HTML/CSS/JS without a frontend build step.
- Auto Mode uses `dashboard/internal/cockpit` run state plus the local Playwright worker in `workers/browser-worker.mjs`.
- Local Auto Mode UX should prefer the one-click worker launcher in `/api/local-worker/status`, `/api/local-worker/start`, and `/api/local-worker/stop`. These endpoints are local-only, require an authenticated cockpit session, and must only accept loopback requests.
- The local worker credential is server/process-only. Never expose pairing tokens or worker credentials in static JS, HTML, browser storage, URLs, copied commands, screenshots, or logs.
- Hosted cockpit mode cannot start a process on the user's computer. It must show an explicit unsupported/manual fallback state instead of pretending the browser will open automatically.
- The manual pairing flow under `/api/worker/pairing-token` and `/api/worker/register` remains an advanced fallback for hosted mode or launcher failures.
- Worker actions must remain observable through worker claim, heartbeat, current URL, action log, observed fields, and review gates.

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
