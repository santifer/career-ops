# Mode: auto-pipeline — Full Automatic Pipeline

When the user pastes a JD (text or URL) without an explicit sub-command, run the FULL pipeline in sequence:

## Step 0 — Extract JD

If the input is a **URL** (not pasted JD text), use this strategy to extract the content:

**Priority order:**

1. **Playwright (preferred):** Most job portals (Lever, Ashby, Greenhouse, Workday) are SPAs. Use `browser_navigate` + `browser_snapshot` to render and read the JD.
2. **WebFetch (fallback):** For static pages (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (last resort):** Search the role title + company on secondary portals that index the JD as static HTML.

**If none of the methods work:** Ask the candidate to paste the JD manually or share a screenshot.

**If the input is JD text** (not a URL): use directly, no fetch needed.

## Step 1 — A-F Evaluation
Run exactly like the `offer-eval` mode (read `modes/oferta.md` for all Blocks A-F).

## Step 2 — Save Report .md
Save the complete evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (see format in `modes/oferta.md`).

## Step 3 — Generate PDF
Run the full `pdf` pipeline (read `modes/pdf.md`).

## Step 4 — Draft Application Answers (only if score >= 4.5)

If the final score is >= 4.5, generate draft answers for the application form:

1. **Extract form questions**: Use Playwright to navigate to the form and take a snapshot. If not extractable, use generic questions.
2. **Generate answers** following the tone below.
3. **Save in the report** as section `## G) Draft Application Answers`.

### Generic questions (use if form questions cannot be extracted)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tone for Form Answers

**Position: "I'm choosing you."** — the candidate has options and is choosing this company for concrete reasons.

**Tone rules:**
- **Confident without arrogance**: "I've spent 7+ years building Dynamics 365 solutions — your role is where I want to apply that experience next"
- **Selective without conceit**: "I've been intentional about finding a team where I can contribute meaningfully from day one"
- **Specific and concrete**: Always reference something REAL from the JD or company, and something REAL from the candidate's experience
- **Direct, no fluff**: 2-4 sentences per answer. No "I'm passionate about..." or "I would love the opportunity to..."
- **The hook is the proof, not the claim**: Instead of "I'm great at X", say "I built X that does Y"

**Framework per question:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** → Mention something concrete about the company.
- **Relevant experience?** → A quantified proof point. "Automated ETL pipelines that cut processing from 5 days to 8 hours."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Honest: "Found through [portal/scan], evaluated against my criteria, and it scored highest."

**Language**: Always in the language of the JD (EN default).

## Step 5 — Update Tracker
Register in `data/applications.md` with all columns including Report and PDF as ✅.

**If any step fails**, continue with the remaining steps and mark the failed step as pending in the tracker.
