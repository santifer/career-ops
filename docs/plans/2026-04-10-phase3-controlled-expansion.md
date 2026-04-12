# Phase 3: Controlled Expansion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the Phase 2 vertical slice with recent jobs list, tracker merge, report reading, connection health indicator, and UI empty/error states — all exercising adapter methods that already exist.

**Architecture:** The Phase 1 contracts already declare the Phase 3 endpoints (`/v1/tracker` and `/v1/reports/:num`) with complete types. The real `claude-pipeline.ts` adapter already implements `readTrackerTail()`, `readReport()`, and `mergeTracker()`. Phase 3 work is: wire those into Fastify routes, add corresponding popup↔background messages, build the popup UI sections, and add polish (health polling, empty states).

**Tech Stack:** TypeScript, Fastify, zod (bridge); TypeScript, plain DOM (extension); esbuild (build)

**Verification gate:** `bridge/ tsc --noEmit` clean, `extension/ tsc --noEmit` clean, `npm run build` in extension clean, 15+ bridge smoke tests passing including the new endpoints.

---

### Task 1: Wire `GET /v1/tracker` and `GET /v1/reports/:num` into Fastify

**Files:**
- Modify: `bridge/src/server.ts`

**Step 1: Add the zod schema for tracker list**

In `server.ts`, after the existing `livenessSchema`, add:

```typescript
const trackerListSchema = envelopeSchema(
  z.object({ limit: z.number().int().min(1).max(50).optional() })
);
```

**Step 2: Add POST `/v1/tracker` route**

After the existing `/v1/jobs/:id/stream` route, add:

```typescript
/* -- /v1/tracker (Phase 3) ------------------------------------------------ */

fastify.post("/v1/tracker", async (req, reply) => {
  const parsed = trackerListSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendFailure(
      reply,
      requestIdFromBody(req.body),
      bridgeError("BAD_REQUEST", "invalid envelope", { issues: parsed.error.issues })
    );
  }
  const env = parsed.data as RequestEnvelope<{ limit?: number }>;
  try { assertProtocol(env); } catch (e) {
    return sendFailure(reply, env.requestId, toBridgeError(e));
  }

  const limit = env.payload.limit ?? 10;
  const data = await adapter.readTrackerTail(limit);
  reply.code(200).send(success(env.requestId, data));
});
```

**Step 3: Add GET `/v1/reports/:num` route**

```typescript
/* -- /v1/reports/:num (Phase 3) ------------------------------------------- */

fastify.get<{ Params: { num: string } }>("/v1/reports/:num", async (req, reply) => {
  const num = parseInt(req.params.num, 10);
  if (isNaN(num) || num < 0) {
    return sendFailure(reply, "report-read", bridgeError("BAD_REQUEST", "invalid report number"));
  }
  const report = await adapter.readReport(num);
  if (!report) {
    return sendFailure(reply, "report-read", bridgeError("NOT_FOUND", `report ${num} not found`));
  }
  reply.code(200).send(success("report-read", report));
});
```

**Step 4: Add POST `/v1/tracker/merge` route**

This endpoint is not in the Phase 1 contract catalog but the `PipelineAdapter.mergeTracker()` method exists. Add it as an unregistered convenience:

```typescript
/* -- /v1/tracker/merge (Phase 3) ------------------------------------------ */

const mergeSchema = envelopeSchema(
  z.object({ dryRun: z.boolean().optional() })
);

fastify.post("/v1/tracker/merge", async (req, reply) => {
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendFailure(reply, requestIdFromBody(req.body),
      bridgeError("BAD_REQUEST", "invalid envelope", { issues: parsed.error.issues }));
  }
  const env = parsed.data as RequestEnvelope<{ dryRun?: boolean }>;
  try { assertProtocol(env); } catch (e) {
    return sendFailure(reply, env.requestId, toBridgeError(e));
  }
  try {
    const report = await adapter.mergeTracker(env.payload.dryRun ?? false);
    reply.code(200).send(success(env.requestId, report));
  } catch (e) {
    return sendFailure(reply, env.requestId, toBridgeError(e));
  }
});
```

**Step 5: Add GET `/v1/jobs` route (recent jobs from in-memory store)**

```typescript
/* -- /v1/jobs (Phase 3) — recent jobs from in-memory store ---------------- */

fastify.get("/v1/jobs", async (_req, reply) => {
  const jobs = await store.list(20);
  reply.code(200).send(success("jobs-list", { jobs }));
});
```

**Step 6: Typecheck**

Run: `cd bridge && npx tsc --noEmit`
Expected: exit 0

**Step 7: Smoke test new routes**

Boot the bridge in fake mode and test:

```bash
# tracker (should return empty rows for fake adapter)
curl -s -X POST -H "x-career-ops-token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"protocol":"1.0.0","requestId":"t1","clientTimestamp":"...","payload":{"limit":5}}' \
  http://127.0.0.1:47319/v1/tracker

# report (should return 404 for fake adapter)
curl -s -H "x-career-ops-token: $TOKEN" http://127.0.0.1:47319/v1/reports/1

# jobs list
curl -s -H "x-career-ops-token: $TOKEN" http://127.0.0.1:47319/v1/jobs

# merge (dry run)
curl -s -X POST -H "x-career-ops-token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"protocol":"1.0.0","requestId":"m1","clientTimestamp":"...","payload":{"dryRun":true}}' \
  http://127.0.0.1:47319/v1/tracker/merge
```

**Step 8: Commit**

```bash
git add bridge/src/server.ts
git commit -m "feat(bridge): wire Phase 3 routes — tracker, reports, merge, jobs list"
```

---

### Task 2: Add Phase 3 messages to extension contracts

**Files:**
- Modify: `extension/src/contracts/messages.ts`
- Modify: `extension/src/contracts/bridge-wire.ts`

**Step 1: Add re-exports for Phase 3 types**

In `bridge-wire.ts`, the existing `*` re-exports already cover `TrackerListResult`, `ReportReadResult`, `TrackerRow`, etc. Verify no additional re-exports needed. (They should be covered — check with `tsc`.)

**Step 2: Add Phase 3 PopupRequest variants to `messages.ts`**

After the `openPath` variant in `PopupRequest`:

```typescript
  /** Fetch recent tracker rows from the bridge. */
  | { kind: "getRecentJobs"; limit?: number }
  /** Read a specific report by number. */
  | { kind: "readReport"; reportNum: number }
  /** Trigger tracker merge (flush pending TSV drop files). */
  | { kind: "mergeTracker"; dryRun?: boolean }
```

**Step 3: Add matching PopupResponse variants**

After the `openPath` response:

```typescript
  | { kind: "getRecentJobs"; ok: true; result: { rows: readonly TrackerRow[]; totalRows: number } }
  | { kind: "getRecentJobs"; ok: false; error: BridgeError }
  | { kind: "readReport"; ok: true; result: ReportReadResult }
  | { kind: "readReport"; ok: false; error: BridgeError }
  | { kind: "mergeTracker"; ok: true; result: MergeReport }
  | { kind: "mergeTracker"; ok: false; error: BridgeError }
```

Need to add imports for `TrackerRow`, `ReportReadResult`, and `MergeReport`:

```typescript
import type {
  TrackerListResult,
  ReportReadResult,
} from "./bridge-wire.js";
// MergeReport comes from pipeline.ts — but extension can't import that.
// Define MergeReport inline or re-export it via bridge-wire.
```

The simplest path: add a `MergeReport` type to `messages.ts` that mirrors the bridge one (4 fields: `added`, `updated`, `skipped`, `dryRun`), rather than coupling the extension to the bridge's internal pipeline contract.

**Step 4: Typecheck extension**

Run: `cd extension && npx tsc --noEmit`
Expected: exit 0

**Step 5: Commit**

```bash
git add extension/src/contracts/messages.ts
git commit -m "feat(extension): add Phase 3 message contracts — recentJobs, readReport, mergeTracker"
```

---

### Task 3: Add Phase 3 bridge-client methods + background handlers

**Files:**
- Modify: `extension/src/background/bridge-client.ts`
- Modify: `extension/src/background/index.ts`

**Step 1: Add client methods**

In `bridge-client.ts`, add three methods to the returned object:

- `getTracker(limit: number)` → POST `/v1/tracker` with envelope
- `getReport(num: number)` → GET `/v1/reports/:num` with auth header
- `mergeTracker(dryRun: boolean)` → POST `/v1/tracker/merge` with envelope

Each follows the same pattern as existing methods: build envelope, call `jsonRequest`, return typed response.

**Step 2: Add background handlers**

In `background/index.ts`, add three cases to the switch:

- `case "getRecentJobs":` → call `client.getTracker(req.limit ?? 10)`
- `case "readReport":` → call `client.getReport(req.reportNum)`
- `case "mergeTracker":` → call `client.mergeTracker(req.dryRun ?? false)`

Follow the exact pattern of `handleGetHealth` — load state, create client, call method, return typed response.

**Step 3: Typecheck extension**

Run: `cd extension && npx tsc --noEmit`
Expected: exit 0

**Step 4: Commit**

```bash
git add extension/src/background/bridge-client.ts extension/src/background/index.ts
git commit -m "feat(extension): wire Phase 3 background handlers — tracker, report, merge"
```

---

### Task 4: Popup UI — recent jobs section

**Files:**
- Modify: `extension/public/popup.html`
- Modify: `extension/public/popup.css`
- Modify: `extension/src/popup/index.ts`

**Step 1: Add the recent-jobs HTML section**

In `popup.html`, after the `<section id="error">...</section>` and before `<footer>`, add:

```html
<section id="recent" class="panel">
  <div class="panel-title">Recent evaluations</div>
  <div class="recent-list" id="recent-list">
    <div class="recent-empty">No evaluations yet</div>
  </div>
</section>
```

**Step 2: Add CSS for recent items**

```css
.recent-list { display: flex; flex-direction: column; gap: 4px; }
.recent-empty { font-size: 11px; color: var(--fg-muted); }
.recent-item {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; padding: 4px 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.recent-item:last-child { border-bottom: none; }
.recent-item:hover { color: var(--accent); }
.recent-item .company { font-weight: 500; color: var(--fg); }
.recent-item .role { color: var(--fg-muted); margin-left: 4px; }
.recent-item .score { color: var(--accent); font-weight: 600; }
```

**Step 3: Add popup logic**

In `popup/index.ts`:

- Add DOM handle: `const recentListEl = document.getElementById("recent-list")!;`
- Add `loadRecentJobs()` function that calls `sendRequest({ kind: "getRecentJobs", limit: 8 })` and renders rows. Each row is clickable → `sendRequest({ kind: "readReport", reportNum })` → could open in a new tab, or simply call `openPath` with the report path.
- Call `loadRecentJobs()` at the end of `init()` (in parallel with health + capture).
- The recent section is ALWAYS visible (not part of the state machine), shown below the main panel. It's informational context.

Key: build each row using DOM methods (`createElement`, `textContent`), no `innerHTML`.

**Step 4: Typecheck and build**

```bash
cd extension && npx tsc --noEmit && npm run build
```

**Step 5: Commit**

```bash
git add extension/public/popup.html extension/public/popup.css extension/src/popup/index.ts
git commit -m "feat(extension): add recent evaluations section to popup"
```

---

### Task 5: Popup UI — "Save to tracker" and "Merge" actions on done state

**Files:**
- Modify: `extension/public/popup.html`
- Modify: `extension/src/popup/index.ts`

**Step 1: Add merge button to done state**

In `popup.html`, in the `<section id="done">` `.result-actions` div, add:

```html
<button class="cta" id="merge-tracker-btn">Save to tracker</button>
```

**Step 2: Wire merge in popup**

In `popup/index.ts`:

```typescript
const mergeTrackerBtn = document.getElementById("merge-tracker-btn") as HTMLButtonElement;

async function onMergeTrackerClick(): Promise<void> {
  mergeTrackerBtn.disabled = true;
  mergeTrackerBtn.textContent = "Merging…";
  const res = await sendRequest({ kind: "mergeTracker", dryRun: false });
  mergeTrackerBtn.disabled = false;
  if (res.ok) {
    mergeTrackerBtn.textContent = `✓ Merged (${res.result.added} added)`;
    void loadRecentJobs(); // refresh the recent list
  } else {
    mergeTrackerBtn.textContent = "Merge failed";
  }
}

mergeTrackerBtn.addEventListener("click", () => void onMergeTrackerClick());
```

**Step 3: Typecheck and build**

```bash
cd extension && npx tsc --noEmit && npm run build
```

**Step 4: Commit**

```bash
git add extension/public/popup.html extension/src/popup/index.ts
git commit -m "feat(extension): add save-to-tracker merge action on done state"
```

---

### Task 6: Connection health polling

**Files:**
- Modify: `extension/src/background/index.ts`
- Modify: `extension/src/popup/index.ts`

**Step 1: Background health polling**

In `background/index.ts`, add a periodic health check. When the service worker is alive (any port or subscription is open), poll `/v1/health` every 15 seconds and update `lastHealthOk` in storage.

Use `setInterval` inside a `chrome.runtime.onConnect` lifecycle hook — only run while at least one popup port is connected:

```typescript
let healthInterval: ReturnType<typeof setInterval> | null = null;
let connectedPopups = 0;

// Manage lifecycle in the existing onConnect listener:
// On connect: connectedPopups++; if 1: start interval
// On disconnect: connectedPopups--; if 0: clear interval
```

**Step 2: Popup polls from storage on reopen**

In `popup/index.ts`, before calling `refreshHealth()`, check `chrome.storage.local` for a cached health state. If recent (within 15s), use it immediately and show the cached state. Then still fire `refreshHealth()` in background to update.

This makes the popup feel instant on reopen — the health dot is already green.

**Step 3: Typecheck and build**

```bash
cd extension && npx tsc --noEmit && npm run build
```

**Step 4: Commit**

```bash
git add extension/src/background/index.ts extension/src/popup/index.ts
git commit -m "feat(extension): add 15s health polling with cached state on popup reopen"
```

---

### Task 7: Empty and error state polish

**Files:**
- Modify: `extension/public/popup.html`
- Modify: `extension/public/popup.css`
- Modify: `extension/src/popup/index.ts`

**Step 1: Bridge-offline state**

When health check fails, the popup currently shows `bad` health dot + the error panel. Improve: show a dedicated "bridge offline" banner at the top of the popup that persists across state changes, with a hint to run `cd bridge && npm run start`.

Add an HTML element:

```html
<div id="offline-banner" class="offline-banner hidden">
  Bridge not reachable. Run: <code>cd bridge && npm run start</code>
</div>
```

CSS for warning banner:

```css
.offline-banner {
  background: #2a1a1a; border: 1px solid var(--err); border-radius: 4px;
  padding: 6px 10px; font-size: 11px; color: var(--err);
}
.offline-banner code { color: var(--fg); }
```

In `popup/index.ts`, `refreshHealth()`:
- On failure with code `INTERNAL` (network error) → show offline banner, hide it on success.

**Step 2: Evaluating-on-reopen state**

If the popup closes and reopens while an evaluation is running, it should detect the running job and resubscribe. Check `lastJobId` from extension state; if present, try `GET /v1/jobs/:id`. If the job is still running, show the running panel and resubscribe.

In `init()`, after token check and before capture:

```typescript
const state = await new Promise<ExtensionState>(resolve =>
  chrome.storage.local.get(STATE_STORAGE_KEY, r => resolve(r[STATE_STORAGE_KEY] ?? {}))
);
if (state.lastJobId) {
  const jobRes = await sendRequest({ kind: "subscribeJob", jobId: state.lastJobId });
  // If still running, show running panel...
}
```

Simpler for Phase 3: just check the job status once from the bridge. If `completed`, show the done panel with the cached `lastResult`. If `failed`, show error. If still running, show running and resubscribe. If 404, proceed to capture normally.

**Step 3: Typecheck and build**

```bash
cd extension && npx tsc --noEmit && npm run build
```

**Step 4: Commit**

```bash
git add extension/public/popup.html extension/public/popup.css extension/src/popup/index.ts
git commit -m "feat(extension): add offline banner and evaluating-on-reopen state recovery"
```

---

### Task 8: Full verification matrix

**Files:**
- No new files — this is a verification-only step.

**Step 1: Typecheck both projects**

```bash
cd career-ops/bridge && npx tsc --noEmit && echo "bridge OK"
cd ../extension && npx tsc --noEmit && echo "extension OK"
```

**Step 2: Build the extension**

```bash
cd extension && npm run build
```

**Step 3: Run the expanded bridge smoke test**

Boot bridge in fake mode and verify all Phase 2 + Phase 3 endpoints:

```bash
# Phase 2 checks (should all still pass)
# 1. Auth failure → 401
# 2. Auth success → 200
# 3. Malformed → 400
# 4. Protocol mismatch → 426
# 5. Valid evaluate → jobId
# 6. SSE done event
# 7. SSE completed phase
# 8. Snapshot completed
# 9. Snapshot trackerRow
# 10. Unknown job → 404

# Phase 3 checks
# 11. POST /v1/tracker → 200 with rows array
# 12. GET /v1/reports/999 → 404
# 13. POST /v1/tracker/merge (dry-run) → 200 with added=0
# 14. GET /v1/jobs → 200 with jobs array
# 15. Bad report num → 400
```

Expected: 15/15 pass.

**Step 4: Reload extension in Chrome and verify**

Manual steps:
1. Reload extension in `chrome://extensions`
2. Navigate to any job page
3. Click popup → should see recent jobs section (empty initially)
4. Evaluate a job (fake mode)
5. Done panel shows "Open report" + "Save to tracker"
6. Click "Save to tracker" → should merge
7. Recent section refreshes
8. Close popup and reopen → health dot should be green immediately
9. If bridge is stopped → offline banner appears

**Step 5: Document unproven items**

Record what remains unproven:
- Real adapter with `CAREER_OPS_BRIDGE_MODE=real` exercising `readReport` and `readTrackerTail` against actual `reports/` and `data/applications.md`
- Health polling lifecycle under Chrome MV3 service worker eviction
- Recent jobs list with many rows (pagination not implemented — cap at 20)
- Report content rendering in the popup (Phase 3 only returns markdown, not rendered HTML)

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: complete Phase 3 — tracker, reports, merge, health polling, error states"
```

---

## Summary of Phase 3 deliverables

| # | Feature | Bridge change | Extension change |
|---|---------|---------------|------------------|
| 1 | Recent jobs list | `POST /v1/tracker` route | new popup section + message + handler |
| 2 | Read report | `GET /v1/reports/:num` route | message + handler (used by recent-item click) |
| 3 | Tracker merge | `POST /v1/tracker/merge` route | "Save to tracker" button on done state |
| 4 | Recent jobs from memory | `GET /v1/jobs` route | recent section also shows in-session jobs |
| 5 | Health polling | — | 15s polling in background, cached state in storage |
| 6 | Offline banner | — | dedicated UI state for bridge-not-reachable |
| 7 | Reopen recovery | — | popup checks lastJobId on init, resubscribes or shows cached result |

All Phase 2 functionality is preserved. No changes to contracts (the types were already declared in Phase 1). No changes to existing career-ops files.
