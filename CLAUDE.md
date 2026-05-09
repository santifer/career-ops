# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

<!--
The line above imports the canonical agent guide. AGENTS.md is shared across
all AI coding CLIs (Claude, Codex, Gemini, OpenCode, Qwen, Copilot) and is the
source of truth for: data contract, modes, scoring, onboarding, headless/batch
mode, pipeline integrity, and ethical use. Read it before doing real work.

Everything below is a Claude-Code-specific quick reference and only adds what
is not already in AGENTS.md.
-->

## Repo orientation

The actual project lives in [career-ops/](career-ops/), not the parent dir. All paths in AGENTS.md are relative to that subdirectory — `cd career-ops` (or operate with absolute paths) before running scripts.

## Common commands

All scripts are Node `.mjs` modules exposed via `npm run`. Run from `career-ops/`:

| Command | Purpose |
|---|---|
| `npm run doctor` | Validate setup (Node ≥18, Playwright chromium, required user files). Run first on a fresh checkout. |
| `npm run scan` | Zero-token portal scanner (hits Greenhouse/Ashby/Lever APIs directly). |
| `npm run verify` | Pipeline integrity check on `data/applications.md` (statuses, dupes, links). |
| `npm run merge` / `... -- --dry-run` / `... -- --verify` | Merge `batch/tracker-additions/*.tsv` into the tracker. |
| `npm run normalize` / `npm run dedup` | Fix non-canonical statuses / remove duplicate rows. Both create `.bak`. |
| `npm run pdf -- input.html output.pdf [--format=a4\|letter]` | Render HTML CV to ATS-parseable PDF. |
| `npm run sync-check` | Validate cv.md / profile.yml consistency, no hardcoded metrics. |
| `npm run liveness -- <url>...` / `... --file urls.txt` | Check whether job URLs are still active. |
| `npm run update:check` / `npm run update` / `npm run rollback` | Self-update against upstream (system-layer files only). |

Test suite (run before any PR — CI runs `--quick`):

```bash
node test-all.mjs          # full suite (includes dashboard build)
node test-all.mjs --quick  # skip Go build; matches CI
```

There is no single-test runner — `test-all.mjs` is a sequential script of ~63 checks (syntax, scripts, data contract, paths). To iterate on one area, comment out the unrelated sections locally or run the underlying script directly (e.g. `node verify-pipeline.mjs`).

Dashboard (Go TUI, separate module):

```bash
cd dashboard && go build -o career-dashboard . && ./career-dashboard --path ..
```

## Architecture in one screen

```
JD text/URL ──► archetype detect ──► A–F evaluation (reads cv.md + article-digest.md + _profile.md)
                                          │
                                          ├─► reports/{NNN}-{slug}-{date}.md
                                          ├─► output/cv-...-{slug}-{date}.pdf  (generate-pdf.mjs)
                                          └─► batch/tracker-additions/{NNN}-{slug}.tsv
                                                  │
                                          merge-tracker.mjs ──► data/applications.md
```

- **Two layers, hard rule:** `cv.md`, `config/profile.yml`, `modes/_profile.md`, `data/*`, `reports/*`, `output/*`, `portals.yml` are the **user layer** — never edited by the update process. Everything in `modes/` (except `_profile.md`), all `*.mjs`, `templates/`, `dashboard/`, `batch/` (except your TSVs) are **system layer** — replaced on update. See [DATA_CONTRACT.md](career-ops/DATA_CONTRACT.md). When personalizing, always write to the user layer.
- **Modes are markdown prompts, not code.** [modes/_shared.md](career-ops/modes/_shared.md) holds scoring rules; per-mode files (`oferta.md`, `scan.md`, `batch.md`, …) are the per-skill instructions Claude reads when invoked. The slash command router lives in [.claude/skills/career-ops/SKILL.md](career-ops/.claude/skills/career-ops/SKILL.md).
- **Tracker is append-only via TSV.** Never hand-add rows to `data/applications.md` — write a 9-column TSV in `batch/tracker-additions/` and let `merge-tracker.mjs` do the merge (it handles the column-order swap between TSV and the markdown table). You may edit existing rows to update status/notes.
- **Canonical statuses** live in [templates/states.yml](career-ops/templates/states.yml): `Evaluated`, `Applied`, `Responded`, `Interview`, `Offer`, `Rejected`, `Discarded`, `SKIP`. No bold, no dates, no extra text in the status column.
- **Reports** must include `**URL:**` and `**Legitimacy:** {tier}` headers and are numbered sequentially `{max+1}` zero-padded to 3 digits.

## Claude-Code-specific notes

- **Slash command:** `/career-ops [args]` is provided by [.claude/skills/career-ops/SKILL.md](career-ops/.claude/skills/career-ops/SKILL.md). Bare `/career-ops` shows discovery; `/career-ops <JD or URL>` triggers auto-pipeline; sub-commands match the modes table in AGENTS.md.
- **Headless / batch workers:** spawn with `claude -p "prompt"` (the row in AGENTS.md's "Headless / Batch Mode" table for Claude Code). [batch/batch-runner.sh](career-ops/batch/batch-runner.sh) already invokes this.
- **Offer verification uses Playwright, not WebFetch.** AGENTS.md mandates `browser_navigate` + `browser_snapshot` for liveness; only the headless batch worker may fall back to WebFetch and must mark the report `**Verification:** unconfirmed (batch mode)`.
- **Update prompt on first message:** AGENTS.md instructs running `node update-system.mjs check` silently each session and only surfacing the `update-available` case. Don't surface `up-to-date`, `dismissed`, `offline`, or `no-remote-version`.
- **Onboarding gate:** if `cv.md`, `config/profile.yml`, `modes/_profile.md`, or `portals.yml` are missing, AGENTS.md requires entering onboarding mode before any evaluation/scan. `modes/_profile.md` should be silently copied from `modes/_profile.template.md` if absent.
