# Dashboard -- Career-Ops Web + TUI

Go TUI and web dashboard companion that reads the career-ops `applications.md` tracker.

## Relationship to Parent

- Module: `github.com/santifer/career-ops/dashboard`
- Reads data from the **parent career-ops directory** (not from within dashboard)
- The parent `AGENTS.md` at `/Users/marlow/Documents/Carreira/AGENTS.md` has full context on career-ops

## Stack

- **`AppJob/`** — Web dashboard (new frontend, active development)
  - HTML + Tailwind CSS + custom Material 3 dark theme
  - Manrope (headlines) + Inter (body) fonts
  - Glassmorphism panels, SVG charts, mobile responsive
  - Design spec: `AppJob/DESIGN.md`
  - Entry: `AppJob/code.html` (and variants for iteration)
- **`internal/`** — Go TUI (preserved, read-only)
  - Bubbletea v1.3.10 + Lipgloss v1.1.0
  - Go 1.24.2

## Run

### Web (AppJob)
```bash
open /Users/marlow/Documents/Carreira/dashboard/AppJob/code.html
```

### Go TUI
```bash
go run . -path /Users/marlow/Documents/Carreira
go build . -o career-dashboard
```

## Build / Test

```bash
go build ./...
go vet ./...
```

## Key Files

| Path | Description |
|------|-------------|
| `AppJob/DESIGN.md` | Design system spec ("Digital Observatory", glassmorphism, tonal surfaces) |
| `AppJob/code.html` | Latest dashboard HTML iteration |
| `AppJob/screen.png` | Design reference screenshot |
| `AppJob/_archive/` | Legacy `dashboard.html`, `dashboard-old.html` (archived) |
| `main.go` | TUI entry point |
| `internal/data/career.go` | Parse/write `applications.md`, 5-tier URL resolution, status normalization |
| `internal/ui/screens/pipeline.go` | TUI pipeline view |
| `internal/ui/screens/viewer.go` | TUI report markdown viewer |

## Data Flow (TUI)

1. `ParseApplications(careerOpsPath)` reads `applications.md` (or `data/applications.md`)
2. Reports lazy-loaded for enrichment (archetype, TL;DR, remote, comp)
3. Job URLs resolved via 5-tier strategy: report header → batch-input → batch-state → scan-history → company fallback
4. `UpdateApplicationStatus()` writes back to `applications.md` in-place
5. Metrics recomputed after each status change

## Status Normalization

`NormalizeStatus()` in `data/career.go` handles English and Spanish. Keep in sync with career-ops `templates/states.yml`.
