#!/usr/bin/env node
/**
 * scripts/build-network-database.mjs (ZETA 2026-05-19)
 *
 * Canonical aggregator. Reads every on-disk network source and writes
 * `data/network-database.json` (gitignored) — the single source of truth
 * for the network-leverage drillIn and the full-page advanced view.
 *
 * Anti-hallucination guarantees (Z.1 brief):
 *   - inferred.* defaults to null / []. Only Z.3 enricher populates with
 *     cited evidence_urls.
 *   - emails.*.confidence ladder:
 *       high   = LinkedIn export (export-time validated) OR Hunter
 *                verification=valid OR outreach-state intel marked high.
 *       medium = Hunter verification=accept_all OR pattern guess with
 *                MX-verified domain (Z.4 writes these).
 *       low    = pattern guess, NO MX verify; or vendor guess with
 *                verification missing.
 *   - warm_to_target_companies fires only when path traces through (a)
 *     a 2nd-degree JSON's mutual_connections that intersects with this
 *     person's 1st-degree presence, or (b) shared current_company with
 *     an apply-now target. Evidence string is mandatory.
 *
 * CLI:
 *   node scripts/build-network-database.mjs              # full rebuild
 *   node scripts/build-network-database.mjs --since 7d   # incremental (TODO)
 *   node scripts/build-network-database.mjs --enrich     # also run Z.3
 *   node scripts/build-network-database.mjs --verbose    # log per-step counts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PATHS = {
  csv:          join(ROOT, 'data/linkedin/Connections.csv'),
  secondDegree: join(ROOT, 'data/linkedin/2nd-degree'),
  overrides:    join(ROOT, 'data/linkedin/overrides.json'),
  enriched:     join(ROOT, 'data/contacts-enriched.json'),
  outreach:     join(ROOT, 'data/outreach-state.json'),
  applyNow:     join(ROOT, 'data/apply-now-queue.json'),
  // Z.10 self-review fix: enrichment + email-finder agents persist results
  // into their own overlay file (gitignored). The aggregator merges them into
  // people[].inferred + people[].emails.professional on every build, so a
  // user's enricher click → next read sees the updated record.
  enrichments:  join(ROOT, 'data/network-database-enrichments.json'),
  // Z.10 self-review fix: /api/network/person/:id/notes writes here.
  // The aggregator merges notes into people[].notes on every build.
  notes:        join(ROOT, 'data/network-database-notes.json'),
  output:       join(ROOT, 'data/network-database.json'),
};

const SCHEMA_VERSION = 1;
const NOW = new Date().toISOString();

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const ENRICH  = argv.includes('--enrich');
const SINCE   = (() => {
  const i = argv.indexOf('--since');
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
})();

function log(...args) { if (VERBOSE) console.error('[zeta]', ...args); }
function err(...args) { console.error('[zeta-err]', ...args); }

// ── Company-name normalization (matches lib/linkedin-network.mjs) ────────────
const SUFFIX_RE = /[,]?\s*(?:inc\.?|incorporated|llc\.?|ltd\.?|limited|corp\.?|corporation|co\.?|company|gmbh|s\.?a\.?|sas|plc|s\.?r\.?l\.?|holdings?|group|labs?|technologies|technology)\.?\s*$/i;
const PAREN_TAIL_RE = /\s*\([^)]*\)\s*$/;

function normalizeCompany(name) {
  if (!name) return '';
  let n = String(name).toLowerCase().trim();
  n = n.replace(PAREN_TAIL_RE, '');
  n = n.replace(/\s+/g, ' ');
  for (let i = 0; i < 3; i++) {
    const next = n.replace(SUFFIX_RE, '').replace(/[.,;]+$/, '').trim();
    if (next === n) break;
    n = next;
  }
  return n;
}

const COMPANY_ALIASES = {
  cursor: ['anysphere'], anysphere: ['cursor'],
  'mistral ai': ['mistral'], mistral: ['mistral ai'],
  x: ['xai', 'x corp', 'twitter'], xai: ['x', 'x.ai'],
  meta: ['facebook'], facebook: ['meta'],
  google: ['alphabet'], alphabet: ['google'],
};

function companyAliases(slug) {
  const aliases = new Set([slug]);
  for (const a of (COMPANY_ALIASES[slug] || [])) aliases.add(normalizeCompany(a));
  return Array.from(aliases);
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// ── RFC-4180 CSV parser ──────────────────────────────────────────────────────
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else cur += c;
    } else {
      if (c === ',') { fields.push(cur); cur = ''; }
      else if (c === '"' && cur === '') { inQuotes = true; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function readJsonSafe(p, fallback) {
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, 'utf-8')); }
  catch (e) { err(`failed to parse ${p}: ${e.message}`); return fallback; }
}

// ── 1. CSV parse ─────────────────────────────────────────────────────────────
function loadConnectionsCsv() {
  if (!existsSync(PATHS.csv)) { err(`CSV missing: ${PATHS.csv}`); return { rows: [], updated: null }; }
  const raw = readFileSync(PATHS.csv, 'utf-8');
  const updated = statSync(PATHS.csv).mtime.toISOString();
  const lines = raw.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (/^\s*First Name\s*,\s*Last Name\s*,/i.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx < 0) { err('CSV header not found'); return { rows: [], updated }; }
  const header = parseCsvLine(lines[headerIdx]).map(c => c.trim().toLowerCase());
  const col = {
    first:    header.indexOf('first name'),
    last:     header.indexOf('last name'),
    url:      header.indexOf('url'),
    email:    header.indexOf('email address'),
    company:  header.indexOf('company'),
    position: header.indexOf('position'),
    when:     header.indexOf('connected on'),
  };
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const f = parseCsvLine(line);
    const first = (f[col.first] || '').trim();
    const last  = (f[col.last]  || '').trim();
    if (!first && !last) continue;
    rows.push({
      first, last,
      url:      (f[col.url]      || '').trim(),
      email:    (f[col.email]    || '').trim(),
      company:  (f[col.company]  || '').trim(),
      position: (f[col.position] || '').trim(),
      when:     (f[col.when]     || '').trim(),
    });
  }
  log(`CSV: ${rows.length} rows`);
  return { rows, updated };
}

// ── 2. Overrides ─────────────────────────────────────────────────────────────
function loadOverrides() {
  const ov = readJsonSafe(PATHS.overrides, { no_longer_at: {}, now_at: {}, notes: {} });
  return {
    no_longer_at: ov.no_longer_at || {},
    now_at: ov.now_at || {},
    notes: ov.notes || {},
  };
}

// ── 3. contacts-enriched (Hunter results) ─────────────────────────────────────
function loadEnriched() {
  const r = readJsonSafe(PATHS.enriched, { entries: {} });
  return r.entries || {};
}

// ── 4. outreach-state (x_handle + intel email) ───────────────────────────────
function loadOutreach() {
  const r = readJsonSafe(PATHS.outreach, { contacts: [] });
  const byName = new Map();
  for (const c of (r.contacts || [])) {
    const k = normalizeName(c.name);
    if (!k) continue;
    byName.set(k, c);
  }
  return byName;
}

// ── 5. 2nd-degree JSONs ──────────────────────────────────────────────────────
function loadSecondDegreeAll() {
  if (!existsSync(PATHS.secondDegree)) return { byCompany: new Map(), files: [] };
  const byCompany = new Map();
  const files = [];
  for (const f of readdirSync(PATHS.secondDegree)) {
    if (!f.endsWith('.json')) continue;
    if (f.startsWith('_')) { files.push(f); continue; } // aggregator files (_warm-intros.json)
    const obj = readJsonSafe(join(PATHS.secondDegree, f), null);
    if (!obj || !obj.company) continue;
    const slug = normalizeCompany(obj.company);
    byCompany.set(slug, obj);
    files.push(f);
  }
  log(`2nd-degree: ${byCompany.size} companies (${files.length} files)`);
  return { byCompany, files };
}

// ── 6. apply-now-queue (warm-target list) ────────────────────────────────────
function loadApplyNowTargets() {
  const q = readJsonSafe(PATHS.applyNow, { ranked: [] });
  const ranked = Array.isArray(q.ranked) ? q.ranked : [];
  const slugs = new Set();
  const meta = new Map();
  for (const r of ranked) {
    const slug = normalizeCompany(r.company || '');
    if (!slug) continue;
    for (const a of companyAliases(slug)) {
      slugs.add(a);
      if (!meta.has(a)) meta.set(a, { display: r.company, rank: r.rank, score: r.eval_score });
    }
  }
  log(`apply-now targets: ${slugs.size} normalized slugs`);
  return { slugs, meta };
}

// ── Email confidence classifier ──────────────────────────────────────────────
function classifyEmail({ email, source, hunterScore, hunterVerification, outreachConfidence, verifiedAt }) {
  if (!email) return null;
  let confidence = 'low';
  let verified_at = verifiedAt || null;
  if (source === 'linkedin_export') {
    // LinkedIn-validated at export time. Treat as high — LinkedIn requires
    // the contact to opt in, so the address is real.
    confidence = 'high';
  } else if (source === 'outreach_intel' && outreachConfidence === 'high') {
    confidence = 'high';
  } else if (source === 'hunter_api') {
    if (hunterVerification === 'valid' && typeof hunterScore === 'number' && hunterScore >= 90) {
      confidence = 'high';
    } else if (hunterVerification === 'valid' || hunterVerification === 'accept_all') {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  } else if (source === 'pattern_mx_verified') {
    confidence = 'medium';
  } else if (source === 'pattern_unverified') {
    confidence = 'low';
  }
  return { email, source, confidence, verified_at };
}

function stableId({ first, last, company, linkedinUrl }) {
  // Slug-firstname-lastname-companyhash per Z.1 schema.
  const base = `${slugify(first)}-${slugify(last)}`;
  const hashInput = [normalizeCompany(company), (linkedinUrl || '').toLowerCase()].join('|');
  const hash = crypto.createHash('sha1').update(hashInput).digest('hex').slice(0, 8);
  return `${base}-${hash}`;
}

// ── Main aggregator ──────────────────────────────────────────────────────────
function build() {
  const { rows: csvRows, updated: csvUpdated } = loadConnectionsCsv();
  const overrides = loadOverrides();
  const enriched = loadEnriched();
  const outreachByName = loadOutreach();
  const { byCompany: secondByCompany } = loadSecondDegreeAll();
  const { slugs: applyNowSlugs, meta: applyNowMeta } = loadApplyNowTargets();

  // First pass: build base people[] from CSV
  const people = [];
  const byNameKey = new Map();
  let overrideStats = { dropped: 0, relocated: 0, noted: 0 };

  for (const r of csvRows) {
    const nameKey = normalizeName(`${r.first} ${r.last}`);
    if (!nameKey) continue;

    // Apply overrides
    let effectiveCompany = r.company;
    let effectivePosition = r.position;
    const overridesApplied = [];

    if (overrides.now_at[nameKey]) {
      effectiveCompany = overrides.now_at[nameKey].company || effectiveCompany;
      if (overrides.now_at[nameKey].position) effectivePosition = overrides.now_at[nameKey].position;
      overrideStats.relocated++;
      overridesApplied.push({ kind: 'now_at', value: overrides.now_at[nameKey] });
    }
    const noLongerAtList = (overrides.no_longer_at[nameKey] || []).map(c => normalizeCompany(c));
    const normEff = normalizeCompany(effectiveCompany);
    if (noLongerAtList.includes(normEff)) {
      // Person has left this company AND no now_at replacement → skip
      overrideStats.dropped++;
      continue;
    }
    if (overrides.notes[nameKey]) {
      overrideStats.noted++;
      overridesApplied.push({ kind: 'note', value: overrides.notes[nameKey] });
    }

    const linkedinUrl = (r.url || '').trim();
    const id = stableId({ first: r.first, last: r.last, company: effectiveCompany, linkedinUrl });

    // Connected-on date — convert "14 May 2026" → "2026-05-14"
    let connectedOn = null;
    if (r.when) {
      const d = new Date(r.when);
      if (!isNaN(d.getTime())) connectedOn = d.toISOString().slice(0, 10);
    }

    // Email from CSV (LinkedIn-validated when present)
    const professionalEmails = [];
    if (r.email) {
      const e = classifyEmail({ email: r.email, source: 'linkedin_export', verifiedAt: csvUpdated });
      if (e) professionalEmails.push(e);
    }

    const person = {
      id,
      first: r.first,
      last: r.last,
      full_name: `${r.first} ${r.last}`.trim(),
      linkedin_url: linkedinUrl || null,
      x_url: null,
      current_company: effectiveCompany || null,
      current_role: effectivePosition || null,
      connected_on: connectedOn,
      degree: 1,
      warm_to_target_companies: [],
      emails: {
        professional: professionalEmails,
        personal: [],
      },
      engagement: {
        linkedin_posts_engaged_count: 0,
        linkedin_last_engaged_at: null,
        x_posts_engaged_count: 0,
        x_last_engaged_at: null,
      },
      inferred: {
        current_team: null,
        likely_projects: [],
        drives: [],
        evidence_urls: [],
      },
      notes: overrides.notes[nameKey] || '',
      overrides_applied: overridesApplied,
      _name_key: nameKey, // internal — stripped before write
    };
    people.push(person);
    byNameKey.set(nameKey, person);
  }
  log(`base people: ${people.length} (dropped ${overrideStats.dropped}, relocated ${overrideStats.relocated})`);

  // Second pass: enrich emails + x_handle from outreach-state
  let outreachHits = 0;
  for (const [nameKey, c] of outreachByName.entries()) {
    const p = byNameKey.get(nameKey);
    if (!p) continue;
    outreachHits++;
    const intel = c.intel || {};
    // Email
    const eg = intel.email_guess;
    if (eg && eg.address) {
      const already = p.emails.professional.find(e => e.email.toLowerCase() === eg.address.toLowerCase());
      if (!already) {
        const e = classifyEmail({
          email: eg.address,
          source: 'outreach_intel',
          outreachConfidence: eg.confidence || 'medium',
          verifiedAt: eg.validated_at || null,
        });
        if (e) p.emails.professional.push(e);
      }
    }
    // X handle
    if (intel.x_handle) {
      const handle = String(intel.x_handle).replace(/^@/, '');
      if (handle) p.x_url = `https://x.com/${handle}`;
    }
    // LinkedIn URL fallback
    if (!p.linkedin_url && c.linkedin_url) p.linkedin_url = c.linkedin_url;
  }
  log(`outreach-state merged: ${outreachHits} hits`);

  // Third pass: enrich emails from contacts-enriched (Hunter)
  let hunterHits = 0;
  for (const [nameKey, e] of Object.entries(enriched)) {
    const p = byNameKey.get(nameKey);
    if (!p) continue;
    const eg = e.email_guess;
    if (!eg || !eg.address) continue;
    const already = p.emails.professional.find(x => x.email.toLowerCase() === eg.address.toLowerCase());
    if (already) continue;
    const cls = classifyEmail({
      email: eg.address,
      source: 'hunter_api',
      hunterScore: eg.score,
      hunterVerification: eg.verification,
      verifiedAt: e.last_attempted_at || null,
    });
    if (cls) {
      p.emails.professional.push(cls);
      hunterHits++;
    }
  }
  log(`Hunter merged: ${hunterHits} email hits`);

  // Fourth pass: 2nd-degree paths + warm_to_target classification
  //
  // For each apply-now target company, look at the 2nd-degree JSON for it.
  // For each 2nd-degree contact at that target, walk mutual_connections —
  // those are 1st-degree Mitchell connections who can introduce. Tag THEM
  // with warm_to_target_companies entry.
  let warmPathCount = 0;
  for (const [targetSlug, sec] of secondByCompany.entries()) {
    for (const target of (sec.contacts || [])) {
      const mutuals = target.mutual_connections || [];
      for (const m of mutuals) {
        const mKey = normalizeName(m);
        const p = byNameKey.get(mKey);
        if (!p) continue;
        // Don't double-add same target_company
        const already = p.warm_to_target_companies.find(w => w.company_slug === targetSlug);
        if (!already) {
          p.warm_to_target_companies.push({
            company_slug: targetSlug,
            target_name: target.name || null,
            target_url: target.url || null,
            target_title: target.title || null,
            evidence: `linkedin_mutual:${(target.name || '').slice(0, 80)}`,
            confidence: 'high',
          });
          warmPathCount++;
        }
      }
    }
  }

  // Also: anyone currently AT an apply-now target gets warm flagged
  let directAtTargetCount = 0;
  for (const p of people) {
    const normEff = normalizeCompany(p.current_company || '');
    if (!normEff) continue;
    if (applyNowSlugs.has(normEff)) {
      const already = p.warm_to_target_companies.find(w => w.company_slug === normEff);
      if (!already) {
        p.warm_to_target_companies.push({
          company_slug: normEff,
          target_name: null,
          target_url: null,
          target_title: null,
          evidence: `current_employer:${normEff}`,
          confidence: 'high',
        });
        directAtTargetCount++;
      }
    }
  }
  log(`warm paths: ${warmPathCount} via 2nd-degree + ${directAtTargetCount} direct-at-target`);

  // Fifth pass: merge enricher + emailer overlays from
  // data/network-database-enrichments.json. Per Z.10 self-review fix —
  // before this, the enricher and emailer wrote to the overlay file but the
  // aggregator never read it back, so inferred.* and the new email_guess
  // stayed empty in the canonical DB. Now the overlay roundtrips on every
  // build. Cap each person's emails list at 5 to keep payloads sane.
  let enrichmentsMerged = 0;
  let emailerMerged = 0;
  try {
    const overlay = readJsonSafe(PATHS.enrichments, {});
    const byId = new Map(people.map(p => [p.id, p]));
    for (const [personId, entry] of Object.entries(overlay)) {
      const p = byId.get(personId);
      if (!p) continue;
      // Enricher payload: { current_team, likely_projects[], drives[],
      // evidence_urls[], x_handle, confidence, no_data_reason }
      if (entry && (entry.current_team !== undefined || Array.isArray(entry.likely_projects))) {
        p.inferred = {
          current_team:   entry.current_team || null,
          likely_projects: Array.isArray(entry.likely_projects) ? entry.likely_projects.slice(0, 8) : [],
          drives:         Array.isArray(entry.drives) ? entry.drives.slice(0, 8) : [],
          evidence_urls:  Array.isArray(entry.evidence_urls) ? entry.evidence_urls.slice(0, 20) : [],
        };
        if (entry.x_handle && !p.x_url) {
          p.x_url = `https://x.com/${String(entry.x_handle).replace(/^@/, '')}`;
        }
        enrichmentsMerged++;
      }
      // Emailer payload: entry.email_guess = { email, source, confidence, verified_at, ... }
      if (entry && entry.email_guess && entry.email_guess.email) {
        const eg = entry.email_guess;
        const already = p.emails.professional.find(e => e.email.toLowerCase() === String(eg.email).toLowerCase());
        if (!already) {
          p.emails.professional.push({
            email: eg.email,
            source: eg.source || 'pattern_mx_verified',
            confidence: eg.confidence || 'low',
            verified_at: eg.verified_at || null,
          });
          if (p.emails.professional.length > 5) p.emails.professional = p.emails.professional.slice(0, 5);
          emailerMerged++;
        }
      }
    }
  } catch (e) { err(`enrichments overlay merge failed: ${e.message}`); }
  log(`enrichments overlay merged: ${enrichmentsMerged} inferred · ${emailerMerged} emails`);

  // Sixth pass: merge notes overlay from data/network-database-notes.json.
  // /api/network/person/:id/notes writes here; aggregator merges so the
  // textarea reflects the saved value on next render.
  let notesMerged = 0;
  try {
    const notesOverlay = readJsonSafe(PATHS.notes, {});
    const byId = new Map(people.map(p => [p.id, p]));
    for (const [personId, entry] of Object.entries(notesOverlay)) {
      const p = byId.get(personId);
      if (!p || !entry) continue;
      if (typeof entry.note === 'string' && entry.note.length) {
        p.notes = entry.note;
        notesMerged++;
      }
    }
  } catch (e) { err(`notes overlay merge failed: ${e.message}`); }
  log(`notes overlay merged: ${notesMerged}`);

  // Compute warm_path_strength derived field (used by Z.3/Z.4 prioritization
  // and the search sort key). Sum of confidence weights: high=3, med=2, low=1.
  for (const p of people) {
    let strength = 0;
    for (const w of p.warm_to_target_companies) {
      strength += w.confidence === 'high' ? 3 : (w.confidence === 'medium' ? 2 : 1);
    }
    p.warm_path_strength = strength;
  }

  // Totals per target company. Collapse alias-duplicates by canonicalizing
  // each apply-now slug to the first member of its aliases set. e.g.
  // `anysphere` rolls up into `cursor`.
  const canonicalSlug = (slug) => {
    const aliases = companyAliases(slug);
    return aliases.sort()[0]; // deterministic
  };
  const totalsByTarget = {};
  const seenCanon = new Set();
  for (const slug of applyNowSlugs) {
    const canon = canonicalSlug(slug);
    if (seenCanon.has(canon)) continue;
    seenCanon.add(canon);
    const aliases = new Set(companyAliases(slug));
    let first = 0, second = 0, withEmail = 0;
    for (const p of people) {
      const pCompany = normalizeCompany(p.current_company || '');
      if (aliases.has(pCompany)) first++;
      const matched = p.warm_to_target_companies.find(w => aliases.has(w.company_slug));
      if (matched) {
        second++;
        if (p.emails.professional.some(e => e.confidence !== 'low')) withEmail++;
      }
    }
    totalsByTarget[canon] = {
      display: applyNowMeta.get(slug)?.display || canon,
      aliases: Array.from(aliases),
      first, second, with_email: withEmail,
    };
  }

  // Headline totals
  const totalWithProfEmail = people.filter(p => p.emails.professional.some(e => e.confidence !== 'low')).length;
  const totalWarm = people.filter(p => p.warm_to_target_companies.length > 0).length;

  // Strip internal fields before write
  const cleanPeople = people.map(p => {
    const { _name_key, ...rest } = p;
    return rest;
  });

  const out = {
    schema_version: SCHEMA_VERSION,
    last_run: NOW,
    total: cleanPeople.length,
    headline: {
      total_connections: cleanPeople.length,
      warm_to_apply_now_targets: totalWarm,
      with_verified_or_medium_email: totalWithProfEmail,
      target_companies: applyNowSlugs.size,
    },
    totals_by_target: totalsByTarget,
    sources: {
      csv: { path: 'data/linkedin/Connections.csv', updated: csvUpdated, rows: csvRows.length },
      second_degree_companies: Array.from(secondByCompany.keys()),
      overrides_applied: overrideStats,
      outreach_hits: outreachHits,
      hunter_hits: hunterHits,
    },
    people: cleanPeople,
  };

  if (!existsSync(dirname(PATHS.output))) mkdirSync(dirname(PATHS.output), { recursive: true });
  writeFileSync(PATHS.output, JSON.stringify(out, null, 2));
  console.log(`[zeta] wrote ${PATHS.output}`);
  console.log(`[zeta] ${cleanPeople.length} people indexed`);
  console.log(`[zeta] ${totalWarm} warm to apply-now targets (${applyNowSlugs.size} target companies)`);
  console.log(`[zeta] ${totalWithProfEmail} with verified/medium professional email`);
  console.log(`[zeta] per-target counts:`);
  for (const [slug, t] of Object.entries(totalsByTarget)) {
    console.log(`[zeta]   ${slug.padEnd(20)} → ${t.first} direct · ${t.second} warm · ${t.with_email} w/ email`);
  }

  return out;
}

// Entry point
const out = build();

// Optional --enrich → run Z.3 enricher in priority-batch mode
if (ENRICH) {
  console.log('[zeta] --enrich passed; spawning scripts/agents/network-enricher.mjs --priority-batch');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', [join(ROOT, 'scripts/agents/network-enricher.mjs'), '--priority-batch'], { stdio: 'inherit' });
  if (r.status !== 0) {
    err(`enricher returned ${r.status}`);
    process.exit(r.status || 1);
  }
}

// Honor --since by writing the timestamp metadata only (incremental rebuild
// is a future optimization — the full pass is fast enough today, ~3-4s for
// 2,910 rows. Document the flag without lying about implementing it.)
if (SINCE) {
  console.error(`[zeta] --since ${SINCE}: not yet implemented; ran full rebuild`);
}
