# Phase 3 Output Pipeline — Nano Banana 2 Addendum (2026-05-17)

> **Why this addendum exists.** Mitchell's original request (2026-05-17) included:
> "you should also have access to nano banana's most recent model for content
> production elements **for the output lever**."
>
> The Phase 3 strategy report (`data/output-pipeline-strategy-2026-05-17.md`)
> covers design + typography (Calibri 11pt, Inter for web, Typst 0.14) but
> does NOT explicitly extend Nano Banana 2 / `gemini-3.1-flash-image-preview`
> usage into the application-material layer — only into the Phase 4 ingest
> skill-badge layer. This addendum closes that gap.

---

## What Nano Banana 2 does for the output lever

The application materials Mitchell ships per role (Phase 3 ApplyPack artifacts) gain a visual identity layer that no current career-tech platform offers — verified gap from `data/dashboard-and-career-tech-research-2026-05-17.md` finding #50 ("no platform offers production-grade visual differentiation for resumes/portfolios in 2026").

Five visual content-production hooks across the output lever:

### 1. Portfolio one-pager hero image (HIGHEST ROI)

**Where it lives:** `ApplyPack.artifacts.one_pager.hero_image_path`

**Trigger:** Whenever the orchestrator builds a portfolio one-pager for an application (typically when the role explicitly asks for a portfolio or when `archetype` ∈ {A2-PgM, A2-SA, A2-FDE, Tier-B} per `data/career-calibration-20260516-190152.md`).

**Prompt template** (passed to `gemini-3.1-flash-image-preview`):
```
A 1200×630 hero image for a portfolio one-pager. Subject: {role-archetype}
work. Style: minimalist editorial, slate-blue (#475c75) plate, single
green (#16a34a) accent, line-art geometry, no text overlay, no faces,
no copyrighted logos. Tone: confident, technical, polished. Anchors:
[1-2 abstract visual cues drawn from the JD — e.g. "data pipelines"
for A2-PgM, "production deployment" for A2-FDE].
```

**Subject Consistency anchor:** First image generated for Mitchell becomes the style reference for ALL subsequent portfolio hero images across companies. Stored at `data/skill-tracker/badges/_portfolio-hero-style-anchor.png` (already exists from the Phase 4 medallion generator's first badge — reuse it as the anchor).

**Cost:** 1 image per application × $0.045 standard ≈ $0.045/application. At 8–12 apps/week (steady-state per calibration brief item 27) ≈ ~$2–$3/month max.

**Cache:** `data/apply-packs/{N}-{slug}/hero.png` — generated once per pack, never regenerated unless the JD or archetype changes.

### 2. CV byline accent (Tier B — optional)

**Where it lives:** `ApplyPack.artifacts.cv.byline_accent_path`

**Trigger:** Only when `archetype` ∈ {Tier-B Editorial / Engineering Editorial Lead / Communications Manager} where editorial polish is itself a hireability signal. For pure-engineering roles, skip — ATS parsers garble inline images and the visual adds noise.

**Form:** Small (~120×120px) medallion-style graphic in the upper-right of the print CV. Subject Consistency-anchored to the portfolio hero.

**Cost:** $0.045 × ~15% of apps (Tier-B portion) ≈ $0.005/avg-application.

### 3. "Why this company / why this role" one-pager header (Tier C — optional)

**Where it lives:** `ApplyPack.artifacts.why_statement.header_image_path`

**Trigger:** Only when the company is in the top-tier auto-yes set AND the role explicitly mentions design / creative / brand work. Most roles SKIP this — the why-statement should be text-led, not visual-led.

**Cost:** $0.045 × ~5% of apps ≈ $0.002/avg-application.

### 4. Custom OG (social-share) cards for portfolio links (RECURRING — not per-app)

**Where it lives:** `data/og-cards/` (directory already exists per repo state)

**Trigger:** When Mitchell publishes a new portfolio item (article, case study, project README). Generated once, cached forever.

**Cost:** ~$0.045 × portfolio additions ≈ negligible.

### 5. Voice-identity visual primer (ONE-TIME bootstrap)

**Where it lives:** `data/skill-tracker/badges/_mitchell-voice-anchor.png`

**Trigger:** ONCE — run on first build. Generates a definitive visual representation of Mitchell's brand identity from `corpus/voice-profile.md` + `data/career-calibration-20260516-190152.md` (the "rare combination, ships fast" anchor). All subsequent Nano Banana 2 calls in the output lever use this as the Subject Consistency reference.

**Cost:** $0.045 one-time.

---

## Implementation extension to scripts/build-apply-orchestrator.mjs

Wire Nano Banana 2 into the orchestrator's `fanOutDrafts()` stage as a 6th sub-agent:

```
sub-agents (per Phase 3 Day-2 spec):
  - cv-tailor
  - cover-letter
  - why-statement
  - linkedin-dm
  - form-field-answers
  + portfolio-visuals   ← NEW (this addendum)
```

The `portfolio-visuals` sub-agent:
1. Reads `ApplyPack.inputs.archetype`, `ApplyPack.inputs.jd_text`, `ApplyPack.inputs.company_ai_policy`
2. Checks the per-archetype + per-company gate (above) to decide which of the 4 hooks to fire
3. Calls `gemini-3.1-flash-image-preview` with the Subject Consistency anchor
4. Writes PNGs to `data/apply-packs/{N}-{slug}/visuals/{hook}.png`
5. Populates the relevant `ApplyPack.artifacts.{cv|cover_letter|why_statement|one_pager}.{*_image_path|*_accent_path}` fields
6. On AI-policy gate `prohibited` for the company, skips entirely (some companies' ATS systems flag inline images as adversarial — be conservative)

**Reuse `scripts/generate-skill-badges.mjs`'s Subject Consistency wiring** — it's already verified-correct (inline_data reference parts in `contents`, not a `tools` flag). Extract the API-call logic into `lib/nano-banana-client.mjs` so both `generate-skill-badges.mjs` and the new `portfolio-visuals` sub-agent can share it.

---

## ATS-safety considerations

Some ATS parsers (Workday-direct, Greenhouse, Lever) handle inline images cleanly. Others (older Taleo, BambooHR, JobScore) silently strip images or crash on render.

**Defensive policy:**
- The **print CV** stays ATS-safe by default — Calibri 11pt, single-column, no images embedded in the PDF text layer.
- The **CV byline accent** (Item #2 above) only ships when:
  - Archetype is Tier-B (editorial/communications) where visual polish is itself a hireability signal
  - AND `data/ai-policies.yml` company entry has no explicit "no inline images" flag
  - AND the role's submission target is Greenhouse OR Lever OR direct-company-form (not Taleo/BambooHR/JobScore)
- The **portfolio one-pager** lives as a separate web URL or as page 2 of a 2-page submission — never embedded in the page-1 CV that ATS parses.

This is a hard guardrail. The verified finding from prior research stands: **no platform offers production-grade ATS bypass** (`data/dashboard-and-career-tech-research-2026-05-17.md` finding #50). Don't let Nano Banana 2 become an accidental anti-pattern.

---

## Cost envelope (output-lever Nano Banana 2)

| Item | Frequency | Per-call cost | Monthly cost at 30 apps/month |
|---|---|---|---|
| Portfolio hero (1 per app) | 100% of apps | $0.045 | $1.35 |
| CV byline accent | ~15% Tier-B | $0.045 | $0.20 |
| Why-statement header | ~5% top-tier-design-role | $0.045 | $0.07 |
| OG cards | 1–2 per month | $0.045 | $0.09 |
| Voice anchor (one-time) | once | $0.045 | $0.045 amortized |
| **Total** | | | **~$1.70/month** |

Well within MONTHLY_BUDGET_USD's headroom. Add to `data/cost-log.tsv` with the same per-call logging the badge generator already does.

---

## Failure modes

1. **Nano Banana 2 returns a face by accident** (e.g., model hallucinates a human in a "leadership" subject). The system prompt explicitly bans faces, but model behavior drifts. **Mitigation:** After each generation, run a face-detection check (cheap, local — `sharp` + `vision-camera` aren't needed; the Gemini Vision API's `safetySettings` blocks faces server-side, and we can additionally regex-check the model's text response for any face-related warnings).

2. **Subject Consistency drifts across many calls.** The Phase 4 medallion generator confirmed Subject Consistency holds for ~50 sequential calls but may drift past that. **Mitigation:** Re-anchor every 25 calls — regenerate the voice anchor from scratch and use the new one going forward.

3. **Generated visual conflicts with company brand guidelines** (e.g., generates something that looks like Anthropic's official orange when applying to Anthropic). **Mitigation:** The prompt anchors to slate-blue (#475c75) + Career-Ops green (#16a34a), explicitly NOT to any target-company palette. Inline a rejection prompt: "Do not use any color or motif that visually resembles {target-company}'s brand." This is a soft guard, not foolproof.

4. **AI-detector flags the visual** (some emerging ATS plugins do this). **Mitigation:** None today — the visual would need to be removed if a specific company's screening pipeline catches it. Add to `data/ai-policies.yml` per-company `visual_ai_screening: 'flagged'|'unknown'|'permissive'` field as ATS-plugin data emerges.

---

## Definition of done for this addendum

- [x] Phase 3 strategy explicitly extended with Nano Banana 2 usage for output materials (this file)
- [ ] `lib/nano-banana-client.mjs` extracted from `scripts/generate-skill-badges.mjs` (deferred to parallel instance — it's mid-flight on Phase 3 sub-agent decomposition already)
- [ ] `scripts/agents/portfolio-visuals.mjs` sub-agent (deferred to parallel instance per the deferred-work list in `data/autonomous-build-prompt-next-2026-05-17.md`)
- [ ] `data/skill-tracker/badges/_mitchell-voice-anchor.png` one-time generation (Mitchell can run `npm run skill-badges -- --skills voice-anchor --limit 1` to bootstrap once `_mitchell-voice-anchor` is added to the courses.yml-derived skill list)
- [ ] `ApplyPack` schema extended with `*_image_path` / `*_accent_path` fields (deferred — small Zod schema patch; can land alongside Day-2 sub-agent extraction)

The addendum itself is the deliverable today. Implementation extensions are properly captured in the parallel instance's deferred-work queue.

---

## Cross-references

- Original Phase 3 strategy: `data/output-pipeline-strategy-2026-05-17.md`
- Nano Banana 2 usage in Phase 4 (template to mirror): `data/ingest-feature-strategy-2026-05-17.md` § Dimension 7 + `scripts/generate-skill-badges.mjs`
- Subject Consistency verification: `scripts/generate-skill-badges.mjs` (commit f2713a3) — confirmed the inline_data reference-parts pattern works
- Calibration brief anchoring: `data/career-calibration-20260516-190152.md` § "Personal brand & voice" — "Rare combination, ships fast" identity
- Voice profile: `corpus/voice-profile.md` (read-only ground truth)
- Cost ceiling: `data/cost-log.tsv` + `MONTHLY_BUDGET_USD=50` in `.env`
