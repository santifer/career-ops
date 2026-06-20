# Mode: dashboard — Visual Dashboard & Activity Log

Generate and open a self-contained HTML dashboard, and log per-application
activity/time. Both back onto career-ops' existing data contract — no server,
no Docker, no database, zero runtime dependencies.

(Routing: both `dashboard` and `activity` resolve to this mode file.)

## Dashboard

```bash
node generate-dashboard.mjs --open
```

Reads `data/applications.md` + `templates/states.yml` (+ `data/activities.md`)
and writes `output/dashboard.html` (gitignored), then opens it in the default
browser. Drop `--open` to only write the file; `--out FILE` to write elsewhere.

Sections rendered: summary scorecards, pipeline-by-status funnel, score
distribution, applications-over-time, a **kanban board** grouped by status,
**pipeline-health** conversion rates (response / interview / offer), a **needs
attention** list of active applications with no touch in 10+ days, and a
**time-logged / recent-activity** panel.

## Activity & time logging

When the user mentions doing work on an application — a recruiter call,
interview, prep, research, a follow-up — log it:

```bash
node activity.mjs add --company "{company}" [--app {num}] [--role "{role}"] \
                      --type {type} --minutes {n} [--date YYYY-MM-DD] [--note "..."]
```

Types: `applied · follow-up · call · interview · research · prep · email · other`.
Date defaults to today.

Inspect:

```bash
node activity.mjs list [--company X] [--since YYYY-MM-DD] [--limit N]
node activity.mjs summary       # totals by company and by type
```

Data lands in `data/activities.md` (user-layer, gitignored), which feeds the
dashboard's time-tracking and needs-attention panels. `activity.mjs` is distinct
from `followup-cadence.mjs` — the latter only computes follow-up timing/overdue
flags; this logs the actual work and time spent.

## Tip

After logging activity or updating the tracker, regenerate the dashboard so it
reflects the latest state (`node generate-dashboard.mjs`).
