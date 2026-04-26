---
description: Alias estrito da skill /headhunter (ponto de entrada principal a partir de 2026-04-26). Repassa $ARGUMENTS para a skill via Skill tool, sem lógica adicional. Mantido para preservar muscle memory de usuários do comando antigo /tailor-cv.
argument-hint: "<URL da vaga | texto da JD colado>"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Agent, WebFetch
version: 1.1.0
last_updated: 2026-04-26
deprecated: false
related:
  - .claude/skills/headhunter/SKILL.md
---

# /tailor-cv — Alias para a skill /headhunter

Este comando é um alias estrito da skill `/headhunter`.

**Ação:** invoque a skill `headhunter` via Skill tool, repassando `$ARGUMENTS`. Não execute lógica aqui — toda a orquestração (3 agents + recruiter-lens + geração de PDF) vive em `.claude/skills/headhunter/SKILL.md`.

Razão da existência: usuários antigos que tinham `/tailor-cv` no muscle memory continuam funcionando sem retreinamento.
