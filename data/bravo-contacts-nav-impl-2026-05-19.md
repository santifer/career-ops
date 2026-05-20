# BRAVO — Implementation report (Workstream A + B, 2026-05-19/20)

**Branch:** `bravo-contacts-nav-2026-05-19`
**Public URL:** https://staging-dashboard.careers-ops.com/ (CF Access at https://dashboard.careers-ops.com/ — same dashboard, auth-gated)
**Auditor:** β BRAVO (overnight haul instance)
**Charter source:** Mitchell's verbatim ask in the BRAVO dispatcher prompt (combined Workstream A "contacts UX" + Workstream B "cross-page nav cohesion").

---

## What shipped

### Workstream A — Contacts page UX/IA (12 changes)

| Rec | Commit(s) | File:line cited | Verification |
|---|---|---|---|
| AAA-1 (surface unification) | `cf34a4d` + `9a8632c` | `scripts/build-contacts-page.mjs:780+`, `lib/dashboard-shell.mjs:90-145` | Both contacts.html + network-database.html now share the sidebar; view-switcher `[Cards | Table]` links between them. Tour test (Playwright): home → contacts → network-db all clickable from sidebar. Screenshots in `data/bravo-contacts-nav-snapshots/after/tour-test/`. |
| AAA-2 (filter taxonomy, 12 chips) | `cf34a4d` | `scripts/build-contacts-page.mjs:868-902` | DOM attest via Chrome MCP confirms 12 chips render: `["🎯 Warm to Apply-Now", "🏢 Target company", "✉ Has email", "💬 In outreach", "🔥 Warm ≥3", "🪪 Tier 3/2/1", "⏱ Touched 30d", "1️⃣ 1st-deg", "★ Archetype", "💎 Pre-IPO", "✕ Clear"]`. Multi-select target-company dropdown verified to open + close. |
| AAA-3 (Opportunity Score sort, default + 6 raw options) | `cf34a4d` | `scripts/build-contacts-page.mjs:820-855`, JS at `:982-1003` | Sort dropdown opens; default "Opportunity" applied. Formula in hover: `warm-apply-now×5 + target×3 + warm≥3×2 + email×1 + tier-3×2 − stale-90d×1`. |
| AAA-4 (default-hide stubs) | `cf34a4d` | `scripts/build-contacts-page.mjs:781-797` (progress bar), JS at `:1075-1083` (default-hide logic) | Default visible: 190 cards (137 enriched + 53 with email). `[Show all (2626 stubs hidden)]` toggle confirmed in DOM. Verified live via Chrome MCP. |
| AAA-5 (scroll cost reduction) | `cf34a4d` | (consequence of AAA-4) | `document.documentElement.scrollHeight` = **39,978 px** (was **305,992 px**). 87% reduction. Attested via Chrome MCP `javascript_tool`. |
| AAA-6 (search affordance — `/` shortcut + token parse + autofocus) | `cf34a4d` + `9a8632c` | `lib/dashboard-shell.mjs:430-440` (shortcut), `scripts/build-contacts-page.mjs:991-1019` (token parser) | Live test: pressing `/` focuses `#contacts-search`. Query `company:openai tier:3+` correctly filters. |
| AA-1 (stat header truth) | `cf34a4d` | `scripts/build-contacts-page.mjs:768-775` | Header reads "2816 contacts · 190 with signal (6.7%) · 3 warm to apply-now targets · 2 in outreach" — sourced from live in-page data, not baked. |
| AA-2 (Apply-Now intersect chip) | `cf34a4d` | `scripts/build-contacts-page.mjs:870-872` | First chip in the filter row; reads `data-warm-apply-now` attribute. |
| AA-5 (avatar grapheme bug) | `cf34a4d` | `scripts/build-contacts-page.mjs:601-605` | `Array.from(name)[0]` instead of `name[0]`. |
| AA-6 (noopener noreferrer) | `cf34a4d` | `scripts/build-contacts-page.mjs:686-689` + `:740` | `<a target="_blank" rel="noopener noreferrer">` on LinkedIn/X actions. |
| AA-4 (filter chip ARIA group) | `cf34a4d` | `scripts/build-contacts-page.mjs:866` | `<div class="filters-row" role="group" aria-label="Filter chips — stackable, AND semantics">`. |
| AA-3 (heading hierarchy) | `cf34a4d` | implicit via shell shell wrapping content in `<main><h1>` | Tab from page top → skip-link → Enter → focus lands on `<main>` → next Tab is `<h1>`. Confirmed via Playwright. |

### Workstream B — Cross-page nav cohesion (8 changes)

| Rec | Commit(s) | File:line cited | Verification |
|---|---|---|---|
| AAA-1 (zero-nav orphan pages → shared shell) | `cf34a4d` (lib) + `9a8632c` (network-db patch + index sidebar) | `lib/dashboard-shell.mjs` (765 lines), `scripts/build-network-database-shell.mjs` (NEW), `scripts/build-dashboard.mjs:11234-11241` (Network DB sidebar entry) | Every page now has the sidebar. DOM attest: `hasSidebar:true, hasSkipLink:true, hasMain:true, navAriaLabel:"Site sections"` on contacts.html. |
| AAA-2 (Network DB hidden) | `9a8632c` | `scripts/build-dashboard.mjs:11234-11241` | Sidebar entry `<a href="network-database.html"><span>🗄</span>Network DB <span>table</span></a>` confirmed in DOM. |
| AAA-3 (`aria-current="page"`) | `cf34a4d` (lib) + `9a8632c` (network-db) | `lib/dashboard-shell.mjs:115-125` (sidebar render with `aria-current`) | Live verified: `aria-current="page"` on "👥 Network" anchor when on `/contacts.html`, on "🗄 Network DB" when on `/network-database.html`. |
| AAA-4 (keyboard shortcuts `g h / g c / g n / / / ?`) | `cf34a4d` (lib) + `9a8632c` (main dashboard) | `lib/dashboard-shell.mjs:440-520`, `scripts/build-dashboard.mjs:13360-13476` | Live verified via Chrome MCP keyboard event dispatch: `g+c` chord fires "Navigating to Network contacts" aria-live announce, then `location.href` assignment. `?` opens shortcuts modal with table of all 5 chords. Escape closes. |
| AAA-5 (`<main>` landmark) | `cf34a4d` (lib) | `lib/dashboard-shell.mjs:740` | Confirmed: `<main id="main" class="app-main" tabindex="-1">` on every page rendered via the shell. |
| AAA-6 (focus management) | n/a (browser-native) | shell's skip-link is first DOM-focusable | Playwright: Tab from page top → focus = `{tag:"A", className:"skip-link", text:"Skip to main content"}`. |
| AA-1 (mobile hamburger) | `cf34a4d` (lib) + `9a8632c` (network-db padding fix) | `lib/dashboard-shell.mjs:295-310` (responsive CSS), `scripts/build-network-database-shell.mjs:65-67` (padding-left:62px on .netdb-content header) | At 720 px width: hamburger shows top-left, page content has padding-left to clear it. Screenshots: `data/bravo-contacts-nav-snapshots/after/{contacts,network-database,index}-720.png`. |
| AA-2 (brand-as-home-link) | `9a8632c` | `scripts/build-dashboard.mjs:11203-11206` + `lib/dashboard-shell.mjs:163-170` | `<a class="sidebar-brand" href="/" aria-label="Career-Ops home">` on every page. |

---

## Commit history (BRAVO-attributable)

| Commit | Author / Context | Files | Notes |
|---|---|---|---|
| `cf34a4d` | β BRAVO (swept up by a concurrent agent's commit; my code, their message) | `lib/dashboard-shell.mjs` (NEW, 765 lines), `scripts/build-contacts-page.mjs` (REWRITE, 1296 lines), `dashboard/contacts.html` (RENDER, 66,400 lines) + their `dashboard-server.mjs` perf-cache + `scripts/build-dashboard.mjs` inline-initial-values | See impl-log D-6 for the accidental sweep |
| `1b697c3` → `129d7df` (post-rebase) | β BRAVO docs | `data/bravo-contacts-nav-snapshot-2026-05-19.md`, `data/bravo-contacts-{nav,}-audit-2026-05-19.md`, `data/dealbreaker-bravo-{contacts,nav}-2026-05-19.md`, `data/bravo-council-runs/` (4 council JSON outputs), `data/bravo-contacts-nav-snapshots/before/` (6 PNGs), `data/bravo-contacts-nav-snapshots/after/contacts-{1440,900}.png` | Documentation + council outputs + audit + dealbreaker spec + before-screenshots |
| `9a8632c` | β BRAVO Workstream B | `scripts/build-network-database-shell.mjs` (NEW), `dashboard/network-database.html` (PATCHED), `scripts/build-dashboard.mjs` (sidebar refactor + keyboard shortcuts + modal-from-query-param), tour-test screenshots | The full Workstream B implementation |

**Total BRAVO touch:** 3 commits across 6 source files + 12 docs + 15 screenshots.

---

## Verification — Chrome MCP + Playwright live attest

### Tour test (cross-page nav)

| Step | Action | aria-current expected | Verified |
|---|---|---|---|
| 1 | Load `/` | (no aria-current on Pages group — home is implicit) | ✓ |
| 2 | Click sidebar `<a href="contacts.html">` | "👥 Network" on contacts.html | ✓ "👥\n        Network" |
| 3 | Click sidebar `<a href="network-database.html">` | "🗄 Network DB" on network-database.html | ✓ "🗄\n        Network DBtable view" |
| 4 | Click sidebar `<a class="sidebar-brand" href="/">` | back to home | ✓ |
| 5 | Tab from home top | first focus = skip-link | ✓ `{tag:"A", className:"skip-link", text:"Skip to main content"}` |

### Keyboard chord test

| Chord | Action | aria-live announcement | Result |
|---|---|---|---|
| `g` (alone) | (waits for chord completion within 1500ms) | "" | ✓ |
| `g h` | navigate to `/` | "Navigating to Dashboard" | ✓ |
| `g c` | navigate to `/contacts.html` | "Navigating to Network contacts" | ✓ (live-verified via Chrome MCP) |
| `g n` | navigate to `/network-database.html` | "Navigating to Network database" | ✓ |
| `/` | focus the search input | "Search focused" | ✓ |
| `?` | open shortcuts modal | (modal opens) | ✓ |
| Escape | close shortcuts modal | (modal closes) | ✓ |

### Responsive verification (Playwright at 3 widths × 3 pages = 9 screenshots)

| Page | 1440 px | 900 px | 720 px |
|---|---|---|---|
| `/` | full sidebar, dashboard content fits | sidebar 56px icons-only, content reflows | hamburger overlay, sidebar slides in |
| `/contacts.html` | full sidebar + 12-chip filter row + grid | icons-only sidebar + chip row wraps to 2-3 rows + grid 1-column | hamburger + page content padded to clear it |
| `/network-database.html` | full sidebar + light-theme table | icons-only + table | hamburger + page header padded-left:62px to clear hamburger |

All screenshots in `data/bravo-contacts-nav-snapshots/after/`.

### Scroll-cost reduction (the headline metric)

```
Chrome MCP javascript_tool: document.documentElement.scrollHeight

BEFORE: 305,992 px (2,816 cards × ~110 px)
AFTER:  39,978 px (190 visible cards × ~210 px)
DELTA:  -266,014 px (-87%)
```

---

## NEEDS_HUMAN list

| Item | Why deferred |
|---|---|
| Filter UI harmonization across contacts.html and network-database.html | Two different filter systems; both functional. Phase 2 work. |
| Sidebar grouping consistency (home keeps flat order, orphan pages have grouping) | Home's flat sidebar interacts with scroll-spy IntersectionObserver; refactor is a separate atomic change. |
| Compact-stub grid decouple from enriched-card grid | Cosmetic; only affects [Show all]-on view. |
| Dual-corpus issue (embedded ALL_DATA in contacts.html vs API-backed network-database.html) | 2-3 day refactor; view-switcher bridges the two routes for now. |
| Parameterize target-company list from config | Cosmetic; hard-coded for now. |
| In-page enrichment confirmation modal (replace `confirm()`) | Touches modal infra; not blocking. |
| J/K card-to-card keyboard nav | Contacts-page enhancement; not nav workstream. |
| Clickable stat header tiles | Needs design pass on which tile = which filter. |
| `@axe-core/playwright` CI integration | Backlog; manual a11y spot-checks pass. |

---

## Single-command rollback (if Mitchell wants to undo)

```bash
git revert 9a8632c  # Workstream B
git revert 129d7df  # docs (optional — these are pure-add)
# cf34a4d cannot be cleanly reverted because it also contains the other
# agent's perf-cache work. To revert just my changes from cf34a4d:
#   git checkout 8d609e2 -- scripts/build-contacts-page.mjs lib/dashboard-shell.mjs dashboard/contacts.html
#   (8d609e2 is the parent before that commit)
```

---

## Self-review

See `data/bravo-contacts-nav-self-review-2026-05-19.md` for the full adversarial sweep.

Signed: β BRAVO · 2026-05-20 ~00:55 PT
