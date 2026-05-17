# Modo: oferta — Evaluación Completa A-G

Cuando el candidato pega una oferta (texto o URL), entregar SIEMPRE los 7 bloques (A-F evaluation + G legitimacy):

## Paso 0 — Detección de Arquetipo

Clasificar la oferta en uno de los 6 arquetipos (ver `_shared.md`). Si es híbrido, indicar los 2 más cercanos. Esto determina:
- Qué proof points priorizar en bloque B
- Cómo reescribir el summary en bloque E
- Qué historias STAR preparar en bloque F

---

## Bloque H — Hard-Skip Gates (EVALUAR PRIMERO)

**CRITICAL — Run BEFORE scoring Blocks A–G.** These are recruiter-screen-level disqualifiers identified by the 2026-05-16 false-positive audit (`data/eval-flaws-audit-2026-05-16.md`). If ANY gate fires, the eval ends here: score = the corrected value per the gate rule, decision = SKIP, and the rest of the blocks are NOT generated. Do not let strong North Star Alignment or Company Reputation compensate for a fired gate — the audit proved this is the dominant false-positive pattern.

Output the gate-check as the first line after `SCORE/ARCHETYPE/DECISION`:

```
GATES: [H1, H3] fired → SKIP (Python production primary + dev-tool FDE title screen)
```

or, if all gates pass:

```
GATES: none fired
```

Then proceed to Blocks A–G with normal scoring.

---

### H1 — Python Production Primary Gate

**Condition:** JD names Python as a PRIMARY production language (not "or TypeScript/JS", not "nice to have", not "plus"). AND role title is NOT in {Communications, Editorial, DevRel, Developer Advocate, Comms Manager, Policy Communications, Technical Writer}. AND cv.md marks Python as "(learning)" or any non-production qualifier.

**Action:** HARD SKIP. Score CV Match dimension at 2.0/5 maximum. Overall composite capped at 3.4/5 unless H1 is the only gate firing AND the candidate has already shipped a public Python artifact (verified in cv.md).

**Rationale:** This is a literal ATS keyword filter at frontier-lab roles. The mitigation ("port career-ops scan-rss.mjs to Python in 1-2 weeks") is sound pre-work advice, NOT a justification for current-state scoring. The screen happens before Mitchell ports anything. Audit caught 6/14 high-score rows with this failure mode.

### H2 — Classical ML Stack Gate

**Condition:** JD names classical ML libraries in must-have section: pandas, scikit-learn, PyTorch, TensorFlow, Spark MLlib, CUDA, JAX, or equivalent. AND Mitchell has 0 shipped artifacts using any named library (per cv.md + article-digest.md).

**Action:** HARD SKIP. Overall composite capped at 3.0/5.

**Rationale:** Classical-ML stack is not LLM-orchestration; the two skill sets are non-overlapping. Mitchell's three production LLM agents do not equate to "multiple years of professional data science" experience. Not mitigable in current apply cycle.

### H3 — Developer-Tool FDE Title Gate

**Condition:** Role title contains "Forward Deployed Engineer" or "Applied AI Engineer." AND company's core product is a developer tool (IDE, code assistant, observability platform, DevOps toolchain, cloud infra). AND Mitchell has 0 years of titled SWE, FDE, or Solutions Engineer tenure.

**Action:** HARD SKIP unless JD explicitly states "no SWE background required" or "non-traditional backgrounds encouraged."

**Rationale:** Developer-tool FDEs pair-program inside customer codebases and are screened heavily on SWE identity. AI-model-lab FDEs (Anthropic, OpenAI, Cohere) have "equivalent experience" carve-outs; developer-tool FDEs (Cursor, ElevenLabs, LangChain) typically do not.

### H4 — External-Customer Mandatory Gate

**Condition:** JD uses phrases: "external enterprise customers", "paying customers", "customer accounts", "SOW", "renewal cycles", "customer churn", "customer success outcomes", "strategic accounts." AND role is FDE, SA, SE, or Solutions Consultant. AND Mitchell has 0 external-customer-facing titled tenure.

**Action:** Score CV Match for the customer-facing requirement at 1.5/5 maximum. Flag visibly: EXTERNAL-CUSTOMER-TENURE-GAP-HARD. If H1 also fires: HARD SKIP. If H4 is the only gate: score CV Match dimension at 1.5/5 (not 4.5/5) — this typically drops composite below 4.0.

**Rationale:** Google xGE is explicitly an INTERNAL customer surface (1,000 Principal/Distinguished/Fellow ICs at Google). Do NOT allow "xGE senior ICs are like external customers" framing in CV Match scoring. External enterprise SOW/renewal/churn cadence is fundamentally different rep.

### H5 — Non-Approved Metro + Domain-Anchor Gate

**Condition:** JD location is NOT on profile.yml approved-metros list. AND role domain is government affairs / policy / lobbying / federal relations / regulatory affairs / Hill-adjacent press.

**Action:** Score Remote Quality 2/5 (NOT 4/5). If corrected Remote Quality drops composite below 4.0: SKIP.

**Rationale:** These domains are physically anchored to DC. Monthly visits from Seattle are not viable for DC press cadence. "Probe relocation in screen" is a negotiating position, not a relocation solution for day-1 effectiveness.

### H6 — Undisclosed Comp at Non-Named-Target Gate

**Condition:** JD does not disclose salary range. AND company is NOT in {Anthropic, OpenAI, Google, Microsoft, Meta, Apple, Amazon, NVIDIA, Databricks, Stripe, Salesforce, Netflix}.

**Action:** Score Estimated Comp at 2.5/5 maximum (NOT 3.5/5 based on optimistic estimation). Flag: COMP-UNDISCLOSED-NON-NAMED. Recruiter-screen comp confirmation REQUIRED before converting Evaluated → Applied.

**Rationale:** Undisclosed comp at smaller/unlisted companies statistically tracks below floor. Optimistic estimation ("Cognition likely $200K+") is speculation; do not score it as fact.

### H7 — Named-Agentic-Pattern Production Gate

**Condition:** JD explicitly names a required agentic reasoning pattern by name: ReAct, Plan-and-Execute, Chain-of-Thought-with-tools, multi-turn-reasoning-loop, MCTS-style search. AND Mitchell has 0 publicly shipped artifacts demonstrating that specific pattern.

**Action:** Score Tech Stack dimension at 3.0/5 maximum (NOT 5.0/5 for "LLM stack generally"). Flag: NAMED-AGENTIC-PATTERN-GAP.

**Rationale:** Tech Stack 5/5 requires actual production rep with the named patterns. "Custom state machines are equivalent to ReAct" is a cover-letter framing, not a scoring justification. A senior Applied AI interviewer who asks "what's your ReAct iteration pattern?" will find the misframe immediately.

### H8 — Vector-Database Label Accuracy Gate

**Condition:** Candidate CV describes Voice DNA as a "RAG pipeline." AND the implementation does NOT use a vector database (it uses curated corpus + context-window loading).

**Action:** Flag: RAG-LABEL-ACCURACY-REQUIRED. Before generating any CV tailoring for an Applied AI role, correct the "RAG pipeline" label to "context-engineering pipeline with curated corpus and negative-training set." Do NOT score CV Match above 3.0/5 on the RAG/retrieval dimension unless the Pinecone/pgvector proof artifact exists in the public repo.

**Rationale:** Anthropic, Cohere, and other LLM companies interview against architectural specifics. A misframed "RAG pipeline" will surface in technical screen and erode credibility.

### H9 — Pre-Apply Mitigation Not Pre-Scored Gate

**Condition:** Eval recommends a pre-apply action (ship Python artifact, convert module to TypeScript, stand up Pinecone index, deploy to Cloud Run).

**Action:** Score the current-state gap AS IF the mitigation does NOT exist yet. Pre-apply work is a CONDITIONAL score upgrade trigger. Do NOT credit the upgrade in the current score; emit a `score_after_mitigation` field with the projected score IF the artifact ships.

**Rationale:** Scores assigned pre-mitigation lead to APPLY recommendations for a candidate profile that does not yet exist. The application goes in while the mitigation is still pending; the recruiter sees the pre-mitigation resume. Score what's true today, not what could be true.

### H10 — Merger/Acquisition Stability Compound Gate

**Condition:** Company has been acquired OR announced merger within 90 days of eval. AND layoff chatter is active on TeamBlind/Glassdoor/Blind.

**Action:** Reduce Company Reputation by 1.0 point. Reduce Estimated Comp by 0.5 (equity-terms uncertainty). Flag: MERGER-INSTABILITY.

**Rationale:** Cultural Signals -1 alone (currently the only adjustment) is insufficient at 5% weight (0.05 weighted drop). The combined impact of Reputation -0.15 + Comp -0.05 = 0.20 weighted drop is closer to the actual deal risk.

### H11 — Policy Vertical Domain Knowledge Gate

**Condition:** Role title contains "Policy" AND function is government affairs / policy communications / regulatory affairs / public policy / federal relations. AND Mitchell has 0 years titled policy-comms / public-affairs / government-relations tenure.

**Action:** North Star Alignment maximum 3.0/5 (NOT 3.8/5). Flag: POLICY-VERTICAL-SPECIALIST-GAP.

**Rationale:** Tier B archetype credit is for Communications roles at AI-native companies; Policy Communications is a specialist vertical requiring vertical-specific tenure. A generic comms operator without policy experience is not a Tier B primary-fit for this function. Ahmed coalition + Fusion lawsuit window are valid interview framing, not credentials.

### H12 — SWE-Bar Primary Screen Gate

**Condition:** Role title contains "Software Engineer" (including suffixed variants like "Forward Deployed Engineer - Software Engineer"). AND 0 years of titled SWE tenure in Mitchell's CV history.

**Action:** Score CV Match at 3.0/5 maximum. Flag: SWE-TITLE-SCREEN-HARD.

**Rationale:** "Software Engineer" in the title signals SWE-screen criteria (pair-programming assessment, systems-design round, coding challenge). Mitchell's titled history is Comms/PgM. The maximum 3.0/5 preserves the apply option if shipped artifacts are strong but prevents a 4.5/5 APPLY recommendation.

---

### Composite-Score Override Rules

After scoring Blocks A–G with weights, apply these final corrections:

1. **If 2+ hard gates fired:** Composite capped at 3.0/5, decision = SKIP regardless of weighted sum.
2. **If 1 hard gate fired AND no warm intro:** Composite capped at 3.5/5, decision = DEFER (re-evaluate when mitigation in hand).
3. **If 1 hard gate fired AND warm intro exists** (LinkedIn 1st-degree at company OR confirmed referral): Composite capped at 3.9/5, decision = DEFER with referral-first note.
4. **If no hard gates fired:** Use normal weighted composite.
5. **Halo correction:** When Company Reputation + Cultural Signals + Growth Trajectory together contribute > 1.0 point to the composite AND CV Match is < 4.0/5, surface in recommendation: "NOTE: score relies on {0.X} of compensation from Reputation/Stack/Growth — apply only if {gap mitigation} is in hand." Audit found this compensates for real CV gaps in 3 of 14 rows.

---

## Bloque A — Resumen del Rol

Tabla con:
- Arquetipo detectado
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Function (build/consult/manage/deploy)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (si se menciona)
- TL;DR en 1 frase

## Bloque B — Match con CV

Lee `cv.md`. Crea tabla con cada requisito del JD mapeado a líneas exactas del CV.

**Adaptado al arquetipo:**
- Si FDE → priorizar proof points de delivery rápida y client-facing
- Si SA → priorizar diseño de sistemas e integrations
- Si PM → priorizar product discovery y métricas
- Si LLMOps → priorizar evals, observability, pipelines
- Si Agentic → priorizar multi-agent, HITL, orchestration
- Si Transformation → priorizar change management, adoption, scaling

Sección de **gaps** con estrategia de mitigación para cada uno. Para cada gap:
1. ¿Es un hard blocker o un nice-to-have?
2. ¿Puede el candidato demostrar experiencia adyacente?
3. ¿Hay un proyecto portfolio que cubra este gap?
4. Plan de mitigación concreto (frase para cover letter, proyecto rápido, etc.)

## Bloque C — Nivel y Estrategia

1. **Nivel detectado** en el JD vs **nivel natural del candidato para ese arquetipo**
2. **Plan "vender senior sin mentir"**: frases específicas adaptadas al arquetipo, logros concretos a destacar, cómo posicionar la experiencia de founder como ventaja
3. **Plan "si me downlevelan"**: aceptar si comp es justa, negociar review a 6 meses, criterios de promoción claros

## Bloque D — Comp y Demanda

Usar WebSearch para:
- Salarios actuales del rol (Glassdoor, Levels.fyi, Blind)
- Reputación de compensación de la empresa
- Tendencia de demanda del rol

Tabla con datos y fuentes citadas. Si no hay datos, decirlo en vez de inventar.

## Bloque E — Plan de Personalización

| # | Sección | Estado actual | Cambio propuesto | Por qué |
|---|---------|---------------|------------------|---------|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 cambios al CV + Top 5 cambios a LinkedIn para maximizar match.

## Bloque F — Plan de Entrevistas

6-10 historias STAR+R mapeadas a requisitos del JD (STAR + **Reflection**):

| # | Requisito del JD | Historia STAR+R | S | T | A | R | Reflection |
|---|-----------------|-----------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` exists, check if any of these stories are already there. If not, append new ones. Over time this builds a reusable bank of 5-10 master stories that can be adapted to any interview question.

**Seleccionadas y enmarcadas según el arquetipo:**
- FDE → enfatizar velocidad de entrega y client-facing
- SA → enfatizar decisiones de arquitectura
- PM → enfatizar discovery y trade-offs
- LLMOps → enfatizar métricas, evals, production hardening
- Agentic → enfatizar orchestration, error handling, HITL
- Transformation → enfatizar adopción, cambio organizacional

Incluir también:
- 1 case study recomendado (cuál de sus proyectos presentar y cómo)
- Preguntas red-flag y cómo responderlas (ej: "¿por qué vendiste tu empresa?", "¿tienes equipo de reports?")

## Bloque G — Posting Legitimacy

Analyze the job posting for signals that indicate whether this is a real, active opening. This helps the user prioritize their effort on opportunities most likely to result in a hiring process.

**Ethical framing:** Present observations, not accusations. Every signal has legitimate explanations. The user decides how to weigh them.

### Signals to analyze (in order):

**1. Posting Freshness** (from Playwright snapshot, already captured in Paso 0):
- Date posted or "X days ago" -- extract from page
- Apply button state (active / closed / missing / redirects to generic page)
- If URL redirected to generic careers page, note it

**2. Description Quality** (from JD text):
- Does it name specific technologies, frameworks, tools?
- Does it mention team size, reporting structure, or org context?
- Are requirements realistic? (years of experience vs technology age)
- Is there a clear scope for the first 6-12 months?
- Is salary/compensation mentioned?
- What ratio of the JD is role-specific vs generic boilerplate?
- Any internal contradictions? (entry-level title + staff requirements, etc.)

**3. Company Hiring Signals** (2-3 WebSearch queries, combine with Block D research):
- Search: `"{company}" layoffs {year}` -- note date, scale, departments
- Search: `"{company}" hiring freeze {year}` -- note any announcements
- If layoffs found: are they in the same department as this role?

**4. Reposting Detection** (from scan-history.tsv):
- Check if company + similar role title appeared before with a different URL
- Note how many times and over what period

**5. Role Market Context** (qualitative, no additional queries):
- Is this a common role that typically fills in 4-6 weeks?
- Does the role make sense for this company's business?
- Is the seniority level one that legitimately takes longer to fill?

### Output format:

**Assessment:** One of three tiers:
- **High Confidence** -- Multiple signals suggest a real, active opening
- **Proceed with Caution** -- Mixed signals worth noting
- **Suspicious** -- Multiple ghost job indicators, investigate before investing time

**Signals table:** Each signal observed with its finding and weight (Positive / Neutral / Concerning).

**Context Notes:** Any caveats (niche role, government job, evergreen position, etc.) that explain potentially concerning signals.

### Edge case handling:
- **Government/academic postings:** Longer timelines are standard. Adjust thresholds (60-90 days is normal).
- **Evergreen/continuous hire postings:** If the JD explicitly says "ongoing" or "rolling," note it as context -- this is not a ghost job, it is a pipeline role.
- **Niche/executive roles:** Staff+, VP, Director, or highly specialized roles legitimately stay open for months. Adjust age thresholds accordingly.
- **Startup / pre-revenue:** Early-stage companies may have vague JDs because the role is genuinely undefined. Weight description vagueness less heavily.
- **No date available:** If posting age cannot be determined and no other signals are concerning, default to "Proceed with Caution" with a note that limited data was available. NEVER default to "Suspicious" without evidence.
- **Recruiter-sourced (no public posting):** Freshness signals unavailable. Note that active recruiter contact is itself a positive legitimacy signal.

---

## Post-evaluación

**SIEMPRE** después de generar los bloques A-G:

### 1. Guardar report .md

Guardar evaluación completa en `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = siguiente número secuencial (3 dígitos, zero-padded)
- `{company-slug}` = nombre de empresa en lowercase, sin espacios (usar guiones)
- `{YYYY-MM-DD}` = fecha actual

**Formato del report:**

```markdown
# Evaluación: {Empresa} — {Rol}

**Fecha:** {YYYY-MM-DD}
**Arquetipo:** {detectado}
**Score:** {X/5}
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}
**PDF:** {ruta o pendiente}

---

## A) Resumen del Rol
(contenido completo del bloque A)

## B) Match con CV
(contenido completo del bloque B)

## C) Nivel y Estrategia
(contenido completo del bloque C)

## D) Comp y Demanda
(contenido completo del bloque D)

## E) Plan de Personalización
(contenido completo del bloque E)

## F) Plan de Entrevistas
(contenido completo del bloque F)

## G) Posting Legitimacy
(contenido completo del bloque G)

## H) Draft Application Answers
(solo si score >= 4.5 — borradores de respuestas para el formulario de aplicación)

---

## Keywords extraídas
(lista de 15-20 keywords del JD para ATS optimization)
```

### 2. Registrar en tracker

**SIEMPRE** registrar en `data/applications.md`:
- Siguiente número secuencial
- Fecha actual
- Empresa
- Rol
- Score: promedio de match (1-5)
- Estado: `Evaluada`
- PDF: ❌ (o ✅ si auto-pipeline generó PDF)
- Report: link relativo al report .md (ej: `[001](reports/001-company-2026-01-01.md)`)

**Formato del tracker:**

```markdown
| # | Fecha | Empresa | Rol | Score | Estado | PDF | Report |
```
