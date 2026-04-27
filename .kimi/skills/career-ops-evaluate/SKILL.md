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
After evaluation, save the report to reports/.
For tracker updates, write a single-line TSV entry to batch/tracker-additions/ (num,date,company,role,status,score,pdf,report,notes), then run node merge-tracker.mjs.
