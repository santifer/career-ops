---
name: deep
description: Deep company research for job applications using a 6-axis framework (AI Strategy, Recent Moves, Engineering Culture, Challenges, Competitors, Candidate Angle). Use when evaluating a company/role for an interview, preparing for a first-round call, or deciding whether to apply. Trigger on "research company", "deep research", "company analysis", "interview prep research", or when asked to investigate a specific employer before an application or interview.
---

# Deep Research — 6-Axis Company Analysis

## Input

- Company name + role title (required)
- Job posting URL or text (optional, provides context)

## Before Starting

Read the candidate profile from `cv.md` and `config/profile.yml` to understand skills, experience, and target archetypes. Use this to tailor the Candidate Angle section.

## Research Process

Run multiple `web_search` queries per axis (at least 2-3 per axis). Use `web_fetch` to read key pages found (engineering blogs, news articles, Glassdoor reviews, tech stack pages).

### Axis 1: AI Strategy
- What products/features use AI/ML?
- AI/ML stack: models, infrastructure, tooling
- Engineering blog: what do they publish?
- Papers, talks, or open-source contributions

### Axis 2: Recent Moves (last 6 months)
- Key hires in AI/ML/product/engineering
- Acquisitions or partnerships
- Product launches or pivots
- Funding rounds or leadership changes

### Axis 3: Engineering Culture
- Shipping cadence: deploy frequency, CI/CD
- Mono-repo vs multi-repo
- Languages, frameworks, tech stack
- Remote-first vs office-first vs hybrid
- Glassdoor/Blind reviews on engineering culture

### Axis 4: Challenges
- Scaling problems (users, data, inference)
- Reliability, cost, latency concerns
- Active migrations (infrastructure, models, platforms)
- Pain points mentioned in employee reviews or public posts

### Axis 5: Competitors & Differentiation
- Main competitors
- Moat or differentiator
- Market positioning vs alternatives

### Axis 6: Candidate Angle
Based on the candidate profile from cv.md and profile.yml:
- What unique value does the candidate bring to this team?
- Which past projects are most relevant?
- What story should the candidate tell in the interview?
- Suggest 2-3 talking points that bridge candidate experience to company needs

## Output

Save a structured report to `reports/deep-research/` with filename format `{company}-{role}.md`.

Report structure:

```markdown
# Deep Research: [Company] — [Role]

**Date:** YYYY-MM-DD
**URL:** [job posting URL if available]

## 1. AI Strategy
[findings]

## 2. Recent Moves (Last 6 Months)
[findings]

## 3. Engineering Culture
[findings]

## 4. Challenges
[findings]

## 5. Competitors & Differentiation
[findings]

## 6. Candidate Angle
[personalized recommendations]

## Sources
- [URL] — brief description
```

## Rules

- Cite sources for every claim. No unsourced assertions.
- Prioritize primary sources (company blog, official announcements) over secondary.
- If information is scarce, say so — don't fabricate.
- Keep each section concise (3-8 bullets or short paragraphs).
- Candidate Angle must reference specific items from cv.md or profile.yml.
