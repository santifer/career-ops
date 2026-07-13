#!/usr/bin/env node

import assert from 'assert/strict';
import {
  findAtsTextLayerIssues,
  parseCliArgs,
  parsePdfInfoPages,
  resolveEngineCandidates,
  validateLatexContent,
} from './generate-latex.mjs';

assert.deepEqual(
  resolveEngineCandidates('auto'),
  ['tectonic', 'pdflatex', 'lualatex', 'xelatex'],
  'auto engine order should be conservative and deterministic',
);
assert.deepEqual(resolveEngineCandidates('xelatex'), ['xelatex']);

assert.equal(parsePdfInfoPages('Title: sample\nPages:          2\nEncrypted: no\n'), 2);
assert.equal(parsePdfInfoPages('Title: sample\nPage size: A4\n'), null);

assert.deepEqual(parseCliArgs(['--engine=xelatex', '--expect-pages=1', '--ats-text-check', 'cv.tex', 'cv.pdf']), {
  engine: 'xelatex',
  expectPages: 1,
  atsTextCheck: true,
  compileOnly: false,
  help: false,
  inputPath: 'cv.tex',
  outputPath: 'cv.pdf',
});

assert.equal(parseCliArgs(['cv.tex', '--compile-only']).compileOnly, true);
assert.deepEqual(
  validateLatexContent('\\begin{document}\nHello\\n\\end{document}', true).issues,
  [],
  'compile-only should accept a user-owned document without career-ops macros',
);

assert.deepEqual(findAtsTextLayerIssues('Normal searchable text'), []);
assert.deepEqual(findAtsTextLayerIssues(''), ['pdftotext extracted no text']);
assert.deepEqual(findAtsTextLayerIssues('(cid:123) \uFFFD'), [
  'pdftotext found CID glyph fallbacks',
  'pdftotext found replacement characters',
]);

console.log('latex check tests OK');
