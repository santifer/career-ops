# Mode: oferta — Full A–F Evaluation

When the candidate pastes an offer (text or URL), ALWAYS deliver all 6 blocks:

## Step 0 — Archetype detection

Classify the offer into one of the 6 archetypes (see `_shared.md`). If hybrid, name the 2 closest. This determines:
- Which proof points to prioritize in block B
- How to rewrite the summary in block E
- Which STAR stories to prepare in block F

## Block A — Role summary

Table with:
- Detected archetype
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Function (build/consult/manage/deploy)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (if mentioned)
- One-sentence TL;DR

## Block B — CV match

Read `cv.md` and `article-digest.md`. Build a table mapping each JD requirement to exact CV lines or digest proof points.

**Deep context:** After mapping CV, search `knowledge/_index.md` for projects matching the detected archetype. Read relevant `knowledge/{project}/project.md` files for deeper proof points, specific metrics, and architectural decisions that strengthen the match.

**Tailored to archetype:**
- If FDE → prioritize fast delivery and client-facing proof points
- If SA → prioritize systems design and integrations
- If PM → prioritize product discovery and metrics
- If LLMOps → prioritize evals, observability, pipelines
- If Agentic → prioritize multi-agent, HITL, orchestration
- If Transformation → prioritize change management, adoption, scaling

**Gaps** section with mitigation strategy for each. For each gap:
1. Is it a hard blocker or a nice-to-have?
2. Can the candidate show adjacent experience?
3. Is there a portfolio project that covers this gap? Check `knowledge/` for deeper evidence.
4. Concrete mitigation plan (cover letter line, quick project, etc.)

## Block C — Level and strategy

1. **Level detected** in the JD vs **candidate's natural level for that archetype**
2. **Plan to "sell senior without lying"**: archetype-specific phrases, concrete wins to highlight, how to position founder experience as an advantage
3. **Plan if downleveled**: accept if comp is fair, negotiate 6-month review, clear promotion criteria

## Block D — Comp and demand

Use WebSearch for:
- Current role salaries (Glassdoor, Levels.fyi, Blind)
- Company compensation reputation
- Role demand trend

Table with data and cited sources. If there is no data, say so instead of inventing.

## Block E — Personalization plan

| # | Section | Current state | Proposed change | Why |
|---|---------|---------------|-----------------|-----|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 CV changes + Top 5 LinkedIn changes to maximize match.

## Block F — Interview plan

6–10 STAR+R stories mapped to JD requirements (STAR + **Reflection**):

| # | JD requirement | STAR+R story | S | T | A | R | Reflection |
|---|----------------|--------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` has stories, match them to JD requirements using archetype and JD signal tags. Stories accumulate over time as you evaluate offers and populate the knowledge base.

**Deep STAR context:** For stories needing more depth than the story bank provides, read the corresponding `knowledge/{project}/star.md` file for full STAR framework details including specific metrics, technical decisions, and narrative context.

**Selected and framed by archetype:**
- FDE → emphasize delivery speed and client-facing
- SA → emphasize architecture decisions
- PM → emphasize discovery and trade-offs
- LLMOps → emphasize metrics, evals, production hardening
- Agentic → emphasize orchestration, error handling, HITL
- Transformation → emphasize adoption, organizational change

Also include:
- 1 recommended case study (which project to present and how)
- Red-flag questions and how to answer (e.g., "why did you sell your company?", "do you have direct reports?")

---

## Post-evaluation

**ALWAYS** after generating blocks A–F:

### 1. Save report .md

Save the full evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = next sequential number (3 digits, zero-padded)
- `{company-slug}` = company name in lowercase, no spaces (use hyphens)
- `{YYYY-MM-DD}` = current date

**Report format:**

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Archetype:** {detected}
**Score:** {X/5}
**PDF:** {path or pending}

---

## A) Role summary
(full content of block A)

## B) CV match
(full content of block B)

## C) Level and strategy
(full content of block C)

## D) Comp and demand
(full content of block D)

## E) Personalization plan
(full content of block E)

## F) Interview plan
(full content of block F)

## G) Draft Application Answers
(only if score >= 4.5 — draft answers for the application form)

---

## Extracted keywords
(list of 15–20 JD keywords for ATS optimization)
```

### 2. Log in tracker

**ALWAYS** log in `data/applications.md`:
- Next sequential number
- Current date
- Company
- Role
- Score: match average (1–5)
- Status: `Evaluated`
- PDF: ❌ (or ✅ if auto-pipeline generated PDF)
- Report: relative link to the report .md (e.g. `[001](reports/001-company-2026-01-01.md)`)

**Tracker format:**

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```
