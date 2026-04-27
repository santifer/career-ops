---
description: Scoring loop — revisa eventos capturados em data/learn/scoring-events.jsonl, agrupa por (archetype × bucket de score), identifica padrões onde a previsão divergiu do outcome real e propõe ajustes em data/scoring-calibration.yml via AskUserQuestion. Quórum mínimo de 5 eventos novos desde último reflect (use --force pra ignorar). Cada calibração aprovada vira 1 commit Git separado, revertível com git revert. Passo final do learning loop semanal — rode depois de acumular pelo menos 5 outcomes confirmados (Interview, Offer, Rejected) ou inferidos (Applied >30d sem resposta).
argument-hint: "[--force]"
allowed-tools: Read, Edit, Write, Bash, AskUserQuestion, Skill
version: 1.0.0
last_updated: 2026-04-26
related:
  - modes/reflect.md
  - lib/learn/reflect-analyzer.mjs
  - lib/learn/scoring-parser.mjs
  - data/scoring-calibration.yml
  - .claude/skills/career-ops/SKILL.md
---

# /career-ops-reflect — Scoring Loop semanal

Wrapper de descoberta para `/career-ops reflect`. Despacha a skill `career-ops` no modo `reflect` que executa o roteiro de `modes/reflect.md`.

## Argumento recebido
$ARGUMENTS

## Despache

Invoque a skill `career-ops` com o modo `reflect` (mais qualquer flag passada em `$ARGUMENTS`, como `--force`):

```
Skill({ skill: "career-ops", args: "reflect $ARGUMENTS" })
```

A partir daí, siga literalmente os 7 passos de `modes/reflect.md`:
1. Rodar parser passivo (`node lib/learn/scoring-parser.mjs --verbose`)
2. Decidir quick (default) ou force
3. Rodar `node lib/learn/reflect-analyzer.mjs`
4. Avaliar quórum
5. Loop de aprovação por proposta via AskUserQuestion
6. Atualizar `.reflect-state.json`
7. Sumário final ao usuário

## Quando usar

- 1× por semana (ou quando acumular ≥5 outcomes novos).
- Antes de uma nova rodada de candidaturas, pra garantir que pesos atuais reflitam aprendizado recente.
- Quando notar que scores estão sistematicamente fora pra um arquétipo específico.

## Quando NÃO usar

- Sem histórico — se você acabou de começar, deixe o tracker acumular outcomes primeiro.
- Pra mudar uma calibração específica fora do fluxo automático — edite `data/scoring-calibration.yml` à mão e commit.
