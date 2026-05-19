# BRAVO — Adversarial self-review (2026-05-19)

**Method:** Single-instance adversarial sweep. Per the brief's quality-maximization charter, the council fan-out was reserved for novel architectural questions; my AAA/AA tonight were small surgical fixes (CSS, copy, validation logic) whose load-bearing risk is reading the diff for unintended side effects. Full council adversarial sweep would burn ~$20-30 for marginal signal on changes of this size — the better adversarial play here is a tough self-review that interrogates each fix against the Mitchell-lens edge cases, then either fixes or flags.

**Adversarial prompt I held against myself:** "For each AAA + AA rec BRAVO actioned tonight: (1) does the implementation actually solve the surfaced problem, or just paper over it? (2) did the implementation introduce a new friction? (3) is there a Mitchell-lens edge case the rec missed?"

---

## AAA-1 — Score popout "Top 0%" → "Top of pipeline"

**Commit:** `c829bfd` · `lib/peer-context.mjs:317-340`

| Question | Verdict |
|---|---|
| Solve or paper over? | **Solve.** Mathematically `topPct === 0` only fires when `percentileInPipeline === 100` (this role beats 100% of the pipeline). Showing "Top of pipeline" is semantically correct AND non-contradictory with the body line "beats 100% of all N evaluations". |
| New friction? | None. The change preserves the body-line provenance + source-chip. Headline is now coherent. |
| Edge case missed? | The old label included the count (`Top X% of N evaluated roles`); the new "Top of pipeline" label drops it. **Edge case:** a screen-reader user gets less context in the lede. **Verdict:** mitigated — the body line still says "of all N evaluations" so the count is preserved one line below. Not actionable tonight. |

**Result:** Ship-clean.

## AAA-2 — Drawer comp chip wrap + data-layer slice raise

**Commits:** `aaa3840` (CSS) + `e14742f` (source slice 120→240) · `scripts/build-dashboard.mjs:6761-6770` + `:1502`

| Question | Verdict |
|---|---|
| Solve or paper over? | **Solve.** Two layers fixed: (a) CSS now allows the chip to wrap to multiple lines via `white-space: normal + max-width: 100%`, (b) source `getComp()` no longer chops the cell at 120 chars. Verified live: full string `"$255,000 – $320,000 USD annually (range disclosed under CA/NY pay-transparency mandate; presumed base — equity and benefits not detailed in JD body)"` displays without truncation. |
| New friction? | The chip is now 2-line tall (~35 px) instead of 1-line (~20 px). Tighter than the single-line look. **Mitigation:** I scoped the wrap rule to `.meta-chip-comp` ONLY — tier + date chips stay compact, so the chip-row's overall rhythm holds. Verified live: row reads cleanly. |
| Edge case missed? | What if a comp string exceeds 240 chars? It still gets truncated upstream. **Verdict:** 240 chars covers every realistic Block A cell I've seen; bumping to "unlimited" would risk pathological inputs (e.g. parser regression dumping a whole table cell into the string). **Not actionable tonight.** Mitchell can raise to 360 if a future role has a longer comp prose. |

**Result:** Ship-clean. *Worth noting:* I discovered the slice cap only during post-implementation verification — the CSS-only fix would have looked OK in dev but still truncated content from real data. Catching it required clicking through to the actual Editorial Lead row in production data; that's exactly the kind of verification the brief mandates.

## AAA-3 — TOP 10 by 4-year value table column widths

**Commit:** `295cbb3` · `scripts/build-dashboard.mjs:6232-6241`

| Question | Verdict |
|---|---|
| Solve or paper over? | **Solve.** Without the per-column constraint, the auto-sized columns collapsed to absurd widths (Company 1 char, Role 1 word/line). Min-widths force legible widths and the `overflow-x: auto` wrapper handles horizontal scroll on narrow viewports. |
| New friction? | Horizontal scroll on viewports <650 px (the sum of min-widths). **Mitigation:** existing `.comp-top-scroll { overflow-x: auto }` already supports this — no new behavior, just no longer hidden because the table can now exceed wrapper width. |
| Edge case missed? | Mobile (480 px viewport) — table now scrolls horizontally where before it just rendered illegibly. *Net positive.* Touch swipe to scroll is a known interaction. |

**Result:** Ship-clean.

## AAA-4 — Saved-view-prompt honors `[hidden]`

**Commits:** `a3869f9` (CSS) + fix `91b5341` (backtick-in-CSS-comment parse) · `scripts/build-dashboard.mjs:6643-6647`

| Question | Verdict |
|---|---|
| Solve or paper over? | **Solve.** The `[hidden]` attribute selector with `!important` correctly trumps the prior `display: flex` rule. Verified live: `getComputedStyle().display === 'none'` post-fix. |
| New friction? | None. `openSaveViewPrompt()` (line 16784) removes `hidden`, `cancelSaveView()` re-adds it — both paths work with the new CSS. |
| Edge case missed? | The fix-up commit (`91b5341`) was a real lesson — I put backticks inside a CSS comment that lives inside a JS template literal, breaking the parse. **The lesson:** template-literal-embedded CSS comments cannot contain backticks. The fix-up replaced them with plain ASCII. *Worth noting in the impl log so the next agent doesn't repeat the trip.* |

**Result:** Ship-clean. Process learning captured in the impl log.

## AAA-5 — Top of Pipe 21d+ stale eval shows amber re-verify

**Commit:** `c9a4d40` · `scripts/build-dashboard.mjs:3882, 3891, 15521, 24021-24024`

| Question | Verdict |
|---|---|
| Solve or paper over? | **Solve.** Three-layer wiring verified: (a) source emits `reasonType: 'stale-eval-warn'` for age ≥ 21d, (b) `reasonClass()` maps it to `reason-warn`, (c) CSS class colors the chip amber. Live: all three currently-displayed rows (21d, 22d, 22d) render in amber. |
| New friction? | A row at exactly 21d will toggle from green to amber overnight. The threshold is a hard edge. **Mitigation:** the 14–20d band keeps the green "ready to apply" — Mitchell still gets a head's-up before the amber lands. Some users prefer gradient color (green → yellow → red) over hard threshold; I chose hard threshold here because it produces a clear "is this stale?" answer instead of "how stale is this?" |
| Edge case missed? | What if a row hits 90+ days and remains in Top of Pipe? It still shows amber re-verify — same as 21d. **Honest call:** at 60d+ the lens probably wants "re-verify OR archive — this is functionally cold." That's a follow-up tier. Not actionable tonight. |

**Result:** Ship-clean.

## AAA-6 — Saved-view placeholder copy

**Commit:** `3a09e5d` · `scripts/build-dashboard.mjs:11072`

| Question | Verdict |
|---|---|
| Solve or paper over? | **Solve.** "letters/numbers/spaces" was leaking API-validation language. New placeholder gives a concrete example (`Anthropic high-comp`). |
| New friction? | None — `maxlength=30` HTML attribute still enforces the bound. JS sanitizer runs on submit. |
| Edge case missed? | A user could type characters that fail the sanitizer (e.g. emoji). The current `saved-view-error` element shows the validation error. **Verdict:** mitigated by existing infrastructure. |

**Result:** Ship-clean.

## AA-1 — Tier-legend ? button 16→18 px

**Commit:** `a218223` · `scripts/build-dashboard.mjs:6442-6457`

| Question | Verdict |
|---|---|
| Solve or paper over? | **Borderline.** Bumping size 2 px doesn't transform the affordance from "easy to miss" to "obvious"; it's incremental. But combined with the blue border + `cursor:help`, the button reads as "I am clickable info" more clearly than before. |
| New friction? | None — same click behavior, slightly more visual weight. |
| Edge case missed? | The button competes for visual attention with the sort arrows next to it. **Mitigation:** sort arrow is single-character `↕`, button is `?` with circular border — distinct visual treatments. |

**Result:** Ship-clean, but accept this is an incremental improvement, not a transformation. The deeper fix would be a "what these columns mean" caption above the table — left as A-tier backlog.

## AA-3 — Tonight-pick pill "Apply now" → "Top pick"

**Commit:** `32cd8f7` · `scripts/build-dashboard.mjs:11008`

| Question | Verdict |
|---|---|
| Solve or paper over? | **Solve.** The pill no longer mirrors the green "Start tonight's apply →" CTA. Verified live: pill reads "Top pick". |
| New friction? | None. "Top pick" is plain English. |
| Edge case missed? | A user could read "Top pick" as a button. Currently it's a span, not a button. **Mitigation:** the title attribute clarifies it's status not CTA. Not actionable tonight. |

**Result:** Ship-clean.

## AA-4 — `deltaIndicator()` hover-provenance

**Commit:** `43668f0` · `scripts/build-dashboard.mjs:2230-2243`

| Question | Verdict |
|---|---|
| Solve or paper over? | **Mostly solve.** The tooltip explains what causes the delta — Mitchell hovers, gets context, no longer reads "−47 vs last week" as catastrophic-unexplained. |
| New friction? | Touch-device users don't see hover tooltips. **Mitigation:** this is a known platform limitation; the visible number still gives signal even without the tooltip context. |
| Edge case missed? | The tooltip says "open the tile for a row-by-row breakdown" but the actual row-by-row drill-in surface depends on the tile. Total Evaluations tile click goes to `toggleStatPanel('evaluations')` — that DOES show the row list. ✓ |

**Result:** Ship-clean. AA-4 is a meaningful improvement; the deeper fix (visible-by-default provenance chip) is A-tier backlog.

## Adversarial findings that were actionable tonight

**1 found, 1 fixed:**

- **The AAA-2 data-layer truncation discovered post-merge.** The CSS fix alone left users seeing "...equity and benef" because `getComp()` was slicing the source to 120 chars. I shipped a follow-up commit (`e14742f`) raising the slice to 240 chars. Caught only because I clicked through to the actual Editorial Lead drawer with real data. This is the kind of catch the brief intends — verify shipped code against real content, not just dev assumptions.

## Adversarial findings flagged but not actioned tonight

| Finding | Why deferred |
|---|---|
| 60d+ stale rows in Top of Pipe still amber re-verify (could be "re-verify OR archive — functionally cold") | Threshold question; Mitchell decides whether to add a third tier. A-tier backlog. |
| 240-char comp slice still has an upper bound | 240 covers every realistic input; raising further risks pathological dumps. Mitchell can revisit if a future role has a longer comp prose. |
| Tier-legend `?` is still a small affordance | Real fix is a "what these columns mean" caption — A-tier. |
| Touch-device users can't see AA-4 hover tooltips | Platform limitation; visible-by-default provenance chip is A-tier. |
| AA-2 drawer pager labels — `1 of 152` (header) vs `1 / 15` (footer) — not fixed tonight | Render source not surfaced via grep; needed Mitchell's preference on dual-paging intent. NEEDS_HUMAN. |

## Process learning (for next BRAVO run)

1. **Verify against real production data, not dev nulls.** The worktree had no real data, so the CSS-only AAA-2 looked fine in unit-level inspection. The truncation only surfaced after merge + real data render. Lesson: post-merge verification is the safety net, not optional polish.
2. **Template-literal-embedded CSS comments cannot contain backticks.** Burned one commit + fix-up. The agent-commit helper happily commits broken parses — `node --check` BEFORE committing catches this in 100 ms; always run it.
3. **`<button onclick>` and `<a href>` are both clickable affordances.** My initial heuristic `href:null === dead click` would have over-flagged 4 sidebar items. Verifying with the DOM ahead of an audit recommendation saved a false-positive in the audit report.

Signed: β BRAVO · 2026-05-19 ~00:30 PT
