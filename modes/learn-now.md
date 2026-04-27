# Modo: learn now — Disparo manual do scoring loop parser

Trigger explícito do parser passivo. Use quando quiser materializar
eventos de aprendizado SEM precisar rodar `/career-ops oferta` (que
dispara o parser implicitamente no início).

## Quando usar

- Após editar manualmente `data/applications.md` (ex.: confirmar status
  Interview/Offer/Rejected).
- Antes de rodar `/career-ops reflect` para garantir que os eventos
  da última semana estão capturados.
- Para auditoria: ver quantos eventos novos seriam emitidos sem
  efetivamente escrever (`--dry-run`).

## Execução

Rodar:

```bash
node lib/learn/scoring-parser.mjs --verbose
```

Para auditoria sem escrever:

```bash
node lib/learn/scoring-parser.mjs --verbose --dry-run
```

Para forçar re-processar mesmo com tracker inalterado (útil em debug
quando inference-rules.yml mudou):

```bash
node lib/learn/scoring-parser.mjs --verbose --force
```

## Outputs

- `data/learn/scoring-events.jsonl` (append-only, gitignored)
- `data/learn/parser-warnings.log` (gitignored) — pares órfãos,
  status desconhecido, scores ausentes
- `data/learn/.parser-state.json` — hash do tracker + chaves já
  processadas (idempotência)

## O que reportar ao usuário

Após rodar:

1. Quantos eventos novos foram emitidos
2. Quantos warnings (e tipos: orphan_tracker_row, missing_predicted_score, unknown_status)
3. Total acumulado em `scoring-events.jsonl`
4. Sugestão de próximo passo:
   - Se `total ≥ 5` desde último reflect → sugerir `/career-ops reflect`
   - Se `warnings > 0` → mostrar `data/learn/parser-warnings.log`
