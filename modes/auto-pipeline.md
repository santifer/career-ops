# Mode: auto-pipeline — Full Automatic Pipeline

When the user pastes a JD (text or URL) without an explicit sub-command, run the ENTIRE pipeline in sequence:

## Step 0 — Extract JD

If the input is a **URL** (not pasted JD text), follow this strategy to extract the content:

**Priority order:**

1. **Playwright (preferred):** Most job portals (Lever, Ashby, Greenhouse, Workday) are SPAs. Use `browser_navigate` + `browser_snapshot` to render and read the JD.
2. **WebFetch (fallback):** For static pages (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (last resort):** Search role title + company on secondary portals that index the JD in static HTML.

**If none of these work:** Ask the candidate to paste the JD manually or share a screenshot.

**If the input is JD text** (not a URL): use it directly, no fetch needed.

## Step 1 — A–F Evaluation
Run exactly like `oferta` mode (read `modes/oferta.md` for all A–F blocks).

## Step 2 — Save Report .md
Save the full evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (see format in `modes/oferta.md`).

## Step 3 — Generate PDF
Run the full `pdf` pipeline (read `modes/pdf.md`).

## Step 4 — Draft Application Answers (only if score >= 4.5)

If the final score is >= 4.5, generate draft answers for the application form:

1. **Extract form questions**: Use Playwright to open the form and snapshot. If they cannot be extracted, use the generic questions.
2. **Generate answers** following the tone (see below).
3. **Save in the report** as section `## G) Draft Application Answers`.

### Generic questions (use if they cannot be extracted from the form)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tone for form answers

**Position: "I'm choosing you."** The candidate has options and is choosing this company for concrete reasons.

**Tone rules:**
- **Confident without arrogance**: "I've spent the past year building production AI agent systems — your role is where I want to apply that experience next"
- **Selective without condescension**: "I've been intentional about finding a team where I can contribute meaningfully from day one"
- **Specific and concrete**: Always reference something REAL from the JD or the company, and something REAL from the candidate's experience
- **Direct, no fluff**: 2–4 sentences per answer. No "I'm passionate about..." or "I would love the opportunity to..."
- **The hook is the proof, not the claim**: Instead of "I'm great at X", say "I built X that does Y"

**Framework by question:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** → Mention something concrete about the company. "I've been using [product] for [time/purpose]."
- **Relevant experience?** → One quantified proof point. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Be honest: "Found through [portal/scan], evaluated against my criteria, and it scored highest."

**Language**: Always match the JD language (EN default). Apply `/tech-translate`.

## Step 5 — Generate Cover Letter (if score >= 4.0)

If the final score is >= 4.0 and a cover letter does not already exist:

1. Generate a 1-page cover letter using the evaluation report, proof points from `cv.md`, and the "I'm choosing you" tone.
2. Structure: 3 paragraphs — (1) hook with specific match to the role, (2) top 2-3 proof points with metrics, (3) why this company specifically.
3. Build as HTML using the same template style as the CV (matching design, fonts, colors).
4. Convert to PDF via `generate-pdf.mjs`.
5. Output to `output/cl-{candidate}-{company-slug}-{date}.html` and `output/cl-{candidate}-{company-slug}-{date}.pdf`.

## Step 6 — Auto-Apply (if score >= threshold)

If auto-apply is enabled and the score meets the apply threshold:

1. **Check prerequisites**: resume PDF and cover letter PDF must both exist in `output/`.
2. **Generate answers.json** from Section G draft answers, mapping each answer to a regex pattern matching its form field label.
3. **Run**: `node apply-auto.mjs --url <jobURL> --resume <resumePDF> --cover-letter <coverLetterPDF> --mode submit --profile config/profile.yml --answers answers.json`
4. **Verify result**: Check exit code (0 = success, 2 = duplicate) and `data/apply-log.tsv` for the entry.
5. **On success**: Update tracker status to "Applied" and PDF column to ✅.
6. **On duplicate**: Log as "Discarded" with note "duplicate application."
7. **On error/CAPTCHA**: Log the failure, keep status as "Evaluated" with a note.

**Batch guardrails** (when running via `batch/batch-prompt.md`):
- Only auto-apply if score >= `apply.batch_score_threshold` from `config/profile.yml` (default 4.5).
- Track the count of applications in the current run. Stop auto-applying after `apply.batch_max_per_run` (default 10).
- Log all decisions (applied, skipped, failed) to `data/apply-log.tsv`.

## Step 7 — Update tracker
Log in `data/applications.md` with all columns including Report and PDF as ✅.

**If any step fails**, continue with the rest and mark the failed step as pending in the tracker.
