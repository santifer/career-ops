# Modo: deep — Deep Research Prompt

Genera un prompt estructurado para Perplexity/Claude/ChatGPT con 6 ejes:

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

### Company Risk Assessment (solo si config/visa.yml existe)

Ejecutar risk-assess.mjs con los datos recopilados durante la investigacion profunda:
`echo '{"companyName":"<company>","h1bSummary":<from h1b-lookup>,"jdText":"<if available>"}' | node risk-assess.mjs --stdin --json`

Incluir el risk level y factores detectados en la seccion de analisis de la empresa.
Si se encontraron layoffs durante la investigacion WebSearch, agregar al contexto:
"WebSearch found layoff reports: {details}. Risk assessment: {riskLevel}."

Mostrar tabla de factores de riesgo:

| Risk Factor | Weight | Detail |
|-------------|--------|--------|
| {factor} | {weight} | {detail} |

Si riskLevel es 'HIGH': advertencia prominente sobre invertir tiempo en esta empresa.
Si riskLevel es 'MEDIUM': nota informativa sobre los factores detectados.
