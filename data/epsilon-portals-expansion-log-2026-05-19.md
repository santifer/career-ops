# EPSILON — Pre-IPO Portals Expansion — 2026-05-19

**Spend:** $1.20 (cap was $15, came in 12× under budget)
**Models used:** sonar-deep-research, grok-4-x-search, sonar-reasoning-pro
**Research:** 2026-05-18T23:55:00-07:00 (researcher subagent runtime: ~13 min)
**10 of 10 verified candidates appended to `portals.yml`**

---

## Method

Researcher agent ran with `--fast --no-dealbreaker` (EPSILON adjudicating). Sources weighted:
1. Direct Ashby / Greenhouse JSON API probes (`api.ashbyhq.com/posting-api/job-board/<slug>` + `boards-api.greenhouse.io/v1/boards/<slug>/jobs`) — verified each candidate had at least one OPEN matching role within ~60 min of report time
2. Forbes AI 50, CB Insights AI 100, recent funding press
3. Vendor blogs + X/Twitter (Grok-4 search)

**Dropped after verification** (researcher noted these for transparency):
- Browserbase — no FDE/SA open right now
- Anyscale — Ray-core + Security + PM only, no matching titles
- Cartesia — research-only roles
- Dust — single borderline Founding AI Deployment Strategist role; preferred clearer matches
- Sourcegraph — last funding Jul 2021; outside 24-mo recency rule
- Poolside — only role is TS/SCI-cleared FDRE; outside Mitchell's clearance
- Lightning AI — Ashby probe surfaced bitcoin-Lightning-Labs (name collision), not the PyTorch Lightning company
- Onyx — no FDE/SA
- PostHog — no AI/Solutions/DevRel
- Distyl AI — only AI Researcher
- CrewAI — Ashby board 404
- Together AI — explicitly excluded per Mitchell's pre-existing portal list

---

## Candidates (in order added to portals.yml)

| # | Company | ATS | Stage | Funding | Archetype matches | careers_url |
|---|---|---|---|---|---|---|
| 1 | Cognition | Ashby | Late-stage | $25B in talks Apr-2026 | A2-FDE × 2, B-DevRel, B-Comms | https://jobs.ashbyhq.com/cognition-ai |
| 2 | Fireworks AI | Greenhouse | Series C | $250M @ $4B (Oct 2025) | A2-SA, A2-FDE, AI PgM, B-DevRel, A2-AB | https://job-boards.greenhouse.io/fireworksai |
| 3 | Modal Labs | Ashby | Series B unicorn | $87M @ $1.1B; in talks $2.5B | A2-FDE × 2, A2-AB, B-DevRel × 2 | https://jobs.ashbyhq.com/modal |
| 4 | Baseten | Ashby | Series D unicorn | $150M @ $2.15B (Sept 2025) | A2-FDE, A2-SA | https://jobs.ashbyhq.com/baseten |
| 5 | Hebbia | Ashby | Series B | $130M @ $700M (a16z-led) | A2-FDE, A2-AB × 2 (NYC + London), A2-FDE finance | https://jobs.ashbyhq.com/hebbia-ai |
| 6 | Maven AGI | Ashby | Series B | $50M (June 2025) | A2-FDE Senior, A2-SA, A2-AB Senior, A2-SA Pre-Sales | https://jobs.ashbyhq.com/maven-agi |
| 7 | Snorkel AI | Greenhouse | Series D unicorn | $100M @ $1.3B (May 2025) | A2-FDE, A2-AB × 3 (incl. Staff Pre-Sales + Federal TS) | https://job-boards.greenhouse.io/snorkelai |
| 8 | Replit | Ashby | Late-stage | $250M @ $3B; $400M @ $9B in talks | A2-FDE + A2-SA (single Field Engineer role) | https://jobs.ashbyhq.com/replit |
| 9 | Braintrust | Ashby | Series B | $80M @ $800M (Feb 2026) | A2-SA, B-DevRel, A2-AB | https://jobs.ashbyhq.com/braintrust |
| 10 | Vellum | Ashby | Series A | $20M (July 2025) | B-Comms / Editorial-Lead | https://jobs.ashbyhq.com/vellum |

---

## Anti-hallucination caveats Mitchell should know

- **Replit** has a single Field Engineer role — less archetype redundancy than the others. If Replit's hiring slows, this entry might go stale faster than the others.
- **Vellum** is the smallest stage in this list (Series A $20M); customer roster (Drata, Swisscom, Redfin, Headspace) is enterprise-grade so growth is plausible, but Series A → Series B funding risk applies.
- **Hebbia's Forward Deployed Banker** role is finance-vertical-specific; the Solutions Engineer NYC + London roles are the cleaner archetype match.
- **Snorkel AI's Federal Applied AI Engineer** role requires TS clearance — Mitchell doesn't have one. The OTHER 3 Snorkel roles in the list are clean matches.
- **Maven AGI's Boston-hybrid** preference means commute weight per `config/profile.yml:107` preferred metros — flag if Mitchell wants to filter Boston out.
- **Modal Labs** Stockholm offices are noted on 2 of their DevRel roles; SF + NYC are the US-based options.

---

## Verification of careers URLs

Each `careers_url` returned a non-404 response with at least 1 matching role visible during the researcher's 60-min verification window. Stale-link defense is via the existing weekly `liveness-sweep` plist + `lib/liveness.mjs`. No additional liveness work needed in this expansion.

---

## Sources cited by researcher

- [Cognition $25B funding talks — SiliconANGLE 2026-04-23](https://siliconangle.com/2026/04/23/cognition-creator-ai-software-engineer-devin-talks-raise-hundreds-millions-25b-valuation/)
- [Fireworks AI $250M Series C — Orrick 2025-11](https://www.orrick.com/en/news/2025/11/fireworks-ai-raises-250-million-series-c-at-4-billion-valuation)
- [Modal Labs $87M Series B — Modal blog](https://modal.com/blog/announcing-our-series-b)
- [Modal Labs in talks for $2.5B — TechCrunch 2026-02-11](https://techcrunch.com/2026/02/11/ai-inference-startup-modal-labs-in-talks-to-raise-at-2-5b-valuation-sources-say/)
- [Baseten $150M Series D @ $2.15B — Fortune 2025-09-05](https://fortune.com/2025/09/05/exclusive-baseten-ai-inference-unicorn-raises-150-million-at-2-15-billion-valuation/)
- [Hebbia $130M Series B — TechCrunch 2024-07-09](https://techcrunch.com/2024/07/09/ai-startup-hebbia-rased-130m-at-a-700m-valuation-on-13-million-of-profitable-revenue/)
- [Maven AGI $50M Series B — PRNewswire 2025-06](https://www.prnewswire.com/news-releases/maven-agi-raises-50m-to-meet-surging-demand-for-enterprise-grade-ai-302484913.html)
- [Snorkel AI Series D $100M — Tracxn](https://tracxn.com/d/companies/snorkel-ai/__-dGw6Pyn7pLIBKs5yfyA5FUaeAHPmFQySQ2J9Esr41U/funding-and-investors)
- [Replit $250M @ $3B — Bloomberg 2025-09-10](https://www.bloomberg.com/news/articles/2025-09-10/ai-coding-startup-replit-valued-at-3-billion-with-new-funding)
- [Replit $400M @ $9B in talks — TFN 2026](https://techfundingnews.com/replit-grabs-400m-at-9b-valuation-in-the-ai-coding-race-with-openai-and-cursor/)
- [Braintrust $80M Series B @ $800M — SiliconANGLE 2026-02-17](https://siliconangle.com/2026/02/17/braintrust-lands-80m-series-b-funding-round-become-observability-layer-ai/)
- [Vellum $20M Series A — Vellum blog 2025-07-10](https://www.vellum.ai/blog/announcing-our-20m-series-a)

---

## Researcher notes on Round 1 model dispatches (transparency)

- Sonar Deep Research consumed all tokens in `<think>` analysis and didn't emit final JSON ($0.80, salvaged from CoT)
- Grok-4-x-search returned only 1 candidate (Maven AGI — verified $0.10)
- Sonar Reasoning Pro Round 2 returned empty content (known issue with verification-style prompts — $0.30 wasted)
- The 10-candidate list above was verified by the researcher orchestrator via direct ATS API probes within last 60 min before report time. Final list is solid; the cross-model corroboration story is thin (one corroborated by Grok, rest single-model + direct API verification).
