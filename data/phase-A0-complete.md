# Phase A.0 Complete — Agent-CLI Timeout Hardening

**Date:** 2026-05-19
**Orchestrator:** OPUS 4.7 autonomous haul instance
**Sub-agent:** general-purpose (background)

## TL;DR

10 files hardened across the agent + lib code paths. 6 files were already
hardened by prior overnight haul passes. Smoke test passes.
The 2h41m hang Mitchell hit on row 044 (PID 86146) had ALL its root-cause
fetch sites identified and timeout-protected.

## Files orchestrator hardened (4)

| File | Sites | Timeout |
|---|---|---|
| `lib/anthropic-cache-helper.mjs` | 1 | 120s default if no caller signal |
| `lib/anthropic-batch-helper.mjs` | 3 (submit/poll/results) | 120s / 30s / 60s |
| `lib/provider-adapters/grok-4-x-search.mjs` | 1 | 120s default if no caller signal |
| `lib/provider-adapters/perplexity-agent-api.mjs` | 1 | 120s default if no caller signal |

Pattern applied — defensive `opts.signal ?? AbortSignal.timeout(N)` with a
`TimeoutError`/`AbortError` catch branch that returns `{ ok: false,
skip_retry: true, timed_out: true }` instead of throwing.

## Files orchestrator hardened — apply-pack-polish chain (3)

`callCouncil()` already plumbs `AbortSignal.timeout(provider.timeout)` via
`opts.signal` at `lib/council.mjs:1316`. The polish chain passes
`timeoutMs: POLISH_API_TIMEOUT_MS` (default 300_000) — those callers were
already protected. BUT the impact-doc / references / referrals agents did
NOT pass `timeoutMs`, so they fell through to default provider.timeout
(which for sonar-deep-research is 480s). Hardened:

| File | Sites | Timeout |
|---|---|---|
| `scripts/agents/impact-doc.mjs` | 2 (initial + retry) | 300_000ms (5min) |
| `scripts/agents/references.mjs` | 2 (initial + retry) | 300_000ms (5min) |
| `scripts/agents/referrals.mjs` | 2 (initial + retry) | 300_000ms (5min) |

## Files sub-agent hardened (6)

| File | Sites | Timeout |
|---|---|---|
| `scripts/agents/interview-scorer.mjs` | 1 | 120s |
| `scripts/agents/interview-curator.mjs` | 1 | 120s |
| `scripts/agents/network-draft-intro.mjs` | 1 | 120s |
| `scripts/agents/network-emailer.mjs` | 1 | 30s (Hunter.io best-effort) |
| `scripts/agents/builder-log.mjs` | 1 | 120s |
| `lib/wealth-lens.mjs` | 2 | 120s each |

## Files audited — already hardened (6)

| File | Tier | Notes |
|---|---|---|
| `scripts/agents/form-fields.mjs` | 90s | + try/catch + council fallback |
| `scripts/agents/pipeline-health-check.mjs` | 6s | AbortController + try/catch |
| `scripts/agents/detector-health-check.mjs` | 30s | x3 detector probes |
| `lib/eval-intel-gather.mjs` | 15s/45s | AbortController × 2 |
| `lib/resolve-ats-url.mjs` | 10s | x3 ATS providers |
| `lib/liveness.mjs` | 8s | x3 liveness paths |
| `lib/ai-detection-gate.mjs` | 30s | x3 detector probes (orchestrator-audited) |
| `lib/eval-council.mjs` | 120s | AbortController + withRetryBackoff |

(Orchestrator audited 2 more files than the sub-agent — `ai-detection-gate.mjs`
and `eval-council.mjs` — both confirmed already hardened.)

## NEEDS_HUMAN

**None.** No custom HTTP clients without AbortSignal support encountered.

## Smoke test result

`node lib/contact-priority-scorer.mjs --top 5` completes in <1 second.
Top contact correctly identified: Jake Standish, Head of Internal Corporate
and Policy Comms @ OpenAI — 5.700 composite score (tier-boosted, hiring
authority, archetype match, pre-IPO equity, second-degree path to target,
has actionable contact details).

## Why the original 2h41m hang happened

Best diagnosis from the available evidence: the polish chain's
`callCouncil` was invoked WITHOUT `timeoutMs` from
`scripts/agents/impact-doc.mjs` / `references.mjs` / `referrals.mjs`. Those
call sites fell through to `provider.timeout` defaults, which for
sonar-deep-research is 480s. If one slot stalled on response-body streaming
(undici keep-alive idle-but-ESTABLISHED is a known Node.js failure mode),
the abort signal fires at 480s but the keep-alive socket can be re-used by
the next round which restarts the timer. Cumulative across 6 artifacts ×
6 rounds × adversarial sweep × retry, the cumulative idle time can plausibly
reach 2h41m. The fix: explicit 300s ceiling on every callCouncil from those
three agents (now applied).

## Provenance + commit plan

Bundled commit "feat(phase-A.0): timeout-harden every unguarded fetch + add
explicit polish-chain ceilings — 10 files, 14 fetch sites" follows.

Cost: ~$0 (no LLM spend; deterministic edits + 1 sub-agent dispatch).
