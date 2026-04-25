# Career Ops Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for same-session execution or superpowers:executing-plans for fresh-session execution from this document. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Career Ops Mission Control localhost cockpit: a Go-served HTML/CSS/JS dashboard that reads the existing tracker, reports, PDFs, pipeline files, and profile context; runs safe internal actions; and exposes a visible Auto Mode run gate that stops before final application submission.

**Architecture:** Add a new `dashboard/cockpit` command beside the existing Bubble Tea TUI and `dashboard/web` PTY bridge. Reuse `dashboard/internal/data` and `dashboard/internal/model` for canonical tracker parsing, then add focused `dashboard/internal/cockpit` services for API DTOs, profile YAML, run records, action execution, and status validation. Keep files as the source of truth; the browser is only an operational view/controller.

**Tech Stack:** Go 1.24, `net/http`, `embed`, standard-library JSON, `gopkg.in/yaml.v3` for YAML profile/state parsing, vanilla HTML/CSS/JS, no frontend build step, existing Node scripts for Career Ops actions.

---

## Current Baseline

- Existing entrypoints remain unchanged:
  - `dashboard/main.go`: Bubble Tea TUI.
  - `dashboard/web/web.go`: PTY terminal bridge.
- Existing reusable data functions:
  - `dashboard/internal/data.ParseApplications`
  - `dashboard/internal/data.ComputeMetrics`
  - `dashboard/internal/data.ComputeProgressMetrics`
  - `dashboard/internal/data.LoadReportSummary`
  - `dashboard/internal/data.UpdateApplicationStatus`
  - `dashboard/internal/data.NormalizeStatus`
- Baseline commands already pass before implementation:
  - `cd dashboard; go test ./...`
  - `node verify-pipeline.mjs`
- The implementation must not touch final application submission behavior. Auto Mode may prepare and fill, but must stop at `Ready for Review` until the user explicitly approves the final submit action.

---

## Batch 1: Cockpit Command Skeleton

**Purpose:** Create the new localhost web app without changing the TUI or PTY bridge.

- [ ] Create `dashboard/cockpit/main.go`.
- [ ] Create `dashboard/cockpit/server.go`.
- [ ] Create `dashboard/cockpit/server_test.go`.
- [ ] Add embedded static files:
  - `dashboard/cockpit/static/index.html`
  - `dashboard/cockpit/static/styles.css`
  - `dashboard/cockpit/static/app.js`
- [ ] Implement flags:
  - `-path` defaults to `..`
  - `-port` defaults to `8080`
- [ ] Serve:
  - `GET /` -> embedded `index.html`
  - `GET /static/styles.css`
  - `GET /static/app.js`
  - `GET /api/health`

Implementation shape:

```go
// dashboard/cockpit/main.go
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
)

func main() {
	root := flag.String("path", "..", "Career Ops project root")
	port := flag.Int("port", 8080, "localhost port")
	flag.Parse()

	server, err := NewServer(*root)
	if err != nil {
		log.Fatal(err)
	}

	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	log.Printf("Career Ops cockpit listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, server.Routes()))
}
```

Test requirements:

- [ ] `TestHealthEndpoint` uses `httptest` and expects HTTP 200.
- [ ] `TestIndexEndpoint` expects HTML containing `Career Ops Mission Control`.

Validation:

```powershell
cd "D:\Career Ops\dashboard"
go test ./...
go run ./cockpit -path .. -port 8080
```

Expected:

```text
Career Ops cockpit listening on http://127.0.0.1:8080
```

---

## Batch 2: Cockpit Service Layer

**Purpose:** Provide JSON-ready data without putting business rules in JavaScript.

- [ ] Create `dashboard/internal/cockpit/types.go`.
- [ ] Create `dashboard/internal/cockpit/service.go`.
- [ ] Create `dashboard/internal/cockpit/service_test.go`.
- [ ] Define DTOs:
  - `OverviewResponse`
  - `ApplicationDTO`
  - `ApplicationDetailResponse`
  - `HealthResponse`
  - `PipelineSummary`
- [ ] Implement `Service.LoadOverview(ctx)`.
- [ ] Implement `Service.ListApplications(ctx)`.
- [ ] Implement `Service.GetApplication(ctx, number int)`.
- [ ] Enrich applications with report summary by calling `data.LoadReportSummary`.
- [ ] Preserve the canonical score/status values coming from `data/applications.md`.
- [ ] Return warnings instead of panics when optional files are missing.

Implementation shape:

```go
type Service struct {
	Root string
	Clock func() time.Time
}

func NewService(root string) (*Service, error) {
	if strings.TrimSpace(root) == "" {
		return nil, errors.New("career ops root is required")
	}
	return &Service{Root: root, Clock: time.Now}, nil
}
```

Test requirements:

- [ ] Use `t.TempDir()` with a minimal `data/applications.md`.
- [ ] Verify `ListApplications` returns the parsed row.
- [ ] Verify `LoadOverview` computes totals and score metrics.
- [ ] Verify missing optional reports do not fail the whole response.

Validation:

```powershell
cd "D:\Career Ops\dashboard"
go test ./internal/cockpit ./internal/data ./internal/model
```

Expected:

```text
ok  	github.com/santifer/career-ops/dashboard/internal/cockpit
```

---

## Batch 3: Canonical States And Safe Tracker Writes

**Purpose:** Prevent the cockpit from writing invalid statuses or duplicating tracker logic.

- [ ] Add `dashboard/internal/cockpit/states.go`.
- [ ] Add `dashboard/internal/cockpit/states_test.go`.
- [ ] Parse `templates/states.yml` using `gopkg.in/yaml.v3`.
- [ ] Add dependency from `dashboard/`:

```powershell
cd "D:\Career Ops\dashboard"
go get gopkg.in/yaml.v3
```

- [ ] Implement `LoadStates(root string) ([]State, error)`.
- [ ] Implement `ValidateStatus(root string, status string) (canonical string, error)`.
- [ ] Add service method `UpdateApplicationStatus(ctx, appNumber, status)`.
- [ ] Delegate actual file update to `data.UpdateApplicationStatus`.
- [ ] Reject empty, unknown, markdown-decorated, or date-suffixed status values before writing.

Test requirements:

- [ ] Unknown status returns an error and does not modify the tracker.
- [ ] Alias status is normalized to canonical label only if `templates/states.yml` defines it.
- [ ] Valid status updates exactly one existing row.

Validation:

```powershell
cd "D:\Career Ops\dashboard"
go test ./internal/cockpit ./internal/data
cd "D:\Career Ops"
node verify-pipeline.mjs
```

Expected:

```text
Pipeline is clean!
```

---

## Batch 4: Application Profile File

**Purpose:** Add the private, extensible form-filling profile requested by the user.

- [ ] Create `context/application-profile.yml` if it does not exist.
- [ ] Create `dashboard/internal/cockpit/profile.go`.
- [ ] Create `dashboard/internal/cockpit/profile_test.go`.
- [ ] Implement the approved schema:
  - `identity`
  - `personal`
  - `address`
  - `availability`
  - `compensation`
  - `languages`
  - `documents`
  - `form_answers`
  - `custom_fields`
- [ ] Implement `LoadApplicationProfile(root string)`.
- [ ] Implement `SaveApplicationProfile(root string, profile ApplicationProfile)`.
- [ ] Implement `MissingProfileFields(profile) []MissingField`.
- [ ] Treat sensitive fields as visible-at-review fields:
  - gender
  - race/ethnicity
  - disability status
  - veteran status
  - date of birth
  - precise address
- [ ] Do not store secrets, passwords, cookies, MFA codes, or API keys.

File seed:

```yaml
identity:
  full_name: ""
  preferred_name: ""
  email: ""
  phone:
    country_code: ""
    number: ""
    whatsapp: false
  linkedin: ""
  github: ""
personal:
  gender: ""
  pronouns: ""
  date_of_birth: ""
  nationality: ""
  work_authorization: ""
  disability_status: ""
  veteran_status: ""
  race_ethnicity: ""
address:
  country: ""
  state: ""
  city: ""
  neighborhood: ""
  street: ""
  number: ""
  complement: ""
  postal_code: ""
availability:
  notice_period: ""
  start_date: ""
  work_modes: []
  relocation: ""
  travel_availability: ""
compensation:
  currency: ""
  target_monthly: ""
  minimum_monthly: ""
  negotiable: true
languages:
  portuguese: ""
  english: ""
  spanish: ""
documents:
  default_cv: ""
  latest_tailored_cv: ""
  cover_letter_template: ""
  portfolio_url: ""
  case_studies: []
form_answers:
  why_this_company: ""
  why_this_role: ""
  why_should_we_hire_you: ""
  salary_expectation: ""
  notice_period: ""
  work_authorization: ""
  remote_hybrid_preference: ""
  leadership_style: ""
  biggest_achievement: ""
  reason_for_leaving: ""
custom_fields: {}
```

Test requirements:

- [ ] Missing profile file creates the seed template.
- [ ] Save then load preserves custom fields.
- [ ] Missing required contact fields are reported.
- [ ] Sensitive fields are marked for review and not silently hidden.

Validation:

```powershell
cd "D:\Career Ops\dashboard"
go test ./internal/cockpit
Test-Path "D:\Career Ops\context\application-profile.yml"
```

Expected:

```text
True
```

---

## Batch 5: JSON API Routes

**Purpose:** Make the cockpit usable by the browser with a small, testable API.

- [ ] Add route handlers in `dashboard/cockpit/handlers.go`.
- [ ] Add route tests in `dashboard/cockpit/handlers_test.go`.
- [ ] Implement:
  - `GET /api/overview`
  - `GET /api/applications`
  - `GET /api/applications/{id}`
  - `GET /api/profile`
  - `POST /api/profile`
  - `POST /api/applications/{id}/status`
- [ ] Return JSON errors with stable shape:

```json
{
  "error": {
    "code": "invalid_status",
    "message": "Status must be one of templates/states.yml"
  }
}
```

- [ ] Use `http.StatusBadRequest` for validation failures.
- [ ] Use `http.StatusNotFound` for missing applications.
- [ ] Use `http.StatusInternalServerError` only for unexpected file or command failures.

Test requirements:

- [ ] Overview route returns totals.
- [ ] Applications route returns array data.
- [ ] Detail route returns 404 for missing id.
- [ ] Profile route creates profile when missing.
- [ ] Status update route rejects invalid status.

Validation:

```powershell
cd "D:\Career Ops\dashboard"
go test ./cockpit ./internal/cockpit
go run ./cockpit -path .. -port 8080
```

Manual smoke:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/overview
Invoke-RestMethod http://127.0.0.1:8080/api/applications
```

---

## Batch 6: Run Records And Internal Actions

**Purpose:** Make actions visible and auditable instead of firing black-box commands.

- [ ] Create `dashboard/internal/cockpit/runs.go`.
- [ ] Create `dashboard/internal/cockpit/actions.go`.
- [ ] Create `dashboard/internal/cockpit/runs_test.go`.
- [ ] Store run JSON files under `data/runs/{run_id}.json`.
- [ ] Define run states:
  - `Queued`
  - `Running`
  - `Needs Input`
  - `Ready for Review`
  - `Submitted`
  - `Failed`
  - `Cancelled`
- [ ] Implement `RunStore.Create`.
- [ ] Implement `RunStore.Update`.
- [ ] Implement `RunStore.Get`.
- [ ] Implement `ActionRunner.RunVerify`.
- [ ] Implement `ActionRunner.RunScan`.
- [ ] Implement `ActionRunner.RunPDF` as a controlled wrapper around existing PDF generation only when the application has a report/job context.
- [ ] Capture command, exit code, stdout tail, stderr tail, start time, end time, artifacts, and error message.

Command rules:

- `verify` runs `node verify-pipeline.mjs` from repo root.
- `scan` runs `node scan.mjs` from repo root.
- `pdf` uses the existing Career Ops PDF flow and records generated artifact paths.
- Commands must use context timeouts.
- Commands must never receive browser credentials or secrets from the profile.

API additions:

- [ ] `POST /api/actions/verify`
- [ ] `POST /api/actions/scan`
- [ ] `POST /api/actions/pdf`
- [ ] `GET /api/runs/{id}`
- [ ] `POST /api/runs/{id}/cancel`

Test requirements:

- [ ] Run file is written with stable JSON.
- [ ] Failed command records `Failed` status and stderr.
- [ ] Cancelled run records `Cancelled` without deleting history.
- [ ] Verify action can be tested with a fake command runner.

Validation:

```powershell
cd "D:\Career Ops\dashboard"
go test ./internal/cockpit ./cockpit
cd "D:\Career Ops"
node verify-pipeline.mjs
```

---

## Batch 7: Auto Mode Envelope

**Purpose:** Implement the safe run contract for browser-assisted applications without pretending Go can bypass live website constraints.

- [ ] Add `dashboard/internal/cockpit/auto_mode.go`.
- [ ] Add `dashboard/internal/cockpit/auto_mode_test.go`.
- [ ] Implement `StartAutoMode(applicationID or URL)`.
- [ ] Create run step list:
  - `Analyze JD`
  - `Evaluate`
  - `Prepare CV`
  - `Open Application`
  - `Inspect Form`
  - `Map Fields`
  - `Answer Fields`
  - `Attach CV`
  - `Ready for Review`
  - `Approved Submit`
  - `Sync Dashboard`
- [ ] Add API:
  - `POST /api/actions/auto-mode/start`
  - `POST /api/runs/{id}/field-observation`
  - `POST /api/runs/{id}/needs-input`
  - `POST /api/runs/{id}/ready-for-review`
  - `POST /api/runs/{id}/approve-submit`
- [ ] `approve-submit` only records explicit user approval. The actual browser submit remains a Codex/browser step and must be done only after approval.
- [ ] Store observed fields and answers in the run record:
  - field label
  - field type
  - required flag
  - source used
  - answer summary
  - sensitive flag
  - unresolved reason
- [ ] If a required visible field lacks safe profile/CV data, set run to `Needs Input`.
- [ ] If login, password, MFA, CAPTCHA, anti-bot, or permission prompt appears, set run to `Needs Input`.
- [ ] Never generate answers for fields that were not actually observed on the live form.

Test requirements:

- [ ] Auto Mode starts as `Queued` or `Running`.
- [ ] Missing required profile field transitions to `Needs Input`.
- [ ] All sensitive observed fields are included in review payload.
- [ ] `approve-submit` fails unless run status is `Ready for Review`.
- [ ] `approve-submit` fails unless request includes explicit approval text.

Validation:

```powershell
cd "D:\Career Ops\dashboard"
go test ./internal/cockpit
```

Manual safety check:

- [ ] Start Auto Mode for a known application.
- [ ] Confirm UI shows run steps.
- [ ] Confirm no route submits an external application by itself.

---

## Batch 8: Mission Control UI

**Purpose:** Build the browser cockpit experience without a frontend build system.

- [ ] Implement `dashboard/cockpit/static/index.html`.
- [ ] Implement `dashboard/cockpit/static/styles.css`.
- [ ] Implement `dashboard/cockpit/static/app.js`.
- [ ] Visual direction:
  - self-hosted typography from `fonts/` where practical
  - warm command-center palette
  - non-flat background with gradients/noise/shapes
  - compact dense data cards
  - right-side action rail
  - visible run timeline
- [ ] Avoid default `Inter`, `Roboto`, `Arial`, or system font stacks.
- [ ] Add server routes for safe static font access if needed.
- [ ] Render:
  - left navigation and health panel
  - overview cards
  - search and filters
  - ranked applications table
  - selected application drawer
  - action rail
  - profile editor
  - run drawer/timeline
  - Auto Mode review gate
- [ ] Use `fetch` and progressive enhancement only.
- [ ] Keep canonical writes in Go APIs; JS only sends user intent.

UI behavior:

- [ ] Initial load calls `/api/overview`, `/api/applications`, and `/api/profile`.
- [ ] Selecting a row calls `/api/applications/{id}`.
- [ ] Status changes call `/api/applications/{id}/status`.
- [ ] Run buttons call action endpoints and poll `/api/runs/{id}`.
- [ ] Missing profile fields are visible in the profile panel and Auto Mode drawer.
- [ ] Ready-for-review view lists every observed field, answer, source, CV file, warnings, and unresolved item.

Manual browser checks:

- [ ] Open `http://127.0.0.1:8080/`.
- [ ] Confirm desktop layout works.
- [ ] Confirm mobile/narrow layout works.
- [ ] Search by company.
- [ ] Filter by status.
- [ ] Open report/PDF links.
- [ ] Run verify and see logs.
- [ ] Edit profile and reload.
- [ ] Start Auto Mode and verify it stops before submit.

---

## Batch 9: End-To-End Verification

**Purpose:** Prove the implementation did not break the existing pipeline and is ready for the user's browser.

- [ ] Run Go tests:

```powershell
cd "D:\Career Ops\dashboard"
go test ./...
```

- [ ] Run pipeline health:

```powershell
cd "D:\Career Ops"
node verify-pipeline.mjs
```

- [ ] Run the cockpit:

```powershell
cd "D:\Career Ops\dashboard"
go run ./cockpit -path .. -port 8080
```

- [ ] Test in the in-app browser using Browser Use:
  - navigate to `http://127.0.0.1:8080/`
  - inspect visible UI
  - run verify from UI
  - open one application detail
  - save profile field
  - start Auto Mode safe run
- [ ] Check git diff:

```powershell
cd "D:\Career Ops"
git status --short
git diff --stat
```

- [ ] Confirm `.superpowers/` remains uncommitted unless the user explicitly asks otherwise.
- [ ] Confirm no secrets, credentials, cookies, or MFA data were added.

Expected completion state:

- `go test ./...` passes.
- `node verify-pipeline.mjs` passes.
- Cockpit opens on localhost.
- Dashboard data matches `data/applications.md`.
- Status writes preserve canonical states.
- Profile file exists and is editable.
- Run records are written under `data/runs/`.
- Auto Mode reaches review gate but does not submit without approval.

---

## Risks And Guardrails

- **Risk:** Creating a second source of truth.
  **Guardrail:** All tracker data reads/writes go through existing files and Go service methods.

- **Risk:** Invalid statuses corrupt `data/applications.md`.
  **Guardrail:** Validate against `templates/states.yml` before calling `data.UpdateApplicationStatus`.

- **Risk:** Auto Mode submits applications without review.
  **Guardrail:** No Go endpoint performs external website submission. `approve-submit` records approval only and requires `Ready for Review`.

- **Risk:** Sensitive profile data leaks into logs.
  **Guardrail:** Run records store summaries and explicit observed fields, not secrets or browser credentials.

- **Risk:** Frontend grows business logic.
  **Guardrail:** JavaScript renders state and sends user intent; Go validates and mutates files.

- **Risk:** Existing TUI breaks.
  **Guardrail:** New code lives in `dashboard/cockpit` and `dashboard/internal/cockpit`; existing TUI packages are reused, not rewritten.

---

## Execution Options After Plan Approval

1. **Subagent-Driven Execution:** Best for speed if the user explicitly authorizes subagents. Split independent batches across workers with disjoint write scopes, then integrate and test.
2. **Inline Execution:** Best for tight control in this current thread. Implement batches sequentially with tests after each batch.

No implementation should start until the user chooses one execution mode.
