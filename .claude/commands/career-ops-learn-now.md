---
description: Trigger explícito do scoring-parser passivo. Roda node lib/learn/scoring-parser.mjs --verbose para capturar quaisquer outcomes novos do tracker (data/applications.md) em data/learn/scoring-events.jsonl. Idempotente via SHA-256 do tracker (rerun sem mudança = 0 eventos). Use após editar manualmente o tracker, antes de rodar /career-ops reflect, ou para auditoria sem efeitos colaterais (--dry-run). Normalmente o parser dispara sozinho em /career-ops oferta — este comando força a execução agora.
argument-hint: "[--dry-run] [--force]"
allowed-tools: Read, Bash, Skill
version: 1.0.0
last_updated: 2026-04-26
related:
  - modes/learn-now.md
  - lib/learn/scoring-parser.mjs
  - data/learn/scoring-events.jsonl
  - .claude/skills/career-ops/SKILL.md
---

# /career-ops-learn-now — Trigger explícito do parser passivo

Wrapper de descoberta para `/career-ops learn now`. Despacha a skill `career-ops` no modo `learn-now` que executa `modes/learn-now.md`.

## Argumento recebido
$ARGUMENTS

## Despache

Invoque a skill com o modo `learn-now` + flags opcionais:

```
Skill({ skill: "career-ops", args: "learn-now $ARGUMENTS" })
```

Roteiro de `modes/learn-now.md`:
1. Rodar `node lib/learn/scoring-parser.mjs --verbose $ARGUMENTS`
2. Reportar: N novos eventos, N warnings, total acumulado em scoring-events.jsonl
3. Sugerir próximo passo (reflect se ≥5 desde último, mostrar parser-warnings.log se warnings >0)

## Modos

| Flag | Comportamento |
|---|---|
| (sem flag) | Captura eventos novos, escreve no JSONL |
| `--dry-run` | Mostra o que capturaria SEM escrever (auditoria) |
| `--force` | Reprocessa mesmo com hash do tracker inalterado (debug) |

## Quando usar

- Após editar `data/applications.md` à mão (ex.: confirmar Interview/Offer/Rejected)
- Antes de `/career-ops reflect` pra garantir eventos atualizados
- Pra auditar sem escrever: `/career-ops-learn-now --dry-run`
- Pra debug quando `inference-rules.yml` mudou: `/career-ops-learn-now --force`

## Quando NÃO usar

- Em fluxo normal — o parser já dispara sozinho no início de `/career-ops oferta`
- Se o tracker não mudou desde último run (será no-op por idempotência)
