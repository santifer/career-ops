# OpenCode Integration

Career-ops works with [OpenCode](https://opencode.ai) out of the box. No translation layer needed — the AI reads the Spanish mode files and responds in your language.

## How It Works

OpenCode reads `AGENTS.md` at the project root automatically. That file contains all the conventions, commands, code style, and ethical guidelines for career-ops.

The `.opencode/` directory adds two things:

- **`.opencode/skills/career-ops/SKILL.md`** — A skill that OpenCode discovers and loads on-demand. It routes user input to the right mode (offer evaluation, scanning, PDF generation, etc.).
- **`.opencode/commands/*.md`** — Thin wrappers (3-5 lines each) that delegate to the actual mode files in `modes/`. No translations — just "read this file and follow the instructions."

## Setup

1. Clone or fork the repo
2. Open it in OpenCode — `AGENTS.md` is loaded automatically
3. Follow the onboarding flow in `AGENTS.md` (CV → Profile → Portals → Tracker)

## Commands

Once set up, use these in OpenCode's TUI:

```
/career-ops              → Discovery menu
/career-ops {JD or URL}  → Full pipeline: evaluate + report + PDF + tracker
/career-ops offer        → Evaluation only (A-F scoring)
/career-ops scan         → Scan job portals for new offers
/career-ops pdf          → Generate ATS-optimized CV
/career-ops pipeline     → Process pending URLs from inbox
/career-ops tracker      → View application status
```

## Architecture

```
AGENTS.md                          ← Always loaded (rules, conventions, onboarding)
.opencode/skills/career-ops/
  SKILL.md                         ← Router: determines mode from user input
.opencode/commands/
  career-ops.md                    ← Discovery menu
  offer.md                         → delegates to modes/oferta.md
  scan.md                          → delegates to modes/scan.md
  pdf.md                           → delegates to modes/pdf.md
  auto-pipeline.md                 → delegates to modes/auto-pipeline.md
modes/                             ← Actual workflow instructions (source of truth)
```

The `modes/` files are the source of truth for all workflows. Commands are just pointers. This means:

- **One change propagates everywhere** — edit `modes/oferta.md` once, all CLI integrations pick it up
- **No translation drift** — the AI reads Spanish instructions and outputs in the user's language
- **Easy to add new CLI integrations** — just add a thin instruction layer, no need to duplicate logic

## Why This Pattern

Career-ops is CLI-agnostic. The engine (modes, scripts, templates) works the same regardless of which AI coding agent you use. Each CLI only needs a thin instruction layer that routes to the existing files.

- **Codex:** `AGENTS.md` (one file with routing rules)
- **OpenCode:** `AGENTS.md` + `.opencode/skills/` + `.opencode/commands/` (thin wrappers)
- **Future CLIs:** Same pattern — read `AGENTS.md`, route to `modes/`

English translations of the mode files are on the roadmap and will be done upstream, not per-CLI.
