# career-ops web UI

A local dashboard for the [career-ops](https://github.com/santifer/career-ops) job search pipeline.

Reads your existing career-ops data files directly — no migration needed.

## Stack

- Next.js 16 (App Router) + TypeScript
- shadcn/ui + Tailwind CSS v4
- Express API server (`server.mjs`) on port 3099

## Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | Stats, best-to-act-on list, recent activity |
| Tracker | `/dashboard/tracker` | Applications by status, search, score badges |
| Pipeline | `/dashboard/pipeline` | Pending URLs inbox |
| Follow-ups | `/dashboard/followups` | Cadence tracker with urgency colours |
| Interview Prep | `/dashboard/interview` | Story bank + company prep files |
| Analytics | `/dashboard/analytics` | Breakdowns by status, score, company |

## Getting started

```bash
cd web-ui
pnpm install
pnpm dev        # starts API (port 3099) + Next.js (port 3030)
```

Open [http://localhost:3030/dashboard](http://localhost:3030/dashboard).

Requires career-ops data files at `../data/`, `../reports/`, `../config/`, `../interview-prep/`.
