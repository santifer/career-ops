# Auto-Apply: Guía Rápida 🚀

Tu sistema de aplicación automática está listo. Aquí está cómo usarlo.

---

## 1️⃣ PRIMERA VEZ: Configuración Inicial

```bash
node auto-apply.mjs setup
```

✅ Esto verifica que tengas:
- `cv.md` (tu CV)
- `config/profile.yml` (tus datos)
- `config/credentials.yml` (tus credenciales de login)
- `data/pipeline.md` (cola de trabajos)

Si algo falta, el script te lo dirá.

---

## 2️⃣ BUSCAR TRABAJOS: Scan

### Solo Bogotá (recomendado para ti)
```bash
node auto-apply.mjs scan bogota
```

### Todo el mundo
```bash
node auto-apply.mjs scan global
```

### Búsqueda normal (mixto)
```bash
node auto-apply.mjs scan
```

✅ Esto busca nuevas ofertas en Computrabajo, LinkedIn, Indeed, etc. y las agrega a `data/pipeline.md`

---

## 3️⃣ APLICAR A TRABAJOS: Apply

```bash
node auto-apply.mjs apply
```

✅ Esto:
1. Lee `data/pipeline.md`
2. Para cada trabajo:
   - Navega a la URL
   - Verifica si ya aplicaste ("Postulado")
   - Si no: llena el formulario con tus datos
   - Envía la aplicación
   - Detecta si fue exitosa
3. Genera reporte en `data/applications-log.md`

---

## 4️⃣ AUTOMATIZAR COMPLETAMENTE: Loop

### Cada 5 minutos (búsqueda + aplicación)
```bash
node auto-apply.mjs loop
```

### Cada X minutos (personalizado)
```bash
node auto-apply.mjs loop 10
```

✅ Esto ejecuta el ciclo completo cada N minutos:
- Busca nuevas ofertas
- Aplica a las que no has aplicado
- Genera reporte
- Repite

**Para ejecutar en background (mientras trabajas):**
```bash
node auto-apply.mjs loop 5 > logs/auto-apply.log 2>&1 &
```

---

## 5️⃣ VERIFICAR ESTADO: Status

```bash
node auto-apply.mjs status
```

✅ Te muestra:
- Trabajos pendientes en cola
- Trabajos ya aplicados
- Éxitos/Errores
- Salud del sistema

---

## 📖 EJEMPLOS DE USO

### Escenario 1: Trabajo full-time
```bash
# Mañana: buscar
node auto-apply.mjs scan bogota

# Revisar qué encontró
node auto-apply.mjs status

# Si hay cosas interesantes en pipeline.md, aplicar
node auto-apply.mjs apply

# Revisar resultados
cat data/applications-log.md
```

### Escenario 2: Búsqueda automatizada 24/7
```bash
# Ejecuta en background (búsqueda + aplicación cada 5 min)
nohup node auto-apply.mjs loop 5 > logs/auto-apply.log 2>&1 &

# Chequea estado cuando quieras
node auto-apply.mjs status

# Ver log en tiempo real
tail -f logs/auto-apply.log
```

### Escenario 3: Solo Computrabajo en Bogotá
```bash
# Buscar solo en Bogotá
node auto-apply.mjs scan bogota

# Aplicar
node auto-apply.mjs apply

# Ver resultados
head -20 data/applications-log.md
```

---

## ⚙️ CONFIGURAR TUS DATOS

Edita estos archivos antes de empezar:

### 1. `config/profile.yml` - Tus datos
```yaml
candidate:
  full_name: "Cristian Camilo Montes"
  email: "tu-email@gmail.com"
  phone: "+57 314 366 3821"
  location: "Bogotá DC"
  portfolio_url: "https://tuportfolio.com"
  linkedin: "https://linkedin.com/in/tu-perfil"
  github: "https://github.com/tu-usuario"
```

### 2. `config/credentials.yml` - Credenciales (SECRETO⚠️)
```yaml
computrabajo:
  email: "email@para-computrabajo.com"
  password: "tu-contraseña"
  
linkedin:
  email: "email@para-linkedin.com"
  password: "tu-contraseña"
```

⚠️ **IMPORTANTE:**
- Este archivo NO debe commitirse a Git
- Ya está en `.gitignore`
- Guarda una copia segura en tu password manager
- Usa contraseñas distintas para automation que para acceso manual

### 3. `cv.md` - Tu CV
Tu CV en markdown. El sistema lo usa para llenar formularios.

---

## 📊 RESULTADOS Y REPORTES

### Dónde se guardan los resultados:

| Archivo | Contenido |
|---------|----------|
| `data/applications.md` | Tabla de todas tus aplicaciones (resumen) |
| `data/applications-log.md` | Detalles de cada aplicación (quién, cuándo, qué ocurrió) |
| `data/pipeline.md` | Cola de trabajos pendientes |
| `data/pipeline-history.jsonl` | Historial de ciclos automatizados |
| `logs/auto-apply.log` | Log técnico si ejecutas en background |

### Ver resultados:
```bash
# Ver último reporte
cat data/applications-log.md

# Contar éxitos
grep "Status: \*\*success\*\*" data/applications-log.md | wc -l

# Ver resumen
node auto-apply.mjs status
```

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### "No aplica a nada"
```bash
# 1. Verifica que hay trabajos en cola
node auto-apply.mjs status

# 2. Busca nuevos
node auto-apply.mjs scan bogota

# 3. Intenta aplicar
node auto-apply.mjs apply
```

### "Dice que ya apliqué pero no es verdad"
El sistema detecta en Computrabajo un div con texto "Postulado". Puede ser un falso positivo.
- Abre manually URL en navegador
- Verifica si realmente ya aplicaste
- Si es falso positivo, edita `data/pipeline.md` y marca como `[x]`

### "Los formularios no se llenan"
```bash
# Verifica tus datos en profile.yml
edit config/profile.yml

# Asegúrate que:
# - full_name = tu nombre completo
# - email = tu email real
# - phone = tu teléfono
# - location = tu ciudad

# Intenta aplicar a un trabajo específico
node auto-apply.mjs test https://co.computrabajo.com/...
```

### "Las credenciales no funcionan"
```bash
# Test tu login
node auto-apply.mjs test-login

# Verifica en credentials.yml:
# - Email correcto?
# - Contraseña correcta?
# - ¿Tenés 2FA habilitado? (no soportado, deshabilita)

# Intenta login manual en el navegador primero
```

### "Errores de red / timeout"
- Espera 5 minutos
- Verifica conexión a internet
- Intenta de nuevo con `node auto-apply.mjs apply`

### "No encuentra el botón de Aplicar"
```bash
# Debuggea una URL específica
node auto-apply.mjs test https://co.computrabajo.com/tu-trabajo

# El script abrirá el navegador (no headless)
# Podrás ver exactamente qué detecta / no detecta
```

---

## 🔒 SEGURIDAD

✅ **Seguro:**
- Credenciales guardadas localmente (no se envían a Claude)
- Navegador corre en tu máquina
- `.gitignore` protege `config/credentials.yml`

⚠️ **Precauciones:**
- No compartas tu `config/credentials.yml`
- Usa contraseña temporal para automation (no tu contraseña principal)
- Verifica que el .gitignore excluya `config/credentials.yml`:
  ```bash
  grep "credentials" .gitignore
  ```

---

## 📱 COMANDOS DE REFERENCIA RÁPIDA

```bash
# INICIO
node auto-apply.mjs setup           # Primera vez
node auto-apply.mjs help            # Ver ayuda

# BÚSQUEDA
node auto-apply.mjs scan            # Búsqueda normal
node auto-apply.mjs scan bogota     # Solo Bogotá
node auto-apply.mjs scan global     # Todo el mundo

# APLICAR
node auto-apply.mjs apply           # Aplicar una vez
node auto-apply.mjs apply --dry     # Simular sin aplicar

# AUTOMATIZAR
node auto-apply.mjs loop            # Loop cada 5 min
node auto-apply.mjs loop 10         # Loop cada 10 min
node auto-apply.mjs loop 5 &        # Background

# INFORMACIÓN
node auto-apply.mjs status          # Estado actual
node auto-apply.mjs test <url>      # Debuggear URL

# TEST
node auto-apply.mjs test-login      # Verificar credenciales
```

---

## 🎯 SIGUIENTE: ¿QUÉ ESPERAR?

### Primer ciclo:
1. `scan bogota` → encuentra trabajos en Bogotá
2. `status` → te muestra cuántos hay
3. `apply` → aplica a todos
4. `status` → te muestra resultados

### Noches/Madrugadas:
```bash
# Ejecuta esto una vez, déjalo corriendo
node auto-apply.mjs loop 5 > auto.log 2>&1 &

# Tu sistema ahora:
# - Busca nuevos trabajos cada 5 minutos
# - Aplica automáticamente
# - Genera reportes
# - Lo único que tienes que hacer es... nada 😎
```

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Cuántas aplicaciones puedo hacer por día?**
R: Sin límite técnico. Computrabajo/LinkedIn tienen límites de rate-limiting. Si ves errores, aumenta el intervalo a 10-15 minutos.

**P: ¿Se ve spam? ¿Pueden rechazarme por aplicar mucho?**
R: El sistema respeta si ya aplicaste ("Postulado"). No aplica dos veces. El único riesgo es si aplicas a trabajos básicamente iguales en 1 minuto.

**P: ¿Puedo parar el loop?**
R: `Ctrl+C` en la terminal. Si está en background: `ps aux | grep auto-apply` → `kill <PID>`

**P: ¿Se quedan mis aplicaciones en el registro?**
R: Sí, en `data/applications.md` y `data/applications-log.md`. Son centralizadas y nunca se borran.

**P: ¿Puedo aplicar a trabajos específicos solamente?**
R: Borra las URLs que no quieras de `data/pipeline.md` antes de `node auto-apply.mjs apply`

**P: ¿Néceesito Node.js instalado?**
R: Sí, Node.js 18+. Ya lo tienes si puedes ejecutar `npm install`.

---

## 🚀 COMENZAR AHORA

```bash
# 1. Setup
node auto-apply.mjs setup

# 2. Buscar trabajos
node auto-apply.mjs scan bogota

# 3. Ver qué encontró
node auto-apply.mjs status

# 4. Aplicar
node auto-apply.mjs apply

# 5. Ver resultados
tail data/applications-log.md
```

**¡Listo!** 🎉 Ahora tienes aplicación automática.

Para más info: `node auto-apply.mjs help`
