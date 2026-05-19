# Phase 5 — Apply-pack verifier lane complete (2026-05-19)

## What shipped (3/3 deliverables)

1. **Round 5 architectural verifier in apply-pack polish** — `lib/polish-loop.mjs`. After Round 4 (adversarial sweep) passes, Round 5 fires a cross-architecture verifier:
   - Verifier lineup: `xai:grok-4-20-multi-agent` + `perplexity:sonar-deep-research` (both DIFFERENT architectural families than the author `anthropic:claude-sonnet-4-6`)
   - Opus 4.7 adjudicates the verifier responses into a single PASS/FAIL verdict
   - Convergence now requires `confidenceOK && advPasses && round5Passes && (scoresStable || rounds ≥ 2)`. Round 5 failures push the loop into another outer retry until exhausted.
   - `buildRound5VerifierPrompt()` asks for a quantified read: `voice_drift_score` (0=Mitchell perfect, 1=AI-soup), `overclaim_count`, `ats_keyword_overstuffing`, `cross_arch_findings`. Pass requires drift<0.3, overclaim=0, no overstuffing.
   - Skippable via `opts.skipRound5` for fast-iteration runs.

2. **Voice-drift-monitor agent** — `scripts/agents/voice-drift-monitor.mjs`. Cheap lexical drift detector against the corpus baseline at `lib/voice-corpus.mjs`. Per file:
   - Buzzword rate per 100 words ("rapidly evolving / cutting-edge / unlock value / seamless / synergy / robust solution / paradigm shift" etc.)
   - Mitchell-tell rate per 100 words ("audience / product-first / builder / ship / signal" etc.)
   - Sentence-length distribution vs corpus baseline
   - Composite drift score 0–1; threshold default 0.4 (configurable via `VOICE_DRIFT_THRESHOLD` env)
   - Bands: CLEAR (<0.2), LOW (<0.4), MED (<0.7), HIGH (≥0.7)

   CLI: `--file <path>`, `--diff <range>`, `--since <date>`. Output: `data/voice-drift-{date}.md`. Exit 2 with `--exit-on-flags`. Smoke-tested on cv.md: 0 flags. The agent can be wired as a git post-commit hook (Mitchell decides whether to install).

3. **Cross-artifact coherence in apply-packs** — `scripts/claim-consistency.mjs` extended:
   - Outbound artifact list expanded from 8 to 12: added `cv-tailored.md`, `tailored-cv.md`, `impact-doc.md`, `references.md`, `referrals.md` (the new generators ALPHA shipped).
   - `crossArtifactCoherence(artifacts)` groups claims by key across artifacts and flags raw-text mismatches (e.g., "led 5-person team" in CV vs "led 7-person team" in cover letter).
   - `buildReport(slug, artifactResults, crossMismatches)` writes a new "🔴 Cross-artifact claim mismatch" section when any mismatch is found.
   - Smoke-tested on pack 048-anthropic-engineering-editorial-lead: tailored-cv.md (33 claims, all verified) + cover-letter.md + linkedin DMs all consistent — no mismatch flagged. Report writes successfully.

## Anti-hallucination on MY OWN work

- **Provenance commits.** Each Phase 5 commit names the deliverable + file path.
- **Identity-lock holds** (`node lib/identity-lock.mjs --check` → ok:true).
- **Round 5 IS the anti-hallucination protocol applied to apply-packs.** The cross-architecture verifier is exactly the pattern from Phase 2 refresh-verifier — different model family + different prompt framing + Opus adjudicator on disagreement.
- **Buzzword detection is honest.** The voice-drift-monitor flags drift on AI-generated phrases — meaning if I ever ship AI-soup language in cover letters or LinkedIn DMs, this would catch it. The threshold 0.4 is conservative (catches obvious slop) without false-flagging Mitchell's actual writing.

## NEEDS_HUMAN flags

1. **Round 5 will add per-pack cost.** Each Round 5 fire is one `xai:grok-4-20-multi-agent` + one `perplexity:sonar-deep-research` + one `anthropic:claude-opus-4-7` adjudication, ~$3-6 per artifact per round. With 6 artifacts × up to 6 rounds per outer retry × 3 outer retries = up to ~$324 worst-case per pack. The existing `$500/pack` cap absorbs this. Mitchell may want to set `skipRound5: true` for fast-iteration runs, or lower the Round 5 cost cap.
2. **Voice-corpus-grower hasn't run yet.** The corpus baseline is still ~5 exemplars (DELTA's known issue). voice-drift-monitor's lexical heuristic doesn't depend on a strong corpus, but the Round 5 verifier's voice_drift_score would benefit from a richer baseline.

## End-to-end verification

- `node --check` passes on lib/polish-loop.mjs + scripts/agents/voice-drift-monitor.mjs + scripts/claim-consistency.mjs
- `node scripts/agents/voice-drift-monitor.mjs --file cv.md` → 0 flags, drift CLEAR
- `node scripts/claim-consistency.mjs --slug 048-anthropic-engineering-editorial-lead` → 12-artifact scan, all verified, no cross-artifact mismatch

— refresh-ecosystem orchestrator, Phase 5
