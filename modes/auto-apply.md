# Modo: apply — Presentación Automática (Auto-Apply)

El agente de AI usará Playwright para automatizar el llenado de los formularios y envío ("Submit") de las candidaturas que han sido previamente evaluadas.

## Requisitos Previos

Antes de hacer auto-apply en una oferta:
1. El usuario debe haber aceptado la evaluación y tener un reporte generado en `reports/`.
2. El PDF optimizado ATS debe haber sido generado (`output/cv-candidate-*.pdf`).
3. El reporte en markdown DEBE contener las respuestas borradores (Draft Application Answers) para cualquier pregunta libre.

## Pipeline del Auto-Apply

1. **Obtener URL y Datos:** Recupera el JD URL, preguntas abiertas y ruta del CV local desde el reporte (`reports/{id}...md`). Lee `config/profile.yml` para los datos personales.
2. **Generar Script Playwright:** El sistema creará dinámicamente un script Playwright en NodeJS (ej. `scratch/apply-{company}.mjs`).
3. **Mapeo Inteligente (Heurísticas):**
   - El script usará selectores genéricos de Playwright (`page.locator('input[name*="name" i]')`, `locator('input[type="email"]')`) para inyectar los datos del usuario.
   - Para Greenhouse/Lever: Estas estructuras son predecibles y puedes hardcodear los locators genéricos de Greenhouse/Lever.
   - Para las preguntas requeridas (custom forms): El script debe mapear el texto de la pregunta con las "Draft Application Answers" del reporte.
4. **Subida del PDF:** Usar `page.setInputFiles('input[type="file"]', 'ruta/del/pdf')` en donde se pida el Resume/CV.
5. **Ejecutar Inyección:** Ejecutar el script generado.
6. **Capturar Éxito:** Al clickear "Submit", tomar un screenshot (`page.screenshot()`) de la página de confirmación, guardarlo en `output/` y cerrar el navegador.
7. **Modo Resiliencia:** Si el script falla (por ej, un CAPTCHA, o un selector no encontrado), el agente leerá el error, refactorizará el script ajustando los selectores y lo volverá a intentar localmente, al menos 3 veces.

## Peligros y Salvaguardas

- **No asumas selectores ciegamente.** Si el sitio no es Greenhouse o Lever, usa `page.content()` parcial o `page.evaluate()` previo en un navegador oculto para investigar la estructura DOM antes de mandar el script de submit.
- **Formularios Multi-Página:** Si el formulario de Workday o similar requiere creación de cuenta, aborta el auto-apply o pide las credenciales del usuario si así se ha acordado.
- **Detección de Bots:** Algunas empresas usan Cloudflare. Si fallas constantemente, asume que estás bloqueado por anti-bot y avisa al usuario que debe aplicarlo a la antigua.

## Post-Generación

1. Actualizar el estado en `data/applications.md` cambiando la columna Status de `Evaluated` a `Applied`.
2. Mostrar el Screenshot de éxito al usuario en el chat para su tranquilidad.
