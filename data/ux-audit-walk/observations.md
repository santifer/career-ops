# BRAVO — Dashboard UX walk observations (2026-05-19, 1440×900 viewport)

**Surface URL:** https://dashboard.careers-ops.com/
**Walk method:** Chrome MCP — navigate + scroll + JS DOM inspection + screenshots
**Lens:** `data/mitchell-profile-for-ux-audit-2026-05-19.md`
**Doc height:** 4544px (single-page Overview), 152 total evaluated rows, 5 KPI tiles, 9 sidebar links, 2561 `data-drill` elements, 19 modal-marked containers, 1333 chip-class elements (extreme drill-in density).

Note on coverage: live walk produced this observation set. Subsequent council/dealbreaker passes (`B.3` / `B.4`) collapsed into the lens-driven heuristic audit at `data/bravo-audit-2026-05-19.md` because tonight's mandate is "ship AAA + AA implementations, not pile up 50 unactioned recs". The adversarial sweep happens in `B.9` against shipped commits — that's where the council spend earns its keep.

---

## Surface 1 — Sidebar (left persistent nav)

**File:line:** `scripts/build-dashboard.mjs:4807–5000` (`/* ── Persistent left sidebar nav (Phase 7 Item 4) */` CSS), nav links rendered as `<a class="sidebar-link" href="#…">`.

- 9 links visible: Overview · Apply-Now · All Evaluations · Trends · Companies · Pipeline · Batch Runs · Industries · Settings.
- **Overview, Apply-Now, All Evaluations, Trends, Companies have valid `href="#…"` anchors.**
- **Pipeline, Batch Runs, Industries, Settings have NO href attribute** (confirmed via JS: `href:null`) — dead clicks unless they're handled by JS click delegation. *Mitchell-lens failure mode #4: clear next moves.* A user expecting Settings page gets nothing.
- Top "+ Add update" button in sidebar — what does it open? Not labelled with hint.
- "Recent updates" feed with ellipsized first lines — title cuts at "Completed Anthropic Skill Builder…" — text could fit if line-height tighter.
- "⚡ Done…" at very bottom of sidebar — minimized widget? Ambiguous.
- "RUNWAY · CRITICAL ▾ — What does this mean? →" — collapsed widget. *Good UX*: the "What does this mean? →" CTA is exactly the kind of explanatory anchor Mitchell-lens prefers.

## Surface 2 — Top strip (mission control + outreach banner)

**File:line:** `scripts/build-dashboard.mjs:~1337` (`/* Mission-control header strip, matching the dashboard's hero look */`).

- Outreach banner: `🔔 OUTREACH 2 due today ▾ ×` — clickable expand + close. **Verify the × respects dismissal across SSE polls** (Mitchell-lens dismissal-respect test — there is a memory entry about this specifically).
- Mission-control items: "Scanned Cohere · 1 new role · 2d ago · No batch running · 0 jobs · all healthy · 36 eval · 0 applied"
- **"36 eval · 0 applied"** — chip → which 36? Out of 152 total? Out of 137 KPI? Inconsistent denominator.
- Search box "Search… ⌘K" + "+ Add role" + "🌒 Light" toggle.

## Surface 3 — TRACKED chip row + APPLY-NOW chip row

**File:line:** `scripts/build-dashboard.mjs:~3414` (`// ── Contacts directory (2026-05-18 sidebar add) ──`) — these are top-level toolbar chips.

- "TRACKED 96 companies · 2515 scanned · 0 batches" — what's "2515 scanned"? Roles scanned vs evaluated? *Failure mode #6: acronym test* — borderline; "scanned" is okay but the relationship to 137 evals + 152 rows + 36 in mission-control is unclear.
- "APPLY-NOW 15 ≥4.0 / 2 ≥$250K" — are the 2 high-comp roles a subset of the 15? Unclear.
- "Updated 23:36 PT · 0 reports today" — what's a "report"? *Failure mode #6.*

## Surface 4 — TOP OF YOUR PIPE — RIGHT NOW

**File:line:** rendered near `scripts/build-dashboard.mjs:3908` (cap-at-3 comment); section heading "↑ TOP OF YOUR PIPE — RIGHT NOW".

- 3 rows displayed: Pinecone (Staff Developer Advocate), Anthropic (Communications Lead, Claude Code), Anthropic (Engineering Editorial Lead).
- All three are tagged **"Evaluated 21d ago — ready to apply"** or **"Evaluated 22d ago — ready to apply"**.
- *Mitchell-lens failure mode #2 + #8:* 21–22d-old eval is **stale**. Score may not reflect current company state, recent rejections, or shifted JD. The "ready to apply" affordance reads confidently but the date undermines it. A trustworthy version would say "Evaluated 22d ago · ⚠ re-verify before apply" OR auto-re-rank by score×freshness.
- Each row has an X to dismiss. Same dismissal-respect concern as Surface 2.

## Surface 5 — Hero "READY TO APPLY · SCORE 4.0 OR ABOVE"

- Big green "15" + "+3 vs last 7d" delta pill.
- Sparkline behind (`heroSparklineSVG()` @ `scripts/build-dashboard.mjs:2238`).
- *Mitchell-lens win:* clear, single metric, change pill. ✓
- *Small hit:* no click-to-drill behavior on the 15 — can't see which 15 rows from here. Has to scroll to the Apply-Now table.

## Surface 6 — 5 KPI tiles

All five tiles below the hero:

| Tile | Reading | Friction |
|---|---|---|
| TOTAL EVALUATIONS | 137 / −47 vs last week | "−47" reads catastrophic w/o context — last week was a triage purge or an artifact of recent re-categorization? *Failure mode #2: provenance.* No "why is it down" hint. |
| PIPELINE PENDING | 15 — snapshot | What's "snapshot" mean inline? Is it the count or the qualifier? |
| Q3 2026 · DAYS LEFT | 134 · ~0.11 apps/day | Quarter goal context implicit. "~0.11 apps/day" — is that good or bad? *Failure mode #3.* |
| NETWORK | 2.8k · 7 warm · 6 w/ email | **ZETA territory** — defer. |
| APPLIED / IN PROCESS | 0 · ±0 vs last week | Honest. ✓ |

The TOTAL EVALUATIONS "−47" deserves Mitchell-lens scrutiny: a 47-eval drop in one week with no explanation is the kind of confident-but-wrong number that erodes trust.

## Surface 7 — "BEST ROLE TO APPLY TO TONIGHT" hero (apply-now landing)

**File:line:** rendered via `_tonightPickRender` (search), heading "BEST ROLE TO APPLY TO TONIGHT" + "Apply now" chip.

- Row: Anthropic — Communications Lead, Claude Code · 4.6 · "Apply now" green pill.
- "4 gaps →" chip (clickable, modal/popout opens).
- Long comp line: "$255,000 USD (single number, not a range — likely base; equity + benefits not disclosed in JD)" — *information-dense but reads like an analyst footnote, not a chip.*
- Location chip: "Hybrid — SF office 25% minimum".
- 3-line coaching paragraph: "Sell senior without overstatement: 'Communications Lead' in current title (xGE) is the strongest framing — match it lexically in summary · Lead with the audience-density angle: 1,000+ L8-L10 engineers is bigger and more technical than most external-facing comms operations".
- **4 CTAs side-by-side:** Start tonight's apply → · Learn more · Review materials → · Pick another. *Mitchell-lens fail mode #4 + decision fatigue.*
  - "Start tonight's apply →" vs "Apply now" pill in top right — REDUNDANT.
  - "Learn more" vs "Review materials →" — overlapping intent.

## Surface 8 — Apply-Now Queue table

**File:line:** rendered as table starting "Score ≥ 4.0 · Evaluated / Responded / Interview only".

Columns: SCORE · BASE · COMPANY (`?` tooltip) · ROLE · STATUS · EQUITY (`?` tooltip) · LOCATION · HEALTH · PEOPLE · EVAL DATE.

- **HEALTH column** values like `2/5`, `3/5`, `—` — meaning **NOT documented inline**. No `?` tooltip. Mitchell-lens failure mode #3 + #6. Could be company health / engagement signal / something else.
- **PEOPLE column** values like `🏆36` / `🏆36 ⚠` / `🏆8` / `⚠ 1` / `🏆3` — trophy or champion icon + integer + sometimes ⚠. **Meaning NOT documented inline.** Looks like warm-path or signal count but unclear.
- **EQUITY column** "Pre-IPO Late" / "Pre-IPO C/D" / "—" — what's C/D? Series-C/D round? The `?` tooltip in header should resolve, but Mitchell shouldn't need to hover.
- **LOCATION column** uses inconsistent emojis: `🏠 Remote (NYC)`, `🏠 Remote (Unkr…)`, `🌐 Hybrid (NYC)`, `🌐 Hybrid (SF)✈`, `📍 Unknown✈`, `🌐 Hybrid (Seattle…)`, `🌐 Hybrid (Unsp…)` — the airplane emoji's purpose is opaque (travel required? relocation expected?).
- COMPANY chip shows tier letter `B / A2 / A1 / B` — archetype-tag. Resolved on hover, presumably, but again first-time reader gets nothing.
- Table reads dense but has no inline legend. Even a small "?" "what these columns mean" hover-target above would help.

## Surface 9 — All Evaluations table

**File:line:** rendered below Apply-Now. Has additional filter + saved-view bar at top.

- **Filter bar visible by default:** `Search company, role, gaps, stories, recommendation...` + `All tiers` · `All scores` · `All statuses` · `All equity stages` dropdowns. ✓ Good.
- **BUT also visible by default:** a `View name (max 30 chars, letters/numbers/spaces)` text input + `Save` / `Cancel` buttons. This is a "save-this-view" UI surfaced **before** the user has expressed intent to save. Looks like a stuck/orphan edit-mode. *Mitchell-lens failure mode #2.*
- Extra columns: AGE (color-coded — red for stale, gray for fresh) ✓, ACTION (kebab `⋮`) — kebab content not yet inspected.
- "View name (max 30 chars, letters/numbers/spaces)" — *failure mode #5: marketing/API copy.* "letters/numbers/spaces" reads like API validation error text leaking into the UI placeholder.

## Surface 10 — Companies bar chart + Trends + Pipeline funnel + Comp ranges

- Companies bar chart: clean. Top: Cognition 4, Palantir 3, Adobe 3, Stripe 3, Amazon 3, Modal 3, ElevenLabs 3.
- Trends: "Apps / week (last 12w · 137 total)" + "Avg score / week (last 12w · 0–5 scale)". Both render. ✓
- Pipeline funnel begins. (Not deeply audited tonight.)
- Comp ranges: `$250-300K (9) · $300-350K (4) · $350-400K (0) · $400-500K (1) · $500K+ (0)` — bar chart, clean.

## Surface 11 — TOP 10 BY 4-YEAR VALUE table  🔴 BROKEN AT 1440px

**File:line:** rendered around "TOP 10 BY 4-YEAR VALUE" heading.

- Columns: COMPANY · ROLE · RANGE · 4YR EST. · STAGE.
- **At 1440px viewport, COMPANY column is truncated to 1 letter** — `O…` / `D…` / `O…`.
- **ROLE column wraps one-word-per-line:** "Resea / rch / Engin / eer, / Appli / ed AI / Engin / eerin / g".
- **This makes the entire table unreadable** at the user's most common viewport.
- *Mitchell-lens failure mode #1 + #4:* a hiring-system table with no visible company name fails the 6-second scan AND the next-move test.

## Surface 12 — Right-rail drawer (row click → drawer)

**File:line:** drawer markup near `scripts/build-dashboard.mjs:2679–3033` (drawer body), CTAs near `:3033` (`drawer-slash-cmds`).

Header block: `Logo + Company + B chip + Role →` · Score chip · Status pill · `Why X.X? <reason>` · `Updated` pill · `× close`.

Findings:
- **"Why 4.6? No gate data in report"** (Editorial Lead) vs **"Why 4.6? 1 soft gap"** (Comms Lead) — second is informative, first is cryptic. When `report.gates` is empty the message reads like a warning when it might just be a missing artifact.
- **"Updated" pill** floats with no temporal context. *Provenance fail.* It should say "Updated 2d ago" or "Re-scored 2026-05-16" — that data IS in the body (Phase E re-evaluation date) so the chip should expose it.
- **Cooldown callout:** `🛑 Cooldown until 2026-06-03 — 3 prior rejections. Override if you have a recruiter ask or internal referral. Why? →` ← **strong** Mitchell-lens win. ✓ But "Override" is plain body text, not a button. *Failure mode #4.*
- **"WHY THIS SCORE  ▸ EXPLORE"** — section with bullet points. Good. ✓ The "EXPLORE" CTA is a nice affordance.
- **Comp chip** in drawer:
  - When text is short (~80 chars): renders fully. ✓
  - When text is long (~140 chars, e.g. Editorial Lead with $255,000–$320,000 range): **TRUNCATES** at right drawer edge. Cuts off "equity and benef…" — the most important phrase, the one declaring whether equity is or isn't disclosed.
  - This is a fixed-height / `text-overflow: ellipsis` failure on a 1-line container that should be 2-3 line max. *AAA fix.*
- **Header pager `← Anthropic | 2 of 152 | Perplexity →`** AND **footer pager `2 / 15`** — TWO different paginations. 152 = total tracked, 15 = Apply-Now subset. Both are valid views but the UI offers no label to distinguish. Mitchell-lens failure: ambiguity.
- **4 sticky CTAs at drawer bottom:** Apply (green) · Generate apply pack · Skip this one · Look at this later.
  - "Skip this one" + "Look at this later" overlap. Both mean "not now." If Skip = permanently No (Discarded) and Later = backlog (Snoozed), the labels should say so.
  - Mitchell-lens decision-pattern: he wants speed without ambiguity here.
- **Prev/Next footer** repeats Anthropic→ in both directions when there's only one record between paging boundaries. Cosmetic, low priority.

## Surface 13 — Score popout (click 4.6 score chip)

**File:line:** popout registered via `_drillInRegister('score', …)` (grep `score-context-popout` etc.).

Title: "Score context: 4.5+".

- **"Top 0% of 126 evaluated roles"** ← **GRADE-A confidence-but-wrong number.** Mathematically the top 0% IS the highest, but to a human reader "top 0%" reads as "0 percentile" = worst. The body text "This role's score beats 100% of all 126 evaluations" is the *correct* framing — the headline contradicts.
- **126 here vs 137 KPI vs 152 rows** — three different denominators surfaced across the dashboard.
- "Source: pipeline." inside a `<code>` chip with a trailing period — odd formatting.
- The "Companies with similar scores" table is clean. ✓
- *AAA fix:* change "Top 0%" to either "Top of pipeline" or "Top 1%" (always round up off zero) and reconcile the denominator.

## Surface 14 — Gap chip popout (click `4 gaps →`)

**File:line:** rendered via `_drillInRegister('gap', …)` (around `scripts/build-dashboard.mjs:2802–2832`).

Note: clicking the gap chip in tonight-pick context **also opened the drawer for that row**, which feels like an event-propagation overlap. Confirmed by JS: `event.stopPropagation()` IS in the chip onclick, but the gap modal logic appears to ALSO open the drawer. *Worth investigating; likely small fix.* See `scripts/build-dashboard.mjs:2828–2832` for the dual-handler chain.

## Surface 15 — Modals (Run Batch / Process All)

🛑 **DEFERRED — Instance #3 / coordination-doc territory.** Commits `6f44a6e` + `4a04f4f` just shipped tonight's pipeline-modal decomp + companies-filter. Not BRAVO scope.

## Surface 16 — Network leverage popout

🛑 **DEFERRED — ZETA territory** (`_drillInRegister('network-leverage', …)` @ `scripts/build-dashboard.mjs:~14755`).

## Surface 17 — Apply-pack drawer "Polish pack ✨"

🛑 **DEFERRED — ALPHA territory** (apply-pack-polish agent + drawer surface).

## Surface 18 — Editing Priority badge (drawer)

🛑 **DEFERRED — DELTA territory** (AI-detection callout).

---

## Top-15 Mitchell-lens hits (prioritized — feeds the audit)

| # | Surface | Hit | Failure mode # |
|---|---|---|---|
| 1 | Drawer comp chip | Truncates equity-disclosure text on rows with long comp string | #1, #9 |
| 2 | Score popout | "Top 0% of 126" reads as worst-percentile; conflicts with "beats 100%" body text | #2 |
| 3 | "BEST ROLE" hero | 4 redundant CTAs (Start / Learn / Review / Pick) + redundant "Apply now" pill | #4, #10 |
| 4 | Sidebar nav | Pipeline / Batch Runs / Industries / Settings have NO `href` — dead clicks | #4 |
| 5 | TOP 10 BY 4-YEAR VALUE | Table BROKEN at 1440px — company → 1 char, role → 1 word/line | #1, #4 |
| 6 | TOP OF YOUR PIPE | All 3 rows are 21–22d stale — no freshness warning | #2, #8 |
| 7 | All Evals table | "View name" save-input visible by default + "letters/numbers/spaces" API-copy | #5 |
| 8 | Drawer | "Updated" pill has no timestamp / scope | #2, #8 |
| 9 | Drawer | "Why X.X? No gate data in report" — cryptic when gates absent | #6 |
| 10 | Apply-Now table | HEALTH / PEOPLE / EQUITY columns no inline legend; emoji-inconsistent locations | #3, #6 |
| 11 | KPI tile | TOTAL EVALUATIONS "−47 vs last week" has no provenance | #2 |
| 12 | Cooldown callout | "Override" is body text — could be button | #4 |
| 13 | Drawer CTAs | "Skip this one" vs "Look at this later" — meanings overlap | #4 |
| 14 | Drawer | Header pager `1 of 152` vs footer `1 / 15` — two pagings unlabelled | #6 |
| 15 | Mission-control denominators | 36 / 137 / 126 / 152 across surfaces — same role-count thing, four numbers | #2, #6 |

**Total surfaces audited:** 14 (4 deferred).
**Council pass:** scoped to lens-driven heuristics tonight + adversarial council at B.9 to break the shipped diff. The dealbreaker tiering happens in `data/bravo-audit-2026-05-19.md` next.

Signed: β BRAVO · 2026-05-19 ~00:00 PT
