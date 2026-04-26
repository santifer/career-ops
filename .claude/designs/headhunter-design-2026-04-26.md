---
title: Design — /headhunter (CV hiper-personalizado, modo recrutador)
type: design
status: IMPLEMENTED
date: 2026-04-26
implemented: 2026-04-26
generated_via: /office-hours (modo Builder)
phase: 1 of 2
phase_2_status: pending
supersedes: null
last_updated: 2026-04-26
version: 1.1.0
related:
  - .claude/skills/headhunter/SKILL.md
  - .claude/agents/vaga-analyst.md
  - .claude/agents/cv-strategist.md
  - .claude/agents/recruiter-reviewer.md
  - .claude/references/recruiter-lens.md
  - .claude/commands/cv-analyze.md
  - .claude/commands/cv-strategy.md
  - .claude/commands/cv-recruiter-check.md
  - .claude/commands/tailor-cv.md
---

# Design — /headhunter (CV hiper-personalizado, modo recrutador)

Gerado em 2026-04-26 via /office-hours (modo Builder).
Status: IMPLEMENTED (Fase 1 concluída em 2026-04-26). Fase 2 (recruiter-driven completo) pendente.

## Problema

Hoje há 3 agents (`vaga-analyst`, `cv-strategist`, `recruiter-reviewer`), 1 comando (`/tailor-cv`), 1 playbook (`cv-playbook-2026.md`) e referências cruzadas. Funciona, mas:
1. **Fragmentado.** Usuário tem que lembrar do comando certo, e os agents só são invocáveis via Task tool indiretamente.
2. **Recrutador é validador final.** A perspectiva entra no fim do pipeline. O reframe desejado: o recrutador deveria conduzir desde o início — toda decisão de Summary, ordem de bullets e Core Competencies precisa ser tomada com a pergunta "o recrutador desta vaga compraria isto em 6s?".
3. **Sem auto-invocação.** Comandos do Claude Code não são auto-descobertos quando o usuário cola uma URL/JD; skills são.

## Objetivo

Uma **skill única** (`/headhunter`) que vire o ponto de entrada principal e pense como o recrutador da vaga específica desde o primeiro segundo. Comandos granulares por agent ficam disponíveis para uso cirúrgico (não obrigatório).

## Princípios não-negociáveis

1. **Realçar nunca inventar.** Continua valendo. Skill nunca adiciona conteúdo que não está em `cv.md`/`article-digest.md`.
2. **Recrutador-first.** O primeiro passo do pipeline é "definir o filtro mental do recrutador desta vaga", não "extrair keywords da JD". Mudança sutil mas estrutural.
3. **Um ponto de entrada principal.** `/headhunter <URL ou JD>` faz tudo. Comandos granulares são ferramentas avançadas, não obrigatórios.
4. **Aproveitamento total.** Reaproveita os 3 agents, o playbook e o pipeline `modes/pdf.md` que já existem. Zero retrabalho.

## Arquitetura — Fase 1 (entrega imediata)

### Estrutura de arquivos a criar

```
D:/Career Ops/.claude/
├── skills/
│   └── headhunter/
│       └── SKILL.md              # ponto de entrada principal — auto-invocável
├── commands/
│   ├── cv-analyze.md             # invoca só o vaga-analyst (cirúrgico)
│   ├── cv-strategy.md            # invoca só o cv-strategist
│   ├── cv-recruiter-check.md     # invoca só o recruiter-reviewer (auditoria)
│   └── tailor-cv.md              # mantém como alias para /headhunter (compat)
├── agents/
│   ├── vaga-analyst.md           # já existe — sem mudança em F1
│   ├── cv-strategist.md          # já existe — sem mudança em F1
│   └── recruiter-reviewer.md     # já existe — sem mudança em F1
└── references/
    ├── cv-playbook-2026.md       # já existe
    └── recruiter-lens.md         # NOVO — semente do reframe da F2
```

### Como funciona o `/headhunter`

**Trigger automático** (auto-invocação da skill): quando o usuário cola uma URL de vaga, um texto de JD, ou pede explicitamente "personaliza meu CV", o Claude detecta e ativa a skill.

**Trigger manual**: `/headhunter <URL ou texto da JD>`.

**Pipeline interno** (idêntico ao `/tailor-cv` atual, mas com adendo recruiter-lens):

1. **Pré-flight** — confere `cv.md`, `config/profile.yml`, `modes/_profile.md`. Se falta algo, encaminha pro onboarding.
2. **Recruiter framing** *(novo, leve)* — antes de despachar o `vaga-analyst`, a skill consulta `references/recruiter-lens.md` para extrair "como pensa o recrutador desta indústria/nível" e passa esse contexto inicial pros 3 agents. Isso é o que diferencia da F1 "skill pura".
3. **Análise da vaga** — `vaga-analyst` produz briefing.
4. **Estratégia** — `cv-strategist` produz blueprint.
5. **Crítica do recrutador** — `recruiter-reviewer` produz veredicto GO/REVISE/STOP.
6. **Geração do PDF** — pipeline existente em `modes/pdf.md`.
7. **Relatório consolidado** — match rate, top destaques, gaps, beats pra cover letter, recomendação.

### Comandos granulares (uso cirúrgico)

- `/cv-analyze <URL ou JD>` — só decodifica a vaga, devolve o briefing. Útil pra entender uma vaga sem gerar CV.
- `/cv-strategy <briefing>` — só monta o blueprint estratégico, dado um briefing. Útil pra iterar a estratégia.
- `/cv-recruiter-check <CV existente> <vaga>` — auditoria de CV já gerado contra a vaga. Útil pra validar um CV manual.

### `references/recruiter-lens.md` (novo)

Mini-base que estende o playbook geral com a perspectiva específica do **filtro mental do recrutador**. Conteúdo:

- **Os 3 sinais de tracking** (direção, velocidade, escopo crescente) que recrutadores buscam em 3 segundos.
- **Heurísticas por indústria** — o que recrutador de tech busca diferente do recrutador de fintech, healthcare, consultoria.
- **Heurísticas por nível** — IC vs manager vs director vs C-level têm filtros distintos.
- **Patterns de "smell test"** — sinais que disparam descarte automático (gaps inexplicados, job hopping sem narrativa, métricas vagas, cargo-alvo desconectado).
- **Como modelar o recrutador específico** — quando há sinal (LinkedIn da empresa, perfil do hiring manager), incorporar; quando não há, usar arquétipo da indústria/nível.

Esse arquivo é o **embrião do reframe da Fase 2**. Em F1 ele é consultado de leve no início; em F2 ele dirige todo o fluxo.

## Arquitetura — Fase 2 (engenharia reversa do recrutador)

Em alto nível, o que muda. Detalhe completo será produzido em outro design doc quando a F1 estiver rodando.

1. **Inverter a ordem mental.** Antes do `vaga-analyst` rodar, um novo passo "modelagem do recrutador" produz o **filtro do recrutador desta vaga**: quem é, o que filtra em 6s, quais red flags dispara, qual o arquétipo ideal pelos olhos dele.
2. **Refatorar `vaga-analyst`** para responder "o que o recrutador procura?" em vez de "o que a JD pede?". Mudança de pergunta-guia.
3. **Refatorar `cv-strategist`** para escrever cada bullet com o scan de 6s na cabeça — ordem por relevância pra primeira impressão, não por relevância à JD.
4. **`recruiter-reviewer` deixa de ser validador final** e vira **co-piloto contínuo**. Audita cada output intermediário, não só o blueprint.
5. **Métrica nova:** "scan score" — quanto do CV o recrutador absorve nos primeiros 6s. Complementa o "match rate" atual.

## Decisões macro

- **Idioma:** Português pra documentação meta; inglês default pra CVs gerados (a menos que JD seja em outro idioma).
- **Localização dos arquivos:** dentro de `D:/Career Ops/.claude/`, não global. Esta é uma capacidade do projeto Career-Ops.
- **Compatibilidade:** `/tailor-cv` continua funcionando (vira alias) pra não quebrar memória/hábitos.
- **Telemetria/logs:** mantém `output/tailor-runs/{data}-{slug}/` pra auditoria.

## Tradeoff explícito da escolha "Skill + comandos granulares"

- **Pró:** flexibilidade total. Skill principal pra fluxo padrão; comandos pra cirurgia.
- **Contra:** mais arquivos pra manter (4 entradas em vez de 1). Risco de drift entre eles.
- **Mitigação:** comandos granulares são wrappers finos (10–15 linhas cada) que só despacham o agent correspondente. A lógica fica no agent. Manutenção centralizada.

## Critério de sucesso da Fase 1

1. `/headhunter <JD>` executa o pipeline ponta-a-ponta e produz o PDF + relatório.
2. Auto-invocação dispara quando o usuário cola URL/JD sem comando explícito.
3. Os 3 agents leem o `recruiter-lens.md` no prompt inicial (verificável nos artefatos salvos em `output/tailor-runs/`).
4. `/tailor-cv` continua funcionando (alias).
5. Os 3 comandos granulares funcionam isoladamente.
6. Nenhum conteúdo dos agents existentes é perdido — só ganham contexto adicional.

## O que NÃO entra na Fase 1

- Refatoração dos agents (fica pra F2).
- Inversão da ordem mental do pipeline (fica pra F2).
- "Scan score" como métrica nova (fica pra F2).
- Modelagem ativa do recrutador via LinkedIn da empresa (fica pra F2 ou F3).

## Próximas ações

1. Você aprova este design.
2. Em sessão separada (ou ao seu sinal explícito), eu implemento: cria a skill, os 3 comandos granulares, o `recruiter-lens.md`, e ajusta o briefing de cada agent pra consultar a lens.
3. Você usa por uma ou duas vagas reais.
4. Volta pra Fase 2 com sinal do que funcionou e do que faltou.

## Cuidados

- Quando criar `references/recruiter-lens.md`, **não inventar** heurísticas. Basear em fontes do playbook + experiência declarada do usuário em `modes/_profile.md`/`config/profile.yml`. Marcar `[hipótese]` o que não estiver sustentado.
- Skill auto-invocável tem que ter `description` precisa pra evitar invocação errada (ex: usuário falando casualmente de carreira sem querer rodar pipeline).
- Manter o gate ético: se match rate < 65% ou recruiter-reviewer dá < 5/10, recomendar não aplicar.
