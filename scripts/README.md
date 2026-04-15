# Scripts

All utility scripts for career-ops. Run via `npm run <name>` from the project root.

## Runnable Scripts

| Script | npm command | Purpose |
|--------|-------------|---------|
| `doctor.mjs` | `npm run doctor` | Validate setup prerequisites |
| `verify-pipeline.mjs` | `npm run verify` | Pipeline data integrity check |
| `normalize-statuses.mjs` | `npm run normalize` | Fix non-canonical statuses |
| `dedup-tracker.mjs` | `npm run dedup` | Remove duplicate tracker entries |
| `merge-tracker.mjs` | `npm run merge` | Merge batch TSVs into applications.md |
| `generate-pdf.mjs` | `npm run pdf` | HTML → ATS-optimized PDF via Playwright |
| `cv-sync-check.mjs` | `npm run sync-check` | Validate CV/profile consistency |
| `update-system.mjs` | `npm run update` | Check and apply upstream updates |
| `check-liveness.mjs` | `npm run liveness` | Test if job URLs are still active |
| `scan.mjs` | `npm run scan` | Zero-token portal scanner |
| `analyze-patterns.mjs` | — | Rejection pattern analysis (JSON output) |
| `followup-cadence.mjs` | — | Follow-up cadence calculator (JSON output) |
| `test-all.mjs` | — | Full test suite (CI) |

## Shared Modules

| Module | Used by |
|--------|---------|
| `lib/liveness-core.mjs` | `check-liveness.mjs`, `scan.mjs` |

See [docs/SCRIPTS.md](../docs/SCRIPTS.md) for full documentation on each script.
