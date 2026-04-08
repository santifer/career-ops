# Setup Guide

## Prerequisites

- A coding-agent runtime of your choice
  - Claude Code / OpenCode keep native slash-command support
  - Codex, Gemini CLI, and other runtimes can use the same core files through `AGENTS.md`
- Node.js 18+ (for PDF generation and utility scripts)
- (Optional) Go 1.21+ (for the dashboard TUI)

## Quick Start (5 steps)

### 1. Clone and install

```bash
git clone https://github.com/santifer/career-ops.git
cd career-ops
npm ci
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

Open this directory in your preferred agent runtime. The universal behavior is documented in `AGENTS.md`. Claude/OpenCode users can keep using the existing slash commands.

Then paste a job offer URL or description. Career-ops will evaluate it, generate a report, create a tailored PDF, and track it.

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

If your runtime does not support slash commands, ask for the corresponding mode conversationally (for example: "run scan mode" or "evaluate this JD with auto-pipeline").

## Runtime Safety

- Built-in batch providers: `claude`, `codex`
- Default behavior: dangerous bypass flags are omitted
- Unsafe automation is opt-in only and intended for trusted local environments:

```bash
CAREER_OPS_AGENT=codex CAREER_OPS_UNSAFE_AGENT_EXEC=1 ./batch/batch-runner.sh
```

This matters because batch prompts may include scraped or third-party job content.

## Verify Setup

```bash
node cv-sync-check.mjs      # Check configuration
node verify-pipeline.mjs     # Check pipeline integrity
```

## Build Dashboard (Optional)

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard            # Opens TUI pipeline viewer
```
