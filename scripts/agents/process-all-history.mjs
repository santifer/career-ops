#!/usr/bin/env node
/**
 * scripts/agents/process-all-history.mjs
 *
 * Reconstructs the history of every Process All / Run Batch invocation from:
 *   - /tmp/process-all-*.log
 *   - /tmp/batch-only-*.log
 *   - data/pipeline-process-state.json (recent + telemetry, ad-hoc)
 *
 * Surfaces per-run cap-hit detection so Mitchell can audit which runs were
 * silently truncated by the (now-removed) --limit=50 default.
 *
 * Usage:
 *   node scripts/agents/process-all-history.mjs            # md report
 *   node scripts/agents/process-all-history.mjs --json     # machine
 */

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TODAY = new Date().toISOString().slice(0, 10);
const JSON_MODE = process.argv.includes('--json');

// Parse one log file into a run record. Returns null if not a recognizable
// Process All / Run Batch log (we trust the file name + log content).
function parseLog(fp) {
  let text;
  try { text = readFileSync(fp, 'utf-8'); } catch { return null; }
  if (!text) return null;

  const jobId = (fp.match(/process-all-(proc-[\w-]+)\.log/)?.[1])
             || (fp.match(/batch-only-(batch-[\w-]+)\.log/)?.[1])
             || null;
  const type = fp.includes('process-all-') ? 'process-all' : 'batch-only';

  // First timestamp in the log = start
  const tsMatch = text.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);
  const started_at = tsMatch ? tsMatch[1] : null;
  // Last timestamp = finish (best-effort)
  const tsMatches = [...text.matchAll(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/g)];
  const finished_at = tsMatches.length ? tsMatches[tsMatches.length - 1][1] : null;

  // What caps did triage receive?
  const limitMatch = text.match(/triage\.mjs\s+(?:--[\w-]+=\S+\s+)*--limit=(\d+)/);
  const dailyLimitMatch = text.match(/triage\.mjs\s+(?:--[\w-]+=\S+\s+)*--daily-limit=(\d+)/);
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : null;
  const dailyLimit = dailyLimitMatch ? parseInt(dailyLimitMatch[1], 10) : null;
  // Inferred default — triage.mjs:51 hardcodes LIMIT default to 50.
  const effective_limit = limit ?? 50;
  const effective_daily = dailyLimit ?? 200;

  // Triage outcomes
  const advanced = parseInt(text.match(/Advanced:\s+(\d+)/)?.[1] ?? '0', 10);
  const skipped  = parseInt(text.match(/Skipped:\s+(\d+)/)?.[1] ?? '0', 10);
  const dead     = parseInt(text.match(/Dead:\s+(\d+)/)?.[1] ?? '0', 10);
  const processed = advanced + skipped + dead;

  // Batch outcome
  const batchOk = /✓ batch (?:complete|succeeded)/.test(text)
              || /Phase 2.*BATCH.*ok/i.test(text)
              || /36✅ 0❌/.test(text);
  const batchComplete = /Processed: \S+ \((\d+) reports written\)/.exec(text);
  const batchProcessed = batchComplete ? parseInt(batchComplete[1], 10) : null;

  // Cap-hit detection (best-effort — only fires when processed >= effective limit
  // AND the next run / dashboard shows pending pipeline. Conservative: just flag
  // any run where processed equals the per-session cap.)
  const cap_hit = processed >= effective_limit;
  const cap_hit_reason = cap_hit ? `processed=${processed} matched effective --limit=${effective_limit}` : null;

  return {
    job_id: jobId,
    type,
    started_at,
    finished_at,
    log_path: fp,
    triage: {
      limit, daily_limit: dailyLimit,
      effective_limit, effective_daily,
      advanced, skipped, dead, processed,
      cap_hit, cap_hit_reason,
    },
    batch: {
      ok: batchOk,
      processed: batchProcessed,
    },
  };
}

function findLogs() {
  const out = [];
  try {
    const entries = readdirSync('/tmp');
    for (const f of entries) {
      if (!/^(process-all-|batch-only-).+\.log$/.test(f)) continue;
      const fp = join('/tmp', f);
      try {
        const st = statSync(fp);
        if (!st.isFile()) continue;
        out.push(fp);
      } catch {}
    }
  } catch {}
  // Sort by mtime (oldest first)
  out.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  return out;
}

function loadCurrentState() {
  const fp = join(ROOT, 'data/pipeline-process-state.json');
  if (!existsSync(fp)) return [];
  try {
    const s = JSON.parse(readFileSync(fp, 'utf-8'));
    return Object.values(s.jobs || {});
  } catch { return []; }
}

function pipelineState() {
  try {
    const txt = readFileSync(join(ROOT, 'data/pipeline.md'), 'utf-8');
    return (txt.match(/^- \[ \] https?:\/\//gm) || []).length;
  } catch { return null; }
}
function scanHistorySize() {
  try {
    const lines = readFileSync(join(ROOT, 'data/scan-history.tsv'), 'utf-8').split('\n').filter(l => l && !l.startsWith('url'));
    return lines.length;
  } catch { return null; }
}

const logs = findLogs();
const runs = logs.map(parseLog).filter(Boolean);
const currentState = loadCurrentState();
const pipeline_pending = pipelineState();
const scan_total = scanHistorySize();

const summary = {
  generated_at: new Date().toISOString(),
  runs_found_in_tmp: runs.length,
  runs_in_state_json: currentState.length,
  pipeline_pending,
  scan_total,
  cap_hit_runs: runs.filter(r => r.triage.cap_hit).length,
  total_advanced_all_runs: runs.reduce((a, r) => a + r.triage.advanced, 0),
  total_processed_all_runs: runs.reduce((a, r) => a + r.triage.processed, 0),
};

if (JSON_MODE) {
  process.stdout.write(JSON.stringify({ summary, runs, current_state_jobs: currentState }, null, 2) + '\n');
  process.exit(0);
}

const md = [];
md.push(`# Process All History — ${TODAY}`);
md.push('');
md.push('Reconstructed from /tmp/process-all-*.log + /tmp/batch-only-*.log + pipeline-process-state.json.');
md.push('');
md.push('## Summary');
md.push('');
md.push(`- **Runs found in /tmp logs:** ${summary.runs_found_in_tmp}`);
md.push(`- **Runs in state.json (recent):** ${summary.runs_in_state_json}`);
md.push(`- **Pipeline still pending:** ${pipeline_pending}`);
md.push(`- **Scan history total (all-time URLs ingested):** ${scan_total}`);
md.push(`- **Runs that HIT the per-session cap:** ${summary.cap_hit_runs} of ${summary.runs_found_in_tmp}`);
md.push(`- **Total URLs advanced to batch (sum across all runs):** ${summary.total_advanced_all_runs}`);
md.push(`- **Total URLs processed by triage (sum across all runs):** ${summary.total_processed_all_runs}`);
md.push('');
md.push('## Per-run detail');
md.push('');
md.push('| Started | Type | Cap (limit/daily) | Adv | Skip | Dead | Proc | Cap hit? | Job ID |');
md.push('|---------|------|-------------------|-----|------|------|------|----------|--------|');
for (const r of runs) {
  const t = r.triage;
  const capStr = `${t.effective_limit}/${t.effective_daily}` + (t.limit == null ? ' (defaulted)' : '');
  const hit = t.cap_hit ? '⚠ YES' : 'no';
  md.push(`| ${r.started_at || '?'} | ${r.type} | ${capStr} | ${t.advanced} | ${t.skipped} | ${t.dead} | ${t.processed} | ${hit} | ${r.job_id || '?'} |`);
}
md.push('');
md.push('## Recommended next steps');
md.push('');
if (pipeline_pending > 50) {
  md.push(`- **Pipeline has ${pipeline_pending} pending URLs.** Run Process All once — with the 2026-05-20 cap fix, triage will now process all of them in a single pass (per the cost-confirmation contract). Estimate cost via the dashboard Process All modal preview before confirming.`);
} else {
  md.push('- Pipeline pending count is low; no urgent re-drain needed.');
}
if (summary.cap_hit_runs > 0) {
  md.push(`- **${summary.cap_hit_runs} historical run(s) hit the per-session cap.** Those runs left URLs un-triaged in the pipeline. Most are still in pipeline.md and will be picked up on the next Process All. URLs that were dropped from pipeline.md by intermediate dedup/canonicalization are listed in the next section.`);
}
md.push('');
md.push('## Future cap-hit detection');
md.push('');
md.push('Per-run telemetry is now recorded in `data/pipeline-process-state.json` under each `proc-*` job:');
md.push('- `triage_pipeline_before` / `triage_pipeline_after` — pipeline size delta');
md.push('- `triage_cap` — the effective per-session limit for this run');
md.push('- `triage_cap_hit` — boolean: did the cap bind throughput?');
md.push('- `triage_missed_this_run` — URLs left untouched when cap_hit was true');
md.push('');
md.push('Re-run this report any time after a Process All to audit the run.');
md.push('');
const outPath = join(ROOT, `data/process-all-history-${TODAY}.md`);
writeFileSync(outPath, md.join('\n'));
console.log(md.join('\n'));
console.log(`\nWrote ${outPath}`);
