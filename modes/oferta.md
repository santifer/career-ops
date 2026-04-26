# Mode: offer-eval — Complete A-F Evaluation

When the candidate pastes an offer (text or URL), ALWAYS deliver all 6 blocks:

## Step 0 — Archetype Detection

Classify the offer into one of the archetypes from `_profile.md`. If hybrid, indicate the 2 closest. This determines:
- Which proof points to prioritize in Block B
- How to rewrite the summary in Block E
- Which STAR stories to prepare in Block F

## Block A — Role Summary

Table with:
- Detected archetype
- Domain (data/CRM/SharePoint/analytics/platform)
- Function (build/configure/admin/consult/report)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (if mentioned)
- TL;DR in 1 sentence

## Block B — CV Match

Read `cv.md`. Create table mapping each JD requirement to exact lines in the CV.

**Adapted to archetype:**
- Data Analyst/BI → prioritize Power BI dashboards, SQL, stakeholder reporting, data visualization
- Data Engineer → prioritize ETL pipelines, Azure, data warehouse, PowerShell/SQL automation
- Dynamics CRM Developer → prioritize Dynamics 365 customization, C#, JavaScript, workflows, Power Platform
- SharePoint Developer/Admin → prioritize SharePoint builds, governance, intranet, user adoption
- CRM Administrator → prioritize configuration, training, data migration, user support

**Gaps section** with mitigation strategy for each gap. For each gap:
1. Is it a hard blocker or a nice-to-have?
2. Can the candidate demonstrate adjacent experience?
3. Is there a portfolio project that covers this gap?
4. Concrete mitigation plan (cover letter phrase, quick project, etc.)

## Block C — Level & Strategy

1. **Detected level** in JD vs **candidate's natural level for that archetype**
2. **"Sell senior without lying" plan**: specific phrases adapted to archetype, concrete achievements to highlight, how to position the 7+ years of Microsoft ecosystem depth as a competitive advantage
3. **"If they downlevel me" plan**: accept if comp is fair, negotiate 6-month review, clear promotion criteria

## Block D — Compensation & Market

Use WebSearch for:
- Current salary ranges for the role in Canada (Glassdoor, LinkedIn Salary, Payscale, Robert Half Canada Guide)
- Company compensation reputation
- Role demand trend

Table with data and cited sources. If no data, say so rather than making it up.

## Block E — Personalization Plan

| # | Section | Current state | Proposed change | Why |
|---|---------|---------------|-----------------|-----|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 CV changes + Top 5 LinkedIn changes to maximize match.

## Block F — Interview Prep

6-10 STAR+R stories mapped to JD requirements (STAR + **Reflection**):

| # | JD Requirement | STAR+R Story | S | T | A | R | Reflection |
|---|---------------|--------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` exists, check if any of these stories are already there. If not, append new ones. Over time this builds a reusable bank of 5-10 master stories that can be adapted to any interview question.

**Selected and framed by archetype:**
- Data Analyst/BI → emphasize insights delivered, stakeholder impact, decision-enabling dashboards
- Data Engineer → emphasize pipeline reliability, scale, automation, performance improvements (5 days → 8 hours)
- Dynamics CRM Developer → emphasize customization scope, user adoption, business outcomes
- SharePoint Developer/Admin → emphasize governance, engagement improvements, user satisfaction
- CRM Administrator → emphasize adoption rates, training efficiency, data quality improvements

Also include:
- 1 recommended case study (which of their projects to present and how)
- Red-flag questions and how to answer them (e.g. "why are you leaving after 7 years?", "do you have experience with [unfamiliar tool]?")

---

## Post-evaluation

**ALWAYS** after generating Blocks A-F:

### 1. Save report .md

Save complete evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = next sequential number (3 digits, zero-padded)
- `{company-slug}` = company name in lowercase, no spaces (use hyphens)
- `{YYYY-MM-DD}` = current date

**Report format:**

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Archetype:** {detected}
**Score:** {X/5}
**URL:** {job posting URL}
**PDF:** {path or pending}

---

## A) Role Summary
(full content of Block A)

## B) CV Match
(full content of Block B)

## C) Level & Strategy
(full content of Block C)

## D) Compensation & Market
(full content of Block D)

## E) Personalization Plan
(full content of Block E)

## F) Interview Prep
(full content of Block F)

## G) Draft Application Answers
(only if score >= 4.5 — draft answers for the application form)

---

## Extracted Keywords
(list of 15-20 keywords from the JD for ATS optimization)
```

### 2. Register in tracker

**ALWAYS** register in `data/applications.md`:
- Next sequential number
- Current date
- Company
- Role
- Score: average match (1-5)
- Status: `Evaluated`
- PDF: ❌ (or ✅ if auto-pipeline generated PDF)
- Report: relative link to the report .md (e.g., `[001](reports/001-company-2026-01-01.md)`)

**Tracker format:**

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```
