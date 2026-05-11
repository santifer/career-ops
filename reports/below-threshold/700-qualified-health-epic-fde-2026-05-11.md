# Evaluación: Qualified Health — Epic Forward Deployed Engineer

**Fecha:** 2026-05-11
**Arquetipo:** AI Solutions / Forward Deployed Engineer (Healthcare AI / Epic integration tilt)
**Score:** 2.4/5
**URL:** https://jobs.ashbyhq.com/qualified-health-pbc/88dc8b6a-8aaf-4f0a-8c1a-a0249d647dd4
**Legitimacy:** High Confidence
**Location:** United States — Remote; up to 30% travel to health system client sites
**PDF:** Not generated (score < 3.0)

---

## A) Resumen del Rol

| Field | Value |
|---|---|
| Arquetipo | Epic Forward Deployed Engineer — client-facing solution design for embedding QH's GenAI clinical workflows inside Epic EHR via Bridges, FHIR R4, CDS Hooks, SMART on FHIR |
| Domain | Healthcare AI governance — guardrails, healthcare-specific agent creation, real-time algorithm monitoring; embedded at health system client sites |
| Function | Map clinical workflows, design integration specs, drive Epic build on client side, own end-to-end testing, translate field learnings to product/engineering |
| Seniority | 5+ years in Epic implementation consulting / health system clinical apps / healthcare IT integration / SMART on FHIR development |
| Remote | US Remote with up to 30% travel to client sites |
| Comp | $150,000 – $200,000 + equity + benefits |
| TL;DR | Healthcare AI FDE role with strong domain match (Deepak has 2.5y Healthcare RAG/agentic LLM at Progress Solutions) but heavy Epic-specific gating: 5+ years Epic implementation experience, hands-on Epic module build (Bridges/Ambulatory/ClinDoc/MyChart/Orders/BPAs), Epic Project Workplan familiarity. Deepak has clinical AI but zero Epic EHR build experience. Not the right archetype despite domain overlap. |

## B) Match con CV

| JD requirement | CV evidence |
|---|---|
| 5+ years Epic implementation consulting / health system clinical apps / healthcare IT integration / SMART on FHIR development | **GAP** — Deepak has 2.5y at Progress Solutions in Healthcare RAG + agentic LLM + predictive ML (cv.md L22-30) but no Epic implementation, no SMART on FHIR work, no health-system-side build experience |
| Direct hands-on Epic module experience (Bridges, Ambulatory, ClinDoc, MyChart, Orders, BPAs) | **GAP** — no Epic module experience in cv.md |
| Solution design in front of clients; walk a health system IT team through an interface architecture | Partial — stakeholder-facing system-limitation docs at Progress (cv.md L30); Suvidha Flask API for non-technical nonprofit staff (cv.md L47); Patient Records bottle+SQLite CRUD with normalized schema (cv.md L83) — but no health-system client-facing solution design experience |
| HL7 v2 / FHIR R4 message structures, data flows, integration patterns | **GAP** — no HL7/FHIR mention in cv.md; HIPAA-conscious data governance experience does NOT cover EHR interop messaging |
| Strong written/verbal communication; interface specs + requirements sessions + CMO conversations | Stakeholder-facing system-limitation docs at Progress (cv.md L30); Student Manager 150+ students (cv.md L52); E-Farming founder customer interviews (cv.md L87) |
| Healthcare AI domain familiarity | Strong — Healthcare RAG ~35% retrieval precision, agentic LLM workflows ~25% stability, predictive ML 15-20% recall gain on high-risk patient categories, HIPAA-conscious data governance (cv.md L25-30); Agentic Healthcare Claims schema-validated multi-agent pipeline (cv.md L72); Patient Records Management web app (cv.md L83) |
| Generative AI guardrails / agent creation / algorithm monitoring | Strong — agentic LLM workflows with structured reasoning + tool discipline + grounding rules at Progress (cv.md L26); Agentic Healthcare Claims with schema-validated JSON contracts to prevent cascading hallucinations (cv.md L72); RAG-grounded CPT/ICD validation (cv.md L72) |

**Gaps (decisive):**
1. **No Epic EHR experience:** JD requires hands-on Epic module work and Epic certification or implementation go-live experience. This is a hard gate — the role is explicitly for someone who has "lived inside health systems or Epic implementation environments." Deepak has no Epic exposure.
2. **No HL7 v2 / FHIR R4 / SMART on FHIR experience:** While Deepak's HIPAA-conscious data governance is adjacent, the JD wants EHR interop message-structure and integration-pattern fluency that is not in cv.md.
3. **5+ years health system / EHR integration:** Deepak's 2.5y is in clinical AI (RAG, agents, predictive ML) — not in EHR build or health system IT. Half the floor, wrong archetype.
4. **Client-facing FDE at health systems:** Deepak's closest analog is Suvidha Foundation (nonprofit, video summarization) + stakeholder docs at Progress — neither is health-system Epic team-facing.

## C) Nivel y Estrategia

- JD: 5+ years Epic / health system / FHIR. This is an **Archetype A: Epic Implementation Background** OR **Archetype B: Health System Clinical Informatics / Workflow Background** role. Deepak fits neither.
- Candidate: Healthcare AI engineer 2.5y. The JD says explicitly "this is a hands-on, client-facing, solution-design role — not a back-office engineering position." Deepak's profile is back-office healthcare AI engineering, not Epic-side client engagement.
- Sell: Cannot honestly sell Epic implementation experience. Could pivot conversation to "I'd be a strong fit for a Healthcare AI Engineer role on your platform/agent team — not the Epic FDE seat." But that's a different requisition.
- Recommendation: **SKIP.** Apply only if QH opens a non-Epic Healthcare AI Engineer role. The Epic gating is structural, not coverable by transfer learning narrative.

## D) Comp y Demanda

| Source | Number | Notes |
|---|---|---|
| Qualified Health JD | $150,000 – $200,000 base + equity + benefits | Transparent disclosure |
| Levels.fyi - Epic FDE / Healthcare AI integration | $140-200K base + 5-15% bonus | Health-tech Series A/B median |
| Glassdoor - Epic consultant / FDE | $130-180K base | Epic-certified consultant range |
| Built In - Healthcare AI Engineer | $140-200K base | Domain-equivalent IC band |

Comp is fair for the seniority band JD targets, but the band is not Deepak's.

## E) Plan de Personalización

Not applicable — score < 3.0. No PDF tailoring planned.

If forced to apply (override): lead with Healthcare RAG + agentic LLM workflows + HIPAA governance + clinical stakeholder docs + Patient Records app. Acknowledge Epic gap up front in cover letter and ask whether a Healthcare AI Engineer / Applied AI seat exists.

## F) Plan de Entrevistas

Not applicable — recommend against applying. STAR+R stories for healthcare AI FDE in general (transferable to other QH-style roles):

| # | JD-style requirement | STAR+R |
|---|---|---|
| 1 | Healthcare AI solution design with clinical stakeholders | S: Progress healthcare customer needed eligibility-check + care-workflow automation; T: ship agentic LLM workflow with structured reasoning + grounding + audit trails; A: tool discipline + RAG grounding rules + HIPAA-conscious data lineage + system-limitation docs; R: ~25% agent response stability gain + continued usage; **Reflection:** the audit trail is the trust contract with clinical stakeholders |
| 2 | RAG-grounded clinical knowledge retrieval | S: Progress clinical knowledge corpus needed high-precision retrieval; T: build RAG system on heterogeneous healthcare documents; A: recursive semantic chunking + transformer embeddings + retrieval-grounded response alignment evaluation; R: ~35% precision improvement + >30% irrelevant retrieval reduction + >90% grounded response alignment; **Reflection:** chunking strategy mattered more than embedding model choice |
| 3 | Multi-agent healthcare workflow with schema-validated contracts | S: claims processing prone to cascading hallucinations across agents; T: design multi-agent pipeline with explicit handoffs; A: schema-validated JSON contracts between Intake → Validation → Consistency → Duplicate → Risk Scoring agents; RAG-grounded CPT/ICD validation; explainable risk scoring with audit-ready traces; R: no cascading hallucinations + explainable risk traces; **Reflection:** the schema is the contract — it forced clarity at every agent boundary |
| 4 | Stakeholder-facing documentation for non-technical health users | S: Suvidha nonprofit staff needed video summarization without ML expertise; T: ship usable Flask API + UI; A: clear input/output contract + 85% highlight-alignment metric + lightweight web UI; R: 60-70% review-time reduction, daily use by non-technical staff; **Reflection:** time-saved-per-task lands harder with non-technical users than F1 |

## G) Posting Legitimacy

**Assessment:** High Confidence

| Signal | Finding | Weight |
|---|---|---|
| Apply button | Active (Ashby GraphQL `jobPosting` returns full payload 2026-05-11; job id 88dc8b6a-... live) | Positive |
| Description quality | Highly specific: names Epic modules (Bridges, Ambulatory, ClinDoc, MyChart, Orders, BPAs), interop standards (HL7 v2, FHIR R4, CDS Hooks, SMART on FHIR), seniority (5+y), comp band ($150-200K), travel (30%), two clear archetype paths (Epic Background vs Clinical Informatics Background) | Positive |
| Comp transparency | Disclosed in JD body ($150-200K) | Positive |
| Visa | Not addressed in JD | Mixed |
| Company state | Qualified Health PBC — well-funded healthcare AI startup; mission specificity (GenAI guardrails, healthcare-specific agents, real-time algorithm monitoring) suggests real product | Positive |
| Role specificity | "Founding team members ... building a category-defining product" + concrete responsibilities (workflow discovery, integration specs, interface build coordination, end-to-end testing) | Positive |
| Reposting | First time seen in scan-history; high specificity argues against ghost posting | Positive |
| Role-company fit | Epic FDE is structural to QH's go-to-market — embedding AI inside Epic EHR is the product | Positive |

**Context Notes:** Real, well-defined opening at a healthcare AI startup. Posting is specific enough to be legitimate. The gating is honest — they want Epic experience because the role is client-facing Epic integration design, not generic FDE. Score is low because of candidate-side mismatch, not posting concerns.

## H) Draft Application Answers

Not generated — score < 3.0; do not apply.

---

## Keywords extraídas

Qualified Health, Epic Forward Deployed Engineer, Epic implementation, Epic Bridges, Epic Ambulatory, ClinDoc, MyChart, Orders, BPAs, HL7 v2, FHIR R4, CDS Hooks, SMART on FHIR, healthcare AI, GenAI guardrails, healthcare-specific agents, real-time algorithm monitoring, clinical informatics, In Basket, CDS card, AVS note, SendMessage, MDM T02, interface spec, workflow discovery, US Remote, 30% travel, $150K-$200K.
