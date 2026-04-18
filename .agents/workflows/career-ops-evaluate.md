---
description: Evaluate a job description (A-F scoring, no auto PDF)
---

# /career-ops-evaluate

Arguments: `$ARGUMENTS` (paste the JD text or URL after the command)

Load context:
1. `modes/_shared.md`
2. `modes/_profile.md` (fallback: `modes/_profile.template.md`)
3. `config/profile.yml`
4. `cv.md`
5. `article-digest.md` if present

Then read `modes/oferta.md` and execute it against `$ARGUMENTS`.

Output the full 6-block evaluation (A-F + Block G Legitimacy + Global score). Do **not** auto-generate the PDF or update the tracker — this command is evaluation only. If user wants PDF + tracker, suggest `/career-ops <JD>` (the full auto-pipeline) instead.
