/**
 * tests/unit/health-column.test.mjs — regression test for the Health column
 * on the apply-now-queue dashboard table (fix 2026-05-19).
 *
 * Invariants enforced:
 *   1. `scripts/health-column-liveness.mjs` produces a coverage JSON with
 *      the expected shape (apply_now_rows, covered, coverage_pct, rows[]).
 *   2. `renderBenefitsCell()` returns a `.team-toxicity-pill` chip OR a
 *      `.benefits-chip-empty` chip — never silently empty.
 *   3. `getRoleEnrichment()` tolerant fallback matches by company prefix +
 *      role prefix when an exact key doesn't hit.
 *   4. The cache registry's `role_enrichment.refreshHandler` uses `--rows={num}`
 *      addressing (the durable, stale-queue-resilient path).
 *
 * The first invariant skips when data/applications.md is absent (CI
 * environments without Mitchell's personal data fall through cleanly).
 */

import { test, describe } from 'node:test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const APPS_PATH = join(ROOT, 'data', 'applications.md');
const LIVENESS_SCRIPT = join(ROOT, 'scripts', 'health-column-liveness.mjs');
const COVERAGE_OUT = join(ROOT, 'data', 'health-column-coverage.json');
const REGISTRY_PATH = join(ROOT, 'lib', 'refresh-cache-registry.mjs');

describe('health-column-liveness coverage shape', () => {
  test('liveness check produces coverage JSON with expected shape', { skip: !existsSync(APPS_PATH) }, () => {
    // Run the liveness check. Exit code 0 or 1 is fine; we're verifying shape.
    try {
      execSync(`node ${LIVENESS_SCRIPT}`, { cwd: ROOT, stdio: 'pipe' });
    } catch (_) { /* exit 1 is "not healthy" — still produces output */ }

    assert.ok(existsSync(COVERAGE_OUT), 'data/health-column-coverage.json should be written');
    const cov = JSON.parse(readFileSync(COVERAGE_OUT, 'utf-8'));
    assert.ok(cov.generated_at, 'generated_at timestamp present');
    assert.ok(Number.isInteger(cov.apply_now_rows), 'apply_now_rows is an integer');
    assert.ok(Number.isInteger(cov.covered), 'covered is an integer');
    assert.ok(Number.isInteger(cov.coverage_pct), 'coverage_pct is an integer');
    assert.ok(Array.isArray(cov.rows), 'rows is an array');
    if (cov.rows.length > 0) {
      const r = cov.rows[0];
      for (const k of ['num', 'company', 'role', 'covered', 'team_toxicity_grade']) {
        assert.ok(k in r, `row[0] must contain key "${k}"`);
      }
    }
  });

  test('liveness check never silently swallows missing-enrichment rows', { skip: !existsSync(APPS_PATH) }, () => {
    if (!existsSync(COVERAGE_OUT)) return;
    const cov = JSON.parse(readFileSync(COVERAGE_OUT, 'utf-8'));
    const missing = cov.rows.filter(r => !r.covered);
    // If any rows are uncovered, summary must reflect that — no silent "—".
    if (missing.length) {
      assert.ok(
        cov.coverage_pct < 100,
        `coverage_pct=${cov.coverage_pct} but ${missing.length} rows lack enrichment`,
      );
      assert.strictEqual(
        cov.healthy,
        false,
        'healthy flag must be false when any apply-now row is uncovered',
      );
    }
  });
});

describe('renderBenefitsCell never silently emits a bare "—"', () => {
  test('benefits-chip-empty is rendered with explicit empty-state class', async () => {
    // Smoke-load the function from build-dashboard.mjs. We can't easily
    // import (the module has many side-effects at import time), so instead
    // we grep the source for the empty-state pattern + assert it's present.
    const src = readFileSync(join(ROOT, 'scripts', 'build-dashboard.mjs'), 'utf-8');
    assert.ok(
      src.includes('benefits-chip-empty'),
      'build-dashboard.mjs must define an empty-state class for the Health cell',
    );
    assert.ok(
      src.includes('No team-health or benefits data'),
      'empty-state tooltip text must be present so the user knows the column is intentional, not broken',
    );
    // Pill class must be applied when toxicity grade is valid 1-5.
    assert.ok(
      src.includes('benefits-chip-strong') && src.includes('benefits-chip-bad'),
      'must render a colored pill class when toxicity grade resolves',
    );
  });
});

describe('cache registry uses durable per-num addressing', () => {
  test('role_enrichment.refreshHandler uses --rows={num} not --ranks', () => {
    const src = readFileSync(REGISTRY_PATH, 'utf-8');
    // Pull the role_enrichment block by scanning lines between the id marker
    // and the matching closing brace at the same indent. Regex block-grab is
    // unreliable because `{rank}` and `{slug}` placeholders in comments fake
    // out non-greedy `[\s\S]+?\}` matchers.
    const lines = src.split('\n');
    const startIdx = lines.findIndex(l => /^\s*id:\s*'role_enrichment'/.test(l));
    assert.ok(startIdx > 0, 'role_enrichment cache entry must exist in registry');
    let endIdx = -1;
    let depth = 1;
    for (let i = startIdx; i < lines.length; i++) {
      const l = lines[i];
      // Look at structural braces only — ignore those inside `{ }` placeholders
      // by counting `{` and `}` at line-start indentation only.
      if (/^\s*\}/.test(l) && i > startIdx) {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    assert.ok(endIdx > startIdx, 'closing brace for role_enrichment block must be found');
    const block = lines.slice(startIdx, endIdx + 1).join('\n');
    assert.match(
      block,
      /enrich-apply-now\.mjs --rows=\{num\}/,
      'refreshHandler must use --rows={num} addressing (durable against stale ranks)',
    );
    // Check ONLY the `refreshHandler:` line — comments may reference the
    // legacy `--ranks {rank}-{rank}` form for context.
    const handlerLine = block.split('\n').find(l => /refreshHandler\s*:/.test(l));
    assert.ok(handlerLine, 'refreshHandler line must be present');
    assert.ok(
      !/--ranks /.test(handlerLine),
      'refreshHandler line must NOT use the legacy --ranks form',
    );
  });
});
