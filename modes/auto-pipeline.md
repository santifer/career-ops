# Mode: auto-pipeline — Full Automatic Pipeline

When the user pastes a JD as text or URL without an explicit subcommand, run the full pipeline in sequence.

## Step 0 — Extract The JD

If the input is a URL, use this priority order:

1. Playwright for dynamic job portals such as Lever, Ashby, Greenhouse, or Workday
2. Direct fetch for static pages
3. Web search as a last resort for mirrored or indexed copies

If none of those work, ask the user to paste the JD manually or share a screenshot.

If the input is already JD text, use it directly.

## Step 1 — Run The A-F Evaluation

Follow [`modes/oferta.md`](C:/Users/chipp/OneDrive/Documents/projects/career-ops/modes/oferta.md) exactly.

## Step 2 — Save The Markdown Report

Write the evaluation to:

```text
reports/{###}-{company-slug}-{YYYY-MM-DD}.md
```

## Step 3 — Generate The PDF

Run the PDF workflow defined in [`modes/pdf.md`](C:/Users/chipp/OneDrive/Documents/projects/career-ops/modes/pdf.md).

## Step 4 — Draft Application Answers

Only do this when the final score is `>= 4.5`.

1. Extract application questions if possible
2. Generate concise English answers
3. Save them in the report under `## G) Draft Application Answers`

Generic fallback questions:
- Why are you interested in this role?
- Why do you want to work at this company?
- Tell us about a relevant project or achievement
- What makes you a good fit?
- How did you hear about this role?

Tone rules:
- confident without arrogance
- specific and evidence-based
- direct, no fluff
- 2-4 sentences per answer
- English only

## Step 5 — Update The Tracker

Register the job in `data/applications.md` with the report and PDF columns populated.

If any step fails, continue when possible and mark the failed step clearly instead of hiding it.
