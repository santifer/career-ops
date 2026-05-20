# Dealbreaker — Workstream B (Cross-page nav cohesion + a11y)

**Branch:** `bravo-contacts-nav-2026-05-19`
**Date:** 2026-05-19
**Inputs:**
- `data/bravo-council-runs/council-B-nav.json` (Sonnet 4.6 + Gemini 2.5 Pro + Perplexity Sonar Pro; GPT-5 timed out, retry pending)
- `data/bravo-contacts-nav-snapshot-2026-05-19.md` (Phase 0)
- `data/bravo-nav-audit-2026-05-19.md` (Phase 2)

Method: claim-adjudication mode. Keep verified/corroborated claims; cut unsupported; break impasses with external evidence + WCAG 2.1 AA hard constraints.

---

## Claims kept (≥2 council members corroborate)

| Claim | Models | Verdict |
|---|---|---|
| Build-time component injection beats client-side / iframe / SW / template | Sonnet, Gemini, Perplexity (3/3) | **KEEP.** All cite GOV.UK + USWDS as reference implementations. JS-less reliability + initial-DOM landmark visibility + WCAG 1.3.1 compliance. |
| Skip-link FIRST in DOM, before nav, target = `<main id="...">` | Sonnet, Gemini, Perplexity (3/3) | **KEEP.** WCAG 2.4.1 Bypass Blocks (A). |
| `aria-current="page"` on the `<a>` (not `<li>`) for active page indicator | Sonnet, Gemini, Perplexity (3/3) | **KEEP.** WAI-ARIA APG §3.4 Navigation Landmark Pattern. |
| Active state must NOT rely on color alone | Sonnet, Gemini, Perplexity (3/3) | **KEEP.** WCAG 1.4.1 Use of Color (A). Visual treatment: left-border + background fill + font-weight + color. |
| Minimum ARIA landmarks: `<header role="banner">`, `<nav aria-label>`, `<main id>`, `<footer role="contentinfo">` | Sonnet, Gemini, Perplexity (3/3) | **KEEP.** WCAG 1.3.1 Info and Relationships (A). |
| Modal triggers must be `<button>` not `<a href="#">` (semantic correctness) | Sonnet | **KEEP.** WCAG 4.1.2 Name Role Value (AA) + WAI-ARIA APG Disclosure pattern. |
| WCAG 3.2.3 Consistent Navigation (AA) requires nav in same position across pages | Sonnet, Gemini, Perplexity (3/3) | **KEEP.** |
| Inline SVG icons over icon fonts | Sonnet, Gemini, Perplexity (3/3) | **KEEP.** WCAG 1.1.1 Non-text Content (A). |
| External shared CSS, inline only critical (skip-link/focus) | Sonnet, Gemini, Perplexity (3/3) | **KEEP.** |
| Brand logo wraps in `<a href="/">` with `aria-label` | Sonnet, Gemini (2/3) | **KEEP.** Standard web convention. |
| Hamburger button gets `aria-expanded` + `aria-controls` + WAI-ARIA Disclosure pattern | Sonnet, Gemini, Perplexity (3/3) | **KEEP.** |
| `role="list"` on `<ul>` with `list-style: none` (Safari/VoiceOver stripping) | Sonnet | **KEEP.** Documented Piccalilli/Andy Bell pattern. |

## Claims cut

| Claim | Cut reason |
|---|---|
| Iframe-embedded nav | All 3 models reject. |
| ServiceWorker-injected nav | All 3 models reject. |
| Web Component / Custom Element nav (Gemini R4 only) | First-paint flash, Shadow DOM ARIA-ID friction. Even Gemini conceded "Light DOM only" — at that point it's just JS injection with no benefit over build-time. |
| Page-specific mobile nav patterns | All 3 reject; one consistent pattern wins. |
| Custom "Back to Dashboard" breadcrumb | Sonnet Model D withdrew on Round 2 condition (sidebar covers this via aria-current). |

## Impasses adjudicated

### D-Impasse-1 — Sidebar vs. top toolbar on data-dense pages

**Sonnet + Gemini Round 3:** **Persistent sidebar on all pages** (200 px) with grouping.

**Perplexity + Gemini-adversarial:** **Contextual** — sidebar on dashboard, top toolbar on data-dense pages. "A 200 px sidebar on contacts.html wastes horizontal space."

**Adjudication:** **Persistent sidebar on all pages, with three caveats:**

1. WCAG 3.2.3 Consistent Navigation (AA) is the hard constraint. The existing pattern is sidebar; the existing pattern must extend. (Sonnet's argument.)
2. The 200 px cost is acceptable at desktop widths: 1440 - 200 = 1240 px is plenty for a contacts table. Below 1280 px, the sidebar auto-collapses to 56 px (icons only) per the existing CSS at `dashboard/index.html:457`. Below 720 px, it becomes a hamburger overlay.
3. The Group 3 modal triggers from Sonnet R3 — on non-home pages, they navigate to `/?open=modalName`. This means non-home pages don't carry the modal HTML; clicking "Pending" on contacts.html goes to `/` and JS auto-opens the modal. Clean.

**Why this resolves both:** Mitchell wins the consistency play (Sonnet/WCAG-aligned). Perplexity's space-efficiency concern is addressed by the auto-collapse at 1280 px.

### D-Impasse-2 — Skip-link target: `#main` everywhere, or page-specific (`#contacts-search`)?

**Sonnet Round 3:** **Page-specific.** "On contacts.html the primary task is search; skip to `#contacts-search`."

**Perplexity:** **`#main` universally.** "Skip link's job is to bypass repeated blocks and land at the main content region. Not a task-specific control."

**Gemini Round 1:** Page-specific on contacts (skip to search).

**Adjudication:** **`#main` on all pages, with the page's primary task input as the first focusable element inside `<main>`.** This combines both:

- Skip-link is universally `<a href="#main">Skip to main content</a>` — WCAG 2.4.1 canonical pattern, simplest mental model.
- On `contacts.html`, the search input is the first thing inside `<main>` (immediately after `<h1>`). So when the user activates the skip-link, focus lands on `<main>` (tabindex=-1), and the next Tab moves to the search input.
- This avoids the multi-target skip-link complexity Sonnet flagged ("the build must generate page-specific skip links") while still putting the search input one Tab away.

### D-Impasse-3 — Keyboard shortcuts: ship or defer?

**Sonnet, Gemini:** **Ship** — `g h / g c / g n / ? ` discoverable via `?` modal, with `aria-live` announcement, gated on non-form-input focus.

**Perplexity:** **Defer.** Scope creep for a personal dashboard.

**Adjudication:** **Ship a minimal shortcut layer.** Rationale:
- Mitchell is an INTJ-T power user (per `memory/user_compensation_priority.md` framing + `modes/_profile.md`).
- The Sonnet-spec'd implementation is small (~80 lines of `_shortcuts.js`) and addresses Perplexity's concerns (form-input gating, screen-reader announcement, `?` discoverability modal, opt-in via Settings).
- The cost-of-not-shipping: Mitchell types page URLs into Cmd+L every time he switches surfaces. A power user's productivity drain.
- Per `memory/feedback_first_person_voice.md`, this is a first-person-voice tool — built for Mitchell, not a public site that has to defer to lowest-common-denominator.

**Shortcuts shipped tonight:**
- `g h` → `/`
- `g c` → `/contacts.html`
- `g n` → `/network-database.html`
- `/` → focus the primary search input on the current page
- `?` → open shortcuts modal

`aria-live="polite"` region announces "Navigating to {page}" before navigation fires (100 ms delay per Sonnet R3 NVDA/VoiceOver compatibility testing note).

### D-Impasse-4 — Per-page nav variants vs. template variable

**Sonnet Model D (R1):** **Per-page nav variants** — simpler for 3-page site.

**Sonnet Model C (R2 dissent):** **Template variable** — scales as pages grow.

**Adjudication:** **Template variable approach.** Sonnet Model C's argument wins: when a 4th page is added, template-variable means one edit to `nav.html.template` + build; per-page-variants means edit 4 files. Maintainability beats one-time simplicity. The build script will literally substitute `{{currentPage}}` to set `aria-current` on the right anchor.

---

## Final spec (handed to BRAVO for tonight's implementation)

### `lib/dashboard-shell.mjs` — new module

Exports:
- `renderDashboardShell({pageId, title, contentHTML, skipLinkTarget?})` → full HTML document
- `getDashboardSidebar({currentPage})` → HTML string for the sidebar (called by `scripts/build-dashboard.mjs` and by this module)
- `getDashboardShellHead({title})` → `<head>` content (tokens, fonts, shared CSS)
- `getDashboardKeyboardShortcutsJS()` → `<script>` block for the global shortcuts layer

### Page registry (passed to the shell module)

```js
const PAGES = [
  // Group 1: Dashboard sections (cross-page on non-home pages)
  { id: 'overview',     href: '/#overview-section',         label: 'Overview',         icon: '📊', group: 'dashboard' },
  { id: 'apply-now',    href: '/#apply-now-section',        label: 'Apply-Now',        icon: '🎯', group: 'dashboard' },
  { id: 'all-evals',    href: '/#all-evaluations-section',  label: 'All Evaluations',  icon: '📋', group: 'dashboard' },
  { id: 'trends',       href: '/#trends-panel',             label: 'Trends',           icon: '📈', group: 'dashboard' },
  { id: 'companies',    href: '/#companies-panel',          label: 'Companies',        icon: '🏢', group: 'dashboard' },
  // Group 2: Pages (cross-page links — these get aria-current="page" when on)
  { id: 'home',         href: '/',                          label: 'Dashboard',        icon: '⚡', group: 'pages' },
  { id: 'contacts',     href: '/contacts.html',             label: 'Network',          icon: '👥', group: 'pages' },
  { id: 'network-db',   href: '/network-database.html',     label: 'Network DB (table)', icon: '🗄', group: 'pages' },
  // Group 3: Actions (modal triggers — on non-home pages, navigate to /?open=...)
  { id: 'pending',      action: 'modal:pending',            label: 'Pipeline',         icon: '⏳', group: 'actions' },
  { id: 'batch-runs',   action: 'modal:batch-runs',         label: 'Batch Runs',       icon: '📦', group: 'actions' },
  { id: 'industries',   action: 'drill:industry-gap',       label: 'Industries',       icon: '🎯', group: 'actions' },
  { id: 'settings',     action: 'modal:settings',           label: 'Settings',         icon: '⚙️', group: 'actions' },
];
```

### Shell HTML skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — Career-Ops</title>
  <link rel="manifest" href="/manifest.json">
  <style>{tokens + shell CSS}</style>
</head>
<body class="dark">
  <a class="skip-link" href="#main">Skip to main content</a>

  <button type="button" class="sidebar-toggle" id="sidebar-toggle-btn"
    onclick="toggleSidebar()" aria-label="Open navigation menu" aria-expanded="false"
    aria-controls="sidebar">☰</button>
  <div class="sidebar-backdrop" id="sidebar-backdrop"
    onclick="closeSidebar()" aria-hidden="true"></div>

  <!-- aria-live for keyboard-shortcut announcements -->
  <div id="_shortcut-announcer" aria-live="polite" aria-atomic="true" class="sr-only"></div>

  <div class="app-shell">
    <aside class="sidebar" id="sidebar" aria-label="Primary navigation">
      <a class="sidebar-brand" href="/" aria-label="Career-Ops home">
        <span class="sidebar-favicon" aria-hidden="true">⚡</span>
        <span class="sidebar-brand-name">Career-Ops</span>
      </a>
      <nav class="sidebar-nav" aria-label="Sections">
        <!-- Group 1: Dashboard sections -->
        <div class="sidebar-nav-group" role="group" aria-labelledby="navgrp-dash-label">
          <span id="navgrp-dash-label" class="sidebar-nav-group-label">Dashboard</span>
          ...items from group: 'dashboard'...
        </div>
        <!-- Group 2: Pages -->
        <div class="sidebar-nav-group" role="group" aria-labelledby="navgrp-pages-label">
          <span id="navgrp-pages-label" class="sidebar-nav-group-label">Pages</span>
          ...items from group: 'pages'... (with aria-current on active)
        </div>
        <!-- Group 3: Actions -->
        <div class="sidebar-nav-group" role="group" aria-labelledby="navgrp-actions-label">
          <span id="navgrp-actions-label" class="sidebar-nav-group-label">Actions</span>
          ...items from group: 'actions'...
        </div>
      </nav>
    </aside>
    <main id="main" class="app-main" tabindex="-1">
      <h1>{title}</h1>
      {contentHTML}
    </main>
  </div>

  <script>{global keyboard shortcuts layer}</script>
  <script>{sidebar toggle + modal-from-query-param layer}</script>
</body>
</html>
```

### Modal-from-query-param behavior

On `/` (index.html), `DOMContentLoaded`:
```js
const params = new URLSearchParams(location.search);
const open = params.get('open');
if (open === 'pending') openStatPanel('pending');
else if (open === 'batch-runs') openBatchStatusModal();
else if (open === 'settings') openMobileSettingsSheet();
else if (open === 'industry-gap') window.drillIn('industry-gap','',null);
```

On non-home pages, clicking a Group 3 button does `location.assign('/?open=' + actionTarget)`.

### Active-page CSS

```css
.sidebar-link[aria-current="page"] {
  background: var(--surface-2);
  color: var(--text);
  border-left-color: var(--green-fg);
  font-weight: 600;
}
.sidebar-link[aria-current="page"]::after {
  content: "";
  position: absolute;
  /* visual reinforcement beyond color */
}
```

### Keyboard shortcuts JS (~80 lines)

Per Sonnet R3 spec:
- `keydown` listener on `document`
- Bail if `event.target.matches('input, textarea, select, [contenteditable]')`
- Track `lastKey` + `lastKeyTime` for chord detection (`g` then `h` within 1500 ms)
- Announce via `_shortcut-announcer` aria-live region BEFORE navigation
- 100 ms delay before `location.assign(...)` to let screen reader read announcement
- `?` opens shortcuts modal (WAI-ARIA APG Dialog: focus trap, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus return on close)

### Files touched tonight

- **NEW:** `lib/dashboard-shell.mjs`
- **REFACTOR:** `scripts/build-contacts-page.mjs` — replace its inline HTML/CSS with `renderDashboardShell({pageId: 'contacts', ...})`
- **PATCH:** `scripts/build-dashboard.mjs` — switch sidebar render to delegate to `lib/dashboard-shell.mjs:getDashboardSidebar({currentPage: 'home'})`. Add `Network DB (table)` sidebar entry. Wire the query-param-driven modal-open logic.
- **PATCH:** `dashboard/network-database.html` — wrap content in the shell (the script will modify the raw HTML to inject the shell before content; subsequent rebuilds of network-database.html will be a build-time concern).

### A11y test plan

1. `axe-core` via `@axe-core/playwright` (already in package.json) on all three pages — zero violations.
2. Tab through every page: verify focus is visible on every focusable element.
3. Skip-link activation: verify focus lands on `<main>`, next Tab lands on primary search/control.
4. `aria-current="page"` exists on the right anchor on every page.
5. Hamburger: `aria-expanded` toggles correctly; backdrop closes on click.
6. Keyboard shortcuts: `g h / g c / g n / / / ?` work; do NOT fire inside `<input>`.

Signed: dealbreaker via β BRAVO · 2026-05-19 ~00:10 PT
