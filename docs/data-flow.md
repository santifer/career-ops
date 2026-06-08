# Pulse Engine Data Flow

*Discovered 2026-06-05. Update this file whenever the write surface changes.*

## Current flow (primary sources)

The Kanban HTML file is both the UI and the database. There is no separate job store.

```
scan.mjs (Greenhouse/Lever/Ashby APIs)  ──┐
workday-scraper.mjs                       ├──► 1am SKILL agent (Claude session)
WebSearch (secondary, discovery only)     ┘         │
                                                     │ edits HTML as text:
                                                     │ injects card objects +
                                                     │ bumps SEED_VERSION
                                                     ▼
                            dashboard/job-pulse-kanban.html
                               (self-contained HTML/JS — IS the store)
                                         │
                                         │ browser renders it
                                         ▼
                                   Pulse Kanban UI
```

Side-files written each run:
- `data/last-refresh.json` — run summary (counts, seed version)
- `data/dead-url-history.json` — dead URL audit log
- `data/sus-db.json` — SuS gate state
- `output/*.txt` — generated cover letters

## Phase 2 addition: secondary MCP sources

Indeed MCP and Dice MCP run in the scheduled-task session and produce structured
output (Indeed: markdown, Dice: JSON). Adapters normalize both to `PulseJob`
schema, dedup is applied, and the result is written to an intermediate file.
The 1am SKILL Step 1.5 then reads that file and injects cards into the Kanban.

```
Indeed MCP (markdown blobs) ──► adapter-indeed.mjs ──┐
Dice   MCP (JSON objects)   ──► adapter-dice.mjs   ──┤
                                                       ▼
                                              scripts/ingest-runner.mjs
                                                 (dedup, validate)
                                                       │
                                                       ▼
                                         data/jobs-incoming-{date}.json
                                                       │
                                         1am SKILL Step 1.5 reads it
                                                       │
                                                       ▼
                                    dashboard/job-pulse-kanban.html
                                         (card injection, same as primary)
```

## Key invariants

- **Kanban HTML is the write surface.** Every ingestion path ends with an agent
  editing `dashboard/job-pulse-kanban.html` as text.
- **No live DB.** The file can't be queried; it must be fully read on each run.
- **MCP calls only happen in Claude sessions.** The browser UI cannot call MCPs
  directly — ingestion must happen scheduled-task-side and write to a file the
  next Kanban load can read. (See BUGS.md B6.)
- **ATS-API verification gate** still applies to Indeed/Dice URLs before injection.
  `ingest-runner.mjs` flags `verified: false` — the SKILL must verify before inject.
