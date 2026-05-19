# Dashboard Atlas — career-ops
**Generated:** 2026-05-19  
**Source:** `scripts/build-dashboard.mjs` (26,549 lines) + `dashboard-server.mjs`  
**Live URL:** https://dashboard.careers-ops.com/  
**Served by:** `dashboard-server.mjs` on port 3097 via launchd + Cloudflare Tunnel

---

## Table of Contents

1. [Overview](#overview)
2. [Layout Structure](#layout-structure)
3. [Sidebar Widgets](#sidebar-widgets)
4. [Toolbar](#toolbar)
5. [Mission-Control Strip (mc-strip)](#mission-control-strip)
6. [Main Content Sections](#main-content-sections)
   - [Stats Overview](#stats-overview)
   - [Apply-Now Table](#apply-now-table)
   - [All-Evals Table](#all-evals-table)
   - [Trends Panel](#trends-panel)
   - [Companies Panel](#companies-panel)
   - [Comp Analytics Panel](#comp-analytics-panel)
7. [Modals](#modals)
8. [Drawers](#drawers)
9. [Popovers](#popovers)
10. [Child Pages (Reports)](#child-pages-reports)
11. [API Endpoints](#api-endpoints)
12. [Data Flow & Refresh Cadence](#data-flow--refresh-cadence)
13. [Key JavaScript Patterns](#key-javascript-patterns)

---

## Overview

The dashboard is a single-page application (SPA) built as a static HTML file with embedded CSS and JavaScript. It is generated entirely by `scripts/build-dashboard.mjs` (the "build script") which reads all data files at build time and bakes content into the HTML. Dynamic content is fetched post-load from the `dashboard-server.mjs` API layer.

**Key architectural patterns:**
- **Static pre-bake:** The build script encodes a large JSON payload (`window._waveCB`) into the HTML as a Base64-encoded global. Most drill-in content (peer context, comp analysis, equity sliders, gap data, network cards, HM intel cards, etc.) is resolved at build time and decoded at runtime — avoiding per-click API calls.
- **Right-rail drawer:** On desktop (≥1280px), clicking a row opens a right-side drawer (`#right-rail-drawer`) with 8 cards. On mobile, a bottom sheet (`#mobile-sheet`) is used instead.
- **Pill popover:** Table cells for equity, base salary, location, benefits, and people all use `.pill-popover-trigger` class + `openPillPopover()` for a unified detail popup.
- **SSE for live batch state:** `EventSource('/api/batch-live-stream')` streams file-watch events when batch state files change.
- **Wave C drill-in registry:** Chips and badges carry `data-drill="type:key"` attributes. JavaScript decodes the pre-baked `_waveCB` payload keyed by these strings to populate drill-in content without round-trips.

---

## Layout Structure

**Source:** `build-dashboard.mjs` lines 10270–10870  
**CSS grid:** `#app-shell` — persistent left sidebar + main content area

```
#app-shell (CSS grid, app-shell class)
├── #sidebar (persistent left sidebar)
├── main (main content area)
│   ├── #toolbar
│   ├── #mc-strip (mission control strip)
│   └── content sections (stats, tables, panels)
└── Overlays (modals, drawers, popovers — outside normal flow)
```

---

## Sidebar Widgets

**Element ID:** `#sidebar`  
**Source:** `build-dashboard.mjs` lines 10278–10630  
**Toggle:** `#sidebar-toggle-btn` (hamburger, mobile only); desktop collapses via `toggleSidebarCollapse()`  
**JS Init:** `initSidebar()` at line ~11930

The sidebar is divided into the following sections, top to bottom:

### Brand / Header
- **Element:** `.sidebar-brand`
- **Content:** Logo mark + "career-ops" wordmark + version badge
- **Click:** None (static)

### Navigation Links
- **Element:** `.sidebar-nav`
- **Links:** Apply Now, All Evals, Trends, Companies, Comp Analytics (anchor links to in-page sections)
- **Mobile:** Also appears as `#mobile-tabbar` at bottom of screen

### Update Button
- **Element:** `#sidebar-update-btn` / `.sidebar-update-btn`
- **Label:** "Rebuild Dashboard"
- **Click:** Triggers `fetch('/api/rebuild')` (or opens `#pipeline-modal`); rebuilds `dashboard/index.html` by re-running build script
- **Source:** build script embeds a POST call to the pipeline endpoint

### Batch Widget — `#sidebar-batch`
- **Source:** `build-dashboard.mjs` lines ~10350–10420; JS `initSidebar()` lines ~11930–12100
- **Content:** Batch queue depth, last-run timestamp, success/error counts, cost ticker
- **Data source:** Polls `GET /api/batch-live` every 30s
- **Click:** Opens `#batch-status-modal` via `openBatchStatusModal()` (line ~18098)
- **Refresh:** 30s interval poll; also receives SSE push from `/api/batch-live-stream` on file change

### Pipeline Actions — `#sidebar-pipeline-actions`
- **Source:** `build-dashboard.mjs` lines ~10420–10490
- **Buttons:**
  - **Run Batch** → `POST /api/batch/run` with `{confirm:true}` → shows `#pipeline-toast`
  - **Process All** → opens `#pipeline-modal` which calls `GET /api/pipeline/per-company-preview` (falls back to `GET /api/pipeline/preview` on 410) then `POST /api/pipeline/process-all`
  - **+ Add Role** → opens `#quickadd-modal`
- **Data source:** `GET /api/pipeline/preview` for queue counts/cost estimate

### Runway Widget — `#sidebar-runway`
- **Source:** `build-dashboard.mjs` lines ~10490–10560
- **Content:** Days of runway (color-coded: green >60d, amber 30-60d, red <30d), apply rate, weekly target
- **Data source:** `GET /api/recruiter-pipeline-density` (computes from `data/applications.md` apply dates)
- **Click on cell:** Calls `GET /api/runway-detail` and renders a mini modal with breakdown; line ~3133 in server
- **Refresh:** Rebuilt at dashboard build time; live cells poll on click

### Readiness Widget — `#sidebar-readiness`
- **Source:** `build-dashboard.mjs` lines ~10560–10620
- **Content:** Pre-flight checklist score (N/M gates passing), per-gate status pills
- **Data source:** Pre-baked at build time from `scripts/preflight-pack.mjs` output
- **Click:** Expands gate details inline

### Side-Alloc Widget — `#sidebar-alloc`
- **Source:** `build-dashboard.mjs` lines ~10620–10680
- **Content:** Time allocation pie/bar — hours spent on search activities this week
- **Data source:** Pre-baked from `data/time-allocation.json` (if present); shows placeholder if absent

### Contacts Directory — `#sidebar-contacts`
- **Source:** `build-dashboard.mjs` lines ~3216–4000 (build time) + lines ~10680–10760 (HTML)
- **Content:** Scrollable list of contacts grouped by status (due today, referrals, snoozed); each row shows name, company, last-touch date, next action
- **Data source:** `GET /api/outreach` (polls every 60s); also pre-baked summary embedded at build
- **Click on contact:** Opens contact detail card inline; options: Log Touch (`POST /api/outreach/touch`), Snooze (`POST /api/outreach/snooze`), Wake (`POST /api/outreach/wake`), Cancel Strategy (`POST /api/outreach/cancel-strategy`), Set Status (`POST /api/outreach/status`)
- **Refresh:** 60s interval poll to `/api/outreach`

### Calibration Widget — `#sidebar-calibration`
- **Source:** `build-dashboard.mjs` lines ~10760–10830
- **Content:** Shows next unanswered calibration question (e.g., "Would you take a 10% pay cut for fully remote?")
- **Data source:** `GET /api/calibration/state` on load
- **Click:** Answer yes/no → `POST /api/calibration/answered`; advances to next question

### Footer
- **Element:** `.sidebar-footer`
- **Content:** Keyboard shortcut hint (`?` for help), Discord link, version string
- **Click:** `?` → opens `#kbd-help-modal`

---

## Toolbar

**Element ID:** `#toolbar`  
**Source:** `build-dashboard.mjs` lines ~10830–10870  
**JS:** `initDark()`, `toggleDark()` (line ~11330)

| Element | ID/Class | Content | Click Behavior |
|---------|----------|---------|----------------|
| Hamburger | `#sidebar-toggle-btn` (toolbar instance) | ☰ icon | `toggleSidebar()` — slides sidebar in on mobile |
| Brand | `.toolbar-brand` | "career-ops" | None |
| Cmd-K trigger | `#cmdk-trigger` | "⌘K Search & act…" placeholder | Opens `#cmdk-modal` |
| Add Role | `.toolbar-add-btn` | "+ Add role" | Opens `#quickadd-modal` |
| Overflow | `.toolbar-overflow-btn` | "⋯" | Opens `#kebab-popup` context menu |
| Dark toggle | `#dark-toggle-btn` | ☀/🌙 icon | `toggleDark()` — persists to localStorage |

---

## Mission-Control Strip

**Element ID:** `#mc-strip`  
**Source:** `build-dashboard.mjs` lines ~10870–10930; JS `initMissionControlStrip()` line ~11930  
**Refresh:** Polls `GET /api/batch-live` every 30s

Components within the strip (left to right):

| Element | ID/Class | Content | Data Source | Click |
|---------|----------|---------|-------------|-------|
| Live ticker | `.mc-ticker` | Scrolling text of latest pipeline events | Pre-baked + SSE `/api/batch-live-stream` | None |
| Batch dot | `.mc-batch-dot` | Green/amber/red status dot | `GET /api/batch-live` `.status` field | Opens batch status modal |
| Health pill | `.mc-health-pill` | "Healthy" / "Warning" / "Error" | `GET /api/system-health` | Opens system health detail |
| Funnel chip | `.mc-funnel-chip` | e.g., "12 in funnel" | Pre-baked from `data/applications.md` counts | None |
| KPI chips | `.mc-kpi-chip` | Score avg, apply rate, response rate | Pre-baked from analytics | Click drills to trends panel |
| Meta | `.mc-meta` | "Built MM/DD HH:MM" timestamp | Pre-baked at build time | None |

---

## Main Content Sections

### Stats Overview

**Element:** `.stats-overview` / `#stats-section`  
**Source:** `build-dashboard.mjs` lines ~10865–11080 (HTML), lines ~3043–3213 (data computation)  
**Data source:** Pre-baked from `data/applications.md` at build time

Stat cards rendered (each a `.stat-card`):

| Card Label | ID | Value | Drill behavior |
|------------|-----|-------|----------------|
| In Pipeline | `#stat-pipeline` | Count of non-Discarded/SKIP rows | Click → scrolls to apply-now table |
| Applied | `#stat-applied` | Count with status Applied/Interview/Offer | Click → filters all-evals to Applied+ |
| Avg Score | `#stat-avg-score` | Mean score of Evaluated rows | Click → opens score distribution chart |
| Response Rate | `#stat-response` | (Responded + Interview + Offer) / Applied % | Click → opens trends panel |
| Tonight's Pick | `#tonights-pick` | Top-ranked Apply-Now row by composite score | Click → opens right-rail drawer for that row |
| Top-of-Pipe Ribbon | `#top-of-pipe` | Priority action items (apply deadlines, follow-ups) | Click items → relevant drawer or action |

### Apply-Now Table

**Element:** `#apply-now-table` wrapper; `<table id="apply-now-tbl">`  
**Source:** `build-dashboard.mjs` lines ~11080–13500 (table + row JS)  
**Data source:** Pre-baked rows from `data/applications.md` filtered to Apply-Now queue  
**Columns (13 total):**

| # | Column | Class/ID | Content | Click |
|---|--------|----------|---------|-------|
| 1 | Checkbox | `.row-select` | Multi-select checkbox | Adds to `#bulk-action-bar` selection |
| 2 | # | `.col-num` | Row number badge | Copies row num to clipboard |
| 3 | Company + Role | `.col-company` | Company name (bold) + role title | Opens right-rail drawer or bottom sheet |
| 4 | Score | `.col-score` | Score badge (color-coded by range) | Pill popover with score breakdown; data-drill="score:{slug}" |
| 5 | Comp | `.col-comp` | Equity stage badge + base salary chip | Each is a `.pill-popover-trigger`; equity: data-drill="comp:{slug}", base: openPillPopover() |
| 6 | Location | `.col-location` | Location pill (Remote/Hybrid/Onsite) | `openPillPopover()` with location details |
| 7 | Benefits | `.col-benefits` | Benefits summary badge | `openPillPopover()` with benefits breakdown |
| 8 | People | `.col-people` | Network contacts count badge | `openPillPopover()` with contacts list |
| 9 | Status | `.col-status` | Status badge | Click → `#status-popover` for inline writeback; `POST /api/status` |
| 10 | Liveness | `.col-liveness` | Active/Expired/Uncertain pill | On drawer open: `GET /api/liveness?url=` live probe |
| 11 | Pack | `.col-pack` | Apply-pack existence indicator | Click → opens pack creation/view in drawer |
| 12 | Report | `.col-report` | Report link | Click → navigates to child report page |
| 13 | Actions | `.col-actions` | Kebab "⋮" menu | Opens `#row-context-menu` with: Discard, Open Report, Copy URL, Re-run |

**Row expand / drawer:** Clicking the company/role cell calls `toggleDetail(num)` → `openRightRailForDetail(num)` (desktop) or opens `#mobile-sheet` (mobile). The drawer reads from the pre-baked `_waveCB` payload keyed by row number.

**Throttle logic:** Rows with company-level cooldown (post-rejection or recently applied) show a dimmed overlay. Cooldown state computed at build time from `data/applications.md` reject dates.

**Sibling-report fallback:** For thin re-eval reports missing Block C/D/E, the builder calls `_findRichSiblingReport()` to pull content from a prior richer report for the same company.

### All-Evals Table

**Element:** `#all-evals-table` wrapper; `<table id="all-evals-tbl">`  
**Source:** `build-dashboard.mjs` lines ~13500–14500  
**Data source:** Pre-baked from all `data/applications.md` rows  
**Columns:** Same 13 as Apply-Now table, but includes all statuses  
**Filter bar:** `.filter-bar` above the table — filters by status, score range, date range, company search  
**Bucket API:** `GET /api/all-evaluations/bucket?bucket=evaluated` returns rows for a specific status bucket (used by sidebar nav deep links)

### Trends Panel

**Element:** `#trends-panel`  
**Source:** `build-dashboard.mjs` lines ~14500–15000  
**Data source:** Pre-baked from `data/applications.md` time-series data at build time  
**Charts:**
- Applications over time (weekly bars)
- Score distribution (histogram)
- Status funnel (horizontal bar)
- Response rate trend (line chart)

All charts use lightweight inline SVG generated at build time; no charting library dependency.

### Companies Panel

**Element:** `#companies-panel`  
**Source:** `build-dashboard.mjs` lines ~15000–15500  
**Data source:** Pre-baked from company aggregation across `data/applications.md` + `data/hm-intel/*.json`  
**Content:** Company cards with: logo placeholder, row count, avg score, status distribution pill, HM intel snippet  
**Click on company card:** Opens drill-in with data-drill="company:{slug}" → decodes from `_waveCB.companyData`  
**Queue Research button:** On each card → `POST /api/queue-research` to enqueue background company research

### Comp Analytics Panel

**Element:** `#comp-analytics-panel`  
**Source:** `build-dashboard.mjs` lines ~3043–3213 (computation), lines ~15500–16000 (HTML)  
**Data source:** Pre-baked via `computeCompAnalytics()` from all evaluated rows  
**Content:**
- Market rate table (role × location × percentiles)
- Equity stage distribution chart
- Overpay signal summary (from `data/overpay-current.json`)
- Comp vs. score scatter (SVG)

---

## Modals

### Command Palette — `#cmdk-modal`
- **Backdrop:** `#cmdk-backdrop`
- **Trigger:** `#cmdk-trigger` button in toolbar, or keyboard shortcut `⌘K` / `Ctrl+K`
- **Source:** `build-dashboard.mjs` lines ~10930–11000 (HTML), JS lines ~14800–15500
- **Data source:** Pre-baked `cmdkPayload` (Base64 JSON) — all rows + companies + actions indexed for fuzzy search
- **Content:** Search input + live-filtered results list (roles, companies, shortcuts, drill-ins)
- **Close:** `#cmdk-backdrop` click or `Escape`

### Gap-Addressing Modal — `#gap-modal`
- **Backdrop:** `#gap-backdrop`
- **Trigger:** Clicking a gap chip with data-drill="gap:{slug}:{gap}" anywhere in the dashboard
- **Source:** `build-dashboard.mjs` lines ~11000–11070 (HTML), JS lines ~15500–16000
- **Data source:** `_waveCB.gapData` pre-baked per company+gap combination
- **Content:** Gap description, severity, mitigation strategies, story suggestions, training resources
- **Close:** Backdrop click or `×` button

### Quick-Add Role Modal — `#quickadd-modal`
- **Backdrop:** `#quickadd-backdrop`
- **Trigger:** "+ Add role" button in toolbar or sidebar
- **Source:** `build-dashboard.mjs` lines ~11070–11110
- **Action:** `POST /api/pipeline/add` with `{url, notes}`
- **Content:** URL input, optional notes field, Add button

### Tier Legend Modal — `#tier-legend-modal`
- **Backdrop:** `#tier-legend-backdrop`
- **Trigger:** Clicking any tier badge (Pre-Seed, Seed, Series A, etc.)
- **Source:** `build-dashboard.mjs` lines ~11110–11150
- **Content:** Static legend explaining each equity/funding stage tier and its implications
- **Data source:** Static (no API)

### Equity Legend Modal — `#equity-legend-modal`
- **Backdrop:** `#equity-legend-backdrop`
- **Trigger:** Clicking "What is IPO posture?" link or equity help icon
- **Source:** `build-dashboard.mjs` lines ~11150–11190
- **Content:** Static explanation of the equity/IPO posture scoring system
- **Data source:** Static (no API)

### Batch Status Modal — (dynamic, no fixed backdrop ID)
- **Trigger:** Clicking `#sidebar-batch` widget → `openBatchStatusModal()` (line ~18098)
- **Source:** `build-dashboard.mjs` lines ~18098–18444 (JS)
- **Data source:** `GET /api/batch/status-detailed` (one-shot on open + poll while open)
- **Content:** Batch queue depth, recent run history grouped by date, cost log totals, active worker statuses, recent error log (parsed via `parseErrorLine()`)
- **Close:** `closeBatchStatusModal()` or backdrop click

### Pipeline Action Modal — `#pipeline-modal`
- **Backdrop:** `#pipeline-backdrop`
- **Trigger:** "Process All" button in sidebar
- **Source:** `build-dashboard.mjs` lines ~11190–11250 (HTML), JS lines ~18444–19000
- **Data source:** 
  - `GET /api/pipeline/per-company-preview` (V2 modal — per-company table with score/TTO/toxicity/cost)
  - Falls back to `GET /api/pipeline/preview` if 410 returned (PROCESS_ALL_V2_PREVIEW_ENABLED=false)
- **Content (V2):** Per-company table; each row has: company name, score, TTO estimate, toxicity flag, cost estimate; action buttons: Trash (`POST /api/pipeline/exclude-company`), Defer (`POST /api/pipeline/defer-company`), Fast-track pack (`POST /api/pipeline/build-apply-pack`)
- **Confirm button:** `POST /api/pipeline/process-all` with `{confirm:true, companies:[...], sendEmail:bool}`
- **Progress:** Polls `GET /api/pipeline/job-status?job_id=X` and streams to `#pipeline-toast`

### Verify Claims Modal — `#verify-modal`
- **Backdrop:** `#verify-backdrop`
- **Trigger:** "Verify claims" button in row context menu → `openVerify(slug)` (line ~18444)
- **Source:** `build-dashboard.mjs` lines ~11250–11290 (HTML), JS lines ~18444+
- **Data source:** `GET /api/verify/{reportSlug}.md`
- **Content:** List of claims from the report with checkboxes; free-text evidence field
- **Save:** `POST /api/save-evidence` with `{reportSlug, evidenceText}`

### Keyboard Help Modal — `#kbd-help-modal`
- **Backdrop:** `#kbd-help-backdrop`
- **Trigger:** `?` key or footer "?" link
- **Source:** `build-dashboard.mjs` lines ~11290–11330
- **Content:** Static table of all keyboard shortcuts

---

## Drawers

### Right-Rail Row Drawer — `#right-rail-drawer`
- **Backdrop:** `#right-rail-backdrop`
- **Trigger:** Clicking company/role cell in apply-now or all-evals table on desktop (≥1280px)
- **JS:** `openRightRailForDetail(num)` lines ~12581–12898
- **Source:** `build-dashboard.mjs` lines ~11330–11400 (HTML shell), JS lines ~12581–13270
- **Data source:** Pre-baked `_waveCB` payload decoded client-side; no API call for basic content
- **Width:** 480px, slides in from right
- **Close:** Backdrop click, `×` button, or `Escape`

**8 Cards within the drawer:**

| Card | ID/Class | Content | Data Source |
|------|----------|---------|-------------|
| Quick Role Summary | `.card-summary` | TL;DR, comp snapshot, location, legitimacy tier | `_waveCB` pre-baked |
| Fit Evidence | `.card-fit` | Match signals from Block C of report; `renderFitEvidence()` | `_waveCB.peerScore` |
| How to Position | `.card-position` | Narrative framing; `renderHowToPosition()` | `_waveCB` pre-baked |
| Gaps | `.card-gaps` | Key gaps + mitigation notes; each gap is a chip → opens `#gap-modal` | `_waveCB.gapData` |
| Stories | `.card-stories` | Top STAR stories from story-bank relevant to this role | `_waveCB` pre-baked |
| Network | `.card-network` | Contacts at company via LinkedIn; `renderNetworkCard()` | `_waveCB` pre-baked via `findContactsAtCompany()` |
| Comp Intelligence | `.card-comp` | Peer comp context; equity sliders; wealth lens; `renderEquitySlidersHtml()` | `_waveCB.equitySliders`, `_waveCB.wealthLens` |
| Notes | `.card-notes` | Editable notes; auto-save to `POST /api/notes/add` | `GET /api/notes/{num}` on open; `POST /api/notes/add` on change |

**Additional drawer actions:**
- **Create Materials** button → `POST /api/drawer/build-apply-pack` → polls `GET /api/drawer/apply-pack-status?job_id=X` every 5s
- **SSE draft artifacts:** `EventSource('/api/draft-updates-stream/{rowNum}')` opened when drawer opens; fires `draft-update` events when files in `data/apply-packs/{N}-{slug}/` change
- **Liveness probe:** On drawer open: `GET /api/liveness?url=` — checks overnight sweep cache first (6h), then live Playwright probe
- **Discard with reason:** `POST /api/discard-with-reason` when discard chosen from actions menu
- **Status writeback:** `POST /api/status` from inline status select

### Mobile Bottom Sheet — `#mobile-sheet`
- **Backdrop:** `#mobile-sheet-backdrop`
- **Trigger:** Row click on mobile (<1280px)
- **Source:** `build-dashboard.mjs` lines ~11400–11440
- **Content:** Same 8 cards as right-rail drawer but stacked vertically, full-width
- **Close:** Pull-down gesture or close button

### Update Drawer — `#update-drawer`
- **Backdrop:** `#update-drawer-backdrop`
- **Trigger:** "Log career update" button (in toolbar overflow or sidebar)
- **Source:** `build-dashboard.mjs` lines ~11440–11490; JS lines ~13086–13270
- **Data source:** `GET /api/career-update/recent?limit=5` on open; `POST /api/career-update` on submit
- **Content:** Free-text career update form (new achievements, interview outcomes, comp changes); recent updates list

---

## Popovers

### Status Popover — `#status-popover`
- **Trigger:** Clicking status badge in any table row
- **Source:** `build-dashboard.mjs` lines ~11490–11530
- **Content:** Dropdown of canonical status values from `templates/states.yml`
- **Action:** `POST /api/status` with `{num, status}`; row re-renders with new status
- **Close:** Click outside or select a value

### Email Popover — `#email-popover`
- **Trigger:** Email launch button in row context menu or drawer actions
- **Source:** `build-dashboard.mjs` lines ~11530–11570; JS lines ~4388–4456 (payload bake)
- **Data source:** Pre-baked `emailLauncherPayload` (Base64 JSON) — templates from `data/email-templates/` or fallbacks in `EMAIL_TEMPLATE_FALLBACKS`
- **Content:** Selectable email templates (Follow-up, Thank you, Networking, etc.) with company/role pre-filled; copy-to-clipboard
- **Action:** Copies composed email to clipboard; logs touch via `POST /api/outreach/touch`

### Pill Popover — `#pill-popover`
- **Trigger:** `.pill-popover-trigger` cells — equity badge, base salary chip, location pill, benefits badge, people badge
- **Source:** `build-dashboard.mjs` lines ~11570–11610; JS `openPillPopover()` function
- **Data source:** Cell `data-*` attributes set at render time (all pre-baked)
- **Content:** Expanded detail for the clicked cell:
  - **Equity:** Stage explanation, pre-money valuation est., vesting schedule, preferred return risk
  - **Base:** Listed range, overpay signal, market rate comparison
  - **Location:** Remote tier, office locations, travel policy, time-zone spread
  - **Benefits:** Health coverage level, 401k match, parental leave, notable perks
  - **People:** Contact names at company, LinkedIn network degree, last-touch dates
- **Close:** Click outside

### Kebab Context Menu — `#kebab-popup`
- **Trigger:** `⋯` overflow button in toolbar, or `⋮` action button per row
- **Source:** `build-dashboard.mjs` lines ~11610–11640; `#row-context-menu` for row-level
- **Content (row level):** Open Report, Copy URL, Re-run Eval, Discard with Reason, Mark as Applied, Open in ATS

---

## Child Pages (Reports)

**Location:** `dashboard/reports/{slug}.html` (static files on disk)  
**Generation:** `renderReportToHtml()` in `build-dashboard.mjs` lines ~1100–1425  
**Route:** `GET /reports/{name}.md` (the `.md` suffix is the route key — server resolves to the `.html` file)  
**Server match:** `url.match(/^\/reports\/(.+\.md)$/)` at line ~2733  

Each child page contains:

| Element | Source | Content |
|---------|--------|---------|
| Breadcrumb nav | `renderChildPageHTML()` in `lib/child-page-template.mjs` | "← Dashboard / Company / Role" |
| Report header | `renderReportToHtml()` | Score, Archetype, URL, Legitimacy, Date, PDF link |
| Block A: Offer Snapshot | Report markdown rendered to HTML | Structured table: comp, location, remote tier, benefits |
| Block B: TLDR / Recommendation | Report markdown | Recommendation paragraph |
| Block C: Fit Evidence | Report markdown | Match signals, skills alignment |
| Block D: Comp Analysis | Report markdown | Comp table, market context, overpay signal |
| Block E: Gaps | Report markdown | Gaps table with severity and mitigation |
| Block F: Stories | Report markdown | Top 3 STAR stories |
| Block G: Legitimacy | Report markdown | Legitimacy tier + signals |
| KPI sparklines | `build-dashboard.mjs` lines ~1425–2290 | Inline SVG charts for score/comp/response trends |
| Evidence section | `renderReportToHtml()` | Scraped verification evidence (if any) |
| Sibling-report fallback banner | `_findRichSiblingReport()` | Yellow banner if content pulled from prior report |

**Story pages** (stories/ subdirectory):  
`dashboard/stories/*.html` — article digest pages, one per major workflow story. These are static HTML files served from `dashboard/stories/`.

---

## API Endpoints

All endpoints served by `dashboard-server.mjs`. Base: `https://dashboard.careers-ops.com`

### Static / File Serving

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serves `dashboard/index.html` |
| GET | `/reports/{name}.md` | Serves `dashboard/reports/{slug}.html` child page |
| GET | `/dashboard/stories/*.html` | Serves story article pages |
| GET | `/draft/{rowNum}` | Renders live draft view of apply-pack for a row |

### Auth

| Method | Path | Description | Source line |
|--------|------|-------------|-------------|
| GET | `/api/share/create` | Creates a time-limited share token for read-only dashboard view | 2744 |
| GET | `/api/share/verify` | Verifies a share token | 2751 |

### Stats & Health

| Method | Path | Description | Source line |
|--------|------|-------------|-------------|
| GET | `/api/stats` | Returns aggregate pipeline stats (counts, rates, avg score) | 2758 |
| GET | `/api/system-health` | Returns server health: disk, memory, process uptime, last-build age | 4027 |
| GET | `/api/batch-live` | Returns current batch state snapshot | 3555 |
| GET | `/api/batch-live-stream` | SSE stream — fires `batch-live` events on file change | 3565 |
| GET | `/api/batch/status-detailed` | Full batch status: queue, recent runs, cost totals, errors | 3672 |

### HM Intel

| Method | Path | Description | Source line |
|--------|------|-------------|-------------|
| GET | `/api/hm-intel?slug=` | Returns HM intel JSON for a company slug | 2764 |
| GET | `/api/hm-intel/list` | Lists all available HM intel slugs | 2781 |

### Pipeline & Batch Processing

| Method | Path | Body | Description | Source line |
|--------|------|------|-------------|-------------|
| GET | `/api/pipeline/preview` | — | Cost estimate + queue counts for Process All | 2799 |
| GET | `/api/pipeline/per-company-preview` | — | Per-company preview table (V2 modal) | 2802 |
| POST | `/api/pipeline/exclude-company` | `{company, rationale}` | Permanently excludes company; writes `data/excluded-companies.json` | 2817 |
| POST | `/api/pipeline/build-apply-pack` | `{row}` | Fast-tracks single row to apply-pack (spawns `build-apply-pack.mjs`) | 2869 |
| POST | `/api/pipeline/defer-company` | `{company, reason}` | Defers company to next review cycle; writes `data/deferred-companies.jsonl` | 3096 |
| POST | `/api/pipeline/process-all` | `{confirm:true, sendEmail, force, companies}` | Spawns full orchestrator chain (triage+batch+rebuild+email) | 3360 |
| POST | `/api/batch/run` | `{confirm:true, sendEmail, force}` | Spawns batch-only run | 3385 |
| GET | `/api/pipeline/job-status?job_id=` | — | Polls running job; returns status + last 20 log lines | 3400 |
| POST | `/api/pipeline/add` | `{url, notes}` | Adds URL to `data/pipeline.md` | 3768 |
| GET | `/api/pipeline/stale-items` | — | Returns pipeline items older than threshold | 3826 |
| POST | `/api/pipeline/remove-url` | `{url}` | Removes URL from `data/pipeline.md` | 3875 |
| POST | `/api/pipeline/defer-url` | `{url, days}` | Defers pipeline URL by N days | 3923 |

### Drawer — Apply Pack

| Method | Path | Body | Description | Source line |
|--------|------|------|-------------|-------------|
| POST | `/api/drawer/build-apply-pack` | `{rowNum, force?}` | Spawns `build-apply-packs.mjs --num=N`; 409 if pack exists, 402 if over cap | 2926 |
| GET | `/api/drawer/apply-pack-status?job_id=` | — | Alias for job-status; also returns `readme_rel` when README written | 3073 |
| POST | `/api/finalize-apply-pack` | `{rowNum, notes?}` | Marks apply-pack as ready; triggers final quality checks | 4201 |
| POST | `/api/build-pack-stage` | `{rowNum, stage}` | Runs a specific build stage (cover-letter, form-fields, ats-check, etc.) | 4264 / 5021 |

### Liveness & Research

| Method | Path | Description | Source line |
|--------|------|-------------|-------------|
| GET | `/api/liveness?url=` | Probes job URL liveness: checks overnight cache → 6h request cache → live Playwright probe | 3286 |
| GET | `/api/recruiter-pipeline-density` | Returns runway metrics (apply rate, days of runway, weekly target) | 3128 |
| GET | `/api/runway-detail` | Detailed runway breakdown for sidebar runway modal | 3133 |
| POST | `/api/queue-research` | `{slug, section}` Queues company-research-worker job for a section | 3248 |

### Discard & Toxicity

| Method | Path | Body | Description | Source line |
|--------|------|------|-------------|-------------|
| POST | `/api/discard-with-reason` | `{row_num, reason, company, role}` | Appends discard reason to `data/discard-reasons.jsonl` | 3138 |
| GET | `/api/discard-reasons/recent` | — | Returns last 30 discard reasons | 3176 |
| POST | `/api/toxicity-override` | `{slug, override_reason}` | Records tradeoff override for flagged company | 3196 |
| GET | `/api/toxicity-override/list?slug=` | — | Returns existing overrides for a slug | 3227 |

### Outreach / Contacts

| Method | Path | Body | Description | Source line |
|--------|------|------|-------------|-------------|
| GET | `/api/outreach` | — | Returns outreach summary: due_today, breakup, referrals, snoozed | 3421 |
| GET | `/api/outreach/all` | — | Returns all contacts (enriched with linked application data) | 3425 |
| GET | `/api/outreach/contact/{id}` | — | Returns single contact detail | 3430 |
| POST | `/api/outreach/touch` | `{contact_id, channel, template_id, summary, outbound, ts}` | Logs a touch event; upserts contact | 3438 |
| POST | `/api/outreach/status` | `{contact_id, status}` | Updates contact status | 3471 |
| POST | `/api/outreach/snooze` | `{contact_id, until_iso, note?}` | Snoozes contact until date | 3492 |
| POST | `/api/outreach/cancel-strategy` | `{contact_id, reason?}` | Cancels current next_action strategy | 3514 |
| POST | `/api/outreach/wake` | `{contact_id}` | Clears snooze; contact reappears in due_today | 3535 |

### Status & Notes Writeback

| Method | Path | Body | Description | Source line |
|--------|------|------|-------------|-------------|
| POST | `/api/status` | `{num, status}` | Updates application status in `data/applications.md` | 3705 |
| GET | `/api/status` | `?num=` | Returns current status for a row | 3735 |
| POST | `/api/status/bulk` | `{rows:[{num,status}]}` | Bulk status update | 3739 |
| POST | `/api/notes/add` | `{num, note}` | Appends note to row in `data/applications.md` | 3790 |
| GET | `/api/notes/{num}` | — | Returns notes history for a row | 3813 (regex match) |

### Scan & Activity

| Method | Path | Description | Source line |
|--------|------|-------------|-------------|
| GET | `/api/scan-activity` | Returns scan history: last run, companies scanned, new postings found | 3976 |

### Evaluations

| Method | Path | Description | Source line |
|--------|------|-------------|-------------|
| GET | `/api/all-evaluations/bucket?bucket=` | Returns rows for a specific status bucket | 4111 |

### Drill-ins

| Method | Path | Description | Source line |
|--------|------|-------------|-------------|
| GET | `/api/drill/metric/{slug}/{metric}` | Returns drill-in content for a KPI metric chip | 4308 (regex) |
| GET | `/api/drill/percentage/{slug}/{metric}` | Returns drill-in content for a percentage chip | 4328 (regex) |
| GET | `/api/detail/{slug}` | Returns full company detail for the companies panel drill-in | 4652 (regex) |
| GET | `/api/report/{name}.md` | Returns report content as JSON | 4669 (regex) |

### Career Updates & Calibration

| Method | Path | Body | Description | Source line |
|--------|------|------|-------------|-------------|
| POST | `/api/career-update` | `{text, type}` | Logs a career update event to `data/career-updates.jsonl` | 4475 |
| GET | `/api/career-update/recent?limit=5` | — | Returns most recent career update entries | 4528 |
| GET | `/api/calibration/state` | — | Returns next unanswered calibration question | 4553 |
| POST | `/api/calibration/answered` | `{question_id, answer}` | Records calibration answer; advances to next question | 4618 |

### Inline Editing

| Method | Path | Body | Description | Source line |
|--------|------|------|-------------|-------------|
| POST | `/api/inline-update` | `{num, field, value}` | Updates a specific field inline in `data/applications.md` | 4353 |
| POST | `/api/weekly-update` | `{updates:[{num,field,value}]}` | Batch field updates for weekly review flow | 4395 |

### Verify & Evidence

| Method | Path | Body | Description | Source line |
|--------|------|------|-------------|-------------|
| GET | `/api/verify/{slug}.md` | — | Returns claims list from a report for verification modal | 3681 (regex) |
| POST | `/api/save-evidence` | `{reportSlug, evidenceText}` | Saves evidence text to report's sidecar file | 3688 |

### SSE Streams

| Method | Path | Events | Description | Source line |
|--------|------|--------|-------------|-------------|
| GET | `/api/batch-live-stream` | `batch-live` | Fires when `batch/batch-state.tsv`, `batch-input.tsv`, or `triage-advance.tsv` change (debounced 200ms); keepalive every 30s | 3565 |
| GET | `/api/draft-updates-stream/{rowNum}` | `draft-update` | Fires when any file in `data/apply-packs/{N}-{slug}/` changes (debounced 300ms); keepalive every 25s | 3596 |

---

## Data Flow & Refresh Cadence

| Widget / Section | Data Source | Refresh |
|-----------------|-------------|---------|
| Apply-Now table content | Pre-baked in HTML at build time | On dashboard rebuild |
| All-Evals table content | Pre-baked in HTML at build time | On dashboard rebuild |
| Stats cards | Pre-baked in HTML at build time | On dashboard rebuild |
| Sidebar batch widget | `GET /api/batch-live` | Every 30s; also SSE push |
| mc-strip batch dot | `GET /api/batch-live` | Every 30s |
| Sidebar contacts | `GET /api/outreach` | Every 60s |
| Sidebar calibration | `GET /api/calibration/state` | On page load; after each answer |
| Runway widget | Pre-baked + `GET /api/recruiter-pipeline-density` | On click (runway cells) |
| Drawer notes | `GET /api/notes/{num}` | On drawer open |
| Drawer liveness | `GET /api/liveness?url=` | On drawer open (6h cache) |
| Drawer draft artifacts | SSE `/api/draft-updates-stream/{N}` | Real-time while drawer open |
| Batch status modal | `GET /api/batch/status-detailed` | On open; every 5s while open |
| Pipeline job status | `GET /api/pipeline/job-status?job_id=` | Every 3s while job running |
| Apply-pack status | `GET /api/drawer/apply-pack-status?job_id=` | Every 5s while building |
| Wave C drill-ins | `window._waveCB` (in-memory) | No refresh — pre-baked at build |
| Cmd-K results | `cmdkPayload` (in-memory) | No refresh — pre-baked at build |

**Dashboard rebuild trigger:** Clicking "Rebuild Dashboard" in sidebar → calls the pipeline endpoint → server spawns `node scripts/build-dashboard.mjs` → on completion, reloads `dashboard/index.html` from disk. The launchd plist `scripts/launchd/com.careerops.dashboard.plist` keeps `dashboard-server.mjs` running persistently.

---

## Key JavaScript Patterns

### `window._waveCB` — Pre-baked Drill-in Registry
**Source:** `build-dashboard.mjs` lines ~4000–4456  
A Base64-encoded JSON global injected at build time containing:
- `companyData` — per-company summaries
- `peerScore` — peer context from `getPeerContext()`
- `peerComp` — comp peer comparison
- `wealthLens` — wealth lens analysis from `applyWealthLens()`
- `industryGapHtml` — industry gap rankings from `getIndustryGapRanking()`
- `provenanceSummaries` — story provenance per role
- `trackerNotes` — notes per row number
- `applyNowJDs` — JD text for Apply-Now rows
- `toxicity` — toxicity composite scores from `computeToxicityComposite()`
- `companyReviews` — scraped Glassdoor/Blind review snippets
- `companyFunding` — funding stage + last round data
- `pipelineRows` — pipeline.md items
- `wealthRanking` — company wealth ranking from `rankCompaniesByWealth()`
- `tpgmWidgetHtml` — TPGM widget HTML pre-rendered
- `nextMoves` — next-move recommendations from `computeNextMoves()`
- `equitySliders` — equity slider HTML from `renderEquitySlidersHtml()`
- `gapData` — gap addressing content from `checkGap()`

**Access pattern:**
```javascript
const cb = JSON.parse(atob(window._waveCB));
const compData = cb.companyData[slug];
```

### Drill-in `data-drill` Attribute Convention
Chips and badges across the dashboard carry `data-drill="type:key"` attributes. The client-side JS dispatcher reads this attribute and routes to the appropriate renderer using pre-baked content from `_waveCB`:

| Prefix | Content | Pre-baked source |
|--------|---------|-----------------|
| `score:{slug}` | Score breakdown detail | `_waveCB.peerScore` |
| `comp:{slug}` | Equity/comp analysis | `_waveCB.equitySliders` |
| `metric:{slug}:{name}` | KPI metric detail | `GET /api/drill/metric/` |
| `percentage:{slug}:{name}` | Percentage chip detail | `GET /api/drill/percentage/` |
| `story:{slug}:{id}` | Full STAR story | `_waveCB.provenanceSummaries` |
| `gap:{slug}:{gap}` | Gap addressing detail | `_waveCB.gapData` |
| `status:{slug}` | Status change history | Pre-baked |
| `company:{slug}` | Company overview | `_waveCB.companyData` |
| `readiness:{slug}` | Readiness assessment | Pre-baked |
| `industry-gap:{slug}` | Industry gap context | `_waveCB.industryGapHtml` |

### Panel Collapse — `initPanelCollapse()`
**Source:** `build-dashboard.mjs` lines ~11330  
All collapsible panels use `data-panel-id` attributes. State persisted to `localStorage` keyed by panel ID.

### Dark Mode — `initDark()` / `toggleDark()`
**Source:** `build-dashboard.mjs` lines ~11330  
Adds/removes `dark` class on `<html>`. State persisted to `localStorage['dark-mode']`.

### Table Horizontal Scroll — `initTableHorizontalScroll()`
**Source:** `build-dashboard.mjs` lines ~11330  
Adds touch-drag scroll to both data tables on mobile.

### Bulk Selection — `#bulk-action-bar`
**Source:** `build-dashboard.mjs` lines ~11320–11330 (HTML)  
Floating action bar appears when 1+ rows selected. Actions: Bulk status update (`POST /api/status/bulk`), bulk discard, export CSV.

### Pull-to-Refresh — `#pull-to-refresh`
**Source:** `build-dashboard.mjs` lines ~11320 (HTML); touch JS  
Mobile-only: drag down on main content triggers dashboard rebuild via pipeline endpoint.

---

## File Paths Reference

| Role | Path |
|------|------|
| Build script | `scripts/build-dashboard.mjs` |
| Dashboard server | `dashboard-server.mjs` |
| Generated HTML | `dashboard/index.html` |
| Report child pages | `dashboard/reports/{slug}.html` |
| Story pages | `dashboard/stories/*.html` |
| Application tracker | `data/applications.md` |
| Pipeline inbox | `data/pipeline.md` |
| Overpay signals | `data/overpay-current.json` |
| Liveness state | `data/liveness-state.json` (overnight sweep output) |
| Liveness cache | `data/liveness-cache.json` (6h request cache) |
| Discard reasons | `data/discard-reasons.jsonl` |
| Toxicity overrides | `data/toxicity-overrides.jsonl` |
| Deferred companies | `data/deferred-companies.jsonl` |
| Excluded companies | `data/excluded-companies.json` |
| Pipeline process state | `data/pipeline-process-state.json` |
| Apply packs | `apply-pack/{NNN}-{slug}/` (gitignored) |
| HM intel | `data/hm-intel/{slug}.json` |
| Email templates | `data/email-templates/*.md` |
| Company research queue | `data/company-research-queue/{slug}.json` |
| Career updates | `data/career-updates.jsonl` |
| Outreach tracker | `data/outreach-tracker.json` (via `lib/outreach-tracker.mjs`) |
| Role enrichment | `data/role-enrichment/{slug}.json` |
| Scan history | `data/scan-history.tsv` |
| Batch state | `batch/batch-state.tsv` |
| Batch input | `batch/batch-input.tsv` |
| Triage advance | `batch/triage-advance.tsv` |
| Daily quota | `batch/daily-quota.json` |
| Profile config | `config/profile.yml` |
| CV source | `cv.md` |
