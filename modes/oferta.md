# Modo: oferta — Evaluación Completa A-G

Cuando el candidato pega una oferta (texto o URL), entregar SIEMPRE los bloques A-F evaluation + G visa/legitimacy:

## Paso 0 — Detección de Arquetipo

Clasificar la oferta en uno de los 6 arquetipos (ver `_shared.md`). Si es híbrido, indicar los 2 más cercanos. Esto determina:
- Qué proof points priorizar en bloque B
- Cómo reescribir el summary en bloque E
- Qué historias STAR preparar en bloque F

## Pre-evaluacion: Visa Filter (solo si config/visa.yml existe)

Si `config/visa.yml` existe Y `sponsorship_mode` es `hard_filter`:
1. Ejecutar `node sponsorship-detect.mjs --file <jd-file> --json` sobre el texto del JD
2. Si el resultado es `WONT_SPONSOR`:
   - NO continuar con la evaluacion A-F
   - Registrar en tracker con status `SKIP` y nota: "Auto-skipped: WONT_SPONSOR (hard_filter)"
   - Informar al usuario: "This JD was auto-skipped because it contains anti-sponsorship signals: {lista de keywords detectados}"
   - TERMINAR aqui
3. Si el resultado es `WILL_SPONSOR` o `UNKNOWN`: continuar normalmente con Bloque A

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

### H-1B Salary Benchmark (solo si config/visa.yml existe)

Ejecutar `echo '{"employer":"<company>","role":"<role>","city":"<location>"}' | node h1b-salary.mjs --stdin --json`

Si available es true, mostrar:
| Benchmark | Salary |
|-----------|--------|
| H-1B Prevailing Wage Floor | ${stats.min} |
| H-1B Median Filed Salary | ${stats.median} |
| H-1B 75th Percentile | ${stats.p75} |

Comparar con la oferta:
- Si oferta < stats.min: "Below prevailing wage floor -- potential red flag for H-1B filing"
- Si oferta entre stats.min y stats.median: "Below median H-1B salary for this role"
- Si oferta entre stats.median y stats.p75: "At or above median -- competitive H-1B salary"
- Si oferta > stats.p75: "Above 75th percentile -- strong salary position"

**Note:** This data is INFORMATIONAL ONLY. It does NOT affect the visa-friendliness composite score. It helps with compensation negotiation.

Si available es false: omitir esta subseccion silenciosamente (no error, no placeholder).

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

## Bloque G — Visa Sponsorship Analysis + Posting Legitimacy

### G.1 Posting Legitimacy

Analyze the job posting for signals that indicate whether this is a real, active opening. This helps the user prioritize their effort on opportunities most likely to result in a hiring process.

**Ethical framing:** Present observations, not accusations. Every signal has legitimate explanations. The user decides how to weigh them.

#### Signals to analyze (in order):

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

#### Output format:

**Assessment:** One of three tiers:
- **High Confidence** -- Multiple signals suggest a real, active opening
- **Proceed with Caution** -- Mixed signals worth noting
- **Suspicious** -- Multiple ghost job indicators, investigate before investing time

**Signals table:** Each signal observed with its finding and weight (Positive / Neutral / Concerning).

**Context Notes:** Any caveats (niche role, government job, evergreen position, etc.) that explain potentially concerning signals.

#### Edge case handling:
- **Government/academic postings:** Longer timelines are standard. Adjust thresholds (60-90 days is normal).
- **Evergreen/continuous hire postings:** If the JD explicitly says "ongoing" or "rolling," note it as context -- this is not a ghost job, it is a pipeline role.
- **Niche/executive roles:** Staff+, VP, Director, or highly specialized roles legitimately stay open for months. Adjust age thresholds accordingly.
- **Startup / pre-revenue:** Early-stage companies may have vague JDs because the role is genuinely undefined. Weight description vagueness less heavily.
- **No date available:** If posting age cannot be determined and no other signals are concerning, default to "Proceed with Caution" with a note that limited data was available. NEVER default to "Suspicious" without evidence.
- **Recruiter-sourced (no public posting):** Freshness signals unavailable. Note that active recruiter contact is itself a positive legitimacy signal.

### G.2 Visa Sponsorship Analysis (solo si config/visa.yml existe)

Si `config/visa.yml` NO existe, omitir esta subseccion completamente.

Si existe, analizar sponsorship de la empresa:

#### OPT Timeline Status (solo si config/visa.yml tiene seccion opt:)

Si `config/visa.yml` tiene seccion `opt:` configurada, ejecutar:
`echo '{"jdText":"<full JD text>"}' | node opt-timeline.mjs --json`

Con el resultado JSON, mostrar este banner ANTES de la tabla de sponsorship:

> **OPT STATUS:** {remainingDays} days remaining (expires {endDate})
> Unemployment: {unemployment.used}/{unemployment.limit} days used ({unemployment.remaining} remaining)
> **Cap Season:** {capSeason.phase}. {capSeason.advice}
> **Time-to-Hire:** {tthEstimate.type} company, est. {tthEstimate.minDays}-{tthEstimate.maxDays} days. Your OPT window: {remainingDays} days. {tthEstimate.warning || "Within range."}

**Warning escalation (per D-06):**
- Si unemployment.severity == 'urgent' (<=14 days): Prefijo `URGENT` en rojo, lenguaje fuerte: "CRITICAL: Only {remaining} unemployment days left. Immediate employment required."
- Si unemployment.severity == 'warning' (<=30 days): Prefijo `WARNING`, lenguaje firme: "WARNING: {remaining} unemployment days remaining. Accelerate job search."
- Si unemployment.severity == 'info' (<=60 days): Nota informativa: "Note: {remaining} unemployment days remaining. Monitor closely."
- Similar escalation for optStatus.remainingDays approaching 0.

Si `opt:` no esta configurada en visa.yml, omitir esta subseccion silenciosamente.

#### STEM OPT E-Verify Warning Banner

Si el E-Verify status es 'not_found' Y el usuario tiene opt.type == 'stem' en config/visa.yml:
Mostrar banner prominente ANTES de la tabla de visa-friendliness:

> **STEM OPT WARNING:** {company} is NOT registered with E-Verify. STEM OPT extension REQUIRES E-Verify enrollment. This employer CANNOT support your STEM OPT extension. Consider this a dealbreaker unless the company confirms they will enroll.

Y tambien incluir el detalle en la fila de E-Verify en la tabla con nota: "(STEM OPT dealbreaker)"

#### Deteccion de senales en JD

1. Ejecutar `node sponsorship-detect.mjs --file <jd-file> --json` para buscar keywords positivos (visa sponsorship available, will sponsor, etc.) y negativos (will not sponsor, security clearance, etc.)
2. Clasificar como: `WILL_SPONSOR` / `WONT_SPONSOR` / `UNKNOWN`
3. Si UNKNOWN despues de keywords: usar contexto del JD para inferir (AI fallback -- per D-01)

#### Historial H-1B del empleador

Ejecutar `node h1b-lookup.mjs <company> --json` para buscar empresa en datos USCIS locales (usa aliases de config/employer-aliases.yml)
- Si encontrado: reportar peticiones, tasa de aprobacion, tendencia
- Si no encontrado: indicar "No H-1B filing history found"

#### E-Verify Status

Ejecutar `node everify-lookup.mjs <company> --json`
- Si status es 'registered': mostrar "Registered" con score 5/5
- Si status es 'not_found': mostrar "NOT Registered" con score 1/5
- Si status es 'unverified': mostrar "Unverified (check manually)" con score 3/5

#### STEM Job Match

Ejecutar `echo '{"roleTitle":"<role>","jdText":"<full JD>"}' | node stem-detect.mjs --stdin --json`
- Si classification es 'STEM': mostrar "STEM Qualifying" con score 5/5
- Si classification es 'NON_STEM': mostrar "Non-STEM" con score 2/5
- Si classification es 'UNCERTAIN': mostrar "Uncertain" con score 3/5

#### Score de visa-friendliness (1-5)

Ejecutar `node visa-score.mjs --json` con stdin JSON:
`{ "jdClassification": "<result>", "h1bSummary": <h1b-lookup-result>, "eVerify": <eVerifyScore>, "jdText": "<full JD>", "h1bFound": <boolean>, "stemJob": <stemScore> }`

Score compuesto: JD signals 30%, H-1B history 30%, E-Verify 20%, Company size 10%, STEM job 10%

Aplicar penalidad (si aplica):
- `score_penalty` mode: aplicar penalidad al score global (-0.7 para WONT_SPONSOR, -0.3 para UNKNOWN)
- `info_only` mode: mostrar datos sin impacto en score
- `hard_filter` mode: ya filtrado en pre-evaluacion, no llega aqui si WONT_SPONSOR

#### Formato del bloque en el report:

```
## G) Visa Sponsorship Analysis

| Factor | Value | Score |
|--------|-------|-------|
| JD Sponsorship Signal | {WILL_SPONSOR / WONT_SPONSOR / UNKNOWN} | {1-5}/5 |
| H-1B Filing History | {X petitions, Y% approval, trend} | {1-5}/5 |
| E-Verify Status | {Registered / NOT Registered / Unverified} | {5 or 1 or 3}/5 |
| Company Size Signal | {inferred from JD} | {1-5}/5 |
| STEM Job Match | {STEM Qualifying / Non-STEM / Uncertain} | {5 or 2 or 3}/5 |
| **Visa-Friendliness** | **Composite** | **{X.X}/5** |

**Details:**
- **Sponsorship signals:** {list of matched keywords or "none detected -- AI assessment: {brief}"}
- **H-1B history ({employer name}):** {X} petitions over {N} years, {Y}% approval rate, {trend} trend
- **E-Verify:** {status} (source: {yaml/scraped/degraded})
- **STEM classification:** {classification} (confidence: {confidence}, matched: {matchedKeywords})
- **Assessment:** {1-2 sentence summary of visa risk for this specific role at this company}
```

### Risk Assessment

Ejecutar risk-assess.mjs con datos del JD y H-1B lookup:
`echo '{"companyName":"<company>","h1bSummary":<h1b-lookup-result>,"jdText":"<full JD>","optTimeline":<opt-timeline-result>,"tthEstimate":<tth-from-opt>}' | node risk-assess.mjs --stdin --json`

Mostrar resultado:

**Company Risk Level: {LOW/MEDIUM/HIGH}** (score: {riskScore})

| Risk Factor | Weight | Detail |
|-------------|--------|--------|
| {factor description} | {weight} | {detail} |

Si riskLevel es 'HIGH': agregar advertencia prominente:
> **WARNING:** This company has HIGH risk signals. Proceed with caution -- consider whether applying is worth your limited OPT time.

Si riskLevel es 'MEDIUM': nota informativa:
> **Note:** Some risk factors detected. Review the factors above before investing significant application effort.

---

## Post-evaluación

**SIEMPRE** después de generar los bloques A-G (including visa analysis if config/visa.yml exists):

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

## G) Visa Sponsorship Analysis (if config/visa.yml exists)
(visa-friendliness analysis + posting legitimacy + risk assessment)

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
