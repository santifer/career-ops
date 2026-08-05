// Shared optional-section stripping for the CV builders (build-cv-html.mjs,
// build-cv-latex.mjs).
//
// Projects, education, certifications, and awards are the genuinely optional
// CV sections: a candidate's projects are often already covered under Work
// Experience, not every candidate has a degree, not every application carries a
// certification worth listing, and most candidates have no award to name. The
// templates wrap all four unconditionally, so a payload with no entries renders
// a bare section header with nothing under it. The builders'
// buildProjects()/buildEducation()/buildCertifications()/buildAwards()
// correctly return '' — nothing removes the surrounding wrapper, which is what
// this module does.
//
// Certifications has no marker in the LaTeX template (cv-template.tex has no
// Certifications section at all), so PATTERNS.tex has no `certifications` key
// — stripEmptySections skips a section silently when the active format has no
// pattern for it, rather than trying to match against `undefined`. Awards, by
// contrast, is defined for both formats.
//
// Skills is included for a different reason: it is not meant to be routinely
// empty, but a caller can repurpose the section's title (e.g. retitling it to
// "Civic Leadership" or another custom heading) without remembering to
// populate the matching `skills` array, which otherwise ships a bare,
// retitled header with nothing under it — a real incident, not a
// hypothetical. Stripping it when empty is a safety net regardless of *why*
// it ended up empty, matching the hard "never a bare section" bar the other
// sections are held to.
//
// Skills is the last section in every shipped template, so its own strip
// pattern has no following ALL-CAPS marker to stop at — a naive boundary
// would fall through to true end-of-file and swallow the closing
// `</div></body></html>` (`\end{document}` in LaTeX) along with it. Each
// template therefore carries an explicit `<!-- END -->` / `%%%% END %%%%`
// sentinel immediately after the Skills section for the boundary to stop at;
// do not remove that sentinel when editing a template's tail.
//
// The section body is delimited by markers rather than parsed, so the boundary
// pattern carries the whole correctness burden and is easy to get subtly wrong:
//
//   - Stopping at any capitalized comment would also stop at an ordinary
//     comment inside a section body, truncating the strip and leaving markup
//     behind. Markers are therefore matched as all-caps only.
//   - Omitting the end-of-input branch would silently keep a section that
//     happens to be last in the template.
//   - Naming the expected successor ("projects is followed by education")
//     couples the two strips to each other and to template ordering: once an
//     empty education block is removed, a named lookahead for it stops matching
//     and the projects header survives.
//
// Each of those failure modes reintroduces the bare header this module exists
// to remove, and does it silently, so they are covered in
// tests/cv-optional-sections.test.mjs.

// HTML: `<!-- SECTION NAME -->`, all-caps. LaTeX: `%%%%  Name  %%%%` banners.
const HTML_BOUNDARY = String.raw`(?=<!--\s+[A-Z][A-Z ]*-->|$)`;
const TEX_BOUNDARY = String.raw`(?=%{4,}\s|$)`;

const PATTERNS = {
  html: {
    projects: new RegExp(String.raw`<!--\s+PROJECTS\s+-->[\s\S]*?` + HTML_BOUNDARY),
    education: new RegExp(String.raw`<!--\s+EDUCATION\s+-->[\s\S]*?` + HTML_BOUNDARY),
    certifications: new RegExp(String.raw`<!--\s+CERTIFICATIONS\s+-->[\s\S]*?` + HTML_BOUNDARY),
    awards: new RegExp(String.raw`<!--\s+AWARDS\s+-->[\s\S]*?` + HTML_BOUNDARY),
    skills: new RegExp(String.raw`<!--\s+SKILLS\s+-->[\s\S]*?` + HTML_BOUNDARY),
  },
  tex: {
    projects: new RegExp(String.raw`%{4,}\s+PROJECTS\s+%{4,}[\s\S]*?` + TEX_BOUNDARY),
    education: new RegExp(String.raw`%{4,}\s+Education\s+%{4,}[\s\S]*?` + TEX_BOUNDARY),
    awards: new RegExp(String.raw`%{4,}\s+AWARDS\s+%{4,}[\s\S]*?` + TEX_BOUNDARY),
    skills: new RegExp(String.raw`%{4,}\s+Technical Skills\s+%{4,}[\s\S]*?` + TEX_BOUNDARY),
  },
};

export const OPTIONAL_SECTIONS = ['projects', 'education', 'certifications', 'awards', 'skills'];

export function isEmptySection(payload, section) {
  const entries = payload?.[section];
  return !Array.isArray(entries) || entries.length === 0;
}

// Remove every optional section that has no entries in `payload`. Returns the
// template unchanged when both are populated.
export function stripEmptySections(template, payload, format) {
  const patterns = PATTERNS[format];
  if (!patterns) throw new Error(`Unknown template format: ${format}`);

  let out = template;
  for (const section of OPTIONAL_SECTIONS) {
    const pattern = patterns[section];
    if (!pattern) continue; // this format's template has no marker for this section
    if (isEmptySection(payload, section)) {
      out = out.replace(pattern, '');
    }
  }
  return out;
}
