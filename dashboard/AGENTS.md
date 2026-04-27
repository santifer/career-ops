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
- `cockpit/` is the browser cockpit: Go HTTP server plus embedded `static/index.html`, `static/styles.css`, and `static/app.js`.
- `cockpit/local_worker.go` owns the local-only worker process launcher for visible Auto Mode. Keep it loopback-only, authenticated, fixed-command, and secret-redacted.
- `cockpit/handlers.go` exposes human cockpit APIs, worker APIs, and local worker launcher APIs.
- `internal/data/` reads project files.
- `internal/cockpit/` contains cockpit domain services: applications/profile DTOs, run state, Auto Mode runtime store, auth, pairing, fill plan, gates, and worker contracts.
- `internal/model/` defines dashboard models.
- `internal/ui/screens/` contains Bubble Tea screens and tests.
- `internal/theme/` contains visual theme code.
- `web/` contains the web terminal bridge and websocket server.

Auto Mode rules:

- The preferred local UX is one-click worker launch from the Auto Mode panel. The frontend calls `/api/local-worker/start`; the backend creates/exchanges pairing credentials and injects the worker credential only into the spawned process environment.
- Do not expose worker credentials, pairing tokens, service-account material, or approval authority in static frontend assets, browser storage, query strings, copied commands, screenshots, or logs.
- Hosted or non-loopback mode must not attempt to launch a local process. Return/show an explicit unsupported state and keep the manual pairing flow as advanced fallback.
- `workers/browser-worker.mjs` drives the visible Playwright browser and reports claim, heartbeat, logs, field observations, `Needs Input`, upload gate, and review gate state.
- Final submit, PDF upload, and tracker status `Applied` must remain separate server-side/user-approved gates. The worker may prepare and fill high-confidence fields, but it must not silently submit or mark the tracker as applied.

Keep UI behavior deterministic and testable. Prefer focused tests under `internal/ui/screens/` or the relevant package.
