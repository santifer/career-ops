# career-ops-ui

Local visual layer over your `data/applications.md`. The CLI agent stays the source of truth — this UI reads and writes through it.

## Pages

| Route | Purpose |
|---|---|
| `/` | Dashboard — KPIs, status funnel chart, score histogram, weekly cadence, recent activity, quick actions |
| `/pipeline` | Application list — filter, sort, search (incl. report body), status edit |
| `/inbox` | Pending URLs from `data/pipeline.md` — grouped by company, copy URL, see processed history, "Scan now" button |
| `/follow-ups` | Overdue follow-ups from `followup-cadence.mjs`, with inline "Record follow-up" button |
| `/jobs` | Trigger CLI scripts and AI modes from the UI; view job list |
| `/jobs/[id]` | Single job with live log streaming |
| `/applications/[num]` | Application detail — full report, status editor, metadata, "Generate PDF" button |
| `/cv` | Read-only preview of `cv.md` |
| `/settings` | Read-only view of `config/profile.yml` and `modes/_profile.md` |
| `/api/applications` | JSON list (filter/sort/paginate) |
| `/api/applications/[num]` | PATCH status/notes |
| `/api/applications.csv` | CSV export |
| `/api/follow-ups` | JSON from upstream `followup-cadence.mjs` |
| `/api/follow-ups/record` | POST to append a row to `data/follow-ups.md` |
| `/api/jobs` | POST to start a script/AI job, GET to list recent |
| `/api/jobs/[id]` | GET job status, DELETE to cancel |
| `/api/jobs/[id]/logs` | SSE stream of job stdout/stderr |
| `/api/events` | SSE stream — emits on filesystem changes |
| `/output/[name]` | Serves PDFs from `output/` |

## Phase 3 highlights

- **`/inbox`**: parses `data/pipeline.md`, groups pending URLs by company, copy-URL button per role, shows recently processed history.
- **"Record follow-up" button** on every `/follow-ups` card: opens a small form (date / channel / contact / notes) → POSTs to `/api/follow-ups/record` → writes a row to `data/follow-ups.md`. Once recorded, the cadence script counts it on the next refresh and the app moves from `overdue` → `waiting`.
- **`data/follow-ups.md` is auto-created** with the canonical header on first record.

## Phase 4 highlights

- **`/jobs`**: trigger any of 9 whitelisted scripts (`scan`, `liveness`, `merge-tracker`, `analyze-patterns`, `cv-sync-check`, `verify-portals`, `followup-cadence`, `scan-ats-full`, `generate-pdf`) and 5 AI modes (`interview-prep`, `apply`, `contacto`, `cover`, `pipeline`) from the UI.
- **Live log streaming** at `/jobs/[id]` — SSE-backed, auto-scrolls, color-coded (stdout / stderr / system), cancel button.
- **AI mode** spawns a headless CLI agent (opencode → claude → codex fallback) with the matching `modes/<mode>.md` injected as system context.
- **Safety**: scripts must be in the explicit whitelist, 5-min default timeout (10 min for AI), 4 MB log cap, single concurrent job, per-file mutex on applications.md.
- **Buttons throughout**: "Scan portals" on `/inbox`, "Generate PDF" on `/applications/[num]`, Quick Actions panel on `/`.

## Running

From the repo root:

```bash
npm run ui:install   # one-time
npm run ui:dev       # development server with HMR (port 3000)
npm run ui:build     # production build
npm run ui:start     # serve production build (port 3000)
```

The server reads `CAREER_OPS_ROOT` from the environment (defaults to `process.cwd()/..` — i.e., the repo root when running from `ui/`). The launcher scripts set this for you.

## Architecture

```
Browser
  ↓ HTTP / SSE
Next.js (Node, in-memory)
  ├─ chokidar watches data/, reports/
  ├─ parseApplications() reads data/applications.md on each request
  ├─ In-memory cache; rebuilds on file change (no persistent DB)
  ├─ followups() spawns upstream followup-cadence.mjs (30s cache)
  ├─ inbox() parses data/pipeline.md into {pending, processed} groups
  └─ Writer uses file mutex (.ui-update.lock) for atomic edits
       ↓
  Filesystem (data/, reports/, cv.md)
```

**The CLI agent remains source of truth.** Status edits via the UI write back to `applications.md` using the same format the upstream tools expect — `[NNN](../reports/NNN-company-date.md)` with zero-padded numbers.

## Safety

- Status changes validated against `templates/states.yml` (canonical set)
- File writes use atomic rename (`*.tmp → file`) so the file is never half-written
- Per-file mutex prevents concurrent edits (CLI agent vs UI)
- Writer preserves original number formatting (`001` stays `001`) and report link format
- PDF serving is path-validated (`/output/[name]` rejects paths outside `output/`)
- Followups page wraps upstream CLI; failure surfaces as empty cards, never corrupts data
- Follow-up recording requires explicit user click on the form's Save button — never implicit

## Tests

```bash
cd ui
npm test
```

10 tests covering: parser, report summary, status round-trip, notes round-trip, canonical-status validation, link preservation, inbox parser.
