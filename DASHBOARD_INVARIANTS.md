# Dashboard Invariants — read before modifying `scripts/build-dashboard.mjs`

Authored 2026-05-17 after a UX redesign pass touched shared CSS and prompted a regression check. This document captures the table interactions that **must not break** when future agents (or humans) edit the dashboard, the exact selectors + handlers that bind those interactions, and the audit pattern to run before/after any change.

**These invariants are the table-specific instantiation of the broader `DESIGN_PRINCIPLES.md` (the 5 pillars: scannability, action proximity, strengths+limitations, background transparency, future-action awareness). When in doubt about whether an invariant should be relaxed or strengthened, consult DESIGN_PRINCIPLES.md and score against the 5 pillars.**

If you are about to:
- Edit `scripts/build-dashboard.mjs` (≥50 lines)
- Add new CSS that targets `tr.row`, `td`, `#apply-now-tbody`, `#all-tbody`, or anything wrapping `<table>`
- Add new global event listeners (especially `keydown`, `click`, `focus`)
- Change `dashboard-server.mjs` endpoints the dashboard consumes
- Apply UX research recommendations broadly

→ Read this file first, then run the audit at the bottom **before** and **after**.

---

## The invariants

### 1. Table sorting
- **Binding:** `<th class="sortable" onclick="sortTable('apply-now-tbody', N, 'num'|'str', this, event)">`
- **What must work:** clicking any column header toggles ascending/descending sort on that column's data type. Both Apply-Now and All Evaluations tables.
- **What breaks it:** removing `onclick` from `<th>`, renaming `sortTable`, changing column index N, gitting `event.stopPropagation` wrong on parent elements
- **Verification:** open dashboard, click any column header — rows reorder

### 2. Row click → drawer pop-out
- **Binding:** `<tr class="row" data-num="..." data-row-id="..." ...>` → row-click handler → `openRightRailForDetail(idx, detailRow)` at `scripts/build-dashboard.mjs:8537`
- **What must work:** clicking any data row opens the right-rail drawer with the row's full information (NOT the truncated cell display)
- **Drawer DOM (must all exist):** `#right-rail-drawer`, `#right-rail-backdrop`, `#right-rail-header`, `#right-rail-body`, `#right-rail-actions`, `.drawer-body`, body class `right-rail-open`
- **What breaks it:** removing `data-row-id` on `<tr>`, breaking `openRightRailForDetail` window binding, changing `tr.row` class name, intercepting clicks with `event.stopPropagation` on cells without proper delegation
- **Verification:** click any Apply-Now row — drawer slides in from the right with full row content

### 3. Cell truncation + drawer reveal
- **Binding:** server-side string slicing via `.slice(0, N)` during HTML build; full text preserved in `data-fulltext` or rendered separately in drawer
- **What must work:** long content (notes, role titles, JD snippets) truncates in the table cell but shows in full when the row's drawer opens
- **What breaks it:** moving truncation to client-side without a fallback, removing `data-fulltext` attributes, building the drawer from cell DOM instead of from the source data
- **Verification:** find a row with long notes — cell shows "..."; open drawer; notes shown in full

### 4. Horizontal + vertical scroll on tables
- **Binding:** `<div class="table-scroll"><table>...</table></div>`
- **Default rule:** `.table-scroll { overflow-x: auto; overflow-y: auto; max-height: 520px; }`
- **Mobile override:** `.table-scroll { overflow-x: visible; }` (column overflow is fine on mobile; sticky toolbar overlay handles it)
- **Scroll-hint badge:** `initTableHorizontalScroll` adds a `↔` badge in bottom-right when content exceeds viewport width
- **What breaks it:** removing the wrapping `.table-scroll` div, overriding `overflow-x/y` to `hidden` or `visible` on desktop, removing `max-height`
- **Verification:** at narrow desktop width (≤1100px) the Apply-Now table should scroll horizontally; at any width, when tbody exceeds 520px, vertical scroll should engage

### 5. Drawer action buttons (Apply / Skip / Defer)
- **Bindings:** `scripts/build-dashboard.mjs` lines 8643 (Apply), 8654 (Skip with discard-reason prompt), 8682 (Defer)
- **What must work:** drawer footer buttons trigger status changes via `drawerQuickStatus(num, status)` AND (for Skip) prompt for discard reason via `/api/discard-with-reason` first
- **What breaks it:** removing button data attributes, breaking `drawerQuickStatus` window binding, blocking the `window.prompt` call (some pages disable prompts)
- **Verification:** open drawer → click Skip → reason prompt appears → enter reason → row status changes to Discarded

### 6. Density toggle (added 2026-05-17)
- **DOM:** segmented `C / N / R` control in toolbar; body classes `density-compact`, `density-normal` (default), `density-relaxed`
- **What it changes:** vertical padding + line-height on `#apply-now-tbody tr.row > td` and `#all-tbody tr.row > td` only. Outreach Pulse + drawer padding also scale.
- **What it MUST NOT change:** sort, click, scroll, truncation, drawer — all of those use different selectors and remain untouched
- **Persistence:** localStorage key `careerops.density`
- **Kill switch:** `localStorage.removeItem('careerops.density')` + reload, OR remove `density-compact`/`density-relaxed` classes from `<body>` directly
- **Verification:** press `C`/`N`/`R` toolbar buttons — only row spacing changes, headers and drawer stay put

### 7. Keyboard nav (added 2026-05-17)
- **Bindings:** global `keydown` listener with guards (skips when typing in input/textarea/contentEditable; skips when Cmd/Ctrl/Alt is held; skips when CmdK, kbd-help, quickadd, gap, verify, tier-legend, or right-rail drawer is open)
- **What must work:** `J`/`K` move focus through visible Apply-Now rows (blue left-stripe indicator); `A`/`Enter` open the focused row's apply link in a new tab; `X` toggles the row's bulk checkbox; `?` toggles the keyboard-help overlay; `Esc` closes help first, then clears row focus
- **What it MUST NOT change:** existing Esc-to-close on modals (drawer, Process All modal), existing arrow-key nav (if any), click handlers
- **Verification:** press `?` — help overlay opens; press `J` then `Enter` — first row's apply link opens in new tab

### 8. Universal table baseline — applies to EVERY table, queue, and popout list (added 2026-05-17)

This is the **permanent rule** for every existing table and every future table/queue/popout. No table ships without satisfying ALL 5 sub-rules. When a new table is added (Apply-Now, All Evaluations, Process All Phase A per-company, stale-pipeline list, bucket-modal table, drawer detail tables, etc.) — they must conform.

#### 8a. Scroll-on-overflow (both axes)
- Wrapper: `<div class="table-scroll"><table>...</table></div>` with `.table-scroll { overflow-x: auto; overflow-y: auto; max-height: 520px; }` (or `60vh` for modal tables). Mobile may override to `overflow-x: visible`.
- The wrapper MUST scroll smoothly under mouse wheel + trackpad + touch.
- A `↔` scroll-hint badge appears in the bottom-right when content exceeds wrapper width (via `initTableHorizontalScroll`).

#### 8b. Cell truncation + click-to-expand-row (the Excel pattern)
- Default state: each row is height-bounded; cells with long content show truncated text + native `[title]` tooltip.
- Click on a cell: the ENTIRE ROW expands (height: auto, white-space: normal on all cells, text wraps) revealing all cell content in full. Body class toggle `tr.expanded` is the canonical state marker.
- Click again: row collapses back.
- The row-click-to-open-drawer behavior (invariant #2) still wins — drawer opens on click. The cell-expand is a SEPARATE interaction. Suggested binding: double-click a row expands inline; single-click opens drawer.
- Alternative: an explicit `+` / `–` toggle button at the start of each row; the existing drawer-open behavior stays on single row click.
- Min/max constraints: expanded row capped at 200px height to prevent runaway expansion on huge cells; if content exceeds, a scrollbar appears inside the expanded cell.

#### 8c. Native [title] tooltips on truncated cells
- Every truncated `<td>` gets a `title="{full content}"` attribute. Browser shows tooltip on hover (1-2s delay).
- This is the lowest-friction reveal; the row-expand pattern (8b) is for users who want persistent visibility.

#### 8d. Scroll-follows-cursor (the "moves with me" pattern)
- When the user hovers over a `.table-scroll` wrapper that is currently overflowing, native scroll behavior applies (wheel/trackpad scroll the wrapper, not the page).
- BONUS (optional, document if implemented): edge-hover auto-scroll — when the cursor is within 20px of the wrapper's right or bottom edge AND the wrapper is overflowing, slowly auto-scroll toward that edge at 2-3px per frame.
- The wrapper MUST NOT trap scroll events when there is no overflow on that axis (else parent page can't scroll past the table).

#### 8e. Column resize handles (NEW — implement going forward; retrofit on existing tables when touched)
- Each `<th>` has a 4px-wide drag handle on its right border. Cursor changes to `col-resize` on hover.
- mousedown + drag adjusts the column width in real time; mouseup persists the new width to localStorage (`careerops.colwidth.{tableId}.{colKey}`).
- A reset action (right-click on the drag handle, or a small menu item) clears the saved width.

#### What this means for existing tables
- **Apply-Now table:** scroll-on-overflow ✅ (current); truncation + drawer click ✅; cell-expand 🚧 retrofit needed; column resize 🚧 retrofit needed
- **All Evaluations table:** same as Apply-Now
- **Process All Phase A per-company table:** scroll-on-overflow ✅; cell-expand 🚧 retrofit needed; column resize 🚧 retrofit needed
- **Bucket modal tables (new 2026-05-17, Subagent C):** these MUST ship with 8a + 8b from day one — cross-check at integration
- **Stale-pipeline list (new 2026-05-17, Subagent C):** if rendered as a table, must satisfy all 5 sub-rules; if as a card list, 8b/8e don't apply
- **Drawer detail tables (How to Position, What Fits, etc.):** these are smaller and may not need 8e (column resize), but 8a/8b/8c always apply

#### Implementation utility (one shared lib for all tables)
- Create `lib/table-ux.mjs` (or inline in build-dashboard.mjs) that exports `applyUniversalTableBaseline(tableEl)`:
  - Adds the `.table-scroll` wrapper if missing
  - Adds drag handles to each `<th>`
  - Binds dblclick handler for row-expand
  - Adds `[title]` to truncated cells (computed from `data-fulltext` or inner text + slice)
  - Restores saved column widths from localStorage
- Every table renderer calls this utility after render. New tables get the behavior for free.

#### Verification (run on every dashboard build)
- For each `<table>` inside a `.table-scroll`: confirm wrapper exists, overflow:auto on both axes, drag handles on `<th>`, dblclick expand works, [title] tooltips present.
- Add a section to the audit pattern below: "8e column-resize handles present on every `<th>` in dashboard.html: $(grep -c 'col-resize-handle' dashboard/index.html) should be ≥ <total th count>"

### 9. Column-header sortability + aria-sort state (added 2026-05-17, Tier B item #7)

Audit `data/dashboard-audit-2026-05-17.md` § 3 flagged "0 of 51 column headers are click-to-sort" — the existing `sortTable()` system worked, but headers lacked `aria-sort`, default chevron indicators, and URL state, so the audit (and assistive tech) couldn't detect the affordance. This invariant locks in the a11y + visible signals layer.

**At minimum these 5 columns must be click-to-sort with aria-sort state on BOTH `#apply-now-tbody` and `#all-tbody`:**
- `Score` (numeric, desc default — biggest first)
- `Base` (numeric, desc default — biggest first)
- `Status` (logical pipeline order via `data-col-type="status"` — Evaluated < Responded < Applied < Interview < Offer < Rejected < Discarded per `templates/states.yml`)
- `Eval Date` (date, desc default — newest first; uses `Date.parse`)
- `Age` (numeric, ASC default — youngest first; uses `data-default-dir="asc"` on the th)

**Required header markup:**
```html
<th class="sortable"
    aria-sort="none"
    data-col-key="score"
    data-col-type="numeric"
    onclick="sortTable('apply-now-tbody', 1, 'num', this, event)">
  Score<span class="sort-indicator" aria-hidden="true">↕</span>
</th>
```

**Required behavior:**
- Initial state: `aria-sort="none"`, chevron shows `↕` (CSS `.sort-indicator::before` flips to `↑`/`↓` when aria-sort changes)
- After click: clicked header's aria-sort becomes `ascending` or `descending`; ALL other sortable headers in the same table reset to `aria-sort="none"`
- Direction respects per-column `data-default-dir` on first click (default `desc`, Age overrides to `asc`)
- Type dispatch in `sortTable()`: `'num'` / `'status'` → numeric compare; `'date'` → `Date.parse` epoch ms; default → `localeCompare` with `{ numeric: true, sensitivity: 'base' }`
- Empty / missing cells always sort to the bottom regardless of direction (do NOT treat empty as "0")
- URL state: on sort change to the All Evaluations table, `?sort=<colKey>:<asc|desc>` is written via `history.replaceState` (NOT pushState — sorts don't pollute browser history). On page load, `(_restoreSortFromURL)()` parses the URL and dispatches the matching click. Apply-Now is excluded so drag-priority order isn't overwritten.

**What breaks it:**
- Removing `aria-sort="none"` from any of the 5 required headers
- Removing `data-col-key` or `data-col-type` attributes (URL restore + invariant audit grep both depend on `data-col-key`)
- Reverting `sortTable()` to skip the `setAttribute('aria-sort', ...)` block
- Adding a NEW sortable column without giving it `aria-sort="none"` + `data-col-key` + `data-col-type`
- Migrating to TanStack Table without preserving these attributes on the rendered `<th>`

**Verification (one-line greps that should never decrease):**
```bash
grep -o 'aria-sort=' dashboard/index.html | wc -l      # should be >= 21 (10 per table + multi-sort updates)
grep -o 'data-col-key=' dashboard/index.html | wc -l   # should be >= 20 (10 per table)
grep -o 'data-col-type=' dashboard/index.html | wc -l  # should be >= 20
grep -oE 'data-col-key="(score|base|status|evalDate|age)"' dashboard/index.html | sort | uniq -c
# expected: each of the 5 keys appears exactly 2× (once per table)
```

**Kill switch:** to disable the indicator chevron without reverting markup, add CSS `th.sortable .sort-indicator { display: none; }`. The sortable click handlers stay functional — only the visible affordance hides. To disable URL state, comment out the `history.replaceState` block in `sortTable()` (URL stays static; sorting still works).

**Implementation reference:** see `data/build-day-log-2026-05-17.md` for the commit SHA that landed this invariant.

---

## Audit pattern — run before AND after any substantial dashboard edit

```bash
cd /Users/mitchellwilliams/Documents/career-ops

# 1. Rebuild + open in a sandbox view
node scripts/build-dashboard.mjs
open dashboard/index.html

# 1b. **CRITICAL** — Syntax-check the EMITTED inline JS, not just the source.
#     build-dashboard.mjs uses template literals to compose HTML+JS. Any
#     un-double-escaped \n or \' or \" in the inline JS gets eaten by the
#     template literal pass and produces broken JS in the output. node --check
#     on the source file passes; the OUTPUT is what breaks. This catches the
#     2026-05-17 regression where the discard-reason prompt + pcp-action
#     buttons silently killed ALL window-level function bindings (sortTable,
#     toggleDark, openPipelineModal, openRightRailForDetail all became
#     undefined because parse errors halt JS execution at first error).
curl -s http://localhost:7777/ > /tmp/_dash.html
python3 -c "
import re
scripts = re.findall(r'<script(?![^>]*src=)[^>]*>(.*?)</script>', open('/tmp/_dash.html').read(), re.DOTALL)
open('/tmp/_dash-inline.js', 'w').write('\n//---SPLIT---\n'.join(scripts))
"
node --check /tmp/_dash-inline.js && echo "INLINE JS OK" || echo "INLINE JS BROKEN — fix immediately"

# 2. Grep audit — these numbers should not decrease after your change
echo "Sort bindings:"     ; grep -c "sortable\|sortTable" dashboard/index.html
echo "Drawer DOM:"        ; grep -c "right-rail-drawer\|drawer-body\|openRightRailForDetail" dashboard/index.html
echo "Scroll wraps:"      ; grep -c 'class="table-scroll"' dashboard/index.html
echo "Row click data:"    ; grep -c 'data-row-id="apply-' dashboard/index.html
echo "Cell truncation:"   ; grep -c 'data-fulltext\|truncate' dashboard/index.html
echo "aria-sort attrs:"   ; grep -o 'aria-sort=' dashboard/index.html | wc -l   # invariant 9 — should be >= 21
echo "data-col-key attrs:"; grep -o 'data-col-key=' dashboard/index.html | wc -l # invariant 9 — should be >= 20
echo "sort indicators:"   ; grep -o 'class="sort-indicator"' dashboard/index.html | wc -l # invariant 9 — should be 20

# 3. Server endpoint health check (server must be running on port 7777)
for ep in /api/recruiter-pipeline-density /api/pipeline/per-company-preview /api/discard-reasons/recent /api/pipeline/preview; do
  echo "$ep: $(curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:7777$ep)"
done

# 4. Manual smoke test (1 minute)
#    - Click a column header → rows reorder
#    - Click a row → drawer opens with full info
#    - Resize browser narrow → horizontal scroll bar appears under Apply-Now
#    - Press ? → keyboard help opens
#    - Press C → rows compact; N → baseline; R → spacious
#    - Open Process All modal → Phase A per-company table renders
```

---

## When you DO need to change one of these invariants

That's fine — the rules above aren't sacred, they're just load-bearing. If you're intentionally changing one:

1. **Document why** — add a comment at the new code referencing this file: `// DASHBOARD_INVARIANTS.md §3 — knowingly changing truncation strategy because <reason>`
2. **Update this file** — add the new invariant or amend the old one in the same commit
3. **Provide a kill switch** — env var, localStorage flag, or removable CSS class — so the change can be reverted at runtime without redeploy. Pattern: `PROCESS_ALL_V2_PREVIEW_ENABLED=false` from the 2026-05-16 Process All v2 work
4. **Run the audit** above before and after; verify the counts in step 2 still hold (or, if they're supposed to change, document the expected new numbers)

---

## Anti-breakage patterns to default to

- **Additive CSS** — new selectors, not redefining existing ones. If you must override, scope tightly (`body.density-compact #specific-table-id ...`).
- **No `!important` in app CSS** — reserves it for accessibility (`prefers-reduced-motion`, `prefers-contrast`) and breakpoint resets.
- **Server endpoints with kill switches** — env-gated, with structured error responses so the client can detect "feature off" and fall back.
- **Client fetch with try/catch + fallback** — never leave the user staring at an infinite loading spinner; always have a v1 path the v2 can degrade to.
- **Schema-aware audits** — when a new report format ships, update the audit detection logic in the SAME commit (e.g., `scripts/audit-all-evaluations.mjs:detectSchema` for legacy A-G vs council A+B+H+I+J).
- **Density toggle pattern** — when adding visual options, use body classes + localStorage, not per-component state. Toggles compose cleanly without specificity wars.

---

## Recent regressions caught by this checklist

- **2026-05-17:** UX subagent added density toggle CSS targeting `tr.row > td`. Audit confirmed it does NOT collide with row click, sort, scroll, truncation, or drawer (those use different selectors). No regression shipped.
- **2026-05-17:** UX subagent added global keyboard nav. Audit confirmed input/contentEditable/modal guards work; existing Esc-to-close on drawers/modals preserved.
- **2026-05-17:** Process All v2 modal rewrite. Anti-breakage: env kill switch `PROCESS_ALL_V2_PREVIEW_ENABLED=false` + client v1 fallback if endpoint 410s or errors. User never stares at a broken modal.
- **2026-05-17:** Column-header sortability scaffold landed (invariant 9 added). Existing `sortTable()` worked but the audit + assistive tech couldn't see it — no `aria-sort`, no default chevron, no URL state. Fix was additive: 10 sortable headers per table now carry `aria-sort="none"` + `data-col-key` + `data-col-type` + `<span class="sort-indicator">↕</span>`; `sortTable()` updates aria-sort + writes `?sort=key:dir` via `history.replaceState`; Age column uses `data-default-dir="asc"`; Status column uses a numeric weight map keyed off `data-status` on the pill. Inline JS check passed; all 8 prior invariants preserved (sort=53, drawer=23, scroll-wraps=2, row-click=16, truncation=11).
- **2026-05-18:** Score-cell drill-trigger enhancement broke `scripts/audit-apply-now.mjs`. The audit's regex `<span class="badge score-badge-lg[^"]*">([^<]+)</span>` assumed the opening tag closed immediately after the `class` attribute. A prior change wrapped score badges with `drill-trigger`, `data-drill="score:4.5+"`, `title`, `tabindex`, `role`, and `onclick` attributes — pushing the closing `>` 200+ chars further. Audit reported 16 false-positive MAJORs ("missing or unparseable: empty") while the badges actually rendered fine. Caught immediately when audit count jumped from 0→16 MAJOR after wiring Role-at-a-glance enrichment ([`f1927f9`](https://github.com/mitwilli-create/career-ops/commit/f1927f9)). Guard: regex now anchors on the class then matches `([\d.]+)` for the first digit-pattern — independent of attribute count. Lesson: audit regexes should match by class-anchor + content-shape, never by "class is the last attribute before `>`."
- **2026-05-18:** Legacy `initColResize()` IIFE retired in favor of `applyUniversalTableBaseline()` (invariant #8 since 2026-05-17). Risk: users had column widths saved under the old localStorage key `careerOps.colWidths.v1`. UTB writes to per-column key `careerops.colwidth.${tableId}.${colKey}` — different namespace. Guard: one-time migration shim `migrateLegacyColWidthsToUTB()` reads legacy widths and copies into UTB keys on first page load post-deploy, then deletes the legacy key and sets `careerOps.colWidths.v1.migrated=1` to be idempotent. Width customizations preserved across the cutover.
- **2026-05-18:** `/api/system-health` refactored from synchronous `_execSync` (blocked the event loop ~150ms per call) to async `execFile` via Promise wrapper. Both subprocess calls (`launchctl list`, `pgrep cloudflared`) now run in PARALLEL via `Promise.all` instead of serially. Errors-log lines also parsed into structured `{ ts, severity, source, worker_id, exit_code, message, raw }` objects via new `parseErrorLine()` helper — but the client-side system-health modal still expects raw strings in `errors[]`. **Knowingly accepted risk**: the new structured array is forwards-compatible (modal renders strings via `r.raw` fallback). Update the modal in a follow-up to render the structured table when bandwidth permits.

When the next regression happens (and it will), add it here with the date, what broke, how it was caught, and what guard was added.
