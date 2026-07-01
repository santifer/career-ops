# Golden-set eval for cheap-model routing (#1354)

> **Status: scaffolding.** The *mechanism* (`eval-golden.mjs`) is design-invariant
> and runs today. The reference labels and gate thresholds are placeholders pending
> maintainer decisions — see **Open design questions** below.

## What this is

A small labeled golden-set plus a harness that measures how well a *candidate*
cheap model agrees with reference labels, so "is model X good enough to route to?"
becomes a number instead of a hunch. It reuses the `---SCORE_SUMMARY---` contract
that every `*-eval.mjs` already emits (`SCORE` + `ARCHETYPE`), so there is no new
scoring surface.

## Layout

```
evals/
  golden/      labeled cases — one JSON per case (synthetic JDs, no user data)
  fixtures/    recorded candidate outputs for $0 deterministic replay in CI
  README.md    this file
eval-golden.mjs  the harness (root level, sibling to openai-eval.mjs)
```

### Golden case format (`evals/golden/*.json`)

```json
{
  "id": "ai-platform-llmops",
  "synthetic": true,
  "jd": "<full synthetic job description text>",
  "label": { "archetype": "AI Platform / LLMOps", "score": 4.2 }
}
```

All JDs are **synthetic** so the set stays clear of the `no-user-data` guard.

### Fixture format (`evals/fixtures/<case-id>__<model>.txt`)

A recorded candidate-model output containing a `---SCORE_SUMMARY---` block. Only
that block is parsed; surrounding prose is illustrative and trimmed.

## Running

```bash
npm run eval:golden -- --replay --model cheap-stub   # offline, deterministic, $0
npm run eval:golden -- --live   --model gpt-4o-mini  # real call via openai-eval.mjs (needs key + cv.md)
```

Replay is the CI-friendly path: no API keys, no `cv.md`, fully deterministic.
The harness reports per-case archetype/score agreement, mean |Δscore|, median
latency (live only), and a placeholder $/run, then exits `0/1` on the archetype
agreement gate.

## Open design questions (TODO #1354 — need maintainer steer)

These are surfaced as named constants / placeholder data so they are trivial to
tune once decided:

| Question | Where it lives |
|----------|----------------|
| Reference labels: freeze Claude's verdict as ground truth, or hand-curate? | `label` blocks in `golden/*.json` |
| `SCORE` agreement: exact match or a tolerance band (±0.5?)? | `SCORE_TOLERANCE` in `eval-golden.mjs` |
| CI gate threshold for archetype agreement? | `MIN_ARCHETYPE_AGREEMENT` in `eval-golden.mjs` |
| Per-model $/run rates, and how many cases to start (~8–12?) | `COST_PER_RUN_USD` + `golden/` |

Wiring this into the required CI job (`.github/workflows/test.yml`) is intentionally
deferred until the gate threshold is agreed, so a placeholder value can't make `main`
go red.
