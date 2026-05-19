# DELTA — Vendor Claim Audit (Task Δ.3)

**Audited at:** 2026-05-19
**Auditor:** DELTA instance (single-agent end-to-end)
**Purpose:** for every accuracy/performance claim each detector vendor publishes, mark VERIFIED (with peer-reviewed citation) or `[VENDOR-CLAIMED, UNVERIFIED]`. This audit feeds the Anti-Sycophancy charter — every claim downstream code prints about detector accuracy MUST resolve to a row here.

## Scope

Detectors in DELTA's stack:
1. GPTZero v2 (`https://api.gptzero.me/v2/predict/text`)
2. Originality.ai v1 (`https://api.originality.ai/api/v1/scan/ai`)

## Method

I read each vendor's marketing claims and cross-checked against:
- Peer-reviewed accuracy studies (Stanford HAI, Liang et al., Sadasivan et al., MITRE)
- My own empirical baseline from `data/ai-detection-calibration/baseline-2026-05-19.md`

Where no peer-reviewed citation exists OR my own baseline contradicts the vendor claim, the row is marked `[VENDOR-CLAIMED, UNVERIFIED]` or `[VENDOR-CLAIMED, CONTRADICTED BY DELTA BASELINE]`. The empirical baseline is the load-bearing data — it tested both detectors on 5 human samples (Mitchell's actual writing) and 3 AI decoys.

## GPTZero v2 — claim audit

| # | Vendor claim | Status | Notes |
|---|---|---|---|
| 1 | "99% accuracy" / "industry-leading detection" (marketing copy on gptzero.me homepage) | **[VENDOR-CLAIMED, CONTRADICTED BY DELTA BASELINE]** | DELTA baseline: 5/5 human samples scored `average_generated_prob = 1.0` (max AI prob). That is a 100% false-positive rate on Mitchell's verified-human writing. The "99% accuracy" claim cannot be reconciled with 100% FPR on a 5-sample human baseline; either the claim refers to ROC-AUC against a specific eval corpus (not stated) or it does not apply to writing patterns like Mitchell's. |
| 2 | "Detects AI in essays, articles, and academic work" | **[VENDOR-CLAIMED, NARROW APPLICABILITY]** | Likely true for the academic essay distribution GPTZero was trained on. Mitchell's voice — narrative + metric register with em-dash density 14× per 5 paragraphs — falls outside the training distribution per the DELTA baseline. |
| 3 | "Sentence-level highlights" | **VERIFIED via field audit** | Δ.1 audit confirmed `documents[0].sentences[].generated_prob`, `highlight_sentence_for_ai`, `perplexity`, and `interpretability_designation` fields are returned. The values themselves track the document-level prob — all sentences in a "1.0 document" are reported with high `generated_prob`. |
| 4 | "Burstiness analysis" | **PARTIALLY VERIFIED** | `documents[0].overall_burstiness` field IS returned (Δ.1 audit). Value was 0 on both human + AI samples in the audit — same lack of separation as the overall score. The metric exists but its discriminative power on Mitchell's voice is unverified. |
| 5 | Liang et al. (2023) — GPT detectors are biased against non-native English writers (false-positive rate dramatically elevated) | **VERIFIED via external peer-reviewed source** | Source: Liang, Yuksekgonul, Mao, Wu, Zou, "GPT detectors are biased against non-native English writers," Patterns (Cell Press), July 2023. arXiv:2304.02819. Applies tangentially — Mitchell is native English speaker, but the paper establishes that GPTZero false-positive rates can be ≥50% on specific human-writing distributions. |
| 6 | Sadasivan et al. (2023) — "Can AI-Generated Text be Reliably Detected?" — formal proof that detectors approach random with sufficiently adversarial paraphrasing | **VERIFIED via external peer-reviewed source** | Source: Sadasivan, Kumar, Balasubramanian, Wang, Feizi, arXiv:2303.11156, March 2023. The paper formalises the theoretical ceiling on detection — any GPTZero-class detector can be brought to near-random by simple paraphrasing pipelines. Implication: a detection-evasion strategy is a moving target chase; an authenticity-strategy is what DELTA optimises for. |

## Originality.ai v1 — claim audit

| # | Vendor claim | Status | Notes |
|---|---|---|---|
| 7 | "99%+ AI content detection accuracy" (homepage marketing) | **[VENDOR-CLAIMED, CONTRADICTED BY DELTA BASELINE]** | DELTA baseline: 5/5 human samples scored `score.ai = 0.9999` (max AI prob). 100% FPR on Mitchell's verified-human writing. Same diagnosis as GPTZero claim #1. |
| 8 | "Trained on the latest models including GPT-4, Claude, Gemini" | **[VENDOR-CLAIMED, UNVERIFIED]** | No public eval methodology published. Originality's training set is proprietary. Cannot verify or contradict. |
| 9 | "Aggregate-only scoring (no sentence breakdown)" | **VERIFIED via field audit** | Δ.1 audit confirmed `score.{ai, original}` are document-level only. No `sentences[]` array in the response. The dashboard's sentence-highlight callout sources EXCLUSIVELY from GPTZero's per-sentence data. |
| 10 | "Plagiarism + AI in one call" | **VERIFIED** | The v1 endpoint `/api/v1/scan/ai` returns AI score only; plagiarism is a separate endpoint. Marketing copy "in one call" refers to other Originality products, not the AI endpoint used here. |

## Correction (added 2026-05-19 post-Δ.5)

The original P0 commit message claimed "Audited cover-letter.mjs + cv-tailor.mjs retry pipelines for model-switching-as-evasion: NONE FOUND. Retries reuse the same modelKey with a stricter system prompt." That claim is **narrower than originally stated**. The Δ.5 adversarial review surfaced the missing nuance:

- `scripts/agents/cover-letter.mjs:376` and `scripts/agents/cv-tailor.mjs:444` both contain `const modelKey = input?.config?.model || 'openai:gpt-5'`.
- The RETRY PIPELINE itself (`lib/ai-detection-retry.mjs`) does NOT switch models — it receives an opaque `regenerate()` callback and re-invokes it across all 3 stages with the same model.
- BUT upstream orchestrators (build-apply-packs.mjs, apply-pack-orchestrator) can pass a DIFFERENT `config.model` per artifact. That is by-design diversity-of-voice (Haiku critics, Sonnet author, Opus adjudicator per the original architectural spec) — not detection evasion.
- The correct claim: "The retry pipeline cannot switch models within a single artifact's retry loop. Per-artifact model variance is preserved by design upstream of the retry pipeline."

The original commit message has been re-marked as "narrowed-claim" via this correction. The architecture is correct; the prior claim was overconfident in scope.

## Hallucination-penalty self-check

Per the Anti-Hallucination Charter: every vendor field referenced in code must resolve to a field name observed in the Δ.1 audit. Cross-check against `lib/ai-detection-gate.mjs` after this audit landed:

- `data.documents[0].sentences[].generated_prob` — present in Δ.1 ✓
- `data.documents[0].sentences[].highlight_sentence_for_ai` — present in Δ.1 ✓
- `data.documents[0].overall_burstiness` — present in Δ.1 ✓
- `data.documents[0].class_probabilities` — present in Δ.1 ✓
- `data.documents[0].predicted_class` — present in Δ.1 ✓
- `data.documents[0].confidence_category` — present in Δ.1 ✓
- `data.score.ai` and `data.score.original` (Originality) — present in Δ.1 ✓

No fabricated field references found in the new code.

## Downstream rule

Any future DELTA code, dashboard surface, or sunrise brief that prints a detector accuracy claim ("GPTZero says X% accurate") MUST cite a row from this audit. If a marketing claim is needed and has no peer-reviewed citation, prefix with `[VENDOR-CLAIMED]` or omit. Honest signal-quality reporting is the whole point of DELTA's existence — sycophantic claims about detector quality are the failure mode this audit prevents.

## What is NOT in scope here

- Comparison with Turnitin, Copyleaks, Crossplag, Sapling, ZeroGPT — not used by the career-ops pipeline; calibrating against them would dilute focus.
- Originality's plagiarism scoring — separate endpoint, separate calibration if/when added.
- A live benchmark across many human samples — the DELTA baseline (5 humans + 3 AI decoys) is small but sufficient to establish that the binary pass/fail use case is broken. A larger benchmark is on the EPSILON pre-IPO portal-expansion roadmap if signal-quality changes.
