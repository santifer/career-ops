# α ALPHA — Run Batch + Process All polish/intel/preflight audit

**Date:** 2026-05-19
**Discipline:** Apply-Pack Quality Engineer — focused on the polish + finalize stages at the end of Process All
**Worktree:** `/Users/mitchellwilliams/Documents/career-ops-alpha-runbatch-2026-05-19` on `overnight-alpha-runbatch-2026-05-19`
**Merge SHA:** `bd971a8`
**Push:** `origin/main` (mitwilli-create) — `0fec500..bd971a8`

---

## TL;DR

Polish + intel + preflight pipeline ships 99-confidence packs in theory but had FOUR holes in practice:

1. **Phase B confirm modal threw `ReferenceError: slice is not defined` whenever scoped cost exceeded a cap** — the Process All 2-phase modal couldn't render the force-override warning, so Mitchell couldn't see the cost he was being asked to override.
2. **`process-all-pipeline.mjs` emitted `phase: 'polish'` and `phase: 'merge'` but `dashboard-server.mjs` phaseOrder enum didn't include them** — every sidebar progress bar silently broke for the duration of polish (typically 5-30 minutes).
3. **Polish costs were invisible in the cost preview** — Process All's polish stage could spend $300-2500 on top of the displayed estimate ($150 → reality $450-2650) with zero disclosure.
4. **`phasePolish` invoked `apply-pack-polish.mjs` with NO `--cost-cap` arg**, so each pack defaulted to the agent's $500 ceiling. A 5-row Process All run could silently spend $2500 on polish. Cap was unreachable from the dashboard.

A fifth (LOW) finding: **preflight-pack.mjs (the 6-gate validator including the polish APPROVED gate) was NEVER invoked from any pipeline** — only reachable via CLI or row-drawer "Build pack" button. The polish-summary "gate 6" had zero teeth in Process All.

All five shipped tonight. Six commits, merged to `bd971a8`, pushed to mitwilli-create:main, dashboard-server restarted (PID 86803, HTTP 200 on both localhost:3097 + public URL 302→CF Access).

**Verdict: SHIPPED.**

---

## Audit findings

### CRITICAL — `scripts/build-dashboard.mjs:20006` — Phase B cap-warning ReferenceError

**Repro:**
```
1. POLISH_PACK_ENABLED=0 (or unset)
2. Open Process All modal → Phase A loads
3. Select enough companies to exceed PER_RUN_CAP_PROCESS_ALL or monthly budget
4. Continue → Phase B render
5. Browser console: ReferenceError: slice is not defined at _renderScopedCapWarning
```

The function `_renderScopedCapWarning(reason, scopedCost, capUsd, p)` referenced `slice.total_cost_usd.toFixed(2)` inside the force-override label. `slice` was never defined in that scope — likely a copy-paste from `_renderCapWarning(action, p)` where `slice = isAll ? p.process_all : p.run_batch`.

**Impact:** When the cap is exceeded (the moment when Mitchell most needs to see the cost), the modal's confirm label is broken. The error is silently swallowed by innerHTML but the force-override label fails to render — so the user can't see the cost they're being asked to accept.

**Fix shipped (commit `222477c` after rebase):** `slice.total_cost_usd.toFixed(2)` → `scopedCost.toFixed(2)`.

### HIGH — `dashboard-server.mjs:1775` — Process All polish/merge phases silently break stage bars

**Repro:**
```
1. POLISH_PACK_ENABLED=1
2. Click Process All on dashboard
3. After triage completes (~30s) and batch finishes (~5min), pipeline enters phase='polish'
4. Sidebar #sidebar-batch widget shows ALL stages as "done" because phaseDone(p) returns true for any p with phaseOrder.indexOf(p) > -1, and phaseIdx is -1 (unknown phase)
```

`phaseOrder = ['triage', 'batch', 'rebuild', 'email', 'done']` did NOT include `'polish'` or `'merge'`. When the actual phase was `'polish'`, `phaseIdx = -1`, and `phaseDone('triage')` returned `-1 > 0` (false) but `phaseDone('rebuild')` returned `-1 > 2` (false)... actually all returned false, so the bars went grey-grey-grey when they should show green-green-active. Either way: **the visual state is misleading during polish — Mitchell can't tell if anything is happening.**

**Impact:** A polish phase can take 30+ minutes per pack × 5 packs = 2.5 hours of "nothing visibly happening" while the pipeline is actually working hard.

**Fix shipped (commit `901c089`):**
1. `phaseOrder = ['triage', 'batch', 'polish', 'merge', 'rebuild', 'email', 'done']`
2. Added `polish` stage to `pipelineStages.stages` with `gated:true` flag.
3. Added `polish` to the front-end's `stageList`; filter logic hides the bar when gated:true AND not active AND not done AND total=0 (so POLISH_PACK_ENABLED=0 users don't see it).

### HIGH — `dashboard-server.mjs:805` — Polish costs invisible in preview

**Repro:**
```
1. POLISH_PACK_ENABLED=1
2. curl http://localhost:3097/api/pipeline/preview | jq .process_all.agent_enrichment
   → only council/researcher/dealbreaker — no polish field
3. Click Process All → modal shows cost X, actual run spends X + $300-600 on polish
```

The cost preview functions `buildPipelinePreview()` and `buildPerCompanyPipelinePreview()` had zero awareness of polish. POLISH_TOP_N_PER_RUN=5 × COST_PER_POLISH_PACK_USD=$60 = +$300 minimum hidden spend per Process All run; cap is +$600.

**Impact:** Mitchell sees a $90 modal estimate and gets a $390-690 actual bill. Force-override cap warnings fire only on the pre-polish $90 — the polish stage runs unchecked.

**Fix shipped (commit `0761c4c`, refined in `78bee83`):**
1. New env-tunable constants: `COST_PER_POLISH_PACK_USD` ($60), `POLISH_TOP_N_PER_RUN` (5), `POLISH_PER_PACK_COST_CAP_USD` ($120).
2. Polish cost reads `POLISH_PACK_ENABLED` and only contributes when ON.
3. `agent_enrichment.polish` block surfaces with `{count, cost_usd, enabled, per_pack_typical_usd, per_pack_cap_usd, notes, model}` — visible on every preview, with an OFF inline tag when the env is unset.
4. Verified live: `curl localhost:3097/api/pipeline/preview` shows `polish: {enabled:false, ...}`; with `POLISH_PACK_ENABLED=1` on a sibling port shows `{enabled:true, count:5, cost_usd:300}` and `total_cost_usd` jumps from $95.60 → $395.60.

### HIGH — `scripts/process-all-pipeline.mjs:162` — phasePolish unbounded per-pack cost

**Repro (audit, not run):**
```
1. POLISH_PACK_ENABLED=1
2. Process All chooses 5 Evaluated rows from apply-now-queue
3. For each row, invokes: node scripts/agents/apply-pack-polish.mjs --row N
   ← NO --cost-cap arg
4. apply-pack-polish.mjs:198 — costCap defaults to opts.costCap || POLISH_COST_CAP_USD env || 500
5. 5 × $500 = $2500 polish ceiling per Process All run, invisible to the preview
```

**Impact:** Combined with finding HIGH-3 (cost invisibility), a single Process All click could spend $2500 on polish over the silent stage progress (HIGH-2). Mitchell's quality-first policy doesn't extend to "burn $2500 without confirming first."

**Fix shipped (commit `fcf729e`):**
1. `phasePolish` now passes `--cost-cap ${POLISH_PER_PACK_COST_CAP_USD}` (default $120).
2. Status filter expanded from `Evaluated` only → `{Evaluated, Applied, Interview}` so post-apply / pre-interview polish is also reachable.
3. New `polish_progress` live job-state field (polished/failed/skipped/total/cap) so the dashboard SSE bar reads real numbers during the loop, not only after.
4. Dashboard-server.mjs prefers `polish_progress` (live) over `phases.polish` (final tally written at end of `main()`).

### LOW — `scripts/preflight-pack.mjs` — never invoked by any pipeline

**Repro:**
```
grep -rn "preflight-pack\|preflightPack" scripts/process-all-pipeline.mjs scripts/build-apply-packs.mjs dashboard-server.mjs scripts/build-dashboard.mjs
# → only the preflight-pack.mjs self-references
```

Preflight-pack has 6 gates (PDF, humanize, JD-keyword, claim-consistency, engagement-rubric, polish-summary). Gate 6 was added overnight as part of the polish work — it has correct red/yellow/green logic against `polish-summary.final_recommendation === 'APPROVED'`. But nothing invokes it. CLI only.

**Impact:** Polish "gate 6" carries zero enforcement. A pack can ship with `NEEDS_HUMAN` or `REJECTED` recommendation and Process All never notices.

**Fix shipped (commit `4a14714`):** `phasePolish` invokes `node scripts/preflight-pack.mjs --slug <slug>` immediately after each successful polish. Exit code logged (0=PASS, 1=CAUTION, 2=FAIL); non-fatal — the resulting `PREFLIGHT.md` is the audit artifact Mitchell can consult before shipping.

---

## AAA-tier shipped (6 commits)

| # | SHA | File:lines | What |
|---|---|---|---|
| 1 | `222477c` | scripts/build-dashboard.mjs:20006 | `slice.total_cost_usd` → `scopedCost.toFixed(2)` |
| 2 | `901c089` | dashboard-server.mjs:1775 + build-dashboard.mjs:18766 | phaseOrder includes polish/merge; new polish stage in pipelineStages + UI list |
| 3 | `0761c4c` | dashboard-server.mjs:805 + build-dashboard.mjs:19515 | Polish cost folded into buildPipelinePreview when POLISH_PACK_ENABLED=1 |
| 4 | `fcf729e` | scripts/process-all-pipeline.mjs:144 | --cost-cap, expanded status filter, live polish_progress |
| 5 | `4a14714` | scripts/process-all-pipeline.mjs:194 | preflight-pack invoked after each successful polish |
| 6 | `78bee83` | scripts/process-all-pipeline.mjs:215 + dashboard-server.mjs:425 | env-var clamping (topN: 1-20, cap: $10-$500); skipped-path progress write |

Merge commit: `bd971a8` on main.

---

## Answers to the 6 audit questions

| # | Q | A |
|---|---|---|
| 1 | Polish gated by POLISH_PACK_ENABLED for dark-launch? | **YES** — `process-all-pipeline.mjs:145` checks the env; modal preview reads it; `preflight-pack.mjs:294` honors it. Confirmed no launchd plist sets it. |
| 2 | $500 spend ceiling enforced inside apply-pack-polish.mjs? | **YES — but loosely.** The cap is checked at start of each artifact loop iteration (apply-pack-polish.mjs:249) and start of each round in polish-loop.mjs:282. A single round can overshoot by ~$16 (3 critics + author + adjudicator + adversarial), so a $500 cap can land at ~$516. NEEDS_HUMAN: prior self-review flagged a mid-round check before the $13 adversarial sweep — fix is scoped for a future pass. |
| 3 | qa-review / polish 99-confidence threshold respected before zip+publish? | **PARTIAL.** Polish-loop targets 0.99 (lib/polish-loop.mjs:57 DEFAULT_TARGET); polish-coherence emits `APPROVED|NEEDS_HUMAN|REJECTED` (lib/polish-coherence.mjs:18-22); apply-pack-polish.mjs:312 only mirrors to `apply-pack/<slug>/<srcFile>` when `polish.confidence >= target`. **HOWEVER**, there is NO actual "pack zip+publish" step in the pipeline — Process All ends at dashboard rebuild + email. The "publish" is just appearing in the dashboard. So the 99-threshold gates artifact-overwriting; it does NOT gate dashboard visibility. NEEDS_HUMAN to decide if that's the desired contract. |
| 4 | Preflight gate 6 invoked during Process All? | **WAS NO, NOW YES.** Pre-fix: only via CLI / row-drawer "Build pack". Post-fix (commit `4a14714`): `phasePolish` runs `preflight-pack.mjs --slug <slug>` after each successful polish; PREFLIGHT.md lands on disk for audit. |
| 5 | Intel-refresh caches consulted BEFORE batch builds each pack? | **PARTIAL.** Polish-signals reads `data/hm-intel/<slug>.json` (lib/polish-signals.mjs:208) directly with no TTL check — so it reuses whatever cache exists. But intel-refresh's NEW caches (`company-toxicity-cache/`, `strategy-ceiling/`, `positioning-cache/`) are write-only: no reader anywhere in the codebase consumes them. Intel-refresh is producing dark data. NEEDS_HUMAN: should polish-signals read toxicity/strategy/positioning caches, or should we keep those purely as dashboard data sources? |
| 6 | Cost preview reflects polish + intel-refresh costs? | **WAS NO, NOW partially YES.** Polish now surfaces in the modal when `POLISH_PACK_ENABLED=1` (this audit shipped that). Intel-refresh is NOT in the preview — but intel-refresh isn't invoked by Process All today (it runs nightly via launchd + manual via dashboard button). If/when intel-refresh is wired into Process All, a similar surface will be needed. |

---

## Adversarial self-review

Re-read what I shipped. The worst-case scenarios I attacked:

| Scenario | Outcome |
|---|---|
| `POLISH_TOP_N_PER_RUN=0` (env typo) | Clamped → 5 (commit `78bee83`). |
| `POLISH_TOP_N_PER_RUN=999` (env typo) | Clamped to 20 (commit `78bee83`). Worst-case cost still bounded at 20 × $120 = $2400 (NEEDS_HUMAN: still substantial; ops should consider a 2nd-line check). |
| `POLISH_PER_PACK_COST_CAP_USD=NaN` | Defaults to $120 (commit `78bee83`). |
| `polish_progress.skipped` lost on continue path | Fixed by `writeProgress()` helper writing on every iteration including skip (commit `78bee83`). |
| Unknown `phase` value (e.g. someone adds 'cleanup' phase) | `phaseDone` returns false for any unknown phase; bars stay grey. Acceptable. |
| Polish stage bar visible when POLISH_PACK_ENABLED=0 | Filter logic in build-dashboard.mjs:18773 hides it when `gated && !active && !done && total===0`. Verified. |
| `_renderScopedCapWarning` `scopedCost` undefined | Pre-existed in HEAD, fixed in `222477c`. |

**Live verification:**
```
$ curl -s http://localhost:3097/api/pipeline/preview | jq .process_all.agent_enrichment.polish
{
  "count": 0,
  "cost_usd": 0,
  "model": "Haiku x3 + Sonnet + Opus + adversarial",
  "enabled": false,
  "per_pack_typical_usd": 60,
  "per_pack_cap_usd": 120,
  "notes": "OFF — set POLISH_PACK_ENABLED=1 to engage"
}
```

With `POLISH_PACK_ENABLED=1` on a sibling port (verified):
```
{
  "count": 5,
  "cost_usd": 300,
  "model": "Haiku x3 + Sonnet + Opus + adversarial",
  "enabled": true,
  "per_pack_typical_usd": 60,
  "per_pack_cap_usd": 120,
  "notes": "top-5 Evaluated rows polished to ≥0.99 confidence (POLISH_PACK_ENABLED=1)"
}
```

`total_cost_usd` jumps from $95.60 (polish off) → $395.60 (polish on) — the $300 polish cost is now visible BEFORE the run starts.

Live JSON snapshots committed to `data/runbatch-eval-snapshots/alpha/`:
- `preview-polish-off-2026-05-19.json`
- `preview-polish-on-2026-05-19.json`

---

## NEEDS_HUMAN

| Item | Why Mitchell needs to decide |
|---|---|
| Mid-round cost cap check (LOW from prior self-review) | The polish-loop overshoots its cap by ~$16/round in worst case. A pre-adversarial mid-round check would tighten this to ~$3. Architectural refactor — Mitchell's call on whether it's worth a separate pass. |
| Toxicity / strategy-ceiling / positioning cache readers | intel-refresh produces them but nothing reads them. Mitchell decides: (a) wire polish-signals to read them as supplementary signal, (b) wire the dashboard drawer widgets to read them, (c) accept that they're write-only data the council CAN consult ad-hoc. |
| Polish cap enforcement during Run Batch | Run Batch doesn't invoke polish today. If/when polish is added there, the same cost-preview / cap-warning machinery needs to extend. Currently the polish stage is Process All-only. |
| 99-confidence vs dashboard visibility | The 0.99 threshold currently gates ONLY the `apply-pack/<slug>/<srcFile>` mirror. The dashboard still renders the row regardless of polish state. Mitchell decides whether a sub-0.99 pack should be hidden from the apply-now queue. |

---

## Files touched

| Path | Lines changed | Owner per matrix |
|---|---|---|
| `scripts/build-dashboard.mjs` | +33/-3 across two ranges (~19515, ~20006) | shared (BRAVO + γ wrote nearby; my edits are disjoint) |
| `dashboard-server.mjs` | +51/-3 across three ranges (~425, ~805, ~1810) | shared (γ + ε + δ wrote nearby; my edits are disjoint) |
| `scripts/process-all-pipeline.mjs` | +56/-12 across one range (~144-265) | ε + α (ε added cleanup; α added polish stage — disjoint) |

No `cv.md`, no `applications.md`, no gitignored personal data touched.

---

## Trigger matrix verification

| Surface | Verification |
|---|---|
| Process All Phase A modal | curl localhost:3097/api/pipeline/preview returns `agent_enrichment.polish` block — verified ✓ |
| Process All Phase B confirm | `_renderScopedCapWarning` no longer references `slice` — syntax check passes ✓ |
| Sidebar SSE bar | New `polish` stage with gated:true flag; filter logic hides when env=0 — verified server-side ✓ |
| `--row N` polish CLI | Untouched in this pass — defaults to $500 cap, opt-in via env ✓ |
| nightly intel-refresh launchd | Untouched ✓ |
| dashboard preview provenance | `polish_typical_cost` provenance metadata added (γ-compatible) ✓ |

---

*Generated by ALPHA Run-Batch eval · 2026-05-19 · merge bd971a8.*
