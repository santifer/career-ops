# Build-in-Public Thread Drafts — 2026-05-07
*Three LinkedIn posts — one per public repo. Ready to post. Mitchell posts manually.*
*Voice calibrated against writing-samples/voice-reference.md.*
*All metrics sourced from cv.md and config/profile.yml. None fabricated.*

---

## Thread 1: comms-triage-agent

**Title for internal reference:** "The intake queue problem — how I built a comms triage agent that recaptured 160 hours/year"
**Target length:** ~350 words
**Tags:** #AI #LLM #GoogleEngineering #AgenticAI #InternalTools

---

**READY TO POST — LinkedIn copy:**

The hardest part of deploying an AI agent at work wasn't the prompting. It was understanding why people escalated.

Every communications team has the same bottleneck: a queue of requests that mostly need polish, a small fraction that need judgment, and no fast way to tell which is which. The manual version costs hours a week. The error-prone version — escalating everything — burns senior reviewer time on requests that didn't need it.

I built the comms-triage-agent to solve this at Google xGE, where I support a team of ~1,000 Principal, Distinguished, and Google Fellow engineers. The architecture is three prompts:

**Triage.** Classify each request into Low / Medium / High touch with a confidence score. The criteria aren't written rules — they're inferred from where the previous manual process broke down. VP involvement, site-related work, and change-management triggers all force high-touch regardless of other signals.

**Revise.** For Low-touch requests: read the submitter's draft, load the relevant knowledge base (core KB always-on, living documents loaded conditionally based on content triggers), rewrite against a style framework, explain every change. Output lands in a Drive folder + email notification. No human in the loop.

**Escalate.** For Medium/High: generate a structured briefing document so the human reviewer starts from context, not a cold read. Judgment is still a human call. The agent handles the assembly work.

Result: ~160 ops hours/year recaptured at >90% classification accuracy. The Low-touch tier runs autonomously. The judgment tier is faster because the briefing is already there.

What surprised me most: the model choice mattered less than the KB architecture. The dynamic knowledge-base loading — pulling the right source-of-truth document based on content triggers — is why the revisions land. The model is the rewriter. The KB is the editor.

The full architecture is open-source: github.com/mitwilli-create/comms-triage-agent

If you're building internal comms infrastructure or thinking about agentic workflows for non-ML teams, I'm happy to talk through the design decisions.

#AI #LLM #GoogleEngineering #AgenticAI #InternalTools

---

## Thread 2: tax-verification-agent

**Title for internal reference:** "Commercial software said I owed $19K more. My AI agent disagreed — and caught the error."
**Target length:** ~300 words
**Tags:** #AI #CitationGrounding #TaxSeason #Claude #KnowledgeBase

---

**READY TO POST — LinkedIn copy:**

Tax software said I owed $19,000 more than I expected. I built an AI agent to check the math. The agent was right. The software was wrong.

The catch was a New York state income tax error — a wage exclusion the software missed that applied to my situation. The kind of thing you'd only catch if you knew to look for it, or if you had an agent that was required to cite the specific IRS and state code for every conclusion it reached.

That last part is the architecture decision that made this work.

Most AI systems are confident. They produce answers that look authoritative whether or not they're grounded in anything. The tax agent is built differently: it refuses to reason without a structured citation block. Every conclusion includes the specific code section, the regulatory source, and the chain of reasoning that connects them. If the agent can't cite it, it doesn't say it.

The four-layer knowledge base — IRS code, New York state regulations, my actual filing software output, and the conversation history — gives the agent a defined authority hierarchy. The IRS is more authoritative than the software. State code supersedes default assumptions. When there's a conflict, the hierarchy resolves it.

The interesting design insight: citation discipline as a constraint on retrieval, not as an annotation on output. The prompt demands citations before reasoning, which changes what the model retrieves. It's a different architecture than "answer first, cite incidentally."

The full conversation — including the actual catch — is documented in the repo: github.com/mitwilli-create/tax-verification-agent

I built this for myself. But the KB architecture applies anywhere multi-source verification matters: legal, medical, compliance, financial. The pattern is portable.

#AI #CitationGrounding #TaxSeason #Claude #KnowledgeBase

---

## Thread 3: voice-os

**Title for internal reference:** "I trained an AI on 6.9M+ words of my own writing. Here's what it learned — and what it couldn't."
**Target length:** ~320 words
**Tags:** #VoiceAI #AIComms #PersonaRouting #LLM #WritingWithAI

---

**READY TO POST — LinkedIn copy:**

I've been writing for 18 years — newsrooms, broadcast scripts, long-form editorial, VP-level communications at Google. I wanted to know if I could train an AI to write the way I do. Not to replace the writing — to quality-gate AI-assisted drafts before they went anywhere.

The voice-os system runs on Claude with a six-axis scoring framework I built from scratch: purpose alignment, structural logic, tone calibration, specificity, actionability, and brand coherence. Every draft gets scored on each axis before it moves.

The system uses dual-persona routing. "Architect mode" is the precise, direct register I use for technical audiences and senior stakeholders — tight, sourced, no hedging. "Teammate mode" is the warmer register I use for coaching, developmental feedback, and cross-functional communication. The router classifies the request and loads the appropriate persona, then the scoring framework checks the output against it.

The hardest axis to score was brand coherence — whether the output sounds like a specific person, not just like a competent human. Most AI slop is identifiable by pattern: hedge phrases, passive constructions, vague nouns where specific nouns belong. I built the Kill List methodology to catch these patterns before a human reads the draft. If a banned pattern appears, the draft doesn't pass.

Result: 99% stylistic fidelity at VP-scale deployment. That number comes from a production calibration run across executive communications work at Google xGE — outputs rated by the executives themselves, blind.

What I learned: you can teach an AI to match a voice much more reliably than you can teach it to know when not to try. The routing decision — when to engage the AI, when to hand off to a human — is still a judgment call. The system handles it with a confidence threshold, but the threshold calibration is ongoing.

The full system — scoring rubric, Kill List, persona routing logic — is open-source: github.com/mitwilli-create/voice-os

#VoiceAI #AIComms #PersonaRouting #LLM #WritingWithAI

---

*End of build-in-public-threads-2026-05-07.md.*
*3 threads written: comms-triage-agent, tax-verification-agent, voice-os.*
*All metrics sourced from cv.md and config/profile.yml. Voice calibrated against writing-samples/voice-reference.md.*
*Posts are ready for Mitchell to copy-paste and post manually. Do NOT post autonomously.*
