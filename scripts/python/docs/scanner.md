# Scanner

Zero-token portal scanner for career-ops. Discovers job postings from company career pages, Greenhouse/Lever/Ashby APIs, and full ATS reverse discovery.

## Modules

### `scan.py`
Portal scanner entry point. Walks `portals.yml` tracked companies and job boards, fetches listings via local parser, Playwright, or ATS API, then applies title/location/salary filters.

```
python -m scripts.python.scanner.scan [--dry-run] [--verify] [--company NAME] [--json]
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview without writing to pipeline |
| `--verify` | Run Playwright liveness after API fetch |
| `--company` | Scan a single company |
| `--throttle` | Delay between requests (ms) |
| `--json` | Machine-readable output |

### `scan_ats_full.py`
Reverse ATS discovery scanner. Walks the full public job-board-aggregator dataset per ATS provider (Greenhouse/Lever/Ashby/Workday), filtered by `portals.yml`'s `title_filter`/`location_filter`. No company-list curation needed.

```
python -m scripts.python.scanner.scan_ats_full [--since DAYS] [--limit N] [--ats greenhouse,lever] [--seeds yc,a16z]
```

### `check_liveness.py`
Job posting liveness checker. Uses Playwright or HTTP to verify a posting URL is still active.

```
python -m scripts.python.scanner.check_liveness URL
```

### `classify_tier.py`
Classifies a job title into seniority tiers for scoring.

```
python -m scripts.python.scanner.classify_tier "Senior AI Engineer"
```

## CLI Bridge

```bash
# Via package __main__.py:
python -m scripts.python.scanner scan --dry-run
python -m scripts.python.scanner check-liveness https://...
python -m scripts.python.scanner classify-tier "Staff ML Engineer"

# Via npm:
npm run scan
npm run scan:full
npm run liveness
```

## Dependencies

- `portals.yml` — company and query configuration
- `data/scan-history.tsv` — dedup history
- `data/scan-runs.tsv` — per-run counters
- `scripts/python/pipeline/` — liveness checking
- Provider scripts in `scripts/archived-js/providers/` (legacy, called via subprocess)
