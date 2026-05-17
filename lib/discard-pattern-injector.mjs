/**
 * lib/discard-pattern-injector.mjs — Inject recent-discard awareness into triage prompts.
 *
 * Per Item #1 of the 2026-05-16 incomplete-task review: when Mitchell discards
 * a row via the dashboard, the reason + auto-classified tag is appended to
 * data/discard-reasons.jsonl (see dashboard-server.mjs /api/discard-with-reason).
 * This helper reads that JSONL, groups by tag, and returns a short brief that
 * triage callers (triage.mjs, gemini-eval.mjs --mode=triage, batch-runner-
 * batches.mjs phaseSubmit) inject into their LLM prompt so the next eval run
 * doesn't re-surface the same anti-patterns.
 *
 * Usage:
 *   import { renderDiscardPatternBrief } from './lib/discard-pattern-injector.mjs';
 *   const brief = renderDiscardPatternBrief({ limit: 20, format: 'markdown' });
 *   // append `brief` to the user message / system prompt before LLM call
 *
 * Tags come from classifyDiscardReason() in dashboard-server.mjs:
 *   comp · geography · culture · skill-gap · ethics · stage · velocity ·
 *   role-shape · fit · other
 *
 * Safe-to-call contract:
 *   - returns empty section if data/discard-reasons.jsonl is missing
 *   - returns empty section if file exists but contains zero entries
 *   - never throws — callers wrap in try/catch as belt-and-suspenders, but the
 *     happy path never blows up triage
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DISCARD_FILE = join(ROOT, 'data/discard-reasons.jsonl');

const MIN_OCCURRENCES_TO_SURFACE = 2; // tags with only 1 hit are signal-poor
const REASONS_PER_TAG = 3;            // surface up to N representative reasons per tag

/**
 * loadRecentDiscards({ limit }) → array of entries (newest first)
 * Each entry: { ts, row_num, company, role, reason, tag }
 */
export function loadRecentDiscards({ limit = 20 } = {}) {
  if (!existsSync(DISCARD_FILE)) return [];
  let raw;
  try { raw = readFileSync(DISCARD_FILE, 'utf-8'); }
  catch { return []; }
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && obj.reason && obj.tag) entries.push(obj);
    } catch { /* skip malformed lines */ }
  }
  // Most recent N (file is append-only, so end is newest)
  return entries.slice(-limit).reverse();
}

/**
 * groupByTag(entries) → Map<tag, [entry, entry, ...]> with most-recent-first
 */
export function groupByTag(entries) {
  const groups = new Map();
  for (const e of entries) {
    const tag = e.tag || 'other';
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(e);
  }
  return groups;
}

/**
 * renderDiscardPatternBrief({ limit, format }) → string
 *
 * @param {object} opts
 * @param {number} opts.limit  - max recent entries to consider (default 20)
 * @param {'markdown'|'text'} opts.format - 'markdown' for LLM prompts, 'text' for CLI/logs
 * @returns {string} 10–20 line brief ready for prompt injection (or empty section if no data)
 */
export function renderDiscardPatternBrief({ limit = 20, format = 'markdown' } = {}) {
  const entries = loadRecentDiscards({ limit });
  if (entries.length === 0) {
    return format === 'markdown'
      ? '\n## Recent Discard Patterns\n\n_(no recent discards recorded — proceed with default scoring rubric)_\n'
      : 'Recent Discard Patterns: (none recorded)';
  }

  const groups = groupByTag(entries);
  // Only surface tags with enough signal (>=MIN_OCCURRENCES_TO_SURFACE)
  const surfaced = [...groups.entries()]
    .filter(([, list]) => list.length >= MIN_OCCURRENCES_TO_SURFACE)
    .sort((a, b) => b[1].length - a[1].length);

  if (surfaced.length === 0) {
    // We have entries but none cross the threshold — still tell the LLM we
    // looked, so it doesn't hallucinate a richer signal than exists.
    return format === 'markdown'
      ? `\n## Recent Discard Patterns\n\n_(${entries.length} recent discards recorded, but no single category has reached the ${MIN_OCCURRENCES_TO_SURFACE}-occurrence threshold yet)_\n`
      : `Recent Discard Patterns: ${entries.length} entries, no category at threshold`;
  }

  if (format === 'text') {
    const lines = ['', 'RECENT DISCARD PATTERNS (avoid re-surfacing these anti-patterns):'];
    for (const [tag, list] of surfaced) {
      const top = list.slice(0, REASONS_PER_TAG);
      lines.push(`  [${tag}] ${list.length} recent discard${list.length === 1 ? '' : 's'}:`);
      for (const e of top) {
        const co = e.company ? `${e.company}: ` : '';
        lines.push(`    - ${co}${truncate(e.reason, 140)}`);
      }
    }
    lines.push('');
    return lines.join('\n');
  }

  // Markdown
  const out = [];
  out.push('');
  out.push('## Recent Discard Patterns');
  out.push('');
  out.push('_Mitchell has recently discarded these from the apply queue. Score similar roles accordingly — do not re-surface the same anti-patterns. Tags are auto-classified from the user-supplied reason._');
  out.push('');
  for (const [tag, list] of surfaced) {
    const top = list.slice(0, REASONS_PER_TAG);
    out.push(`**${tag}** (${list.length} recent discard${list.length === 1 ? '' : 's'}):`);
    for (const e of top) {
      const co = e.company ? `${escapeMd(e.company)} — ` : '';
      out.push(`- ${co}${truncate(escapeMd(e.reason), 160)}`);
    }
    out.push('');
  }
  return out.join('\n');
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function escapeMd(s) {
  // Light escape: just keep pipes/backticks from breaking inline tables/code.
  return String(s || '').replace(/\|/g, '\\|').replace(/`/g, "'");
}

// CLI smoke-test: node lib/discard-pattern-injector.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('— text format —');
  console.log(renderDiscardPatternBrief({ format: 'text' }));
  console.log('\n— markdown format —');
  console.log(renderDiscardPatternBrief({ format: 'markdown' }));
}
