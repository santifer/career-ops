# Regression Scan — 2026-05-18

**Investigator:** Phase A subagent (read-only)
**Scope:** Verify 16-item functionality inventory + diagnose 4 user-reported regressions.
**No files were edited.**

---

## 1. Headline Regressions

| # | Regression | File | What's missing / broken | Confidence |
|---|---|---|---|---|
| R1 | **Q3 2026 KPI tile is inert (no popout, no drill-in)** | `dashboard/index.html` L5448–5452 (built from `scripts/build-dashboard.mjs` L9636–9640) | Only `title=` tooltip remains after commit `53f1930` ripped out the `anchor-2031` drill-in handler. Tile renders, but click does nothing. Adjacent tiles (Total evals, Pipeline pending, Press network, Applied) all have onclick → toggleStatPanel or drillIn. | **High** — verified in both built HTML and source generator |
| R2 | **`.drawer-role` clips role title to 2 lines without expand affordance** | `dashboard/index.html` L3721–3726 | `-webkit-line-clamp: 2` + `text-overflow: ellipsis`; no tooltip, no expand button, no `title=` on the clamped element. P0-1 truncation fix (cab136d) only covered `td.role-cell` + `td.company-cell` in the tables — missed the drawer header. | **High** |
| R3 | **`.op-action-text` clips outreach Pulse action text to 3 lines** | `dashboard/index.html` L42571–42580 + L42771–42777 (Row v2 + v3 variants) | Same pattern as R2 — 3-line clamp, no inline expand or `title=`. Truncates the action instructions the user actually needs to read to act. | **High** |
| R4 | **Apply-pack `/draft/{rowId}` route renders "No artifact found" walls for rows without packs** | `dashboard-server.mjs` L4066–4280 | If `data/apply-packs/{padded}-*` and `apply-pack/{padded}-*` are both missing for a row (e.g., row #840 Cursor — only 28 apply-packs exist for ~30+ Apply-Now rows), every tab shows "No CV/Cover/Why/DM/Form artifact found in data/apply-packs/840-*". HTTP 200, but visually identical to a 404 page. **Likely what Mitchell hit on the Cursor row.** | **High** |
| R5 | **Kebab "📄 Report" opens `.md` (not `.html`) — only works if dashboard-server is running** | `dashboard/index.html` L6374 (Cursor row), L36650 (general renderer) | Server proxies `/reports/*.md` → rendered HTML at L2553–2562 of dashboard-server.mjs. If user opens the dashboard via `file://` or the server isn't running, the `.md` URL either downloads or 404s. The legacy SR-only `<a>` link at L6377 correctly uses `.html` — but the visible kebab menu uses `.md`. | **High** |
| R6 | **NO launchd / cron trigger for `hiring-manager-research.mjs`, `hm-gemini-backfill.mjs`, `process-all-pipeline.mjs`** | `scripts/launchd/` (16 plists exist, none for these) | These scripts are only reachable via dashboard sidebar buttons (Run Batch / Process All) or manual CLI. Inventory item 15 ("11-row trigger matrix") expected scheduled triggers — they aren't there. **May be intentional** (user-initiated, not autonomous) but listed as a gap because the inventory says triggers must exist. | **Med** — could be by design |

---

## 2. Inventory Verification (16 items)

| # | Item | File exists? | Matches spec? | Reachable from UI? | Notes / gaps |
|---|---|---|---|---|---|
| 1 | `scripts/hiring-manager-research.mjs` (5-LLM council, --pilot/--all/--role/--skip-deep/--skip-existing/--max-cost) | ✅ Yes (758 lines) | ✅ All flags present (L24–27, L62, L662, L712, L720). Header comment notes 6 LLMs (not 5) — Sonnet web_search + Opus web_search count as 2 of the 6. | ✅ Drawer surfaces CLI snippet for re-run on row open (build-dashboard.mjs `<pre class="hm-cli">`) | Spec says "5-LLM" but script comment + Gemini Deep + OpenAI Pro + Grok-4.3 + Grok-Heavy + Sonnet + Opus + Perplexity = 7 callers, all 6 sources synthesize via Sonnet. Counting depends on whether you call it 5, 6 or 7. **Functionally correct.** |
| 2 | `scripts/hm-gemini-backfill.mjs` (--kickoff/--poll/--status, writes `data/hm-gemini-state.json`) | ✅ Yes | ✅ All 3 flags present (L10–24, L39, L125, L214–216) | ⚠️ CLI only — no UI trigger | `data/hm-gemini-state.json` doesn't exist yet (only created on first `--kickoff`). Code path verified. |
| 3 | `.env` LLM PROVIDER CONFIG block (~75 keys) + `scripts/discover-models.mjs` + `scripts/print-provider-config.mjs` | ✅ Yes | ✅ Header banner found ("LLM PROVIDER CONFIG — single source of truth"); 31 KEY-prefix lines for major providers. Both scripts exist. | ⚠️ CLI only | print-provider-config.mjs L108 references discover-models.mjs (cross-linked). |
| 4 | `dashboard-server.mjs` endpoints (`/api/hm-intel`, `/api/hm-intel/list`, `/api/pipeline/preview`, `/api/pipeline/process-all`, `/api/batch/run`, `/api/pipeline/job-status`) | ✅ Yes | ✅ All 6 endpoints found at L2585, L2602, L2620, L3009, L3034, L3049 | ✅ Sidebar buttons + drawer | Verified server boots and routes. |
| 5 | `scripts/process-all-pipeline.mjs` (4-phase chain, --send-email/--dry-run/--job-id, writes `data/pipeline-process-state.json`) | ✅ Yes | ✅ All 4 phases at L95–149; state file at L36; --send-email at L18, --dry-run at L19, --job-id at L20 | ✅ Sidebar 🚀 Process All button → server spawns it at L940 | `data/pipeline-process-state.json` exists from prior run. |
| 6 | Dashboard sidebar buttons (⚡ Run Batch + 🚀 Process All), `#pipeline-modal`, `#pipeline-toast` (8s polling) | ✅ Yes | ✅ Buttons L5018 + L5023; modal L5329; toast L5346–5348; polling 8000ms at L38061 | ✅ Visible in sidebar | All wired. |
| 7 | HM Intel drawer 9 sections (`_loadHMIntel`/`_renderHMIntel`/`_hmPersonCard`) + CSS classes `.hm-section` `.hm-person` `.hm-chip` `.hm-gap` `.hm-tradeoff` `.hm-intel-loading/missing/error` | ✅ Yes | ✅ All functions exist (L33608, L35228, L35231); all CSS classes present (L3893, L3917, L3951, L3967, L4026, L4052) | ✅ Drawer | Renders when slug-matching JSON exists in `data/hm-intel/`. |
| 8 | Outreach Pulse Redesign (`.op-banner`, `localStorage['careerops:outreach-pulse-open']`, Row v2 cards with `.op-strategy-tag` / `.op-action-text` / `.op-model-chip` / `.op-linked-app` / `.op-meta-col`, dark-mode overrides) | ✅ Yes | ✅ All CSS classes present (L42339, L42571, L42771); banner at 40px collapsed; dark-mode overrides at L42455–42461 | ✅ Visible | **R3 flagged** — `.op-action-text` 3-line clamp truncates without expand affordance. |
| 9 | Data completeness (`_findRichSiblingReport()` in `readReportOnce`, `_hasReal()` rejects "comp not disclosed", `data/overpay-signals/CURRENT.md` has Databricks #2104 + Ramp #2049) | ✅ Yes | ✅ `_findRichSiblingReport` at L287; `_hasReal` at L217; CURRENT.md L142 Databricks + L153 Ramp present (by name, not row#) | ✅ Row drawer surfaces | Companies present, but **row-number tagging missing in CURRENT.md** — entries are headed by company+role, not by `#2104`/`#2049`. May be a minor doc drift. |
| 10 | Script hardening: env-driven endpoints, fixed Gemini polling URL, `extractGrokText`, OpenAI transient-retry, Sonnet max_tokens 16K + max_uses 8 on web_search, score-DESC sort for `--pilot`, `--skip-existing`, non-greedy regex `.*?\((reports/[^)]+)\)` | ✅ Yes | ✅ All confirmed: endpoints at L72–83 (`env('ANTHROPIC_API_URL', …)` etc.); Gemini polling correctly uses `interactions/{id}` (L243–253); `extractGrokText` at L404; OpenAI retry at L327; `max_tokens: 16000` + `max_uses: 8` at L428–429; score DESC at L712; `--skip-existing` at L62/L728; non-greedy regex `.*?\((reports\/[^)]+)\)/` at L166 | ✅ CLI | All hardening intact. |
| 11 | Smoke-test outputs (`data/discovered-models.json`, `data/ui-redesign-research.json` ~80KB, `data/wake-up-summary-2026-05-17.md`) | ✅ Yes | ✅ discovered-models.json (4055 bytes), ui-redesign-research.json (86487 bytes — matches ~80KB), wake-up-summary-2026-05-17.md present | n/a | All present. |
| 12 | `.gitignore`: `data/hm-intel/*.json` with `!_SCHEMA.md`, `!_weights.json` exceptions | ✅ Yes | ✅ Exact 3 lines at .gitignore L22–24 | n/a | Correct. |
| 13 | State files (`data/pipeline-process-state.json`, `data/hm-gemini-state.json`, `/tmp/process-all-{jobId}.log`) | ⚠️ Partial | pipeline-process-state.json ✅ exists from prior run; hm-gemini-state.json ❌ doesn't exist yet (created on first `--kickoff`); /tmp logs n/a | n/a | Expected — code references all 3 correctly; state files materialize on first invocation. |
| 14 | Cost tracking: `getRolling30dSpend()` tolerates 9-col + 4-col formats; per-provider env vars `HM_COST_*` | ✅ Yes | ✅ getRolling30dSpend at L641–664 of dashboard-server.mjs with both column-count branches (L653 + L655); 9 `HM_COST_*` vars at L118–126 of hiring-manager-research.mjs | ✅ Pipeline preview pulls live values | All wired. |
| 15 | Trigger matrix (11 surfaces) | ⚠️ Partial | Dashboard UI triggers (sidebar buttons, drawer CLI snippet, kebab menus) ✅ work. **No launchd plist** for `hiring-manager-research.mjs`, `hm-gemini-backfill.mjs`, `process-all-pipeline.mjs`. Existing 16 plists cover scan, batch, heartbeat, weekly-intel, weekly-light, signal-monitor, company-pulse, audit, etc. but NOT the HM-intel pipeline. | ⚠️ User-initiated only | **R6** flagged. If autonomous trigger was expected → gap. |
| 16 | Aggregate spend snapshot — $77.40 spend log in `data/wake-up-summary-2026-05-17.md` | ✅ Yes | ✅ "Total spend tonight: ~$77 (HM intel $72 · UI research $5 · triage $0.10)" at L3 of summary | n/a | Within 1% of the $77.40 expected — same number, just rounded to ~$77. |

**Inventory pass rate:** 14/16 fully verified · 2/16 partial (item 13 state files materialize on first use, item 15 missing scheduled triggers).

---

## 3. Cursor 404 Finding

**Mitchell's exact claim:** "page not found for cursor role."

**Cursor rows in `data/applications.md`:**
- Row #840 — Cursor (Anysphere) — Forward Deployed Engineer — 4.5/5 — Evaluated — report `091-cursor-2026-04-28.md`
- (Row #1544 LangChain mentions Cursor in tracker notes, not a Cursor row)

**Current URLs and their status (verified 2026-05-18):**

| URL | HTTP | Notes |
|---|---|---|
| `https://jobs.ashbyhq.com/cursor/34cecd0c-c392-4454-8ef5-261310541011` (JD on Apply button + role-cell link) | **200 OK** | ✅ Active. Confirmed via Ashby API: this is `Forward Deployed Engineer` and is the only FDE role in the Cursor Ashby board today. |
| `https://cursor.com/careers` (company-cell link) | **200 OK** (final after redirect) | ✅ Active. |
| `https://anysphere.inc/careers` (legacy domain — NOT used in dashboard) | **404** | Dead. Not referenced in current dashboard HTML — only mentioned in `data/applications.md` text. |
| `/reports/091-cursor-2026-04-28.html` (legacy sr-only link L6377) | ✅ File exists at `dashboard/reports/091-cursor-2026-04-28.html` | Renders if dashboard-server is running. |
| `/reports/091-cursor-2026-04-28.md` (kebab menu "📄 Report" L6374) | ✅ Server proxies → renderMarkdownPage HTML at server L2553–2562 | **Only works through the dashboard server.** If Mitchell opened the dashboard via `file://` or the server is stopped, this 404s in static-fs mode. |
| `/draft/840` (apply-pack draft preview) | HTTP 200 but **no apply-pack folder** exists for #840 (verified: `apply-pack/` has 21 dirs, none start with `840-`; `data/apply-packs/` has 2 dirs, neither is 840) → every tab shows "No {Artifact} artifact found in data/apply-packs/840-*". | **Most likely culprit.** Page renders 200 but visually equivalent to a "not found" wall. |

**Most likely path to the user's "page not found":**

1. Click kebab `⋮` on Cursor row → "📄 Report" → opens `reports/091-cursor-2026-04-28.md` → if dashboard-server isn't running → 404 (R5).
2. Click "Tonight's Pick" or similar route that triggers `/draft/{rowId}` → no apply-pack for #840 → 5-tab "No artifact found" screen (R4).

Both surface today; neither is a true 404 on the live Ashby URL itself.

**Current Cursor JD inventory (Ashby API as of 2026-05-18):** Only 1 FDE role in board. Mitchell's stored URL is the live, current FDE posting. No URL update needed.

---

## 4. "Queue Cells Popout" Diagnosis

**Mitchell's claim:** "queue cells at the top of the home page no longer pop out to reveal more queues."

**Mapped to UI:** The KPI hero bento row at the top of the dashboard (`#overview-section`, L5417–5466). 6 tiles total:

| Tile | Click behavior | Status |
|---|---|---|
| **`stat-hero-balance`** (Ready to apply · 16) L5419 | `scrollIntoView` to apply-now-section | ⚠️ **Scrolls but doesn't open a popout.** Previously may have toggled a panel — needs design intent confirmation. |
| **Total evaluations** L5431 | `toggleStatPanel('evaluations')` → `#stat-panel-evaluations` opens | ✅ **Popout works** |
| **Pipeline pending** L5437 | `toggleStatPanel('pending')` | ✅ Popout works |
| **Q3 2026 · Days left** L5448 | **NONE — only `title=` tooltip** | ❌ **R1 REGRESSION — no popout, no drill-in.** Reads as a clickable stat tile but is completely inert. |
| **Press network** L5454 | `window.drillIn('network-leverage','',event)` | ✅ Drill-in works |
| **Applied / In process** L5460 | `toggleStatPanel('applied')` | ✅ Popout works |

**Root cause of the regression:**
- Commit `f2d5f4b` (Wave G, 19:30 PT on 2026-05-17) replaced 3 system-telemetry tiles (Companies, Scanned, Batches) with 3 career-facing tiles (Q3 2026, Network leverage, 2031 anchor). The 2031 Anchor tile had its own `anchor-2031` drill-in renderer.
- Commit `53f1930` (20:10 PT) removed the 2031 Anchor widget entirely — including the `anchor-2031` drillInRegister handler — and stripped the onclick from the (kept) Q3 2026 tile, leaving only the static `title=` tooltip.

**Net effect:** Mitchell sees 1 of 6 top tiles do nothing on click. Adjacent tiles popout; this one doesn't. He interprets this (correctly) as a regression in the "queue cells popout" behavior.

**Secondary candidate — `mc-sys-chip` strip (L5123–5125):** "70 companies / 2515 scanned / 0 batches" pills also call `toggleStatPanel(...)` and **do** popout correctly. Not regressed.

**Tertiary candidate — sidebar widgets:** `.sidebar-batch`, `.sidebar-runway`, `.sidebar-readiness` all have functioning expand/collapse behavior. Not regressed.

---

## 5. Information Truncation — Beyond Table Cells

P0-1 (cab136d) fixed truncation on `td.role-cell` + `td.company-cell` only. Other places where text is clipped without an explore affordance:

| Place | CSS | Truncates | Has fallback? | Severity |
|---|---|---|---|---|
| **`.drawer-role`** (drawer title) | `-webkit-line-clamp:2` + `text-overflow:ellipsis` at L3724–3725 | Role title (e.g., "Communications Lead, Claude Code, Anthropic Applied AI Forward…" → cut at line 2) | ❌ No `title=`, no expand button | **High** — first thing the user reads in the drawer |
| **`.op-action-text`** (Outreach Pulse Row v2) | `-webkit-line-clamp:3` at L42577 | Action instructions ("Reply to recruiter's email with…") | ❌ No expand affordance on the clamped element | **High** — these are the actions Mitchell needs to take |
| **`.op-row-v3 .op-action-text`** (Outreach Pulse Row v3) | `-webkit-line-clamp:3` at L42776 | Same as above for v3 cards | ❌ | **High** |
| **`.sidebar-brand-name`** | `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` at L336 | "Career Ops" brand name in collapsed sidebar | ⚠️ Less critical — known static text | **Low** |
| **`.mc-batch-text`** | clamp at L951 | Batch status mini-strip | ⚠️ Has `title=` on parent | **Low** |
| **`.toolbar h1`** | clamp at L784 | Page title | ⚠️ Has `title=` on parent | **Low** |

**Hot fixes needed:** R2 (`.drawer-role`) + R3 (`.op-action-text` × 2) — change to wrap-with-toggle or add `title="${full text}"` for hover fallback.

---

## 6. Recommended Fix List (sorted by priority)

| Priority | Fix | Effort | Affected files |
|---|---|---|---|
| **P0** | Add `onclick` + `role="button"` + `tabindex="0"` to Q3 2026 KPI tile — either route to a `time-to-offer` drill-in (recommended) or to `toggleStatPanel('pending')` as cheapest restore. | 5 min | `scripts/build-dashboard.mjs` L9636–9640 |
| **P0** | Change kebab "📄 Report" URL from `reports/*.md` to `reports/*.html` — matches the legacy sr-only link at L6377 and works without the dashboard-server. | 1 line | `dashboard/index.html` L36650 (general renderer) + `scripts/build-dashboard.mjs` (where openKebabMenu is templated) |
| **P0** | `.drawer-role` clamp — either remove `-webkit-line-clamp:2` (let it wrap) or add `title="${role}"` for hover fallback. | 1–2 lines CSS | `dashboard/index.html` L3721–3726 |
| **P0** | `.op-action-text` clamp (both v2 + v3) — same fix as R2. | 2–3 lines CSS | `dashboard/index.html` L42571–42580, L42771–42777 |
| **P1** | `/draft/{rowId}` for rows without apply-packs — show a friendly "Generate this row's apply-pack" CTA instead of 5 empty tabs. The server already has the apply-pack invocation flow (build-apply-packs.mjs); just bump it into a hero CTA on the draft page. | 30 min | `dashboard-server.mjs` L4151–4159 (currently the "No CV artifact found" template) |
| **P1** | Add row-number tags to `data/overpay-signals/CURRENT.md` entries (e.g., heading `## Databricks #2104 — Sr Developer Advocate…`) for inventory consistency. Cosmetic; doesn't affect rendering. | 5 min | `data/overpay-signals/CURRENT.md` L142, L153 |
| **P2** | Decide whether `hiring-manager-research.mjs` / `hm-gemini-backfill.mjs` / `process-all-pipeline.mjs` should have launchd plists. If yes, add 3 new plists modeled on `com.mitchell.career-ops.weekly-intel.plist`. If no, document the "user-initiated only" design intent in `AGENTS.md` to close the inventory gap. | 30 min or 5 min | `scripts/launchd/*.plist` OR `AGENTS.md` |
| **P2** | Audit other `-webkit-line-clamp` instances across the codebase — there may be more truncation sites the P0-1 pass missed. | 30 min | grep `dashboard/index.html` + `scripts/build-dashboard.mjs` |

---

## 7. Recent commits worth cross-checking (since 2026-05-15)

Reviewed `git log --since="2026-05-15"` (200+ commits). Commits that removed functionality:

| SHA | Commit | What was removed | Replacement? | Verdict |
|---|---|---|---|---|
| `53f1930` | feat(dashboard): remove 2031 Anchor widget (Wave G f2d5f4b) | stat-anchor-2031 KPI tile + anchor-2031 IIFE + `_drillInRegister('anchor-2031')` renderer + .stat-anchor-2031 CSS | None — Q3 2026 tile kept but stripped of click handler | ❌ **Regression R1** |
| `e7ca884` | feat(dashboard): relocate TPgM widget from overview to sidebar readiness chip + drill-in | Overview TPgM widget | Moved to sidebar readiness chip — still functional | ✅ Functional move |
| `f2d5f4b` | ux(dashboard): KPI cleanup + unified nav + 2031 anchor widget | COMPANIES/SCANNED/BATCHES tiles from KPI row | Replaced with Q3/Network/2031 tiles + moved system pills to `.mc-sys-chip` strip | ✅ Functional move (popout preserved on chips) |
| `cab136d` | feat(dashboard): P0-1/2/4 — truncation, drawer drill-ins, WCAG-AA button tokens | Old `--green-fg` filled-button usage (replaced with `--action`) | Same color in spirit, AA-compliant — kept popouts | ✅ Good move |
| `5f1ddd3` | chore: auto-update system files to v1.8.0 | (per `e56de7a` comment) "custom scripts + deps stripped" | Reverted in `e56de7a` | ⚠️ Net: restored, but indicates auto-update can quietly remove things |

Most other recent commits are additive (feat, fix, ux, docs) and don't remove functionality. The single clear regression is `53f1930` leaving an inert tile in place of a clickable one.

---

## Appendix — quick verification commands

```bash
# Re-check Cursor URL liveness
curl -sI "https://jobs.ashbyhq.com/cursor/34cecd0c-c392-4454-8ef5-261310541011" | head -1
curl -s "https://api.ashbyhq.com/posting-api/job-board/cursor?includeCompensation=true" | jq '.jobs | map(select(.title | test("Forward")))'

# Find the inert Q3 2026 tile
grep -nB1 -A6 "Q3 2026 . Days left" scripts/build-dashboard.mjs

# All line-clamp truncation sites
grep -n "line-clamp" dashboard/index.html

# Apply-pack folders that exist (gap-check for /draft/{rowId})
ls apply-pack/ | wc -l
ls data/apply-packs/ | wc -l

# Inventory state files
ls -la data/pipeline-process-state.json data/hm-gemini-state.json 2>&1
```
