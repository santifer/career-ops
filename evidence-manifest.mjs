#!/usr/bin/env node
/**
 * evidence-manifest.mjs — validate lightweight evaluation evidence manifests.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = process.env.CAREER_OPS_REPORTS || join(ROOT, 'reports');
const VALID_SOURCE_PATHS = new Set(['Playwright', 'WebFetch', 'WebSearch', 'local', 'pasted']);
const VALID_LIVENESS = new Set(['active', 'expired', 'uncertain', 'unverified', 'not_applicable']);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validDateTime(value) {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

export function validateManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!isObject(manifest)) return { errors: ['manifest must be a JSON object'], warnings };

  if (!Number.isInteger(manifest.report_number) || manifest.report_number < 1) {
    errors.push('report_number must be a positive integer');
  }
  for (const key of ['company', 'role', 'source', 'jd_text_hash', 'report_path']) {
    if (!nonEmptyString(manifest[key])) errors.push(`${key} must be a non-empty string`);
  }
  if (!validDateTime(manifest.fetched_at)) errors.push('fetched_at must be an ISO-compatible timestamp');
  if (!VALID_SOURCE_PATHS.has(manifest.source_path)) {
    errors.push(`source_path must be one of: ${Array.from(VALID_SOURCE_PATHS).join(', ')}`);
  }
  if (!VALID_LIVENESS.has(manifest.liveness_result)) {
    errors.push(`liveness_result must be one of: ${Array.from(VALID_LIVENESS).join(', ')}`);
  }
  if ('pdf_path' in manifest && manifest.pdf_path !== null && typeof manifest.pdf_path !== 'string') {
    errors.push('pdf_path must be a string or null');
  }
  if (manifest.source.startsWith('local:') && manifest.liveness_result !== 'not_applicable') {
    warnings.push('local sources should normally use liveness_result=not_applicable');
  }
  return { errors, warnings };
}

function reportFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => /^\d{3}-.+\.md$/.test(file))
    .map((file) => join(dir, file));
}

function validateFile(path) {
  try {
    return validateManifest(JSON.parse(readFileSync(path, 'utf-8')));
  } catch (err) {
    return { errors: [`invalid JSON: ${err.message}`], warnings: [] };
  }
}

export function verifyEvidenceManifests({ reportsDir = REPORTS_DIR } = {}) {
  const results = [];
  for (const report of reportFiles(reportsDir)) {
    const manifest = report.replace(/\.md$/, '.evidence.json');
    if (!existsSync(manifest)) {
      results.push({
        report: basename(report),
        manifest: basename(manifest),
        status: 'warning',
        errors: [],
        warnings: ['missing evidence manifest (legacy reports are warning-only)'],
      });
      continue;
    }
    const { errors, warnings } = validateFile(manifest);
    results.push({
      report: basename(report),
      manifest: basename(manifest),
      status: errors.length ? 'error' : warnings.length ? 'warning' : 'ok',
      errors,
      warnings,
    });
  }
  return results;
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'co-evidence-'));
  try {
    writeFileSync(join(dir, '001-acme-2026-06-10.md'), '# Report\n');
    writeFileSync(join(dir, '001-acme-2026-06-10.evidence.json'), JSON.stringify({
      report_number: 1,
      company: 'Acme',
      role: 'AI Engineer',
      source: 'https://jobs.example/acme',
      fetched_at: '2026-06-10T00:00:00.000Z',
      source_path: 'Playwright',
      liveness_result: 'active',
      jd_text_hash: 'sha256:abc123',
      report_path: 'reports/001-acme-2026-06-10.md',
      pdf_path: null,
    }, null, 2));
    writeFileSync(join(dir, '002-legacy-2026-06-10.md'), '# Legacy\n');
    const results = verifyEvidenceManifests({ reportsDir: dir });
    const ok = results.find((result) => result.report.startsWith('001-'))?.status === 'ok';
    const legacyWarning = results.find((result) => result.report.startsWith('002-'))?.status === 'warning';
    if (!ok || !legacyWarning) throw new Error(`unexpected self-test result: ${JSON.stringify(results)}`);
    console.log('evidence-manifest self-test passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const results = verifyEvidenceManifests();
  const errors = results.reduce((sum, result) => sum + result.errors.length, 0);
  const warnings = results.reduce((sum, result) => sum + result.warnings.length, 0);
  console.log(JSON.stringify({ errors, warnings, results }, null, 2));
  if (errors > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
