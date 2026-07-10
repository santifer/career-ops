---
description: Final quality gate for CVs and cover letters before sending — checks factual integrity, grammar, formatting, keyword coverage, and gives a GO/NO-GO verdict
---

# Submission Check — Pre-Send Quality Gate

Run a comprehensive check on the CV and/or cover letter that is about to be sent or uploaded. Catch errors, suggest improvements, or approve for submission.

## Step 1 — Identify Documents

Find the document(s) to review:
- Latest generated HTML/PDF in `output/` (read the HTML for text analysis)
- Cover letter draft (in the report's Section H, in chat context, or as a file)
- If ambiguous, ask: "Soll ich den Lebenslauf, das Anschreiben oder beides prüfen?"

## Step 2 — Load Reference Sources

- `cv.md` (canonical source of truth)
- `article-digest.md` (proof points, if present)
- `config/profile.yml` (contact info, target roles, credentials)
- Matching evaluation report in `reports/` (JD context, keyword list)
- `voice-dna.md` (tone/style reference, if present)
- The original JD (from the report URL or chat context)

## Step 3 — Run All Checks

### A — Factual Integrity (CRITICAL — fails the entire check if violated)

- Every claim, metric, and achievement must trace back to `cv.md` or `article-digest.md`
- No fabricated authorship (user did NOT build tool X unless explicitly stated)
- No invented metrics, percentages, team sizes, or revenue figures
- Company names, role titles, and dates match `cv.md` exactly
- No hallucinated certifications, degrees, or publications
- No tool-of-trade conflation ("uses X" ≠ "built X")

### B — Contact & Header

- Name matches `config/profile.yml` → `candidate.name`
- Email, phone, LinkedIn, GitHub present and correct
- No placeholder text ("Lorem ipsum", "[INSERT]", "TODO", "XXX", "TBD")
- Location consistent with profile

### C — Language & Grammar

- Document language matches the JD language (or user's explicit choice)
- No spelling errors (including proper nouns and company names)
- Grammar correct throughout
- No broken sentences, missing words, or formatting artifacts
- Consistent register (formal/informal)
- German-specific: correct Dativ/Akkusativ, compound nouns joined, formal "Sie" consistent
- English-specific: consistent US/UK spelling, no mixed dialects
- No accidental language switches mid-paragraph

### D — Keyword Coverage (CV)

- Top 10-15 JD keywords appear in the document
- Keywords distributed naturally (summary, experience bullets, skills)
- No keyword stuffing or hidden-text tricks
- Target role title appears near the top of the document

### E — Formatting & ATS Compliance (CV)

- Single-column layout preserved
- Standard section headers present and parseable
- No critical info only in headers/footers (ATS ignores those)
- Dates formatted consistently throughout
- Bullet points begin with strong action verbs
- Page count reasonable (1-2 pages)
- Contact info in first lines (Klartext-Test)

### F — Cover Letter Specifics

- Company name and role title correct (matches the actual target)
- Opening hook is specific to THIS role (no generic "I am writing to express...")
- At least 2 quantified evidence bullets with concrete numbers
- Closing has a clear call to action
- Length under 400 words / one page
- Does NOT rehash the entire CV — adds a new angle or context
- Notice period / availability mentioned if required by JD or profile
- Addressee correct (Hiring Manager, specific name if known)

### G — Voice & Tone

- Reads as human-written, not robotic template output
- Consistent with `voice-dna.md` style markers (if present)
- Confident without arrogance
- Adapted to company culture (startup energy vs. corporate precision)

### H — Cross-Document Consistency

- CV and cover letter don't contradict each other on dates, titles, or facts
- Role title referenced in cover letter matches CV's target framing
- Key achievements in cover letter also appear in CV (no orphan claims)

## Step 4 — Deliver Verdict

Output exactly ONE of these verdicts:

### APPROVED

> "Dokumente geprüft. Keine Probleme gefunden. Freigabe für den Versand."

List what was verified: factual integrity, keyword count, grammar status, ATS compliance.

### NEEDS FIXES

> "**{N} Problem(e) gefunden** — vor dem Versand beheben:"

For EACH issue:
1. Problem clearly stated
2. Exact quote of the offending text
3. Corrected version or improvement suggestion

Then ask: "Soll ich die Korrekturen jetzt anwenden?"

### FAIL

> "**BLOCKIERT:** Kritische Probleme verhindern den Versand."

Only for: factual integrity violations, wrong company/role name, fundamentally flawed document. Explain what's wrong and what must change.

## Rules

- Never approve a document with fabricated claims
- Be specific: quote the exact problematic text and provide the fix
- If the JD is not available, skip keyword coverage but note it in the verdict
- If the user asks to skip a section, acknowledge but note the gap
- For multilingual documents, verify the ENTIRE text stays in one language
- After fixes are applied, re-run the failed checks to confirm resolution
