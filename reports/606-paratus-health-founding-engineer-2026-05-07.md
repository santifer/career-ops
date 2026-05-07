# Evaluación: Paratus Health — Founding Engineer

**Fecha:** 2026-05-07
**Arquetipo:** Applied AI / LLM Engineer + Agentic (voice AI healthcare ops)
**Score:** 4.1/5
**URL:** https://www.workatastartup.com/jobs/75300
**Legitimacy:** High Confidence
**Location:** Menlo Park, CA — On-site (Stanford-area)
**PDF:** output/2026-05-07/cv-deepak-mallampati-paratus-health-founding-engineer-2026-05-07.pdf
**Verification:** unconfirmed (batch mode — WaaS SPA returns shell only; YC + Stanford Daily corroborated)

---

## A) Resumen del Rol

| Dim | Detalle |
|-----|---------|
| Arquetipo | Applied AI / LLM Engineer + Agentic (Voice AI healthcare ops) |
| Domain | Healthcare — outpatient clinic operations (front desk calls, intake, insurance, EHR docs) |
| Function | Build (autonomous voice AI agents end-to-end + EHR integrations) |
| Seniority | Mid (1+ yrs, founding) |
| Remote | Menlo Park, CA on-site |
| Team size | Founding (Stanford-AI co-founders Bermudez-Canete + Hall, YC W25-era) |
| TL;DR | Build AI voice agents for outpatient clinics — calls, intake, insurance, billing prep, EHR docs (Epic / Athena). |

## B) Match con CV

| Requisito JD | Match en CV |
|--------------|-------------|
| Founding eng — own critical parts (voice agents, backend infra, EHR integrations) | cv.md:25-30 (RAG, agentic, predictive ML, FastAPI/Docker, EHR preprocessing) — 1:1 |
| 1+ yrs production engineering | cv.md:23 (2.5yr Progress Solutions in healthcare) |
| Voice AI / agentic | cv.md:26 (agentic LLM workflows w/ structured reasoning) + cv.md:71 (Agentic Healthcare Claims 5-stage pipeline) |
| EHR integrations (Epic, Athena) | cv.md:23 (HIPAA-conscious Healthcare Tech) + cv.md:30 (HIPAA-conscious governance, lineage docs) |
| End-to-end shipping ownership | Manga Lens Chrome Web Store (cv.md:59), Suvidha Flask API (cv.md:47), Dream Decoder full-stack FastAPI/React (cv.md:65) |
| Stanford-quality engineering culture | cv.md:91 (KSU Master's), cv.md:8 (measurable healthcare outcomes) |

**Gaps:**
1. No explicit voice/STT/TTS production experience — soft. Mitigation: cv.md:26 agentic workflows are voice-adjacent; mention willingness to ramp on Vapi/Bland/Twilio voice infra.
2. No Epic/Athena explicit experience — soft. Mitigation: HIPAA-conscious EHR preprocessing transferable; mention readiness to integrate against Athena Health/Epic FHIR APIs.
3. Menlo Park relocation from Kent OH — soft. Mitigation: F-1 OPT US-base allows; mention in cover.

## C) Nivel y Estrategia

**Nivel JD:** Mid IC, founding-flavor (Stanford founders, in-hospital traction at Stanford Hospital)
**Nivel candidato natural:** Mid-IC w/ healthcare AI 1:1
**Vender mid sin mentir:** Lead with "production agentic LLM workflows in healthcare w/ HIPAA-conscious governance" + "Agentic Healthcare Claims 5-stage agent pipeline w/ schema-validated JSON contracts to prevent cascading hallucinations" — exactly the multi-step voice/text agent reliability pattern Paratus needs for clinic intake → insurance verification → EHR documentation.
**Si me downlevelan:** Take SE I seat with full equity vesting accelerated by 6mo if shipping clinic-integration milestone.

## D) Comp y Demanda

| Source | Range | Note |
|--------|-------|------|
| YC posting | $100K-$200K + 0.80-1.40% | Founding-eng range |
| Levels.fyi (Bay Area Mid IC) | $160-220K | Posting on lower end of base, equity makes up |
| Glassdoor Founding Eng SF | $160-240K base | Lower base + meaningful equity tradeoff |

Comp on lower base side but founding equity (0.80-1.40%) is meaningful — at $30M valuation = $240K-420K worth, at $100M Series A = $800K-$1.4M paper value. Stanford backing + active hospital pilot = de-risked founding seat.

## E) Plan de Personalización

| # | Sección | Cambio |
|---|---------|--------|
| 1 | Summary | Lead with "Applied AI engineer (2.5+ yrs healthcare AI) shipping production agentic LLM workflows + RAG + predictive ML in HIPAA-conscious environments. Open to Bay Area relocation." |
| 2 | Competencies | Add: Voice AI Agents (adjacent), EHR Integration (Epic/Athena ready), Healthcare Operations Automation, Multi-Step Agentic, FastAPI/Docker, HIPAA-conscious |
| 3 | Experience top bullet | Promote agentic + RAG to top: "Agentic LLM workflows for multi-step healthcare queries (eligibility checks, care nav, doc clarification)". |
| 4 | Projects | Promote Agentic Healthcare Claims as headline project (5-stage agent pipeline w/ schema contracts) — direct parallel to clinic ops automation. |
| 5 | Footer | "F-1 OPT — open to Bay Area relocation; sponsorship welcome." |

## F) Plan de Entrevistas

| # | Req | STAR+R | Reflection |
|---|-----|--------|------------|
| 1 | Multi-step agent reliability | S: Healthcare claims w/ silent corruption risk between steps. T: Build trustworthy 5-stage agent pipeline. A: Schema-validated JSON contracts between agents, RAG-grounded CPT/ICD validation, audit-ready risk scoring. R: Prevented cascading hallucinations + explainable outputs. | Schema contracts > prompt-engineering trust. |
| 2 | Healthcare workflow automation | S: Eligibility/care-nav/doc-clarification queries at Progress. T: Reduce hallucinations on multi-hop. A: Agentic LLM workflows w/ structured reasoning + tool discipline + grounding rules. R: ~25% agent stability gain, >30% hallucination reduction. | Tool discipline > free-form prompts. |
| 3 | EHR integration discipline | S: EHR extracts at Progress. T: Reliable preprocessing for downstream models. A: Pandas/NumPy pipelines + de-id + data lineage docs. R: Dataset reliability >98%, downstream instability -40%. | Lineage docs save downstream pain. |
| 4 | Production-ready inference | S: ML/LLM at Progress. T: Production-ready. A: FastAPI/Flask + Docker + structured logging + load sim. R: ~30% post-deploy defect reduction. | Boring infra wins. |
| 5 | End-to-end shipping (founding) | S: Manga Lens Chrome ext shipped + Dream Decoder FastAPI/React. T: 0→1 shipping. A: MV3, multi-provider abstraction, intermediate prompt transformation layers. R: Live on Web Store + ~30% better contextual alignment. | Ship, instrument, iterate. |
| 6 | "Why Paratus" | Stanford founders + active hospital pilot + 90%+ patient satisfaction = de-risked founding seat. Healthcare AI 1:1 fit; agent reliability for clinic ops = direct skill transfer. | Founding seat where domain fits = compounding ownership. |

**Case study:** Lead Agentic Healthcare Claims demo — 5-stage agent pipeline w/ schema contracts is the closest architectural mirror to clinic ops voice agent + insurance verification + EHR doc flow.

## G) Posting Legitimacy

| Signal | Finding | Weight |
|--------|---------|--------|
| Posting age | YC active, 2 founding-eng listings (#1 + #2) — active scaling | Positive |
| Apply button | Active | Positive |
| Tech specificity | High (Epic, Athena, voice agents, insurance verification, billing prep — all named) | Positive |
| Comp transparency | $100-200K + 0.80-1.40% equity disclosed | Positive |
| Company traction | Stanford Hospital pilot + 8min+ saved per patient + 90%+ satisfaction | Positive |
| Press coverage | Stanford Daily article 2025-12-01 confirms hospital live | Positive |
| Reposting | First time on radar | Neutral |
| Role-company fit | 1:1 (clinic AI ops → founding eng for voice agents + EHR) | Positive |

**Assessment:** **High Confidence** — Stanford-backed, active hospital pilot, comp transparent, multiple founding-eng seats open.

## H) Draft Application Answers

(Score < 4.5 — skipped at 4.1, but flagged as strong apply candidate.)

---

## Keywords extraídas

founding engineer, voice AI agents, healthcare operations, outpatient clinics, EHR, Epic, Athena, insurance verification, intake, billing prep, autonomous agents, multi-step agentic, RAG, FastAPI, HIPAA-conscious, end-to-end ownership
