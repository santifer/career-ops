# Run Batch / Process All Modal UX — AA-Tier Follow-Up

**Source:** Council report `~/.claude/agents/runs/council-report-20260518-205946.md` + dealbreaker `dealbreaker-report-20260518-205946.md`
**Council run:** 2026-05-18, 5 models (GPT-5, Sonnet 4.6, Opus 4.7, Perplexity Sonar Pro, Grok 4.3), ~$1.90 total
**AAA items applied:** 5/5 — hero number, reconciled funnel, Pulumi plan line, enrichment hierarchy, force-override destructive styling

---

## AA-Tier TODO (apply soon, moderate effort)

| # | Change | Models | File(s) | What exactly |
|---|---|---|---|---|
| AA-1 | **Action button label restates total** | 4/5 | `build-dashboard.mjs` `_renderPipelineModal()` footer | Change `Run` → `Run · $142.80` by reading `p.run_batch.total_cost_usd` / `p.process_all.total_cost_usd` and injecting into the confirm button label. Cancel stays unchanged. |
| AA-2 | **Sticky modal footer with cost echo** | 4/5 | `build-dashboard.mjs` + modal CSS | `[Cancel]  $142.80 → [Run · $142.80]` row stays pinned at bottom during scroll. Add `position:sticky;bottom:0;background:var(--bg-card)` to the button row container. |
| AA-3 | **Collapse $0 stage rows into one line** | 3/5 | `build-dashboard.mjs` `_renderPipelineModalBody()` | Consolidate Sort + Evaluate + Publish rows (all $0.00) into a single muted line: `↳ Sort · Evaluate · Publish (deterministic / bundled, $0.00)`. Saves ~60px of vertical noise. |
| AA-4 | **Promote result note visibility** | 3/5 | `build-dashboard.mjs` `_renderPipelineModalBody()` | The `"~N fully-enriched roles (HM intel + dealbreaker review)"` line is currently 11px / 0.6 opacity. Move to 13px / 0.9 opacity directly under the plan line (already adjacent — just bump the style values). |
| AA-5 | **Phase A → Phase B bridge line** | 3/5 | `build-dashboard.mjs` Process All Phase B header | At top of Phase B preview: `"Phase A estimate $215.31 → after scope selection $142.80 (−$72.51)"`. Reads from `p.process_all.total_cost_usd` vs the Phase A raw estimate. Explains where savings came from. |
| AA-6 | **Headroom microcopy in decision zone** | 3/5 | `build-dashboard.mjs` budget section | Replace the 3-row budget block as the decision-relevant fact with: `"Spends ~31% of remaining monthly headroom. ~3 more runs this size before budget."` Demote current budget rows to 11px audit-trail footnote. Compute: `Math.round((total / headroom) * 100)` + `Math.floor(headroom / total)`. |
| AA-7 | **Sidebar live cost during run** | 2/5 | `dashboard-server.mjs` `batchLive()` + `build-dashboard.mjs` `_renderBatchData()` | Add a "Spent so far" line to the in-flight `#sidebar-batch` widget: `Spent so far · $87.40 / ~$142.80 est.` Write `spent_usd_so_far` to `pipeline-process-state.json` from `process-all-pipeline.mjs` and expose via `batchLive()`. Closes the loop between pre-run cost confirmation and in-flight visibility. |
| AA-8 | **Explicit cap-overage math inside warning box** | 2/5 | `build-dashboard.mjs` `_renderCapWarning()` | Add `Cap per run: $25 / This run: $142.80 / Over by: $117.80` as a 3-row mini-grid inside the cap-warning box (above the detail text). Computable from `capUsd` + `slice.total_cost_usd`. |

---

## Notes from dealbreaker

- **GPT-5 arithmetic flag resolved:** GPT-5 reported `$139.65 ≠ $142.80` discrepancy. Dealbreaker verified `dashboard-server.mjs:680-725` math is correct ($10.50 + $132.30 = $142.80). The discrepancy was in GPT-5's reading of the rendered modal text vs. the actual constants. No code fix needed; may have been a stale screenshot artifact.
- **Grok-4 dissented on urgency:** Grok-4 argued the current layout is sufficient for Mitchell's 8-second decision time, but graded all AAA fixes as AAA anyway. Direction unanimous even where urgency wasn't.
- **Pulumi URL:** https://www.pulumi.com/docs/iac/cli/commands/pulumi_up/ — the `pulumi up` "Resources: 3 to create, 1 to update" one-line summary pattern that AAA-5 borrowed.
