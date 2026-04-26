# Career Ops Local Browser Worker Design

Date: 2026-04-26
Status: Draft for review
Scope: Auto Mode V1 with a visible local browser worker

## Summary

Career Ops Auto Mode currently creates a safe run envelope in the cockpit, but it does not drive a real visible browser. The new design adds a local browser worker that runs on the user's current computer, opens a visible persistent Chrome session with Playwright, claims Auto Mode runs from the hosted cockpit backend, performs high-confidence application steps, and streams observability back to the dashboard.

The product goal is direct: when the user clicks Start Auto Mode from the hosted portal, they should be able to watch the browser open the vacancy, navigate the application flow, fill known fields, and pause for review whenever the action becomes sensitive or uncertain.

The recommended architecture is hybrid:

```text
Hosted portal and Cloud Run API
        |
        | authenticated polling + run logs
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

## Non-Goals

- Do not build a fully remote cloud browser for V1.
- Do not submit applications without final user approval.
- Do not bypass portal anti-bot, MFA, CAPTCHAs, or authentication flows.
- Do not store LinkedIn or job portal credentials in Career Ops.
- Do not make the frontend-only login the security boundary for worker control.
- Do not replace `data/applications.md`, `cv.md`, `config/profile.yml`, `modes/_profile.md`, `reports/`, or `output/` as sources of truth.
- Do not require Codex Chat to stay open for Auto Mode to run.

## Current State

The cockpit already has useful run primitives:

- `AutoModeService.StartAutoMode` creates an `auto-mode` run.
- `RunRecord` stores state, steps, timeline, artifacts, observed fields, browser session state, action logs, and review gates.
- Existing endpoints already accept browser logs, field observations, needs-input events, ready-for-review events, and submit approval.
- `/api/runs/{id}/open-browser` only asks the local OS to open a URL and is intentionally limited to local cockpit mode.

The missing part is the process that actually drives a browser and feeds those endpoints.

## Architecture

### Components

1. **Hosted cockpit frontend**
   - Lets the user click Start Auto Mode from a tracked application or pasted URL.
   - Shows worker connection status.
   - Shows live browser logs, observed fields, current step, current URL, and gate prompts.
   - Provides approval controls for sensitive gates.

2. **Cloud Run cockpit API**
   - Remains the canonical run store for the hosted portal.
   - Creates Auto Mode runs.
   - Exposes worker-only endpoints protected by a server-side token.
   - Receives worker heartbeats, logs, field observations, screenshots or screenshot metadata, and gate state.

3. **Local Browser Worker**
   - Runs as a local Node script in V1.
   - Uses Playwright with a persistent Chrome user data directory.
   - Polls the hosted API for runs assigned to the user or worker token.
   - Opens the vacancy URL in a visible browser.
   - Waits for manual login when required and never closes the browser just because login is needed.
   - Fills high-confidence fields and advances non-sensitive screens.
   - Pauses at explicit gates and reports the reason to the cockpit.

4. **Visible Chrome session**
   - Uses a stable user data directory such as `.local/browser-worker-profile/` or a user-home equivalent.
   - Stays open during login and review.
   - Is not deleted by normal worker shutdown.

### Worker API

Add worker-specific endpoints under `/api/worker/*`:

```text
POST /api/worker/register
GET  /api/worker/runs/next
POST /api/worker/runs/{id}/claim
POST /api/worker/runs/{id}/heartbeat
POST /api/worker/runs/{id}/log
POST /api/worker/runs/{id}/field-observation
POST /api/worker/runs/{id}/needs-input
POST /api/worker/runs/{id}/ready-for-review
POST /api/worker/runs/{id}/upload-gate
POST /api/worker/runs/{id}/submit-complete
```

The worker endpoints may reuse existing `AutoModeService` methods internally, but the API surface should be separate because worker calls need server-side authentication, heartbeats, and claim semantics.

### Authentication and Pairing

V1 should use a simple worker token:

- Cloud Run receives `CAREER_OPS_WORKER_TOKEN` as an environment variable.
- The local worker reads the same token from a local `.env` file or command argument.
- Worker requests use `Authorization: Bearer <token>`.
- The token is never shipped in frontend JavaScript.
- Missing or invalid token returns `401`.

This is intentionally simple, but it moves security to the backend. The existing frontend-only login can remain a temporary UI lock, but it must not authorize worker operations.

Later versions can replace the shared token with one-time pairing codes and per-device worker identities.

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
  -> Submit approval recorded
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

### Final Submit Gate

The worker must never click the final submit button until:

- The run state is `Ready for Review`.
- The user records explicit approval in the cockpit.
- The worker receives that approval through the API.
- The worker is still on the expected application flow.

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

The UI copy should make clear that:

- The local worker must be running on the current computer.
- The browser will remain open for manual login.
- The agent may advance ordinary screens automatically.
- The final submit remains blocked until approval.

## File and Module Plan

Expected implementation areas:

```text
dashboard/internal/cockpit/
  worker.go             # worker auth, claims, heartbeat, worker API contracts
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
CAREER_OPS_WORKER_TOKEN=...
CAREER_OPS_WORKER_ID=local-fernando-laptop
CAREER_OPS_BROWSER_PROFILE=.local/browser-worker-profile
CAREER_OPS_HEADLESS=false
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

## Risks and Mitigations

- **Risk: Frontend-only authentication is bypassable.**
  - Mitigation: worker endpoints require server-side bearer token.

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

## Recommendation

Implement V1 as a local Node/Playwright worker with server-side token authentication and conservative gates. Use the existing run store and Auto Mode methods wherever possible. The worker should be aggressive only for ordinary navigation and high-confidence field filling; it must be conservative for login, ambiguous fields, PDF upload, and final submit.
