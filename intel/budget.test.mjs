/**
 * Tests for BudgetTracker — pre-debit cost tracking for API budgets.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BudgetTracker } from './budget.mjs';

describe('BudgetTracker', () => {
  let dir;
  let usagePath;
  let lockPath;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'budget-test-'));
    usagePath = join(dir, 'usage.json');
    lockPath = join(dir, 'usage.lock');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reserves budget and decrements available', () => {
    const bt = new BudgetTracker(usagePath, lockPath, { exa: 50 });
    const ok = bt.reserveBudget('exa', 5);
    assert.equal(ok, true);
    assert.equal(bt.getRemaining('exa'), 45);
  });

  it('rejects reservation when over budget', () => {
    const bt = new BudgetTracker(usagePath, lockPath, { tavily: 30 });
    const first = bt.reserveBudget('tavily', 25);
    assert.equal(first, true);
    const second = bt.reserveBudget('tavily', 10);
    assert.equal(second, false);
    assert.equal(bt.getRemaining('tavily'), 5);
  });

  it('commits budget adjusting to actual cost', () => {
    const bt = new BudgetTracker(usagePath, lockPath, { exa: 50 });
    bt.reserveBudget('exa', 10);
    bt.commitBudget('exa', 7.50);
    assert.equal(bt.getRemaining('exa'), 42.50);
  });

  it('releases budget on failure', () => {
    const bt = new BudgetTracker(usagePath, lockPath, { exa: 50 });
    bt.reserveBudget('exa', 10);
    assert.equal(bt.getRemaining('exa'), 40);
    bt.releaseBudget('exa', 10);
    assert.equal(bt.getRemaining('exa'), 50);
  });

  it('tracks multiple sources independently', () => {
    const bt = new BudgetTracker(usagePath, lockPath, { exa: 50, tavily: 30 });
    bt.reserveBudget('exa', 10);
    bt.reserveBudget('tavily', 5);
    assert.equal(bt.getRemaining('exa'), 40);
    assert.equal(bt.getRemaining('tavily'), 25);
  });

  it('returns Infinity for unknown sources', () => {
    const bt = new BudgetTracker(usagePath, lockPath, { exa: 50 });
    assert.equal(bt.getRemaining('unknown'), Infinity);
  });

  it('warns at 80% usage', () => {
    const bt = new BudgetTracker(usagePath, lockPath, { tavily: 30 });
    bt.reserveBudget('tavily', 24);
    bt.commitBudget('tavily', 24);
    const status = bt.getStatus('tavily');
    assert.equal(status.warning, true);
    assert.ok(status.message.includes('80%'));
  });

  it('persists usage to JSON file and reloads correctly', () => {
    const bt = new BudgetTracker(usagePath, lockPath, { exa: 50 });
    bt.reserveBudget('exa', 10);
    bt.commitBudget('exa', 10);
    bt.save();

    const bt2 = new BudgetTracker(usagePath, lockPath, { exa: 50 });
    bt2.load();
    assert.equal(bt2.getRemaining('exa'), 40);
  });

  it('does not reset for same month', () => {
    const bt = new BudgetTracker(usagePath, lockPath, { exa: 50 });
    bt.reserveBudget('exa', 10);
    bt.commitBudget('exa', 10);
    bt.save();

    const bt2 = new BudgetTracker(usagePath, lockPath, { exa: 50 });
    bt2.load();
    bt2.resetIfNewMonth();
    assert.equal(bt2.getRemaining('exa'), 40);
  });
});
