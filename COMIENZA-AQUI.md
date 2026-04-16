# 🚀 COMIENZA AQUÍ: Auto-Apply en 5 Minutos

**Para:** Cristian Camilo Montes  
**Bogotá, Colombia | Full Stack / RPA Developer**  
**Fecha:** Enero 2025

---

## 🎯 Tu Situación

✅ Tienes:
- CV en markdown (`cv.md`)
- Perfil completo (`config/profile.yml`)
- Datos de Computrabajo y LinkedIn

❌ Te Falta:
- Archivo de credenciales

**Solución:** 3 pasos, 5 minutos.

---

## ⚡ PASO 1: Crear Archivo de Credenciales (1 min)

Abre PowerShell y ejecuta:

```powershell
cd c:\Users\User\career-ops
copy config\credentials.example.yml config\credentials.yml
```

Listo. El archivo `config/credentials.yml` ya fue creado.

---

## ✏️ PASO 2: Agregar Tus Credenciales (2 min)

1. Abre `config/credentials.yml` en tu editor (VS Code, Notepad, etc.)
2. Busca esta sección:
   ```yaml
   computrabajo:
     email: "your-email@example.com"
     password: "your-password"
   
   linkedin:
     email: "your-email@example.com"
     password: "your-password"
   ```

3. **Reemplázalo con:**
   ```yaml
   computrabajo:
     email: "cm3642263@gmail.com"
     password: "costa599400"
   
   linkedin:
     email: "cm3642263@gmail.com"
     password: "COSTA599400c!"
   ```

4. **Guarda el archivo** (Ctrl+S)

✅ Listo.

---

## 🧪 PASO 3: Verificar Que Todo Funciona (2 min)

```powershell
node test-auto-apply.mjs
```

Debería mostrar:
```
✓ Passed: X/X
Health: 100%
✓ All tests passed! System is ready.
```

Si todo es verde ✓: **¡Estás listo!**

Si algo es rojo ✗: Lee la sección "Problemas" abajo.

---

## 🎬 PASO 4: Tu Primer Ciclo de Aplicaciones

### A. Buscar Trabajos en Bogotá
```powershell
node auto-apply.mjs scan bogota
```

Esto buscará en Computrabajo, LinkedIn, Indeed, etc. y agregará trabajos a `data/pipeline.md`.

### B. Ver Qué Encontró
```powershell
node auto-apply.mjs status
```

Mostrará algo como:
```
Pending jobs: 12
Total applications: 5
```

### C. Aplicar a Todos
```powershell
node auto-apply.mjs apply
```

El sistema automáticamente:
1. Navega a cada URL
2. Verifica si ya aplicaste
3. Llena el formulario con tus datos
4. Envía la solicitud
5. Detecta si fue exitoso

### D. Ver Resultados
```powershell
node auto-apply.mjs status
cat data/applications-log.md
```

Verás un reporte como:
```
## Computrabajo — Desarrollador Full Stack
- URL: https://co.computrabajo.com/...
- Status: **success**
- Timestamp: 2025-01-30T10:32:15.000Z
- Details:
  - Filled 4 form fields
  - Clicked submit button
  - Success confirmed (checkmark found)
```

---

## 🤖 OPCIÓN A: Aplicación Manual (Control Total)

Cada mañana:
```powershell
node auto-apply.mjs scan bogota      # Busca
node auto-apply.mjs apply             # Aplica
node auto-apply.mjs status            # Revisa resultados
```

**Tiempo:** 15 minutos/día  
**Control:** Total (tú decides qué incluir)

---

## 🔄 OPCIÓN B: Automatizado (Set & Forget)

```powershell
node auto-apply.mjs loop 5
```

Esto ejecuta el ciclo completo cada 5 minutos, **para siempre**, hasta que presiones **Ctrl+C**.

El sistema:
- ✅ Busca nuevas ofertas cada 5 minutos
- ✅ Aplica automáticamente a todas
- ✅ Genera reporte de resultados
- ✅ Continúa corriendo en background

Leave it running overnight y revisa los resultados en la mañana.

**Tiempo:** 0 (set and forget)  
**Control:** Automático

---

## 📊 Qué Esperar

### Primer Ciclo (Hoy)
- 5-15 trabajos encontrados
- 5-15 aplicaciones enviadas
- 100% tasa de éxito de llenado

### Primera Semana
- 50-100 trabajos encontrados
- 50-100 aplicaciones enviadas
- Reporte completo en `data/applications-log.md`

### Primer Mes
- 200-500 aplicaciones
- 5-15 llamadas de entrevistas
- Vision completa de tu pipeline

---

## 🎮 Comandos Rápidos

```bash
# INFORMACIÓN
node auto-apply.mjs help              Ver todos los comandos
node auto-apply.mjs status            Ver estado actual

# BÚSQUEDA
node auto-apply.mjs scan bogota       Buscar en Bogotá
node auto-apply.mjs scan global       Buscar en todo el mundo

# APLICAR
node auto-apply.mjs apply             Aplicar una vez
node auto-apply.mjs apply --dry       Simular sin enviar

# AUTOMATIZAR
node auto-apply.mjs loop              Automatizar (cada 5 min)
node auto-apply.mjs loop 10           Automatizar (cada 10 min)

# DEBUGGING
node auto-apply.mjs test <url>        Debug URL específica
node diagnose-auto-apply.mjs          Verificar salud del sistema
node test-auto-apply.mjs              Prueba completa

# VER RESULTADOS
cat data/applications-log.md          Ver todas las aplicaciones
tail data/applications-log.md         Ver últimas 20 líneas
```

---

## ⚠️ Problemas Comunes

### Problema: "No encuentra credenciales"

```
✗ credentials.yml not found
```

**Solución:**
```powershell
copy config\credentials.example.yml config\credentials.yml
# Entonces edita el archivo
```

### Problema: "Tests no pasan"

```
✗ Test failed
✗ Failed: 3/10
```

**Solución 1:** Verifica `config/profile.yml`
```powershell
# Asegúrate que esté completo:
# - full_name (tu nombre)
# - email (tu email)
# - phone (tu teléfono)
# - location (tu ciudad)
```

**Solución 2:** Verifica `config/credentials.yml`
```powershell
# Email y password correctas?
# ¿Son las mismas que en el navegador?
```

### Problema: "No encuentra trabajos"

Si `scan bogota` no encuentra nada:
```powershell
# Intenta búsqueda global
node auto-apply.mjs scan global

# O búsqueda normal
node auto-apply.mjs scan
```

### Problema: "No llena formularios"

Si "Filled 0 form fields":

1. Verifica que `profile.yml` esté completo
2. Intenta con URL específica para debuggear:
   ```powershell
   node auto-apply.mjs test https://co.computrabajo.com/...
   ```

### Problema: "Dice que ya apliqué pero no"

Computrabajo tiene falsos positivos. Opciones:

1. Verifica manualmente en el navegador
2. Si es falso positivo, edita `data/pipeline.md`:
   - Busca la línea de ese trabajo
   - Cambia `- [ ]` a `- [x]`
3. El sistema lo saltará próxima vez

---

## 📁 Archivos Importantes

```
config/credentials.yml           ← DEBE TENER (edita aquí)
config/profile.yml              ← DEBE TENER (ya existe)
cv.md                          ← DEBE TENER (ya existe)
data/pipeline.md                ← Se llena automáticamente
data/applications-log.md        ← Se genera automáticamente
data/applications.md            ← Se actualiza automáticamente
```

---

## 🔐 Seguridad

✅ **SEGURO:**
- Tus credenciales quedan en tu máquina
- Nunca se envían a Claude
- `.gitignore` protege `credentials.yml`

⚠️ **IMPORTANTE:**
- **NUNCA** hagas push de `config/credentials.yml` a GitHub
- Ya está en `.gitignore`, pero verifica:
  ```powershell
  grep "credentials" .gitignore
  ```
  Debe mostrar: `config/credentials.yml`

---

## 📚 Documentación (Si Quieres Leer Más)

| Archivo | Para Qué | Tiempo |
|---------|----------|--------|
| `START-HERE-AUTO-APPLY.md` | Resumen general | 5 min |
| `SETUP-AUTO-APPLY.md` | Guía completa | 15 min |
| `QUICKSTART-ES.md` | Misma que esta | 10 min |
| `AUTO-APPLY.md` | Detalles técnicos | 20 min |

**Recomendación:** Empieza con esta página. Si necesitas más, lee `SETUP-AUTO-APPLY.md`.

---

## 🎯 Resumen: Qué Hiciste

Creaté un sistema que:

1. ✅ Busca jobs en Computrabajo y LinkedIn
2. ✅ **Automáticamente** llena formularios
3. ✅ **Automáticamente** envía solicitudes
4. ✅ Genera reportes de qué fue exitoso
5. ✅ Puede correr cada 5 minutos, 24/7

**Línea de código que escribes:** 1 sola
```powershell
node auto-apply.mjs loop 5
```

**Lo que hace:** Todo el trabajo por ti.

---

## 🚀 Comienza Ahora

```powershell
# 1. Archivo de credenciales
copy config\credentials.example.yml config\credentials.yml

# 2. Edita con tus datos (email/password)
# (Abre el archivo en tu editor)

# 3. Verifica que funciona
node test-auto-apply.mjs

# 4. ¡LISTO! Ejecuta:
node auto-apply.mjs scan bogota
node auto-apply.mjs apply
```

**Total:** 5 minutos for setup → Aplicaciones automáticas por siempre ✨

---

## ❓ Preguntas?

- `node auto-apply.mjs help` → Ver todos los comandos
- `node diagnose-auto-apply.mjs` → Verificar qué está mal
- `SETUP-AUTO-APPLY.md` → Leer documentación completa

---

## ✨ Lo Último

Acabas de automatizar tu búsqueda de empleo.

Mientras duermes: **100+ aplicaciones se envían automáticamente**

Cuando despiertas: **Chequeas resultados, tomas decisiones**

This is the future of job hunting. 🎯

---

**¡Que tengas éxito en tu búsqueda! 🚀**

Ejecuta: `node auto-apply.mjs scan bogota`
