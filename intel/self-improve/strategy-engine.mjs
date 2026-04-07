/**
 * Strategy Engine — reads/writes strategy-ledger.md
 *
 * Manages guiding principles, cautionary principles, hypotheses,
 * calibration log, and optimization history. Supports promotion,
 * pruning, conflict detection, and round-trip serialization.
 */

// ---------------------------------------------------------------------------
// Principle line regex:
//   - Text. (n=12, 85% accuracy, industries=AI,fintech,govcon)
// ---------------------------------------------------------------------------
const PRINCIPLE_RE =
  /^- (.+?)\s*\(n=(\d+),\s*(\d+)%\s*accuracy,\s*industries=([^)]+)\)\s*$/;

// ---------------------------------------------------------------------------
// Conflict keyword pairs: [principleKeyword, dealBreakerKeyword]
// If a principle contains the first AND a deal-breaker contains the second,
// that's a conflict.
// ---------------------------------------------------------------------------
const CONFLICT_PAIRS = [
  ['hybrid', 'remote'],
  ['on-site', 'remote'],
  ['onsite', 'remote'],
  ['remote', 'hybrid'],
  ['remote', 'on-site'],
  ['remote', 'onsite'],
  ['equity', 'no equity'],
  ['startup', 'no startup'],
  ['no equity', 'equity'],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePrincipleLine(line) {
  const m = line.match(PRINCIPLE_RE);
  if (!m) return null;
  return {
    text: m[1].trim(),
    n: parseInt(m[2], 10),
    accuracy: parseInt(m[3], 10),
    industries: m[4].split(',').map((s) => s.trim()),
  };
}

function parseTableRows(lines) {
  // Skip header and separator rows, parse data rows
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('|--') || trimmed.startsWith('| Date')) continue;
    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '');
    if (cells.length >= 1) rows.push(cells);
  }
  return rows;
}

function splitSections(md) {
  const sections = {};
  let currentKey = null;
  let currentLines = [];

  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) {
      if (currentKey) sections[currentKey] = currentLines;
      currentKey = line;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentKey) sections[currentKey] = currentLines;
  return sections;
}

function findSectionByPrefix(sections, prefix) {
  for (const key of Object.keys(sections)) {
    if (key.startsWith(prefix)) return sections[key];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseLedger(md) {
  const sections = splitSections(md);

  const guidingLines = findSectionByPrefix(sections, '## Guiding Principles');
  const cautionaryLines = findSectionByPrefix(sections, '## Cautionary Principles');
  const hypothesisLines = findSectionByPrefix(sections, '## Active Hypotheses');
  const calibrationLines = findSectionByPrefix(sections, '## Calibration Log');
  const optimizationLines = findSectionByPrefix(sections, '## Optimization History');

  const parsePrinciples = (lines) =>
    lines.map((l) => parsePrincipleLine(l.trim())).filter(Boolean);

  const guidingPrinciples = parsePrinciples(guidingLines);
  const cautionaryPrinciples = parsePrinciples(cautionaryLines);
  const hypotheses = parsePrinciples(hypothesisLines);

  // Calibration log: Date | Company | Role | Score | Action | Delta | Lesson
  const calRows = parseTableRows(calibrationLines);
  const calibrationLog = calRows
    .filter((r) => r.length >= 7)
    .map((r) => ({
      date: r[0],
      company: r[1],
      role: r[2],
      score: r[3],
      action: r[4],
      delta: r[5],
      lesson: r[6],
    }));

  // Optimization history: Date | Loop | Pass Rate Before | After | Changes | Approved
  const optRows = parseTableRows(optimizationLines);
  const optimizationHistory = optRows
    .filter((r) => r.length >= 6)
    .map((r) => ({
      date: r[0],
      loop: r[1],
      passRateBefore: r[2],
      after: r[3],
      changes: r[4],
      approved: r[5],
    }));

  return {
    guidingPrinciples,
    cautionaryPrinciples,
    hypotheses,
    calibrationLog,
    optimizationHistory,
  };
}

export function addCalibrationEntry(ledger, entry) {
  ledger.calibrationLog.push(entry);
}

export function promotePrinciple(ledger, index, target) {
  const principle = ledger.hypotheses[index];
  if (!principle) throw new Error('Index out of range');
  if (principle.n < 10 || (principle.industries || []).length < 3) {
    throw new Error(
      `insufficient: need n>=10 (got ${principle.n}) and 3+ industries (got ${(principle.industries || []).length})`,
    );
  }
  ledger.hypotheses.splice(index, 1);
  // Remove any trending flag when promoting
  const { trending, ...clean } = principle;
  ledger[target].push(clean);
}

export function prunePrinciple(ledger, index, source) {
  const principle = ledger[source][index];
  if (!principle) throw new Error('Index out of range');
  ledger[source].splice(index, 1);
  ledger.hypotheses.push({ ...principle, trending: 'demoted' });
}

export function detectConflicts(ledger, dealBreakers) {
  const conflicts = [];
  const allPrinciples = [
    ...ledger.guidingPrinciples,
    ...ledger.cautionaryPrinciples,
  ];

  const lowerBreakers = dealBreakers.map((d) => d.toLowerCase());

  for (const p of allPrinciples) {
    const pLower = p.text.toLowerCase();
    for (const [pKeyword, dbKeyword] of CONFLICT_PAIRS) {
      if (pLower.includes(pKeyword)) {
        for (const db of lowerBreakers) {
          if (db.includes(dbKeyword)) {
            conflicts.push({
              principle: p.text,
              dealBreaker: dealBreakers[lowerBreakers.indexOf(db)],
              keywords: [pKeyword, dbKeyword],
            });
          }
        }
      }
    }
  }

  return conflicts;
}

export function serializeLedger(ledger) {
  const serializePrinciple = (p) => {
    const industries = p.industries.join(',');
    return `- ${p.text} (n=${p.n}, ${p.accuracy}% accuracy, industries=${industries})`;
  };

  const lines = ['# Strategy Ledger'];

  // Guiding Principles
  lines.push('## Guiding Principles (validated, n >= 10, 3+ industries)');
  for (const p of ledger.guidingPrinciples) lines.push(serializePrinciple(p));

  // Cautionary Principles
  lines.push('## Cautionary Principles (validated, n >= 10, 3+ industries)');
  for (const p of ledger.cautionaryPrinciples) lines.push(serializePrinciple(p));

  // Active Hypotheses
  lines.push('## Active Hypotheses (testing, n < 10)');
  for (const p of ledger.hypotheses) lines.push(serializePrinciple(p));

  // Calibration Log
  lines.push('## Calibration Log');
  lines.push('| Date | Company | Role | Score | Action | Delta | Lesson |');
  lines.push('|------|---------|------|-------|--------|-------|--------|');
  for (const e of ledger.calibrationLog) {
    lines.push(
      `| ${e.date} | ${e.company} | ${e.role} | ${e.score} | ${e.action} | ${e.delta} | ${e.lesson} |`,
    );
  }

  // Optimization History
  lines.push('## Optimization History');
  lines.push('| Date | Loop | Pass Rate Before | After | Changes | Approved |');
  lines.push('|------|------|-----------------|-------|---------|----------|');
  for (const e of ledger.optimizationHistory) {
    lines.push(
      `| ${e.date} | ${e.loop} | ${e.passRateBefore} | ${e.after} | ${e.changes} | ${e.approved} |`,
    );
  }

  return lines.join('\n') + '\n';
}
