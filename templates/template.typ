// #let font_color = rgb("#2A2D31")
#let font_color = rgb("#28282B")
#let font_color_headings = rgb("#1B1212")
#let paper_format = sys.inputs.at("format", default: "a4")


// Utility functions
#let justify_align(left_body, right_body) = {
  block[
    #left_body
    #box(width: 1fr)[#align(right)[#right_body]]
  ]
}

#let title_section(title) = {
  set text(size: 14pt, weight: "semibold", fill: font_color_headings)
  align(left)[
    #smallcaps[#title]
    #line(length: 100%, stroke: (paint: gray, thickness: 1pt))
  ]
}

// Component functions
#let name_component(firstname, lastname) = {
  align(center)[
    #pad(bottom: 5pt)[
      #block[
        #set text(size: 25pt, style: "normal", fill: font_color_headings)
        #text(weight: "light")[#firstname]
        #text(weight: "light")[#lastname]
      ]
    ]
  ]
}

#let positions_component(positions) = {
  set text(size: 9pt, weight: "regular", ligatures: false)
  align(center)[
    #smallcaps[#positions.join(text[#" "#sym.dot.c#" "])]
  ]
}

#let contacts_component(contact_info) = {
  set box(height: 11pt)
  set text(size: 11pt)

  let icons = (
    phone: box(image("../assets/icons/phone-solid.svg")),
    email: box(image("../assets/icons/envelope-solid.svg")),
    portfolio: box(image("../assets/icons/globe-solid.svg")),
    linkedin: box(image("../assets/icons/linkedin.svg")),
    github: box(image("../assets/icons/github.svg")),
    medium: box(image("../assets/icons/medium.svg"))
  )

  let links = (
    phone: "",
    email: "mailto:",
    portfolio: "https://www.",
    linkedin: "https://www.linkedin.com/in/",
    github: "https://github.com/",
    medium: "https://medium.com/@"
  )

  let separator = box(width: 6pt)

  align(center)[
    #block[
      #align(horizon)[
        #for (key, value) in contact_info {
          icons.at(key)
          separator
          box[#link(links.at(key) + value)[#value]]
          separator
        }
      ]
    ]
  ]
}

#let section_content(title, content) = {
  set block(above: 0.7em, below: 0.7em)
  set pad(top: 5pt)
  title_section(title)
  content
}

#let work_experience_component(experience_details) = {
  for (_, work) in experience_details {
    pad[
      #if (work.company != "" and work.location != "") [
        #justify_align[
          #set text(size: 11pt, style: "normal", weight: "semibold", fill: font_color_headings)
          #work.company
        ][
          #set text(size: 11pt, style: "normal", weight: "semibold", fill: font_color_headings)
          #work.location
        ]
      ]
      #justify_align[
        #set text(size: 9pt, style: "italic", weight: "semibold", fill: font_color_headings)
        #work.title
      ][
        #set text(size: 9pt, style: "normal", weight: "semibold", fill: font_color_headings)
        #work.duration
      ]
    ]

    set text(size: 10pt, style: "normal")
    set par(leading: 0.65em)
    work.work_summary
  }
}

// Main resume function
#let resume(author: (:), body) = {
  // Global settings
  set text(font: ("Roboto"), lang: "en", size: 10pt, fill: font_color, fallback: false)
  set page(paper: paper_format, margin: (left: 0.30in, right: 0.30in, top: 0.20in, bottom: 0.20in))
  set list(indent: 5pt)
  set par(spacing: 0.75em)
  set par(justify: true)
  set heading(numbering: none, outlined: false)

  // Components
  name_component(author.firstname, author.lastname)
  positions_component(author.positions)
  contacts_component(author.contact)
  section_content("professional summary", author.professional_summary)
  section_content("work experience", work_experience_component(author.experience_details))
  section_content("certifications", author.certifications)
  section_content("skills", author.skills)
  section_content("education", author.education)
}
