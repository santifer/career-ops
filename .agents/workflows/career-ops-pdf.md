---
description: Generate ATS-optimized CV PDF (Space Grotesk + DM Sans)
---

# /career-ops-pdf

Arguments: `$ARGUMENTS` (optional: path to a report in `reports/`, or a JD to tailor against)

Load context:
1. `modes/_shared.md`
2. `modes/_profile.md`
3. `config/profile.yml`
4. `cv.md`

Read `modes/pdf.md` and execute it. The mode defines:
- How to inject ATS keywords from the JD
- Template selection (standard / senior / executive)
- How to run `npm run pdf` to render the final PDF via Playwright
- Save location under `output/` or `reports/`

If `$ARGUMENTS` points to an existing report (e.g. `reports/042-anthropic-2026-04-15.md`), tailor against that JD. If empty, tailor for the most recent report in `reports/`.
