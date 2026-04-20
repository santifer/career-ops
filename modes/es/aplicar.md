# Modo: aplicar — Asistente de Postulación en Vivo (AR)

Modo interactivo para cuando el candidato está completando un formulario de postulación en Chrome. Lee lo que hay en pantalla, carga el contexto previo de la oferta, y genera respuestas personalizadas para cada pregunta del formulario.

## Requisitos

- **Mejor con Playwright visible**: En modo visible, el candidato ve el navegador y Claude puede interactuar con la página.
- **Sin Playwright**: el candidato comparte un screenshot o pega las preguntas manualmente.

## Workflow

```
1. DETECTAR    → Leer pestaña activa de Chrome (screenshot/URL/título)
2. IDENTIFICAR → Extraer empresa + rol de la página
3. BUSCAR      → Match contra reports existentes en reports/
4. CARGAR      → Leer report completo + Bloque G (si existe)
5. COMPARAR    → ¿El rol en pantalla coincide con el evaluado? Si cambió → avisar
6. ANALIZAR    → Identificar TODAS las preguntas del formulario visibles
7. GENERAR     → Para cada pregunta, generar respuesta personalizada
8. PRESENTAR   → Mostrar respuestas formateadas para copy-paste
```

## Paso 1 — Detectar la oferta

**Con Playwright:** Tomar snapshot de la página activa. Leer título, URL, y contenido visible.

**Sin Playwright:** Pedirle al candidato que:
- Comparta un screenshot del formulario (la herramienta Read lee imágenes)
- O pegue las preguntas del formulario como texto
- O diga empresa + rol para buscarlo

## Paso 2 — Identificar y buscar contexto

1. Extraer nombre de empresa y título del rol de la página
2. Buscar en `reports/` por nombre de empresa (Grep sin distinción de mayúsculas)
3. Si hay match → cargar el report completo
4. Si hay Bloque G → cargar los draft answers previos como base
5. Si NO hay match → avisar y ofrecer ejecutar el auto-pipeline rápido

## Paso 3 — Detectar cambios en el rol

Si el rol en pantalla difiere del evaluado:
- **Avisar al candidato**: "El rol cambió de [X] a [Y]. ¿Querés que re-evalúe o adaptamos las respuestas al nuevo título?"
- **Si adaptar**: Ajustar las respuestas al nuevo rol sin re-evaluar
- **Si re-evaluar**: Ejecutar evaluación A-F completa, actualizar report, regenerar Bloque G
- **Actualizar tracker**: Cambiar el título del rol en `applications.md` si corresponde

## Paso 4 — Analizar preguntas del formulario

Identificar TODAS las preguntas visibles:
- Campos de texto libre (carta de presentación, por qué este rol, etc.)
- Dropdowns (cómo te enteraste, autorización de trabajo, etc.)
- Sí/No (reubicación, visa, disponibilidad para viajar, etc.)
- Campos de salario / pretensiones salariales
- Campos de carga de archivos (CV, carta de presentación en PDF)

Clasificar cada pregunta:
- **Ya respondida en Bloque G** → adaptar la respuesta existente
- **Pregunta nueva** → generar respuesta desde el report + `cv.md`

## Paso 5 — Generar respuestas

Para cada pregunta, generar la respuesta siguiendo:

1. **Contexto del report**: Usar proof points del bloque B, historias STAR del bloque F
2. **Bloque G previo**: Si existe una respuesta draft, usarla como base y refinar
3. **Tono "I'm choosing you"**: Mismo framework del auto-pipeline
4. **Especificidad**: Referenciar algo concreto del JD visible en pantalla
5. **Proof point de career-ops**: Incluir en "Información adicional" si hay campo disponible

**Formato de output:**

```
## Respuestas para [Empresa] — [Rol]

Basado en: Report #NNN | Score: X.X/5 | Arquetipo: [tipo]

---

### 1. [Pregunta exacta del formulario]
> [Respuesta lista para copy-paste]

### 2. [Siguiente pregunta]
> [Respuesta]

...

---

Notas:
- [Cualquier observación sobre el rol, cambios, etc.]
- [Sugerencias de personalización que el candidato debería revisar]
```

---

### Pretensiones salariales (AR)

Ramificar según la modalidad detectada en la evaluación (bloque C de `modes/es/oferta.md`):
- **Relación de dependencia en ARS:** sugerir un rango en ARS con la nota "sujeto a cláusula de ajuste por IPC o equivalente".
- **Monotributo en USD:** sugerir el número USD neto directo (el candidato factura el bruto).
- **Contractor / LLC:** sugerir USD bruto y dejar que el candidato ajuste según costos.
- **Modalidad no declarada:** NO dar número. Recomendar preguntar primero: "Antes de dar un número concreto, ¿podés confirmarme si la contratación es en relación de dependencia o monotributo, y en qué moneda se liquida?"

En todos los casos, leer `config/profile.yml` y `modes/_profile.md` para el rango target del candidato. NUNCA inventar un número.

---

### Campos comunes en forms AR

- **CUIT / CUIL:** leer de `config/profile.yml` si está disponible. Si no, preguntar al candidato y NO inventar.
- **Localidad / Provincia:** usar la dirección canónica del candidato. No improvisar.
- **Disponibilidad para viajar:** leer preferencia declarada en `modes/_profile.md` o `config/profile.yml`. Si no está, preguntar antes de responder.
- **Situación laboral actual:** usar framing cuidadoso ("activo y buscando cambio", "disponible para inicio en 30-60 días"). NUNCA decir que el candidato está desempleado si no lo está.
- **Referido por:** si el candidato tiene un contacto, incluir su nombre. Si no, dejar vacío. NO inventar referencias.

---

### Regla crítica — NUNCA enviar sin revisión

Antes de hacer clic en Submit / Enviar / Apply:
1. Mostrar al candidato el resumen completo de todos los campos completados.
2. Esperar confirmación explícita ("sí, enviá" / "dale" / similar).
3. Si hay duda o si el candidato no respondió, NO enviar.
4. Guardar un borrador del form completado antes de enviar, por si la página falla.

Este punto NO es negociable. CLAUDE.md lo exige como principio ético del sistema.

---

## Paso 6 — Post-apply (opcional)

Si el candidato confirma que envió la postulación:
1. Actualizar estado en `applications.md` de "Evaluada" a "Aplicado"
2. Actualizar el Bloque G del report con las respuestas finales
3. Sugerir siguiente paso: `/career-ops contacto` para LinkedIn outreach

## Manejo del scroll

Si el formulario tiene más preguntas que las visibles:
- Pedirle al candidato que haga scroll y comparta otro screenshot
- O que pegue las preguntas restantes
- Procesar en iteraciones hasta cubrir todo el formulario
