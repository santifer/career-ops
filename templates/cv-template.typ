// Career-Ops Typst CV Template
// Port of cv-template.tex and cv-template.html to Typst 0.14
//
// Typst 0.14 — https://typst.app/docs
// Placeholder tokens match the render-cv-typst.mjs substitution map.
//
// Design spec:
//   Font:        Calibri 11pt body, 12pt bold headings
//   Layout:      Single-column, 0.6in margins
//   Line height: 1.15
//   Page:        US Letter
//
// Placeholder tokens (all replaced by render-cv-typst.mjs at compile time):
//   {{NAME}}              Full name
//   {{PHONE}}             Phone number
//   {{EMAIL}}             Email address
//   {{LINKEDIN_URL}}      LinkedIn URL
//   {{LINKEDIN_DISPLAY}}  LinkedIn display text
//   {{PORTFOLIO_URL}}     Portfolio URL
//   {{PORTFOLIO_DISPLAY}} Portfolio display text
//   {{LOCATION}}          City, State / Remote
//   {{SUMMARY_TEXT}}      Professional summary paragraph
//   {{COMPETENCIES}}      Comma-separated core competencies
//   {{EXPERIENCE}}        Work experience blocks (Typst syntax)
//   {{PROJECTS}}          Project blocks
//   {{EDUCATION}}         Education blocks
//   {{CERTIFICATIONS}}    Certification rows
//   {{SKILLS}}            Skills block

#set page(
  paper: "us-letter",
  margin: (top: 0.6in, bottom: 0.6in, left: 0.6in, right: 0.6in),
)

#set text(
  font: "Calibri",
  size: 11pt,
  weight: "regular",
  fallback: true,
)

#set par(
  leading: 0.65em,
  spacing: 0.65em,
)

// ── Color palette (mirrors cv-template.html) ────────────────────────────────

#let teal-dark    = rgb("#1a7a7a")  // hsl(187, 74%, 28%) approx
#let purple-mid   = rgb("#6b21a8")  // hsl(270, 70%, 40%) approx
#let ink          = rgb("#1a1a2e")
#let body-gray    = rgb("#2f2f2f")
#let muted        = rgb("#555555")
#let light-border = rgb("#e2e2e2")
#let tag-bg       = rgb("#e8f5f5")
#let tag-border   = rgb("#b2dada")

// ── Section heading style ────────────────────────────────────────────────────

#let section-heading(title) = [
  #v(4pt)
  #text(
    size: 11pt,
    weight: "bold",
    font: "Calibri",
    fill: teal-dark,
    tracking: 0.06em,
    upper(title)
  )
  #line(length: 100%, stroke: 1.5pt + light-border)
  #v(4pt)
]

// ── Job entry macro ──────────────────────────────────────────────────────────

#let job-entry(company: "", role: "", period: "", location: "", bullets: ()) = [
  #grid(
    columns: (1fr, auto),
    [
      #text(size: 12pt, weight: "bold", fill: purple-mid, company)
    ],
    [
      #text(size: 10pt, fill: muted, period)
    ],
  )
  #text(size: 10.5pt, weight: "semibold", fill: body-gray, role)
  #if location != "" [
    #h(6pt)
    #text(size: 10pt, fill: rgb("#888888"), location)
  ]
  #v(2pt)
  #if bullets.len() > 0 [
    #set list(marker: "•", body-indent: 1em)
    #set text(size: 10pt, fill: body-gray)
    #list(..bullets)
  ]
  #v(4pt)
]

// ── Project entry macro ──────────────────────────────────────────────────────

#let project-entry(title: "", badge: "", description: "", tech: "") = [
  #text(size: 11pt, weight: "semibold", fill: teal-dark, title)
  #if badge != "" [
    #h(6pt)
    #box(
      fill: tag-bg,
      stroke: 1pt + tag-border,
      radius: 2pt,
      inset: (x: 6pt, y: 1pt),
      text(size: 9pt, fill: teal-dark, badge)
    )
  ]
  #linebreak()
  #text(size: 10pt, fill: rgb("#444444"), description)
  #if tech != "" [
    #linebreak()
    #text(size: 9.5pt, fill: rgb("#888888"), tech)
  ]
  #v(4pt)
]

// ── Education entry macro ────────────────────────────────────────────────────

#let edu-entry(degree: "", org: "", year: "", description: "") = [
  #grid(
    columns: (1fr, auto),
    [
      #text(size: 10.5pt, weight: "semibold", fill: body-gray, degree)
      #h(4pt)
      #text(size: 10.5pt, weight: "medium", fill: purple-mid, org)
    ],
    [
      #text(size: 10pt, fill: muted, year)
    ],
  )
  #if description != "" [
    #text(size: 10pt, fill: rgb("#666666"), description)
  ]
  #v(3pt)
]

// ── Certification entry macro ────────────────────────────────────────────────

#let cert-entry(title: "", org: "", year: "") = [
  #grid(
    columns: (1fr, auto),
    [
      #text(size: 10.5pt, weight: "medium", fill: body-gray, title)
      #h(4pt)
      #text(size: 10.5pt, fill: purple-mid, org)
    ],
    [
      #text(size: 10pt, fill: muted, year)
    ],
  )
  #v(3pt)
]

// ── Competency tag ───────────────────────────────────────────────────────────

#let competency-tag(label) = box(
  fill: tag-bg,
  stroke: 1pt + tag-border,
  radius: 3pt,
  inset: (x: 9pt, y: 3pt),
  text(size: 9.5pt, weight: "medium", fill: teal-dark, label)
)

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT BODY
// ════════════════════════════════════════════════════════════════════════════

// ── Header ───────────────────────────────────────────────────────────────────

#align(left)[
  #text(size: 22pt, weight: "bold", fill: ink, "{{NAME}}")
  #linebreak()
  #v(2pt)
  #line(length: 100%, stroke: gradient.linear(teal-dark, purple-mid))
  #v(4pt)
  #set text(size: 10.5pt, fill: muted)
  {{PHONE}} | {{EMAIL}} | #link("{{LINKEDIN_URL}}")[{{LINKEDIN_DISPLAY}}] | #link("{{PORTFOLIO_URL}}")[{{PORTFOLIO_DISPLAY}}] | {{LOCATION}}
]

#v(6pt)

// ── Professional Summary ──────────────────────────────────────────────────────

#section-heading("Professional Summary")
#set text(size: 10.5pt, fill: body-gray)
#par(leading: 0.75em)[{{SUMMARY_TEXT}}]

#v(6pt)

// ── Core Competencies ────────────────────────────────────────────────────────

#section-heading("Core Competencies")
#wrap-content(
  align: left,
  [{{COMPETENCIES}}]
)

#v(6pt)

// ── Work Experience ──────────────────────────────────────────────────────────

#section-heading("Work Experience")
{{EXPERIENCE}}

// ── Personal Projects ────────────────────────────────────────────────────────

#section-heading("Personal Projects")
{{PROJECTS}}

// ── Education ────────────────────────────────────────────────────────────────

#section-heading("Education")
{{EDUCATION}}

// ── Certifications ───────────────────────────────────────────────────────────

#section-heading("Certifications")
{{CERTIFICATIONS}}

// ── Technical Skills ─────────────────────────────────────────────────────────

#section-heading("Technical Skills")
#set text(size: 10.5pt, fill: rgb("#444444"))
{{SKILLS}}
