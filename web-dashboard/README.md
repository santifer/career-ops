# career-ops Web Dashboard

Interactive browser dashboard for the career-ops job search pipeline. Run all 16 `/career-ops` commands from a web UI with a conversational chat panel.

## Quick Start

```bash
cd web-dashboard
npm install
node server.mjs
```

Open **http://localhost:3737**

## Requirements

- **Node.js** 18+
- **Claude Code CLI** (`claude`) installed and authenticated — the dashboard runs commands via `claude -p`
- career-ops project set up (cv.md, config/profile.yml, modes/_profile.md exist)

## How It Works

The dashboard reads career-ops data files and exposes them through a web UI. Commands execute via `claude -p --system-prompt <mode-context>`, where mode files (`modes/*.md`) are injected as system context. Conversations persist using Claude's `--resume` flag with session IDs.

### Pages

| Page | What it shows |
|------|--------------|
| **Dashboard** | Metrics cards + quick action buttons + recent pipeline + recent applications |
| **Pipeline** | All pending URLs with "Process All" button |
| **Applications** | Filterable table with score badges, status pills, and Apply links to job postings |
| **Scan History** | All discovered URLs with source portal and status |
| **Reports** | Report list with score and legitimacy — click View to read |
| **Patterns** | Rejection pattern analysis (funnel, score comparison, recommendations) |
| **Follow-ups** | Overdue application tracking with priority indicators |
| **Commands** | All 16 commands with Run and Copy buttons |
| **Profile** | Your identity, comp targets, visa, roles, narrative, superpowers, proof points |
| **CV Preview** | Full CV markdown view |

### Running Commands

1. Click any **Run** button (dashboard quick actions, command cards, or page-specific buttons)
2. Commands needing input (evaluate, pdf, deep, etc.) show an input modal first
3. Chat panel slides open — Claude responds with the full mode context loaded
4. When Claude asks a follow-up, type your reply and hit Send (or Enter)
5. Conversations persist across turns via `--resume`

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3737` | Server port. Set via `PORT=4000 node server.mjs` |

### Architecture

```
web-dashboard/
  server.mjs          Express server + session management + WebSocket
  yaml-lite.mjs        Lightweight YAML parser for profile.yml
  public/index.html    Single-page frontend (vanilla JS, no build step)
  package.json         Dependencies: express, ws, chokidar
```

- **No build step** — vanilla HTML/CSS/JS
- **No external APIs** — reads local files, runs local `claude` CLI
- **Coexists with Go TUI** — the existing `dashboard/` is untouched
