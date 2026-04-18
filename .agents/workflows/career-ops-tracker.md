---
description: Show and manage the application pipeline
---

# /career-ops-tracker

Arguments: `$ARGUMENTS` (optional filter: `active`, `applied`, `ghosted`, `interviewing`, `offer`, `stale`)

Load context:
1. `modes/_shared.md`
2. `data/applications.md` (primary tracker)

Read `modes/tracker.md` and execute it. The mode will:
- Read the pipeline state
- Filter per `$ARGUMENTS`
- Show status, age, next action per row
- Flag stale entries (> 7 days no response)

If user asks to update a row, write back to `data/applications.md` preserving column order and the integrity rules from `DATA_CONTRACT.md`.
