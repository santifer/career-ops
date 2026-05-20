#!/usr/bin/env node
/**
 * audit.mjs — overnight system health + opportunity audit
 *
 * Checks 8 dimensions, writes a markdown report to reports/system-audit-{date}.md,
 * and prints a summary to stdout. Designed to run weekly (Sunday 02:30 PT) via launchd.
 *
 * Usage:
 *   node audit.mjs                    # full audit
 *   node audit.mjs --dry-run          # print report, don't write file
 *   node audit.mjs --section=cost     # single section only
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { installRunRecord } from './lib/job-runs-ledger.mjs';

const __jobRun = installRunRecord('audit');

// Load .env for Telegram credentials (non-critical — fails silently)
try {
  const envText = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

async function sendTelegram(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
  } catch { /* non-critical — never break the audit over a notification */ }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const TODAY = new Date().toISOString().slice(0, 10);
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_SECTION = (process.argv.find(a => a.startsWith('--section=')) || '').split('=')[1] || null;

const REPORT_PATH = join(ROOT, `reports/system-audit-${TODAY}.md`);
const findings = [];   // { section, level: 'ok'|'warn'|'crit', message }
const sections = {};   // section name → markdown content

// ── Helpers ─────────────────────────────────────────────────────
function read(p) { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } }
function jsonRead(p) { try { return JSON.parse(read(p)); } catch { return null; } }
function flag(section, level, message) { findings.push({ section, level, message }); }
function daysSince(isoDate) {
  if (!isoDate) return Infinity;
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

// ── 1. COST EFFICIENCY ──────────────────────────────────────────
function auditCost() {
  const quota = jsonRead('batch/daily-quota.json');
  const lines = [];

  if (quota) {
    const age = daysSince(quota.date);
    lines.push(`**Last quota date:** ${quota.date} (${age} days ago)`);
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Triaged | ${quota.triaged} |`);
    lines.push(`| Advanced (→ full eval) | ${quota.advanced} |`);
    lines.push(`| Skipped (Haiku SKIP) | ${quota.skipped} |`);
    lines.push(`| Dead (liveness fail) | ${quota.dead} |`);

    const advancePct = quota.triaged > 0 ? ((quota.advanced / quota.triaged) * 100).toFixed(1) : 'n/a';
    const deadPct    = quota.triaged > 0 ? ((quota.dead    / quota.triaged) * 100).toFixed(1) : 'n/a';
    lines.push(`\n**Advance rate:** ${advancePct}% of triaged items advance to full eval`);
    lines.push(`**Dead rate:** ${deadPct}% of triaged items are closed/404`);

    if (parseFloat(advancePct) > 60) flag('cost', 'warn', `High advance rate (${advancePct}%) — triage threshold may be too low, wasting full-eval budget`);
    if (parseFloat(advancePct) < 10) flag('cost', 'warn', `Very low advance rate (${advancePct}%) — threshold may be too high, missing good fits`);
    if (parseFloat(deadPct) > 40)    flag('cost', 'crit', `${deadPct}% of items are dead — run --liveness-only more aggressively before scoring`);
  } else {
    flag('cost', 'warn', 'No batch/daily-quota.json found — triage.mjs has not been run yet');
    lines.push('_No quota data found. Run `node triage.mjs --liveness-only` first._');
  }

  // Estimate full-eval cost from batch-state
  const stateText = read('batch/batch-state.tsv');
  const stateRows = stateText.split('\n').filter(l => l && !l.startsWith('id'));
  const completed = stateRows.filter(l => l.includes('\tcompleted\t')).length;
  const failed    = stateRows.filter(l => l.includes('\tfailed\t')).length;
  const estCost   = (completed * 1.10 + failed * 0.20).toFixed(2);
  lines.push(`\n**Full eval batch:** ${completed} completed · ${failed} failed · ~$${estCost} estimated total`);

  if (completed > 0 && parseFloat(estCost) > 50) flag('cost', 'warn', `Estimated batch cost $${estCost} — consider tightening tier thresholds or reducing batch size`);

  sections['cost'] = lines.join('\n');
}

// ── 2. PIPELINE HEALTH ──────────────────────────────────────────
function auditPipeline() {
  const pipeText = read('data/pipeline.md');
  const lines = pipeText.split('\n');
  const pending = lines.filter(l => l.startsWith('- [ ]')).length;
  const checked = lines.filter(l => l.startsWith('- [x]')).length;

  let tier = 0, t1 = 0, t2 = 0, t3 = 0;
  for (const l of lines) {
    if (/Tier 1/i.test(l) && !/Tier [23]/.test(l)) tier = 1;
    else if (/Tier 2/i.test(l)) tier = 2;
    else if (/Tier 3/i.test(l)) tier = 3;
    if (l.startsWith('- [ ]')) { if (tier===1) t1++; else if (tier===2) t2++; else t3++; }
  }

  const out = [
    `| Tier | Pending |`,
    `|------|---------|`,
    `| Tier 1 (target) | ${t1} |`,
    `| Tier 2 (title match) | ${t2} |`,
    `| Tier 3 (unknown) | ${t3} |`,
    `| **Total pending** | **${pending}** |`,
    `| Already processed | ${checked} |`,
    '',
    `**Triage-advance queue:** ${read('batch/triage-advance.tsv').split('\n').filter(l=>l&&!l.startsWith('url')).length} items awaiting full eval`,
  ];

  if (pending > 500) flag('pipeline', 'warn', `${pending} items still pending — schedule a triage run`);
  if (t3 > t1 + t2)  flag('pipeline', 'warn', `Tier 3 (unknowns) dominates pipeline (${t3} vs ${t1+t2} targeted) — scanner may be too broad`);
  if (t1 > 0 && t1 < 20) flag('pipeline', 'ok', `Tier 1 nearly clear (${t1} remaining) — good progress`);

  sections['pipeline'] = out.join('\n');
}

// ── 3. REPORT QUALITY ───────────────────────────────────────────
function auditQuality() {
  const reportsDir = join(ROOT, 'reports');
  if (!existsSync(reportsDir)) { sections['quality'] = '_No reports directory._'; return; }

  const mdFiles = readdirSync(reportsDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('system-audit'))
    .sort().reverse();

  const total = mdFiles.length;
  const sample = mdFiles.slice(0, 10);

  let missingBlock = 0, missingUrl = 0, hasEvidence = 0, scoreSum = 0, scored = 0;
  for (const f of sample) {
    const text = read(`reports/${f}`);
    if (!text.includes('**URL:**')) missingUrl++;
    if (!text.match(/^##\s+[BCDEF]\b/m)) missingBlock++;
    if (text.includes('## H) Evidence')) hasEvidence++;
    const sm = text.match(/\*\*Score:\*\*\s*([\d.]+)/);
    if (sm) { scoreSum += parseFloat(sm[1]); scored++; }
  }

  const avgScore = scored > 0 ? (scoreSum / scored).toFixed(2) : 'n/a';
  const out = [
    `**Total reports:** ${total} · **Sampled:** ${sample.length} most recent`,
    `| Check | Count (of ${sample.length}) | Status |`,
    `|-------|------|--------|`,
    `| Missing **URL:** header | ${missingUrl} | ${missingUrl > 2 ? '⚠️' : '✅'} |`,
    `| Missing eval block (B-F) | ${missingBlock} | ${missingBlock > 2 ? '⚠️' : '✅'} |`,
    `| Has evidence block (H) | ${hasEvidence} | ${hasEvidence === 0 ? '📌 none yet' : '✅'} |`,
    `| Average score | ${avgScore}/5 | — |`,
  ];

  if (missingUrl > 2)   flag('quality', 'warn', `${missingUrl}/10 recent reports missing **URL:** header — pipeline integrity check needed`);
  if (missingBlock > 2) flag('quality', 'crit', `${missingBlock}/10 recent reports missing evaluation blocks — batch worker may be failing mid-run`);
  if (hasEvidence === 0) flag('quality', 'ok', 'No evidence blocks (H) yet — use the dashboard Verify button to add external validation');
  if (parseFloat(avgScore) > 4.2) flag('quality', 'warn', `High average score (${avgScore}) in recent batch — scoring may be inflated; check calibration`);
  if (parseFloat(avgScore) < 2.5) flag('quality', 'warn', `Low average score (${avgScore}) — scanner may be pulling poor-fit postings`);

  sections['quality'] = out.join('\n');
}

// ── 4. KNOWLEDGE BASE GROWTH ────────────────────────────────────
function auditKnowledgeBase() {
  const storyText  = read('interview-prep/story-bank.md');
  const digestText = read('article-digest.md');
  const cvText     = read('cv.md');

  const stories  = (storyText.match(/^##\s+/gm) || []).length;
  const proofPts = (digestText.match(/^#+\s+/gm) || []).length;
  const cvLines  = cvText.split('\n').filter(l => l.trim()).length;

  // Check age of voice reference
  let voiceAge = 'unknown';
  try {
    const stat = statSync(join(ROOT, 'writing-samples/voice-reference.md'));
    voiceAge = `${daysSince(stat.mtime.toISOString())} days ago`;
  } catch {}

  const out = [
    `| Asset | Count / Status |`,
    `|-------|---------------|`,
    `| STAR stories in story-bank.md | ${stories} sections |`,
    `| Proof points in article-digest.md | ${proofPts} sections |`,
    `| CV lines (non-blank) | ${cvLines} |`,
    `| Voice reference last updated | ${voiceAge} |`,
    `| Total evaluation reports | ${readdirSync(join(ROOT,'reports')).filter(f=>f.endsWith('.md')&&!f.startsWith('system')).length} |`,
  ];

  if (stories < 5)  flag('kb', 'warn', `Only ${stories} STAR stories in story-bank — add more after each interview or strong evaluation`);
  if (proofPts < 8) flag('kb', 'warn', `Only ${proofPts} proof points in article-digest — consider running transcript mining pass`);

  sections['kb'] = out.join('\n');
}

// ── 5. SEARCH QUALITY ───────────────────────────────────────────
function auditSearchQuality() {
  const scanText = read('data/scan-history.tsv');
  const scanRows = scanText.split('\n').filter(l => l && !l.startsWith('url'));
  const added    = scanRows.filter(l => l.includes('\tadded\t')).length;
  const total    = scanRows.length;
  const addRate  = total > 0 ? ((added / total) * 100).toFixed(1) : 'n/a';

  // Check most recent scan date
  const dates = scanRows.map(l => l.split('\t')[1]).filter(Boolean).sort().reverse();
  const lastScan = dates[0]?.slice(0, 10) || 'unknown';
  const scanAge  = daysSince(lastScan);

  const out = [
    `**Total URLs scanned:** ${total}`,
    `**Added to pipeline:** ${added} (${addRate}%)`,
    `**Last scan:** ${lastScan} (${scanAge} days ago)`,
    '',
    addRate !== 'n/a' && parseFloat(addRate) < 5
      ? '⚠️ Very low add rate — portal queries may need widening or companies list needs refreshing'
      : '✅ Add rate looks healthy',
  ];

  if (scanAge > 7)            flag('search', 'warn', `Last scan was ${scanAge} days ago — scanner should run more frequently`);
  if (parseFloat(addRate) < 3) flag('search', 'warn', `Only ${addRate}% of scanned URLs added — queries may be too narrow`);
  if (parseFloat(addRate) > 40) flag('search', 'warn', `Very high add rate (${addRate}%) — dedup filter may not be working or portals list is new`);

  sections['search'] = out.join('\n');
}

// ── 6. ORGANIZATION + INTEGRITY ─────────────────────────────────
function auditOrganization() {
  const lines = [];
  try {
    const dupeOut = execSync('node dedup-tracker.mjs --dry-run 2>&1', { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
    const dupes = (dupeOut.match(/duplicate/gi) || []).length;
    lines.push(`**Tracker duplicates detected:** ${dupes}`);
    if (dupes > 0) flag('org', 'warn', `${dupes} duplicate entries in applications.md — run node dedup-tracker.mjs`);
    else flag('org', 'ok', 'No tracker duplicates detected');
  } catch (e) {
    lines.push(`_dedup-tracker.mjs check failed: ${e.message.slice(0, 80)}_`);
  }

  // Orphaned reports (report file exists but not in applications.md)
  const appsText = read('data/applications.md');
  const reportFiles = readdirSync(join(ROOT, 'reports')).filter(f => f.endsWith('.md') && !f.startsWith('system'));
  const orphaned = reportFiles.filter(f => !appsText.includes(f.replace('.md', ''))).length;
  lines.push(`**Orphaned report files:** ${orphaned} (exist on disk but not linked in applications.md)`);
  if (orphaned > 10) flag('org', 'warn', `${orphaned} orphaned reports — run node merge-tracker.mjs to reconcile`);

  // Tracker-additions pending merge
  const additions = existsSync(join(ROOT, 'batch/tracker-additions'))
    ? readdirSync(join(ROOT, 'batch/tracker-additions')).filter(f => f.endsWith('.tsv') && f !== 'triage-skips.tsv').length
    : 0;
  lines.push(`**Tracker additions pending merge:** ${additions} TSV files`);
  if (additions > 5) flag('org', 'warn', `${additions} tracker additions pending — run node merge-tracker.mjs`);

  sections['org'] = lines.join('\n');
}

// ── 7. UX / DASHBOARD FRESHNESS ─────────────────────────────────
function auditUX() {
  const htmlText = read('dashboard/index.html');
  const hardcoded = (htmlText.match(/class="stat-value">\d+<\/div>/g) || []).length;
  const hasLivePolling = htmlText.includes('pollStats');
  const hasVerifyModal = htmlText.includes('openVerify');
  const hasBatchLive  = htmlText.includes('openBatchLive');
  const hasDarkMode   = htmlText.includes('data-theme="dark"');

  const out = [
    `| Feature | Present |`,
    `|---------|---------|`,
    `| Live stat polling | ${hasLivePolling ? '✅' : '❌'} |`,
    `| Batch live modal | ${hasBatchLive ? '✅' : '❌'} |`,
    `| Claim verify modal | ${hasVerifyModal ? '✅' : '❌'} |`,
    `| Dark mode support | ${hasDarkMode ? '✅' : '❌'} |`,
    `| Hardcoded stat values | ${hardcoded} (replaced by live poll) |`,
  ];

  if (hardcoded > 12) flag('ux', 'warn', `${hardcoded} hardcoded stat values in HTML — stale if server is down`);

  sections['ux'] = out.join('\n');
}

// ── 8. OPPORTUNITIES ────────────────────────────────────────────
function auditOpportunities() {
  const appsText = read('data/applications.md');
  const apps = appsText.split('\n').filter(l => l.startsWith('|') && !l.match(/^[\|:\s\-]+$/) && !l.includes('| # |')).slice(1);

  const evalNotApplied = apps.filter(r => r.includes('| Evaluated |') || r.includes('| Evaluated|')).length;
  const highScore = apps.filter(r => {
    const m = r.match(/\|\s*([\d.]+)\/5/);
    return m && parseFloat(m[1]) >= 4.0;
  }).length;

  const pipeText = read('data/pipeline.md');
  const pending = pipeText.split('\n').filter(l => l.startsWith('- [ ]')).length;

  const out = [
    `**Evaluated but not applied:** ${evalNotApplied} roles — review and act`,
    `**Score ≥ 4.0 in tracker:** ${highScore} total`,
    `**Pipeline still pending:** ${pending} URLs`,
    '',
    '### Recommended next actions',
    evalNotApplied > 0 ? `1. **Apply now** — ${evalNotApplied} evaluated roles waiting. Open dashboard → Apply-Now Queue.` : '1. ✅ No unapplied evaluations sitting idle.',
    pending > 200  ? `2. **Triage pipeline** — ${pending} pending items. Run: \`node triage.mjs --liveness-only && node triage.mjs --tier=1\`` : `2. ✅ Pipeline under control (${pending} pending).`,
    `3. **Evidence pass** — use dashboard Verify button on top 5 Apply-Now items to back claims with external data.`,
    `4. **Story bank** — after any evaluation or outreach, add a new STAR story to \`interview-prep/story-bank.md\`.`,
  ];

  if (evalNotApplied > 5) flag('opps', 'crit', `${evalNotApplied} evaluated roles not yet applied — top priority action`);
  if (pending > 500)      flag('opps', 'warn', `${pending} pipeline items pending — schedule triage run soon`);

  sections['opps'] = out.join('\n');
}

// ── Assemble report ──────────────────────────────────────────────
async function main() {
  console.log(`\n=== career-ops audit.mjs — ${TODAY} ===\n`);

  const AUDITS = [
    ['cost',     'Cost Efficiency',        auditCost],
    ['pipeline', 'Pipeline Health',        auditPipeline],
    ['quality',  'Report Quality',         auditQuality],
    ['kb',       'Knowledge Base Growth',  auditKnowledgeBase],
    ['search',   'Search / Scraping',      auditSearchQuality],
    ['org',      'Organization + Integrity', auditOrganization],
    ['ux',       'UX / Dashboard',         auditUX],
    ['opps',     'Opportunities',          auditOpportunities],
  ];

  for (const [key, label, fn] of AUDITS) {
    if (ONLY_SECTION && ONLY_SECTION !== key) continue;
    process.stdout.write(`  [${key}] ${label}… `);
    try { fn(); console.log('done'); }
    catch (e) { console.log(`ERROR: ${e.message}`); flag(key, 'warn', `Audit section threw: ${e.message.slice(0, 80)}`); }
  }

  // Summary
  const crits  = findings.filter(f => f.level === 'crit');
  const warns  = findings.filter(f => f.level === 'warn');
  const oks    = findings.filter(f => f.level === 'ok');

  const overallStatus = crits.length > 0 ? '🔴 CRITICAL' : warns.length > 0 ? '🟡 WARNINGS' : '🟢 HEALTHY';

  const md = [
    `# System Audit — ${TODAY}`,
    `**Status:** ${overallStatus} · ${crits.length} critical · ${warns.length} warnings · ${oks.length} healthy`,
    '',
    '## Findings Summary',
    ...(crits.length === 0 && warns.length === 0 ? ['_No issues found._'] : []),
    ...crits.map(f => `- 🔴 **[${f.section}]** ${f.message}`),
    ...warns.map(f => `- 🟡 **[${f.section}]** ${f.message}`),
    ...oks.map(f =>   `- ✅ **[${f.section}]** ${f.message}`),
    '',
    ...Object.entries(sections).flatMap(([key, content]) => {
      const label = { cost:'Cost Efficiency', pipeline:'Pipeline Health', quality:'Report Quality', kb:'Knowledge Base', search:'Search Quality', org:'Organization', ux:'UX / Dashboard', opps:'Opportunities' }[key] || key;
      return [`## ${label}`, '', content, ''];
    }),
    `---`,
    `_Generated by audit.mjs on ${new Date().toISOString()}_`,
  ].join('\n');

  console.log(`\n${overallStatus} — ${crits.length} critical · ${warns.length} warnings\n`);
  if (findings.length > 0) {
    console.log('Findings:');
    findings.forEach(f => console.log(`  ${f.level === 'crit' ? '🔴' : f.level === 'warn' ? '🟡' : '✅'} [${f.section}] ${f.message}`));
  }

  if (!DRY_RUN) {
    writeFileSync(REPORT_PATH, md);
    console.log(`\nReport written → ${REPORT_PATH}`);

    // Telegram alert — crits always, warns only if no crits
    if (crits.length > 0) {
      const lines = crits.map(f => `🔴 [${f.section}] ${f.message}`).join('\n');
      await sendTelegram(`<b>career-ops audit — ${TODAY}</b>\n🔴 ${crits.length} CRITICAL\n\n${lines}\n\nOpen dashboard: http://localhost:3000`);
      console.log(`Telegram alert sent (${crits.length} critical findings).`);
    } else if (warns.length > 0) {
      const lines = warns.slice(0, 3).map(f => `🟡 [${f.section}] ${f.message}`).join('\n');
      await sendTelegram(`<b>career-ops audit — ${TODAY}</b>\n🟡 ${warns.length} warnings (no criticals)\n\n${lines}`);
      console.log(`Telegram alert sent (${warns.length} warnings).`);
    } else {
      await sendTelegram(`<b>career-ops audit — ${TODAY}</b>\n✅ All healthy — no issues found.`);
      console.log(`Telegram alert sent (healthy).`);
    }
  } else {
    console.log('\n--- DRY RUN — report preview ---\n');
    console.log(md.slice(0, 2000));
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
