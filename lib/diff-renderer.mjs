/**
 * lib/diff-renderer.mjs — Vanilla word-level and side-by-side diff renderer.
 *
 * NO external dependencies. Pure JS LCS-based diff.
 * Consumed by the /draft/{id} dashboard route.
 *
 * Exports:
 *   renderInlineDiff(oldText, newText)   → HTML string
 *   renderSideBySideDiff(oldText, newText) → HTML string
 *
 * Color tokens map to CSS variables defined in lib/child-page-template.mjs:
 *   Insertions  → --green-bg / --green-fg-dark  (success-bg pattern)
 *   Deletions   → --red-bg   / --red-fg-dark    (danger-bg pattern)
 */

// ---------------------------------------------------------------------------
// LCS (Longest Common Subsequence) — token level
// ---------------------------------------------------------------------------

/**
 * Compute the LCS edit script (array of {type, value}) for two token arrays.
 * Types: 'equal' | 'insert' | 'delete'
 *
 * Uses the classic Myers O(ND) table but capped at 50k tokens per side for
 * safety. Larger inputs fall back to a whole-block diff to avoid OOM.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Array<{type:'equal'|'insert'|'delete', value:string}>}
 */
function lcsEditScript(a, b) {
  const MAX_TOKENS = 50_000;
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    // Safety fallback: treat entire block as changed
    return [
      ...a.map(v => ({ type: 'delete', value: v })),
      ...b.map(v => ({ type: 'insert', value: v })),
    ];
  }

  const m = a.length;
  const n = b.length;

  // dp[i][j] = length of LCS of a[0..i-1] and b[0..j-1]
  // Use flat Uint16Array for memory efficiency (cap 50k means max 2.5B — stay safe below 65535 per cell)
  // If either side ≥ 256, fall back to standard number array for large inputs.
  const useFlatArray = m <= 512 && n <= 512;

  let dp;
  if (useFlatArray) {
    dp = new Uint16Array((m + 1) * (n + 1));
  } else {
    dp = new Array((m + 1) * (n + 1)).fill(0);
  }

  const idx = (i, j) => i * (n + 1) + j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[idx(i, j)] = dp[idx(i - 1, j - 1)] + 1;
      } else {
        dp[idx(i, j)] = Math.max(dp[idx(i - 1, j)], dp[idx(i, j - 1)]);
      }
    }
  }

  // Traceback
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', value: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[idx(i, j - 1)] >= dp[idx(i - 1, j)])) {
      ops.push({ type: 'insert', value: b[j - 1] });
      j--;
    } else {
      ops.push({ type: 'delete', value: a[i - 1] });
      i--;
    }
  }
  ops.reverse();
  return ops;
}

// ---------------------------------------------------------------------------
// Tokenizer — word-level, preserving whitespace tokens
// ---------------------------------------------------------------------------

/**
 * Split text into word-level tokens (words + whitespace runs preserved as tokens).
 * This gives semantic word diff while keeping the output re-joinable to the
 * original text with identical whitespace.
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeWords(text) {
  if (!text) return [];
  // Split on whitespace boundaries, keeping the delimiters
  return text.split(/(\s+)/);
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Shared CSS block (injected once per output)
// ---------------------------------------------------------------------------

const DIFF_CSS = `<style>
  .diff-ins {
    background: var(--green-bg, #dcfce7);
    color: var(--green-fg-dark, #166534);
    border-radius: 2px;
    padding: 0 2px;
  }
  .diff-del {
    background: var(--red-bg, #fee2e2);
    color: var(--red-fg-dark, #991b1b);
    text-decoration: line-through;
    border-radius: 2px;
    padding: 0 2px;
  }
  .diff-line-ins {
    background: var(--green-bg, #dcfce7);
    border-left: 3px solid var(--green-fg, #16a34a);
    padding: 2px 8px 2px 10px;
    margin: 1px 0;
  }
  .diff-line-del {
    background: var(--red-bg, #fee2e2);
    border-left: 3px solid var(--red-fg, #dc2626);
    padding: 2px 8px 2px 10px;
    margin: 1px 0;
    text-decoration: line-through;
  }
  .diff-line-eq {
    padding: 2px 8px 2px 13px;
    margin: 1px 0;
  }
  .diff-container {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .diff-sbs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    overflow: hidden;
  }
  .diff-sbs-col {
    min-width: 0;
    overflow: hidden;
  }
  .diff-sbs-header {
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3, #6b7280);
    background: var(--surface-2, #f4f4f6);
    padding: 6px 12px;
    border-bottom: 1px solid var(--border, #e5e7eb);
  }
  .diff-sbs-col + .diff-sbs-col {
    border-left: 1px solid var(--border, #e5e7eb);
  }
  .diff-sbs-body {
    padding: 6px 0;
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
    max-height: 480px;
    overflow-y: auto;
  }
</style>`;

// ---------------------------------------------------------------------------
// Line-level LCS helper (for side-by-side alignment)
// ---------------------------------------------------------------------------

/**
 * Produce line-level edit script.
 * @param {string[]} aLines
 * @param {string[]} bLines
 * @returns {Array<{type, aLine, bLine}>}
 */
function lineEditScript(aLines, bLines) {
  const raw = lcsEditScript(aLines, bLines);
  return raw.map(op => ({
    type:  op.type,
    aLine: op.type !== 'insert' ? op.value : null,
    bLine: op.type !== 'delete' ? op.value : null,
  }));
}

// ---------------------------------------------------------------------------
// Public API — renderInlineDiff
// ---------------------------------------------------------------------------

/**
 * Render a word-level inline diff as HTML.
 * Identical text produces no marks (no spans wrapping unchanged tokens).
 *
 * @param {string} oldText
 * @param {string} newText
 * @returns {string} HTML
 */
export function renderInlineDiff(oldText, newText) {
  if (oldText == null) oldText = '';
  if (newText == null) newText = '';

  // Fast path: identical
  if (oldText === newText) {
    return `${DIFF_CSS}<div class="diff-container">${esc(newText)}</div>`;
  }

  // Build line-by-line inline diff so context stays legible
  const aLines = oldText.split('\n');
  const bLines = newText.split('\n');
  const lineOps = lineEditScript(aLines, bLines);

  const htmlParts = [DIFF_CSS, '<div class="diff-container">'];

  for (const op of lineOps) {
    if (op.type === 'equal') {
      // For equal lines, show word-level diff (will produce no marks when equal)
      htmlParts.push(`<div class="diff-line-eq">${esc(op.aLine)}</div>`);
    } else if (op.type === 'delete') {
      // Within a deleted line, show word-level diff vs empty for context
      htmlParts.push(`<div class="diff-line-del">${esc(op.aLine)}</div>`);
    } else {
      // Insert: show word-level diff vs the corresponding deleted line if any
      htmlParts.push(`<div class="diff-line-ins">${esc(op.bLine)}</div>`);
    }
  }

  // For lines that changed, replace with word-level inline markup
  // Re-do for changed pairs: find consecutive delete+insert and apply word diff
  const raw = lineOps;
  const enhanced = [];
  let i = 0;
  while (i < raw.length) {
    const op = raw[i];
    if (op.type === 'delete' && i + 1 < raw.length && raw[i + 1].type === 'insert') {
      // Paired change: apply word-level diff
      const wOps = lcsEditScript(
        tokenizeWords(op.aLine || ''),
        tokenizeWords(raw[i + 1].bLine || '')
      );
      let oldLineHtml = '';
      let newLineHtml = '';
      for (const w of wOps) {
        if (w.type === 'equal')  { oldLineHtml += esc(w.value); newLineHtml += esc(w.value); }
        if (w.type === 'delete') { oldLineHtml += `<span class="diff-del">${esc(w.value)}</span>`; }
        if (w.type === 'insert') { newLineHtml += `<span class="diff-ins">${esc(w.value)}</span>`; }
      }
      enhanced.push({ type: 'delete-enhanced', html: oldLineHtml });
      enhanced.push({ type: 'insert-enhanced', html: newLineHtml });
      i += 2;
    } else {
      enhanced.push({ type: op.type, html: op.type !== 'insert' ? esc(op.aLine) : esc(op.bLine) });
      i++;
    }
  }

  const lines2 = [DIFF_CSS, '<div class="diff-container">'];
  for (const e of enhanced) {
    if (e.type === 'equal')            lines2.push(`<div class="diff-line-eq">${e.html}</div>`);
    else if (e.type === 'delete' || e.type === 'delete-enhanced')
                                        lines2.push(`<div class="diff-line-del">${e.html}</div>`);
    else                                lines2.push(`<div class="diff-line-ins">${e.html}</div>`);
  }
  lines2.push('</div>');
  return lines2.join('\n');
}

// ---------------------------------------------------------------------------
// Public API — renderSideBySideDiff
// ---------------------------------------------------------------------------

/**
 * Render a side-by-side diff as HTML.
 * Two columns: left = old (deletions highlighted), right = new (insertions highlighted).
 * Matched lines are aligned by LCS algorithm.
 *
 * @param {string} oldText
 * @param {string} newText
 * @returns {string} HTML
 */
export function renderSideBySideDiff(oldText, newText) {
  if (oldText == null) oldText = '';
  if (newText == null) newText = '';

  const aLines = oldText.split('\n');
  const bLines = newText.split('\n');
  const ops    = lineEditScript(aLines, bLines);

  // Build aligned rows: [{aHtml, bHtml, rowClass}]
  const rows = [];

  let j = 0;
  while (j < ops.length) {
    const op = ops[j];
    if (op.type === 'equal') {
      rows.push({
        aHtml: esc(op.aLine),
        bHtml: esc(op.bLine),
        rowType: 'equal',
      });
      j++;
    } else if (op.type === 'delete' && j + 1 < ops.length && ops[j + 1].type === 'insert') {
      // Paired: word-level diff both sides
      const wOps = lcsEditScript(
        tokenizeWords(op.aLine || ''),
        tokenizeWords(ops[j + 1].bLine || '')
      );
      let aHtml = '', bHtml = '';
      for (const w of wOps) {
        if (w.type === 'equal')  { aHtml += esc(w.value); bHtml += esc(w.value); }
        if (w.type === 'delete') { aHtml += `<span class="diff-del">${esc(w.value)}</span>`; }
        if (w.type === 'insert') { bHtml += `<span class="diff-ins">${esc(w.value)}</span>`; }
      }
      rows.push({ aHtml, bHtml, rowType: 'changed' });
      j += 2;
    } else if (op.type === 'delete') {
      rows.push({ aHtml: `<span class="diff-del">${esc(op.aLine)}</span>`, bHtml: '', rowType: 'delete' });
      j++;
    } else {
      rows.push({ aHtml: '', bHtml: `<span class="diff-ins">${esc(op.bLine)}</span>`, rowType: 'insert' });
      j++;
    }
  }

  const aLines2 = rows.map(r => `<div class="diff-line-${r.rowType === 'equal' ? 'eq' : r.rowType === 'delete' || r.rowType === 'changed' ? 'del' : 'ins'}">${r.aHtml}&nbsp;</div>`).join('');
  const bLines2 = rows.map(r => `<div class="diff-line-${r.rowType === 'equal' ? 'eq' : r.rowType === 'insert' || r.rowType === 'changed' ? 'ins' : 'del'}">${r.bHtml}&nbsp;</div>`).join('');

  return `${DIFF_CSS}
<div class="diff-sbs">
  <div class="diff-sbs-col">
    <div class="diff-sbs-header">Before</div>
    <div class="diff-sbs-body">${aLines2}</div>
  </div>
  <div class="diff-sbs-col">
    <div class="diff-sbs-header">After</div>
    <div class="diff-sbs-body">${bLines2}</div>
  </div>
</div>`;
}
