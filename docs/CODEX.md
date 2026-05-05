# Codex CLI Setup

Career-Ops supports Codex CLI through the root `AGENTS.md` file and the
repo-local `codex-career-ops.mjs` helper. Codex uses the same checked-in mode
files, templates, tracker flow, and scripts as Claude Code, Gemini CLI, and
OpenCode.

## Prerequisites

- [Codex CLI](https://help.openai.com/en/articles/11096431-openai-codex-getting-started) installed and authenticated
- Node.js 18+
- Playwright Chromium installed for PDF generation and reliable job verification
- Go 1.21+ if you want the TUI dashboard

## Install

```bash
npm install
npx playwright install chromium
npm run doctor
```

## Interactive Codex

You can start Codex directly in the repo. Codex clients that read project
instructions automatically should load `AGENTS.md`, which routes to
`CLAUDE.md` and the shared `modes/*.md` files.

```bash
codex -C .
```

Good starting prompts:

```text
Evaluate this job URL with Career-Ops and run the full pipeline.
Scan my configured portals for new roles that match my profile.
Generate the tailored ATS PDF for this role using Career-Ops.
```

## Command Helper

For repeatable CLI usage, use the repo-local helper:

```bash
npm run codex --                 # show Career-Ops command menu
npm run codex -- scan            # scan configured portals
npm run codex -- evaluate --file ./jds/example.txt
npm run codex -- "https://example.com/jobs/role"
npm run codex -- pdf --file ./jds/example.txt
```

To inspect the resolved prompt without calling Codex:

```bash
npm run codex:prompt -- scan
npm run codex:prompt -- --file ./jds/example.txt
```

The helper embeds only project instructions and mode files in the prompt. It
lists user-layer files for Codex to read as needed, but it does not dump your CV
or tracker into `--print-prompt` output.

## Command Map

| Codex helper | Shared mode |
|--------------|-------------|
| `npm run codex -- {JD or URL}` | `modes/_shared.md` + `modes/auto-pipeline.md` |
| `npm run codex -- evaluate` | `modes/_shared.md` + `modes/oferta.md` |
| `npm run codex -- compare` | `modes/_shared.md` + `modes/ofertas.md` |
| `npm run codex -- contact` | `modes/_shared.md` + `modes/contacto.md` |
| `npm run codex -- scan` | `modes/_shared.md` + `modes/scan.md` |
| `npm run codex -- pipeline` | `modes/_shared.md` + `modes/pipeline.md` |
| `npm run codex -- pdf` | `modes/_shared.md` + `modes/pdf.md` |
| `npm run codex -- latex` | `modes/_shared.md` + `modes/latex.md` |
| `npm run codex -- apply` | `modes/_shared.md` + `modes/apply.md` |
| `npm run codex -- batch` | `modes/_shared.md` + `modes/batch.md` |
| `npm run codex -- tracker` | `modes/tracker.md` |
| `npm run codex -- deep` | `modes/deep.md` |
| `npm run codex -- training` | `modes/training.md` |
| `npm run codex -- project` | `modes/project.md` |
| `npm run codex -- patterns` | `modes/patterns.md` |
| `npm run codex -- followup` | `modes/followup.md` |
| `npm run codex -- interview-prep` | `modes/interview-prep.md` |

English aliases like `evaluate`, `compare`, and `contact` route to the older
mode names `oferta`, `ofertas`, and `contacto`.

## Batch Processing

Claude remains the default batch worker for backward compatibility:

```bash
./batch/batch-runner.sh
```

Use Codex workers with:

```bash
npm run batch:codex -- --dry-run
npm run batch:codex -- --parallel 2
```

Both agents receive the same resolved `batch/batch-prompt.md` content and write
the same reports, PDFs, logs, batch state, and tracker TSV additions.

## Approval And Sandbox Notes

The command helper runs `codex exec -C <repo>` with the generated prompt. The
batch runner uses `codex exec -C <repo> --sandbox workspace-write -` for worker
runs so Codex can write reports, PDFs, and tracker additions inside the repo.

For interactive work, choose the Codex approval and sandbox settings that match
your risk tolerance. Career-Ops should never submit an application for you; it
can draft answers, fill forms with review, generate artifacts, and then stop.

## Verification

```bash
npm run codex:prompt -- scan
bash -n batch/batch-runner.sh
npm run doctor
npm run verify
```

The key point: Codex support is additive. It routes into the existing
Career-Ops modes and scripts rather than introducing a parallel automation
layer.
