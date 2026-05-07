#!/usr/bin/env node
/**
 * Pre-evaluation triage for Mitchell's career-ops pipeline.
 * Reads data/pipeline.md, applies archetype + geography + comp filters,
 * outputs data/triage-batch.tsv with bounded candidate set for batch eval.
 *
 * Pipeline.md schema (actual): "- [ ] URL | Company | Title"
 * Location is not present in pipeline.md; location filter is pass-through
 * when location is empty and only filters when location data is present
 * (e.g., embedded in the title or added later by enrichment).
 *
 * Usage: node scripts/triage-pipeline.mjs [--limit=30]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { load as parseYaml } from 'js-yaml';

const ROOT = process.cwd();
const PIPELINE_PATH = join(ROOT, 'data/pipeline.md');
const APPLICATIONS_PATH = join(ROOT, 'data/applications.md');
const OUTPUT_PATH = join(ROOT, 'data/triage-batch.tsv');

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 30;

// 6I: Load archetype keywords from config/profile.yml (data-contract separation)
// Falls back to hardcoded defaults if profile.yml or triage section is missing.
let A1_TITLES, A2_TITLES, B_TITLES;
{
  const profilePath = join(ROOT, 'config/profile.yml');
  let triage = null;
  if (existsSync(profilePath)) {
    try {
      const profileRaw = readFileSync(profilePath, 'utf-8');
      const profile = parseYaml(profileRaw);
      triage = profile?.triage || null;
    } catch (_) { /* fall through to defaults */ }
  }
  A1_TITLES = triage?.a1_titles ?? [
    'fellow', 'fellowship', 'residency', 'resident',
  ];
  A2_TITLES = triage?.a2_titles ?? [
    'solutions architect', 'forward deployed engineer', 'forward deployed',
    'applied ai engineer', 'applied ai architect', 'ai enablement',
    'ai program manager', 'ai pgm', 'ai technical program manager',
    'ai product operations', 'ai product manager', 'ai pm',
    'technical deployment lead', 'technical enablement lead',
    'agent builder',
  ];
  B_TITLES = triage?.b_titles ?? [
    'developer education', 'developer advocate', 'developer relations',
    'devrel', 'communications lead', 'communications manager',
    'engineering editorial', 'technical writer', 'editorial lead',
    'content strategy lead', 'content lead',
  ];
}

// Preferred geography substrings — applied to combined title+location text
const PREFERRED_LOCATIONS = [
  'seattle', 'remote', 'fully remote', 'remote-friendly',
  'san francisco', 'sf', 'new york', 'nyc', 'manhattan',
  'los angeles', 'la,', 'san diego', 'portland', 'chicago', 'dallas',
  // International preferred cities — kept in sync with modes/_profile.md
  // Sections 3 (CoL floor table) and 5 (INTERNATIONAL-TAX flag).
  'mexico city', 'medellin', 'cuenca', 'porto', 'lisbon',
  'barcelona', 'madrid', 'bilbao', 'san sebastian', 'berlin',
  'london', 'dublin', 'glasgow',
  'chiang mai', 'chiang rai',
];

// Exclude clearly non-matching locations (used only when location data exists)
const EXCLUDED_LOCATIONS = [
  'tokyo only', 'singapore only', 'sydney only',
  'paris only', 'tel aviv', 'bangalore only', 'mumbai only',
];

function classifyArchetype(title) {
  const lower = title.toLowerCase();
  if (A1_TITLES.some(k => lower.includes(k))) return 'A1';
  if (A2_TITLES.some(k => lower.includes(k))) return 'A2';
  if (B_TITLES.some(k => lower.includes(k))) return 'B';
  return null;
}

// LOCATION FILTERING NOTE (Stage 4 flag, documented in Stage 5):
// pipeline.md schema is "URL | Company | Title" — no dedicated location
// field. When location is absent (most cases), this filter passes through.
// Coarse pre-filtering is intentional: the full evaluation reads the JD
// body and applies CoL-anchored geography scoring per modes/_profile.md
// Section 3. Triage's job is to bound the batch, not perfect-filter it.
//
// Trade-off: some non-preferred-geography roles get evaluated. Cost is
// roughly 1-3 wasted evaluations per batch of 30. Tolerable.
//
// Future improvement (post-May-11): parse location strings out of title
// text (e.g., "Senior Engineer, London") for tighter pre-filtering.
function locationMatches(location, title) {
  // If no explicit location data, pass through — pipeline.md schema doesn't
  // include location, so we rely on archetype + dedup filters and let the
  // batch evaluator surface geography mismatches in Block A.
  const combined = `${location || ''} ${title || ''}`.toLowerCase();
  if (!location || location.trim() === '') {
    // No location data — check title for explicit excluded markers only
    if (EXCLUDED_LOCATIONS.some(loc => combined.includes(loc))) return false;
    return true;
  }
  // Location data present — apply preferred filter
  return PREFERRED_LOCATIONS.some(loc => combined.includes(loc));
}

function parsePipelineMd(content) {
  // Actual schema: "- [ ] URL | Company | Title"
  // Some lines may include a trailing location after the title, but most don't.
  const lines = content.split('\n');
  const entries = [];
  let id = 0;
  for (const line of lines) {
    if (!line.startsWith('- [ ]')) continue;
    // Strip checkbox prefix
    const body = line.replace(/^- \[ \]\s*/, '').trim();
    // Split on " | "
    const parts = body.split(' | ').map(p => p.trim());
    if (parts.length < 3) continue;
    const [url, company, ...titleParts] = parts;
    const title = titleParts.join(' | ');
    // Try to extract location from trailing parenthetical or after a dash
    let location = '';
    const locMatch = title.match(/\(([^)]+)\)\s*$/);
    if (locMatch) location = locMatch[1];
    id += 1;
    entries.push({
      id: String(id),
      company,
      title,
      url,
      location,
    });
  }
  return entries;
}

// Parse corpus/rejections.md for confirmed rejections. Each rejection is
// a `## Company — Role — Date` or `### Company — Role — Date` heading.
// Returns array of {company, role} normalized for comparison.
function loadRejectionLedger() {
  const path = join(ROOT, 'corpus/rejections.md');
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8');
  const out = [];
  // The em-dash "—" (U+2014) is the canonical separator in this ledger.
  for (const m of text.matchAll(/^#{2,3}\s+([^\n]+?)\s+—\s+([^\n]+?)\s+—\s+/gm)) {
    const company = m[1].trim();
    const role = m[2].trim();
    // Skip section headers that aren't rejection entries
    if (/pattern summary|cross-references|other rejections/i.test(company)) continue;
    out.push({ company, role });
  }
  return out;
}

// Parse applications.md for entries Mitchell has already engaged with —
// status in {Applied, Responded, Interview, Offer, Rejected}. These should
// not be re-surfaced. (Evaluated/Discarded/SKIP entries can be re-evaluated
// if the JD changes.)
function loadActiveApplications() {
  const path = APPLICATIONS_PATH;
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8');
  const out = [];
  for (const line of text.split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cells = line.split('|').map(c => c.trim());
    const company = cells[3] || '';
    const role = cells[4] || '';
    const status = cells[6] || '';
    if (/^(Applied|Responded|Interview|Offer|Rejected)$/i.test(status)) {
      out.push({ company, role });
    }
  }
  return out;
}

function normalizeForMatch(s) {
  return (s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Block a pipeline entry if its (company, role) overlaps a rejection or
// already-applied entry. Match is fuzzy: same company (substring either way)
// and substring overlap on role.
function buildBlocklist() {
  const all = [...loadRejectionLedger(), ...loadActiveApplications()];
  return all.map(({ company, role }) => ({
    company: normalizeForMatch(company),
    role: normalizeForMatch(role),
  })).filter(b => b.company && b.role);
}

function isBlocked(entry, blocklist) {
  const c = normalizeForMatch(entry.company);
  const r = normalizeForMatch(entry.title);
  return blocklist.some(b => {
    // Company: EXACT match (normalized). "Microsoft" and "Microsoft AI"
    // should not collide.
    if (c !== b.company) return false;
    // Role: EXACT match (normalized). Tightened from one-way substring
    // 2026-04-27 — even super-set blocking risks filtering out roles where
    // the user's skills/portfolio have meaningfully evolved since the
    // prior rejection. Asymmetric cost: missing a great role >>> surfacing
    // a previously-rejected role (which just gets marked Discarded again).
    // Re-postings of the EXACT same role get blocked; everything else
    // surfaces and the evaluator sees the role in context.
    return r === b.role;
  });
}

// Return matched blocklist entry for diagnostic logging — same logic as
// isBlocked.
function findBlockReason(entry, blocklist) {
  const c = normalizeForMatch(entry.company);
  const r = normalizeForMatch(entry.title);
  return blocklist.find(b => c === b.company && r === b.role) || null;
}

function loadApplicationsUrls() {
  // Stage 5 fix: applications.md links to report files, not JD URLs directly.
  // Per CLAUDE.md pipeline integrity rules, every report MUST include
  // **URL:** in the header. Extract JD URLs by reading each linked report.
  const trackedUrls = new Set();
  if (!existsSync(APPLICATIONS_PATH)) return trackedUrls;

  const appsContent = readFileSync(APPLICATIONS_PATH, 'utf-8');

  // Find all report paths referenced in applications.md
  const reportPathRegex = /reports\/[\w-]+\.md/g;
  const reportPaths = new Set(appsContent.match(reportPathRegex) || []);

  // For each report, extract JD URL from **URL:** header
  for (const reportPath of reportPaths) {
    const fullPath = join(ROOT, reportPath);
    if (!existsSync(fullPath)) continue;
    const reportContent = readFileSync(fullPath, 'utf-8');
    const urlMatch = reportContent.match(/\*\*URL:\*\*\s*(\S+)/);
    if (urlMatch && urlMatch[1]) {
      trackedUrls.add(urlMatch[1]);
    }
  }

  // Also catch any bare JD URLs directly in applications.md as fallback
  const bareUrlRegex = /https?:\/\/[^\s|)]+/g;
  const bareUrls = appsContent.match(bareUrlRegex) || [];
  for (const url of bareUrls) {
    trackedUrls.add(url);
  }

  return trackedUrls;
}

function main() {
  if (!existsSync(PIPELINE_PATH)) {
    console.error(`ERROR: ${PIPELINE_PATH} not found. Run scan.mjs first.`);
    process.exit(1);
  }

  const pipelineContent = readFileSync(PIPELINE_PATH, 'utf-8');
  const entries = parsePipelineMd(pipelineContent);
  const trackedUrls = loadApplicationsUrls();

  console.log(`Loaded ${entries.length} entries from pipeline.md`);
  console.log(`Loaded ${trackedUrls.size} already-tracked URLs from applications.md`);

  // Filter: archetype match
  let triaged = entries
    .map(e => ({ ...e, archetype: classifyArchetype(e.title) }))
    .filter(e => e.archetype !== null);
  console.log(`After archetype filter: ${triaged.length}`);

  // Filter: location preference (pass-through when location empty)
  triaged = triaged.filter(e => locationMatches(e.location, e.title));
  console.log(`After location filter: ${triaged.length}`);

  // Filter: dedup against applications.md
  triaged = triaged.filter(e => !trackedUrls.has(e.url));
  console.log(`After dedup filter: ${triaged.length}`);

  // Filter: rejection / applied / interview blocklist (corpus/rejections.md
  // + applications.md statuses Applied/Responded/Interview/Offer/Rejected).
  // Match logic: exact company + one-way role substring (rejection-in-
  // candidate). Sub-team / sibling-role variations surface; only the same
  // role at the same company gets blocked.
  const blocklist = buildBlocklist();
  const beforeBlock = triaged.length;
  const blocked = [];
  triaged = triaged.filter(e => {
    const reason = findBlockReason(e, blocklist);
    if (reason) {
      blocked.push({ entry: e, reason });
      return false;
    }
    return true;
  });
  console.log(`After rejection+applied blocklist (${blocklist.length} entries): ${triaged.length} (-${blocked.length})`);
  for (const b of blocked) {
    console.log(`  ✗ Blocked: ${b.entry.company} — ${b.entry.title}  (matched: ${b.reason.company} — ${b.reason.role})`);
  }

  // Selection strategy: take ALL Tier B + ALL Tier A1 first, then fill the
  // remaining slots with Tier A2. Rationale:
  //   - Tier B (comms/editorial at AI-native) is Mitchell's natural fit per
  //     modes/_profile.md §1. Highest expected hit rate. Smallest set —
  //     always fits inside LIMIT. Process FIRST so it lands even if a long
  //     batch times out partway.
  //   - Tier A1 (residency/fellowship) is tertiary, but the set is small
  //     and worth full coverage when present (cohort deadlines).
  //   - Tier A2 (AI Solutions Architect / FDE / Applied AI) is primary
  //     aspirational but has the largest pool. Sample to fill remaining
  //     slots in archetype-insertion order.
  const byArchetype = { A1: [], A2: [], B: [] };
  for (const e of triaged) byArchetype[e.archetype].push(e);
  const tierB = byArchetype.B;
  const tierA1 = byArchetype.A1;
  const remaining = Math.max(0, LIMIT - tierB.length - tierA1.length);
  const tierA2 = byArchetype.A2.slice(0, remaining);
  const final = [...tierB, ...tierA1, ...tierA2].slice(0, LIMIT);
  console.log(`Final batch size: ${final.length} (limit: ${LIMIT})`);
  console.log(`  Composition: ${tierB.length} Tier B + ${tierA1.length} Tier A1 + ${Math.min(tierA2.length, remaining)} Tier A2`);

  // Write TSV
  const header = ['id', 'company', 'title', 'url', 'location', 'archetype'].join('\t');
  const rows = final.map(e => [
    e.id, e.company, e.title, e.url, e.location, e.archetype,
  ].join('\t'));
  writeFileSync(OUTPUT_PATH, [header, ...rows].join('\n') + '\n');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main();
