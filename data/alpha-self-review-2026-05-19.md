# α ALPHA Self-Review — 2026-05-19

Adversarial review of the four-commit overnight haul (SHA `14021db`).
Reviewer: ALPHA (apply-pack-polish adversarial mode).

---

## Findings

### BLOCKER — dashboard/index.html:38654 + 38682 — regex typo silences row validation

**File:line:** `dashboard/index.html:38654`, `dashboard/index.html:38682`

**Current behavior (pre-fix):** Both `alphaPolishPack` and `alphaIntelRefresh` guard on
`!/^d+$/.test(rowId)`. The regex `/^d+$/` has no backslash — it matches the literal letter
`d` one-or-more times. Any numeric `rowId` like `"044"` passes the test (doesn't match `d+`),
so the guard never fires. But `"ddd"` would silently be accepted as a valid row number, sent
to the server, and produce a confusing "pack not found" error with no client-side feedback.

**What breaks:** Any non-numeric string silently reaches the API instead of being rejected
with a user-visible toast. The intended guard is completely non-functional.

**Fix shipped:** Changed to `!/^\d+$/` (escape added) in both functions.

---

### BLOCKER — scripts/agents/apply-pack-polish.mjs:418 — multi-line stdout JSON shreds SSE stream

**File:line:** `scripts/agents/apply-pack-polish.mjs:418`

**Current behavior (pre-fix):**
```js
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
```
`_alphaSpawn` redirects both stdout and stderr to the same log file (`stdio: ['ignore', fd, fd]`).
`_alphaSSEStream` splits the log on `'\n'` and emits each line as a separate
`event: progress\ndata: <line>\n\n` SSE frame. `JSON.stringify(out, null, 2)` produces
~60–80 lines of pretty-printed JSON. Each line is emitted as its own SSE frame. The client
handler calls `JSON.parse(ev.data)` on each frame — every frame is a JSON fragment, so
`JSON.parse` throws and the `catch (_) {}` silently discards it. **The final orchestrator
summary is never delivered to the client popout panel.**

**What breaks:** Dashboard job popout shows progress events but never receives the final
`{ final_recommendation, total_cost_usd, coherence }` payload. The `phase-3 / coherence-done`
sentinel used to auto-close the EventSource is also lost, so the SSE connection leaks open
until the 20-minute timeout.

**Fix shipped:** Changed to `JSON.stringify(out)` (single line). The final summary now
lands as one NDJSON line, parseable by the client, and the `coherence-done` sentinel closes
the stream correctly.

---

### MAJOR — lib/polish-signals.mjs:167 — confidence denominator inflated by errored models

**File:line:** `lib/polish-signals.mjs:167`

**Current behavior (pre-fix):**
```js
out.confidence_per_signal[k] = Math.min(1, count / Math.max(councilResults.length, 1));
```
`councilResults.length` is the total lineup size (7 models). Models that error or return
unparseable JSON are skipped in the tally loop but still count in the denominator.
If `xai:grok-4-x-search` requires a permission not in the account and 2 other models
timeout, only 4 models contribute signal. A claim seen by all 4 gets confidence `4/7 = 0.57`
instead of `4/4 = 1.0`. The dealbreaker layer treats sub-0.6 claims as suspect and prunes
them aggressively — so a unanimous signal from all functional models gets pruned because the
denominator includes broken models.

**What breaks:** Dealbreaker prunes valid, convergent signals. Downstream polish receives a
weaker signal set. The worst case is a full grok-4-x-search + sonar-deep failure where only
5 Anthropic/OpenAI/Google models respond — every signal scores ≤5/7 = 0.71 and gets flagged.

**Fix shipped:** Compute `denominator` from `councilResults.filter(r => r && !r.error && r.content && extractJson(r.content)).length` — only models that contributed parseable JSON count.

---

### MAJOR — lib/polish-coherence.mjs:82–91 — voice fidelity gate completely non-functional

**File:line:** `lib/polish-coherence.mjs:82–91`

**Current behavior (pre-fix):** `callVoiceFidelity` shells out to:
```
node calibrate-voice-fidelity.mjs --slug <packSlug> --json
```
`calibrate-voice-fidelity.mjs` is a whole-CV calibrator — it does not accept `--slug` or
`--json`. These flags are silently ignored. The script produces no per-pack output, stdout
is empty, `parseJsonTail` returns `null`, and the fallback reads:
```js
readFileSafe(join(ROOT, 'apply-pack', packSlug, 'voice-fidelity.md'))
```
No such file exists anywhere in the codebase. Result: `callVoiceFidelity` always returns
`{ ok: false, pct: null }`. In `checkPackCoherence`, `voiceOK` evaluates as:
```js
!voice.ok || voice.pct === null   // → true always
```
**The voice fidelity gate never blocks anything, regardless of actual fidelity.**

**Fix shipped:** Removed the `--slug`/`--json` flags. The script is run without unknown
arguments (calibrates against cv.md globally), and the rolling-latest JSON it always writes
to `data/voice-fidelity-calibration.json` is read for the fidelity score. Falls back to
scanning the pack's `polish-trace-cv-tailored.md` for a fidelity line.

Note: this gate now reports a global cv.md voice score, not a per-artifact score. That is
still a meaningful signal (the artifact was generated from cv.md). A true per-artifact
voice check requires future work — flagged in NEEDS_HUMAN below.

---

### MINOR — lib/polish-loop.mjs:282–284 — cost cap can be exceeded by one full round

**File:line:** `lib/polish-loop.mjs:282–284`

**Current behavior:** Cost cap is checked at the START of each inner round. One full round
costs up to ~$16 (3 Haiku critics + Sonnet author + Opus adjudicator + Sonar-deep adversarial
+ Opus adversarial). If `totalCost = $119` and cap = `$120`, the check passes, the round
runs, and `totalCost` reaches $135. Maximum overshoot per artifact: ~$16.

Across 6 artifacts with `max(10, …)` floor on the per-artifact allocation, the total
overshoot bound is 6 × $16 = $96 above the $500 pack cap in a pathological non-convergence
scenario. Real-world impact is lower because models cost less than the ceiling estimate, but
the $500 cap is not hard.

**Fix suggestion (NEEDS_HUMAN — architectural):** Add a mid-round check before ROUND 4
(adversarial, the most expensive step). The adversarial sweep is `perplexity:sonar-deep-research`
+ Opus — alone worth ~$13. Skipping it when `totalCost > costCap * 0.95` would cut the
overshoot to ~$3. Example guard to add before the adversarial `callCouncil`:

```js
if (totalCost >= costCap * 0.95) {
  trace.push(`## Round ${rounds} — adversarial skipped (cost near cap: $${totalCost.toFixed(2)})`);
  // skip the callCouncil block
}
```

Not shipping tonight — requires restructuring the adversarial block. Flagged for Mitchell.

---

### MINOR — lib/polish-signals.mjs:44–52 — hardcoded `xai:grok-4-x-search` requires special permissions

**File:line:** `lib/polish-signals.mjs:44–52`

`FULL_LINEUP` includes `xai:grok-4-x-search`. If this model requires a separate XAI
search permission not in the account, `callCouncil` will return `r.error` for it.
With the confidence denominator fix (above) now applied, the failure degrades gracefully —
the model simply doesn't contribute. Signal quality drops from 7-model to 6-model quorum.

**Current behavior post-fix:** Graceful degradation — no crash, confidence scores are
accurate for the models that respond.

**Residual risk:** If both grok variants and sonar-deep all fail simultaneously (network
partition or rate-limit storm), Phase 1 runs on 4 models only. The dealbreaker may still
prune too aggressively if 2 of those 4 models produce unparseable JSON. The lineup should
have a fallback model substitution, but that's an architectural change.

No immediate fix — acceptable risk for an opt-in phase. Flag for future lineup health check.

---

### MINOR — scripts/process-all-pipeline.mjs:162 — phasePolish only targets `Evaluated` rows

**File:line:** `scripts/process-all-pipeline.mjs:162`

```js
const ranked = (apq.ranked || []).filter(r => r && r.num && r.status === 'Evaluated').slice(0, 5);
```

`Applied` and `Interview` rows also benefit from polish (especially before interview prep).
A row that moved to `Applied` without polish will never be polished by the automated stage.

**Not a runtime bug** — it's a design tightness issue. No fix tonight; flagged for Mitchell.

---

### NIT — scripts/agents/apply-pack-polish.mjs — critic-score stability check skipped on round 2

**File:line:** `lib/polish-loop.mjs:407–419`

The secondary convergence path (`confidenceOK && advPasses && rounds >= 2`) fires on round 2
without requiring score stability between rounds 1 and 2. Intentional per the comment, but
means a single high-scoring round pair converges even if critics moved significantly. Acceptable
given the outer-retry safety net. No fix.

---

### NIT — lib/polish-signals.mjs:203–204 — alt hm-intel path construction is redundant

**File:line:** `lib/polish-signals.mjs:203–204`

```js
const hmIntelAltPath = join(ROOT, 'data', 'hm-intel',
  `${roleSlug.startsWith(companySlug) ? roleSlug : companySlug + '-' + roleSlug}.json`);
```

The condition `roleSlug.startsWith(companySlug)` will never be true in practice (role slugs
don't start with company slugs). The alt path always resolves to `companySlug-roleSlug.json`,
which is the same as `hmIntelPath`. Dead code, harmless. No fix tonight.

---

## Anti-drift escape (NEEDS_HUMAN — no automated fix possible)

**Pattern:** A Haiku critic can propose a rewrite with a `citation` field of `"cv.md:15"`.
Neither the Sonnet author nor the Opus adjudicator mechanically reads cv.md line 15 to verify
the rewrite accurately reflects it. A sufficiently confident paraphrase that drifts from the
original passes because the LLMs trust the citation string without lookup.

**Impact:** A polished artifact could contain a plausible-but-uncited claim that cleared the
Zod schema (citation string present) and the adjudicator (no obvious red flag) but diverged
from cv.md source material. The downstream claim-consistency check would catch it only if it
emits a numeric claim that doesn't appear verbatim in cv.md.

**Fix direction:** Add a lightweight deterministic citation verifier: extract the line range
from `"cv.md:NN"`, read that line from cv.md, and check that the key noun phrases in the
rewrite appear in that line. This requires ~50 lines of Node.js in the author prompt builder.
No architecture change needed. Mitchell's call on priority.

---

## SSE format vs NDJSON — verdict: correct by design, one bug fixed

`emitProgress()` writes single-line NDJSON to stderr. `_alphaSpawn` routes both stdout and
stderr to the log file. `_alphaSSEStream` splits on `\n` and emits each line as
`event: progress\ndata: <line>`. The client's `es.addEventListener('progress', ...)` calls
`JSON.parse(ev.data)`. This chain is correct for the stderr NDJSON lines. The only break was
the pretty-printed final summary on stdout — fixed above.

---

## Preflight Gate 6 edge cases

- **Malformed `polish-summary.json`:** `checkPolishSummary` wraps the parse in `try/catch` and
  returns `{ level: 'yellow', detail: 'polish-summary parse error: ...' }`. The pack gets a
  yellow gate (NEEDS_HUMAN), not a red one. Acceptable — Mitchell can re-run polish.
- **`POLISH_PACK_ENABLED=1` + shell-out timeout:** `shellOk` has a `timeout: 120_000` ms cap.
  If polish takes >2 minutes, the coherence sub-checks time out. `shellOk` returns
  `{ ok: false, stdout: '', stderr: 'ETIMEDOUT' }`. `callClaimConsistency` returns
  `{ ok: false, pct: null }`. In `checkPackCoherence`, `claimOK = !claim.ok = true` — so a
  timeout silently passes the claim gate. This is the same pattern as the voice fidelity gate
  before the fix. Not fixing tonight — the 120s timeout is generous for claim-consistency.
  Flag as MINOR for a future pass.

---

## Race condition — phasePolish vs. other pipeline phases

`phasePolish` is called serially in `process-all-pipeline.mjs` between `phaseMergeTracker`
and `phaseRebuild`. The `runScript` wrapper uses `spawnSync`-style sequential execution.
`apply-pack-polish.mjs` itself is synchronous-at-the-phase level (each artifact polished
in sequence, each inner round awaited). No subprocess overlap with the pipeline's own phases.
The polish agent's `onSignalsRefresh` callback spawns an additional `harvestPolishSignals`
call but this is an in-process async call, not a child process. No race condition.

---

## Shipped tonight

| # | File | Change |
|---|------|--------|
| 1 | `dashboard/index.html:38654` | `/^d+$/` → `/^\d+$/` — polishPack row guard |
| 2 | `dashboard/index.html:38682` | `/^d+$/` → `/^\d+$/` — intelRefresh row guard |
| 3 | `scripts/agents/apply-pack-polish.mjs:418` | `JSON.stringify(out, null, 2)` → `JSON.stringify(out)` — single-line final summary for SSE |
| 4 | `lib/polish-signals.mjs:153–170` | Confidence denominator now counts successful parses only |
| 5 | `lib/polish-coherence.mjs:81–95` | Voice fidelity gate rewritten — correct script invocation + correct fallback path |

---

## NEEDS_HUMAN

| Item | Why human judgment required |
|------|----------------------------|
| Cost cap mid-round enforcement (MINOR) | Requires restructuring the adversarial block in polish-loop.mjs |
| Anti-drift citation verifier | New feature, not a bug fix — Mitchell decides priority |
| Voice fidelity: per-artifact vs. global | True per-artifact fidelity requires a new script or refactor of calibrate-voice-fidelity.mjs |
| phasePolish row-status filter | Design decision: should Applied/Interview rows get polished automatically? |
| Gate 6 sub-check timeout silent pass | Low risk but worth tracking for a future hardening pass |

---

*Generated by ALPHA adversarial reviewer · 2026-05-19 · SHA `14021db` + fixes.*
