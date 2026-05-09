# Dashboard Design Critique — 2026-05-09 (Phase 4+ planning)

**Subject:** career-ops dashboard at http://localhost:3000 (live), `dashboard.careers-ops.com` (gated)
**Audience:** AI-native hiring managers viewing as a build artifact during interview loops
**Goal:** "polished SaaS ops tool" → "shippable Linear / Vercel-tier interface"
**Already shipped (do not re-suggest):** Phase 2 (segmented chart, touch targets, gap markdown, skeleton loaders, sticky filter, toast component) + Phase 3 mobile cards + drawer (PR #606) + sticky-dismiss bug fix
**Already queued for Phase 3:** status writeback, expand-row hierarchy, batch history, report search

---

## Overall impression

**Solid foundation, hits SaaS-tool register cleanly.** The segmented score chart, top-companies horizontal bars, pill badges, and clean tabular layout all read as "someone who ships." Inter font and the token-based dark mode parity are the right calls. The biggest remaining gaps are not bugs — they're opinionated decisions a Linear/Vercel-tier interface makes that this one hasn't yet.

The "wow, this is real" moment for a hiring manager hits at the segmented Score Distribution chart at the bottom of the page. The "wait, this is a SaaS tool" moment is at the top stat-card row. The middle (table) is competent but generic.

---

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| Stat card row breaks at 5; "URLs Scanned" sits alone on row 2 | 🟡 Moderate | Either pack 6 on one row (responsive grid `repeat(auto-fit, minmax(180px, 1fr))`), or design a deliberate 2-row hero (3+3 with smaller secondary cards). Orphaned trailing card looks like overflow, not intent. |
| "click to expand" hint repeated 4 times in tiny gray text under each stat card | 🟡 Moderate | Replace with a single `↓` chevron icon in the top-right corner of each card (or remove entirely — the cursor change + hover state should communicate affordance). Text repetition reads as "I don't trust you to discover this." |
| Action column "Report · Apply · Verify" uses dot separators | 🟢 Minor | Convert to icon buttons (link/clipboard/check) with text labels on hover. Saves horizontal real estate on mobile, increases visual rhythm on desktop. |
| Generated metadata line is verbose: "2026-05-09T20:53:02.914Z · Reports today: 9 · Live · 1:58:03 PM" | 🟢 Minor | Tighten to "Updated 1:58 PM · Live" with the rest behind a tooltip on hover. The full ISO timestamp is debug info, not user info. |
| No keyboard shortcuts | 🟡 Moderate | Add `Cmd-K` palette for jump-to-row, jump-to-section, status update. Single biggest "wow" moment for technical hiring managers; it's the Linear/Notion calling card. |
| Tier badges (`A2`, `B`) next to company names have no in-context legend | 🟡 Moderate | Hover tooltip with the full archetype description, OR a small `?` icon next to the column header that opens a modal explaining the tier system. Recruiters won't know what these mean. |

## Visual hierarchy

- **What draws the eye first:** The huge "143" total evaluations number. ✅ Correct — that's the dashboard scale signal.
- **Reading flow:** Top → stats row (skim) → Apply-Now Queue (act) → All Evaluations (browse) → Charts (insight). This is the right order.
- **Emphasis problems:**
  - Stat card numbers (e.g., "143") are visually heavier than their labels ("TOTAL EVALUATIONS"). The labels disappear at distance. Consider lightweight label uppercase but slightly bolder (font-weight 600 instead of 400).
  - Apply-Now Queue green accent bar on left edge is good, but the **section title "Apply-Now Queue"** competes with the table header row. Two stacked left-aligned headings read as redundant — promote the section title (24–28px, weight 700) and demote the table header (12px uppercase tracked, weight 500).
  - "Score Distribution" / "Top Companies" titles at the bottom are the same weight as section titles above. Visual flatness.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Spacing between sections | Variable: ~80px between stat row and Apply-Now Queue, ~60px elsewhere. Reads as inconsistent. | Standardize section gap to 64px (Tailwind `space-y-16`). Consistent rhythm makes the whole page feel composed. |
| Border radius | Stat cards: ~12px. Tables: ~8px. Pills: ~16px (rounded-full). Buttons: ~6px. | Settle on 3 radii: `--radius-sm` (6px, buttons/inputs), `--radius` (10px, cards/tables), `--radius-pill` (9999px, pills/chips). Document in a tokens reference. |
| Score chip fill | Uses solid green background with white text. Other badges use border + tinted fill. | Either move all badges to outlined-with-tinted-fill (Linear's pattern) or commit to filled. Currently mixed. |
| Status pills "Evaluated" | Background tint doesn't read as a status — looks like a generic label. | Add a small leading dot (●) in the status color (●Evaluated, ●Applied, ●Interview, ●Offer). Pattern from Linear/Notion. |

## Accessibility (preliminary — full audit in `dashboard-accessibility-audit-2026-05-09.md`)

- **Color contrast:** Score chip (white on light green ~`#e7f5e7`) — needs verification, may fail WCAG AA at 3:1 minimum for large text. Status pill text on tinted background may also be borderline.
- **Touch targets:** Action column `Report · Apply · Verify` links are inline text — likely <44×44px. Even with the Phase 2 touch-target audit, inline link clusters need padding.
- **Text readability:** "click to expand" gray text (~`#57606a` on white) — passes for body text but is visually weak. Combined with size, easy to miss.
- **Focus states:** Not visible in screenshots — verify Tab order and visible focus ring on all interactive elements.

## What works well

- **Segmented Score Distribution chart** is the strongest single component. Reads at-a-glance, uses semantic colors with category labels underneath. Phase 2 win.
- **Top Companies horizontal bar chart** with right-aligned counts is canonical SaaS form — clean execution.
- **Token-based dark mode** is a real engineering investment that shows. Rare in personal dashboards.
- **Pill badge for queue count** ("Apply-Now Queue 25") is a nice signal that follows convention without overdoing it.
- **Sticky-dismiss for batch overlay** (just shipped) — invisible to a first-time viewer but eliminates the worst feel for the daily user.

## Priority recommendations (Phase 4 candidates, ranked impact ÷ effort)

1. **Cmd-K command palette** — Single biggest "this person ships at Linear-tier" moment. Implementation: vanilla JS keyboard listener + filtered list overlay. Items: jump to row by company/role, change status, run scan, open report, toggle dark mode. ~3 hours. **Highest leverage.**
2. **Stat card row layout fix** — Pack to 6 on one row OR redesign as a 3+3 hero with primary KPIs (Apply-Now, Total, Pipeline) larger and secondary metrics smaller. Removes the "orphaned card" tell. ~30 min.
3. **Status pill leading dot** — `●Evaluated` instead of `Evaluated`. Tiny change, large semantic clarity payoff. ~15 min.
4. **Tier badge tooltip / legend** — Add hover-tooltip with full archetype description for `A2`, `B`, etc. Recruiters don't know what these mean. ~30 min.
5. **Generated metadata cleanup** — Tighten the verbose timestamp line; full ISO behind tooltip. ~10 min.
6. **Section spacing rhythm** — Standardize all section gaps to 64px. Visual composition lifts immediately. ~15 min.
7. **Action column → icon buttons** — Convert "Report · Apply · Verify" inline text to icon buttons with hover labels. Better mobile rhythm. ~30 min.
8. **Section heading weight rebalance** — Promote section titles, demote table headers. Single-pass typography update. ~20 min.
9. **Border radius token consolidation** — 3 documented radii (`--radius-sm`, `--radius`, `--radius-pill`). ~30 min.
10. **Focus ring audit** — Verify visible focus on all interactive elements with consistent color. ~30 min.

**Bundle suggestion for a Phase 4 weekly worker run:** items 2 + 3 + 4 + 5 + 6 (~1.5 hr total — all small, all high-clarity). Items 1 (Cmd-K) and 7 (icon buttons) deserve separate runs.

---

## What NOT to add (Linear/Vercel restraint)

- **More charts.** Score Distribution + Top Companies is enough analytics for a personal ops dashboard. Don't add funnel charts, time-series, or "weekly velocity" widgets without a real reason.
- **Onboarding tour / hints.** This is a single-user tool. Skip the empty-state coaching marks.
- **Customizable dashboards / widgets.** Decision fatigue without payoff at single-user scale.
- **Notification center.** The Telegram bot already handles asynchronous alerts — don't duplicate a notification surface inside the dashboard.
- **Settings panel for cosmetic preferences.** Light/dark + sticky-dismiss state is the right ceiling. Anything more dilutes the build.

---

## What this critique deliberately does not cover

- The 4 Phase 3 items already in flight (status writeback, expand-row hierarchy, batch history, report search) — those land in PRs over the next ~30 minutes from the parallel agents.
- The mobile experience (PR #606 mobile cards + drawer covers it).
- The Cloudflare Access auth flow (it's working — `dashboard.careers-ops.com` redirects to OTP login).

---

**Recommended next step:** review PR #606 and the 4 incoming Phase 3 PRs, then pick a 5-item Phase 4 bundle from the priority list above. I can spawn a Phase 4 worker the same way the Phase 3 worker is set up.
