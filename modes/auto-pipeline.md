# Mode: auto-pipeline — Full Automatic Pipeline

When the user pastes a JD (text or URL) without an explicit sub-command, execute the ENTIRE pipeline in sequence:

## Step 0 — Extract JD

If the input is a **URL** (not pasted JD text), follow this strategy to extract content:

**Priority order:**

1. **Playwright (preferred):** Most job portals (Lever, Ashby, Greenhouse, Workday) are SPAs. Use `browser_navigate` + `browser_snapshot` to render and read the JD.
2. **WebFetch (fallback):** For static pages (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (last resort):** Search role title + company on secondary portals that index JD in static HTML.

**If no method works:** Ask candidate to paste JD manually or share a screenshot.

**If input is JD text** (not URL): use directly, no fetch needed.

## Step 0b — JD Summarization (only if JD is long)

Before Stage 0 pre-screen, if JD is long (> ~1500 words):
1. Extract a compact summary: title, level, top 5 must-haves, top 3 nice-to-haves, location, comp if mentioned (~200 words)
2. Use this summary for Stage 0 pre-screen
3. If pre-screen passes (≥ 3.0): use FULL JD for blocks A-F (precision matters here)
4. If JD ≤ 1500 words: use complete JD directly for everything

## Step 1 — Evaluation with Pre-screen
Execute Stage 0 pre-screen first (see `modes/offer.md`). If it passes, execute blocks A-F per score tier.

## Step 2 — Save Report .md
Save complete evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (see format in `modes/offer.md`).
Include Block G in the saved report. Add `**Legitimacy:** {tier}` to the report header.

## Step 3 — Generate PDF
Execute full `pdf` pipeline (see `modes/pdf.md`).

## Step 4 — Draft Application Answers (only if score >= 4.5)

If final score is >= 4.5, generate draft answers for the application form:

1. **Extract form questions**: Use Playwright to navigate to form and snapshot. If unable to extract, use generic questions.
2. **Generate answers** following tone guidelines (see below).
3. **Save in report** as section `## H) Draft Application Answers`.

### Generic questions (use if unable to extract from form)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tone for Form Answers

**Position: "I'm choosing you."** The candidate has options and is choosing this company for concrete reasons.

**Tone rules:**
- **Confident without arrogance**: "I've spent the past year building production AI agent systems — your role is where I want to apply that experience next"
- **Selective without snobbery**: "I've been intentional about finding a team where I can contribute meaningfully from day one"
- **Specific and concrete**: Always reference something REAL from the JD or company, and something REAL from the candidate's experience
- **Direct, no fluff**: 2-4 sentences per answer. No "I'm passionate about..." or "I would love the opportunity to..."
- **The hook is the proof, not the claim**: Instead of "I'm great at X", say "I built X that does Y"

**Framework by question:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** → Mention something concrete about the company. "I've been using [product] for [time/purpose]."
- **Relevant experience?** → A quantified proof point. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Honest: "Found through [portal/scan], evaluated against my criteria, and it scored highest."

**Language**: Always in the JD's language (EN default). Apply `/tech-translate`.

## Step 5 — Update Tracker
Register in `data/applications.md` with all columns including Report and PDF as ✅.

**If Stage 0 pre-screen fails (< 3.0)**: write TSV with status `SKIP`, don't generate PDF or full report, notify candidate with preliminary score and reason.

**If any other step fails**, continue with remaining steps and mark failed step as pending in tracker.
