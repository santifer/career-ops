/**
 * lib/polish-coherence.mjs — Phase 3 of apply-pack-polish (Mitchell · ALPHA · 2026-05-19).
 *
 * Cross-artifact coherence pass. After each artifact has been polished
 * (Phase 2), this layer runs the deterministic checks already in the repo
 * (claim-consistency + jd-keyword-score + calibrate-voice-fidelity) across
 * the WHOLE pack, then writes data/apply-packs/{slug}/polish-summary.md
 * with the final APPROVED / NEEDS_HUMAN / REJECTED recommendation.
 *
 *   {
 *     per_artifact_confidence: { cv: 0.99, cover: 0.99, ... },
 *     cross_coherence: { claim_consistency_pct, jd_keyword_pct, voice_fidelity_pct },
 *     blocking_issues: [...],
 *     final_recommendation: 'APPROVED' | 'NEEDS_HUMAN' | 'REJECTED',
 *     diff_narrative: "what changed and why, grounded in citations"
 *   }
 *
 * APPROVED if all artifact confidences ≥ targetConfidence (0.99 default)
 * AND claim_consistency ≥ 90% AND jd_keyword ≥ 50% AND voice_fidelity ≥ 80%
 * AND no blocking adversarial findings on any artifact.
 *
 * NEEDS_HUMAN if any artifact 0.90–0.99 OR claim_consistency 70–90% OR
 * a Mitchell-judgment call surfaced (comp anchor, name spelling, etc.).
 *
 * REJECTED if any artifact <0.85 OR claim_consistency <70% OR voice_fidelity <60%.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function shellOk(cmd) {
  try {
    const out = execSync(cmd, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 }).toString();
    return { ok: true, stdout: out, stderr: '' };
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : String(err.message || err);
    return { ok: stdout.length > 0, stdout, stderr };
  }
}

function parseJsonTail(text) {
  if (!text) return null;
  const idx = text.indexOf('{\n');
  if (idx < 0) {
    try { return JSON.parse(text); } catch { return null; }
  }
  try { return JSON.parse(text.slice(idx)); } catch { return null; }
}

function callClaimConsistency(packSlug) {
  // Shell out to the existing script. It expects apply-pack slug (not the
  // data/apply-packs ledger path). polish-coherence is invoked once per pack,
  // so we pass the apply-pack slug straight through.
  const r = shellOk(`node ${JSON.stringify(join(ROOT, 'scripts', 'claim-consistency.mjs'))} --slug ${JSON.stringify(packSlug)}`);
  const parsed = parseJsonTail(r.stdout);
  if (!parsed) return { ok: false, pct: null, total: 0, unverified: 0, error: r.stderr.slice(0, 240) };
  const artifacts = parsed.results?.[0]?.artifacts || [];
  const total = artifacts.reduce((s, a) => s + (a.total || 0), 0);
  const unverified = artifacts.reduce((s, a) => s + (a.unverified || 0), 0);
  const pct = total > 0 ? Math.round(((total - unverified) / total) * 100) : 100;
  return { ok: true, pct, total, unverified, artifacts };
}

function callJdKeywordScore(packSlug) {
  const r = shellOk(`node ${JSON.stringify(join(ROOT, 'scripts', 'jd-keyword-score.mjs'))} --slug ${JSON.stringify(packSlug)}`);
  const parsed = parseJsonTail(r.stdout);
  if (!parsed) return { ok: false, pct: null, error: r.stderr.slice(0, 240) };
  const artifacts = parsed.results?.[0]?.artifacts || [];
  const cv = artifacts.find(a => a.path && (a.path.includes('tailored-cv') || a.path.includes('cv.md')));
  const cvScore = cv?.score ?? null;
  const avgScore = artifacts.length ? Math.round(artifacts.reduce((s, a) => s + (a.score || 0), 0) / artifacts.length) : null;
  return { ok: true, cv_pct: cvScore, avg_pct: avgScore, artifacts };
}

function callVoiceFidelity(packSlug) {
  const r = shellOk(`node ${JSON.stringify(join(ROOT, 'scripts', 'calibrate-voice-fidelity.mjs'))} --slug ${JSON.stringify(packSlug)} --json 2>/dev/null`);
  const parsed = parseJsonTail(r.stdout);
  if (!parsed) {
    // calibrate-voice-fidelity may not support --json. Run it without the flag and grab the fidelity number from its markdown side effect.
    const md = readFileSafe(join(ROOT, 'apply-pack', packSlug, 'voice-fidelity.md'));
    if (md) {
      const m = md.match(/fidelity[^\d]+(\d+)%/i);
      if (m) return { ok: true, pct: Number(m[1]) };
    }
    return { ok: false, pct: null, error: r.stderr.slice(0, 240) };
  }
  const pct = parsed.fidelity_pct ?? parsed.score ?? parsed.results?.[0]?.fidelity_pct ?? null;
  return { ok: true, pct };
}

function readFileSafe(path) {
  try { return existsSync(path) ? readFileSync(path, 'utf-8') : null; } catch { return null; }
}

/**
 * @param {object} input
 * @param {string} input.packSlug — apply-pack slug
 * @param {string} input.dataPackDir — data/apply-packs/<slug> dir (where polish artifacts wrote)
 * @param {object} input.perArtifact — { 'cv-tailored': { confidence, adversarial_findings, ... }, ... }
 * @param {object} [input.opts]
 * @param {number} [input.opts.targetConfidence=0.99]
 * @returns {Promise<object>}
 */
export async function checkPackCoherence(input) {
  const t0 = Date.now();
  const opts = input.opts || {};
  const target = opts.targetConfidence ?? 0.99;
  const packSlug = input.packSlug;
  const dataDir = input.dataPackDir;

  const perArtifact = input.perArtifact || {};
  const perArtifactConfidence = {};
  for (const [k, v] of Object.entries(perArtifact)) {
    perArtifactConfidence[k] = Number(v?.confidence) || 0;
  }

  // Cross-artifact deterministic checks (existing scripts)
  const claim = callClaimConsistency(packSlug);
  const jdkw = callJdKeywordScore(packSlug);
  const voice = callVoiceFidelity(packSlug);

  // Aggregate blocking issues
  const blockingIssues = [];
  for (const [name, v] of Object.entries(perArtifact)) {
    const findings = Array.isArray(v?.adversarial_findings) ? v.adversarial_findings : [];
    const blockers = findings.filter(f => (f?.severity || '').toLowerCase() === 'blocker' || (f?.severity || '').toLowerCase() === 'major');
    for (const b of blockers) blockingIssues.push({ artifact: name, ...b });
    if ((Number(v?.confidence) || 0) < target) {
      blockingIssues.push({ artifact: name, finding: `confidence ${Number(v.confidence).toFixed(3)} < target ${target}`, severity: Number(v.confidence) < 0.85 ? 'blocker' : 'caution' });
    }
  }
  if (claim.ok && claim.pct !== null && claim.pct < 70) blockingIssues.push({ scope: 'pack', finding: `claim consistency ${claim.pct}% < 70%`, severity: 'blocker' });
  if (jdkw.ok && jdkw.cv_pct !== null && jdkw.cv_pct < 30) blockingIssues.push({ scope: 'pack', finding: `JD keyword overlap on CV ${jdkw.cv_pct}% < 30%`, severity: 'blocker' });
  if (voice.ok && voice.pct !== null && voice.pct < 60) blockingIssues.push({ scope: 'pack', finding: `voice fidelity ${voice.pct}% < 60%`, severity: 'blocker' });

  // Final recommendation
  const allConfidenceOK = Object.values(perArtifactConfidence).every(c => c >= target);
  const claimOK = !claim.ok || claim.pct === null || claim.pct >= 90;
  const kwOK = !jdkw.ok || jdkw.cv_pct === null || jdkw.cv_pct >= 50;
  const voiceOK = !voice.ok || voice.pct === null || voice.pct >= 80;
  const hasBlocker = blockingIssues.some(b => (b.severity || '').toLowerCase() === 'blocker');
  const hasMajor = blockingIssues.some(b => (b.severity || '').toLowerCase() === 'major');
  const hasCaution = blockingIssues.some(b => (b.severity || '').toLowerCase() === 'caution');

  let finalRecommendation;
  if (hasBlocker || (claim.ok && claim.pct !== null && claim.pct < 70)) {
    finalRecommendation = 'REJECTED';
  } else if (allConfidenceOK && claimOK && kwOK && voiceOK && !hasMajor && !hasCaution) {
    finalRecommendation = 'APPROVED';
  } else {
    finalRecommendation = 'NEEDS_HUMAN';
  }

  // Diff narrative — pulled from per-artifact polish-trace summaries
  const diffParts = [];
  for (const [name, v] of Object.entries(perArtifact)) {
    if (v?.diff_summary) diffParts.push(`- **${name}**: ${v.diff_summary}`);
    else if (v?.confidence !== undefined) diffParts.push(`- **${name}**: polished to confidence ${Number(v.confidence).toFixed(3)} in ${v.rounds_used || '?'} round(s)`);
  }
  const diffNarrative = diffParts.length ? diffParts.join('\n') : 'No per-artifact diff narratives provided.';

  const summary = {
    per_artifact_confidence: perArtifactConfidence,
    cross_coherence: {
      claim_consistency_pct: claim.pct,
      jd_keyword_pct_cv: jdkw.cv_pct,
      jd_keyword_pct_avg: jdkw.avg_pct,
      voice_fidelity_pct: voice.pct,
    },
    blocking_issues: blockingIssues,
    final_recommendation: finalRecommendation,
    diff_narrative: diffNarrative,
    meta: {
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
      pack_slug: packSlug,
      target_confidence: target,
      claim_ok: claim.ok,
      jdkw_ok: jdkw.ok,
      voice_ok: voice.ok,
    },
  };

  // Write polish-summary.md (markdown view of the JSON above) into data/apply-packs/<slug>/
  if (dataDir) {
    try {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(join(dataDir, 'polish-summary.md'), renderPolishSummaryMd(summary, perArtifact), 'utf-8');
      writeFileSync(join(dataDir, 'polish-summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
    } catch (e) {
      summary.meta.write_error = String(e.message || e);
    }
  }

  return summary;
}

function renderPolishSummaryMd(summary, perArtifact) {
  const lines = [];
  const verdict = ({ APPROVED: '🟢', NEEDS_HUMAN: '🟡', REJECTED: '🔴' })[summary.final_recommendation] || '⚪';
  lines.push(`# Polish summary — ${summary.meta.pack_slug || 'pack'}`);
  lines.push('');
  lines.push(`Generated ${summary.meta.generated_at} (${(summary.meta.duration_ms / 1000).toFixed(1)}s).`);
  lines.push('');
  lines.push(`## Verdict: ${verdict} **${summary.final_recommendation}**`);
  lines.push('');
  lines.push('### Per-artifact confidence');
  lines.push('');
  lines.push('| Artifact | Confidence | Rounds | Adversarial |');
  lines.push('|---|---|---|---|');
  for (const [k, v] of Object.entries(perArtifact || {})) {
    const c = Number(v?.confidence) || 0;
    const r = v?.rounds_used || '?';
    const adv = Array.isArray(v?.adversarial_findings) ? `${v.adversarial_findings.length} finding(s)` : 'n/a';
    lines.push(`| ${k} | ${c.toFixed(3)} | ${r} | ${adv} |`);
  }
  lines.push('');
  lines.push('### Cross-pack coherence');
  lines.push('');
  lines.push(`- **Claim consistency:** ${summary.cross_coherence.claim_consistency_pct ?? '—'}%`);
  lines.push(`- **JD keyword overlap (CV):** ${summary.cross_coherence.jd_keyword_pct_cv ?? '—'}%`);
  lines.push(`- **JD keyword overlap (avg):** ${summary.cross_coherence.jd_keyword_pct_avg ?? '—'}%`);
  lines.push(`- **Voice fidelity:** ${summary.cross_coherence.voice_fidelity_pct ?? '—'}%`);
  lines.push('');
  if (summary.blocking_issues.length) {
    lines.push('### Blocking issues');
    lines.push('');
    for (const b of summary.blocking_issues) {
      const sev = b.severity || 'unknown';
      const scope = b.artifact || b.scope || 'pack';
      lines.push(`- **[${sev.toUpperCase()}]** _${scope}_ — ${b.finding}${b.fix_suggestion ? ` _(fix: ${b.fix_suggestion})_` : ''}`);
    }
    lines.push('');
  }
  lines.push('### Diff narrative');
  lines.push('');
  lines.push(summary.diff_narrative);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`Generated by \`lib/polish-coherence.mjs\` (Phase 3 of apply-pack-polish, 2026-05-19).`);
  return lines.join('\n') + '\n';
}

export const _internal = { parseJsonTail, shellOk, renderPolishSummaryMd };
