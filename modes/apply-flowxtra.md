# Modo: apply-flowxtra — Envío vía API pública de Flowxtra

Adaptador de aplicación para ofertas alojadas en `flowxtra.com`. Flowxtra expone un endpoint público sin autenticación (`POST /api/candidate-job/store`) que acepta el mismo payload multipart que el formulario de la landing page. Este modo lo usa para enviar la aplicación desde `career-ops` — **siempre después de aprobación explícita del candidato**.

## Cuándo usar este modo

`modes/apply.md` enruta aquí automáticamente cuando el host de la URL del report es `flowxtra.com`. No invocarlo directamente.

## Prerequisitos

1. Un report evaluado del job (en `reports/`) con `score >= 4.0/5`. Si el score es menor, **recomendar contra el envío** (regla "Ethical Use" de `CLAUDE.md`).
2. Un CV PDF generado en `output/{num}-{slug}.pdf`. Si no existe, ejecutar `/career-ops pdf` antes.
3. `config/profile.yml` con `flowxtra.apply_defaults` relleno (o `candidate.*` como fallback): `first_name`, `last_name`, `email`, `phone`.
4. Metadata cacheada en el report por `modes/pipeline.md` durante la fase de detección del JD: `subdomain`, `hash_id` (el ID interno, ≠ `has_id` público), `company_id`. Si no está cacheada, re-fetch de `GET https://app.flowxtra.com/api/candidate/jobs/{has_id}` para obtenerlo del body.

## Workflow

### Paso 1 — Cargar contexto

1. Leer el report del job. Extraer `score`, `company`, `role`, `report_num`, y la URL Flowxtra (`https://flowxtra.com/apply/{has_id}`).
2. Si `score < 4.0`: avisar al candidato — "Score {score} es bajo, no te recomiendo aplicar. ¿Quieres continuar de todos modos?" Si no confirma, abortar.
3. Leer `config/profile.yml` → extraer `flowxtra.apply_defaults` (o `candidate.*` como fallback).
4. Verificar que existe `output/{num}-{slug}.pdf`. Si no, ejecutar auto `/career-ops pdf` para generarlo.
5. Extraer el metadata cacheado (`subdomain`, `hash_id`, `company_id`) del header del report. Si falta:
   ```
   WebFetch GET https://app.flowxtra.com/api/candidate/jobs/{has_id_from_url}
   subdomain   = body.data.company.subdomain
   hash_id     = body.data.hash_id     # NOT has_id
   company_id  = body.data.company.id
   questions   = body.data.job_appliction_question || []
   ```

### Paso 2 — Recoger respuestas a preguntas custom (si las hay)

Flowxtra permite que cada job defina preguntas custom (texto corto, sí/no, opción única/múltiple, fecha, número, archivo). Si `questions` no está vacío:

1. Mostrar al candidato cada pregunta una a una en el chat.
2. Recoger la respuesta interactivamente.
3. Construir el array `job_appliction_question` con el schema:
   ```json
   [
     {
       "id": <question.id>,
       "name": "<question.name>",
       "question": "<question.question>",
       "required": <bool>,
       "answer_type": "<short_text|yes_no|single_choice|multiple_choice|date|number|file>",
       "introduction": "<question.introduction>",
       "answer": "<user_answer>"
     }
   ]
   ```
4. Para preguntas tipo `file`, avisar al candidato de que tiene que adjuntar el archivo (máx 10MB, formatos: PDF, Word, RTF, TXT, JPG/PNG/GIF) y pedirle la ruta local.

### Paso 3 — Construir preview card

Antes de llamar a la API, mostrar TODO lo que se va a enviar en un bloque claro:

```
━━━ Preview del envío ━━━
Endpoint:  POST https://app.flowxtra.com/api/candidate-job/store?subdomain={subdomain}
Content-Type: multipart/form-data

Fields:
  job_id         = {hash_id}
  company_id     = {company_id}
  first_name     = {first_name}
  last_name      = {last_name}
  email          = {email}
  phone          = {phone}
  cv             = @{pdf_path}   ({size} KB)
  cover_letter   = (none)
  job_appliction_question = [{N} answers]   (si aplica)
  recaptcha_token = (none)

Empresa:   {company}
Rol:       {role}
Score:     {score}/5
Report:    reports/{num}-{slug}-{date}.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**STOP.** Preguntar al candidato textualmente:

> "¿Confirmas que envíe esta aplicación? Responde `sí` para proceder o `no` para cancelar."

NO proceder con nada distinto de `sí` / `yes` / `confirm`. Cualquier otra respuesta = abortar limpiamente sin llamar a la API.

### Paso 4 — Enviar (solo tras `sí` explícito)

```
POST {base_url}/candidate-job/store?subdomain={subdomain}
Content-Type: multipart/form-data

body:
  job_id            = {hash_id}
  company_id        = {company_id}
  first_name, last_name, email, phone
  cv                = @{pdf_path}
  job_appliction_question = {JSON.stringify(answers)}   # si aplica
```

### Paso 5 — Manejo de respuestas

- **201 Created** (`success: true`):
  - Actualizar `applications.md`: status → `Applied`, notes → `via Flowxtra API`
  - Mostrar al candidato: "✅ Aplicación enviada. ID del candidato: {data.id}"
  - Sugerir siguiente paso: `/career-ops contacto` para LinkedIn outreach
- **409 Conflict** (duplicado):
  - Actualizar `applications.md`: status → `Applied`, notes → `already applied (409)`
  - Informar al candidato de que ya había aplicado previamente
- **422 Unprocessable Entity** (errores de validación):
  - Mostrar los errores exactos del response (`errors` object)
  - NO reintentar automáticamente
  - Sugerir correcciones (ej: "Tu CV debe ser PDF; el actual es {format}")
- **422 con mensaje de reCAPTCHA**: Flowxtra puede tener reCAPTCHA v3 activo en el server. `career-ops` no puede generar tokens headlessly.
  - Fallback: abrir el navegador en `https://flowxtra.com/apply/{has_id}` con `browser_navigate` para que el candidato termine el envío manualmente
  - Actualizar `applications.md`: status → `Applied`, notes → `submitted via browser (recaptcha)`
- **429 Too Many Requests**: respetar `retry_after` del body; reintentar una sola vez tras esperar
- **500 Internal Server Error**: no reintentar. Informar al candidato y sugerir intentar manualmente.

### Paso 6 — Post-envío

1. Actualizar el tracker (`applications.md`) — ver estados canónicos en `templates/states.yml`
2. Opcional: actualizar el "Section G" del report con las respuestas finales enviadas, para referencia futura
3. Sugerir `/career-ops contacto` para contacto LinkedIn con reclutadores o hiring managers de la empresa

## Sin credenciales

Este modo **NO requiere ningún token ni API key**. Tanto el listing (via `modes/scan.md` Nivel 4) como el detail (via `modes/pipeline.md` fast-path) como el apply (este modo) usan endpoints públicos de Flowxtra. El único dato personal involucrado son los campos de contacto del candidato en `config/profile.yml`.

## Referencias

- Endpoint apply: `POST https://app.flowxtra.com/api/candidate-job/store?subdomain={subdomain}`
- Endpoint detail: `GET https://app.flowxtra.com/api/candidate/jobs/{has_id}`
- Docs oficiales: https://app.flowxtra.com/api/doc
- Ethical Use rules: `CLAUDE.md` → sección "Ethical Use"
