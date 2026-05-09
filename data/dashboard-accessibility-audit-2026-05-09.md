# Dashboard Accessibility Audit — 2026-05-09

**Subject:** career-ops dashboard at http://localhost:3000 (light mode)
**Standard:** WCAG 2.1 AA
**Method:** JS-evaluated computed styles + DOM inspection via Chrome MCP, screenshot review across 3 page surfaces (top / middle / bottom)
**Audience risk:** AI-native hiring managers may include people using screen readers, voice control, or keyboard-only — failures during a demo are deal-breakers

---

## Summary

**Issues found: 9** | **Critical: 2** | **Major: 4** | **Minor: 3**

The dashboard scores well on body-text contrast and basic semantic structure, but has **2 critical contrast failures** in the Apply-Now green branding (the very thing that catches the eye first), and is missing several robust-name/role/value pieces that make it harder to navigate with a screen reader. The Phase 2 touch-target work shipped — but the inline action links (`Report · Apply · Verify`) were missed and remain undersized.

---

## Findings

### Perceivable

| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 1 | **Apply-Now Queue stat value "25" (green ~3.3:1) at 32px / 700 weight just barely passes large-text 3:1, but on the smaller "25" pill (11px / 600) the same green fails normal-text 4.5:1** | 1.4.3 Contrast | 🔴 Critical | Either darken the green token (`--green-fg`) by 1 step, OR use a darker green for small/normal-weight text and reserve the bright green for large headlines only. Recommend introducing `--green-fg-dark` for ≤14px text. |
| 2 | **Status pill "Evaluated" tinted background — text contrast 4.24:1 (just under 4.5:1 required for normal text)** | 1.4.3 Contrast | 🔴 Critical | Bump the pill text color one step darker, OR strengthen the background tint. Same fix applies to all status pill variants — audit Applied / Interview / Offer / Rejected / Discarded for the same issue. |
| 3 | "click to expand" gray hint text passes contrast (5+:1) but is visually weak at the chosen size — easy to miss | 1.4.11 Non-text Contrast | 🟢 Minor | Replace with an icon affordance (`↓` chevron in card top-right). Less ink, clearer signal. (Already in design critique recommendations.) |
| 4 | Score-distribution segmented bar uses color-only signaling (green/blue/amber/red) for STRONG / GOOD / MODERATE / WEAK / NO FIT | 1.4.1 Use of Color | 🟡 Major | The segments DO have text labels under them — that's the redemption. Verify the labels remain legible at 200% zoom and are programmatically associated with their segment (use `aria-label` on each segment, e.g., `aria-label="STRONG: 34 evaluations at 4.0+"`). Currently relying on visual proximity alone. |
| 5 | No `<img>` elements found, but stat-card top accent stripes (decorative 3px lines) and segmented-chart bars convey meaning visually only | 1.1.1 Non-text Content | 🟢 Minor | Decorative stripes need no alt; just verify the chart bars get programmatic labels (#4 above). |

### Operable

| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 6 | **Inline action links "Report · Apply · Verify" in the table action column** are well below 44×44 CSS pixels (likely <30px tall, packed inline) | 2.5.5 Target Size | 🟡 Major | Convert each to a padded button (min-height 44px, min-width 44px) OR use icon buttons with explicit padding. The Phase 2 touch-target audit didn't reach inline link clusters. |
| 7 | **No skip-link to main content** (`a[href="#main"]` or `.skip-link` not present) | 2.4.1 Bypass Blocks | 🟡 Major | Add `<a class="skip-link" href="#main">Skip to main content</a>` as the first focusable element, visible on focus only. ~10 lines CSS. Tab + Enter to bypass the toolbar header. |
| 8 | **Visible focus indicator status: unverified — no `:focus-visible` rule found in stylesheets** | 2.4.7 Focus Visible | 🟡 Major | Add a global `:focus-visible { outline: 2px solid var(--blue-fg); outline-offset: 2px; border-radius: inherit; }` rule. Verify by Tab-cycling the entire page. |

### Understandable

| # | Issue | WCAG Criterion | Severity | Recommendation |
|---|-------|---------------|----------|----------------|
| 9 | Filter input "Filter by company, role, or notes..." uses placeholder as label — placeholders disappear on focus and aren't reliably announced | 3.3.2 Labels or Instructions | 🟢 Minor | Add visually-hidden `<label>` (`.sr-only` pattern) OR `aria-label="Filter evaluations"` on the input. Also applies to the three filter selects (All tiers / All scores / All statuses). |

### Robust

No critical Robust failures observed in the JS evaluation pass. **However**, a deeper screen-reader test (VoiceOver Cmd-F5) is recommended before declaring a clean Robust pass — the audit can't fully simulate AT announcement.

---

## Color Contrast Check (sampled)

| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Body text (table cells) | #57606a | #ffffff | 6.39:1 | 4.5:1 | ✅ |
| Score "4.7" chip | dark gray | light green | 4.57:1 | 4.5:1 | ✅ (barely) |
| **Apply-Now pill "25"** | green text | white | **3.3:1** | 4.5:1 | ❌ **FAIL** |
| **Apply-Now stat value "25"** (32px) | green | white | **3.3:1** | 3:1 (large) | ✅ (barely) |
| Total evals "143" (32px) | dark | white | 17.74:1 | 3:1 | ✅ |
| Pill "⚠ Gap" | colored | tinted | 4.51:1 | 4.5:1 | ✅ (barely) |
| **Status pill "Evaluated"** | text | tinted bg | **4.24:1** | 4.5:1 | ❌ **FAIL** |
| Subtle/muted text | #57606a | #ffffff | 6.39:1 | 4.5:1 | ✅ |

---

## Keyboard Navigation (preliminary — manual test recommended)

| Element | Notes |
|---------|-------|
| Top-right Dark/Batch toggle buttons | Need verification — Tab order should be predictable (left-to-right, top-to-bottom) |
| Filter input | Tab should land here after the toolbar; Enter should not submit a form (should be live-filter) |
| Filter selects | Arrow keys to choose options is native — verify no JS interception |
| Table rows | Currently click-to-expand — need verification that Enter/Space on a focused row triggers expand |
| Action links | Tab through Report → Apply → Verify per row; verify focus ring visibility |
| Modals (gap, verify) | Verify Escape closes, focus traps inside while open, focus returns to trigger element on close |
| Batch overlay close (✕) | Verify keyboard reachable (was the click-only fix in the sticky-dismiss patch) |

---

## Landmarks & Heading Structure

- `<header>` / `[role="banner"]`: ❓ verify presence
- `<nav>` / `[role="navigation"]`: ❓ verify presence (top toolbar should be in `<nav>` or `<header>`)
- `<main>` / `[role="main"]`: ❓ verify presence (the dashboard body should be in `<main id="main">` to support skip-link)
- `<footer>` / `[role="contentinfo"]`: ❓ verify presence

**Heading hierarchy:** H1 ("Career-Ops Dashboard") → H2 (panel titles like "Apply-Now Queue", "All Evaluations", "Score Distribution", "Top Companies"). Looks correct based on visual scan; verify `<h1>` count is exactly 1 and no levels are skipped.

---

## Forms

- 3 select inputs (All tiers / All scores / All statuses) and 1 text filter: **all rely on placeholder/visible label only — likely missing `<label>` element associations**. See finding #9.

---

## Priority fixes

1. 🔴 **Fix Apply-Now green contrast** (findings #1, #2) — single token tweak ripples to all pill / status / accent uses. Single highest-leverage accessibility fix on the page. **~15 min.**
2. 🟡 **Add visible `:focus-visible` outline globally** (finding #8) — keyboard-only users currently can't see where they are. **~10 min.**
3. 🟡 **Add skip-link** (finding #7) — first thing screen-reader users encounter; lets them bypass the toolbar to the dashboard body. **~10 min.**
4. 🟡 **Bump action-link touch targets to 44×44** (finding #6) — Phase 2 touch-target audit missed these. **~20 min.**
5. 🟡 **Score-distribution chart segments need `aria-label`** (finding #4) — purely visual today. **~15 min.**
6. 🟢 **Add `aria-label` to filter input + selects** (finding #9). **~5 min.**
7. 🟢 **Replace "click to expand" hint with chevron icon** (finding #3 + design critique). **~15 min.**

**Total: ~1.5 hours to clear the entire Critical + Major + Minor list.** All fixes are CSS / single-line HTML attribute changes — no architectural surgery.

---

## What this audit does NOT cover

- Real screen-reader behavior (VoiceOver / NVDA / JAWS — recommend manual pass before final ship)
- Reduced-motion preferences (`prefers-reduced-motion` — not yet audited)
- High-contrast mode (Windows / macOS forced-colors — not yet audited)
- Internationalization / right-to-left layout
- The mobile experience (PR #606 mobile cards + drawer — should re-audit after merge)

---

**Recommended next step:** ship the 7-item Phase 4 accessibility bundle (~1.5 hr) before any external demo. The 2 Critical findings alone could fail an enterprise procurement review at Anthropic / OpenAI.
