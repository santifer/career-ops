# Modo: oferta -- Avaliacao Completa A-F

Quando o candidato cola uma vaga (texto ou URL), entregar SEMPRE os 6 blocos:

## Passo 0 -- Deteccao de Arquetipo

Classificar a vaga em um dos 6 arquetipos (ver `_shared.md`). Se for hibrido, indicar os 2 mais proximos. Isso determina:
- Quais proof points priorizar no bloco B
- Como reescrever o summary no bloco E
- Quais historias STAR preparar no bloco F

## Bloco A -- Resumo da Vaga

Tabela com:
- Arquetipo detectado
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Funcao (build/consult/manage/deploy)
- Senioridade
- Remoto (full/hibrido/presencial)
- Tamanho do time (se mencionado)
- TL;DR em 1 frase

## Bloco B -- Match com o Curriculo

Ler `cv.md`. Criar tabela com cada requisito do JD mapeado para linhas exatas do curriculo.

**Adaptado ao arquetipo:**
- Se FDE → priorizar proof points de entrega rapida e proximidade com cliente
- Se SA → priorizar design de sistemas e integracoes
- Se PM → priorizar product discovery e metricas
- Se LLMOps → priorizar evals, observability, pipelines
- Se Agentic → priorizar multi-agent, HITL, orquestracao
- Se Transformation → priorizar gestao de mudanca, adocao, escalabilidade

Secao de **gaps** com estrategia de mitigacao para cada um. Para cada gap:
1. E um hard blocker ou um nice-to-have?
2. O candidato consegue demonstrar experiencia adjacente?
3. Existe um projeto do portfolio que cubra esse gap?
4. Plano de mitigacao concreto (frase para carta de apresentacao, projeto rapido, etc.)

## Bloco C -- Nivel e Estrategia

1. **Nivel detectado** no JD vs **nivel natural do candidato para esse arquetipo**
2. **Plano "vender senior sem mentir"**: frases especificas adaptadas ao arquetipo, conquistas concretas a destacar, como posicionar experiencia de founder como vantagem
3. **Plano "se me downlevelearem"**: aceitar se a remuneracao for justa, negociar revisao em 6 meses, criterios claros de promocao

## Bloco D -- Remuneracao e Demanda

Usar WebSearch para:
- Salarios atuais da vaga (Glassdoor, Levels.fyi, Blind, Glassdoor BR)
- Reputacao de remuneracao da empresa
- Tendencia de demanda da vaga

Tabela com dados e fontes citadas. Se nao houver dados, dizer isso em vez de inventar.

**Mercado Brasileiro -- Checks obrigatorios:**
- CLT ou PJ? Se CLT: considerar 13o, ferias, FGTS, plano de saude, VR/VA na comparacao.
- Se PJ: qual o valor mensal? Calcular equivalente CLT.
- PLR mencionado? Quantos salarios extras?
- Stock options / VSOP? Avaliar vesting, cliff e liquidez.
- Vale-refeicao / vale-alimentacao? Valor mensal?
- Plano de saude? Coparticipacao ou integral?

## Bloco E -- Plano de Personalizacao

| # | Secao | Estado atual | Mudanca proposta | Por que |
|---|-------|-------------|------------------|---------|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 mudancas no curriculo + Top 5 mudancas no LinkedIn para maximizar o match.

## Bloco F -- Plano de Entrevistas

6-10 historias STAR+R mapeadas para requisitos do JD (STAR + **Reflection**):

| # | Requisito do JD | Historia STAR+R | S | T | A | R | Reflection |
|---|----------------|-----------------|---|---|---|---|------------|

A coluna **Reflection** captura o que foi aprendido ou o que seria feito diferente. Isso sinaliza senioridade — candidatos juniores descrevem o que aconteceu, candidatos seniores extraem licoes.

**Story Bank:** Se `interview-prep/story-bank.md` existir, verificar se alguma dessas historias ja esta la. Se nao, adicionar as novas. Com o tempo, isso constroi um banco reutilizavel de 5-10 historias-mestre que podem ser adaptadas para qualquer pergunta de entrevista.

**Selecionadas e enquadradas conforme o arquetipo:**
- FDE → enfatizar velocidade de entrega e proximidade com cliente
- SA → enfatizar decisoes de arquitetura
- PM → enfatizar discovery e trade-offs
- LLMOps → enfatizar metricas, evals, production hardening
- Agentic → enfatizar orquestracao, tratamento de erros, HITL
- Transformation → enfatizar adocao e mudanca organizacional

Incluir tambem:
- 1 case study recomendado (qual projeto apresentar e como)
- Perguntas red-flag e como responde-las (ex: "Por que voce vendeu sua empresa?", "Voce tinha reports diretos?")

---

## Pos-avaliacao

**SEMPRE** apos gerar os blocos A-F:

### 1. Salvar report .md

Salvar avaliacao completa em `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = proximo numero sequencial (3 digitos, zero-padded)
- `{company-slug}` = nome da empresa em lowercase, sem espacos (usar hifens)
- `{YYYY-MM-DD}` = data atual

**Formato do report:**

```markdown
# Avaliacao: {Empresa} -- {Vaga}

**Data:** {YYYY-MM-DD}
**Arquetipo:** {detectado}
**Score:** {X/5}
**URL:** {URL da vaga}
**PDF:** {caminho ou pendente}

---

## A) Resumo da Vaga
(conteudo completo do bloco A)

## B) Match com o Curriculo
(conteudo completo do bloco B)

## C) Nivel e Estrategia
(conteudo completo do bloco C)

## D) Remuneracao e Demanda
(conteudo completo do bloco D)

## E) Plano de Personalizacao
(conteudo completo do bloco E)

## F) Plano de Entrevistas
(conteudo completo do bloco F)

## G) Rascunhos de Respostas para Candidatura
(apenas se score >= 4.5 -- rascunhos de respostas para o formulario de candidatura)

---

## Keywords extraidas
(lista de 15-20 keywords do JD para otimizacao ATS)
```

### 2. Registrar no tracker

**SEMPRE** registrar em `data/applications.md`:
- Proximo numero sequencial
- Data atual
- Empresa
- Vaga
- Score: media do match (1-5)
- Status: `Evaluated`
- PDF: ❌ (ou ✅ se a auto-pipeline gerou PDF)
- Report: link relativo ao report .md (ex: `[001](reports/001-company-2026-01-01.md)`)

**Formato do tracker:**

```markdown
| # | Data | Empresa | Vaga | Score | Status | PDF | Report |
```
