---
name: jd-evaluator
description: >
  Full 7-block job description evaluation (A-G) with scoring, archetype detection,
  CV matching, comp research, personalization, interview planning, and ghost job detection.
  Trigger on: "evaluate this JD", "rate this job", "score this offer", "is this job legit",
  "analyze this listing", "evaluate oferta", "eval JD", or when user pastes a JD and wants analysis.
---

# JD Evaluator

Evaluate job descriptions against the candidate's CV and profile. Output all 7 blocks (A-G).

## Prerequisites

1. Read the candidate's CV: `cv.md` (project root)
2. Read the candidate's profile: `config/profile.yml`
3. Read archetype customizations: `modes/_profile.md`
4. If `article-digest.md` exists, read it for detailed proof points
5. If JD is a URL, use `web_fetch` to extract the posting text

## Step 0 — Archetype Detection

Classify the JD into one of 6 archetypes (or hybrid of 2):

| Archetype | Key signals |
|-----------|-------------|
| AI Platform / LLMOps | "observability", "evals", "pipelines", "monitoring", "reliability" |
| Agentic / Automation | "agent", "HITL", "orchestration", "workflow", "multi-agent" |
| Technical AI PM | "PRD", "roadmap", "discovery", "stakeholder", "product manager" |
| AI Solutions Architect | "architecture", "enterprise", "integration", "design", "systems" |
| AI Forward Deployed | "client-facing", "deploy", "prototype", "fast delivery", "field" |
| AI Transformation | "change management", "adoption", "enablement", "transformation" |

After detecting archetype, read `modes/_profile.md` for user's specific framing and proof points.

Archetype determines proof point priority in Block B, framing in Block E, and stories in Block F.

## Block A — Role Summary

Table:
- Archetype (detected)
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Function (build/consult/manage/deploy)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (if mentioned)
- TL;DR (1 sentence)

## Block B — CV Match

Map each JD requirement to exact lines from the CV. Table format.

**Adapt by archetype:**
- FDE → prioritize fast delivery and client-facing proof points
- SA → prioritize system design and integrations
- PM → prioritize product discovery and metrics
- LLMOps → prioritize evals, observability, pipelines
- Agentic → prioritize multi-agent, HITL, orchestration
- Transformation → prioritize change management, adoption, scaling

**Gaps section:** For each gap: (1) hard blocker or nice-to-have? (2) adjacent experience? (3) portfolio project to cover? (4) concrete mitigation plan.

## Block C — Level & Strategy

1. JD level vs candidate's natural level for that archetype
2. "Sell senior without lying" plan: archetype-specific phrases, achievements to highlight, how to position founder experience
3. "If downleveled" plan: accept if comp is fair, negotiate 6-month review, clear promotion criteria

## Block D — Comp & Demand

Use `web_search` for:
- Current salaries (Glassdoor, Levels.fyi, Blind)
- Company comp reputation
- Demand trend for the role

Table with data and cited sources. If no data, say so — never fabricate.

## Block E — Personalization Plan

| # | Section | Current state | Proposed change | Why |
|---|---------|---------------|-----------------|-----|

Top 5 CV changes + Top 5 LinkedIn changes to maximize match.

## Block F — Interview Plan

6-10 STAR+R stories mapped to JD requirements:

| # | JD Requirement | Story | S | T | A | R | Reflection |
|---|---------------|-------|---|---|---|---|------------|

Reflection = what was learned / what you'd do differently. Signals seniority.

**Framed by archetype** (see Step 0 signals).

**Story Bank:** If `interview-prep/story-bank.md` exists, check for existing stories. Append new ones not already there.

Include:
- 1 recommended case study (which project, how to present it)
- Red-flag questions and how to answer them

## Block G — Posting Legitimacy

Analyze for ghost job signals. Present observations, not accusations.

**Signals:**
1. **Posting freshness** — date posted, apply button state
2. **Description quality** — tech specificity, team context, realistic requirements, salary mention, boilerplate ratio
3. **Company hiring signals** — search for layoffs/hiring freeze (2-3 queries)
4. **Reposting detection** — check `scan-history.tsv` for same company+role with different URL

**Assessment tiers:**
- **High Confidence** — Real, active opening
- **Proceed with Caution** — Mixed signals
- **Suspicious** — Multiple ghost indicators

Edge cases: government/academic (longer timelines normal), evergreen postings (not ghost jobs), niche/exec roles (legitimately slow to fill), startups (vague JDs expected), no date available (default to Caution, never Suspicious without evidence).

## Scoring

Weighted 1-5 scale:

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| CV Match | 30% | Skills, experience, proof points |
| North Star alignment | 20% | Fit with target archetypes from profile |
| Comp | 20% | Salary vs market (5=top quartile) |
| Cultural signals | 15% | Company culture, growth, stability |
| Red flags | 15% | Blockers, warnings (negative adjustment) |

**Interpretation:**
- 4.5+ → Strong match, apply immediately
- 4.0-4.4 → Good match, worth applying
- 3.5-3.9 → Decent but not ideal
- Below 3.5 → Recommend against

Legitimacy (Block G) is separate — does not affect the numeric score.

## Post-Evaluation

### Save report

Save to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`

`{###}` = next sequential number (zero-padded). Find the next number by listing existing reports.

Report format:

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**URL:** {job URL}
**Archetype:** {detected}
**Score:** {X/5}
**Legitimacy:** {tier}

---

## A) Role Summary
## B) CV Match
## C) Level & Strategy
## D) Comp & Demand
## E) Personalization Plan
## F) Interview Plan
## G) Posting Legitimacy

## Extracted Keywords
(15-20 keywords for ATS optimization)
```

### Register in tracker

Append TSV row to `batch/tracker-additions/` (never edit `data/applications.md` directly).

## Writing Rules

- No corporate-speak, no clichés ("passionate about", "proven track record", "leverage", "synergies")
- Native English, short sentences, action verbs, no passive voice
- Never invent experience or metrics
- Never recommend comp below market rate
- Generate content in the JD's language (English default)
- Case study URLs in PDF Professional Summary
