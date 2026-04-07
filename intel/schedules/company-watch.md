# Schedule: Company Watch (every 12h)

## Purpose

Monitor tracked companies for hiring signals. Score each signal and update the intelligence feed. If a company shows high signal activity AND has a role matching the user's profile, automatically add it to `prospects.md`.

## Trigger

- **Interval:** every 12 hours
- **Type:** background agent

## Steps

1. **Load tracked companies**
   - Read `portals.yml` — extract `tracked_companies` list
   - Read `config/profile.yml` — target roles, deal-breakers, location preferences
   - Read `intel/intel.yml` — signal thresholds and scoring config

2. **For each tracked company, gather signals**

   Run the following in parallel per company (batch if many):

   - **Tavily news:** recent press coverage, announcements, layoffs, funding, product launches
   - **Valyu financial signals:** revenue trends, funding rounds, headcount trajectory
   - **Exa blog posts:** engineering blog, leadership posts, product announcements
   - **BrightData headcount:** LinkedIn headcount change (growth/decline), open roles count

3. **Score signals**

   Use the signal scoring table:

   | Signal | Weight |
   |--------|--------|
   | New funding round (Series A+) | +3 |
   | Headcount growing >10% QoQ | +2 |
   | New product launch in target domain | +2 |
   | Engineering blog post about scale/hiring | +2 |
   | Leadership hire in relevant function | +1 |
   | Open roles matching target title | +2 |
   | Recent layoffs | -3 |
   | Hiring freeze announced | -4 |
   | Negative press / financial distress | -2 |

   Total score per company: sum of applicable signals. Range is uncapped.

4. **Update intelligence feed**
   - For each company with new signals: append a block to `intel/intelligence.md`
   - Format: `## Company Watch: {Company} ({date})` + signal list + score
   - Only write if signals changed since last cycle (avoid duplicate noise)

5. **Promote high-signal matches to prospects**
   - Condition: signal score >= 4 AND at least one open role matches user's target title
   - Check `intel/prospects.md` and `data/applications.md` — skip if already tracked
   - If condition met: add to `intel/prospects.md` with source `company-watch`, signal score, and matched role

## Config

```yaml
interval: 12h
source: portals.yml (tracked_companies)
tools:
  news: tavily
  financial: valyu
  blog: exa
  headcount: brightdata
signal_threshold_for_prospect: 4
output:
  feed: intel/intelligence.md
  prospects: intel/prospects.md
parallel_company_batch_size: 5
```

## Notes

- If `tracked_companies` is empty in `portals.yml`, skip this schedule and log a note to `intel/intelligence.md`
- BrightData headcount requires a LinkedIn company URL — skip that signal if the URL is not in `portals.yml`
- Financial signals from Valyu are lagging indicators — weight them accordingly in interpretation
- This schedule complements `market-scan.md` (which sweeps broadly); company-watch is targeted surveillance
