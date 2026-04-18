---
description: Draft application form answers for a scored JD
---

# /career-ops-apply

Arguments: `$ARGUMENTS` (JD URL or path to an existing report in `reports/`)

Load context:
1. `modes/_shared.md`
2. `modes/_profile.md`
3. `config/profile.yml`
4. `cv.md`
5. `article-digest.md` if present

Read `modes/apply.md` and execute it. The mode will:
- Pull the application form questions (via Playwright snapshot of the apply page, or use the generic question list if extraction fails)
- Draft 2-4 sentence answers in "I'm choosing you" tone (confident, specific, proof-point-first — no "passionate about", no "would love the opportunity")
- Save the answers as `## H) Draft Application Answers` in the report
- Match JD language (EN default)

**Hard rule:** Never submit the form. Stop at "answers drafted, review and paste manually."
