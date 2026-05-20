# BRAVO — Contacts + Nav Snapshot (2026-05-19)

**Branch:** `bravo-contacts-nav-2026-05-19`
**Auditor:** β BRAVO (overnight haul instance)
**Method:** Playwright headless screenshots at 1440×900 + 900×900 + DOM JS attest via Chrome MCP.
**Public URL:** https://staging-dashboard.careers-ops.com/ (no-auth alias; CF Access token works on prod)

---

## Workstream A — Contact database: current problem model

### Two-surface fragmentation (most damaging finding)

There are **two** contact-database surfaces with completely divergent design language, technology, and feature sets. Mitchell mentions "the contact database" as a single thing; the system has split it in two:

| Surface | URL | Render | Theme | Sort | Filter | Pagination | A11y |
|---|---|---|---|---|---|---|---|
| `contacts.html` | `/contacts.html` | Static — all 2,816 cards in DOM | Dark | none | 7 single-select pills | none — 305,992 px scroll | none |
| `network-database.html` | `/network-database.html` | API-backed JS table | Light + auto-dark | warm path strength dropdown | tier, outreach, degree dropdowns + search | yes (50/page) | none |

`contacts.html` is the page Mitchell links to from the sidebar. `network-database.html` is the page that ZETA built with the right architecture but is hidden — no nav link to it from the main dashboard sidebar at all.

### Data layer (`data/network-database.json`, 2.7 MB)

`people[]` length: **2,824**. Fields populated across the corpus:

| Field | Populated | % |
|---|---:|---:|
| `current_company` | 2,782 | 98.5% |
| `current_role` | 2,824 | 100% |
| `emails.professional` (any) | 868 | **30.7%** |
| `warm_to_target_companies` (any) | 194 | **6.9%** |
| `inferred.current_team` | 0 | 0.0% |
| `inferred.likely_projects` | 0 | 0.0% |
| `inferred.drives` | 0 | 0.0% |
| `inferred.evidence_urls` | 0 | 0.0% |
| `notes` (length > 5) | 0 | 0.0% |
| `x_url` | 0 | 0.0% |
| `engagement.linkedin_posts_engaged_count` | 0 | 0.0% |

**Density buckets** (0 = no enrichment signals):

| Buckets of signal-count | Cards | Share |
|---:|---:|---:|
| 0 signals | 1,956 | 69.3% |
| 1 signal (email-only) | 868 | 30.7% |
| 2+ signals | 0 | 0.0% |
| Strong warm path (≥3) | 194 | 6.9% (overlaps with the email population) |

`contacts.html`'s header stat line **lies about the corpus**: it claims "137 fully enriched" — those 137 are demo-grade records baked into `ALL_DATA` (the embedded JS array Jake Standish + Kevin Dubouis et al). The corpus the dashboard reads via `/api/network/*` is the json file above, which has **zero** fully-enriched records by `inferred.*` shape.

### Filter set Mitchell has today vs. filters his goals demand

Filters currently rendered on `contacts.html`:
- All · In outreach · Has email · Has X · Shared employer · Pre-IPO · Archetype match

Filters his goals demand (per `memory/user_compensation_priority.md`, `AGENTS.md`, `modes/_profile.md`):
- **Warm to apply-now target company** (the 194 — this is the highest-signal cohort)
- **Has professional email** (already exists, but should be combinable with others)
- **In outreach (active threads)** vs. **Touched in last 7d / 14d / 30d**
- **Strong warm path strength** (`warm_path_strength >= 3`)
- **By target company** (OpenAI / Anthropic / Sierra / Cursor / ElevenLabs / Mistral / Perplexity / Cohere / Cognition / Pinecone — these are in `totals_by_target`)
- **Degree** (1st only / 2nd via path)
- **Archetype match** (already exists, but useless until enrichment populates)
- **Pre-IPO match** (already exists, but useless until enrichment populates)
- **Has been enriched** vs. **stub** (the missing sort/filter Mitchell explicitly named)

The current single-select pill UX prevents stacking. There is **no way** to ask "warm to Anthropic AND has email AND in outreach" — the three signals he actually weighs together.

### Sort affordances

`contacts.html`: **none.** The DOM order is whatever order the build script emitted. Visually, the first ~3 cards are fully enriched demo cards (Jake Standish, Kevin Dubouis, Andrew Carter); after that, the page descends into 2,679 stub cards repeating "Engagement topics, outreach positioning, and inferred relationship context pending LLM enrichment."

`network-database.html`: ONE dropdown — sort by warm_path_strength / connected_on / name. No "by enrichment progress."

### Search affordances

`contacts.html`: one text input, searches name + company + position + email + x_handle. No autocomplete, no recent searches, no examples in placeholder ("Search name, company, role, email…").

`network-database.html`: same text-input pattern + adds the structured dropdowns.

Neither surface offers:
- Keyboard shortcut (`/` to focus search, common in CRMs)
- Multi-token query (`company:openai outreach:active`)
- Recent searches
- Suggested searches scoped to the user's goals

### Card density / scroll cost

`contacts.html`:
- Total scroll height: **305,992 px** (Chrome MCP attested). At a typical screen height of 900 px, that's **340 page-downs to traverse the page**.
- 2,816 cards × ~110 px tall each.
- 95% of cards have zero meaningful content beyond name + role + "pending LLM enrichment" copy.

### Empty-state strategy: missing

There is no "this corpus is 69.3% empty — sort by enrichment progress" affordance. The stub cards aren't visually de-emphasized. There's no "skip to enriched-only" toggle.

### Cross-surface coherence

| Element | contacts.html | network-database.html |
|---|---|---|
| Background color | `#0a0a0f` dark | `#f7f8fa` light (auto-dark via media query) |
| Card vs. row | Card grid (420 px) | Table row |
| Avatar | Yes, 60×60 | None |
| Action: enrich | "↻ Enrich now" button | not exposed |
| Action: photo | "📸 Photo" button | not exposed |
| Action: email | Click-to-reveal | Inline display |
| Action: warm intro | Card-level only | Path drawer |

A user navigating between the two pages cannot map "card with Jake Standish" on page A to "row 17 in the table" on page B without re-orienting completely.

### Performance

`contacts.html` ships 65,000 lines + a 2.3 MB embedded `ALL_DATA` array. With 2,816 cards in DOM at once, scrolling stutters. There is no virtualization.

---

## Workstream B — Cross-page navigation: current problem model

### Page inventory

```
dashboard/
├── index.html          (main dashboard — has sidebar nav + skip-link + ARIA)
├── contacts.html       (orphan — no nav, no skip-link, no ARIA landmarks)
├── network-database.html (orphan — no nav, no skip-link, no ARIA landmarks)
├── reports/            (directory — listed via dashboard-server's index endpoint)
├── stories/            (directory — listed via dashboard-server's index endpoint)
├── manifest.json       (PWA manifest)
├── service-worker.js   (PWA shell)
├── state.json
└── career-ops-dashboard / main.go / internal/  (separate Go binary — not currently linked from any HTML page; out of scope for nav fix)
```

### Nav state per page

| Page | Has `<nav>` | Sidebar | Skip-link | ARIA landmarks | Cross-page links |
|---|:---:|:---:|:---:|:---:|---|
| `index.html` | Yes (`.sidebar-nav`) | 200 px persistent left | `<a class="skip-link" href="#main">` | full set | sidebar Contacts link → `contacts.html`; ONE buried "Open full database →" → `network-database.html` |
| `contacts.html` | **None** | None | **None** | **None** | None — no link back to `index.html`, no link to `network-database.html` |
| `network-database.html` | **None** | None | **None** | **None** | None — no link back to `index.html`, no link to `contacts.html` |

### How a user gets from page A to page B today

- index → contacts: sidebar link (works)
- index → network-database: ONE link, in a popout, only after drilling into a specific company drawer (`scripts/build-dashboard.mjs:47676`). Not discoverable.
- contacts → index: browser back button only
- contacts → network-database: not possible from within the page
- network-database → index: browser back button only
- network-database → contacts: not possible from within the page

### Accessibility audit per page

| Dimension | index.html | contacts.html | network-database.html |
|---|---|---|---|
| Skip-link | ✅ `Skip to main content` | ❌ | ❌ |
| `<nav>` landmark | ✅ `.sidebar-nav` (in build code) | ❌ | ❌ |
| `<main>` landmark | ✅ | ❌ | ❌ |
| Logical heading hierarchy | ✅ h1 → h2 | h1 only, then cards with `.contact-card-name` (no h2/h3) | h1 only |
| Visible focus styling | ✅ | partial — input only | partial |
| Keyboard nav order | ✅ | filter pills tab-order is OK but no skip to results | OK |
| ARIA roles on landmarks | ✅ | 0 ARIA roles | 0 ARIA roles |
| Color contrast text-on-bg | not measured tonight | not measured tonight | not measured tonight (light theme has good contrast on inspection) |
| Active-page indicator | nav classed `data-section` activated by scroll-spy | n/a (no nav) | n/a (no nav) |

### Mobile pattern per page

- `index.html`: hamburger button (`#sidebar-toggle-btn`) toggles `.sidebar` with backdrop. Standard pattern.
- `contacts.html`: nothing — page just reflows below 900 px because the grid is `auto-fill, minmax(420px, 1fr)`.
- `network-database.html`: nothing — table becomes horizontally scrollable below ~1100 px.

### Content strategy on nav labels (where nav exists)

`index.html` sidebar items: Overview, Apply-Now Queue, All Evaluations, Trends + Analytics, Companies, Pending, Batch runs, Contacts, Adjacent Industry Radar, Settings.

The Contacts label is the ONLY surface that points to the dedicated database; "Network database" (the other surface) has no sidebar presence.

---

## "Filters Mitchell would want" — career-ops-aligned spec

Goal-aligned filters per his stated priorities (compensation + pre-IPO equity first):

1. **Warm to Apply-Now Target** — primary filter. Reads `warm_to_target_companies[].company_slug` and intersects with the live apply-now queue. This is the "who can intro me to where I'm applying THIS WEEK" cohort.
2. **By Target Company** — multi-select chips for OpenAI / Anthropic / Sierra / Cursor / ElevenLabs / Mistral / Perplexity / Cohere / Cognition / Pinecone. From `totals_by_target` keys.
3. **Has Professional Email** — actionable cohort (Hunter-verified + DNS-MX-verified).
4. **In Outreach** — currently has an active thread.
5. **Last Touched** — 7d / 14d / 30d / 90d / never.
6. **Strong Warm Path** — `warm_path_strength >= 3` (highest-signal subset of #1).
7. **Enrichment Tier** — explicit tri-state pill: enriched (signal density ≥3) / partial (1-2) / stub (0). **This is the missing affordance Mitchell named.**
8. **Degree** — 1st-degree / 2nd-degree-via-warm-path.
9. **Archetype Match** — gated on enrichment; show "filter unavailable until N enriched contacts populate this signal" tooltip until N > 0.
10. **Pre-IPO Target Match** — same gating as #9.

These should be **stackable**, not single-select.

---

## "Pages that exist + nav state" — final table

| Page | Should have shared nav? | Current state | Gap |
|---|:---:|---|---|
| `/` (index) | Yes (canonical) | Has sidebar | Sidebar needs a `Network database` entry; possibly also a top-bar for short-jumps |
| `/contacts.html` | **Yes** | None | Needs full sidebar OR top-bar OR both (TBD by council) |
| `/network-database.html` | **Yes** | None | Same as above |
| `/reports/*.md` | Server-rendered? | n/a | Out of scope tonight unless they're HTML — confirm via dashboard-server.mjs |
| `/stories/*.md` | Server-rendered? | n/a | Out of scope tonight unless they're HTML |

---

## Screenshots — BEFORE state

`data/bravo-contacts-nav-snapshots/before/`:
- `index-1440.png` — main dashboard, sidebar visible
- `index-900.png` — main dashboard, sidebar collapsed via media query
- `contacts.html-1440.png` — orphan, no nav
- `contacts.html-900.png` — orphan, no nav, narrow viewport
- `networkdb-1440.png` — orphan, no nav, paginated table
- `networkdb-900.png` — orphan, no nav, table scrolls

---

## Phase 0 verdict (read this before Phase 1 council)

**Workstream A primary insight:** the most damaging UX failure isn't the empty corpus — it's that there are **two contact-database surfaces with no coherent relationship**, and the better-architected one is hidden. Any council recommendation must address surface-unification before it addresses filter taxonomy.

**Workstream B primary insight:** the sidebar in `index.html` is well-built and a11y-conscious, but it exists in **one page only**. The fix is not "design a new nav system" — it's "extract the existing sidebar pattern into a shared shell that all dashboard pages use."

**The two workstreams converge** at one architectural decision: should `contacts.html` and `network-database.html` be **separate pages** under the shared nav, or should they **collapse into a single page** with view modes (cards | table)? Mitchell may prefer either. The council must resolve this.

Signed: β BRAVO · 2026-05-19 ~23:35 PT
