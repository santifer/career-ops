# Mode: oferta — Full A-F Evaluation

When the candidate pastes a job posting as text or URL, always deliver these six sections in English:

## Step 0 — Detect The Archetype

Classify the role into the candidate's active archetypes from [`modes/_shared.md`](C:/Users/chipp/OneDrive/Documents/projects/career-ops/modes/_shared.md). If it is hybrid, name the top two matches.

This determines:
- which proof points to prioritize in section B
- how to frame the summary and positioning
- which STAR stories to prepare

## A) Role Summary

Provide a table with:
- detected archetype
- domain
- function
- seniority
- remote setup
- team size if stated
- one-line TL;DR

Then include:
- `Direct read:` for the most concrete facts from the JD
- `Interpretation:` for the actual fit read

## B) CV Match

Read `cv.md`. Map each important JD requirement to exact evidence from `cv.md` or `article-digest.md`.

Then add a `Gaps and mitigation` section. For each gap:
1. Is it a hard blocker or a nice-to-have?
2. Can adjacent experience cover part of it?
3. Is there a portfolio project that helps?
4. What is the concrete mitigation plan?

## C) Level And Strategy

Cover:
1. JD level vs the candidate's natural level for this archetype
2. A "sell senior without lying" plan with specific positioning language
3. An "if they downlevel" plan with compensation and scope guardrails

## D) Compensation And Demand

Use web research for:
- current compensation benchmarks
- company compensation reputation if available
- role or company demand signals

If data is missing, say so clearly.

## E) Personalization Plan

Use this table:

| # | Section | Current state | Proposed change | Why |
|---|---|---|---|---|

Include:
- top 5 resume changes
- top 5 LinkedIn changes

## F) Interview Plan

Create 6-10 STAR stories mapped to JD requirements:

| # | JD requirement | STAR story | S | T | A | R |
|---|---|---|---|---|---|---|

Also include:
- 1 recommended case study
- red-flag questions and how to answer them

---

## Post-Evaluation

Always do the following after sections A-F.

### 1. Save The Markdown Report

Write the evaluation to:

```text
reports/{###}-{company-slug}-{YYYY-MM-DD}.md
```

Use this structure:

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Archetype:** {detected}
**Score:** {X/5}
**PDF:** {path or pending}

---

## A) Role Summary

## B) CV Match

## C) Level And Strategy

## D) Compensation And Demand

## E) Personalization Plan

## F) Interview Plan

## G) Draft Application Answers
(only when score >= 4.5)

---

## Extracted Keywords
```

### 2. Register The Role In The Tracker

Always record the evaluation in `data/applications.md` using canonical English statuses.

Format:

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```

Status defaults to `Evaluated` unless the workflow explicitly says otherwise.

### Language Rule

All output must be English only, even if legacy repo files still contain Spanish.
