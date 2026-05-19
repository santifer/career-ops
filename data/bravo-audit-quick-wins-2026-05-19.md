# BRAVO — AAA Quick Wins (2026-05-19)

**Lens:** `data/mitchell-profile-for-ux-audit-2026-05-19.md`
**Walk evidence:** `data/ux-audit-walk/observations.md`
**Full audit:** `data/bravo-audit-2026-05-19.md`

These are the AAA-tier recommendations BRAVO is implementing **tonight**. Each rec lists file:line, current behavior, desired behavior, effort, and the Mitchell-lens failure mode it cures (see lens §8 for numbered modes).

| ID | Surface | Citation | Current | Desired | Effort | Lens fail-mode |
|---|---|---|---|---|---|---|
| **AAA-1** | Score popout | `lib/peer-context.mjs:319-323` | `Top 0%` rendered when `percentileInPipeline === 100`. Contradicts the body text "beats 100% of all N evaluations" + reads as worst-percentile. | When `topPct === 0`, render "Top of pipeline" (or clamp via `Math.max(1, …)`). Keep beats-X% body line unchanged — it's correct. | XS | #2 (data-unavailable / provenance / honest), #3 (what does number mean) |
| **AAA-2** | Drawer comp chip | `scripts/build-dashboard.mjs:2679` (chip render), `:6755-6760` (`.meta-chip` CSS) | `.meta-chip` is `display: inline-flex` with no wrap permission for inner text → long comp strings (e.g. `$255,000–$320,000 USD annually (range disclosed under CA/NY pay-transparency mandate; presumed base — equity and benef…`) **truncate at right drawer edge**, cutting the equity-disclosure clause — the single most important phrase in the chip. | Allow `.meta-chip-comp` (and only `-comp`, to preserve compact tier/date chips) to wrap to multiple lines: `white-space: normal; line-height: 1.4; max-width: 100%;`. The chip continues to look like a chip but wraps where text demands. | XS | #1 (comp/equity visibility), #9 (comp+equity primary filter) |
| **AAA-3** | TOP 10 by 4-yr value table | `scripts/build-dashboard.mjs:3206-3210` (markup), `:6228-6231` (`.comp-top-table` CSS) | At 1440 px viewport the Company column truncates to 1 char (`O…`) and Role wraps one word per line (`Resea / rch / Engin / eer`). Table is unreadable. Wrapper has `overflow-x:auto` but the auto-sized columns never trigger scroll because each column is collapsing. | Add per-column constraints: `Company { min-width: 130px; white-space: nowrap; }`, `Role { min-width: 220px; white-space: nowrap; text-overflow: ellipsis; }`, `Range { min-width: 110px; white-space: nowrap; }`. Now the wrapper scrolls horizontally when needed; columns hold a legible width. | S | #1 (6-sec scan), #4 (next move) |
| **AAA-4** | All Evals save-view input visible by default | `scripts/build-dashboard.mjs:11069-11077` | The `<div id="saved-view-prompt" hidden>` carries the `hidden` HTML attribute, but `.saved-view-prompt { display: flex; }` (search for class definition) overrides it — confirmed live via `getComputedStyle().display === 'flex'`. User sees a stuck "View name (max 30 chars, letters/numbers/spaces) [Save] [Cancel]" widget before opting in. | Add CSS rule `.saved-view-prompt[hidden] { display: none !important; }`. Restores `hidden` attribute as the source of truth. | XS | #2 (honest empty state), #5 (marketing/API copy leak: "letters/numbers/spaces") |
| **AAA-5** | Top of Pipe row reason text | `scripts/build-dashboard.mjs:3845` | All three rows currently read `Evaluated 22d ago — ready to apply`. After 21+ days the eval may be stale: company state shifts, JD edits, rejection cooldowns trigger. "Ready to apply" with stale provenance is misleading-confident copy. | When `age >= 21`, append a `⚠ re-verify` marker: change to `Evaluated ${age}d ago — re-verify, then apply`. For `14 ≤ age < 21`, keep current copy. Style the warning with `tp-sig-warn`-equivalent muted-amber. | S | #2 (honest empty/stale), #8 (provenance) |
| **AAA-6** | "View name" placeholder copy | `scripts/build-dashboard.mjs:11071` | `placeholder="View name (max 30 chars, letters/numbers/spaces)"` — "letters/numbers/spaces" leaks API validation language into the UI. | `placeholder="Name this view (e.g. Anthropic high-comp)"`. Validation is enforced by `maxlength=30` + JS sanitizer already; the placeholder doesn't need to encode it. | XS | #5 (marketing/API copy) |

**Reductions to AA (not AAA):**

| ID | Why downgraded |
|---|---|
| All-Evals legend `?` button affordance (1 char, 16 px) | Functional via title + click; cosmetic improvement only. Hits #3 weakly, not blockingly. |
| Sidebar nav `Pipeline / Batch Runs / Industries / Settings` no-href | False alarm — they are `<button onclick>` with title tooltips. Functional. |
| Drawer "Updated" pill no temporal scope | Code review shows it's the `draft-sync-sse` flash pill — designed to be transient, ~5 s. Still annoying when it lingers, but not load-bearing. |
| "Skip this one" vs "Look at this later" CTA pair | Real overlap, but disambiguation requires Mitchell's preference on Skip = Discard vs Snooze. Marking NEEDS_HUMAN. |
| Tonight-pick 4 CTAs | Each calls a distinct function — not redundant. Label-tighten only, AA. |
| Drawer header pager `1 of 152` vs footer `1 / 15` | Two valid views (total + apply-now subset). Label clarification: "1 of 152 (all roles)" + "1 / 15 (apply-now)" — AA. |
| Denominator reconciliation (137 / 126 / 152) across surfaces | Cross-surface, needs build-time sweep — AA. |

**NEEDS_HUMAN:**

- **Skip vs Look-at-later semantics.** Should "Skip this one" mark `Status=Discarded` permanently or just suppress for the day? Mitchell decides; BRAVO leaves both buttons in place tonight.
- **Tonight-pick CTA consolidation.** Three of the four CTAs are click-equivalents to drawer actions ("Learn more"/"Review materials"/"Pick another"). The pure 2-button version ("Open detail" + "Start apply") might be cleaner — BRAVO leaves the existing 4 since each has unique semantics; consolidation is a preference call.

**Out of scope (territory):** ZETA owns Network-leverage popout. ALPHA owns apply-pack-polish drawer. DELTA owns Editing Priority callout. Instance #3 just shipped Run Batch + Process All modals tonight — BRAVO doesn't touch those.

Signed: β BRAVO · 2026-05-19 ~00:15 PT
