#!/usr/bin/env node

/**
 * auto-pipeline.mjs — Full auto-pipeline orchestrator
 *
 * Reads unchecked entries from pipeline.md, applies pre-LLM gates,
 * feeds qualifying roles into the batch evaluator, generates cover
 * letters for high scorers (≥4.0), and sends a Telegram summary.
 *
 * Usage:
 *   node auto-pipeline.mjs                  # full pipeline
 *   node auto-pipeline.mjs --prepare-only   # just write batch-input.tsv, don't run
 *   node auto-pipeline.mjs --cover-letters  # only generate CLs for existing high-scoring reports
 *   node auto-pipeline.mjs --notify         # only send Telegram results digest
 *   node auto-pipeline.mjs --dry-run        # show what would be processed
 *   node auto-pipeline.mjs --max N          # limit to N roles (default: 10)
 *   node auto-pipeline.mjs --sync           # pull pipeline.md from CT 203 first
 *
 * Requires:
 *   - claude CLI in PATH (for batch evaluation + cover letter generation)
 *   - .env with TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (for notifications)
 *
 * Flow:
 *   1. Read pipeline.md → filter unchecked entries
 *   2. Apply pre-LLM gates (location keywords, title filter)
 *   3. Write batch-input.tsv with qualifying URLs
 *   4. Run batch-runner.sh (evaluates via claude -p)
 *   5. Read completed evaluations → for score ≥ 4.0, generate cover letter
 *   6. Send Telegram digest with results
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { join, resolve } from 'path';

const PROJECT_DIR = resolve(import.meta.dirname || '.');
const PIPELINE_PATH = join(PROJECT_DIR, 'data/pipeline.md');
const BATCH_INPUT = join(PROJECT_DIR, 'batch/batch-input.tsv');
const BATCH_STATE = join(PROJECT_DIR, 'batch/batch-state.tsv');
const REPORTS_DIR = join(PROJECT_DIR, 'reports');
const OUTPUT_DIR = join(PROJECT_DIR, 'output');
const TRACKER_DIR = join(PROJECT_DIR, 'batch/tracker-additions');
const COVER_LETTERS_DIR = join(PROJECT_DIR, 'output/cover-letters');

// ── Config ───────────────────────────────────────────────────────────────

function readEnv(path = join(PROJECT_DIR, '.env')) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

// ── Location gate ─────────���──────────────────────────────────────────────

// Non-Denver cities — if the title explicitly names one of these (in parens
// or after a pipe/dash), it's a non-Denver on-site role. Denver/Remote pass.
const NON_DENVER_CITIES = [
  'san francisco', 'sf', 'nyc', 'new york', 'seattle', 'austin', 'boston',
  'chicago', 'los angeles', 'la', 'london', 'berlin', 'paris', 'tokyo',
  'munich', 'amsterdam', 'warsaw', 'palo alto', 'menlo park', 'sunnyvale',
  'mountain view', 'cupertino', 'redwood city', 'foster city',
  'livingston', 'kenilworth', 'bellevue', 'kirkland',
  'portland', 'atlanta', 'miami', 'phoenix', 'salt lake city',
  'raleigh', 'charlotte', 'dallas', 'houston',
  'washington', 'dc', 'd.c.', 'arlington',
  'toronto', 'vancouver', 'montreal',
  'hyderabad', 'bangalore', 'mumbai', 'india', 'gurugram',
  'uk', 'germany', 'france', 'japan', 'qatar', 'doha',
  'europe', 'apac', 'emea', 'apj',
  'argentina', 'brazil', 'israel', 'singapore', 'australia',
  'florida', 'new jersey', 'nj', 'virginia',
];

// Build regex: match city names in parens, after |, or at end
const cityPattern = new RegExp(
  `(?:\\(|\\||,|—|–|-)\\s*(?:${NON_DENVER_CITIES.join('|')})`,
  'i'
);

function locationGate(title, company) {
  const combined = `${title}`;

  // If it says Denver or Remote explicitly, always pass
  if (/denver|remote|distributed|anywhere|united states remote/i.test(combined)) return 'pass';

  // If it names a non-Denver city in the title, skip
  if (cityPattern.test(combined)) return 'skip-location';

  // Special: "US-XX-" pattern (like US-CA-Remote) — check if it has a state
  const stateMatch = combined.match(/US-([A-Z]{2})/);
  if (stateMatch && stateMatch[1] !== 'CO') {
    // Non-Colorado state... but might be remote
    if (/remote/i.test(combined)) return 'pass';
    return 'skip-location';
  }

  // No location signal — assume it could be remote (eval will verify)
  return 'pass';
}

// ── Title pre-filter (mirrors scan.mjs positive/negative) ────────────────

// Negative keywords — mirrors portals.yml negatives + Patrick-specific exclusions
const TITLE_NEGATIVES = [
  /machine learning/i, /\bml engineer/i, /\bml scientist/i, /\bml researcher/i,
  /research scientist/i, /research engineer/i, /data scientist/i, /data analyst/i,
  /\bmlops\b/i, /nlp engineer/i, /computer vision/i, /deep learning/i,
  /product manager/i, /program manager/i, /\bvp\b/i, /vice president/i,
  /\bchief\b/i, /partner development/i, /partnerships manager/i, /business development/i,
  /\bgtm\b/i, /frontend/i, /front-end/i, /\bui engineer/i, /\bux\b/i,
  /\bintern\b/i, /working student/i, /\bjunior\b/i,
];

function titleGate(title) {
  for (const pat of TITLE_NEGATIVES) {
    if (pat.test(title)) return 'skip-title';
  }
  return 'pass';
}

// ── Pipeline reader ──────────────────────────────────────────────────────

const SCAN_HISTORY_PATH = join(PROJECT_DIR, 'data/scan-history.tsv');

/**
 * Read today's new scan results from scan-history.tsv.
 * This is the primary source — only processes roles that came in TODAY
 * (or a specified date), not the entire historical pipeline.
 */
function readTodaysScanResults(targetDate) {
  if (!existsSync(SCAN_HISTORY_PATH)) return [];

  return readFileSync(SCAN_HISTORY_PATH, 'utf-8')
    .split('\n')
    .slice(1) // skip header
    .filter(Boolean)
    .map(line => {
      const [url, first_seen, portal, title, company] = line.split('\t');
      return { url, first_seen, portal, title: (title || '').trim(), company: (company || '').trim() };
    })
    .filter(r => r.first_seen === targetDate && r.url && r.title);
}

/**
 * Fallback: read the full pipeline.md (all unchecked entries regardless of date).
 * Used with --all flag for catch-up processing.
 */
function readFullPipeline() {
  if (!existsSync(PIPELINE_PATH)) return [];

  const content = readFileSync(PIPELINE_PATH, 'utf-8');
  const entries = [];

  for (const line of content.split('\n')) {
    const m = line.match(/^- \[ \] (.+?) \| (.+?) \| (.+)$/);
    if (m) {
      entries.push({
        url: m[1].trim(),
        company: m[2].trim(),
        title: m[3].trim(),
      });
    }
  }

  return entries;
}

// ── Already-processed detection ──────────────────────────────────────────

function getProcessedUrls() {
  const processed = new Set();

  // Check batch-state.tsv for already-processed URLs
  if (existsSync(BATCH_STATE)) {
    const lines = readFileSync(BATCH_STATE, 'utf-8').split('\n').slice(1);
    for (const line of lines) {
      const [, url, status] = line.split('\t');
      if (url && (status === 'completed' || status === 'skipped')) {
        processed.add(url);
      }
    }
  }

  // Check existing reports for URLs
  if (existsSync(REPORTS_DIR)) {
    for (const file of readdirSync(REPORTS_DIR)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(join(REPORTS_DIR, file), 'utf-8');
      const urlMatch = content.match(/\*\*URL:\*\*\s*(.+)/);
      if (urlMatch) processed.add(urlMatch[1].trim());
    }
  }

  return processed;
}

// ── Batch input writer ───────────────────────────────────────────────────

function writeBatchInput(entries) {
  mkdirSync(join(PROJECT_DIR, 'batch'), { recursive: true });

  let tsv = 'id\turl\tsource\tnotes\n';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    tsv += `${i + 1}\t${e.url}\t${e.company}\t${e.title}\n`;
  }

  writeFileSync(BATCH_INPUT, tsv);
  return entries.length;
}

// ── Cover letter generator ───────────────────────────────────────────────

function getHighScoringReports(minScore = 4.0) {
  if (!existsSync(REPORTS_DIR)) return [];

  const reports = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const file of readdirSync(REPORTS_DIR)) {
    if (!file.endsWith('.md')) continue;

    const content = readFileSync(join(REPORTS_DIR, file), 'utf-8');

    // Extract score
    const scoreMatch = content.match(/\*\*Score:\*\*\s*([0-9.]+)\/5/);
    if (!scoreMatch) continue;
    const score = parseFloat(scoreMatch[1]);
    if (score < minScore) continue;

    // Extract company and role
    const headerMatch = content.match(/# (?:Evaluation|Evaluación):\s*(.+?)\s*[—–-]\s*(.+)/);
    if (!headerMatch) continue;

    // Extract URL
    const urlMatch = content.match(/\*\*URL:\*\*\s*(.+)/);

    // Check if cover letter already exists
    const company = headerMatch[1].trim();
    const role = headerMatch[2].trim();
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const clPath = join(COVER_LETTERS_DIR, `cl-${slug}-${today}.md`);

    if (existsSync(clPath)) continue; // already generated

    reports.push({
      file,
      score,
      company,
      role,
      url: urlMatch ? urlMatch[1].trim() : '',
      slug,
      reportPath: join(REPORTS_DIR, file),
    });
  }

  return reports.sort((a, b) => b.score - a.score);
}

function generateCoverLetter(report, dryRun = false) {
  mkdirSync(COVER_LETTERS_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const outputPath = join(COVER_LETTERS_DIR, `cl-${report.slug}-${today}.md`);

  if (dryRun) {
    console.log(`  [dry-run] Would generate CL for ${report.company} — ${report.role} (${report.score}/5)`);
    return null;
  }

  const prompt = `Generate a cover letter for Patrick Moore for this role:
Company: ${report.company}
Role: ${report.role}
URL: ${report.url}

Read the evaluation report at: ${report.reportPath}
Read cv.md for proof points.
Read article-digest.md for detailed proof points.
Read modes/_profile.md "Writing Style" section for voice rules.
Read modes/cover-letter.md for the full cover letter mode instructions.

Output ONLY the cover letter in the format specified in modes/cover-letter.md.
Save it to: ${outputPath}

IMPORTANT: Follow Patrick's voice rules EXACTLY. No corporate speak. No "leveraging."
Short punchy sentences. Concrete specifics. Casual confidence. 200-300 words max.`;

  try {
    console.log(`  Generating CL: ${report.company} — ${report.role} (${report.score}/5)...`);
    execSync(`claude -p --dangerously-skip-permissions "${prompt.replace(/"/g, '\\"')}"`, {
      cwd: PROJECT_DIR,
      timeout: 120000, // 2 min per cover letter
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (existsSync(outputPath)) {
      console.log(`  ✅ Cover letter saved: ${outputPath}`);
      return outputPath;
    } else {
      console.log(`  ⚠️  CL generation completed but file not found at ${outputPath}`);
      return null;
    }
  } catch (err) {
    console.error(`  ❌ CL generation failed for ${report.company}: ${err.message?.slice(0, 100)}`);
    return null;
  }
}

// ── Telegram notification ────────────────────────────────────────────────

async function sendResultsDigest(results, dryRun = false) {
  const env = readEnv();
  const TOKEN = env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

  if (!TOKEN || !CHAT_ID) {
    console.log('  No Telegram credentials — skipping notification.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const highScorers = results.filter(r => r.score >= 4.0);
  const midScorers = results.filter(r => r.score >= 3.0 && r.score < 4.0);
  const skipped = results.filter(r => r.score < 3.0 || r.status === 'skipped');

  let msg = `<b>🎯 auto-pipeline results · ${today}</b>\n`;
  msg += `${results.length} evaluated`;
  if (highScorers.length > 0) msg += ` · <b>${highScorers.length} high-fit</b>`;
  msg += '\n━━━━━━━━━━━━━━━━━━━━━━\n';

  if (highScorers.length > 0) {
    msg += '\n🟢 <b>HIGH FIT (≥4.0) — CV + CL generated</b>\n';
    for (const r of highScorers) {
      msg += `• <b>${r.company}</b> — ${r.role}\n`;
      msg += `  Score: ${r.score}/5`;
      if (r.coverLetter) msg += ' · CL ✅';
      if (r.pdf) msg += ' · PDF ✅';
      msg += '\n';
    }
  }

  if (midScorers.length > 0) {
    msg += '\n🟡 <b>MAYBE (3.0–3.9)</b>\n';
    for (const r of midScorers.slice(0, 5)) {
      msg += `• ${r.company} — ${r.role} (${r.score}/5)\n`;
    }
    if (midScorers.length > 5) msg += `  <i>+${midScorers.length - 5} more</i>\n`;
  }

  if (skipped.length > 0) {
    msg += `\n⚪ ${skipped.length} below threshold or skipped\n`;
  }

  msg += '\n<i>Review artifacts in output/cover-letters/</i>';

  if (dryRun) {
    console.log('\n── Results digest (dry run) ──\n');
    console.log(msg);
    return;
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: msg,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    console.log('  ✓ Results digest sent to Telegram');
  } catch (err) {
    console.error(`  ❌ Telegram send failed: ${err.message}`);
  }
}

// ── Sync from CT 203 ─────────────────────────────────────────────────────

function syncFromScanner() {
  console.log('Syncing pipeline.md from CT 203...');
  try {
    execSync('scp root@10.1.30.50:/opt/career-ops/data/pipeline.md data/pipeline.md', {
      cwd: PROJECT_DIR,
      timeout: 15000,
      stdio: 'pipe',
    });
    execSync('scp root@10.1.30.50:/opt/career-ops/data/scan-history.tsv data/scan-history.tsv', {
      cwd: PROJECT_DIR,
      timeout: 15000,
      stdio: 'pipe',
    });
    console.log('  ✓ Synced from scanner');
  } catch (err) {
    console.error(`  ⚠️  Sync failed (continuing with local data): ${err.message?.slice(0, 80)}`);
  }
}

// ── Run batch evaluation ─────────────────────────────────────────────────

function runBatchEvaluation(dryRun = false) {
  const batchRunner = join(PROJECT_DIR, 'batch/batch-runner.sh');

  if (dryRun) {
    console.log('\n[dry-run] Would run: batch-runner.sh');
    return [];
  }

  console.log('\nRunning batch evaluation...');
  try {
    const output = execSync(`bash "${batchRunner}"`, {
      cwd: PROJECT_DIR,
      timeout: 600000, // 10 min max for batch
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(output);
  } catch (err) {
    console.error(`Batch runner error: ${err.message?.slice(0, 200)}`);
  }

  // Read results from batch-state.tsv
  if (!existsSync(BATCH_STATE)) return [];

  return readFileSync(BATCH_STATE, 'utf-8')
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map(line => {
      const [id, url, status, , , reportNum, score] = line.split('\t');
      return { id, url, status, reportNum, score: parseFloat(score) || 0 };
    });
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const prepareOnly = args.includes('--prepare-only');
  const coverLettersOnly = args.includes('--cover-letters');
  const notifyOnly = args.includes('--notify');
  const doSync = args.includes('--sync');
  const useAll = args.includes('--all'); // process full pipeline, not just today
  const maxIdx = args.indexOf('--max');
  const maxRoles = maxIdx !== -1 ? parseInt(args[maxIdx + 1]) : 10;
  const dateIdx = args.indexOf('--date');
  const targetDate = dateIdx !== -1 ? args[dateIdx + 1] : new Date().toISOString().slice(0, 10);

  console.log('═══════════════════════════════════════════');
  console.log(' career-ops AUTO-PIPELINE');
  console.log(`═══════════════════════════════════════════`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : coverLettersOnly ? 'COVER LETTERS ONLY' : notifyOnly ? 'NOTIFY ONLY' : prepareOnly ? 'PREPARE ONLY' : 'FULL PIPELINE'}`);
  console.log(`Date: ${targetDate} ${useAll ? '(--all: full pipeline)' : '(today only)'}`);
  console.log(`Max roles: ${maxRoles}`);
  console.log('');

  // Step 0: Sync from scanner if requested
  if (doSync) syncFromScanner();

  // Cover letters only mode — just generate CLs for existing high-scoring reports
  if (coverLettersOnly) {
    console.log('── Generating cover letters for high-scoring reports ──\n');
    const reports = getHighScoringReports(4.0);
    if (reports.length === 0) {
      console.log('No high-scoring reports without cover letters.');
      return;
    }
    console.log(`Found ${reports.length} high-scoring reports needing cover letters:\n`);
    for (const r of reports.slice(0, maxRoles)) {
      generateCoverLetter(r, dryRun);
    }
    return;
  }

  // Notify only mode — send digest of existing results
  if (notifyOnly) {
    const reports = getHighScoringReports(0);
    await sendResultsDigest(reports.map(r => ({
      company: r.company,
      role: r.role,
      score: r.score,
      coverLetter: existsSync(join(COVER_LETTERS_DIR, `cl-${r.slug}-${new Date().toISOString().slice(0, 10)}.md`)),
      pdf: true,
    })), dryRun);
    return;
  }

  // Step 1: Read pipeline (today's results by default, or full pipeline with --all)
  console.log('── Step 1: Reading pipeline ──\n');
  const pipeline = useAll ? readFullPipeline() : readTodaysScanResults(targetDate);
  console.log(`  ${useAll ? 'Full pipeline' : `Scan results for ${targetDate}`}: ${pipeline.length}`);

  // Step 2: Filter already-processed
  const processed = getProcessedUrls();
  const unprocessed = pipeline.filter(e => !processed.has(e.url));
  console.log(`  Already processed: ${processed.size}`);
  console.log(`  New/unprocessed: ${unprocessed.length}`);

  // Step 3: Apply pre-LLM gates
  console.log('\n── Step 2: Applying pre-LLM gates ──\n');
  const qualifying = [];
  const gateResults = { pass: 0, 'skip-title': 0, 'skip-location': 0 };

  for (const entry of unprocessed) {
    const titleResult = titleGate(entry.title);
    if (titleResult !== 'pass') {
      gateResults[titleResult]++;
      continue;
    }

    const locResult = locationGate(entry.title, entry.company);
    if (locResult !== 'pass') {
      gateResults[locResult]++;
      continue;
    }

    qualifying.push(entry);
    gateResults.pass++;
  }

  console.log(`  Title filter blocked: ${gateResults['skip-title']}`);
  console.log(`  Location filter blocked: ${gateResults['skip-location'] || 0}`);
  console.log(`  Qualifying: ${qualifying.length}`);

  // Cap at maxRoles
  const batch = qualifying.slice(0, maxRoles);
  if (qualifying.length > maxRoles) {
    console.log(`  Capped to --max ${maxRoles} (${qualifying.length - maxRoles} deferred)`);
  }

  if (batch.length === 0) {
    console.log('\n  No new qualifying roles to process.');
    return;
  }

  // Step 4: Write batch-input.tsv
  console.log('\n── Step 3: Writing batch input ──\n');
  const count = writeBatchInput(batch);
  console.log(`  Wrote ${count} entries to batch/batch-input.tsv`);

  if (dryRun) {
    console.log('\n── Qualifying roles (dry run) ──\n');
    for (const e of batch) {
      console.log(`  ${e.company} — ${e.title}`);
      console.log(`    ${e.url}`);
    }
    return;
  }

  if (prepareOnly) {
    console.log('\n  --prepare-only: batch-input.tsv ready. Run batch-runner.sh manually.');
    return;
  }

  // Step 5: Run batch evaluation
  console.log('\n── Step 4: Running batch evaluation ──\n');
  const evalResults = runBatchEvaluation(dryRun);
  console.log(`  Completed evaluations: ${evalResults.filter(r => r.status === 'completed').length}`);

  // Step 6: Generate cover letters for high scorers
  console.log('\n── Step 5: Generating cover letters (≥4.0) ─��\n');
  const highReports = getHighScoringReports(4.0);
  const clResults = [];

  for (const r of highReports.slice(0, maxRoles)) {
    const clPath = generateCoverLetter(r, dryRun);
    clResults.push({ ...r, coverLetter: !!clPath });
  }

  if (highReports.length === 0) {
    console.log('  No roles scored ≥4.0 — no cover letters generated.');
  }

  // Step 7: Merge tracker
  console.log('\n── Step 6: Merging tracker ──\n');
  try {
    execSync('node merge-tracker.mjs', { cwd: PROJECT_DIR, stdio: 'inherit' });
  } catch {
    console.log('  ⚠️  Merge encountered issues (check output above)');
  }

  // Step 8: Send Telegram digest
  console.log('\n── Step 7: Sending results digest ──\n');
  const allResults = evalResults.map(r => {
    const report = highReports.find(h => h.reportPath?.includes(r.reportNum));
    return {
      company: report?.company || 'Unknown',
      role: report?.role || 'Unknown',
      score: r.score,
      status: r.status,
      coverLetter: clResults.some(c => c.reportPath?.includes(r.reportNum) && c.coverLetter),
      pdf: r.status === 'completed',
    };
  });

  await sendResultsDigest(allResults, dryRun);

  // Summary
  console.log('\n═══════════════════════════════════════════');
  console.log(' PIPELINE COMPLETE');
  console.log('═══════════════════════════════════════════');
  const completed = evalResults.filter(r => r.status === 'completed').length;
  const high = highReports.length;
  console.log(`  Evaluated: ${completed}`);
  console.log(`  High-fit (≥4.0): ${high}`);
  console.log(`  Cover letters: ${clResults.filter(c => c.coverLetter).length}`);
  console.log(`  Artifacts: output/cover-letters/`);
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
