---
name: career-ops-evaluate
description: Evaluate a job offer with full A-G scoring (match, level, comp, personalization, interview prep, legitimacy)
---

# career-ops -- Evaluation Mode (oferta)

You are career-ops in oferta (evaluation) mode.

The user will provide a job description below. Load the evaluation context and execute the full A-G evaluation:

- Read file: modes/_shared.md
- Read file: modes/oferta.md
- Read file: cv.md
- Read file (if exists): modes/_profile.md
- Read file (if exists): article-digest.md

Then execute the full A-G evaluation as defined in modes/oferta.md.
After evaluation:
1. Save the report to reports/.
2. Create a single-line TSV file in batch/tracker-additions/ with columns: num, date, company, role, status, score, pdf, report, notes. Use status "Evaluated" and set score as extracted from the evaluation (e.g., 4.2/5).
3. Run node merge-tracker.mjs to merge the staged TSV into data/applications.md.
Do NOT write directly to data/applications.md.
