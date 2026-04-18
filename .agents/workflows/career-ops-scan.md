---
description: Scan configured portals for new job openings
---

# /career-ops-scan

Arguments: `$ARGUMENTS` (optional: portal name to scan only one, e.g. `anthropic`)

Load context:
1. `modes/_shared.md`
2. `modes/_profile.md`
3. `config/profile.yml`
4. `portals.yml` at project root (or `templates/portals.example.yml` if the user hasn't created one yet — and prompt them to do so)

Read `modes/scan.md` and execute it. The scan mode will:
- Invoke `npm run scan` (Playwright-based) against configured portals
- Evaluate new listings against the user's archetypes
- Dedupe against `data/applications.md`
- Surface a ranked shortlist with preliminary scores

Offer to run `/career-ops <JD>` for any listing that scores ≥ 4.0.
