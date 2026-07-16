# Tracker

Pipeline tracking utilities. Manage `data/applications.md`, handle batch merges, status updates, deduplication, and report-number reservation.

## Core Modules

### `merge_tracker.py`
Merges batch TSV addition files from `batch/tracker-additions/` into `data/applications.md`. Handles column-swap (status/score order), report-link normalization, and Via-field parsing.

```
python -m scripts.python.tracker.merge_tracker [--dry-run]
npm run merge
```

### `set_status.py`
Canonical CLI to update a tracker row status. Strict `states.yml` validation, shared lock, atomic write.

```
python -m scripts.python.tracker.set_status <report#|company> <State> [--note]
```

States: `Evaluated`, `Applied`, `Responded`, `Interview`, `Offer`, `Rejected`, `Discarded`, `SKIP`

### `verify_pipeline.py`
Health check for `data/applications.md` and `data/pipeline.md`. Validates report links, statuses, report numbers.

```
python -m scripts.python.tracker.verify_pipeline
npm run verify
```

### `reserve_report_num.py`
Atomically reserves a range of report numbers for parallel batch workers. Prevents race conditions.

```
python -m scripts.python.tracker.reserve_report_num --count 5    # Reserve 042-046
python -m scripts.python.tracker.reserve_report_num --release 042-046  # Release
```

## Maintenance Modules

| Module | Description | npm alias |
|--------|-------------|-----------|
| `dedup_tracker.py` | Remove duplicate tracker entries | `npm run dedup` |
| `normalize_statuses.py` | Normalize non-canonical statuses | `npm run normalize` |
| `reconcile_pipeline.py` | Move completed batch entries to Processed | `npm run reconcile` |

## Query Modules

| Module | Description | CLI |
|--------|-------------|-----|
| `find.py` | Resolve tracker query to full identity (by #, company, role phrase) | `npm run find` |
| `detect_reposts.py` | Flag roles re-listed 2+ times in 90 days | `npm run reposts` |
| `invite_match.py` | Match interview-invite emails to tracker candidates | `npm run invite-match` |
| `add_entry.py` | Insert structured add-mode payload into cv.md | `npm run add` |

## Analysis Modules

| Module | Description | CLI |
|--------|-------------|-----|
| `followup_cadence.py` | Follow-up cadence calculator | JSON output |
| `followup_seed.py` | Seed follow-up pin directives for Applied entries | JSON output |
| `process_quality.py` | Aggregate recruiting-process friction tags | `--summary` table |

## Internal Libraries

| Module | Role |
|--------|------|
| `parse.py` | Parse tracker tables, column normalization |
| `utils.py` | Tracker file I/O, locking, paths |
| `links.py` | Report link normalization |
| `role_matcher.py` | Fuzzy role-name matching |
