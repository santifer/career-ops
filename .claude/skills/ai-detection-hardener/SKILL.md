---
name: ai-detection-hardener
description: Harden the AI-detection pipeline — audit detector API field shapes, recalibrate the band thresholds against Mitchell's voice corpus, run the gate against an artifact, or refresh the ATS-detection landscape watch. Slash-command wrapper around `scripts/agents/ai-detection-hardener.mjs`. The agent itself is band-aware (CLEAR / MED / HIGH / CRIT) anchored to Mitchell's voice baseline, treats signal_quality as a first-class output (GOOD / WEAK / USELESS / UNCALIBRATED), and refuses to BLOCK ship on USELESS-signal noise. Triggers when Mitchell types /ai-detection-hardener, says "harden the AI detection pipeline," "recalibrate detection bands," "audit detector field shapes," "review ATS landscape for detection deployment," "is GPTZero giving real signal," "check what the gate says about this artifact," or any phrasing that wants the detection layer interrogated rather than blindly trusted.
user_invocable: true
args: mode
argument-hint: "[field-audit | recalibrate | ats-watch | all | --check <path>] (default: all)"
---

# ai-detection-hardener — DELTA's authenticity / AI-detection sub-agent

## Purpose

GPTZero and Originality.ai are not oracles. The DELTA 2026-05-19 baseline showed both detectors score Mitchell's authentic prose (cv.md, the voice-reference canonical exemplar, article-digest.md) identically to generic AI sludge — both return `prob = 1.0`. Treating those scores as a binary pass/fail blocks every legitimate ship under a guaranteed false positive.

This skill exists so Mitchell can interrogate the detection layer at any time:
- **field-audit** — what does each detector ACTUALLY return today? (Anti-hallucination guard before code references new fields.)
- **recalibrate** — refresh the empirical baseline that anchors the bands.
- **check <path>** — what does the gate say about THIS artifact (with all the granular signals, not just the binary verdict)?
- **ats-watch** — has any ATS platform shipped native AI-text detection in the last 90 days?

## Modes

| Mode | What it does | Spend |
|---|---|---|
| `--field-audit` | Calls GPTZero v2 + Originality.ai v1 ONCE each with a known-human + known-AI sample. Logs actual response field shapes to `data/delta-detector-field-audit-<DATE>.md`. Required before code references a new detector field. | ~$0.08 |
| `--recalibrate` | Re-runs `scripts/ai-detection-calibrate-baseline.mjs --refresh` against the voice corpus. Refuses to write `current-thresholds.json` if sample size < 20 human + 10 AI OR if human-max ≥ AI-min on any detector (the AAA-1 + AAA-2 fail-secure guards). On degenerate baseline → exit 2, gate falls back to absolute thresholds. | ~$0.16-0.40 |
| `--check <path>` | Runs the gate against a single artifact. Returns band + gateBlocks + signal_quality + top-5 flagged sentences. Useful for ad-hoc verification of any cover-letter / CV / form-fields artifact. | ~$0.02 |
| `--ats-watch` | Stub — delegates to `/researcher` for a 90-day ATS-detection landscape watch. Manual trigger only. The previous watch (2026-05-19) found no major ATS ships native AI-text detection. | $5-8 (manual) |
| `--all` (default) | Runs field-audit + recalibrate. Skips check (needs a path arg) and ats-watch (LLM-spend). | ~$0.24-0.48 |

## Triggers

- "harden the AI detection pipeline"
- "recalibrate detection bands"
- "audit detector field shapes"
- "review ATS landscape for detection deployment"
- "is GPTZero giving real signal"
- "check what the gate says about <artifact>"
- "/ai-detection-hardener"

## Example invocations

```
# Snapshot current detector field shapes (anti-hallucination guard)
node scripts/agents/ai-detection-hardener.mjs --field-audit

# Refresh calibration baseline (will refuse to write thresholds under current 8-sample corpus)
node scripts/agents/ai-detection-hardener.mjs --recalibrate

# Interrogate the gate on a single artifact
node scripts/agents/ai-detection-hardener.mjs --check apply-pack/048-anthropic-engineering-editorial-lead/cover-letter.md

# Default: field-audit + recalibrate
node scripts/agents/ai-detection-hardener.mjs --all
```

## Outputs

| Mode | Output file(s) |
|---|---|
| `--field-audit` | `data/delta-detector-field-audit-<DATE>.json` + `.md` |
| `--recalibrate` | `data/ai-detection-calibration/baseline-<DATE>.json` + `.md` + `current-thresholds.json` (only on non-degenerate baseline) |
| `--check`        | stdout JSON + top-5 flagged sentence list |
| `--ats-watch`    | `data/delta-ats-watch-runner-<DATE>.md` (delegation note) |

## Architecture references

- Gate: `lib/ai-detection-gate.mjs` — band assignment, signal-quality classification, sentence-level highlights, frontmatter-cloak defence, provenance check.
- Retry pipeline: `lib/ai-detection-retry.mjs` — 3-stage stricter prompts (band-aware → sentence-level → voice-corpus-anchored). Currently feature-flagged behind `DELTA_RETRY_ENABLED=true`; will fire automatically once a real ≥20-human + ≥10-AI corpus produces WEAK or GOOD signal quality.
- Voice corpus: `lib/voice-corpus.mjs` — index of Mitchell's known-human writing samples. The calibration baseline depends on this; updates to cv.md / article-digest.md / writing-samples/voice-reference.md / data/voice-reference-brief.md should be followed by a `--recalibrate` run.
- Calibrator: `scripts/ai-detection-calibrate-baseline.mjs` — derives bands from corpus + AI decoys; writes `_provenance.baseline_sha256` for tamper detection.

## Anti-hallucination + anti-sycophancy notes (read before invoking)

- **Anti-hallucination:** every detector field referenced in `lib/ai-detection-gate.mjs` must resolve to a field name observed in the most recent `--field-audit`. If a code change references a field not in the audit, run `--field-audit` first.
- **Anti-sycophancy:** the previous gate's "you passed the test" behaviour was a silent no-op (100% FPR on Mitchell's voice). The new gate's `signal_quality` field exists specifically to refuse sycophantic claims. If signal_quality is USELESS, **the gate is admitting it has no signal** — do not claim the artifact "passed" on that result.
- **Vendor accuracy claims** ("99% accuracy") are flagged `[VENDOR-CLAIMED, CONTRADICTED BY DELTA BASELINE]` in `data/delta-vendor-claims-2026-05-19.md`. If a future skill print-out cites a detector accuracy figure, it MUST cite a row in that audit.

## Limitations

- Sample size on the 2026-05-19 baseline (5 human + 3 AI) is statistically insufficient to support a USELESS / WEAK / GOOD classification with confidence. The calibrator now refuses to write thresholds under those sample counts (AAA-1 fix). To unblock the band-driven path, expand the corpus to ≥20 human + ≥10 AI decoys (decoys sourced from independent third parties, not the engineer writing the gate).
- Originality.ai v1 returns no per-sentence data; sentence-level highlights come exclusively from GPTZero.
- The retry pipeline (3-stage stricter prompts) has no empirical validation yet — feature-flagged off until WEAK or GOOD signal quality is achieved on a real corpus.
