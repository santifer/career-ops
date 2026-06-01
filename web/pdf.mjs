import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Generates a personalized resume PDF into output/ using the existing
// generate-pdf.mjs Playwright pipeline. Returns the output filename.
export async function generateResumePdf({ resumeMarkdown, jobTitle, company, outputName }) {
  const dir = await mkdtemp(join(tmpdir(), 'career-ops-web-'));
  const htmlPath = join(dir, 'resume.html');
  const pdfPath = join(ROOT, 'output', outputName);

  try {
    await writeFile(htmlPath, renderResumeHtml({ resumeMarkdown, jobTitle, company }), 'utf-8');
    await execFileAsync(process.execPath, [join(ROOT, 'generate-pdf.mjs'), htmlPath, pdfPath, '--format=a4'], {
      cwd: ROOT,
      maxBuffer: 1024 * 1024,
    });
    return outputName;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function renderResumeHtml({ resumeMarkdown, jobTitle, company }) {
  const body = escapeHtml(resumeMarkdown)
    .split('\n')
    .map(line => line.trim() ? `<p>${line}</p>` : '<br>')
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Personalized resume</title>
<style>
body { font-family: Arial, sans-serif; color: #1a1a2e; line-height: 1.45; }
h1 { font-size: 24px; margin-bottom: 4px; }
.context { color: #555; margin-bottom: 24px; }
p { margin: 0 0 8px; }
</style>
</head>
<body>
<h1>Personalized resume draft</h1>
<div class="context">${escapeHtml(company || 'Unknown company')} - ${escapeHtml(jobTitle || 'Role')}</div>
${body}
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
