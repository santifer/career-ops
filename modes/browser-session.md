# Browser Session -- Autonomy Patterns

<!-- ============================================================
     Shared reference for ALL autonomous browser interaction.
     Referenced by: scan.md, apply.md, pipeline.md, auto-pipeline.md
     Governance: CLAUDE.md "Browser Autonomy" section
     HITL rules: _shared.md "HITL Boundaries" section
     ============================================================ -->

This file defines the patterns every mode uses when interacting with a browser via Playwright MCP. It is the single source of truth for decision loops, session management, obstacle handling, CAPTCHA/2FA detection, the submission gate, retry logic, and action logging.

**How to use this file**: When a mode workflow reaches a browser interaction point, follow the sections below in order. Start with the Decision Loop Protocol, layer in Session Management if the portal requires login, apply Obstacle Dismissal after every navigation, and enforce the Submission Gate before any irreversible action.

---

## Decision Loop Protocol

Every autonomous browser interaction follows a snapshot-decide-act-re-snapshot cycle:

1. **Snapshot** -- Call `browser_snapshot` to read the current page state as an ARIA accessibility tree (YAML, ~2-5 KB). Parse roles, names, and element refs (e.g., `textbox "Full Name" [ref=e7]`).
2. **Decide** -- Based on the snapshot content, determine the next action: navigate, click, fill, type, wait, or escalate to HITL.
3. **Act** -- Execute the chosen action using the element ref from the snapshot.
4. **Re-snapshot** -- Call `browser_snapshot` again to verify the action succeeded before proceeding.

**Safety limits** (prevent infinite loops):
- Max iterations: **50 cycles** per flow.
- Max wall-clock: **5 minutes** per flow execution.
- If the goal is not met within limits, stop and report progress to the user with a summary of completed steps.

**Rules**:
- Always take a fresh `browser_snapshot` at the start of each step. Never assume page state from a previous snapshot after any navigation or wait.
- Element refs (`e5`, `e12`) are session-scoped. After any navigation that reloads the page, re-snapshot before using refs -- they may have changed.
- Use ARIA roles and labels (`textbox "Email"`, `button "Submit"`) rather than CSS selectors. Resilient across ATS platforms and portal redesigns.

---

## Session Management

For portals requiring authentication (`requires_login: true` in `portals.yml`).

### Session files

- Path convention: `data/sessions/<portal-slug>.json` (gitignored -- contains auth tokens).
- Format: Playwright `storageState` JSON with `cookies` and `origins` arrays.
- Playwright MCP persistent profile stores cookies automatically between sessions via OS cache dir.

### Load pattern

Before navigating to an authenticated portal:
1. Check `portals.yml` for `requires_login: true` and `cookie_file` path.
2. If a session file exists, the Playwright MCP persistent profile should already have cookies from the user's prior manual login.
3. Navigate to the portal URL.
4. Snapshot immediately to check session validity.

### Validity check

After navigating, examine the snapshot:
- **Valid session**: No login form present. Portal shows authenticated content (dashboard, profile menu, user name).
- **Expired session**: Snapshot contains login form elements (e.g., `textbox "Email"` + `button "Sign in"`).

### Expiry handling

If the session is expired:
1. Stop the flow immediately.
2. Output HITL signal: `{ hitl: true, reason: "session_expired", message: "Session expired -- please log in to the portal and type 'resume'" }`.
3. Do NOT attempt to enter credentials. The user must authenticate manually.

---

## Obstacle Dismissal

After every `browser_navigate` + first `browser_snapshot`, check for obstacles BEFORE reading page content. Dismiss in order:

### Step 1: Cookie banners

Search the snapshot for these button patterns (case-sensitive match on ARIA label):
- `button "Accept all"`
- `button "Accept All"`
- `button "Accept cookies"`
- `button "Allow all"`
- `button "I agree"`
- `button "OK"`
- `button "Got it"`

If found, click the matching element ref. Re-snapshot to verify the banner is gone.

### Step 2: Overlay dialogs

Search the snapshot for `role="dialog"` or `role="alertdialog"`. If present, look for dismiss buttons:
- `button "Close"`
- `button "x"` (the multiplication sign, not letter x)
- `button "+"` (Unicode ballot X)
- `button "No thanks"`
- `button "Not now"`
- `button "Maybe later"`
- `button "Dismiss"`
- `button "Skip"`

Dismiss the topmost dialog first. Re-snapshot after each dismissal.

**Escalation**: If a dialog is present but no known dismiss button exists, stop and notify the user. Do not guess -- some dialogs may be legitimate (terms acceptance, required consent).

---

## CAPTCHA Detection

Scan every snapshot for these signal phrases (case-insensitive):

- `I'm not a robot`
- `verify you are human`
- `hcaptcha`
- `recaptcha`

**Action**: IMMEDIATE STOP. No exceptions.

Output HITL signal:
```
{ hitl: true, reason: "captcha", message: "CAPTCHA detected -- please resolve it in the browser and type 'resume'" }
```

**NEVER attempt to solve a CAPTCHA.** Always defer to the human.

---

## 2FA Detection

Scan every snapshot for these signal phrases:

- `Verification Code`
- `One-time password`
- `Authentication code`
- `Enter the code`
- `Authenticator app`
- `Check your email for a code`

**Action**: IMMEDIATE STOP.

Output HITL signal:
```
{ hitl: true, reason: "2fa", message: "2FA required -- please complete authentication and type 'resume'" }
```

---

## Submission Gate (CRITICAL)

This gate enforces the ethical rule in CLAUDE.md: "NEVER submit an application without the user reviewing it first."

**Trigger**: Before clicking ANY button that could submit a form. Match these button labels:
- Submit, Apply, Send, Bewerben, Absenden, Post, Continue (when "Continue" is the final step that submits)

**Protocol**:
1. STOP. Do not click the button.
2. Present a summary of all filled fields and their values:
   ```
   Submission Gate -- Review before sending:
   - Name: "John Doe"
   - Email: "john@example.com"
   - Cover Letter: [attached, 1 page]
   - Phone: "+1-555-0123"
   - Salary expectation: "90,000 EUR"

   Type "go" to submit or "abort" to cancel.
   ```
3. Wait for the user to respond.
   - User says "go" -- proceed with the click.
   - User says "abort" -- stop the flow, do not submit.
4. Log the gate event in the action log with `outcome: "hitl_pause"` and `detail: "submit"`.

**NO EXCEPTIONS.** This applies to every portal, every form, every mode. The submission gate is non-negotiable.

---

## Retry Policy

For transient failures (network errors, element not found, unexpected page content):

| Attempt | Wait before retry | Action |
|---------|-------------------|--------|
| 1st retry | 2 seconds | Re-navigate or re-snapshot, attempt action again |
| 2nd retry | 5 seconds | Re-navigate or re-snapshot, attempt action again |
| 3rd retry | 10 seconds | Re-navigate or re-snapshot, attempt action again |
| After 3 failures | -- | Escalate to user or mark `[!]` and skip |

**Escalation behavior** depends on `captcha_strategy` in `portals.yml`:
- `"stop"` (default): Stop the flow and notify the user with error context.
- `"skip"`: Mark the URL as `[!]` in `pipeline.md` with a note (e.g., "Failed after 3 retries -- element not found"), then continue to the next target.

**Qualifying failures**: Navigation timeout, element not found in snapshot, unexpected page content (e.g., 404, error page), action did not produce expected state change.

---

## Action Logging

Every autonomous browser flow MUST produce an action log.

### File convention

- Directory: `logs/` (gitignored -- may contain PII from form field values)
- Filename: `logs/flow-run-<ISO-timestamp>.ndjson`
- Example: `logs/flow-run-2026-04-07T14-30-00Z.ndjson`
- One file per flow execution. Rotate by run, not by size.

### Entry schema (NDJSON -- one JSON object per line)

```
{
  "timestamp": "ISO 8601",
  "step_id": "string (e.g., 'dismiss_cookie_banner', 'fill_name')",
  "action": "navigate | click | fill | snapshot | hitl | wait",
  "target_ref": "string | null (ARIA ref, e.g., 'e12')",
  "outcome": "success | failure | skipped | hitl_pause",
  "detail": "string (optional -- error message or HITL reason)"
}
```

### Rules

- **Flush after each entry** -- not buffered. Use `appendFileSync` or equivalent. This ensures partial runs are recoverable.
- Log every action: navigates, clicks, fills, snapshots, HITL pauses, waits.
- Log failures with `detail` containing the error message.
- Log HITL pauses with `detail` containing the reason (`"captcha"`, `"2fa"`, `"submit"`, `"session_expired"`).

---

## Stale Flow Detection

When the portal UI has changed and expected elements are no longer where they should be:

1. If an expected element is not found in the snapshot within **10 seconds** (use `browser_wait_for` with a timeout), assume the flow definition is stale.
2. Fall back to **page-state interpretation**: read what IS on the page from the current snapshot. Identify elements by their ARIA roles and labels, not by assumed positions.
3. Notify the user: "Flow definition may need updating for this portal. Proceeding with best-effort interpretation."
4. Continue using the decision loop protocol with the actual page state.
5. Log the stale detection in the action log: `{ action: "snapshot", outcome: "failure", detail: "stale_flow - element not found: <expected_element>" }`.

---

## Session Expiry Mid-Flow

When a portal session expires during an active multi-step flow:

1. **Detect**: The snapshot shows login form elements when they should not be there (e.g., `textbox "Email"` + `button "Sign in"` appearing mid-form-fill).
2. **Stop** the flow immediately. Do not attempt to re-authenticate.
3. Output HITL signal:
   ```
   { hitl: true, reason: "session_expired", message: "Session expired during flow -- please re-login and type 'resume'" }
   ```
4. The action log preserves a record of all completed steps. On resume, the agent reads the action log to determine where to continue.

---

## Partial Form Preservation

When a flow is interrupted by a HITL gate (CAPTCHA, 2FA, submission review) or an error:

1. The action log already contains every field filled with its value and ref. Each `fill` action has `step_id`, `target_ref`, and `outcome` recorded.
2. The user can review the action log to see exactly what was completed before the interruption.
3. On resume (after user types "resume" / "go" / "done"):
   - Agent re-snapshots the current page to verify state.
   - Agent reads the action log to identify which fields were already filled.
   - Agent continues from the next unfilled field, skipping already-completed steps.
4. If the page was reloaded (e.g., after CAPTCHA resolution), the agent must re-snapshot and re-identify all element refs -- they may have changed.

---

## Quick Reference: HITL Resume Protocol

When the agent outputs a HITL signal and pauses:

1. Agent stops and waits for user input.
2. User performs the required action in the browser (solve CAPTCHA, enter 2FA code, re-login, review form).
3. User types "resume" / "go" / "done" in Claude Code.
4. Agent re-snapshots the current page to verify state.
5. Agent continues from the next step.

The action log records the HITL pause with `outcome: "hitl_pause"` and `detail` set to the reason, so the agent can resume correctly.
