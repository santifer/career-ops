import { spawnSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join, relative } from 'path';
import { pass, fail, ROOT, NODE } from './helpers.mjs';

const outputRoot = join(ROOT, 'output');
mkdirSync(outputRoot, { recursive: true });
const sandbox = mkdtempSync(join(outputRoot, 'page-budget-test-'));
const script = join(sandbox, 'generate-pdf.mjs');
const input = join(sandbox, 'two-pages.html');
const defaultOverflowInput = join(sandbox, 'three-pages.html');
const manifest = join(sandbox, 'data', 'pdf-index.tsv');
mkdirSync(join(sandbox, 'data'), { recursive: true });
writeFileSync(manifest, '', 'utf-8');
const playwrightStub = join(sandbox, 'node_modules', 'playwright');

copyFileSync(join(ROOT, 'generate-pdf.mjs'), script);
mkdirSync(playwrightStub, { recursive: true });
writeFileSync(join(playwrightStub, 'package.json'), JSON.stringify({
  name: 'playwright',
  type: 'module',
  exports: './index.js',
}), 'utf-8');
writeFileSync(join(playwrightStub, 'index.js'), `
import { readFile } from 'fs/promises';

const twoPagePdf = Buffer.from(\`%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
5 0 obj
<< /Length 11 >>
stream
/Type /Page
endstream
endobj
%%EOF\`, 'latin1');

const threePagePdf = Buffer.from(\`%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 3 /Kids [3 0 R 4 0 R 5 0 R] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
5 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
%%EOF\`, 'latin1');

export const chromium = {
  async launch() {
    let renderedPdf = twoPagePdf;
    return {
      async newPage() {
        return {
          async goto(url) {
            const html = await readFile(new URL(url), 'utf-8');
            renderedPdf = html.includes('THREE_PAGE_FIXTURE') ? threePagePdf : twoPagePdf;
          },
          async evaluate() {},
          async pdf() { return renderedPdf; },
        };
      },
      async close() {},
    };
  },
};
`, 'utf-8');
writeFileSync(input, `<!doctype html>
<html>
  <body>
    <main style="break-after: page">First page</main>
    <main>Second page</main>
  </body>
</html>
`, 'utf-8');
writeFileSync(defaultOverflowInput, `<!doctype html>
<html>
  <body>
    <main>First page</main>
    <main>Second page</main>
    <main>Third page — THREE_PAGE_FIXTURE</main>
  </body>
</html>
`, 'utf-8');

function runPdf(args) {
  const result = spawnSync(NODE, [script, ...args], {
    cwd: sandbox,
    encoding: 'utf-8',
    timeout: 30_000,
  });
  return {
    ...result,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function countPages(path) {
  const pdf = readFileSync(path).toString('latin1');
  const declaredCounts = [...pdf.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,512}?\/Count\s+(\d+)/g)]
    .map((match) => Number(match[1]));
  return declaredCounts.length > 0 ? Math.max(...declaredCounts) : 0;
}

function stablePdf(path) {
  return readFileSync(path).toString('latin1')
    .replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '/Date()')
    .replace(/\/ID\s*\[\s*<[^>]+>\s*<[^>]+>\s*\]/g, '/ID[]');
}

function manifestHasPdf(path) {
  const expected = relative(sandbox, path).replaceAll('\\', '/');
  return readFileSync(manifest, 'utf-8')
    .split('\n')
    .some((line) => line.split('\t')[1] === expected);
}

try {
  for (const invalid of ['nope', '-1', '0', '1.5']) {
    const invalidOutput = join(sandbox, `invalid-${invalid.replace(/\W/g, '-')}.pdf`);
    const result = runPdf(['missing.html', invalidOutput, `--max-pages=${invalid}`]);
    if (
      result.status !== 0 &&
      result.output.includes(`Invalid --max-pages "${invalid}"`) &&
      !result.output.includes('ENOENT') &&
      !existsSync(invalidOutput)
    ) {
      pass(`generate-pdf rejects --max-pages=${invalid} before rendering`);
    } else {
      fail(`generate-pdf did not reject --max-pages=${invalid} before rendering: ${result.output.trim()}`);
    }
  }

  const withinBudgetPdf = join(sandbox, 'within-budget.pdf');
  const withinBudget = runPdf([input, withinBudgetPdf, '--max-pages=2']);
  if (
    withinBudget.status === 0 &&
    existsSync(withinBudgetPdf) &&
    countPages(withinBudgetPdf) === 2 &&
    manifestHasPdf(withinBudgetPdf)
  ) {
    pass('generate-pdf ignores page-like content and accepts the structural rendered page count');
  } else {
    fail(`generate-pdf rejected a PDF inside its page budget: ${withinBudget.output.trim()}`);
  }

  const roomyBudgetPdf = join(sandbox, 'roomy-budget.pdf');
  const roomyBudget = runPdf([input, roomyBudgetPdf, '--max-pages=3']);
  if (
    roomyBudget.status === 0 &&
    existsSync(roomyBudgetPdf) &&
    stablePdf(roomyBudgetPdf) === stablePdf(withinBudgetPdf) &&
    manifestHasPdf(roomyBudgetPdf)
  ) {
    pass('changing an accepted page budget does not change deterministic PDF rendering');
  } else {
    fail('an accepted page budget changed the rendered PDF instead of acting only as a post-render decision');
  }

  const defaultOverflowPdf = join(sandbox, 'default-overflow.pdf');
  const manifestBeforeDefaultOverflow = readFileSync(manifest, 'utf-8');
  const defaultOverflow = runPdf([defaultOverflowInput, defaultOverflowPdf]);
  if (
    defaultOverflow.status !== 0 &&
    existsSync(defaultOverflowPdf) &&
    countPages(defaultOverflowPdf) === 3 &&
    defaultOverflow.output.includes('📐 Page budget: 2') &&
    defaultOverflow.output.includes('CV is 3 pages') &&
    defaultOverflow.output.includes('allowed maximum is 2 pages') &&
    !defaultOverflow.output.includes('✅ PDF generated') &&
    !defaultOverflow.output.includes('Manifest:') &&
    readFileSync(manifest, 'utf-8') === manifestBeforeDefaultOverflow
  ) {
    pass('generate-pdf enforces the default two-page budget without publishing overflow');
  } else {
    fail(`generate-pdf default page budget regressed: ${defaultOverflow.output.trim()}`);
  }

  const overflowPdf = join(sandbox, 'overflow.pdf');
  const manifestBeforeOverflow = readFileSync(manifest, 'utf-8');
  const overflow = runPdf([input, overflowPdf, '--max-pages=1']);
  if (
    overflow.status !== 0 &&
    existsSync(overflowPdf) &&
    countPages(overflowPdf) === 2 &&
    overflow.output.includes('CV is 2 pages') &&
    overflow.output.includes('allowed maximum is 1 page') &&
    overflow.output.includes('Trim') &&
    overflow.output.includes('--allow-overflow') &&
    !overflow.output.includes('✅ PDF generated') &&
    !overflow.output.includes('Manifest:') &&
    readFileSync(manifest, 'utf-8') === manifestBeforeOverflow
  ) {
    pass('generate-pdf fails overflow with guidance without publishing the draft as successful');
  } else {
    fail(`generate-pdf did not enforce the rendered page count: ${overflow.output.trim()}`);
  }

  const allowedPdf = join(sandbox, 'allowed-overflow.pdf');
  const allowed = runPdf([input, allowedPdf, '--max-pages=1', '--allow-overflow']);
  if (
    allowed.status === 0 &&
    existsSync(allowedPdf) &&
    countPages(allowedPdf) === 2 &&
    allowed.output.includes('CV is 2 pages') &&
    allowed.output.includes('--allow-overflow') &&
    allowed.output.includes('proceeding') &&
    allowed.output.includes('✅ PDF generated') &&
    allowed.output.includes('Manifest:') &&
    manifestHasPdf(allowedPdf)
  ) {
    pass('generate-pdf deliberately downgrades overflow only with --allow-overflow');
  } else {
    fail(`generate-pdf escape hatch did not produce an explicit overflow warning: ${allowed.output.trim()}`);
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
