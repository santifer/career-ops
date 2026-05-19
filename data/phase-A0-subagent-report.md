# Phase A.0 Sub-Agent Report — Timeout Hardening Sweep

**Date:** 2026-05-19
**Agent:** Phase A.0 timeout-hardening sub-agent
**Scope:** harden remaining unguarded `fetch()` calls in agent + lib files per orchestrator brief

## Summary

- **Total fetch sites hardened in this pass: 6**
- **Files modified: 6**
- **Files audited but already hardened (no edits needed): 6**
- **NEEDS_HUMAN flags: 0**

All edits pass `node --check`.

## Files Hardened (this pass)

### 1. `scripts/agents/interview-scorer.mjs:58`
- Wrapped `fetch('https://api.anthropic.com/v1/messages', ...)` in `callSonnet()` with `signal: AbortSignal.timeout(120_000)`
- Added timeout-aware try/catch — `TimeoutError`/`AbortError` throws clear "120s timeout — slow upstream. Not retrying." message
- Tier: LLM API (Anthropic Sonnet) → 120s

### 2. `scripts/agents/network-draft-intro.mjs:185`
- Wrapped `fetch('https://api.anthropic.com/v1/messages', ...)` in `callSonnet()` with `signal: AbortSignal.timeout(120_000)`
- Added timeout-aware try/catch
- Tier: LLM API (Anthropic Sonnet) → 120s

### 3. `scripts/agents/interview-curator.mjs:111`
- Wrapped `fetch('https://api.anthropic.com/v1/messages', ...)` in `callSonnet()` with `signal: AbortSignal.timeout(120_000)`
- Added timeout-aware try/catch
- Tier: LLM API (Anthropic Sonnet) → 120s

### 4. `scripts/agents/network-emailer.mjs:151`
- Added `signal: AbortSignal.timeout(30_000)` to Hunter.io API fetch in `hunterFind()`
- Extended existing catch block with timeout-specific log message; returns `null` gracefully (matches existing semantics — Hunter is best-effort, missing email is non-fatal)
- Tier: third-party API (Hunter.io) → 30s

### 5. `scripts/agents/builder-log.mjs:294`
- Added `signal: AbortSignal.timeout(120_000)` to Anthropic Sonnet fetch in LLM-tag fn
- Extended existing catch block with timeout-specific console.error; returns `null` gracefully (matches existing semantics — tag inference is best-effort)
- Tier: LLM API (Anthropic Sonnet) → 120s

### 6. `lib/wealth-lens.mjs:184, 364` (two sites in one file)
- Both sites are inline `client.call` lambdas calling Anthropic Haiku
- Added `signal: AbortSignal.timeout(120_000)` to each fetch
- Added timeout-aware try/catch inside each lambda — re-throws a clear "Haiku TIMEOUT — Not retrying" error which the outer `try { ... } catch { /* fall through to deterministic */ }` already handles gracefully
- Tier: LLM API (Anthropic Haiku) → 120s

## Files Audited — Already Hardened (no edits needed)

### `scripts/agents/form-fields.mjs:211`
- Already has `signal: AbortSignal.timeout(90_000)` on the Anthropic Haiku fetch in `callHaikuOrFallback()`
- Already wrapped in try/catch with fall-through to council.mjs `openai:gpt-5` fallback path
- **Status:** SAFE — no changes needed

### `scripts/agents/pipeline-health-check.mjs:60`
- Already uses `AbortController` + `setTimeout(() => ctrl.abort(), 6000)` pattern with `signal: ctrl.signal`
- Already wrapped in try/catch that returns `{ ok: false, error: err.message }` gracefully
- **Status:** SAFE — no changes needed (6s is appropriate for internal dashboard API)

### `scripts/agents/detector-health-check.mjs:95, 114, 133`
- All three detector fetches (GPTZero, Originality.ai, Pangram) already have `signal: AbortSignal.timeout(30_000)`
- All three wrapped in try/catch returning `{ skipped: false, prob: null, error: e.message }`
- **Status:** SAFE — no changes needed

### `lib/eval-intel-gather.mjs:58, 120`
- Line 58: `fetchJD()` uses `AbortController` + `setTimeout(() => ctrl.abort(), timeoutMs)` (default 15s) with `signal: ctrl.signal`
- Line 120: Grok API fetch uses `AbortController` + 45s timeout with `signal: ctrl.signal`
- Both wrapped in try/catch returning graceful empty/error result
- **Status:** SAFE — no changes needed

### `lib/resolve-ats-url.mjs:341, 353, 366`
- All three ATS board-API fetches (Greenhouse, Ashby, Lever) already have `signal: AbortSignal.timeout(10_000)`
- All wrapped in try/catch returning `null` gracefully
- **Status:** SAFE — no changes needed

### `lib/liveness.mjs:72`
- All three fetches (Greenhouse API, Ashby API, generic fallback) already have `signal: AbortSignal.timeout(8000)`
- All wrapped in try/catch returning structured `{ result: 'expired'|'uncertain'|... }` results
- **Status:** SAFE — no changes needed

### `lib/ai-detection-gate.mjs:98, 178, 235`
- All three detector fetches (GPTZero, Originality.ai, Pangram) already have `signal: AbortSignal.timeout(30_000)`
- **Status:** SAFE — no changes needed (this is the production detection gate — was hardened earlier)

### `lib/eval-council.mjs:255`
- `callAnthropic()` already uses `AbortController` + 120s timeout via `ctrl.signal`
- Already wrapped in `withRetryBackoff()` + circuit breaker pattern
- **Status:** SAFE — no changes needed

## NEEDS_HUMAN flags

None. Every fetch site flagged in the brief has either been hardened in this pass or was already hardened in a prior sweep.

## Verification

All 6 modified files passed `node --check`:
- `scripts/agents/interview-scorer.mjs`
- `scripts/agents/network-draft-intro.mjs`
- `scripts/agents/interview-curator.mjs`
- `scripts/agents/network-emailer.mjs`
- `scripts/agents/builder-log.mjs`
- `lib/wealth-lens.mjs`

## Pattern applied

For functions WITHOUT an `opts` parameter (the standalone helpers), the conservative pattern was:

```js
let res;
try {
  res = await fetch(URL, {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // Phase A.0 hardening — LLM API timeout
  });
} catch (e) {
  if (e.name === 'TimeoutError' || e.name === 'AbortError') {
    throw new Error('Anthropic API timeout after 120s — slow upstream. Not retrying.');
  }
  throw e;
}
```

Where the surrounding function already had a try/catch that returned a graceful fallback (network-emailer, builder-log, wealth-lens), the timeout-specific branch was added inline and the existing graceful return was preserved.

Tier mapping used:
- LLM APIs (Anthropic Sonnet/Haiku): 120_000 (2 min)
- Third-party API (Hunter.io): 30_000 (30 sec)

No custom HTTP clients without AbortSignal support were encountered — all six target sites used native `fetch()`.

## Handoff

Orchestrator should commit all six files as part of the Phase A.0 sweep:

```
git add scripts/agents/interview-scorer.mjs \
        scripts/agents/network-draft-intro.mjs \
        scripts/agents/interview-curator.mjs \
        scripts/agents/network-emailer.mjs \
        scripts/agents/builder-log.mjs \
        lib/wealth-lens.mjs
```
