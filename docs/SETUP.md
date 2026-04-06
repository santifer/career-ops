# Setup Guide

## Prerequisites

- [Claude Code](https://claude.ai/code) installed and configured, or Codex working in this repo
- Node.js 18+ (for PDF generation and utility scripts)
- (Optional) Go 1.21+ (for the dashboard TUI)

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

Use either agent path:

**Claude Code**

```bash
claude
```

Then paste a job offer URL or description, or use `/career-ops`.

**Codex**

- Open the repo in Codex
- Read `AGENTS.md`
- Ask naturally, for example:
  - `Evaluate this role`
  - `Generate a tailored resume for this JD`
  - `Scan the configured portals`

Both paths use the same `cv.md`, `article-digest.md`, `config/profile.yml`, and `portals.yml`.

## Available Commands

| Action | How |
|--------|-----|
| Evaluate an offer | Paste a URL or JD text |
| Search for offers | Claude: `/career-ops scan` · Codex: `Scan the configured portals` |
| Process pending URLs | Claude: `/career-ops pipeline` · Codex: `Process data/pipeline.md` |
| Generate a PDF | Claude: `/career-ops pdf` · Codex: `Generate a tailored PDF for this JD` |
| Batch evaluate | Claude: `/career-ops batch` · Codex: manual/sequential until batch runner is generalized |
| Check tracker status | Claude: `/career-ops tracker` · Codex: `Show tracker status` |
| Fill application form | Claude: `/career-ops apply` · Codex: `Help me fill this application` |

## Verify Setup

```bash
node cv-sync-check.mjs      # Check configuration
node verify-pipeline.mjs     # Check pipeline integrity
```

## Build Dashboard (Optional)

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..  # Opens TUI pipeline viewer
```
