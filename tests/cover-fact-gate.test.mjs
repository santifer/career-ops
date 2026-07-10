// Cover-letter PDF generation must reject unsupported metric claims before
// importing Playwright or creating an output artifact.
import { pass, fail, ROOT } from './helpers.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { assertFacts } from '../verify-cv-facts.mjs';
import { buildHtml } from '../generate-cover-letter.mjs';

console.log('\nCover letter fact gate');

const tmp = mkdtempSync(join(tmpdir(), 'career-ops-cover-facts-'));
try {
  const source = join(tmp, 'cv.md');
  const config = join(tmp, 'cv-facts.json');
  writeFileSync(source, 'Improved reliability for 25 users.');
  writeFileSync(config, JSON.stringify({ allow_metrics: [], forbidden_phrases: [] }));
  const payload = {
    candidate: { name: 'Jane Doe' },
    letter: {
      role_title: 'Engineer',
      opening: 'I improved reliability for 25 users.',
      profile_intro: 'Profile.',
    },
  };
  const html = buildHtml(payload);

  try {
    assertFacts(html, { sourcePaths: [source], configPath: config, label: 'cover letter' });
    pass('cover letter with source-backed metrics passes the shared fact gate');
  } catch (error) {
    fail(`cover letter fact gate rejected a source-backed metric: ${error.message}`);
  }

  const invented = buildHtml({
    ...payload,
    letter: { ...payload.letter, opening: 'I improved reliability for 26 users.' },
  });
  try {
    assertFacts(invented, { sourcePaths: [source], configPath: config, label: 'cover letter' });
    fail('cover letter fact gate allowed an unsupported metric');
  } catch (error) {
    if (/26 users/.test(error.message)) pass('cover letter fact gate rejects unsupported metrics');
    else fail(`cover letter fact gate failed with the wrong error: ${error.message}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
