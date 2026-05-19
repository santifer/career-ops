---
name: network-emailer
description: Find a professional email for a person in Mitchell's network database using Hunter.io API plus pattern permutations with DNS MX verification (NO SMTP probing). Use when Mitchell says "find email for {name}", "get me {name}'s email", "run the network emailer", or any phrasing that asks for an actionable email address for a known contact. Defers to network-database for the data layer.
user_invocable: true
---

# network-emailer

Sub-skill of `network-database`. Resolves a professional email for one person or a top-N batch, with strict confidence banding.

## When to use

| Intent | Command |
|---|---|
| "find email for {person_id}" | `node scripts/agents/network-emailer.mjs --person <id>` |
| "find email for top 100 warm contacts" | `node scripts/agents/network-emailer.mjs --top 100` |
| "find email for top 20 anthropic warm" | `node scripts/agents/network-emailer.mjs --target-company anthropic --top 20` |
| "test in dry-run mode" | append `--dry-run` |

## Resolution order (deterministic)

1. **Existing entry check** — if `data/contacts-enriched.json` already has a Hunter-verified address for this name, skip (never overwrite).
2. **Hunter.io API** — if `HUNTER_API_KEY` is in `.env`. Returns `{ email, score, verification, pattern }`. Confidence:
   - `verification=valid` && `score ≥ 90` → **high**
   - `verification=valid` OR `verification=accept_all` → **medium**
   - else → **low**
3. **Pattern permutation + DNS MX verify** — `first.last@`, `flast@`, `firstlast@`, `first_last@`, `last.first@`, `first@`. Domain inferred from `current_company`. MX-verified via `dns.resolveMx()`. Confidence: **medium** (pattern + MX).
4. **NO SMTP probing** — never sends a probe email, never opens a TCP socket to the MX server, never any send-side validation.

## Anti-hallucination contract

`confidence = 'high'` REQUIRES Hunter `verification=valid` AND score ≥ 90 AND a `verified_at` timestamp. The dashboard's confidence-badge UI faithfully renders this band; downstream consumers MUST NOT promote a `medium` or `low` to `high` without a real Hunter call.

## Tonight's cap

- 200 people / batch (sorted by `warm_path_strength`)
- No LLM spend
- Hunter spend: $0.005 / API call typical → max $1 / batch

## Output

- Writes to `data/network-database-enrichments.json` under `{id}.email_guess = {...}`
- Re-runs aggregator (only if any new emails found) so emails.professional[] lands in `data/network-database.json`

## Files this skill touches

- READ: `data/network-database.json`, `data/contacts-enriched.json` (skip-if-existing check)
- WRITE: `data/network-database-enrichments.json` (gitignored), `data/network-database-cache/mx-cache.json` (gitignored)
- NEVER WRITE: `data/contacts-enriched.json` (owned by EPSILON's dedup)
- Spawns: `scripts/build-network-database.mjs` (aggregator re-run after batch)
