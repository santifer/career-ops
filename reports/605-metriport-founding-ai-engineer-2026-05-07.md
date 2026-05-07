# Evaluación: Metriport — Founding AI Engineer

**Fecha:** 2026-05-07
**Arquetipo:** Applied AI / LLM Engineer (healthcare RAG + structured extraction)
**Score:** 4.0/5
**URL:** https://www.workatastartup.com/jobs/70857
**Legitimacy:** High Confidence
**Location:** San Francisco / Bay Area — On-site (relocation OK)
**PDF:** output/2026-05-07/cv-deepak-mallampati-metriport-founding-ai-engineer-2026-05-07.pdf
**Verification:** unconfirmed (batch mode — WaaS SPA returns shell only; YC mirror corroborated)

---

## A) Resumen del Rol

| Dim | Detalle |
|-----|---------|
| Arquetipo | Applied AI / LLM Engineer (Healthcare data intelligence) |
| Domain | Healthcare — open-source platform for healthcare data intelligence |
| Function | Build (full-stack AI on domain-specific problems) |
| Seniority | Mid (3+ yrs full-stack; "founding") |
| Remote | SF/Bay Area on-site (relocation accepted) |
| Team size | 23 (S22 YC) |
| TL;DR | Deploy full-stack AI solutions for structured data extraction from unstructured HTML/PDFs/free text in healthcare. |

## B) Match con CV

| Requisito JD | Match en CV |
|--------------|-------------|
| 3+ yrs full-stack engineer | cv.md:23 (2.5yr Progress Solutions) + cv.md:32 (Emerson DBA/DevOps Intern) — borderline 3yr |
| Full-stack AI for domain-specific problems | cv.md:25-30 (Progress: RAG, agentic, predictive ML, FastAPI/Docker, EHR preprocessing) |
| Structured data extraction from HTML, PDFs, free text | cv.md:25 RAG over clinical knowledge + cv.md:29 EHR extracts; Suvidha video summarization (cv.md:44) — multi-format |
| ML/DL fundamentals (not just LLM tools) | cv.md:14 (PyTorch, scikit-learn, XGBoost, transformers) + cv.md:27 (predictive ML 15-20% recall gain) |
| FHIR/HIE/EHR/EMR/NPI/TEFCA preferred | cv.md:23 (Healthcare Tech) + cv.md:30 (HIPAA-conscious, de-id, lineage) — partial; mention EHR experience explicitly |
| Entrepreneurial / founding mindset | cv.md:86 (E-Farming founder/full-stack) |
| US citizenship OR visa sponsorship | F-1 OPT — explicitly accepted ("US citizenship or visa sponsorship") |

**Gaps:**
1. No explicit FHIR/TEFCA naming in CV — soft. Mitigation: cover-letter call out HIPAA-conscious + EHR + de-id experience and willingness to ramp on FHIR/TEFCA.
2. 0.5yr seniority short on 3+ — soft. Mitigation: "2.5yrs production AI in healthcare + Emerson DBA/DevOps yrs as full-stack-adjacent foundation".
3. SF relocation from Kent OH — neutral. Mitigation: explicit "open to relocation".

## C) Nivel y Estrategia

**Nivel JD:** Mid IC, founding-flavor (small team, 23 employees S22)
**Nivel candidato natural:** Mid-IC w/ 1:1 healthcare AI/RAG fit
**Vender mid sin mentir:** Lead with "shipping production RAG + agentic LLM workflows + predictive ML in healthcare end-to-end at HIPAA-conscious environments" — specific outcomes (~35% retrieval precision, >30% hallucination reduction, 15-20% recall on high-risk patients, ~30% defect reduction). Frame Agentic Healthcare Claims project as the structured-extraction parallel — same parsing-validation-routing primitives Metriport's open-source platform needs.
**Si me downlevelan:** Take SE I seat at $130-150K + earlier equity vesting; 6-month review to founding/L2.

## D) Comp y Demanda

| Source | Range | Note |
|--------|-------|------|
| YC posting cluster | $120K-$240K + equity | SF range |
| Levels.fyi (SF AI eng E3-E4) | $180-260K total | YC startup leans low base + equity |
| Glassdoor Founding Eng SF | $160-240K base | Posting in normal band |

Founding-tagged role at funded YC S22 — modest base + meaningful equity (FAANG-comparable total possible if exit). Open-source moat + healthcare data interop is durable.

## E) Plan de Personalización

| # | Sección | Cambio |
|---|---------|--------|
| 1 | Summary | Lead with "Applied AI engineer (2.5+ yrs healthcare AI) — production RAG, agentic LLM workflows, predictive ML in HIPAA-conscious environments. Open to SF relocation. F-1 OPT (sponsorship welcome)." |
| 2 | Competencies | Add: Healthcare Data Intelligence, Structured Extraction (HTML/PDF/Text), HIPAA-conscious Governance, Open-Source Mindset, FastAPI/Docker, Multi-Format RAG |
| 3 | Experience top bullet | Promote EHR extracts + RAG over clinical knowledge to top: "Built Retrieval-Augmented Generation (RAG) for clinical knowledge retrieval and healthcare documentation search". |
| 4 | Projects | Promote Agentic Healthcare Claims (structured extraction parallel) + Patient Records mgmt (relational schema discipline) over IoT/Drowsiness. |
| 5 | Footer | "F-1 OPT — sponsorship offered per Metriport posting; open to SF relocation." |

## F) Plan de Entrevistas

| # | Req | STAR+R | Reflection |
|---|-----|--------|------------|
| 1 | Structured extraction from PDFs/HTML/text | S: Multi-format healthcare docs at Progress. T: Pull structured data into RAG. A: Recursive semantic chunking + transformer embeddings + grounding rules + audit trails. R: ~35% retrieval precision, >90% grounded alignment. | Chunking strategy + grounding > model swap. |
| 2 | Healthcare data interop (FHIR/EHR adjacent) | S: EHR extracts + appointment + ticket logs at Progress. T: Build reliable preprocessing for downstream models. A: Pandas/NumPy pipelines + de-id + data lineage docs. R: Dataset reliability >98%, downstream instability -40%. | Lineage docs save downstream pain. |
| 3 | Multi-step LLM/agentic | S: Multi-step healthcare queries (eligibility, care nav, doc clarification). T: Reduce hallucinations on multi-hop. A: Agentic LLM workflows w/ structured reasoning + tool discipline + grounding rules. R: ~25% agent stability gain, >30% hallucination reduction. | Tool discipline > free-form prompts. |
| 4 | Production-ready AI | S: ML/LLM inference at Progress. T: Production-ready. A: FastAPI/Flask + Docker + structured logging + load sim. R: ~30% post-deploy defect reduction. | Boring infra wins. |
| 5 | Predictive ML | S: Patient no-show + care engagement at Progress. T: Improve high-risk recall. A: scikit-learn/XGBoost w/ class weighting + stratified sampling + threshold calibration. R: 15-20% recall gain on high-risk while precision >90%. | Threshold calibration > metric optimization. |
| 6 | Open-source contribution | S: Manga Lens Chrome ext shipped. T: Public release w/ privacy policy + per-domain configs. A: MV3, multi-provider abstraction, narrowed host permissions, narrative documentation. R: Live on Web Store, 29 site configs. | OSS = ship-quality docs first. |
| 7 | "Why Metriport" | Open-source healthcare data interop = durable moat; Deepak's HIPAA-conscious + EHR + RAG stack = direct fit; founding-flavor = ownership over modules end-to-end. | Domain alignment > prestige. |

**Case study:** Lead Agentic Healthcare Claims (5-stage agent pipeline w/ schema-validated JSON contracts) — direct parallel to Metriport's structured-extraction problem.

## G) Posting Legitimacy

| Signal | Finding | Weight |
|--------|---------|--------|
| Posting age | YC active listing | Positive |
| Apply button | Active (workatastartup standard) | Positive |
| Tech specificity | High (FHIR/HIE/EHR/NPI/TEFCA enumerated explicitly) | Positive |
| Comp transparency | YC cluster $120-240K + equity disclosed | Positive |
| Company hiring signals | 17 open roles — hiring across full stack/SE/AI | Positive (active scaling) |
| Reposting | First time on radar | Neutral |
| Visa policy | "US citizenship or visa sponsorship" — explicit | Positive |
| Role-company fit | 1:1 (open-source healthcare AI platform → founding AI eng) | Positive |

**Assessment:** **High Confidence** — visa-friendly, healthcare AI 1:1, open-source moat, traction (S22 + 23 employees + scaling).

## H) Draft Application Answers

(Score < 4.5 — skipped, but report flags as strong apply candidate.)

---

## Keywords extraídas

healthcare AI, RAG, structured data extraction, EHR, FHIR, HIPAA, full-stack, founding engineer, Python, ML, deep learning fundamentals, agentic, open-source, data interoperability, NPI, TEFCA, HIE, EMR
