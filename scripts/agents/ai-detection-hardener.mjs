#!/usr/bin/env node
/**
 * scripts/agents/ai-detection-hardener.mjs — DELTA's reusable agent.
 *
 * One-stop CLI for everything DELTA shipped on 2026-05-19:
 *   --field-audit    Re-call GPTZero + Originality once with sample text;
 *                    log actual field shapes to data/delta-detector-field-
 *                    audit-<DATE>.md. Anti-hallucination guard before any
 *                    new code references a detector field.
 *   --recalibrate    Re-run scripts/ai-detection-calibrate-baseline.mjs
 *                    against the current voice corpus. Refuses to write
 *                    current-thresholds.json if sample size <20+10 OR if
 *                    human-max >= AI-min on any detector (the AAA-1 + AAA-2
 *                    fail-secure guards).
 *   --ats-watch      Stub — delegates to /researcher for a 90-day ATS-
 *                    detection landscape watch. Manual-trigger; the
 *                    council-approved cost was ~$5-8 per pass.
 *   --check <path>   Run the gate against a single artifact (any markdown
 *                    file). Prints band, gateBlocks, signal_quality, top-5
 *                    flagged sentences. Useful for ad-hoc verification.
 *   --all            Runs field-audit + recalibrate (skips ats-watch).
 *
 * Each mode writes its output to data/ in a date-stamped file; the
 * skill (.claude/skills/ai-detection-hardener/SKILL.md) wraps natural-
 * language invocation.
 *
 * Cost guardrails:
 *   --field-audit: ~$0.08 (4 API calls × ~$0.02)
 *   --recalibrate: ~$0.16-0.40 depending on corpus size
 *   --check:       ~$0.02 per artifact
 *   --ats-watch:   $5-8 (researcher subagent)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkArtifact, checkText } from '../../lib/ai-detection-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env'), override: true });
} catch { /* dotenv optional */ }

const ARGV = process.argv.slice(2);
const FLAGS = new Set(ARGV.filter(a => a.startsWith('--')));
const POSITIONAL = ARGV.filter(a => !a.startsWith('--'));

function usage() {
  console.error(`Usage: node scripts/agents/ai-detection-hardener.mjs [flags]

Flags:
  --field-audit         Re-run detector field-shape audit
  --recalibrate         Re-run calibration baseline
  --check <path>        Check a single artifact via the gate
  --ats-watch           Stub: delegate to /researcher (manual trigger)
  --all                 field-audit + recalibrate

Examples:
  node scripts/agents/ai-detection-hardener.mjs --field-audit
  node scripts/agents/ai-detection-hardener.mjs --recalibrate
  node scripts/agents/ai-detection-hardener.mjs --check apply-pack/048-anthropic-engineering-editorial-lead/cover-letter.md
  node scripts/agents/ai-detection-hardener.mjs --all
`);
}

function runFieldAudit() {
  console.error('[hardener] running field audit...');
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'delta-field-audit.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return res.status === 0;
}

function runRecalibrate() {
  console.error('[hardener] running calibration baseline (--refresh)...');
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'ai-detection-calibrate-baseline.mjs'), '--refresh'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  // Exit code 2 = degenerate baseline (sample too small or human-max >= AI-min).
  // That's expected on the current 5+3 corpus — treat as a warning, not a hard fail.
  return res.status === 0 || res.status === 2;
}

async function runCheck(targetPath) {
  if (!targetPath) {
    console.error('--check requires an artifact path');
    return false;
  }
  const abs = targetPath.startsWith('/') ? targetPath : join(ROOT, targetPath);
  if (!existsSync(abs)) {
    console.error(`artifact not found: ${abs}`);
    return false;
  }
  console.error(`[hardener] running gate on ${abs}...`);
  const r = await checkArtifact(abs, { budgetUsd: 0.10, skipCache: false });
  const summary = {
    file: abs.replace(ROOT + '/', ''),
    band:               r.band,
    passes:             r.passes,
    gateBlocks:         r.gateBlocks,
    degraded:           r.degraded ?? false,
    gptzero_prob:       r.gptzero_prob,
    gptzero_band:       r.gptzero_band,
    gptzero_signal_quality:     r.gptzero_signal_quality,
    originality_prob:   r.originality_prob,
    originality_band:   r.originality_band,
    originality_signal_quality: r.originality_signal_quality,
    flagged_sentence_count:     r.sentence_signals?.highlighted_count ?? 0,
    burstiness:         r.burstiness,
    thresholds_at:      r.thresholds_at,
    prose_word_count:   r.prose_word_count,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log('---TOP 5 FLAGGED SENTENCES---');
  const top = (r.sentences || []).filter(s => typeof s.generated_prob === 'number')
    .sort((a, b) => b.generated_prob - a.generated_prob).slice(0, 5);
  for (const s of top) {
    console.log(`  ${Math.round((s.generated_prob || 0) * 100)}% ${s.highlight_for_ai ? '★' : ' '} ${(s.sentence || '').slice(0, 180)}`);
  }
  return true;
}

function runAtsWatchStub() {
  const msg = `[hardener] --ats-watch is a delegation stub.

The ATS-detection landscape moves slowly (~90-day cadence). Re-running the
landscape watch costs ~$5-8 via the /researcher skill. To run manually:

  /researcher "What ATS-platform AI-detection capabilities have shipped or been announced in the last 90 days? Workday, Greenhouse, Ashby, Lever, iCIMS, Taleo, SuccessFactors. Vendor blog posts + press releases ONLY."

The most recent watch is at data/delta-ats-landscape-watch-2026-05-19.md.
Re-running before 2026-08-19 is unlikely to surface material changes.

This stub does NOT auto-run /researcher — manual trigger only.
`;
  writeFileSync(join(ROOT, 'data', 'delta-ats-watch-runner-2026-05-19.md'), msg);
  console.log(msg);
  return true;
}

async function main() {
  if (FLAGS.size === 0) { usage(); process.exit(1); }

  let ok = true;

  if (FLAGS.has('--all') || FLAGS.has('--field-audit')) {
    ok = ok && runFieldAudit();
  }
  if (FLAGS.has('--all') || FLAGS.has('--recalibrate')) {
    ok = ok && runRecalibrate();
  }
  if (FLAGS.has('--check')) {
    const target = POSITIONAL[0];
    ok = ok && await runCheck(target);
  }
  if (FLAGS.has('--ats-watch')) {
    ok = ok && runAtsWatchStub();
  }

  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error('[hardener] fatal:', e); process.exit(1); });
