# Modo: oferta — Evaluación Completa A-G

Cuando el candidato pega una oferta (texto o URL), entregar SIEMPRE los 7 bloques (A-F evaluación + G legitimidad):

## Paso 0 — Detección de Arquetipo

Clasificar la oferta en uno de los 6 arquetipos (ver `_shared.md`). Si es híbrido, indicar los 2 más cercanos. Esto determina:
- Qué proof points priorizar en el bloque B
- Cómo reescribir el summary en el bloque E
- Qué historias STAR preparar en el bloque F

## Bloque A — Resumen del Rol

Tabla con:
- Arquetipo detectado
- Dominio (platform/agentic/LLMOps/ML/enterprise)
- Función (build/consult/manage/deploy)
- Seniority
- Remoto (full/hybrid/onsite)
- Tamaño de equipo (si se menciona)
- TL;DR en 1 frase

## Bloque B — Match con CV

Leé `cv.md`. Creá una tabla con cada requisito del JD mapeado a líneas exactas del CV.

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
3. **Plan "si me downlevelan"**: aceptar si la comp es justa, negociar review a 6 meses, criterios de promoción claros

### Chequeo de modalidad AR

1. **Modalidad declarada en la JD:** RD / monotributo / contractor / no declarada.
2. **Moneda de pago:** ARS / USD / mixto / no declarada.
3. **Cláusula de ajuste:** IPC / sin cláusula / no aplica (si es USD) / no declarada.
4. Si alguno de los 3 quedó en "no declarada" → agregar a bloque F como pregunta obligatoria.
5. Si la moneda es ARS y NO hay cláusula de ajuste → nota explícita en el rationale de comp: "penalización por ausencia de protección contra inflación".
6. Si la moneda es USD o hay cláusula de ajuste clara → nota positiva en el rationale de comp: "comp protegida contra inflación".
7. Verificar también en el JD: SAC/aguinaldo, ART, obra social/prepaga, vacaciones, período de prueba, preaviso. Los que no estén mencionados → agregarlos como preguntas en bloque F.

## Bloque D — Comp y Demanda

Usar WebSearch para:
- Salarios actuales del rol (Glassdoor, Levels.fyi, Blind, Talent.io, Glassdoor AR)
- Reputación de compensación de la empresa
- Tendencia de demanda del rol

Tabla con datos y fuentes citadas. Si no hay datos, decirlo en vez de inventar.

## Bloque E — Plan de Personalización

| # | Sección | Estado actual | Cambio propuesto | Por qué |
|---|---------|---------------|------------------|---------|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 cambios al CV + Top 5 cambios a LinkedIn para maximizar el match.

## Bloque F — Plan de Entrevistas

6-10 historias STAR+R mapeadas a requisitos del JD (STAR + **Reflection**):

| # | Requisito del JD | Historia STAR+R | S | T | A | R | Reflection |
|---|-----------------|-----------------|---|---|---|---|------------|

La columna **Reflection** captura qué se aprendió o qué se haría distinto. Señala seniority — los candidatos junior describen qué pasó, los senior extraen aprendizajes.

**Story Bank:** Si `interview-prep/story-bank.md` existe, chequeá si alguna de estas historias ya está ahí. Si no, agregá las nuevas. Con el tiempo esto construye un banco reutilizable de 5-10 historias master que se pueden adaptar a cualquier pregunta de entrevista.

**Seleccionadas y enmarcadas según el arquetipo:**
- FDE → enfatizar velocidad de entrega y client-facing
- SA → enfatizar decisiones de arquitectura
- PM → enfatizar discovery y trade-offs
- LLMOps → enfatizar métricas, evals, production hardening
- Agentic → enfatizar orchestration, error handling, HITL
- Transformation → enfatizar adopción, cambio organizacional

Incluir también:
- 1 case study recomendado (cuál de sus proyectos presentar y cómo)
- Preguntas red-flag y cómo responderlas (ej: "¿por qué vendiste tu empresa?", "¿tenés equipo de reports?")

### Preguntas sobre contratación AR

Incluir SOLO las preguntas que corresponden a ítems NO declarados en la JD (detectados en el bloque C):
- Si modalidad no declarada: "¿La contratación es en relación de dependencia, monotributo, o contractor?"
- Si moneda no declarada: "¿En qué moneda se liquida el pago? ¿Hay cláusula de ajuste por inflación?"
- Si SAC/ART/obra social no mencionados: "¿Se incluyen SAC (aguinaldo), ART y cobertura de obra social? ¿Hay prepaga cubierta por la empresa?"
- Si vacaciones no mencionadas: "¿Cuántos días de vacaciones? ¿Incluye los días adicionales por antigüedad del art. 150 LCT?"
- Si período de prueba no mencionado: "¿Cuál es el período de prueba? ¿Es el estándar de 3 meses?"
- Si preaviso no mencionado: "¿Cuál es el preaviso estipulado para ambas partes?"

Si TODAS las preguntas anteriores están cubiertas en la JD → omitir esta subsección del bloque F (no incluir un encabezado vacío).

## Bloque G — Legitimidad del Posting

Analizar el posting para detectar señales que indiquen si es una búsqueda real y activa. Esto ayuda al candidato a priorizar esfuerzo en las oportunidades con más chances de llevar a un proceso real.

**Encuadre ético:** Presentar observaciones, no acusaciones. Cada señal tiene explicaciones legítimas. El candidato decide cómo pesarlas.

### Señales a analizar (en orden):

**1. Frescura del posting** (desde el snapshot de Playwright, ya capturado en el Paso 0):
- Fecha de publicación o "hace X días" — extraer de la página
- Estado del botón Apply (activo / cerrado / ausente / redirige a página genérica)
- Si la URL redirigió a una página genérica de careers, anotarlo

**2. Calidad de la descripción** (desde el texto del JD):
- ¿Nombra tecnologías, frameworks y herramientas específicas?
- ¿Menciona tamaño del equipo, estructura de reporte o contexto organizacional?
- ¿Son realistas los requisitos? (años de experiencia vs antigüedad de la tecnología)
- ¿Hay un scope claro para los primeros 6-12 meses?
- ¿Se menciona salario o compensación?
- ¿Qué porcentaje del JD es específico del rol vs boilerplate genérico?
- ¿Hay contradicciones internas? (título entry-level + requisitos de staff, etc.)

**3. Señales de contratación de la empresa** (2-3 queries de WebSearch, combinar con la investigación del Bloque D):
- Search: `"{empresa}" despidos {año}` — notar fecha, escala, departamentos
- Search: `"{empresa}" hiring freeze {año}` — notar anuncios
- Si hay despidos: ¿son del mismo departamento que este rol?

**4. Detección de reposteos** (desde scan-history.tsv):
- Chequear si empresa + título similar aparecieron antes con una URL distinta
- Notar cuántas veces y en qué período

**5. Contexto de mercado del rol** (cualitativo, sin queries adicionales):
- ¿Es un rol común que típicamente se cubre en 4-6 semanas?
- ¿El rol tiene sentido para el negocio de esta empresa?
- ¿El nivel de seniority es uno que legítimamente tarda más en cubrirse?

### Formato de salida:

**Evaluación:** Uno de tres niveles:
- **High Confidence** — Múltiples señales sugieren una búsqueda real y activa
- **Proceed with Caution** — Señales mixtas que vale la pena notar
- **Suspicious** — Múltiples indicadores de ghost posting, investigar antes de invertir tiempo

**Tabla de señales:** Cada señal observada con su hallazgo y peso (Positivo / Neutral / Preocupante).

**Notas de contexto:** Cualquier aclaración (rol de nicho, puesto estatal, posición evergreen, etc.) que explique señales potencialmente preocupantes.

### Casos borde:
- **Postings gubernamentales/académicos:** Los plazos más largos son normales. Ajustar umbrales (60-90 días es normal).
- **Posiciones evergreen/contratación continua:** Si el JD dice explícitamente "ongoing" o "rolling", anotarlo como contexto — no es un ghost posting, es un pipeline role.
- **Roles de nicho/ejecutivos:** Staff+, VP, Director o roles muy especializados pueden estar abiertos meses sin ser ghost jobs. Ajustar umbrales de antigüedad.
- **Startup / pre-revenue:** Las empresas early-stage pueden tener JDs vagos porque el rol genuinamente no está definido. Ponderar menos la vaguedad de la descripción.
- **Sin fecha disponible:** Si no se puede determinar la antigüedad del posting y no hay otras señales preocupantes, usar "Proceed with Caution" con nota de datos limitados. NUNCA usar "Suspicious" sin evidencia.
- **Sourcing por recruiter (sin posting público):** Las señales de frescura no están disponibles. Notar que el contacto activo del recruiter es en sí mismo una señal positiva de legitimidad.

---

## Post-evaluación

**SIEMPRE** después de generar los bloques A-G:

### 1. Guardar report .md

Guardar la evaluación completa en `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = siguiente número secuencial (3 dígitos, zero-padded)
- `{company-slug}` = nombre de empresa en lowercase, sin espacios (usar guiones)
- `{YYYY-MM-DD}` = fecha actual

**Formato del report:**

```markdown
# Evaluación: {Empresa} — {Rol}

**Fecha:** {YYYY-MM-DD}
**Arquetipo:** {detectado}
**Score:** {X/5}
**URL:** {url}
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

## H) Borradores de respuestas para la candidatura
(solo si score >= 4.5 — borradores de respuestas para el formulario de aplicación)

---

## Keywords extraídas
(lista de 15-20 keywords del JD para optimización ATS)
```

### 2. Registrar en el tracker

**NUNCA editar `applications.md` directamente para AGREGAR entradas nuevas. Escribir TSV en `batch/tracker-additions/` y ejecutar `merge-tracker.mjs`.**

Crear un archivo TSV en `batch/tracker-additions/{num}-{company-slug}.tsv` con una sola línea y 9 columnas separadas por tabulaciones:

```
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

**Orden de columnas (IMPORTANTE — status ANTES que score en el TSV):**
1. `num` — número secuencial (entero)
2. `date` — YYYY-MM-DD
3. `company` — nombre corto de la empresa
4. `role` — título del puesto
5. `status` — estado canónico (columna 5 = status)
6. `score` — formato `X.X/5` (columna 6 = score/5)
7. `pdf` — `✅` o `❌`
8. `report` — link markdown `[num](reports/...)`
9. `notes` — resumen en una línea

**Nota:** En `applications.md` el score aparece ANTES que el status. `merge-tracker.mjs` maneja ese swap de columnas automáticamente.

**Estado canónico: `Evaluated`** (identificador en inglés, requerido por `templates/states.yml`).

**Estados canónicos disponibles** (siempre en inglés, según `templates/states.yml`):

| Estado | Cuándo usarlo |
|--------|---------------|
| `Evaluated` | Reporte completado, decisión pendiente |
| `Applied` | Candidatura enviada |
| `Responded` | La empresa respondió |
| `Interview` | En proceso de entrevistas |
| `Offer` | Oferta recibida |
| `Rejected` | Rechazado por la empresa |
| `Discarded` | Descartado por el candidato o la oferta cerró |
| `SKIP` | No encaja, no aplicar |
