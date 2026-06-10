# Mode: resume — Tailored Resume + Cover Letter

Triggered when the user:
- Runs `/career-ops resume` (or `/career-ops-resume` in OpenCode / Gemini CLI)
- Says "generate a resume for this role", "tailor my CV for [company]", "write a cover letter for this", "make me a tailored application pack"
- Pastes a JD and asks for application materials

This mode produces a **tailored resume + cover letter pack** in three formats:
- Designer PDF (single column, ATS-safe, matches the project's design language)
- Markdown (linear, ATS-perfect, paste straight into Smart Jobs / Workday / PageUp)
- HTML source (kept alongside the PDF for re-render)

Output lives at `output/{company-slug}-{role-slug}/` so every application is self-contained.

---

## Step 0 — Pre-flight reads (mandatory)

Read in this order, every time:

1. `cv.md` — canonical experience and credentials (source of truth, never hardcode)
2. `config/profile.yml` — name, contact, headline preferences, language defaults
3. `modes/_profile.md` — user archetypes, writing style, narrative framing
4. `article-digest.md` if it exists — detailed proof points
5. The job description (URL, paste, or `local:jds/{file}`)

**Never invent metrics or claims that aren't in cv.md or article-digest.md.**

---

## Step 1 — Confirm scope with the user

If anything is missing, ask before generating. Specifically:

- **JD source.** "Paste the JD or give me the URL." If the user has already pasted it, skip.
- **Cover letter?** Default = **yes** for any role where the form accepts one. Especially QLD Government, Health, Education, council roles. Only skip if the user explicitly opts out or the application portal disallows attachments.
- **Reference number.** Smart Jobs / Health roles have a `QLD/XXXXXX` ref number. Capture it for the cover letter subject line.
- **Addressee.** "Hiring Panel" is the safe default for QLD Government and Health. Use the named contact if the JD provides one.

Do **not** ask the user to confirm every minor decision — only the things you genuinely can't infer.

---

## Step 2 — Archetype + tailoring decisions

For Danielle's target market, the archetypes are usually:

| Archetype | Lead signals in JD |
|-----------|--------------------|
| QLD Government Admin (AO3–AO4) | "selection criteria", "AO3"/"AO4", "QLD Government", "Smart Jobs", "scheduling, records, correspondence" |
| Education Queensland school admin | "school administration", "Education Queensland", "Caboolture/Moreton Bay region", "BSM", "school finance" |
| Health admin (Metro North / Sunshine Coast HHS) | "Queensland Health", "clinical scheduling", "patient records", "ward administration" |
| Local government / council | "Moreton Bay Regional Council", "rates", "customer service centre", "community services" |
| Healthcare provider admin | "allied health", "medical practice", "patient bookings", "Medicare claims" |

For other career-ops users, fall back to whatever archetypes are defined in `modes/_profile.md`.

For each archetype, the tailoring rules are:

- **Summary** — open with archetype-relevant keywords from the JD. Stay truthful to cv.md.
- **Capabilities** — pick the 3 capability groups that map best to the JD's stated duties. Re-order items so the JD-relevant ones lead.
- **Experience bullets** — re-rank roles so the most relevant comes first chronologically *within its block*. Re-rank bullets within each role so the JD-relevant ones lead. Trim weaker bullets if the resume is overflowing onto a third page.
- **KEY callouts** — add a `key` field to 1–3 roles, max. Reserve callouts for achievements the JD specifically rewards (e.g. audit readiness, stakeholder management, process improvement, compliance under regulation).
- **Status chips** — include credentials that the JD or its sector cares about. For school roles: Blue Card, First Aid, paid employee Blue Card (current). For health: Vaccinations, NDIS Worker Screening if relevant. For govt: Australian Citizen, Full Work Rights.

---

## Step 3 — Build the resume spec JSON

Construct a complete spec following this schema. Write it to
`output/{company-slug}-{role-slug}/resume-spec.json`.

```json
{
  "kind": "resume",
  "applicant": {
    "name": "Danielle Evans",
    "headline": "Senior Administration Professional",
    "location": "Ningi, Moreton Bay QLD 4511",
    "phone": "0430 205 402",
    "email": "danielleevans@outlook.com.au",
    "linkedin": "linkedin.com/in/danielleqld",
    "status_chips": ["Australian Citizen", "Full Work Rights", "Current Paid Employee Blue Card", "First Aid & CPR"],
    "lang": "en-AU"
  },
  "job": {
    "company": "Education Queensland",
    "role": "Administration Officer (AO3)",
    "ref_number": "QLD/123456"
  },
  "summary": {
    "meta": "15+ yrs · regulated environments",
    "text": "Single-paragraph tailored summary, 3–5 sentences, ATS keywords from the JD woven in naturally. No clichés. No 'passionate about'."
  },
  "capabilities": [
    { "group": "Administration & Project Support", "items": ["...", "..."] },
    { "group": "Systems, Risk & Compliance",       "items": ["...", "..."] },
    { "group": "Connection & Engagement",          "items": ["...", "..."] }
  ],
  "experience": [
    {
      "title": "Business Operations Manager",
      "contract": false,
      "dates": "2016 – 2025",
      "company": "The Sundae Creative",
      "location": "Moreton Bay, QLD",
      "context": "One-paragraph framing of the role.",
      "key": "Optional standout achievement, displayed in a highlighted block.",
      "bullets": ["...", "..."]
    }
  ],
  "education": ["Certificate IV in Training and Assessment", "..."],
  "certifications": ["Paid Employee Working with Children Blue Card (current)", "First Aid & CPR"],
  "community": "Active weekly volunteer within the local primary school community...",
  "referees": "Available upon request.",
  "tools": ["Microsoft 365 (Word, Excel, Outlook, Teams, SharePoint)", "..."]
}
```

**Rules when filling the spec:**

- Use **en-dash** for date ranges in display strings (the script will normalise to ASCII for ATS).
- Capitalise role titles in title case.
- Mark contract roles with `"contract": true` so the CONTRACT pill renders.
- `key` is reserved for genuinely role-defining wins — the script will render it inside a plain highlighted callout. Don't pad.
- Keep `bullets` to **2–6 per role**. Cut weaker ones to make room.
- Do not include phone, email, or LinkedIn elsewhere — they go only in `applicant`.

---

## Step 4 — Build the cover letter spec JSON

Write to `output/{company-slug}-{role-slug}/cover-letter-spec.json`.

```json
{
  "kind": "cover-letter",
  "applicant": { "...same as resume..." },
  "job": {
    "company": "Education Queensland",
    "role": "Administration Officer (AO3) — Caboolture State High School",
    "role_short": "AO3 Administration Officer",
    "ref_number": "QLD/123456"
  },
  "letter_date": "27 May 2026",
  "addressee": {
    "recipient": "Hiring Panel",
    "org": "Caboolture State High School",
    "lines": ["Education Queensland"]
  },
  "salutation": "Dear Hiring Panel,",
  "body_paragraphs": [
    "Opening paragraph — name the role, name the school/org, one sentence on why this role specifically (not a generic opener).",
    "Middle paragraph one — 2–3 concrete experience matches against the JD's top requirements, citing real proof points from cv.md.",
    "Middle paragraph two — connection to the community / sector / mission. For QLD school roles, mention local Moreton Bay residency and school volunteering. For health, mention regulated-environment background.",
    "Closing paragraph — invite next step. One sentence. No begging, no over-effusive thanks."
  ],
  "proof": {
    "label": "Relevant Fit",
    "text": "Optional one-sentence fit proof for the approved cover-letter callout. Use only when there is a concrete role-specific evidence point."
  },
  "closing": "Sincerely"
}
```

**Letter rules:**

- One A4 page maximum. If the body is overflowing, cut a sentence, never shrink type.
- Lead with the role and source — "I'm writing to apply for the Administration Officer (AO3) role at Caboolture State High School, advertised on Smart Jobs (QLD/123456)."
- Mirror 2–3 phrases from the JD without parroting it verbatim.
- Quote evidence, don't claim attributes. "I led a 15% reduction in audit prep time at 4cRisk" beats "I am detail-oriented and organised."
- For QLD Government roles, the cover letter is **separate** from selection criteria responses. Don't duplicate the criteria responses here — write a complementary one-page narrative.
- The HTML cover-letter template follows the approved 20260527 gstack design:
  large serif role heading, small uppercase subject label, optional proof block,
  signature, and footer. Use `proof` for one strong evidence-led fit statement;
  omit it when it would repeat the body.

---

## Step 5 — Run the generator

From the project root:

```bash
node generate-resume.mjs output/{company-slug}-{role-slug}/resume-spec.json
node generate-resume.mjs output/{company-slug}-{role-slug}/cover-letter-spec.json
```

The script writes HTML, MD, and PDF into the same folder. Use `--no-pdf` if you only want to preview the HTML/MD first.

---

## Step 6 — Verify

Always confirm before reporting back to the user:

- [ ] PDF rendered. Open and count pages — resume should be 1–2, cover letter exactly 1.
- [ ] No `{{TOKEN}}` strings left unreplaced. Grep for `{{` in the generated HTML and MD.
- [ ] Markdown file pastes cleanly as plain text (no rogue HTML tags, no smart quotes).
- [ ] Status chips and certifications are accurate — Blue Card type is correct
  (Paid Employee vs Volunteer), First Aid currency is real.
- [ ] Ref number, addressee, and role title in the cover letter match the JD exactly.

If any check fails, fix the spec and re-run. Don't ship to the user with `{{...}}` placeholders or a 3-page cover letter.

---

## Step 7 — Tracker and hand-off

Update the tracker following the standard career-ops flow:

1. Write a TSV row to `batch/tracker-additions/{num}-{company-slug}.tsv` with status `Evaluated` (or `Applied` if the user is submitting right now).
2. Run `node merge-tracker.mjs`.

Then hand back to the user with:

```
📄 Resume      → output/{folder}/Danielle_Evans_Resume.pdf
📝 Resume (MD) → output/{folder}/Danielle_Evans_Resume.md
✉️  Cover      → output/{folder}/Danielle_Evans_Cover_Letter.pdf
✉️  Cover (MD) → output/{folder}/Danielle_Evans_Cover_Letter.md
```

Include computer:// links so they're clickable from the chat.

---

## Ethical guardrails (from `_shared.md`)

- Never invent experience, qualifications, or credentials.
- Never submit on the user's behalf — generate, hand over, stop.
- If the role scored below 4.0/5 in a prior evaluation, remind the user before generating: "This scored 3.6 last week — do you want to proceed?"
- If the user has no portfolio link, a writing sample, or current credentials for a credential the role requires, flag the gap rather than silently omitting it.
