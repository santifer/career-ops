# Career-Ops on Google Antigravity

Career-ops was originally built for Claude Code. This doc explains how to run the full `/career-ops` command set inside **Google Antigravity** using its native workflow system — no porting required, just copy the `.agents/` folder included in the repo.

> **Status:** parallel adapter. Existing Claude Code (`.claude/`) and OpenCode (`.opencode/`) setups are untouched. You can run any of the three.

## Prerequisites

- [Google Antigravity](https://antigravity.google) installed
- Node.js 20+ and Git (same as for the Claude Code flow)
- An active Antigravity subscription or API quota that exposes **Claude Opus 4.6** (or any capable reasoning model)

## One-time setup

```bash
# 1. Clone (or use your existing clone)
git clone https://github.com/santifer/career-ops.git
cd career-ops && npm install
npx playwright install chromium

# 2. Sanity check
npm run doctor

# 3. Configure
cp config/profile.example.yml config/profile.yml    # Edit
cp templates/portals.example.yml portals.yml         # Customize
# Create cv.md at project root
```

## Open in Antigravity

1. Open the `career-ops` folder in Antigravity.
2. In the Agent Manager, set the model to **Claude Opus 4.6** (or your preferred reasoning model).
3. The root-level `AGENTS.md` and the `.agents/` folder are loaded automatically — no priming prompt needed.

## Slash commands

Type `/` in the Agent Manager chat; you should see the full `career-ops*` set in the dropdown:

| Command | What it does |
|---|---|
| `/career-ops` | Discovery menu (shows all subcommands) |
| `/career-ops <paste JD or URL>` | Full auto-pipeline (evaluate + PDF + tracker) |
| `/career-ops-evaluate <JD>` | Evaluation only (A-G scoring, no PDF) |
| `/career-ops-pdf [report]` | Generate ATS-optimized CV PDF |
| `/career-ops-apply <JD>` | Draft application form answers |
| `/career-ops-scan [portal]` | Scan `portals.yml` for new openings |
| `/career-ops-batch <file>` | Parallel-evaluate N offers via Agent Manager |
| `/career-ops-deep <company>` | Deep-dive company research |
| `/career-ops-compare <JDs>` | Side-by-side offer comparison |
| `/career-ops-tracker [filter]` | View / manage pipeline state |
| `/career-ops-pipeline [op]` | Integrity checks (dedup / normalize / merge / liveness) |
| `/career-ops-contact <person>` | Draft intro / outreach |
| `/career-ops-training <gap>` | Learning plan for a skill gap |
| `/career-ops-project <idea>` | Scope a portfolio project |

Each workflow file lives in `.agents/workflows/` and is a thin router that loads the canonical mode definition from `modes/*.md` — the same mode files Claude Code and OpenCode use. One source of truth.

## How it maps to Antigravity's native concepts

| Antigravity concept | Career-ops implementation |
|---|---|
| `AGENTS.md` at project root | Existing file — points to `CLAUDE.md` for behavioural rules |
| `.agents/workflows/*.md` | Slash commands (13 files, one per `/career-ops*`) |
| `.agents/agents.md` | 5 personas used by `/career-ops-batch` Agent Manager spawns |
| `.agents/skills/*.md` | Not used — logic lives in `modes/` so all three CLIs share it |

## Differences from Claude Code

**Mostly identical, with two nuances:**

1. **Batch mode** uses Antigravity Agent Manager's parallel sub-agents instead of `claude -p` worker processes. Implementation is inside `.agents/workflows/career-ops-batch.md`.
2. **Modes remain in Spanish by default.** Ask the agent *"Translate the modes in `modes/` to English"* on first run if you prefer English. Your outputs can be English regardless — only the internal prompts are Spanish.

## Customization

- **Your CV** → `cv.md`
- **Your preferences** → `config/profile.yml` and `modes/_profile.md`
- **Your target companies** → `portals.yml`
- **Scoring tweaks** → `modes/_shared.md` (note: this file is auto-updatable on new releases — put personal overrides in `modes/_profile.md`)

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/career-ops` not in the `/` dropdown | Ensure `.agents/workflows/` is at project root, not nested. Restart Antigravity to rescan. |
| Modes not found when workflow runs | Check you ran `git clone` correctly — `modes/` must exist at the same level as `.agents/`. |
| PDF fails | `npx playwright install chromium` (the doctor script verifies this) |
| Batch creates 10 agents but each re-reads context from scratch | That's expected. If quota is tight, lower batch size to 3-5, or serialize instead via `/career-ops-evaluate` per JD. |
| Output is in Spanish when you wanted English | Ask: *"Respond in English for the rest of this session"* — or permanently translate `modes/*.md` once. |

## Ethical use

Same rules as the main project:

- **Never auto-submit** applications — workflows stop at "ready to apply"
- **Under 4.0/5** → recommend against applying
- **See `LEGAL_DISCLAIMER.md`** for the full ethical framing

Happy hunting.
