#!/usr/bin/env node
/**
 * scripts/phase3b-evaluator.mjs — Per-survivor full evaluation orchestrator.
 *
 * The keystone that ties together the eval pipeline:
 *   1. gatherIntel()       — 7-source parallel intel pack
 *   2. runCouncil()        — Sonnet + Opus + Gemini parallel scoring + consensus
 *   3. validateCitations() — claim-to-source span verification
 *   4. writeReport()       — final report file to reports/{num}-{slug}-{date}.md
 *   5. writeTrackerLine()  — TSV addition for merge-tracker.mjs
 *
 * This replaces per-item batch-runner.sh + claude -p invocation. The wave-level
 * orchestrator (scripts/phase3b-orchestrator.mjs) calls this per item with the
 * same safeguards (memory, quota, dedupe).
 *
 * Usage (single survivor):
 *   node scripts/phase3b-evaluator.mjs \
 *     --url "https://..." \
 *     --company "Anthropic" \
 *     --role "Comms Manager, Research" \
 *     --id 1234
 *
 * Usage (batch — feeds from triage advances in batch-input.tsv):
 *   node scripts/phase3b-evaluator.mjs --from-batch-input
 *
 * Flags:
 *   --dry-run        — gather intel + council, but don't write report/tracker
 *   --providers      — comma-separated subset (default: sonnet,opus,gemini)
 *   --skip-citation  — bypass citation validator (e.g., when proof points are scarce)
 *   --skip-grok      — skip Grok intel (cost saving)
 *   --skip-network   — skip LinkedIn network lookup
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { gatherIntel } from '../lib/eval-intel-gather.mjs';
import { runCouncil } from '../lib/eval-council.mjs';
import { validateCitations } from '../lib/eval-citation-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPORTS_DIR = join(ROOT, 'reports');
const TRACKER_DIR = join(ROOT, 'batch/tracker-additions');
const LOG_DIR = join(ROOT, 'data/logs');

// ── Args ──────────────────────────────────────────────────────────────────
const ARGS = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const idx = a.indexOf('=');
    if (idx >= 0) return [a.slice(2, idx), a.slice(idx + 1)];
    const next = process.argv[process.argv.indexOf(a) + 1];
    return [a.slice(2), next && !next.startsWith('--') ? next : true];
  })
);

if (ARGS.help) {
  console.log(`
Phase 3b per-survivor evaluator — full intel + council + citation pipeline.

Modes:
  --url + --company + --role + --id    Evaluate a single survivor
  --from-batch-input                    Iterate every row in batch/batch-input.tsv

Flags:
  --dry-run         Run intel + council, skip writes
  --providers       sonnet,opus,gemini (default: all)
  --skip-citation   Skip claim-to-source validation
  --skip-grok       Skip Grok intel (saves ~$0.10/survivor)
  --skip-network    Skip LinkedIn network lookup

Output:
  reports/{num}-{slug}-{date}.md       Full report
  batch/tracker-additions/{num}-{slug}.tsv   Tracker line for merge-tracker.mjs
  data/logs/phase3b-eval-{date}.log    Append-only spend + outcome log
`);
  process.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function slugify(s) {
  return String(s || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function today() { return new Date().toISOString().slice(0, 10); }

function logSpend(label, costUsd) {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  const line = `${today()}\t${new Date().toISOString()}\t${costUsd.toFixed(4)}\t${label}\n`;
  try { appendFileSync(join(LOG_DIR, `phase3b-eval-${today()}.log`), line); } catch {}
  try { appendFileSync(join(ROOT, 'data/cost-log.tsv'), line); } catch {}
}

function nextReportNum() {
  // Read existing report filenames, find max numeric prefix, return +1.
  if (!existsSync(REPORTS_DIR)) return 1;
  const names = readdirSync(REPORTS_DIR).filter(n => n.endsWith('.md'));
  let max = 0;
  for (const n of names) {
    const m = n.match(/^(\d{3,5})-/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

// ── Report writer ─────────────────────────────────────────────────────────
function buildReport({ intelPack, council, citation, reportNum }) {
  const head = council.consensus;
  const date = today();
  const slug = slugify(intelPack.company + '-' + intelPack.role);
  const filename = `${String(reportNum).padStart(3, '0')}-${slug}-${date}.md`;

  const consensusBlock = [
    `**Score:** ${head.final_score}/5`,
    `**Archetype:** ${head.final_archetype}`,
    `**Decision:** ${head.final_decision}`,
    `**Confidence:** ${head.confidence} (${head.agreement} agreement, σ=${head.score_spread.toFixed(2)})`,
    `**Council:** ${(head.per_provider || []).map(p => `${p.provider}=${p.score}/5 → ${p.decision}`).join(' · ')}`,
    head.dissent_flag ? `**⚠ DISSENT FLAG — human review recommended**` : '',
    `**URL:** ${intelPack.url}`,
    `**Legitimacy:** ${intelPack.jd.alive ? 'High Confidence (JD live)' : 'Stale (JD returned ' + intelPack.jd.status + ')'}`,
    `**Verification:** council-validated (${head.primary_source} primary)`,
    `**Citations:** ${citation.valid_citations}/${citation.total_citations} valid${citation.broken_citations.length ? ' — see Block H' : ''}`,
  ].filter(Boolean).join('  \n');

  let body = `# ${intelPack.company} — ${intelPack.role}\n\n${consensusBlock}\n\n---\n\n## Primary evaluation (${head.primary_source})\n\n${head.primary_text}\n`;

  // Block H — citation audit. Always emit (was conditional on citations>0;
  // 2026-05-17 update: schema-aware audit at scripts/audit-all-evaluations.mjs
  // expects this block to ALWAYS be present in council-format reports, even
  // when the validator found nothing — placeholder content is fine and
  // makes the audit trail uniform).
  body += `\n---\n\n## Block H — Citation audit\n\n`;
  if (citation.total_citations === 0) {
    body += `- Total citations: 0 (no \`[source:line]\` spans found in primary eval text)\n`;
    body += `- Status: no claims to validate; either model omitted citations or the eval relied entirely on the framework + intel pack without per-claim source binding\n`;
  } else {
    body += `- Total citations: ${citation.total_citations}\n`;
    body += `- Valid: ${citation.valid_citations}\n`;
    body += `- Broken: ${citation.broken_citations.length}\n`;
    if (citation.broken_citations.length > 0) {
      body += `\n**Broken citations:**\n`;
      for (const b of citation.broken_citations) {
        body += `- \`${b.span}\` — ${b.reason}\n`;
      }
    }
    body += `\n**Sources cited:**\n`;
    for (const [src, refs] of Object.entries(citation.citations_by_source)) {
      body += `- \`${src}\` (${refs.length} refs): ${refs.map(r => r.raw).slice(0, 6).join(', ')}\n`;
    }
  }

  // Block I — Council dissent details. Always emit (was conditional on
  // dissent_flag||score_spread>0.4; 2026-05-17 update: same audit reason as
  // Block H — uniform presence makes the audit trail easy to mechanize).
  body += `\n---\n\n## Block I — Council dissent\n\n`;
  if (head.dissent_flag || head.score_spread > 0.4) {
    for (const p of head.per_provider) {
      body += `- **${p.provider}:** ${p.score}/5 → ${p.decision} (archetype ${p.archetype})\n`;
    }
    body += `\nScore spread: ${head.score_spread.toFixed(2)}. ${head.confidence === 'LOW' ? 'Recommend human review before action.' : ''}\n`;
  } else {
    body += `_(No dissent — council agreed within 0.4 score spread; per-provider scores omitted as uniform.)_\n`;
    body += `\nProviders: ${head.per_provider.map(p => `${p.provider}=${p.score}`).join(', ')}\n`;
    body += `Score spread: ${head.score_spread?.toFixed?.(2) || '0.00'}. Confidence: ${head.confidence}.\n`;
  }

  // Block J — intel pack summary (audit trail)
  body += `\n---\n\n## Block J — Intel pack summary\n\n`;
  body += `- **Grok intel:** ${intelPack.grok.text ? `${intelPack.grok.text.length} chars` : 'skipped/empty'}\n`;
  body += `- **Comp:** ${intelPack.comp.reconciled_estimate}\n`;
  body += `- **Prior evals at company:** ${intelPack.priors.count} (${JSON.stringify(intelPack.priors.by_status)})\n`;
  body += `- **CV proof-point spans:** ${intelPack.proof_points.cv_md_lines.length}\n`;
  body += `- **Article-digest spans:** ${intelPack.proof_points.article_digest_lines.length}\n`;
  body += `- **LinkedIn network:** ${intelPack.network.first_degree} 1st / ${intelPack.network.second_degree} 2nd\n`;
  body += `- **Council elapsed:** ${(council.elapsed_ms/1000).toFixed(1)}s · cost ~$${council.total_cost_est.toFixed(3)}\n`;
  if (intelPack.issues.length) body += `- **Issues:** ${intelPack.issues.join('; ')}\n`;

  return { filename, body };
}

function buildTrackerTsv({ reportNum, intelPack, council, citation }) {
  const head = council.consensus;
  const slug = slugify(intelPack.company + '-' + intelPack.role);
  const reportLink = `[${reportNum}](reports/${String(reportNum).padStart(3,'0')}-${slug}-${today()}.md)`;
  const note = `Council ${head.agreement} agreement, ${head.confidence} confidence. ${head.dissent_flag ? 'DISSENT FLAG. ' : ''}${citation.broken_citations.length ? `${citation.broken_citations.length} broken citations. ` : ''}Intel: priors=${intelPack.priors.count}, grok=${intelPack.grok.text ? 'present' : 'skipped'}, network=${intelPack.network.first_degree}+${intelPack.network.second_degree}.`;
  // TSV format per CLAUDE.md: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnote
  const cols = [
    reportNum,
    today(),
    intelPack.company,
    intelPack.role,
    'Evaluated',
    `${head.final_score}/5`,
    '❌',  // PDF not generated by council yet
    reportLink,
    note,
  ];
  return cols.join('\t');
}

// ── Main per-survivor ─────────────────────────────────────────────────────
async function evaluateSurvivor({ url, company, role, id }) {
  const gates = {
    skipGrok:    !!ARGS['skip-grok'],
    skipNetwork: !!ARGS['skip-network'],
  };
  const providers = ARGS.providers ? String(ARGS.providers).split(',').map(s => s.trim()) : ['sonnet', 'opus', 'gemini'];

  console.log(`\n=== Evaluating: ${company} — ${role} ===`);
  console.log(`URL: ${url}`);

  // Step 1: intel
  console.log('  [1/3] Gathering intel...');
  const intelPack = await gatherIntel({ url, company, role, gates });
  console.log(`        ✓ ${(intelPack.elapsed_ms/1000).toFixed(1)}s · JD ${intelPack.jd.alive ? 'live' : 'DEAD'} · priors=${intelPack.priors.count} · proof=${intelPack.proof_points.cv_md_lines.length}+${intelPack.proof_points.article_digest_lines.length} · grok=${intelPack.grok.text ? 'ok' : 'skip'}`);

  if (!intelPack.jd.alive) {
    console.log('  ⚠ JD is dead — skipping eval');
    return { skipped: true, reason: 'jd_dead', intelPack };
  }

  // Step 2: council
  console.log(`  [2/3] Running council (${providers.join(', ')})...`);
  const council = await runCouncil({ intelPack, providers });
  if (!council.consensus.final_score) {
    console.log(`  ✗ Council failed — no valid responses (${(council.per_provider_full||[]).map(p => `${p.provider}:${p.error||p.skipped}`).join(', ')})`);
    return { skipped: true, reason: 'council_failed', intelPack, council };
  }
  console.log(`        ✓ ${(council.elapsed_ms/1000).toFixed(1)}s · score=${council.consensus.final_score}/5 (${council.consensus.confidence}, ${council.consensus.agreement}) · decision=${council.consensus.final_decision} · cost~$${council.total_cost_est.toFixed(3)}`);
  // Per-provider diagnostic (helps diagnose why a provider didn't contribute)
  for (const p of council.per_provider_full || []) {
    const tag = p.skipped ? `skipped(${p.skipped})` : p.error ? `error(${(p.error||'').slice(0,80)})` : p.head ? `ok(${p.head.score}/${p.head.archetype}/${p.head.decision})` : `nohead(text_len=${p.text_length})`;
    console.log(`          [${p.provider}] ${tag}`);
  }

  // Step 3: citation validation
  let citation = { ok: true, total_citations: 0, valid_citations: 0, broken_citations: [], citations_by_source: {} };
  if (!ARGS['skip-citation']) {
    console.log('  [3/3] Validating citations...');
    citation = validateCitations(council.consensus.primary_text);
    console.log(`        ${citation.ok ? '✓' : '⚠'} ${citation.valid_citations}/${citation.total_citations} valid${citation.broken_citations.length ? ` · ${citation.broken_citations.length} BROKEN` : ''}`);
  }

  if (ARGS['dry-run']) {
    console.log('  [DRY-RUN] Would write report + tracker line; skipping writes.');
    return { dryRun: true, intelPack, council, citation };
  }

  // Step 4 + 5: write report + tracker
  const reportNum = id ? parseInt(id, 10) : nextReportNum();
  const { filename, body } = buildReport({ intelPack, council, citation, reportNum });
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, filename), body);
  console.log(`        ✓ Report: reports/${filename}`);

  if (!existsSync(TRACKER_DIR)) mkdirSync(TRACKER_DIR, { recursive: true });
  const tsvLine = buildTrackerTsv({ reportNum, intelPack, council, citation });
  const tsvFile = `${reportNum}-${slugify(intelPack.company + '-' + intelPack.role)}.tsv`;
  writeFileSync(join(TRACKER_DIR, tsvFile), tsvLine + '\n');
  console.log(`        ✓ Tracker addition: batch/tracker-additions/${tsvFile}`);

  // Log spend
  logSpend(`eval ${intelPack.company} — ${intelPack.role}`, council.total_cost_est);

  return { ok: true, reportNum, intelPack, council, citation };
}

// ── Batch mode (iterate batch-input.tsv) ──────────────────────────────────
async function evaluateBatch() {
  const inputPath = join(ROOT, 'batch/batch-input.tsv');
  if (!existsSync(inputPath)) { console.error(`No batch-input.tsv at ${inputPath}`); process.exit(1); }
  const lines = readFileSync(inputPath, 'utf-8').split('\n').filter(Boolean);
  const rows = lines.slice(1).map(l => l.split('\t'));
  console.log(`Phase 3b batch eval — ${rows.length} survivors`);

  const summary = { ok: 0, skipped: 0, failed: 0, total_cost: 0, dissent_flags: 0, broken_citation_evals: 0 };
  for (const row of rows) {
    const [id, url, source, notes] = row;
    // Derive company + role from notes ("Company — Role | YYYY-MM-DD [tier]")
    let company = 'Unknown', role = 'Unknown';
    const noteMatch = notes?.match(/^([^—]+)—\s*([^|]+)/);
    if (noteMatch) { company = noteMatch[1].trim(); role = noteMatch[2].trim(); }

    try {
      const result = await evaluateSurvivor({ url, company, role, id });
      if (result.ok) {
        summary.ok++;
        summary.total_cost += result.council.total_cost_est;
        if (result.council.consensus.dissent_flag) summary.dissent_flags++;
        if (result.citation.broken_citations.length > 0) summary.broken_citation_evals++;
      } else if (result.skipped) summary.skipped++;
      else summary.failed++;
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      summary.failed++;
    }
  }

  console.log('\n=== Phase 3b batch summary ===');
  console.log(`  ✓ Evaluated:           ${summary.ok}`);
  console.log(`  ⏭ Skipped (JD dead):  ${summary.skipped}`);
  console.log(`  ✗ Failed:              ${summary.failed}`);
  console.log(`  ⚠ Dissent flags:       ${summary.dissent_flags}`);
  console.log(`  ⚠ Broken citations:    ${summary.broken_citation_evals}`);
  console.log(`  💰 Total spend (est):  $${summary.total_cost.toFixed(2)}`);
  console.log(`\nNext: node merge-tracker.mjs   # to merge tracker additions`);
}

// ── Entry ─────────────────────────────────────────────────────────────────
if (ARGS['from-batch-input']) {
  await evaluateBatch();
} else if (ARGS.url) {
  const result = await evaluateSurvivor({
    url:     ARGS.url,
    company: ARGS.company || 'Unknown',
    role:    ARGS.role || 'Unknown',
    id:      ARGS.id,
  });
  if (result.dryRun) {
    console.log('\nDry-run final scores:');
    console.log(JSON.stringify(result.council.consensus, null, 2));
  }
} else {
  console.error('Usage: --url + --company + --role  OR  --from-batch-input  OR  --help');
  process.exit(1);
}
