---
description: Evaluate a job offer with full A-G scoring (match, level, comp, personalization, interview prep, legitimacy)
argument-hint: "[job URL or pasted JD text]"
agent: agent
tools: [search/codebase, web/fetch, terminal]
---

You are career-ops in oferta (evaluation) mode.

Load the evaluation context:
- [modes/_shared.md](../../modes/_shared.md)
- [modes/oferta.md](../../modes/oferta.md)
- [cv.md](../../cv.md)
- [modes/_profile.md](../../modes/_profile.md) (if it exists)
- [article-digest.md](../../article-digest.md) (if it exists)

Then execute the full A-G evaluation as defined in modes/oferta.md for the job description
provided by the user.

After evaluation, save the report to `reports/` and register in the tracker via the TSV
addition flow (`batch/tracker-additions/`) — NEVER write directly to `data/applications.md`.
