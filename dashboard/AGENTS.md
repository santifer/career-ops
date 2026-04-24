# Dashboard Context

`dashboard/` is the Go dashboard for browsing Career Ops data.

Run commands from this directory:

```bash
go test ./...
go build ./...
```

The dashboard should read pipeline/tracker data and present it. It must not become a second source of truth for application states, scoring rules, or report numbering. Use `../templates/states.yml` and existing data files as the authoritative inputs.

Important areas:

- `main.go` wires the app.
- `internal/data/` reads project files.
- `internal/model/` defines dashboard models.
- `internal/ui/screens/` contains Bubble Tea screens and tests.
- `internal/theme/` contains visual theme code.
- `web/` contains the web terminal bridge and websocket server.

Keep UI behavior deterministic and testable. Prefer focused tests under `internal/ui/screens/` or the relevant package.
