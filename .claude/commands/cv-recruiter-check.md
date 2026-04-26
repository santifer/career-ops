---
description: Audita um CV existente (PDF, markdown ou texto colado) contra uma vaga específica pela ótica do recrutador, despachando o agent recruiter-reviewer. Devolve veredicto GO / REVISE / STOP com score 0-10, lista de red flags severidade-tagged, top 5 perguntas que o recrutador faria, e auditoria de fidelidade contra cv.md. Apropriado para validar se um CV (manual ou gerado) passa no scan de 6 segundos antes de submeter.
argument-hint: "<caminho do CV | texto colado> + <URL da vaga | texto da JD>"
allowed-tools: Read, Grep, Glob, Bash, Agent, WebFetch
version: 1.1.0
last_updated: 2026-04-26
related:
  - .claude/agents/recruiter-reviewer.md
  - .claude/skills/headhunter/SKILL.md
  - cv.md
---

# /cv-recruiter-check — Auditoria pelo recrutador

Você está usando o agent `recruiter-reviewer` em modo isolado. Não vai gerar CV nem refazer estratégia. Apenas a crítica brutalmente honesta de um recrutador olhando o CV vs a vaga.

## Argumento recebido
$ARGUMENTS

## Pipeline

1. **Pré-flight.** Confira que `cv.md` existe (referência de fidelidade).
2. **Capturar o CV em revisão.** O argumento pode incluir:
   - Caminho de PDF em `output/`. Você precisa do equivalente markdown — peça ao usuário ou tente extrair via Bash.
   - Caminho de `.md` com o CV personalizado.
   - Texto colado.
3. **Capturar a vaga.** URL → use Playwright/WebFetch. Texto colado → use direto. Caminho de briefing existente → leia.
4. **Recruiter framing.** Leia `.claude/references/recruiter-lens.md`. Identifique nível + família funcional. Sintetize 3-5 linhas do filtro mental.
5. **Despache** o agent `recruiter-reviewer` via Task tool. Passe:
   - O recruiter-framing.
   - O CV em revisão (texto íntegro).
   - A vaga (texto íntegro).
   - Caminho do `cv.md` master para auditoria de fidelidade.
   - Instrução para ler `.claude/references/cv-playbook-2026.md` e `.claude/references/recruiter-lens.md`.
6. **Espere** o veredicto.
7. **Salve** em `output/cv-checks/{YYYY-MM-DD}-{slug-empresa}.md`.
8. **Apresente** ao usuário:
   - Veredicto **GO / REVISE / STOP**.
   - Score 0-10.
   - Top 3 problemas + top 3 oportunidades não capturadas.
   - Lista clara do que mudar (se REVISE) ou por que parar (se STOP).

## Quando usar este comando

- Você gerou um CV manualmente (ou em outra ferramenta) e quer validar antes de submeter.
- Você quer auditar um CV antigo contra uma vaga nova.
- Você quer um "second opinion" depois de rodar `/headhunter` e ainda está em dúvida.

## Quando NÃO usar

- Para gerar CV ponta-a-ponta → use `/headhunter`.
- Para análise inicial da vaga → use `/cv-analyze`.

## Saída esperada

Crítica markdown estruturada conforme template do `recruiter-reviewer.md`. Salvo em `output/cv-checks/`.

## Aviso de fidelidade

O agent vai cruzar o CV em revisão com `cv.md`. Se detectar conteúdo **inventado** (skill ou métrica que não existe no master), marca `CRITICAL` e exige correção. Isso é proposital.
