#!/usr/bin/env node
/**
 * scripts/maintenance/contact-enrichment-month-1-audit.mjs — Day-30 audit.
 *
 * Auto-fires at pause_after_date 09:00 PT via the matching launchd plist.
 * Mitchell reviews the output and re-enables / re-tunes weights as needed.
 *
 * What it does:
 *   1. Reads data/refresh-master-state.json::refresh_history.contact_enrichment
 *      (every contact that was enriched in the last 30 days, with priority
 *      score at write + signal breakdown + verifier_passed)
 *   2. Reads data/outreach-state.json (current touches, replies, interviews)
 *   3. Correlates enriched contacts against outreach outcomes — did the
 *      enrichment actually correlate with a reply/intro/interview?
 *   4. Recommends weight adjustments. Signals that correlate with positive
 *      outcomes get a +0.1 bump; signals that don't get a -0.1 cut.
 *   5. Surfaces contacts where the enrichment turned up insufficient signal
 *      (no_data_reason set) — Mitchell may want to mark them stale.
 *
 * Output:
 *   data/contact-enrichment-month-1-audit.md (gitignored)
 *   data/contact-enrichment-weights.diff (proposed unified diff)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installRunRecord } from '../../lib/job-runs-ledger.mjs';

const __jobRun = installRunRecord('contact-enrichment-audit');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const STATE_PATH = join(ROOT, 'data/refresh-master-state.json');
const OUTREACH_PATH = join(ROOT, 'data/outreach-state.json');
const WEIGHTS_PATH = join(ROOT, 'config/contact-priority-weights.yml');
const CACHE_DIR = join(ROOT, 'data/contact-enrichment-cache');
const AUDIT_OUT = join(ROOT, 'data/contact-enrichment-month-1-audit.md');
const DIFF_OUT = join(ROOT, 'data/contact-enrichment-weights.diff');

function readJsonSafe(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function loadWeights() {
  if (!existsSync(WEIGHTS_PATH)) return {};
  const text = readFileSync(WEIGHTS_PATH, 'utf8');
  const out = {};
  let inBlock = false;
  for (const line of text.split('\n')) {
    if (/^weights:\s*$/.test(line)) { inBlock = true; continue; }
    if (inBlock) {
      const m = line.match(/^\s\s([a-z0-9_]+):\s*([0-9.]+)/);
      if (m) out[m[1]] = parseFloat(m[2]);
      else if (line.trim() && !line.startsWith(' ')) break;
    }
  }
  return out;
}

function findOutcome(outreachContacts, contactName) {
  const name = String(contactName || '').toLowerCase().trim();
  const c = outreachContacts.find(x => String(x.name || '').toLowerCase().trim() === name);
  if (!c) return { outcome: 'no-outreach', touchCount: 0 };
  const status = String(c.status || '').toLowerCase();
  const touchCount = (c.touches || []).length;
  if (/interview|offer/.test(status)) return { outcome: 'interview-or-offer', touchCount };
  if (/responded|replied/.test(status)) return { outcome: 'replied', touchCount };
  if (touchCount > 0) return { outcome: 'sent-no-reply', touchCount };
  return { outcome: 'no-touches', touchCount: 0 };
}

function main() {
  const state = readJsonSafe(STATE_PATH);
  if (!state || !state.refresh_history || !state.refresh_history.contact_enrichment) {
    const stub = `# Contact-enrichment Month-1 Audit\n\n${new Date().toISOString()} — no contact_enrichment history in refresh-master-state.json. Nothing to audit.\n`;
    writeFileSync(AUDIT_OUT, stub);
    console.log('No enrichment history — wrote stub to', AUDIT_OUT);
    return;
  }
  const history = state.refresh_history.contact_enrichment || {};
  const outreach = readJsonSafe(OUTREACH_PATH) || { contacts: [] };
  const outreachContacts = Array.isArray(outreach.contacts) ? outreach.contacts : [];
  const weights = loadWeights();

  const enrichedIds = Object.keys(history);
  const enriched = enrichedIds.map(id => {
    const entry = history[id];
    // Read the enrichment cache to extract signals (priority_score_at_write was recorded;
    // signals breakdown is in the priority-scorer output but we mirror it into refresh-master-state)
    const cacheFile = join(CACHE_DIR, `${id}.json`);
    let cache = null;
    if (existsSync(cacheFile)) {
      try { cache = JSON.parse(readFileSync(cacheFile, 'utf8')); } catch { /* */ }
    }
    return { id, entry, cache };
  });

  // Outcome correlation. For each signal present at enrichment-time, count how
  // many of the enriched contacts with that signal yielded a positive outcome.
  const signalStats = {}; // { signal: { with_outcome: { 'interview-or-offer': N, replied: N, ... }, total: N, mean_score: ... } }
  let totalEnriched = enriched.length;
  let totalWithPositiveOutcome = 0;
  const NEEDS_HUMAN_LIST = [];

  for (const { id, entry, cache } of enriched) {
    const contactName = (cache && (cache.name || (cache.id || '').replace(/-/g, ' '))) || id.replace(/-/g, ' ');
    const outcome = findOutcome(outreachContacts, contactName);
    const positive = ['interview-or-offer', 'replied'].includes(outcome.outcome);
    if (positive) totalWithPositiveOutcome++;

    // No-data flagged contacts → NEEDS_HUMAN
    if (cache && (cache.no_data_reason || cache.fields_populated === 0)) {
      NEEDS_HUMAN_LIST.push({ id, reason: cache.no_data_reason || 'fields_populated=0', priority_score: entry.priority_score });
    }

    // Roll up per-signal
    const signals = entry.signals || {};
    for (const [s, w] of Object.entries(signals)) {
      if (!signalStats[s]) signalStats[s] = { count: 0, positive: 0, mean_weight: 0, mean_priority: 0, _scores: [] };
      signalStats[s].count++;
      if (positive) signalStats[s].positive++;
      signalStats[s].mean_weight = (signalStats[s].mean_weight * (signalStats[s].count - 1) + w) / signalStats[s].count;
      signalStats[s]._scores.push(entry.priority_score || 0);
    }
  }

  for (const s of Object.values(signalStats)) {
    s.positive_rate = s.count > 0 ? +(s.positive / s.count).toFixed(3) : 0;
    s.mean_priority = +(s._scores.reduce((a, b) => a + b, 0) / s.count).toFixed(3);
    delete s._scores;
  }

  // Weight-adjustment recommendations
  const baselinePositiveRate = totalEnriched > 0 ? totalWithPositiveOutcome / totalEnriched : 0;
  const recommendations = [];
  for (const [signal, stat] of Object.entries(signalStats)) {
    if (stat.count < 5) continue; // not enough data
    const currentWeight = weights[signal] ?? 0;
    let proposed = currentWeight;
    let rationale = '';
    if (stat.positive_rate > baselinePositiveRate * 1.5 && currentWeight < 1.0) {
      proposed = Math.min(1.0, currentWeight + 0.1);
      rationale = `positive_rate ${(stat.positive_rate * 100).toFixed(1)}% (vs baseline ${(baselinePositiveRate * 100).toFixed(1)}%); recommend +0.1 boost`;
    } else if (stat.positive_rate < baselinePositiveRate * 0.5 && currentWeight > 0.1) {
      proposed = Math.max(0.1, currentWeight - 0.1);
      rationale = `positive_rate ${(stat.positive_rate * 100).toFixed(1)}% (vs baseline ${(baselinePositiveRate * 100).toFixed(1)}%); recommend -0.1 cut`;
    } else {
      rationale = `positive_rate ${(stat.positive_rate * 100).toFixed(1)}% within ±50% of baseline; hold`;
    }
    recommendations.push({ signal, current: currentWeight, proposed, rationale, count: stat.count, positive: stat.positive });
  }

  // Write a unified diff for the weights file
  const diff = [];
  let anyChange = false;
  if (recommendations.some(r => r.current !== r.proposed)) {
    anyChange = true;
    diff.push('--- a/config/contact-priority-weights.yml');
    diff.push('+++ b/config/contact-priority-weights.yml');
    diff.push('@@ recommended weight adjustments @@');
    for (const r of recommendations) {
      if (r.current === r.proposed) continue;
      diff.push(`-  ${r.signal}: ${r.current.toFixed(1)}`);
      diff.push(`+  ${r.signal}: ${r.proposed.toFixed(1)}                  # ${r.rationale}`);
    }
  }
  writeFileSync(DIFF_OUT, diff.join('\n') + '\n');

  // Markdown audit
  const md = [];
  md.push('# Contact-enrichment Month-1 Audit');
  md.push('');
  md.push(`**Audit date:** ${new Date().toISOString().slice(0, 10)}`);
  md.push(`**Enriched contacts in window:** ${totalEnriched}`);
  md.push(`**Positive outcomes (replied / interview / offer):** ${totalWithPositiveOutcome}  (${(baselinePositiveRate * 100).toFixed(1)}%)`);
  md.push('');
  md.push('## Signal → outcome correlation');
  md.push('');
  md.push('| Signal | Count | Positive | Positive rate | Mean priority |');
  md.push('|---|---:|---:|---:|---:|');
  const sortedSignals = Object.entries(signalStats).sort((a, b) => b[1].count - a[1].count);
  for (const [signal, stat] of sortedSignals) {
    md.push(`| ${signal} | ${stat.count} | ${stat.positive} | ${(stat.positive_rate * 100).toFixed(1)}% | ${stat.mean_priority.toFixed(2)} |`);
  }
  md.push('');
  md.push('## Recommended weight adjustments');
  md.push('');
  if (!anyChange) {
    md.push('*No adjustments recommended — every signal performs within ±50% of the baseline.*');
  } else {
    md.push('| Signal | Current | Proposed | Rationale |');
    md.push('|---|---:|---:|---|');
    for (const r of recommendations) {
      if (r.current === r.proposed) continue;
      md.push(`| ${r.signal} | ${r.current.toFixed(1)} | ${r.proposed.toFixed(1)} | ${r.rationale} |`);
    }
    md.push('');
    md.push(`Unified diff: \`data/contact-enrichment-weights.diff\` (apply with \`patch -p1 < data/contact-enrichment-weights.diff\` if Mitchell agrees)`);
  }
  md.push('');
  md.push('## NEEDS_HUMAN — contacts with insufficient enrichment signal');
  md.push('');
  if (NEEDS_HUMAN_LIST.length === 0) {
    md.push('*None — every enriched contact returned at least one populated field.*');
  } else {
    md.push('| Contact ID | Priority score | Reason |');
    md.push('|---|---:|---|');
    for (const n of NEEDS_HUMAN_LIST.slice(0, 50)) {
      md.push(`| [${n.id}](/contact/${n.id}) | ${(n.priority_score || 0).toFixed(2)} | ${n.reason} |`);
    }
    if (NEEDS_HUMAN_LIST.length > 50) md.push(`\n… and ${NEEDS_HUMAN_LIST.length - 50} more (see refresh-master-state.json)`);
  }
  md.push('');
  md.push('## Next steps for Mitchell');
  md.push('');
  md.push('1. **Review weight adjustments** in `data/contact-enrichment-weights.diff` — apply with `patch -p1` if they look right, otherwise edit `config/contact-priority-weights.yml` directly.');
  md.push('2. **Mark NEEDS_HUMAN contacts stale** via the dashboard `/contact/:id` page if you don\'t want them re-attempted in the next 30 days.');
  md.push('3. **Re-enable contact_enrichment** by editing `config/contact-priority-weights.yml::pause_after_date` to a new date 30 days in the future, OR set the budget cap higher in `month_1_budget_usd`.');
  md.push('4. **Day-60 audit** will auto-fire after the new pause_after_date.');
  md.push('');
  writeFileSync(AUDIT_OUT, md.join('\n'));

  console.log(`audit written to ${AUDIT_OUT}`);
  console.log(`weight-diff written to ${DIFF_OUT}`);
  console.log(`enriched=${totalEnriched}, positive=${totalWithPositiveOutcome} (${(baselinePositiveRate * 100).toFixed(1)}%), recommendations=${recommendations.filter(r => r.current !== r.proposed).length}, NEEDS_HUMAN=${NEEDS_HUMAN_LIST.length}`);
}

main();
