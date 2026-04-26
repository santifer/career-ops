# Career-Ops -- Guia de Uso Completo

Guia detalhado de todos os comandos do Career-Ops com exemplos praticos de uso.

> **Plataformas suportadas:** Claude Code (`/career-ops`) e OpenCode (`/career-ops-*`)

---

## Indice

1. [Primeiro Uso (Onboarding)](#1-primeiro-uso-onboarding)
2. [Menu Principal](#2-menu-principal)
3. [Auto-Pipeline (colar JD)](#3-auto-pipeline-colar-jd)
4. [/career-ops scan](#4-career-ops-scan)
5. [/career-ops pipeline](#5-career-ops-pipeline)
6. [/career-ops oferta](#6-career-ops-oferta)
7. [/career-ops ofertas](#7-career-ops-ofertas)
8. [/career-ops pdf](#8-career-ops-pdf)
9. [/career-ops apply](#9-career-ops-apply)
10. [/career-ops contacto](#10-career-ops-contacto)
11. [/career-ops deep](#11-career-ops-deep)
12. [/career-ops training](#12-career-ops-training)
13. [/career-ops project](#13-career-ops-project)
14. [/career-ops tracker](#14-career-ops-tracker)
15. [/career-ops batch](#15-career-ops-batch)
16. [/headhunter — CV pela ótica do recrutador](#16-headhunter--cv-pela-otica-do-recrutador)
17. [Fluxo Recomendado](#17-fluxo-recomendado)
18. [Referencia Rapida](#18-referencia-rapida)

---

## 1. Primeiro Uso (Onboarding)

Na primeira sessao, o sistema detecta automaticamente se os arquivos base existem. Se algum estiver faltando, ele guia voce passo a passo.

### Arquivos necessarios

| Arquivo | Obrigatorio | O que contem |
|---------|-------------|--------------|
| `cv.md` | Sim | Seu curriculo em markdown |
| `config/profile.yml` | Sim | Nome, email, localizacao, roles-alvo, salario |
| `modes/_profile.md` | Sim | Personalizacao de arquetipos e narrativa |
| `portals.yml` | Recomendado | Configuracao de portais para o scanner |

### Exemplo de onboarding

```
Voce: /career-ops

Bot: Nao encontrei seu CV. Voce pode:
  1. Colar seu CV aqui e eu converto para markdown
  2. Colar seu LinkedIn URL e eu extraio as informacoes
  3. Me contar sobre sua experiencia e eu crio um CV

Voce: [cola o CV]

Bot: CV salvo em cv.md. Agora preciso de alguns detalhes:
  - Seu nome completo e email?
  - Localizacao e timezone?
  - Que roles voce esta buscando?
  - Faixa salarial alvo?

Voce: Fernando Xavier, fernando@email.com, Sao Paulo UTC-3,
     buscando Senior Backend Engineer e Staff Engineer,
     faixa de R$30-40k/mes

Bot: Perfil configurado! Pronto para uso.
```

### Dica: quanto mais contexto, melhor

Depois do setup basico, o sistema pergunta sobre seus diferenciais, o que te motiva, deal-breakers, melhores conquistas e projetos publicados. Isso melhora drasticamente a qualidade das avaliacoes.

---

## 2. Menu Principal

```
/career-ops
```

Sem argumentos, mostra o menu com todos os comandos disponiveis. Use isso quando nao lembrar o nome de um comando.

**OpenCode:** `/career-ops`

---

## 3. Auto-Pipeline (colar JD)

O modo mais poderoso. Cole uma URL ou texto de vaga e o sistema faz tudo automaticamente:
avaliacao completa (blocos A-F) + relatorio + PDF + registro no tracker.

### Exemplo com URL

```
/career-ops https://boards.greenhouse.io/anthropic/jobs/5234567
```

### Exemplo com texto

```
/career-ops

Senior AI Engineer - Anthropic
Location: San Francisco (Remote OK)
About the role: We're looking for...
Requirements:
- 5+ years in ML/AI
- Experience with LLMs in production
- Strong Python and systems design
...
```

### O que acontece

1. Extrai o JD da URL (via Playwright) ou do texto colado
2. Detecta o arquetipo do role (AI Platform, Agentic, Technical PM, etc.)
3. Gera relatorio com 6 blocos:
   - **A** -- Resumo da oferta (role, remote policy, seniority)
   - **B** -- Match com seu CV (tabela JD vs experiencia)
   - **C** -- Deteccao de nivel + estrategia de negociacao
   - **D** -- Pesquisa de compensacao (dados de mercado)
   - **E** -- Plano de personalizacao (o que mudar no CV/LinkedIn)
   - **F** -- Historias STAR+R para entrevista
4. Calcula score global (1-5)
5. Gera PDF otimizado para ATS (se score >= 3.0)
6. Registra no tracker (`data/applications.md`)

### Saida

```
Relatorio: reports/143-anthropic-2026-04-07.md
Score: 4.3/5
PDF: output/cv-fernando-anthropic-2026-04-07.pdf
Status: Evaluated
```

---

## 4. /career-ops scan

Escaneia portais de emprego configurados em `portals.yml` e descobre novas vagas.

```
/career-ops scan
```

**OpenCode:** `/career-ops-scan`

### Como funciona

O scan opera em 3 niveis sequenciais:

| Nivel | Metodo | Vantagem |
|-------|--------|----------|
| 1 | Playwright (navega na pagina de carreiras) | Ve vagas em tempo real, funciona com SPAs |
| 2 | Greenhouse API (JSON estruturado) | Rapido, dados limpos |
| 3 | WebSearch (buscas com site:) | Descobre empresas novas |

### Exemplo de saida

```
Portal Scan -- 2026-04-07
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries executados: 12
Ofertas encontradas: 47 total
Filtradas por titulo: 12 relevantes
Duplicadas: 8
Expiradas descartadas: 2
Novas adicionadas a pipeline.md: 4

  + Anthropic | Senior AI PM | Ashby
  + OpenAI | Staff Researcher | Greenhouse
  + xAI | Principal Engineer | Ashby
  + Temporal | Technical PM | Lever

→ Execute /career-ops pipeline para avaliar as novas ofertas.
```

### Filtros (portals.yml)

```yaml
title_filter:
  positive: ["AI", "Engineer", "Staff", "Principal"]  # deve conter >= 1
  negative: ["Junior", "Intern", "Sales"]              # exclui se conter
  seniority_boost: ["Principal", "Director", "Staff"]   # prioridade maior
```

### Automacao

Voce pode configurar scans recorrentes:

```
Voce: scan a cada 3 dias
Bot: Configurado! Vou escanear portais automaticamente a cada 3 dias.
```

---

## 5. /career-ops pipeline

Processa todas as URLs pendentes em `data/pipeline.md`.

```
/career-ops pipeline
```

**OpenCode:** `/career-ops-pipeline`

### Como adicionar URLs ao pipeline

Edite `data/pipeline.md` e adicione na secao "Pendientes":

```markdown
## Pendientes
- [ ] https://boards.greenhouse.io/anthropic/jobs/5234567
- [ ] https://jobs.ashbyhq.com/openai/abc123
- [ ] local:jds/interesting-role.md
```

### Processamento

Para cada URL:
1. Extrai o JD
2. Executa avaliacao completa (A-F)
3. Gera relatorio + PDF (se score >= 3.0)
4. Move de "Pendientes" para "Procesadas"

Se houver 3+ URLs, o sistema lanca workers paralelos automaticamente.

### Exemplo de saida

```
Pipeline processado -- 2026-04-07

| # | Empresa | Rol | Score | PDF | Acao recomendada |
|---|---------|-----|-------|-----|------------------|
| 143 | Anthropic | Senior AI PM | 4.3/5 | ok | Candidatar imediatamente |
| 144 | BigCo | Solutions Architect | 2.1/5 | -- | Pular (comp abaixo do mercado) |
| 145 | OpenAI | Staff Researcher | 4.6/5 | ok | Candidatar imediatamente |

Ofertas avaliadas: 3
PDFs gerados: 2
→ Execute /career-ops apply para candidatar-se.
```

### Formato apos processamento

```markdown
## Procesadas
- [x] #143 | https://...greenhouse.io/... | Anthropic | Senior AI PM | 4.3/5 | PDF ok
- [x] #144 | https://...lever.co/... | BigCo | Solutions Architect | 2.1/5 | PDF --
```

---

## 6. /career-ops oferta

Avaliacao detalhada de uma unica oferta (blocos A-F). Similar ao auto-pipeline, mas sem gerar PDF automaticamente.

```
/career-ops oferta
```

**OpenCode:** `/career-ops-evaluate`

### Exemplo

```
Voce: /career-ops oferta

Bot: Cole o JD ou URL da vaga que quer avaliar.

Voce: https://jobs.ashbyhq.com/company/xyz

Bot: [gera relatorio completo com blocos A-F]

Score: 3.8/5
Arquetipo: AI Platform / LLMOps
Nivel detectado: Senior (IC5)
Comp estimada: $180-220k base + equity

Recomendacao: Boa opcao, mas comp ligeiramente abaixo do mercado.
Considere negociar ou usar como leverage.
```

### Quando usar

- Quer avaliar sem gerar PDF
- Quer uma analise rapida antes de decidir se vale investir tempo
- Quer comparar mentalmente com outras opcoes

---

## 7. /career-ops ofertas

Compara e rankeia multiplas ofertas lado a lado usando 10 dimensoes ponderadas.

```
/career-ops ofertas
```

**OpenCode:** `/career-ops-compare`

### Dimensoes de comparacao

| Dimensao | Peso |
|----------|------|
| Alinhamento North Star | 25% |
| Match com CV | 15% |
| Nivel Senior | 15% |
| Compensacao | 10% |
| Trajetoria de crescimento | 10% |
| Qualidade remote | 5% |
| Reputacao da empresa | 5% |
| Modernidade do tech stack | 5% |
| Velocidade ate oferta | 5% |
| Sinais culturais | 5% |

### Exemplo

```
Voce: /career-ops ofertas

Bot: Quais ofertas quer comparar? Posso buscar no tracker.

Voce: Anthropic, OpenAI e Temporal

Bot:
| Oferta | North Star | CV Match | Level | Comp | Growth | ... | TOTAL |
|--------|-----------|----------|-------|------|--------|-----|-------|
| Anthropic | 5 | 4 | 5 | 4 | 5 | ... | 4.5 |
| OpenAI | 4 | 5 | 4 | 5 | 4 | ... | 4.3 |
| Temporal | 3 | 3 | 4 | 4 | 3 | ... | 3.4 |

Recomendacao: Anthropic (4.5 > 4.3 > 3.4)
  - Anthropic: melhor fit com seus objetivos de carreira
  - OpenAI: comp mais alta, mas crescimento limitado no role
  - Temporal: boa empresa, mas role nao esta alinhado
```

---

## 8. /career-ops pdf

Gera um CV em PDF otimizado para ATS (Applicant Tracking Systems), personalizado para uma vaga especifica.

```
/career-ops pdf
```

**OpenCode:** `/career-ops-pdf`

### O que o sistema faz

1. Le `cv.md` como fonte de verdade
2. Extrai 15-20 keywords do JD
3. Detecta idioma do JD (EN/ES) e formato de pagina (letter/A4)
4. Reescreve o Professional Summary injetando keywords do JD
5. Seleciona os 3-4 projetos mais relevantes
6. Reordena bullets de experiencia por relevancia
7. Monta grid de "Core Competencies" com termos do JD
8. Gera HTML e converte para PDF

### Exemplo

```
Voce: /career-ops pdf

Bot: Para qual vaga? Cole o JD, URL, ou diga o numero do relatorio.

Voce: Relatorio #143 (Anthropic Senior AI PM)

Bot: Gerando PDF otimizado para ATS...
  - Keywords extraidas: RAG, LLM observability, evals, production reliability...
  - Summary reescrito com keywords
  - Projetos selecionados: LLM Evals Framework, Cost Monitor, Agent Pipeline
  - Competencies: RAG Pipeline Design, LLM Observability, Production Infrastructure...

PDF salvo: output/cv-fernando-anthropic-2026-04-07.pdf
  - Formato: Letter (empresa US)
  - Paginas: 2
  - Cobertura de keywords: 87%
```

### Regras de injeccao de keywords

- **NUNCA inventa skills** -- so reformula experiencia existente com vocabulario do JD
- Exemplo: JD diz "RAG pipelines", CV diz "LLM workflows with retrieval" -> muda para "RAG pipeline design and LLM orchestration workflows"

### Opcao Canva

Se `canva_resume_design_id` estiver configurado em `profile.yml`, o sistema oferece duas opcoes:
- **HTML/PDF** (rapido, otimizado para ATS)
- **Canva CV** (visual, preserva design)

---

## 9. /career-ops apply

Assistente interativo para preencher formularios de candidatura em tempo real.

```
/career-ops apply
```

**OpenCode:** `/career-ops-apply`

### Pre-requisito

Ter o formulario de candidatura aberto no navegador.

### Fluxo

1. Detecta empresa + role na pagina aberta
2. Busca relatorio existente em `reports/`
3. Identifica todos os campos do formulario
4. Gera respostas personalizadas para cada campo
5. Preenche automaticamente (se Playwright disponivel) ou apresenta respostas para copy-paste
6. **PARA OBRIGATORIAMENTE antes do botao Submit**

### Exemplo

```
Voce: /career-ops apply

Bot: Detectei: Anthropic - Senior AI PM (encontrei relatorio #143)
     Analisando formulario...

     Campos encontrados:
     1. Cover Letter (textarea)
     2. Why this role? (textarea)
     3. Salary expectation (number)
     4. Work authorization (dropdown)
     5. Resume (file upload)

     Gerando respostas...

     ## Respostas para Anthropic -- Senior AI PM
     Baseado em: Report #143 | Score: 4.3/5

     ### 1. Cover Letter
     > Dear Hiring Team,
     > I built an LLM evaluation framework processing 10M+ inferences/day...
     > [resposta completa personalizada]

     ### 2. Why this role?
     > Your focus on production reliability for AI systems aligns with...

     ### 3. Salary expectation
     > $250,000 (baseado em dados de mercado para Senior PM em SF)

     [preenche campos automaticamente]

     ⚠️  SUBMISSION REVIEW -- Anthropic / Senior AI PM
     Campos preenchidos:
     - Cover Letter: "Dear Hiring Team, I built an LLM..."
     - Why this role: "Your focus on production..."
     - Salary: $250,000
     - Work auth: Authorized
     - Resume: cv-fernando-anthropic-2026-04-07.pdf

     Revise com cuidado. Digite "go" para enviar ou "abort" para cancelar.

Voce: go

Bot: Candidatura enviada! Tracker atualizado: Evaluated → Applied
     Proximo passo: /career-ops contacto para alcançar o hiring manager no LinkedIn
```

### Paradas obrigatorias (HITL Gates)

O sistema **SEMPRE para** nestas situacoes:

| Situacao | Acao |
|----------|------|
| Botao Submit/Apply/Send | Para e mostra resumo. Espera "go" ou "abort" |
| CAPTCHA detectado | Para e avisa. Voce resolve manualmente |
| 2FA detectado | Para e espera voce completar |
| Sessao expirada | Para e pede re-autenticacao |

---

## 10. /career-ops contacto

Gera mensagens de outreach para LinkedIn com framework de 3 frases.

```
/career-ops contacto
```

**OpenCode:** `/career-ops-contact`

### Framework de 3 frases

1. **Gancho**: Algo especifico sobre a empresa ou desafio atual (NAO generico)
2. **Prova**: Maior conquista quantificavel relevante para o role
3. **Proposta**: Conversa rapida, sem pressao

### Exemplo

```
Voce: /career-ops contacto Anthropic Senior AI PM

Bot: Buscando targets...

  Targets identificados:
  1. Sarah Chen (Engineering Manager, AI Platform) -- TARGET PRIMARIO
  2. Mike Rodriguez (Technical Recruiter)
  3. Ana Silva (Senior AI Engineer, peer)

  ## Mensagem para Sarah Chen (max 300 chars)

  "Saw Anthropic's new Constitutional AI paper -- the eval methodology
  is impressive. I built an LLM eval framework handling 10M+ daily
  inferences with 99.9% uptime. Would love to chat about production
  AI reliability for 15 min."

  ## Versao para Recruiter (Mike Rodriguez)

  "Hi Mike -- applying for the Senior AI PM role. Built production
  LLM systems at scale (10M inferences/day). Quick chat about the
  role scope?"

  Regras:
  - Max 300 caracteres (limite de connection request)
  - NUNCA compartilha telefone
  - Tom direto, sem corporate-speak
```

---

## 11. /career-ops deep

Gera um prompt estruturado de pesquisa profunda sobre uma empresa, para usar no Perplexity, Claude ou ChatGPT.

```
/career-ops deep
```

**OpenCode:** `/career-ops-deep`

### 6 eixos de pesquisa

1. **Estrategia AI** -- produtos, stack, papers, blog de engineering
2. **Movimentos recentes** -- contratacoes, acquisitions, funding (ultimos 6 meses)
3. **Cultura de engineering** -- deploy cadence, tech stack, remote policy, reviews
4. **Desafios provaveis** -- scaling, reliability, migracoes
5. **Competidores** -- moat, diferenciacao, posicionamento
6. **Angulo do candidato** -- valor unico, projetos relevantes, historia para contar

### Exemplo

```
Voce: /career-ops deep Anthropic

Bot:
## Deep Research: Anthropic -- Senior AI PM

Contexto: Estou avaliando uma candidatura para Senior AI PM na Anthropic.

### 1. Estrategia AI
- Quais produtos usam AI/ML? (Claude, API, Constitutional AI)
- Qual e o stack? (modelos, infra, tools)
- Blog de engineering? Publicacoes recentes?
...

### 6. Angulo do candidato
Dado meu perfil (LLM eval framework, 10M inferences/day):
- Que valor unico eu trago?
- Que projetos sao mais relevantes?
- Que historia contar na entrevista?

→ Copie este prompt e use no Perplexity para pesquisa profunda.
```

---

## 12. /career-ops training

Avalia se um curso ou certificacao vale a pena para seus objetivos de carreira.

```
/career-ops training
```

**OpenCode:** `/career-ops-training`

### 6 dimensoes avaliadas

| Dimensao | O que avalia |
|----------|-------------|
| Alinhamento North Star | Aproxima ou afasta do objetivo? |
| Sinal para recruiter | O que hiring managers pensam ao ver isso no CV? |
| Tempo e esforco | Semanas x horas/semana |
| Custo de oportunidade | O que voce deixa de fazer durante esse tempo? |
| Riscos | Conteudo outdated? Brand fraca? Basico demais? |
| Entregavel portfolio | Produz artefato demonstravel? |

### Veredictos possiveis

- **FAZER** -- plano de 4-12 semanas com entregaveis
- **NAO FAZER** -- alternativa melhor com justificativa
- **FAZER COM TIMEBOX** (max X semanas) -- so o essencial

### Exemplo

```
Voce: /career-ops training
      Estou pensando em fazer o curso "MLOps Specialization" do Coursera (DeepLearning.AI)

Bot:
## Avaliacao: MLOps Specialization (Coursera/DeepLearning.AI)

| Dimensao | Score | Analise |
|----------|-------|---------|
| North Star | 4/5 | MLOps e diretamente relevante para roles AI Platform |
| Sinal recruiter | 3/5 | DeepLearning.AI tem boa brand, mas muita gente tem |
| Tempo | 3/5 | ~12 semanas, 5h/semana = 60h total |
| Custo oport. | 3/5 | Poderia estar construindo projeto portfolio |
| Riscos | 2/5 | Conteudo pode estar desatualizado (pre-LLM era) |
| Entregavel | 2/5 | Exercicios padrao, nao produz portfolio piece |

Veredicto: FAZER COM TIMEBOX (4 semanas max)
  - Faca so os modulos de CI/CD e monitoring
  - Pule os basicos de ML training
  - Combine com um projeto proprio para ter entregavel

Alternativa melhor: Construir um LLM monitoring dashboard real
e publicar como case study (demonstra skill + cria portfolio piece)
```

---

## 13. /career-ops project

Avalia se uma ideia de projeto para portfolio vale a pena construir.

```
/career-ops project
```

**OpenCode:** `/career-ops-project`

### 6 dimensoes (1-5)

| Dimensao | Peso |
|----------|------|
| Sinal para roles-alvo | 25% |
| Unicidade | 20% |
| Demo-ability (pode demonstrar em 2 min?) | 20% |
| Potencial de metricas | 15% |
| Tempo ate MVP | 10% |
| Potencial de historia STAR | 10% |

### Veredictos

- **CONSTRUIR** -- plano com milestones semanais
- **SKIP** -- por que e o que fazer em vez disso
- **PIVOTAR A [alternativa]** -- variante mais impactante

### Exemplo

```
Voce: /career-ops project
      Ideia: Um CLI que avalia CVs usando LLMs e da feedback

Bot:
## Avaliacao: CV Evaluator CLI

| Dimensao | Score | Analise |
|----------|-------|---------|
| Sinal roles-alvo | 3/5 | Demonstra uso de LLMs, mas nao e "production-grade" |
| Unicidade | 2/5 | Muitos projetos similares existem (resume parsers) |
| Demo-ability | 4/5 | CLI facil de demonstrar em terminal |
| Metricas | 3/5 | Pode medir accuracy, latency, custo por avaliacao |
| Tempo MVP | 5/5 | 1 semana para MVP funcional |
| Historia STAR | 3/5 | Historia ok, mas faltam trade-offs interessantes |

Score: 3.2/5

Veredicto: PIVOTAR A "LLM Eval Framework"
  - Em vez de avaliar CVs, construa um framework de avaliacao
    de outputs de LLM (evals)
  - Muito mais alinhado com roles AI Platform
  - Mesma complexidade tecnica, sinal 10x mais forte

Plano 80/20:
  - Semana 1: MVP com 3 tipos de eval + metricas
  - Semana 2: Dashboard + interview pack (one-pager + demo)
```

---

## 14. /career-ops tracker

Visao geral do status de todas as candidaturas.

```
/career-ops tracker
```

**OpenCode:** `/career-ops-tracker`

### Exemplo de saida

```
═══════════════════════════════════════
        APPLICATION TRACKER
═══════════════════════════════════════

Total avaliacoes: 42
  * Evaluated (nao candidatou): 8
  * Applied: 24
  * Responded: 6
  * Interview: 3
  * Offer: 1
  * Rejected: 3
  * Discarded: 5
  * SKIP: 2

Media score: 3.7/5
Mediana score: 3.8/5
PDFs gerados: 38/42 (90%)

Conversion rate: 1 oferta / 24 aplicadas = 4.2%
Interview rate: 3 entrevistas / 24 aplicadas = 12.5%

Top 5 por score:
  #45  Anthropic | Senior AI PM | 4.6/5 | Interview
  #43  OpenAI | Staff Engineer | 4.5/5 | Responded
  #41  xAI | Principal PM | 4.4/5 | Applied
  #39  Google | Director AI | 4.3/5 | Evaluated
  #37  Meta | Senior PM | 4.2/5 | Applied
```

### Estados canonicos

| Estado | Quando usar |
|--------|-------------|
| `Evaluated` | Relatorio completo, decisao pendente |
| `Applied` | Candidatura enviada |
| `Responded` | Empresa respondeu |
| `Interview` | Em processo de entrevista |
| `Offer` | Oferta recebida |
| `Rejected` | Rejeitado pela empresa |
| `Discarded` | Descartado pelo candidato ou vaga fechou |
| `SKIP` | Nao se encaixa, nao candidatar |

---

## 15. /career-ops batch

Processamento em lote com workers paralelos. Ideal para avaliar muitas vagas de uma vez.

```
/career-ops batch
```

**OpenCode:** `/career-ops-batch`

### Quando usar

- Tem 5+ URLs para avaliar
- Quer processar tudo de uma vez sem supervisao
- Quer maximizar velocidade com workers paralelos

### Exemplo

```
Voce: /career-ops batch

Bot: Encontrei 8 URLs pendentes em pipeline.md.
     Lancando 3 workers paralelos...

     Worker 1: Anthropic, OpenAI, xAI
     Worker 2: Google, Meta, Temporal
     Worker 3: Stripe, Datadog

     [processamento paralelo ~15-20 min]

     Batch concluido!
     8 relatorios gerados
     6 PDFs gerados (2 com score < 3.0)
     Executando merge-tracker.mjs...
     Tracker atualizado com 8 novas entradas.
```

### Nota sobre verificacao

Em modo batch (`claude -p`), Playwright nao esta disponivel. O sistema usa WebFetch como fallback e marca relatorios com `**Verification:** unconfirmed (batch mode)`.

---

## 16. /headhunter — CV pela ótica do recrutador

Skill auto-invocável que orquestra um time de 3 subagents para gerar **CV hiper-personalizado** com perspectiva de **recrutador**, não só de keywords da JD. Construída sobre o pipeline `modes/pdf.md` mas adicionando uma camada de modelagem do recrutador antes da geração.

```
/headhunter https://boards.greenhouse.io/empresa/vaga
```

Ou, alternativamente, **auto-invocação**: cole URL de portal conhecido (Greenhouse/Lever/Ashby/Workday/LinkedIn jobs), texto de JD com sinais explícitos (Responsibilities/Requirements), ou diga "personaliza meu CV para esta vaga". A skill é ativada automaticamente.

### O que é diferente vs `/career-ops pdf`

| Aspecto | `/career-ops pdf` | `/headhunter` |
|---------|-------------------|---------------|
| Pergunta-guia | "O CV cobre as keywords da JD?" | "O recrutador desta vaga compraria isto em 6 segundos?" |
| Camadas | 1 (geração direta) | 3 (analyze → strategy → recruiter audit → PDF) |
| Auditoria de fidelidade | Implícita | **Explícita** (recruiter-reviewer marca CRITICAL se detecta invenção) |
| Filtro segmentado por família funcional | Não | Sim (Controller, Consolidation, FP&A, etc — via `recruiter-lens.md`) |
| Veredicto GO/REVISE/STOP | Não | Sim |
| Artefatos persistidos | Só PDF | PDF + recruiter-framing + briefing + blueprint + review + summary |

### Pipeline interno (6 fases)

1. **Pré-flight** — verifica `cv.md`, `modes/pdf.md`, `recruiter-lens.md`, `cv-playbook-2026.md`, `output/` gravável.
2. **Modelagem do recrutador** — identifica nível, família funcional, indústria, e sintetiza o filtro mental específico desta vaga.
3. **Análise da vaga** (subagent `vaga-analyst`) — briefing estruturado com keywords P0/P1/P2, requisitos must/nice, perfil arquetípico, gaps potenciais.
4. **Estratégia** (subagent `cv-strategist`) — blueprint de personalização: Summary reescrito, Core Competencies, reordenação de bullets, seleção de projetos, mapa de match. **Nunca inventa.**
5. **Crítica do recrutador** (subagent `recruiter-reviewer`) — simula scan de 6s, audita fidelidade contra `cv.md`, retorna **GO / REVISE / STOP** com score 0-10.
6. **Geração do PDF** — usa o pipeline já existente em `modes/pdf.md` com os outputs do blueprint.

### Comandos granulares (uso cirúrgico)

Quando você não quer rodar o pipeline completo:

| Comando | Despacha | Quando usar |
|---------|----------|-------------|
| `/cv-analyze <URL ou JD>` | `vaga-analyst` | Quer só decodificar a vaga antes de decidir aplicar. |
| `/cv-strategy <briefing existente>` | `cv-strategist` | Já tem briefing e quer iterar a estratégia. |
| `/cv-recruiter-check <CV> <vaga>` | `recruiter-reviewer` | Quer auditar um CV manual contra uma vaga antes de submeter. |
| `/tailor-cv <URL ou JD>` | (alias) | Equivalente a `/headhunter`, mantido por compatibilidade. |

### Saída

```
output/tailor-runs/2026-04-26-anthropic/
  ├── 00-recruiter-framing.md       # filtro mental do recrutador
  ├── 00-summary.md                 # relatório consolidado
  ├── 01-vaga-briefing.md          # output do vaga-analyst
  ├── 02-blueprint.md               # output do cv-strategist
  └── 03-recruiter-review.md        # output do recruiter-reviewer
output/cv-fernando-anthropic-2026-04-26.pdf
```

### Gates éticos

- Match rate < 65% → recomenda **não aplicar**.
- Veredicto STOP do recruiter-reviewer → bloqueia geração até resolver.
- Score < 5/10 → comunica honestamente que a candidatura é fraca.
- Conteúdo inventado em qualquer ponto → **CRITICAL**, exige correção.

### Bases de conhecimento consultadas

- `.claude/references/cv-playbook-2026.md` — melhores práticas Harvard MCS, Jobscan, ZipRecruiter, Columbia.
- `.claude/references/recruiter-lens.md` — filtro mental segmentado por nível e família funcional. **Atualize este arquivo** quando receber feedback real de recrutador (ex: "o head-hunter da empresa X reclamou de Y") — o sistema fica mais afiado a cada ciclo.

### Quando NÃO usar

- Para avaliação inicial sem geração de CV → use `/career-ops oferta`.
- Para batch de várias vagas → use `/career-ops batch`.
- Para conversa genérica sobre carreira → não invocar.

---

## 17. Fluxo Recomendado

O fluxo tipico de uso do Career-Ops segue esta sequencia:

```
1. DESCOBRIR     /career-ops scan          → encontra vagas nos portais
      |
2. AVALIAR       /career-ops pipeline      → avalia todas as pendentes
      |
3. DECIDIR       /career-ops ofertas       → compara e rankeia
      |
4. PREPARAR      /career-ops pdf           → gera CV personalizado
      |               +
                  /career-ops deep          → pesquisa a empresa
      |
5. CANDIDATAR    /career-ops apply         → preenche formulario
      |
6. CONECTAR      /career-ops contacto      → outreach no LinkedIn
      |
7. ACOMPANHAR    /career-ops tracker       → monitora status
```

### Atalho rapido

Se voce encontrou uma vaga interessante, o caminho mais rapido e colar direto:

```
/career-ops https://url-da-vaga.com
```

Isso executa o auto-pipeline completo (avaliar + PDF + tracker) em um unico comando.

### Atalho premium — CV pela ótica do recrutador

Quando voce quer mais que keyword matching e busca um CV que passa no scan de 6 segundos do recrutador:

```
/headhunter https://url-da-vaga.com
```

Equivalente ao auto-pipeline + camada de recruiter-lens + auditoria de fidelidade explicita. Mais lento, mais robusto. Recomendado para vagas-alvo prioritarias.

---

## 18. Referencia Rapida

### Claude Code

| Comando | Descricao |
|---------|-----------|
| `/career-ops` | Menu principal |
| `/career-ops {JD ou URL}` | Auto-pipeline completo |
| `/career-ops scan` | Escanear portais |
| `/career-ops pipeline` | Processar URLs pendentes |
| `/career-ops oferta` | Avaliar uma oferta |
| `/career-ops ofertas` | Comparar ofertas |
| `/career-ops pdf` | Gerar CV em PDF (caminho rapido) |
| `/career-ops apply` | Assistente de candidatura |
| `/career-ops contacto` | Outreach LinkedIn |
| `/career-ops deep` | Pesquisa profunda |
| `/career-ops training` | Avaliar curso/cert |
| `/career-ops project` | Avaliar projeto portfolio |
| `/career-ops tracker` | Status das candidaturas |
| `/career-ops batch` | Processamento em lote |
| `/headhunter {JD ou URL}` | **CV hiper-personalizado pela otica do recrutador** (3 subagents + recruiter-lens + auditoria de fidelidade) |
| `/cv-analyze {JD}` | Decodificar vaga sem gerar CV (so vaga-analyst) |
| `/cv-strategy {briefing}` | Iterar blueprint de personalizacao (so cv-strategist) |
| `/cv-recruiter-check {CV} {vaga}` | Auditar CV existente (so recruiter-reviewer) |
| `/tailor-cv {JD ou URL}` | Alias legado de `/headhunter` |

### OpenCode

| Comando | Equivalente |
|---------|-------------|
| `/career-ops` | `/career-ops` |
| `/career-ops-evaluate` | `/career-ops oferta` |
| `/career-ops-compare` | `/career-ops ofertas` |
| `/career-ops-pipeline` | `/career-ops pipeline` |
| `/career-ops-contact` | `/career-ops contacto` |
| `/career-ops-deep` | `/career-ops deep` |
| `/career-ops-pdf` | `/career-ops pdf` |
| `/career-ops-training` | `/career-ops training` |
| `/career-ops-project` | `/career-ops project` |
| `/career-ops-tracker` | `/career-ops tracker` |
| `/career-ops-apply` | `/career-ops apply` |
| `/career-ops-scan` | `/career-ops scan` |
| `/career-ops-batch` | `/career-ops batch` |

### Arquivos importantes

| Arquivo | Funcao |
|---------|--------|
| `cv.md` | Seu curriculo (fonte de verdade) |
| `config/profile.yml` | Identidade e preferencias |
| `modes/_profile.md` | Personalizacao de arquetipos |
| `portals.yml` | Configuracao do scanner |
| `data/applications.md` | Tracker de candidaturas |
| `data/pipeline.md` | Inbox de URLs pendentes |
| `reports/` | Relatorios de avaliacao |
| `output/` | PDFs gerados |

### Personalizacao

O sistema e feito para ser personalizado. Exemplos do que voce pode pedir:

```
"Mude os arquetipos para roles de data engineering"
"Traduza os modos para portugues"
"Adicione estas empresas aos portais"
"Atualize meu perfil"
"Mude o design do template do CV"
"Ajuste os pesos do scoring"
```

Todas as personalizacoes do usuario vao em `modes/_profile.md` ou `config/profile.yml`, garantindo que updates do sistema nunca sobrescrevam seus dados.
