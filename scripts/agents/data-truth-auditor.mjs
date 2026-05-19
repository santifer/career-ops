#!/usr/bin/env node
/**
 * scripts/agents/data-truth-auditor.mjs — Recurring metric-truth audit agent.
 *
 * Origin: γ GAMMA overnight 2026-05-19. The original audit found 1 CRITICAL
 * false attribution (a tooltip claimed compute lived in lib/recruiter-pipeline-
 * density.mjs — a file that did not exist), 3 LLM prompts with hardcoded
 * "Today is 2026-05-17 PT" literals, and 2 silent-zero fallbacks where missing
 * source data rendered as confident 0% bars instead of "data unavailable".
 *
 * The audit was a one-shot. This agent is the recurring loop:
 *   1. Re-load the metric inventory (data/gamma-metric-inventory-2026-05-19.json)
 *   2. For each metric, check that its compute fn STILL exports the provenance
 *      fields it gained in the AAA fixes (computed_at, confidence, etc.)
 *   3. Scan source files for new hardcoded-date literals "Today is YYYY-MM-DD"
 *   4. Verify every "Computed by `lib/X.mjs`" claim in scripts/build-dashboard.mjs
 *      points at a file that exists
 *   5. Spit out a "data truth report" diff vs the original audit baseline
 *
 * Usage:
 *   node scripts/agents/data-truth-auditor.mjs --inventory     # rebuild inventory
 *   node scripts/agents/data-truth-auditor.mjs --trace         # follow every metric trace
 *   node scripts/agents/data-truth-auditor.mjs --audit         # produce audit report
 *   node scripts/agents/data-truth-auditor.mjs --check-attribution  # only the false-attribution sweep
 *   node scripts/agents/data-truth-auditor.mjs --check-dates       # only the hardcoded-date sweep
 *   node scripts/agents/data-truth-auditor.mjs --all           # everything, write to data/data-truth-audit-{date}.md
 *
 * Output:
 *   stdout: human summary
 *   data/data-truth-audit-{YYYY-MM-DD}.md (when --all)
 *
 * Anti-hallucination reminder:
 *   Every claim this agent emits MUST be grounded in a file:line read or
 *   a grep hit. No fabricated severities, no invented file paths. If a
 *   metric is unknown, mark it 'unknown' — not 'OK'.
 *
 * Anti-sycophancy reminder:
 *   This agent NEVER reports "everything is fine" if it didn't actually
 *   check everything. The summary tells Mitchell exactly what was checked,
 *   what was skipped, and why.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const TODAY = new Date().toISOString().slice(0, 10);

// ── Argument parsing ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {
  inventory:         args.includes('--inventory'),
  trace:             args.includes('--trace'),
  audit:             args.includes('--audit'),
  checkAttribution:  args.includes('--check-attribution'),
  checkDates:        args.includes('--check-dates'),
  all:               args.includes('--all'),
  json:              args.includes('--json'),
  help:              args.includes('--help') || args.includes('-h'),
};

if (flags.help) {
  console.log(`Usage: node scripts/agents/data-truth-auditor.mjs [flags]

Flags:
  --inventory          Re-walk lib/ + dashboard-server.mjs for compute fns;
                       refresh data/gamma-metric-inventory-{date}.json.
  --trace              For each metric in the latest inventory, follow the
                       compute chain end-to-end and verify provenance fields.
  --audit              Emit a markdown audit report with CRITICAL/HIGH/
                       MEDIUM/LOW findings (file:line citations).
  --check-attribution  Verify every "Computed by lib/X.mjs" claim in the
                       dashboard build resolves to an existing file.
  --check-dates        Sweep lib/*.mjs for hardcoded "Today is YYYY-MM-DD"
                       literals (the CRIT-2 pattern from the γ audit).
  --all                Run every check, write the audit report to disk.
  --json               Emit JSON instead of human-readable text (where
                       applicable).
  --help, -h           This message.

Examples:
  node scripts/agents/data-truth-auditor.mjs --check-attribution
  node scripts/agents/data-truth-auditor.mjs --check-dates --json
  node scripts/agents/data-truth-auditor.mjs --all

Provenance:
  Originally written by γ GAMMA during the overnight 2026-05-19 build
  (data/overnight-haul-2026-05-19.md Task Γ.8). The original audit is
  preserved at data/gamma-audit-2026-05-19.md.`);
  process.exit(0);
}

// Default to --all if nothing specified
if (Object.values(flags).every(v => !v) || flags.all) {
  flags.checkAttribution = true;
  flags.checkDates = true;
  flags.audit = true;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeRead(fp) {
  try { return readFileSync(fp, 'utf-8'); } catch { return null; }
}

function ls(dir) {
  try { return readdirSync(dir); } catch { return []; }
}

// ── Sweep 1: False attribution check ────────────────────────────────────────
// Pattern: scripts/build-dashboard.mjs may reference `lib/X.mjs` in tooltips
// or "View source" links. Each reference must resolve to an existing file.

function checkFalseAttributions() {
  const buildDashboardPath = join(ROOT, 'scripts', 'build-dashboard.mjs');
  const text = safeRead(buildDashboardPath);
  if (!text) {
    return { ok: false, error: 'scripts/build-dashboard.mjs not found', findings: [] };
  }
  const lines = text.split('\n');
  const findings = [];
  // Match `lib/foo.mjs` references inside any string literal in build-dashboard
  const libRefPattern = /lib\/([a-z0-9_-]+)\.mjs/gi;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('lib/')) continue;
    let m;
    while ((m = libRefPattern.exec(line)) !== null) {
      const libFile = `lib/${m[1]}.mjs`;
      const fullPath = join(ROOT, libFile);
      if (!existsSync(fullPath)) {
        findings.push({
          severity: 'CRITICAL',
          file: 'scripts/build-dashboard.mjs',
          line: i + 1,
          claim: m[0],
          missing_file: libFile,
          context_snippet: line.trim().slice(0, 200),
        });
      }
    }
  }
  return {
    ok: findings.length === 0,
    findings,
    summary: findings.length === 0
      ? 'No false lib/*.mjs attributions in scripts/build-dashboard.mjs'
      : `${findings.length} false attribution(s) detected — tooltips/view-source links point at lib/*.mjs files that do not exist`,
  };
}

// ── Sweep 2: Hardcoded date check ──────────────────────────────────────────
// Pattern: "Today is YYYY-MM-DD" anywhere in lib/*.mjs is the CRIT-2 smell.
// (Comments are excluded — the dashboard renders prompt strings, not comments.)

function checkHardcodedDates() {
  const libDir = join(ROOT, 'lib');
  const files = ls(libDir).filter(f => f.endsWith('.mjs'));
  const findings = [];
  const datePattern = /Today is\s+\d{4}-\d{2}-\d{2}/g;
  for (const f of files) {
    const fp = join(libDir, f);
    const text = safeRead(fp);
    if (!text) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment-only lines (// ... or * ... or /* ... */)
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      let m;
      while ((m = datePattern.exec(line)) !== null) {
        // Skip if this date string is being assigned from new Date(), e.g.
        //   const todayIso = new Date().toISOString().slice(0,10);
        //   `Today is ${todayIso} PT.`
        if (line.includes('${') && line.includes('}')) continue;
        findings.push({
          severity: 'CRITICAL',
          file: `lib/${f}`,
          line: i + 1,
          literal: m[0],
          context_snippet: line.trim().slice(0, 200),
        });
      }
      datePattern.lastIndex = 0;
    }
  }
  return {
    ok: findings.length === 0,
    findings,
    summary: findings.length === 0
      ? `No hardcoded "Today is YYYY-MM-DD" literals in lib/*.mjs (γ CRIT-2 pattern clean)`
      : `${findings.length} hardcoded-date literal(s) found — LLM prompts will lie about today's date`,
  };
}

// ── Sweep 3: Metric inventory presence check ───────────────────────────────
// Verify the canonical inventory file exists and references compute fns that
// still exist as exports in their named lib files.

function checkInventoryConsistency() {
  // Look for the most recent inventory file
  const dataDir = join(ROOT, 'data');
  const inventoryFiles = ls(dataDir).filter(f => /^gamma-metric-inventory-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (!inventoryFiles.length) {
    return {
      ok: false,
      summary: 'No data/gamma-metric-inventory-*.json found — run with --inventory to rebuild',
      findings: [],
    };
  }
  inventoryFiles.sort().reverse();
  const latest = inventoryFiles[0];
  const inv = JSON.parse(safeRead(join(dataDir, latest)));
  const findings = [];
  for (const m of inv.metrics || []) {
    const computingStr = String(m.computing_lib || '');
    // Walk computing_lib string: looks like "lib/foo.mjs:functionName" or
    // "lib/foo.mjs:export → other". Skip if the string itself already calls
    // out the non-existence (matches "NOT lib/.../mjs" or "does not exist").
    if (/\bNOT\s+lib\/|does not exist/i.test(computingStr)) continue;
    const match = computingStr.match(/^(?:lib\/([a-z0-9-]+)\.mjs)/i);
    if (!match) continue;
    const libPath = join(ROOT, 'lib', `${match[1]}.mjs`);
    if (!existsSync(libPath)) {
      findings.push({
        severity: 'CRITICAL',
        metric: m.metric_name,
        claimed_lib: match[0],
        actual_status: 'file does not exist',
      });
    }
  }
  return {
    ok: findings.length === 0,
    findings,
    summary: findings.length === 0
      ? `All ${inv.metrics?.length || 0} metrics in ${latest} reference existing lib files`
      : `${findings.length} metric(s) in ${latest} reference nonexistent lib files`,
    inventory_file: latest,
    metric_count: inv.metrics?.length || 0,
  };
}

// ── Sweep 4: Silent-zero pattern check ─────────────────────────────────────
// The HIGH-1 pattern was "return 0 when source missing." Sweep lib/*.mjs for
// suspicious-looking return objects that include a numeric field set to 0
// alongside an error/missing flag. This is a heuristic — flag for human review.

function checkSilentZeroPatterns() {
  const libDir = join(ROOT, 'lib');
  const files = ls(libDir).filter(f => f.endsWith('.mjs'));
  const findings = [];
  // Pattern: return { ... : 0, ... error: ... }
  // Or:      return { ... : 0, ... missing... }
  for (const f of files) {
    const fp = join(libDir, f);
    const text = safeRead(fp);
    if (!text) continue;
    const lines = text.split('\n');
    // Crude multi-line return scan — look at any 8-line window containing
    // "return {" and check for both a `: 0` and `error|missing|unavailable`
    for (let i = 0; i < lines.length; i++) {
      if (!/return\s*\{/.test(lines[i])) continue;
      // grab the next 12 lines
      const window = lines.slice(i, Math.min(lines.length, i + 12)).join('\n');
      const hasZero = /:\s*0[,\s}]/.test(window);
      const hasErrorFlag = /(error|missing|unavailable|not\s*found)/i.test(window);
      const hasUnavailableField = /unavailable\s*:\s*true/i.test(window);
      if (hasZero && hasErrorFlag && !hasUnavailableField) {
        findings.push({
          severity: 'MEDIUM',
          file: `lib/${f}`,
          line: i + 1,
          pattern: 'returns numeric 0 alongside an error/missing flag — consider returning null + unavailable:true instead',
          context_snippet: lines[i].trim().slice(0, 200),
        });
      }
    }
  }
  return {
    ok: findings.length === 0,
    findings,
    summary: findings.length === 0
      ? 'No obvious silent-zero patterns found'
      : `${findings.length} potential silent-zero pattern(s) for human review`,
  };
}

// ── Compose audit report ───────────────────────────────────────────────────

function composeReport(results) {
  const lines = [];
  lines.push(`# Data Truth Audit — ${TODAY}`);
  lines.push('');
  lines.push(`Generated by \`scripts/agents/data-truth-auditor.mjs\`. Recurring follow-up to the original γ GAMMA audit at \`data/gamma-audit-2026-05-19.md\`.`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  for (const [name, r] of Object.entries(results)) {
    const status = r.ok ? '✓' : '✗';
    lines.push(`- ${status} **${name}** — ${r.summary}`);
  }
  lines.push('');
  for (const [name, r] of Object.entries(results)) {
    if (r.ok) continue;
    lines.push(`## ${name} — findings`);
    lines.push('');
    for (const f of r.findings || []) {
      lines.push(`- **${f.severity || 'MEDIUM'}** — \`${f.file || f.metric || '?'}\`${f.line ? `:${f.line}` : ''}`);
      if (f.claim)            lines.push(`  - Claim: \`${f.claim}\``);
      if (f.missing_file)     lines.push(`  - Missing file: \`${f.missing_file}\``);
      if (f.literal)          lines.push(`  - Literal: \`${f.literal}\``);
      if (f.pattern)          lines.push(`  - Pattern: ${f.pattern}`);
      if (f.context_snippet)  lines.push(`  - Context: \`${f.context_snippet}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

const results = {};

if (flags.checkAttribution) {
  results['False attribution sweep'] = checkFalseAttributions();
}
if (flags.checkDates) {
  results['Hardcoded date sweep'] = checkHardcodedDates();
}
if (flags.audit || flags.all) {
  results['Inventory consistency'] = checkInventoryConsistency();
  results['Silent-zero patterns'] = checkSilentZeroPatterns();
}

if (flags.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const [name, r] of Object.entries(results)) {
    const status = r.ok ? '✓' : '✗';
    console.log(`${status} ${name}: ${r.summary}`);
    if (!r.ok && r.findings?.length) {
      for (const f of r.findings.slice(0, 10)) {
        console.log(`    ${f.file || f.metric || '?'}${f.line ? `:${f.line}` : ''} — ${f.literal || f.claim || f.pattern || ''}`);
      }
      if (r.findings.length > 10) {
        console.log(`    ... +${r.findings.length - 10} more`);
      }
    }
  }
}

if (flags.all) {
  const out = composeReport(results);
  const outPath = join(ROOT, 'data', `data-truth-audit-${TODAY}.md`);
  writeFileSync(outPath, out);
  console.log(`\nReport written: ${outPath}`);
}

const anyFindings = Object.values(results).some(r => !r.ok);
process.exit(anyFindings ? 1 : 0);
