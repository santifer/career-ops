// lib/humanize-status.mjs — plain-language formatter for tracker notes,
// score deltas, gate results, and decision labels.
//
// Per DESIGN_PRINCIPLES.md Pillar 1 (scannability): raw jargon strings like
// "Re-evaluated 2026-05-16 (Phase E): score improved from 4.6 to 4.6 (+0.00)
// (Δ0) · No blocking gates triggered · Decision: Apply" must become scannable
// headline + bullet lines so the dashboard can render them without parsing.
//
// Pillar 3 (strengths AND limitations): every humanized note surfaces BOTH
// what went well AND any soft/hard gaps so the user never sees a one-sided view.
//
// NO LLM calls. NO external dependencies. Pure regex + lookup tables.

// ── Date helpers ─────────────────────────────────────────────────────────────

const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

function extractDate(raw) {
  const m = ISO_DATE_RE.exec(raw);
  return m ? m[1] : null;
}

// ── Score extraction ──────────────────────────────────────────────────────────

// Matches patterns like:
//   "score improved from 4.6 to 4.8"
//   "4.3/5→2.5/5"
//   "Re-eval … (3.85→4.2)"
//   "(1.7→2.3)"
const SCORE_DELTA_RE = /(?:from\s+)?(\d+(?:\.\d+)?)\s*(?:\/5)?\s*(?:→|->|to)\s*(\d+(?:\.\d+)?)(?:\s*\/5)?/i;
// Standalone score like "Score: 4.6" or "4.6/5"
const SCORE_BARE_RE  = /\bscore[:\s]+(\d+(?:\.\d+)?)\b/i;
const SCORE_SLASH_RE = /\b(\d+(?:\.\d+)?)\/5\b/;

function extractScores(raw) {
  const deltaM = SCORE_DELTA_RE.exec(raw);
  if (deltaM) {
    return { prev: parseFloat(deltaM[1]), curr: parseFloat(deltaM[2]) };
  }
  const bareM = SCORE_BARE_RE.exec(raw) || SCORE_SLASH_RE.exec(raw);
  if (bareM) {
    const v = parseFloat(bareM[1]);
    return { prev: null, curr: v };
  }
  return { prev: null, curr: null };
}

// ── Gate extraction ───────────────────────────────────────────────────────────

// "No blocking gates triggered"
// "GATES: [H1, H2, H3, H4] fired"
// "6 gates clear · soft gap: external dev-media network"
const GATES_PASSED_RE = /(\d+)\s+gates?\s+clear/i;
const NO_GATES_RE     = /no\s+blocking\s+gates?\s+triggered/i;
const GATES_FIRED_RE  = /gates?:\s*\[([^\]]+)\]\s+fired/i;
const SOFT_GAP_RE     = /soft\s+gap[:\s]+([^·\n]+)/i;

function extractGates(raw) {
  const passedM = GATES_PASSED_RE.exec(raw);
  const firedM  = GATES_FIRED_RE.exec(raw);
  const softM   = SOFT_GAP_RE.exec(raw);

  const gatesPassed = passedM ? parseInt(passedM[1], 10)
    : NO_GATES_RE.test(raw) ? 0
    : null; // unknown

  const gatesFired = firedM
    ? firedM[1].split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const softGap = softM ? softM[1].trim() : null;

  return { gatesPassed, gatesFired, softGap };
}

// ── Decision extraction ───────────────────────────────────────────────────────

// "Decision: Apply"   "Decision: APPLY"   "Decision: SKIP"
// "DO NOT APPLY"      "CONDITIONAL APPLY"
const DECISION_RE   = /Decision[:\s]+([A-Z][A-Z _]+?)(?:\s*[·.]|$)/im;
const DO_NOT_APPLY  = /do\s+not\s+apply/i;
const SKIP_RE       = /\bSKIP\b(?!\s+unless|\s+if)/;
const COND_APPLY_RE = /conditional\s+apply/i;
const DEFER_RE      = /\bDEFER\b/i;

function extractDecisionRaw(raw) {
  const m = DECISION_RE.exec(raw);
  if (m) return m[1].trim().toUpperCase();
  if (DO_NOT_APPLY.test(raw))  return 'SKIP';
  if (SKIP_RE.test(raw))       return 'SKIP';
  if (COND_APPLY_RE.test(raw)) return 'CONDITIONAL_APPLY';
  if (DEFER_RE.test(raw))      return 'DEFER';
  return null;
}

// ── Indicator derivation ──────────────────────────────────────────────────────

function deriveIndicator(decision, score, gatesFired) {
  if (decision === 'SKIP' || decision === 'DO_NOT_APPLY') return 'red';
  if (decision === 'DEFER')                                return 'amber';
  if (decision === 'CONDITIONAL_APPLY')                    return 'amber';
  if (gatesFired.length > 0)                               return 'red';
  if (score !== null) {
    if (score >= 4.3) return 'green';
    if (score >= 3.7) return 'amber';
    return 'red';
  }
  if (decision === 'APPLY') return 'green';
  return 'gray';
}

// ── Score-delta natural language ──────────────────────────────────────────────

/**
 * humanizeScoreDelta(oldScore, newScore) → plain-language string
 *
 * @param {number} oldScore
 * @param {number} newScore
 * @returns {string}
 */
export function humanizeScoreDelta(oldScore, newScore) {
  const delta = newScore - oldScore;
  const absDelta = Math.abs(delta);
  const old = Number(oldScore).toFixed(1);
  const curr = Number(newScore).toFixed(1);

  if (absDelta < 0.005) {
    return `Score held at ${curr} — no change`;
  }
  if (delta > 0) {
    const adv = absDelta >= 0.5 ? 'major boost' : absDelta >= 0.2 ? 'clear improvement' : 'slight improvement';
    return `Score improved ${old} → ${curr} (+${absDelta.toFixed(2)}) — ${adv}`;
  }
  const decline = absDelta >= 0.5 ? 'major drop' : absDelta >= 0.2 ? 'notable decline' : 'slight decline';
  return `Score declined ${old} → ${curr} (−${absDelta.toFixed(2)}) — ${decline}`;
}

// ── Gate result humanizer ─────────────────────────────────────────────────────

/**
 * humanizeGateResult({ passed, failed, soft }) → plain-language string
 *
 * @param {{ passed: number, failed?: string[], soft?: string[] }} opts
 * @returns {string}
 */
export function humanizeGateResult({ passed = 0, failed = [], soft = [] }) {
  const failedCount = failed.length;
  const softCount   = soft.length;

  if (failedCount === 0 && softCount === 0) {
    return `All ${passed} gate${passed === 1 ? '' : 's'} clear`;
  }
  if (failedCount > 0 && softCount === 0) {
    return `${failedCount} hard gate${failedCount === 1 ? '' : 's'} fired (${failed.join(', ')}) — blocked`;
  }
  if (failedCount === 0 && softCount > 0) {
    const label = soft.join(', ');
    return `All ${passed} gates clear — soft gap: ${label}`;
  }
  return `${failedCount} hard gate${failedCount === 1 ? '' : 's'} fired (${failed.join(', ')}); soft gaps: ${soft.join(', ')}`;
}

// ── Decision humanizer ────────────────────────────────────────────────────────

const DECISION_MAP = {
  'APPLY':             { label: 'Apply',                  register: 'imperative'   },
  'APPLY_IMMEDIATELY': { label: 'Apply now',              register: 'imperative'   },
  'CONDITIONAL_APPLY': { label: 'Apply with conditions',  register: 'recommended'  },
  'DEFER':             { label: 'Defer',                  register: 'recommended'  },
  'SKIP':              { label: 'Skip',                   register: 'cautionary'   },
  'DO_NOT_APPLY':      { label: 'Do not apply',           register: 'cautionary'   },
  'FLAG_REVIEW':       { label: 'Flag for review',        register: 'cautionary'   },
};

/**
 * humanizeDecision(d) → { label, register }
 *
 * @param {string} d  raw decision string (any case)
 * @returns {{ label: string, register: 'imperative'|'recommended'|'cautionary' }}
 */
export function humanizeDecision(d) {
  if (!d) return { label: 'Pending review', register: 'recommended' };
  const key = String(d).toUpperCase().replace(/[\s-]+/g, '_');
  return DECISION_MAP[key] || { label: d, register: 'recommended' };
}

// ── Confidence qualifier ──────────────────────────────────────────────────────

function confidenceLabel(score) {
  if (score === null) return '';
  if (score >= 4.5) return ' (high confidence)';
  if (score >= 4.0) return ' (solid fit)';
  if (score >= 3.7) return ' (moderate fit)';
  return '';
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * humanizeTrackerNote(raw) → structured plain-language representation
 *
 * Transforms raw tracker notes like
 *   "Re-evaluated 2026-05-16 (Phase E): score improved from 4.6 to 4.6 (+0.00)
 *    (Δ0) · No blocking gates triggered · Decision: Apply"
 * into
 *   { headline: "Apply (high confidence)",
 *     lines: ["Score held at 4.6 — no change yesterday",
 *             "All 6 gates clear · soft gap: external dev-media network"],
 *     indicator: "green",
 *     date: "2026-05-16" }
 *
 * @param {string} raw
 * @returns {{ headline: string, lines: string[], indicator: 'green'|'amber'|'red'|'gray', date?: string }}
 */
export function humanizeTrackerNote(raw) {
  if (!raw) {
    return { headline: 'No note', lines: [], indicator: 'gray', date: undefined };
  }

  const date       = extractDate(raw);
  const { prev, curr } = extractScores(raw);
  const { gatesPassed, gatesFired, softGap } = extractGates(raw);
  const decisionRaw = extractDecisionRaw(raw);

  const indicator = deriveIndicator(decisionRaw, curr, gatesFired);

  // Build headline
  const { label: decLabel } = humanizeDecision(decisionRaw);
  const conf = confidenceLabel(curr);
  const headline = decisionRaw
    ? `${decLabel}${conf}`
    : curr !== null
      ? `Score ${curr}/5${conf}`
      : 'Review note';

  // Build lines
  const lines = [];

  // Score delta line
  if (prev !== null && curr !== null) {
    lines.push(humanizeScoreDelta(prev, curr));
  } else if (curr !== null) {
    lines.push(`Score ${curr}/5${conf.trim() ? ` ${conf.trim()}` : ''}`);
  }

  // Gates line
  if (gatesFired.length > 0) {
    lines.push(humanizeGateResult({ passed: gatesPassed || 0, failed: gatesFired, soft: softGap ? [softGap] : [] }));
  } else if (gatesPassed !== null) {
    const gateStr = humanizeGateResult({
      passed:  gatesPassed,
      failed:  [],
      soft:    softGap ? [softGap] : [],
    });
    lines.push(gateStr);
  }

  return { headline, lines, indicator, date: date || undefined };
}
