# Mode: auto-pipeline — Full Automatic Pipeline

When the user pastes a JD (text or URL) without an explicit sub-command, run the ENTIRE pipeline in sequence:

## Step 0 — Extract the JD

If the input is a **URL** (not pasted JD text), follow this strategy to extract the content:

**Priority order:**

1. **Playwright (preferred):** Most job portals (Lever, Ashby, Greenhouse, Workday) are SPAs. Use `browser_navigate` + `browser_snapshot` to render and read the JD.
2. **WebFetch (fallback):** For static pages (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (last resort):** Search for the role title + company on secondary portals that index the JD in static HTML.

**If no method works:** ask the candidate to paste the JD manually or share a screenshot.

**If the input is JD text** (not a URL): use it directly, no fetch required.

## Step 1 — A-G Evaluation
Run exactly the same flow as `offer` mode (read `modes/offer.md` for all blocks A-F + block G Posting Legitimacy).

## Step 2 — Save the `.md` Report
Save the full evaluation in `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (see the format in `modes/offer.md`).
Include block G in the saved report. Add `**Legitimacy:** {tier}` to the report header.

## Step 3 — Generate the PDF
Run the full `pdf` pipeline (read `modes/pdf.md`).

## Step 4 — Draft Application Answers (only if score >= 4.5)

If the final score is >= 4.5, generate draft answers for the application form:

1. **Extract form questions**: use Playwright to navigate to the form and take a snapshot. If they cannot be extracted, use the generic questions.
2. **Generate answers** using the tone rules below.
3. **Save them in the report** as section `## H) Draft Application Answers`.

### Generic questions (use if they cannot be extracted from the form)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tone for Form Answers

**Position: "I'm choosing you."** The candidate has options and is choosing this company for specific reasons.

**Tone rules:**
- **Confident without arrogance**: "I've spent the past year building production AI agent systems — your role is where I want to apply that experience next"
- **Selective without ego**: "I've been intentional about finding a team where I can contribute meaningfully from day one"
- **Specific and concrete**: always reference something REAL from the JD or company, and something REAL from the candidate's experience
- **Direct, no fluff**: 2-4 sentences per answer. No "I'm passionate about..." or "I would love the opportunity to..."
- **The hook is the proof, not the claim**: instead of "I'm great at X," say "I built X that does Y"

**Framework by question:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** → Mention something concrete about the company. "I've been using [product] for [time/purpose]."
- **Relevant experience?** → One quantified proof point. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Honest: "Found through [portal/scan], evaluated against my criteria, and it scored highest."

**Language**: always in the language of the JD (EN default). Apply `/tech-translate`.

## Step 5 — Update the Tracker
Register it in `data/applications.md` with all columns, including Report and PDF as ✅.

**If any step fails**, continue with the next ones and mark the failed step as pending in the tracker.
