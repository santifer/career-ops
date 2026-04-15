# Modo: deep — Deep Research Prompt

Genera un prompt estructurado para un asistente de research con 6 ejes:

```
## Deep Research: [Empresa] — [Rol]

Contexto: Estoy evaluando una candidatura para [rol] en [empresa]. Necesito información accionable para la entrevista.

### 1. Estrategia AI
- ¿Qué productos/features usan AI/ML?
- ¿Cuál es su stack de AI? (modelos, infra, tools)
- ¿Tienen blog de engineering? ¿Qué publican?
- ¿Qué papers o talks han dado sobre AI?

### 2. Movimientos recientes (últimos 6 meses)
- ¿Contrataciones relevantes en AI/ML/product?
- ¿Acquisitions o partnerships?
- ¿Product launches o pivots?
- ¿Rondas de funding o cambios de liderazgo?

### 3. Cultura de engineering
- ¿Cómo shipean? (cadencia de deploy, CI/CD)
- ¿Mono-repo o multi-repo?
- ¿Qué lenguajes/frameworks usan?
- ¿Remote-first o office-first?
- ¿Glassdoor/Blind reviews sobre eng culture?

### 4. Retos probables
- ¿Qué problemas de scaling tienen?
- ¿Reliability, cost, latency challenges?
- ¿Están migrando algo? (infra, models, platforms)
- ¿Qué pain points menciona la gente en reviews?

### 5. Competidores y diferenciación
- ¿Quiénes son sus main competitors?
- ¿Cuál es su moat/diferenciador?
- ¿Cómo se posicionan vs competencia?

### 6. Ángulo del candidato
Dado mi perfil (read from cv.md and profile.yml for specific experience):
- ¿Qué valor único aporto a este equipo?
- ¿Qué proyectos míos son más relevantes?
- ¿Qué historia debería contar en la entrevista?
```

Personalizar cada sección con el contexto específico de la oferta evaluada.
