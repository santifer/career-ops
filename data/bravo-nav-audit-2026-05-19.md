# BRAVO — Cross-page navigation + a11y audit (2026-05-19)

**Branch:** `bravo-contacts-nav-2026-05-19`
**Auditor:** β BRAVO (overnight haul instance)
**Method:** DOM JS attest via Chrome MCP + source read of `scripts/build-dashboard.mjs:11160-11220` (sidebar render), `dashboard/contacts.html` (orphan), `dashboard/network-database.html` (orphan), `dashboard/main.go` (Go binary out-of-scope).

Audit tier convention: **AAA** = must-fix tonight (Mitchell-lens hit, primary friction). **AA** = fix tonight if budget allows (a11y compliance, navigation cohesion). **A** = backlog.

WCAG references throughout: WCAG 2.1 AA Success Criteria. WAI-ARIA: WAI-ARIA Authoring Practices Guide (APG) patterns.

---

## AAA-1 — Two pages have ZERO global nav (a11y + UX failure)

**Finding (DOM attest):**

| Page | `<nav>` | Skip-link | ARIA landmarks | Cross-page links |
|---|:---:|:---:|:---:|---|
| `/index.html` | ✅ `<aside class="sidebar"><nav class="sidebar-nav">` | ✅ `Skip to main content` | ✅ aside aria-label="Primary navigation" + nav aria-label="Sections" | sidebar Contacts → `/contacts.html` |
| `/contacts.html` | ❌ **None** | ❌ **None** | ❌ **None** | ❌ **No link back to index**, no link to network-database |
| `/network-database.html` | ❌ **None** | ❌ **None** | ❌ **None** | ❌ **No link back to index**, no link to contacts |

**Impact:** Mitchell's verbatim pain: *"I need to be able to navigate freely and easily between all child pages, the contact database and the dashboard."* Today, the only way back from contacts.html or network-database.html to the main dashboard is the browser back button. Screen-reader users get no `<nav>` landmark and no skip-link.

**Recommendation:**
1. Build a `lib/dashboard-shell.mjs` module that exports `renderDashboardShell({pageId, title, contentHTML})` — produces a full HTML document with shared sidebar, skip-link, ARIA landmarks, theme tokens, and mobile hamburger.
2. Refactor `scripts/build-contacts-page.mjs` to delegate the shell render to `lib/dashboard-shell.mjs`, passing only the page-specific content + filter chips + grid.
3. Patch `dashboard/network-database.html` to wrap its content in the same shell (load nav via the same lib, either at build-time or via a small client script).
4. The shared sidebar must include a `Network database` entry alongside `Contacts`.

WCAG criteria addressed: **2.4.1 Bypass Blocks (A)** (skip-link), **1.3.1 Info and Relationships (A)** (landmark roles), **3.2.3 Consistent Navigation (AA)** (same nav across pages).

---

## AAA-2 — `Network database` is hidden from the main dashboard sidebar

**Finding:** `scripts/build-dashboard.mjs:11208` defines a sidebar entry for `Contacts` → `/contacts.html`. There is NO sibling entry for `Network database` → `/network-database.html`. The only path to network-database.html is a buried popout link in `scripts/build-dashboard.mjs:47676` inside a per-company drawer.

**Impact:** Mitchell, after 8 weeks of using the system, has never visited `network-database.html`. Yet that surface has features he explicitly asked for (paginated search, sortable, multi-select bulk actions, CSV export) and that the audit recommends adding to contacts.html — duplicating work that's already done.

**Recommendation:** Add the sidebar entry tonight. Differentiate the labels:
- `👥 Contacts` → `/contacts.html` (card view, browsing)
- `🗄 Network DB` → `/network-database.html` (table view, searching at scale)

OR collapse into one entry that opens the new unified surface (post-council recommendation).

---

## AAA-3 — Active-page indicator missing on cross-page nav

**Finding:** On `/index.html`, the sidebar's `data-section` attributes wire to an IntersectionObserver for scroll-spy active-state highlighting (`.sidebar-link.active`). When the user navigates to `/contacts.html`, the sidebar is gone entirely, so there is no "you are here" indicator.

**Impact:** WCAG 2.4.8 Location (AAA) and the WAI-ARIA `aria-current="page"` pattern require an indicator of where the user is in the site. Without it, navigation feels disorienting — Mitchell's verbatim "where am I in the site."

**Recommendation:** When the shared shell renders, the sidebar entry corresponding to the current page must:
1. Have `aria-current="page"` attribute set
2. Visually distinguish from inactive entries (the existing `.sidebar-link.active` CSS already does this — green left-border, bold, surface-2 background)
3. Survive client-side navigation (won't matter for now — multi-page HTML — but the data-page attribute should already be set at build-time)

---

## AAA-4 — No keyboard shortcut for cross-page nav

**Finding:** The main dashboard has Cmd+K as the power-user nav (per `scripts/build-dashboard.mjs` comment at line 11175). Contacts.html and network-database.html have neither Cmd+K nor any global keyboard shortcut.

**Impact:** A power-user like Mitchell expects `g h` (go home), `g c` (go contacts), `g n` (go network) shortcuts à la GitHub / Linear. Currently none.

**Recommendation:** Add a global keyboard layer in `lib/dashboard-shell.mjs`:
- `g h` → navigate to `/`
- `g c` → navigate to `/contacts.html`
- `g n` → navigate to `/network-database.html`
- `/` → focus the primary search input on the page (if it exists)
- `?` → open a help overlay listing the shortcuts

Pattern: WAI-ARIA APG "Keyboard Interface" guidance; Linear's `?` cheat sheet is the contemporary best-in-class.

---

## AAA-5 — No `<main>` landmark on orphan pages

**Finding:** Both orphan pages wrap their content in a `<div class="page-shell">` or similar, NOT a `<main>` element. Screen readers cannot navigate to "main content" via the standard landmark shortcut.

**Impact:** WCAG 1.3.1 Info and Relationships (A) — landmark structure is required for screen-reader users to navigate to main content.

**Recommendation:** The shared shell must wrap page content in `<main id="main" tabindex="-1">` so the skip-link target works AND focus management on cross-page nav can target it.

---

## AAA-6 — No focus management on cross-page nav

**Finding:** When a user clicks a sidebar link to navigate to a new page, focus lands on... whatever the browser's default focus target is (typically nothing, or the URL bar). This is jarring for keyboard users.

**Impact:** WAI-ARIA APG "Focus Management" guidance — focus must land on a meaningful element after page navigation.

**Recommendation:** On every page, on `DOMContentLoaded`, if the URL contains `#main` (the skip-link target), focus `<main>`. If the URL contains `#search`, focus the search input. Else, focus the first `<h1>` (with `tabindex="-1"` so it's programmatically focusable).

---

## AA-1 — Mobile hamburger missing on orphan pages

**Finding:** `/index.html` has a `<button class="sidebar-toggle">` for mobile with `aria-label="Open navigation menu"`, `aria-expanded`, `aria-controls="sidebar"`. The orphan pages have nothing.

**Impact:** On a phone screen (<720px viewport), the orphan pages have NO way to access the dashboard nav.

**Recommendation:** The shared shell must include the mobile hamburger + backdrop, same pattern as index.html.

---

## AA-2 — Logo/brand is not a link back to home on any page

**Finding:** `scripts/build-dashboard.mjs:11178` renders the brand as `<div class="sidebar-brand">⚡ Career-Ops</div>`. It's NOT an `<a href="/">`.

**Impact:** Standard web convention — the logo/brand in the top-left is a "back to home" link. Today, even on index.html, clicking the brand does nothing.

**Recommendation:** Wrap `.sidebar-brand` in `<a href="/" aria-label="Career-Ops home">` so clicking the brand is the cross-page "home" affordance.

---

## AA-3 — Heading hierarchy on orphan pages

**Finding:** `/contacts.html` has `<h1>Contacts directory</h1>` then jumps to card-internal `.contact-card-name` (styled as h2 but actually a `<div>`). No h2/h3 between the h1 and the card grid.

**Impact:** WCAG 1.3.1 Info and Relationships (A) — heading structure should be hierarchical.

**Recommendation:** Insert appropriate h2 headings, e.g., `<h2 class="sr-only">Filters</h2>` above the filter row and `<h2 class="sr-only">Contacts list</h2>` above the grid. Use `.sr-only` so they don't visually clutter but are exposed to assistive tech.

---

## AA-4 — Filter pills are not radio-grouped

**Finding (contacts.html):** Filter pills are individual `<button data-filter="...">` elements. There's no `role="radiogroup"` or `role="tablist"` wrapping them. Screen readers announce 7 separate buttons; they don't communicate "single-select within a group."

**Impact:** WAI-ARIA APG "Radio Group" pattern — when only one of N options can be selected, the group should be a radiogroup or tablist.

**Recommendation:** Wrap filters in `<div role="group" aria-label="Filter contacts by category">` (or radiogroup if single-select; if AAA-2 ships with multi-select, then group with aria-multiselectable). Each button gets `aria-pressed="true|false"`.

---

## AA-5 — Color tokens diverge between contacts.html and index.html

**Finding:**
- `contacts.html` defines `--bg: #0a0a0f` (dark)
- `index.html` defines `--bg: #06070d` (also dark but darker)

Inconsistent token values mean the same "dark theme" feels different across pages.

**Impact:** Cohesion — Mitchell's pain *"navigation cohesion, consistency and accessibility across all pages."*

**Recommendation:** Centralize tokens in `lib/dashboard-tokens.mjs` (already exists per Phase 0 inventory). Both pages must consume from the same source.

---

## AA-6 — Focus-visible styling is missing on orphan-page elements

**Finding:** `/index.html` has full `:focus-visible` styling (`outline: 2px solid var(--blue-fg); outline-offset: 2px`). `/contacts.html` has it only on the search input (`.controls input:focus`). Filter pills, action buttons, and card-internal buttons have no `:focus-visible` style at all.

**Impact:** WCAG 2.4.7 Focus Visible (AA). A keyboard user cannot tell what element has focus.

**Recommendation:** The shared shell must apply the same global `:focus-visible` rule across all pages.

---

## AA-7 — `<h1>` is not the first focusable thing after skip-link target

**Finding:** Even when a skip-link is added, focusing on `<main>` doesn't direct attention to the page's `<h1>`. A screen reader announces "main, region" with no further context.

**Recommendation:** When skip-link is clicked and `<main>` receives focus, also set up a tabindex="-1" `<h1>` inside `<main>` so the next Tab moves to it.

---

## A-1 (backlog) — Breadcrumb pattern not implemented

**Finding:** A user deep in the contacts page has no "you are here" trail. For now, the sidebar's `aria-current="page"` covers this, but a `<nav aria-label="Breadcrumb">` would be richer.

**Recommendation (backlog):** Once the surface count grows beyond 3 pages, add breadcrumbs.

---

## A-2 (backlog) — Color contrast formal audit

**Finding:** Spot-check passes WCAG AA but no programmatic axe-core run was done tonight.

**Recommendation (backlog):** Wire `@axe-core/playwright` (already in package.json) into the CI test suite for the dashboard pages, on every PR.

---

## A-3 (backlog) — Reduced motion preference

**Finding:** Sidebar slide-open is animated via `transition: transform .25s`. Hover transitions on cards are 120ms. No `@media (prefers-reduced-motion: reduce)` override on either orphan page.

**Recommendation (backlog):** Add the reduced-motion override in the shared shell.

---

## A-4 (backlog) — Page transition focus ring flash

**Finding:** When the skip-link is activated, focusing `<main>` triggers a visible outline that flashes briefly. Cosmetic; not a blocker.

---

## A-5 (backlog) — Search keyboard shortcut consistency

**Finding:** Main dashboard uses Cmd+K. Contacts will get `/`. Inconsistent.

**Recommendation (backlog):** Either consolidate to one (Cmd+K everywhere) or document the difference. `/` is more contextual ("focus this page's search") and Cmd+K is global ("open Spotlight-style nav"); both can co-exist.

---

## What ships tonight (AAA + AA)

| Item | Disposition |
|---|---|
| AAA-1 (zero nav on orphan pages — build `lib/dashboard-shell.mjs`) | **Ship.** Core of Workstream B. |
| AAA-2 (Network DB hidden from sidebar) | **Ship.** Add sidebar entry in `scripts/build-dashboard.mjs`. |
| AAA-3 (active-page indicator) | **Ship.** `aria-current="page"` + CSS active state. |
| AAA-4 (keyboard shortcuts `g h / g c / g n / / / ?`) | **Ship.** Live in shared shell. |
| AAA-5 (`<main>` landmark) | **Ship.** Built into the shell. |
| AAA-6 (focus management on page nav) | **Ship.** Built into the shell. |
| AA-1 (mobile hamburger on orphan pages) | **Ship.** Built into the shell. |
| AA-2 (brand is a home link) | **Ship.** Built into the shell. |
| AA-3 (heading hierarchy) | **Ship.** One-line per orphan page. |
| AA-4 (filter pill radio-group ARIA) | **Ship.** Builds into Workstream A's new filter UI. |
| AA-5 (token cohesion) | **Ship.** Source from `lib/dashboard-tokens.mjs`. |
| AA-6 (focus-visible global rule) | **Ship.** Built into the shell. |
| AA-7 (h1 receives focus after skip) | **Ship.** Built into the shell. |
| All A-tier | **Backlog.** |

Signed: β BRAVO · 2026-05-19 ~23:55 PT
