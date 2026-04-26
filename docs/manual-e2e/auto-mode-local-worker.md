# Auto Mode local worker E2E

This flow verifies that hosted or local cockpit state is observed by a paired local browser worker. The cockpit creates and monitors the run; the local worker drives the visible Playwright browser.

## Preconditions

- The cockpit is running and the user is logged in.
- The repository terminal is open at the project root.
- A target job URL is available.

## Pair the local worker

1. Open `Auto Mode`.
2. Set a device name in `Worker ID`, for example `fernando-laptop`.
3. Click `Generate pairing token`.
4. Run the generated `Copy register` command in the repository terminal.
5. Keep the returned `CAREER_OPS_WORKER_CREDENTIAL` only in the terminal session.
6. Run the generated `Copy run` command from the repository root.

Expected result: the worker polls the API, claims eligible Auto Mode runs, sends heartbeats, and keeps a headed browser profile open.

## Start and observe a run

1. Paste a real job URL into the Auto Mode URL field or select an application that already has a URL.
2. Click `Start Auto Mode`.
3. Confirm the worker panel changes from `Waiting` to `Online`.
4. Confirm the run drawer shows current URL, worker action logs, field observations, and gates.

Expected result: the browser window navigates to the job page from the worker process, not from frontend JavaScript.

## Safety gates

- If login, MFA, or CAPTCHA appears, the worker must set the run to `Needs Input` and leave the browser open.
- File upload must remain blocked until server-side upload approval exists for that run.
- Final submit must remain blocked until server-side submit approval exists for that run.
- Tracker status must not become `Applied` automatically; it remains a separate explicit user action.

## Failure signals

- `Waiting`: no paired worker is polling or the credential is missing.
- `Stale`: a worker claimed the run but heartbeats expired.
- `401`: the user session or worker credential is missing or invalid.
- Browser shows only the placeholder page: the worker process is not running or has not claimed the run yet.
