// tests/cv-optional-sections.test.mjs — the optional CV sections (projects,
// education, certifications, awards, skills) must vanish entirely when they
// have no entries, rather than rendering a bare section header with nothing
// under it.
//
// #1879 fixed this for projects; education is the same bug (not every
// candidate has a degree). Certifications was fixed once directly in
// build-cv-html.mjs, then lost when that logic was generalized into this
// shared module (only projects/education made the cut) — the v1.22.0
// auto-update shipped that regression. Awards (#2220) is optional by
// construction: most candidates have none, so it ships hidden-when-empty from
// the start rather than being retrofitted.
//
// Skills joined the list after a live incident: a caller retitled the Skills
// section (e.g. to "Civic Leadership") without populating the matching
// `skills` array, shipping a bare, retitled header in a generated CV. Skills
// is also the *last* section in every shipped template, so its strip pattern
// has no following ALL-CAPS marker to stop at on its own — each template now
// carries a trailing `<!-- END -->` / `%%%% END %%%%` sentinel for the
// boundary to stop at. Without it, stripping an empty Skills section would
// fall through to true end-of-file and swallow the closing
// `</div></body></html>` (`\end{document}` in LaTeX) along with the bare
// header — a worse bug than the one it was meant to fix. The "closing
// document skeleton survives" checks below guard specifically against that
// regression.
//
// All five are delimited by marker matching rather than parsed, so the
// boundary pattern is the whole correctness story — see the header comment
// in cv-sections-core.mjs for the failure modes exercised here.
import { readFileSync } from 'fs';
import { join } from 'path';
import { pass, fail, ROOT } from './helpers.mjs';
import { stripEmptySections } from '../cv-sections-core.mjs';

console.log('\ncv-sections-core.mjs — optional sections leave no bare header');

const EMPTY = { projects: [], education: [], certifications: [], awards: [], skills: [] };
const FULL = {
  projects: [{ name: 'P' }],
  education: [{ degree: 'D' }],
  certifications: [{ title: 'C' }],
  awards: [{ title: 'A' }],
  skills: [{ category: 'S', items: 'x' }],
};

function check(label, actual, expected) {
  if (actual === expected) pass(label);
  else fail(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- Real templates: the sections must actually disappear ------------------
// Assert against the shipped templates so a template edit that renames or
// reorders a marker fails here instead of silently reviving the bare header.
// `after` is the trailing sentinel that must survive no matter which
// sections are empty — the `<!-- END -->` / `%%%% END %%%%` marker itself,
// never the (now-strippable) SKILLS marker or its content.
const TEMPLATES = [
  { file: 'templates/cv-template.html', format: 'html', after: '<!-- END -->', hasCertifications: true },
  { file: 'templates/cv-template.zh-minimal.html', format: 'html', after: '<!-- END -->', hasCertifications: true },
  { file: 'templates/resume-template.html', format: 'html', after: '<!-- END -->', hasCertifications: false },
  { file: 'templates/cv-template.tex', format: 'tex', after: '%%  END  %%', hasCertifications: false },
];

for (const { file, format, after, hasCertifications } of TEMPLATES) {
  const template = readFileSync(join(ROOT, file), 'utf-8');
  const name = file.split('/').pop();
  const closingSkeleton = format === 'html' ? '</body>\n</html>' : '\\end{document}';

  const stripped = stripEmptySections(template, EMPTY, format);
  const projectsMarker = format === 'html' ? '<!-- PROJECTS -->' : 'PROJECTS  %';
  const educationMarker = format === 'html' ? '<!-- EDUCATION -->' : 'Education  %';
  const certificationsMarker = '<!-- CERTIFICATIONS -->'; // html-only; no LaTeX Certifications section exists
  const awardsMarker = format === 'html' ? '<!-- AWARDS -->' : 'AWARDS  %';
  const skillsMarker = format === 'html' ? '<!-- SKILLS -->' : 'Technical Skills  %';

  check(`${name}: empty payload removes the projects block`, stripped.includes(projectsMarker), false);
  check(`${name}: empty payload removes the education block`, stripped.includes(educationMarker), false);
  if (hasCertifications) {
    check(`${name}: empty payload removes the certifications block`, stripped.includes(certificationsMarker), false);
  }
  check(`${name}: empty payload removes the awards block`, stripped.includes(awardsMarker), false);
  check(`${name}: empty payload removes the skills block`, stripped.includes(skillsMarker), false);
  check(`${name}: the trailing sentinel survives`, stripped.includes(after), true);
  check(`${name}: the closing document skeleton survives`, stripped.trimEnd().endsWith(closingSkeleton), true);
  check(`${name}: {{EXPERIENCE}} is untouched`, stripped.includes('{{EXPERIENCE}}'), true);

  // Populated payload must be a no-op — the strip only ever removes.
  check(`${name}: populated payload leaves the template unchanged`,
    stripEmptySections(template, FULL, format) === template, true);

  // One empty, one populated: only the empty one goes.
  const onlyEdu = stripEmptySections(template, { ...FULL, education: [] }, format);
  check(`${name}: empty education alone keeps projects`, onlyEdu.includes(projectsMarker), true);
  check(`${name}: empty education alone drops education`, onlyEdu.includes(educationMarker), false);
  check(`${name}: empty education alone keeps awards`, onlyEdu.includes(awardsMarker), true);
  check(`${name}: empty education alone keeps skills`, onlyEdu.includes(skillsMarker), true);
  if (hasCertifications) {
    check(`${name}: empty education alone keeps certifications`, onlyEdu.includes(certificationsMarker), true);

    // Certifications empty on its own: everything else populated survives, only certifications goes.
    const onlyCert = stripEmptySections(template, { ...FULL, certifications: [] }, format);
    check(`${name}: empty certifications alone keeps projects`, onlyCert.includes(projectsMarker), true);
    check(`${name}: empty certifications alone keeps education`, onlyCert.includes(educationMarker), true);
    check(`${name}: empty certifications alone drops certifications`, onlyCert.includes(certificationsMarker), false);
    check(`${name}: empty certifications alone keeps awards`, onlyCert.includes(awardsMarker), true);
    check(`${name}: empty certifications alone keeps skills`, onlyCert.includes(skillsMarker), true);
  }

  // Awards empty on its own: everything else populated survives, only awards goes.
  const onlyAwards = stripEmptySections(template, { ...FULL, awards: [] }, format);
  check(`${name}: empty awards alone keeps projects`, onlyAwards.includes(projectsMarker), true);
  check(`${name}: empty awards alone keeps education`, onlyAwards.includes(educationMarker), true);
  check(`${name}: empty awards alone drops awards`, onlyAwards.includes(awardsMarker), false);
  check(`${name}: empty awards alone keeps skills`, onlyAwards.includes(skillsMarker), true);
  if (hasCertifications) {
    check(`${name}: empty awards alone keeps certifications`, onlyAwards.includes(certificationsMarker), true);
  }

  // Skills empty on its own: every other populated section survives, and the
  // closing document skeleton is not swallowed with it (the regression this
  // suite exists to catch — Skills has no following marker of its own).
  const onlySkills = stripEmptySections(template, { ...FULL, skills: [] }, format);
  check(`${name}: empty skills alone keeps projects`, onlySkills.includes(projectsMarker), true);
  check(`${name}: empty skills alone keeps education`, onlySkills.includes(educationMarker), true);
  check(`${name}: empty skills alone keeps awards`, onlySkills.includes(awardsMarker), true);
  check(`${name}: empty skills alone drops skills`, onlySkills.includes(skillsMarker), false);
  check(`${name}: empty skills alone keeps the closing document skeleton`,
    onlySkills.trimEnd().endsWith(closingSkeleton), true);
  if (hasCertifications) {
    check(`${name}: empty skills alone keeps certifications`, onlySkills.includes(certificationsMarker), true);
  }

  // An omitted `skills` key must behave identically to an explicit empty
  // array — isEmptySection() treats both as empty, but #2515 covered both a
  // retitled-and-unpopulated section and a genuinely-omitted one, so the
  // omitted case gets its own assertion against the real templates rather
  // than relying only on the synthetic-fixture coverage below.
  const withoutSkills = { ...FULL };
  delete withoutSkills.skills;
  const omittedSkills = stripEmptySections(template, withoutSkills, format);
  check(`${name}: omitted skills key removes the skills block`, omittedSkills.includes(skillsMarker), false);
  check(`${name}: omitted skills key keeps the closing document skeleton`,
    omittedSkills.trimEnd().endsWith(closingSkeleton), true);
}

// --- Boundary edge cases ---------------------------------------------------
// Each of these silently reintroduces the bare header if the boundary pattern
// is written loosely.

// A non-marker comment inside a section body is not a boundary. A lookahead of
// `(?=<!-- [A-Z])` stops here and strands the rest of the block.
const internalComment = [
  '<!-- PROJECTS -->',
  '<div class="section">',
  '  <!-- Main block -->',
  '  <div class="section-title">Projects</div>',
  '</div>',
  '<!-- EDUCATION -->',
  'keep me',
].join('\n');
// Only projects is empty here: with EMPTY, education would also be stripped to
// end of input and the fixture could not distinguish a correct strip from an
// over-broad one.
check('an ordinary comment inside the body is not treated as a boundary',
  stripEmptySections(internalComment, { projects: [], education: [{ degree: 'D' }] }, 'html'),
  '<!-- EDUCATION -->\nkeep me');

// A section that is last in the template still gets removed. Without an
// end-of-input branch there is no boundary to stop at and the strip no-ops.
check('html: a trailing optional section is removed at end of template',
  stripEmptySections('<!-- HEADER -->\nkeep\n<!-- PROJECTS -->\n<div>drop</div>\n', EMPTY, 'html').trim(),
  '<!-- HEADER -->\nkeep');

check('tex: a trailing optional section is removed at end of document',
  stripEmptySections('%%%%  Heading  %%%%\nkeep\n%%%%  PROJECTS  %%%%\ndrop\n', EMPTY, 'tex').trim(),
  '%%%%  Heading  %%%%\nkeep');

// A trailing optional section with no following sentinel swallows whatever
// comes after it too (the exact failure mode Skills has in the real
// templates without the `<!-- END -->` sentinel) — demonstrating why the
// sentinel is load-bearing, not decorative.
check('html: a trailing optional section with no sentinel swallows what follows',
  stripEmptySections('<!-- HEADER -->\nkeep\n<!-- SKILLS -->\ndrop\n</body>\n</html>\n', EMPTY, 'html').trim(),
  '<!-- HEADER -->\nkeep');

// With the sentinel present, the same case leaves the tail intact.
check('html: a trailing optional section with a sentinel preserves what follows',
  stripEmptySections('<!-- HEADER -->\nkeep\n<!-- SKILLS -->\ndrop\n<!-- END -->\n</body>\n</html>\n', EMPTY, 'html').trim(),
  '<!-- HEADER -->\nkeep\n<!-- END -->\n</body>\n</html>');

// Stripping one section must not depend on the other still being present: a
// lookahead naming `<!-- EDUCATION -->` breaks once education is removed.
const bothEmpty = [
  '<!-- PROJECTS -->',
  '<div>projects body</div>',
  '<!-- EDUCATION -->',
  '<div>education body</div>',
  '<!-- SKILLS -->',
  'skills',
  '<!-- END -->',
].join('\n');
check('both projects and education empty: neither body survives, skills and the sentinel do',
  stripEmptySections(bothEmpty, { projects: [], education: [], skills: [{ category: 'S', items: 'x' }] }, 'html'),
  '<!-- SKILLS -->\nskills\n<!-- END -->');

// All three of projects/education/skills empty: only the trailing sentinel remains.
check('projects, education, and skills all empty: only the sentinel survives',
  stripEmptySections(bothEmpty, EMPTY, 'html'),
  '<!-- END -->');

// A missing key is as empty as an empty array — payloads routinely omit these.
check('an absent projects key is treated as empty',
  stripEmptySections(bothEmpty, {}, 'html'),
  '<!-- END -->');

// An unknown format is a programming error, not a silent pass-through.
let threw = false;
try { stripEmptySections('x', EMPTY, 'pdf'); } catch { threw = true; }
check('an unknown template format throws', threw, true);
