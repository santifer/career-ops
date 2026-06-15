---
name: project-memory
description: Guarda o recupera la memoria de continuidad del proyecto career-ops (Nestor's job search). Úsala (1) al CERRAR una sesión o antes de un /clear para volcar todo el contexto importante a PROJECT-MEMORY.md, y (2) al INICIAR una sesión nueva para releer ese archivo y retomar con contexto completo. Dispara con frases como "actualiza la memoria", "guarda el progreso", "vamos a hacer clear", "memoria del proyecto", "retomemos donde quedamos".
---

# Project Memory — Continuidad de sesión para career-ops

El usuario (Nestor) trabaja por sesiones y hace `/clear` con frecuencia. Esta skill mantiene un único archivo de memoria, `PROJECT-MEMORY.md` en la raíz del proyecto, que actúa como el "cerebro" entre sesiones. Es **capa de usuario** — nunca lo sobrescribe una actualización del sistema career-ops.

Responde en **español** (el usuario se comunica en español).

---

## Modo A — GUARDAR / ACTUALIZAR (antes de /clear o al cerrar)

Cuando el usuario pida guardar el progreso, actualizar la memoria, o avise que va a hacer `/clear`:

### Paso 1 — Recolectar el estado real (no inventar, leer de las fuentes)

Lee estas fuentes para reconstruir el estado actual:

1. `data/applications.md` — el tracker: número total de evaluaciones, scores, estados.
2. `reports/` — listar los reportes existentes (`ls reports/`) para saber cuántas evaluaciones hay y sus slugs/fechas.
3. `config/profile.yml` — datos del candidato, comp target, archetypes, dealbreakers (por si cambiaron).
4. `data/pipeline.md` — cantidad de ofertas pendientes y las de alta prioridad.
5. El **historial de la conversación actual** — esta es la fuente MÁS importante para los "hilos en curso": qué se decidió, qué mensajes se enviaron, qué quedó esperando respuesta, qué acción pendiente tiene el usuario.

### Paso 2 — Escribir PROJECT-MEMORY.md

Sobrescribe `PROJECT-MEMORY.md` conservando esta estructura de 8 secciones (es la que el usuario ya conoce):

1. **Who the user is** — datos personales, situación actual (empleos en paralelo, comp combinada, meta de consolidar), archetypes, dealbreakers, superpowers.
2. **Work history** — tabla reverse-chronological con proof points. ⚠️ Conservar la nota de fechas corregidas de BDG (Aug 2025–Apr 2026).
3. **Evaluations done so far** — tabla con TODAS las evaluaciones (#, empresa, rol, score, estado, nota corta). Actualizar el conteo.
4. **Patterns learned** — aprendizajes acumulados (ej. trampa de staffing offshore, gaps recurrentes, ajustes de filtros). Añadir nuevos, no borrar los viejos salvo que dejen de aplicar.
5. **IN-FLIGHT THREADS** — la sección más crítica. Por cada hilo abierto: estado (🟡 esperando / 🟢 listo / 🔴 bloqueado), qué se hizo, qué espera, próxima acción concreta y de quién (usuario vs agente). Incluir mensajes enviados/borradores, nombres y URLs de reclutadores, blockers a confirmar.
6. **Technical setup & workarounds** — cosas a NO redescubrir (bug de PDF en Windows, wrapper run-pdf.mjs, markitdown, notas de shell). Conservar y ampliar.
7. **career-ops file map & rules** — mapa de archivos clave + reglas duras (merge-tracker, nunca enviar formularios, umbral 4.0, etc.).
8. **Immediate next actions** — lista numerada y accionable de qué hacer al retomar.

**Reglas de escritura:**
- Actualizar `**Last updated:**` a la fecha de hoy (usar la fecha del system reminder `currentDate`).
- Ser específico y concreto: nombres, URLs, scores, números de reporte, montos. La próxima sesión arranca a ciegas.
- Preservar el conocimiento histórico — no borrar contexto útil solo porque es viejo.
- Marcar claramente qué acción es del usuario (subir PDF, enviar mensaje, decidir) vs del agente.
- Si un hilo se cerró (ej. el usuario ya aplicó), moverlo de "in-flight" a la tabla de evaluaciones con su estado final, y dejar una línea de cierre.

### Paso 3 — Confirmar

Dile al usuario qué se guardó (resumen de 2-3 líneas: cuántas evaluaciones, qué hilos quedaron abiertos, dónde se guardó) y confirma que puede hacer `/clear` con seguridad.

---

## Modo B — RECUPERAR / RETOMAR (al inicio de sesión nueva)

Cuando el usuario diga "retomemos", "continuemos donde quedamos", o sea claramente el inicio de una sesión nueva sobre este proyecto:

1. Lee `PROJECT-MEMORY.md` completo.
2. Verifica el estado real rápido: `ls reports/` y las primeras líneas de `data/applications.md` por si algo cambió fuera de sesión.
3. Da un resumen breve al usuario: dónde quedamos, hilos abiertos, y las acciones inmediatas pendientes (sección 8).
4. Pregunta por dónde quiere continuar.

No re-ejecutes onboarding — está completo. No repitas trabajo ya hecho que esté registrado en la memoria.

---

## Archivo de memoria

- **Único archivo:** `PROJECT-MEMORY.md` en la raíz del proyecto (`C:\Proyectos_IA\career-ops\PROJECT-MEMORY.md`).
- Es capa de usuario — versionar en git está bien, pero nunca lo toca una actualización del sistema.
- Si en el futuro el archivo crece demasiado (>400 líneas), proponer archivar las secciones históricas en `PROJECT-MEMORY-archive.md` y mantener el principal enfocado en lo activo.
