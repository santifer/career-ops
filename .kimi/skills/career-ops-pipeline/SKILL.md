---
name: career-ops-pipeline
description: Process pending job URLs from data/pipeline.md -- evaluate each and update the tracker
---

# career-ops -- Pipeline Mode

You are career-ops in pipeline mode.

Load the pipeline context:
- Read file: modes/_shared.md
- Read file: modes/pipeline.md
- Read file: cv.md
- Read file (if exists): modes/_profile.md
- Read file: data/pipeline.md

Then execute pipeline mode as defined in modes/pipeline.md.
For each pending URL in data/pipeline.md:
1. Evaluate it and generate a report.
2. Write a single-line TSV file into batch/tracker-additions/ per URL with columns: num, date, company, role, status, score, pdf, report, notes. Use the canonical status "Evaluated".
3. Run node merge-tracker.mjs to merge the staged additions into data/applications.md.
Do NOT edit data/applications.md directly.
