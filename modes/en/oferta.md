# Mode: offer — Full Evaluation A-G

When the candidate pastes an offer (text or URL), ALWAYS deliver all 7 blocks (A-F evaluation + G legitimacy):

## Step 0 — Archetype Detection + Page Snapshot

If the input is a URL, use Playwright to navigate to the page (`browser_navigate` + `browser_snapshot`) and capture the DOM state before proceeding. Note the posting date, "X days ago" text, apply button state, and any redirect. This snapshot is used in Block G (Posting Freshness) — capture it here so it is available later without a second fetch.

If the input is pasted JD text (no URL), skip the Playwright step.

Classify the offer into one of the 6 archetypes (see `_shared.md`). If hybrid, name the 2 closest. This determines:
- Which proof points to prioritize in Block B
- How to rewrite the summary in Block E
- Which STAR stories to prepare in Block F

## Block A — Role Summary

Table with:
- Detected archetype
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Function (build/consult/manage/deploy)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (if mentioned)
- TL;DR in 1 sentence

## Block B — CV Match

Read `cv.md`. Create a table mapping each JD requirement to exact lines from the CV.

**Adapted to archetype:**
- If FDE → prioritize fast delivery and client-facing proof points
- If SA → prioritize system design and integrations
- If PM → prioritize product discovery and metrics
- If LLMOps → prioritize evals, observability, pipelines
- If Agentic → prioritize multi-agent, HITL, orchestration
- If Transformation → prioritize change management, adoption, scaling

**Gaps section** with mitigation strategy for each. For each gap:
1. Is it a hard blocker or a nice-to-have?
2. Can the candidate demonstrate adjacent experience?
3. Is there a portfolio project that covers this gap?
4. Concrete mitigation plan (cover letter phrase, quick project, etc.)

## Block C — Level & Strategy

1. **Detected level** in the JD vs **candidate's natural level for this archetype**
2. **"Sell senior honestly" plan**: specific phrases adapted to the archetype, concrete achievements to highlight, how to position founder experience as an advantage
3. **"If downleveled" plan**: accept if comp is fair, negotiate 6-month review, clear promotion criteria

## Block D — Comp & Demand

Use WebSearch for:
- Current salaries for this role (Glassdoor, Levels.fyi, Blind)
- Company's compensation reputation
- Role demand trend

Table with data and cited sources. If no data, say so rather than guessing.

## Block E — Customization Plan

| # | Section | Current state | Proposed change | Why |
|---|---------|---------------|-----------------|-----|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 CV changes + Top 5 LinkedIn changes to maximize match.

## Block F — Interview Prep

6-10 STAR+R stories mapped to JD requirements (STAR + **Reflection**):

| # | JD Requirement | STAR+R Story | S | T | A | R | Reflection |
|---|----------------|--------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` exists, check if any of these stories are already there. If not, append new ones. Over time this builds a reusable bank of 5-10 master stories that can be adapted to any interview question.

**Selected and framed by archetype:**
- FDE → emphasize delivery speed and client-facing
- SA → emphasize architecture decisions
- PM → emphasize discovery and trade-offs
- LLMOps → emphasize metrics, evals, production hardening
- Agentic → emphasize orchestration, error handling, HITL
- Transformation → emphasize adoption, organizational change

Also include:
- 1 recommended case study (which of their projects to present and how)
- Red-flag questions and how to answer them (e.g.: "why did you sell your company?", "do you have direct reports?")

## Block G — Posting Legitimacy

Analyze the job posting for signals that indicate whether this is a real, active opening. This helps the user prioritize their effort on opportunities most likely to result in a hiring process.

**Ethical framing:** Present observations, not accusations. Every signal has legitimate explanations. The user decides how to weigh them.

### Signals to analyze (in order):

**1. Posting Freshness** (from Playwright snapshot, already captured in Step 0):
- Date posted or "X days ago" -- extract from page
- Apply button state (active / closed / missing / redirects to generic page)
- If URL redirected to generic careers page, note it

**2. Description Quality** (from JD text):
- Does it name specific technologies, frameworks, tools?
- Does it mention team size, reporting structure, or org context?
- Are requirements realistic? (years of experience vs technology age)
- Is there a clear scope for the first 6-12 months?
- Is salary/compensation mentioned?
- What ratio of the JD is role-specific vs generic boilerplate?
- Any internal contradictions? (entry-level title + staff requirements, etc.)

**3. Company Hiring Signals** (2-3 WebSearch queries, combine with Block D research):
- Search: `"{company}" layoffs {year}` -- note date, scale, departments
- Search: `"{company}" hiring freeze {year}` -- note any announcements
- If layoffs found: are they in the same department as this role?

**4. Reposting Detection** (from scan-history.tsv):
- Check if company + similar role title appeared before with a different URL
- Note how many times and over what period

**5. Role Market Context** (qualitative, no additional queries):
- Is this a common role that typically fills in 4-6 weeks?
- Does the role make sense for this company's business?
- Is the seniority level one that legitimately takes longer to fill?

### Output format:

**Assessment:** One of three tiers:
- **High Confidence** -- Multiple signals suggest a real, active opening
- **Proceed with Caution** -- Mixed signals worth noting
- **Suspicious** -- Multiple ghost job indicators, investigate before investing time

**Signals table:** Each signal observed with its finding and weight (Positive / Neutral / Concerning).

**Context Notes:** Any caveats (niche role, government job, evergreen position, etc.) that explain potentially concerning signals.

### Edge case handling:

- **Government/academic postings:** Longer timelines are standard. Adjust thresholds (60-90 days is normal).
- **Evergreen/continuous hire postings:** If the JD explicitly says "ongoing" or "rolling," note it as context -- this is not a ghost job, it is a pipeline role.
- **Niche/executive roles:** Staff+, VP, Director, or highly specialized roles legitimately stay open for months. Adjust age thresholds accordingly.
- **Startup / pre-revenue:** Early-stage companies may have vague JDs because the role is genuinely undefined. Weight description vagueness less heavily.
- **No date available:** If posting age cannot be determined and no other signals are concerning, default to "Proceed with Caution" with a note that limited data was available. NEVER default to "Suspicious" without evidence.
- **Recruiter-sourced (no public posting):** Freshness signals unavailable. Note that active recruiter contact is itself a positive legitimacy signal.

---

## Post-evaluation

**ALWAYS** after generating blocks A-G:

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
**URL:** {job posting URL}
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}
**PDF:** {path or pending}

---

## A) Role Summary
(full content of Block A)

## B) CV Match
(full content of Block B)

## C) Level & Strategy
(full content of Block C)

## D) Comp & Demand
(full content of Block D)

## E) Customization Plan
(full content of Block E)

## F) Interview Prep
(full content of Block F)

## G) Posting Legitimacy
(full content of Block G)

## H) Draft Application Answers
(only if score >= 4.5 — draft answers for the application form)

---

## Extracted Keywords
(list of 15-20 keywords from the JD for ATS optimization)
```

### 2. Register in tracker

**NEVER edit `data/applications.md` directly to add new entries.** Always write a TSV file and run the merge script.

1. Write one TSV file to `batch/tracker-additions/{num}-{company-slug}.tsv` — single line, 9 tab-separated columns:

```tsv
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{notes}
```

Column order (status BEFORE score):
- `num` — sequential number matching the report
- `date` — YYYY-MM-DD
- `company` — short company name
- `role` — job title
- `status` — `Evaluated` (or `SKIP` if not worth applying)
- `score` — format `X.X/5`
- `pdf` — `✅` or `❌`
- `report` — markdown link, e.g. `[001](reports/001-company-2026-01-01.md)`
- `notes` — one-line summary

2. Run the merge script to incorporate the entry:

```bash
node merge-tracker.mjs
```
