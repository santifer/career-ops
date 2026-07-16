# CLI Bridge

How Python scripts are invoked from the command line and npm.

## Entry Points

### `__main__.py` (package level)

Every Python package has a `__main__.py` that dispatches subcommands:

```bash
python -m scripts.python.scanner scan --dry-run
python -m scripts.python.tracker merge
python -m scripts.python.cv generate-pdf
python -m scripts.python.admin doctor --json
python -m scripts.python.plugins cli list
```

Without a subcommand, the default module is used (e.g. `scanner` → `scan`, `tracker` → `merge_tracker`).

### Direct module invocation

```bash
python -m scripts.python.scanner.scan --company Anthropic
python -m scripts.python.tracker.merge_tracker --dry-run
python -m scripts.python.admin.doctor --json
```

### npm scripts (42 of 46)

Most `npm run ...` commands call Python directly:

```bash
npm run scan       → python -m scripts.python.scanner.scan
npm run doctor     → python -m scripts.python.admin.doctor
npm run merge      → python -m scripts.python.tracker.merge_tracker
npm run verify     → python -m scripts.python.tracker.verify_pipeline
npm run pdf        → python -m scripts.python.cv.generate_pdf
```

### Legacy JS (2 scripts, no Python equivalent)

```bash
npm run update:test  → node scripts/archived-js/updater-migration-tests.mjs
npm run tracker      → node scripts/archived-js/tracker.mjs
```

## Architecture

The `__main__.py` dispatcher pattern:

1. Parse first `sys.argv` element as subcommand
2. Look up in `COMMANDS` dict (command → module path)
3. `__import__` the module, call `main(sys.argv[2:])`
4. Return exit code from `main()`

All `main()` functions accept `argv: list[str] | None = None` — when `None`, defaults to `sys.argv[1:]`.

## Full migration plan

See `docs/plans/cli-bridge.md` for the implementation plan and rationale.
