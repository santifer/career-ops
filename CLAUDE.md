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
| `node apply-auto.mjs <url> <pdf> [opts]` | Server-side ATS form filler (Ashby/Greenhouse/Lever). Runs on CT 203. |
| `node browser-login.mjs [--profile=name]` | Interactive auth session with remote debugging for CT 203 headless browser. |

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

## Server-side application automation (CT 203)

Two scripts enable fully server-side job applications from Proxmox CT 203 — no MacBook involvement:

### `apply-auto.mjs` — ATS form filler

Fills ATS application forms, uploads resume/cover letter, and optionally submits. Reads candidate data from `config/profile.yml`.

```bash
node apply-auto.mjs <url> <pdf-path> [options]

Options:
  --cover-letter=path   Upload cover letter (PDF/DOCX/MD)
  --submit              Click submit after filling (default: pause for review)
  --screenshot=path     Save screenshot of filled form
  --auth=path           Load saved browser state (cookies) for authenticated sessions
```

**Supported platforms:**
| Platform | Detection | Strategy |
|----------|-----------|----------|
| Ashby | `jobs.ashbyhq.com` | Upload resume first (triggers parser autofill), wait for parser, then overwrite fields. Handles React comboboxes, Yes/No button pairs. |
| Greenhouse | `boards.greenhouse.io` or `grnhse_iframe` | Detects iframe embedding (e.g. Stripe). React-Select dropdowns via keyboard (ArrowDown → type → Enter). Scoped option search to avoid phone country selector pollution. |
| Stripe | `stripe.com/jobs` | Greenhouse-in-iframe variant. 20+ fields including custom dropdowns, checkboxes, file uploads. |
| Lever | `jobs.lever.co` | Standard form fill by field ID/name. |
| Generic | fallback | Best-effort label/placeholder/name matching. |

**Key implementation details:**
- React-Select dropdowns use keyboard interaction (not mouse events) because raw DOM events don't trigger React's synthetic event system
- `document.execCommand('insertText')` used for React input fields instead of `.value =` assignment
- Phone intl-tel-input country selectors (244 options) are excluded from option searches by scoping to `[id^="react-select-{inputId}-option"]`
- Ashby resume parser creates a race condition — script uploads first, waits for "Parsing" banner to disappear, then fills fields

### `browser-login.mjs` — Interactive auth session

Launches headless Chromium with remote debugging so you can log into sites (LinkedIn, etc.) from your MacBook via SSH tunnel. Saves cookies for `apply-auto.mjs --auth`.

```bash
node browser-login.mjs [--profile=name] [--port=9222] [--url=https://linkedin.com/login]

# Then from MacBook:
ssh -L 9222:localhost:9222 root@10.1.30.50
# Open http://localhost:9222 in Chrome → interact with remote browser
# Press Enter in terminal when done → saves to auth/{profile}-state.json
```

Saved state is loaded by `apply-auto.mjs --auth=auth/linkedin-state.json` for authenticated sessions (e.g. LinkedIn Easy Apply).

### Auto-apply pipeline

Two-tier automation — configured in `config/profile.yml` under `search:`:

| Tier | Trigger | Threshold | Config key |
|------|---------|-----------|------------|
| 1 — Auto-apply | Daily scan pipeline | score ≥ 4.5 | `auto_apply_threshold` |
| 2 — Telegram reply | Patrick replies "apply #N" to digest | score ≥ 4.0 | `apply_threshold` |

**Components:**

| File | Purpose |
|------|---------|
| `lib/telegram.mjs` | Shared Telegram Bot API helper (sendMessage, getUpdates, loadEnv) |
| `apply-orchestrator.mjs` | Shared apply pipeline: eval → CV → CL → apply-auto.mjs → tracker |
| `telegram-listener.mjs` | Long-polling listener for Telegram reply commands |
| `career-ops-listener.service` | systemd unit for the listener on CT 203 |

**Telegram commands** (reply to any bot message):
- `apply` — apply to highest-scoring unapplied job from latest digest
- `apply #3` — apply to job #3 from the digest
- `skip #3` — mark job #3 as skipped
- `status` — pipeline status summary
- `help` — list commands

**Data files** (gitignored, CT 203 only):
- `data/last-digest.json` — structured job list from latest notify-telegram.mjs send (maps "#N" → URL)
- `data/telegram-offset.txt` — last processed update_id for crash recovery

**Flow (daily cron):**
```
scan.mjs → auto-pipeline.mjs:
  ├─ evaluate via claude -p
  ├─ generate CV + CL for ≥ 4.0
  ├─ auto-apply via apply-orchestrator.mjs for ≥ 4.5
  ├─ merge tracker
  └─ send numbered Telegram digest (writes last-digest.json)

telegram-listener.mjs (always-on):
  ├─ "apply #N" → look up URL from last-digest.json → apply-orchestrator.mjs
  └─ "status" → pipeline summary
```

**Master switch:** `auto_apply_enabled: true` in profile.yml. Set to `false` to disable auto-apply but keep Telegram reply trigger. CLI overrides: `--auto-apply` / `--no-auto-apply` on auto-pipeline.mjs.

## Session continuity — read this first when picking up Patrick's fork

This fork has user-specific customizations that change defaults from the upstream career-ops project. **Read these before running any evaluation.**

### Hard rules that override the system

1. **Location is a HARD constraint** (added 2026-05-17, hardened EOD same day). Patrick is Denver-based with family; **not relocating**. The rule covers more than "no relocation" — it also covers **no required travel to non-Denver offices**, even if a role is tagged "Remote-Friendly (Travel-Required)." If a JD requires *any* cadence of office time at a non-Denver hub, it's a SKIP, score 1.0/5, regardless of comp or company tier. Even Anthropic ($405K+ base) was disqualified. See `feedback_location_policy.md` in memory + `modes/_profile.md` "Your Location Policy" section.

2. **Comp floor is $160K base USD.** If the JD lists a comp range and `max < $160K`, output a 1-sentence SKIP verdict — do NOT generate a full A-G evaluation. Token-wasteful otherwise. See `modes/_profile.md` "Your Comp Targets" section.

3. **Reports are in English.** The system-layer `modes/*.md` files were translated to English on 2026-05-17 (originally Spanish from upstream author). If `node update-system.mjs apply` is run, modes/ will revert to Spanish — re-apply translations from `project_careerops_english_modes.md` in memory, or override at write-time using the translation table in `modes/_profile.md` "Report Output Language" section.

### Patrick-specific workflow

- **MacBook destination for review artifacts**: `~/Documents/career-ops-2026-05-17/` (or roll forward by date). Push via `scp` to `patrick@10.1.1.134`. Mirror structure: `reports/`, `output/`, `cover-letters/`, `interview-prep/`, plus the tracker at the root.
- **Dual CV output**: produce BOTH the ATS-PDF (existing HTML/Playwright flow) AND a polished `.docx` via `anthropic-skills:docx` (skill is loaded, no install). Per `feedback_cv_output_format.md` in memory.
- **Telegram alerts**: career-ops scanner sends daily fits via `@career_ops_bot_bot` (token in `/opt/career-ops/.env` on LXC CT 203). Infra alerts via the openclaw bot. Don't confuse the two.
- **OpenRouter for LLM calls outside this session**: key at `~/.secrets/openrouter.txt` (mode 600). Default model `anthropic/claude-haiku-4.5` for cheap one-shot stuff (refresh-now, cybersec digest). See `reference_openrouter_key.md` in memory. **Patrick does NOT have an Anthropic API key** — Claude Max ≠ API access.

### Known bugs to work around

- **`merge-tracker.mjs` dedup is too aggressive.** When a new TSV's `company + significant-title-substring` overlaps an existing tracker row, it treats it as UPDATE not ADD. Workaround: verify `data/applications.md` diff after every merge; hand-edit if a row was unexpectedly overwritten. Hit on 2026-05-17 when adding Anthropic Application Security Engineer (#7) which got merged onto existing Staff+ Software Security Engineer (#5). See `feedback_merge_tracker_dedup_bug.md` in memory.
- **`scan.mjs` still writes Spanish section headers** (`## Pendientes` / `## Procesadas`) into `data/pipeline.md` even though `modes/*.md` is in English. System-layer script, not patched. Cosmetic only; doesn't break workflow.

### Where the scanner lives + how to refresh it

- Always-on scanner on LXC CT 203 at `10.1.30.50`, daily cron 07:00 MDT via `systemctl start career-scan.service`.
- Sync changes via: `scp $FILE root@10.1.30.11:/tmp/ && ssh root@10.1.30.11 "pct push 203 /tmp/$FILE /opt/career-ops/$RELATIVE_PATH"`
- Trigger a test scan: `ssh root@10.1.30.50 "systemctl start career-scan.service"` — completes in ~10s.

### Default workflow for picking up

1. Read `MEMORY.md` first (auto-loaded — has the index of all memory files).
2. Read `TODO.md` in repo root for the active session checklist.
3. Status of viable applications + open SKIPs is in `data/applications.md`.
