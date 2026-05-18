// Career-Ops Typst CV Template
// Port of cv-template.html to Typst 0.14
//
// Typst 0.14 — https://typst.app/docs
// Placeholder tokens match the render-cv-typst.mjs substitution map.
//
// Design spec:
//   Font:        Calibri 11pt body, 12pt bold headings
//   Accent:      #16a34a (career-ops green, mirrors dashboard --accent token)
//   Layout:      Single-column, 0.6in margins
//   Line height: 1.18
//   Page:        US Letter
//
// Section order (mirrors cv-template.html):
//   Header > Highlights (if populated) > Summary > Competencies >
//   Experience > Projects (if populated) > Learning (if populated) >
//   Education > Certifications (if populated) > Skills
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
//   {{HIGHLIGHTS}}        Typst list content for highlights box (or empty string)
//   {{SUMMARY_TEXT}}      Professional summary paragraph
//   {{COMPETENCIES}}      Comma-separated or Typst-tag content
//   {{EXPERIENCE}}        Work experience blocks (Typst syntax)
//   {{PROJECTS}}          Project blocks (or empty string)
//   {{LEARNING}}          Continuous learning blocks (or empty string)
//   {{EDUCATION}}         Education blocks
//   {{CERTIFICATIONS}}    Certification rows (or empty string)
//   {{SKILLS}}            Skills block

#set page(
  paper: "us-letter",
  margin: (top: 0.6in, bottom: 0.6in, left: 0.6in, right: 0.6in),
)

#set text(
  font: ("Calibri", "Helvetica Neue", "Helvetica", "Arial", "Liberation Sans"),
  size: 11pt,
  weight: "regular",
  fallback: true,
)

#set par(
  leading: 0.55em,
  spacing: 0.55em,
)

// ── Color palette ────────────────────────────────────────────────────────────

#let accent       = rgb("#16a34a")  // career-ops green, matches dashboard --accent
#let accent-light = rgb("#f5fdf7")  // highlights box background
#let accent-border= rgb("#bbf7d0")  // highlights box border
#let ink          = rgb("#1a1a1a")
#let body-gray    = rgb("#333333")
#let muted        = rgb("#555555")
#let light-rule   = rgb("#e5e7eb")

// ── Section heading ──────────────────────────────────────────────────────────

#let section-heading(title) = {
  v(8pt)
  text(
    size: 12pt,
    weight: "bold",
    fill: accent,
    tracking: 0.04em,
    upper(title)
  )
  v(-4pt)
  line(length: 100%, stroke: 0.75pt + accent)
  v(4pt)
}

// ── Job entry macro ──────────────────────────────────────────────────────────

#let job-entry(company: "", role: "", period: "", location: "", team_context: "", bullets: ()) = {
  grid(
    columns: (1fr, auto),
    gutter: 8pt,
    text(size: 11pt, weight: "bold", fill: ink, company),
    text(size: 10pt, fill: muted, period),
  )
  v(1pt)
  if role != "" {
    text(size: 10.5pt, style: "italic", fill: body-gray, role)
    if location != "" {
      h(6pt)
      text(size: 10pt, fill: rgb("#888888"), location)
    }
  }
  if team_context != "" {
    v(3pt)
    text(size: 10pt, fill: body-gray, team_context)
  }
  v(3pt)
  if bullets.len() > 0 {
    set list(marker: "-", body-indent: 1em)
    set text(size: 10.5pt, fill: ink)
    list(..bullets)
  }
  v(5pt)
}

// ── Project entry macro ──────────────────────────────────────────────────────

#let project-entry(title: "", meta: "", description: "", tech: "") = {
  text(size: 10.5pt, weight: "bold", fill: ink, title)
  if meta != "" {
    h(6pt)
    text(size: 10pt, fill: muted, meta)
  }
  linebreak()
  text(size: 10.5pt, fill: ink, description)
  if tech != "" {
    linebreak()
    text(size: 9.5pt, fill: rgb("#777777"), tech)
  }
  v(5pt)
}

// ── Learning entry macro ─────────────────────────────────────────────────────

#let learning-entry(title: "", org: "", date: "") = {
  grid(
    columns: (1fr, auto),
    gutter: 8pt,
    [
      #text(size: 10.5pt, weight: "semibold", fill: ink, title)
      #if org != "" {
        h(4pt)
        text(size: 10pt, fill: muted, org)
      }
    ],
    text(size: 10pt, fill: muted, date),
  )
  v(3pt)
}

// ── Education entry macro ────────────────────────────────────────────────────

#let edu-entry(degree: "", institution: "", year: "", detail: "") = {
  grid(
    columns: (1fr, auto),
    gutter: 8pt,
    [
      #text(size: 10.5pt, weight: "bold", fill: ink, degree)
      #if institution != "" {
        h(4pt)
        text(size: 10.5pt, fill: body-gray, institution)
      }
    ],
    text(size: 10pt, fill: muted, year),
  )
  if detail != "" {
    v(1pt)
    text(size: 10pt, fill: muted, detail)
  }
  v(4pt)
}

// ── Certification entry macro ────────────────────────────────────────────────

#let cert-entry(title: "", issuer: "", date: "") = {
  grid(
    columns: (1fr, auto),
    gutter: 8pt,
    [
      #text(size: 10.5pt, fill: ink, title)
      #if issuer != "" {
        h(4pt)
        text(size: 10pt, fill: muted, issuer)
      }
    ],
    text(size: 10pt, fill: muted, date),
  )
  v(3pt)
}

// ── Highlights box ────────────────────────────────────────────────────────────

#let highlights-box(content) = {
  rect(
    fill: accent-light,
    stroke: 0.75pt + accent-border,
    radius: 6pt,
    inset: (x: 14pt, y: 10pt),
    width: 100%,
  )[
    #text(
      size: 9pt,
      weight: "bold",
      fill: accent,
      tracking: 0.07em,
      upper("Highlights")
    )
    #v(4pt)
    #content
  ]
}

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT BODY
// ════════════════════════════════════════════════════════════════════════════

// ── Header ───────────────────────────────────────────────────────────────────

#align(left)[
  #text(size: 26pt, weight: "bold", fill: ink, "{{NAME}}")
  #if "{{TAGLINE}}" != "" [
    #linebreak()
    #v(2pt)
    #text(size: 13pt, weight: "regular", fill: body-gray, "{{TAGLINE}}")
  ]
  #linebreak()
  #v(3pt)
  #set text(size: 10pt, fill: muted)
  {{PHONE}} #h(3pt)·#h(3pt) {{EMAIL}} #h(3pt)·#h(3pt) #link("{{LINKEDIN_URL}}")[{{LINKEDIN_DISPLAY}}] #h(3pt)·#h(3pt) #link("{{PORTFOLIO_URL}}")[{{PORTFOLIO_DISPLAY}}] #h(3pt)·#h(3pt) {{LOCATION}}
]

#v(6pt)

// ── Highlights (conditional — only when HIGHLIGHTS is non-empty) ─────────────
// ATS: text layer order is header → highlights → summary → competencies
// → experience per finding #43. Parsers read single-column flow in order.
//
// HIGHLIGHTS token is populated by the calling agent (e.g. cv-tailor.mjs)
// as a Typst list body. render-cv-typst.mjs will substitute the token at
// compile time; if not populated it remains as the literal placeholder and
// is treated as absent.
//
// {{HIGHLIGHTS}}

// ── Professional Summary ──────────────────────────────────────────────────────

#section-heading("Professional Summary")
#set text(size: 10.5pt, fill: ink)
#par(leading: 0.75em)[{{SUMMARY_TEXT}}]

#v(4pt)

// ── Core Competencies (rendered only when cv.md has a competencies section) ──

{{COMPETENCIES_BLOCK}}

// ── Work Experience ──────────────────────────────────────────────────────────

#section-heading("Work Experience")
{{EXPERIENCE}}

// ── Selected Projects ────────────────────────────────────────────────────────
// Rendered when PROJECTS token is populated by the calling agent.
// render-cv-typst.mjs always populates PROJECTS (falls back to "(see cv.md)").

#section-heading("Selected Projects")
{{PROJECTS}}

// ── Continuous Learning ───────────────────────────────────────────────────────
// Optional I2-trajectory section. Populated by calling agent when present.
// {{LEARNING}} — token; omit this section if learning data is absent by
// leaving the token as a comment or populating with an empty string at build time.

// ── Education ────────────────────────────────────────────────────────────────

#section-heading("Education")
{{EDUCATION}}

// ── Certifications ───────────────────────────────────────────────────────────

#section-heading("Certifications")
{{CERTIFICATIONS}}

// ── Technical Skills ─────────────────────────────────────────────────────────

#section-heading("Technical Skills")
#set text(size: 10.5pt, fill: ink)
{{SKILLS}}
