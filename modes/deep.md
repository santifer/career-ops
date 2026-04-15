# Mode: deep — Deep Research Prompt

Generate a structured prompt for Perplexity/Claude/ChatGPT across 6 dimensions:

```
## Deep Research: [Company] — [Role]

Context: I am evaluating an application for [role] at [company]. I need actionable information for the interview.

### 1. AI Strategy
- Which products/features use AI/ML?
- What does their AI stack look like? (models, infra, tools)
- Do they have an engineering blog? What do they publish?
- What papers or talks have they given about AI?

### 2. Recent Moves (last 6 months)
- Relevant hires in AI/ML/product?
- Acquisitions or partnerships?
- Product launches or pivots?
- Funding rounds or leadership changes?

### 3. Engineering Culture
- How do they ship? (deploy cadence, CI/CD)
- Mono-repo or multi-repo?
- Which languages/frameworks do they use?
- Remote-first or office-first?
- Glassdoor/Blind reviews about engineering culture?

### 4. Likely Challenges
- What scaling problems do they have?
- Reliability, cost, or latency challenges?
- Are they migrating anything? (infra, models, platforms)
- Which pain points show up in reviews?

### 5. Competitors and Differentiation
- Who are their main competitors?
- What is their moat / differentiator?
- How are they positioned vs the competition?

### 6. Candidate Angle
Given my profile (read from the best-matching CV in `resumes/` and `profile.yml` for specific experience):
- What unique value do I bring to this team?
- Which of my projects are most relevant?
- Which story should I tell in the interview?
```

Customize every section with the specific context of the evaluated offer.
