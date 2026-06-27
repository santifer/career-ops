// cv-template.typ — Typst CV template for career-ops
//
// Rendered by `generate-typst.mjs` via the `typst` binary (one fast binary —
// no Chromium, no TeX distro). Produces a clean, single-column, ATS-parseable
// PDF with selectable text.
//
// STYLE IS FROZEN. The preamble below (page margins, text size, leading, and
// the section/dated-row/bullet/achievement/linked-label helpers) is the
// candidate's approved house style — DO NOT change padding, font sizes, or
// spacing. Per job, the agent only swaps CONTENT in the placeholder slots:
// reorder/rewrite projects, reframe bullets to the JD, adjust the skills lines.
// Keywords get reformulated, never fabricated.
//
// Placeholders the agent fills (written without the brace tokens here so a
// naive global find-and-replace can't clobber this doc block):
//   NAME          candidate full name (header)
//   CONTACT       header contact line (location | phone | email | links)
//   EDUCATION     Education section body
//   PROJECTS      Projects section body (top 3-4, reordered by JD relevance)
//   ACHIEVEMENTS  Achievements section body
//   SKILLS        Technical Skills & Certifications section body
//
// Section bodies are composed with the helpers: #dated-row, #bullet,
// #achievement, #linked-label, #strong, #section.

#set page(
  paper: "a4",
  margin: (
    top: 0.35in,
    bottom: 0.27in,
    left: 0.56in,
    right: 0.56in,
  ),
)

#set text(
  size: 10.6pt,
)

#set par(
  leading: 0.56em,
)

#let section(title) = [
  #v(1.3em)
  #text(size: 13.9pt)[#title]
  #v(-0.34em)
  #line(length: 100%, stroke: 0.45pt)
  #v(0.22em)
]

#let dated-row(left, right) = grid(
  columns: (1fr, auto),
  column-gutter: 1em,
  left,
  right,
)

#let bullet(body) = pad(left: 0.85em)[
  #grid(
    columns: (auto, 1fr),
    column-gutter: 0.28em,
    [•],
    [#body],
  )
]

#let achievement(title, event, detail, year, desc: none, repo: none) = grid(
  columns: (1fr, auto),
  column-gutter: 1em,
  [
    #strong[#title] | #event
    #pad(left: 1.35em, top: 0.03em)[
      #text(size: 9.7pt)[
        #detail
        #if desc != none [ \ #desc ]
        #if repo != none [ \ #repo ]
      ]
    ]
  ],
  [#pad(top: 0.05em)[(#year)]],
)

#let linked-label(url, label) = link(url)[#underline[#label]]

#align(center)[
  #text(size: 25.2pt)[{{NAME}}]
  #v(-0.35em)
  #text(size: 9.9pt)[
    {{CONTACT}}
  ]
]
#v(-0.6em)

#section[Education]
{{EDUCATION}}

#section[Projects]
{{PROJECTS}}

#section[Achievements]
{{ACHIEVEMENTS}}

#section[Technical Skills & Certifications]
{{SKILLS}}
