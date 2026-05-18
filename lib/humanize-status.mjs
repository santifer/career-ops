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

// ── Label rewriter ────────────────────────────────────────────────────────────

/**
 * humanizeLabel(rawLabel) → plain-language UI label
 *
 * Rewrites all-caps jargon labels, internal field names, and tech-speak into
 * plain English that a first-time reader can understand without a glossary.
 * Lookup-table approach: O(1), no regex, no LLM.
 *
 * @param {string} rawLabel
 * @returns {string}
 */
const LABEL_MAP = {
  // Dashboard drawer section headers
  'WHAT FITS':                   'What matches your background',
  'WHAT\'S MISSING':             'Gaps to address',
  "WHAT'S MISSING":              'Gaps to address',
  'ROLE AT A GLANCE':            'Quick role summary',
  'HOW TO POSITION':             'How to position yourself',
  'OUTREACH PULSE':              'Outreach you owe',
  'SIGNAL PULSE':                'What\'s new this week',
  'TRACKER NOTE':                'Why this score',
  'STORIES TO LEAD WITH':        'Stories to use in your cover letter and interview',
  'NOTES & ACTIVITY':            'Notes & activity',
  'NOTES &amp; ACTIVITY':        'Notes & activity',
  'ACTION':                      'What to do next',
  'TONIGHT\'S PICK':             'Best role to apply to tonight',
  "TONIGHT'S PICK":              'Best role to apply to tonight',

  // TPgM / program-manager widgets
  'TPGM CREDIBILITY':            'Your Program Manager readiness',
  'TPgM CREDIBILITY':            'Your Program Manager readiness',
  'PM-Bridge index':             'How much this role builds your PM path',
  'PM-credibility composite':    'Your overall PM readiness score',
  'PM credibility composite':    'Your overall PM readiness score',
  'Open gap points available':   'Points you can gain by closing these gaps',

  // Alignment bar labels (drawer intro section)
  'HM-noticing chance':          'Chance a hiring manager will see you',
  'Profile alignment':           'How well your background fits',
  'Interview likelihood':        'Chance of getting a recruiter screen',

  // Machine / field name keys
  'voice_fidelity_cosine':       'How well it sounds like you',
  'humanize_check_score':        'AI detection risk',
  'ai_policy_slug':              'Company\'s AI policy',
  'stat-anchor':                 '',   // was 2031 widget, no longer rendered

  // Status / state labels
  'Apply-Now Queue · score ≥ 4.0': 'Ready to apply · score 4.0 or above',
  'Total evaluations':           'Roles evaluated',
  'Pipeline pending':            'Roles waiting to be evaluated',
  'Applied / In process':        'Applied or in progress',
  'Press network':               'Warm contacts in your network',
  'Q3 2026 · Days left':         'Days until Q3 2026 deadline',
  'Eval Date':                   'Date evaluated',

  // Archetype shorthands with technical names
  'A2 PgM':                      'AI Program Manager',
  'A1':                          'Tier A — top fit',
  'A2':                          'AI Program Manager path',
  'Tier B':                      'Editorial / DevRel role',
  'B1':                          'Tier B — editorial / DevRel',
  'C1':                          'Lower-fit tier',
};

export function humanizeLabel(rawLabel) {
  if (!rawLabel) return rawLabel;
  const str = String(rawLabel).trim();
  if (Object.prototype.hasOwnProperty.call(LABEL_MAP, str)) {
    return LABEL_MAP[str];
  }
  // Fallback: return as-is (preserve unknown / already-plain labels)
  return str;
}

// ── Button text rewriter ──────────────────────────────────────────────────────

/**
 * humanizeButton(rawAction) → plain action verb phrase
 *
 * @param {string} rawAction
 * @returns {string}
 */
const BUTTON_MAP = {
  'Apply':             'Apply now',
  'Apply →':           'Apply now →',
  'Skip':              'Skip this one',
  'Defer':             'Look at this later',
  'Create materials':  'Generate apply pack',
  'Mark Applied':      'I applied',
  'Mark Skip':         'Skip this one',
  'Pick another':      'Pick a different role',
  'Learn more':        'Learn more about this role',
  'Add note':          'Save note',
  'Clear all':         'Dismiss all',
};

export function humanizeButton(rawAction) {
  if (!rawAction) return rawAction;
  const str = String(rawAction).trim();
  return BUTTON_MAP[str] || str;
}

// ── System message rewriter ───────────────────────────────────────────────────

/**
 * humanizeMessage(rawText) → plain-language system message
 *
 * @param {string} rawText
 * @returns {string}
 */
const MESSAGE_MAP = {
  'No recommendation captured.':  'No strategy yet — click to generate',
  'No recommendation captured':   'No strategy yet — click to generate',
  'No recommendation yet — run `npm run outreach:recommend`': 'No outreach strategy yet — click to generate one',
  'No notes yet — add one above. Status changes are auto-logged.': 'No notes yet — add one above',
  'Under-built — close gaps':     'Steady climb — keep building',
  'awaiting-human-review':        'Ready for your review',
  'failed_humanize_gate':         'Failed AI detection check — needs rewrite',
  'scaffold only':                'Placeholder — needs real data',
  'Queue empty':                  'Nothing in queue right now',
  'No errors logged today.':      'No errors today — clean run',
  'No error log present.':        'No error log found',
};

export function humanizeMessage(rawText) {
  if (!rawText) return rawText;
  const str = String(rawText).trim();
  return MESSAGE_MAP[str] || str;
}

// ── Jargon expander (term → displayed + tooltip pair) ────────────────────────

/**
 * expandJargon(text) → { displayed: string, tooltip: string }
 *
 * For technical terms that carry load-bearing meaning, returns a human-readable
 * display string paired with a tooltip that preserves the precise term.
 * The caller decides whether to render the tooltip inline.
 *
 * @param {string} text  raw term or abbreviation
 * @returns {{ displayed: string, tooltip: string }}
 */
const JARGON_MAP = {
  'A2 PgM':         { displayed: 'AI Program Manager',      tooltip: 'Your A2 archetype — see modes/_profile.md' },
  'A2':             { displayed: 'AI PM path',              tooltip: 'Archetype A2 — AI-native program manager roles' },
  'A1':             { displayed: 'Top-fit role',            tooltip: 'Archetype A1 — direct match to your profile' },
  'Tier B':         { displayed: 'Editorial / DevRel role', tooltip: 'Fallback archetype — still worth pursuing' },
  'B1':             { displayed: 'Editorial / DevRel',      tooltip: 'Archetype B1 — content, DevRel, and narrative-tech roles' },
  'C1':             { displayed: 'Lower-fit role',          tooltip: 'Archetype C1 — further from your core target' },
  'TPgM':           { displayed: 'Technical Program Manager', tooltip: 'TPgM — the role type you\'re building toward' },
  'HM':             { displayed: 'Hiring manager',          tooltip: 'HM — the person who owns the headcount' },
  'ATS':            { displayed: 'Applicant tracking system', tooltip: 'ATS — the software companies use to receive and filter applications' },
  'JD':             { displayed: 'Job description',         tooltip: 'JD — the posting you\'re evaluating' },
  'TTO':            { displayed: 'Time to offer',           tooltip: 'TTO — how long from apply to signed offer' },
  'STAR+R':         { displayed: 'Story format',            tooltip: 'STAR+R — Situation, Task, Action, Result, Reflection' },
  'RSU':            { displayed: 'Stock grant (RSU)',        tooltip: 'RSU — Restricted Stock Unit, vesting over time' },
};

export function expandJargon(text) {
  if (!text) return { displayed: String(text), tooltip: '' };
  const str = String(text).trim();
  const entry = JARGON_MAP[str];
  if (entry) return { displayed: entry.displayed, tooltip: entry.tooltip };
  return { displayed: str, tooltip: '' };
}

// ── Flesch-Kincaid grade level scorer ────────────────────────────────────────

/**
 * gradeLevel(text) → Flesch-Kincaid grade level (number)
 *
 * Pure JS — no LLM, no deps. Accurate enough for a relative before/after
 * comparison; grade 8 target means most adults can parse it without rereading.
 *
 * Formula: 0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59
 *
 * @param {string} text  plain text (HTML/markdown stripped by caller if needed)
 * @returns {number}  grade level, clamped [0, 20]
 */
export function gradeLevel(text) {
  if (!text || typeof text !== 'string') return 0;

  // Strip markdown bold/italic and HTML tags for clean word count
  const plain = text
    .replace(/<[^>]+>/g, ' ')     // strip HTML
    .replace(/\*{1,3}|_{1,3}/g, '') // strip markdown emphasis
    .replace(/`[^`]*`/g, ' ')      // strip inline code
    .replace(/#+\s*/g, '')         // strip headings
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) return 0;

  // Sentence count: split on . ! ? followed by whitespace or end
  const sentences = plain.split(/[.!?]+[\s\n]+|[.!?]+$/).filter(s => s.trim().length > 0);
  const sentenceCount = Math.max(1, sentences.length);

  // Word count
  const words = plain.split(/\s+/).filter(w => w.length > 0);
  const wordCount = Math.max(1, words.length);

  // Syllable count — heuristic (count vowel groups, subtract common endings)
  function syllablesInWord(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) return 1;
    let count = 0;
    let prevVowel = false;
    for (const ch of w) {
      const isVowel = /[aeiouy]/.test(ch);
      if (isVowel && !prevVowel) count++;
      prevVowel = isVowel;
    }
    // Silent trailing 'e'
    if (w.endsWith('e') && count > 1) count--;
    // 'le' at end usually IS a syllable
    if (w.endsWith('le') && w.length > 2 && !/[aeiouy]/.test(w[w.length - 3])) count++;
    return Math.max(1, count);
  }

  const syllableCount = words.reduce((sum, w) => sum + syllablesInWord(w), 0);

  const avgSentLen = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / wordCount;

  const fk = 0.39 * avgSentLen + 11.8 * avgSyllablesPerWord - 15.59;
  return Math.round(Math.max(0, Math.min(20, fk)) * 10) / 10;
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
