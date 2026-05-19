# OMEGA execution receipt — 4 proposals shipped

**Date:** 2026-05-19 ~09:55 PT
**Approval reference:** [`data/omega-approvals.md`](omega-approvals.md) (commit `cf43767`)
**Source proposals:** [`data/runbatch-omega-stewardship-2026-05-19.md`](runbatch-omega-stewardship-2026-05-19.md) (commit `d804fee`)
**Approval signal:** Mitchell's "all approved" message in the orchestrator session

---

## Commits shipped (push range: `668a6cd..cec6a3f`, all on origin/main = mitwilli-create)

| # | Proposal | Severity | Commit | Files | Status |
|---|---|---|---|---|---|
| 1 | omega-proposal-4 | ratify + policy | `cf43767` | data/omega-approvals.md (NEW) | SHIPPED |
| 2 | omega-proposal-1 | CRITICAL | `c3888fe` | lib/council.mjs, lib/polish-loop.mjs, lib/polish-signals.mjs | SHIPPED |
| 3 | omega-proposal-2 | HIGH | `3a8ebbf` | dashboard-server.mjs, scripts/build-dashboard.mjs | SHIPPED |
| 4 | omega-proposal-3 | MEDIUM | `cec6a3f` | dashboard-server.mjs | SHIPPED |

Pre-push hook (ε's earlier work, 8acc6cf) ran clean on the push: **0 findings, 0 HIGH**. Push accepted by `mitwilli-create:main`.

---

## Per-proposal: what changed + verification

### omega-proposal-1 (CRITICAL) — polish chain AbortSignal.timeout

**Surprise finding during implementation:** the council already auto-applies `AbortSignal.timeout(provider.timeout)` at [lib/council.mjs:1230](../lib/council.mjs#L1230). The Anthropic providers at lines 948 / 989 / 1026 all accept `opts.signal` correctly. So Opus (180s default) + Sonnet (180s) + Haiku (120s) calls were already timeout-protected.

**Real gap:** the council's per-provider timeout shadows any caller-supplied signal — there was no clean way for polish to request its own (longer) timeout. Fix: extend `callCouncil` to honor an `opts.timeoutMs` override with caller-wins precedence, clamped to [30s, 30min] for defense-in-depth.

**Wired through:**
- [lib/council.mjs](../lib/council.mjs) — added `opts.timeoutMs` override at the `fireOnce()` helper (Number.isFinite + clamp)
- [lib/polish-loop.mjs](../lib/polish-loop.mjs) — added `POLISH_API_TIMEOUT_MS` const (env-overridable, default 300_000 = 5 min, clamped [30s, 30min]); threaded `timeoutMs: POLISH_API_TIMEOUT_MS` into all 4 callCouncil opts (critics × 3 parallel + author + adjudicator + adversarial = 4 sites)
- [lib/polish-signals.mjs](../lib/polish-signals.mjs) — same const + 2 callCouncil sites (council fan-out + dealbreaker single)

**Coverage extended beyond OMEGA's flagged scope:** polish-signals.mjs was not in OMEGA's report but was found via grep. lib/polish-coherence.mjs needs no fix — it shells out via `execSync(..., { timeout: 120_000 })` which is already timeout-protected.

**Verification:**
- `node --check lib/council.mjs lib/polish-loop.mjs lib/polish-signals.mjs` — all clean.
- Smoke test with fake API key + `timeoutMs: 100`: request fired (HTTP 401 in 249ms), override path executes cleanly.

**Bonus discovery (NEEDS_HUMAN, NOT auto-actioned):** polish-loop's critics use `'anthropic:claude-haiku-4-5-20251001'` (date-suffixed) but the council PROVIDERS registry only has `'anthropic:claude-haiku-4-5'`. Per `if (!provider) return false;` at council.mjs:1206, all 3 critics SILENTLY fail the fireable filter on every polish round. The polish pipeline has been running without critics for some time. This is a separate bug from proposal-1's scope — surfaced as NEEDS_HUMAN below.

### omega-proposal-2 (HIGH) — surface AI-detection cost on Phase A scoped hero + Phase B confirm

**Implementation approach:** per OMEGA's recommended Option (b) — separate sub-line under the hero, NOT folded into `cost_estimate_usd`. Preserves the per-row "would-spend-now-during-Process-All" semantics while disclosing "would-spend-LATER-if-user-builds-pack" as a separate, opt-in-gated number.

**Server-side changes ([dashboard-server.mjs](../dashboard-server.mjs)):**
- `buildPerCompanyPipelinePreview()` now computes per-row `ai_detection_potential_usd = COST_PER_AI_DETECTION_PACK × PACK_BUILD_OPT_IN_RATE` (= $0.06 for default $0.15 × 40%)
- Response shape extended with `total_ai_detection_potential_usd`, `ai_detection_per_pack_usd`, `pack_build_opt_in_rate` constants for client-side scoped recomputation
- Excluded rows get $0 detection (consistent with $0 cost_estimate)

**Client-side changes ([scripts/build-dashboard.mjs](../scripts/build-dashboard.mjs)):**
- Phase A scoped hero renderer adds `<div id="pcp-headline-detection">` sub-line below the cost figure
- `_pcpUpdateScopedCost()` live-recomputes scoped detection from selected rows + updates the sub-line text on every checkbox toggle
- Phase B confirm body renders an identical sub-line below the scoped cost figure
- Both surfaces auto-hide the sub-line when detection rounds to $0.00

**Live verification (Chrome MCP on https://dashboard.careers-ops.com/?_v=2):**
```
Modal open: true
Hero label: "Scoped run · 10 companies"
Hero cost: "$15.00"
Detection sub-line visible: true
Detection sub-line text: "+ $0.60 potential AI-detection (post-publish, if 40% opt in to Build pack)"
```

The OMEGA-predicted $0.60 number for 10 selected companies × $0.15/pack × 40% opt-in matches exactly. **The HIGH-severity cost disclosure gap is closed.**

### omega-proposal-3 (MEDIUM) — unify env-var input validation

**Implementation:** added 2 helpers at [dashboard-server.mjs:381-391](../dashboard-server.mjs#L381) — `clampEnvFloat(envVar, default, min, max)` and `clampEnvInt(...)` — that wrap `parseFloat/parseInt(process.env.X)` with `Number.isFinite` guard + `Math.min/Math.max` clamp. Pattern mirrors α's POLISH_* loader.

**Applied to 19 env-var-loaded numerics:**
- 8 cost-USD constants: clamped to [0, 500]
- 4 per-run/daily caps: clamped to [0, 10_000]
- 6 rate constants (publish/advance/cache-hit/enrichment/opt-in/pregen): clamped to [0, 1]
- 1 threshold (publish): clamped to [0, 10]
- 1 monthly budget + 1 burst budget: clamped to [0, 100_000]

**Scope extended slightly beyond OMEGA's flagged scope:** OMEGA listed 5 γ-calibrated + 3 ε-promoted (= 8). I covered all 8 plus the additional cost constants in the same loader region (proportional defense-in-depth, no behavior change). MONTHLY_BUDGET_USD + MONTHLY_BUDGET_USD_BURST also clamped (same risk profile, adjacent function).

**Verification:**
- Unit test: 19/19 constants preserve their previous defaults bit-for-bit when env var is unset
- NaN protection: `PUBLISH_RATE_ESTIMATE="abc"` falls back to 0.22 default (PASS)
- Out-of-range clamp: `PUBLISH_RATE_ESTIMATE="5.0"` clamps to 1.0 max (PASS)
- `node --check dashboard-server.mjs` clean

### omega-proposal-4 (ratify + policy) — approvals audit trail

**Created:** [data/omega-approvals.md](omega-approvals.md) with:
- (a) `ratify epsilon-needhuman-runbatch-2026-05-19` — retroactive sign-off on ε's 7 autonomous needhuman actions
- (c) `policy needhuman-explicit-approval` — durable rule: future cycles require explicit Mitchell approval BEFORE autonomous action on any NEEDS_HUMAN-tagged item

**Skipped (b):** no rollback needed — all 7 ε actions are net-positive (scan-provider restores, pre-push hook, plist relocation, dead-anchor removal).

The pre-push hook ε installed at `scripts/hooks/pre-push` is now the enforcement mechanism for the new policy: future agents may surface NEEDS_HUMAN findings but the hook fails the push if they attempt to action them without an approval line in this file.

---

## Live state post-execution

- Dashboard PID: 18305 (restarted via `launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.dashboard-server`)
- Public URL https://dashboard.careers-ops.com/ — HTTP/2 302 → CF Access (16:51 UTC)
- `/api/pipeline/per-company-preview` returns new fields: `total_ai_detection_potential_usd: 0.6`, `ai_detection_per_pack_usd: 0.15`, `pack_build_opt_in_rate: 0.4`, per-row `ai_detection_potential_usd: 0.06`
- Phase A modal: scoped hero shows $15.00 + detection sub-line +$0.60 (live-verified)
- 26 other commits also landed on main between my push windows (α/β/δ NEEDS_HUMAN sessions completed in parallel) — pre-push hook ran clean on the rebase + push

---

## NEEDS_HUMAN follow-ups (DO NOT auto-action — surface for Mitchell)

1. **Polish critics silently fail** — `lib/polish-loop.mjs:38,43,48` uses `'anthropic:claude-haiku-4-5-20251001'` (date-suffixed) but `lib/council.mjs:1026` registry key is bare `'anthropic:claude-haiku-4-5'`. The PROVIDERS lookup returns undefined, so `if (!provider) return false;` at council.mjs:1206 drops all 3 critics from every polish round. The polish pipeline has been running author+adjudicator+adversarial without critics. Fix is a one-line rename in polish-loop.mjs (drop the `-20251001` date suffix from all 3 critic model strings). **Severity: HIGH** — but scope-creep relative to proposal-1, so flagged here for explicit approval rather than auto-shipped.

   Suggested approval line: `2026-05-19: approve polish-critic-name-alignment — drop -20251001 suffix from CRITICS[].model in lib/polish-loop.mjs:38,43,48 to match PROVIDERS registry key 'anthropic:claude-haiku-4-5'`

2. **POLISH_API_TIMEOUT_MS default of 5 min may not survive an adversarial Round 4** — Opus's adaptive-thinking mode with adversarial framing can take 4+ minutes by itself. Worth watching the first time `POLISH_PACK_ENABLED=1` flips on. If Round 4 timeouts surface in production, raise to `POLISH_API_TIMEOUT_MS=600000` (10 min) via env override — no code change needed.

3. **MONTHLY_BUDGET_USD clamp range [0, 100_000]** is generous. If you ever set it to something larger (e.g. a Series-A enterprise tier), edit the clamp ceiling. Probably fine as-is for a personal job-search budget.

---

*Generated by orchestrator session · 2026-05-19 ~09:55 PT · Opus 4.7*
