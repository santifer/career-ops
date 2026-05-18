/**
 * tests/a11y.spec.mjs — Accessibility baseline via @axe-core/playwright.
 *
 * Runs axe-core against the live dashboard at http://localhost:3000.
 * Violations are logged to data/a11y-baseline-{date}.json for triage.
 * This spec intentionally does NOT fail on individual rule violations —
 * its purpose is to establish a baseline and make violations visible, not
 * block CI until every a11y rule passes.
 *
 * To run:
 *   node dashboard-server.mjs &
 *   npx playwright test tests/a11y.spec.mjs --config=tests/playwright.config.mjs
 *
 * When you're ready to enforce specific rules, convert the relevant
 * `violations.length > 0` warn calls to `expect(violations).toHaveLength(0)`.
 *
 * Deps: @axe-core/playwright (added Wave G3 D21)
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Baseline logger — writes violations to data/a11y-baseline-{date}.json
// ---------------------------------------------------------------------------

function writeBaseline(pageName, violations, url) {
  const date = new Date().toISOString().slice(0, 10);
  const dir = resolve(ROOT, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const outPath = resolve(dir, `a11y-baseline-${date}.json`);

  let existing = {};
  try {
    existing = JSON.parse(readFileSync(outPath, 'utf-8'));
  } catch { /* first write */ }

  // Merge new page results into existing file
  const snapshot = {
    generated_at: new Date().toISOString(),
    pages: {
      ...(existing.pages || {}),
      [pageName]: {
        url,
        violation_count: violations.length,
        violations: violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes_count: v.nodes?.length ?? 0,
          help_url: v.helpUrl,
        })),
      },
    },
  };
  snapshot.total_violations = Object.values(snapshot.pages).reduce(
    (sum, p) => sum + p.violation_count, 0
  );

  writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  return outPath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Accessibility baseline @a11y', () => {
  test('dashboard root — axe scan (baseline only, no enforcement)', async ({ page }) => {
    const url = process.env.DASHBOARD_URL || 'http://localhost:3000';

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      // Focus on the most critical rules first; expand in future passes
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    const violations = results.violations;

    // Log baseline — always runs even when there are violations
    if (violations.length > 0) {
      try {
        const outPath = writeBaseline('dashboard-root', violations, url);
        console.log(
          `[a11y] ${violations.length} violations found. Baseline written to ${outPath}`
        );
        console.log(
          '[a11y] Top violations:\n' +
          violations
            .slice(0, 5)
            .map((v) => `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes?.length ?? 0} nodes)`)
            .join('\n')
        );
      } catch (writeErr) {
        console.warn('[a11y] Could not write baseline file:', writeErr.message);
      }
    } else {
      console.log('[a11y] No violations found on dashboard root — excellent!');
    }

    // Assertion: CRITICAL violations block CI; others are warned only.
    // This establishes the baseline without blocking on all violations.
    const criticalViolations = violations.filter((v) => v.impact === 'critical');
    expect(
      criticalViolations,
      `Critical a11y violations found: ${criticalViolations.map((v) => v.id).join(', ')}`
    ).toHaveLength(0);
  });
});
