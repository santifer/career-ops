# Modo: deep — Deep Research Prompt

## Language

This mode is **user-facing**: the output is a research/interview-prep doc the
user reads, not application content sent to the company. Override the shared
"language of the JD (EN default)" rule for this mode and resolve the output
language in this order:

1. **User prompt language** — if the user wrote `/career-ops deep` (or its
   surrounding chat) in Spanish, French, German, Japanese, etc., emit the
   doc in that language.
2. **`config/profile.yml`** — if `language.modes_dir` is set
   (`modes/de`, `modes/fr`, `modes/ja`), prefer that locale.
3. **JD language** — only as a last resort, when the user prompt has no
   language signal (e.g., a bare URL with no surrounding chat).

The template below is written in Spanish as a scaffold. **Translate it to the
resolved output language** before presenting; do not pass the Spanish through
when the user is writing in another language.

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

Personalizar cada sección con el contexto específico de la oferta evaluada,
en el idioma resuelto en la sección **Language** de arriba (NO siempre español).
