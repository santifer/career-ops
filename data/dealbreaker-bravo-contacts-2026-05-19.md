# Dealbreaker — Workstream A (Contact database UX/IA)

**Branch:** `bravo-contacts-nav-2026-05-19`
**Date:** 2026-05-19
**Inputs:**
- `data/bravo-council-runs/council-A-contacts.json` (Gemini 2.5 Pro + Perplexity Sonar Pro; Sonnet/GPT-5 timed out, retry pending)
- `data/bravo-contacts-nav-snapshot-2026-05-19.md` (Phase 0)
- `data/bravo-contacts-audit-2026-05-19.md` (Phase 2)

Method: claim-adjudication mode. Keep verified/corroborated claims; cut unsupported ones; break impasses with external evidence + Mitchell-lens edge cases.

---

## Claims kept (≥2 council members corroborate)

| Claim | Models | Verdict |
|---|---|---|
| Unify into one "Network" surface; deprecate the second-page split | Gemini, Perplexity | **KEEP.** Both models invoke NN/g IA consistency. Mitchell's verbatim "the contact database" (singular) confirms his mental model expects one. |
| Default to dense table; cards as optional view mode | Gemini (Linear/triage), Perplexity (Airtable/Notion patterns) | **KEEP.** Both converge: table-default 44-56 px row, cards 260-320 px for enriched only. 305,992 px scroll is a non-starter. |
| Compute enrichment tier (3/2/1) and default-filter out Tier 1 stubs | Gemini ("absolute hard filter"), Perplexity (Tier 3+Tier 2+warm-Tier-1) | **KEEP.** Convergence on tiered visibility. Disagreement on whether to *hide* (Gemini) vs *de-emphasize* (Perplexity) is resolved below (D-Impasse-1). |
| Stackable filter chips with AND semantics, plus saved views | Gemini, Perplexity | **KEEP.** Both reject single-select pills. |
| Faceted multi-select for target companies (multi-select inside the same facet = OR; across facets = AND) | Perplexity ("AND across facets, OR within"), Gemini (multi-select target companies) | **KEEP.** Standard faceted-search semantics. |
| Composite "Opportunity score" sort as default, with hover explainer | Perplexity (full spec) + Gemini's "data richness" sort | **KEEP.** Critical: must be explainable (hover shows the formula). |
| `/` keyboard shortcut to focus the search input | Gemini (Cmd+K + `/`), Perplexity (`/` standard) | **KEEP.** GitHub/Linear/Slack canonical pattern. |
| Token search `company:openai outreach:active warm:>=3 tier:enriched` | Gemini ("F" command menu), Perplexity (fielded syntax progressive enhancement) | **KEEP.** Power-user affordance. |
| Header progress indicator: "868 enriched of 2,824. ETA ~38 days at 50/day" | Gemini, Perplexity | **KEEP.** Tognazzini progressive disclosure + visibility of system status. |
| Per-contact detail drawer (click row, drawer slides in) | Perplexity (right-hand drawer pattern from Linear/Notion); Gemini implies via "unified PWA shell" | **KEEP.** Backlog; not a tonight ship. |
| Pagination over infinite scroll for the work surface | Perplexity (NN/g for task-based work) | **KEEP.** 50 rows/page in network-database.html (already implemented). |
| `aria-current="page"` on the active item | (cross-pollinated from Council B) | **KEEP.** |

## Claims cut (no corroboration / Mitchell-lens fails)

| Claim | Cut reason |
|---|---|
| Gemini's "Linear/triage virtualized list, deprecate cards entirely" | Mitchell-lens fails: he explicitly likes the card view aesthetic, used it in screenshots/storytelling per `interview-prep/` corpus. Cards stay as an optional view. |
| Perplexity's "phase 2 left-rail facets" | Out of scope tonight; backlog. |
| Perplexity's "ML-driven Opportunity score weights" | Out of scope tonight; the formula is fixed and explainable per the audit spec. |
| Gemini's "Cmd+K command palette" for filters | Out of scope tonight; backlog. The token-search via `/` covers 80% of the same affordance. |

## Impasses adjudicated

### D-Impasse-1 — Hide stubs vs. de-emphasize stubs

**Gemini Round 4 (adversarial):** *Hard hide stubs by default.* "The 1,956 stubs should be completely invisible unless explicitly queried."

**Perplexity Round 2:** *De-emphasize but keep visible.* "If we hide stubs by default, the toggle affordance must be prominent and stateful." NN/g progressive disclosure says hidden content must be discoverable + reversible.

**Adjudication:** **Hide by default, BUT with prominent reversible toggle + search override.** This combines both:

1. Default filter: `Tier >= 2 OR (Tier 1 AND warm_to_target_companies.length > 0)`. Effective visible set: ~870 cards (down from 2,816).
2. Sticky header bar reads: "Showing **868 enriched** of 2,824. **1,956 stubs hidden** — [Show all] · Enriching ~50/day · ETA ~38 days."
3. The `[Show all]` toggle is the explicit "include stubs" override.
4. Search ALWAYS searches across all 2,824 cards (including hidden stubs) — when a search hit lands on a stub, the row is shown even with the hide filter active. This is NN/g's "search should never lie."

**Why this resolves both:** the hard-hide gives Gemini's INTJ-T efficiency win (default view is high-signal only). The visible toggle + search override gives Perplexity's trust + reversibility.

### D-Impasse-2 — Surface unification: single page or specialized two

**Gemini:** unify aggressively into one PWA-shell page (table-default, cards as toggle).

**Perplexity Round 1:** "Task-based IA may justify two surfaces"; Round 2 swung to "one Network area, view-switch inside."

**Adjudication:** **One conceptual "Network" surface, two routes that share state.** Tonight's pragmatic spec:

1. Sidebar shows ONE entry: `Network` → `/contacts.html` (default). The label is "Network" not "Contacts" — Mitchell's mental model maps "contacts" to a generic CRM concept; "Network" maps to *his* people-graph.
2. On `/contacts.html`, the header shows a segmented control: **[Cards | Table | Dense list]**. Card is current default; switching to Table navigates to `/network-database.html` with shared URL state (`?view=table&filter=...`).
3. `/network-database.html` is kept as the Table route. Its sidebar `aria-current` highlights `Network` (same as cards route — both routes are the same conceptual page).
4. Cross-link via segmented control is the ONLY way to move between routes. No more hidden link in a company drawer.

**Why this resolves both:** logically one surface (one sidebar entry, shared state, shared filters), physically two routes (tonight's pragmatic constraint — full PWA unification is a multi-day refactor). Future state: collapse to one route once the table view is feature-complete (CSV, bulk actions, saved views in cards too).

### D-Impasse-3 — Filter UX: chips vs. left-rail facets

**Gemini Round 1:** **Left-rail facets** (Sales Nav style).
**Gemini Round 3 (after pushback):** chips + saved view tabs.
**Perplexity Round 3:** **Hybrid** — left-rail facets WITH chip-stack summary bar.

**Adjudication:** **Top chip stack with stackable AND filters tonight; left-rail in a future phase.** Rationale:
- Mitchell at ~2,824 contacts is below the threshold where left-rail facets dominate (NN/g: >10K records).
- Chip stack with multi-select target company is more space-efficient on a dashboard that already has a 200 px sidebar.
- Adding a third left rail (sidebar + left-rail + content) is "240 + 240 + content" = too cramped at 1440 px.

The chip stack lives inline with the search input row:

```
[search input............]    [filter: 🏢 Target × 2] [filter: ✉ Email] [filter: 🔥 Warm ≥3] [+ Add filter ▾] [sort: Opportunity ▾] [view: Cards | Table]
```

### D-Impasse-4 — Sort affordance default

**Gemini:** Default sort by "Warm Path Strength DESC > Target Company > Last Touched" with a composite score available via toggle.

**Perplexity:** Default by "Opportunity Score" (composite of warm/target/email/tier), explainable.

**Adjudication:** **Default to Opportunity Score, with hover-explainer + raw-sort options.** Opportunity Score formula:

```
score = (warm_to_apply_now_target ? 5 : 0)
      + (target_company_match ? 3 : 0)
      + (warm_path_strength >= 3 ? 2 : 0)
      + (has_professional_email ? 1 : 0)
      + (enriched_tier_3 ? 2 : 0)
      - (last_touched_days > 90 ? 1 : 0)
```

Hover tooltip on the sort label: "Opportunity Score = warm to apply-now (5) + target company (3) + warm path ≥3 (2) + has email (1) + Tier 3 enriched (2). Click to see raw sort options."

Raw sort options also available: Warm Path · Last Touched · Connected On · Enrichment Tier · Name · Data Richness.

---

## Final spec (handed to BRAVO for tonight's implementation)

### Tonight's spec — `contacts.html`

1. **Wrap in the shared dashboard shell** (Workstream B output). Sidebar + skip-link + ARIA landmarks.
2. **Compute enrichment tier per contact** (in `scripts/build-contacts-page.mjs`):
   - Tier 3 ("Enriched"): ≥2 enrichment signals beyond email (currently 0 cards — empty bucket)
   - Tier 2 ("Email-ready"): has professional email (currently 868 cards)
   - Tier 1 ("Stub"): name/role/company only (currently 1,956 cards)
3. **Default filter:** `Tier >= 2 OR (Tier 1 AND warm_to_target_companies.length > 0)`. Tonight ~870 visible.
4. **Sticky progress header:** "868 enriched of 2,824. 1,956 stubs hidden — [Show all] · Enriching ~50/day · ETA ~38 days."
5. **Replace filter pills with stackable chip row:**
   - 🎯 Warm to Apply-Now (intersect with live apply-now queue)
   - 🏢 Target Company (multi-select dropdown chip)
   - ✉ Has email (toggle)
   - 💬 In outreach (toggle)
   - 🔥 Warm ≥3 (toggle)
   - 🪪 Tier (multi-select: 3, 2, 1)
   - ⏱ Last touched (preset: 7d/14d/30d/90d/never)
   - 1️⃣ Degree (1st / 2nd)
   - ★ Archetype match (gated — show "(0)" until populated)
   - 💎 Pre-IPO match (gated — same)
6. **Sort dropdown:** Default "Opportunity Score" (hover-explainer); raw options: Warm Path · Last Touched · Connected · Tier · Name · Data Richness.
7. **View switcher:** `[Cards | Table]` — cards is current `contacts.html`; Table routes to `/network-database.html` with shared `?view=table&...` URL params.
8. **`/` keyboard shortcut:** focus search input on `/` keypress (skip if in form field).
9. **Token search:** parse `company:openai outreach:active warm:>=3 tier:3+ email:yes` and apply as filter chips.
10. **Compact stub treatment:** when `Show all` toggle is on, Tier 1 stubs render as 40 px-tall dense one-liners (name · role · company · `[+ Enrich]` button) instead of 110 px cards.
11. **A11y additions** (from Workstream B):
    - `<nav>` and `<main>` landmarks
    - skip-link to `#contacts-search`
    - filter chips wrapped in `role="group" aria-label="Filters"`
    - `aria-current="page"` on sidebar Network entry
    - Visible `:focus-visible` style
12. **Avatar grapheme fix** (AA-5 from audit): `Array.from(name)[0]` instead of `name[0]`.
13. **`noreferrer` on outbound links** (AA-6 from audit).
14. **In-page confirmation modal for `enrichNow`** — deferred to backlog. `confirm()` stays tonight.
15. **Stat header truth:** drop the misleading "137 fully enriched" baked-from-demo number. Replace with live corpus counts: "868 with email · 194 warm to apply-now · 0 fully enriched (Tier 3)".

### Backlog (post-tonight)

- Phase 2 left-rail facets when corpus >5K
- Cmd+K command palette
- Right-hand contact detail drawer
- Saved views ("Apply-Now warm targets", "Pre-IPO Tier-3", etc.)
- CSV export from cards view
- Bulk select + bulk enrich from cards view
- In-page modal replacing `confirm()` for enrich quote

Signed: dealbreaker via β BRAVO · 2026-05-19 ~00:05 PT
