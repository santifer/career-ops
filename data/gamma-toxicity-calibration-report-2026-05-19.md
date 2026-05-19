# γ GAMMA — Toxicity Source-Weight Calibration Report
## 2026-05-19 (Γ.13 — honest deliverable, not a fix)

Mitchell asked: "Let's calibrate then and wire that up: 'Toxicity source-quality weights (2.0/1.5/1.0/0.5) are authorial defaults, never calibrated against the 17 hm-intel ground-truth records.'"

This report walks the actual data, runs the empirical analysis I could run with what exists tonight, and lays out a calibration framework that needs more labeled data than we have. **It does NOT change the weights.** The honest answer is that the dataset doesn't support empirical calibration tonight, and faking calibration would be exactly the kind of "made up numbers" the original audit was about.

---

## Dataset inventory (what exists tonight)

| Source | Available |
|---|---|
| `data/company-intel-cache/{slug}/intel-*.json` (council-of-models) | **10 companies** |
| `data/hm-intel/{slug}*.json` | **18 records** (but most don't include `company_signals_90d` text content; aggregator finds 0 toxicity matches across all 18) |
| `data/applications.md` notes column | **15 manual toxic-related tags** across 137 rows |
| `data/discard-reasons.jsonl` culture-tagged | 0 records |

**Key empirical observation:** the live dataset is overwhelmingly council-of-models-driven. Across the 10 companies with active intel:

| slug              | score | conf  | weight | N drivers | source mix                                  |
|-------------------|-------|-------|--------|-----------|---------------------------------------------|
| openai            | 10/10 | high  | 11.0   | 6         | 5× intel-cache, 1× applications.md          |
| pinecone          |  9/10 | high  |  8.0   | 4         | 4× intel-cache                              |
| elevenlabs        |  7/10 | high  |  6.0   | 3         | 3× intel-cache                              |
| mistral-ai        |  7/10 | high  |  6.0   | 3         | 3× intel-cache                              |
| cohere            |  6/10 | high  |  6.0   | 3         | 3× intel-cache                              |
| anthropic         |  5/10 | high  |  4.0   | 2         | 2× intel-cache                              |
| cognition         |  5/10 | high  |  4.0   | 2         | 2× intel-cache                              |
| perplexity        |  5/10 | high  |  4.0   | 2         | 2× intel-cache                              |
| sierra            |  3/10 | low   |  1.0   | 1         | 1× applications.md                          |

~95% of confidence-weight comes from intel-cache drivers. Other sources barely contribute.

---

## What this means for the 2.0/1.5/1.0/0.5 weights

The weights only matter when **multiple source tiers fire for the same kind**. In the live data tonight:

1. **Most drivers come from intel-cache exclusively** (8 of 10 companies have only intel-cache drivers). The hm-intel / applications / discard tiers never fire for these — so the weights' relative ordering is irrelevant for those rows.
2. **`openai` is the only company with a mixed source-tier driver set** — 5 intel-cache + 1 applications.md. The applications.md driver adds 1.0 to the confidence_weight, bumping it from 10.0 to 11.0. Both are well past the `high ≥ 3.0` threshold, so the actual band doesn't change.
3. **`sierra` has 1 applications.md driver only** — confidence_weight 1.0, which lands in `low`. The relevant question is: would Mitchell agree this should be `low`? Without his explicit verdict, we can't validate.

**Empirically, the weights only differentiate confidence bands when:**
- A company has 1-2 drivers AND they come from the lower-weight tiers (applications.md or discard-reasons), but no council intel.

In the current dataset, **only `sierra` matches this pattern**. The other 9 either have rich intel-cache (always lands `high` regardless of weight scheme) or 0 drivers (always `low` regardless).

**The 2.0/1.5/1.0/0.5 weight ratio is currently only load-bearing on 1 row.** Calibrating those weights requires either (a) more rows that exercise the lower tiers, or (b) a held-out validation set with manual ground-truth labels.

---

## What honest calibration would require

To empirically calibrate the four weights, we'd need a labeled validation set:

1. **30+ companies with manual ground-truth labels** — Mitchell's actual after-the-fact verdict on whether the company was toxic (e.g., from Glassdoor verification, post-offer rescissions, post-hire churn at companies he ended up at, peer reports). The 15 toxic-related tags in applications.md are close, but they're Mitchell's interpretation of intel signals — not independent ground truth, since the lib reads from the same intel.
2. **For each labeled company, the driver source-mix** — does this company have intel-cache drivers, hm-intel drivers, etc.?
3. **A precision/recall analysis per source tier** — when intel-cache flagged toxic, was Mitchell's ground truth verdict toxic? When applications.md tags flagged toxic without intel-cache, was the ground truth verdict still toxic?

If intel-cache has 90% precision and applications.md has 50% precision, the 4× weight ratio (2.0 vs 0.5) is roughly correct. If they're equal, the weights are over-confident in council output.

**Without that data, the weights are authorial defaults — calibrated against intuition, not evidence.**

---

## What I did NOT do (and why)

**I did not change the 2.0/1.5/1.0/0.5 weights.** Changing them to "feel more calibrated" without empirical evidence would be exactly the kind of made-up-number authoring the original γ audit was meant to catch. The current weights are at least documented as authorial (per the audit + commit message); making them "look calibrated" without evidence would be regression.

**I did not run a calibration script that produces a misleading "calibrated" output.** A precision-recall analysis on 15 partially-correlated samples would be statistical theater — small enough that any conclusion is noise.

---

## What I DID do tonight (Γ.13 — implementation)

The Γ.13 deliverable is this report + three concrete operational changes that make future calibration possible:

1. **Document the empirical reality.** The weights currently only differentiate confidence on ~1 row in the live dataset. Future calibration only matters as the lower-tier source data grows.

2. **Lower the bar to ground-truth labeling.** I'm proposing — but not yet shipping — a `data/toxicity-overrides.jsonl` schema extension to carry `ground_truth_verdict: 'toxic'|'healthy'|'unknown'` + `verdict_basis: 'glassdoor'|'post-offer'|'peer-report'|'manual'` per slug. Once 30+ companies are labeled, a calibration script can compute per-source precision/recall.

3. **Surface the weights to the user in the drill-in** (done via Γ.17 already). The toxicity drill-in now shows `confidence (4.0)` with a tooltip that names the source weights. Mitchell sees the exact math, so when a number feels off he can debug it against the actual driver sources rather than just the verdict band.

---

## Recommendation

The 2.0/1.5/1.0/0.5 weights stay as-is until either:

1. **Mitchell labels 30+ companies** with `ground_truth_verdict`, and the calibration script can run a proper precision/recall analysis.
2. **The lower-tier source data grows** (more applications.md tags, more discard-reasons culture entries) such that more than 1 row is sensitive to the weight ratio.

In the meantime, the weights are documented as authorial defaults, the framework is in place to calibrate them empirically, and the dashboard surfaces the exact confidence_weight number so the user can decide whether to trust it on each row.

This is the honest answer. Calibrating to authorial preference and labeling it empirical would be the audit's original sin, in reverse.

— γ GAMMA
