---
description: Decodifica uma vaga (JD) sem gerar CV, despachando o agent vaga-analyst em modo isolado. Devolve briefing estruturado com keywords classificadas em P0/P1/P2, requisitos must/nice, perfil arquetípico do candidato buscado, gaps potenciais vs cv.md e sinais ATS. Apropriado para entender uma vaga antes de decidir aplicar, ou para mapear competição. Para gerar CV completo, use /headhunter.
argument-hint: "<URL da vaga | texto colado da JD>"
allowed-tools: Read, Grep, Glob, Bash, Agent, WebFetch
version: 1.1.0
last_updated: 2026-04-26
related:
  - .claude/agents/vaga-analyst.md
  - .claude/skills/headhunter/SKILL.md
---

# /cv-analyze — Análise cirúrgica da vaga

Você está usando o agent `vaga-analyst` em modo isolado. Não vai gerar CV, blueprint, nem PDF. Apenas o briefing estruturado da vaga.

## Argumento recebido
$ARGUMENTS

## Pipeline

1. **Pré-flight.** Confira que `cv.md` existe (o agent o usa para mapear gaps potenciais).
2. **Recruiter framing leve.** Leia `.claude/references/recruiter-lens.md` e identifique nível + família funcional da vaga em 2-3 linhas. Inclua isso no prompt do agent.
3. **Despache** o agent `vaga-analyst` via Task tool. Passe a JD + recruiter framing + instrução para ler `.claude/references/cv-playbook-2026.md` e `cv.md`.
4. **Espere** o briefing estruturado.
5. **Salve** em `output/cv-analyses/{YYYY-MM-DD}-{slug-empresa}.md`.
6. **Apresente** ao usuário o briefing íntegro + 3-4 linhas de "o que isso significa pra você" (decisão de aplicar ou não, gaps mais críticos, sinais positivos).

## Quando usar este comando

- Você tem várias vagas e quer entender qual vale o esforço antes de gerar CV.
- Você quer mapear gaps reais antes de gastar tempo personalizando.
- Você está estudando o mercado/competição (várias JDs do mesmo nível).

## Quando NÃO usar

- Para gerar CV ponta-a-ponta → use `/headhunter`.
- Para avaliação completa A-G com pontuação → use `/career-ops oferta`.

## Saída esperada

Briefing markdown estruturado conforme template do `vaga-analyst.md`. Salvo em `output/cv-analyses/`.
