# Index — `scripts/python/`

Quick reference to all Python packages and their modules.

## Packages

| Package | Modules | Description | Docs |
|---------|---------|-------------|------|
| **admin** | 12 | System admin, validation, diagnostics | [docs/admin.md](docs/admin.md) |
| **cv** | 11 | CV generation (HTML, LaTeX, PDF, cover letters) | [docs/cv.md](docs/cv.md) |
| **evaluation** | 7 | LLM-powered offer evaluation | [docs/evaluation.md](docs/evaluation.md) |
| **export** | 2 | Dashboard + data export | [docs/export.md](docs/export.md) |
| **interview** | 2 | Interview prep (STAR matching) | [docs/interview.md](docs/interview.md) |
| **other** | 9 | Miscellaneous utilities | [docs/other.md](docs/other.md) |
| **pipeline** | 6 | Browser extraction, liveness, agent inbox | [docs/pipeline.md](docs/pipeline.md) |
| **plugins** | 6 | External integrations (Gmail, Notion, Apify) | [docs/plugins.md](docs/plugins.md) |
| **reply** | 4 | Employer reply classification | [docs/reply.md](docs/reply.md) |
| **salary** | 2 | Compensation gap analysis | [docs/salary.md](docs/salary.md) |
| **scanner** | 6 | Job posting discovery | [docs/scanner.md](docs/scanner.md) |
| **tracker** | 19 | Pipeline tracking + data integrity | [docs/tracker.md](docs/tracker.md) |
| **tests** | 28 | Test suite (237 tests) | [docs/testing.md](docs/testing.md) |

## Quick Commands

| Task | Command |
|------|---------|
| Check setup | `npm run doctor` |
| Scan portals | `npm run scan` |
| Full ATS scan | `npm run scan:full` |
| Merge tracker | `npm run merge` |
| Verify pipeline | `npm run verify` |
| Generate CV PDF | `npm run pdf` |
| Evaluate offer | `npm run openai:eval` |
| Match STAR stories | `npm run star` |
| Run all tests | `python -m pytest scripts/python/tests -q` |
| Run updates | `npm run update:check` |

## Documentation

| File | Purpose |
|------|---------|
| [README.md](README.md) | Overview and getting started |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Package tree, design principles, data flow |
| [docs/](docs/) | Per-package documentation |
| [docs/cli-bridge.md](docs/cli-bridge.md) | CLI invocation and npm bridge |
| [docs/testing.md](docs/testing.md) | Test structure and conventions |
