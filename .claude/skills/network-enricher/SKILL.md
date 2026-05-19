---
name: network-enricher
description: LLM enrichment of a single person or priority batch from Mitchell's network database — infers current team, likely projects, drives, and X handle from public sources with cited evidence URLs. Use when Mitchell says "enrich {name}", "enrich top N for {company}", "what is {name} working on", "run the network enricher", or any phrasing that asks for inferred-but-evidence-cited intel on a connection. Defers to network-database for the actual data layer.
user_invocable: true
---

# network-enricher

Sub-skill of `network-database`. Pulls a single person or a priority batch from `data/network-database.json` and asks Sonar-pro + Sonnet for inferred metadata, each claim citing a public evidence URL.

## When to use

| Intent | Command |
|---|---|
| "enrich {person_id}" | `node scripts/agents/network-enricher.mjs --person <id>` |
| "enrich top 20 anthropic warm contacts" | `node scripts/agents/network-enricher.mjs --target-company anthropic --top 20` |
| "run the priority enrich batch" | `node scripts/agents/network-enricher.mjs --priority-batch` (top 200 by warm strength × target priority) |

## Cost contract

- Per-person cap: $0.50 USD (sonar-pro ~$0.03 + sonnet ~$0.05 typical = $0.08 actual; cap leaves headroom for retries)
- Batch cap: $50 USD / session (enforced via `data/network-database-cache/cost-log.jsonl`)
- 30-day cache: hits don't spend; `data/network-database-cache/enrich/{id}.json`

## Anti-hallucination contract

Zod-validated response (`EnrichmentSchema` in `scripts/agents/network-enricher.mjs:62`):
- `current_team` / `x_handle` ∈ string | null — `null` if not confidently citeable
- `likely_projects` / `drives` ∈ string[] — max 8 items each
- `evidence_urls` ∈ string[].url() — REQUIRED for any non-null/non-empty field
- `confidence` ∈ 'high' | 'medium' | 'low'
- `no_data_reason` ∈ string | null — explains empties

If the model returns malformed JSON or violates the schema, the entry stays empty (no cache write). The aggregator's next run is a no-op for that person.

## Output

- Writes to `data/network-database-enrichments.json` (gitignored) under `{id}.inferred = {...}`
- Re-runs `scripts/build-network-database.mjs` so inferred.* lands in `data/network-database.json`

## Surfaces

- Triggered from dashboard popout person detail panel ("Run enricher" button)
- Triggered from full-page view person detail or bulk-enrich (multi-select)
- CLI as above

## Files this skill touches

- READ: `data/network-database.json`
- WRITE: `data/network-database-enrichments.json` (gitignored), `data/network-database-cache/enrich/<id>.json` (gitignored), `data/network-database-cache/cost-log.jsonl` (gitignored)
- Spawns: `scripts/build-network-database.mjs` (aggregator re-run after batch)
