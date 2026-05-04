# Mode: deep — Deep research prompt

Produce a structured research prompt for Perplexity / Claude / ChatGPT across 6 axes:

```
## Deep Research: [Company] — [Role]

Context: I'm evaluating an application for [role] at [company]. I need actionable intel for interviews.

### 1. AI strategy
- What products/features use AI/ML?
- What is their AI stack? (models, infra, tools)
- Do they have an engineering blog? What do they publish?
- Any papers or talks on AI?

### 2. Recent moves (last ~6 months)
- Notable AI/ML/product hires?
- Acquisitions or partnerships?
- Product launches or pivots?
- Funding rounds or leadership changes?

### 3. Engineering culture
- How do they ship? (deploy cadence, CI/CD)
- Mono-repo or multi-repo?
- Languages/frameworks in use?
- Remote-first or office-first?
- Glassdoor/Blind signal on eng culture?

### 4. Likely challenges
- Scaling problems?
- Reliability, cost, latency?
- Migrations in flight? (infra, models, platforms)
- Pain points mentioned in reviews?

### 5. Competitors and differentiation
- Who are the main competitors?
- What is their moat?
- How do they position vs competitors?

### 6. Candidate angle
Given my profile (read `cv.md` and `config/profile.yml` for specifics):
- What unique value do I bring to this team?
- Which of my projects matter most?
- What story should I lead with in the interview?
```

Customize each section using the specific listing you are evaluating.
