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
- Product domain (consumer/B2B/platform/AI/growth/fintech/etc.)
- Function (discovery/growth/platform/strategy/launch)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (si se menciona)
- TL;DR en 1 frase

## Bloque B — Match con CV

Lee `cv.md`. Crea tabla con cada requisito del JD mapeado a líneas exactas del CV.

**Adaptado al arquetipo:**
- Si Core PM → priorizar discovery, roadmap trade-offs, y shipped outcomes
- Si Growth PM → priorizar funnel metrics, experiments, retention, monetization
- Si Platform PM → priorizar internal customers, APIs/platform leverage, cross-team influence
- Si AI PM → priorizar user problem selection, trust/safety, evaluation loops, workflow design
- Si Enterprise / B2B PM → priorizar customer discovery, GTM alignment, integrations, implementation realities
- Si Product Strategy & Ops → priorizar planning systems, KPI governance, portfolio choices, executive alignment

Sección de **gaps** con estrategia de mitigación para cada uno. Para cada gap:
1. ¿Es un hard blocker o un nice-to-have?
2. ¿Puede el candidato demostrar experiencia adyacente?
3. ¿Hay un proyecto portfolio que cubra este gap?
4. Plan de mitigación concreto (frase para cover letter, proyecto rápido, etc.)

## Bloque C — Nivel y Estrategia

1. **Nivel detectado** en el JD vs **nivel natural del candidato para ese arquetipo**
2. **Scope check**: área de producto, usuarios, revenue/surface area, team topology, decision rights
3. **Plan "vender senior sin mentir"**: frases específicas adaptadas al arquetipo, métricas a destacar, cómo posicionar ownership, influence, and decision quality
4. **Plan "si me downlevelan"**: aceptar si comp es justa, negociar review a 6 meses, criterios de promoción claros

## Bloque D — Comp y Demanda

Usar WebSearch para:
- Salarios actuales del rol (Glassdoor, Levels.fyi, Blind)
- Reputación de compensación de la empresa
- Tendencia de demanda del rol
- Señales de salud de producto: crecimiento, layoffs, major product launches, PM org quality if visible

Tabla con datos y fuentes citadas. Si no hay datos, decirlo en vez de inventar.

## Bloque E — Plan de Personalización

| # | Sección | Estado actual | Cambio propuesto | Por qué |
|---|---------|---------------|------------------|---------|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 cambios al CV + Top 5 cambios a LinkedIn para maximizar match.

Los cambios deben privilegiar:
- Outcome metrics over feature lists
- Decision quality over task lists
- Cross-functional leadership over individual contributor implementation detail
- Customer insight, experimentation, launches, and business impact

## Bloque F — Plan de Entrevistas

6-10 historias STAR+R mapeadas a requisitos del JD (STAR + **Reflection**):

| # | Requisito del JD | Historia STAR+R | S | T | A | R | Reflection |
|---|-----------------|-----------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` exists, check if any of these stories are already there. If not, append new ones. Over time this builds a reusable bank of 5-10 master stories that can be adapted to any interview question.

**Seleccionadas y enmarcadas según el arquetipo:**
- Core PM → enfatizar problem framing, prioritization, and shipped outcomes
- Growth PM → enfatizar experiments, funnel movement, and learning velocity
- Platform PM → enfatizar stakeholder alignment, platform adoption, and leverage
- AI PM → enfatizar product judgment around AI capability, trust, UX, and measurement
- Enterprise / B2B PM → enfatizar customer conversations, GTM partnership, and delivery in constrained environments
- Product Strategy & Ops → enfatizar planning discipline, decision cadence, and org leverage

Incluir también:
- 1 case study recomendado (cuál de sus launches/proyectos presentar y cómo)
- Preguntas red-flag y cómo responderlas (ej: "how technical are you really?", "what metrics did you own directly?", "how do you work with engineering/design?", "why this product domain?")

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
