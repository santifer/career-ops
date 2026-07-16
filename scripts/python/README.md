# career-ops Python scripts

Python runtime for career-ops — the primary CLI entry point since v1.20.0.

All legacy JavaScript scripts have been archived to `scripts/archived-js/`. Python is now the canonical runtime.

## Quick Start

```bash
# Check your setup
npm run doctor

# Scan for new job offers
npm run scan

# Generate a tailored CV PDF
npm run pdf

# Run all tests
python -m pytest scripts/python/tests -q
```

## Package Structure

| Package | Purpose |
|---------|---------|
| `scanner/` | Job posting discovery from company portals and ATS APIs |
| `tracker/` | Pipeline tracking, merge, status updates, data integrity |
| `cv/` | CV generation (HTML, LaTeX, PDF, cover letters) |
| `evaluation/` | LLM-powered offer evaluation (OpenAI, Gemini, Ollama) |
| `admin/` | System validation, diagnostics, stats, updates |
| `plugins/` | External integrations (Gmail, Notion, Apify) |
| `pipeline/` | Browser extraction, liveness checks, agent inbox |
| `reply/` | Employer reply classification |
| `other/` | Miscellaneous utilities (OpenRouter, assessments, archiving) |
| `salary/` | Compensation gap analysis |
| `interview/` | STAR story matching for interview prep |
| `export/` | Dashboard build and data export |

## Documentation

- **[INDEX.md](INDEX.md)** — Quick-reference index of all packages
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Design principles, data flow, tree
- **[docs/](docs/)** — Per-package documentation (13 files)
- **[docs/testing.md](docs/testing.md)** — Test structure and conventions
- **[docs/cli-bridge.md](docs/cli-bridge.md)** — CLI invocation patterns
- **[../../docs/plans/python-migration-remaining.md](../../docs/plans/python-migration-remaining.md)** — Full migration plan

## Conventions

- All CLI modules expose `main(argv: list[str] | None = None) -> int`
- Invocation via `python -m scripts.python.<pkg>.<module>`
- `pathlib.Path` for all file paths
- `argparse` for CLI argument parsing
- `fcntl.flock` for file locking in tracker operations
- Tests use `pytest` with `tmp_path` fixtures

## Running Tests

```bash
python -m pytest scripts/python/tests -q
```

237 tests across 28 test files. All passing.

## Migration Status

100% complete. 73 JS scripts ported to 86 Python modules. Zero stubs, zero TODOs.
