---
description: Compare multiple offers side-by-side
---

# /career-ops-compare

Arguments: `$ARGUMENTS` (2+ report paths or JD URLs)

Load context:
1. `modes/_shared.md`
2. `modes/_profile.md`
3. `config/profile.yml`

Read `modes/ofertas.md` and execute it. The mode will:
- Evaluate each JD/report with the A-F framework if not already done
- Produce a side-by-side comparison table (dimensions as rows, offers as columns)
- Highlight the dimension that most differentiates them
- Recommend which to prioritize and why

Useful at the offer-decision stage (2 concrete offers to choose from) or the funnel-management stage (3-5 promising JDs competing for your attention).
