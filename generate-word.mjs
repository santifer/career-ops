#!/usr/bin/env node
/**
 * generate-word.mjs — HTML → DOCX via Microsoft Word COM
 *
 * Applies ATS normalization (smart quotes, em-dashes, zero-width chars)
 * before passing to Word — same rules apply as PDF since DOCX files are
 * often pasted directly into ATS portals.
 *
 * Usage: node generate-word.mjs <input.html> <output.docx>
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { normalizeTextForATS } from './lib/ats-normalize.mjs';

const [,, inputHtml, outputDocx] = process.argv;

if (!inputHtml || !outputDocx) {
  console.error('Usage: node generate-word.mjs <input.html> <output.docx>');
  process.exit(1);
}

if (process.platform !== 'win32') {
  console.error('❌ generate-word.mjs requires Windows with Microsoft Word installed.\n   On macOS/Linux, use generate-pdf.mjs instead.');
  process.exit(1);
}

const inputPath  = resolve(inputHtml).replace(/\//g, '\\');
const outputPath = resolve(outputDocx).replace(/\//g, '\\');

console.log(`📄 Input:  ${inputPath}`);
console.log(`📁 Output: ${outputPath}`);

// Apply ATS normalization before handing off to Word
const rawHtml = readFileSync(inputPath, 'utf-8');
const { html: normalizedHtml, replacements } = normalizeTextForATS(rawHtml);
const totalReplacements = Object.values(replacements).reduce((a, b) => a + b, 0);
if (totalReplacements > 0) {
  const breakdown = Object.entries(replacements).map(([k, v]) => `${k}=${v}`).join(', ');
  console.log(`🧹 ATS normalization: ${totalReplacements} replacements (${breakdown})`);
}

// Write normalized HTML to a temp file — Word opens the file, not a string
const normalizedPath = inputPath.replace(/\.html$/i, '.normalized.html');
writeFileSync(normalizedPath, normalizedHtml, 'utf-8');

const psScript = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open("${normalizedPath}")
$doc.SaveAs([ref]"${outputPath}", [ref]16)
$doc.Close()
$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
Remove-Item "${normalizedPath}" -ErrorAction SilentlyContinue
$size = [math]::Round((Get-Item "${outputPath}").Length / 1KB, 1)
Write-Host "SIZE:$size"
`;

let result;
try {
  result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    encoding: 'utf8',
    timeout: 30000,
  });
} catch (spawnErr) {
  if (existsSync(normalizedPath)) try { unlinkSync(normalizedPath); } catch (_) {}
  console.error('❌ Failed to launch PowerShell:', spawnErr.message);
  process.exit(1);
}

// Clean up normalized temp if Word didn't remove it
if (existsSync(normalizedPath)) try { unlinkSync(normalizedPath); } catch (_) {}

const stderr = result.stderr?.trim();
if (result.status !== 0 || (stderr && !stderr.includes('WARNING'))) {
  console.error('❌ Error generating Word document:');
  console.error(stderr || result.stdout);
  process.exit(1);
}

if (!existsSync(outputPath)) {
  console.error('❌ Output file was not created by Word.');
  process.exit(1);
}

const sizeMatch = result.stdout.match(/SIZE:([\d.]+)/);
const sizeKB = sizeMatch ? sizeMatch[1] : '?';
console.log(`✅ Word document generated: ${outputPath}`);
console.log(`📦 Size: ${sizeKB} KB`);
