# Mode: pdf — ATS-Optimized PDF Generation (Pandoc)

## Full Pipeline

1. Read `cv.md` as the source of truth
2. Ask the user for the JD if not already in context (text or URL)
3. Extract 15-20 keywords from the JD
4. Detect JD language → CV language (EN default)
5. Detect role archetype → adapt framing
6. Rewrite Professional Summary injecting JD keywords + exit narrative bridge
7. Select and reorder content by relevance to the JD
8. Generate a tailored CV as **markdown** (`.md`) + **Evidence Brief** (see Thesis Defence below)
9. **THESIS DEFENCE — Judge validates grounding** (see Thesis Defence below)
10. Apply any AMEND/STRIKE fixes to the markdown
11. Write final markdown to `/tmp/cv-{candidate}-{company}.md`
12. Compile with Pandoc:
    ```
    pandoc /tmp/cv-{candidate}-{company}.md \
      -o output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf \
      --pdf-engine=pdflatex \
      --template=templates/cv-template.tex
    ```
13. Check page count: `pdfinfo output/cv-....pdf | grep Pages`
14. If >1 page, trim content and recompile
15. Report: PDF path, page count, keyword coverage %, grounding summary

## PAGE LIMIT — CRITICAL

**CVs MUST be 1 page.** This is the single most important constraint. To achieve 1 page:

1. **Be ruthless with content selection.** Only include experience and bullets directly relevant to the JD.
2. **Consolidate older roles** into 1-2 lines max (e.g., Competentum: one bullet).
3. **Limit bullets per role**: current role 4-6 bullets, previous role 3-5 bullets, older roles 1-2 bullets.
4. **Sub-sections within a role** (e.g., "Team Building", "Product Delivery"): use bold inline headers instead of heading levels to save vertical space.
5. **Skills section**: one line per category, comma-separated. No bullet lists for skills.
6. **Publications**: 1-2 lines max. Combine into a single paragraph if needed.
7. **Open Source**: 1-2 projects max, 1-2 lines each.
8. **Education**: single line.
9. **Languages**: single line, can be merged with Education section.
10. After compiling, check page count. If >1 page, apply these fixes IN ORDER (never remove facts if formatting can save space):
    a. Merge Education + Languages onto a single line
    b. Reduce bottom margin (`-V geometry:bottom=0.3in`)
    c. Shorten verbose bullets (tighten wording, not remove)
    d. Only as last resort: remove the least relevant bullet

**The reference CVs in `/Users/Igor.Gerasimov/IdeaProjects/cv-tailor/data/` show the target style and density.** When in doubt, match that format.

## Markdown Output Format

The tailored CV is written as standard markdown. Pandoc + the LaTeX template handle all formatting. Follow this structure (derived from cv-tailor reference CVs):

```markdown
# Candidate Name

**Location:** ... **Email:** ... **LinkedIn:** [display](url) **GitHub:** [display](url)

---

## PROFESSIONAL SUMMARY

3-4 lines, keyword-dense, bridging past experience to target role.

---

## PROFESSIONAL EXPERIENCE

### JetBrains GmbH — Engagement Manager & Team Lead, Professional Services
**Berlin, Germany** | Sep 2025 – Present

- **Team Leadership:** bullet about managing the team
- **Enterprise Delivery:** bullet about enterprise engagements
- **AI & Tooling:** bullet about AI/technical work

### JetBrains GmbH — Team Lead & Developer, JetBrains Academy (Education)
**Berlin, Germany** | Jul 2018 – Sep 2025

- **Team Scaling:** bullet about scaling the team
- **Product Growth:** bullet about user growth metrics
- **AI Systems:** bullet about multi-agent AI work
- **LLM Evaluation:** bullet about evaluation framework (if relevant to JD)

### Competentum (acquired by EPAM) — Engineering Team Lead / Software Developer
**St. Petersburg, Russia** | Oct 2016 – Jan 2018

- Single bullet about team leadership and delivery

---

## OPEN SOURCE

**[Project](url)** — 1-line description

---

## TECHNICAL SKILLS

- **Languages:** TypeScript · Python · Kotlin · Java · Node.js
- **AI/ML:** Multi-agent systems · LLM · RAG · LangChain · MCP
- **Cloud & Infra:** AWS · GCP · Docker · Kubernetes · CI/CD
- **Leadership:** Team scaling · Hiring · OKR planning · Agile

---

## PUBLICATIONS

"Title," venue, year

---

## EDUCATION

**Degree**, University

---

## LANGUAGES

English (fluent) · German (A2) · Russian (native)
```

## Content Structure

### Professional Summary
- 3-4 lines max. Keyword-dense, tailored to JD.
- Bridge from past experience to the target role.
- No generic fluff — every sentence must map to a JD requirement.

### Professional Experience
- **Current role (JetBrains PS)**: Title: "Engagement Manager & Team Lead, Professional Services". Use bold inline sub-headers for bullets just like JBA (e.g., **Team Leadership:**, **Enterprise Delivery:**, **AI & Tooling:**). 3-5 bullets.
- **Previous role (JetBrains Academy)**: Title: "Team Lead & Developer, JetBrains Academy (Education)". Use bold inline sub-headers (e.g., **Team Scaling:**, **Product Growth:**, **AI Systems:**, **LLM Evaluation:**). 3-5 bullets — only include sub-sections relevant to the JD.
- **Oldest role (Competentum)**: Title must include BOTH positions from cv.md: "Engineering Team Lead / Software Developer". 1-2 bullets max.
- **Consistency rule**: If one role uses bold inline sub-headers, ALL roles must use them. Never mix styles.

### Open Source
- 1-2 projects, 1-2 lines each with tech stack and key differentiator.

### Technical Skills
- Use a bullet list with one item per category: `- **Category:** item · item · item`
- This ensures clear visual separation between categories in the PDF
- Keep each category to one line if possible

### Publications, Education, Languages
- Minimal — 1-2 lines each.

## Thesis Defence — Grounding Validation

Every tailored CV must pass a two-step grounding check before compilation. The composer must **prove** each claim; the judge **cross-examines** the evidence.

### Step A — Composer: Generate CV + Evidence Brief

When generating the tailored markdown (step 8), ALSO produce an **Evidence Brief** — a table mapping every claim in the tailored CV back to its source in `cv.md`.

For each bullet point, summary sentence, skill, or metric in the tailored CV:

```markdown
## Evidence Brief

| # | Tailored claim (first 80 chars) | cv.md source (line #, quote) | Transformation |
|---|------|------|------|
| 1 | "Scaled team from 7 to 32 contributors" | L49: "Scaled the engineering team from 7 to 32" | Verbatim |
| 2 | "Built production RAG pipelines for content generation" | L53: "multi-agent AI system (Python, LangChain, RAG)" | Reformulated — "RAG" extracted to match JD keyword |
| 3 | "12x user growth (5K → 60K MAU)" | L51: "Drove 12x user growth (5K → 60K MAU)" | Verbatim metric |
| 4 | "Kubernetes" in skills | L81: "Docker · Kubernetes" | Verbatim |
```

**Rules for the composer:**
- Every bullet, metric, skill, and summary claim MUST have a row in the evidence brief
- The `cv.md source` column must reference a real line with a direct quote
- `Transformation` must be one of: `Verbatim`, `Condensed`, `Reformulated — {explain}`, `Merged — {lines}`
- If you cannot find a source for a claim → **do not include the claim in the CV**
- The Professional Summary is checked claim-by-claim (split into individual assertions)

**Anti-inflation rules (CRITICAL):**
- **No fabricated qualifiers.** Never add adjectives or scope words not in cv.md: "C-level", "senior leadership", "global", "strategic", "world-class", etc. If cv.md says "stakeholder communication", do NOT write "C-level stakeholder management". If cv.md says "enterprise customers", do NOT write "Fortune 500 clients" (unless cv.md actually says Fortune 500).
- **No scope inflation.** If cv.md says you did X that contributed to outcome Y, do NOT claim you led/owned Y. Example: cv.md says "Secured a ~$5M enterprise agreement by unblocking a stalled license migration" → this means you led the engagement that unblocked the deal, NOT that you led the $5M deal itself. Write: "Unblocked a stalled migration that enabled a ~$5M enterprise agreement" — NOT "Led a ~$5M enterprise deal".
- **No causal inflation.** If cv.md says A happened and B happened, do NOT imply A caused B unless cv.md explicitly states the causal link.
- **The Professional Summary is the highest-risk section.** It compresses everything, which is where overstatement creeps in. Every single assertion in the summary must have a direct, verifiable source in cv.md. Split the summary into individual claims and cite each one.

### Step B — Judge: Cross-Examine

After the composer produces the CV + evidence brief, switch to **judge role**. Re-read `cv.md` fresh and verify each evidence row:

| Check | What it catches | Verdict |
|-------|----------------|---------|
| **Citation exists** | Does the cited cv.md line actually exist and contain the quoted text? | `STRIKE` if citation is fabricated or misquoted |
| **Metric accuracy** | Do all numbers, percentages, and quantities match the source exactly? | `AMEND` if any number is inflated, rounded up, or changed |
| **Verb fidelity** | Is the action verb at the same level or below the source? "contributed" must not become "led"; "supported" must not become "drove"; "unblocked" must not become "led/secured" | `AMEND` with corrected verb |
| **Scope fidelity** | Is the scope of involvement accurately represented? If cv.md says you did X that contributed to Y, the tailored CV must not claim you led/owned Y. Example: "unblocked a migration enabling a $5M deal" ≠ "led a $5M deal" | `AMEND` with corrected framing |
| **Fabricated qualifiers** | Does the tailored CV add adjectives or scope words not in cv.md? "C-level", "senior leadership", "global scale", "world-class", "strategic" — if the exact qualifier isn't in cv.md, it's fabricated | `STRIKE` the qualifier |
| **Causal inflation** | Does the tailored CV imply a causal link that cv.md doesn't state? Two things happening doesn't mean one caused the other | `AMEND` to remove implied causation |
| **Skills audit** | Every technology, tool, or framework in the tailored CV must appear in cv.md (in skills section or experience bullets) | `STRIKE` if skill is not in master CV |
| **Uncited claims** | Any claim in the tailored CV that has no corresponding evidence row | `STRIKE` — remove entirely |

**Verdict format:**
```
| # | Verdict | Issue (if any) | Correction |
|---|---------|---------------|------------|
| 1 | PASS | — | — |
| 2 | PASS | — | — |
| 3 | AMEND | "40%" in source but "80%" in tailored | Change to "40%" |
| 4 | STRIKE | "GraphQL" not found in cv.md | Remove from skills |
```

### Step C — Apply Fixes

1. Apply all AMEND corrections to the tailored markdown
2. Remove all STRIKE'd claims from the tailored markdown
3. Re-check that the CV still flows naturally after removals
4. Record the grounding summary for the report:
   ```
   Grounding: {N} claims — {P} PASS, {A} AMEND, {S} STRIKE
   ```

### Key Principle

Building the evidence map **during generation** is the primary guardrail — you can't cite what doesn't exist. The judge pass is the safety net, not the primary mechanism. If the composer does its job well, the judge should find zero issues.

---

## Keyword Injection (ethical, truth-based)

Examples of legitimate reformulation:
- JD says "RAG pipelines" and CV says "LLM workflows with retrieval" → change to "RAG pipeline design and LLM orchestration workflows"
- JD says "MLOps" and CV says "observability, evals, error handling" → change to "MLOps and observability: evals, error handling, cost monitoring"
- JD says "stakeholder management" and CV says "collaborated with team" → change to "stakeholder management across engineering, operations, and business"

**NEVER add skills the candidate doesn't have. Only reformulate real experience using the exact vocabulary of the JD.**

## Post-generation

Update tracker if the offer is already registered: change PDF from ❌ to ✅.
