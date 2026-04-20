# Contexto compartido -- career-ops (Español, Argentina)

<!-- ============================================================
     ESTE ARCHIVO ES AUTO-ACTUALIZABLE. No pongas datos personales aquí.

     Tus personalizaciones van en modes/_profile.md (nunca se sobreescribe
     con actualizaciones). Este archivo contiene las reglas del sistema,
     la lógica de scoring y la configuración de herramientas que mejoran
     con cada versión de career-ops.
     ============================================================ -->

## Fuentes de verdad (SIEMPRE leer antes de cada evaluación)

| Archivo | Ruta | Cuándo |
|---------|------|--------|
| cv.md | `cv.md` (raíz del proyecto) | SIEMPRE |
| article-digest.md | `article-digest.md` (si existe) | SIEMPRE (proof points detallados) |
| profile.yml | `config/profile.yml` | SIEMPRE (identidad y roles objetivo) |
| _profile.md | `modes/_profile.md` | SIEMPRE (arquetipos, narrativa y negociación del candidato) |

**REGLA: NUNCA hardcodear métricas de proof points.** Leelas desde `cv.md` y `article-digest.md` al momento de evaluar.
**REGLA: Para métricas de artículos/proyectos, `article-digest.md` tiene precedencia sobre `cv.md`** (`cv.md` puede tener números desactualizados).
**REGLA: Leé `_profile.md` DESPUÉS de este archivo. Las personalizaciones del candidato en `_profile.md` sobreescriben los valores por defecto de acá.**

---

## Sistema de scoring

La evaluación usa 7 bloques (A-G) con un score global de 1-5:

| Dimensión | Qué mide |
|-----------|----------|
| Match con CV | Skills, experiencia, alineación de proof points |
| Alineación North Star | Qué tan bien la oferta encaja con los arquetipos objetivo del candidato (desde `_profile.md`) |
| Comp | Salario vs mercado (5=cuartil superior, 1=muy por debajo) |
| Señales culturales | Cultura de empresa, crecimiento, estabilidad, política de trabajo remoto |
| Red flags | Bloqueadores, advertencias (ajustes negativos) |
| **Global** | Promedio ponderado de los anteriores |

**Interpretación del score:**
- 4.5+ → Match fuerte, recomendado aplicar de inmediato
- 4.0-4.4 → Buen match, vale la pena aplicar
- 3.5-3.9 → Aceptable pero no ideal, aplicar solo si hay un motivo específico
- Por debajo de 3.5 → Recomendado no aplicar (ver Ethical Use en CLAUDE.md)

## Legitimidad del posting (Bloque G)

El Bloque G evalúa si el posting es probablemente una búsqueda real y activa. NO afecta el score global de 1-5 — es una evaluación cualitativa separada.

**Tres niveles:**
- **Alta confianza** — Búsqueda real y activa (la mayoría de las señales son positivas)
- **Proceder con precaución** — Señales mixtas que vale la pena notar (hay algunas dudas)
- **Sospechoso** — Múltiples indicadores de ghost posting, el candidato debería investigar primero

**Señales clave (ponderadas por confiabilidad):**

| Señal | Fuente | Confiabilidad | Notas |
|-------|--------|---------------|-------|
| Antigüedad del posting | Snapshot de la página | Alta | Menos de 30d=bueno, 30-60d=mixto, más de 60d=preocupante (ajustar según tipo de rol) |
| Botón Apply activo | Snapshot de la página | Alta | Hecho directamente observable |
| Especificidad técnica en el JD | Texto del JD | Media | Los JDs genéricos correlacionan con ghost postings, pero también con mala redacción |
| Realismo de los requisitos | Texto del JD | Media | Las contradicciones son señal fuerte; la vaguedad es señal débil |
| Noticias recientes de despidos | WebSearch | Media | Considerar departamento, timing y tamaño de la empresa |
| Patrón de reposteo | scan-history.tsv | Media | El mismo rol reposteado 2+ veces en 90 días es preocupante |
| Transparencia salarial | Texto del JD | Baja | Depende de la jurisdicción; hay muchas razones legítimas para omitirlo |
| Fit rol-empresa | Cualitativo | Baja | Subjetivo, usar solo como señal de apoyo |

**Encuadre ético (OBLIGATORIO):**
- Esto ayuda al candidato a priorizar tiempo en oportunidades reales
- NUNCA presentar los hallazgos como acusaciones de deshonestidad
- Presentar las señales y dejar que el candidato decida
- Siempre señalar explicaciones legítimas para las señales preocupantes

## Detección de arquetipos

Clasificar cada oferta en uno de estos tipos (o híbrido de 2). Los arquetipos del candidato y su framing específico viven en `modes/_profile.md`:

| Arquetipo | Señales clave en el JD |
|-----------|------------------------|
| AI Platform / LLMOps | "observability", "evals", "pipelines", "monitoring", "reliability" |
| Agentic / Automation | "agent", "HITL", "orchestration", "workflow", "multi-agent" |
| Technical AI PM | "PRD", "roadmap", "discovery", "stakeholder", "product manager" |
| AI Solutions Architect | "architecture", "enterprise", "integration", "design", "systems" |
| AI Forward Deployed | "client-facing", "deploy", "prototype", "fast delivery", "field" |
| AI Transformation | "change management", "adoption", "enablement", "transformation" |

Después de detectar el arquetipo, leé `modes/_profile.md` para el framing y los proof points específicos del candidato para ese arquetipo.

---

## Reglas globales

### NUNCA

1. Inventar experiencia o métricas
2. Modificar `cv.md` o archivos del portfolio
3. Enviar candidaturas en nombre del candidato
4. Compartir número de teléfono en mensajes generados
5. Recomendar una compensación por debajo del mercado
6. Generar un PDF sin haber leído el JD antes
7. Usar jerga corporativa o frases vacías
8. Ignorar el tracker (toda oferta evaluada se registra)

### SIEMPRE

0. **Carta de presentación:** Si el formulario lo permite, SIEMPRE incluir una. Mismo diseño visual que el CV. Citas del JD mapeadas a proof points. Máximo 1 página.
1. Leer `cv.md`, `_profile.md` y `article-digest.md` (si existe) antes de evaluar
1b. **Primera evaluación de cada sesión:** Ejecutar `node cv-sync-check.mjs` vía Bash. Si hay advertencias, notificarlo antes de continuar.
2. Detectar el arquetipo del rol y adaptar el framing según `_profile.md`
3. Citar líneas exactas del CV al hacer matching
4. Usar WebSearch para datos de compensación y empresa
5. Registrar en el tracker después de cada evaluación
6. Generar el contenido en el idioma del JD (EN por defecto)
7. Ser directo y accionable — sin relleno
8. Inglés técnico nativo para textos generados. Frases cortas, verbos de acción, sin voz pasiva.
8b. URLs de case studies en el PDF Professional Summary (el recruiter puede leer solo eso).
9. **Entradas al tracker como TSV** — NUNCA editar `applications.md` directamente. Escribir TSV en `batch/tracker-additions/`.
10. **Incluir `**URL:**` en todo header de reporte.**

---

### Herramientas

| Herramienta | Uso |
|-------------|-----|
| WebSearch | Investigación de compensación, tendencias, cultura de empresa, contactos LinkedIn, fallback para JDs |
| WebFetch | Fallback para extraer JDs desde páginas estáticas |
| Playwright | Verificar ofertas activas (browser_navigate + browser_snapshot). **NUNCA 2+ agentes con Playwright en paralelo — comparten la misma instancia del navegador.** |
| Read | cv.md, _profile.md, article-digest.md, cv-template.html |
| Write | HTML temporal para PDF, applications.md, reports .md |
| Edit | Actualizar el tracker |
| Canva MCP | Generación visual de CV (opcional). Duplicar diseño base, editar texto, exportar PDF. Requiere `canva_resume_design_id` en profile.yml. |
| Bash | `node generate-pdf.mjs` |

**Verificación de ofertas — OBLIGATORIO:** Usar Playwright (`browser_navigate` + `browser_snapshot`) para verificar si una oferta está activa. Footer/navbar sin JD = cerrada. Título + descripción + Apply = activa.

**Excepción batch:** En workers headless (`claude -p`), Playwright no está disponible. Usar WebFetch como fallback y marcar el header del reporte con `**Verification:** unconfirmed (batch mode)`.

---

## Mercado argentino — Especificidades (IMPORTANTE)

### Modalidades de contratación típicas
- **Relación de dependencia (RD):** empleo formal bajo LCT. SAC (aguinaldo), vacaciones, ART, obra social obligatoria, indemnización (art. 245), período de prueba 3 meses, preaviso.
- **Monotributo facturando USD:** contratación como monotributista, factura mensual. Sin SAC/ART/indemnización. Riesgo: no hay amparo LCT si rescinden.
- **Contractor / consultoría:** similar a monotributo pero a veces LLC/SA. Frecuente en roles remotos globales.
- **Híbrido:** base RD en ARS + bonos/comisiones en USD.

### Red flags de compensación
Marcar en bloque C (rationale, no sumar dimensión nueva):
- ARS fijo anual SIN cláusula de ajuste por inflación (IPC).
- "Sueldo competitivo" / "a convenir" sin rango.
- Pago solo en pesos sin hedge para roles globales (cuando mercado comparable paga USD).
- Bonos "a discreción" sin criterio publicado.

### Green flags de compensación
- Pago en USD o equivalente (dólar MEP/CCL, cripto estable).
- Ajustes trimestrales o semestrales por IPC con fórmula publicada.
- USD-equivalent explícito aun cuando se liquide en ARS.
- Rango publicado en el JD.

### Vocabulario LCT a detectar o preguntar
Si la JD NO especifica alguno de estos, flaggear como pregunta para el recruiter en bloque F:
- Modalidad (RD vs monotributo vs contractor)
- Moneda de pago y cláusula de ajuste
- SAC (aguinaldo)
- ART (riesgos del trabajo)
- Obra social y prepaga
- Vacaciones (mínimo LCT + días por antigüedad)
- Período de prueba (default 3 meses)
- Preaviso (default 1-2 meses según antigüedad)
- Indemnización (art. 245, para RD)

### Reglas de evaluación AR
- NUNCA bajar el score global por modalidad no declarada. Convertirlo en pregunta para bloque F.
- Si la JD declara explícitamente "USD" o "ajuste por IPC" → tratar como señal positiva en rationale de bloque C.
- Si la JD dice solo "ARS fijo" y el rol es comparable a mercado global que paga USD → penalización explícita en bloque C (narrativa, no sub-dimensión nueva).
- Este modo NO brinda asesoramiento legal. Es orientación orientativa para decidir dónde aplicar.

---

## Escritura profesional y compatibilidad ATS

Estas reglas aplican a TODO el texto generado que va a documentos del candidato: summaries PDF, bullets, cartas de presentación, respuestas a formularios, mensajes de LinkedIn. NO aplican a reportes internos de evaluación.

### Evitar frases cliché
- "apasionado por" / "orientado a resultados" / "track record probado"
- "leveragueé" (usar "usé" o nombrar la herramienta)
- "lideré" cuando en realidad fue "participé" (ser exacto)
- "facilité" (usar "organicé" o "puse en marcha")
- "sinergias" / "robusto" / "seamless" / "cutting-edge" / "innovador"
- "en el acelerado mundo actual"
- "capacidad demostrada para" / "mejores prácticas" (nombrar la práctica)

### Normalización Unicode para ATS
`generate-pdf.mjs` normaliza automáticamente em-dashes, comillas tipográficas y caracteres de ancho cero a equivalentes ASCII. De todas formas, evitar generarlos desde el principio.

### Variar la estructura de las oraciones
- No empezar todos los bullets con el mismo verbo
- Mezclar longitudes de oraciones (corta. Luego más larga con contexto. Corta de nuevo.)
- No usar siempre "X, Y y Z" — a veces dos ítems, a veces cuatro

### Preferir lo específico sobre lo abstracto
- "Reduje la latencia p95 de 2.1s a 380ms" supera a "mejoré la performance"
- "Postgres + pgvector para retrieval sobre 12k docs" supera a "diseñé arquitectura RAG escalable"
- Nombrar herramientas, proyectos y clientes cuando sea posible

---

Los arquetipos, narrativa, scripts de negociación y política de ubicación del candidato viven en `modes/_profile.md` (nunca en este archivo).
