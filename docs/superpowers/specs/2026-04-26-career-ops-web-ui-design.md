# career-ops Web UI — Design Spec

**Date:** 2026-04-26  
**Status:** Approved  
**Scope:** Local-only Next.js web UI for career-ops job search pipeline

---

## Overview

A local-only Next.js web application that replaces and extends the existing Go/Bubbletea TUI. The browser becomes the full command center: view and manage the job pipeline, track application statuses, read evaluation reports, trigger scans and batch evaluations, and analyze patterns — all from one place.

**Runs as:** `next dev` (or `next start` after build) on the same machine as the career-ops CLI  
**Data:** Reads and writes the existing markdown/TSV files directly — no migration, no new database  
**Deployment:** Local only (not deployed to Vercel or any host)

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js 14 App Router | Server Components + streaming for long-running CLI ops |
| Language | TypeScript | Type-safe parsers for markdown data |
| Styling | Tailwind CSS + shadcn/ui | Fast composition, accessible primitives |
| Charts | Recharts | Lightweight, React-native, no D3 overhead |
| Visual style | Light editorial | Warm stone-50 base, high-contrast black, minimal chrome |
| Navigation | ⌘K command palette + compact sidebar | Power-user fit — mirrors CLI command thinking |
| Data access | Direct filesystem (`fs`) | Local only — no abstraction layer needed |
| Long-running ops | Server-Sent Events (SSE) | Stream scan/batch output to browser in real time |
| Mutations | Next.js Server Actions | Write files and run child processes server-side |

---

## Pages

### `/` — Overview

The home screen. Shows the current state of the job search at a glance and surfaces the most important next actions.

**Content:**
- Four KPI cards: Pipeline pending, Evaluated, Applied, Interviews/Offers
- Score funnel: horizontal bar showing how many jobs scored ≥4.0, 3.5–3.9, <3.5
- Recent activity feed: last 10 evaluated jobs (company, role, score, date)
- Quick action buttons: "Run Scan", "Start Batch Eval", "Merge Tracker"
- Batch progress indicator: shown when batch is actively running (links to /actions)

---

### `/pipeline` — Pipeline

Browse the 302 pending jobs that have been scanned but not yet evaluated.

**Content:**
- Sortable/filterable table: Company, Role, Source (which ATS), Date Added
- Filters: company name search, source filter, bulk checkbox select
- Row actions: "Evaluate this job" (opens batch for single URL), "Mark Skip" (removes from pipeline.md)
- Bulk action bar (appears on selection): "Evaluate selected N", "Skip selected N"
- Reads from: `data/pipeline.md`
- Writes to: `data/pipeline.md` (mark done/skip)

---

### `/tracker` — Application Tracker

All evaluated applications with status tracking. Two views toggled by a button.

**Kanban view:**
- Columns: Evaluated → Applied → Responded → Interview → Offer → Rejected → Discarded
- Each card: company name, role title, score badge, date
- Drag-and-drop between columns updates status in `data/applications.md`
- Click card → navigates to `/reports/[id]`

**Table view:**
- Columns: #, Date, Company, Role, Score, Status, PDF, Report, Notes
- Inline status dropdown
- Sortable by score, date, company
- Click report link → navigates to `/reports/[id]`

**Score badge colors:**
- ≥ 4.0 → green
- 3.5–3.9 → amber
- < 3.5 → stone/gray

Reads from: `data/applications.md`  
Writes to: `data/applications.md` (status changes, notes)

---

### `/reports/[id]` — Report Viewer

Full evaluation report for a single job, rendered from the markdown file.

**Content:**
- Header: Company, Role, Score badge, Legitimacy tier, Archetype, Date
- Rendered markdown body (blocks A–G with syntax highlighting)
- Right sidebar: visual score breakdown grid (A–F blocks as labeled score cards)
- Action bar: "Mark Applied" (updates tracker inline), "Open PDF" (opens file:// link), "Open Job URL"
- Navigation: previous/next report arrows

Reads from: `reports/{id}-{company}-{date}.md`  
Writes to: `data/applications.md` (status update on "Mark Applied")

---

### `/actions` — Actions Console

Trigger CLI operations and watch their output stream live in the browser.

**Three action cards:**

**Run Scan**
- Button: "Run Scan Now"
- Streams `node scan.mjs` output via SSE to a console-style output box
- Shows summary when complete (N new jobs added to pipeline)

**Batch Evaluation**
- Inputs: "Parallel workers" (1–5), "Start from ID", "Min score gate"
- Button: "Start Batch"
- Streams `bash batch/batch-runner.sh` output via SSE
- Live progress table: per-job ID, status (pending/processing/completed/failed), score — the SSE route polls `batch/batch-state.tsv` every 2 seconds and emits updates as the runner writes to it
- "Stop" button sends SIGTERM to the running process

**Merge Tracker**
- Button: "Merge tracker additions"
- Runs `node merge-tracker.mjs` then `node verify-pipeline.mjs`
- Shows output inline
- Auto-refreshes /tracker data after merge

**SSE implementation:** Each action has a corresponding API route (`/api/stream/scan`, `/api/stream/batch`, `/api/stream/merge`) that spawns the child process, pipes stdout/stderr as `data:` events, and sends a final `event: done` when the process exits.

---

### `/patterns` — Patterns & Analytics

Visual analysis of the job search data to surface insights.

**Content:**
- Score distribution histogram: how many jobs scored in each 0.5-point bucket
- Application funnel: evaluated → applied → responded → interview → offer
- Top companies by relevance: table of companies with count and avg score
- Archetype breakdown: which role archetypes appear most, avg score per archetype
- Timeline: evaluations per day/week chart

Reads from: `data/applications.md`, `data/scan-history.tsv`  
No writes.

---

## Command Palette (⌘K)

Available on every page. Opens a modal with a fuzzy search input.

**Command categories:**

| Category | Examples |
|----------|---------|
| Navigation | "Go to pipeline", "Go to tracker", "Open patterns" |
| Actions (run) | "Run scan", "Start batch eval", "Merge tracker" |
| Jump to report | "Report #001", "Report Anthropic", "Report Vercel" |
| Jump to company | Fuzzy match any company in applications.md |
| Filter | "Show score ≥ 4.0", "Filter by Applied" |

Keyboard: `↑↓` to navigate, `Enter` to execute, `Esc` to close.

---

## File Structure

```
career-ops-ui/               # new Next.js app, lives alongside career-ops CLI
├── app/
│   ├── layout.tsx            # sidebar + command palette provider
│   ├── page.tsx              # /overview
│   ├── pipeline/
│   │   └── page.tsx
│   ├── tracker/
│   │   └── page.tsx
│   ├── reports/
│   │   └── [id]/
│   │       └── page.tsx
│   ├── actions/
│   │   └── page.tsx
│   ├── patterns/
│   │   └── page.tsx
│   └── api/
│       └── stream/
│           ├── scan/route.ts
│           ├── batch/route.ts
│           └── merge/route.ts
├── lib/
│   ├── paths.ts              # CAREER_OPS_PATH resolution
│   ├── parsers/
│   │   ├── applications.ts   # parse applications.md → Application[]
│   │   ├── pipeline.ts       # parse pipeline.md → PipelineEntry[]
│   │   ├── report.ts         # parse report .md → Report (structured)
│   │   └── scan-history.ts   # parse scan-history.tsv → ScanEntry[]
│   └── mutations/
│       ├── status.ts         # update application status in applications.md
│       ├── pipeline.ts       # mark pipeline entries done/skipped
│       └── process.ts        # spawn child_process for CLI commands
├── components/
│   ├── sidebar.tsx
│   ├── command-palette.tsx
│   ├── score-badge.tsx
│   ├── pipeline-table.tsx
│   ├── tracker-kanban.tsx
│   ├── tracker-table.tsx
│   ├── report-viewer.tsx
│   ├── action-console.tsx    # SSE stream display
│   └── charts/
│       ├── score-histogram.tsx
│       ├── funnel-chart.tsx
│       └── archetype-table.tsx
└── package.json
```

**Location:** The Next.js app lives at `career-ops/ui/` — a subdirectory of the main project. It references the career-ops data files via the `CAREER_OPS_PATH` environment variable (defaults to the parent directory `../` relative to the UI root, i.e. the `career-ops/` project root).

---

## Data Parsers

Each parser is a pure function: `string → typed array`. No side effects.

| Parser | Input | Output type |
|--------|-------|-------------|
| `parseApplications` | `applications.md` content | `Application[]` |
| `parsePipeline` | `pipeline.md` content | `PipelineEntry[]` |
| `parseReport` | report `.md` content | `Report` (blocks A–G + metadata) |
| `parseScanHistory` | `scan-history.tsv` content | `ScanEntry[]` |

The `Application` type mirrors the existing Go model:
```ts
type Application = {
  number: number
  date: string
  company: string
  role: string
  score: number | null
  status: string
  hasPDF: boolean
  reportPath: string | null
  reportNumber: string | null
  notes: string
  jobUrl: string | null
}
```

---

## Environment

```bash
CAREER_OPS_PATH=/Users/you/career-ops   # path to career-ops project root
                                         # defaults to cwd if not set
PORT=3001                                # avoid conflict with other dev servers
```

Add to `.env.local` in the UI project root.

---

## Not In Scope (v1)

- Authentication (local-only, no auth needed)
- PDF generation from the UI (still done via CLI)
- CV editor
- Interview prep page
- Multi-profile support
- Real-time file watching (data refreshes on page navigation or manual refresh, not via WebSocket/polling — except the Actions page which polls batch-state.tsv during active runs)

---

## Success Criteria

- All 302 pipeline jobs visible and filterable in `/pipeline`
- Application statuses updatable from `/tracker` without touching the terminal
- Evaluation reports readable with score visualization in `/reports/[id]`
- Scan and batch operations triggerable from `/actions` with live output
- ⌘K palette navigates and executes all key commands
- App starts with `next dev` in under 3 seconds
- No data loss: mutations write to the same files the CLI reads
