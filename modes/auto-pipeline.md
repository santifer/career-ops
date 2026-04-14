# Mode: auto-pipeline — Full Automatic Pipeline

When the user pastes a JD (text or URL) without an explicit sub-command, run the FULL pipeline in sequence:

## Step 0 — Extract JD

If the input is a **URL** (not pasted JD text), follow this strategy to extract the content:

**Priority order:**

1. **Playwright (preferred):** Most job portals (Lever, Ashby, Greenhouse, Workday) are SPAs. Use `browser_navigate` + `browser_snapshot` to render and read the JD.
2. **WebFetch (fallback):** For static pages (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (last resort):** Search role title + company on secondary portals that index the JD in static HTML.

**If no method works:** Ask the candidate to paste the JD manually or share a screenshot.

**If input is JD text** (not URL): use directly, no fetch needed.

## Step 1 — A-G Evaluation
Execute exactly like the `oferta` mode (read `modes/oferta.md` for all blocks A-G including Block G Posting Legitimacy).

## Step 2 — Save Report .md
Save the complete evaluation in `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (see format in `modes/oferta.md`).
Include Block G in the saved report. Add `**Legitimacy:** {tier}` to the report header.

## Step 3 — Generate PDF
Execute the complete `pdf` pipeline (read `modes/pdf.md`).

## Step 4 — Draft Application Answers (only if score >= 4.5)

If the final score is >= 4.5, generate draft answers for the application form:

1. **Extract form questions**: Use Playwright to navigate to the form and take a snapshot. If they can't be extracted, use the generic questions.
2. **Generate answers** following the tone (see below).
3. **Save in the report** as section `## H) Draft Application Answers`.

### Generic Questions (use if form questions can't be extracted)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tone for Form Answers

**Position: "I'm choosing you."** The candidate has options and is choosing this company for concrete reasons.

**Tone rules:**
- **Confident without arrogance**: "I've spent the past year building production AI agent systems — your role is where I want to apply that experience next"
- **Selective without being superior**: "I've been intentional about finding a team where I can contribute meaningfully from day one"
- **Specific and concrete**: Always reference something REAL from the JD or company, and something REAL from the candidate's experience
- **Direct, no fluff**: 2-4 sentences per answer. No "I'm passionate about..." or "I would love the opportunity to..."
- **The hook is the proof, not the claim**: Instead of "I'm great at X", say "I built X that does Y"

**Framework per question:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** → Mention something concrete about the company. "I've been using [product] for [time/purpose]."
- **Relevant experience?** → A quantified proof point. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Honest: "Found through [portal/scan], evaluated against my criteria, and it scored highest."

**Language**: Always in the JD's language (EN default). Apply `/tech-translate`.

## Step 5 — Update Tracker
Register in `data/applications.md` with all columns including Location, Remote, Report and PDF as ✅.

Column order: `# | Date | Company | Role | Location | Remote | Score | Status | PDF | Report | Notes`

- **Location**: city/state extracted from JD (e.g. `San Francisco, CA` or `Remote US`)
- **Remote**: `remote`, `on-site`, or `unknown`

## Step 6 — Sync to Obsidian Vault

Write the application note to the `_jobSeeking` vault so the Dataview dashboard picks it up.

**Determine folder:**
- Job US/Americas or explicitly Remote-US → `US Applications`
- Job UK/Europe/EMEA → `UK Applications`
- Unknown / fully remote → `US Applications` (default for this branch)

**File name:** `{###} - {Company Name}.md` (e.g. `002 - Anthropic.md`)

**Run:**
```bash
node obsidian-sync.mjs \
  --file "{###} - {Company Name}.md" \
  --content "reports/{###}-{slug}-{date}.md" \
  --folder "{US Applications|UK Applications}" \
  --geo "{US|UK}" \
  --company "{Company}" \
  --role "{Role Title}" \
  --score "{X.X}" \
  --status "{Canonical Status}" \
  --archetype "{matched archetype from _profile.md}" \
  --url "{JD URL}" \
  --pdf {true|false} \
  --pdf-file "{filename.pdf from Step 3 — e.g. cv-company-2026-04-13.pdf — omit if no PDF}" \
  --location "{city, state/country from JD — e.g. 'San Francisco, CA' or 'Remote US'}" \
  --remote "{remote|on-site|unknown}"
```

If Obsidian is closed or the API is unreachable, the script exits safely — the pipeline is not blocked.

**If any step fails**, continue with the remaining steps and mark the failed step as pending in the tracker.
