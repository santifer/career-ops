# ζ ZETA — Inventory & schema map (2026-05-19, 23:35 PT)

## Raw on-disk data sources (READ-ONLY, no fabrication)

| Path | Type | Shape | Count | Notes |
|---|---|---|---|---|
| `data/linkedin/Connections.csv` | CSV (LinkedIn export) | `First Name,Last Name,URL,Email Address,Company,Position,Connected On` after 4-line Notes preamble | 2,910 rows | Some Email Address cells populated (only when contact opted-in); dates like `14 May 2026` |
| `data/linkedin/2nd-degree/{company}.json` | JSON per target | `{ company, linkedin_slug, generated_at, scrape_method, contacts: [{ name, url, title, location, mutual_connections: [name…], mutual_connections_text }] }` | 11 target companies (anthropic, cognition, cohere, cursor, elevenlabs, mistral-ai, openai, perplexity, pinecone, sierra, synthesia) | Scraped via Chrome MCP from LinkedIn People pages |
| `data/linkedin/2nd-degree/_warm-intros.json` | JSON aggregator | `{ generated_at, top_mutuals: [[name, count]…] }` | 1 file (top-200 mutuals ranked) | Pre-built leaderboard of Mitchell's strongest connectors |
| `data/linkedin/activity/` | dir | empty | 0 files | No LinkedIn engagement harvest yet — schema-only, will populate as Z.3 enrichment runs |
| `data/linkedin/x-activity/` | dir | empty | 0 files | Same |
| `data/linkedin/overrides.json` | JSON | `{ no_longer_at: {nameKey: [company…]}, now_at: {nameKey: {company, position}}, notes: {nameKey: str} }` | 1 entry (Rita Kumar / no longer at OpenAI) | Manual corrections layer; loader at `lib/linkedin-network.mjs:111` |
| `data/contacts-enriched.json` | JSON entries map | `{ schema_version, last_run, lookups_in_session, dollars_spent_in_session, entries: {nameKey: {first, last, company, linkedin_url, domain_searched, email_guess, result_ok, result_error, last_attempted_at}}}` | 2,657 entries | Note: `email_guess` is `null` in most rows — Hunter returned 200 but didn't return an address. `result_ok=true` means "API call succeeded", NOT "email found". |
| `data/network-graph.json` | (gitignored, generated) | per `lib/network-graph.mjs` — `{ schema_version, people: [...], summary }` | **NOT PRESENT** | Z.1 will not depend on it; gracefully degrades |
| `data/outreach-state.json` | JSON | `{ contacts: [{ name, company, contact_id (linkedin slug), linkedin_url, intel: { email_guess: { address }, x_handle }, tier, status, touches: [...] }] }` | TBD (live state) | Richest source of x_handle + verified email |

## Key file:line surfaces (read-only existing code)

- `lib/linkedin-network.mjs:127` — `loadConnections()` parses CSV, strips emails. ZETA aggregator does NOT call this; it re-parses CSV with email retention.
- `lib/linkedin-network.mjs:265` — `getSecondDegreeAtCompany()` returns per-company 2nd-degree contacts.
- `lib/linkedin-network.mjs:319` — `getWarmIntroPaths()` returns ranked paths.
- `lib/network-graph.mjs:90` — `loadNetworkGraph()` (returns null when JSON missing — current state).
- `scripts/build-dashboard.mjs:3424` — `contactsDirectory` IIFE: outreach-state + Connections.csv + contacts-enriched merge. Already a partial aggregator but only used for the tile-count title-tooltip; no API. Note that `contactsDirectory` does not include 2nd-degree data and the email-confidence band is implicit.
- `scripts/build-dashboard.mjs:10957` — Network tile (click → `drillIn('network-leverage')`).
- `scripts/build-dashboard.mjs:14755` — `_drillInRegister('network-leverage', …)` — the popout I'm replacing.

## Anti-hallucination map — what I will NOT fabricate

- `inferred.current_team` / `likely_projects` / `drives` / `evidence_urls` — all `null` / `[]` by default. Only Z.3 enricher populates with cited evidence URLs from sonar/grok.
- `emails.*.confidence` ladder: `high` = Hunter API 200 + verified MX + the email address itself returned by API; `medium` = pattern-permutation guess + MX-verified domain; `low` = pattern-permutation guess + NO MX verify or vendor-guessed unverified.
- `warm_to_target_companies` — only fire when path traces through `data/linkedin/2nd-degree/{slug}.json` mutual_connections + Connections.csv intersection. Evidence string = `"shared_employer:{slug}"` OR `"linkedin_mutual:{2nd_degree_name}"`. No company-shape-based guessing.
- `degree` — `1` only if name is in Connections.csv; `2` only if name appears in any 2nd-degree JSON; `2+` for inferred-via-shared-employer.
- `x_url` — `null` unless Z.3 enricher finds a high-confidence handle (sonar/grok cross-check). Never inferred from name alone.

## What the new `data/network-database.json` aggregates (schema)

See `scripts/build-network-database.mjs` (Z.1) — schema:
```
{
  schema_version: 1,
  last_run: ISO-8601,
  total: 2910,
  totals_by_target: { "anthropic": {first: N, second: M, warm: K, with_email: J}, ... },
  people: [
    { id, first, last, full_name, linkedin_url, x_url,
      current_company, current_role, connected_on, degree,
      warm_to_target_companies: [{company_slug, evidence, confidence}],
      emails: { professional: [{email, source, confidence, verified_at}],
                personal:     [{email, source, confidence, verified_at}] },
      engagement: { linkedin_posts_engaged_count, linkedin_last_engaged_at,
                    x_posts_engaged_count, x_last_engaged_at },
      inferred: { current_team, likely_projects, drives, evidence_urls },
      notes, overrides_applied: [] }
  ]
}
```

## Constraints

- `data/network-database.json` ADDED to .gitignore. Personal data; never commits.
- `data/zeta-post-impl-snapshots/` will be created for Z.9 Chrome MCP screenshots; gitignored.

## Build sequence (this session)

1. ✅ Z.0 (this doc)
2. → Z.1 `scripts/build-network-database.mjs` (aggregator + .gitignore entry)
3. → Z.2 `lib/network-database-search.mjs` + endpoints in dashboard-server.mjs
4. → Z.3 `scripts/agents/network-enricher.mjs`
5. → Z.4 `scripts/agents/network-emailer.mjs`
6. → Z.5 + Z.6 replace drillIn (build-dashboard.mjs:14755)
7. → Z.7 `dashboard/network-database.html` + `.js`
8. → Z.8 skills
9. → Z.9 test + live-verify
10. → Z.10 adversarial review + fix
11. → Z.11 merge + sunrise

— ζ
