# Modo: oferta — Evaluación Completa A-F

Cuando el candidato pega una oferta (texto o URL), entregar SIEMPRE los 6 bloques:

## Paso 0 — Detección de Arquetipo

Clasificar la oferta en uno de los 6 arquetipos (ver `_shared.md`). Si es híbrido, indicar los 2 más cercanos. Esto determina:
- Qué proof points priorizar en bloque B
- Cómo reescribir el summary en bloque E
- Qué historias STAR preparar en bloque F

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

## G) Draft Application Answers
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

### 3. Sync to Airtable

If `modes/_profile.md` contains a `## Your Airtable Sync` section, run the sync gate:

#### 3a. Sync Gate Check

Read `score_threshold` from `_profile.md` Airtable config (default: 3.0).

| Condition | Action |
|---|---|
| Score >= threshold AND role NOT in Airtable | **Create** Role + Company (Step 3b) |
| Score >= threshold AND role already in Airtable | **Update** Role fields (Step 3c) |
| Score < threshold AND role already in Airtable | **Set Status to SKIP**, update Latest Date only |
| Score < threshold AND role NOT in Airtable | **Skip sync entirely** |

**Re-evaluation trigger:** If the user responds to an evaluation and the score changes, re-run this gate. A role bumped above threshold gets created/updated. A role dropped below threshold gets marked SKIP.

**Matching logic:** To find if a role exists in Airtable:
1. Use `list_records_for_table` with a filter on `Link` field matching the JD URL.
2. If no match, try filtering Companies table by name, then check linked Roles for matching title.

#### 3b. Create New Role

1. **Look up company** in Companies table by name using `search_records` or `list_records_for_table` with filter.
2. If not found, **create company** using `create_records_for_table` with just the Company name field.
3. **Create Roles record** using `create_records_for_table`:
   - Company → linked record ID from step 1/2
   - Role → role title from JD
   - Link → JD URL
   - Rating → score rounded to nearest integer (1-5)
   - Status → "Evaluated"
   - Notes → one-line evaluation summary
   - Salary Low → comp range low from Block D (USD, if available)
   - Salary High → comp range high from Block D (USD, if available)
   - Remote? → "Remote", "Hybrid", or "On-site"
   - Latest Date → today's date (YYYY-MM-DD)
4. **Report:** "Synced to Airtable: {Company} — {Role} (new record)"

#### 3c. Update Existing Role

1. Use `update_records_for_table` on the matched record ID.
2. Update: Rating, Status (see rules below), Notes, Salary Low, Salary High, Remote?, Latest Date.
3. Do NOT overwrite Link (URL should not change).
4. **Report:** "Synced to Airtable: {Company} — {Role} (updated existing)"

**Status write-back rules:**
- On new evaluation of a role with blank or "New Listing" status → set to "Evaluated"
- On new evaluation of a role with any other status (Applied, Interview, etc.) → preserve existing status
- On explicit status change in career-ops → map using `airtable_value` from `templates/states.yml`

#### 3d. Error Handling

If Airtable MCP is unavailable (tools not loaded, auth error, timeout):
- Log: "⚠️ Airtable sync skipped — MCP unavailable. Evaluation saved locally."
- Do NOT block the evaluation. Local report and tracker are the source of truth.

Use field IDs from `_profile.md` Airtable config for all API calls.
