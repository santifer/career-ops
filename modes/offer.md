# Mode: offer — Full A-F Evaluation

When the candidate pastes a job offer (text or URL), ALWAYS deliver all 6 blocks.

## Step 0 — Archetype Detection

Classify the offer into one of the 6 archetypes (see `_shared.md`). If it is hybrid, list the 2 closest ones. This determines:
- Which proof points to prioritize in block B
- How to rewrite the summary in block E
- Which STAR stories to prepare in block F

## Block A — Role Summary

Table with:
- Detected archetype
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Function (build/consult/manage/deploy)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (if mentioned)
- One-sentence TL;DR

## Block B — CV Match

Read `cv.md`. Build a table mapping each JD requirement to exact lines from the CV.

**Adapted to the archetype:**
- If FDE -> prioritize fast-delivery and client-facing proof points
- If SA -> prioritize systems design and integrations
- If PM -> prioritize product discovery and metrics
- If LLMOps -> prioritize evals, observability, and pipelines
- If Agentic -> prioritize multi-agent, HITL, and orchestration
- If Transformation -> prioritize change management, adoption, and scaling

Add a **gaps** section with a mitigation strategy for each gap. For every gap:
1. Is it a hard blocker or a nice-to-have?
2. Can the candidate demonstrate adjacent experience?
3. Is there a portfolio project that covers this gap?
4. What is the concrete mitigation plan? (cover letter phrasing, quick project, etc.)

## Block C — Level and Strategy

1. **Detected level** in the JD vs the candidate's **natural level** for that archetype
2. **"Sell senior without lying" plan**: archetype-specific phrasing, concrete achievements to emphasize, and how to position founder experience as an advantage
3. **"If they downlevel me" plan**: accept if comp is fair, negotiate a 6-month review, and ask for explicit promotion criteria

## Block D — Comp and Demand

Use WebSearch for:
- Current salaries for the role (Glassdoor, Levels.fyi, Blind)
- Company compensation reputation
- Demand trend for the role

Use a table with cited data and sources. If data is unavailable, say so instead of inventing it.

## Block E — Personalization Plan

| # | Section | Current state | Proposed change | Why |
|---|---------|---------------|-----------------|-----|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 CV changes plus Top 5 LinkedIn changes to maximize fit.

## Block F — Interview Plan

Build 6-10 STAR+R stories mapped to JD requirements (STAR + **Reflection**):

| # | JD requirement | STAR+R story | S | T | A | R | Reflection |
|---|----------------|--------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority. Junior candidates describe what happened. Senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` exists, check whether any of these stories are already there. If not, append the new ones. Over time this builds a reusable bank of 5-10 master stories that can be adapted to different interview questions.

**Selected and framed by archetype:**
- FDE -> emphasize delivery speed and client-facing work
- SA -> emphasize architecture decisions
- PM -> emphasize discovery and trade-offs
- LLMOps -> emphasize metrics, evals, and production hardening
- Agentic -> emphasize orchestration, error handling, and HITL
- Transformation -> emphasize adoption and organizational change

Also include:
- 1 recommended case study (which project to present and how)
- Red-flag questions and how to answer them (for example: "Why did you sell your company?" or "Do you manage direct reports?")

---

## Post-evaluation

**ALWAYS** after generating blocks A-F:

### 1. Save the report `.md`

Save the full evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = next sequential number (3 digits, zero-padded)
- `{company-slug}` = lowercase company name, spaces replaced with hyphens
- `{YYYY-MM-DD}` = current date

**Report format:**

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Archetype:** {detected}
**Score:** {X/5}
**PDF:** {path or pending}

---

## A) Role Summary
(full block A content)

## B) CV Match
(full block B content)

## C) Level and Strategy
(full block C content)

## D) Comp and Demand
(full block D content)

## E) Personalization Plan
(full block E content)

## F) Interview Plan
(full block F content)

## G) Draft Application Answers
(only if score >= 4.5 — draft answers for the application form)

---

## Extracted Keywords
(15-20 JD keywords for ATS optimization)
```

### 2. Register in the tracker

**ALWAYS** register the evaluation in `data/applications.md`:
- Next sequential number
- Current date
- Company
- Role
- Score: average fit score (1-5)
- Status: `Evaluated`
- PDF: ❌ (or ✅ if auto-pipeline generated the PDF)
- Report: relative link to the report `.md` (for example `[001](reports/001-company-2026-01-01.md)`)

**Tracker format:**

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```
