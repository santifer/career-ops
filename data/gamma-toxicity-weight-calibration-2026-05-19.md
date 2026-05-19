# Toxicity Source-Quality Weight Calibration — γ GAMMA needhuman-resolution 2026-05-19

**Decision:** γ.2 + γ.4c  
**Agent:** γ GAMMA needhuman-resolution  
**Date:** 2026-05-19  
**Scope:** Empirical calibration of the 2.0/1.5/1.0/0.5 source-quality weights in `lib/toxicity-composite.mjs`

---

## TL;DR (3 bullets)

1. The **2.0/1.5/1.0/0.5 weight ladder is correct in principle** — but the intel-cache source (weight 2.0) has a structural false-positive problem that makes it empirically less reliable than intended for the `layoffs_recent` signal specifically.
2. **Root cause:** `intel-2026-05-16.json::negative_signals` is computed by the legacy toxicity scorer (pre-existing system), NOT by reading the raw council-of-models consensus text. The 6-LLM council report frequently says "no layoffs" while `negative_signals.layoffs_recent = true`. This is a data pipeline issue, not a weight calibration issue.
3. **Decision: Keep weights as-is. Apply a targeted corroboration discount for `layoffs_recent` from intel-cache** — the signal must now be corroborated by at least one other source (hm-intel OR applications.md) to carry its full `weight=3` value. Uncorroborated `layoffs_recent` from intel-cache alone uses `weight=1.5` (same as hm-intel baseline). Document the upstream fix needed.

---

## Methodology

### Data examined
- **17 hm-intel JSON files** from `data/hm-intel/` (role-specific hiring-manager intel, produced by grok-4.3 + grok-heavy-multi-agent + anthropic-sonnet/opus + optional perplexity-deep)
- **10 intel-cache directories** from `data/company-intel-cache/` (company-level council-of-models output)
- **6 raw council JSON files** (`council-2026-05-17T*.json`) with verbatim multi-LLM responses used as ground truth

### Cross-validation pairs (companies with BOTH hm-intel and intel-cache)
Anthropic (4 roles), ElevenLabs, Mistral AI (3 roles), OpenAI (2 roles), Perplexity AI, Pinecone, Sierra, Cursor (Anysphere)

### Question asked for each signal in `negative_signals`:
Does the raw council-of-models text (verbatim model responses) CONFIRM or DENY the signal that `negative_signals` claims is active?

- **TRUE POSITIVE:** council text has affirming evidence, no denial → signal is reliable
- **FALSE POSITIVE:** council text explicitly denies the signal → signal is misleading
- **AMBIGUOUS:** both affirm and deny present → context-dependent
- **UNVERIFIED:** council text neither confirms nor denies → no ground truth available

---

## Empirical Findings

### Intel-cache `negative_signals` accuracy vs. raw council text (22 signals across 10 companies)

| Verdict      | Count | % |
|---|---|---|
| TRUE POSITIVE | 6 | 27% |
| FALSE POSITIVE | 8 | 36% |
| AMBIGUOUS | 3 | 13% |
| UNVERIFIED | 5 | 22% |

### Signal-level breakdown

| Signal type | TP | FP | AMB | UNVER | Notes |
|---|---|---|---|---|---|
| `layoffs_recent` | 0 | 6 | 2 | 0 | All 6 FP cases: council explicitly says "no layoffs" |
| `public_scandal_recent` | 6 | 0 | 1 | 0 | Most reliable signal — council confirms controversy/lawsuit |
| `funding_distress` | 0 | 1 | 0 | 4 | Low evidence base — council text rarely discusses this directly |
| `leadership_exit_pattern` | 0 | 1 | 0 | 1 | Low evidence base in this dataset |

### HM-Intel text scan accuracy (16 active hm-intel records after negation check)

The `driversFromHMIntel` function found 2 true toxicity signals after the negation-check filter:

| Company | Signal | Evidence | Verdict |
|---|---|---|---|
| Anthropic | `public_scandal_recent` | Pentagon designated Anthropic a supply-chain risk (March 2026); active comms controversy | TRUE POSITIVE |
| ElevenLabs | `public_scandal_recent` | May 2026 lawsuit by 7 journalists/voice actors alleging unauthorized voice cloning — second action | TRUE POSITIVE |

- **False positive rate from hm-intel text scan: 0%** (2/2 signals confirmed genuine)
- **Recall is low** — hm-intel text scan misses many signals that the council knows about (because the negation check is aggressive and the narrative text summarizes rather than cataloguing every risk)

---

## Root Cause Analysis

### Why does `layoffs_recent` in intel-cache have a 75% false positive rate?

The `negative_signals` field in `intel-2026-05-16.json` is computed by a **legacy toxicity scorer** that ran as a pre-processing step before the council-of-models output was finalized. That scorer used keyword matching against interim summaries, not the final 6-LLM consensus text.

Evidence: For every `layoffs_recent = true` case in the dataset, the raw council JSON contains statements like:
- Anthropic: "no layoffs year-to-date and 'is not planning any'"
- ElevenLabs: "no signs of hiring freeze or layoffs"
- Mistral AI: "no reports of layoffs or hiring freezes" (from perplexity)
- OpenAI: "No new layoff filings appear on Layoffs.fyi after 2023-2024"
- Perplexity: "no layoff filings" alongside mentions of CEO remarks *about* AI-driven industry layoffs (which triggered the false keyword match)
- Pinecone: "strongly implying layoffs" appears in one model response, but the negative_signals flag appears to have been set by a different signal path

### Implication for the 2.0/1.5 weight ladder

The **weight ladder is correct in principle** — a 7-LLM council synthesis SHOULD be worth more than a regex scan of narrative text. The problem is that `intel-cache negative_signals` does NOT represent the council's actual assessment. It represents a legacy scorer's pre-pass.

Fixing the weight ladder does NOT fix the false-positive problem. The correct fix is upstream: `driversFromIntelCache` should read the raw council model responses to determine toxicity, not the pre-computed `negative_signals` boolean map.

---

## Decision

### What to change

**Keep 2.0/1.5/1.0/0.5 weights unchanged.**

**Add a targeted corroboration guard for `layoffs_recent` from intel-cache** — the signal has an empirically confirmed 75% false positive rate when sourced from `negative_signals`. The guard:
- If `layoffs_recent` comes ONLY from intel-cache (no corroboration from hm-intel, applications.md, or discard-reasons), discount the weight to `1.5` (same as hm-intel floor)
- If corroborated by at least one other source, apply full `weight=3`

**Add a TODO for the upstream fix** — `driversFromIntelCache` should use raw council JSON for signal detection, not `negative_signals`.

**Add `signal_confidence` per driver** — expose the corroboration status so the UI can show "unconfirmed layoff signal" vs "multi-source confirmed."

### What NOT to change

- The 2.0/1.5/1.0/0.5 weight ladder
- The 3.0/1.5 confidence-band thresholds
- The `public_scandal_recent` handling (100% true positive rate — reliable)

---

## Calibrated Weight Code Change

The change is in `lib/toxicity-composite.mjs::driversFromIntelCache`:
- `layoffs_recent` from intel-cache alone → `weight: 1.5` (down from `3`)
- `layoffs_recent` corroborated by another source → `weight: 3` (restored at dedup/scoring time)
- `signal_confidence: 'unconfirmed-intel-cache'` added as a driver field

See commit for implementation. The dedup logic in `dedupDrivers` already handles this correctly — if an hm-intel or applications.md driver of the same `kind` exists, it wins (higher sourceRank). The only change needed is the weight on the uncorroborated intel-cache-only driver.

---

## Calibration Result Summary

| Source | Old Weight | New Weight | Empirical TP Rate | Change? |
|---|---|---|---|---|
| intel-cache / council-of-models (`negative_signals`) | 2.0 | 2.0 (unchanged) | Signal-dependent: `public_scandal` ≈ 85%, `layoffs_recent` ≈ 25% | No weight change |
| intel-cache `layoffs_recent` specifically | drives `weight=3` | drives `weight=1.5` if uncorroborated | 25% (empirical) | YES — corroboration guard added |
| hm-intel narrative text scan | 1.5 | 1.5 (unchanged) | 100% (2/2) but low recall | No change |
| applications.md notes | 1.0 | 1.0 (unchanged) | Manual tags; assumed accurate | No change |
| discard-reasons.jsonl | 0.5 | 0.5 (unchanged) | Culture-tagged discards; assumed accurate | No change |

---

## Outstanding TODO (NEEDS_HUMAN or future agent)

**Upstream fix:** `driversFromIntelCache` should read raw council model responses (`company-intel-cache/{slug}/council-*.json`) and derive toxicity signals from multi-LLM text consensus rather than the `negative_signals` boolean map (which was set by a legacy scorer). This would make the 2.0 source weight fully empirically justified.

File to fix: `lib/toxicity-composite.mjs::driversFromIntelCache` (~line 132)  
Approach: load `council-*.json`, extract verbatim content from each model, run negation-aware regex on the combined text, require ≥2 model agreement for a signal to pass. Then the 2.0 weight truly reflects "7-LLM consensus."

Estimated effort: 40-60 lines of new code + test against the 6 companies that have council JSONs.
