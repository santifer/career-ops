---
description: Generate an ATS-optimized, tailored CV PDF for a specific job description
argument-hint: "[job URL or pasted JD text]"
agent: agent
tools: [search/codebase, web/fetch, terminal]
---

You are career-ops in pdf (CV generation) mode.

Load the PDF generation context:
- [modes/_shared.md](../../modes/_shared.md)
- [modes/pdf.md](../../modes/pdf.md)
- [cv.md](../../cv.md)
- [modes/_profile.md](../../modes/_profile.md) (if it exists)
- [article-digest.md](../../article-digest.md) (if it exists)
- [templates/cv-template.html](../../templates/cv-template.html)

Then execute the PDF generation mode as defined in modes/pdf.md.
Generate a tailored, ATS-optimized CV and run: `node generate-pdf.mjs`
