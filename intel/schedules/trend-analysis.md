# Schedule: Market Trends (every 24h)

## Purpose

Research job market trends, salary movements, and job search tactics relevant to the user's target domain. Synthesize findings into a daily briefing appended to `intelligence.md`. Flag any trend that suggests the user's profile or strategy should be updated.

## Trigger

- **Interval:** every 24 hours
- **Type:** background agent

## Steps

1. **Load context**
   - Read `config/profile.yml` — target domain, roles, seniority, location, comp targets
   - Read `intel/strategy-ledger.md` — current strategy focus and active hypotheses

2. **Research market trends**
   - **Tavily:** search for job market trends in the user's target domain (e.g., "AI/ML engineering job market 2025", "Head of AI hiring trends")
   - **Exa:** semantic search for industry analyses, hiring reports, layoff/growth signals in relevant sectors

3. **Research salary movements**
   - **Valyu:** query salary data for target roles and geographies — compare against current comp targets in `config/profile.yml`
   - Note any significant delta (>10%) between market data and user's stated targets

4. **Research tactics and strategies**
   - **Tavily:** search for job search strategy articles, interview tips, negotiation trends for target role level
   - Focus on recency (last 30 days preferred)

5. **Research emerging skills**
   - **Parallel:** sweep multiple sources for emerging skills and certifications gaining traction in target domain
   - Cross-reference against skills listed in `cv.md` and `config/profile.yml`

6. **Synthesize briefing**
   - Write a concise briefing (max 400 words) covering:
     - Top 2-3 market trends relevant to the user's search
     - Salary signals (above/below/at target)
     - One actionable tactic
     - Emerging skill worth noting (if any)
   - Append to `intel/intelligence.md` with timestamp and `## Daily Market Brief` heading

7. **Flag profile updates (if needed)**
   - If salary data shows user's targets are significantly off-market → flag: `[ACTION NEEDED] Salary targets may need revision`
   - If an emerging skill appears in 3+ sources and is absent from CV → flag: `[SKILL GAP] Consider adding X to profile`
   - Flags are appended to the briefing block and also written to `intel/flags.md`

## Config

```yaml
interval: 24h
tools:
  trends: [tavily, exa]
  salary: [valyu]
  tactics: [tavily]
  emerging_skills: [parallel]
output:
  briefing: intel/intelligence.md
  flags: intel/flags.md
max_search_queries: 8
recency_preference: 30d
```

## Notes

- Keep briefings concise — this is a signal feed, not a report
- Do not duplicate content if the same trend appeared in the previous cycle's briefing
- Salary data from Valyu is directional, not a guarantee — note data source and date in the briefing
