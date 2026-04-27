# Modo: correct — Override manual de outcome

Permite registrar um `real_outcome` confirmado pelo usuário quando o
status no tracker não reflete o que aconteceu na vida real.

## Quando usar

- Empresa rejeitou por email mas o tracker ainda está como `Applied`.
- Você foi para entrevista mas esqueceu de mudar o status.
- O parser inferiu `inferred_negative` mas o processo está só lento.
- Você quer testar como uma proposta de calibração reagiria a um
  outcome simulado (mesmo que ainda não tenha acontecido — use com
  parcimônia, marca `outcome_source: manual` no JSONL).

## Sintaxe

```
/career-ops correct <report_id> <outcome> [reason]
```

- `report_id`: número do report (ex.: `032`, `7`, `127`).
- `outcome`: um de `positive`, `negative`, `neutral_excluded`, `inferred_negative`.
- `reason`: opcional, frase livre que vira nota no evento.

## Mapeamento sugerido (status canônico → outcome)

| Status real | Outcome a usar |
|---|---|
| Interview marcada | `positive` |
| Offer recebida | `positive` |
| Rejeição direta da empresa | `negative` |
| Você desistiu (sem fit cultural) | `neutral_excluded` |
| Vaga fechada / repostada | `neutral_excluded` |
| Sem resposta há semanas mas talvez não desistiu | `inferred_negative` |

## Execução

Rodar:

```bash
node lib/learn/correct.mjs <report_id> <outcome> "<reason>"
```

Exemplo:

```bash
node lib/learn/correct.mjs 032 positive "Recebi convite pra entrevista por email hoje"
```

## O que reportar ao usuário

Após executar:

1. Confirmar a correção registrada (report_id, outcome, reason).
2. Se houver `previous_outcome` (já existia evento antes), mostrar
   o diff: "antes: inferred_negative (inferred), agora: positive (manual)".
3. Sugerir: "Rode `/career-ops reflect` quando tiver ≥5 correções
   manuais para ver se elas mudam alguma calibração".

## O que este comando NÃO faz

- **Não muda `data/applications.md`.** Se você quer também atualizar o
  status no tracker (ex.: virar `Interview`), faça via
  `/career-ops tracker` ou edite manualmente. Override manual só vive
  no `scoring-events.jsonl`.
- **Não dispara o reflect automaticamente.** O reflect tem quórum
  próprio. Override é registro, não trigger.
- **Não permite outcomes inválidos.** Se digitar errado, o script
  retorna erro com a lista de válidos.
