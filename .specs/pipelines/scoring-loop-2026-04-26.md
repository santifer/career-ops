# Scoring Loop — Spec Implementado

**Data:** 2026-04-26
**Source:** Sessão `f3191274-a605-4379-9139-5bad209c2c14` (Phase 2 + Phase 3 Reflexion)
**Branch:** `codex/career-ops-cockpit`
**Status:** IMPLEMENTED

## Objetivo

Fechar o ciclo de aprendizado do Career-Ops:

```
predição (report) → outcome real (tracker) → diff memorizado → próxima predição calibrada
```

Os 4 outros loops (recruiter-lens, archetype, CV variation, scan) ficam como
backlog. A infraestrutura criada aqui (parser passivo, formato de calibração,
modos reflect/correct/learn-now, schema multi-loop com `loop_type`) é
compartilhada e reutilizável.

## Phases ajustadas pela Reflexion

### Phase 2.0 — Inference rules + calibração baseline (Reflexion gap #3 + #5)

- `lib/learn/inference-rules.yml` — regras explícitas de status canônico → outcome
  - `Interview`/`Offer` → positive
  - `Rejected` → negative
  - `SKIP`/`Discarded` → neutral_excluded
  - `Evaluated` >14d sem mudança → inferred_negative (low_confidence)
  - `Applied` >30d sem mudança → inferred_negative (low_confidence)
- `data/scoring-calibration.yml` — calibrações versionadas via Git (User layer mas committed)
  - Schema: `id, loop_type, archetype, dimension, adjustment, reason, sample_size, confidence, created, active`

### Phase 2.1 — `data/learn/` setup

- `.gitignore` ignora `data/learn/*` exceto `.gitkeep`
- `data/learn/scoring-events.jsonl` boilerplate vazio
- `data/scoring-calibration.yml` NÃO ignorado (versionado)

### Phase 2.2 — Parser idempotente (Reflexion gap #1 + #2 + #6)

- `lib/learn/scoring-parser.mjs`
  - **Idempotente** via SHA-256 do tracker em `.parser-state.json`. Se hash igual → skip.
  - **Delta-based** via `processed_keys = {report_id|status|date}`.
  - **Schema genérico** com `loop_type: "scoring"` reservado para futuros loops.
  - **Warnings de pares órfãos** em `data/learn/parser-warnings.log`
    (orphan_tracker_row, missing_predicted_score, unknown_status, unreadable_report).
  - **Fallback de score**: tracker score se report header não casar regex.
  - **Stale detection**: `Evaluated >14d` e `Applied >30d` viram inferred_negative.
- `modes/learn-now.md` — trigger explícito separado.

### Phase 2.3 — `/career-ops reflect` com quórum (Reflexion gap #4)

- `lib/learn/reflect-analyzer.mjs`
  - Heurística simples: agrupa por `(archetype × bucket de score)` onde
    bucket = `high` (≥4.0) | `mid` (3.0-3.9) | `low` (<3.0)
  - Hit rate = `positive / (positive + negative + inferred_negative)`
  - Propõe `-0.3 a -0.5` se bucket=high e hit rate <30%
  - Propõe `+0.3 a +0.5` se bucket=low e hit rate >60%
  - **Quórum**: ≥5 novos eventos desde último reflect. `--force` ignora.
- `modes/reflect.md` — instrução pra Claude rodar analyzer + AskUserQuestion
  por proposta + commit Git separado por aprovação + memorize em
  `~/.claude/projects/D--Career-Ops/memory/scoring-learnings.md`.

### Phase 2.4 — Hook em `modes/oferta.md`

- Passo 0.5 lê `data/scoring-calibration.yml`, filtra por archetype detectado.
- Header do report ganha `**Calibrações ativas:** N`.
- Calibração é dica pro LLM, não fórmula matemática.

### Phase 2.5 — Override manual

- `lib/learn/correct.mjs` — CLI `node lib/learn/correct.mjs <report_id> <outcome> [reason]`
  - Valida `outcome ∈ {positive, negative, neutral_excluded, inferred_negative}`
  - Append em JSONL com `outcome_source: "manual"` + `outcome_correction.previous`
  - NÃO altera tracker (separation of concerns)
- `modes/correct.md` — instrução pra rodar e reportar.

## Tests

26 testes em `lib/learn/*.test.mjs` cobrindo:

- `parseScore`, `parseTracker`, `parseReportHeader` (3 formatos), `extractReportIdFromCell`
- `inferOutcome` com `stale_after_days`
- `runParser` idempotência + schema multi-loop
- `bucketScore`, `analyze` (high/low buckets, quórum, neutral_excluded ignored)
- `runAnalyzer` quorum_pending vs --force
- `findTrackerRow`, `findLastEventForReport`
- `runCorrect` (invalid outcome, unknown report_id, chaining com previous)

Rodar: `npm run test:learn`

## Métricas de sucesso

1. ✅ **Cobertura de captura**: parser emite evento por linha aplicável do tracker
   (medido com `--verbose` no primeiro run).
2. ✅ **Calibração efetiva**: analyzer propõe ajuste com quórum ≥5 + sample
   size ≥5 por grupo.
3. ⏳ **Drift de scoring**: validar comparando scores médios em archetypes
   calibrados vs não — só após calibração ativa por algumas semanas.
4. ✅ **Sinal humano com 1 click**: `AskUserQuestion` em `modes/reflect.md`.
5. ✅ **Warnings <10% dos eventos**: medido por warning count vs new_events.

## Schema dos eventos

```json
{
  "ts": "2026-04-26T10:00:00Z",
  "loop_type": "scoring",
  "report_id": "127",
  "company": "Acme",
  "role": "Controller LATAM",
  "predicted_score": 4.2,
  "archetype": "Controller LATAM",
  "real_outcome": "positive",
  "outcome_source": "inferred",
  "outcome_correction": null,
  "signals": {
    "tracker_status": "Interview",
    "tracker_date": "2026-04-26",
    "days_since_status": 0,
    "legitimacy": "Alta Confianca",
    "confidence": "high",
    "inference_reason": "..."
  },
  "status_at_inference": "Interview"
}
```

## Comandos

```bash
# Disparo manual do parser passivo
node lib/learn/scoring-parser.mjs --verbose

# Audit sem escrever
node lib/learn/scoring-parser.mjs --verbose --dry-run

# Forçar reprocessamento (tracker hash bypass)
node lib/learn/scoring-parser.mjs --verbose --force

# Análise com quórum
node lib/learn/reflect-analyzer.mjs

# Análise sem quórum (debug)
node lib/learn/reflect-analyzer.mjs --force

# Janela de tempo
node lib/learn/reflect-analyzer.mjs --window 7

# Override manual
node lib/learn/correct.mjs 032 positive "Got interview confirmation"

# Tests
npm run test:learn
```

## Backlog (não implementado neste MVP)

- Rotação anual em `scoring-events-{ano}.jsonl`
- Loops 2-5 (recruiter-lens, archetype, CV variation, scan)
- Dashboard visual no cockpit Go com hit rate por archetype

## Fixes pós-Reflexion (commit ?)

Após Reflexion crítica, foram aplicados 4 fixes adicionais:

- **C1**: Hook de calibração estendido para `batch/batch-prompt.md` (workers
  `claude -p` self-contained), `modes/de/angebot.md` (Schritt 0.5),
  `modes/fr/offre.md` (Étape 0.5). Auto-pipeline herda automaticamente
  pois delega a `modes/oferta.md`. (`modes/ja/` nunca foi criado.)
- **M1**: `lib/learn/reflect-analyzer.mjs` ganhou `analyzeSignals()` que
  detecta padrões em `(archetype × signals.key=value)` vs baseline do
  archetype. Propõe `dimension: signals.X=Y` quando delta ≥30pp e
  sample ≥5. Denylist de metadados internos (`tracker_status`,
  `days_since_status`, etc.) impede ruído.
- **M2**: Snippet bash multi-line em `modes/reflect.md` Passo 6 substituído
  por `node lib/learn/save-reflect-state.mjs` (helper portable).
- **M3**: Guard explícito de `loop_type` em `correct.mjs` (`findLastEventForReport`
  ignora eventos de outros loops). Eventos legados sem `loop_type` são
  tratados como `scoring` para backward-compat. 3 testes novos.
