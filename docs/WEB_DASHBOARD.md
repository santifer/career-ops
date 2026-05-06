# Web Dashboard

A visual dashboard for career-ops -- track applications, manage your pipeline, discover jobs, and configure sources.

## Quick Start

```bash
# 1. Start Postgres
npm run web:db:up

# 2. Create tables
npm run web:migrate

# 3. Import existing data (applications.md, portals.yml)
npm run web:seed

# 4. Start dev servers (API on :3000, client on :5173)
npm run web:dev
```

Open http://localhost:5173

## Pages

- **Applications** (`/`) -- Filterable, sortable table of all evaluated jobs
- **Pipeline** (`/pipeline`) -- Kanban board: drag cards between Evaluated > Applied > Responded > Interview > Offer
- **Feed** (`/feed`) -- New jobs from scans. Send to pipeline or dismiss.
- **Sources** (`/sources`) -- Add, toggle, or remove companies to scan

## How Sync Works

The dashboard and Claude Code share the same data through markdown files:

- **Claude evaluates a job** -> writes report + updates applications.md -> `merge-tracker.mjs` pings the dashboard API -> database updates
- **You move a Kanban card** -> API updates the database + writes back to applications.md -> Claude sees the change
- **You run a scan** -> `scan.mjs` saves to pipeline.md + posts to dashboard API -> new jobs appear in the Feed

If the dashboard isn't running, everything works exactly as before. Markdown files are always the source of truth.

## Tech Stack

- **Server:** Fastify, Drizzle ORM, PostgreSQL, Zod, TypeScript
- **Client:** React 19, Vite, TanStack (Router, Query, Table), Tailwind CSS, @dnd-kit

## Scripts

| Command | Description |
|---------|-------------|
| `npm run web:dev` | Start both server + client in dev mode |
| `npm run web:db:up` | Start Postgres via Docker |
| `npm run web:db:down` | Stop Postgres |
| `npm run web:migrate` | Run database migrations |
| `npm run web:seed` | Import markdown data into database |
| `npm run web:build` | Production build |
| `npm run web:start` | Start production server |
| `npm run web:test` | Run server tests |

## Requirements

- Node.js 18+
- Docker (for Postgres)
