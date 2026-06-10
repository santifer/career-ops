# Resume / Cover Letter Spec Schema

The `generate-resume.mjs` script reads a JSON spec and produces HTML, Markdown, and PDF in `output/{company-slug}-{role-slug}/`.

This document is the contract between Claude (which writes the spec in `modes/resume.md`) and the script (which expands templates).

---

## Resume spec

```jsonc
{
  "kind": "resume",

  "applicant": {
    "name": "Danielle Evans",
    "headline": "Senior Administration Professional",
    "location": "Ningi, Moreton Bay QLD 4511",
    "phone": "0430 205 402",
    "email": "danielleevans@outlook.com.au",
    "linkedin": "linkedin.com/in/danielleqld",        // optional, slug or full URL
    "status_chips": [                                  // optional, max ~5
      "Australian Citizen",
      "Full Work Rights",
      "Current Paid Employee Blue Card",
      "First Aid & CPR"
    ],
    "lang": "en-AU"                                    // optional, defaults en-AU
  },

  "job": {
    "company": "Education Queensland",
    "role": "Administration Officer (AO3)",
    "ref_number": "QLD/123456"                         // optional
  },

  "summary": {
    "meta": "15+ yrs · regulated environments",        // small caption beside the title
    "text": "One paragraph, 3–5 sentences, tailored to the JD."
  },

  "capabilities": [                                    // optional but recommended
    {
      "group": "Administration & Project Support",
      "items": [
        "Operational oversight",
        "Diary & schedule coordination",
        "Workload monitoring",
        "Procurement & budget administration",
        "Travel & logistics"
      ]
    },
    {
      "group": "Systems, Risk & Compliance",
      "items": ["...", "..."]
    },
    {
      "group": "Connection & Engagement",
      "items": ["...", "..."]
    }
  ],

  "experience": [
    {
      "title": "Business Operations Manager",
      "contract": false,                               // renders CONTRACT pill if true
      "dates": "2016 – 2025",
      "company": "The Sundae Creative",
      "location": "Moreton Bay, QLD",
      "context": "One-paragraph framing.",             // optional
      "key": "Optional standout — renders in a plain highlighted callout block.",
      "bullets": [
        "Bullet 1, action verb first, concrete and specific.",
        "Bullet 2 ..."
      ]
    }
  ],

  "education": [                                       // flat list, each becomes a bullet
    "Certificate IV in Training and Assessment",
    "Course in Functioning as a Rehabilitation and Return to Work Coordinator"
  ],

  "certifications": [                                  // optional, renders a separate ATS heading
    "Paid Employee Working with Children Blue Card (current)",
    "First Aid and CPR"
  ],

  "community": "Active weekly volunteer within the local primary school community ...",   // optional paragraph

  "referees": "Available upon request.",               // optional

  "tools": [                                           // optional — shown only in the .md output
    "Microsoft 365 (Word, Excel, Outlook, Teams, SharePoint)",
    "..."
  ]
}
```

---

## Cover letter spec

```jsonc
{
  "kind": "cover-letter",

  "applicant": { /* same shape as resume.applicant */ },

  "job": {
    "company": "Education Queensland",
    "role": "Administration Officer (AO3) — Caboolture State High School",
    "role_short": "AO3 Administration Officer",       // short label for the meta line
    "ref_number": "QLD/123456"
  },

  "letter_date": "27 May 2026",

  "addressee": {
    "recipient": "Hiring Panel",
    "org": "Caboolture State High School",
    "lines": ["Education Queensland"]                  // optional extra address lines
  },

  "salutation": "Dear Hiring Panel,",
  "body_paragraphs": [
    "Paragraph 1 — open with role + source.",
    "Paragraph 2 — concrete experience match.",
    "Paragraph 3 — community / mission fit.",
    "Paragraph 4 — call to next step."
  ],
  "proof": {                                           // optional; renders the approved cover-letter proof block
    "label": "Relevant Fit",
    "text": "One concise evidence-led fit statement."
  },
  "closing": "Sincerely"
}
```

---

## File layout produced

For a spec where `job.company = "Education Queensland"` and `job.role = "Administration Officer (AO3)"`:

```
output/
└── education-queensland-administration-officer-ao3/
    ├── resume-spec.json
    ├── cover-letter-spec.json
    ├── Danielle_Evans_Resume.html
    ├── Danielle_Evans_Resume.md
    ├── Danielle_Evans_Resume.pdf
    ├── Danielle_Evans_Cover_Letter.html
    ├── Danielle_Evans_Cover_Letter.md
    ├── Danielle_Evans_Cover_Letter.pdf
    └── fonts/
```

The slug is lowercased and stripped of punctuation. Output folder name is bounded at 60 chars to avoid OS path limits.

---

## CLI

```bash
# Resume
node generate-resume.mjs path/to/resume-spec.json

# Cover letter
node generate-resume.mjs path/to/cover-letter-spec.json

# Render HTML + MD only (skip PDF — useful for fast iteration)
node generate-resume.mjs path/to/resume-spec.json --no-pdf

# Override the output directory
node generate-resume.mjs path/to/resume-spec.json --out /custom/path
```

---

## Design rules baked into the template

- A4 page format.
- Approved design provenance: verified gstack design-review artifacts in
  `~/.gstack/projects/santifer-career-ops/designs/resume-builder-20260528/`.
- Resume anchor: `variant-a-refined-resume.html`.
- Cover-letter anchor: `variant-a-cover-letter.html`.
- White paper background `#ffffff`, navy ink `#25394f`, soft blue-grey rules `#cad5df`.
- Display face: Georgia / Times fallback, avoiding network font dependency in PDF generation.
- Body face: DM Sans (self-hosted in `fonts/`).
- `generate-resume.mjs` copies the required DM Sans font files into each output
  folder so generated HTML can be reviewed directly in a browser without 404s.
- Resume section labels: small caps, 0.06em letter-spacing, hairline rule below.
- Cover-letter subject, proof label, and footer use `letter-spacing: 0` because
  tracked uppercase text can extract as split characters in PDFs.
- KEY callouts: blue-grey block with plain `Key` tag.
- CONTRACT pills: dark navy pill with `Contract` label, inline with role title.
- ATS-safe single-column layout — no sidebar, no text boxes.
- Canonical resume headings: `Professional Summary`, `Skills`, `Work Experience`,
  `Education`, `Certifications`.
- Cover letters use the matching one-column family: serif role heading, small
  uppercase subject label, optional `proof` block, signature, and footer.
- Body text 10pt, bullets 9.5pt, name 29pt. Print-color-adjust forced on.
