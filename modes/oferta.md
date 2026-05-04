# Modo: oferta — Evaluación Completa A-G

Cuando el candidato pega una oferta (texto o URL), entregar SIEMPRE los 7 bloques (A-F evaluation + G legitimacy):

## Step 0 — Archetype detection

Classify the offer into one of the 6 archetypes (see `_shared.md`). If hybrid, name the 2 closest. This drives:
- Which proof points to prioritize in block B
- How to rewrite the summary in block E
- Which STAR stories to prepare in block F

## Block A — Role summary

Table with:
- Detected archetype
- Domain (platform / agentic / LLMOps / ML / enterprise)
- Function (build / consult / manage / deploy)
- Seniority
- Remote (full / hybrid / onsite)
- Team size (if mentioned)
- One-sentence TL;DR

## Block B — CV match

Read `cv.md`. Build a table mapping each JD requirement to exact CV lines.

**Adapt to archetype:**
- FDE → prioritize fast delivery and client-facing proof points
- SA → prioritize system design and integrations
- PM → prioritize product discovery and metrics
- LLMOps → prioritize evals, observability, pipelines
- Agentic → prioritize multi-agent, HITL, orchestration
- Transformation → prioritize change management, adoption, scaling

**Gaps** section with mitigation for each gap:
1. Hard blocker or nice-to-have?
2. Can the candidate show adjacent experience?
3. Is there a portfolio project that covers this gap?
4. Concrete mitigation (cover letter line, quick project, etc.)

## Block C — Level and strategy

1. **Level in the JD** vs **candidate’s natural level for that archetype**
2. **“Sell senior without lying” plan**: archetype-specific phrases, concrete wins to highlight, how to position founder-style ownership as a strength
3. **“If downleveled” plan**: accept if comp is fair, negotiate 6-month review, clear promotion criteria

## Block D — Comp and demand

Use WebSearch for:
- Current role salaries (Glassdoor, Levels.fyi, Blind)
- Company comp reputation
- Role demand trend

Table with data and cited sources. If no data, say so — do not invent.

## Block E — Personalization plan

| # | Section | Current state | Proposed change | Why |
|---|---------|---------------|-----------------|-----|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 CV changes + top 5 LinkedIn changes to maximize match.

## Block F — Interview plan

6–10 STAR+R stories mapped to JD requirements (STAR + **Reflection**):

| # | JD requirement | STAR+R story | S | T | A | R | Reflection |
|---|----------------|--------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what you would do differently. It signals seniority — junior candidates describe what happened; senior candidates extract lessons.

**Story bank:** If `interview-prep/story-bank.md` exists, check whether these stories are already there. If not, append new ones. Over time this builds a reusable bank of 5–10 master stories for any behavioral question.

**Selected and framed by archetype:**
- FDE → emphasize delivery speed and client-facing work
- SA → emphasize architecture decisions
- PM → emphasize discovery and trade-offs
- LLMOps → emphasize metrics, evals, production hardening
- Agentic → emphasize orchestration, error handling, HITL
- Transformation → emphasize adoption and organizational change

Also include:
- 1 recommended case study (which project to lead with and how)
- Red-flag questions and how to answer them (e.g. “why did you sell your company?”, “do you have direct reports?”)

## Bloque G — Posting Legitimacy

Analyze the job posting for signals that indicate whether this is a real, active opening. This helps the user prioritize their effort on opportunities most likely to result in a hiring process.

**Ethical framing:** Present observations, not accusations. Every signal has legitimate explanations. The user decides how to weigh them.

### Signals to analyze (in order):

**1. Posting Freshness** (from Playwright snapshot, already captured in Paso 0):
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

<<<<<<< Updated upstream
**SIEMPRE** después de generar los bloques A-G:
=======
**Always** after producing blocks A–F:
>>>>>>> Stashed changes

### 1. Save report `.md`

Save the full evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = next sequential number (3 digits, zero-padded)
- `{company-slug}` = company name lowercase, no spaces (use hyphens)
- `{YYYY-MM-DD}` = today’s date

**Report format:**

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Archetype:** {detected}
**Score:** {X/5}
<<<<<<< Updated upstream
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}
**PDF:** {ruta o pendiente}
=======
**PDF:** {path or pending}
>>>>>>> Stashed changes

---

## A) Role summary
(full block A content)

## B) CV match
(full block B content)

## C) Level and strategy
(full block C content)

## D) Comp and demand
(full block D content)

## E) Personalization plan
(full block E content)

## F) Interview plan
(full block F content)

<<<<<<< Updated upstream
## G) Posting Legitimacy
(contenido completo del bloque G)

## H) Draft Application Answers
(solo si score >= 4.5 — borradores de respuestas para el formulario de aplicación)
=======
## G) Draft application answers
(only if score >= 4.5 — draft answers for the application form)
>>>>>>> Stashed changes

---

## Extracted keywords
(15–20 JD keywords for ATS optimization)
```

### 2. Register in tracker

**Always** register in `data/applications.md`:
- Next sequential number
- Today’s date
- Company
- Role
- Score: average match (1–5)
- Status: `Evaluated` (or your canonical equivalent per `templates/states.yml` / tracker conventions)
- PDF: ❌ (or ✅ if auto-pipeline generated PDF)
- Report: relative link to the report `.md` (e.g. `[001](reports/001-company-2026-01-01.md)`)

**Tracker table format:**

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```
