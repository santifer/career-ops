# Mode: deep — Deep Research Prompt

Generate a structured prompt for Perplexity/Claude/ChatGPT across 6 axes:

```
## Deep Research: [Company] — [Role]

Context: I am evaluating an application for [role] at [company]. I need actionable information for the interview.

### 1. AI strategy
- Which products/features use AI/ML?
- What does their AI stack look like? (models, infra, tools)
- Do they have an engineering blog? What do they publish?
- What papers or talks have they given about AI?

### 2. Recent moves (last 6 months)
- Relevant hiring in AI/ML/product?
- Acquisitions or partnerships?
- Product launches or pivots?
- Funding rounds or leadership changes?

### 3. Engineering culture
- How do they ship? (deployment cadence, CI/CD)
- Monorepo or multi-repo?
- Which languages/frameworks do they use?
- Remote-first or office-first?
- Glassdoor/Blind reviews about engineering culture?

### 4. Likely challenges
- What scaling problems are they dealing with?
- Reliability, cost, or latency challenges?
- Are they migrating anything? (infra, models, platforms)
- What pain points do people mention in reviews?

### 5. Competitors and differentiation
- Who are their main competitors?
- What is their moat/differentiator?
- How do they position themselves versus the competition?

### 6. Candidate angle
Given my profile (read from cv.md and profile.yml for specific experience):
- What unique value do I bring to this team?
- Which of my projects are most relevant?
- What story should I tell in the interview?
```

Customize each section with the specific context of the evaluated offer.
