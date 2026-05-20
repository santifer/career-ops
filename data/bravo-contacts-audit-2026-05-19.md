# BRAVO — Contacts directory UX/IA audit (2026-05-19)

**Branch:** `bravo-contacts-nav-2026-05-19`
**Auditor:** β BRAVO (overnight haul instance)
**Method:** Playwright headless capture + DOM JS attest via Chrome MCP + data-layer probe of `data/network-database.json` + source-code read of `scripts/build-contacts-page.mjs` (generator) and `dashboard/network-database.{html,js}`.
**Public URLs:**
- https://staging-dashboard.careers-ops.com/contacts.html  (canonical, sidebar-linked)
- https://staging-dashboard.careers-ops.com/network-database.html  (orphan, no sidebar link)

Audit tier convention: **AAA** = must-fix tonight (Mitchell-lens hit, primary friction). **AA** = fix tonight if budget allows (high signal). **A** = backlog (worthwhile but lower).

---

## AAA-1 — Two-surface fragmentation: `contacts.html` and `network-database.html` are both "the contact database" with no coherent relationship

**Finding:** `contacts.html` is statically rendered (65,000 lines, all 2,816 cards in DOM, 2.3 MB embedded `ALL_DATA` array). `network-database.html` is a separate API-backed paginated PWA-shell page with different theme, different layout (table vs. cards), different filters (tier/outreach/degree dropdowns vs. pills), and different sort affordance (warm-path-strength dropdown vs. nothing). The latter is more capable but is **not linked from the main dashboard sidebar at all**. Only ONE hidden link from a company drawer (build-dashboard.mjs:47676) points to it.

**Impact:** Mitchell does not know `network-database.html` exists. When he says "the contact database" he means contacts.html, which is the inferior surface.

**Mitchell-lens edge case:** when he wants to "find every warm contact at Anthropic with an email AND in outreach AND last touched >30d ago," neither surface lets him stack filters. The paginated surface is closer (it has structured filters) but is hidden.

**Recommendation:**
1. Add `Network database` to the main dashboard sidebar (sibling to `Contacts`). Differentiate labels: rename `Contacts` → `Contacts (cards)` and add `Network database (table)` — OR collapse the two surfaces into a single page with view modes. The dealbreaker should resolve which.
2. In the meantime, every page must link back to index AND cross-link to the other surface, with consistent "Card view ↔ Table view" affordance. This is non-negotiable and ships tonight.

---

## AAA-2 — Filter set does not reflect Mitchell's career-ops goals

**Finding (contacts.html):** 7 single-select pill filters: All / In outreach / Has email / Has X / Shared employer / Pre-IPO / Archetype match. Filters cannot stack. There is no "warm to apply-now target" filter despite that being the most actionable cohort (194 records — the highest-signal cut per Phase 0 data probe).

**Finding (network-database.html):** Better — has `tier`, `outreach`, `degree` dropdowns + search. Still missing the "warm to apply-now target" primary filter and the "enrichment progress" filter Mitchell named verbatim.

**Impact (per `memory/user_compensation_priority.md`):** His PRIMARY filter is total comp + pre-IPO equity, which routes to "who can intro me at OpenAI / Anthropic / Sierra / ElevenLabs / Mistral / Perplexity / Cohere / Cognition / Pinecone / Cursor." Today, the only filter that approximates this is "Pre-IPO" (no multi-target), and it's currently 0% useful because `inferred.pre_ipo_match` is 0% populated.

**Recommendation:** Replace the pill row with a stackable filter chip row. Required filters tonight:
1. Warm to Apply-Now Target (intersect with live apply-now queue) — primary
2. By Target Company (multi-select; OpenAI / Anthropic / Sierra / Cursor / ElevenLabs / Mistral / Perplexity / Cohere / Cognition / Pinecone)
3. Has Professional Email (binary toggle)
4. In Outreach (binary toggle)
5. Strong Warm Path (warm_path_strength ≥ 3 — currently 194 cards)
6. Enrichment Tier (tri-state: enriched ≥3 signals / partial 1-2 / stub 0)
7. Last Touched (7d / 14d / 30d / 90d / never)
8. Degree (1st / 2nd via warm path)
9. Archetype Match (gated on enrichment — show "filter unavailable until N enriched cards" if zero-population)
10. Pre-IPO Match (gated on enrichment — same gating as #9)

---

## AAA-3 — No way to sort by "what's been actually populated" (Mitchell's explicit ask)

**Finding:** Neither surface offers an "enrichment progress" sort. Per Phase 0 data probe:
- 1,956 cards (69.3%) have ZERO enrichment signals beyond name/role/company
- 868 cards (30.7%) have only an email
- 0 cards have ≥2 enrichment signals across the corpus
- 194 cards (6.9%) have a `warm_to_target_companies` link, intersected with the email cohort

Mitchell said verbatim: *"there's no way for me to sort by what's been actually populated (since this content population will happen over a 1-2 month period every night)."*

**Impact:** The visually-engaging "enriched" cards (Jake Standish, Kevin Dubouis, Andrew Carter at OpenAI) are the first ~3 rows of the page because they happen to come first in the demo subset baked into `ALL_DATA`. After those 3, the page descends into 2,679 stub cards repeating identical "pending LLM enrichment" copy. There is no signal density gradient.

**Recommendation:** Add a sort dropdown with options, ordered to surface populated content first:
1. **Signal density** (composite of: warm_path_strength + has_email + enrichment_status + last_touched freshness) — DEFAULT, this is the Mitchell-named missing sort
2. Warm path strength (highest first)
3. Last touched (most recent first)
4. Connected on (most recent first)
5. Last name (A-Z)

Pair with a visible "Enrichment progress" header tile: `N of 2,824 contacts enriched (N%) — enrichment processes 50/day per memory/project_cdp_attached_chrome_enrichment.md, full corpus ETA ~56 days.` This sets honest expectations.

---

## AAA-4 — Empty-state strategy is missing; stub cards drown out enriched signal

**Finding:** When a card is unenriched, the body reads `"Engagement topics, outreach positioning, and inferred relationship context pending LLM enrichment."` in normal-weight text. Same visual weight as the enriched cards. 2,679 stubs × identical copy = visual noise that buries the few enriched cards.

**Impact:** The page feels like it has nothing to offer until enrichment completes. Combined with the unbounded scroll (305,992 px), the user disengages.

**Recommendation:**
1. Visually de-emphasize stubs: smaller padding, no border-left accent, body collapsed to a single line ("[name] · [role] · [company] · [LinkedIn]").
2. Add an explicit progressive-disclosure toggle: "[ ] Hide unenriched stubs" — defaults ON.
3. When the toggle is on, show a one-row digest at the top: "1,956 unenriched cards hidden — toggle to show all" with a CTA "Queue 50 for tonight's enrichment run."
4. When the toggle is off, stubs render in compact one-line form (~40 px tall vs. ~110 px). 2,679 stubs × 40 px = 107K px scroll — still bad but 65% reduction.

---

## AAA-5 — Card scroll cost is pathological: 305,992 px

**Finding (Chrome MCP attest):**
```js
document.documentElement.scrollHeight === 305992
```
With 2,816 cards × 110 px avg + gap, and a 900 px viewport, that's **340 page-downs from top to bottom**. Even with virtualization, this is more scroll than makes sense for a personal-CRM use case.

**Recommendation:** With AAA-4's compact-stub mode, scroll cost drops to ~145K px (160 page-downs). With pagination (50 cards/page like network-database.html), scroll cost is bounded at ~5,500 px per page. Recommend pagination AT THE GENERATOR LEVEL: only emit the first 50 cards to initial DOM, lazy-render the rest via intersection observer, OR switch to the api-paginated path that `network-database.html` already uses.

**Tonight's pragmatic fix:** add `display:none` on stubs by default (toggle to reveal), so the initial DOM-paint includes 2,816 elements but only ~30-194 are visible. This is not a virtualization fix but cuts perceptual scroll by 95%.

---

## AAA-6 — Search affordance is weak

**Finding:** Single text input. Searches concatenated string of name + company + position + email + x_handle. No tokens, no autocomplete, no recent searches, no examples in placeholder beyond "Search name, company, role, email…". No keyboard shortcut. Search input is not focused on page-load.

**Recommendation:**
1. Add `/` keyboard shortcut to focus search (CRM standard from GitHub / Linear / Notion).
2. Auto-focus search input on page-load (the primary task on this page is "find a contact").
3. Add structured query hints in placeholder: `"Try: company:openai, status:outreach, warm:anthropic"`.
4. Parse `key:value` tokens out of the query string and apply as additional filters.
5. Add a "Recent searches" floating panel below the input (max 5 items, click to re-run).

---

## AA-1 — Stat header lies about corpus

**Finding (contacts.html header):**
```
2816 contacts total
2 in outreach
58 with email
0 with X
23 shared employer
7 pre-IPO
1 photo
137 fully enriched
```

The "137 fully enriched" number is misleading — those are 137 cards that have the `enrichment_status: 'complete'` flag in the embedded `ALL_DATA` array, which is a demo subset baked at build-time. The live `data/network-database.json` corpus (the source of truth for `/api/network/*`) has **zero** records with ≥2 enrichment signals — only 868 with an email and 194 with a warm path.

**Recommendation:** Either:
- Replace the stat header to reflect signal density buckets from the live corpus: "868 with email (30.7%) · 194 warm to apply-now (6.9%) · 0 fully enriched (target: 56 days @ 50/day)"
- OR collapse the surface contradiction by re-baking from the API-backed source (eliminate the 137-demo embedded subset)

---

## AA-2 — No "Apply-Now intersect" view

**Finding:** The two highest-signal questions Mitchell asks his network are (a) "who can intro me at the companies I'm applying to THIS WEEK?" and (b) "who knows the hiring manager at the role I'm currently drafting an apply pack for?" Neither has a one-click answer on either surface.

**Recommendation:** Add a "🎯 Apply-Now mode" toggle that:
1. Reads the live apply-now queue (the dashboard already surfaces this via `/api/apply-now-queue` or equivalent)
2. Filters contacts to those whose `warm_to_target_companies[].company_slug` ∈ apply-now-queue's target companies
3. Groups results by target company
4. Within each group, sorts by warm_path_strength desc, then last_touched asc

This collapses the "who can help me this week?" question to one click.

---

## AA-3 — No keyboard nav between cards

**Finding:** Cards are not keyboard-navigable. Tab order goes through filter pills, the search input, then card-internal buttons (LinkedIn, email, etc.) — but not card-to-card. A user with keyboard preference cannot J/K through the list.

**Recommendation:** Add J/K bindings on the page (next/prev card), Enter to open the active card's primary action (LinkedIn URL), E to "Enrich now," P to "Photo."

---

## AA-4 — Header stat tiles are not clickable

**Finding:** The header "2 in outreach · 58 with email · 23 shared employer" etc. are static text. They should be clickable as filter shortcuts — the canonical pattern in dashboards (the main career-ops dashboard at index.html already does this for stat tiles).

**Recommendation:** Make each stat-header entry a button that applies the corresponding filter.

---

## AA-5 — Avatar fallback initials are sometimes blank

**Finding (in `scripts/build-contacts-page.mjs:192`):**
```js
const initials = (((c.first_name||'')[0] || (name||'?')[0] || '?') + ((c.last_name||'')[0] || ((name||'').split(' ').slice(-1)[0]||'')[0] || '')).toUpperCase();
```

For names with one part (e.g. "Madonna"), the second character is `''`. The result is a 1-character avatar which looks broken. For names with non-Latin characters, `[0]` returns one UTF-16 code unit which can split a surrogate pair.

**Recommendation:** Replace with proper grapheme extraction: `Array.from(c.first_name||'')[0]` (handles surrogate pairs). For 1-part names, return single-letter centered.

---

## AA-6 — `target="_blank"` LinkedIn/X actions don't include `noreferrer`

**Finding:** `<a class="contact-act" target="_blank" rel="noopener">` — missing `noreferrer`. Reverse tabnabbing is mitigated by `noopener` but referrer header still leaks the dashboard URL to LinkedIn/X.

**Recommendation:** Use `rel="noopener noreferrer"`.

---

## AA-7 — "Enrich now" confirm dialog uses `confirm()` instead of in-page modal

**Finding:** `if (!confirm('Queue this contact for LLM enrichment (~$0.50)?')) return;`

Native `confirm()` is jarring, can't be styled, and forces a thread-blocking modal. Cost contract per `memory/feedback_cost_confirmation_contract.md`: confirmations should be in-page so they feel like dashboard behavior, not browser interruption.

**Recommendation:** Replace with an in-page modal matching the main dashboard's confirmation pattern (the cost-gate modal used for Process All / Run Batch).

---

## A-1 (backlog) — Color contrast on stub-card "pending" text

**Finding:** `.contact-card-enrich-pending .muted-text` is `var(--text-3)` = `#94a3b8` on `var(--surface)` = `#11131c`. WebAIM contrast checker: ~6.5:1 — passes WCAG AA. Not a blocker, but in dim ambient light the stub copy can fade.

---

## A-2 (backlog) — Mobile breakpoint (≤640px) reflow

**Finding:** Grid is `auto-fill, minmax(420px, 1fr)`. At 360px (iPhone SE), it collapses to one column but the 420 px minimum forces horizontal scroll. Not a blocker for personal use (Mitchell does not use his phone for this) but worth noting.

---

## A-3 (backlog) — CSV export

**Finding:** `network-database.html` has CSV export. `contacts.html` does not.

**Recommendation:** Add to `contacts.html` if/when surfaces unify.

---

## A-4 (backlog) — Bulk actions

**Finding:** `network-database.html` has bulk select + bulk enrich. `contacts.html` does not.

**Recommendation:** Add to `contacts.html` if/when surfaces unify.

---

## A-5 (backlog) — Saved views

**Finding:** Neither surface has saved views. After the new filter taxonomy ships, Mitchell will want to save "Apply-Now intersect for Anthropic + has email" as a one-click view.

---

## What ships tonight (AAA + AA)

| Item | Workstream | Disposition |
|---|---|---|
| AAA-1 (surface unification + cross-page links) | A+B intersect | **Ship.** Add Network database to sidebar; add cross-page nav lib to both pages. |
| AAA-2 (filter taxonomy) | A | **Ship.** New stackable chip row. |
| AAA-3 (sort by enrichment) | A | **Ship.** Sort dropdown with signal-density as default. |
| AAA-4 (empty-state hide-stubs) | A | **Ship.** Default-on toggle. |
| AAA-5 (scroll cost reduction) | A | **Ship via AAA-4.** Stubs hidden by default cuts perceived scroll 95%. |
| AAA-6 (search affordance) | A | **Ship.** `/` shortcut + autofocus + token query parse. |
| AA-1 (stat header truth) | A | **Ship.** Re-source from live corpus. |
| AA-2 (Apply-Now intersect) | A | **Ship.** One-click toggle. |
| AA-3 (J/K keyboard nav) | A | **Ship if time.** |
| AA-4 (clickable stat tiles) | A | **Ship if time.** |
| AA-5 (avatar grapheme bug) | A | **Ship.** One-line fix. |
| AA-6 (noreferrer) | A | **Ship.** One-line fix. |
| AA-7 (in-page confirm modal) | A | **Backlog.** Touches modal infrastructure — A-tier. |
| All A-tier | A | **Backlog.** |

Signed: β BRAVO · 2026-05-19 ~23:50 PT
