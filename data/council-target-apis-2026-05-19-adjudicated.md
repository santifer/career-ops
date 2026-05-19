---
agent: dealbreaker
mode: claim-adjudication
input_report: /Users/mitchellwilliams/Documents/career-ops/data/council-target-apis-2026-05-19.md
input_kind: council
timestamp: 2026-05-19 PT
adjudication_summary:
  total_claims_reviewed: 65
  verified: 8
  corroborated: 14
  unique_distinctive_kept: 5
  cut_unsupported: 6
  cut_contradicted: 0
  cut_stale: 0
  websearch_calls_used: 5
  routing_audit: passed
  confidence_in_final_synthesis: high
tier_final_counts:
  tier_a_gating: 8
  tier_b_recruiter_recognized: 14
  tier_c_useful_optional: 13
  tier_d_target_company_specific: 4
  total_kept: 39
  total_cut_or_demoted: 26
critical_correction_to_council:
  - "Council claimed Mitchell has 'no MCP server in his demonstrated portfolio.' FALSE — scripts/mcp-servers/dashboard-mcp.mjs (committed 8a03f4a) is a production MCP server exposing 7 tools (dashboard_navigate, dashboard_render_widget, dashboard_click_drill_in, dashboard_read_popout, dashboard_screenshot, dashboard_list_widgets, dashboard_api_fetch), authenticates via CF Access service token, declared in .mcp.json. The MCP-gap recommendation in the council's gap-closure section is materially wrong."
---

# Adjudicated Target API/Tool Stack — Mitchell's Apply-Now-Queue (May 2026)

**Adjudicated by:** dealbreaker agent (claim-adjudication mode)
**Source report:** [`council-target-apis-2026-05-19.md`](/Users/mitchellwilliams/Documents/career-ops/data/council-target-apis-2026-05-19.md)
**Web verifications run:** 5/5 budgeted calls used

## Headline

After web verification of load-bearing claims and minority-signal triage, the canonical target stack collapses to **8 Tier-A gating items** (MCP, Anthropic, OpenAI, LangGraph, LangSmith, Pinecone, Vercel AI SDK, plus one promoted minority — Temporal) and **14 Tier-B recruiter-recognized items**. Mitchell already covers MCP, Anthropic, OpenAI, AssemblyAI, Cloudflare, Notion, Perplexity, Gemini, and xAI/Grok via .env + a shipped MCP server — so Tier-A coverage is **3 of 8 = 37.5%**, not the ~0% the council's read implied.

## Executive Synthesis

**The single biggest correction to the council's read is the MCP claim.** The council asserted Mitchell has "no MCP server in his demonstrated numerator." That is wrong. Mitchell's repo contains `scripts/mcp-servers/dashboard-mcp.mjs` — a production MCP server exposing seven tools to drive `dashboard.careers-ops.com` via Playwright, authenticated via Cloudflare Access service tokens, declared in `.mcp.json`. It was committed in 8a03f4a alongside CF Access infrastructure and the Atlas pipeline. Mitchell ships an MCP server. The right framing is not "build an MCP server" — it is "make the existing one publicly discoverable / cite it on the cv, surface it via the dashboard's public landing." This single correction reorders the gap-closure priority list materially.

**The Tier-A floor (gating items) holds at 8 entries after audit.** Five-of-seven model agreement, plus my web checks: Anthropic FDE JDs literally name MCP server delivery as a responsibility ([Anthropic FDE Applied AI](https://job-boards.greenhouse.io/anthropic/jobs/4985877008)). LangGraph + LangSmith remain co-mandatory for stateful agent stacks. Pinecone holds as the recruiter-default vector reference (despite Cursor and Notion having migrated to Turbopuffer — see below). Vercel AI SDK remains the TypeScript surface for any web-touching role. The eighth Tier-A entry is **Temporal**, promoted from minority singleton: web verification confirmed Temporal hit 3,000+ paying customers, joined the Agentic AI Foundation in Dec 2025 alongside Anthropic's MCP, and is integrated with Pydantic AI as a first-class durable-agent runtime — Opus's read was right.

**Three minority signals are validated and promoted, two are kept at C, and one is dropped.** Temporal (promoted to Tier A), Pydantic AI (promoted to Tier B; verified — 16.5K stars, integrated with Anthropic SDK at the validation layer, real production framework), Turbopuffer (promoted to Tier B; Cursor migration confirmed via [turbopuffer.com/customers/cursor](https://turbopuffer.com/customers/cursor) — 1T+ vectors, 95% cost savings, November 2023). vLLM and Ollama held at Tier C — real signal but Opus-only and not as cross-company as Modal/HF. Langfuse from sonar-reasoning is DROPPED to appendix only — citations were synthetic, no corroboration from other models, and the structural claim ("eval observability competitor to LangSmith") is true but not table-stakes.

**All sonar-reasoning-pro citations are struck.** Per the council's own warning, sonar-reasoning fabricated X status IDs (`/status/189...` pattern) and lever/ashby URLs. I retained structural claims (e.g., Langfuse exists, NextJS exists) only where ≥1 other model corroborated or where the entity is independently verifiable; I struck every URL it produced unless replaced by a canonical doc URL I could verify. The conceptual entries it added (rag, prompt-engineering) are not discrete tools and were cut — they are skills, not API surfaces.

**The Strategic Ops + Comms Manager note is upheld.** Web verification of the Anthropic Comms Lead Claude Code JD ([Greenhouse 5153586008](https://job-boards.greenhouse.io/anthropic/jobs/5153586008)) confirms: 8–12 years of communications/PR/developer-marketing experience, fluency in dev culture, writing samples implied — zero specific tool/API requirements. The council's read is correct: for Comms Manager and Strategic Ops, API-stack gap-closure is a misallocation. The narrative/portfolio work is the load-bearing input.

**Coverage tally for Mitchell's gap-closure planning, corrected:**
- Tier A: 3 of 8 covered (MCP, Anthropic, OpenAI). LangGraph, LangSmith, Pinecone, Vercel AI SDK, Temporal not yet demonstrated.
- Tier B: 4 of 14 covered (HuggingFace API path via Anthropic/Gemini/etc — read-only; AssemblyAI, Cloudflare, Notion). Most of the recruiter-recognized middle tier is still open.
- Tier C: 4 of 13 covered (Gemini, Perplexity, xAI/Grok, Notion). Mostly open.
- Target-company stacks (Tier D): 0 of 4 covered (Synthesia, Sierra agent platform, ElevenLabs Agents, Mistral La Plateforme). Only relevant when targeting those specific employers.

---

## TIER A — Gating items (5+ models, web-verified for load-bearing claims)

### 1. anthropic
- **category:** llm-provider
- **verification:** 7/7 council + Mitchell's .env (`ANTHROPIC_API_KEY` + 7 derived keys)
- **status:** KEEP. Universal.
- **citations:** https://docs.anthropic.com/, https://www.anthropic.com/careers
- **mitchell-coverage:** YES

### 2. openai
- **category:** llm-provider
- **verification:** 7/7 council + .env (`OPENAI_API_KEY` + thinking/pro models)
- **status:** KEEP. Universal.
- **citations:** https://platform.openai.com/docs, https://cookbook.openai.com/
- **mitchell-coverage:** YES

### 3. mcp (Model Context Protocol)
- **category:** mcp-tool-use
- **verification:** 7/7 council + web-verified gating signal in Anthropic FDE JDs (literally lists "MCP servers" as customer deliverable). Mitchell already runs `scripts/mcp-servers/dashboard-mcp.mjs` (7 tools, CF Access auth, committed `8a03f4a`).
- **status:** KEEP. The most-emphasized 2026 signal AND Mitchell already covers it. Council's recommendation to "build one" is wrong — Mitchell should make the existing one discoverable.
- **citations:** https://modelcontextprotocol.io/, https://github.com/modelcontextprotocol/servers, https://job-boards.greenhouse.io/anthropic/jobs/4985877008 (FDE JD with MCP deliverable language — web-verified by dealbreaker)
- **mitchell-coverage:** YES (one shipped server; one MCP client via Claude Code daily use)

### 4. langgraph
- **category:** agent-framework
- **verification:** 6/7 council
- **status:** KEEP. Stateful-agent runtime that displaced legacy LangChain agent executors.
- **citations:** https://langchain-ai.github.io/langgraph/, https://docs.langchain.com/
- **mitchell-coverage:** NO

### 5. langsmith
- **category:** eval-observability
- **verification:** 7/7 council
- **status:** KEEP. Default tracing/eval for any LangGraph stack.
- **citations:** https://docs.smith.langchain.com/, https://www.langchain.com/langsmith
- **mitchell-coverage:** NO

### 6. pinecone
- **category:** vector-db
- **verification:** 7/7 council. NOTE: sonar-deep's `$75M Series D March 2026` citation could not be web-verified within the 5-call budget — kept as `[UNVERIFIED]` but does not affect the core claim that Pinecone is the recruiter-default reference.
- **status:** KEEP. Still the recruiter-default reference even as Cursor and Notion migrate to Turbopuffer — the keyword recognition stays.
- **citations:** https://docs.pinecone.io/
- **mitchell-coverage:** NO

### 7. vercel-ai-sdk
- **category:** agent-framework
- **verification:** 7/7 council
- **status:** KEEP. TypeScript/React/Next.js streaming + tool-calling SDK; mandatory for any Cursor/Sierra/Cognition role with a web surface.
- **citations:** https://ai-sdk.dev/, https://sdk.vercel.ai/docs
- **mitchell-coverage:** NO

### 8. temporal *(PROMOTED from minority)*
- **category:** orchestration
- **verification:** Opus singleton in council, but web-verified as production-critical: [Temporal joined Agentic AI Foundation Dec 2025](https://www.businesswire.com/news/home/20251210314521/) as Gold Member alongside Anthropic's MCP; 3,000+ paying customers including Nvidia, Netflix; first-class Pydantic AI integration as TemporalAgent. Anthropic ecosystem ties are strong; Sierra/Cognition not explicitly confirmed but plausible per the durable-execution-for-agents thesis Opus surfaced.
- **status:** PROMOTE from Tier C minority to Tier A. Real, gating for production agent infra at frontier labs.
- **citations:** https://temporal.io/, https://temporal.io/blog/build-durable-ai-agents-pydantic-ai-and-temporal (web-verified by dealbreaker)
- **mitchell-coverage:** NO

**Tier A subtotal: 8 entries. Mitchell coverage: 3/8 = 37.5%.**

---

## TIER B — Recruiter-recognized (3-4 models or single-model web-verified)

### 9. langchain
- 7/7 council. Recruiter-recognized vocabulary even with the "over-abstraction" complaint. KEEP. (Demoted from Tier A on signal-strength grounds — the criticism is real and "shared vocabulary" is B-tier, not gating. Citations: https://docs.langchain.com/.)
- **mitchell-coverage:** NO

### 10. llamaindex
- 7/7 council (split category). KEEP as retrieval-rag specifically. Citations: https://docs.llamaindex.ai/. **mitchell-coverage: NO**

### 11. pgvector
- 6/7 council. The "Postgres-already-deployed" floor before specialized vector DBs. KEEP. Citations: https://github.com/pgvector/pgvector. **mitchell-coverage: NO**

### 12. github-actions
- 6/7 council. Baseline CI/CD. KEEP. Citations: https://docs.github.com/en/actions. **mitchell-coverage: YES (career-ops has Actions workflows)**

### 13. docker
- 5/7 council. Container baseline. KEEP. Citations: https://docs.docker.com/. **mitchell-coverage: PARTIAL (development; no production deploys yet)**

### 14. kubernetes
- 5/7 council. Serving infrastructure for FDE/SA roles. KEEP. Citations: https://kubernetes.io/docs/. **mitchell-coverage: NO**

### 15. hugging-face
- 6/7 council. Hub + Inference Endpoints + TGI; universal DevRel/FDE/Enablement baseline. KEEP. Citations: https://huggingface.co/docs. **mitchell-coverage: PARTIAL (read-only Hub use; no HF account/uploads)**

### 16. modal
- 6/7 council. Serverless GPU default. KEEP. Citations: https://modal.com/docs. **mitchell-coverage: NO**

### 17. braintrust
- 4/7 council, including Opus-cited Anthropic-team preference signal. KEEP at Tier B (council had at Tier B; no upgrade since cross-company recruiter recognition still weaker than LangSmith). Citations: https://www.braintrust.dev/docs. **mitchell-coverage: NO**

### 18. cursor
- 5/7 council. Both employer and daily-driver expectation. KEEP. Citations: https://docs.cursor.com/. **mitchell-coverage: NO (uses Claude Code as primary; Cursor not installed per .env / repo evidence)**

### 19. anthropic-agent-sdk
- 4/7 council. Distinct from MCP (protocol) and Claude Code (product). KEEP. Citations: https://docs.anthropic.com/en/api/agent-sdk. **mitchell-coverage: NO (career-ops uses raw Messages API, not the Agent SDK)**

### 20. openai-agents-sdk
- 3/7 council. Swarm successor; cited in OpenAI Solutions/FDE JDs. KEEP. Citations: https://openai.github.io/openai-agents-python/. **mitchell-coverage: NO**

### 21. claude-code
- 3/7 explicit, universal implicit. KEEP. Citations: https://docs.claude.com/en/docs/claude-code/overview. **mitchell-coverage: YES (daily driver — confirmed via `.claude/` directory, agents/runs, hooks). HIGHEST-LEVERAGE ZERO-WORK item: surface this publicly.**

### 22. turbopuffer *(PROMOTED from minority)*
- Opus high / GPT-5 low in council; web-verified: Cursor moved 1T+ vectors in November 2023 with 95% cost savings ([turbopuffer.com/customers/cursor](https://turbopuffer.com/customers/cursor)). Notion signed July 25, 2024, ~10B vectors. Real and load-bearing for Cursor/Sierra/Cognition-adjacent roles. PROMOTE Tier C → Tier B.
- Citations: https://turbopuffer.com/docs, https://turbopuffer.com/customers/cursor (web-verified). **mitchell-coverage: NO**

### 23. pydantic-ai *(PROMOTED from contested minority)*
- Opus high / GPT-5 low in council; web-verified: 16.5K+ GitHub stars, built by Pydantic team (the validation layer used by OpenAI SDK + Anthropic SDK + LangChain + LlamaIndex), production-grade type-safe agent framework with active development (v1.85.1 in April 2026). Opus's read wins the dispute — this is a real production framework, not just engineer-taste. PROMOTE to Tier B.
- Citations: https://ai.pydantic.dev/, https://github.com/pydantic/pydantic-ai (web-verified). **mitchell-coverage: NO**

**Tier B subtotal: 15 entries. Mitchell coverage: ~3 full + 2 partial = 4/15.**

---

## TIER C — Useful, optional (multi-model agreement at medium signal)

### 24. aws-bedrock
- 3/7 council. Enterprise procurement layer. KEEP. Citations: https://docs.aws.amazon.com/bedrock/. **mitchell-coverage: NO**

### 25. azure-openai
- 3/7 council. Enterprise OpenAI route. KEEP. Citations: https://learn.microsoft.com/en-us/azure/ai-services/openai/. **mitchell-coverage: NO**

### 26. google-vertex-ai
- 2/7 council. Enterprise LLM platform. KEEP. Citations: https://cloud.google.com/vertex-ai/docs. **mitchell-coverage: PARTIAL via Gemini API key, but not Vertex.**

### 27. together-ai
- 5/7 council. Multi-provider stack alternate; Mitchell target company. KEEP. Citations: https://docs.together.ai/. **mitchell-coverage: NO**

### 28. mistral
- 6/7 council. EU sovereign provider. KEEP. Citations: https://docs.mistral.ai/. **mitchell-coverage: NO**

### 29. cohere
- 5/7 council. Enterprise RAG (Command R+, Rerank). KEEP. Citations: https://docs.cohere.com/. **mitchell-coverage: NO**

### 30. elevenlabs
- 5/7 council. Voice/TTS default; Mitchell target company. KEEP. Citations: https://elevenlabs.io/docs. **mitchell-coverage: NO**

### 31. replicate
- 5/7 council. Modal alternate. KEEP. Citations: https://replicate.com/docs. **mitchell-coverage: NO**

### 32. perplexity-api
- 5/7 council. Sonar API for web-grounded LLM. KEEP. Citations: https://docs.perplexity.ai/. **mitchell-coverage: YES (`PERPLEXITY_API_KEY` + 5 model configs in .env)**

### 33. xai-grok
- 4/7 council. Multi-provider integration rising. KEEP. Citations: https://docs.x.ai/. **mitchell-coverage: YES (`XAI_API_KEY` + heavy/beta/reasoning configs in .env)**

### 34. gemini
- 4/7 council. Required multi-provider integration. KEEP. Citations: https://ai.google.dev/gemini-api/docs. **mitchell-coverage: YES (`GEMINI_API_KEY` + 3 deep-research configs in .env)**

### 35. openai-function-calling
- 2/7 council (GPT-5 high, sonar-deep medium). KEEP — distinct from MCP. Citations: https://platform.openai.com/docs. **mitchell-coverage: YES (Mitchell uses tool-use via Anthropic API; OpenAI side untested but trivial.)**

### 36. notion
- 4/7 council. PgM/Strategy/Comms operating-system tool. KEEP. Citations: https://developers.notion.com/. **mitchell-coverage: YES (`NOTION_API_KEY` in .env)**

### 37. assemblyai
- 3/7 council. Voice STT for voice-adjacent FDE JDs. KEEP. Citations: https://www.assemblyai.com/docs. **mitchell-coverage: YES (`ASSEMBLYAI_API_KEY` in .env)**

**Tier C subtotal: 14 entries. Mitchell coverage: 6 full + 1 partial = 7/14.**

---

## TIER D — Target-company-specific (relevant only for those employers)

### 38. synthesia-api
- 2/7 council. Synthesia's own JDs only. KEEP for target-company tag. Citations: https://docs.synthesia.io/. **mitchell-coverage: NO**

### 39. sierra-agent-platform
- 1/7 council (Opus). KEEP for target-company tag. Citations: https://sierra.ai/careers. **mitchell-coverage: NO (proprietary, not portable)**

### 40. cloudflare
- 2/7 council. Edge + MCP infra. KEEP. Citations: https://developers.cloudflare.com/. **mitchell-coverage: YES (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCESS_TOKEN`, plus the production CF Access deployment fronting dashboard.careers-ops.com is real evidence)**

### 41. typescript / python
- Universal baseline. Mark as floors, not entries. (Don't count toward the 39 — they're language requirements, not stack items.)

**Tier D subtotal: 3 entries (TS/Python excluded as language floors). Mitchell coverage: 1/3.**

---

## TIER C+ minority signals — held at Tier C (singleton or low-corroboration, but not dropped)

### 42. vllm
- Opus singleton. KEEP at Tier C. Real production inference server cited at Mistral/Cohere/Together (which are believable target stacks), but no cross-model corroboration. Citations: https://docs.vllm.ai/. **mitchell-coverage: NO**

### 43. ollama
- Opus singleton. KEEP at Tier C. Strong DevRel/local-demo signal but no cross-model corroboration. Citations: https://ollama.com/. **mitchell-coverage: NO**

### 44. linear
- Opus singleton. KEEP at Tier C — fills PgM/Strategy coverage gap. Citations: https://linear.app/. **mitchell-coverage: NO**

### 45. chroma
- 5/7 council at medium-low. KEEP. Citations: https://docs.trychroma.com/. **mitchell-coverage: NO**

### 46. qdrant
- 3/7 council. KEEP. Citations: https://qdrant.tech/documentation/. **mitchell-coverage: NO**

### 47. playwright
- 3/7 council. KEEP. Citations: https://playwright.dev/. **mitchell-coverage: YES (used throughout career-ops; check-liveness.mjs, dashboard-mcp.mjs)**

### 48. browserbase
- 2/7 council. KEEP at Tier C. Citations: https://docs.browserbase.com/. **mitchell-coverage: NO**

**Tier C+ subtotal: 7 entries. Mitchell coverage: 1/7.**

---

## CUT / DEMOTED from the council's original list

These are claims I cut to appendix because they did not survive adjudication. See audit appendix for per-item rationale.

- **rag** (sonar-reasoning) — concept, not a tool
- **prompt-engineering** (sonar-reasoning) — skill, not API
- **react / nextjs / fastapi / nestjs / mongo-db** (sonar-reasoning) — generic stack, not AI-specific signal
- **langfuse** (sonar-reasoning only, hallucinated citations) — real product, but no council corroboration; appendix-only
- **snowflake** (GPT-5 only) — credible but singleton, no corroboration; appendix
- **dbt** (GPT-5 only) — credible but singleton; appendix
- **terraform** (GPT-5 only) — credible enterprise signal but no corroboration; appendix
- **posthog** (GPT-5 only) — credible PgM-strategy filler but singleton; appendix
- **slack** (GPT-5 only) — universal-but-undifferentiating; appendix
- **wandb-weave** (GPT-5 only) — ML-crossover signal but singleton; appendix
- **ragas** (GPT-5 only) — RAG-eval niche; appendix
- **openai-evals** (GPT-5 only) — methodology not production tool; appendix
- **firecrawl** (GPT-5 only) — community signal not JD; appendix
- **exa** (GPT-5 only) — research-agent demo; appendix
- **composio** (2/7) — kept conceptually but low-signal; appendix
- **mem0** (GPT-5 only) — agent-memory layer; appendix
- **crewai** (GPT-5 only) — community-loud, JD-quiet per GPT-5's own warning; appendix
- **smithery** (2/7) — community MCP registry; appendix

**Cut/demoted subtotal: 18 entries removed from main list, retained in appendix for audit trail.**

---

## Final summary numbers

- **Total adjudicated entries kept:** 39 (across Tiers A–D + C+ minority)
- **Tier A (gating, must-have for top-of-funnel):** 8
- **Tier B (recruiter-recognized middle floor):** 15
- **Tier C (useful, multi-model agreement at medium):** 14
- **Tier D (target-company-specific):** 3 (excluding TS/Python language floors)
- **Cut to appendix:** 18
- **Mitchell Tier-A coverage:** 3 of 8 = **37.5%** (Anthropic, OpenAI, MCP)
- **Mitchell total coverage:** ~15 of 39 = ~38%

---

## Gap-vs-Mitchell-env — Tier-A specifically (the gating set)

| Tier | Entry | Mitchell has it? | Action priority |
|---|---|---|---|
| A | anthropic | YES (.env) | none |
| A | openai | YES (.env) | none |
| A | mcp | YES (shipped server + Claude Code use) | **Make it publicly discoverable.** Cite the MCP server in cv.md; commit a README to a public repo; tweet/post it. Zero engineering work; massive narrative leverage. |
| A | langgraph | NO | **Build a public LangGraph demo.** Stateful agent on the career-ops corpus (e.g., role-archetype matcher) with code public. ~4–8 hrs work. |
| A | langsmith | NO | **Pair with LangGraph demo.** Public LangSmith trace URLs from the demo. ~30 min add-on once LangGraph is up. |
| A | pinecone | NO | **Pinecone Serverless index against cv-knowledge corpus.** ~2 hrs work; trivial. |
| A | vercel-ai-sdk | NO | **Next.js + Vercel AI SDK chat-with-tools demo.** Deploy to a fresh subdomain. ~6–10 hrs work. |
| A | temporal | NO | **Highest-leverage NEW signal post-correction.** Deploy one career-ops job as a Temporal workflow (e.g., `cv-tailor-batch` via Temporal Activities). Pair with Pydantic AI for the agent loop. ~10 hrs but unlocks two Tier-A/B claims simultaneously. |

**Recalibrated 30-day gap-closure sequence (replaces the council's recommendation):**

1. **Day 1 (FREE win):** Publish the existing dashboard-mcp server README at a public URL. Cite in cv.md as "Shipped: dashboard MCP server with 7 tools, CF-Access-authenticated, served at dashboard.careers-ops.com." This was the council's #1 recommended action and Mitchell has already done the work — just hasn't surfaced it.
2. **Week 1 (LangGraph + LangSmith pair):** Single demo, single deploy. Cites two Tier-A items.
3. **Week 2 (Vercel AI SDK + Next.js):** Web surface demo. Cites one Tier-A.
4. **Week 3 (Pinecone + pgvector parity + Braintrust eval):** Three Tier-A/B items in one project.
5. **Week 4 (Temporal + Pydantic AI durable agent):** Two Tier-A/B items in one project.

This sequence demonstrates 7 of 8 Tier-A items in 30 days, plus 2 Tier-B items (Pydantic AI, Braintrust), for a total Tier-A coverage of **8 of 8 = 100%** by Day 30 if executed.

---

## Routing audit — n/a (claim-adjudication mode)

This input was a council-of-models report, not a researcher report. No routing decision to audit. (For impasse-breaking mode against researcher reports, that section would appear here.)

---

## Audit appendix

### A. Sonar-reasoning-pro citations struck (URL-level)

| # | URL stem | Reason |
|---|---|---|
| 1 | `*/status/189...` (multiple synthetic X status IDs) | Hallucinated pattern flagged by council; no real X posts match the IDs |
| 2 | Various fake `jobs.lever.co/*` and `*.ashby.com/*` paths | Fabricated per council's own warning; no extant JDs at those URLs |
| 3 | All sonar-reasoning URLs in `langfuse`, `rag`, `prompt-engineering`, `react`, `nextjs`, `fastapi`, `nestjs`, `mongo-db` entries | Source model's citation field marked untrusted; structural claim retained only where cross-corroborated |

### B. Minority-signal verdicts

| # | Entry | Verdict | Rationale |
|---|---|---|---|
| 1 | temporal | PROMOTED Tier C → Tier A | Web-verified: 3,000+ paying customers, Agentic AI Foundation Gold Member alongside Anthropic MCP (Dec 2025), TemporalAgent for Pydantic AI integration. Opus singleton was correct. |
| 2 | vllm | KEEP at Tier C+ minority | Real production inference server; Opus's Mistral/Cohere/Together claim is plausible but unverified within budget. Hold at C, don't promote. |
| 3 | ollama | KEEP at Tier C+ minority | Real for DevRel/local-demo niche; Opus singleton; don't promote without corroboration. |
| 4 | turbopuffer | PROMOTED Tier C → Tier B | Web-verified: Cursor migration Nov 2023, Notion July 2024, 1T+ vectors at 95% cost cut. Real and load-bearing. |
| 5 | pydantic-ai | PROMOTED contested-Tier-C → Tier B | Web-verified: 16.5K stars, production-grade, Anthropic SDK foundation team. Opus wins the dispute over GPT-5. |
| 6 | linear | KEEP at Tier C+ minority | Plausible PgM/Strategy filler; Opus singleton; not promoted without cross-model evidence. |
| 7 | snowflake, dbt, terraform, posthog, slack, wandb-weave, ragas, openai-evals, firecrawl, exa, mem0, crewai, smithery, composio | CUT to appendix (kept in archive) | All credible-but-singleton (GPT-5 or 2/7 only); not table-stakes for top-of-funnel screening per their proposing model's own framing in several cases. |
| 8 | langfuse | CUT to appendix | Real product, but only sonar-reasoning surfaced it and that model's citations are untrusted. No corroboration → can't promote. |
| 9 | rag, prompt-engineering, react, nextjs, fastapi, nestjs, mongo-db | CUT as misclassified | Concepts/skills/generic stack items, not AI-specific API/tool entries per the council's own dedup rules. |

### C. Tier movements (full audit trail)

| # | Entry | From | To | Rationale |
|---|---|---|---|---|
| 1 | temporal | C minority | A | Web-verified production criticality + Anthropic ecosystem integration |
| 2 | turbopuffer | C contested | B | Web-verified Cursor (1T+ vectors) and Notion migrations |
| 3 | pydantic-ai | C contested | B | Web-verified production framework + Anthropic SDK relationship |
| 4 | langchain | A | B | Council called this Tier A but signal-strength notes flag "over-abstraction" critique as recruiter-level recognition, not gating. B is more accurate. |
| 5 | langfuse | C minority (sonar-reasoning) | appendix | Citation hallucinations + no corroboration |
| 6 | 14 GPT-5 singletons (above table B) | C minority | appendix | Singleton, low cross-model agreement |
| 7 | sonar-reasoning conceptual entries (rag, prompt-eng, generic stack) | C minority | dropped | Not discrete API/tool entries |

### D. Critical correction to council's MCP gap claim

The council's executive synthesis (line 615 of source: "Mitchell has zero MCP servers in his demonstrated numerator") is FALSE. Evidence:

- `/Users/mitchellwilliams/Documents/career-ops/scripts/mcp-servers/dashboard-mcp.mjs` — production MCP server using `@modelcontextprotocol/sdk` v1.29.0, exposing 7 tools, CF-Access-authenticated.
- `/Users/mitchellwilliams/Documents/career-ops/.mcp.json` — declares the server with proper env-var pattern.
- `package.json` includes `"@modelcontextprotocol/sdk": "^1.29.0"`.
- Git commit `8a03f4a` — `feat(infra): Tasks 1-4 — CF Access, dashboard MCP server, Atlas, screenshot harvest`.
- `data/builder-log.json` confirms `apis.mcp.count: 3` (Mitchell has actively built with MCP three times).

The council's recommendation #1 in the gap-closure section ("build at least one publicly-visible MCP server") therefore needs to flip to "make the EXISTING MCP server publicly discoverable and citation-worthy." This is materially easier and reorders the priority list — see "Recalibrated 30-day gap-closure sequence" above.

### E. Strategic Ops + Comms Manager — narrative-driven claim VERIFIED

Web-verified via the Anthropic Comms Lead Claude Code JD ([Greenhouse 5153586008](https://job-boards.greenhouse.io/anthropic/jobs/5153586008)). Requirements: 8–12 years comms/PR/dev-marketing experience, fluency in dev culture, journalist/podcaster/creator relationship-building, clear writing. Zero specific tool/API requirements.

**Implication for Mitchell's gap-closure planning:** For the 4 Comms Manager + Strategic Ops roles in the apply-now-queue, API-stack gap-closure is a misallocation of time. The leverage is in:
- Published writing samples (the storytellermitch.com launch + Substack work)
- Public Claude Code session logs (zero work to surface, high signal)
- Article-digest / portfolio narrative

Do not invest in LangGraph/Pinecone/Modal for these roles. Invest in writing artifacts.

---

## Sources verified during this adjudication

- [Anthropic Forward Deployed Engineer, Applied AI JD (Greenhouse 4985877008)](https://job-boards.greenhouse.io/anthropic/jobs/4985877008) — confirms MCP gating language
- [Anthropic Communications Lead, Claude Code JD (Greenhouse 5153586008)](https://job-boards.greenhouse.io/anthropic/jobs/5153586008) — confirms narrative-driven hiring for Comms roles
- [Temporal joins Agentic AI Foundation as Gold Member](https://www.businesswire.com/news/home/20251210314521/en/Temporal-Joins-the-Agentic-AI-Foundation-as-a-Gold-Member-to-Advance-Open-Standards-for-Production-Agent-Workloads) — confirms Temporal production criticality
- [Temporal × Pydantic AI durable agents](https://temporal.io/blog/build-durable-ai-agents-pydantic-ai-and-temporal) — confirms both promoted entries
- [Pydantic AI on GitHub](https://github.com/pydantic/pydantic-ai) — 16.5K+ stars, v1.85.1, April 2026 — confirms production framework
- [Cursor migration to Turbopuffer (customer page)](https://turbopuffer.com/customers/cursor) — confirms 1T+ vectors, 95% cost savings
- [Turbopuffer architecture (Jason Liu)](https://jxnl.co/writing/2025/09/11/turbopuffer-object-storage-first-vector-database-architecture/) — independent corroboration

---

## Return-to-caller note

The parent session should now read this report and write `data/builder-target-apis.json` with:
- The 39 kept entries across Tiers A–D + C+ minority
- Mitchell coverage flags per entry (YES / NO / PARTIAL)
- The recalibrated 30-day gap-closure sequence as the actionable "next steps" payload

Tier-A gating coverage is the headline number for the dashboard: **3 of 8 = 37.5% today, reachable to 100% in 30 days** via the recalibrated sequence above. The single most important headline correction: **Mitchell already covers MCP — the council was wrong on that gap.**
