# GitHub Company Positioning — 2026-05-07
*Phase 7D: per-company pitch using GitHub repos as primary signal.*
*All framing: "team-scale enablement," not "personal productivity."*

---

## Anthropic

**Lead repo:** tax-verification-agent
**Framing:** Citation discipline trained on IRS code and Claude directly mirrors Anthropic's Constitutional AI and RLHF values — the agent refuses to reason without grounded citations, surfaces the citation chain, and catches errors that commercial software with unconstrained confidence produced confidently. This is alignment-adjacent engineering in a practical domain.

**Secondary signal:** voice-os six-axis scoring framework = output quality gates. The Kill List methodology (flagging AI slop patterns before delivery) is a practical instantiation of the kind of quality filtering Anthropic builds into Constitutional AI post-training pipelines.

**GitHub angle:** The citation-gated architecture in tax-verification-agent is the closest thing in this portfolio to a Constitutional AI constraint layer built by a practitioner rather than an ML researcher. The knowledge-base hierarchy (IRS code as authority layer, commercial software output as the thing being checked against it) maps directly to what Anthropic cares about in deployment reliability.

**One-line pitch:** "I built citation-gated AI that catches $19,000 errors commercial software misses — and the architecture is the same discipline Anthropic builds into its safety layers."

**Interview talking point:** "When I built the tax agent, I had to answer a design question Anthropic deals with constantly: how do you make a model cite its work without teaching it to hallucinate citations? The answer I found — mandatory structured citation blocks that are checked against a ground-truth KB — is an independent rediscovery of what citation grounding looks like in practice."

---

## OpenAI

**Lead repo:** comms-triage-agent
**Framing:** Enterprise GTM and internal enablement is OpenAI's biggest commercial motion right now — getting ChatGPT Enterprise and the API to stick inside organizations like Google requires exactly the kind of workflow integration this agent demonstrates. The three-prompt architecture (triage → revise → escalate) is directly compatible with OpenAI's tool-use and structured output patterns.

**Secondary signal:** The broadcast journalism background maps to OpenAI's product narrative challenges. ChatGPT's biggest growth barrier is communicating reliability to non-technical users — this is an editorial problem, not a technical one. The background here is directly applicable.

**GitHub angle:** comms-triage-agent running at scale inside Google is a better GTM reference than most case studies. The architecture is portable — the three-prompt design and dynamic KB loading pattern works with any model provider.

**One-line pitch:** "I ship the enablement infrastructure that makes AI usable for non-ML teams — built and validated inside a 1,000-engineer org."

**Interview talking point:** "The hardest part of deploying the comms agent wasn't the prompting — it was understanding why people escalated. The escalation criteria I ended up with weren't written, they were inferred from watching where the previous manual process broke down. That is an observability problem, not a prompt engineering problem."

---

## Mistral

**Lead repo:** comms-triage-agent
**Framing:** Lightweight, deployable, open-weight-friendly. The three-prompt architecture in comms-triage-agent was designed to run efficiently — no fine-tuning, no embeddings infrastructure, no vector database. It runs on a standard Gemini API endpoint via Apps Script. The same architecture ports to Mistral with a model swap.

**Future action (not yet done):** Port comms-triage-agent to Mistral Large and open-source the performance comparison. This is the single highest-ROI action for Mistral positioning — a concrete, documented comparison of triage accuracy and response latency across models in a real production workload.

**GitHub angle:** The KB architecture is model-agnostic by design. The voice-os scoring framework could serve as a quality gate for Mistral outputs in the same way it does for Claude. The tax-verification-agent citation architecture is directly applicable to Mistral's RAG use cases.

**One-line pitch:** "Lightweight agentic comms systems designed to run on any model tier — the architecture is model-agnostic and the KB design is transferable."

**Interview talking point:** "The most interesting thing about deploying the comms agent at Google is that the model choice mattered less than the KB architecture. If Mistral had been available and cost-effective, it would have worked. The three-prompt structure is the differentiator, not the model."

---

## Sierra

**Lead repo:** voice-os
**Framing:** Sierra builds agentic communications products for enterprise. voice-os is dual-persona routing (Architect vs Teammate) with six-axis quality scoring — this is exactly the kind of infrastructure Sierra builds into its platform. The Kill List methodology (flagging and eliminating degraded output patterns before delivery) maps directly to Sierra's quality control layer.

**Secondary signal:** The Voice DNA pipeline (99% stylistic fidelity for VP-level communications) is a production-validated version of what Sierra sells as its core product promise: AI that sounds like the organization, not like an AI. This background is direct reference experience.

**GitHub angle:** voice-os is the most directly Sierra-relevant repo in the portfolio. The six-axis scoring framework (purpose alignment, structural logic, tone calibration, specificity, actionability, brand coherence) is a production quality gate, not a prototype.

**One-line pitch:** "I built the persona routing and QA gates that make AI communication trustworthy at scale — dual-persona, six-axis scoring, production-validated at VP fidelity."

**Interview talking point:** "The hardest axis to score was what I called 'brand coherence' — whether the output sounds like the person, not just like a competent human. The Kill List methodology came out of realizing that most AI slop is identifiable by pattern, not by meaning. You can catch it before a human reads it."

---

## Perplexity

**Lead repo:** tax-verification-agent
**Framing:** Perplexity's core product value is citations + reliability for complex multi-source information retrieval. The tax-verification-agent is a four-layer knowledge base architecture (IRS code, state regulations, commercial software output, conversation history) that makes complex multi-source verification usable for people who are not tax professionals. This is exactly Perplexity's product ethos applied to a high-stakes domain.

**Secondary signal:** The citation-gated architecture catches a $19,000 error because it forces reasoning to trace back to authoritative sources. Perplexity is building toward the same discipline at internet scale — the tax agent is a proof of concept that citation grounding in a constrained domain actually changes the error rate in a meaningful way.

**GitHub angle:** The four-layer KB architecture is more sophisticated than most RAG demos because it has a defined authority hierarchy (IRS > state code > software output > conversation), not just retrieval. This maps to how Perplexity would need to structure KB hierarchies for regulated domains (medical, legal, financial).

**One-line pitch:** "I architect knowledge-base systems that make complex multi-source verification usable for non-experts — with a documented $19,000 catch as proof."

**Interview talking point:** "The interesting design decision in the tax agent was where to put the citation check. Most RAG systems retrieve first and cite incidentally. I inverted that: the prompt refuses to reason without a citation block, which changes what the model retrieves. Citation discipline as a constraint on retrieval, not as an annotation on output."

---

*End of github-company-positioning-2026-05-07.md.*
