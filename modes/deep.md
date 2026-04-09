# Mode: deep -- Deep Company Research

Executes structured research across 6 axes using WebSearch, compiles findings into a report, and highlights actionable insights for interviews.

## Inputs

- Company name (required)
- Role title (optional -- if provided, personalise axis 6)
- Existing report number (optional -- if provided, load context from that evaluation)

## Execution

Read `cv.md` and `config/profile.yml` for candidate context before starting.

### Axis 1 -- AI Strategy
WebSearch queries:
- `"{company}" AI strategy OR AI roadmap OR machine learning`
- `"{company}" engineering blog AI`
- `"{company}" AI papers OR talks OR conference`

Compile:
- What products/features use AI/ML?
- What is their AI stack? (models, infra, tools)
- Do they have an engineering blog? What do they publish?
- What papers or talks have they given about AI?

### Axis 2 -- Recent Moves (last 6 months)
WebSearch queries:
- `"{company}" hiring AI OR ML site:linkedin.com`
- `"{company}" acquisition OR partnership 2026`
- `"{company}" product launch OR funding OR leadership`

Compile:
- Relevant hires in AI/ML/product?
- Acquisitions or partnerships?
- Product launches or pivots?
- Funding rounds or leadership changes?

### Axis 3 -- Engineering Culture
WebSearch queries:
- `"{company}" engineering culture site:glassdoor.com`
- `"{company}" engineering culture site:blind`
- `"{company}" tech stack OR developer experience`

Compile:
- How do they ship? (deploy cadence, CI/CD)
- Mono-repo or multi-repo?
- What languages/frameworks do they use?
- Remote-first or office-first?
- Glassdoor/Blind reviews on engineering culture?

### Axis 4 -- Probable Challenges
WebSearch queries:
- `"{company}" scaling challenges OR reliability OR technical debt`
- `"{company}" engineering problems`

Compile:
- What scaling problems do they have?
- Reliability, cost, latency challenges?
- Are they migrating something? (infra, models, platforms)
- What pain points do people mention in reviews?

### Axis 5 -- Competitors and Differentiation
WebSearch queries:
- `"{company}" vs OR competitors OR alternatives`
- `"{company}" market position OR differentiation`

Compile:
- Who are their main competitors?
- What is their moat/differentiator?
- How do they position themselves vs competition?

### Axis 6 -- Candidate Angle
Using cv.md and profile.yml:
- What unique value does the candidate bring to this team?
- Which candidate projects are most relevant?
- What story should they tell in the interview?
- What questions should the candidate ask that show deep understanding?

## Output

Save the compiled research to `reports/deep-{company-slug}-{YYYY-MM-DD}.md`:

```markdown
# Deep Research: {Company} -- {Role}

**Date:** {YYYY-MM-DD}
**Sources:** {N} unique sources consulted

---

## 1. AI Strategy
(findings with source links)

## 2. Recent Moves
(findings with source links)

## 3. Engineering Culture
(findings with source links)

## 4. Probable Challenges
(findings with source links)

## 5. Competitors and Differentiation
(findings with source links)

## 6. Candidate Angle
(personalised analysis)

---

## Key Talking Points for Interview
- (3-5 bullet points the candidate should weave into conversation)

## Questions to Ask the Interviewer
- (3-5 questions that demonstrate research depth)
```

## Fallback

If WebSearch yields thin results for any axis, include a pre-formatted prompt the user can paste into Perplexity or ChatGPT for deeper digging:

```
Thin results for Axis {N}. Try this in Perplexity:
> "{formatted search prompt}"
```
