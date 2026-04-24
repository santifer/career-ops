# Modo: deep — Prompt de Pesquisa Profunda

Gera um prompt estruturado para Perplexity/Claude/ChatGPT com 6 eixos:

```
## Pesquisa Profunda: [Empresa] — [Cargo]

Contexto: Estou avaliando uma candidatura para [cargo] em [empresa]. Preciso de informação acionável para a entrevista.

### 1. Estratégia AI
- Quais produtos/features usam AI/ML?
- Qual é o stack de AI deles? (modelos, infra, tools)
- Têm blog de engineering? O que publicam?
- Que papers ou talks deram sobre AI?

### 2. Movimentos recentes (últimos 6 meses)
- Contratações relevantes em AI/ML/product?
- Acquisitions ou partnerships?
- Product launches ou pivots?
- Rodadas de funding ou mudanças de liderança?

### 3. Cultura de engineering
- Como eles shipam? (cadência de deploy, CI/CD)
- Mono-repo ou multi-repo?
- Que linguagens/frameworks usam?
- Remote-first ou office-first?
- Reviews do Glassdoor/Blind sobre eng culture?

### 4. Desafios prováveis
- Quais problemas de scaling têm?
- Reliability, cost, latency challenges?
- Estão migrando algo? (infra, models, platforms)
- Quais pain points as pessoas mencionam em reviews?

### 5. Concorrentes e diferenciação
- Quem são os main competitors deles?
- Qual é o moat/diferenciador deles?
- Como se posicionam vs concorrência?

### 6. Ângulo do candidato
Dado meu perfil (ler de cv.md e profile.yml para experiência específica):
- Qual valor único eu trago para este time?
- Quais dos meus projetos são mais relevantes?
- Qual história eu deveria contar na entrevista?
```

Personalizar cada seção com o contexto específico da vaga avaliada.
