# Mode: deep — Deep Research Prompt

Generates a structured prompt for Perplexity/Claude/ChatGPT with 6 axes:

```
## Deep Research: [Company] — [Role]

Context: I'm evaluating an application for [role] at [company]. I need actionable information for the interview.

### 1. Technology Stack & Tools
- What Microsoft technologies do they use? (Dynamics 365, SharePoint, Power Platform, Azure?)
- What data stack do they run? (SQL Server, Azure Data Factory, Power BI, Tableau?)
- Do they have an engineering blog? What do they publish?
- Any conference talks or public tech content?

### 2. Recent Moves (last 6 months)
- Relevant hires in data/CRM/IT?
- Acquisitions or partnerships?
- Product launches or pivots?
- Funding rounds or leadership changes?

### 3. Engineering Culture
- How do they ship? (deployment cadence, CI/CD)
- Remote-first or office-first?
- What's the data/IT team size?
- Glassdoor/Blind reviews about engineering/IT culture?

### 4. Likely Challenges
- What data quality or integration problems might they have?
- Are they migrating platforms? (Dynamics upgrades, SharePoint Online migration, BI modernization)
- What pain points do people mention in reviews?
- Legacy systems vs. modern cloud stack?

### 5. Competitors & Differentiation
- Who are their main competitors?
- What is their market position/differentiator?
- How do they position themselves vs. the competition?

### 6. Candidate Angle
Given my profile (read from cv.md and profile.yml for specific experience):
- What unique value do I bring to this team?
- Which of my projects are most relevant?
- What story should I tell in the interview?
```

Personalize each section with the specific context of the evaluated offer.
