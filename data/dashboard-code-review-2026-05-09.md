# Career-Ops Code Review — Post-Merge Pass

**Date:** 2026-05-09
**Branch:** `main` after the 12-PR mobile/Cmd-K/writeback/expand bundle landed.
**Files reviewed:**
`scripts/build-dashboard.mjs` (3341 lines) · `dashboard-server.mjs` (805) ·
`scan.mjs` (491) · `scan-rss.mjs` (551) · `scan-email.mjs` (720) ·
`signal-monitor.mjs` (316) · `scripts/weekly-intel.mjs` (353) ·
`scripts/overpay-signals.mjs` (163) · `scripts/career-library-builder.mjs` (163).

Severity legend: 🔴 must-fix · 🟡 should-fix · 🟢 polish / nice-to-have.

---

## 1. Code smells

### 🔴 1.1 Build-dashboard is a 3341-line single-file monolith
`scripts/build-dashboard.mjs` mixes data extraction (lines 36–467), inline CSS
(~1000 lines, 932–2035), HTML templates (2037–2295), and a 1000-line client
script (2297–3328). The CMD-K palette JS, status writeback, modal logic, sort,
filter, dark mode, batch poller, toast, gap modal, tier-legend, mobile sheet
all sit inline. There is no module boundary; every change risks unrelated
breakage. Split into `dashboard/index.html.mjs` (template), `dashboard/style.css`,
`dashboard/app.js`, and `lib/report-extract.mjs`.

### 🔴 1.2 Triplicate scan helpers — drifting silently
`loadSeenUrls`, `appendToPipeline`, `appendToScanHistory`, `buildTitleFilter`
all exist in three near-identical copies across `scan.mjs:258-348`,
`scan-rss.mjs:392-450`, and `scan-email.mjs:433-491`. Subtle differences are
already accreting:
- `scan.mjs:307` writes `| ${o.posted || date}` to pipeline; `scan-rss.mjs:418`
  writes no date; `scan-email.mjs:459` always uses today.
- `scan-email.mjs:422-429` softens title filter (negatives only); the others
  apply both — easy to miss.

Pull into `lib/scan-shared.mjs`.

### 🟡 1.3 Four parallel HTML-entity decoders
`scan-rss.mjs:65 decodeEntities`, `scan-rss.mjs:181 htmlDecode`,
`scan-rss.mjs:226 htmlDecode`, `scan-email.mjs:358 decodeUrl`,
`signal-monitor.mjs:232 decodeHtmlEntities`. Each handles a slightly
different subset (some do `&#x2F;`, some don't). Consolidate to one helper.

### 🟡 1.4 Two `parseApplications` implementations
`dashboard-server.mjs:109-131` and `build-dashboard.mjs:36-59` parse the same
markdown table differently. Server uses `l.startsWith('|') && !l.match(...)`;
the builder uses `/^\|\s*\d+\s*\|/`. The builder will silently skip rows whose
`#` column has padding or non-numeric prefixes; the server won't. Same data,
two parsers, two truths.

### 🟡 1.5 Status normalization triplicated
`dashboard-server.mjs statusKey` (server-side, used nowhere — see note),
`build-dashboard.mjs:526 statusKey` (build-time), `build-dashboard.mjs:2501
statusKey` (client JS), and again at line 3190 `statusClassFor`. Four copies
of the same lowercased-substring-includes ladder.

### 🟡 1.6 `getX()` extractors hammer disk
`build-dashboard.mjs:545-682 renderRow` calls 10 separate file readers:
`getReportArchetype`, `getReportUrl`, `getReportFinalRecommendation`,
`getCompetitiveEdge`, `getTldr`, `getPositioning`, `getComp`, `getKeyGaps`,
`getTopStories`, `getWhyGapsDontBlock`, plus per-gap `getGapStrategy`. Each is
its own `readFileSync` of the same report file. With ~944 evaluations that is
**~10,000 redundant disk reads per build** (see §4.1).

### 🟡 1.7 Two unrelated `keydown` listeners on `document`
`build-dashboard.mjs:3133-3161` (Cmd-K palette) and `:3170-3173` (modal
escape). They guard against each other (`if (_cmdkOpen) return`), but the
order is fragile — adding a third listener later means hunting for whichever
fires first. Route through one keymap.

### 🟢 1.8 `signal-monitor.mjs:243 triggerScan` is dead code
Comment says "scan.mjs doesn't support single-company yet" — but it does
(`--company` flag, scan.mjs:374). The function only logs and returns. Either
wire it up via `spawnSync('node', ['scan.mjs', '--company', portal])` or
delete.

### 🟢 1.9 `dashboard-server.mjs:599 loadCanonicalStatuses` regex parser
Hand-rolls `templates/states.yml` parsing with `text.matchAll(/^\s+label:.../gm)`
to avoid pulling in a YAML dep — but `js-yaml` is already in scan.mjs and
build-dashboard.mjs. Use it.

---

## 2. Security gaps

### 🔴 2.1 Path traversal in `/api/verify`, `/api/save-evidence`, `/api/report`
`dashboard-server.mjs:484 buildVerifyPayload(reportSlug)`, `:570 saveEvidence`,
and the `/api/report/...md` handler all do `join(ROOT, 'reports', slug)` with
the user-controlled slug from the URL. Slug is matched against `(.+\.md)$`
(line 713) — which **does not exclude `..`**. A request to
`/api/verify/../../etc/passwd.md` resolves outside the reports directory.
`saveEvidence` then `appendFileSync`s arbitrary content there.

Fix: reject slugs containing `..`, `/`, leading `.`, or non-`.md`. E.g.
```js
if (!/^[\w.-]+\.md$/.test(reportSlug)) return null;
```

### 🔴 2.2 No size cap on `/api/save-evidence`
`dashboard-server.mjs:720-735`: collects `req.on('data')` chunks unbounded into
`body`. Compare to `:737-765 /api/status` which clamps at 8 KB and destroys
the socket. A malicious page can post a 1 GB body and OOM the server. Mirror
the 8 KB clamp here too (or whatever evidence ceiling makes sense — 256 KB).

### 🔴 2.3 Markdown→HTML rendered without sanitization
`build-dashboard.mjs:157` (`renderReportToHtml`) and `:622-624` (gap modal)
both call `marked.parse()` on report content and inject the result via
innerHTML. Reports today are model-generated, but the threat model is "any
report file on disk" — including reports an attacker could plant by exploiting
2.1, or by abusing the email/scan ingestion pipelines. A `<img src=x
onerror=...>` in a report body executes when the dashboard renders.

Fix: sanitize via `isomorphic-dompurify` before injection.

### 🔴 2.4 No CSRF protection on writeback endpoints
`/api/status` and `/api/save-evidence` accept POST with `Content-Type:
application/json` from any origin (`Access-Control-Allow-Origin: *` at line
702, 727, 759). The dashboard binds `0.0.0.0` by default (`server.listen(PORT)`,
:803, no host arg), so anyone on the same Wi-Fi can write status changes.
Even on localhost, any browser tab the user opens can fetch these endpoints.

Fix: bind to `127.0.0.1` explicitly, drop wildcard CORS for write endpoints,
add an Origin or Host header check, or require a token from a localStorage
cookie.

### 🟡 2.5 SSRF in `scan-email.mjs:315 expandLinkedInUrl`
Follows arbitrary URLs extracted from email bodies, with `redirect: 'follow'`
and a Chrome UA. Email is attacker-controlled. A `lnkd.in/...` link could
redirect to `http://localhost:3000/api/save-evidence` or any internal address.
There is no host whitelist beyond "URL must initially match a LinkedIn
pattern" (and even that doesn't constrain the redirect chain).

Fix: after each redirect hop, validate `res.url` is on a public IP and a
known host (greenhouse, lever, ashby, lnkd.in, linkedin.com).

### 🟡 2.6 `--dangerously-skip-permissions` with user-controlled prompt
`overpay-signals.mjs:127` and `career-library-builder.mjs:141` both spawn
Claude with `--dangerously-skip-permissions`. The overpay prompt embeds
company/role names sourced from `data/apply-now-queue.json`, which is built
from `data/applications.md`, which is editable by anyone with file access
(including auto-merge from email scanners). A prompt-injection payload like
`Anthropic"; rm -rf ~; "` in a company name could bend the unrestricted Claude
call. Sanitize/escape prompt interpolations or drop `--dangerously-skip-permissions`.

### 🟡 2.7 `cmdkPayload` JSON-in-script escaping is incomplete
`build-dashboard.mjs:924` does `.replace(/<\//g, '<\\/')` to defang
`</script>` — but not U+2028 / U+2029 line separators which JSON allows in
strings but JS treats as line terminators (breaks the script). Use
`JSON.stringify(...).replace(/<\/(script|style|!--)/gi, '<\\/$1').replace(/[  ]/g, c => '\\u' + c.charCodeAt(0).toString(16))`.

### 🟢 2.8 `.env` shadowing in `signal-monitor.mjs:31 loadEnv`
Reads `.env` line-by-line and pushes to `process.env`. If a key contains
shell-special characters (`$`, backticks) and is later passed to `spawnSync`,
trouble. Today no such pass-through exists, but the function is in shared
territory.

---

## 3. Bug risks

### 🔴 3.1 `detailApplied` is frozen at 2026-05-07
`dashboard-server.mjs:257` — `const today = new Date('2026-05-07')`. The
days-since-applied calculation will silently report nonsense once the calendar
moves past that date (it already has — today is 2026-05-09). Replace with
`new Date()`.

### 🔴 3.2 Concurrent scan writes race on pipeline.md
`scan.mjs:307`, `scan-rss.mjs:418`, `scan-email.mjs:459` all do
`readFileSync(PIPELINE_PATH) → mutate → writeFileSync(PIPELINE_PATH)`. There
is no lock. Launchd runs scan + scan-rss + scan-email on overlapping
schedules (and a manual run can collide). The last writer wins; offers from
the loser are silently dropped.

Fix: introduce `lib/pipeline-write.mjs` that uses `proper-lockfile` (already
in npm — Workday helper uses fetch with timeouts but no locking) or an atomic
rename. The status writer in `dashboard-server.mjs:683-689` already uses
`writeFileSync(tmp) → renameSync` — copy that pattern across all writers and
combine with a flock.

### 🔴 3.3 Email marked-read on partial failure
`scan-email.mjs:601-676` collects offers across alerts, then at line 707 marks
all `processedUids` read. But the writes to pipeline/history happen AFTER the
loop — if those throw, the messages are still queued for marking. Move
`markRead` inside a `try { writes; markRead } catch` so a write failure leaves
the email unread for the next run.

### 🟡 3.4 IMAP connection leak on early error
`scan-email.mjs:584` — if `await fetchAlerts` throws after we re-list folders
and re-throw, `client.logout()` is never called. The `try/catch/throw` exits
without cleanup. Wrap the body in `try { ... } finally { await client.logout()
}`.

### 🟡 3.5 `pollBatch` interval never clears in some paths
`build-dashboard.mjs:2744` clears `_batchInterval` only when
`data.completed >= data.total && !data.running`. If `batch-state.tsv` is
truncated mid-run, `data.total` drops to zero and the condition becomes
`0 >= 0 && !0 = true` — clears the interval, fine. But if the API endpoint
ever returns `data.total = null` (e.g., file-not-found path returns empty
array but `total = 0`), polling continues forever at 2s. Low risk; consider a
hard ceiling (stop after 60 polls without a delta).

### 🟡 3.6 `parsePipeline` tier detection matches "Tier 10"
`dashboard-server.mjs:140` — `l.includes('Tier 1')` will also fire on
`Tier 10`, `Tier 11`. Today only Tiers 1–3 exist; if you ever introduce a
Tier 10+ heading the counts collapse silently. Use
`/^##\s+Tier\s+(\d+)\b/`.

### 🟡 3.7 `detailBatches` 15-min gap heuristic mis-groups long batches
`dashboard-server.mjs:351-370`: any batch with a >15 min gap between
consecutive `started_at` timestamps splits into two phantom runs. A single
slow batch (one item taking 20 min mid-run) appears as two separate batches.
Better signal: group by a `batch_id` column added at submission time.

### 🟡 3.8 `scan.mjs parallelFetch` hides per-task errors
Lines 357–367: errors inside a task `await task()` propagate up through
`Promise.all(workers)`, killing all workers on the first throw. Wrap each
task in its own try/catch (the call sites already collect errors into
`errors[]`, so the throw paths are unreachable in practice — but the pattern
is brittle).

### 🟡 3.9 Optimistic status revert restores stale text
`build-dashboard.mjs:3252-3292`: on failure, `badge.textContent = original`
where `original` was captured before the optimistic swap. If two clicks fire
in quick succession (popover stays open after failure?), the second
`original` could be the in-flight optimistic value. Today the popover closes
on click; low risk, but worth a guard.

### 🟢 3.10 `signal-monitor.mjs` HTML fallback yields false positives
Lines 219–227: when no RSS items found, scrapes every `<h1-3>` 10–200 chars
long. Site nav menus, footer headings, "Subscribe to our newsletter" all hit
the milestone keyword filter. Tighten the fallback to require a date-bearing
sibling element, or skip the fallback entirely.

### 🟢 3.11 `weekly-intel.mjs` profile match too loose
`scripts/weekly-intel.mjs:48` — regex `/target_roles:([\s\S]*?)narrative:/`
relies on YAML key ordering. If `narrative:` ever moves above `target_roles:`,
the match fails silently and the prompt context is empty. Use `js-yaml`.

---

## 4. Performance

### 🔴 4.1 Build-dashboard re-reads each report 10× per row
See §1.6. With ~944 applications × 10 readers per `renderRow`, that's
~9,400 file reads per build. On a slow disk this turns a 2 s build into a 30 s
build. Fix: a memoized `parseReport(path)` that does one read and returns
`{ archetype, url, finalRec, edges, gaps, stories, comp, tldr, positioning,
whyOk }`. Single source, 10× speedup.

### 🟡 4.2 All ~944 reports re-rendered to HTML on every build
`build-dashboard.mjs:717-721` writes every `reports/*.md` to
`dashboard/reports/*.html` on every build via `renderReportToHtml`. Skip
unchanged via `mtime` comparison or a content hash. ~95% of builds change
1–2 reports; we currently rewrite all of them.

### 🟡 4.3 Single 4–5 MB HTML page on first paint
944 inline rows × ~5 KB markup each = a giant document. First Contentful Paint
on phones is slow. Phase 5 candidates: server-render the top 50 rows + lazy
load the rest, or move to client-side virtualization (`react-window`-style,
even without React).

### 🟡 4.4 `dashboard-server.mjs` detail endpoints re-read on every poll
`detailEvaluations` calls `parseReportSummary(r.report)` for up to 200
recent rows. Front-end polls `/api/stats` every 30 s and detail endpoints on
demand. No caching layer. With the same memoization fix as 4.1, plus an
mtime-keyed cache for parseReportSummary.

### 🟢 4.5 Client-side filter loops over all rows
`applyFilters` in `build-dashboard.mjs:2369` iterates every `tr.row` — fine
at 944 rows on a laptop, slow on mobile. Only matters if the row count keeps
climbing. Worth a virtualized renderer once we cross ~2000 rows.

### 🟢 4.6 `scan-rss.mjs` HN fetcher runs sequentially
`fetchHNWhoIsHiring` does `await search → await thread`. Both calls hit the
same Algolia host and could run in parallel. Saves ~500 ms per scan run.

---

## 5. Refactor opportunities

1. **`lib/scan-shared.mjs`** — `loadSeenUrls`, `appendToPipeline`,
   `appendToScanHistory`, `buildTitleFilter`, `decodeHtml`. Makes drift
   impossible. Estimated 3 hours; touches 3 files.
2. **`lib/report-extract.mjs`** — single `parseReport(path)` returning the
   structured record. Eliminates §1.6 / §4.1. Estimated 4 hours.
3. **Split `build-dashboard.mjs`** — `dashboard/index.html.mjs` (template),
   `dashboard/style.css`, `dashboard/app.js`. Bundle the CSS/JS as static
   files served by `dashboard-server.mjs` (already serves `dashboard/`).
   Estimated 6–8 hours; tracking down all the closures and template
   substitutions is the slow part.
4. **Path-validation helper** — one `safeReportSlug(s)` used by all three
   server endpoints. 30 minutes; closes §2.1.
5. **Atomic write + lock** — one helper used by every pipeline.md writer.
   2 hours; closes §3.2.
6. **Markdown sanitizer** — wrap `marked.parse` in `dompurify.sanitize`;
   single import surface. 1 hour; closes §2.3.
7. **Structured batch-id column** — emit a UUID at batch submission time and
   write it to `batch/batch-state.tsv` so grouping is deterministic. Closes
   §3.7. Cross-cuts batch-runner-batches.mjs and dashboard-server.mjs.

---

## 6. Dashboard Phase 5 queue — 5 prioritized items

Ordered by **impact ÷ effort**.

| # | Item | Severity | Impact | Effort | Why now |
|---|------|----------|--------|--------|---------|
| 1 | **Memoize report parsing** (`lib/report-extract.mjs`) | 🟡 perf | High — ~10× faster builds, also speeds detail endpoints | S (4 h) | Every other Phase 5 item gets cheaper after this lands |
| 2 | **Path-traversal hardening** on /api/verify, /api/save-evidence, /api/report | 🔴 sec | High — closes a clear traversal vector | XS (30 min) | Listed against in §2.1; trivial to land, embarrassing to leave |
| 3 | **Sanitize marked output** with isomorphic-dompurify | 🔴 sec | High — defangs report XSS surface | S (1 h) | Pairs with #2; same security pass |
| 4 | **Extract `lib/scan-shared.mjs`** + atomic-locked writers | 🟡 bug + smell | Medium — closes §3.2 race + §1.2 drift | M (5 h) | Prevents silent loss of overnight scan offers |
| 5 | **Fix detailApplied today + batch_id column** | 🔴 bug + 🟡 smell | Medium — correct days-since calc + reliable batch grouping | S (2 h) | Combined into one PR; both touch dashboard-server.mjs |

**Out-of-scope this phase but flagged for Phase 6:**
- Split build-dashboard.mjs into dashboard bundle (§5.3, 6–8 h, big risk).
- Virtualized row rendering for >2 k rows (§4.5).
- CSRF / origin pinning on writeback endpoints (§2.4) — needs a small auth design.
- Markdown→HTML caching with mtime gate (§4.2).
- Browser bundle for shared status normalizer (§1.5).

---

*Reviewed by Claude (Opus 4.7) on 2026-05-09. Cite line numbers from this
review when filing PRs; the codebase is moving fast and absolute line numbers
will drift.*
