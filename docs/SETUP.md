# Setup Guide

## Prerequisites

- One supported interactive adapter:
  - [Claude Code](https://claude.ai/code) for the production-ready path
  - OpenCode premium for the first-class additive adapter path
- Node.js 18+ (for PDF generation and utility scripts)
- (Optional) Go 1.21+ (for the dashboard TUI)

The runtime core is adapter-neutral:

- `runtime/modes.yml`
- `runtime/context-loading.yml`
- `runtime/operating-rules.md`

Claude and OpenCode premium bind to that same core. Codex CLI, Gemini CLI, and Copilot CLI are documented-only compatibility guides in this PR; they are not shipped with full interactive or worker parity.

## Quick Start (5 steps)

### 1. Clone and install

```bash
git clone https://github.com/santifer/career-ops.git
cd career-ops
npm install
npx playwright install chromium   # Required for PDF generation
```

### 2. Configure your profile

```bash
cp config/profile.example.yml config/profile.yml
```

Edit `config/profile.yml` with your personal details: name, email, target roles, narrative, proof points.

### 3. Add your CV

Create `cv.md` in the project root with your full CV in markdown format. This is the source of truth for all evaluations and PDFs.

(Optional) Create `article-digest.md` with proof points from your portfolio projects/articles.

### 4. Configure portals

```bash
cp templates/portals.example.yml portals.yml
```

Edit `portals.yml`:
- Update `title_filter.positive` with keywords matching your target roles
- Add companies you want to track in `tracked_companies`
- Customize `search_queries` for your preferred job boards

### 5. Start using

Open your adapter in this directory:

```bash
claude
```

If you use OpenCode premium, follow `AGENTS.md` plus `.opencode/commands/career-ops.md` / `.opencode/agents/career-ops.md`.

Then paste a job offer URL or description. Career-ops will automatically evaluate it, generate a report, create a tailored PDF, and track it.

## Adapter Support Matrix

| Adapter | Status | Notes |
|--------|--------|-------|
| Claude | Production-ready | Canonical interactive/manual path today |
| OpenCode premium | First-class | Same runtime contract, additive-only premium/manual UX |
| Codex CLI | documented-only | See `docs/runtime-adapters/codex.md`; must not imply full parity |
| Gemini CLI | documented-only | See `docs/runtime-adapters/gemini-cli.md`; must not imply full parity |
| Copilot CLI | documented-only | See `docs/runtime-adapters/copilot-cli.md`; must not imply full parity |

**Scope note:** interactive/manual parity is the goal of this change. workers later: batch/background worker abstraction is deferred and not part of this PR.

## Available Commands

| Action | How |
|--------|-----|
| Evaluate an offer | Paste a URL or JD text |
| Search for offers | `/career-ops scan` |
| Process pending URLs | `/career-ops pipeline` |
| Generate a PDF | `/career-ops pdf` |
| Batch evaluate | `/career-ops batch` |
| Check tracker status | `/career-ops tracker` |
| Fill application form | `/career-ops apply` |

## Verify Setup

```bash
node cv-sync-check.mjs      # Check configuration
node verify-pipeline.mjs     # Check pipeline integrity
node test-all.mjs --quick    # Validate runtime/docs/adapter references
```

## Build Dashboard (Optional)

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard            # Opens TUI pipeline viewer
```
