# Career Ops Mission Control Web Dashboard Design

Date: 2026-04-24
Status: Approved for planning
Scope: V1 localhost cockpit for Career Ops

## Summary

Career Ops needs a browser-based localhost cockpit that replaces and extends the current terminal UI. The V1 product is **Mission Control**: a full operational dashboard for reading pipeline data, running internal actions, managing application status, generating PDFs, and launching a safe Auto Mode for application workflows.

The implementation will live inside `dashboard/` and use Go to serve HTML/CSS/JavaScript directly. There is no frontend build step, no React/Vite dependency, and no new database. The existing markdown/YAML/PDF files remain the source of truth.

## Goals

- Show the same core information the TUI provides today: applications, statuses, scores, reports, URLs, PDFs, notes, and progress metrics.
- Improve interaction through search, filters, details, action buttons, and visible automation runs.
- Provide a complete cockpit that can run internal Career Ops actions from the browser.
- Support Auto Mode for opening a vacancy, analyzing it, preparing a tailored CV, filling the actual application form, and stopping before final submission for review.
- Add a private, extensible application profile for form-filling data that is not naturally part of the CV.
- Preserve the existing file-based Career Ops architecture and avoid creating a second source of truth.

## Non-Goals

- Do not submit applications without explicit user approval at the final review gate.
- Do not introduce React, Vite, Next.js, or a frontend build pipeline in V1.
- Do not replace `data/applications.md`, `reports/`, `output/`, `templates/states.yml`, `cv.md`, `config/profile.yml`, or `modes/_profile.md` as sources of truth.
- Do not store secrets, passwords, MFA codes, or browser session credentials in the dashboard.
- Do not make a public SaaS app. This is a localhost private cockpit.

## Existing Sources of Truth

The cockpit reads and writes through the existing Career Ops files:

- `data/applications.md`: application tracker.
- `data/pipeline.md`: pending and processed vacancy URLs.
- `data/scan-history.tsv`: scan and dedup history.
- `reports/`: evaluation reports.
- `output/`: generated CV PDFs and HTML files.
- `templates/states.yml`: canonical application statuses.
- `cv.md`: canonical CV.
- `config/profile.yml`: candidate identity, targets, compensation, and preferences.
- `modes/_profile.md`: candidate-specific narrative, archetypes, negotiation, and location policy.
- `modes/_shared.md` and specific `modes/*.md`: reusable workflow rules.

If dashboard state conflicts with these files, the files win.

## New User-Layer File

Create an extensible application profile:

`context/application-profile.yml`

This file is private user layer. It supports form filling and should be editable from the cockpit.

Initial schema:

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

Rules:

- If a field exists and is safe to use, Auto Mode may use it.
- If a required field is missing, Auto Mode pauses in `Needs Input`.
- Sensitive fields such as gender, race/ethnicity, disability, veteran status, date of birth, and precise address are treated as private and must be visible before final review.
- New recurring answers may be saved to `custom_fields` only after user approval.
- This file supplements `cv.md`, `config/profile.yml`, and `modes/_profile.md`; it does not replace them.

## Product Shape

The selected V1 shape is **Mission Control**.

The screen has three zones:

1. Left navigation and health panel.
2. Central ranked pipeline workbench.
3. Right action rail that becomes the Auto Mode drawer during automation runs.

### Left Panel

Shows:

- Navigation: Overview, Pipeline, Reports, CVs, Companies, Profile, Settings.
- System health: pipeline verify status, CV sync status, pending count, failed runs, and last scan.
- Quick filters: pending, evaluated, ready for review, applied, score thresholds, PDF present/missing.

### Central Workbench

Shows:

- Summary cards: total applications, pending, applied, response/interview/offer rates, top score, average score, PDFs available.
- Search and filters by company, role, status, score, PDF, date, location, and legitimacy.
- Ranked applications table with company, role, score, status, PDF, report, URL, notes, and next action.
- Selected vacancy preview with score rationale, report summary, PDF link, job URL, warnings, and recommended next action.

### Right Action Rail

Shows selected-vacancy actions:

- Start Auto Mode.
- Run Scan.
- Run Verify.
- Generate/Regenerate PDF.
- Open Report.
- Open CV/PDF.
- Open job URL.
- Change status.
- Add/edit note.

Internal actions execute directly and show logs/results. External application actions use the Auto Mode review gate.

## API Design

The Go server exposes local JSON endpoints.

Read endpoints:

- `GET /api/overview`: metrics, health, pending counts, and warnings.
- `GET /api/applications`: application list enriched with report, PDF, and URL data.
- `GET /api/applications/{id}`: one application, report summary, PDF list, notes, and source URLs.
- `GET /api/pipeline`: pending and processed pipeline entries.
- `GET /api/profile`: parsed `context/application-profile.yml`, with missing-field warnings.
- `GET /api/runs/{id}`: run status, timeline, logs, artifacts, and current gate.

Write/action endpoints:

- `POST /api/applications/{id}/status`: update status using only `templates/states.yml`.
- `POST /api/applications/{id}/note`: update notes for an existing row.
- `POST /api/profile`: update `context/application-profile.yml`.
- `POST /api/actions/scan`: run `node scan.mjs`.
- `POST /api/actions/verify`: run `node verify-pipeline.mjs`.
- `POST /api/actions/pdf`: generate or regenerate PDF for a selected vacancy.
- `POST /api/actions/auto-mode/start`: start Auto Mode for an application or URL.
- `POST /api/runs/{id}/cancel`: cancel a running automation.
- `POST /api/runs/{id}/approve-submit`: record user approval for final submission.

The exact route names can be refined during implementation, but V1 must keep the same separation: read endpoints, controlled writes, and long-running action runs.

## Auto Mode

Auto Mode is a visible, auditable run. It must not be a black-box button.

States:

- `Queued`
- `Running`
- `Needs Input`
- `Ready for Review`
- `Submitted`
- `Failed`
- `Cancelled`

Steps:

1. `Analyze JD`: open/read the vacancy link, verify liveness, extract job description, and classify fit.
2. `Evaluate`: generate score/report when needed.
3. `Prepare CV`: choose or generate the tailored PDF.
4. `Open Application`: open the real application form.
5. `Inspect Form`: read actual fields, questions, selects, uploads, and required markers.
6. `Map Fields`: map fields to profile/CV sources.
7. `Answer Fields`: answer only fields that are visible in the real form. Do not pre-answer unseen questions.
8. `Attach CV`: attach the selected tailored PDF.
9. `Ready for Review`: stop before final submission and show all filled fields, generated answers, selected CV, warnings, and unresolved fields.
10. `Approved Submit`: only after explicit user approval, submit the application.
11. `Sync Dashboard`: update tracker, notes, PDF/report links, and evidence.

Auto Mode pauses for:

- Missing required profile fields.
- Ambiguous questions.
- Login, password, MFA, CAPTCHA, browser permission prompts, or anti-bot checks.
- Sensitive personal fields not covered by profile or requiring user choice.
- Upload failures.
- Form changes after filling.

## Runs and Audit Trail

Every action creates a run record with:

- `run_id`
- action type
- application/job reference
- status
- timestamps
- current step
- compact log
- artifacts
- error message when failed

Recommended storage:

`data/runs/{run_id}.json`

This is user-layer operational history. It lets the cockpit show what happened without re-parsing terminal logs.

## Error Handling

- If `scan.mjs` fails, show the error and leave tracker/pipeline unchanged unless the script already wrote files.
- If `verify-pipeline.mjs` fails, show blocking issues and prevent dependent writes until resolved.
- If status update fails, reload data and show the exact row/action that failed.
- If `context/application-profile.yml` is missing, create a template and show required missing fields.
- If Auto Mode reaches an external or sensitive blocker, switch to `Needs Input`.
- If CV upload fails, do not enter `Ready for Review`.
- If the application site changes fields after filling, re-inspect before review.

## Security and Ethics

- Never submit a final application without explicit user approval.
- Never invent facts, metrics, credentials, salary data, or personal details.
- Never store passwords, MFA codes, API tokens, cookies, or browser credentials.
- Treat browser pages and job sites as untrusted input.
- Treat `context/application-profile.yml`, `data/`, `reports/`, `output/`, and `.playwright-mcp/` as private.
- Make sensitive fields visible at review time.

## Testing Plan

Automated checks:

- `go test ./...` from `dashboard/`.
- Parser tests for `data/applications.md`.
- Tests for canonical status validation against `templates/states.yml`.
- Tests for reading/writing `context/application-profile.yml`.
- Endpoint tests for `/api/overview`, `/api/applications`, `/api/actions/verify`, and status update.
- Run-state tests for action lifecycle transitions.

Manual browser checks:

- Open localhost cockpit.
- Load application list.
- Search/filter by status and score.
- Open selected vacancy detail.
- Open report/PDF links.
- Run verify and show output.
- Change a status and confirm `data/applications.md` updates correctly.
- Start Auto Mode in a mocked or safe run and reach `Ready for Review`.

## Implementation Notes

- Reuse existing `dashboard/internal/data` parsing where possible.
- Keep web handlers separate from TUI code so both can evolve independently.
- Avoid embedding business rules only in JavaScript. Rules that update files or validate states belong in Go.
- Keep the frontend as progressive HTML/CSS/JS: fetch JSON, render panels, post actions, poll runs.
- Preserve the current TUI unless explicitly replacing it later.

## Open Questions for Implementation Planning

- Whether to keep the existing `dashboard/web` PTY terminal server or create a new web command beside it.
- Exact command name for launching the cockpit, such as `go run ./web -path .. -port 8080`.
- Whether `scan.mjs` should be hardened before the cockpit exposes it as a button, since the current checkout had the script missing and restored from upstream.
- Whether Auto Mode will be implemented as a Codex-mediated external automation first, or as a Go-managed run queue that asks Codex/browser tooling to act.

## Approval

The user approved:

- Full cockpit V1.
- Go-only server with HTML/CSS/JS and no frontend build.
- Mission Control layout.
- Internal actions execute directly.
- External application flow stops before final submission.
- Auto Mode answers only real visible form fields.
- `context/application-profile.yml` as extensible private form-filling profile.
