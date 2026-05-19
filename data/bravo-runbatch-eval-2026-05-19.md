# BRAVO — Run-Batch + Process All UX evaluation (2026-05-19)

**Lens:** Visual UX & interaction researcher-implementer (Opus 4.7)
**Worktree:** `../career-ops-bravo-runbatch-2026-05-19` on `overnight-bravo-runbatch-2026-05-19`
**Merge SHA:** `8ee9178` on `main`, pushed to `origin/main` (mitwilli-create) at push range `bc54cb8..8ee9178`
**Verification env:** https://dashboard.careers-ops.com/ — 1440px viewport, post-rebuild live

---

## TL;DR — SHIPPED

5 fixes landed against the Run-Batch + Process All surface this pass:

| # | Fix | File | Lines | Status |
|---|---|---|---|---|
| AAA-1 | `_renderScopedCapWarning` ReferenceError on Phase B cap hit (slice → scopedCost) | `scripts/build-dashboard.mjs` | ~20142-20165 | LIVE |
| AAA-2 | `published_count` persisted after phaseBatch (Publish stage shows real data during rebuild) | `scripts/process-all-pipeline.mjs` | ~178-205 | LIVE |
| AAA-3 | Cap-warning copy names agent enrichment as dominant cost ("$132 (93%) is agent enrichment on 21 published items") | `scripts/build-dashboard.mjs` | ~19609-19651 | LIVE |
| AAA-4 | Hero `$` recolor red + "OVER CAP / OVER BUDGET" pill next to headline noun when est.exceeds_per_run_cap OR exceeds_budget | `scripts/build-dashboard.mjs` | ~19536-19562 | LIVE |
| AAA-5 | Phase A hero reconciles to SCOPED cost (not aggregate Tier-5) — fixes "$210.60 headline vs $15.00 scoped" disconnect; live-updates as user toggles per-company checkboxes | `scripts/build-dashboard.mjs` | ~19736-19772, ~19904-19926 | LIVE |

Final verdict: **SHIPPED**.

---

## Audit findings (severity-ranked)

### CRITICAL

**C-1. `_renderScopedCapWarning` throws ReferenceError on Phase B cap hit.**
Repro'd via Chrome MCP console at https://dashboard.careers-ops.com/:
```javascript
_renderScopedCapWarning('per-run', 999.99, 250, { spent_30d_usd: 38.16, effective_budget_usd: 500, burst_budget_usd: 0 })
// {"error":"slice is not defined","name":"ReferenceError"}
```
The function body referenced `slice.total_cost_usd` but `slice` was a carry-over free variable from the un-scoped `_renderCapWarning` sibling — never defined in the scoped variant. **Whenever a user selected enough companies in Phase B to cross either PER_RUN_CAP_PROCESS_ALL_USD ($250) or the monthly budget, the cap-warning panel went silently blank instead of rendering the warning — leaving the user thinking the modal was broken with no signal that they'd hit a cap.**

Fix: Replaced with `scopedCost` (the parameter that already represents the same dollar amount in the scoped variant). ALPHA shipped the identical fix earlier in the night (`a04aadd`); my commit (`78870ce`) carries a longer rationale comment and was retained on rebase since git applied cleanly.

### HIGH

**H-1. Phase A hero shows aggregate Tier-5 hypothetical, not actual scoped cost.**

Before fix:
- Headline: `Aggregate Tier-5 estimate (108 unique companies, 15 pipeline items)` — `$210.60`
- Bottom: `Scoped cost (selected rows) $15.00 / Selected companies 10`

The user is being asked to commit to the $15.00 cost — but the visual weight + top position of $210.60 reads as the operative figure. Without scrolling to the very bottom of the modal it is genuinely unclear which number is the operative one.

Fix (`c373bef`): Restructured the headline:
```
Scoped run · 10 companies                                  $15.00
Realistic full drain · 15 pipeline items: $63.68   Tier-5 estimate · 108 companies: $210.60
```
Tier-5 estimate preserved as a sub-line for the upgrade-planning use case. Primary signal is now the actual scoped cost. Wired into `_pcpUpdateScopedCost()` so the hero number + label live-update when the user toggles checkboxes — keeping the hero reconciled with the existing bottom-of-modal summary at all times. **Verified live**: unchecking OpenAI (cost $2.50) immediately updated `Scoped run · 10 companies / $15.00` → `Scoped run · 9 companies / $12.50`.

**H-2. Capped-state visual signal lives 350px below hero — easy to miss.**
The Run Batch modal scrollHeight is 926px at 1280×720; clientHeight is 617px. Cap warning sits in the lower 1/3 of the modal body, below the budget rows. The big 28px accent-colored hero (`$59.67`) looks identical whether the run is well within caps or busts both caps. Mitchell could confidently confirm a run that exceeds the per-run cap without realising it.

Fix (`d5fb9a3`): When `est.exceeds_per_run_cap` or `est.exceeds_budget`:
- Hero $ recolors from `var(--accent)` (purple) to `var(--red-fg)` (red)
- Inline pill "OVER CAP" or "OVER BUDGET" rendered next to the headline noun

The full explanatory copy + force-override checkbox still lives in the cap-warning card below — this fix is purely the at-a-glance signal. **Verified live**: Run Batch modal now shows red `$59.67` + amber/red `OVER CAP` pill next to `172 QUEUED EVALUATIONS`.

### MEDIUM

**M-1. Publish stage in sidebar 5-stage mini-progress always shows 0/0 during rebuild.**
`dashboard-server.mjs:batchLive()` reads `activeJob.published_count` to render the Publish bar. Before my fix + GAMMA's earlier fix, no upstream phase ever wrote this field. After phaseBatch completes (but before phaseRebuild), the sidebar shows 4/5 stages green + Publish stuck at 0/0 even though high-score items DID complete.

GAMMA shipped a fix earlier in the night (`8ec78e3`) that writes `published_count` at end-of-main from apply-now-queue.json (post-rebuild). That value is authoritative but only lands at the END of the run.

My complementary fix (`9de500b`): write `published_count` right after phaseBatch by reading batch-state.tsv (cols[2]=status, cols[6]=score, count where status=='completed' && score >= THRESHOLD_FOR_PUBLISH). This makes the Publish bar render real data DURING rebuild phase (which can take 60+ seconds), instead of forcing GAMMA's `count_unknown: true` ✓ fallback to fire.

Both writes are idempotent; GAMMA's runs last and is authoritative.

**M-2. Cap-warning copy doesn't explain why $142 exceeds a $25 cap.**
The cap warning currently reads:
> "Run Batch estimate **$142.80** exceeds the per-run cap of **$25**."

But the Cost Breakdown table above shows Process at only $10.50. The hidden cost is the Agent Enrichment block (Council $42 + Researcher $84 + Dealbreaker $6.30 = $132.30) which fires automatically once items publish — but the cap-warning copy never connects the dots. User is left to wonder "where does $142 come from?"

Fix (`6e4f431`): Added a one-liner between the headline number and the env-var fix recipe:
> "Of that, **$47.10 (79%)** is agent enrichment on 38 published items — fires automatically when score ≥ 4."

Tells the truth, lets the user immediately decide whether the workaround is "raise the cap" (yes, enrichment is accepted) or "narrow the scope" (probably no — once threshold trips you pay for enrichment regardless). Same fix applied to EXCEEDS MONTHLY BUDGET path. **Verified live** in the Run Batch modal.

### LOW (deferred, documented)

**L-1. Modal can scroll out of viewport at 1280×720.**
Modal scrollHeight 926 vs clientHeight 617 — Cancel/Run-Batch buttons + cap warning sit below the fold initially. Mitigated by AAA-4 (red hero + OVER CAP pill makes the warning visible above the fold). Full structural fix (taller modal, more compact layout) is a higher-effort change for marginal benefit — A-tier backlog.

**L-2. Pipeline action buttons hidden on <720px (mobile).**
`#sidebar-pipeline-actions { display: none !important; }` at `@media (max-width: 720px)` — no alternate entry point on mobile. Acceptable for now since this is Mitchell's power-user dashboard (he runs Run Batch from desktop), but flag for future if mobile usage emerges.

**L-3. SSE staleness chip uses `innerHTML` with color but no `title=` for hover detail.**
GAMMA's `staleChip` in `_renderBatchData` at scripts/build-dashboard.mjs:18806 sets:
```html
<span style="color:#d29922">· last update 6h ago</span>
```
No tooltip explains what "last update 6h ago" means contextually. Cosmetic. A-tier.

**L-4. "OVER CAP" pill textContent concatenates with headline noun for screen readers.**
The H4 reads "172 queued evaluationsover cap" via textContent because the pill is a nested span. Visually well-separated; screen-reader users would hear it concatenated. A-tier accessibility cleanup.

---

## Adversarial self-review

**S-1. Could my Phase A heroLabel.textContent rewrite break Phase B?**
Risk: `_pcpUpdateScopedCost` updates `#pipeline-modal-body h4` — if called in Phase B, it would rewrite the "Companies in this run" h4 to "Scoped run · N companies".

Investigation: `_pcpUpdateScopedCost` callers — `_pcpToggleRow`, `_pcpBulkToggle`, `_pcpRowAction`, `_returnToPhaseA`, `_refreshProcessAllPhaseA`. All run from Phase A context (checkboxes only exist there); `_returnToPhaseA` rebuilds Phase A body first. No Phase B path calls this function. **Safe.**

**S-2. Could the heroEl null guard catch a transient state?**
Risk: between Phase A `body.innerHTML = ...` and applyUniversalTableBaseline, the new DOM might not be reachable yet when `_pcpUpdateScopedCost` fires at the end of `_refreshProcessAllPhaseA`.

Investigation: `innerHTML` is synchronous; the DOM is updated before the next statement. `document.getElementById` is also synchronous. No race condition. **Safe.**

**S-3. What if `pAgg.process_all.tier5_estimate` is missing?**
Risk: My `tier5` const reads `pAgg.process_all.tier5_estimate || {}` — but I deference `tier5.total_cost_usd != null`. If `process_all` itself is undefined, the `||` short-circuit takes us to `{}`, so `tier5.total_cost_usd` is undefined → my `tier5Line` ternary returns `''`. **Safe.**

**S-4. What if scopedCost is NaN?**
Risk: `cost_estimate_usd` might be missing on some companies. My reduce uses `(c.cost_estimate_usd || 0)` — NaN values default to 0. `toFixed(2)` would output "NaN" if scopedSum were NaN, but the `|| 0` covers it. **Safe.**

**S-5. Did I miss any existing entry point that could now bypass my fixes?**
Auditied:
- `pipeline-btn-batch` (sidebar) → `openPipelineModal('batch')` → _renderPipelineModalBody → my AAA-3/4 apply ✅
- `pipeline-btn-nuclear` → `openPipelineModal('process-all')` → _renderProcessAllPhaseA → my AAA-5 applies ✅
- `batch-status-queue-cell` (sidebar widget popout link) → `openPipelineModal('batch')` → same path ✅
- Fallback path when `/api/pipeline/per-company-preview` 410s → renders `_renderPipelineModalBody(action, pAgg)` → my AAA-3/4 still apply (no `_pipelinePerCompany`, but Phase A render isn't used in this branch)

All entry points covered.

---

## What I deliberately did NOT change

**D-1. The cap-warning detail copy for the SCOPED variant.**
`_renderScopedCapWarning` doesn't have `est.agent_enrichment` in scope (only `scopedCost`). Adding the enrich-blurb there would require either (a) re-deriving the breakdown per-row or (b) plumbing the slice through. The per-company table already exposes cost density per-row, so the user has signal at the right granularity. Not worth the wire-up complexity tonight.

**D-2. Mobile / responsive layout for the per-company table.**
The 9-column table (checkbox / company+role / stages / score / TTO / toxicity / network / cache / cost / actions) would not fit on 375px viewport regardless. Mobile pipeline-actions hide entirely at <720px. Mitchell's stated use case is desktop power-user; deferred.

**D-3. SSE staleness chip + count_unknown handling.**
GAMMA already shipped these (`8ec78e3`) — my pass complements rather than duplicates.

**D-4. Sidebar batch widget empty/error states for SSE.**
The existing fallback already cycles `_setBatchStreamMode('error')` → `_recordFailure()` → poll-mode at 3 consecutive failures within 60s, with jittered exponential backoff. Tested via `EventSource.CLOSED` polling at 5s. State machine is correct; the visual states (live / poll / error / connecting) are color-coded and accessibility-labelled. No regression to fix.

---

## NEEDS_HUMAN

**NH-1. Should the cap warning be auto-promoted to the top when triggered?**
My AAA-4 surfaces "OVER CAP" inline next to the headline noun. An alternative is moving the entire cap-warning card to ABOVE the budget summary, so a user who scrolls top-to-bottom hits the warning first. Tradeoff: that breaks the natural read order (cost → budget context → warning if applicable). Pure design preference call.

**NH-2. Force-override checkbox label phrasing.**
Currently: "I accept the cost. Force-run $59.67 anyway." The "anyway" reads slightly aggressive. Could be tightened to "Acknowledge cost. Run $59.67." or similar. Preference call.

**NH-3. Phase B "Companies in this run" h4 truncation.**
Phase B shows up to 6 company names + "(+N more)" — could be a comma-separated list or a count-only summary. Current 6+more is fine for typical scope. Preference call.

---

## Verification log

**Pre-fix:**
- ReferenceError repro: `try { _renderScopedCapWarning('per-run', 99999.99, 250, p) } catch (e) { console.log(e.message) }` → "slice is not defined"
- Phase A hero mismatch repro: opened Process All, scoped to 10 companies, observed $210.60 headline vs $15.00 scoped summary

**Post-fix (verified live at https://dashboard.careers-ops.com/?_v=2 after merge + rebuild):**
- `_renderScopedCapWarning` returns clean HTML, no ReferenceError → `{"success":true,"hasForceRun":true,"hasReal":true}`
- Process All Phase A hero: "Scoped run · 10 companies / $15.00 / Realistic full drain $63.68 / Tier-5 $210.60"
- Toggling OpenAI checkbox: hero live-updates to "Scoped run · 9 companies / $12.50"
- Run Batch capped state: red `$59.67` + "OVER CAP" pill
- Cap warning copy: "Run Batch estimate $59.67 exceeds the per-run cap of $25. Of that, $47.10 (79%) is agent enrichment on 38 published items — fires automatically when score ≥ 4."

**Build verification:**
- `node --check scripts/build-dashboard.mjs` → clean
- `node --check scripts/process-all-pipeline.mjs` → clean
- `node scripts/build-dashboard.mjs` → clean rebuild, 1.18MB raw → 1.00MB minified
- Inline JS parse check: 4/4 inline scripts pass `new Function(body)` test

---

## Commits + Merge

```
78870ce fix(β-runbatch): _renderScopedCapWarning ReferenceError on Phase B cap hit
9de500b fix(β-runbatch): persist published_count after phaseBatch — Publish stage shows real data
6e4f431 fix(β-runbatch): explain agent-enrichment dominance in cap-warning copy
d5fb9a3 fix(β-runbatch): recolor hero $ + add 'over cap/budget' pill when capped
c373bef fix(β-runbatch): Phase A hero shows SCOPED cost, not aggregate Tier-5 hypothetical
8ee9178 β: Run-Batch + Process All UX audit + 5 fixes (merge)
```

Pushed: `bc54cb8..8ee9178` on `origin/main` (mitwilli-create).

---

Signed: β BRAVO · 2026-05-19 ~08:40 PT
