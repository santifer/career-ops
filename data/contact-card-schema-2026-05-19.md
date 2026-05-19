# Contact-card schema — relationship-intelligence layer

Established 2026-05-19 per Mitchell ask: the contacts directory should
surface enough context per contact that he can decide how to position
outreach for highest-likelihood reply.

## Field inventory + provenance per field

| Field | Source | Determinism | Status tonight |
|---|---|---|---|
| `id` | slug of `firstname-lastname-companyslug` | deterministic | **shipped** |
| `name.{first,last,display}` | `data/linkedin/Connections.csv` | deterministic | **shipped** |
| `photo.{url,source,fetched_at}` | Chrome-MCP scrape of LinkedIn profile (auth'd) → `data/contact-photos/{id}.jpg` (gitignored) | mechanical | **queued** (network-enricher batch, ~30/min) |
| `current.{company,company_slug,title}` | Connections.csv + `data/linkedin/overrides.json` (no_longer_at / now_at corrections) | deterministic | **shipped** |
| `connected.{first_at,position_at_connection}` | Connections.csv `Connected On` + `Position` columns | deterministic | **shipped** |
| `overlap_with_mitchell[]` | parse `cv.md` company history → compare to contact's known employers | deterministic | **shipped** |
| `interaction_history[]` | `data/outreach-state.json` touches array per contact | deterministic | **shipped** |
| `online.{linkedin_url,x_handle,github,website}` | Connections.csv + outreach-state intel | deterministic | **shipped** |
| `emails.{professional,personal,confidence,source,verified_at}` | `data/contacts-enriched.json` + outreach-state | deterministic | **shipped** |
| `engagement.{linkedin_topics,linkedin_last_active,x_topics,x_last_active,recent_engaged_posts}` | LLM synthesis of `data/linkedin/activity/` + `data/linkedin/x-activity/` per contact | LLM-required | **queued** |
| `outreach.{positioning_recommendation,best_channel,suggested_opening_lines}` | LLM-generated (uses Mitchell's voice corpus + contact engagement + goals from `modes/_profile.md`) | LLM-required | **queued** |
| `inferred.{relationship_arc,why_we_might_connect_now,shared_interests}` | LLM synthesis (beyond what cv.md overlap gives) | LLM-required | **queued** |
| `graph.shared_directory_connections[]` | Connections.csv + `data/linkedin/2nd-degree/{company}.json` graph traversal | deterministic | **shipped (partial)** |
| `graph.others_reachable_at_company[]` | Connections.csv group-by-company + role-archetype match against `modes/_profile.md` | deterministic | **shipped** |
| `goal_alignment.{pre_ipo_match,archetype_match,composite_score}` | classifier from contact's current company against Mitchell's archetypes + pre-IPO weighting | deterministic | **shipped** |
| `provenance.{sources[],last_enriched_at,enriched_by,verifier_passed}` | every field carries a source URL + fetched-at + model + verifier pass status | mandatory | **shipped (schema)** + populated as enrichment fires |

## What ships tonight (deterministic, no LLM, no Chrome scrape)

- All "shipped" rows above
- Rich card UI in the existing Contacts directory modal
- New full-screen `/contacts.html` child page (sidebar link)
- Per-card "↻ Enrich" button → queues that contact for the next refresh-master tick
- Per-card "Scrape photo" button → fires Chrome MCP scrape on demand
- `contact_enrichment` cache type added to `lib/refresh-cache-registry.mjs` so it's picked up by the running orchestrator

## What's queued (LLM + Chrome scrape, fills in over 24–48h)

- Photo scrape for top-100 contacts (Chrome MCP, ~free, slow ~30/min)
- LLM enrichment of `engagement.*`, `outreach.*`, `inferred.*` for top-100 contacts
- Provider routing: `perplexity-agent-api` for web research + `grok-4-x-search` for X engagement + `anthropic-sonnet` verifier
- Per-contact cost: ~$0.50 (Sonar Pro + Grok-X + verifier)
- Top-100 batch cost: ~$50
- TTL: 30 days per contact (engagement signal moves slowly)

## Storage

- Deterministic fields baked into `window._CONTACTS_DATA` at dashboard build time
- LLM-enriched fields stored at `data/contact-enrichment-cache/{id}.json` (gitignored — personal data)
- Photos at `data/contact-photos/{id}.jpg` (gitignored)
- Schema version 1; bumped if fields change

## UI

- **Modal** (sidebar tile click) — top 60 by relevance, paged
- **Full-screen page** (`/contacts.html`) — all 2,910+ contacts, grid layout, full filters
- Both render the same `ContactCard` component; full-screen has more breathing room per card

## Cross-checks (applied per the anti-hallucination layer Phase 1.5 work)

- Every LLM-enriched field carries `source_urls` + `verifier_passed`
- Identity-lock: contacts referenced from `cv.md` overlap calculations are checksum-locked
- Citation density: `outreach.positioning_recommendation` must cite ≥1 source per claim (e.g., "Kevin posted about LLM eval on 2026-04-12" → citation URL)
- Refuse-to-commit fallback: if the LLM can't gather enough signal for a contact, the card shows "insufficient signal — manual research needed" rather than fabricated positioning
