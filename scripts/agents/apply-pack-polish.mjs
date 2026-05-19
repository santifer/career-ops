#!/usr/bin/env node
/**
 * scripts/agents/apply-pack-polish.mjs — Apply-pack polish orchestrator.
 *
 * Mitchell · ALPHA overnight haul · 2026-05-19.
 *
 * Runs the 3-phase polish pipeline on ONE apply pack:
 *   PHASE 1 — signal harvest (lib/polish-signals.mjs)
 *   PHASE 2 — per-artifact polish loop (lib/polish-loop.mjs)
 *             over up to 6 artifacts: cv-tailored, cover-letter,
 *             form-fields, impact-doc, references, referrals
 *   PHASE 3 — cross-artifact coherence + polish-summary.md
 *             (lib/polish-coherence.mjs)
 *
 * CLI:
 *   node scripts/agents/apply-pack-polish.mjs \
 *     --row 044 \
 *     --target-confidence 0.99 \
 *     --artifacts cv,cover,form,impact,refs,referrals \
 *     --cost-cap 500 \
 *     [--no-cache]
 *
 * Defaults: all 6 artifacts, target 0.99, $500 cap (quality-first).
 * Honors POLISH_COST_CAP_USD env override.
 *
 * Emits NDJSON progress to stderr (one line per phase/round) so the
 * dashboard SSE endpoint can stream it. Emits a final JSON summary on
 * stdout.
 *
 * Cost cap: $500/pack default (raised from the spec's $25 floor per
 * Decision-Maximization quality-first policy).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* dotenv optional */ }

import { harvestPolishSignals } from '../../lib/polish-signals.mjs';
import { polishArtifact } from '../../lib/polish-loop.mjs';
import { checkPackCoherence } from '../../lib/polish-coherence.mjs';
import { initCostTrace } from '../../lib/council.mjs';
import { runImpactDoc } from './impact-doc.mjs';
import { runReferences } from './references.mjs';
import { runReferrals } from './referrals.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const ARTIFACT_MAP = {
  cv: { kind: 'cv-tailored', srcFile: 'tailored-cv.md', dataFile: 'cv-tailored.md', regenerator: 'cv-tailor' },
  cover: { kind: 'cover-letter', srcFile: 'cover-letter.md', dataFile: 'cover-letter.md', regenerator: 'cover-letter' },
  form: { kind: 'form-fields', srcFile: 'form-fields.md', dataFile: 'form-fields.md', regenerator: 'form-fields' },
  impact: { kind: 'impact-doc', srcFile: 'impact-doc.md', dataFile: 'impact-doc.md', regenerator: 'impact-doc' },
  refs: { kind: 'references', srcFile: 'references.md', dataFile: 'references.md', regenerator: 'references' },
  referrals: { kind: 'referrals', srcFile: 'referrals.md', dataFile: 'referrals.md', regenerator: 'referrals' },
};

const DEFAULT_ARTIFACTS = ['cv', 'cover', 'form', 'impact', 'refs', 'referrals'];

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function findPackByRow(rowId) {
  const apqPath = join(ROOT, 'data', 'apply-now-queue.json');
  let row = null;
  if (existsSync(apqPath)) {
    try {
      const apq = JSON.parse(readFileSync(apqPath, 'utf-8'));
      const ranked = apq.ranked || [];
      row = ranked.find(r => Number(r.num) === Number(rowId)) || null;
    } catch { /* */ }
  }
  if (!row) return null;
  const company = row.company || row.Company || '';
  const role = row.role || row.Role || '';
  const padded = String(rowId).padStart(3, '0');
  const slug = `${padded}-${slugify(company)}-${slugify(role)}`;
  return { row, company, role, slug, url: row.url || row.URL || '' };
}

function discoverPackBySlugLike(slugFragment) {
  // Fallback: scan apply-pack/ for a directory containing the fragment
  const dir = join(ROOT, 'apply-pack');
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir).filter(d => {
    try { return statSync(join(dir, d)).isDirectory(); } catch { return false; }
  });
  const hit = entries.find(d => d.includes(slugFragment));
  if (!hit) return null;
  // Parse "044-anthropic-communications-lead-claude-code" into row+rest
  const m = hit.match(/^(\d{3,})-(.+)$/);
  const rowId = m ? Number(m[1]) : 0;
  return { row: null, company: '', role: '', slug: hit, url: '', rowId };
}

function readArtifactSrc(packSlug, artifactConf) {
  const p = join(ROOT, 'apply-pack', packSlug, artifactConf.srcFile);
  if (existsSync(p)) return readFileSync(p, 'utf-8');
  return null;
}

function readJdText(packSlug) {
  // Try apply-pack/<slug>/jd.md, apply-pack/<slug>/README.md (Apply pack README often has the JD)
  const candidates = ['jd.md', 'JD.md', 'job-description.md', 'README.md'];
  for (const f of candidates) {
    const p = join(ROOT, 'apply-pack', packSlug, f);
    if (existsSync(p)) return readFileSync(p, 'utf-8');
  }
  // Try jds/<slug>.md
  const jdsDir = join(ROOT, 'jds');
  if (existsSync(jdsDir)) {
    const m = readdirSync(jdsDir).find(f => f.toLowerCase().includes(packSlug.split('-').slice(1, 3).join('-')));
    if (m) return readFileSync(join(jdsDir, m), 'utf-8');
  }
  return '';
}

function readHmIntel(company, role) {
  const slug = `${slugify(company)}-${slugify(role)}`;
  const dir = join(ROOT, 'data', 'hm-intel');
  const direct = join(dir, `${slug}.json`);
  if (existsSync(direct)) return JSON.parse(readFileSync(direct, 'utf-8'));
  // Try fuzzy match
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    const hit = files.find(f => f.includes(slugify(role)) && f.includes(slugify(company).split('-')[0]));
    if (hit) {
      try { return JSON.parse(readFileSync(join(dir, hit), 'utf-8')); } catch { return null; }
    }
  }
  return null;
}

function emitProgress(obj) {
  // NDJSON to stderr — the dashboard SSE endpoint forwards stderr lines to clients
  try { process.stderr.write(JSON.stringify({ t: new Date().toISOString(), ...obj }) + '\n'); } catch { /* */ }
}

async function generateIfMissing({ kind, packSlug, dataDir, packInfo, hmIntel, jdText }) {
  // For NEW artifacts (impact-doc, references, referrals), generate via the new agents.
  // For EXISTING artifacts (cv-tailored, cover-letter, form-fields), use whatever's
  // already in apply-pack/<slug>/.
  if (kind === 'impact-doc') {
    const r = await runImpactDoc({
      pack: { jd: { jd_text: jdText, company: packInfo.company, role: packInfo.role }, meta: { row_id: packInfo.rowId } },
      config: { dryRun: false },
      context: { hmIntel },
    });
    if (r.status === 'ok' && r.output?.path) {
      return readFileSync(join(ROOT, r.output.path), 'utf-8');
    }
    return null;
  }
  if (kind === 'references') {
    const r = await runReferences({
      pack: { jd: { jd_text: jdText, company: packInfo.company, role: packInfo.role }, meta: { row_id: packInfo.rowId } },
      config: { dryRun: false },
      context: { hmIntel },
    });
    if (r.status === 'ok' && r.output?.path) return readFileSync(join(ROOT, r.output.path), 'utf-8');
    return null;
  }
  if (kind === 'referrals') {
    const r = await runReferrals({
      pack: { jd: { company: packInfo.company, role: packInfo.role, url: packInfo.url }, meta: { row_id: packInfo.rowId } },
      config: { dryRun: false },
      context: { hmIntel },
    });
    if (r.status === 'ok' && r.output?.path) return readFileSync(join(ROOT, r.output.path), 'utf-8');
    return null;
  }
  return null;
}

/**
 * Run polish on ONE apply pack.
 *
 * @param {object} opts
 * @param {number|string} [opts.row] — row id (preferred)
 * @param {string} [opts.slugFragment] — fallback when row is unknown
 * @param {string[]} [opts.artifacts] — short keys: cv, cover, form, impact, refs, referrals
 * @param {number} [opts.targetConfidence=0.99]
 * @param {number} [opts.costCap=500]
 * @param {boolean} [opts.noCache=false]
 * @param {number} [opts.maxRoundsPerArtifact=6]
 * @returns {Promise<object>}
 */
export async function runPolishPack(opts = {}) {
  const t0 = Date.now();
  const artifacts = (opts.artifacts && opts.artifacts.length) ? opts.artifacts : DEFAULT_ARTIFACTS;
  const target = opts.targetConfidence ?? 0.99;
  const envCap = Number(process.env.POLISH_COST_CAP_USD);
  const costCap = Number.isFinite(opts.costCap) ? opts.costCap : (Number.isFinite(envCap) ? envCap : 500);
  const noCache = opts.noCache === true;
  const maxRounds = opts.maxRoundsPerArtifact ?? 6;

  let packInfo;
  if (opts.row) {
    packInfo = findPackByRow(opts.row);
    if (!packInfo) {
      // Fallback to slug-fragment discovery if apply-now-queue is missing the row
      const padded = String(opts.row).padStart(3, '0');
      const discovered = discoverPackBySlugLike(padded);
      if (discovered) packInfo = { ...discovered, rowId: Number(opts.row) };
    }
    if (packInfo && !packInfo.rowId) packInfo.rowId = Number(opts.row);
  } else if (opts.slugFragment) {
    packInfo = discoverPackBySlugLike(opts.slugFragment);
  }
  if (!packInfo) return { status: 'error', error: `pack not found for row=${opts.row} slug=${opts.slugFragment}`, duration_ms: Date.now() - t0 };

  emitProgress({ phase: 'init', pack: packInfo.slug, artifacts, target_confidence: target, cost_cap_usd: costCap });

  const dataDir = join(ROOT, 'data', 'apply-packs', packInfo.slug);
  mkdirSync(dataDir, { recursive: true });

  // ── Cost trace (Mitchell decision α.2) ─────────────────────────────────────
  // initCostTrace returns an opts.onCostRecord callback. Pass it through every
  // callCouncil invocation (directly and via harvestPolishSignals / polishArtifact)
  // so per-call cost is logged to data/polish-cost-trace-<date>.json.
  // The callback is best-effort — a trace write failure never blocks polish.
  const onCostRecord = initCostTrace('apply-pack-polish', ROOT);

  const jdText = readJdText(packInfo.slug);
  const hmIntel = readHmIntel(packInfo.company, packInfo.role);
  const cvText = existsSync(join(ROOT, 'cv.md')) ? readFileSync(join(ROOT, 'cv.md'), 'utf-8') : '';
  const articleDigest = existsSync(join(ROOT, 'article-digest.md')) ? readFileSync(join(ROOT, 'article-digest.md'), 'utf-8') : '';
  const voiceBrief = existsSync(join(ROOT, 'data', 'voice-reference-brief.md')) ? readFileSync(join(ROOT, 'data', 'voice-reference-brief.md'), 'utf-8') : '';

  /* ---------- PHASE 1 — signal harvest ---------- */
  emitProgress({ phase: 'phase-1', step: 'harvesting-signals', pack: packInfo.slug });
  const signals = await harvestPolishSignals({
    slug: packInfo.slug,
    company: packInfo.company,
    role: packInfo.role,
    jdText,
    opts: { refresh: noCache, costCap: 40, onCostRecord, phase: 'phase-1' },
  });
  emitProgress({ phase: 'phase-1', step: 'signals-ready', priorities: signals.hiring_manager_priorities?.length || 0, pruned: signals.dealbreaker_pruned?.length || 0, cost_usd: signals.meta?.cost_usd ?? 0, cache: signals.meta?.cache });

  /* ---------- PHASE 2 — per-artifact polish loop ---------- */
  const perArtifact = {};
  let cumulativeCost = signals.meta?.cost_usd || 0;
  for (const key of artifacts) {
    const conf = ARTIFACT_MAP[key];
    if (!conf) {
      emitProgress({ phase: 'phase-2', artifact: key, error: 'unknown artifact key' });
      continue;
    }

    if (cumulativeCost >= costCap) {
      emitProgress({ phase: 'phase-2', artifact: key, skipped: 'cost-cap-reached', cumulative: cumulativeCost });
      perArtifact[conf.kind] = { confidence: 0, rounds_used: 0, error: 'cost-cap-reached-before-artifact', skipped: true };
      continue;
    }

    let srcText = readArtifactSrc(packInfo.slug, conf);
    if (!srcText && ['impact-doc', 'references', 'referrals'].includes(conf.kind)) {
      emitProgress({ phase: 'phase-2', artifact: conf.kind, step: 'generating-from-scratch' });
      srcText = await generateIfMissing({ kind: conf.kind, packSlug: packInfo.slug, dataDir, packInfo, hmIntel, jdText });
      if (srcText) {
        // Also write to apply-pack/<slug>/ so downstream consumers find it
        try {
          const dest = join(ROOT, 'apply-pack', packInfo.slug, conf.srcFile);
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, srcText, 'utf-8');
        } catch (e) {
          emitProgress({ phase: 'phase-2', artifact: conf.kind, warning: `failed to mirror to apply-pack: ${String(e.message || e)}` });
        }
      }
    }
    if (!srcText) {
      emitProgress({ phase: 'phase-2', artifact: conf.kind, error: 'no-source-and-no-generator' });
      perArtifact[conf.kind] = { confidence: 0, rounds_used: 0, error: 'no-source-text' };
      continue;
    }

    emitProgress({ phase: 'phase-2', artifact: conf.kind, step: 'polish-loop-start', src_len: srcText.length });

    const tracePath = join(dataDir, `polish-trace-${conf.kind}.md`);
    let polish;
    try {
      polish = await polishArtifact({
        artifactKind: conf.kind,
        artifactText: srcText,
        signals,
        cvText, articleDigest, voiceBrief,
        opts: {
          targetConfidence: target,
          maxRounds,
          outerRetries: 3,
          costCap: Math.max(10, Math.min(120, (costCap - cumulativeCost) / Math.max(artifacts.length - Object.keys(perArtifact).length, 1))),
          tracePath,
          onCostRecord,                 // Mitchell decision α.2 — pass cost trace callback
          phase: 'phase-2',
          artifactSlug: conf.kind,
          onSignalsRefresh: async () => {
            const refreshed = await harvestPolishSignals({
              slug: packInfo.slug,
              company: packInfo.company,
              role: packInfo.role,
              jdText,
              opts: { refresh: true, costCap: 50, onCostRecord, phase: 'phase-2-refresh' },
            });
            return refreshed;
          },
        },
      });
    } catch (e) {
      polish = { confidence: 0, rounds_used: 0, error: String(e.message || e), final_artifact_text: srcText, adversarial_findings: [], cost_usd: 0 };
    }

    // Write polished artifact back to BOTH locations: data/apply-packs/<slug>/<dataFile>.md (canonical agent output)
    // and apply-pack/<slug>/<srcFile>.md (consumer-facing). Mirror so renderer + dashboard see polish.
    try {
      writeFileSync(join(dataDir, conf.dataFile), polish.final_artifact_text || srcText, 'utf-8');
      // Mirror to consumer location ONLY if confidence ≥ target — don't overwrite
      // a human-reviewed artifact with a non-converged polish attempt
      if (polish.confidence >= target) {
        const dest = join(ROOT, 'apply-pack', packInfo.slug, conf.srcFile);
        if (existsSync(dirname(dest))) writeFileSync(dest, polish.final_artifact_text || srcText, 'utf-8');
      }
    } catch (e) {
      emitProgress({ phase: 'phase-2', artifact: conf.kind, warning: `failed to write polished artifact: ${String(e.message || e)}` });
    }

    cumulativeCost += polish.cost_usd || 0;
    perArtifact[conf.kind] = {
      confidence: polish.confidence,
      rounds_used: polish.rounds_used,
      adversarial_findings: polish.adversarial_findings || [],
      cost_usd: polish.cost_usd || 0,
      duration_ms: polish.duration_ms || 0,
      converged: polish.converged === true,
      error: polish.error || null,
      trace_path: tracePath.replace(ROOT + '/', ''),
    };
    emitProgress({
      phase: 'phase-2', artifact: conf.kind, step: 'polish-loop-done',
      confidence: polish.confidence,
      converged: polish.converged === true,
      rounds: polish.rounds_used,
      adversarial: (polish.adversarial_findings || []).length,
      cost_usd: polish.cost_usd || 0,
      cumulative_cost_usd: cumulativeCost,
    });
  }

  /* ---------- PHASE 3 — cross-artifact coherence ---------- */
  emitProgress({ phase: 'phase-3', step: 'coherence-checks-start', pack: packInfo.slug });
  let coherence;
  try {
    coherence = await checkPackCoherence({
      packSlug: packInfo.slug,
      dataPackDir: dataDir,
      perArtifact,
      opts: { targetConfidence: target },
    });
  } catch (e) {
    coherence = {
      final_recommendation: 'NEEDS_HUMAN',
      blocking_issues: [{ scope: 'pack', finding: `coherence error: ${String(e.message || e)}`, severity: 'caution' }],
      per_artifact_confidence: Object.fromEntries(Object.entries(perArtifact).map(([k, v]) => [k, v.confidence || 0])),
      cross_coherence: {},
      diff_narrative: 'coherence layer failed',
      meta: { error: String(e.message || e) },
    };
  }
  emitProgress({ phase: 'phase-3', step: 'coherence-done', final_recommendation: coherence.final_recommendation, blocking: coherence.blocking_issues?.length || 0 });

  const summary = {
    ok: true,
    pack_slug: packInfo.slug,
    row_id: packInfo.rowId,
    company: packInfo.company,
    role: packInfo.role,
    target_confidence: target,
    cost_cap_usd: costCap,
    total_cost_usd: Math.round(cumulativeCost * 10000) / 10000,
    duration_ms: Date.now() - t0,
    artifacts: perArtifact,
    coherence,
    signals_meta: signals.meta || null,
    final_recommendation: coherence.final_recommendation,
  };

  // Persist the orchestrator-level summary alongside polish-summary.md
  try {
    writeFileSync(join(dataDir, 'polish-orchestrator-summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  } catch { /* */ }

  return summary;
}

/* ----------------------------------- CLI ----------------------------------- */
async function cliMain() {
  const args = process.argv.slice(2);
  function arg(f, fb) { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : fb; }
  function flag(f) { return args.includes(f); }

  if (flag('--help') || flag('-h')) {
    process.stdout.write(`Usage: node scripts/agents/apply-pack-polish.mjs --row <N> [--artifacts cv,cover,form,impact,refs,referrals] [--target-confidence 0.99] [--cost-cap 500] [--no-cache]\n`);
    process.exit(0);
  }

  const row = arg('--row', null);
  const slugFragment = arg('--slug', null);
  const artifactsArg = arg('--artifacts', '');
  const targetConfidence = Number(arg('--target-confidence', '0.99'));
  const costCap = Number(arg('--cost-cap', '500'));
  const noCache = flag('--no-cache');
  const artifacts = artifactsArg ? artifactsArg.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_ARTIFACTS;

  const out = await runPolishPack({
    row,
    slugFragment,
    artifacts,
    targetConfidence,
    costCap,
    noCache,
  });

  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(out.ok === true ? 0 : 1);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) cliMain().catch(err => { process.stderr.write(`FATAL: ${err.stack || err}\n`); process.exit(2); });
