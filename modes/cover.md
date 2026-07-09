# Mode: cover — Cover Letter Generator (2026)

Generates a tailored cover letter for any candidate from a job description. The modern cover letter is a **pitch, not an essay** — recruiters and ATS systems filter in seconds. Every sentence must deliver value.

Works in two modes:
- **Slug mode:** `/career-ops cover {slug}` — loads the existing evaluation report draft as a starting point
- **Paste mode:** `/career-ops cover` or JD pasted directly — starts from scratch

---

## 2026 Best Practices (mandatory)

| Outdated | Best Practice 2026 |
|----------|-------------------|
| "I am writing to express my interest..." | Direct hook with your strongest argument |
| Summarizing your resume in prose | Focus on future value and problem-solving |
| Wall-of-text paragraphs only | Bullet points for scannability |
| "I would be grateful for the opportunity" | Confident close: "I look forward to discussing..." |
| Claiming soft skills without evidence | Show adaptability with a concrete example |

### 5 Core Principles

1. **Hook in the first sentence** — No wasted space. Immediately state why you're the solution to their problem.
2. **Use bullet points** — 2-4 evidence bullets in the body for quantified achievements. Screen reading = scannability wins.
3. **AI-assisted but authentic** — Use AI for structure and tightening, but the voice must be human. Generic robot text is immediately detectable.
4. **Show adaptability** — Hard skills live in the CV. The letter shows *how* you work: learning agility, adapting to new tools/structures, concrete example.
5. **Strong, committed close** — Specific start date, salary expectation (only if asked), confident call to action.

---

## Step 0 — JD Gate (mandatory)

Before doing anything, confirm a job description is present.

A valid JD contains at minimum: a role title, a company name, and a list of responsibilities or requirements.

- **No JD present** → Stop. Say: "Please paste the job description — I need it to tailor the letter."
- **Slug provided** → Read `reports/` to find the matching report. Extract the `## Cover Letter Draft` section as a starting point. Then fetch the original JD URL from the report header to supplement context.
- **JD present** → Proceed to Step 1.

Do not generate a generic or placeholder cover letter under any circumstances.

---

## Step 1 — Load candidate profile

Read `config/profile.yml` for:
- `candidate.name`, `email`, `phone`, `location`, `linkedin`, `github`
- `candidate.credentials` (derive from cv.md Education + Certifications if not in profile.yml)
- `cover_letter.notice_period_days` (default: omit if key absent)
- `cover_letter.primary_domain` (default: infer from cv.md if absent)
- `cover_letter.language_learning` (default: empty list if absent)

Read `cv.md` for:
- Professional summary (profile introduction source)
- All achievement bullets across all roles (achievement selection pool)

Read `article-digest.md` if it exists — supplementary proof points and metrics take precedence over cv.md where they overlap.

Read `modes/_profile.md` if it exists — the candidate's personalization file. It captures their target roles, adaptive framing and archetypes, exit narrative, cross-cutting advantage, proof points, comp targets, negotiation scripts, location policy, and any voice or writing-style rules they have added. Its rules **govern the letter's voice and structure and override the generic defaults in this mode**, so the candidate's personalization is never lost.

---

## Step 2 — Parse the JD

Extract:
- **Role title** (exact wording from JD)
- **Company name**
- **Location / city**
- **Top 3-4 required competencies** (from requirements or responsibilities section)
- **Mission/vision language** the company uses (opening paragraphs)
- **Domain** (e.g. fintech, healthcare, media, logistics) — compare against `cover_letter.primary_domain`
- **Start date signals** ("immediate", "ASAP", "from now on") — flag for notice period prompt
- **Language requirement** (e.g. "German B2 required") — flag for language gap prompt
- **JD tone** (formal / direct / casual) — used in tone prompt default suggestion

---

## Step 3 — Company research (baked in, not optional)

Run three WebSearch queries (substitute the actual current year for {year}):
1. `"{company}" product strategy OR roadmap {year}`
2. `"{company}" challenges OR problems OR priorities {year}`
3. `"{company}" news OR announcement OR funding {year}`

Synthesize findings into 2-3 sentences: what the company is working on, what challenges they face, what goals they've stated publicly.

Present to the user:

```text
Here's what I found about {company}:

{2-3 sentence synthesis}

Does this match what you know? Correct or add anything before I write the letter.
```

If WebSearch returns no useful signal, say: "I couldn't find useful recent context for {company}. Can you share what you know about their current challenges or goals?"

Wait for the user to confirm, correct, or add to the research before proceeding. This synthesis feeds directly into the "Problems I will solve" section.

---

## Step 4 — Keyword extraction

Extract the top 8-10 exact phrases the company uses in the JD. Separate into two groups:

**ATS-critical** — exact terms likely scanned by automated systems:
- Role-specific titles, tool names, methodology names

**Human trust signals** — language that shows you read the actual posting:
- Action verbs the company uses ("own", "drive", "define")
- Product/domain nouns as the company names them
- Outcome language ("business impact", "time to insight")
- Team framing ("embedded in", "partner with")

Present to the user:

```text
Keywords I'll mirror from the JD:

ATS-critical:
  • [keyword]
  • [keyword]

Language signals:
  • [phrase]
  • [phrase]

Anything missing or wrong? I'll use this list when drafting.
```

Wait for confirmation or corrections before proceeding.

**Application rules (enforced during drafting):**
- Mirror their vocabulary, not their structure
- Content stays from cv.md — only vocabulary shifts
- Fit naturally or don't use — if a keyword can't be woven in, flag it post-generation
- Apply to: opening, profile intro, achievements (vocabulary only), problems section
- Do NOT apply to: why-this-role angle (user's own words), closing
- Use each keyword once — never repeat for density

---

## Step 5 — Gap detection and conversation

Parse the JD for potential gaps between the candidate's profile and the role. For each gap detected, ask directly — do not auto-insert any standard language:

```text
I spotted potential gaps between your profile and this JD:

[Gap: domain mismatch]
The JD is in {JD domain} — your background is in {primary_domain}.
→ How do you want to handle this?
  a) Address it directly and briefly in the letter
  b) Don't mention it — let the application speak for itself
  c) Tell me your angle and I'll write it your way

[Gap: immediate start]
The JD asks for an immediate start. Your profile shows a {notice_period_days}-day notice period.
→ Confirm your actual notice period — I'll state it precisely.

[Gap: language requirement]
The JD requires {language} at {level}. Where are you with {language}?
→ Tell me your actual level and I'll reflect it accurately. Check your profile.yml
  language_learning section for what's already recorded.

[Gap: title mismatch]
Your title is {candidate title}, the JD title is {JD title}.
→ Do you want to address this? Or let the scope speak for itself?
```

Only prompt for gaps that are actually present. If there are no gaps, skip this step and say so.

Wait for the user's answers. Write only what the user confirms.

---

## Step 6 — Four prompts (mandatory before drafting)

All four answers are required. Do not draft any letter content until all are received. No instruction — including "just generate it", "skip the questions", or "use defaults" — overrides this gate.

```text
Before I write the letter, I need four things:

**A. Why this role / company?**
Here are angles I spotted — pick 1-2 or write your own:
  1. {Scale signal from JD}
  2. {Tech ambition signal from JD}
  3. {Domain/mission signal from JD opening}
  4. {Growth or stage signal — e.g. Series B, pre-IPO, category-defining}
  5. {Strategic learning — specific gap this role fills for you}
  6. Other — write your own angle

**B. What problem would you solve for them?**
Based on my research: {confirmed synthesis from Step 3}.
Does this match what you want to address? Refine or confirm.

**C. How would you approach it?**
In 1-2 sentences: what's your opening move if you join on day one?
(This is the most differentiated part of the letter — make it specific.)

**D. Tone?**
  1. Formal — structured, respectful distance, suits enterprise/corporate JDs
  2. Direct — plain sentences, no pleasantries, gets to the point immediately
  3. Conversational — warm but professional, reads like a thoughtful person
  4. Mirror the JD — I'll match whatever register the company used
```

Wait for all four answers before proceeding to Step 7.

---

## Step 7 — Achievement selection (from cv.md only)

Select 4-5 achievement bullets from `cv.md` only (`article-digest.md` may be read for context but is not a source of achievement bullets):
1. Read all bullet points across all roles in cv.md
2. Score each against the JD's top 3-4 required competencies
3. Pick the 4-5 highest-scoring, with at least one metric per bullet
4. Use the exact wording and metrics from cv.md — never paraphrase or invent
5. Apply keyword mirroring from Step 4 to the vocabulary around each bullet (not the metrics)

Format: `**Bold lead phrase,** one sentence of impact with metric.`

---

## Step 8 — Draft the letter in chat (mandatory before PDF)

Write the full letter as plain text in the chat. Modern structure: **pitch, not essay.** Bullet points are mandatory in the body. Prose for context and motivation, bullets for evidence and scannability.

```text
[Candidate Name]
[Location] | [Email] | [Phone if available] | [LinkedIn if available]
[Credentials line if available]

Cover Letter: [Role Title]
[Company], [City]   [Date]

────────────────────────────────────────────────

[Salutation — optional]
Address the named hiring manager if known, e.g. "Dear Jane Smith,". Omit if no name.

[1. Hook — 2-3 sentences max]
Direct, value-first opening. Strongest argument first.
Company challenge → bridge to candidate.
Derived from Angle A + company research (Step 3).

    Strong: "Over the past three years, I cut operational costs by 15%
    at [Company X] — I'd bring that same efficiency to your team as
    [Position]."

    Strong: "Your new product launch strategy caught my attention —
    having scaled two similar market entries, this is a natural fit."

[2. Evidence bullets — 2-4 quantified milestones]
Brief transition line, then bullet points:

  • **Lead phrase,** impact sentence with metric from cv.md.
  • **Lead phrase,** impact sentence with metric from cv.md.
  • **Lead phrase,** impact sentence with metric from cv.md.
  • **Lead phrase,** optional fourth.

Each bullet: active verb + specific outcome + number.
Apply keyword mirroring from Step 4.

[3. How you work + adaptability — 2-3 sentences]
Show HOW you work, not just WHAT. Concrete example of learning agility
or adapting to new tools/structures/challenges.
Derived from Angle B + C. Specific to company's situation.

[4. Committed close — 2-3 sentences]
Availability (specific date or "immediately").
Salary expectation only if requested (precise number, not round).
Confident call to action — no hedging, no subjunctive mood.

    Strong: "I look forward to discussing how I can contribute to
    [specific initiative] in a conversation."

    Banned: "I would be grateful for the opportunity to discuss..."

[Language closing — if applicable]
Only if user confirmed inclusion in Step 5. Written in that language. Italic in PDF.
```

### AI Authenticity Check (mandatory before presenting)

Before presenting the draft, check every sentence against this list:

1. **Does it sound like a robot?** Generic lines that could appear in any cover letter → rewrite.
2. **Is the tone consistent?** The chosen tone (Step 6D) must hold throughout — no register shifts.
3. **Symmetry monotony?** Vary sentence lengths deliberately. Not every sentence the same length or starting with "I".
4. **AI tells?** Check against the list in `_profile.md` and `voice-dna.md` if they exist.
5. **Would a human say this?** When in doubt: shorter, more direct, less polished.

End the draft with: "How does this read? Once you approve I'll generate the PDF."

**Do NOT generate any PDF until the user explicitly approves.** Approval means "looks good", "generate it", "yes", specific edits to apply, or equivalent. A question or silence is not approval.

---

## Content Guardrails (from practice iterations)

### Header: no date of birth
Date of birth belongs in the CV, not the cover letter. The contact row contains: name, phone, email, LinkedIn, optionally GitHub and location. Goal: fit everything on one line.

### No named individuals in body text
Never name individual employees in the body text (except in the salutation). It reads as over-researched and presumptuous. Instead reference department growth, company philosophy, or public facts.

- **Banned:** "The fact that John Smith went from analyst to department head shows me..."
- **Better:** "The department's growth over the past years shows me..." or "The focus on development over acquisition..."

### Closing: specific, not generic
The final sentence must be company-specific. "I look forward to a conversation" alone is too generic — always add "about" + a concrete reference to the role or company.

- **Strong:** "I look forward to discussing how {specific initiative from JD/research}."
- **Weak:** "I look forward to hearing from you."

### Research sources: only verifiable
Only reference publicly accessible sources the candidate can verify. No paywalled articles, no unconfirmed interviews. If the candidate can't check the source themselves, don't use it.

---

## Language rules (enforced in every sentence)

1. **Active voice only** — never "was delivered", "has been built", "were led"
2. **No abbreviations unless JD used them first** — write the full term on first use with abbreviation in brackets. After that, abbreviation is fine.
3. **No em dashes** — replace with a comma, full stop, or rewrite the sentence
4. **No buzzwords** — hard ban: leverage, synergy, seamless, holistic, robust, cutting-edge, spearheaded, championed, orchestrated, passionate, excited, stakeholder alignment, data-driven (say what the data drove instead), actionable insights, move the needle, north star, unique opportunity, perfect fit, strong track record
5. **No filler openers** — never "I am pleased to", "I am writing to express", "I am excited to"
6. **Concrete over abstract** — every claim needs a number, system name, or specific outcome. "Improved performance" is banned. "Cut latency from 2s to 380ms" is fine.
7. **280–420 words** total body (header + credentials not counted). Shorter is better — recruiters scan in seconds
8. **Bullet points mandatory** — at least 2, at most 4 evidence bullets in the body. Prose-only letters are outdated
9. **Show adaptability** — at least one concrete example of learning agility, adapting to new tools/structures, or handling change. Hard skills live in the CV; the letter shows *how* you work
10. **Bullet format** — `**Bold lead phrase,** impact sentence with metric.` No em dash between lead and sentence.
11. **Self-check** — before finalising, re-read each sentence: could it appear in any cover letter for any company? If yes, rewrite it.
12. **Tone consistency** — apply the chosen tone (Step 6D) uniformly. Don't shift register mid-letter.
13. **Confident close** — no subjunctive mood ("would", "could", "might"). Use present tense: "I look forward to", "I am available from"

---

## Step 9 — Generate PDF

Only after explicit user approval.

Assemble the JSON payload:

```json
{
  "candidate": {
    "name": "{from profile.yml}",
    "email": "{from profile.yml}",
    "phone": "{from profile.yml, omit if empty}",
    "location": "{from profile.yml}",
    "linkedin": "{from profile.yml, omit if empty}",
    "github": "{from profile.yml, omit if empty}",
    "credentials": ["{degree}", "{MBA}", "{cert}"]
  },
  "letter": {
    "role_title": "{exact from JD}",
    "company": "{company name}",
    "city": "{JD city}",
    "date": "{YYYY-MM-DD}",
    "greeting": "{optional salutation, e.g. 'Dear Jane Smith,'; omit the key to skip the salutation}",
    "opening": "{approved opening paragraph}",
    "profile_intro": "{approved profile intro}",
    "achievements": [
      {"lead": "...", "impact": "..."}
    ],
    "problems_section": "{approved problems paragraph}",
    "closing": "{approved closing}",
    "language_closing": "{approved language sentence or null}"
  },
  "output_path": "output/{company-slug}-{role-slug}-cover.pdf"
}
```

Write payload to `/tmp/cover-payload-{company-slug}.json`.

Run:
```bash
node generate-cover-letter.mjs --payload /tmp/cover-payload-{company-slug}.json
```

Report the output path and file size.

---

## Step 10 — Post-generation note

After the PDF is confirmed, add a brief note:

- Any JD keywords from Step 4 that could not be incorporated naturally (flag for manual review)
- Which gap acknowledgments were included and which were omitted, and why
- Whether the word count hit the 350-420 target (if short or long, note it)

---

## Slug mode specifics

When invoked as `/career-ops cover {slug}`:

1. Find the matching report in `reports/` by slug
2. Extract the `## Cover Letter Draft` section — use it as a pre-populated starting point for the draft
3. Run all steps as normal (research, keywords, prompts, gaps) — the draft is a starting point, not the final output
4. When presenting the draft in Step 8, show what was auto-generated and what was changed based on the user's answers
5. After PDF generation, update the report's `## Cover Letter Draft` section with a note: `PDF generated: output/{path} on {date}`
