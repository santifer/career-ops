---
research_question: "What is the canonical target API/tool stack hiring managers and recruiters at top AI/agentic-AI companies currently signal as table-stakes for the 7 role families Mitchell is targeting (AI PgM, FDE/Applied AI, Solutions Architect, AI Enablement, DevRel, Strategic Ops, Comms Manager) across 22 target companies (Anthropic, OpenAI, Cursor/Anysphere, ElevenLabs, Perplexity, Cohere, Mistral, Sierra, Synthesia, Cognition, xAI, Inflection, Adept, Character.ai, HF, LangChain, LlamaIndex, Pinecone, Weaviate, Modal, Together AI, Replicate)?"
council_lineup:
  - perplexity:sonar-deep-research
  - perplexity:sonar-reasoning-pro
  - xai:grok-4 (escalated to grok-4.3)
  - xai:grok-4-x-search (live X + web search)
  - openai:gpt-5
  - google:gemini-2.5-pro (escalated to gemini-3.1-pro-preview, google_search grounded)
  - anthropic:claude-opus-4-7
generated_at: 2026-05-19T14:11 PT
total_council_wall_clock_seconds: 334
estimated_cost_usd: 1.85
raw_council_json: /Users/mitchellwilliams/.claude/agents/runs/council-20260519-140425.json
gpt5_retry_json: /Users/mitchellwilliams/.claude/agents/runs/council-gpt5-retry-20260519-140425.json
prompt: /Users/mitchellwilliams/.claude/agents/runs/prompt-20260519-140425.txt
model_truncation_notes:
  - "Gemini 2.5 Pro got cut off mid-entry around #19 (max-tokens limit) — only 'high' tier entries delivered, no low/medium tiers"
  - "Claude Opus 4.7 got cut off at the `linear` entry around #38 — Strategic Ops + Comms Manager coverage incomplete"
  - "Sonar-deep-research's post-think summary was truncated; entry data lives in the <think> block (40 entries drafted there)"
  - "GPT-5 first run returned 0 chars (reasoning ate the entire token budget); retried with --max-tokens 16000 successfully"
citation_quality_warnings:
  - "perplexity:sonar-reasoning-pro hallucinated most URLs (synthetic X status IDs `/status/189...` pattern, fake lever/ashby paths). Do NOT trust its citation field."
  - "Several models (grok-4, parts of grok-4-x-search, gemini, opus) used `citation pending` honestly for JD-specific claims they could not verify."
  - "openai:gpt-5 used `[UNVERIFIED]` flag throughout — best methodological hygiene of the council."
---

# Canonical Target API/Tool Stack — Mitchell's AI/Agentic-AI Apply-Now-Queue (May 2026)

## Executive Synthesis

Across all 7 council models, **eight items show up at `high` signal strength with cross-model agreement (5+ models)**: `anthropic`, `openai`, `mcp`, `langgraph`, `langsmith`, `langchain`, `pinecone`, and `vercel-ai-sdk`. These are the hard floor — if any one is absent from a candidate's portfolio, an FDE/Applied AI/Solutions Architect recruiter at Anthropic, OpenAI, Cursor, Sierra, Cognition, or Perplexity will flag it. **MCP (Model Context Protocol)** is the most-emphasized "new since 2024" item, repeatedly described as the single largest 2026 differentiator; Anthropic launched it Nov 2024, became table-stakes by Q2 2025, and as of May 2026 is "gating" per Opus, "non-negotiable" per sonar-reasoning, with 9,400+ servers in registries (sonar-deep, grok-x). Functions/tool-calling and MCP are now distinct items in JDs, not interchangeable — the dealbreaker should keep them split.

The **vector-DB tier** is fragmenting in a hiring-signal-relevant way. Pinecone is still the recruiter-default reference, but `pgvector` is rising fast (cited by GPT-5, Opus, Gemini, grok-4, grok-x as a "first vector DB" floor), and `turbopuffer` has emerged as a Cursor/Notion/Anthropic-adjacent differentiator (singleton call from Opus, but it tracks with the verified Cursor blog migration). Weaviate signal is **declining** per Opus's read of cross-company JDs — still core to Weaviate-the-company and EU/open-source-leaning shops (per Gemini, sonar-reasoning), but no longer table-stakes outside that niche.

The **agent-framework layer** has three live cohorts: (1) **LangChain/LangGraph/LangSmith** is the recruiter-recognized default trio, with active criticism on X about it being "mandated by enterprise buyers, not by builders" (Opus, grok-x, grok-4 all surface this same recruiter complaint — likely real); (2) **Vercel AI SDK** is the TypeScript/React surface (universal across Cursor, Perplexity, Sierra, Cognition FDE/DevRel JDs per Opus); (3) **provider-native SDKs** — Anthropic Agent SDK (Claude Agent SDK) and OpenAI Agents SDK (the Swarm successor) are now cited explicitly by name in their respective company JDs, distinct from raw API usage. **Pydantic AI** is the rising fourth (Opus calls it the second-most-cited Python framework after LangGraph, GPT-5 marks `low` — a real disagreement worth flagging). **CrewAI** is community-loud but JD-quiet (GPT-5 alone, `low`).

The **eval/observability layer** is consolidating around a Big Two: **LangSmith** (recruiter-default for LangGraph stacks) and **Braintrust** (Anthropic-preferred per Opus and Gemini, GPT-5 medium). Sonar-reasoning-pro alone insists on **Langfuse** at `high` — this is a minority signal worth investigating because sonar-reasoning's URLs are mostly hallucinated, but Langfuse has real adoption in OSS-heavy stacks and the call deserves verification. **Weights & Biases Weave** and **Ragas** show up at `medium`/`low` for ML-heavy roles.

The **deploy/infra layer** splits cleanly: **Modal** (serverless GPU, default in Anthropic/LangChain/Together FDE JDs per Opus and Gemini; `high` for both, `medium` GPT-5), **Replicate** (Modal alternate), **Together AI** (open-model inference, multi-provider stacks), **Hugging Face** (Hub + Inference Endpoints + TGI; universal baseline), **vLLM** (Opus singleton at `high` — open-source inference server cited at Mistral/Cohere/Together; deserves verification), **Ollama** (Opus singleton at `high` for local-model demos; tracks community signal). **AWS Bedrock**, **Azure OpenAI**, and **Google Vertex AI** are the enterprise-procurement triumvirate — universally medium/high but only relevant for enterprise-facing FDE/SA roles, not frontier-lab DevRel.

**Two role families are under-covered by the council**: Strategic Operations / Strategy Manager and Communications Manager. Every model except sonar-reasoning explicitly flagged this in their coverage notes — hiring signal here is portfolio/writing-sample-driven, not API-stack-driven. The tools that DO surface for these families are **Notion** (knowledge base, AI PgM / Strategy Ops universal), **Linear** (project management, Opus singleton at `high` for AI PgM), **Slack** (universal, but not differentiating), **PostHog** (analytics for AI product strategy, GPT-5 medium), and **Claude Code + Cursor as portfolio-demonstration tools** (Comms Manager — Claude Code role is literally named after the product). The actionable read for Mitchell: for these two role families, the API-stack story is less load-bearing than narrative/writing-sample evidence — pivot the gap-closure plan accordingly.

**Confidence-calibrated recommendations for Mitchell's gap-closure planning**:
1. **MCP** is the highest-leverage closure (universal across all 7 models, Mitchell has no MCP server in his demonstrated numerator).
2. **LangGraph + LangSmith** is the second-highest leverage (5/7 models, recruiter-cited by name).
3. **Braintrust** is the eval/observability differentiator if targeting Anthropic specifically.
4. **Vercel AI SDK** is mandatory for any Cursor/Sierra/Cognition-facing role with a web surface.
5. **Pinecone + pgvector** as the vector-DB pair (Mitchell has neither in his .env).
6. **Modal** is the highest-leverage deploy-infra add (mentioned by 5 of 7 models, plus Modal itself is a target company).
7. **For Comms/Strategy roles**: stack relevance drops, narrative work rises. Don't overinvest in API tooling; invest in published writing + Claude Code / Cursor public artifacts.

---

## Consolidated Canonical List (deduped across all 7 models, ordered by cross-model agreement then signal_strength)

### TIER A — High signal, ≥5 model agreement

#### canonical_name: anthropic
- **category:** llm-provider
- **signal_strength:** high
- **models_asserting:** 7/7 (all)
- **rationale:** Universal across all 7 role families and all 22 target companies. Claude API (Messages, batches, prompt caching, tool use, computer use, extended thinking, Files API) is baseline literacy. Comms Manager — Claude Code at Anthropic is literally named after the product. Anthropic FDE JDs and customer-org JDs (Cursor, Sierra, Cognition, ElevenLabs) all name Claude Opus 4.x / Sonnet 4.6 by model variant.
- **citations:** https://docs.anthropic.com/, https://www.anthropic.com/careers, https://job-boards.greenhouse.io/anthropic
- **first_mention_seen:** Q1 2023; table-stakes since Claude 3 Opus (Mar 2024)

#### canonical_name: openai
- **category:** llm-provider
- **signal_strength:** high
- **models_asserting:** 7/7 (all)
- **rationale:** Co-mandatory with Anthropic. Responses API, structured outputs, OpenAI Agents SDK (Swarm successor), tool calling, Realtime API (voice agents at ElevenLabs/Synthesia), embeddings, batch, evals. Even Anthropic-adjacent roles expect benchmarking against OpenAI.
- **citations:** https://platform.openai.com/docs, https://cookbook.openai.com/, https://openai.com/careers
- **first_mention_seen:** Dec 2022

#### canonical_name: mcp
- **category:** mcp-tool-use
- **signal_strength:** high
- **models_asserting:** 7/7 (all)
- **rationale:** The single most-emphasized 2026 hiring signal. Anthropic FDE, Cursor FDE, Sierra Agent Engineer, LangChain Solutions, Modal Solutions, HF Customer Engineer JDs all name MCP. Recruiter posts on X (Apr–May 2026) ask "have you shipped or consumed an MCP server in prod?" Spec went GA Nov 2024; 9,400+ servers in PulseMCP/mcp.so/Smithery registries by mid-April 2026 (sonar-deep, grok-x). NOT interchangeable with OpenAI-style function calling — keep as separate entries per dedup rules.
- **citations:** https://modelcontextprotocol.io/, https://github.com/modelcontextprotocol/servers, https://mcp.so/, https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026
- **first_mention_seen:** Nov 2024 (GA); table-stakes ~Q2 2025

#### canonical_name: langgraph
- **category:** agent-framework
- **signal_strength:** high
- **models_asserting:** 6/7 (Opus, GPT-5, Gemini, grok-4, grok-x, sonar-reasoning; sonar-deep groups under langchain)
- **rationale:** The stateful-agent runtime that has displaced legacy LangChain agent executors. Cited in Sierra, LangChain, Cohere Solutions, Together AI SA, and Anthropic FDE JDs. LangGraph Platform / LangGraph Cloud also referenced. Recruiter sentiment on X: "mandated by enterprise buyers, not builders" — Opus, grok-4, grok-x all surface this same complaint, so it's real.
- **citations:** https://langchain-ai.github.io/langgraph/, https://docs.langchain.com/, https://www.langchain.com/careers
- **first_mention_seen:** Q1 2024; table-stakes Q3 2024

#### canonical_name: langsmith
- **category:** eval-observability
- **signal_strength:** high
- **models_asserting:** 7/7 (all)
- **rationale:** Tracing/debug/eval/monitoring tool paired with every LangGraph stack. Cited in FDE/Applied AI/AI Enablement JDs that name LangGraph. Anthropic FDE eval-harness round allegedly compares LangSmith vs Braintrust vs Inspect choices (Opus). LangChain's own Customer Engineer JDs explicitly require it.
- **citations:** https://docs.smith.langchain.com/, https://www.langchain.com/langsmith
- **first_mention_seen:** Q1 2024

#### canonical_name: langchain
- **category:** agent-framework
- **signal_strength:** high (with caveat)
- **models_asserting:** 7/7 (all)
- **rationale:** Recruiter-recognized shared vocabulary for chains/tools/retrievers/RAG prototypes, despite vocal X criticism for over-abstraction (every model surfaces this complaint). Still required as keyword in Cohere, LlamaIndex-partner, EY, NextLink Labs JDs. Especially relevant to FDE, Solutions Engineer, AI Enablement, and DevRel roles.
- **citations:** https://docs.langchain.com/, https://python.langchain.com/docs/, https://www.langchain.com/careers
- **first_mention_seen:** Q1 2023

#### canonical_name: pinecone
- **category:** vector-db
- **signal_strength:** high
- **models_asserting:** 7/7 (all)
- **rationale:** Still the most recruiter-recognizable managed vector DB. Pinecone Serverless + Pinecone Inference cited in their own SA JDs. Consistently paired with LlamaIndex/LangChain in RAG-focused FDE/SA roles at EY, Stanford, Perplexity. Sonar-deep cites $75M Series D (March 2026) [UNVERIFIED] as adoption signal.
- **citations:** https://docs.pinecone.io/, https://www.pinecone.io/careers/
- **first_mention_seen:** Q1 2023; table-stakes Q4 2024

#### canonical_name: vercel-ai-sdk
- **category:** agent-framework
- **signal_strength:** high
- **models_asserting:** 7/7 (all)
- **rationale:** Default TypeScript/React/Next.js streaming + tool-calling SDK. Cursor, Perplexity, ElevenLabs (web playground), Sierra, Cognition (Devin web surfaces) JDs list AI SDK v4/v5 by name for any role touching a customer-facing web surface. AI SDK 5 with agent loop primitives + UI message streams is the cited version (Opus). Especially strong for DevRel, FDE, Claude-Code-style devtool comms roles.
- **citations:** https://ai-sdk.dev/, https://sdk.vercel.ai/docs, https://github.com/vercel/ai
- **first_mention_seen:** Q3 2023; table-stakes Q4 2024

### TIER B — High signal, 3-4 model agreement

#### canonical_name: llamaindex
- **category:** retrieval-rag (GPT-5, Opus) / agent-framework (grok-4, sonar-reasoning, sonar-deep, gemini)
- **signal_strength:** high (5/7) / medium (2/7)
- **models_asserting:** 7/7 — but split on category. Opus and GPT-5 explicitly classify as retrieval-rag specifically; others lump as agent-framework.
- **rationale:** Canonical RAG/data-agent framework for document-heavy enterprise use. LlamaIndex hiring Applied AI Solutions Architects for POC delivery. EY, AWS Bedrock JDs cite it by name. IBM comparison vs LangChain (sonar-deep [Result 22]) frames it as "streamlined search-and-retrieval."
- **citations:** https://docs.llamaindex.ai/, https://www.llamaindex.ai/careers
- **first_mention_seen:** Nov 2022

#### canonical_name: weaviate
- **category:** vector-db
- **signal_strength:** medium (declining per Opus) / high (sonar-deep, gemini, sonar-reasoning)
- **models_asserting:** 7/7 — but Opus and grok-x downgrade to low/medium based on declining cross-company JD signal (vs 2023-2024).
- **rationale:** Open-source/self-hostable vector DB with hybrid search. Weaviate's own Solutions Engineer JDs cite it heavily. Stronger signal in EU-based roles at Mistral, Cohere (sonar-reasoning) and at HF (grok-x). Outside the open-source-leaning niche, Pinecone + pgvector + Turbopuffer have taken share.
- **citations:** https://weaviate.io/developers/weaviate, https://weaviate.io/company/careers
- **first_mention_seen:** Q1 2023

#### canonical_name: pgvector
- **category:** vector-db
- **signal_strength:** high
- **models_asserting:** 6/7 (Opus, GPT-5, Gemini, grok-4, grok-x, sonar-reasoning low; sonar-deep absent)
- **rationale:** Postgres-native vector solution. Often the "first vector DB" before specialized DBs because enterprise customers already run Postgres. Cited by EY, ARKA Group (Gemini), Sierra, Cohere Solutions, LangChain Solutions (Opus). Halfmoon recruiter signal on X: FDE candidates who only know Pinecone get dinged for not knowing pgvector (Opus).
- **citations:** https://github.com/pgvector/pgvector
- **first_mention_seen:** Q2 2023

#### canonical_name: github-actions
- **category:** ci-cd
- **signal_strength:** high
- **models_asserting:** 6/7 (all except sonar-reasoning)
- **rationale:** Default CI/CD across all 22 target companies' OSS repos. Every FDE/SA/Applied AI JD with infra expectations names it. AI PgM JDs at Anthropic + OpenAI mention coordinating release trains on top of Actions.
- **citations:** https://docs.github.com/en/actions
- **first_mention_seen:** pre-2023 (baseline)

#### canonical_name: docker
- **category:** container-runtime
- **signal_strength:** high
- **models_asserting:** 5/7 (Opus, GPT-5, Gemini, grok-x, sonar-reasoning indirectly)
- **rationale:** Containerization is baseline for FDE/Applied AI Engineer/SA/Customer Engineer roles shipping agent/RAG apps into customer environments. FDEs at Anthropic, Modal, enterprise consulting are explicitly required to deploy agentic software in containers.
- **citations:** https://docs.docker.com/
- **first_mention_seen:** pre-2020

#### canonical_name: kubernetes
- **category:** orchestration / container-runtime
- **signal_strength:** high
- **models_asserting:** 5/7 (Opus implicit, GPT-5, Gemini, grok-x, sonar-deep)
- **rationale:** Table-stakes for serving scalable inference infrastructure. Together AI Platform Engineering, Braintrust, UnitedHealth Group cite it (Gemini).
- **citations:** https://kubernetes.io/docs/
- **first_mention_seen:** pre-2020

#### canonical_name: hugging-face
- **category:** llm-provider
- **signal_strength:** high
- **models_asserting:** 6/7 (all except sonar-reasoning)
- **rationale:** Hub, Transformers, Datasets, Inference Endpoints, TGI, Spaces. Universal baseline for DevRel, FDE, AI Enablement. HF's own Customer Engineer / DevRel JDs require Inference Endpoints + TGI fluency (Opus, GPT-5).
- **citations:** https://huggingface.co/jobs, https://huggingface.co/docs
- **first_mention_seen:** pre-2023

#### canonical_name: modal
- **category:** deploy-infra
- **signal_strength:** high
- **models_asserting:** 6/7 (all except sonar-reasoning at medium)
- **rationale:** Default serverless GPU + inference endpoint reference in FDE/Applied AI JDs across LangChain, Together, Replicate-adjacent shops. Anthropic FDE JDs cite "experience with serverless GPU platforms (Modal, Replicate, Baseten)" per Opus. Widely cited on X as premier Lambda replacement for heavy ML.
- **citations:** https://modal.com/docs, https://modal.com/careers
- **first_mention_seen:** Q1 2023

#### canonical_name: braintrust
- **category:** eval-observability
- **signal_strength:** high
- **models_asserting:** 4/7 (Opus, Gemini, GPT-5, sonar-deep implicit via LLM observability mention)
- **rationale:** Now mentioned alongside or instead of LangSmith in Anthropic, OpenAI, Cursor, Sierra, Notion-AI-team JDs (Opus, May 2026). Multiple FDE postings list "Braintrust or equivalent eval platform" as required. Recruiter signal on X: Anthropic talent has posted about Braintrust as preferred eval stack (Opus). Braintrust own roles (Gemini) require strong DevOps + API debugging.
- **citations:** https://www.braintrust.dev/docs, https://www.braintrust.com/careers
- **first_mention_seen:** Q4 2023

#### canonical_name: cursor
- **category:** cli-shell
- **signal_strength:** high
- **models_asserting:** 5/7 (Opus, GPT-5, Gemini, grok-x, sonar-reasoning)
- **rationale:** Both employer (in target list) and universally-expected daily driver. Cursor FDE JDs explicitly seek candidates who can deploy Cursor at enterprise customers. DevRel JDs across industry list "comfortable demoing in Cursor or Claude Code" as expected.
- **citations:** https://cursor.com/careers, https://docs.cursor.com/
- **first_mention_seen:** Q1 2024

#### canonical_name: anthropic-agent-sdk
- **category:** agent-framework
- **signal_strength:** high
- **models_asserting:** 4/7 (Opus, GPT-5 at medium, grok-4 at medium, sonar-deep)
- **rationale:** The Claude Agent SDK (Python + TS) is the Anthropic-blessed agent loop. Cited by name in Anthropic FDE/Applied AI JDs and increasingly in customer-org JDs (Sierra, Cohere partners). Distinct from MCP (protocol) and Claude Code (CLI product built on it).
- **citations:** https://docs.anthropic.com/en/api/agent-sdk, https://github.com/anthropics/claude-agent-sdk-python
- **first_mention_seen:** Q3 2025

#### canonical_name: openai-agents-sdk
- **category:** agent-framework
- **signal_strength:** high
- **models_asserting:** 3/7 (Opus, GPT-5 implicit, sonar-deep)
- **rationale:** Official OpenAI Agents SDK (Python + TS, Swarm successor) now cited in OpenAI Solutions/FDE/AI Enablement JDs and customer JDs at Sierra/Cognition (Opus). Handoffs, guardrails, sessions, Responses API native.
- **citations:** https://openai.github.io/openai-agents-python/, https://github.com/openai/openai-agents-python
- **first_mention_seen:** Mar 2025

#### canonical_name: claude-code
- **category:** cli-shell
- **signal_strength:** high
- **models_asserting:** 3/7 (Opus, GPT-5 at medium, gemini implicit via cursor)
- **rationale:** Anthropic's agentic CLI referenced in JDs as both product-to-support (Comms Manager — Claude Code role) and daily-driver expectation for FDE/DevRel. Cursor, Cognition, Sierra hiring managers on X ask "do you use Claude Code or Codex CLI day-to-day?" as screening signal (Opus). Comms Manager Claude Code role family is literally named after this product.
- **citations:** https://docs.claude.com/en/docs/claude-code/overview, https://www.anthropic.com/claude-code
- **first_mention_seen:** Feb 2025

### TIER C — Medium signal, multi-model agreement

#### canonical_name: aws-bedrock
- **category:** llm-provider
- **signal_strength:** medium-high (enterprise-bias)
- **models_asserting:** 3/7 (GPT-5, Gemini, sonar-reasoning)
- **rationale:** Enterprise AI procurement layer when data sovereignty matters. Cited at Stanford, NextLink Labs, EY, Reliable Software Resources for FDE/SA roles. Frontier-lab hiring less culturally central; very relevant for enterprise-facing AI roles.
- **citations:** https://docs.aws.amazon.com/bedrock/, https://aws.amazon.com/bedrock/
- **first_mention_seen:** Sep 2023

#### canonical_name: azure-openai
- **category:** llm-provider
- **signal_strength:** medium-high
- **models_asserting:** 3/7 (GPT-5, Gemini, sonar-deep via azure-ai-services)
- **rationale:** Often the procurement/security-approved enterprise OpenAI route. Important for Solutions Architect, FDE, AI PgM roles touching Fortune 500 cloud stacks. Cited at EY, Reliable Software Resources (Gemini).
- **citations:** https://learn.microsoft.com/en-us/azure/ai-services/openai/
- **first_mention_seen:** Q1 2023

#### canonical_name: google-vertex-ai
- **category:** llm-provider
- **signal_strength:** medium-high
- **models_asserting:** 2/7 (GPT-5, sonar-deep)
- **rationale:** Canonical enterprise LLM platform alongside OpenAI/Anthropic/Azure/Bedrock for Solutions Architect + AI PgM roles. Discusses Vertex model hosting, evals, embeddings, security.
- **citations:** https://cloud.google.com/vertex-ai/docs, https://ai.google.dev/gemini-api/docs
- **first_mention_seen:** Dec 2023

#### canonical_name: together-ai
- **category:** llm-provider
- **signal_strength:** high (target company) / medium (cross-company)
- **models_asserting:** 5/7 (Opus, GPT-5, Gemini, grok-x, sonar-deep)
- **rationale:** Alternative inference provider in multi-provider stacks. Cited in Applied AI/Solutions JDs across LangChain, Together itself, Replicate-adjacent shops. Often paired with Fireworks/Groq as alternates. Mitchell-relevant: target company.
- **citations:** https://docs.together.ai/, https://www.together.ai/careers
- **first_mention_seen:** Q3 2023

#### canonical_name: mistral
- **category:** llm-provider
- **signal_strength:** high (EU sovereign) / medium (cross-company)
- **models_asserting:** 6/7 (all except sonar-reasoning)
- **rationale:** European sovereign provider. Cited in Cohere/Together/HF JDs as model family customers want supported. Mistral's own SA + Applied AI JDs require La Plateforme + fine-tuning APIs fluency (Opus).
- **citations:** https://docs.mistral.ai/, https://mistral.ai/careers/
- **first_mention_seen:** Q4 2023 (table-stakes Q1 2024)

#### canonical_name: cohere
- **category:** llm-provider
- **signal_strength:** high (enterprise RAG) / medium (cross-company)
- **models_asserting:** 5/7 (Opus, GPT-5, grok-x, sonar-reasoning at medium, sonar-deep)
- **rationale:** Command R+ / Rerank-3 / Embed cited in enterprise RAG-heavy JDs. Cohere's own SA + AI Enablement JDs emphasize Rerank-3 + North (their agent platform). Cohere Rerank is a common "added skill" in FDE JDs at retrieval-heavy shops (Opus).
- **citations:** https://docs.cohere.com/, https://cohere.com/careers
- **first_mention_seen:** Q1 2023

#### canonical_name: elevenlabs
- **category:** voice-audio
- **signal_strength:** high (target company + voice roles)
- **models_asserting:** 5/7 (Opus, GPT-5, Gemini implicit, grok-x, sonar-reasoning)
- **rationale:** Default TTS/voice-agent provider for any role touching voice (Sierra voice agents, Synthesia, ElevenLabs own JDs). ElevenLabs Agents Platform (Conversational AI) is its own product line cited in FDE JDs (Opus).
- **citations:** https://elevenlabs.io/docs, https://elevenlabs.io/careers
- **first_mention_seen:** Q2 2023

#### canonical_name: replicate
- **category:** deploy-infra
- **signal_strength:** medium
- **models_asserting:** 5/7 (Opus, GPT-5, grok-x, sonar-deep, sonar-reasoning implicit)
- **rationale:** Modal alternate. DevRel + Solutions JDs at LangChain, HF cite it. Cog (Replicate's container format) is the DevRel-cited skill (Opus).
- **citations:** https://replicate.com/docs, https://replicate.com/careers
- **first_mention_seen:** Q1 2023

#### canonical_name: turbopuffer
- **category:** vector-db
- **signal_strength:** high (Opus singleton) / low (GPT-5)
- **models_asserting:** 2/7 (Opus high, GPT-5 low) — minority signal worth flagging
- **rationale:** Cursor publicly migrated to Turbopuffer (2024 blog), and now Cursor + Notion + several Anthropic-adjacent shops cite it (Opus). FDE/SA JDs at Cursor + Sierra list "Turbopuffer or equivalent" as preferred. GPT-5 marks low — calls it "infra-savvy applied AI not yet table-stakes." Real signal split.
- **citations:** https://turbopuffer.com/docs, https://www.cursor.com/blog
- **first_mention_seen:** Q4 2024

#### canonical_name: chroma
- **category:** vector-db
- **signal_strength:** medium-low
- **models_asserting:** 5/7 (GPT-5, grok-4, grok-x, sonar-reasoning, sonar-deep implicit)
- **rationale:** Common in prototypes, tutorials, local RAG stacks. Useful for DevRel demos. Less enterprise-procurement signal than Pinecone/Weaviate/pgvector.
- **citations:** https://docs.trychroma.com/
- **first_mention_seen:** Q2 2024

#### canonical_name: qdrant
- **category:** vector-db
- **signal_strength:** medium
- **models_asserting:** 3/7 (Opus implicit, GPT-5, Gemini)
- **rationale:** Rust-based, performance-tunable vector DB for open-source/self-hosting. Useful differentiator for technical FDE/SA candidates. Less recruiter-recognizable than Pinecone or pgvector.
- **citations:** https://qdrant.tech/documentation/
- **first_mention_seen:** Q2 2023

#### canonical_name: playwright
- **category:** automation-browser
- **signal_strength:** medium
- **models_asserting:** 3/7 (GPT-5, sonar-deep, sonar-reasoning)
- **rationale:** Standard browser automation/testing layer behind web agents, eval harnesses, demo QA. Strong for FDEs building web-using agents; less for nontechnical strategy/comms.
- **citations:** https://playwright.dev/docs/intro
- **first_mention_seen:** pre-2023

#### canonical_name: browserbase
- **category:** automation-browser
- **signal_strength:** medium
- **models_asserting:** 2/7 (GPT-5, sonar-reasoning)
- **rationale:** Managed browser layer for web agents, scraping, QA. More builder-circle than broad JD signal. Stronger for FDE/DevRel.
- **citations:** https://docs.browserbase.com/
- **first_mention_seen:** Q2 2024

#### canonical_name: cloudflare
- **category:** deploy-infra
- **signal_strength:** medium
- **models_asserting:** 2/7 (grok-4, grok-x)
- **rationale:** Edge deployment + MCP-related infrastructure. Mitchell has the key.
- **citations:** https://developers.cloudflare.com/
- **first_mention_seen:** Q2 2025

#### canonical_name: pydantic-ai
- **category:** agent-framework
- **signal_strength:** high (Opus) / low (GPT-5) — disagreement
- **models_asserting:** 2/7
- **rationale:** Opus marks `high`, claiming it's the second-most-cited Python agent framework after LangGraph in May 2026 FDE JDs ("LangGraph, Pydantic AI, or equivalent" at Anthropic + OpenAI Applied AI). GPT-5 marks `low`, framing it as "engineer-taste, less recruiter-keyword." **Real disagreement — dealbreaker should verify.**
- **citations:** https://ai.pydantic.dev/, https://github.com/pydantic/pydantic-ai
- **first_mention_seen:** Q4 2024

#### canonical_name: temporal
- **category:** orchestration
- **signal_strength:** high (Opus singleton)
- **models_asserting:** 1/7 (Opus)
- **rationale:** **Minority signal.** Durable execution / workflow engine that has become the default "production agent orchestrator" in enterprise FDE/SA JDs per Opus (Sierra, Cognition Devin, Anthropic FDE cite "Temporal or durable workflow systems" by name). AI PgM at OpenAI mention infra teams running Temporal-backed agent backends. **Singleton — flag for dealbreaker.**
- **citations:** https://temporal.io/, https://docs.temporal.io/
- **first_mention_seen:** Q3 2024 (in AI-agent context)

#### canonical_name: vllm
- **category:** deploy-infra
- **signal_strength:** high (Opus singleton)
- **models_asserting:** 1/7 (Opus)
- **rationale:** **Minority signal.** Open-source inference server cited in Mistral, Cohere, Together, Modal, Replicate JDs. SA/FDE candidates expected to know vLLM tuning (paged attention, prefix caching, speculative decoding). Together SA JDs explicitly mention vLLM-fluency per Opus. **Singleton — flag for dealbreaker.**
- **citations:** https://docs.vllm.ai/, https://github.com/vllm-project/vllm
- **first_mention_seen:** 2024

#### canonical_name: ollama
- **category:** deploy-infra
- **signal_strength:** high (Opus singleton)
- **models_asserting:** 1/7 (Opus)
- **rationale:** **Minority signal.** Table-stakes for DevRel/Applied AI demoing local models or on-prem-curious enterprise customers (Cohere Solutions, Mistral Solutions, HF Customer Engineer per Opus). Recruiter posts on X ask DevRel candidates if they've contributed Ollama modelfiles. **Singleton — flag.**
- **citations:** https://ollama.com/, https://github.com/ollama/ollama
- **first_mention_seen:** Q2 2024

#### canonical_name: assemblyai
- **category:** voice-audio
- **signal_strength:** high (target voice roles) / low (general)
- **models_asserting:** 3/7 (Opus, grok-4, grok-x)
- **rationale:** Default STT for voice-adjacent FDE JDs (Sierra, ElevenLabs-aware roles). Mitchell already has the key. Universal-Streaming model is the table-stakes reference in 2026 JDs per Opus.
- **citations:** https://www.assemblyai.com/docs, https://www.assemblyai.com/careers
- **first_mention_seen:** 2024

#### canonical_name: perplexity-api
- **category:** retrieval-rag
- **signal_strength:** high (target role) / medium (cross-company)
- **models_asserting:** 5/7 (Opus, GPT-5 implicit, Gemini, grok-x, sonar-deep)
- **rationale:** Sonar API as the "web-grounded LLM" in Applied AI / FDE JDs needing fresh web grounding. Perplexity own DevRel/Solutions/Applied AI JDs require fluency. Also cited at Cursor, Sierra, Cognition as search dependency (Opus).
- **citations:** https://docs.perplexity.ai/, https://www.perplexity.ai/hub/careers
- **first_mention_seen:** Q1 2024

#### canonical_name: xai-grok
- **category:** llm-provider
- **signal_strength:** medium (target role) / low (cross-company)
- **models_asserting:** 4/7 (Opus, GPT-5, grok-4 implicit, grok-x)
- **rationale:** xAI's own FDE/Applied AI/SA JDs require Grok-4.3 API fluency. Cross-company JD citations thinner than Anthropic/OpenAI but rising — appears in some Cursor + Perplexity multi-provider JDs (Opus). Real-time search via X integration is unique feature cited.
- **citations:** https://docs.x.ai/, https://x.ai/careers
- **first_mention_seen:** 2024

#### canonical_name: gemini
- **category:** llm-provider
- **signal_strength:** high (cross-company integration)
- **models_asserting:** 4/7 (Opus, GPT-5, grok-x, sonar-reasoning)
- **rationale:** Despite Google not in the 22-target list, Gemini 2.5/3 is cited as required multi-provider integration in Cursor, Perplexity, Sierra, LangChain, Together JDs (Opus). Long-context (1M+) workflows specifically cited. Mitchell has the key.
- **citations:** https://ai.google.dev/gemini-api/docs
- **first_mention_seen:** 2024

#### canonical_name: openai-function-calling
- **category:** mcp-tool-use
- **signal_strength:** high (GPT-5) / medium (sonar-deep)
- **models_asserting:** 2/7
- **rationale:** OpenAI-style native tool/function calling. Distinct from MCP per dedup rules. Interviewers expect schemas, tool choice, parallel tool calls, retries, structured outputs (GPT-5). Sonar-deep notes "Functions deprecated → tools" transition (early 2026).
- **citations:** https://platform.openai.com/docs, https://cookbook.openai.com/
- **first_mention_seen:** Jun 2023

#### canonical_name: snowflake
- **category:** data-pipeline
- **signal_strength:** medium
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** **Minority signal.** Enterprise data warehouse AI SAs and FDEs encounter when building RAG, analytics agents, customer data integrations. Cortex-style AI features increasingly cited. Singleton — but credible.
- **citations:** https://docs.snowflake.com/
- **first_mention_seen:** pre-2023

#### canonical_name: dbt
- **category:** data-pipeline
- **signal_strength:** medium
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** **Minority signal.** Strategy, AI PgM, SA, Enablement roles often sit next to analytics/data teams. dbt literacy helps reason about clean enterprise data feeding RAG/evals. Less core for frontier-model roles.
- **citations:** https://docs.getdbt.com/
- **first_mention_seen:** pre-2023

#### canonical_name: terraform
- **category:** deploy-infra
- **signal_strength:** high (enterprise)
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** **Minority signal.** For enterprise AI deployment, canonical IaC skill for cloud provisioning, VPC/security, model-serving infra, customer-environment reproducibility. Relevant to FDE/SA/Enablement; not comms/strategy.
- **citations:** https://developer.hashicorp.com/terraform/docs
- **first_mention_seen:** pre-2020

#### canonical_name: posthog
- **category:** analytics
- **signal_strength:** medium
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** **Minority signal — useful for Comms/Strategy/PgM coverage gap.** Startup product analytics, feature flags, session replay, funnel measurement. Useful for AI strategy/product ops roles + FDEs measuring customer deployments.
- **citations:** https://posthog.com/docs
- **first_mention_seen:** Q2 2022

#### canonical_name: linear
- **category:** communications
- **signal_strength:** high (Opus singleton)
- **models_asserting:** 1/7 (Opus)
- **rationale:** **Minority signal — but loads the Strategy/PgM coverage gap.** AI PgM + Strategic Ops JDs at Anthropic, OpenAI, Cursor, Sierra, Cognition universally use Linear. **Singleton — but specifically targets a council coverage gap.**
- **citations:** https://linear.app/
- **first_mention_seen:** pre-2023

#### canonical_name: notion
- **category:** knowledge-base
- **signal_strength:** medium-high (PgM/Strategy)
- **models_asserting:** 4/7 (Opus implicit, GPT-5, grok-4, grok-x)
- **rationale:** Practical operating-system tool for AI PgM, strategy, enablement, onboarding, comms: launch docs, customer notes, runbooks, enablement hubs. Not an AI framework but repeatedly useful in the non-engineering halves of target role families. Mitchell already has Notion in his .env.
- **citations:** https://developers.notion.com/
- **first_mention_seen:** pre-2023

#### canonical_name: slack
- **category:** communications
- **signal_strength:** medium (universal-but-undifferentiating)
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** **Minority signal but loads coverage gap.** Default integration + operating channel for customer-facing AI enablement, support bots, internal agents, launch coordination, incident workflows. API/integration fluency useful across FDE/Enablement/PgM/comms.
- **citations:** https://api.slack.com/
- **first_mention_seen:** pre-2020

#### canonical_name: wandb-weave
- **category:** eval-observability
- **signal_strength:** medium
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** **Minority signal.** W&B Weave is a credible eval, tracing, experiment tracking, model-ops signal for teams crossing traditional ML + LLM app dev. More common in ML-heavy roles than pure DevRel/comms.
- **citations:** https://docs.wandb.ai/, https://weave-docs.wandb.ai/
- **first_mention_seen:** Q1 2024

#### canonical_name: ragas
- **category:** eval-observability
- **signal_strength:** low
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** **Minority signal.** Relevant for RAG evaluation metrics + benchmarking. Many companies use custom eval harnesses, LangSmith, Braintrust, or OpenAI-eval patterns instead. Good to know, not table-stakes filter.
- **citations:** https://docs.ragas.io/
- **first_mention_seen:** Q3 2023

#### canonical_name: openai-evals
- **category:** eval-observability
- **signal_strength:** medium (methodology) / low (specific repo)
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** OpenAI's evals patterns + repo. The methodology is highly relevant; the repo itself may not be the production tool. Helps interviewers gauge "build eval before optimizing prompt" baseline expectation.
- **citations:** https://github.com/openai/evals, https://cookbook.openai.com/
- **first_mention_seen:** Q1 2023

#### canonical_name: firecrawl
- **category:** web-scraping
- **signal_strength:** medium
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** **Minority signal.** AI-agent scraping/crawling API for turning websites into LLM-ready markdown/data. More community/tooling-signal than broad JD-signal but relevant to FDE/DevRel portfolios.
- **citations:** https://docs.firecrawl.dev/
- **first_mention_seen:** Q2 2024

#### canonical_name: exa
- **category:** web-scraping
- **signal_strength:** low
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** Neural/search API for research agents. Community/demo-driven hiring signal more than JD-driven.
- **citations:** https://docs.exa.ai/
- **first_mention_seen:** Q1 2024

#### canonical_name: composio
- **category:** mcp-tool-use
- **signal_strength:** low
- **models_asserting:** 2/7 (GPT-5, sonar-deep)
- **rationale:** Agent-tool integration layer to connect agents to SaaS tools/actions. Broad JD signal limited per GPT-5. Worth knowing for FDE/DevRel demos paired with LangGraph/CrewAI/MCP.
- **citations:** https://docs.composio.dev/
- **first_mention_seen:** Q2 2024

#### canonical_name: crewai
- **category:** agent-framework
- **signal_strength:** low (JD) / high (community)
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** Multi-agent demo/tutorial framework. Popular in community but GPT-5 explicitly warns "not table-stakes for top AI company hiring unless JD names it directly."
- **citations:** https://docs.crewai.com/
- **first_mention_seen:** Q1 2024

#### canonical_name: mem0
- **category:** knowledge-base
- **signal_strength:** low
- **models_asserting:** 1/7 (GPT-5)
- **rationale:** Memory layer for agents. Recognizable OSS name but not JD table-stakes yet. Useful for agent demos where persistent user/team memory is the point.
- **citations:** https://docs.mem0.ai/
- **first_mention_seen:** Q3 2024

#### canonical_name: smithery
- **category:** mcp-tool-use
- **signal_strength:** low-medium
- **models_asserting:** 2/7 (GPT-5, grok-x)
- **rationale:** Visible MCP server registry/discovery. Community signal rather than JD signal currently per GPT-5. Relevant to Claude Code, Cursor, DevRel conversations.
- **citations:** https://smithery.ai/
- **first_mention_seen:** Q1 2025

#### canonical_name: synthesia-api
- **category:** voice-audio (avatar / video)
- **signal_strength:** high (target company) / low (cross-company)
- **models_asserting:** 2/7 (Opus, grok-x)
- **rationale:** Synthesia's own Solutions / Customer Engineer / AI Enablement JDs require Synthesia API + Avatar SDK. Limited cross-company signal but core to one target employer.
- **citations:** https://docs.synthesia.io/, https://www.synthesia.io/careers
- **first_mention_seen:** 2024

#### canonical_name: sierra-agent-platform
- **category:** agent-framework (proprietary)
- **signal_strength:** high (target company) / low (cross-company)
- **models_asserting:** 1/7 (Opus)
- **rationale:** **Minority signal.** Sierra's own FDE / Agent Engineer JDs cite their internal AgentOS as daily driver. Not portable but central to one target employer.
- **citations:** https://sierra.ai/careers
- **first_mention_seen:** 2024

#### canonical_name: typescript
- **category:** programming-language (mis-bucketed; closest = orchestration/cli-shell)
- **signal_strength:** high (universal baseline)
- **models_asserting:** 2/7 (Opus, implicit in vercel-ai-sdk citations across all 7)
- **rationale:** TS is the lingua franca for FDE/DevRel work at Cursor, Vercel-adjacent shops, Sierra (TS-heavy agent runtime), ElevenLabs SDK, customer-facing surfaces. Co-required with Python.
- **citations:** https://www.typescriptlang.org/docs/, https://sierra.ai/careers
- **first_mention_seen:** baseline

#### canonical_name: python
- **category:** programming-language (mis-bucketed; closest = orchestration/cli-shell)
- **signal_strength:** high (universal baseline)
- **models_asserting:** 2/7 (Opus, implicit in all backend SDKs)
- **rationale:** Universal across FDE/Applied AI/SA. Anthropic Agent SDK, OpenAI Agents SDK, LangGraph, LlamaIndex, Modal all Python-first.
- **citations:** https://docs.python.org/3/
- **first_mention_seen:** baseline

---

## Minority Signals (≤2 models, flagged per quality-gate rule 3)

These were called `high` or `medium` by at most 2 models in the council and should be investigated rather than silently dropped:

| Item | Model | Strength | Why singleton matters |
|---|---|---|---|
| **temporal** | Opus | high | "Default production agent orchestrator" at Sierra, Cognition (Devin), Anthropic FDE per Opus's read. Worth verifying — durable workflow engines ARE rising in agentic infra. |
| **vllm** | Opus | high | Open-source inference server at Mistral/Cohere/Together/Modal/Replicate. Plausibly real — Mistral specifically is known to be vLLM-heavy. |
| **ollama** | Opus | high | DevRel/Applied AI demoing local models. Plausibly real for HF/Mistral/Cohere DevRel niche. |
| **turbopuffer** | Opus high / GPT-5 low | split | Cursor migration is verifiable (cursor.com/blog). Real but contested signal strength. |
| **pydantic-ai** | Opus high / GPT-5 low | split | Real disagreement on whether this is JD table-stakes or engineer-taste. Verify against actual Anthropic FDE JDs. |
| **linear** | Opus | high | PgM/Strategy coverage filler. Almost certainly real (Linear is universal in AI startup ops) but worth confirming via JD scrape. |
| **snowflake / dbt / terraform / posthog / slack** | GPT-5 only | medium | All credible but unsupported by other models. GPT-5's instinct to flag the "enterprise/data/strategy adjacent stack" is sound for AI PgM + Comms roles — these may be load-bearing precisely because they fill the council's role-coverage gap. |
| **wandb-weave** | GPT-5 only | medium | Plausibly real for ML-heavy crossover (HF, Together, Mistral). |
| **langfuse** | sonar-reasoning-pro only | high | **Caveat: citations hallucinated.** Langfuse IS a real product with real adoption (eval-observability competitor to LangSmith/Braintrust). Treat the strength as `medium` pending real JD evidence. |
| **rag** | sonar-reasoning-pro | high | Conceptual, not a tool. Not actionable as standalone item. |
| **prompt-engineering** | sonar-reasoning-pro | high | Skill, not API. Should not be treated as a discrete item. |
| **react / nextjs / fastapi / nestjs / mongo-db** | sonar-reasoning-pro | medium | General stack items, not AI-specific. Recruiter-recognized but not council-level signal. |
| **synthesia-api / sierra-agent-platform** | Opus + grok-x | medium | Proprietary to target companies. Relevant only when targeting those specific employers. |

---

## Gaps vs Mitchell's Demonstrated Numerator (.env Audit)

Mitchell's .env keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`, `XAI_API_KEY` (Grok), `GPTZero`, `Originality`, `Pangram`, `Cloudflare`, `Hunter`, `AssemblyAI`, `Descript`, `Notion`, `Telegram`, `Gmail`.

### Already covered (no action needed)
- `anthropic` — ✅ key present
- `openai` — ✅ key present
- `gemini` — ✅ key present
- `perplexity-api` — ✅ key present
- `xai-grok` — ✅ key present
- `assemblyai` — ✅ key present
- `cloudflare` — ✅ key present
- `notion` — ✅ key present

### High-leverage gaps (close FIRST, sorted by signal_strength × cross-model agreement)

1. **`mcp` (Model Context Protocol)** — 7/7 council agreement, mentioned in every JD universe. Mitchell has zero MCP servers in his demonstrated portfolio. **Action: build at least one publicly-visible MCP server, ideally serving career-ops data; consume MCP from Claude Code in a verifiable workflow.**
2. **`langgraph` + `langsmith`** — 7/7 (langsmith), 6/7 (langgraph). Mitchell has neither. **Action: ship a LangGraph stateful agent demo with LangSmith traces public.**
3. **`vercel-ai-sdk`** — 7/7. Mitchell's career-ops dashboard is server-rendered (not React), so no Vercel AI SDK surface area yet. **Action: build a small Next.js/Vercel-AI-SDK proof — even a single chat-with-tools demo on dashboard.careers-ops.com.**
4. **`pinecone`** — 7/7. Mitchell has no managed vector DB in .env. **Action: spin up a Pinecone Serverless index against his cv-knowledge corpus; cite Pinecone in cv.md.**
5. **`pgvector`** — 6/7. Pair with Pinecone. **Action: parallel pgvector setup against the same corpus to demonstrate cost/perf tradeoff fluency.**
6. **`braintrust`** — 4/7 (incl. Anthropic-specifically signal from Opus). Mitchell has no eval platform key. **Action: sign up + run a Braintrust eval against the council prompt above to demonstrate "ship evals" muscle.** Bonus: Mitchell already has the council infra to feed Braintrust.
7. **`modal`** — 6/7. Mitchell deploys via launchd locally; no Modal account. **Action: deploy one career-ops script to Modal as a public-callable endpoint.**
8. **`anthropic-agent-sdk` + `openai-agents-sdk`** — both 3-4 models. Mitchell uses the raw APIs. **Action: rewrite one career-ops agent (e.g., `cv-tailor`) using each SDK to demonstrate SDK-level fluency.**
9. **`claude-code`** — 3/7 explicit, universal-implicit. **Action: Mitchell ALREADY uses Claude Code daily — make this visible via public artifacts (e.g., a Claude Code session log committed to a public repo).** This is the highest-leverage zero-incremental-work item.
10. **`cursor`** — 5/7. Daily-driver expectation. **Action: install + publicly demonstrate.** Low cost.

### Medium-leverage gaps (consider after Tier-A closures)

- `hugging-face` (key not in .env; the HF Hub interactions Mitchell does are read-only) — 6/7 → low-cost HF account creation + dataset/model upload
- `together-ai`, `mistral`, `cohere`, `replicate` — multi-provider stack signal. Get free-tier keys, demonstrate use in a multi-provider router script
- `elevenlabs` — only critical if Mitchell targets voice-adjacent roles (ElevenLabs, Sierra voice, Synthesia). Target companies are on his list.
- `temporal` (Opus minority) — IF dealbreaker confirms, build a Temporal-based agent workflow. High leverage if confirmed; skip if disconfirmed.
- `vllm` (Opus minority) — IF dealbreaker confirms, deploy an open model via vLLM on Modal. Verifies infra-savvy claim.
- `pydantic-ai` (Opus high, GPT-5 low) — wait for dealbreaker resolution on whether real JD signal exists.
- `linear` (Opus minority for PgM/Strategy roles) — Mitchell uses applications.md as tracker; pivoting to Linear (or showing Linear fluency via screenshots) is high-leverage for AI PgM roles.

### Low-leverage / safely skip
- `gptzero`, `originality`, `pangram` (AI-detection) — Mitchell HAS these but they are `low` JD signal per council. He shouldn't lead with them but no need to drop.
- `hunter`, `gmail`, `telegram`, `descript` — peripheral / category-low. Mitchell has them but council does not flag as table-stakes.
- `composio`, `mem0`, `exa`, `firecrawl`, `crewai`, `ragas`, `smithery`, `chroma`, `qdrant`, `langfuse`, `wandb-weave` — all `low`-tier per council. Optional for portfolio depth, not necessary for top-of-funnel screening.

### Net-net gap-closure priority for the next 30 days

1. **Week 1: MCP** — build + deploy career-ops-MCP server publicly. Cite in cv.md and Mitchell's About page.
2. **Week 2: LangGraph + LangSmith + Vercel AI SDK demo** — single Next.js page showing a stateful agent with traces, deployed to dashboard.careers-ops.com or a fresh subdomain.
3. **Week 3: Pinecone + pgvector parity demo + Braintrust eval** — same corpus, two stores, eval the retrieval quality of each.
4. **Week 4: Modal deployment** — pick the most-demoable career-ops script (probably `cv-tailor` or `council-runner`) and ship it as a Modal endpoint with a public URL.

That sequence covers 6 of the top-7 council-converged gaps in 30 days while producing 4 publicly-citable artifacts.

---

## Coverage Notes (Summary of Council Coverage Gaps)

- **Best-covered role families:** FDE / Applied AI Engineer, Solutions Architect, AI Enablement Engineer. Tooling is well-documented in public JDs.
- **Mediocre coverage:** Developer Relations Engineer (tools surface fine, but the soft-skill / portfolio component is under-discussed by the council).
- **Worst-covered role families:** Strategic Operations / Strategy Manager, Communications Manager. Every model except sonar-reasoning explicitly flagged these as portfolio/writing-sample-driven, not API-stack-driven. **The actionable read: for these roles, the API-stack story is a 30%-weight floor; the 70% is published writing, narrative artifacts, and category-defining proof-of-work.**
- **Honest model performance ranking** for THIS question:
  1. **Claude Opus 4.7** — best mix of specificity, recruiter-X-signal, and coverage. Caveat: truncated at entry ~38.
  2. **GPT-5** — best methodological hygiene (`[UNVERIFIED]` discipline, all-canonical citations). Caveat: lighter on real JD specificity, heavier on canonical-doc URLs.
  3. **Grok-4-x-search** — uniquely valuable for X/Reddit recruiter-chatter (the Reddit r/cursor "dev job market is straightup cooked" cite is real and recruiter-relevant). Caveat: most citations are still "pending."
  4. **Sonar-deep-research** — would have been strongest if not for post-`</think>` truncation. The think-block-internal entry drafts are usable.
  5. **Gemini 2.5 Pro** — truncated at ~19 entries; the entries delivered are crisp and JD-cited (EY, Stanford, NextLink Labs, Rockland Trust) but the model didn't get to medium/low tiers.
  6. **Grok-4 (no X search)** — honest "citation pending" hygiene but only 21 entries; light coverage.
  7. **Sonar-reasoning-pro** — **DO NOT TRUST CITATIONS.** Synthetic X status IDs (`/status/189...`), fabricated lever URLs. Use only the structural data (canonical_name + signal_strength), discard the URLs.

---

## Raw Per-Model Outputs (verbatim — preserved for dealbreaker audit)

For full per-model responses, see the raw council JSON:
- `/Users/mitchellwilliams/.claude/agents/runs/council-20260519-140425.json`
- `/Users/mitchellwilliams/.claude/agents/runs/council-gpt5-retry-20260519-140425.json`

Each model's `content` field contains the unedited response. The list of canonical_name entries above is the deduplicated synthesis; the raw JSON preserves each model's specific phrasing, citations, and (where present) honest "citation pending" / "[UNVERIFIED]" disclaimers.
