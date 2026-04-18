---
description: Run pipeline integrity checks (dedup, normalize, merge, liveness)
---

# /career-ops-pipeline

Arguments: `$ARGUMENTS` (optional: `dedup` | `normalize` | `merge` | `liveness` | `all`)

Load context:
1. `modes/_shared.md`
2. `DATA_CONTRACT.md`

Read `modes/pipeline.md` and execute it.

Run the matching npm scripts:
- `npm run dedup` — remove duplicate rows in `data/applications.md`
- `npm run normalize` — normalize status values (applied / interviewing / ghosted / offer / declined)
- `npm run merge` — merge partial tracker updates
- `npm run liveness` — check which postings are still live
- `npm run verify` — end-to-end pipeline integrity

Default if no arg: run `all` in order: normalize → dedup → merge → liveness → verify.
