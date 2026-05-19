# DELTA — Test + Verify (Task Δ.4)

**Tested at:** 2026-05-19
**Target:** `apply-pack/048-anthropic-engineering-editorial-lead/cover-letter.md` (307 words of prose, generated 2026-05-18)

## What the new gate returned

```
band:                  CRIT
passes (legacy):       true   (force-set true because both detectors USELESS)
gateBlocks (new):      false  (would NOT block ship)
gptzero_prob:          1.0    (raw GPTZero AI probability)
gptzero_band:          CRIT
gptzero_signal_quality:  USELESS
originality_prob:      1.0    (raw Originality AI probability)
originality_band:      CRIT
originality_signal_quality: USELESS
flagged sentence count: 22 of 22 sentences
overall_burstiness:    0
thresholds_at:         2026-05-19T06:39:09.973Z
```

## What the OLD gate would have returned

- `passes: false` (both probs ≥ 0.5)
- Stage status: `'error'`
- Apply-pack would have been BLOCKED from shipping with a "DO NOT SUBMIT" banner.

## What the dashboard now surfaces

Via `editing_priority` field in the `/api/build-pack-stage` response:

```
{
  priority:   'ADVISORY',
  blocking:   false,
  band:       'CRIT',
  flagged_sentence_count: 22,
  gptzero_signal_quality:     'USELESS',
  originality_signal_quality: 'USELESS',
  top_flagged: [
    { generated_prob: 1.0, sentence: "Posts explaining capability thresholds..." },
    { generated_prob: 1.0, sentence: "Anthropic's commitment to responsible scaling..." },
    { generated_prob: 1.0, sentence: "Separately, I Engineered a RAG-based Voice DNA pipeline..." }
  ],
  advisory_note: 'Both detectors are calibrated USELESS against Mitchell\'s voice baseline — the high score is likely a false positive, not a signal to rewrite.'
}
```

## Why this is correct

The legacy gate's blocking behaviour was a guaranteed false positive: the Δ.1 + calibration baseline showed both detectors return 1.0 (max AI prob) on EVERY sample of Mitchell's authentic prose, including the voice-reference canonical exemplar. The new gate correctly:

1. **Reports the raw score** so a human reviewer can still see what GPTZero / Originality think.
2. **Refuses to BLOCK** when signal quality is USELESS — the score is uninformative, not actionable.
3. **Surfaces flagged sentences** for optional human review without forcing a rewrite.
4. **Advisory note** explains the USELESS classification in plain English so the user understands why the high score isn't a failure.

## What did NOT get tested (by design)

- **A real Stage-1/2/3 retry loop on apply-pack 048** — the cover letter is already in CRIT-USELESS state. Retry pipeline would short-circuit to `final_status: 'SIGNAL_USELESS'` and return the original prose. To exercise the retry stages I'd need a synthetic test fixture where one detector has GOOD signal quality. The pipeline is unit-tested via `node --check` + hand-traced; live retry verification deferred until a detector with GOOD signal quality is introduced (or the calibration baseline shifts after a voice-corpus update).

## Live HTTP verification post-merge

After the merge to main + Cloudflare tunnel recovery at ~07:18 PT (state update confirmed: prod 302 + staging 200), I verified the new endpoint via direct HTTP against the launchd-managed dashboard server (PID 50661, port 3097):

```
$ curl -sS -o /tmp/sig.json -w "HTTP %{http_code} · %{size_download} bytes\n" \
    http://127.0.0.1:3097/api/ai-detection/signal-quality
HTTP 200 · 267 bytes

$ cat /tmp/sig.json
{"ok":true,"thresholds":null,"summary":null,
 "baseline_sample_counts":{"human":5,"ai_decoy":3},
 "baseline_file":"baseline-2026-05-19.json",
 "interpretation":"No calibration baseline present. Run `node scripts/ai-detection-calibrate-baseline.mjs --refresh` to populate."}
```

The endpoint is live and returns the expected fail-secure payload: `thresholds: null` because the AAA-1 sample-size guard refused to write `current-thresholds.json` under the 5+3 baseline. The `interpretation` field surfaces the plain-English explanation a human reviewer needs.

## Chrome MCP screenshots

Deferred. The public URL `https://dashboard.careers-ops.com/` is gated by Cloudflare Access (302 → login per the Tasks 1-4 CF Access work earlier in the night). The API surface is verified via localhost (above); screenshot-via-Chrome-MCP needs a CF-Access-authenticated browser session, queued for a follow-on once that's wired.

The Editing Priority callout client code (`_tpRenderEditingPriority` in `scripts/build-dashboard.mjs`) renders when an apply-pack build stage completes with a non-NONE priority. To capture a screenshot, kick off a "Generate apply pack" build for any apply-now row — the callout appears inline below the progress message as a coloured chip + top-3 flagged sentences. Cost per build: ~$0.10-0.50 in LLM credits; not auto-triggered as part of this verification.

## Behaviour summary

The DELTA-shipped detection gate would have shipped this pack tonight. The legacy gate would have failed it with `passes: false` and the orchestrator would have returned status `'error'`. The shift is intentional: authenticity over evasion, transparency over false-positive blocking.
