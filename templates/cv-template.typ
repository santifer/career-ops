// Career-Ops Typst CV Template
// 2-page strict design — adjudicated by council-of-models + dealbreaker
// (data/research-reports/2page-cv-design-2026-05-17.md)
//
// Typst 0.14 — https://typst.app/docs
//
// Design spec (2026-05-17 council+dealbreaker recommendations):
//   Font:           Inter primary + fallback stack (Carlito, Aptos, Arial, Liberation Sans)
//   Body:           10pt at 1.10 line-height, fill #111827
//   Accent:         #15803d (darkened career-ops green for WCAG AA + print)
//   Layout:         Single-column for Experience spine; light 2-col only in header band
//   Margins:        0.55in left/right, 0.45in top/bottom
//   Page:           US Letter
//   Ligatures:      OFF (ATS-parser safety)
//   Section heads:  11.5pt UPPERCASE bold + 0.5pt rule beneath
//   Role headers:   single-line "Title — Company · Location · Dates" with #h(1fr)
//
// Section order (2026 AI/tech recruiter scan-optimized):
//   Header band > Summary (no heading) > Skills (above-the-fold) >
//   Experience > Selected Projects > Earlier Career > Education & Certifications
//
// Placeholder tokens (all replaced by render-cv-typst.mjs at compile time):
//   {{NAME}}                Full name (string literal context)
//   {{TAGLINE}}             Optional sub-tagline shown under the name (content context, conditional)
//   {{PHONE}}               Phone number (content context)
//   {{EMAIL}}               Email address (content context)
//   {{LINKEDIN_URL}}        LinkedIn URL (string literal context)
//   {{LINKEDIN_DISPLAY}}    LinkedIn display text (content context)
//   {{PORTFOLIO_URL}}       Portfolio URL (string literal context)
//   {{PORTFOLIO_DISPLAY}}   Portfolio display text (content context)
//   {{LOCATION}}            City, State / Remote (content context)
//   {{SUMMARY_TEXT}}        Professional summary paragraph (content context)
//   {{SKILLS_BLOCK}}        Full Skills/Tech Stack section (heading + categorized inline lists)
//   {{EXPERIENCE}}          Work experience blocks (Typst syntax — pre-rendered)
//   {{PROJECTS_BLOCK}}      Full Selected Projects section (heading + entries) or empty string
//   {{EDUCATION_CERT_BLOCK}} Combined Education & Certifications section or empty string
//   {{COMPETENCIES_BLOCK}}  Optional Core Competencies section — empty when cv.md has none
//   {{HIGHLIGHTS}}          (optional, conditional) Highlights box content
//   {{LEARNING}}            (optional, conditional) Continuous learning blocks

#set page(
  paper: "us-letter",
  margin: (top: 0.45in, bottom: 0.45in, left: 0.55in, right: 0.55in),
)

#set text(
  font: ("Inter", "Carlito", "Aptos", "Arial", "Liberation Sans"),
  size: 10pt,
  weight: "regular",
  fill: rgb("#111827"),
  ligatures: false,
  fallback: true,
)

#set par(
  leading: 0.40em,
  spacing: 0.40em,
)

// ── Color palette ────────────────────────────────────────────────────────────

#let accent       = rgb("#15803d")  // darkened career-ops green
#let accent-light = rgb("#f0fdf4")  // very light green tint (highlights box only)
#let accent-border= rgb("#bbf7d0")  // light green border (highlights box only)
#let ink          = rgb("#111827")
#let body-gray    = rgb("#1f2937")
#let muted        = rgb("#4b5563")
#let light-rule   = rgb("#e5e7eb")

// ── Section heading ──────────────────────────────────────────────────────────

#let section-heading(title) = {
  v(10pt)
  text(
    size: 11.5pt,
    weight: "bold",
    fill: accent,
    tracking: 0.06em,
    upper(title)
  )
  v(-2pt)
  line(length: 100%, stroke: 0.5pt + accent)
  v(4pt)
}

// ── Job entry macro ──────────────────────────────────────────────────────────
// Single-line role header (council+dealbreaker D1):
//   "Role Title — Company"            (bold, ink)        ┃   Location · Dates  (italic, muted)
// Optional team-context paragraph (1-2 lines, muted) — only shown when present.
// Bullets follow with hanging indent.

#let job-entry(company: "", role: "", period: "", location: "", team_context: "", bullets: ()) = {
  // Build the right-side "Location · Dates" text — collapse separators when one is missing.
  let right-text = {
    if location != "" and period != "" {
      [#location · #period]
    } else if period != "" {
      [#period]
    } else if location != "" {
      [#location]
    } else {
      []
    }
  }

  grid(
    columns: (1fr, auto),
    gutter: 8pt,
    align: (left, right),
    text(size: 10.5pt, weight: "bold", fill: ink)[#role — #company],
    text(size: 9.5pt, style: "italic", fill: muted)[#right-text],
  )

  if team_context != "" {
    v(1pt)
    text(size: 9.5pt, fill: muted, team_context)
  }

  if bullets.len() > 0 {
    v(3pt)
    set list(marker: "•", body-indent: 0.12in, indent: 0.10in)
    set text(size: 10pt, fill: ink)
    list(..bullets)
  }
  v(6pt)
}

// ── Project entry macro ──────────────────────────────────────────────────────

#let project-entry(title: "", meta: "", description: "", tech: "") = {
  text(size: 10.5pt, weight: "bold", fill: ink, title)
  if meta != "" {
    h(6pt)
    text(size: 9.5pt, style: "italic", fill: muted, meta)
  }
  linebreak()
  text(size: 9.5pt, fill: body-gray, description)
  if tech != "" {
    linebreak()
    text(size: 9.5pt, fill: muted, tech)
  }
  v(3pt)
}

// ── Learning entry macro ─────────────────────────────────────────────────────

#let learning-entry(title: "", org: "", date: "") = {
  grid(
    columns: (1fr, auto),
    gutter: 8pt,
    align: (left, right),
    [
      #text(size: 10pt, weight: "semibold", fill: ink, title)
      #if org != "" {
        h(4pt)
        text(size: 9.5pt, fill: muted, org)
      }
    ],
    text(size: 9.5pt, fill: muted, date),
  )
  v(2pt)
}

// ── Education entry macro (single-line, compact) ─────────────────────────────

#let edu-entry(degree: "", institution: "", year: "", detail: "") = {
  grid(
    columns: (1fr, auto),
    gutter: 8pt,
    align: (left, right),
    [
      #text(size: 10pt, weight: "bold", fill: ink, degree)
      #if institution != "" {
        h(4pt)
        text(size: 10pt, fill: body-gray, institution)
      }
    ],
    text(size: 9.5pt, fill: muted, year),
  )
  if detail != "" {
    v(1pt)
    text(size: 9.5pt, fill: muted, detail)
  }
  v(2pt)
}

// ── Certification row macro (compact, inline list-style) ─────────────────────

#let cert-entry(title: "", issuer: "", date: "") = {
  grid(
    columns: (1fr, auto),
    gutter: 8pt,
    align: (left, right),
    [
      #text(size: 10pt, fill: ink, title)
      #if issuer != "" {
        h(4pt)
        text(size: 9.5pt, fill: muted, issuer)
      }
    ],
    text(size: 9.5pt, fill: muted, date),
  )
  v(1pt)
}

// ── Skills category (inline, not bullet) ──────────────────────────────────────
// Per dealbreaker D5: "Compact 3-line Skills grid using categorized inline lists,
// not bullet lists." A category prints as "**Label:** comma-separated items"
// on a single (wrappable) line.

#let skill-category(label: "", items: "") = {
  text(size: 10pt)[#text(weight: "bold", fill: ink)[#label:] #h(2pt) #text(fill: body-gray, items)]
  v(2pt)
}

// ── Competency tag (used only if Core Competencies section is populated) ─────

#let competency-tag(label) = {
  box(
    inset: (x: 5pt, y: 2pt),
    radius: 3pt,
    fill: accent-light,
    stroke: 0.5pt + accent-border,
    text(size: 9pt, fill: accent, label),
  )
  h(3pt)
}

// ── Highlights box (optional, conditional — only when HIGHLIGHTS populated) ──

#let highlights-box(content) = {
  rect(
    fill: accent-light,
    stroke: 0.5pt + accent-border,
    radius: 4pt,
    inset: (x: 10pt, y: 8pt),
    width: 100%,
  )[
    #text(
      size: 9pt,
      weight: "bold",
      fill: accent,
      tracking: 0.05em,
      upper("Highlights")
    )
    #v(3pt)
    #content
  ]
}

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT BODY
// ════════════════════════════════════════════════════════════════════════════

// ── Header band ──────────────────────────────────────────────────────────────
// Light 2-col: Name + Tagline (left)  |  Contact + Links (right, right-aligned)
// Single use of multi-column layout in the entire CV. Confined to the header
// where ATS parsers handle simple grids reliably.

#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  align: (left, right),
  [
    #text(size: 18pt, weight: "bold", fill: ink, "{{NAME}}")
    #if "{{TAGLINE}}" != "" [
      #linebreak()
      #v(1pt)
      #text(size: 11pt, weight: "medium", fill: body-gray, "{{TAGLINE}}")
    ]
  ],
  [
    #set text(size: 9.5pt, fill: muted)
    #align(right)[
      {{PHONE}} #h(3pt)·#h(3pt) {{EMAIL}} \
      #link("{{LINKEDIN_URL}}")[{{LINKEDIN_DISPLAY}}] #h(3pt)·#h(3pt) #link("{{PORTFOLIO_URL}}")[{{PORTFOLIO_DISPLAY}}] \
      {{LOCATION}}
    ]
  ]
)

#v(6pt)

// ── Highlights (conditional — only when HIGHLIGHTS is non-empty) ─────────────
// The renderer emits `#highlights-box[ ... ] #v(4pt)` when cv.md has a
// `## Highlights` H2 section or when `--highlights "h1|h2|h3"` is passed on the
// CLI. When empty, the substitution emits nothing.
{{HIGHLIGHTS}}

// ── Professional Summary (no section heading; medium-weight body text) ───────
// Per dealbreaker D7: heavier-weight body without a "Summary" heading gives
// the block visual emphasis without burning vertical space on a heading + rule.

#set text(weight: "medium", fill: ink)
#par(leading: 0.45em)[{{SUMMARY_TEXT}}]
#set text(weight: "regular")

#v(4pt)

// ── Core Competencies (optional; rendered only when cv.md has the section) ───

{{COMPETENCIES_BLOCK}}

// ── Skills / Tech Stack (above-the-fold on page 1 per council O3) ────────────

{{SKILLS_BLOCK}}

// ── Work Experience ──────────────────────────────────────────────────────────

#section-heading("Experience")
{{EXPERIENCE}}

// ── Selected Projects (after Experience for a comms-to-AI transitioner) ─────

{{PROJECTS_BLOCK}}

// ── Continuous Learning (optional) ───────────────────────────────────────────
// {{LEARNING}}

// ── Education & Certifications (combined, compact, bottom of page 2) ─────────

{{EDUCATION_CERT_BLOCK}}
