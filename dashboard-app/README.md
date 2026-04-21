# Career-Ops Web Dashboard

A real-time web dashboard for tracking your job search pipeline, applications, and profile — all powered by the same data files career-ops already uses.

## Features

- **Overview** — Stats, application funnel chart, and latest scanned jobs at a glance
- **Pipeline** — Browse all jobs discovered via portal scans with search and direct links
- **Applications** — Track every application with status, score, and report links
- **Profile** — View your target role archetypes and full skills inventory
- **Real-time updates** — SSE (Server-Sent Events) auto-refreshes the dashboard when `data/` files change (e.g. after a scan)

## Architecture

```
dashboard-app/          React + Vite frontend (this directory)
web-server.mjs          Express backend (project root)
config/profile.yml  →   /api/profile
data/applications.md →  /api/applications
data/pipeline.md     →  /api/pipeline
                        /api/events (SSE stream)
```

The backend reads your **existing career-ops data files** at runtime — no database, no external services. Everything stays local.

## Quick Start

From the project root:

```bash
# Install dependencies (both root and dashboard-app)
npm install
cd dashboard-app && npm install && cd ..

# Start both backend and frontend
npm run dashboard
```

This launches:
- **Backend** at `http://localhost:3001` (Express API + SSE)
- **Frontend** at `http://localhost:5173` (Vite dev server)

### Individual commands

```bash
npm run backend    # Start only the Express API server
npm run frontend   # Start only the Vite dev server
```

## Data Sources

The dashboard reads from the same files you already use with career-ops:

| File | API Endpoint | What it shows |
|------|--------------|---------------|
| `config/profile.yml` | `/api/profile` | Name, headline, skills, target roles |
| `data/applications.md` | `/api/applications` | Tracked applications table |
| `data/pipeline.md` | `/api/pipeline` | Scanned jobs and pending evaluations |

If any of these files don't exist yet (fresh install), the dashboard shows empty states with guidance on what to do next.

## Tech Stack

- **Frontend:** React 19, Vite, Recharts, Lucide React, Framer Motion
- **Backend:** Express 5, js-yaml, Server-Sent Events
- **Styling:** Vanilla CSS with glassmorphism dark theme
