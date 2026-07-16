# Archived — JS Legacy Scripts

**Archived:** 2026-07-16  
**Reason:** All 73+ scripts have been ported to Python (`scripts/python/`). Python is the primary runtime.  
**Status:** Keep for reference only. Do not use for new development.

## Migration

Every script in this directory has a Python equivalent in `scripts/python/`:

| JS (archived) | Python (active) |
|---|---|
| `scan.mjs` | `scripts/python/scanner/scan.py` |
| `merge-tracker.mjs` | `scripts/python/tracker/merge_tracker.py` |
| `doctor.mjs` | `scripts/python/admin/doctor.py` |
| `generate-pdf.mjs` | `scripts/python/cv/generate_pdf.py` |
| `openai-eval.mjs` | `scripts/python/evaluation/openai_eval.py` |
| ... | ... |

Full mapping: see `docs/plans/python-migration-remaining.md`.

## Unported Scripts

- `tracker.mjs` — display-only utility, no Python port needed
- `updater-migration-tests.mjs` — internal test-only, no Python port needed

## How to use Python instead

```bash
npm run scan           # python -m scripts.python.scanner.scan
npm run doctor         # python -m scripts.python.admin.doctor
npm run merge          # python -m scripts.python.tracker.merge_tracker
# ...
```

All npm scripts now call Python. See `package.json` for the full list.
