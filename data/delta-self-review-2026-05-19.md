# DELTA Self-Review — Adversarial Critique of AI-Detection Hardening

**Reviewed at:** 2026-05-19
**Council:** Perplexity Sonar Deep Research + xAI Grok-4-x-search + OpenAI GPT-5 (GPT-5 returned empty content — reasoning-token-exhausted at 6k cap; effective council = Sonar Deep + Grok)
**Files under review:** `lib/ai-detection-gate.mjs`, `lib/ai-detection-retry.mjs`, `scripts/ai-detection-calibrate-baseline.mjs`, `dashboard-server.mjs:248-304`, baseline + claim + landscape + test-verify markdowns.
**Empirical verification:** Attack C reproduced live; cover-letter/cv-tailor model-switching grep counterclaim reproduced live.

---

## Lead finding — AAA

**AAA-0 (lead): The current calibration converts the AI-detection layer from "annoying but conservative" into a permanent silent no-op.**

`current-thresholds.json` was derived from an 8-sample baseline where every score is 1.0. Every band collapses to a single point: `CLEAR.max == CRIT.min == 1.0`. `signalQuality()` returns `USELESS` for both detectors (gap = 0 < 0.05 threshold). `buildResult()` (lib/ai-detection-gate.mjs:332-336) then forces `passes = true` for every artifact regardless of probability. The gate looks operational from the dashboard — bands render, advisories surface — but it has **zero true-positive capability** in production today. Both Sonar and Grok converge on this as the worst regression: a 100% false-positive gate is annoying and discoverable; a 0% true-positive gate looks healthy while shipping AI prose. This is a fail-secure → fail-open inversion (Saltzer & Schroeder 1975; OWASP fail-secure principle).

---

## All findings, ranked

### AAA — must-fix-tonight

**AAA-1. Calibration baseline is statistically invalid for the "USELESS detector" conclusion.**
8 samples (5 human + 3 AI decoy) with zero variance across all scores. Sadasivan et al. 2023 (arXiv:2303.11156) used hundreds-to-thousands of passages to characterize AUROC. RAID benchmark (Dugan et al. ACL 2024, arXiv:2405.07940) uses 6M+ generations across 11 models × 11 attacks × 4 decoding strategies. Liang et al. 2023 (arXiv:2304.02819) analyzed >500 non-native English samples for the bias finding. Rasch calibration guidance recommends 30-50 well-targeted observations per item for ±1-logit stability. **8 samples cannot support a "detectors are USELESS" conclusion** that gates every downstream pipeline decision. The length asymmetry compounds this: Mitchell samples 720-6303 words vs. decoys 47-100 words violates GPTZero's documented short-text instability. Decoys were authored by the same engineer designing the gate (selection-bias confound). The 1.0-everywhere outcome likely reflects single-author / single-register / single-domain over-saturation more than detector capability.

**AAA-2. `current-thresholds.json` has no provenance, signing, or sanity validation — calibration-poisoning attack is fully viable.**
`loadCalibratedThresholds()` (lib/ai-detection-gate.mjs:207-217) reads the file at module load, JSON-parses, caches in `CACHED_THRESHOLDS`. No SHA, no expected-hash compare, no ordering check (`CLEAR.max < MED.min < HIGH.min < CRIT.min`), no degenerate-thresholds guardrail. Verified: `grep` for `sha256|hmac|signature|verify|provenance` in `lib/ai-detection-gate.mjs` + `scripts/ai-detection-calibrate-baseline.mjs` returns zero hits. The file IS git-tracked (no `.gitignore` entry for `data/ai-detection-calibration/`). Attack vector: a bad-faith agent commits a single-line patch to `current-thresholds.json` with `derived_at: "..." ` truthy and bands collapsing to a single point — every artifact ships under `signal_quality: USELESS` permanently. There is no audit trail beyond `git blame` and no runtime check that fails closed on detected tampering. **Fix tonight: add `_provenance_sha` field (SHA-256 of baseline JSON it was derived from) and a runtime check that recomputes the hash from `baseline-{date}.json` and refuses to load on mismatch.**

**AAA-3. `extractProseText` frontmatter-cloak attack is empirically viable.**
Reproduced live tonight against current code:
```js
const input = `---\n\n[AI-decoy 442-byte body]\n\n---\n\nbenign tail\n`;
extractProseText(input)  // → "benign tail"  (11 bytes, 2 words)
```
The `body.matchAll(/^---$/gm)` regex finds both the leading `---` (index 0) and the closing `---` (after the AI prose); `body.slice(sepMatches[1].index + 3)` discards everything from byte 0 through the second `---`. An attacker wraps AI-generated content between any two `---` separators with the doc starting on `---` and the detector sees nothing flaggable. **Fix tonight: limit frontmatter strip to the FIRST matched `---...---` pair, requiring `lines[0] === '---'` AND finding the next `---` on a subsequent line (not the last `---` in the document).** Sonar and Grok both flagged this independently; my live test confirmed exploitation.

**AAA-4. Gate logic is fail-open under uncertainty — opposite of fail-secure default-deny.**
Lines 332-336 of `ai-detection-gate.mjs`:
```js
const gateBlocks = (band === 'CRIT') && (gzSignalQuality === 'GOOD' || origSignalQuality === 'GOOD');
if (gateBlocks) passes = false;
else if (gzSignalQuality === 'USELESS' && origSignalQuality === 'USELESS') passes = true;
```
There is no "AI detection unavailable: human ack required" intermediate state. Defense-in-depth and fail-secure design (Saltzer & Schroeder; NIST SP 800-160) require that ambiguous instrumentation defaults to denying access, not permitting it. The dashboard already exposes `priority: 'ADVISORY'` for this case — the gate should mirror that and require an explicit `--ack-detection-degraded` operator flag (or sidecar-JSON-with-signed-acknowledgment) to ship.

**AAA-5. 264-line retry pipeline is dead code and has never executed end-to-end.**
`runDetectionRetryPipeline` short-circuits at lines 133-160 to `SIGNAL_USELESS` whenever both detectors are USELESS — which, under the 2026-05-19 baseline, is always. The author's own `delta-test-verify-2026-05-19.md` admits: "live retry verification deferred until a detector with GOOD signal quality is introduced." `node --check` (syntax) + "hand-traced" is not testing. The 3-stage hypothesis (band-aware → sentence-level → voice-corpus-anchored stricter prompt reduces GPTZero score on re-prompt with same model) has zero published empirical support. **Either gate the retry pipeline behind a feature flag and remove it from the prod build, or write at least one integration test that uses a synthetic GOOD-signal-quality fixture to prove Stage-1/2/3 actually lowers `gptzero_prob`.**

### AA — should-fix-tonight

**AA-1. "No model-switching evasion" claim is contradicted by the code itself.**
`scripts/agents/cover-letter.mjs:376` and `scripts/agents/cv-tailor.mjs:444` both contain:
```js
const modelKey = input?.config?.model || 'openai:gpt-5';
```
Model is runtime-configurable via the upstream caller's config object. An apply-pack orchestrator can pass `config.model: 'anthropic:claude-opus-4-7'` for one artifact and `'xai:grok-4'` for another. The DELTA Δ.3 audit grep'd for hard-coded model strings inside the retry pipeline (which correctly does not switch models) but missed the orchestrator-injected `config.model` path. **The claim should be narrowed to: "the retry pipeline itself does not switch models; upstream callers can still vary the model per artifact, which is by design but should be documented."**

**AA-2. `VOICE_ANCHOR` constant goes stale silently.**
`lib/ai-detection-retry.mjs:49-55` hard-codes a 2026-05-19 snapshot of two paragraphs from `writing-samples/voice-reference.md`. There is no test that fires when `voice-reference.md` is edited. If Mitchell rewrites the canonical exemplar tomorrow, Stage-3 retry will anchor to obsolete text. **Either load lazily from disk on first call (with a 1-hour cache) or add a CI test that compares the inlined `VOICE_ANCHOR` to the first two paragraphs of `voice-reference.md` and fails on mismatch.**

**AA-3. Empty `sentences` array yields false-OK on CRIT artifacts.**
`gz_sentences = gptzero?.sentences ?? []`. If a future GPTZero API change returns `sentences: []` or omits the field, the editing-priority callout reports `flagged_sentence_count: 0` and shows ADVISORY priority on a genuinely CRIT artifact. Add: if `gptzero?.prob > 0.8` AND `sentences.length === 0`, force `flagged_sentence_count = -1` (sentinel) and surface as REVIEW priority with a "no sentence breakdown available" advisory.

### A — log for next session

**A-1. Sentence-length normalisation attack (Attack D).**
Detectors do not normalise per-sentence padding. An attacker can pad suspect sentences with neutral connector tokens to drop `generated_prob` below honest sentences in the top-5 sort. Mitigation: also sort by `perplexity` or weight by sentence length.

**A-2. Test fixture for a "GOOD signal quality" baseline.**
Build a synthetic calibration baseline where human-max = 0.40 and AI-decoy-min = 0.85 (large gap → GOOD signal) and use it as a unit-test fixture for the retry pipeline. Without this, the retry pipeline cannot be CI-tested.

**A-3. Calibration deterministic-rerun check.**
GPTZero and Originality scores are NOT guaranteed deterministic on identical input (per public docs + community testing). Add a calibration sub-step that runs each sample 3x and reports mean ± stddev. If stddev > 0.05 on any sample, flag the calibration as noisy.

**A-4. Stale-baseline rotation policy.**
Add a CI check that fails the build if `current-thresholds.json.derived_at` is more than 90 days old.

### B — observations

**B-1. The vendor-claims audit is honest about the GPTZero/Originality "99% accuracy" marketing being contradicted by the DELTA baseline — but the baseline itself (8 samples) is not robust enough to make that contradiction stick.** The audit's framing should soften: "GPTZero's 99% accuracy claim is unverified against Mitchell's writing distribution; a larger benchmark is needed before stronger contradiction." Currently reads as both rigorous (claims are flagged unverified) and sycophantic-toward-the-design (because the contradiction makes the new gate's permissive behavior look principled).

**B-2. The ATS-landscape watch's "headline finding" (no major ATS ships native AI-text detection) is well-cited but the policy implication ("no code change required tonight") implicitly assumes the recruiter-side manual GPTZero/Originality check is the only threat surface. If Mitchell is applying through a portal that integrates with a third-party detection vendor not on the watch list (e.g. CrossPlag, Sapling, ZeroGPT, Turnitin in the academic-adjacent space), the threat model is incomplete.** The audit explicitly scopes those out as "not used by the career-ops pipeline" — but that's a self-fulfilling scope, not a verified absence-of-detection.

**B-3. The Δ.4 test-verify document confirms apply-pack 048 would ship under the new gate. This is consistent with the design intent but, given AAA-0/4, it's also evidence that the gate cannot stop AI prose from shipping — which is the very thing the original gate was meant to do.** The test passes by design; it doesn't validate that the gate would block a genuinely-AI artifact (because no GOOD-signal-quality detector exists today, the test cannot exercise the block path).

---

## Specific code patches recommended (concrete pseudo-diffs)

### Patch 1 — fail-secure default + degenerate-thresholds guard (AAA-1, AAA-2, AAA-4)
```diff
 // lib/ai-detection-gate.mjs
 function loadCalibratedThresholds() {
   const path = join(ROOT, 'data', 'ai-detection-calibration', 'current-thresholds.json');
   if (!existsSync(path)) return FALLBACK_THRESHOLDS;
   try {
     const t = JSON.parse(readFileSync(path, 'utf-8'));
+    // Sanity validation: bands must be strictly ordered; degenerate calibration
+    // (e.g. CLEAR.max >= CRIT.min) falls back to FALLBACK_THRESHOLDS.
+    for (const det of ['gptzero','originality']) {
+      const d = t[det];
+      if (!d?.CLEAR || !d?.CRIT) return FALLBACK_THRESHOLDS;
+      if (d.CLEAR.max >= d.CRIT.min) {
+        console.warn(`[ai-detection-gate] degenerate ${det} bands; falling back`);
+        return FALLBACK_THRESHOLDS;
+      }
+    }
+    // Provenance: thresholds must declare which baseline JSON they derived from,
+    // and the SHA-256 of that baseline must match the file on disk.
+    if (t._provenance?.baseline_path && t._provenance?.baseline_sha256) {
+      const baselineBytes = readFileSync(join(ROOT, t._provenance.baseline_path));
+      const actualSha = createHash('sha256').update(baselineBytes).digest('hex');
+      if (actualSha !== t._provenance.baseline_sha256) {
+        console.warn(`[ai-detection-gate] thresholds provenance mismatch; falling back`);
+        return FALLBACK_THRESHOLDS;
+      }
+    } else {
+      console.warn('[ai-detection-gate] thresholds missing _provenance; falling back to absolute thresholds');
+      return FALLBACK_THRESHOLDS;
+    }
     return t;
   }
   catch { return FALLBACK_THRESHOLDS; }
 }
```
Plus `scripts/ai-detection-calibrate-baseline.mjs` writes `_provenance: { baseline_path, baseline_sha256 }` alongside `derived_at`.

### Patch 2 — fix the frontmatter-cloak (AAA-3)
```diff
 export function extractProseText(raw) {
   let body = raw;
-  if (/^---\s*$/m.test(body.split('\n')[0] || '')) {
-    const sepMatches = [...body.matchAll(/^---$/gm)];
-    if (sepMatches.length >= 2) {
-      body = body.slice(sepMatches[1].index + 3).trim();
-    }
-  }
+  // Strip frontmatter ONLY at the start of the document, and only the FIRST
+  // ---...--- pair. Mid-document --- separators are preserved as section
+  // breaks. Closing fence must be on a subsequent line; if absent, do NOT
+  // strip (avoids the frontmatter-cloak evasion where AI prose is wrapped
+  // between two --- markers and a benign tail is left behind).
+  const lines = body.split('\n');
+  if (lines[0]?.trim() === '---') {
+    const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
+    if (closeIdx > 0 && closeIdx < lines.length - 1) {
+      // Frontmatter must be plausibly short (≤30 lines, ≤500 chars) to be
+      // accepted as metadata rather than a smuggled body block.
+      const fmBytes = lines.slice(0, closeIdx + 1).join('\n').length;
+      if (closeIdx <= 30 && fmBytes <= 500) {
+        body = lines.slice(closeIdx + 1).join('\n').trim();
+      }
+    }
+  }
   body = body.replace(/```[\s\S]*?```/gm, '');
   // ... rest unchanged ...
 }
```

### Patch 3 — fail-secure when both detectors are USELESS
```diff
 // lib/ai-detection-gate.mjs
   const gateBlocks = (band === 'CRIT') && (gzSignalQuality === 'GOOD' || origSignalQuality === 'GOOD');
   if (gateBlocks) {
     passes = false;
-  } else if (gzSignalQuality === 'USELESS' && origSignalQuality === 'USELESS') {
-    passes = true; // both detectors useless → no signal → don't block on noise
+  } else if (gzSignalQuality === 'USELESS' && origSignalQuality === 'USELESS') {
+    // Both detectors useless → no auto-pass. Surface as DEGRADED and require
+    // explicit operator acknowledgment via opts.ackDetectionDegraded.
+    passes = opts?.ackDetectionDegraded === true ? true : null;
+    // null = "unchecked" → orchestrator must surface a UI prompt or block.
   }
```
Plus orchestrator change: when `passes === null` and `signal_quality === USELESS` on both detectors, prompt Mitchell with "AI detection is calibrated USELESS today; ship anyway? [y/N]" and only proceed on explicit `y`.

### Patch 4 — voice-anchor staleness check
```diff
 // lib/ai-detection-retry.mjs
-const VOICE_ANCHOR = `EXAMPLE OF MITCHELL'S AUTHENTIC PROSE...`;
+function loadVoiceAnchor() {
+  // Read the canonical voice reference at first call. If the file is missing
+  // (test/headless context), fall back to the inlined 2026-05-19 snapshot.
+  try {
+    const text = readFileSync(join(ROOT, 'writing-samples/voice-reference.md'), 'utf8');
+    // First two ## sections after a # H1, or first 2 paragraphs after frontmatter.
+    const paras = text.split(/\n\n+/).filter(p => p.length > 200).slice(0, 2);
+    if (paras.length) return paras.join('\n\n');
+  } catch {}
+  return INLINE_VOICE_ANCHOR_FALLBACK_2026_05_19;
+}
+let _voiceAnchorCache = null;
+function voiceAnchor() {
+  if (!_voiceAnchorCache) _voiceAnchorCache = loadVoiceAnchor();
+  return _voiceAnchorCache;
+}
```

### Patch 5 — calibrate-baseline should validate decoys + sample size
```diff
 // scripts/ai-detection-calibrate-baseline.mjs
+  // Refuse to derive bands from a degenerate baseline.
+  if (human_results.length < 20 || ai_results.length < 10) {
+    console.error('[calibrate] sample size too small (need ≥20 human + ≥10 AI); writing baseline JSON for inspection but NOT writing current-thresholds.json');
+    writeFileSync(jsonPath, JSON.stringify({ summary, human_results, ai_results, thresholds: null }, null, 2));
+    process.exit(2);
+  }
+  if (humanMaxGz >= aiMinGz || humanMaxOrig >= aiMinOrig) {
+    console.error('[calibrate] WARNING: human-max ≥ AI-decoy-min on one or both detectors. Bands will be degenerate (USELESS). Writing baseline for inspection but NOT writing current-thresholds.json — fail closed.');
+    writeFileSync(jsonPath, JSON.stringify({ summary, human_results, ai_results, thresholds: null, degenerate: true }, null, 2));
+    process.exit(2);
+  }
```

---

## What this review changes about the night-of ship decision

Three of the AAA findings (AAA-2 provenance, AAA-3 frontmatter-cloak, AAA-4 fail-secure default) are tight, exploitable, and patchable in <100 lines of code each. I would not ship the current branch to `main` without at least AAA-3 (verified live with `extractProseText` returning 11 bytes of "benign tail" from 442 bytes of AI decoy prose).

AAA-1 (8-sample baseline) and AAA-5 (untested retry pipeline) are real but slower to fix — the right move is to (a) gate the retry pipeline behind a `DELTA_RETRY_ENABLED=true` env var until a GOOD-signal-quality fixture exists, and (b) ship a TODO item to expand the baseline to ≥20 human + ≥10 AI decoys (with decoys sourced from independent third parties, not the engineer who wrote the gate).

AA-1 (model-switching grep counterclaim) requires only a one-paragraph correction in `data/delta-vendor-claims-2026-05-19.md`.

---

## Empirical verifications performed live during this review

1. **Attack C reproduction:** `extractProseText` on the frontmatter-cloak input returned `"benign tail"` (11 bytes, 2 words) from a 442-byte AI-decoy body. CONFIRMED VIABLE.
2. **Model-switching grep counterclaim:** `grep "model = "` on `cover-letter.mjs` and `cv-tailor.mjs` found `const modelKey = input?.config?.model || 'openai:gpt-5'` at line 376/444 respectively. CONFIRMED — upstream callers can switch models per artifact via config.
3. **Calibration provenance:** `grep "sha256|hmac|signature|verify|provenance"` on `lib/ai-detection-gate.mjs` and the calibrate script returned ZERO hits. CONFIRMED no signing.
4. **Calibration-file git tracking:** `data/ai-detection-calibration/` is NOT in `.gitignore`. CONFIRMED tampering would be a single-commit change.

---

## Sources cited

- Sadasivan, Kumar, Balasubramanian, Wang, Feizi (2023). "Can AI-Generated Text be Reliably Detected?" arXiv:2303.11156. https://arxiv.org/abs/2303.11156
- Liang, Yuksekgonul, Mao, Wu, Zou (2023). "GPT detectors are biased against non-native English writers." Patterns (Cell Press). arXiv:2304.02819.
- Dugan, Hwang, Trhlík, Zhu, Ludan, Xu, Ippolito, Callison-Burch (2024). "RAID: A Shared Benchmark for Robust Evaluation of Machine-Generated Text Detectors." ACL 2024. arXiv:2405.07940. https://aclanthology.org/2024.acl-long.674/
- Krishna, Song, Karpinska, Wieting, Iyyer (2023). "Paraphrasing evades detectors of AI-generated text, but retrieval is an effective defense." arXiv:2303.13408.
- Saltzer & Schroeder (1975). "The Protection of Information in Computer Systems" — fail-secure / default-deny principles.
- OWASP Application Security Verification Standard — fail-secure defaults.
- NIST SP 800-160 — System Security Engineering, fail-secure design principles.
- Independent 2026 GPTZero false-positive testing (EyeSift benchmarks): https://www.eyesift.com/blog/ai-detector-accuracy-benchmarks-2026/ — reports 9-18% FPR on independent 500-sample testing, vs. GPTZero's claimed 0.00%.

---

## Council attribution

- **Sonar Deep Research (Perplexity):** 14,214 chars, 26 inline citations, surfaced 5 AAA findings including the lead. Independently reproduced the fail-secure-regression framing.
- **Grok-4-x-search (xAI):** 5,970 chars, surfaced the same 5 AAA findings + concrete pseudo-diffs. Distinct framing on the "0% true-positive gate looks healthy" angle.
- **GPT-5 (OpenAI):** Returned 11k reasoning tokens but 0 chars of visible output (response budget exhausted on internal reasoning at the 6k max-tokens cap). Excluded from synthesis. Re-run with `max_tokens: 12000` would likely recover its findings; not done tonight due to $10 cap.

Council convergence: Sonar Deep and Grok independently identified the same 5 AAA findings with no contradictions. This is itself a signal that the findings are robust — not artifacts of a single model's biases.
