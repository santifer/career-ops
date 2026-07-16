# Admin

System administration, validation, and diagnostics.

## Core Modules

### `doctor.py`
Setup validation. Checks that all required files exist (`cv.md`, `config/profile.yml`, `portals.yml`, `modes/_profile.md`), Playwright is installed, and plugins are configured.

```
python -m scripts.python.admin.doctor [--json] [--strict]
npm run doctor
```

JSON output: `{"onboardingNeeded": bool, "missing": [...], "warnings": [...], "autoCopied": [...]}`

### `update_system.py`
Safe system updater. Check for career-ops updates, apply upgrades, rollback.

```
python -m scripts.python.admin.update_system check    # Check for updates
python -m scripts.python.admin.update_system apply    # Apply update
python -m scripts.python.admin.update_system rollback # Rollback
npm run update:check
npm run update
npm run rollback
```

### `cv_sync_check.py`
Validates consistency between `cv.md`, `config/profile.yml`, and `article-digest.md`.

```
python -m scripts.python.admin.cv_sync_check
npm run sync-check
```

## Validation Modules

| Module | Description | npm |
|--------|-------------|-----|
| `validate_portals.py` | Validate `portals.yml` schema | `npm run validate:portals` |
| `verify_portals.py` | Validate ATS slugs in portals.yml | `npm run verify:portals` |
| `validate_paths.py` | Check updater SYSTEM_PATHS/USER_PATHS coverage | — |

## Analysis Modules

| Module | Description | CLI |
|--------|-------------|-----|
| `analyze_patterns.py` | Application pattern analysis (ATS channel, conversion rates) | `npm run patterns` |
| `upskill.py` | Aggregate skill gaps from evaluation reports vs `cv.md` | `npm run upskill` |
| `stats.py` | Lifetime pipeline stats (funnel, scan totals, portal coverage) | `--summary` table |

## Other

| Module | Description |
|--------|-------------|
| `manifesto.py` | Read The CareerOps Manifesto, optionally open signing page |
| `test_all.py` | Run the full Python script test suite |
