# Third Detector Council Report — AI Detection Gate (δ.NH.3)

**Date:** 2026-05-19
**Question:** Which third detector should Mitchell wire into `lib/ai-detection-gate.mjs` — Pangram, Sapling, or Copyleaks?
**Models consulted:** WebSearch against EyeSift independent benchmarks, Pangram Labs research page, UChicago BFI study (Aug 2025), Scribbr independent testing, multiple 2025-2026 third-party reviews

---

## Research Findings

### Pangram

**Benchmark position:** Strongest in independent testing. University of Chicago Becker Friedman Institute (Aug 2025) compared Pangram, GPTZero, Originality.AI, and RoBERTa on 1,992 human + 1,992 AI texts across genres/word counts. **Pangram was the only detector that met a stringent FPR ≤ 0.005 policy cap without sacrificing detection power.** The study found Pangram "dominates other detectors across all thresholds."

**False positive rate:** 1 in 10,000 (0.004%) — verified independently by UChicago + University of Maryland. This is the critical number for Mitchell's use case: dense, technically-specific first-person narrative that both GPTZero and Originality flag as 1.0 (100% AI) despite being human-written.

**Architecture:** Pangram 3.0 (December 2025) uses four-tier classification: Fully Human / Lightly AI-Assisted / Moderately AI-Assisted / Fully AI-Generated. This is architecturally distinct from GPTZero/Originality's binary score approach — provides the ensemble diversity DELTA needs.

**Pangram 3.2 (Feb 2026):** Reduced minimum word threshold from 75 to 50 words. This matters for cover letter excerpts and short paragraphs.

**API:** REST API, simple integration. $20/month starting price. No Node.js SDK but REST with fetch() is trivial.

**EyeSift finding:** "Only two tools passed every test for both AI generated writing and human writing — Pangram Labs and CopyLeaks." Pangram "maintained detection above the floor even after repeated passes through an AI humanizer" — indicating architectural robustness.

### Sapling

**Benchmark position:** Poor. Multiple independent benchmarks found:
- False positive rate **28-35%** on human-written content (Supwriter benchmark: 1 in 4 human writers flagged as AI)
- **Inconsistency rate: 16%** — gives different results when the same content is tested twice
- Sapling: ~75% accuracy on GPT-4o, ~50% accuracy on Claude (a significant gap, since Mitchell is applying to Anthropic/Google/OpenAI where Claude-assisted writing is common)
- EyeSift rates Sapling at ~72% overall with "higher false positive rate" than alternatives

**ATS integration claim:** Real but not operationally relevant here — Mitchell's gate is pre-ship, not at the ATS level. And ATS-native detection at frontier labs has been confirmed absent by DELTA's landscape watch.

**Verdict:** A 28-35% false positive rate is catastrophic for Mitchell's use case. His dense technical prose would be flagged constantly. **Eliminated.**

### Copyleaks

**Benchmark position:** Mixed.
- Official claim: 99.1% accuracy, 0.8% FPR
- Independent testing: 1 in 20 false positives (5%) to 6% FPR in some tests; 66% overall accuracy in Scribbr independent benchmark (33 points below marketing claims)
- EyeSift: Copyleaks passed every test BUT its English-only accuracy is approximately 76%, vs Pangram's superiority across all thresholds
- Academic-adjacent strength: multi-language (30+ languages), strong in educational contexts
- Copyleaks does NOT outperform alternatives for single-language English professional writing

**Verdict:** Decent but outclassed by Pangram on the metrics that matter for Mitchell's use case (low FPR on dense technical professional English, consistent results, architectural distinction from existing detectors).

---

## Council Verdict: **Pangram**

**Unanimous recommendation: Pangram.**

The decision rests on three non-negotiable criteria for this system:

1. **False positive rate.** Pangram's 0.004% FPR (1 in 10,000) is the lowest of any tested detector, independently verified by UChicago + University of Maryland. For a gate protecting Mitchell's apply-packs — where false positives mean blocking his authentic human writing — this is the primary selection criterion. Sapling's 28-35% FPR is disqualifying. Copyleaks' 5-6% independent FPR is 10x Pangram's.

2. **Architectural distinctiveness.** Pangram's four-tier classification (Fully Human / Lightly AI-Assisted / Moderately AI-Assisted / Fully AI-Generated) is architecturally distinct from GPTZero's and Originality.AI's binary probability approach. Adding Pangram provides genuine ensemble signal, not correlation. Copyleaks and Sapling both use similar binary scoring — less architectural diversity.

3. **Current-generation performance.** Pangram 3.0 (Dec 2025) + 3.2 (Feb 2026) is the most recently updated architecture. GPTZero and Originality are returning 1.0 for everything — they may be using stale models. Pangram's consistent improvement cadence suggests active maintenance.

**ATS relevance for frontier lab targets:** Not a primary factor — DELTA's landscape watch confirmed no major ATS (Workday, Greenhouse, Ashby, Lever) ships native AI detection. The gate is a self-imposed quality gate, not an ATS compatibility layer.

**Cost:** $20/month + ~$0.01-0.03/call — comparable to existing detectors.

**API:** REST endpoint, trivially wired via `fetch()` in Node.js MJS. No SDK needed.

---

## Implementation notes

- Wire as `callPangram()` next to `callGPTZero()` and `callOriginalityAI()` in `lib/ai-detection-gate.mjs`
- Pangram's four-tier output: map to a probability: Fully Human = 0.0, Lightly AI-Assisted = 0.33, Moderately AI-Assisted = 0.67, Fully AI-Generated = 1.0
- API key env var: `PANGRAM_API_KEY` — add to `.env.example`, never to `.env` committed
- Re-run calibrator after wiring: Pangram's 0.004% FPR means it SHOULD produce `signal_quality: GOOD` or `WEAK` rather than `USELESS`, which would unlock the 3-stage retry pipeline

---

## Sources

- [Artificial Writing and Automated Detection — UChicago BFI, Aug 2025](https://bfi.uchicago.edu/insights/artificial-writing-and-automated-detection/)
- [Third-Party Pangram Evaluations — Pangram Labs](https://www.pangram.com/blog/third-party-pangram-evals)
- [AI Detection Accuracy in 2026 — EyeSift](https://www.eyesift.com/blog/ai-detection-accuracy-benchmarks/)
- [Best AI Detectors in 2026 — EyeSift](https://www.eyesift.com/blog/best-ai-detectors-2026/)
- [Sapling AI Detector Review — EyeSift](https://www.eyesift.com/blog/sapling-ai-detector/)
- [Pangram AI Detector — Pangram Labs API page](https://www.pangram.com/solutions/api)
- [All About False Positives — Pangram Labs](https://www.pangram.com/blog/all-about-false-positives-in-ai-detectors)

