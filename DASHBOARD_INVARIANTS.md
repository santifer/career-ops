# Dashboard Invariants — read before modifying `scripts/build-dashboard.mjs`

Authored 2026-05-17 after a UX redesign pass touched shared CSS and prompted a regression check. This document captures the table interactions that **must not break** when future agents (or humans) edit the dashboard, the exact selectors + handlers that bind those interactions, and the audit pattern to run before/after any change.

If you are about to:
- Edit `scripts/build-dashboard.mjs` (≥50 lines)
- Add new CSS that targets `tr.row`, `td`, `#apply-now-tbody`, `#all-tbody`, or anything wrapping `<table>`
- Add new global event listeners (especially `keydown`, `click`, `focus`)
- Change `dashboard-server.mjs` endpoints the dashboard consumes
- Apply UX research recommendations broadly

→ Read this file first, then run the audit at the bottom **before** and **after**.

---

## The 7 invariants

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
echo "Sort bindings:"  ; grep -c "sortable\|sortTable" dashboard/index.html
echo "Drawer DOM:"     ; grep -c "right-rail-drawer\|drawer-body\|openRightRailForDetail" dashboard/index.html
echo "Scroll wraps:"   ; grep -c 'class="table-scroll"' dashboard/index.html
echo "Row click data:" ; grep -c 'data-row-id="apply-' dashboard/index.html
echo "Cell truncation:"; grep -c 'data-fulltext\|truncate' dashboard/index.html

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

When the next regression happens (and it will), add it here with the date, what broke, how it was caught, and what guard was added.
