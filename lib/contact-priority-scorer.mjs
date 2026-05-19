/**
 * lib/contact-priority-scorer.mjs — composite priority scorer for the
 * relationship-intelligence layer.
 *
 * Reads config/contact-priority-weights.yml. Computes:
 *
 *   scoreContact(c, weights, opts) →
 *     { score, signals: { [signal]: weight }, classification, reasons[] }
 *
 * Each signal records its contribution so the Day-30 audit can correlate
 * specific signals against outcomes (replies / intros / interviews).
 *
 * Pure function — no I/O outside reading the weights file at startup.
 * CLI smoke test:
 *
 *   node lib/contact-priority-scorer.mjs --top 30
 *
 * prints the top-30 highest-scored contacts with signal breakdowns.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/**
 * Minimal YAML reader — mirrors the one in lib/refresh-priority.mjs.
 */
function readPolicy(policyPath) {
  const path = policyPath || join(REPO_ROOT, 'config', 'contact-priority-weights.yml');
  if (!existsSync(path)) throw new Error(`contact-priority-weights.yml not found at ${path}`);
  return parseSimpleYaml(readFileSync(path, 'utf8'));
}

function parseSimpleYaml(text) {
  // Stack frames: { indent, parent, key, value }
  // - parent: the object/array we're populating
  // - key: which key in `parent` we're inside (or null at root)
  // - value: same as parent[key] (cached)
  // Lists: when we see `- foo` at indent N, the LIST belongs to the most-
  // recent frame at indent N (the key whose children include the list items).
  // We convert that frame's value from {} to [] on first list-item encounter.
  const lines = text.split('\n');
  const root = {};
  const stack = [{ indent: -2, parent: { __root: root }, key: '__root', value: root }];

  for (let raw of lines) {
    const hashIdx = (() => {
      let inQ = null;
      for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (inQ) { if (c === inQ && raw[i-1] !== '\\') inQ = null; continue; }
        if (c === '"' || c === "'") { inQ = c; continue; }
        if (c === '#') return i;
      }
      return -1;
    })();
    if (hashIdx >= 0) raw = raw.slice(0, hashIdx);
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const indent = line.match(/^( *)/)[1].length;
    const content = line.slice(indent);

    // Pop frames whose indent is >= current line's indent — we're done with them.
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();

    const top = stack[stack.length - 1];

    if (content.startsWith('- ')) {
      // List item belongs to `top` (whose value should be a list).
      const val = parseScalar(content.slice(2).trim());
      if (!Array.isArray(top.value)) {
        // Convert empty object placeholder to array
        const arr = [];
        top.parent[top.key] = arr;
        top.value = arr;
      }
      top.value.push(val);
      continue;
    }

    const m = content.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, valRaw] = m;
    if (valRaw === '' || valRaw === undefined) {
      const child = {};
      top.value[key] = child;
      stack.push({ indent, parent: top.value, key, value: child });
    } else {
      top.value[key] = parseScalar(valRaw);
    }
  }
  return root;
}

function parseScalar(s) {
  s = s.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~' || s === '') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Same archetype regex as scripts/build-dashboard.mjs:3935 (kept in sync).
 */
const TARGET_ARCHETYPES = /\b(ai|ml|machine learning|llm|product|program|forward[ -]?deployed|solutions|comms|communications|developer relations|devrel|enablement|applied)\b/i;

/**
 * Hiring-authority signal: title hints at decision power.
 */
const HIRING_AUTHORITY = /\b(head of|vp |vice president|director|chief|lead\b|principal|manager|founder|partner|gm |general manager)\b/i;

/**
 * Recruiter title hint.
 */
const RECRUITER = /\b(recruiter|talent|technical sourcer|tech sourcer)\b/i;

/**
 * Replied-status hint (outreach state). Used to bump active_outreach_replied.
 */
const REPLIED_RE = /^(responded|interview|offer|replied)$/i;

/**
 * Score one contact.
 *
 * @param {object} c — contact from _CONTACTS_DATA (see schema doc)
 * @param {object} weights — policy.weights map
 * @param {object} opts
 * @param {string[]} opts.targetCompanies — slugs of tier-1 companies (lowercased)
 * @param {number}   opts.tierBoostMultiplier — applied if contact's current company is in targetCompanies
 * @param {object}   [opts.enrichmentSidecar] — optional contact_enrichment cache for engagement signals
 * @returns {{score:number, signals:object, reasons:string[]}}
 */
export function scoreContact(c, weights, opts = {}) {
  const tg = new Set((opts.targetCompanies || []).map(s => slugify(s)));
  const tierMult = Number(opts.tierBoostMultiplier) || 1.0;
  const signals = {};
  const reasons = [];

  function add(name, weight, reason) {
    if (!Number.isFinite(weight) || weight <= 0) return;
    signals[name] = weight;
    if (reason) reasons.push(`${name}=${weight.toFixed(2)} (${reason})`);
  }

  const companySlug = slugify(c.company);
  const isAtTarget = companySlug && tg.has(companySlug);

  // 1. current_at_target_co
  if (isAtTarget) add('current_at_target_co', weights.current_at_target_co ?? 1.0, `${c.company} is in target list`);

  // 2. active_outreach_replied — replied/responded/interview/offer
  if (c.in_outreach && REPLIED_RE.test(String(c.outreach_status || ''))) {
    add('active_outreach_replied', weights.active_outreach_replied ?? 0.9, `outreach_status=${c.outreach_status}`);
  }

  // 3. hiring_authority — title-based hint
  if (HIRING_AUTHORITY.test(String(c.position || ''))) {
    add('hiring_authority', weights.hiring_authority ?? 0.8, `title hints at decision-maker`);
  }

  // 4. recruiter_at_target_co — internal recruiter at a target company
  if (isAtTarget && RECRUITER.test(String(c.position || ''))) {
    add('recruiter_at_target_co', weights.recruiter_at_target_co ?? 0.7, `recruiter at ${c.company}`);
  }

  // 5. archetype_adjacent_role — title contains Mitchell's target archetypes
  if (TARGET_ARCHETYPES.test(String(c.position || ''))) {
    add('archetype_adjacent_role', weights.archetype_adjacent_role ?? 0.6, `title matches archetype regex`);
  }

  // 6. shared_past_employer — Mitchell's cv.md overlap
  if ((c.overlap_with_mitchell || []).length > 0) {
    add('shared_past_employer', weights.shared_past_employer ?? 0.5, `shared employer: ${c.overlap_with_mitchell.map(o => o.company).join(', ')}`);
  }

  // 7. pre_ipo_equity — goal_alignment.pre_ipo_match
  if (c.goal_alignment && c.goal_alignment.pre_ipo_match) {
    add('pre_ipo_equity', weights.pre_ipo_equity ?? 0.5, `${c.company} is pre-IPO`);
  }

  // 8. active_outreach_pending — outreach fired, no reply yet
  if (c.in_outreach && !REPLIED_RE.test(String(c.outreach_status || ''))) {
    add('active_outreach_pending', weights.active_outreach_pending ?? 0.4, `outreach pending; status=${c.outreach_status || 'sent'}`);
  }

  // 9. recent_linkedin_engagement_30d — requires enrichment sidecar
  const sidecar = opts.enrichmentSidecar || c.engagement || null;
  if (sidecar && sidecar.linkedin_last_active) {
    const lastTs = Date.parse(sidecar.linkedin_last_active);
    if (Number.isFinite(lastTs) && (Date.now() - lastTs) < 30 * 86400_000) {
      add('recent_linkedin_engagement_30d', weights.recent_linkedin_engagement_30d ?? 0.3, `LI active ${sidecar.linkedin_last_active}`);
    }
  }

  // 10. second_degree_path_to_target — Mitchell can warm-intro through this contact
  if (c.two_degree_path && c.two_degree_path.candidate_count > 0) {
    add('second_degree_path_to_target', weights.second_degree_path_to_target ?? 0.3, `${c.two_degree_path.candidate_count} warm-intro candidates`);
  }

  // 11. mutual_connections_in_directory — more colleagues at same company in Mitchell's directory
  if ((c.others_at_company || []).length >= 3) {
    add('mutual_connections_in_directory', weights.mutual_connections_in_directory ?? 0.3, `${c.others_at_company.length} mutual colleagues`);
  }

  // 12. has_email_and_linkedin — actionable contact details
  if (c.email_professional && c.linkedin_url) {
    add('has_email_and_linkedin', weights.has_email_and_linkedin ?? 0.2, `both email + LI`);
  }

  // 13. has_x_handle
  if (c.x_handle) {
    add('has_x_handle', weights.has_x_handle ?? 0.1, `X handle resolved`);
  }

  const baseScore = Object.values(signals).reduce((s, w) => s + w, 0);
  const finalScore = isAtTarget ? baseScore * tierMult : baseScore;

  return {
    score: +finalScore.toFixed(4),
    base_score: +baseScore.toFixed(4),
    tier_boosted: isAtTarget,
    signals,
    reasons,
  };
}

/**
 * Rank a list of contacts and return them sorted by score.
 * Pass opts.limit to slice.
 */
export function rankContacts(contacts, weights, opts = {}) {
  const ranked = contacts.map(c => ({
    contact: c,
    ...scoreContact(c, weights, opts),
  }));
  ranked.sort((a, b) => b.score - a.score);
  if (Number.isFinite(opts.limit) && opts.limit > 0) return ranked.slice(0, opts.limit);
  return ranked;
}

/**
 * Top-N by score from the baked _CONTACTS_DATA in dashboard/index.html.
 * Used by both the orchestrator and the CLI tester.
 */
export function loadAndRank(opts = {}) {
  const policy = readPolicy(opts.policyPath);
  const weights = policy.weights || {};
  const targetCompanies = (policy.tier_boost && policy.tier_boost.target_companies) || [];
  const tierBoostMultiplier = (policy.tier_boost && policy.tier_boost.multiplier) || 1.5;

  // Try to extract _CONTACTS_DATA from the built dashboard.
  let contacts = [];
  const dashboardHtml = join(REPO_ROOT, 'dashboard/index.html');
  if (existsSync(dashboardHtml)) {
    const html = readFileSync(dashboardHtml, 'utf8');
    const m = html.match(/var\s+_CONTACTS_DATA\s*=\s*(\[[\s\S]*?\]);/m);
    if (m) {
      try { contacts = JSON.parse(m[1].replace(/<\\\//g, '</')); } catch (_) { /* */ }
    }
  }
  if (contacts.length === 0) {
    throw new Error('No _CONTACTS_DATA found — run `node scripts/build-dashboard.mjs` first');
  }

  // Apply auto-pause gate based on pause_after_date
  const pauseAfter = policy.pause_after_date;
  const isPaused = pauseAfter ? (new Date().toISOString().slice(0,10) > pauseAfter) : false;

  return {
    ranked: rankContacts(contacts, weights, {
      targetCompanies,
      tierBoostMultiplier,
      limit: opts.limit,
    }),
    policy,
    isPaused,
    pauseAfter,
    targetCompanies,
    weights,
  };
}

// CLI smoke test
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const topIdx = argv.indexOf('--top');
  const topN = topIdx >= 0 ? parseInt(argv[topIdx + 1], 10) : 30;
  try {
    const result = loadAndRank({ limit: topN });
    console.log(`pause_after_date: ${result.pauseAfter} (paused=${result.isPaused})`);
    console.log(`target_companies: ${result.targetCompanies.join(', ')}`);
    console.log(`\nTop ${topN} contacts by composite priority:\n`);
    result.ranked.forEach((r, i) => {
      const c = r.contact;
      console.log(`${String(i+1).padStart(3)}. ${r.score.toFixed(3)} ${r.tier_boosted ? '★' : ' '} ${c.name.padEnd(28)} ${(c.company || '—').padEnd(22)} ${(c.position || '').slice(0,42)}`);
      console.log(`     → ${r.reasons.join(' · ')}`);
    });
  } catch (e) {
    console.error('FATAL:', e.message);
    process.exit(1);
  }
}
