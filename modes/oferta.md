# Mode: oferta — Full A-G Evaluation

When the candidate pastes an offer (text or URL), ALWAYS deliver the 7 blocks (A-F evaluation + G legitimacy):

## Step 0 — Archetype Detection

Classify the offer into one of the archetypes defined in `modes/_profile.md` (## Your Target Roles). If it's a hybrid, indicate the 2 closest ones. This determines:
- Which proof points to prioritize in block B
- How to rewrite the summary in block E
- Which STAR stories to prepare in block F

## Block A — Role Summary

Table with:
- Detected Archetype
- Domain (ML/AI/Backend/Research/Data)
- Function (build/research/data/fullstack)
- Seniority (intern / co-op / new grad / etc.)
- Duration (if specified — most internships are 2–6 months)
- Stipend range (if stated)
- Remote (full/hybrid/onsite)
- Team size (if mentioned)
- TL;DR in 1 sentence

## Block B — Match with CV

Read `cv.md`. Create a table with each JD requirement mapped to exact lines from the CV.

**Adapted to the archetype (read from `modes/_profile.md`):**
- If ML / Deep Learning → prioritize training/fine-tuning experiments, PyTorch fluency, paper implementation
- If AI Engineering → prioritize LLM API integration, RAG pipelines, end-to-end AI feature delivery
- If Backend / Fullstack → prioritize API design, systems thinking, database schema, shipped code
- If Research (CV/NLP) → prioritize paper reading, benchmark implementation, research methodology
- If Data Science → prioritize EDA, modeling pipeline, SQL, clear communication of results

**Gaps** section with mitigation strategy for each. For each gap:
1. Is it a hard blocker or a nice-to-have?
2. Can the candidate demonstrate adjacent experience?
3. Is there a portfolio project that covers this gap?
4. Concrete mitigation plan (phrase for cover letter, quick project, etc.)

## Block C — Level and Strategy

1. **Detected level** in the JD vs **candidate's natural level for that archetype**
2. **"Demonstrate learning velocity" plan**: specific proof points showing ability to ramp fast — coursework depth, shipped side projects, IIT Bombay rigor; concrete phrases adapted to the archetype; how to position independent builder experience as a signal of initiative
3. **"If stipend is below target" plan**: acknowledge the learning value and mentorship; reference comp benchmarks for similar roles/companies; frame return-offer potential as part of the total value — don't anchor hard on stipend for a first internship

## Block D — Comp and Demand

Use WebSearch for:
- Current stipends for the role — search explicitly for "internship" to avoid conflating with full-time salaries (Internshala, Glassdoor, Levels.fyi intern section, company reviews on Glassdoor)
- Company's intern compensation reputation (return offer rate, stipend range across cohorts)
- Role demand trend (how many companies actively hiring for this archetype)

Table with data and cited sources. If no data, state it — missing stipend disclosure is common for internships.

**Comp score calibration for interns (1–5):**
- 5 → top-tier stipend (₹100k+/month India or $7k+/month USD)
- 4 → above market for role type
- 3 → market-rate
- 2 → slightly below (but not dealbreaker for strong brand/learning)
- 1 → unpaid or token stipend (< ₹15k/month)

## Block E — Personalization Plan

| # | Section | Current State | Proposed Change | Why |
|---|---------|---------------|-----------------|-----|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 changes to CV + Top 5 changes to LinkedIn to maximize match.

## Block F — Interview Plan

6-10 STAR+R stories mapped to JD requirements (STAR + **Reflection**):

| # | JD Requirement | STAR+R Story | S | T | A | R | Reflection |
|---|----------------|--------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. For interns, this signals learning velocity and growth mindset — it shows you extract lessons from projects and think beyond the immediate task. This is a strength, not a seniority marker.

**Story Bank:** If `interview-prep/story-bank.md` exists, check if any of these stories are already there. If not, append new ones. Over time this builds a reusable bank of 5-10 master stories that can be adapted to any interview question.

**Selected and framed according to archetype (from `modes/_profile.md`):**
- ML / Deep Learning → emphasize experiment iteration, what you learned from failed attempts, domain depth
- AI Engineering → emphasize end-to-end delivery, integration challenges, debugging under uncertainty
- Backend / Fullstack → emphasize system design decisions, trade-offs made, production considerations
- Research → emphasize intellectual curiosity, how you approached an unfamiliar problem, methodology
- Data Science → emphasize how you framed the problem, what insight you surfaced, how you communicated it

Also include:
- 1 recommended case study (which project to present and how — keep to under 5 minutes)
- Red-flag questions and how to answer them — adapted to intern level, e.g.:
  - "Why are you pursuing ML if your degree is Civil Engineering?"
  - "How will you ramp up on [technology] with no prior experience?"
  - "What will you contribute in your first month given you're still a student?"
  - "Do you have any industry experience?"

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

Save full evaluation in `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = next sequential number (3 digits, zero-padded)
- `{company-slug}` = company name in lowercase, no spaces (use hyphens)
- `{YYYY-MM-DD}` = current date

**Report format:**

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Archetype:** {detected}
**Score:** {X/5}
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}
**PDF:** {path or pending}

---

## A) Role Summary
(full content of block A)

## B) Match with CV
(full content of block B)

## C) Level and Strategy
(full content of block C)

## D) Comp and Demand
(full content of block D)

## E) Personalization Plan
(full content of block E)

## F) Interview Plan
(full content of block F)

## G) Posting Legitimacy
(full content of block G)

## H) Draft Application Answers
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
- Score: match average (1-5)
- Status: `Evaluated`
- PDF: ❌ (or ✅ if auto-pipeline generated PDF)
- Report: relative link to the report .md (e.g.: `[001](reports/001-company-2026-01-01.md)`)

**Tracker format:**

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```
