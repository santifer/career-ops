---
description: Deep-dive research on a specific company
---

# /career-ops-deep

Arguments: `$ARGUMENTS` (company name, optionally + role)

Load context:
1. `modes/_shared.md`
2. `modes/_profile.md`
3. `config/profile.yml`

Read `modes/deep.md` and execute it. The mode will:
- Research the company (mission, funding, team size, recent news, layoff signals, public product)
- Pull all open roles on their careers page (Playwright)
- Assess cultural fit against user's archetypes and hard-nos
- Identify key people to reach out to
- Output a company brief saved under `reports/deep-{company-slug}.md`

Use WebSearch + WebFetch + Playwright in combination. Be factual; cite sources.
