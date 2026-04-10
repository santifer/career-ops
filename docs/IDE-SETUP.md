# IDE Setup Guide (Cursor / Antigravity / Others)

Career-Ops works with any AI coding IDE that can read project files and run terminal commands. This guide covers setup for **Cursor**, **Antigravity**, and other IDE-based agents.

> For Claude Code CLI setup, see [SETUP.md](SETUP.md).

## Prerequisites

- Node.js 18+ (for PDF generation and utility scripts)
- (Optional) Go 1.21+ (for the dashboard TUI)
- An AI coding IDE: [Cursor](https://cursor.sh), [Antigravity](https://antigravity.dev), [Windsurf](https://windsurf.ai), or similar

## Quick Start (5 steps)

### 1. Clone and install

```bash
git clone https://github.com/santifer/career-ops.git
cd career-ops
npm install
npx playwright install chromium   # Required for PDF generation
```

### 2. Verify setup

```bash
npm run doctor                     # Validates all prerequisites
```

### 3. Open in your IDE

**Cursor:**
```bash
cursor .    # Or: File → Open Folder → career-ops
```
Cursor automatically loads `.cursorrules` — no extra config needed.

**Antigravity:**
Open the `career-ops` folder in Antigravity. On your first message, tell the agent:
> "Read INSTRUCTIONS.md for the project context."

The agent will load the system's rules, routing, and behavioral guidelines.

**Other IDEs (Windsurf, Cody, etc.):**
Point your IDE's project context to `INSTRUCTIONS.md`. This file contains all the rules and routing the agent needs.

### 4. Start the onboarding

Just say:
> "Set up career-ops for me"

The AI agent will check for missing files (`cv.md`, `config/profile.yml`, etc.) and walk you through setup interactively.

### 5. Start using

Once onboarded, just tell the agent what you need in natural language:

```
"Evaluate this job offer: https://boards.greenhouse.io/company/jobs/12345"
"Scan for new jobs matching my profile"
"Generate my CV for this role"
"Show my application tracker"
```

## Command Mapping: CLI → IDE

If you're coming from Claude Code CLI, here's how slash commands map to IDE usage:

| Claude Code CLI | What to say in your IDE |
|----------------|-------------------------|
| `/career-ops` | "Show me what career-ops can do" or "What commands are available?" |
| `/career-ops scan` | "Scan for new jobs" or "Search portals" |
| `/career-ops pdf` | "Generate my CV" or "Create a PDF for this role" |
| `/career-ops oferta` | "Evaluate this offer" |
| `/career-ops ofertas` | "Compare these offers" or "Rank my options" |
| `/career-ops batch` | "Batch process pending offers" |
| `/career-ops tracker` | "Show my tracker" or "Application status" |
| `/career-ops apply` | "Help me apply to this" |
| `/career-ops pipeline` | "Process my pipeline inbox" |
| `/career-ops deep` | "Research [company]" |
| `/career-ops contacto` | "Draft LinkedIn outreach for [person]" |
| `/career-ops training` | "Evaluate this course/cert" |
| `/career-ops project` | "Evaluate this project idea" |
| `/career-ops patterns` | "Analyze my rejection patterns" |

## Batch Processing in IDE Mode

The CLI version uses `claude -p` for parallel batch processing. In IDE mode, you have two options:

### Option A: Sequential batch script
```bash
npm run batch:sequential
```
This reads `batch/batch-input.tsv` and generates structured prompts you can feed to your IDE agent one at a time.

### Option B: One at a time
Add URLs to `data/pipeline.md` and tell your agent:
> "Process my pipeline inbox"

The agent will evaluate each URL sequentially within your IDE session.

### Option C: Original CLI batch (requires Claude Code)
```bash
cd batch
./batch-runner.sh --parallel 2
```
This requires the `claude` CLI and uses `claude -p` workers.

## Key Files

| File | Purpose |
|------|---------|
| `.cursorrules` | Cursor auto-loaded project rules |
| `INSTRUCTIONS.md` | Universal IDE instructions (all platforms) |
| `CLAUDE.md` | Original Claude Code CLI instructions |
| `modes/*.md` | Mode-specific instructions (evaluation, PDF, scan, etc.) |
| `config/profile.yml` | Your identity and targets |
| `modes/_profile.md` | Your custom archetypes and narrative |
| `cv.md` | Your CV (create this) |

## Troubleshooting

### Agent doesn't know about career-ops
Make sure your IDE is reading the project instructions:
- **Cursor:** Check that `.cursorrules` exists in the root
- **Antigravity:** Tell the agent to read `INSTRUCTIONS.md`
- **Others:** Point project context to `INSTRUCTIONS.md`

### PDF generation fails
```bash
npx playwright install chromium   # Reinstall browser
npm run doctor                     # Check all prerequisites
```

### Agent tries to edit applications.md directly
Remind it: "Use the TSV flow — write to `batch/tracker-additions/` and then run `node merge-tracker.mjs`"

### Agent invents experience or metrics
Remind it: "Only use facts from cv.md and article-digest.md. Never invent metrics."
