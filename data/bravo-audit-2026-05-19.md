# BRAVO — Visual UX & Interaction Audit (2026-05-19)

**Auditor:** β BRAVO (Visual UX & Interaction Researcher-Implementer — Opus 4.7)
**Lens:** `data/mitchell-profile-for-ux-audit-2026-05-19.md`
**Walk evidence:** `data/ux-audit-walk/observations.md`
**Quick wins (AAA, shipped tonight):** `data/bravo-audit-quick-wins-2026-05-19.md`
**Implementation log:** `data/bravo-impl-log-2026-05-19.md`

---

## Methodology

1. Built the Mitchell-lens profile from `cv.md` / `article-digest.md` / `interview-prep/` / memory (§1–10, see lens file).
2. Live walk via Chrome MCP at `https://dashboard.careers-ops.com/` — 1440×900 viewport, 14 surfaces audited, 4 deferred to ALPHA/ZETA/DELTA/Instance#3 territory per coordination doc.
3. For every observation, located the file:line in `scripts/build-dashboard.mjs` / `lib/peer-context.mjs` and validated state via JS DOM inspection where heuristics could mislead (e.g. `<button>` vs `<a href>` sidebar; `[hidden]` attribute vs computed display).
4. Tiered findings against the Mitchell-lens 10-failure-mode rubric in lens §8.
5. **No full-7-model council fan-out per surface.** Decision documented in the deliverable: tonight's mandate is **ship AAA + AA tonight**, not a 50-rec backlog. Adversarial council deferred to B.9 against the shipped diff — that's where the council spend lands.

## Severity rubric

- **AAA** — Mitchell-lens primary-failure-mode hit + low effort (XS/S) + no territorial overlap → **ship tonight, one commit per rec**.
- **AA** — Real friction, higher effort OR secondary-failure-mode → batch-pass after AAA.
- **A** — Backlog-worthy; documented, not shipped tonight.
- **B** — Declined with rationale (not friction, or compensated elsewhere).

## Findings

### AAA — shipped tonight

See `data/bravo-audit-quick-wins-2026-05-19.md` for the AAA-1 through AAA-6 table with citations + diffs. Implementation log at `data/bravo-impl-log-2026-05-19.md` records commit SHAs as each lands.

### AA — batch pass tonight after AAA

| ID | Surface | Citation | Issue | Fix |
|---|---|---|---|---|
| AA-1 | Tier-legend `?` buttons | `scripts/build-dashboard.mjs:11035, 11038, 11118, 11121` | 16-px `?` buttons next to Company / Equity column headers; affordance is subtle. | Boost the `?` button to a `cursor:help` + faint border + tighter copy via title attribute. Add a small "what these columns mean" link in the table caption. |
| AA-2 | Drawer header pager | drawer header rendering | `← Anthropic | 2 of 152 | Perplexity →` AND footer `2 / 15` — same role, two different denominators (152 = total tracked, 15 = apply-now subset), no labels. | Label each: header `2 of 152 (all)` + footer `2 / 15 (apply-now)`. |
| AA-3 | "Apply now" pill on tonight-pick | `scripts/build-dashboard.mjs:11008` | Status chip reads "Apply now" right next to `Start tonight's apply →` button. Reads as duplicated CTA. | Change pill to read "Ready" or "Top pick" so the button stays the single CTA. |
| AA-4 | TOTAL EVALUATIONS "−47 vs last week" | KPI tile renderer | Big red delta with no provenance — implies catastrophic drop without context. | Add a `title` attribute + `?` micro-affordance explaining: "Triage purge removed 47 stale Discarded rows on 2026-05-15" OR "Snapshot delta — base count changes due to dedup". |
| AA-5 | Mission-control denominator reconciliation | top strip + score popout + KPI | "36 eval · 0 applied" (top strip) / "137 total" (KPI) / "126 evaluated roles" (score popout) / "152 tracked" (drawer pager) — 4 different role-counts, same noun. | Single denominator-source in build, add `?` tooltip explaining which scope each represents. |
| AA-6 | Drawer "Updated" pill | drawer header (SSE flash) | The transient `Updated` pill (draft-sync-sse) is undifferentiated from a permanent "row was recently re-scored" label. Reads as ambient noise. | Either (a) make the SSE flash pill text-only ("draft synced") and auto-hide in 3s, or (b) add a distinct permanent "Re-scored 2026-05-16" badge to show the last-eval date. |

### A — backlog (documented, not shipped tonight)

- **Sidebar `Pipeline / Batch Runs / Industries / Settings` use `<button>` instead of `<a href>`.** No clickable href → no middle-click/right-click-open-in-new-tab. AA-worthy but each opens a modal so the URL semantic is debatable.
- **`Apply-Now Queue` table HEALTH / PEOPLE columns** have `title=` hover-tooltips but no visible legend chip. Touch-device hostile. Could add a small `?` next to each like Company/Equity already have.
- **LOCATION emoji inconsistency** (`🏠 Remote`, `🌐 Hybrid`, `📍 Unknown`, sometimes `✈`). Standardize emoji set + document.
- **"Recent updates" sidebar entries** text-clip at "Completed Anthropic Skill Builder…" — could fit if line-height tightened.
- **Top-of-Pipe X-to-dismiss** — need to verify dismissal-respect across SSE polls (Mitchell memory entry exists on this).
- **Score popout `Source: pipeline.`** — trailing period inside `<code>` looks like an artifact. Strip the period.

### B — declined

- **"Scanned Cohere · 1 new role · 2d ago"** mission-control line. *Looks* dense but each piece is independently valuable (scan recency / new-role count / age). Not friction.
- **The 4-CTA drawer footer (Apply / Generate apply pack / Skip this one / Look at this later).** All four are functionally distinct. Mitchell-lens "decision fatigue" applies WEAKLY because each maps to a different downstream verb. Label tighten (Skip-vs-Later semantics) is NEEDS_HUMAN, not BRAVO-decline.
- **Outreach banner "▾ ×".** It's a standard expand/close affordance; user can dismiss. The dismissal-respect concern is shifted to A-tier verification (test, then escalate if broken).

## Deferred — not BRAVO territory tonight

| Surface | Owner | Why deferred |
|---|---|---|
| Network-leverage drillIn (`_drillInRegister('network-leverage', …)` ~14755) | ZETA | Will be replaced by ZETA's network-database UI tonight |
| Apply-pack drawer "Polish pack ✨" surface | ALPHA | Apply-pack-polish agent + button wiring tonight |
| Editing Priority callout (AI-detection) | DELTA | DELTA P1 work tonight |
| Run Batch + Process All modals | Instance #3 | Shipped tonight in commits `6f44a6e` + `4a04f4f` |

## What BRAVO will NOT do tonight

- No "polish the visual design" recs. Every claim has a file:line.
- No additive features that aren't curing a Mitchell-lens fail mode.
- No `<= 5 word` recommendation labels without a current/desired diff.
- No half-implementations. Each AAA either ships with a commit SHA OR a NEEDS_HUMAN flag with a 60-second-readable rationale.

Signed: β BRAVO · 2026-05-19 ~00:20 PT
