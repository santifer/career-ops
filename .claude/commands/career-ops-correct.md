---
description: Override manual do outcome de uma aplicação no scoring loop quando o status do tracker não reflete a realidade (ex.: empresa rejeitou por email mas você ainda não atualizou, ou foi pra entrevista mas esqueceu de mudar status). Registra evento com outcome_source=manual em data/learn/scoring-events.jsonl, encadeando com previous_outcome para auditoria. NÃO altera o tracker — se quiser também mudar o status canônico, faça via /career-ops tracker. Outcomes válidos: positive | negative | neutral_excluded | inferred_negative.
argument-hint: "<report_id> <outcome> [reason]"
allowed-tools: Read, Bash, Skill
version: 1.0.0
last_updated: 2026-04-26
related:
  - modes/correct.md
  - lib/learn/correct.mjs
  - templates/states.yml
  - .claude/skills/career-ops/SKILL.md
---

# /career-ops-correct — Override manual de outcome

Wrapper de descoberta para `/career-ops correct`. Despacha a skill `career-ops` no modo `correct` que executa `modes/correct.md`.

## Argumento recebido
$ARGUMENTS

## Despache

Invoque a skill com o modo `correct` + argumentos:

```
Skill({ skill: "career-ops", args: "correct $ARGUMENTS" })
```

Roteiro de `modes/correct.md`:
1. Validar `<report_id>` (existe no tracker) e `<outcome>` ∈ {positive, negative, neutral_excluded, inferred_negative}
2. Rodar `node lib/learn/correct.mjs <report_id> <outcome> "<reason>"`
3. Reportar diff com `previous_outcome` se houver evento anterior
4. Sugerir `/career-ops reflect` se acumular ≥5 correções

## Sintaxe

```
/career-ops-correct <report_id> <outcome> [reason]
```

Exemplo:
```
/career-ops-correct 032 positive "Recebi convite pra entrevista hoje"
```

## Quando usar

- Empresa rejeitou por email/LinkedIn mas o tracker ainda está como `Applied`
- Foi pra entrevista mas esqueceu de mudar o status
- O parser inferiu `inferred_negative` mas o processo está só lento
- Quer testar como uma correção afetaria a próxima reflexão (com parcimônia)

## Quando NÃO usar

- Pra mudar o status canônico no tracker (use `/career-ops tracker` ou edite `data/applications.md` direto)
- Pra registrar uma vaga nova (use `/career-ops oferta` ou o auto-pipeline)
