import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fail, pass, ROOT } from './helpers.mjs';
import { buildCvHtml } from '../build-cv-html.mjs';

console.log('\nCV HTML builder');

const dir = await mkdtemp(join(tmpdir(), 'career-ops-html-'));
const output = join(dir, 'cv.html');

try {
  const result = spawnSync(process.execPath, [
    join(ROOT, 'build-cv-html.mjs'),
    join(ROOT, 'examples/cv-html/candidate.json'),
    output,
  ], { encoding: 'utf8' });

  if (result.status !== 0) {
    fail(`structured fixture failed to build: ${result.stderr}`);
  } else {
    const html = await readFile(output, 'utf8');
    const checks = [
      [/<html lang="en">/, 'sets the payload language'],
      [/Alex Example/, 'renders the candidate name'],
      [/Engineer who turns &lt;unsafe&gt; input/, 'escapes candidate-controlled text'],
      [/<span class="competency-tag">Workflow automation<\/span>/, 'renders competencies'],
      [/<div class="job-company">Example Labs<\/div>/, 'renders experience'],
      [/<span class="skill-category">Languages:<\/span>/, 'renders skills'],
    ];
    for (const [pattern, label] of checks) {
      if (pattern.test(html)) pass(`build-cv-html ${label}`);
      else fail(`build-cv-html does not ${label}`);
    }
    if (!/\{\{[A-Z_]+\}\}/.test(html)) pass('build-cv-html resolves every template placeholder');
    else fail('build-cv-html leaves unresolved template placeholders');
    if (!/<img\s+[^>]*class=/.test(html)) pass('build-cv-html keeps profile photos opt-in');
    else fail('build-cv-html emits a profile photo without candidate.photo');
  }

  const unsafe = spawnSync(process.execPath, [
    join(ROOT, 'build-cv-html.mjs'),
    join(ROOT, 'examples/cv-html/unsafe-page-width.json'),
    join(dir, 'unsafe.html'),
  ], { encoding: 'utf8' });
  if (unsafe.status !== 0 && /page_width must be 210mm or 8\.5in/.test(unsafe.stderr)) {
    pass('build-cv-html rejects CSS injection through page_width');
  } else {
    fail('build-cv-html accepts an unsupported page_width');
  }

  const hostileInput = join(dir, 'hostile.json');
  const hostileOutput = join(dir, 'hostile.html');
  await writeFile(hostileInput, JSON.stringify({
    candidate: {
      name: 'Literal {{SKILLS}}',
      phone: '123" onmouseover="alert(1)',
      email: 'alex"@example.com',
      linkedin: { url: 'javascript:alert(1)', display: 'unsafe' },
      portfolio: { url: 'data:text/html,unsafe', display: 'unsafe' },
      photo: 'images/profile" onerror="alert(1).png',
    },
    summary: 'Keep literal {{SKILLS}} text',
    skills: [{ category: 'Safe', items: ['Rendered once'] }],
  }));
  const hostile = spawnSync(process.execPath, [join(ROOT, 'build-cv-html.mjs'), hostileInput, hostileOutput], { encoding: 'utf8' });
  if (hostile.status !== 0) {
    fail(`hostile-but-valid payload failed to build: ${hostile.stderr}`);
  } else {
    const html = await readFile(hostileOutput, 'utf8');
    const summary = html.match(/<div class="summary-text">([\s\S]*?)<\/div>/)?.[1] || '';
    if (/&#123;&#123;SKILLS&#125;&#125;/.test(summary) && !/skills-grid/.test(summary)) {
      pass('candidate placeholder-like text is escaped and never reprocessed');
    } else {
      fail('candidate placeholder-like text is reprocessed as template markup');
    }
    if (!/javascript:|data:text\/html/.test(html)) pass('unsafe contact URL schemes are dropped');
    else fail('unsafe contact URL schemes reach generated HTML');
    if (!/["']\s+(?:onmouseover|onerror)=/i.test(html)) pass('contact and photo attributes escape injected markup');
    else fail('candidate-controlled attributes permit markup injection');
    if (/<img class="cv-photo" src="images\/profile&quot; onerror=&quot;alert\(1\)\.png"/.test(html)) {
      pass('safe local profile photos remain opt-in and attribute-escaped');
    } else {
      fail('safe local profile photo is missing or not attribute-escaped');
    }
  }

  try {
    buildCvHtml('<html>{{lowercase_token}}</html>', {});
    fail('build-cv-html permits generic unresolved template tokens');
  } catch (error) {
    if (/Unresolved placeholders: \{\{lowercase_token\}\}/.test(error.message)) {
      pass('build-cv-html rejects generic unresolved template tokens');
    } else {
      fail(`generic unresolved token raised the wrong error: ${error.message}`);
    }
  }

  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const docs = await readFile(join(ROOT, 'docs/SCRIPTS.md'), 'utf8');
  const pdfMode = await readFile(join(ROOT, 'modes/pdf.md'), 'utf8');
  const updater = await readFile(join(ROOT, 'update-system.mjs'), 'utf8');
  if (packageJson.scripts['build:html'] === 'node build-cv-html.mjs') pass('package.json exposes build:html');
  else fail('package.json does not expose build:html');
  if (/build:html/.test(docs)) pass('script docs cover build:html');
  else fail('script docs omit build:html');
  if (/build-cv-html\.mjs/.test(pdfMode)) pass('PDF mode uses the deterministic HTML builder');
  else fail('PDF mode still requires handwritten template HTML');
  if (/'build-cv-html\.mjs'/.test(updater)) pass('updater ships build-cv-html.mjs');
  else fail('updater omits build-cv-html.mjs');
} finally {
  await rm(dir, { recursive: true, force: true });
}
