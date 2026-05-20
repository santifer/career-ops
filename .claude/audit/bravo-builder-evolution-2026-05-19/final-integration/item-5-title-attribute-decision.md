# Item #5 — `title=` attribute consolidation — final decision

**Date:** 2026-05-19
**Branch:** `bravo/builder-evolution-complete-2026-05-19`
**Status:** RESOLVED (Pass 1 applied + Pass 2 deferred with documented rationale)

## Original observation

BRAVO's punch list flagged 232 `title="…"` attributes in `scripts/build-dashboard.mjs` as candidates for cleanup — citing native browser tooltip flicker and a11y redundancy with `aria-label`.

## Pass 1 — applied (commit `1c99f62`)

12 `title=` attributes dropped where the content was identical to the element's `aria-label`. These were unambiguous redundancy and reducing them carried zero UX cost.

## Pass 2 — deferred (documented decision)

After post-merge inspection of the remaining 220 `title=` attrs:

- **74 elements have BOTH `title=` AND `aria-label=`** within a 2-line context window
- **11 of those have exact-string-match duplicates** (e.g., `title="${htmlEscape(tip)}" aria-label="${htmlEscape(tip)}"` on `pill-popover-trigger` elements)
- **4 are one-is-substring-of-other** (e.g., `aria-label="${label}: ${tip}"` paired with `title="${tip}"`)
- **The remaining ~145** are `title=` on elements that have NO `aria-label` — single-purpose hover info

### Why we keep the duplicates

The duplicates exist on `pill-popover-trigger` elements that follow a deliberate UX pattern:

1. **Hover** → native `title=` tooltip shows a preview (immediate feedback, no click required)
2. **Click** → JavaScript `openPillPopover()` opens a structured detail panel

Dropping `title=` would force users to click to see ANY information, removing the lightweight hover-preview affordance. The "tooltip flicker" cost is perceptual and minor; the UX regression of click-required-for-info would be significant.

### Why we keep the standalone title= attrs

The ~145 `title=` attrs on elements without `aria-label` are single-purpose hover tooltips ("FX: USD→EUR rate", "Bar suppressed: data insufficient", "Click for strategy ceiling", etc.). They're not redundancy — they're the primary affordance for that information. Dropping them would orphan the data.

## Defensible posture going forward

| Behavior | Recommendation |
|---|---|
| Drop `title=` where `aria-label` is an EXACT match AND the element is non-interactive | OK (12 already done in Pass 1) |
| Drop `title=` on `pill-popover-trigger` elements | **NO** — breaks hover-preview UX |
| Drop `title=` on elements without `aria-label` | **NO** — orphans the hover info |
| Convert all `title=` to a custom tooltip component | NEEDS-DESIGN-DISCUSSION — large refactor, separate effort |

## If we want to reduce further

The right tool is a custom tooltip component (e.g., `<span class="tooltip" data-tip="…">`) replacing native `title=` across the codebase. That eliminates browser tooltip flicker WHILE preserving hover-preview UX. Estimated scope: 232 occurrences, ~4-6h of work, separate PR.

For now: **the 220 remaining `title=` attrs are intentional UX, not cruft.** Item #5 closed.

## Final tallies

| Metric | Before (cb000c4) | After (ef0d897) |
|---|---|---|
| `title=` attrs | 248 | 236 (BRAVO removed 12, added 0; new chip-redesign + drawer modal added handful for new elements net to 236) |
| `aria-label=` attrs | ~149 | 161 (BRAVO added 12 — all new modal/button elements) |
| Net a11y delta | — | +12 elements gained explicit aria-label; no element lost coverage |
