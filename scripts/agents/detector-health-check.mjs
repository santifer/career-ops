#!/usr/bin/env node
/**
 * scripts/agents/detector-health-check.mjs
 *
 * DELTA δ.NH.2 (2026-05-19) — Weekly detector-health check.
 *
 * Runs each configured detector against one known-Mitchell canonical exemplar.
 * Compares results vs prior snapshot. Writes a dated snapshot to:
 *   data/detector-health-<YYYY-MM-DD>.md
 *
 * On any USELESS ↔ non-USELESS flip (signal quality change), appends an alert to
 *   data/overnight-coordination-2026-05-19.md  (or the most recent coordination doc)
 * and logs to stdout.
 *
 * Schedule: Sunday 08:00 PT via launchd
 *   scripts/launchd/com.mitchell.career-ops.detector-health.plist
 *
 * Usage:
 *   node scripts/agents/detector-health-check.mjs            # weekly run
 *   node scripts/agents/detector-health-check.mjs --force    # force even if ran today
 *   node scripts/agents/detector-health-check.mjs --dry-run  # print what would run, no API calls
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env'), override: true });
} catch { /* dotenv optional */ }

const ARGV = new Set(process.argv.slice(2));
const FORCE = ARGV.has('--force');
const DRY_RUN = ARGV.has('--dry-run');

const today = new Date().toISOString().slice(0, 10);
const OUT_PATH = join(ROOT, 'data', `detector-health-${today}.md`);

// ── Canonical exemplar (known-Mitchell prose — highest confidence) ─────────
// Read from the voice-reference.md file directly to avoid importing the
// calibrator's full dependency chain.
const EXEMPLAR_PATH = join(ROOT, 'writing-samples', 'voice-reference.md');
const EXEMPLAR_SECTION = 'Canonical Exemplar';

function loadExemplar() {
  if (!existsSync(EXEMPLAR_PATH)) {
    // Fall back to sample-01 from human-examples
    const alt = join(ROOT, 'data', 'human-examples', 'sample-01-comms-triage-agent-google-xge.md');
    if (existsSync(alt)) {
      const raw = readFileSync(alt, 'utf-8');
      // Strip frontmatter
      const stripped = raw.replace(/^---[\s\S]*?---\n/, '').trim();
      return { text: stripped.slice(0, 3000), source: 'data/human-examples/sample-01' };
    }
    throw new Error('No exemplar file found. Expected writing-samples/voice-reference.md or data/human-examples/sample-01-comms-triage-agent-google-xge.md');
  }
  const raw = readFileSync(EXEMPLAR_PATH, 'utf-8');
  // Extract the Canonical Exemplar section
  const lines = raw.split('\n');
  let start = -1;
  let stopLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (!m) continue;
    if (m[2].includes(EXEMPLAR_SECTION)) {
      start = i + 1;
      stopLevel = m[1].length;
      break;
    }
  }
  let text;
  if (start === -1) {
    text = raw.slice(0, 3000);
  } else {
    const out = [];
    for (let i = start; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+/);
      if (m && m[1].length <= stopLevel) break;
      out.push(lines[i]);
    }
    text = out.join('\n').slice(0, 3000);
  }
  return { text: text.trim(), source: 'writing-samples/voice-reference.md §Canonical Exemplar' };
}

// ── Detector calls (inline — avoids importing full gate during health check) ─
async function callGPTZero(text) {
  const key = process.env.GPTZERO_API_KEY;
  if (!key) return { skipped: true, reason: 'no key', prob: null, signal: 'UNCONFIGURED' };
  try {
    const r = await fetch('https://api.gptzero.me/v2/predict/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ document: text.slice(0, 5000), multilingual: false }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const prob = d?.documents?.[0]?.completely_generated_prob ?? null;
    return { skipped: false, prob, raw: { doc: d?.documents?.[0] } };
  } catch (e) {
    return { skipped: false, prob: null, error: e.message };
  }
}

async function callOriginalityAI(text) {
  const key = process.env.ORIGINALITY_API_KEY;
  if (!key) return { skipped: true, reason: 'no key', prob: null, signal: 'UNCONFIGURED' };
  try {
    const r = await fetch('https://api.originality.ai/api/v1/scan/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OAI-API-KEY': key },
      body: JSON.stringify({ content: text.slice(0, 5000), aiModelVersion: '1' }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const prob = d.score?.ai ?? null;
    return { skipped: false, prob, raw: { score: d.score } };
  } catch (e) {
    return { skipped: false, prob: null, error: e.message };
  }
}

async function callPangram(text) {
  const key = process.env.PANGRAM_API_KEY;
  if (!key) return { skipped: true, reason: 'no key', prob: null, signal: 'UNCONFIGURED' };
  try {
    const r = await fetch('https://api.pangram.com/v1/classify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 5000) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const fAI = d.fraction_ai ?? null;
    const fAst = d.fraction_ai_assisted ?? null;
    const prob = (fAI === null && fAst === null) ? null : Math.round(((fAI ?? 0) + 0.5 * (fAst ?? 0)) * 100) / 100;
    return { skipped: false, prob, raw: { fraction_ai: fAI, fraction_ai_assisted: fAst, headline: d.headline } };
  } catch (e) {
    return { skipped: false, prob: null, error: e.message };
  }
}

// ── Signal quality classification ────────────────────────────────────────────
// Simplified: compare to baseline thresholds. For health-check purposes we
// classify based only on the prob returned for the known-Mitchell exemplar.
// A prob < 0.5 from the canonical exemplar = likely-GOOD (detector doesn't
// false-positive on Mitchell's voice). A prob ≥ 0.5 = likely-USELESS or worse.
function classifyHealth(result) {
  if (result.skipped) return 'SKIPPED';
  if (result.error) return 'ERROR';
  if (result.prob === null) return 'NO_SCORE';
  if (result.prob < 0.3) return 'LIKELY_GOOD';
  if (result.prob < 0.5) return 'LIKELY_WEAK';
  if (result.prob < 0.8) return 'LIKELY_USELESS';
  return 'FLAGGING_AUTHENTIC_PROSE'; // prob ≥ 0.8 on known-human text = serious false-positive
}

// ── Load prior snapshot ───────────────────────────────────────────────────────
function loadPriorSnapshot() {
  const dataDir = join(ROOT, 'data');
  try {
    const files = readdirSync(dataDir)
      .filter(f => /^detector-health-\d{4}-\d{2}-\d{2}\.md$/.test(f) && f !== `detector-health-${today}.md`)
      .sort()
      .reverse();
    if (!files.length) return null;
    const raw = readFileSync(join(dataDir, files[0]), 'utf-8');
    // Parse health status from the markdown table
    const lines = raw.split('\n');
    const prior = {};
    for (const line of lines) {
      const m = line.match(/^\|\s*(\w+)\s*\|\s*[^|]+\|\s*(\w+)\s*\|/);
      if (m) prior[m[1].toUpperCase()] = m[2].toUpperCase();
    }
    return { file: files[0], health: prior };
  } catch { return null; }
}

// ── Alert helper ──────────────────────────────────────────────────────────────
function appendAlert(detector, from, to) {
  const coordPaths = [
    join(ROOT, 'data', 'overnight-coordination-2026-05-19.md'),
  ];
  const alertLine = `\n## DETECTOR-HEALTH ALERT — ${today}\n\n` +
    `- **Detector:** ${detector}\n` +
    `- **Change:** ${from} → ${to}\n` +
    `- **Action required:** Review \`data/detector-health-${today}.md\` and update \`.env\` / \`lib/ai-detection-gate.mjs\` as needed.\n` +
    `- **Logged by:** \`scripts/agents/detector-health-check.mjs\` via launchd\n`;
  for (const p of coordPaths) {
    if (existsSync(p)) {
      try {
        const existing = readFileSync(p, 'utf-8');
        writeFileSync(p, existing + alertLine, 'utf-8');
        console.log(`[detector-health] Alert appended to ${p}`);
        return;
      } catch { /* try next */ }
    }
  }
  // No coordination doc found — write to a standalone alert file
  const alertPath = join(ROOT, 'data', `detector-health-alert-${today}.md`);
  writeFileSync(alertPath, `# Detector Health Alert\n${alertLine}`, 'utf-8');
  console.log(`[detector-health] Alert written to ${alertPath}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  if (!FORCE && existsSync(OUT_PATH)) {
    console.log(`[detector-health] Snapshot for ${today} already exists. Use --force to re-run.`);
    return;
  }

  console.log(`[detector-health] Running health check for ${today}`);

  let exemplar;
  try { exemplar = loadExemplar(); }
  catch (e) { console.error(`[detector-health] FATAL: ${e.message}`); process.exitCode = 1; return; }
  console.log(`[detector-health] Exemplar loaded from ${exemplar.source} (${exemplar.text.length} chars)`);

  if (DRY_RUN) {
    console.log('[detector-health] DRY RUN — skipping API calls');
    console.log('  Would call: GPTZero, Originality.AI, Pangram');
    console.log('  Output path:', OUT_PATH);
    return;
  }

  console.log('[detector-health] Calling detectors (parallel)...');
  const [gz, orig, pang] = await Promise.allSettled([
    callGPTZero(exemplar.text),
    callOriginalityAI(exemplar.text),
    callPangram(exemplar.text),
  ]);

  const results = {
    GPTZERO:      gz.status      === 'fulfilled' ? gz.value      : { prob: null, error: String(gz.reason?.message || gz.reason) },
    ORIGINALITY:  orig.status    === 'fulfilled' ? orig.value    : { prob: null, error: String(orig.reason?.message || orig.reason) },
    PANGRAM:      pang.status    === 'fulfilled' ? pang.value    : { prob: null, error: String(pang.reason?.message || pang.reason) },
  };

  const healthNow = {};
  for (const [det, res] of Object.entries(results)) {
    healthNow[det] = classifyHealth(res);
  }

  // Compare to prior snapshot — alert on USELESS ↔ non-USELESS flips
  const prior = loadPriorSnapshot();
  const flips = [];
  if (prior) {
    for (const det of Object.keys(healthNow)) {
      const was = prior.health?.[det] || 'UNKNOWN';
      const now = healthNow[det];
      const wasUseless = was.includes('USELESS') || was === 'UNKNOWN';
      const nowUseless = now.includes('USELESS') || now === 'FLAGGING_AUTHENTIC_PROSE';
      if (wasUseless !== nowUseless) {
        flips.push({ det, from: was, to: now });
        console.log(`[detector-health] FLIP DETECTED: ${det} ${was} → ${now}`);
        appendAlert(det, was, now);
      }
    }
  }

  // Write snapshot
  const lines = [
    `# Detector Health Snapshot — ${today}`,
    '',
    `**Exemplar source:** ${exemplar.source}`,
    `**Prior snapshot:** ${prior ? prior.file : 'none (first run)'}`,
    `**Flips detected:** ${flips.length > 0 ? flips.map(f => `${f.det}: ${f.from}→${f.to}`).join(', ') : 'none'}`,
    '',
    '## Results',
    '',
    '| Detector | Prob (on Mitchell exemplar) | Health Status | Note |',
    '|---|---|---|---|',
  ];

  for (const [det, res] of Object.entries(results)) {
    const prob = res.prob !== null ? res.prob.toFixed(3) : (res.error ? `ERROR: ${res.error.slice(0, 50)}` : 'n/a');
    const health = healthNow[det];
    const note = res.skipped ? `skipped (${res.reason})` : (res.error ? 'API error' : '');
    lines.push(`| ${det} | ${prob} | ${health} | ${note} |`);
  }

  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push('- **LIKELY_GOOD:** prob < 0.3 on authentic Mitchell prose — detector NOT false-positiving on his voice.');
  lines.push('- **LIKELY_WEAK:** prob 0.3-0.5 — borderline, monitor next week.');
  lines.push('- **LIKELY_USELESS:** prob 0.5-0.8 — detector is producing false positives on authentic prose.');
  lines.push('- **FLAGGING_AUTHENTIC_PROSE:** prob ≥ 0.8 — detector flagging Mitchell\'s known-human writing as AI (= 2026-05-19 baseline state for GPTZero + Originality).');
  lines.push('- **SKIPPED:** API key not configured in .env.');
  lines.push('- **ERROR:** API call failed.');
  lines.push('');
  lines.push('## Action guide');
  lines.push('');
  lines.push('- Any flip from LIKELY_GOOD/WEAK → LIKELY_USELESS/FLAGGING: detector may have updated its model. Re-run calibrator: `node scripts/ai-detection-calibrate-baseline.mjs --refresh`');
  lines.push('- Any flip from LIKELY_USELESS/FLAGGING → LIKELY_GOOD/WEAK: detector improved! Re-run calibrator to unlock new thresholds and the 3-stage retry pipeline.');
  lines.push('- PANGRAM SKIPPED: get API key at https://www.pangram.com/solutions/api and add PANGRAM_API_KEY to .env');
  lines.push('');
  lines.push(`*Generated by \`scripts/agents/detector-health-check.mjs\` at ${new Date().toISOString()}*`);

  writeFileSync(OUT_PATH, lines.join('\n'), 'utf-8');
  console.log(`[detector-health] Snapshot written to ${OUT_PATH}`);

  // Print summary
  for (const [det, res] of Object.entries(results)) {
    const prob = res.prob !== null ? res.prob.toFixed(3) : 'n/a';
    console.log(`  ${det}: prob=${prob} health=${healthNow[det]}`);
  }

  if (flips.length > 0) {
    console.log(`\n[detector-health] ${flips.length} flip(s) detected — alerts written`);
  } else {
    console.log('[detector-health] No flips — all detectors stable');
  }
}

run().catch(e => { console.error('[detector-health] FATAL:', e); process.exitCode = 1; });
