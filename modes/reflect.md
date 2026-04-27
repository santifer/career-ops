# Modo: reflect — Reflexion semanal sobre scoring loop

Loop de aprendizado: lê eventos capturados pelo `scoring-parser.mjs`,
identifica padrões onde o score predito divergiu do outcome real, e
propõe ajustes em `data/scoring-calibration.yml` que serão aplicados
nas próximas avaliações.

## Como funciona (passo a passo executável)

### 1. Garantir que eventos estão atualizados

Antes de refletir, rodar o parser passivo para capturar quaisquer
mudanças recentes no tracker:

```bash
node lib/learn/scoring-parser.mjs --verbose
```

### 2. Decidir modo: quick (default) ou force

Detectar argumentos do usuário em `{{mode}}`:

- Sem argumento ou `quick` → quick mode (default). Quórum mínimo:
  ≥5 eventos novos desde último reflect.
- `--force` ou `force` → ignora quórum.

### 3. Rodar analisador

```bash
node lib/learn/reflect-analyzer.mjs                # quick
node lib/learn/reflect-analyzer.mjs --force        # force
```

O analisador retorna JSON com `quorum_met`, `proposals`, `groups`.

### 4. Avaliar quórum

- Se `quorum_met = false` → mostrar ao usuário:
  > "Sem dados novos suficientes ({new_events}/{quorum_required}).
  > Acumule mais outcomes ou rode `/career-ops reflect force`."
  E parar.

- Se `quorum_met = true` mas `proposals = []` → mostrar:
  > "Calibração não precisa ajuste. {events_in_window} eventos
  > analisados, todos os grupos dentro do hit rate esperado."
  E parar.

- Se `quorum_met = true` e há propostas → seguir passo 5.

### 5. Loop de aprovação (uma proposta por vez)

Para cada proposta no array `proposals`:

1. Mostrar ao usuário:
   - **Archetype**: proposal.archetype
   - **Dimensão**: proposal.dimension
   - **Ajuste sugerido**: proposal.adjustment (sinal e magnitude)
   - **Por quê**: proposal.reason
   - **Amostra**: proposal.sample_size eventos, confidence={proposal.confidence}
   - **Exemplos**: proposal.examples (até 3)

2. Disparar **AskUserQuestion** com:
   - header: "Calibração"
   - question: "Aplicar ajuste {adjustment} em {archetype} / {dimension}?"
   - options:
     - "Aplicar (Recomendado)" → aprova
     - "Aplicar com ajuste menor (½)" → aprova com magnitude reduzida
     - "Rejeitar — não calibrar agora" → rejeita
     - "Suspender este grupo (não propor mais até N novos eventos)" → suspende

3. Se aprovado:
   - Adicionar entrada nova em `data/scoring-calibration.yml`
     com schema completo (id único, loop_type:scoring, archetype,
     dimension, adjustment, reason, sample_size, confidence,
     created=hoje, active=true).
   - **Commit Git separado** com mensagem:
     `feat(learn): adjust {archetype}/{dimension} ({adjustment}) — sample_size={N}`
   - Memorizar em `~/.claude/projects/D--Career-Ops/memory/scoring-learnings.md`
     adicionando linha no índice MEMORY.md se ainda não existe.

4. Se rejeitado:
   - Não fazer nada. Não escrever no calibration.yml.
   - Logar a rejeição em comentário no commit do próximo aprovado
     (ou ignorar se nenhum aprovado).

### 6. Atualizar state do reflect

Após processar todas as propostas (aprovadas ou rejeitadas):

```bash
node -e "
import('./lib/learn/reflect-analyzer.mjs').then(async ({ saveReflectState }) => {
  const total = (await import('node:fs/promises')).readFile('data/learn/scoring-events.jsonl', 'utf8').then(t => t.split('\n').filter(Boolean).length);
  await saveReflectState('data/learn/.reflect-state.json', { last_reflect: new Date().toISOString(), last_event_count: await total });
})"
```

(Ou implementar passo equivalente em script — a chave é gravar
`{ last_reflect, last_event_count }` em `data/learn/.reflect-state.json`
para o próximo quórum funcionar.)

### 7. Sumário final ao usuário

Imprimir:

- N propostas avaliadas (X aprovadas, Y rejeitadas, Z suspensas)
- Calibrações ativas totais em `data/scoring-calibration.yml`
- Próxima ação recomendada (ex.: "rode `/career-ops oferta` na
  próxima vaga pra ver as calibrações ativas no header")

## Princípios

1. **Aprovação humana sempre.** Nunca aplicar ajuste sem `AskUserQuestion`.
2. **Uma proposta por vez.** Não bombardear o usuário com 10 perguntas
   simultâneas — uma por vez, na ordem do array `proposals`.
3. **Reason legível.** O texto em `proposal.reason` precisa ser uma
   frase que o usuário entende em 5 segundos.
4. **Commits atômicos.** Cada calibração aprovada vira 1 commit. Isso
   permite `git revert` cirúrgico se piorar.
5. **Quórum protege contra overfitting.** Sample <5 não vira ajuste.
   Mesmo com `--force`, o analisador respeita `QUORUM_MIN` interno
   por grupo.

## Arquivos lidos/escritos

| Arquivo | Operação |
|---------|----------|
| `data/learn/scoring-events.jsonl` | Read |
| `data/learn/.reflect-state.json` | Read/Write |
| `data/scoring-calibration.yml` | Read/Write (com commit) |
| `~/.claude/projects/D--Career-Ops/memory/scoring-learnings.md` | Append |
| `~/.claude/projects/D--Career-Ops/memory/MEMORY.md` | Append (se nova entrada) |
