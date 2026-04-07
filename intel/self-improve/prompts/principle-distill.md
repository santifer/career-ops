# Principle Distillation Prompt

**Purpose:** Extract reusable, evidence-backed evaluation principles from accumulated calibration log data. Principles inform the scoring system's heuristics — what to reward, what to penalize, and what to treat as an open question until more data arrives.

---

## Context Inputs

You will be given:

- `CALIBRATION_LOG`: The full calibration log table (produced by `reflection.md`, appended over time)
- `CURRENT_PRINCIPLES`: The current list of guiding and cautionary principles in `modes/_shared.md`
- `PROFILE_SNAPSHOT`: Current `_profile.md` and `profile.yml`

The calibration log has these columns:

```
| date | company | role | archetype | given_score | expected_score | delta | error_type | dimension | fix_type |
```

---

## Step 1 — Data Sufficiency Check

Before promoting anything to a principle, apply the following gates:

| Data Points | Status |
|-------------|--------|
| 10+ rows with the same pattern, across 3+ distinct companies or industries | Eligible for **promotion to principle** |
| 2–9 rows with the same pattern | Eligible for **active hypothesis** (tracked but not enforced) |
| 1 row | Log only — no principle, no hypothesis |
| Counter-examples exist at >30% rate | Do not promote; flag as contested |

"Same pattern" means: same `error_type` + same `dimension` + same direction of delta (all over-scored or all under-scored).

---

## Step 2 — Candidate Extraction

Group the calibration log by `(error_type, dimension, direction)`. For each group with 2+ rows, extract:

- Pattern description (one sentence)
- Representative examples (up to 3 rows quoted from the log)
- Proposed principle text (actionable instruction, not a description)
- Estimated score impact (how many points up or down on average)
- Whether it is guiding (do more of this) or cautionary (avoid this)

---

## Step 3 — Principle Classification

Classify each candidate:

**GUIDING PRINCIPLE** — a positive signal that reliably predicts a good match and should raise the score.
Example: "When the JD explicitly names the user's primary technology stack in 3+ responsibilities, add 0.3 to the Technical Fit dimension."

**CAUTIONARY PRINCIPLE** — a pattern that predicts a poor match or a mismatch with the user's preferences and should lower the score or trigger a flag.
Example: "When the role requires on-site presence and the user's location policy is remote-first, cap the overall score at 3.0 regardless of other dimensions."

**HYPOTHESIS** — a pattern with 2–9 data points that is plausible but not yet proven. Record it, apply it softly (e.g., add a note to the report but don't adjust the score), and revisit after more data.

---

## Step 4 — Output Format

Produce one block per action:

```
---
ACTION: NEW GUIDING PRINCIPLE
TEXT: {the principle as a direct instruction to the evaluator}
EVIDENCE:
  - {date} | {company} | {role} | delta: {+/-X.X} | {brief note}
  - {date} | {company} | {role} | delta: {+/-X.X} | {brief note}
  - ... ({N} total data points, {M} companies/industries)
COUNTER_EXAMPLES: {N} ({brief description, or "none found"})
SCORE_IMPACT: {estimated average delta}
TARGET_FILE: modes/_shared.md
TARGET_SECTION: {section heading}
IMPLEMENTATION: {exact text to add to the file}
---

---
ACTION: NEW CAUTIONARY PRINCIPLE
TEXT: {the principle as a direct instruction to the evaluator}
EVIDENCE: (same format as above)
SCORE_IMPACT: {estimated average delta}
TARGET_FILE: {modes/_shared.md or modes/_profile.md}
TARGET_SECTION: {section heading}
IMPLEMENTATION: {exact text to add to the file}
---

---
ACTION: NEW HYPOTHESIS
TEXT: {the hypothesis as a tentative instruction}
EVIDENCE: ({N} data points, not yet sufficient for promotion)
NEXT_REVIEW: Revisit when N ≥ 10 or after {date estimate}
INTERIM_BEHAVIOR: Add to evaluation report as a note, do not adjust score
---

---
ACTION: PRUNE
TEXT: {the existing principle to remove, quoted verbatim}
REASON: {why it should be removed — contradicted by data, superseded, or never validated}
EVIDENCE: {N} counter-examples vs {M} supporting examples
TARGET_FILE: modes/_shared.md
---
```

---

## Step 5 — Principle Health Summary

After all individual actions, output a one-page summary:

```
PRINCIPLES ADDED (guiding): {N}
PRINCIPLES ADDED (cautionary): {N}
HYPOTHESES ADDED: {N}
PRINCIPLES PRUNED: {N}
PRINCIPLES UNCHANGED: {N}

MOST IMPACTFUL NEW PRINCIPLE: {text, estimated impact}
MOST CONTESTED EXISTING PRINCIPLE: {text, counter-example rate}

DATA GAPS:
  - {dimension or archetype with fewer than 5 data points — needs more evaluations before reliable principles can form}

RECOMMENDED NEXT EVALUATIONS:
  - To validate hypothesis "{X}", evaluate {N} more roles in {industry/archetype}
```

---

## Constraints

- Principles must be actionable: a principle is valid only if an evaluator (human or AI) can apply it mechanically without further judgment calls.
- Principles must not contradict the user's explicit profile. If a pattern conflicts with a user-stated preference, flag the conflict and do not promote the principle.
- Do not distill principles from a single industry or company. Patterns that appear only at one employer may reflect that employer's idiosyncrasies, not a general signal.
- Principles about compensation require the user's `comp_target` to be set in `profile.yml`. Do not generate salary-related principles without a reference range.
- Review and re-run this prompt whenever the calibration log grows by 10+ new rows.
