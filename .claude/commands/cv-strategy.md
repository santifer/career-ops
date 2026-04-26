---
description: Monta o blueprint de personalização do CV a partir de um briefing de vaga existente, despachando o agent cv-strategist em modo isolado. Apropriado quando o briefing já existe (de /cv-analyze ou rodada anterior) e o objetivo é iterar a estratégia de personalização sem refazer a análise. Para fluxo completo (análise + estratégia + revisão + PDF), use /headhunter.
argument-hint: "<caminho do briefing | descrição da vaga + cv.md já configurado>"
allowed-tools: Read, Grep, Glob, Bash, Agent
version: 1.1.0
last_updated: 2026-04-26
related:
  - .claude/agents/cv-strategist.md
  - .claude/skills/headhunter/SKILL.md
  - cv.md
---

# /cv-strategy — Blueprint de personalização (cirúrgico)

Você está usando o agent `cv-strategist` em modo isolado. Não vai analisar a vaga (presumivelmente já foi feito) nem rodar a crítica do recrutador. Apenas o blueprint estratégico.

## Argumento recebido
$ARGUMENTS

## Pipeline

1. **Pré-flight.** Confira que `cv.md`, `config/profile.yml` e `modes/_profile.md` existem.
2. **Localizar briefing.** O argumento pode ser:
   - Caminho de arquivo `.md` existente em `output/cv-analyses/` ou `output/tailor-runs/.../01-vaga-briefing.md`. Leia o arquivo.
   - Texto colado de briefing. Use direto.
   - Descrição livre da vaga. Sinalize ao usuário que você precisa de um briefing estruturado e ofereça rodar `/cv-analyze` antes.
3. **Recruiter framing leve.** Leia `.claude/references/recruiter-lens.md` e identifique nível + família funcional. Inclua no prompt do agent.
4. **Despache** o agent `cv-strategist` via Task tool. Passe o briefing + recruiter framing + caminho do `cv.md` + instrução para ler `.claude/references/cv-playbook-2026.md` e `.claude/references/recruiter-lens.md`.
5. **Espere** o blueprint estruturado.
6. **Salve** em `output/cv-strategies/{YYYY-MM-DD}-{slug-empresa}.md`.
7. **Apresente** ao usuário o blueprint íntegro + 3-4 linhas de "principais movimentos" (top 3 reescritas mais fortes, top gap real, match rate estimado).

## Quando usar este comando

- Você já tem um briefing de uma rodada anterior e quer iterar a estratégia.
- Você está testando alternativas de Summary/Core Competencies para a mesma vaga.
- Você quer ver o blueprint antes de gastar tempo gerando o PDF.

## Quando NÃO usar

- Para ponta-a-ponta (briefing → blueprint → PDF) → use `/headhunter`.
- Para só decodificar a vaga → use `/cv-analyze`.

## Saída esperada

Blueprint markdown estruturado conforme template do `cv-strategist.md`. Salvo em `output/cv-strategies/`.
