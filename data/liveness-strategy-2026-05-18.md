# Liveness Strategy — Career-Ops Job-Posting Freshness

**Date:** 2026-05-18
**Trigger:** Mitchell clicked the Cursor FDE row in Apply-Now → drawer rendered → followed JD link → got "Page not found." His ask: design a system that keeps the tracker honest about which postings are still live, either overnight or in realtime.

---

## TL;DR

- **Existing infrastructure is 80% there already.** `verifyApplyNowLink()` in `scripts/heartbeat.mjs:1073` already does API-aware checks for Greenhouse, Ashby, and Lever, and `markRowAsExpired()` already mutates `data/applications.md` correctly. The gap is **scope** — it only runs against the ~10-row Apply-Now Queue inside the heartbeat email, not against all 40 active rows in the tracker.
- **Cursor (Anysphere) FDE is still active.** Ashby API confirms job UUID `34cecd0c-c392-4454-8ef5-261310541011` is still listed in `https://api.ashbyhq.com/posting-api/job-board/cursor` (HTTP 200, role title "Forward Deployed Engineer"). The "Page not found" Mitchell saw was almost certainly a SPA hydration race or transient CDN miss — not a removed posting.
- **Recommendation: ship a standalone overnight sweep TONIGHT, defer the drawer-time realtime probe to a 2-3h follow-up.** A daily 03:30 PT batch covers all 40 rows in ~90 seconds and writes a sidecar JSON state file the dashboard can read for visual badges.

---

## Current State Inventory

### Active tracker rows (status histogram)

| Status | Count | Liveness-eligible? |
|---|---|---|
| `Discarded` | 83 | No (already removed) |
| `Evaluated` | 40 | **YES** — need to verify these |
| `SKIP` | 14 | No (deliberately skipped) |
| `Applied` | 0 | YES if any |
| `Interview` | 0 | YES if any |

**40 rows** is the working set for a liveness sweep today.

### Distinct ATS domains in active rows (top 12)

| Domain | Count | Coverage by existing API logic |
|---|---|---|
| `jobs.ashbyhq.com` | 28 | ✅ API-aware (`api.ashbyhq.com/posting-api/job-board/{board}`) |
| `job-boards.greenhouse.io` | 13 | ✅ API-aware (`boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}`) |
| `jobs.lever.co` | 10 | ⚠️ No API-aware path yet — falls through to generic HTTP/text scan |
| `www.linkedin.com` | 8 | ⚠️ LinkedIn jobs/view URLs are aliased to canonical ATS URLs by `lib/resolve-ats-url.mjs` (already wired in `getReportUrl()`) |
| `databricks.com` (wraps Greenhouse `gh_jid`) | 3 | ✅ Greenhouse `gh_jid` is detected by the existing regex |
| `www.amazon.jobs` | 3 | ⚠️ Generic HTTP scan only |
| `*.workday[Jobs].com` (NVIDIA, Adobe) | 2 | ⚠️ Workday — SPA-heavy; generic scan less reliable |
| `boards.greenhouse.io` | 1 | ✅ Greenhouse |
| `withwaymo.com`, `sumble-inc.workable.com`, `weworkremotely.com` | 3 | ⚠️ Generic |

**Coverage math:** ~45 of 67 URL hits (~67%) ride API-aware paths. The remaining 22 are SPA / generic HTTP and need the permissive body-pattern scan that `liveness-core.mjs` already implements.

### Existing liveness code

| File | Role |
|---|---|
| `liveness-core.mjs` | Pure classification function `classifyLiveness({status, finalUrl, bodyText, applyControls})` → `{result: 'active'\|'expired'\|'uncertain', reason}`. Hard-expired regexes win over generic Apply text (Mitchell's prior memory rule respected). |
| `lib/http-liveness.mjs` | Async `checkUrl(url)` wrapper that fetches + applies `classifyLiveness`. Used by `triage.mjs` and `batch-runner-batches.mjs`. Returns `{live, reason, body, status}`. |
| `check-liveness.mjs` | Playwright CLI for one-off checks (`node check-liveness.mjs <url> ...`). Sequential per project rule "never Playwright in parallel". |
| `scripts/heartbeat.mjs:1073 verifyApplyNowLink()` | API-aware version (Greenhouse + Ashby JSON APIs, then generic HTTP). Called only against the heartbeat Apply-Now Queue (~10 rows) via 5-way `poolMap`. |
| `scripts/heartbeat.mjs:1139 markRowAsExpired()` | In-place tracker mutator: rewrites the matching row's status to `Discarded`, prefixes notes with `⚠️ LINK EXPIRED on {date} ({reason})`. Only fires on `Evaluated`. |
| `triage.mjs --liveness-only` | Bulk liveness purge for the **pipeline** (pre-evaluation queue), not the tracker. |

### Current scheduled jobs (relevant subset)

| LaunchAgent | Time | Purpose |
|---|---|---|
| `com.mitchell.career-ops.scan.plist` | 02:00 PT daily | Portal scan into pipeline |
| `com.mitchell.career-ops.heartbeat.plist` | 09:00 PT daily | Email digest (does Apply-Now liveness inline) |
| `com.mitchell.career-ops.batch.plist` | (per-run) | Batch evaluator |
| 14 others | various | Community scan, company pulse, signal monitor, etc. |

**No dedicated liveness job exists.** Liveness is only ever a side-effect of heartbeat (~10 rows) or triage (pipeline, not tracker).

---

## A. Overnight Batch Approach (RECOMMENDED — ship tonight)

### Design

A new standalone script `scripts/liveness-sweep.mjs` that runs daily before the heartbeat. Reuses every primitive already built — zero new logic, just orchestration.

**Pipeline:**

1. `parseApplicationsTracker('data/applications.md')` → 40 rows with `status ∈ {Evaluated, Applied, Interview}`
2. For each row, resolve `getReportUrl(row.reportPath)` → canonical ATS URL (LinkedIn aliases auto-resolved by `lib/resolve-ats-url.mjs`)
3. `poolMap(rows, verifyApplyNowLink, concurrency=5)` — same 5-way pool the heartbeat already uses, so we don't hammer any single ATS host
4. Three outcomes per row:
   - **`active`** → no-op, refresh `data/liveness-state.json` with `lastChecked`
   - **`expired`** (HTTP 404/410, listing-page redirect, hard-expired pattern) → call `markRowAsExpired(num, reason)` (already auto-marks `Evaluated` → `Discarded` with the expired note)
   - **`uncertain`** (network error, SPA without apply control, 5xx) → write to `data/liveness-state.json` with `needsReview: true`, do NOT mutate the tracker
5. Emit a summary line to `data/logs/liveness-sweep-{date}.log`
6. Exit 0 on success

### Schedule

**03:30 PT daily** — pre-heartbeat (09:00), post-scan (02:00). LaunchAgent:

```xml
<!-- ~/Library/LaunchAgents/com.mitchell.career-ops.liveness-sweep.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.mitchell.career-ops.liveness-sweep</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/mitchellwilliams/.nvm/versions/node/v24.14.0/bin/node</string>
    <string>/Users/mitchellwilliams/Documents/career-ops/scripts/liveness-sweep.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/mitchellwilliams/Documents/career-ops</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>3</integer>
    <key>Minute</key><integer>30</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key>
  <string>/Users/mitchellwilliams/Documents/career-ops/data/logs/liveness-sweep-launchd.out</string>
  <key>StandardErrorPath</key>
  <string>/Users/mitchellwilliams/Documents/career-ops/data/logs/liveness-sweep-launchd.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/Users/mitchellwilliams/.nvm/versions/node/v24.14.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>/Users/mitchellwilliams</string>
  </dict>
</dict>
</plist>
```

Equivalent cron (only if Mitchell prefers): `30 3 * * * cd /Users/mitchellwilliams/Documents/career-ops && /Users/mitchellwilliams/.nvm/versions/node/v24.14.0/bin/node scripts/liveness-sweep.mjs >> data/logs/liveness-sweep.log 2>&1`

### Estimated cost

- **Runtime:** ~90s for 40 rows at concurrency=5. Most are Ashby/Greenhouse API hits (200-400ms each); the long tail is generic HTML fetch (~1.5s each).
- **Bandwidth:** API hits are 50-300 KB JSON each; generic fetches up to 1 MB. Total ~10-15 MB per sweep.
- **API tokens:** Zero (Claude API not involved — this is pure HTTP).
- **Rate-limit risk:** Negligible. Ashby + Greenhouse get hit per-board, not per-URL; we'd cluster 28 Ashby checks across ~12 distinct boards. Concurrency cap of 5 plus `signal: AbortSignal.timeout(8000)` keeps us polite.

### Expired-signal precedence (rule already enforced by `liveness-core.mjs`)

Hard expired wins over Apply-text:
1. HTTP 404 / 410 / 451 → `expired`
2. Redirect to `[?&]error=true` → `expired`
3. Body matches `HARD_EXPIRED_PATTERNS` (e.g. "job no longer available", "position filled", "applications closed", multilingual variants) → `expired`
4. Else if visible Apply control → `active`
5. Else if listing-page pattern (e.g. "N jobs found") → `expired`
6. Else if body < 300 chars → `expired` (nav/footer only)
7. Else → `uncertain` (do NOT mutate tracker — needs human eyes)

### Tracker mutation policy

- `expired` → auto-mark `Evaluated` rows to `Discarded` (existing `markRowAsExpired` logic).
- `expired` on `Applied`/`Interview` rows → **do NOT auto-mark**. Mitchell needs to see these. Write to `data/liveness-state.json` and surface in heartbeat as a soft alert ("Applied row #N posting is now down — confirm internally").
- `uncertain` → never mutate. Sidecar JSON flags `needsReview: true`; dashboard renders a yellow "?" badge.

---

## B. Realtime Drawer-Open Probe (FOLLOW-UP)

### Design

When the right-rail drawer opens for a tracker row (`openRightRailForDetail` in `scripts/build-dashboard.mjs:11284`), fire a fast HEAD-style probe before exposing the JD link. Three behaviors:

1. **Cache hit (< 6h old, `alive: true`):** Render Apply button normally.
2. **Cache hit (`alive: false`):** Render a `Posting closed (verified {ts})` badge in red, replace the Apply CTA with a `Mark as Discarded` button that POSTs to `/api/status?num={n}&status=Discarded`.
3. **Cache miss / stale (> 6h):** Show a `Checking…` spinner for ≤ 1.5s, then re-probe via the new endpoint and render whichever of (1)/(2) applies.

### Endpoint: `GET /api/liveness?url=...&num=...`

Wires into `dashboard-server.mjs` next to the existing `/api/status`, `/api/drawer/build-apply-pack` handlers (file: `/Users/mitchellwilliams/Documents/career-ops/dashboard-server.mjs`).

```javascript
// dashboard-server.mjs — add near line 2949 (other /api handlers)
if (url === '/api/liveness') {
  const target = parsed.searchParams.get('url');
  const num    = parsed.searchParams.get('num');
  if (!target) return json({ ok: false, error: 'missing url' }, 400);

  const cache = await readLivenessCache();              // data/liveness-state.json
  const hit = cache.byUrl[target];
  const ageMs = hit ? (Date.now() - new Date(hit.lastChecked).getTime()) : Infinity;
  if (hit && ageMs < 6 * 60 * 60 * 1000) {
    return json({ ok: true, alive: hit.alive, reason: hit.reason, lastChecked: hit.lastChecked, cached: true });
  }

  // Fresh probe — reuse the same verifier the overnight sweep uses.
  const { verifyApplyNowLink } = await import('./scripts/heartbeat.mjs');  // or factor into lib/
  const probe = await verifyApplyNowLink(target);
  const alive = probe.result === 'active';
  await writeLivenessCacheEntry(target, num, alive, probe.reason);
  return json({ ok: true, alive, reason: probe.reason, lastChecked: new Date().toISOString(), cached: false });
}
```

**Caching strategy:** Single JSON file `data/liveness-state.json` keyed by URL. 6h freshness window — repeated drawer opens within 6h return instantly. The 03:30 PT overnight sweep refreshes ALL entries, so drawer hits at 09:00 are always cache hits.

**Throttle:** Server-side per-domain rate limit (max 1 probe / 2s / domain) using an in-memory `Map<domain, lastProbeAt>`. Prevents drawer-spam from a curious user clicking 12 rows in 10 seconds.

**Redirect-loop / weird-response defense:** `verifyApplyNowLink` already uses `AbortSignal.timeout(8000)` and catches in a try/finally returning `{result: 'uncertain', reason: ...}`. Surface "uncertain" as a yellow "?" badge in the drawer with a "Verify manually" link.

### Drawer JS hook (sketch)

```javascript
// build-dashboard.mjs — inside openRightRailForDetail(), after applyHref is computed (~line 11320)
if (applyHref) {
  const probeUrl = '/api/liveness?url=' + encodeURIComponent(applyHref) + '&num=' + encodeURIComponent(num);
  fetch(probeUrl).then(r => r.json()).then(j => {
    if (!j.ok) return;
    const applyBtn = drawer.querySelector('.drawer-apply-btn');
    if (j.alive === false) {
      applyBtn.replaceWith(buildDiscardButton(num, j.reason));
      drawer.querySelector('.drawer-status-area')?.insertAdjacentHTML('beforebegin',
        '<div class="posting-closed-badge">Posting closed — verified ' + new Date(j.lastChecked).toLocaleString() + '</div>');
    } else if (j.alive === null || j.alive === undefined) {
      applyBtn.insertAdjacentHTML('afterend', '<span class="badge-uncertain" title="' + j.reason + '">?</span>');
    }
  }).catch(() => {});
}
```

### Why HEAD-style not HEAD-only

A literal `fetch(url, {method:'HEAD'})` doesn't work for Ashby/Lever — they return 200 for HEAD on every UUID, even removed ones, because the SPA route lives at the same path. We need the API-aware logic from `verifyApplyNowLink`. The "fast" part comes from the boards-api/posting-api JSON endpoints, which return well under 500ms and unambiguously 404 when removed.

---

## C. Hybrid Approach — RECOMMENDED (why)

| Concern | Overnight-only | Realtime-only | Hybrid |
|---|---|---|---|
| Detects removal within hours of posting going down | No (up to 24h lag) | Yes (sub-second) | Yes |
| Works for Mitchell when offline / asleep | Yes | No | Yes |
| Cost per drawer open | 0ms | 200-500ms (first time) | 0ms (warm cache) |
| Catches removals between drawer visits | No | No | Yes (nightly refresh) |
| Auto-cleans `applications.md` without UI interaction | Yes | No | Yes |
| Implementation surface area | 1 file + 1 plist | ~150 LOC across server + drawer + JS | Same as overnight + ~150 LOC follow-up |

**Hybrid wins because the overnight sweep does the heavy lifting (40 rows, ~12 ATSes, 90s once a day) and writes a sidecar cache that the drawer reads instantly.** Realtime only matters for the rare case where a posting goes down between 03:30 and the moment Mitchell clicks the row — and even then, the 6h cache freshness window means a fresh probe runs lazily on first open after staleness.

**Ship order:**

1. **Tonight (zero-overhead):** Drop `scripts/liveness-sweep.mjs` + `~/Library/LaunchAgents/com.mitchell.career-ops.liveness-sweep.plist`. Loadable with `launchctl load`. Validates against the 40 active rows tonight, runs every 03:30 PT after that.
2. **Follow-up (~2-3h dev):** `/api/liveness` endpoint in `dashboard-server.mjs` + drawer JS hook + UI badge styling. Wires both layers of the cache.

---

## D. Implementation Sketch

### Files to touch

| Phase | Path | Action |
|---|---|---|
| 1 | `scripts/liveness-sweep.mjs` | NEW — orchestrator script |
| 1 | `~/Library/LaunchAgents/com.mitchell.career-ops.liveness-sweep.plist` | NEW — LaunchAgent |
| 1 | `lib/liveness-cache.mjs` | NEW — read/write `data/liveness-state.json` (small helper, ~40 LOC) |
| 1 | `scripts/heartbeat.mjs:1073` | EXTRACT `verifyApplyNowLink` into `lib/liveness-verifier.mjs` so both heartbeat and the sweep import the same function (no behavior change, just a move) |
| 2 | `dashboard-server.mjs` | ADD `/api/liveness` handler (~30 LOC) |
| 2 | `scripts/build-dashboard.mjs:11284` (drawer fn) | ADD client-side probe + badge render (~40 LOC) |
| 2 | `scripts/build-dashboard.mjs` CSS section (~line 7780+) | ADD `.posting-closed-badge` + `.badge-uncertain` styles |

### Schema additions

**No new column in `applications.md`.** Liveness state lives in a sidecar JSON so it never collides with merge-tracker / merge logic:

```json
// data/liveness-state.json
{
  "version": 1,
  "lastSweep": "2026-05-18T10:30:14.221Z",
  "byUrl": {
    "https://jobs.ashbyhq.com/cursor/34cecd0c-c392-4454-8ef5-261310541011": {
      "num": 840,
      "alive": true,
      "reason": "Ashby API: role still listed",
      "lastChecked": "2026-05-18T10:30:14.221Z",
      "checkedVia": "ashby-api"
    },
    "https://jobs.lever.co/example/abc-removed": {
      "num": 1234,
      "alive": false,
      "reason": "HTTP 404",
      "lastChecked": "2026-05-18T10:30:15.001Z",
      "checkedVia": "generic-http"
    }
  },
  "byNum": {
    "840": "https://jobs.ashbyhq.com/cursor/34cecd0c-c392-4454-8ef5-261310541011"
  }
}
```

### Error handling

| Failure mode | Behavior |
|---|---|
| Network timeout (>8s) | Mark `uncertain`, write to cache, do NOT mutate tracker |
| Single-domain rate limit | Concurrency=5 + 250ms inter-request stagger per domain (small mod to `poolMap` call site) |
| Redirect loop / circular | Node's `redirect: 'follow'` defaults cap at 20; treat eventual error as `uncertain` |
| `markRowAsExpired` regex misses (e.g. row already mutated) | Existing function early-returns silently — safe to call twice |
| Concurrent sweep + heartbeat | Both call `verifyApplyNowLink` independently; both write `markRowAsExpired` idempotently. Risk: race on `applications.md` write. **Mitigation:** sweep at 03:30, heartbeat at 09:00 — no overlap window. If schedules drift, add an `fcntl(LOCK_EX)`-style lock on `data/applications.md` (Node has `proper-lockfile` already in this project? — check before adding dep) |
| `Applied` / `Interview` rows go expired | Sidecar-only, NEVER auto-Discard. Heartbeat surfaces a yellow "needs your confirmation" tile |

---

## E. Cursor-Role Finding

### Tracker rows mapping to Cursor (Anysphere)

| # | Date | Status | Report | URL |
|---|---|---|---|---|
| **840** | 2026-04-28 | Evaluated (4.5/5) | `reports/091-cursor-2026-04-28.md` | `https://jobs.ashbyhq.com/cursor/34cecd0c-c392-4454-8ef5-261310541011` |
| **2165** | 2026-05-16 | (re-eval of 840 — same UUID) | `reports/2165-cursor-anysphere-forward-deployed-engineer-2026-05-16.md` | `https://jobs.ashbyhq.com/cursor/34cecd0c-c392-4454-8ef5-261310541011` |

**Both rows point to the same Ashby UUID.** Row 2165 looks to be a re-evaluation of the same Cursor FDE posting that originally created row 840 (this is by-design per the dedup rule in `AGENTS.md`).

### Live-state verification (just-now curl)

```text
$ curl -L -o /dev/null -w "HTTP %{http_code}" --max-time 12 \
    "https://jobs.ashbyhq.com/cursor/34cecd0c-c392-4454-8ef5-261310541011"
HTTP 200

$ curl --max-time 12 "https://api.ashbyhq.com/posting-api/job-board/cursor?includeCompensation=true" \
    | jq '.jobs[] | select(.id == "34cecd0c-c392-4454-8ef5-261310541011" or
                            (.jobUrl // "") | contains("34cecd0c"))'
{
  "title": "Forward Deployed Engineer",
  ...
}
```

**Conclusion: the Cursor FDE posting is LIVE.** The HTTP 200 + presence in the Ashby board JSON (alongside 86 other open Cursor roles) both confirm it.

### Why Mitchell saw "Page not found"

Three plausible causes, in order of likelihood:

1. **Ashby SPA hydration race.** `jobs.ashbyhq.com` returns a near-empty HTML shell at HTTP 200 and hydrates the posting body via a follow-up JSON call. If that follow-up call fails (network blip, CDN miss, ad blocker, browser extension), the SPA renders a generic "Page not found" UI inside the shell. The URL is fine; the client failed to fetch the role JSON.
2. **A/B test or auth wall.** Cursor occasionally gates specific FDE postings behind a referral-email link. The bare URL works but renders a generic shell.
3. **Browser-side caching.** A stale HTML shell from a prior visit (when the role was, say, briefly paused) cached the not-found state. Hard reload (Cmd-Shift-R) would fix.

**Recommendation:** Don't mark row 840 / 2165 as Discarded. Confirm by hard-reloading the URL in a fresh tab. If it still 404s in clean Chrome, the Ashby API answer becomes load-bearing — and it currently says ACTIVE.

---

## F. Cost / Effort Estimate

| Item | Effort | When |
|---|---|---|
| `scripts/liveness-sweep.mjs` (~80 LOC, all reuse) | 20-30 min | Tonight |
| LaunchAgent plist + `launchctl load` | 5 min | Tonight |
| Extract `verifyApplyNowLink` → `lib/liveness-verifier.mjs` | 10 min | Tonight (clean refactor, no behavior change) |
| `lib/liveness-cache.mjs` helper | 15 min | Tonight |
| `/api/liveness` endpoint in `dashboard-server.mjs` | 30-45 min | Follow-up |
| Drawer probe + badge + CSS | 60-90 min | Follow-up |
| Manual QA on 5 mixed URLs (Ashby live, Ashby removed, Greenhouse live, Lever generic, Workday) | 15 min | Both |
| **Total — Phase 1 only (overnight batch)** | **~60 min** | **Tonight** |
| **Total — full hybrid** | **+~2-3 hours** | **Follow-up day** |

### Recurring runtime cost

- 90s of network IO at 03:30 PT, once daily.
- No Claude API spend.
- Disk: `data/liveness-state.json` is ~5-10 KB at 40 rows; bounded by `Evaluated + Applied + Interview` count.

---

## Open Questions / Decisions for Mitchell

1. **Do we auto-Discard `Evaluated` rows on `expired`, or surface for review first?** Recommended: auto-Discard `Evaluated` (matches existing heartbeat behavior); flag `Applied` / `Interview` for review (he needs to know if a company removed a posting he applied to — could be a signal of internal hiring freeze).
2. **6h cache freshness — too aggressive or too loose?** 6h aligns with: post-sweep (03:30) → heartbeat read (09:00) → first drawer open (often ~09:30 after reading email). If he tends to open the drawer in the late afternoon, bump to 12h. Adjustable in one constant.
3. **Email summary in heartbeat?** Add a 2-line "Liveness Sweep: 38 alive, 1 expired (#840), 1 uncertain (#1234)" tile to the daily heartbeat email at the bottom? Cheap to add, gives an audit trail.
4. **Cursor row 840 / 2165:** assuming the URL hard-reloads cleanly, leave both rows in place. If it still 404s in a clean browser session, then we Discard with a manual note (don't trust the Ashby API alone if the actual page is dark — possible API/board desync).
