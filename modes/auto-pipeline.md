# Modo: auto-pipeline — Pipeline Completo Automático

Cuando el usuario pega un JD (texto o URL) sin sub-comando explícito, ejecutar TODO el pipeline en secuencia:

## Paso 0 — Resolver Track y Persona

Antes de extraer el JD, resolver el track y la persona que se usarán en toda la evaluación:

**Track:**
1. Escanear el mensaje del usuario en busca de señal de track (en orden de prioridad):
   - `--track <id>` en cualquier parte del mensaje
   - `[track:<id>]` en cualquier parte del mensaje
   - Lenguaje natural: "usa el track X", "track de liderazgo", "perfil builder"
2. Si se encontró señal → anotar como `user-specified`
3. Si no → extraer el JD primero (Paso 1), luego aplicar las reglas de inferencia de `_shared.md`
4. Si no hay sección `tracks:` en `profile.yml` → marcar como `no-tracks` y omitir toda lógica de track

Guardar: `TRACK_ID`, `TRACK_SOURCE` para pasar a los pasos siguientes.

**Persona:**
1. Escanear el mensaje del usuario en busca de señal de persona (en orden de prioridad):
   - `--persona <id>` en cualquier parte del mensaje
   - `[persona:<id>]` en cualquier parte del mensaje
   - Lenguaje natural: "usa mi contacto X", "persona X", "aplica como X"
2. Si se encontró señal → usar `personas[id]` de `config/profile.yml`; anotar como `user-specified`
3. Si no hay señal + solo hay una persona definida → usar esa; anotar como `auto-selected`
4. Si no hay señal + hay múltiples personas definidas → preguntar al usuario antes de continuar; anotar como `prompted`
5. Si no hay sección `personas` en `profile.yml` → leer de `candidate.phone`, `candidate.location`, `location.visa_status` (fallback bootstrap)

Guardar: `PERSONA_ID`, `PERSONA_LABEL`, `PERSONA_SOURCE` (user-specified | auto-selected | prompted) para pasar a los pasos siguientes.

## Paso 1 — Extraer JD

Si el input es una **URL** (no texto de JD pegado), seguir esta estrategia para extraer el contenido:

**Orden de prioridad:**

1. **Playwright (preferido):** La mayoría de portales de empleo (Lever, Ashby, Greenhouse, Workday) son SPAs. Usar `browser_navigate` + `browser_snapshot` para renderizar y leer el JD.
2. **WebFetch (fallback):** Para páginas estáticas (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (último recurso):** Buscar título del rol + empresa en portales secundarios que indexan el JD en HTML estático.

**Si ningún método funciona:** Pedir al candidato que pegue el JD manualmente o comparta un screenshot.

**Si el input es texto de JD** (no URL): usar directamente, sin necesidad de fetch.

## Paso 2 — Evaluación A-F
Ejecutar exactamente igual que el modo `oferta` (leer `modes/oferta.md` para todos los bloques A-F).

## Paso 3 — Guardar Report .md
Guardar la evaluación completa en `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (ver formato en `modes/oferta.md`).

El header del report debe incluir **Persona:** entre **URL:** y **PDF:** y **Track:** {TRACK_ID} ({TRACK_SOURCE}) después de **Persona:** (ver formato en modes/oferta.md).

## Paso 4 — Generar PDF
Ejecutar el pipeline completo de `pdf` (leer `modes/pdf.md`).

## Paso 5 — Draft Application Answers (solo si score >= 4.5)

Si el score final es >= 4.5, generar borrador de respuestas para el formulario de aplicación:

1. **Extraer preguntas del formulario**: Usar Playwright para navegar al formulario y hacer snapshot. Si no se pueden extraer, usar las preguntas genéricas.
2. **Generar respuestas** siguiendo el tono (ver abajo).
3. **Guardar en el report** como sección `## G) Draft Application Answers`.

### Preguntas genéricas (usar si no se pueden extraer del formulario)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tono para Form Answers

**Posición: "I'm choosing you."** el candidato tiene opciones y está eligiendo esta empresa por razones concretas.

**Reglas de tono:**
- **Confiado sin arrogancia**: "I've spent the past year building production AI agent systems — your role is where I want to apply that experience next"
- **Selectivo sin soberbia**: "I've been intentional about finding a team where I can contribute meaningfully from day one"
- **Específico y concreto**: Siempre referenciar algo REAL del JD o de la empresa, y algo REAL de la experiencia del candidato
- **Directo, sin fluff**: 2-4 frases por respuesta. Sin "I'm passionate about..." ni "I would love the opportunity to..."
- **El hook es la prueba, no la afirmación**: En vez de "I'm great at X", decir "I built X that does Y"

**Framework por pregunta:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** → Mencionar algo concreto sobre la empresa. "I've been using [product] for [time/purpose]."
- **Relevant experience?** → Un proof point cuantificado. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Honesto: "Found through [portal/scan], evaluated against my criteria, and it scored highest."

**Idioma**: Siempre en el idioma del JD (EN default). Aplicar `/tech-translate`.

## Paso 6 — Actualizar Tracker
Registrar en `data/applications.md` con todas las columnas incluyendo Report y PDF en ✅.

**Si algún paso falla**, continuar con los siguientes y marcar el paso fallido como pendiente en el tracker.
