# Architecture — `scripts/python/`

## Package Tree

```
scripts/python/
├── admin/           (12 modules)   System admin, validation, diagnostics
├── cv/              (11 modules)   CV generation (HTML, LaTeX, PDF, cover letters)
├── evaluation/      (7 modules)    LLM-powered offer evaluation
├── export/          (2 modules)    Dashboard + data export
├── interview/       (2 modules)    Interview prep (STAR matching)
├── other/           (9 modules)    Miscellaneous utilities
├── pipeline/        (6 modules)    Browser extraction, liveness, agent inbox
├── plugins/         (6 modules)    External integrations (Gmail, Notion, Apify)
├── reply/           (4 modules)    Employer reply classification
├── salary/          (2 modules)    Compensation gap analysis
├── scanner/         (6 modules)    Job posting discovery
├── tracker/         (19 modules)   Pipeline tracking + data integrity
├── tests/           (28 files)     237 tests across all packages
├── docs/            (14 files)     Package documentation
├── ARCHITECTURE.md                 This file
├── INDEX.md                        Quick-reference index
├── README.md                       Project overview
└── pyproject.toml                  Python project config
```

## Design Principles

### 1. One-to-one JS → Python parity
Every module in `scripts/archived-js/` has a Python equivalent. Same behavior, same CLI flags, same data files.

### 2. Canonical `main()` signature
All CLI modules expose:
```python
def main(argv: list[str] | None = None) -> int:
```
When `argv` is `None`, defaults to `sys.argv[1:]`. Returns exit code.

### 3. `python -m` invocation
No shebang scripts or wrapper files. Everything runs via `python -m scripts.python.<pkg>.<module>`.

### 4. `pathlib.Path` everywhere
No string concatenation for paths. `Path(__file__).resolve().parents[N]` for project-root resolution.

### 5. Argument parsing via `argparse`
Every CLI module uses `argparse` with identical flags to the JS originals.

## Data Flow

```
portals.yml ──► scanner/ ──► data/scan-history.tsv
                                  │
                                  ▼
                          data/pipeline.md
                                  │
                                  ▼
                    evaluation/ ──► reports/*.md
                          │
                          ▼
                    cv/ ──► output/*.pdf
                          │
                          ▼
                    tracker/ ──► data/applications.md
```

## Cross-cutting Concerns

| Concern | Location |
|---------|----------|
| File locking | `fcntl.flock` in tracker/merge, tracker/set-status |
| SSL on macOS | Fixed via `Install Certificates.command` |
| Config loading | `config/profile.yml`, `portals.yml` via `yaml.safe_load` |
| Secrets | `dotenv` in `plugins/engine.py`, never in source |
| Path resolution | `Path(__file__).resolve().parents[...]` |

## Key Dependencies

```toml
[project]
dependencies = [
    "pyyaml",         # Config files
    "python-dotenv",  # Environment variables
    "certifi",        # SSL certificates
    "playwright",     # Browser automation (via subprocess)
    "rapidfuzz",      # Fuzzy matching (tracker/role_matcher)
    "httpx",          # HTTP client
]
```

## Test Architecture

- `pytest` with `tmp_path` fixtures for isolated file I/O
- No `__init__.py` in `tests/` (standard pytest auto-discovery)
- 28 test files, 237 tests, 12 packages covered
- CI: GitHub Actions runs `python -m pytest scripts/python/tests -q`

## Related Documentation

- `docs/plans/python-migration-remaining.md` — Migration plan and session log
- `docs/plans/cli-bridge.md` — CLI bridge implementation plan
- `docs/architecture/README.md` — Full project architecture
