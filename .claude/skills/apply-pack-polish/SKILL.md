---
name: apply-pack-polish
description: Polish an entire apply pack to ≥0.99 confidence via a 4-round per-artifact loop (Haiku critics // Sonnet author // Opus adjudicator // adversarial sweep), with Phase 1 signal harvest + Phase 3 cross-artifact coherence. Trigger when Mitchell types /apply-pack-polish, says "polish the apply pack for row N", "review my application materials for X", "is this draft ready", "QA pass on the apply pack for X", or "ship-check pack N". Slash-command wrapper for `scripts/agents/apply-pack-polish.mjs`. All 6 artifacts (cv-tailored, cover-letter, form-fields, impact-doc, references, referrals) are polished; new ones are generated on first run. Final verdict: APPROVED | NEEDS_HUMAN | REJECTED.
user_invocable: true
args: query
argument-hint: "row 044  OR  --row 044 --artifacts cv,cover  OR  044-anthropic-communications-lead-claude-code"
---

# apply-pack-polish — Quality bar for outbound apply packs

## What this skill does

Runs the apply-pack-polish orchestrator on ONE pack. Three phases:

1. **Signal harvest** — researcher + 7-model council + Opus dealbreaker → `data/apply-packs/<slug>/polish-signals.json`. Cached 3 days; `--no-cache` to force refresh.
2. **Per-artifact polish loop** — for each artifact (cv-tailored, cover-letter, form-fields, impact-doc, references, referrals):
   - **Round 1**: 3 critics in parallel (Haiku 4.5 each — copywriter / designer / recruiter)
   - **Round 2**: Author rebuttal (Sonnet 4.6) — accept/reject/merge critic rewrites
   - **Round 3**: Opus 4.7 adjudicator on standoffs + weighted confidence
   - **Round 4**: Adversarial sweep (Sonar Deep + Opus) actively trying to break it
   - Exits at confidence ≥ 0.99 AND adversarial passes AND critic scores stable
   - Max 6 inner rounds; 3 outer-loop retries (each with fresh signal harvest)
3. **Cross-artifact coherence** — reuses `scripts/claim-consistency.mjs`, `scripts/jd-keyword-score.mjs`, `scripts/calibrate-voice-fidelity.mjs`. Writes `data/apply-packs/<slug>/polish-summary.md` with the final APPROVED/NEEDS_HUMAN/REJECTED verdict.

Cost cap: **$500/pack** default (quality-first per Decision-Maximization Policy). Override via `--cost-cap` or `POLISH_COST_CAP_USD` env.

## When to trigger

- `/apply-pack-polish 044` — polish row 044 pack
- "polish the apply pack for row 044"
- "review my application materials for Anthropic Comms Lead"
- "is this draft ready"
- "QA pass on the apply pack for X"
- "ship-check pack 044"
- "run the polish loop on 048 with --no-cache"

## Example invocations

### Polish row 044 (all 6 artifacts, default cost cap $500)
```bash
node scripts/agents/apply-pack-polish.mjs --row 044
```

### Polish only cv + cover for row 048 at high confidence
```bash
node scripts/agents/apply-pack-polish.mjs --row 048 --artifacts cv,cover --target-confidence 0.99
```

### Force fresh signal harvest (e.g., JD updated, HM left, comp band moved)
```bash
node scripts/agents/apply-pack-polish.mjs --row 044 --no-cache
```

### Via dashboard
Click the **Polish pack ✨** button on the tonight-pick callout or the right-rail row drawer. SSE-streamed progress per artifact / per round.

## Inputs
- `cv.md`, `article-digest.md`, `modes/_profile.md`, `data/voice-reference-brief.md` (read-only canon)
- `data/hm-intel/<slug>.json` (cached HM research, refreshed via the intel-refresh agent)
- `data/company-pulse/<slug>.json` (optional)
- `data/linkedin/2nd-degree/<companySlug>.json` (for referrals generator)
- `apply-pack/<slug>/<artifact>.md` (current draft of each artifact)
- `data/apply-now-queue.json` (row → company/role/url lookup)

## Outputs
- `data/apply-packs/<slug>/polish-signals.json` — Phase 1 cache
- `data/apply-packs/<slug>/<artifact>.md` — polished artifact (one per kind)
- `data/apply-packs/<slug>/polish-trace-<artifact>.md` — full dialogue audit trail
- `data/apply-packs/<slug>/polish-summary.md` — human-readable verdict
- `data/apply-packs/<slug>/polish-summary.json` — machine-readable verdict
- `data/apply-packs/<slug>/polish-orchestrator-summary.json` — orchestrator-level summary
- Mirrored to `apply-pack/<slug>/<artifact>.md` ONLY when confidence ≥ target (avoids overwriting human-reviewed text with a non-converged attempt)

## Constraints / hard rules

- Every rewrite cites `cv.md:N` or `article-digest.md:N`. No new claims.
- Canonical metrics only (per `data/voice-reference-brief.md` — never invent).
- Voice kill list enforced (no "delve / tapestry / leverage (verb) / passionate / exclamation marks / I'd love / looking forward / excited").
- Diff cap per artifact: 35% line-level change vs input (raise via `--allow-major-rewrite`, out of scope by default).
- Mirrored to apply-pack/<slug>/ ONLY at confidence ≥ target.
- NEVER auto-sends; NEVER submits applications. Output is a quality verdict, not a transmission.

## Anti-hallucination + anti-sycophancy reminders

- If Phase 1 signal harvest can't ground a claim in JD + HM intel + Mitchell's corpus, the Opus dealbreaker prunes it. Don't smuggle the claim back in via the polish loop.
- If critics converge on praise without dissent in any round, the adversarial Round 4 is the failsafe — read its findings, don't dismiss them.
- If the orchestrator returns `final_recommendation: NEEDS_HUMAN` for Mitchell-judgment items (comp anchor, name spelling, reference real-names), surface those exactly — do not autonomously make the call.

## Related agents / skills
- `intel-refresh` — keeps `hm-intel`, toxicity, strategy-ceiling, positioning caches fresh. Polish reads from those caches.
- `preflight-pack` — gate 6 enforces `polish-summary.md.final_recommendation === 'APPROVED'` when `POLISH_PACK_ENABLED=1`.
- `cv-tailor`, `cover-letter`, `form-fields` — the per-artifact generators the polish loop reads from.
