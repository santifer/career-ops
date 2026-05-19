---
name: network-database
description: Build, query, and act on Mitchell's personal network database — 2,910 LinkedIn connections + 2nd-degree paths + engagement signals + emails. Use when Mitchell says "rebuild the network database", "show me the network database", "find warm intros to {company}", "enrich my network for {company}", "find email for {name}", "audit my network coverage at {target}", or any phrasing that asks about who he knows, who can intro him, or what data lives behind the Network tile in the dashboard.
user_invocable: true
---

# network-database — Personal CRM orchestrator

Top-level skill. Routes to one of three operations based on intent.

## What this skill does

1. **Build / rebuild the canonical database** — `node scripts/build-network-database.mjs [--enrich]`. Aggregates Connections.csv + 2nd-degree JSONs + contacts-enriched + outreach-state into `data/network-database.json` (gitignored).
2. **Query the database** — surface results via the dashboard popout (click Network tile) or the full-page advanced view at `https://dashboard.careers-ops.com/network-database.html`.
3. **Enrich a person or batch** — delegate to `network-enricher` (LLM-driven inference) or `network-emailer` (Hunter + pattern-MX).

## When to use

| Intent | Action |
|---|---|
| "rebuild the network database" | `node scripts/build-network-database.mjs` |
| "build the network db with enrichment" | `node scripts/build-network-database.mjs --enrich` |
| "show me warm intros to anthropic" | open `/network-database.html?target=anthropic` OR run `node lib/network-database-search.mjs anthropic` |
| "find email for {first} {last}" | route to `network-emailer` skill with `--person <id>` |
| "enrich top 20 anthropic warm contacts" | route to `network-enricher` skill with `--target-company anthropic --top 20` |
| "show me everyone at OpenAI in my network" | `node lib/network-database-search.mjs openai` or open the full-page view + filter |
| "how many warm paths do I have to {company}?" | `curl localhost:3097/api/network/headline` (look at `totals_by_target`) |

## Files this skill touches

- READ: `data/network-database.json` (gitignored), `data/linkedin/Connections.csv`, `data/linkedin/2nd-degree/*.json`, `data/linkedin/overrides.json`, `data/contacts-enriched.json`, `data/outreach-state.json`, `data/apply-now-queue.json`
- WRITE: `data/network-database.json` (gitignored), `data/network-database-enrichments.json` (gitignored), `data/network-database-notes.json` (gitignored), `data/network-database-cache/` (gitignored)
- NEVER WRITE: `data/linkedin/Connections.csv` (canonical export — only Mitchell re-exports), `data/contacts-enriched.json` (owned by EPSILON's nightly dedup)

## Anti-hallucination guarantees

The schema is in `scripts/build-network-database.mjs:24`. Key invariants:

- `inferred.current_team / likely_projects / drives` default to null / [] — only the enricher populates with cited `evidence_urls`.
- `emails.*.confidence`: `high` = LinkedIn-export OR Hunter `verification=valid` + score ≥ 90; `medium` = Hunter `accept_all` or pattern+MX; `low` = pattern only.
- `warm_to_target_companies` requires an evidence string. Two fire paths:
  - `current_employer:{slug}` — person currently AT an apply-now-target company.
  - `linkedin_mutual:{target_name}` — person is a mutual_connection to a 2nd-degree contact at a target.

## Cost caps

- Enricher (Z.3): $0.50 / person, $50 / batch (top-200 by warm_path_strength × target priority).
- Emailer (Z.4): no LLM spend — Hunter API + DNS MX only.
- Aggregator: free (deterministic file reads).

## Live surfaces

- Dashboard popout (click Network tile): https://dashboard.careers-ops.com/ → Network
- Full-page advanced view: https://dashboard.careers-ops.com/network-database.html
- CLI: `node lib/network-database-search.mjs <query>` for a quick smoke search.

## Wiring depth

End-to-end demo path:
```bash
cd /Users/mitchellwilliams/Documents/career-ops
node scripts/build-network-database.mjs --verbose         # 2,824 people
node lib/network-database-search.mjs "anthropic"          # 45 warm hits
curl -s localhost:3097/api/network/headline | jq          # JSON headline
open https://dashboard.careers-ops.com/network-database.html
```
