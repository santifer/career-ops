// Temporary runner to bypass isMain Windows path issue
import { renderHtmlToPdf } from './generate-pdf.mjs';
import { readFile, mkdirSync } from 'fs';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const [,, input, output, formatArg] = process.argv;
const format = (formatArg || '--format=a4').split('=')[1] || 'a4';

const html = readFileSync(resolve(input), 'utf-8');
console.log(`Generating PDF: ${output}`);

renderHtmlToPdf(html, resolve(output), { format, baseDir: resolve(input, '..') })
  .then(r => console.log(`Done: ${r.outputPath} (${r.pageCount} pages, ${(r.size/1024).toFixed(1)} KB)`))
  .catch(e => { console.error('Failed:', e.message); process.exit(1); });
