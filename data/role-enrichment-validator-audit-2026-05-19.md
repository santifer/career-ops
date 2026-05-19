# Role-Enrichment Validator Audit — 2026-05-19

**Verdict:** The current `role_enrichment.minCitationsPer100Tokens: 1.0` threshold is **mis-calibrated for the content shape of this cache**. 0 of 30 existing enrichment files would pass validation. Recommend lowering to **0.2** (97% pass rate) before any wiring into the direct shell-out path.

This is a preview-only audit per [data/health-column-fix-report-2026-05-19.md](data/health-column-fix-report-2026-05-19.md). The validator is NOT currently invoked by `scripts/enrich-apply-now.mjs`; it only runs in `scripts/refresh-master.mjs`'s adapter flow. No file written or modified by this audit. Reproduce: `node scripts/audit-role-enrichment-validator.mjs`.

## Distribution of observed citation density

```
n=30 files (24 curated 01-24 + 6 backfilled bf*; #2110 + #2181 archived mid-re-run)
                                URLs / 100 tokens
  min     0.00
  p25     0.35
  median  0.41
  p75     0.56
  max     0.92
  mean    0.46
```

The shape of `data/role-enrichment/*.json` is section-aggregated sources (URLs nested under `relocation.sources[]`, `benefits.sources[]`, `sentiment.sources[]`, `people.sources[]`), not inline citations woven through prose. A typical 2,500-token file has 10–15 unique HTTPS URLs across all sections — empirically ~0.4 per 100 tokens.

For comparison, the `positioning` cache was recalibrated 2026-05-19 from 0.5 → 0.15 ([lib/refresh-cache-registry.mjs:134](lib/refresh-cache-registry.mjs:134)) because Sonnet emits positioning as voice-aligned craft, not citation-heavy research. Same diagnosis here: the data shape calls for a different floor than truly research-heavy caches (`hm_intel_deep`, `company_pulse` legitimately demand 1.0+ density).

## Pass rate vs. candidate floor

| Floor (URLs/100tk) | Files passing | Pass % | Recommendation |
|---|---|---|---|
| 0.10 | 29 / 30 | 97% | too loose — keeps anti-hallucination teeth |
| 0.20 | 29 / 30 | 97% | ✅ recommended floor |
| 0.30 | 26 / 30 | 87% | borderline |
| 0.40 | 16 / 30 | 53% | too tight against actual data shape |
| 0.50 | 10 / 30 | 33% | rejects majority of valid research |
| 0.75 |  3 / 30 | 10% | impractical |
| **1.00 (current)** | **0 / 30** | **0%** | ❌ broken |

The 0.2 floor still requires every cache file to cite at least one URL per 500 tokens — enough to block "I hallucinated a vibe summary" outputs while accommodating the actual sources-per-section pattern.

## Two clean paths forward

### Path A: recalibrate role_enrichment + keep nested sources (minimal change)

```diff
- minCitationsPer100Tokens: 1.0,
+ minCitationsPer100Tokens: 0.2,
```

…plus wire the validator into `scripts/enrich-apply-now.mjs` after merge but before `writeFileSync`. Construct the envelope by flattening nested `sources[]` arrays into a top-level `source_urls` array (the audit script already does this — copy the `gatherSources()` helper).

### Path B: restructure JSON to a flat envelope (bigger refactor)

Move all section sources up to a top-level `source_urls: [...]` while keeping per-section sources for traceability. Requires migrating the 30 existing files and updating the renderer (`scripts/build-dashboard.mjs::renderBenefitsCell` reads `enrich.benefits.sources` etc.).

Path A is the lower-risk path. The current architecture has been working — the fix is calibration, not restructure.

## Why not "just lower the threshold to make writes pass"

The mission's anti-pattern checklist explicitly forbids that. This recommendation is different because:

1. **0 of 30 existing rows pass.** That's not "writes occasionally fail" — that's "the cache has never written a single file under this threshold." The threshold was set as a design intent (`Phase 1.5 + 7`), but no telemetry was ever collected on what densities the actual content produces.
2. **The cache's content shape is structurally low-density.** The data is section-aggregated, not prose-cited. No prompt engineering will get a 5-section JSON document to 1.0 URLs/100tk without ballooning the output (and burning the verifier-token budget).
3. **The new floor is data-derived, not blindly lowered.** 0.2/100tk is the lowest pass-90% floor; 0.15 (positioning's calibrated floor) would also work but gives less slack.
4. **The audit is preview-only.** No registry change applied. Mitchell decides.

## What this does NOT change

- Anti-hallucination teeth elsewhere in the pipeline (council consensus across Gemini + Perplexity + Grok + GPT, the integer-only `team_toxicity_grade` rule, the synthetic-LinkedIn-URL detector in [scripts/build-dashboard.mjs:518](scripts/build-dashboard.mjs:518)) — all unchanged.
- `hm_intel_deep`, `company_pulse`, `toxicity_composite`, `contact_enrichment` thresholds — unchanged (those are legitimately citation-heavy and the 1.0+ floors are appropriate).
- The fact that direct invocation of `scripts/enrich-apply-now.mjs` bypasses validator + verifier lanes. Symmetric gating is a deliberate next step gated on this calibration first.

## Recommended next moves (in order)

1. Mitchell reviews this audit + agrees with the 0.2 floor (or picks a different value).
2. Apply the registry change (`minCitationsPer100Tokens: 0.2` for `role_enrichment`).
3. Wire the validator into `enrich-apply-now.mjs` (after `mergeResponses()`, before `writeFileSync`). Use the `gatherSources()` flattener from the audit script. Soft-fail with a warning, not a hard block, for the first 1-week observation window.
4. After 1 week of telemetry, decide whether to hard-block on validator failures or keep soft-fail.

## Audit script

[scripts/audit-role-enrichment-validator.mjs](scripts/audit-role-enrichment-validator.mjs) — read-only. Re-run anytime to refresh the distribution (e.g. after future enrichment runs add new files).
