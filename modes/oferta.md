# Modo: oferta — Evaluación Completa A-F

Cuando el candidato pega una oferta (texto o URL), entregar SIEMPRE los 6 bloques:

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

## G) Visa Sponsorship Analysis (solo si config/visa.yml existe)

Si `config/visa.yml` NO existe, omitir este bloque completamente.

Si existe, analizar sponsorship de la empresa:

1. **Deteccion de senales en JD:**
   - Ejecutar `node sponsorship-detect.mjs --file <jd-file> --json` para buscar keywords positivos (visa sponsorship available, will sponsor, etc.) y negativos (will not sponsor, security clearance, etc.)
   - Clasificar como: `WILL_SPONSOR` / `WONT_SPONSOR` / `UNKNOWN`
   - Si UNKNOWN despues de keywords: usar contexto del JD para inferir (AI fallback -- per D-01)

2. **Historial H-1B del empleador:**
   - Ejecutar `node h1b-lookup.mjs <company> --json` para buscar empresa en datos USCIS locales (usa aliases de config/employer-aliases.yml)
   - Si encontrado: reportar peticiones, tasa de aprobacion, tendencia
   - Si no encontrado: indicar "No H-1B filing history found"

3. **Score de visa-friendliness (1-5):**
   - Ejecutar `node visa-score.mjs --json` con stdin JSON: `{ jdClassification, h1bSummary, jdText, h1bFound }`
   - Score compuesto: JD signals 30%, H-1B history 30%, E-Verify 20% (neutral por ahora), Company size 10%, STEM job 10% (neutral por ahora)
   - Componentes no disponibles (E-Verify, STEM) default a 3/5 neutral

4. **Aplicar penalidad (si aplica):**
   - `score_penalty` mode: aplicar penalidad al score global (-0.7 para WONT_SPONSOR, -0.3 para UNKNOWN)
   - `info_only` mode: mostrar datos sin impacto en score
   - `hard_filter` mode: ya filtrado en pre-evaluacion, no llega aqui si WONT_SPONSOR

**Formato del bloque en el report:**

```
## G) Visa Sponsorship Analysis

| Factor | Value | Score |
|--------|-------|-------|
| JD Sponsorship Signal | {WILL_SPONSOR / WONT_SPONSOR / UNKNOWN} | {1-5}/5 |
| H-1B Filing History | {X petitions, Y% approval, trend} | {1-5}/5 |
| E-Verify Status | Pending (Phase 5) | 3/5 |
| Company Size Signal | {inferred from JD} | {1-5}/5 |
| STEM Job Match | Pending (Phase 5) | 3/5 |
| **Visa-Friendliness** | **Composite** | **{X.X}/5** |

**Details:**
- **Sponsorship signals:** {list of matched keywords or "none detected -- AI assessment: {brief}"}
- **H-1B history ({employer name}):** {X} petitions over {N} years, {Y}% approval rate, {trend} trend
- **Assessment:** {1-2 sentence summary of visa risk for this specific role at this company}
```

---

## Post-evaluación

**SIEMPRE** después de generar los bloques A-F:

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
(visa-friendliness analysis -- see Block G section below)

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
