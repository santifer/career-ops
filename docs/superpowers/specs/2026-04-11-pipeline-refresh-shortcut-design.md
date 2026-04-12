# Pipeline TUI — Refresh Shortcut

## Problem

The Go TUI dashboard (`dashboard/`) renders `applications.md` and per-row
report summaries once at startup. If the underlying files change while the
TUI is open — new evaluations land, statuses are edited externally, report
contents are updated — the user has to quit and relaunch to see them.

## Goal

Add an `r` keybinding to the pipeline screen that re-reads
`applications.md` **and** all report summaries from disk, preserving UI
state (cursor, active tab, sort mode, view mode, scroll offset).

## Non-goals

- Refresh inside the report viewer screen (`viewer.go`). Scope is the
  pipeline screen only.
- Asynchronous / background refresh. The existing startup load path is
  synchronous and fast enough; refresh will reuse it.
- A visible "refreshing…" indicator. The operation is near-instant.
- File-watching / auto-refresh on change.

## Design

### Key binding

- `r` on the pipeline screen triggers a refresh.
- Disabled while the status picker overlay is open (`m.statusPicker`
  branch in `handleStatusPicker` stays untouched).
- Added to the help footer in `renderHelp()`.

### Message

New message type in `dashboard/internal/ui/screens/pipeline.go`:

```go
// PipelineRefreshMsg requests a full reload of applications and reports.
type PipelineRefreshMsg struct {
    CareerOpsPath string
}
```

`handleKey` gains:

```go
case "r":
    path := m.careerOpsPath
    return m, func() tea.Msg {
        return PipelineRefreshMsg{CareerOpsPath: path}
    }
```

### In-place refresh method

Today the status-update handler in `main.go:62-68` rebuilds the entire
`PipelineModel` via `NewPipelineModel(...)` and silently loses cursor,
active tab, sort mode, view mode, and scroll offset. Refresh must not do
that. Add an in-place method on `PipelineModel`:

```go
// Refresh replaces apps/metrics and clears the report cache so the next
// render re-reads summaries from disk. Preserves cursor, tab, sort, view,
// and scroll state. Clamps cursor if rows disappeared.
func (m *PipelineModel) Refresh(
    apps []model.CareerApplication,
    metrics model.PipelineMetrics,
) {
    m.apps = apps
    m.metrics = metrics
    m.reportCache = make(map[string]reportSummary)
    m.applyFilterAndSort()
    if m.cursor >= len(m.filtered) {
        m.cursor = len(m.filtered) - 1
    }
    if m.cursor < 0 {
        m.cursor = 0
    }
    m.adjustScroll()
}
```

### `main.go` handler

New case in `appModel.Update`, modeled on the existing startup enrichment
loop at `main.go:141-149`:

```go
case screens.PipelineRefreshMsg:
    apps := data.ParseApplications(msg.CareerOpsPath)
    if apps == nil {
        return m, nil // keep current state on failure
    }
    metrics := data.ComputeMetrics(apps)
    m.pipeline.Refresh(apps, metrics)
    for _, app := range apps {
        if app.ReportPath == "" {
            continue
        }
        archetype, tldr, remote, comp := data.LoadReportSummary(
            msg.CareerOpsPath, app.ReportPath,
        )
        if archetype != "" || tldr != "" || remote != "" || comp != "" {
            m.pipeline.EnrichReport(app.ReportPath, archetype, tldr, remote, comp)
        }
    }
    return m, nil
```

Failure mode: if `ParseApplications` returns nil (file missing / unreadable
mid-session), keep existing state rather than blanking the UI.

### Help footer

`renderHelp()` gains `r refresh` between `v view` and `Esc quit`. If the
row gets too wide for narrow terminals the gap calculation already handles
it (clamps to `gap >= 1`).

## Files touched

- `dashboard/internal/ui/screens/pipeline.go` — new message type, `r`
  case in `handleKey`, `Refresh` method, help footer entry.
- `dashboard/main.go` — new `PipelineRefreshMsg` case in `Update`.

No new dependencies. No changes to `data/*`, `theme/*`, or `viewer.go`.

## Verification

- `go build ./...` inside `dashboard/` succeeds.
- `go vet ./...` inside `dashboard/` is clean.
- Manual: launch dashboard, edit `data/applications.md` in another
  terminal (e.g., change a status), press `r`, row updates in place.
- Manual: cursor on row 5 with sort=date, view=grouped, tab=APPLIED —
  press `r`, all four settings remain.
