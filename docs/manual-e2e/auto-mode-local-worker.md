# Auto Mode local worker E2E

This flow verifies that hosted or local cockpit state is observed by a paired local browser worker. The cockpit creates and monitors the run; the local worker drives the visible Playwright browser.

## Preconditions

- The cockpit is running and the user is logged in.
- A target job URL is available.
- For one-click worker launch, the cockpit is open from `localhost`, `127.0.0.1`, or `::1`.

## Start the local worker

1. Open `Auto Mode`.
2. Set a device name in `Worker ID`, for example `fernando-laptop`.
3. Click `Start local worker`.

Expected result: the backend pairs this device, injects the worker credential only into the spawned process environment, starts `workers/browser-worker.mjs`, and the worker status changes to `Ready` or `Polling`.

## Advanced manual fallback

Use this only when the one-click local launch fails or when the cockpit is hosted.

1. Expand `Advanced manual setup`.
2. Click `Generate pairing token`.
3. Run the generated `Copy register` command in the repository terminal.
4. Keep the returned `CAREER_OPS_WORKER_CREDENTIAL` only in the terminal session.
5. Run the generated `Copy run` command from the repository root.

Expected result: the worker polls the API, claims eligible Auto Mode runs, sends heartbeats, and keeps a headed browser profile open. The token and credential must never appear in frontend code, URLs, browser storage, or logs.

## Start and observe a run

1. Paste a real job URL into the Auto Mode URL field or select an application that already has a URL.
2. Click `Start Auto Mode`.
3. In local cockpit mode, confirm the portal requests the local worker automatically if it is not already running.
4. Confirm the worker panel changes from `Waiting` or `Polling` to `Online`.
5. Confirm the run drawer shows current URL, worker action logs, field observations, and gates.

Expected result: the browser window navigates to the job page from the worker process, not from frontend JavaScript.

## Safety gates

- If login, MFA, or CAPTCHA appears, the worker must set the run to `Needs Input` and leave the browser open.
- File upload must remain blocked until server-side upload approval exists for that run.
- Final submit must remain blocked until server-side submit approval exists for that run.
- Tracker status must not become `Applied` automatically; it remains a separate explicit user action.

## Failure signals

- `Waiting`: no paired worker is polling or the credential is missing.
- `Polling`: a local worker process is running and waiting to claim the active run.
- `Stale`: a worker claimed the run but heartbeats expired.
- `401`: the user session or worker credential is missing or invalid.
- `409 local_worker_unsupported`: the hosted cockpit cannot start a process on this computer; use the manual fallback.
- Browser shows only the placeholder page: the worker process is not running or has not claimed the run yet.
