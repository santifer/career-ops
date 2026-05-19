# Phase B Cost Overrun — Halted After 1 Contact (2026-05-19)

## What happened

Phase B (top-100 priority enrichment) was launched with a $40 cap to enrich 50 contacts via the 3-way council (Perplexity Sonar Pro + Sonnet 4.6 + Grok-4-X-search).

The very first contact (Jake Standish, OpenAI) ran for 34 seconds and cost **$97.22** — well over the brief's projected $0.50/contact (162× overrun). The cap fired correctly and halted after 1 contact.

## Why the cost was so high

Each model in the 3-way council was rated for cost as:
- `perplexity:sonar-pro`: $9/1K blended ($3 input + $15 output)
- `anthropic:claude-sonnet-4-6`: $9/1K blended ($3 input + $15 output)
- `xai:grok-4-x-search`: $3/1K blended ($1 input + $5 output)

The contact-enrichment prompt is rich (instructions + voice rules + schema + contact context) — roughly 1.5K tokens in + 3.5K maxTokens out = ~5K tokens/model.

Cost math: 5K × $9 (sonar) + 5K × $9 (sonnet) + 5K × $3 (grok) = $45 + $45 + $15 = **$105/contact at full max-token utilization**.

The brief's $0.50/contact estimate assumed sonar-pro alone at much smaller token volumes (closer to 1K total), which is unrealistic for a schema this rich.

## Why the result was useless

`data/contact-enrichment-cache/jake-standish-openai.json`:
- `fields_populated`: 1 (just `best_channel: 'linkedin_dm'`)
- `linkedin_topics`: empty
- `recent_engaged_posts`: empty
- `outreach_recommendation.positioning`: null
- `source_urls`: 5 URLs, ALL unrelated to Jake (Duke law school hearings, US-China commission reports, CFA institute monographs, INCOSE engineering vol 28-4) — citation hallucination
- `no_data_reason`: "I could not access any public content or activity for Jake Standish's LinkedIn profile (only the bare profile shell is visible without connections, and no posts or activity are shown), and I could not find a verified X/Twitter account or other public profiles tied to this name and role at OpenAI."
- `verifier_passed`: false (verifier_dissent_count: 2 — sonnet + grok disagreed with sonar)

## The fundamental issue

LinkedIn requires authenticated sessions for ANY meaningful profile inspection (posts, comments, reactions, engagement timeline). The 3-way council has no LinkedIn auth — it only sees the bare-profile shell pages.

X (Twitter) has stricter rate-limits and the API costs are bundled into Grok's search but the public data is sparse for most contacts.

For contacts with private LinkedIn profiles AND no public X presence — which is **most** of Mitchell's directory — the enrichment returns empty results at full cost.

## Recommendations

1. **HALT Phase B in current design.** The cost-to-value ratio is wrong.
2. **NEEDS_HUMAN — pivot decision required**, with three options:
   - **Option A (low spend, mechanical):** Set up LinkedIn auth via `node scripts/scrape-contact-photo.mjs --setup-auth`. Then scrape LinkedIn posts via Playwright in-session (no LLM). This gives real engagement signal but only for the auth duration.
   - **Option B (medium spend, hybrid):** Use a cheaper 2-way council (sonar-pro + grok-X, NO sonnet). Drop maxTokens to 1500. Reduce schema. Skip contacts whose `current_at_target_co` signal is the only positive — those are public profiles with little activity.
   - **Option C (high spend, full):** Keep the 3-way council but ONLY enrich contacts where: (a) they have an X handle on file (Grok can read those), OR (b) their LinkedIn is public per first-pass test. Skip everyone else.
3. **Phase D (next-400) is BLOCKED on the pivot decision.** Same cost math applies — $97 × 400 = $38,800. Way over budget.
4. **Day-1 batch via refresh-master --layer 2** uses the same code path → also blocked. Disable for now by setting `daily_count: 0` in config/contact-priority-weights.yml until the pivot lands.

## Spend recorded

- Phase B run: **$97.22** (1 contact, Jake Standish — verifier failed, fields_populated=1)
- Total Phase B spend so far: $97.22
- Brief's budget: $60 for top-100 → 100% used on 1 contact at this rate

## Cache file is kept

Even though Jake's enrichment was useless, the cache file is on disk at `data/contact-enrichment-cache/jake-standish-openai.json` so the Day-30 audit can correlate the priority score (5.7, highest) against the actual outcome. This is the right behavior — we don't fabricate when we can't enrich.

## Auto-pause action

Setting `daily_count: 0` in config/contact-priority-weights.yml so the refresh-master per-contact handler doesn't accidentally fire more enrichments before Mitchell decides the pivot.
