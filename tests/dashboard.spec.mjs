import { test, expect } from '@playwright/test';

const isMac = process.platform === 'darwin';
const META = isMac ? 'Meta' : 'Control';

async function gotoDashboard(page) {
  const resp = await page.goto('/');
  if (!resp || !resp.ok()) {
    test.skip(true, `Dashboard not reachable at ${page.url()} — start it with: node dashboard-server.mjs --port=3000`);
  }
  await page.waitForSelector('#all-tbody', { timeout: 5_000 }).catch(() => {
    test.skip(true, 'Dashboard rendered but #all-tbody is missing — likely no data; run `node scripts/build-dashboard.mjs` first.');
  });
}

async function firstVisibleRow(page) {
  const rows = page.locator('#all-tbody tr.row');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    if (await rows.nth(i).isVisible()) return rows.nth(i);
  }
  test.skip(true, 'No visible rows in #all-tbody — the dashboard has no evaluations yet.');
}

test.describe('Dashboard — critical flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoDashboard(page);
  });

  test('1. row expand/collapse toggles the detail panel', async ({ page }) => {
    const row = await firstVisibleRow(page);
    const rowId = await row.getAttribute('data-row-id');
    test.skip(!rowId, 'Row has no data-row-id; cannot locate detail panel.');

    const detail = page.locator(`#detail-${rowId}`);
    await expect(detail).toBeAttached();

    // Detail starts collapsed (display:none) per build-dashboard.mjs
    const initiallyVisible = await detail.evaluate(el => el.style.display !== 'none');

    await row.click();
    await expect.poll(async () => detail.evaluate(el => el.style.display !== 'none')).toBe(!initiallyVisible);

    await row.click();
    await expect.poll(async () => detail.evaluate(el => el.style.display !== 'none')).toBe(initiallyVisible);
  });

  test('2. Cmd-K opens the command palette and Escape closes it', async ({ page }) => {
    const backdrop = page.locator('#cmdk-backdrop');
    const input = page.locator('#cmdk-input');

    await expect(backdrop).not.toHaveClass(/visible/);

    await page.keyboard.press(`${META}+KeyK`);
    await expect(backdrop).toHaveClass(/visible/);
    await expect(input).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(backdrop).not.toHaveClass(/visible/);
  });

  test('3. clicking a status pill opens the writeback popover with options', async ({ page }) => {
    const pill = page.locator('#all-tbody .status-pill').first();
    test.skip((await pill.count()) === 0, 'No status pills present.');

    await pill.scrollIntoViewIfNeeded();
    await pill.click();

    const popover = page.locator('#status-popover');
    await expect(popover).toHaveClass(/is-open/);

    const options = popover.locator('.status-popover-item');
    expect(await options.count()).toBeGreaterThan(1);
    // Canonical statuses include Evaluated and Applied
    await expect(options).toContainText(['Evaluated']);
    await expect(options).toContainText(['Applied']);
  });

  test('4. batch overlay sticky-dismiss survives 3 seconds', async ({ page }) => {
    // Force the overlay visible (would normally only show during a live batch)
    const opened = await page.evaluate(() => {
      if (typeof window.toggleBatchOverlay !== 'function') return false;
      window.toggleBatchOverlay();
      return document.getElementById('batch-overlay')?.classList.contains('visible');
    });
    test.skip(!opened, 'toggleBatchOverlay() is not exposed or overlay element missing.');

    const overlay = page.locator('#batch-overlay');
    await expect(overlay).toHaveClass(/visible/);

    await page.locator('#batch-overlay .batch-close').click();
    await expect(overlay).not.toHaveClass(/visible/);

    // Sticky-dismiss: should NOT re-pop within 3s
    await page.waitForTimeout(3_000);
    await expect(overlay).not.toHaveClass(/visible/);
  });

  test('5. typing in the filter hides non-matching rows', async ({ page }) => {
    const filter = page.locator('#filter-text');
    await expect(filter).toBeVisible();

    const allRows = page.locator('#all-tbody tr.row');
    const initiallyVisible = await allRows.evaluateAll(els =>
      els.filter(el => el.offsetParent !== null).length
    );
    test.skip(initiallyVisible < 2, 'Not enough rows to exercise the filter.');

    // Use a string the dashboard's own search-index won't match
    await filter.fill('zzz_definitely_no_match_xyz');
    await page.waitForTimeout(150);

    const afterVisible = await allRows.evaluateAll(els =>
      els.filter(el => el.offsetParent !== null).length
    );
    expect(afterVisible).toBeLessThan(initiallyVisible);

    await filter.fill('');
    await page.waitForTimeout(150);
  });

  test('6. dark-mode toggle adds body.dark and persists via localStorage', async ({ page }) => {
    const toggle = page.locator('#dark-toggle');
    await expect(toggle).toBeVisible();

    const startDark = await page.evaluate(() => document.body.classList.contains('dark'));

    await toggle.click();
    const afterDark = await page.evaluate(() => document.body.classList.contains('dark'));
    expect(afterDark).toBe(!startDark);

    const stored = await page.evaluate(() => localStorage.getItem('career-ops-dark'));
    expect(stored).toBe(afterDark ? 'dark' : 'light');

    // Reload — preference should persist
    await page.reload();
    await page.waitForSelector('#all-tbody');
    const persisted = await page.evaluate(() => document.body.classList.contains('dark'));
    expect(persisted).toBe(afterDark);

    // Restore initial state so other tests aren't affected
    if (persisted !== startDark) {
      await page.locator('#dark-toggle').click();
    }
  });

  test('7. mobile breakpoint: apply-now rows render as stacked cards (not table) @mobile', async ({ page }) => {
    // Project mobile-chromium runs at 375x812; double-check here for safety.
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoDashboard(page);

    const applyRow = page.locator('#apply-now-section tr.row').first();
    test.skip((await applyRow.count()) === 0, 'No Apply-Now rows present on this dashboard.');

    const display = await applyRow.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('block');

    // Mobile breakpoint also hides the apply-now thead — sanity check
    const headDisplay = await page.locator('#apply-now-section thead').first()
      .evaluate(el => getComputedStyle(el).display);
    expect(headDisplay).toBe('none');
  });

  test('8. keyboard accessibility: Tab moves through interactive elements with visible focus', async ({ page }) => {
    // Start from the top of the page
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('body').click({ position: { x: 1, y: 1 } });

    const seen = new Set();
    const interactive = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'];
    let visited = 0;
    let withVisibleFocus = 0;

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const focusVisible =
          (cs.outlineStyle && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
          (cs.boxShadow && cs.boxShadow !== 'none') ||
          el.matches(':focus-visible');
        return {
          tag: el.tagName,
          id: el.id || '',
          role: el.getAttribute('role') || '',
          tabindex: el.getAttribute('tabindex') || '',
          ariaLabel: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent?.trim().slice(0, 60) || '',
          rectArea: Math.max(0, r.width) * Math.max(0, r.height),
          focusVisible: !!focusVisible,
        };
      });
      if (!info) continue;
      const key = `${info.tag}#${info.id}|${info.ariaLabel}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const isInteractive = interactive.includes(info.tag) || info.role === 'button' || info.tabindex === '0';
      if (!isInteractive) continue;

      visited++;
      // Element must be on-screen-ish, must have an accessible name, must paint a focus indicator
      expect(info.rectArea, `focused ${key} has zero area`).toBeGreaterThan(0);
      expect(info.ariaLabel.length, `focused ${key} has no accessible name`).toBeGreaterThan(0);
      if (info.focusVisible) withVisibleFocus++;
    }

    expect(visited, 'no interactive elements were reachable via Tab').toBeGreaterThanOrEqual(3);
    // Allow a little slack — at least half of visited interactive elements must have a visible focus indicator
    expect(withVisibleFocus, 'too few elements expose a visible focus indicator').toBeGreaterThanOrEqual(Math.ceil(visited / 2));
  });
});
