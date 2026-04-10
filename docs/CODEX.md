# Codex Setup

Career-Ops supports Codex through the root `AGENTS.md` file.

If your Codex client reads project instructions automatically, `AGENTS.md`
is enough for routing and behavior. Codex should reuse the same checked-in
mode files, templates, tracker flow, and scripts that already power the
Claude workflow.

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

## Usage

Career-Ops ships a runner script that bridges `.agents/` prompt files to the
Codex CLI. It reads the matching agent file, substitutes any arguments, and
invokes `codex` with the assembled prompt. If the Codex CLI is not installed,
it prints the prompt so you can paste it manually.

```bash
# show the command menu
node codex-runner.mjs

# scan portals for new offers
node codex-runner.mjs scan

# evaluate a job URL (full auto-pipeline)
node codex-runner.mjs evaluate "https://example.com/job/123"

# evaluate a local JD file
node codex-runner.mjs evaluate "$(cat jds/my-role.md)"

# generate ATS-optimized PDF
node codex-runner.mjs pdf

# check application tracker status
node codex-runner.mjs tracker
```

**npm shortcuts** (most common commands):

```bash
npm run codex              # show menu
npm run codex:scan
npm run codex:evaluate -- "https://example.com/job/123"
npm run codex:pdf
npm run codex:tracker
npm run codex:pipeline
npm run codex:patterns
npm run codex:followup
```

## Codex Commands

Individual agent files are available under `.agents/` and map 1-to-1 with
Claude Code commands:

| Agent file | Claude Code equivalent | Description |
|------------|------------------------|-------------|
| `.agents/career-ops.md` | `/career-ops` | Main router: show menu or auto-pipeline a JD/URL |
| `.agents/career-ops-evaluate.md` | `/career-ops oferta` | Evaluate job offer (A-F scoring, no auto PDF) |
| `.agents/career-ops-compare.md` | `/career-ops ofertas` | Compare and rank multiple offers |
| `.agents/career-ops-scan.md` | `/career-ops scan` | Scan job portals for new offers |
| `.agents/career-ops-pdf.md` | `/career-ops pdf` | Generate ATS-optimized CV PDF |
| `.agents/career-ops-pipeline.md` | `/career-ops pipeline` | Process pending URLs from `data/pipeline.md` |
| `.agents/career-ops-apply.md` | `/career-ops apply` | Live application assistant |
| `.agents/career-ops-tracker.md` | `/career-ops tracker` | Application status overview |
| `.agents/career-ops-contact.md` | `/career-ops contacto` | LinkedIn outreach: find contacts + draft message |
| `.agents/career-ops-deep.md` | `/career-ops deep` | Deep company research |
| `.agents/career-ops-batch.md` | `/career-ops batch` | Batch processing with parallel workers |
| `.agents/career-ops-training.md` | `/career-ops training` | Evaluate course/cert against goals |
| `.agents/career-ops-project.md` | `/career-ops project` | Evaluate portfolio project idea |
| `.agents/career-ops-patterns.md` | `/career-ops patterns` | Analyze rejection patterns and improve targeting |
| `.agents/career-ops-followup.md` | `/career-ops followup` | Follow-up cadence tracker: flag overdue, generate drafts |

## Limitations

Codex does not have a native skill-loading mechanism equivalent to Claude
Code's `/career-ops` slash commands. The `.agents/` files are prompt
templates — `codex-runner.mjs` is the glue layer that makes them callable
from the terminal.

Current known gaps vs. the Claude Code experience:

- **No auto-routing on file open.** Claude Code detects a pasted JD
  automatically; with Codex you need to run
  `node codex-runner.mjs evaluate "URL"` explicitly.
- **Playwright dependency.** PDF generation and live offer verification
  require `npx playwright install chromium`. These work the same as in
  Claude Code once installed.
- **Batch mode.** The `batch` command spawns parallel workers via
  `claude -p`. This is Claude-specific and will not work in a Codex
  session — use single evaluations instead.

## Example Session

```bash
$ npm run codex:scan

> career-ops@1.3.0 codex:scan
> node codex-runner.mjs scan

Scanning portals defined in portals.yml...
Checking 12 companies × 3 search queries...
Found 4 new offers not in scan-history.tsv:
  → Acme Corp — Staff AI Engineer
  → Beta Labs — Head of Applied AI
  → Gamma Inc — ML Platform Lead
  → Delta Co — AI Product Manager
Writing 4 entries to data/pipeline.md
Done. Run "node codex-runner.mjs pipeline" to evaluate them.
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
