# Career Ops Local Browser Worker Design

Date: 2026-04-26
Status: Batch 0 corrected for implementation planning
Scope: Auto Mode V1 with a visible local browser worker

## Summary

Career Ops Auto Mode currently creates a safe run envelope in the cockpit, but it does not drive a real visible browser. The new design adds a local browser worker that runs on the user's current computer, opens a visible persistent Chrome session with Playwright, claims Auto Mode runs from the hosted cockpit backend, performs high-confidence application steps, and streams observability back to the dashboard.

The product goal is direct: when the user clicks Start Auto Mode from the hosted portal, they should be able to watch the browser open the vacancy, navigate the application flow, fill known fields, and pause for review whenever the action becomes sensitive or uncertain.

The recommended architecture is hybrid:

```text
Hosted portal and Cloud Run API
        |
        | Firebase Auth + Firestore runtime state
        v
Firestore Auto Mode runtime store
        |
        | paired worker polling + run logs + fill plan
        v
Local Browser Worker on the user's computer
        |
        | Playwright persistent context
        v
Visible Chrome session with preserved logins
```

This keeps the portal usable from any computer while keeping the browser session, LinkedIn login, MFA prompts, and portal credentials on the machine the user is actively using.

## Goals

- Make Auto Mode perform real browser work instead of only creating a run envelope.
- Keep the browser visible so the user can watch every important action.
- Preserve browser login state across runs by using a persistent Playwright user data directory.
- Allow automatic progression through ordinary application screens when confidence is high.
- Stream browser logs, current URL, observed fields, needs-input reasons, and review gates back to the cockpit.
- Keep the final submit blocked until explicit user approval.
- Keep PDF upload blocked in the first implementation unless the user approves that gate inside the cockpit.
- Support use from any computer by running a small worker locally on that computer and pairing it with the hosted portal.
- Avoid storing passwords, MFA codes, cookies, or browser credentials in the hosted backend.
- Keep tracker status changes manual unless the user explicitly confirms the status update after a visible portal confirmation.
- Use Firestore as the hosted Auto Mode runtime store for runs, claims, heartbeats, gates, and approvals.
- Protect human approval actions with server-side Firebase Auth, not frontend-only checks.
- Deliver form-filling data through a per-run fill plan API so the worker does not need a local clone of the repository.

## Non-Goals

- Do not build a fully remote cloud browser for V1.
- Do not submit applications without final user approval.
- Do not bypass portal anti-bot, MFA, CAPTCHAs, or authentication flows.
- Do not store LinkedIn or job portal credentials in Career Ops.
- Do not make the frontend-only login the security boundary for worker control.
- Do not replace `data/applications.md`, `cv.md`, `config/profile.yml`, `modes/_profile.md`, `reports/`, or `output/` as sources of truth.
- Do not require Codex Chat to stay open for Auto Mode to run.
- Do not use `data/runs/*.json` as the hosted runtime store for Auto Mode.
- Do not expose worker credentials, Firebase service account material, or approval authority in static frontend JavaScript.

## Current State

The cockpit already has useful run primitives:

- `AutoModeService.StartAutoMode` creates an `auto-mode` run.
- `RunRecord` stores state, steps, timeline, artifacts, observed fields, browser session state, action logs, and review gates.
- Existing endpoints already accept browser logs, field observations, needs-input events, ready-for-review events, and submit approval.
- `/api/runs/{id}/open-browser` only asks the local OS to open a URL and is intentionally limited to local cockpit mode.
- The existing file-backed run store is acceptable for local cockpit/debug mode, but it is not durable enough for hosted Cloud Run because Cloud Run filesystem state is ephemeral and multiple instances can race.
- `context/application-profile.yml` already exists as the private form-filling profile; the hosted backend should use it to build a sanitized fill plan rather than asking the worker to read private repo files directly.

The missing part is the process that actually drives a browser and feeds those endpoints.

## Architecture

### Components

1. **Hosted cockpit frontend**
   - Lets the user click Start Auto Mode from a tracked application or pasted URL.
   - Shows worker connection status.
   - Shows live browser logs, observed fields, current step, current URL, and gate prompts.
   - Provides approval controls for sensitive gates.
   - Uses Firebase Auth client-side only to obtain ID tokens; it does not authorize sensitive work by itself.

2. **Cloud Run cockpit API**
   - Remains the canonical run store for the hosted portal.
   - Creates Auto Mode runs and writes hosted runtime state to Firestore when `CAREER_OPS_RUNTIME_STORE=firestore`.
   - Verifies Firebase ID tokens server-side before any human approval, worker pairing, or tracker status mutation.
   - Exposes worker-only endpoints protected by paired worker credentials.
   - Receives worker heartbeats, logs, field observations, screenshots or screenshot metadata, and gate state.

3. **Firestore Auto Mode runtime store**
   - Stores hosted run records, claims, heartbeats, gate decisions, pairing records, and submit/upload approval records.
   - Supports atomic claim semantics so two workers cannot own the same run at the same time.
   - Tracks lease expiry so a dead worker can be replaced without manual data surgery.

4. **Local Browser Worker**
   - Runs as a local Node script in V1.
   - Uses Playwright with a persistent Chrome user data directory.
   - Polls the hosted API for runs assigned to its paired worker identity.
   - Opens the vacancy URL in a visible browser.
   - Waits for manual login when required and never closes the browser just because login is needed.
   - Requests a per-run fill plan from the API instead of reading `cv.md`, `config/profile.yml`, or `output/*` directly.
   - Fills high-confidence fields and advances non-sensitive screens.
   - Pauses at explicit gates and reports the reason to the cockpit.

5. **Visible Chrome session**
   - Uses a stable user data directory such as `.local/browser-worker-profile/` or a user-home equivalent.
   - Stays open during login and review.
   - Is not deleted by normal worker shutdown.

### Runtime Store

V1 hosted Auto Mode uses Firestore as the operational source of truth for:

- Run state.
- Worker claims.
- Worker heartbeats.
- Lease expiry.
- Needs-input gates.
- Upload approvals.
- Submit approvals.
- Worker pairing records.
- Submit-complete observations.

The file-backed `data/runs/*.json` store remains valid for local cockpit/debug mode only. Hosted startup with `CAREER_OPS_RUNTIME_STORE=firestore` must fail closed if Firestore initialization fails; it must not silently fall back to file-backed state in production.

### Worker API

Add worker-specific endpoints under `/api/worker/*`:

```text
POST /api/worker/register
GET  /api/worker/runs/next
POST /api/worker/runs/{id}/claim
POST /api/worker/runs/{id}/heartbeat
GET  /api/worker/runs/{id}/fill-plan
POST /api/worker/runs/{id}/log
POST /api/worker/runs/{id}/field-observation
POST /api/worker/runs/{id}/needs-input
POST /api/worker/runs/{id}/ready-for-review
POST /api/worker/runs/{id}/upload-gate
POST /api/worker/runs/{id}/submit-complete
```

The worker endpoints may reuse existing `AutoModeService` methods internally, but the API surface should be separate because worker calls need server-side authentication, heartbeats, and claim semantics.

### Authentication and Pairing

V1 uses two distinct server-side security boundaries:

1. **Human actions use Firebase Auth.**
   - Frontend obtains a Firebase ID token after login.
   - Cloud Run verifies that token server-side.
   - Upload approval, submit approval, mark-as-applied, and worker pairing require a valid verified user.
   - Missing or invalid Firebase Auth returns `401`.

2. **Worker actions use paired device credentials.**
   - A logged-in user generates a short-lived one-time pairing token.
   - The local worker exchanges the pairing token for a worker identity and worker credential.
   - Pairing tokens are single-use, expire quickly, and are stored hashed in Firestore.
   - Worker credentials are scoped to that worker identity and can be revoked.
   - Worker requests use `Authorization: Bearer <worker credential>`.
   - Missing, invalid, expired, revoked, or mismatched worker credentials return `401`.

The existing frontend-only login can remain as a visual lock, but it must not authorize worker operations or sensitive approval operations.

### Fill Plan Contract

The worker does not read private repo files as its primary data source. The hosted API builds a per-run fill plan from server-side Career Ops sources and returns only the minimum data needed for that run.

A fill plan contains:

- Run id.
- Target URL and expected host.
- Candidate field values allowed for this run.
- Missing or unresolved fields that must trigger `needs-input`.
- Sensitive field flags.
- PDF artifact metadata only after the run is eligible for upload review.
- Explicit gate state for upload and submit.
- Low-fit warning state and override state.

A fill plan must not contain:

- Passwords.
- MFA codes.
- Cookies.
- Browser storage.
- Firebase service account data.
- Worker credentials.
- Full raw CV text unless a specific form answer requires an approved excerpt.

## Auto Mode State Machine

```text
Queued
  -> Claimed by worker
  -> Opening application
  -> Login required? -> Needs input
  -> Inspecting form
  -> Mapping fields
  -> Filling high-confidence fields
  -> Advancing safe screens
  -> Upload approval required? -> Needs input
  -> Ready for review
  -> Submit approval recorded by authenticated user
  -> Final browser click
  -> Completed or Failed
```

The worker may move forward automatically only while all of these are true:

- The page is on the expected vacancy or application domain.
- The application score is not below the configured apply threshold, unless the user explicitly overrides the low-fit warning.
- The action is not a final submit.
- The action is not a PDF upload unless the upload gate has been approved.
- The field match is high-confidence.
- The current screen does not ask a question that requires user judgment.
- No login, MFA, CAPTCHA, or unsupported portal blocker is visible.
- The worker has a valid unexpired claim lease for the run.
- The run's fill plan authorizes the field or navigation step.

## Gate Rules

### Login Gate

If the page requires login, MFA, consent, CAPTCHA, or human verification:

- Worker records `needs-input` with reason `login_or_verification_required`.
- Browser remains open and visible.
- Worker waits until the user completes login manually.
- Worker resumes only after the page is navigable again.

### Ambiguous Field Gate

If a field cannot be answered confidently from the application profile, CV, or current run context:

- Worker records the observed field.
- Worker records `needs-input` with reason `ambiguous_field`.
- Cockpit asks the user for the answer.
- Worker resumes after the answer is available.

### PDF Upload Gate

For V1 aggressive mode, the worker may locate the file input and identify the best PDF artifact, but it must ask for approval before uploading.

The cockpit should show:

- Run id.
- Target company and role when available.
- PDF path or artifact name.
- Destination URL.
- Upload approval button.

Only after approval may the worker attach the PDF.

Upload approval must be recorded by a Firebase-authenticated user on the server. A worker log message or frontend-only state is not sufficient authority to upload.

### Final Submit Gate

The worker must never click the final submit button until:

- The run state is `Ready for Review`.
- The user records explicit approval in the cockpit while authenticated with Firebase Auth.
- The worker receives that approval through the API.
- The worker is still on the expected application flow.
- The worker still owns a valid claim lease for the run.

After the click, the worker records the result as `submit-complete`, including current URL and any visible confirmation text. If the click fails or the result is unclear, the run remains reviewable and does not mark the application as applied automatically.

Even after a clear confirmation, V1 should not mutate `data/applications.md` to `Applied` automatically. The cockpit should offer a separate explicit status update control so the tracker remains a deliberate user-owned record.

## Worker Behavior

### Field Filling

The worker can fill these fields automatically when visible and high-confidence:

- Name.
- Email.
- Phone.
- Location.
- LinkedIn URL.
- GitHub or portfolio URL when present.
- Work authorization when explicitly available in the profile.
- Basic availability or notice-period fields when explicitly available.

The worker should not invent answers. If a value is missing, it should pause and ask.

All automatic field values must come from the fill plan. If a value is not present in the fill plan, the worker reports the observed field and opens a `needs-input` gate instead of deriving its own answer from local files.

### Button Clicking

The worker may click navigation buttons such as:

- Continue.
- Next.
- Save and continue.
- Start application.

The worker must treat these as sensitive unless page inspection confirms they are not final submission buttons:

- Submit.
- Send application.
- Apply now on final review.
- Finalizar candidatura.
- Enviar candidatura.

### Observability

Every important action should create a browser log:

- Opening URL.
- Waiting for login.
- Form fields detected.
- Field filled.
- Button clicked.
- Gate opened.
- Upload prepared.
- Upload completed after approval.
- Ready for review.
- Final submit clicked after approval.
- Error or blocker detected.

Logs should include:

- Run id.
- Step.
- Message.
- URL.
- Optional status.
- Optional last action.

Screenshots are useful, but V1 may store only metadata or small debug screenshots if storage/security concerns make full screenshots risky.

For V1, default to textual observability and observed field metadata. Full screenshots are opt-in debugging artifacts because they may capture personal data, compensation answers, portal profile details, or recruiter messages.

## Frontend UX

The Auto Mode panel should show:

- Worker online/offline state.
- Active worker id or friendly label.
- Current run state.
- Current browser URL.
- Live action log.
- Observed fields.
- Needs-input prompt.
- Upload approval prompt.
- Ready-for-review prompt.
- Submit approval prompt.
- Pair worker prompt.
- Authenticated user state for approval actions.

The UI copy should make clear that:

- The local worker must be running on the current computer.
- This computer must be paired before it can claim hosted Auto Mode runs.
- The browser will remain open for manual login.
- The agent may advance ordinary screens automatically.
- The final submit remains blocked until approval.

## File and Module Plan

Expected implementation areas:

```text
dashboard/internal/cockpit/
  runtime_store.go      # hosted/local runtime-store interface
  firestore_store.go    # Firestore runtime-store implementation
  worker.go             # worker auth, claims, heartbeat, worker API contracts
  auth.go               # Firebase Auth verification boundary
  fill_plan.go          # per-run fill plan builder and sanitizer
  auto_mode.go          # reuse and extend state/gate methods
  runs.go               # add claim/heartbeat fields if needed

dashboard/cockpit/
  server.go             # route worker endpoints and frontend endpoints
  static/app.js         # Auto Mode UI state, gates, worker status
  static/styles.css     # layout for observability panels

workers/
  browser-worker.mjs    # local Playwright worker entrypoint
  README.md             # run instructions and token setup
```

The worker directory is system layer because it is reusable automation logic. Local `.env` files, browser profiles, traces, screenshots, and generated artifacts must remain ignored.

## Configuration

Suggested environment variables:

```text
CAREER_OPS_API_BASE=https://carrer-path-45bef.web.app
CAREER_OPS_RUNTIME_STORE=firestore
CAREER_OPS_FIREBASE_PROJECT_ID=carrer-path-45bef
CAREER_OPS_PAIRING_TOKEN_TTL_SECONDS=600
CAREER_OPS_WORKER_CREDENTIAL_TTL_SECONDS=2592000
CAREER_OPS_WORKER_CREDENTIAL=...
CAREER_OPS_WORKER_ID=local-fernando-laptop
CAREER_OPS_BROWSER_PROFILE=.local/browser-worker-profile
CAREER_OPS_HEADLESS=false
CAREER_OPS_SCREENSHOTS=off
```

The worker should default to headed mode. Headless mode is not the default because this feature is explicitly about visible browser observability.

## Verification Plan

Backend:

```bash
cd dashboard
go test ./...
```

Frontend and worker smoke:

```bash
node workers/browser-worker.mjs --once --dry-run
```

Manual end-to-end:

1. Start the deployed or local cockpit.
2. Start the worker locally.
3. Click Start Auto Mode for a safe test URL or known application row.
4. Verify the worker claims the run.
5. Verify Chrome opens visibly and remains open.
6. Verify logs appear in the portal.
7. Verify login-required pages pause without closing Chrome.
8. Verify observed fields appear in the portal.
9. Verify PDF upload gate blocks upload until approval.
10. Verify final submit gate blocks final click until approval.
11. Verify unauthenticated upload/submit approval returns `401`.
12. Verify unpaired worker claim returns `401`.
13. Verify status does not change to `Applied` automatically after submit-complete.

## Risks and Mitigations

- **Risk: Frontend-only authentication is bypassable.**
  - Mitigation: sensitive human actions require server-side Firebase ID-token verification.

- **Risk: A shared worker token can be reused from any computer.**
  - Mitigation: use one-time pairing tokens and revocable per-device worker credentials.

- **Risk: Cloud Run loses run state or races across instances.**
  - Mitigation: use Firestore for hosted Auto Mode runtime state and atomic claim operations.

- **Risk: Worker needs private repo files on every computer.**
  - Mitigation: provide a sanitized per-run fill plan through the API.

- **Risk: Worker submits an application accidentally.**
  - Mitigation: final submit requires `Ready for Review` plus explicit approval and a worker-side final-button check.

- **Risk: Worker uploads the wrong PDF.**
  - Mitigation: upload requires user approval with artifact path shown in the cockpit.

- **Risk: Browser login is lost.**
  - Mitigation: persistent Playwright profile; never delete profile during normal runs.

- **Risk: Portals block automation.**
  - Mitigation: visible browser, manual login gate, graceful pause, and no anti-bot bypass attempts.

- **Risk: Hosted backend exposes private data.**
  - Mitigation: no credentials in backend, avoid full screenshots by default, store only run observability required for review.

## V1 Decisions

- Screenshots are off by default; textual logs and observed fields are the default observability channel.
- Upload approval is per-run only. Do not remember upload approval across portal sessions in V1.
- The worker supports both continuous polling and `--once`; development and smoke tests use `--once`, normal usage uses continuous polling.
- Application status remains manual after submit confirmation. The cockpit may offer an explicit "mark as Applied" action, but the worker does not update the tracker by itself.
- Hosted Auto Mode uses Firestore. File-backed runs are local/debug only.
- Firebase Auth is mandatory for upload approval, submit approval, worker pairing, and mark-as-applied.
- Worker credentials are per-device and revocable; no shared static worker token is used for V1 hosted mode.
- The worker uses fill plan data from the API as the primary source of form answers.

## Implementation Acceptance Criteria

- No upload approval, submit approval, worker pairing, or mark-as-applied endpoint succeeds without verified Firebase Auth.
- No worker endpoint succeeds without valid paired-worker credentials.
- No hosted Auto Mode runtime silently falls back from Firestore to `data/runs/*.json`.
- No worker claim can be owned by two active workers at the same time.
- No submit click occurs unless server-side submit approval exists and the worker owns a valid lease.
- No PDF upload occurs unless server-side upload approval exists for the same run.
- No application tracker status changes to `Applied` automatically from worker submit-complete.
- No fill plan response includes passwords, cookies, browser storage, service-account material, or worker credentials.
- `.env`, local browser profiles, traces, screenshots, and worker temp files remain ignored and excluded from deploy bundles.

## Recommendation

Implement V1 as a local Node/Playwright worker with server-side token authentication and conservative gates. Use the existing run store and Auto Mode methods wherever possible. The worker should be aggressive only for ordinary navigation and high-confidence field filling; it must be conservative for login, ambiguous fields, PDF upload, and final submit.
