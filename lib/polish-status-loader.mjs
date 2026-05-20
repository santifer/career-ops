/**
 * lib/polish-status-loader.mjs
 *
 * Reads every polish-orchestrator-summary.json under data/apply-packs/ and
 * builds a row-id-keyed map of polish verdicts for the dashboard + heartbeat
 * email to consume.
 *
 * Output shape (per row):
 *   {
 *     row_id: 44,
 *     pack_slug: "044-anthropic-communications-lead-claude-code",
 *     verdict: "APPROVED" | "NEEDS_HUMAN" | "REJECTED" | null,
 *     polished_at: "2026-05-20T00:56:49.034Z",
 *     polished_at_ago: "2h ago",
 *     overall_confidence: 0.42,
 *     target_confidence: 0.99,
 *     cost_usd: 16.5,
 *     duration_ms: 2395575,
 *     per_artifact: {
 *       "cv-tailored": { confidence, rounds_used, converged, early_abandoned, cost_usd },
 *       ...
 *     },
 *     blocking_issues: [{ artifact, finding, severity, early_abandoned }],
 *     any_early_abandoned: true|false,
 *     status_icon: "🟢" | "🟡" | "🔴" | "⏸" | "⚪",
 *     status_label: "Approved" | "Needs human" | "Rejected" | "Abandoned" | "Never polished"
 *   }
 *
 * "Never polished" rows are NOT in the map — callers should treat missing as
 * status_icon=⚪. The dashboard renders missing as a faint dot.
 *
 * Cost tracking note: total_cost_usd in the summary is sometimes 0 due to a
 * known accounting gap; we also compute a fallback from the per-artifact
 * cost_usd values, which are accurate.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APPLY_PACKS_DIR = join(ROOT, 'data/apply-packs');

const VERDICT_TO_ICON = {
  APPROVED: '🟢',
  NEEDS_HUMAN: '🟡',
  REJECTED: '🔴',
};
const VERDICT_TO_LABEL = {
  APPROVED: 'Approved',
  NEEDS_HUMAN: 'Needs human',
  REJECTED: 'Rejected',
};

function formatAgo(iso) {
  const t = Date.parse(iso);
  if (!isFinite(t)) return 'unknown';
  const min = (Date.now() - t) / 60000;
  if (min < 1) return 'just now';
  if (min < 60) return `${Math.round(min)}m ago`;
  if (min < 1440) return `${(min / 60).toFixed(1)}h ago`;
  return `${Math.floor(min / 1440)}d ago`;
}

function parseRowIdFromSlug(slug) {
  const m = String(slug).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Load one polish-orchestrator-summary.json into the normalized shape.
 * Returns null if the file is missing or malformed.
 */
export function loadOnePolishStatus(packSlug) {
  const path = join(APPLY_PACKS_DIR, packSlug, 'polish-orchestrator-summary.json');
  if (!existsSync(path)) return null;
  let raw;
  try { raw = JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
  if (!raw || !raw.coherence) return null;

  const verdict = raw.coherence.final_recommendation || null;
  const perArtifact = {};
  let summedCost = 0;
  let anyEarlyAbandoned = false;
  for (const [name, a] of Object.entries(raw.artifacts || {})) {
    perArtifact[name] = {
      confidence: Number(a.confidence) || 0,
      rounds_used: a.rounds_used || 0,
      converged: a.converged === true,
      early_abandoned: a.early_abandoned === true,
      cost_usd: Number(a.cost_usd) || 0,
      trace_path: a.trace_path || null,
    };
    if (a.early_abandoned === true) anyEarlyAbandoned = true;
    summedCost += Number(a.cost_usd) || 0;
  }

  // Fallback cost: the summary's total_cost_usd is sometimes 0 due to an
  // accounting gap, so prefer the summed per-artifact cost when it's higher.
  const cost_usd = Math.max(Number(raw.total_cost_usd) || 0, summedCost);

  const overallConfidence = raw.coherence.per_artifact_confidence
    ? Math.min(...Object.values(raw.coherence.per_artifact_confidence).map(c => Number(c) || 0))
    : null;

  const polished_at = raw.coherence.meta?.generated_at || null;

  // Status icon + label — if all-abandoned, use ⏸ regardless of verdict
  // (Mitchell sees "we stopped early" instead of "polish rejected this").
  const allArtifactsAbandoned = Object.values(perArtifact).length > 0 &&
    Object.values(perArtifact).every(a => a.early_abandoned === true);
  let status_icon = VERDICT_TO_ICON[verdict] || '⚪';
  let status_label = VERDICT_TO_LABEL[verdict] || 'Unknown';
  if (allArtifactsAbandoned) {
    status_icon = '⏸';
    status_label = 'Abandoned early';
  }

  return {
    row_id: raw.row_id ?? parseRowIdFromSlug(packSlug),
    pack_slug: packSlug,
    company: raw.company || null,
    role: raw.role || null,
    verdict,
    polished_at,
    polished_at_ago: polished_at ? formatAgo(polished_at) : null,
    overall_confidence: overallConfidence,
    target_confidence: Number(raw.target_confidence) || 0.99,
    cost_usd: +cost_usd.toFixed(4),
    duration_ms: Number(raw.duration_ms) || 0,
    per_artifact: perArtifact,
    blocking_issues: Array.isArray(raw.coherence.blocking_issues) ? raw.coherence.blocking_issues : [],
    any_early_abandoned: anyEarlyAbandoned,
    status_icon,
    status_label,
  };
}

/**
 * Load all polish statuses across data/apply-packs/.
 * Returns:
 *   {
 *     byRowId: Map<number, status>,
 *     bySlug:  Map<string, status>,
 *     all: status[]    // sorted by polished_at desc
 *   }
 */
export function loadAllPolishStatus({ ignoreMissing = true } = {}) {
  const byRowId = new Map();
  const bySlug = new Map();
  const all = [];

  if (!existsSync(APPLY_PACKS_DIR)) return { byRowId, bySlug, all };

  let entries;
  try { entries = readdirSync(APPLY_PACKS_DIR); } catch { return { byRowId, bySlug, all }; }

  for (const entry of entries) {
    let st;
    try { st = statSync(join(APPLY_PACKS_DIR, entry)); } catch { continue; }
    if (!st.isDirectory()) continue;
    const status = loadOnePolishStatus(entry);
    if (!status) {
      if (!ignoreMissing) {
        all.push({ pack_slug: entry, row_id: parseRowIdFromSlug(entry), verdict: null, status_icon: '⚪', status_label: 'Never polished' });
      }
      continue;
    }
    if (status.row_id != null) byRowId.set(status.row_id, status);
    bySlug.set(entry, status);
    all.push(status);
  }

  all.sort((a, b) => {
    const ta = Date.parse(a.polished_at || 0);
    const tb = Date.parse(b.polished_at || 0);
    return tb - ta;
  });

  return { byRowId, bySlug, all };
}

/**
 * Group polished rows by verdict for aggregate summaries (heartbeat email,
 * dashboard rollups). Optional `sinceHours` filter for "what changed
 * overnight" semantics.
 */
export function groupPolishStatus(all, { sinceHours = null } = {}) {
  const cutoff = sinceHours ? Date.now() - sinceHours * 3600 * 1000 : 0;
  const filtered = all.filter(s => {
    if (!s.polished_at) return false;
    return Date.parse(s.polished_at) >= cutoff;
  });
  const counts = { APPROVED: 0, NEEDS_HUMAN: 0, REJECTED: 0, ABANDONED: 0 };
  const buckets = { APPROVED: [], NEEDS_HUMAN: [], REJECTED: [], ABANDONED: [] };
  for (const s of filtered) {
    if (s.status_icon === '⏸') { counts.ABANDONED++; buckets.ABANDONED.push(s); }
    else if (s.verdict && counts[s.verdict] != null) { counts[s.verdict]++; buckets[s.verdict].push(s); }
  }
  return { counts, buckets, total: filtered.length, since_hours: sinceHours };
}
