# Modo: oferta — Avaliação Completa A-G

Quando o candidato cola uma oferta (texto ou URL), entregar SEMPRE os 7 blocos (A-F avaliação + G legitimidade):

## Passo 0 — Detecção de Arquétipo

Classificar a oferta em um dos 6 arquétipos (ver `_shared.md`). Se for híbrido, indicar os 2 mais próximos. Isso determina:
- Quais proof points priorizar no bloco B
- Como reescrever o summary no bloco E
- Quais histórias STAR preparar no bloco F

## Bloco A — Resumo do Cargo

Tabela com:
- Arquétipo detectado
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Function (build/consult/manage/deploy)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (se mencionado)
- TL;DR em 1 frase

## Bloco B — Match com CV

Ler `cv.md`. Criar tabela com cada requisito da JD mapeado para linhas exatas do CV.

**Adaptado ao arquétipo:**
- Se FDE → priorizar proof points de delivery rápida e client-facing
- Se SA → priorizar design de sistemas e integrações
- Se PM → priorizar product discovery e métricas
- Se LLMOps → priorizar evals, observability, pipelines
- Se Agentic → priorizar multi-agent, HITL, orchestration
- Se Transformation → priorizar change management, adoption, scaling

Seção de **gaps** com estratégia de mitigação para cada um. Para cada gap:
1. É um hard blocker ou um nice-to-have?
2. O candidato pode demonstrar experiência adjacente?
3. Há um projeto portfolio que cubra este gap?
4. Plano de mitigação concreto (frase para cover letter, projeto rápido, etc.)

## Bloco C — Nível e Estratégia

1. **Nível detectado** na JD vs **nível natural do candidato para esse arquétipo**
2. **Plano "vender senior sem mentir"**: frases específicas adaptadas ao arquétipo, conquistas concretas a destacar, como posicionar a experiência de founder como vantagem
3. **Plano "se me downlevelarem"**: aceitar se comp é justa, negociar review em 6 meses, critérios de promoção claros

## Bloco D — Comp e Demanda

Usar WebSearch para:
- Salários atuais do cargo (Glassdoor, Levels.fyi, Blind)
- Reputação de compensação da empresa
- Tendência de demanda do cargo

Tabela com dados e fontes citadas. Se não houver dados, dizer ao invés de inventar.

## Bloco E — Plano de Personalização

| # | Seção | Estado atual | Mudança proposta | Por quê |
|---|-------|---------------|------------------|---------|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 mudanças no CV + Top 5 mudanças no LinkedIn para maximizar match.

## Bloco F — Plano de Entrevistas

6-10 histórias STAR+R mapeadas para requisitos da JD (STAR + **Reflection**):

| # | Requisito da JD | História STAR+R | S | T | A | R | Reflection |
|---|-----------------|-----------------|---|---|---|---|------------|

A coluna **Reflection** captura o que foi aprendido ou o que seria feito diferente. Isso sinaliza senioridade — candidatos juniores descrevem o que aconteceu, candidatos seniores extraem lições.

**Story Bank:** Se `interview-prep/story-bank.md` existir, verificar se alguma dessas histórias já está lá. Se não, appendar novas. Com o tempo isso constrói um banco reutilizável de 5-10 histórias master que podem ser adaptadas para qualquer pergunta de entrevista.

**Selecionadas e enquadradas segundo o arquétipo:**
- FDE → enfatizar velocidade de entrega e client-facing
- SA → enfatizar decisões de arquitetura
- PM → enfatizar discovery e trade-offs
- LLMOps → enfatizar métricas, evals, production hardening
- Agentic → enfatizar orchestration, error handling, HITL
- Transformation → enfatizar adoção, mudança organizacional

Incluir também:
- 1 case study recomendado (qual dos projetos dele apresentar e como)
- Perguntas red-flag e como respondê-las (ex: "por que você vendeu sua empresa?", "você tem equipe de reports?")

## Bloco G — Legitimidade da Vaga

Analisar a vaga por sinais que indiquem se é uma abertura real e ativa. Isso ajuda o usuário a priorizar seu esforço em oportunidades com maior probabilidade de resultar em processo de contratação.

**Enquadramento ético:** Apresentar observações, não acusações. Todo sinal tem explicações legítimas. O usuário decide como ponderá-los.

### Sinais para analisar (em ordem):

**1. Frescor da Postagem** (do snapshot Playwright, já capturado no Passo 0):
- Data da postagem ou "X dias atrás" -- extrair da página
- Estado do botão Apply (ativo / fechado / ausente / redireciona para página genérica)
- Se a URL redirecionou para página de carreiras genérica, notar

**2. Qualidade da Descrição** (do texto da JD):
- Nomeia tecnologias específicas, frameworks, tools?
- Menciona team size, estrutura de reporte, ou contexto organizacional?
- Requisitos são realistas? (anos de experiência vs idade da tecnologia)
- Há um escopo claro para os primeiros 6-12 meses?
- Salário/compensação é mencionado?
- Qual razão da JD é específica do cargo vs boilerplate genérico?
- Contradições internas? (título júnior + requisitos de staff, etc.)

**3. Sinais de Contratação da Empresa** (2-3 queries WebSearch, combinar com pesquisa do Bloco D):
- Buscar: `"{company}" layoffs {year}` -- notar data, escala, departamentos
- Buscar: `"{company}" hiring freeze {year}` -- notar quaisquer anúncios
- Se layoffs encontrados: são no mesmo departamento desta vaga?

**4. Detecção de Repostagem** (de scan-history.tsv):
- Verificar se empresa + título de cargo similar apareceu antes com URL diferente
- Notar quantas vezes e em que período

**5. Contexto de Mercado do Cargo** (qualitativo, sem queries adicionais):
- É um cargo comum que tipicamente é preenchido em 4-6 semanas?
- O cargo faz sentido para o negócio desta empresa?
- O nível de senioridade é um que legitimamente leva mais tempo para preencher?

### Formato de output:

**Assessment:** Um de três níveis:
- **Alta Confiança** -- Múltiplos sinais sugerem uma abertura real e ativa
- **Proceder com Cautela** -- Sinais mistos vale a pena notar
- **Suspeito** -- Múltiplos indicadores de vaga fantasma, investigar antes de investir tempo

**Tabela de sinais:** Cada sinal observado com sua finding e peso (Positivo / Neutro / Preocupante).

**Notas de Contexto:** Quaisquer ressalvas (cargo de nicho, cargo governamental, posição evergreen, etc.) que expliquem sinais potencialmente preocupantes.

### Tratamento de edge cases:
- **Cargos governamentais/acadêmicos:** Timelines mais longos são padrão. Ajustar thresholds (60-90 dias é normal).
- **Postagens evergreen/contratação contínua:** Se a JD explicitamente diz "ongoing" ou "rolling," notar como contexto -- isso não é vaga fantasma, é um cargo de pipeline.
- **Cargos de nicho/executivos:** Staff+, VP, Director, ou cargos altamente especializados legitimamente permanecem abertos por meses. Ajustar thresholds de idade de acordo.
- **Startups pré-receita:** Empresas em estágio inicial podem ter JDs vagas porque o cargo é genuinamente indefinido. Ponderar vagueza de descrição menos fortemente.
- **Sem data disponível:** Se a idade da postagem não puder ser determinada e nenhum outro sinal for preocupante, padrão para "Proceder com Cautela" com nota de que dados limitados estavam disponíveis. NUNCA padrão para "Suspeito" sem evidência.
- **Sourced por recruiter (sem postagem pública):** Sinais de frescor indisponíveis. Notar que contato ativo de recruiter é em si um sinal positivo de legitimidade.

---

## Pós-avaliação

**SEMPRE** após gerar os blocos A-G:

### 1. Salvar report .md

Salvar avaliação completa em `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = próximo número sequencial (3 dígitos, zero-padded)
- `{company-slug}` = nome da empresa em lowercase, sem espaços (usar hifens)
- `{YYYY-MM-DD}` = data atual

**Formato do report:**

```markdown
# Avaliação: {Empresa} — {Cargo}

**Data:** {YYYY-MM-DD}
**Arquétipo:** {detectado}
**Score:** {X/5}
**Legitimidade:** {Alta Confiança | Proceder com Cautela | Suspeito}
**PDF:** {caminho ou pendente}

---

## A) Resumo do Cargo
(conteúdo completo do bloco A)

## B) Match com CV
(conteúdo completo do bloco B)

## C) Nível e Estratégia
(conteúdo completo do bloco C)

## D) Comp e Demanda
(conteúdo completo do bloco D)

## E) Plano de Personalização
(conteúdo completo do bloco E)

## F) Plano de Entrevistas
(conteúdo completo do bloco F)

## G) Legitimidade da Vaga
(conteúdo completo do bloco G)

## H) Rascunho de Respostas da Aplicação
(só se score >= 4.5 — rascunhos de respostas para o formulário de aplicação)

---

## Keywords extraídas
(lista de 15-20 keywords da JD para otimização ATS)
```

### 2. Registrar no tracker

**SEMPRE** registrar em `data/applications.md`:
- Próximo número sequencial
- Data atual
- Empresa
- Cargo
- Score: média de match (1-5)
- Estado: `Avaliada`
- PDF: ❌ (ou ✅ se auto-pipeline gerou PDF)
- Report: link relativo ao report .md (ex: `[001](reports/001-company-2026-01-01.md)`)

**Formato do tracker:**

```markdown
| # | Data | Empresa | Cargo | Score | Estado | PDF | Report |
```
