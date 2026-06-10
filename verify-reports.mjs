#!/usr/bin/env node
/**
 * verify-reports.mjs — validate evaluation report contract fields.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import yaml from 'js-yaml';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = process.env.CAREER_OPS_REPORTS || join(ROOT, 'reports');
const VALID_LEGITIMACY = new Set(['high', 'medium', 'low', 'uncertain', 'unverified']);
const MACHINE_SUMMARY_FIELDS = ['company', 'role', 'score', 'final_decision'];

function reportFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => /^\d{3}-.+\.md$/.test(file))
    .map((file) => join(dir, file));
}

function parseMachineSummary(content) {
  const match = content.match(/##\s*Machine Summary\s*\n+```(?:yaml|yml|json)?\s*\n([\s\S]*?)\n```/i);
  if (!match) return null;
  return yaml.load(match[1]);
}

function requiresPdfStatus(content) {
  const sourceLines = content.match(/^(?:\*\*Source:\*\*|source_path:|source:).*$/gim) ?? [];
  return sourceLines.some((line) => /\b(?:auto-pipeline|pipeline)\b/i.test(line));
}

export function validateReport(content) {
  const errors = [];
  const warnings = [];

  if (!/\*\*URL:\*\*\s*\S+/i.test(content)) errors.push('missing **URL:** header');
  const legitimacy = content.match(/\*\*Legitimacy:\*\*\s*([A-Za-z_-]+)/i)?.[1]?.toLowerCase();
  if (!legitimacy) {
    errors.push('missing **Legitimacy:** header');
  } else if (!VALID_LEGITIMACY.has(legitimacy)) {
    errors.push(`invalid legitimacy tier: ${legitimacy}`);
  }

  const score = content.match(/\*\*Score:\*\*\s*(\d(?:\.\d)?\/5|N\/A|SKIP|DUP)/i)?.[1];
  if (!score) errors.push('missing or invalid **Score:** header');

  const hasPdfStatus = /\*\*PDF:\*\*\s*(✅|❌|not generated|pending|N\/A)/i.test(content);
  if (requiresPdfStatus(content) && !hasPdfStatus) {
    errors.push('missing **PDF:** status header');
  } else if (!hasPdfStatus) {
    warnings.push('missing **PDF:** status header');
  }

  let machineSummary;
  let machineSummaryParseFailed = false;
  try {
    machineSummary = parseMachineSummary(content);
  } catch (err) {
    errors.push(`Machine Summary failed to parse: ${err.message}`);
    machineSummaryParseFailed = true;
    machineSummary = null;
  }
  if (!machineSummary) {
    if (!machineSummaryParseFailed) warnings.push('missing ## Machine Summary');
  } else if (typeof machineSummary !== 'object' || Array.isArray(machineSummary)) {
    errors.push('Machine Summary must parse to an object');
  } else {
    for (const field of MACHINE_SUMMARY_FIELDS) {
      if (!(field in machineSummary)) warnings.push(`Machine Summary missing ${field}`);
    }
  }

  return { errors, warnings };
}

export function verifyReports({ reportsDir = REPORTS_DIR } = {}) {
  return reportFiles(reportsDir).map((path) => {
    const { errors, warnings } = validateReport(readFileSync(path, 'utf-8'));
    return {
      file: path.replace(`${reportsDir}/`, ''),
      status: errors.length ? 'error' : warnings.length ? 'warning' : 'ok',
      errors,
      warnings,
    };
  });
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'co-reports-'));
  try {
    writeFileSync(join(dir, '001-valid-2026-06-10.md'), [
      '# Acme — AI Engineer',
      '',
      '**Score:** 4.2/5',
      '**URL:** https://jobs.example/acme',
      '**PDF:** ✅',
      '**Legitimacy:** high',
      '',
      '## Machine Summary',
      '```yaml',
      'company: Acme',
      'role: AI Engineer',
      'score: 4.2',
      'final_decision: apply',
      '```',
      '',
    ].join('\n'));
    writeFileSync(join(dir, '002-invalid-2026-06-10.md'), [
      '# Broken',
      '',
      '**Score:** banana',
      '**PDF:** maybe',
      'source_path: batch/auto-pipeline/acme.md',
      '',
    ].join('\n'));
    writeFileSync(join(dir, '003-bad-summary-2026-06-10.md'), [
      '# Bad Summary',
      '',
      '**Score:** 4.1/5',
      '**URL:** https://jobs.example/bad',
      '**Legitimacy:** medium',
      '',
      '## Machine Summary',
      '```yaml',
      'company: [',
      '```',
      '',
    ].join('\n'));

    const results = verifyReports({ reportsDir: dir });
    const valid = results.find((result) => result.file.startsWith('001-'));
    const invalid = results.find((result) => result.file.startsWith('002-'));
    const badSummary = results.find((result) => result.file.startsWith('003-'));
    if (
      valid?.status !== 'ok' ||
      invalid?.status !== 'error' ||
      invalid.errors.length < 3 ||
      badSummary?.status !== 'error' ||
      badSummary.warnings.includes('missing ## Machine Summary')
    ) {
      throw new Error(`unexpected self-test result: ${JSON.stringify(results)}`);
    }
    console.log('verify-reports self-test passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const results = verifyReports();
  const errors = results.reduce((sum, result) => sum + result.errors.length, 0);
  const warnings = results.reduce((sum, result) => sum + result.warnings.length, 0);
  console.log(JSON.stringify({ errors, warnings, results }, null, 2));
  if (errors > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
