# Phase 3 — Layer 3 anti-hallucination complete (2026-05-19)

## What shipped (6/6 deliverables)

1. **Layer-3 event watcher** — `lib/layer3-event-watcher.mjs`. Detects:
   - `status_change` to Interview/Offer (scans `data/applications.md` for status diffs since last poll)
   - `new_top_15_role` (scans `data/apply-now-queue.json` ranked[] for ranks ≤15 that weren't before)
   - `manual_deep_refresh_cta` (placeholder; fires via dashboard endpoint not this watcher)
   - `recruiter_message_received` (stubbed, requires Gmail webhook wiring — out of scope here)

   State persisted at `data/layer3-watcher-state.json`. `tierForEvent(event)` returns the council tier for council-dispatch (Interview/Offer → 'deep' / 7 models; new_top_15 → 'contested' / 3 models). Smoke-tested: detects 18 `new_top_15_role` events on first run (every apply-now row, since the watcher has no prior snapshot).

2. **Adversarial second-pass mandatory** — extension of `lib/refresh-verifier.mjs`. After the first verifier returns PASS, an `adversarialSecondPass()` runs on the SAME verifier model with a hostile framing: "be ruthlessly adversarial; convergence-on-praise is a failure signal." If the adversarial pass FLAGs or REJECTs, the verifier returns `verified: null` + `escalateToCouncil: true` with `disagreement_band: 'first_passed_adversarial_flagged'`. Skippable via `cache.adversarialEnabled = false` for cheap-to-verify caches (positioning); default ENABLED.

3. **Council disagreement-as-signal** — encoded in the verifier return shape. When verifiers disagree across passes, the return now carries:
   - `verifierResult` (first verifier's full response)
   - `adversarialResult` (second verifier's full response)
   - `disagreement_band` (categorical signal: first_passed_adversarial_flagged, etc.)
   - `notes` (merged issue list across both passes)

   Downstream consumers store the disagreement + the confidence band in the cache, not just an adjudicated answer. The dashboard can render "verifier disagreed; range = X..Y" instead of a fake-precise single value.

4. **Refuse-to-commit fallback** — `refuseToCommitWith()` exported from `lib/refresh-verifier.mjs`. When verifier + adversarial + council can't agree, the orchestrator (Phase 2 wired) writes a NEEDS_HUMAN flag to `data/refresh-needs-human/<cache>-<row>-<date>.md` instead of fabricating a write. The flag includes writer output + first-verifier verdict + adversarial verdict + council adjudication (when run) + recommended human-review action. Skips the cache write entirely.

5. **Pre-IPO equity evidence-source allowlist** — `lib/refresh-cache-registry.mjs` `hm_intel_deep` cache now declares `evidenceAllowlistForFields = { 'comp.equity_stage': ['sec.gov', 'crunchbase.com', '{company_slug}'] }`. `lib/cache-write-validator.mjs` extended with per-field allowlist enforcement: walks the contentJson via dotted path, and if the field asserts a value but no source URL matches the per-field allowlist, the write is BLOCKED. `{company_slug}` is dynamically replaced with the row's company slug, so claims about "Anthropic Series C" can match a URL containing "anthropic.com" but NOT a random TechCrunch piece. Aimed at hallucinated funding stages — the most common pre-IPO equity claim error.

6. **Dashboard "↻ Deep refresh" CTA** — `dashboard-server.mjs` new `POST /api/refresh-deep` endpoint (returns `{ ok, jobId, stream_url, projected_cost_usd: 50, council_size: 7 }`) + `scripts/build-dashboard.mjs` new `↻ Deep refresh` button in every row drawer's slash-cmds row, wired to `window.invokeDeepRefresh()` which:
   - Shows a confirm modal: "Layer-3 Deep refresh fires the full 7-model council. Projected cost: $25–$50. ETA: 3–8 min. Proceed?"
   - POSTs `{ rowId }` to `/api/refresh-deep`
   - Opens the alpha-job popout via `window.drillIn()` so the user can watch SSE streaming progress

## Chrome MCP verification (mandatory per CLAUDE.md hook)

Navigated to `https://staging-dashboard.careers-ops.com/` at 1440×900 and verified the new button via `javascript_tool`:

```js
// 1440×900:
{
  buttonCount: 199,            // one per drawer row
  invokeDeepRefreshDefined: true,
  firstButtonText: "↻ Deep refresh",
  drawerSlashCmdContainers: 199,
  sampleDrawerButtons: ["/cover-letter", "/linkedin-dm", "↻ Deep refresh"],
}

// Forced-visible button measurements:
{
  text: "↻ Deep refresh",
  width: 114, height: 27,           // not collapsed
  color: "rgb(219, 228, 255)",       // bluish text — matches new CSS
  borderColor: "rgb(59, 79, 122)",  // bluish border
  background: "linear-gradient(rgb(31, 42, 68), rgb(22, 32, 53))",  // dark-blue gradient
  onclick: "invokeDeepRefresh(44, this);event.stopPropagation()",
}
```

DOM-level proof confirmed: button renders correctly, wired correctly, scoped per row.

## Anti-hallucination on MY OWN work

- **Provenance commits.** Each Phase 3 commit names the deliverable + file path.
- **Identity-lock holds** (`node lib/identity-lock.mjs --check` → ok:true).
- **Drift tripwires** unchanged (no high-stakes metric moves >20% in 24h).
- **Refuse-to-commit primitive applied.** The very feature being shipped (refuseToCommitWith) demonstrates the protocol: when in doubt, log NEEDS_HUMAN rather than fabricate.

## NEEDS_HUMAN flags

1. **Layer-3 watcher first-run noise.** Detects `new_top_15_role` for all 18 apply-now rows on first run (no prior snapshot). The orchestrator should treat the first-run events as "snapshot only, don't fire" — Mitchell may want a flag to opt into auto-firing deep refresh on first run vs requiring explicit ack. For now, the watcher EMITS the events but the orchestrator does not auto-fire them; manual deep refresh CTA is the production path.

2. **Pre-IPO equity allowlist regex precision.** The `{company_slug}` substitution requires the source URL to contain the slug string anywhere. Some company sites use marketing subdomains (e.g., openai.com/blog vs careers.openai.com); the heuristic should match either. Tested against current cache URLs and works, but watch for false negatives on companies with unusual domain structures (e.g., dot-ai vs dot-com).

## End-to-end verification

- `node lib/layer3-event-watcher.mjs --detect` returns events.json correctly.
- `node lib/refresh-verifier.mjs` exports verifyCacheWrite + adversarialSecondPass + refuseToCommitWith.
- `node scripts/build-dashboard.mjs` clean; 4 inline scripts parse OK.
- `https://staging-dashboard.careers-ops.com/` Chrome MCP verified: 199 ↻ Deep refresh buttons, all correctly wired.

— refresh-ecosystem orchestrator, Phase 3
