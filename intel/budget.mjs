/**
 * Budget reservation module — pre-debit cost tracking for API budgets.
 *
 * Reserve before call, commit after, release on failure.
 * Prevents concurrent schedules from exceeding monthly API caps.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { withLock } from './lock.mjs';

/**
 * Current month as YYYY-MM string.
 * @returns {string}
 */
function currentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export class BudgetTracker {
  /**
   * @param {string} usagePath  — path to the JSON persistence file
   * @param {string} lockPath   — path to the advisory lockfile
   * @param {Record<string, number>} budgets — { source: monthlyUSD }
   */
  constructor(usagePath, lockPath, budgets) {
    this.usagePath = usagePath;
    this.lockPath = lockPath;
    this.budgets = budgets;

    /** @type {Record<string, number>} committed spend per source */
    this.spent = {};
    /** @type {Record<string, number>} reserved (uncommitted) per source */
    this.reserved = {};
    /** @type {Record<string, number[]>} pending reservation amounts per source (FIFO) */
    this._pendingReservations = {};
    /** @type {string} YYYY-MM for the current tracking period */
    this.month = currentMonth();
  }

  /**
   * Load persisted usage from disk. Only loads if same month.
   */
  load() {
    let data;
    try {
      data = JSON.parse(readFileSync(this.usagePath, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }

    if (data.month === currentMonth()) {
      this.month = data.month;
      this.spent = data.spent ?? {};
    } else {
      // Different month — start fresh
      this.spent = {};
      this.reserved = {};
      this.month = currentMonth();
    }
  }

  /**
   * Persist current usage to disk under advisory lock.
   */
  save() {
    const payload = {
      month: this.month,
      spent: this.spent,
      lastUpdated: new Date().toISOString(),
    };
    withLock(this.lockPath, () => {
      writeFileSync(this.usagePath, JSON.stringify(payload, null, 2));
    });
  }

  /**
   * Get remaining budget for a source.
   * Returns Infinity if the source has no configured budget.
   * @param {string} source
   * @returns {number}
   */
  getRemaining(source) {
    if (!(source in this.budgets)) return Infinity;
    const budget = this.budgets[source];
    const spent = this.spent[source] ?? 0;
    const reserved = this.reserved[source] ?? 0;
    return budget - spent - reserved;
  }

  /**
   * Reserve (pre-debit) an estimated cost before making an API call.
   * @param {string} source
   * @param {number} estimatedCost
   * @returns {boolean} true if reserved, false if would exceed budget
   */
  reserveBudget(source, estimatedCost) {
    const remaining = this.getRemaining(source);
    if (estimatedCost > remaining) return false;
    this.reserved[source] = (this.reserved[source] ?? 0) + estimatedCost;
    if (!this._pendingReservations[source]) this._pendingReservations[source] = [];
    this._pendingReservations[source].push(estimatedCost);
    return true;
  }

  /**
   * Commit a reservation, adjusting from estimated to actual cost.
   * Moves the amount from reserved to spent, using the actual cost.
   * @param {string} source
   * @param {number} actualCost
   */
  commitBudget(source, actualCost) {
    // Remove the full reservation amount (FIFO) and add only actualCost to spent.
    const pending = this._pendingReservations[source];
    const estimatedCost = pending && pending.length > 0 ? pending.shift() : actualCost;
    this.reserved[source] = Math.max(0, (this.reserved[source] ?? 0) - estimatedCost);
    this.spent[source] = (this.spent[source] ?? 0) + actualCost;
  }

  /**
   * Release a reservation on failure (return budget).
   * @param {string} source
   * @param {number} amount — the originally reserved amount
   */
  releaseBudget(source, amount) {
    this.reserved[source] = Math.max(0, (this.reserved[source] ?? 0) - amount);
  }

  /**
   * Get status for a source.
   * @param {string} source
   * @returns {{ remaining: number, budget: number, pct: number, warning: boolean, message: string }}
   */
  getStatus(source) {
    const budget = this.budgets[source] ?? Infinity;
    const remaining = this.getRemaining(source);
    const used = budget - remaining;
    const pct = budget === Infinity ? 0 : (used / budget) * 100;
    const warning = pct >= 80;
    const message = warning
      ? `${source} budget at ${pct.toFixed(1)}% usage (80%+ threshold)`
      : `${source} budget at ${pct.toFixed(1)}% usage`;

    return { remaining, budget, pct, warning, message };
  }

  /**
   * Reset tracking if the calendar month has changed.
   */
  resetIfNewMonth() {
    const now = currentMonth();
    if (this.month !== now) {
      this.spent = {};
      this.reserved = {};
      this.month = now;
    }
  }
}
