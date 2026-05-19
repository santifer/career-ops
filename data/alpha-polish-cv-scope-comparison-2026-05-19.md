# Alpha Polish — CV Scope Comparison — 2026-05-19

**Purpose:** Compare the overnight smoke test (cover-letter only, cv.md NOT in scope) vs. this session's full 6-artifact run (cv.md in corpus, all 6 artifacts).

**Mitchell decision α.3 — authorized by:** morning-handoff.md § NEEDS_HUMAN flag 3 + direct instruction in the sub-agent prompt.

---

## Smoke Test (prior run, overnight session)

- **Artifacts polished:** cover-letter only (1 of 6)
- **Phase 1 signals:** 40 HM priorities, 47 role keywords, 40 anti-patterns, 30 must-haves (7/7 models responded, 130s)
- **Phase 2 rounds used:** 4 outer retries (18 inner rounds across 4 outer cycles) — did NOT converge
- **Phase 3 coherence:** claim-consistency 82%, JD-keyword-overlap on CV 20%, voice-fidelity null
- **Final recommendation:** REJECTED
- **Total cost reported:** $0 (bug — cost tracking was non-functional, real spend was ~$20-40 per API tabs)
- **Root cause per ALPHA self-review:**
  - JD-keyword 20% is because the UNPOLISHED CV dragged the average — cover-letter alone can't lift the full-pack coherence score
  - Voice-fidelity gate was non-functional (passing wrong flags to calibrate-voice-fidelity.mjs) — always returned null → gate never fired
  - Confidence denominator bug in polish-signals.mjs (fixed before this run) inflated denominator by failed models

---

## Full 6-Artifact Run (this session, Mitchell decision α.3)

- **Run invocation:** `node scripts/agents/apply-pack-polish.mjs --row 044 --artifacts cv,cover,form,impact,refs,referrals --target-confidence 0.99 --cost-cap 500`
- **Artifacts attempted:** cv-tailored, cover-letter, form-fields, impact-doc (new), references (new), referrals (new)
- **Phase 1:** cache HIT — signals reused from this morning (generated at 2026-05-19T07:22:00.498Z, TTL 3 days)
- **cv.md in corpus:** YES — confirmed at `apply-pack-polish.mjs:224` (always loaded, passed to all Phase 2 critics + author + adjudicator)
- **Cost tracking:** LIVE (Mitchell decision α.2 wired — `onCostRecord` flowing through all inner `callCouncil` calls)
- **Cost cap:** $500

### Results (populated when run completes)

| Artifact | Converged | Rounds | Confidence | Cost (est) |
|----------|-----------|--------|-----------|------------|
| cv-tailored | — | — | — | — |
| cover-letter | — | — | — | — |
| form-fields | — | — | — | — |
| impact-doc | — | — | — | — |
| references | — | — | — | — |
| referrals | — | — | — | — |
| **Phase 3 coherence** | — | — | — | — |
| **Final recommendation** | — | — | — | — |
| **Total cost** | — | — | — | — |

_(This table is updated after the run completes.)_

---

## Key Hypothesis Being Tested

ALPHA's diagnosis: "The JD-keyword 20% is because the unpolished CV dragged the average down. Polish all six artifacts in one run and watch the verdict flip."

**Expected improvement pathway:**
1. cv-tailored gets a full 6-round critic+author+adjudicator+adversarial pass → cv now keyword-aligned to JD
2. cover-letter polish can reference the newly-polished CV → cross-artifact coherence improves
3. Phase 3 coherence now has 6 polished artifacts to measure against → JD-keyword-overlap rises from 20%
4. voice-fidelity gate is now functional (fixed in cf72de9 before this run)
5. Cost tracking shows real numbers instead of $0 (fixed in this session)

---

## Convergence Comparison (to be filled)

| Metric | Smoke (1 artifact) | Full run (6 artifacts) | Delta |
|--------|-------------------|----------------------|-------|
| Artifacts polished | 1 | 6 | +5 |
| Converged artifacts | 0 | — | — |
| JD-keyword-overlap | 20% | — | — |
| Claim-consistency | 82% | — | — |
| Voice-fidelity | null | — | — |
| Final recommendation | REJECTED | — | — |
| Cost reported | $0 (bug) | — | — |
| Actual est. cost | ~$20-40 | — | — |

---

## Post-Run Analysis (to be filled)

_(Populated after the run completes and polish-orchestrator-summary.json is written.)_
