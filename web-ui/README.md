# career-ops web UI

A local dashboard for the [career-ops](https://github.com/santifer/career-ops) job search pipeline.

Reads your existing career-ops data files directly — no migration, no database.

## Stack

- Next.js 16 (App Router, server components) + TypeScript
- shadcn/ui + Tailwind CSS v4
- Express API server (`server.mjs`) on port 3099 — parses career-ops markdown/YAML files

## Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | Stats, "next actions" with urgency, best-to-act-on list, activity feed |
| Tracker | `/dashboard/tracker` | Applications by status with inline status update, score badges, report drawer |
| Evaluate | `/dashboard/evaluate` | Submit a job URL, stream live claude output, named stage progress pills |
| Pipeline | `/dashboard/pipeline` | Pending URLs inbox — paginated (50/page), Evaluate shortcut, Skip button |
| Follow-ups | `/dashboard/followups` | Cadence tracker with overdue highlighting, Track Contact and Add Follow-up forms |
| Interview Prep | `/dashboard/interview` | Active interview banner, story bank, STAR practice mode, company file viewer |
| Analytics | `/dashboard/analytics` | Conversion funnel, score distribution, weekly cadence sparkline, actionable insight |
| Recruiter Find | `/dashboard/recruiter-find` | AI-generated LinkedIn connection note + follow-up message for a target company/role, with live streaming and archetype detection |

## Key features

- **Streaming evaluation**: the Evaluate page streams `claude` subprocess output via SSE — named stage pills (Fetching → Analyzing → Scoring → Report → Tracker) update live
- **Pipeline pagination**: handles 1500+ pending URLs without slowdown — 50 items per page with URL-based prev/next navigation
- **Inline status updates**: Tracker page lets you change application status directly; writes back to `data/applications.md`
- **Report drawer**: click any application's report link to read the full markdown in a slide-in drawer with quick facts (remote, comp, URL, PDF)
- **Action-oriented dashboard**: surfaces overdue follow-ups, best-scoring applications to act on, and daily next-action recommendations
- **ISR caching**: markdown files are parsed once and cached with Next.js ISR (10s revalidation) — fast repeated navigation

## Getting started

```bash
cd web-ui
pnpm install
pnpm dev        # starts API (port 3099) + Next.js (port 3030)
```

Open [http://localhost:3030/dashboard](http://localhost:3030/dashboard).

Requires career-ops data files at `../data/`, `../reports/`, `../config/`, `../interview-prep/`.

## API endpoints (server.mjs)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/applications` | Parse `data/applications.md` + enrich from report headers |
| GET | `/api/pipeline` | Parse `data/pipeline.md` pending/done items |
| GET | `/api/followups` | Read `data/follow-ups.md` |
| GET | `/api/report/:num` | Serve raw markdown for a report |
| GET | `/api/profile` | Parse `config/profile.yml` |
| GET | `/api/storybank` | Read `interview-prep/story-bank.md` |
| GET | `/api/interview-files` | List `interview-prep/*.md` files |
| GET | `/api/interview-file/:name` | Serve a company prep file |
| PATCH | `/api/applications/:num` | Update status/notes in `data/applications.md` |
| PATCH | `/api/pipeline` | Check/uncheck a URL in `data/pipeline.md` |
| POST | `/api/followups` | Append entry to `data/follow-ups.md` |
| POST | `/api/evaluate` | Start a `claude` evaluation subprocess, return jobId |
| GET | `/api/evaluate/:jobId/stream` | SSE stream of subprocess stdout lines |
