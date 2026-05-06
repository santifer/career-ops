# Evaluación: Latent Health — Machine Learning Engineer

**Fecha:** 2026-05-06
**Arquetipo:** ML Engineer (Applied AI Systems) (primary) + Applied AI / LLM Engineer (secondary)
**Score:** 2.6/5
**URL:** https://jobs.ashbyhq.com/latent/233bbaac-d589-49f4-a8eb-6bb16673b060
**Legitimacy:** High Confidence
**Location:** San Francisco — On-site (most of the week, "prioritize candidates who are excited to work this way")
**PDF:** Not generated (score < 3.0)

---

## A) Resumen del Rol

| Field | Value |
|---|---|
| Arquetipo | ML Engineer (Applied AI Systems) + Applied AI / LLM Engineer |
| Domain | Healthcare LLM systems — clinical reasoning, medical Q&A, evidence-grounded generation, longitudinal patient records |
| Function | Build (own end-to-end production ML systems running in real clinical workflows) |
| Seniority | "Primarily hiring for senior and staff-level engineers who are comfortable owning critical systems end-to-end" |
| Remote | SF on-site; "spend most of the week in the office and prioritize candidates who are excited to work this way" |
| Team size | "Small team" of researchers and engineers, Series A |
| Comp | $225K – $300K+ base + meaningful equity |
| TL;DR | Latent Health is an early-stage SF healthcare AI company hiring senior/staff ML engineers to own end-to-end production ML systems (training/fine-tuning LLMs for clinical reasoning + verifiable RL + evaluation frameworks). Healthcare LLM domain is 1:1 with Deepak's track, but the explicit senior/staff gate + SF on-site + "real patient outcomes ownership" tier suggests Mid candidates will not pass screen. |

## B) Match con CV

| JD Requirement | CV evidence | Match |
|---|---|---|
| Strong foundation in ML and software engineering | Applied AI at Progress Solutions (RAG + agentic + ML); FastAPI/Flask + Docker production packaging (cv.md) | Strong |
| Track record of building/owning ML systems in production where performance, reliability, correctness materially mattered | Healthcare RAG with ~35% retrieval precision and >90% grounded alignment; predictive ML with 15-20% recall gain at >90% precision on high-risk patient cohorts; ~30% post-deploy defect reduction (cv.md Progress Solutions) | Strong |
| Driving ambiguous ML problems from 0→1 (problem formulation, model design, productionization) | Agentic Healthcare Claims pipeline (5-stage multi-agent with schema contracts); Suvidha video summarization (transformer hierarchical, 0→1) (cv.md Projects) | Strong |
| Hands-on PyTorch | PyTorch in Skills; Hugging Face Transformers + Diffusers (cv.md) | Strong |
| Train and fine-tune LLMs for clinical reasoning, medical Q&A, evidence-grounded generation | Healthcare RAG + agentic LLM workflows for clinical knowledge and care-engagement queries; HIPAA-conscious data governance (cv.md) | Medium-Strong (RAG and agentic — yes; explicit fine-tuning of LLMs / mid-training / post-training — limited evidence; closest is Stable Diffusion + LoRA fine-tuning for Agentic Pixel) |
| Ownership in high-ambiguity environments | Founder of E-Farming marketplace; Manga Lens shipped solo to Chrome Web Store; Agentic Pixel ongoing solo build (cv.md) | Strong |
| Operate independently with minimal guidance | Manga Lens solo ship + E-Farming founder + Suvidha solo NLP build | Strong |
| Strong product and engineering judgment (when to use ML, when not to) | Switched two-stage CNN to unified YOLOv8 for ~30% latency reduction (Driver Drowsiness); chose hierarchical summarization over single-pass for Suvidha; chose schema contracts over loose agent IO for Healthcare Claims (cv.md Projects) | Strong |
| Comfort in fast-moving early-stage environment | E-Farming founder + Series A-typical scope at Progress Solutions + multi-domain solo projects | Strong |
| Senior/staff gate (5-7+ yrs typical for staff at Series A health AI) | 2.5 yrs Applied AI + adjacent DevOps + earlier internships | **Weak** |
| Verifiable RL / mid-training / post-training of foundation models | No explicit RL fine-tuning or mid-training experience in CV | **Weak** |
| SF on-site (most of the week) | F-1 OPT US-base; SF relocation possible but expensive; Ohio-based currently | Weak (relocation friction) |
| Real-world clinical/biomedical/regulated data experience | HIPAA-conscious governance + clinical SME stakeholder calls + EHR/appointment preprocessing (cv.md) | Strong (nice-to-have hit) |

**Gaps:**
1. **Senior/staff explicit gate (CRITICAL).** JD: "We are primarily hiring for senior and staff-level engineers." Mitigation: Mid candidates with very strong production track records sometimes pass — Manga Lens public ship + healthcare RAG metrics + Agentic Healthcare Claims architecture are senior-leaning artifacts. But the JD bar is explicit. **Soft hard blocker.**
2. **Verifiable RL / mid-training / post-training of foundation models.** JD: "Verifiable reinforcement learning at scale, Mid-training and post-training of foundation models." Mitigation: Stable Diffusion + LoRA fine-tuning experience (Agentic Pixel) is closest adjacency; not LLM mid-training. Hard ramp gap. **Hard blocker for the RL track; soft for Q&A/RAG track.**
3. **SF on-site relocation from Ohio.** Mitigation: F-1 OPT US-base means no visa veto; Ohio→SF cost-of-living delta is ~2.5x; equity in Series A is the upside but cash flow risk for Mid candidate.
4. **2.5 yrs experience vs implied 5-7+ yrs for senior/staff.** Mitigation: Quantified production AI metrics help bridge but won't close 2.5-yr gap at Latent's bar. Better path: apply when Latent opens a Mid/Sr-tier role.

## C) Nivel y Estrategia

- **JD level:** Senior / Staff (explicit).
- **My level for this archetype:** Mid (2.5+ yrs Applied AI in healthcare RAG/agentic/predictive ML).
- **Sell senior-without-lying:** Lead with healthcare RAG production metrics + Agentic Healthcare Claims schema-contracted architecture + Manga Lens public ship + HIPAA-conscious governance discipline. Frame as "I've owned 0→1 healthcare AI systems and shipped them to clinical SMEs in HIPAA-conscious environments — ready for a senior tier with a 6-month review." Honest, but unlikely to clear Latent's explicit senior/staff bar.
- **If down-leveled:** Latent does not appear to offer a Mid tier currently. Better to monitor Latent's Ashby board for Mid/Sr-level openings and apply then. For now: skip or apply with explicit honest framing about year count.

## D) Comp y Demanda

| Item | Value | Source |
|---|---|---|
| Latent comp range (disclosed) | $225K – $300K+ base + meaningful equity | JD |
| SF Senior ML Engineer (healthcare AI Series A) | $200-280K base + equity | Levels.fyi 2026 SF Series A |
| SF Staff ML Engineer healthcare AI | $260-340K base + equity | Levels.fyi 2026 |
| Latent stage | Series A early-stage | JD ("early-stage, Series A company") |
| Demand signal | High — healthcare AI Series A wave (Latent + Abridge + Hippocratic + Latent + Picnic Health + Open Evidence) sustained 2026 hiring | Sector signals |
| Latent partnership / credibility | Self-described "clinically diverse dataset" — not yet at Abridge / Hippocratic brand recognition | Company page |

## E) Plan de Personalización

| # | Sección | Estado actual | Cambio propuesto | Por qué |
|---|---|---|---|---|
| 1 | (n/a — senior gate friction) | — | Recommend skipping unless user explicitly wants a stretch application; reserve effort for Percepta NYC (#588) and ServiceNow Moveworks (#591) where seniority gate is more achievable | Senior/staff gate + 2.5 yr gap |

If user insists on applying:
- **Summary:** Lead with healthcare RAG production metrics (~35% retrieval precision, >90% grounded alignment) + Agentic Healthcare Claims schema-contracted multi-agent architecture + HIPAA-conscious data governance. State openness to SF relocation honestly.
- **Risks honest:** Acknowledge year count vs senior/staff bar in cover letter; ask for screen anyway based on production ship history.

## F) Plan de Entrevistas

| # | JD Requirement | Story (S/T/A/R) | Reflection |
|---|---|---|---|
| 1 | Own end-to-end ML systems (architecture, data, modeling, evaluation, infra) | S: Healthcare RAG at Progress Solutions; T: ship clinical knowledge retrieval reliably to clinical SMEs; A: recursive semantic chunking + transformer embeddings + grounding controls + structured logging + FastAPI/Docker + HIPAA governance docs; R: ~35% retrieval precision, >90% grounded alignment, ~30% post-deploy defect reduction | Owned end-to-end from preprocessing → eval → packaging — but the trust gap with clinical SMEs was the biggest delivery risk, not modeling |
| 2 | Train/fine-tune LLMs for clinical reasoning, medical Q&A, evidence-grounded generation | S: Healthcare RAG + agentic LLM workflows; T: ground answers to clinical knowledge with audit trails; A: prompt engineering + structured outputs + grounding controls + RAG-grounded CPT/ICD validation in Agentic Healthcare Claims; R: hallucinations >30% reduced, agent stability ~25% improvement | RAG + grounding controls + schema contracts gave most of the safety; explicit fine-tuning would be next step (gap I'd close in role) |
| 3 | Make tradeoffs across accuracy, latency, cost, safety in high-stakes production | S: Driver Drowsiness Detection — replaced two-stage CNN with unified YOLOv8; T: real-time inference on resource-constrained edge; A: NMS tuning + sliding-window confidence aggregation + adaptive frame skipping; R: ~30% inference latency reduction, ~25% reduction in blink-driven false positives | Unified architecture beat staged pipeline — would default to single-stage where possible now |
| 4 | Develop evaluation frameworks for model safety / clinical validity | S: Agentic Healthcare Claims fraud risk pipeline; T: prevent cascading hallucinations across 5 agents in regulated audit-required context; A: schema-validated JSON contracts + RAG-grounded validation + ANN duplicate detection + audit-ready reasoning traces; R: explainable risk scoring | Hard schemas at every agent boundary turned the brittle multi-agent workflow into a debuggable, auditable pipeline |
| 5 | Integrate ML into product workflows + patient-facing applications | S: Patient no-show prediction at Progress Solutions; T: integrate into care engagement workflow; A: scikit-learn + XGBoost + class weighting + threshold calibration on validation set; R: 15-20% recall gain at >90% precision on high-risk cohorts | Threshold calibration on validation set was the highest-ROI hour of the project |
| 6 | Operate independently in high-ambiguity 0→1 | S: Manga Lens Chrome extension; T: ship multi-provider AI vision tool to Chrome Web Store solo; A: per-provider payload abstraction + 7-day cache + multi-section panel capture + per-domain selectors for 29 sites; R: shipped publicly | Solo 0→1 ship with no team — required hard scope cuts and sequenced delivery |
| 7 | Comfort with regulated datasets (HIPAA-equivalent) | S: HIPAA-conscious data governance at Progress Solutions; T: support EHR + appointment + ticket preprocessing for clinical SME consumption; A: de-identification + data lineage docs + evaluation audit trails + stakeholder-facing system-limitation docs; R: clinical-SME usable system | Building governance into the pipeline (not bolting it on) made stakeholder reviews faster |

**Case study to present:** Agentic Healthcare Claims Processing — schema-validated multi-agent fraud risk system with audit-ready reasoning traces. Closest to Latent's "evidence-grounded generation" + "evaluation frameworks for model safety" charter.

**Red-flag prep:** "You list 2.5 yrs but we're hiring senior/staff" — be honest: applied based on ship history (production healthcare AI metrics + Manga Lens + Agentic Healthcare Claims architecture), happy to be considered for any tier where the bar fits. "Why apply on-site SF from Ohio?" — F-1 OPT US-base; relocation cost real but doable; verify office days in screen.

## G) Posting Legitimacy

**Assessment:** High Confidence

| Signal | Finding | Weight |
|---|---|---|
| Posting age | Live on Ashby (jobBoard returned valid posting object 2026-05-06) | Positive |
| Apply button | Active Ashby flow | Positive |
| Tech specificity | Names PyTorch, RL, mid-training, post-training, evaluation frameworks, longitudinal patient data — strong domain specificity | Positive |
| Requirements realism | Senior/staff bar matches early-stage healthcare AI Series A norm; honest "we hire senior/staff" framing is a positive (not bait-and-switch) | Positive |
| Salary transparency | Disclosed $225K – $300K+ base + meaningful equity (CA pay-transparency compliance) | Positive |
| Layoff signal | None — Latent is Series A early-growth | Positive |
| Reposting | Sibling postings (Customer Enablement Trainer, SRE, Software Engineer, Frontend) — coordinated org-wide hiring push | Neutral-positive |
| Founding-team / domain credibility | "Clinically diverse dataset" + "longitudinal patient records" framing — domain-specific, not generic | Positive |

**Context Notes:** Latent Health is a real Series A SF healthcare AI startup with explicit senior/staff hiring bar. The honest framing about seniority is a positive legitimacy signal. The on-site SF requirement is enforced (not aspirational).

## H) Draft Application Answers

(Skipped — score < 4.5)

---

## Keywords extraídas

Machine Learning Engineer, healthcare AI, clinical reasoning, medical question answering, evidence-grounded generation, longitudinal patient records, LLM fine-tuning, mid-training, post-training, verifiable reinforcement learning, evaluation frameworks, model safety, clinical validity, PyTorch, production ML systems, San Francisco, Series A, senior, staff, Latent Health
