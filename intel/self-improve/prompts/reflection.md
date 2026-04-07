# Evaluation Reflection Prompt

**Purpose:** Given a job description, the system's evaluation score, and the user's actual decision (apply / skip / override), identify *why* the evaluation diverged from the user's judgment and propose specific, actionable instruction changes to close the gap.

---

## Context Inputs

You will be given:

- `JD`: The full job description text (or a URL + scraped snapshot)
- `EVAL_SCORE`: The score produced by the system (0.0–5.0)
- `USER_DECISION`: What the user actually did — `apply`, `skip`, or `override` (applied despite low score, or skipped despite high score)
- `USER_RATIONALE` *(optional)*: Any reasoning the user gave ("salary too low", "I have X experience you missed", etc.)
- `EVAL_REPORT`: The full evaluation report that produced the score
- `PROFILE_SNAPSHOT`: The `_profile.md` and `profile.yml` state at time of evaluation

---

## Step 1 — Triage

First, determine if the evaluation actually needs reflection:

| Condition | Action |
|-----------|--------|
| Score within ±0.5 of user-implied score AND decision consistent | No action needed. Output: `{"status": "calibrated"}` |
| Score outside ±0.5 OR decision contradicts score | Proceed to full analysis |

---

## Step 2 — Dimension-Level Analysis

For each scoring dimension in the evaluation report, answer:

1. **Was the dimension score directionally correct?** (higher/lower than it should be)
2. **Was relevant information available in the JD but not used?** (e.g., salary range buried in footer, tech stack in responsibilities section)
3. **Was a profile fact available but not applied?** (e.g., user has the required cert, listed in cv.md)
4. **Was an assumption made that contradicts the user's known preferences?** (e.g., assumed remote-ok when user has a no-relocation rule)
5. **Was the weighting of the dimension appropriate for this role archetype?**

---

## Step 3 — Per-Evaluation Output

For each mis-scored evaluation, produce a structured block:

```
---
EVALUATION: {report filename or company + role}
DATE: {evaluation date}
SCORE: {given} → {expected or user-implied}
DELTA: {given minus expected, signed}

DIMENSION ERRORS:
  - {dimension}: scored {X}, should be ~{Y}
    Reason: {one sentence}

MISSED INFORMATION:
  - "{exact quote from JD}" — this should have triggered {which rule/weight}
  - "{fact from cv.md or profile}" — this was relevant but not surfaced

WRONG ASSUMPTION:
  - Assumed: {what the system assumed}
    Reality: {what is actually true per profile or user statement}

PROPOSED FIX:
  Type: [instruction_change | weight_adjustment | profile_update | new_signal]
  Target file: [modes/_shared.md | modes/_profile.md | config/profile.yml]
  Change: {specific text to add, remove, or modify}
---
```

---

## Step 4 — Synthesis

After analyzing all mis-scored evaluations in the batch, identify patterns and propose consolidated instruction changes.

```
---
PATTERN: {describe the recurring failure mode}
AFFECTED EVALUATIONS: {list report filenames}
FREQUENCY: {N out of M evaluations in this batch}

PROPOSED INSTRUCTION CHANGE:
  File: {target file}
  Section: {section or heading to modify}
  Before: |
    {current instruction text, quoted verbatim}
  After: |
    {revised instruction text}
  Rationale: {why this change fixes the pattern}

EXPECTED IMPACT:
  - Evaluations that would improve: {estimated count or %}, in what direction
  - Risk of overcorrection: {low | medium | high} — {brief reason}
---
```

---

## Step 5 — Calibration Log Entry

For each mis-scored evaluation, append one row to the calibration log (used by `principle-distill.md`):

```
| {date} | {company} | {role} | {archetype} | {given_score} | {expected_score} | {delta} | {primary_error_type} | {dimension} | {proposed_fix_type} |
```

Error type vocabulary: `missed_signal`, `wrong_weight`, `profile_gap`, `assumption_error`, `archetype_mismatch`, `jd_parsing_failure`

---

## Constraints

- Do not propose changes that override the user's explicit preferences in `modes/_profile.md` or `config/profile.yml`.
- Do not propose removing a scoring dimension unless it has been wrong 5+ times with no counter-examples.
- Every proposed fix must be specific enough to implement without further clarification (no "improve the scoring logic" — say exactly what to change and where).
- If the user's rationale contradicts their profile (e.g., they applied to a role that violates their stated deal-breakers), flag this as a profile inconsistency, not an evaluation error.
