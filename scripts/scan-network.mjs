#!/usr/bin/env node
/**
 * scripts/scan-network.mjs — Local network/relationship graph scanner.
 *
 * Walks local corpus sources to identify people Mitchell knows / has worked
 * with / has cited / has been cited by. Pure local read — no API calls.
 *
 * Output: data/network-graph.json (gitignored — contains private contact data)
 *
 * Usage:
 *   node scripts/scan-network.mjs                       # full scan
 *   node scripts/scan-network.mjs --target-company anthropic
 *   node scripts/scan-network.mjs --dry-run              # print JSON, no write
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = join(REPO_ROOT, 'data', 'network-graph.json');

// Gitignored personal files live in the main checkout, not worktrees.
// Resolve to main repo when the file isn't present in REPO_ROOT.
const MAIN_REPO = (() => {
  // If we're in a worktree under .claude/worktrees/, resolve back to main
  const m = REPO_ROOT.match(/^(.*?\/career-ops)(?:\/\.claude\/worktrees\/[^/]+)?$/);
  return m ? m[1] : REPO_ROOT;
})();

function resolvePersonalFile(...parts) {
  const inWorktree = join(REPO_ROOT, ...parts);
  if (existsSync(inWorktree)) return inWorktree;
  const inMain = join(MAIN_REPO, ...parts);
  if (existsSync(inMain)) return inMain;
  return inWorktree; // return worktree path so callers can log the missing path cleanly
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TARGET_COMPANY_IDX = args.indexOf('--target-company');
const TARGET_COMPANY = TARGET_COMPANY_IDX >= 0 ? args[TARGET_COMPANY_IDX + 1]?.toLowerCase() : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeRead(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function safeStat(path) {
  try { return statSync(path); } catch { return null; }
}

function safeReaddir(path) {
  try { return readdirSync(path, { withFileTypes: true }); } catch { return []; }
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, '');
}

function isoDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

// ── People registry ───────────────────────────────────────────────────────────

const people = new Map(); // id → person object

function getOrCreate(name) {
  if (!name || name.length < 3) return null;
  const id = slugify(name);
  if (!people.has(id)) {
    people.set(id, {
      id,
      name,
      current_role: null,
      current_company: null,
      relationship_type: [],
      evidence_sources: [],
      last_known_contact: null,
      press_media_potential: false,
      tap_potential: 'unknown',
      notes: '',
    });
  }
  return people.get(id);
}

function addRelationship(name, relType, file, context, contactDate) {
  const p = getOrCreate(name);
  if (!p) return;
  if (!p.relationship_type.includes(relType)) p.relationship_type.push(relType);
  if (!p.evidence_sources.find(e => e.file === file)) {
    p.evidence_sources.push({ file, context: context.slice(0, 120) });
  }
  const dIso = isoDate(contactDate);
  if (dIso && (!p.last_known_contact || dIso > p.last_known_contact)) {
    p.last_known_contact = dIso;
  }
}

function setCompany(name, company, role) {
  const p = getOrCreate(name);
  if (!p) return;
  if (!p.current_company) p.current_company = company;
  if (!p.current_role) p.current_role = role || null;
}

function markMediaPotential(name) {
  const p = getOrCreate(name);
  if (!p) return;
  p.press_media_potential = true;
  if (p.tap_potential === 'unknown') p.tap_potential = 'medium';
}

// ── Media/press organizations ─────────────────────────────────────────────────

const MEDIA_ORGS = new Set([
  'al jazeera', 'aljazeera', 'aj+', 'huffpost', 'huffpost live', 'cnn', 'fusion',
  'abc news', 'univision', 'cctv', 'cctv america', 'the stream', 'new day',
  'pbs', 'nbc', 'msnbc', 'bbc', 'npr', 'vice', 'buzzfeed', 'the guardian',
  'new york times', 'washington post', 'politico', 'the atlantic', 'wired',
  'bloomberg', 'reuters', 'ap news', 'associated press', 'axios', 'techcrunch',
  'the verge', 'ars technica', 'fast company', 'hbr', 'harvard business review',
  'fortune', 'forbes', 'business insider', 'vox', 'vox media', 'substack',
  'media', 'journalism', 'broadcast', 'news', 'press',
]);

function isMediaOrg(company) {
  if (!company) return false;
  const lower = company.toLowerCase();
  return [...MEDIA_ORGS].some(m => lower.includes(m));
}

// ── CV scan ───────────────────────────────────────────────────────────────────

function scanCV() {
  // Walk main repo cv.md (gitignored personal file — also check main repo checkout)
  const cvPath = resolvePersonalFile('cv.md');
  if (!existsSync(cvPath)) {
    console.error('[scan-network] cv.md not found at repo root — skipping');
    return;
  }
  const content = safeRead(cvPath);
  const lines = content.split('\n');
  const file = 'cv.md';

  // Named persons explicitly credited in cv.md
  const namedPeople = [
    // AJ+ / HuffPost Live era
    { name: 'Mara Van Ells', role: 'On-camera principal / show host', org: 'AJ+', relType: 'colleague', context: 'Coached by Mitchell at AJ+; became on-camera principal with own show, Emmy/Webby wins' },
    { name: 'Yara Elmjouie', role: 'On-camera principal / show host', org: 'AJ+', relType: 'colleague', context: 'Coached by Mitchell at AJ+; became on-camera principal with own show, Emmy/Webby wins' },
    { name: 'Sana Saeed', role: 'On-camera principal / show host', org: 'AJ+', relType: 'colleague', context: 'Coached by Mitchell at AJ+; became on-camera principal with own show, Emmy/Webby wins' },
    { name: 'Carmen Yulín Cruz', role: 'Mayor of San Juan', org: 'San Juan Municipality', relType: 'interviewee', context: 'Field-produced crisis interview during active Hurricane Maria response (September 2017)' },
    { name: 'Sarah Michelle Gellar', role: 'Celebrity', org: null, relType: 'interviewee', context: 'Segment producer on celebrity interview at HuffPost Live; named by host on-air' },
    { name: 'Marc Lamont Hill', role: 'TV Host', org: 'HuffPost Live', relType: 'colleague', context: 'Host on trans military panel at HuffPost Live' },
    // Jazz (trans youth episode — no last name; skip)
    { name: 'Maryam Al-Khawaja', role: 'Human rights activist', org: null, relType: 'interviewee', context: 'Foreign Policy Top 100 Global Thinkers #48; booked as primary guest on Bahrain human rights panel' },
    { name: 'Bryn Tanhill', role: 'Trans Navy pilot', org: null, relType: 'interviewee', context: 'Produced trans military service panel 4 years before Pentagon policy reversal' },
    { name: 'Monica Helms', role: 'TAVA, Navy submarine vet', org: 'TAVA', relType: 'interviewee', context: 'Produced trans military service panel at HuffPost Live' },
    { name: 'David McKean', role: 'SLDN', org: 'SLDN', relType: 'interviewee', context: 'Produced trans military service panel at HuffPost Live' },
    { name: 'Sue Fulton', role: 'OutServe', org: 'OutServe', relType: 'interviewee', context: 'Produced trans military service panel at HuffPost Live' },
    // Fusion / CNN era
    { name: 'Mariana Atencio', role: 'Anchor', org: 'Fusion', relType: 'colleague', context: 'Line producer for America with Jorge Ramos; Mariana Atencio confirmed live air credit' },
    { name: 'Karen Travers', role: 'ABC News field reporter', org: 'ABC News', relType: 'colleague', context: 'Integrated ABC News field packages in Fusion Nelson Mandela breaking-news special' },
    { name: 'Lindsay Janis', role: 'ABC News co-anchor', org: 'ABC News', relType: 'colleague', context: 'In-studio co-anchor on Fusion Nelson Mandela live special' },
    { name: 'Alexi Lalas', role: 'ESPN/USMNT analyst', org: 'ESPN', relType: 'interviewee', context: 'Confirmed guest on Fusion World Cup live broadcast from Copacabana' },
    { name: 'Judah Friedlander', role: 'Comedian/personality', org: null, relType: 'interviewee', context: 'Confirmed guest on Fusion World Cup broadcast' },
    { name: 'Benjamin Netanyahu', role: 'Israeli Prime Minister', org: 'Government of Israel', relType: 'interviewee', context: 'Produced exclusive cable interview immediately following his UN General Assembly speech (Oct 2014)' },
    { name: 'Jorge Ramos', role: 'Anchor / Host', org: 'Fusion', relType: 'colleague', context: 'Line producer on "America With Jorge Ramos" at Fusion' },
    // Al Jazeera English / The Stream
    { name: 'Sohaib Athar', role: 'Abbottabad Twitter witness', org: null, relType: 'interviewee', context: 'The Stream launch night — live Skype on OBL death; @ReallyVirtual; follower growth graphed live' },
    // HuffPost Live medical panel
    { name: 'Ahmed Shihab-Eldin', role: 'TV Host / journalist', org: 'Al Jazeera / HuffPost', relType: 'colleague', context: 'Named in story-bank coalition story' },
  ];

  for (const p of namedPeople) {
    addRelationship(p.name, p.relType, file, p.context, null);
    if (p.org) setCompany(p.name, p.org, p.role);
    else {
      const person = getOrCreate(p.name);
      if (person) person.current_role = p.role;
    }
    if (isMediaOrg(p.org) || ['Fusion', 'AJ+', 'HuffPost Live', 'CNN', 'Al Jazeera English', 'Al Jazeera America', 'ABC News', 'ESPN'].includes(p.org)) {
      markMediaPotential(p.name);
    }
    // Set tap_potential for named colleagues with active relationships
    const person = getOrCreate(p.name);
    if (person && ['colleague', 'manager'].includes(p.relType)) {
      person.tap_potential = 'high';
    } else if (person && p.relType === 'interviewee') {
      person.tap_potential = 'medium';
    }
  }

  console.error(`[scan-network] CV scan complete: ${namedPeople.length} named people`);
}

// ── article-digest.md scan ────────────────────────────────────────────────────

function scanArticleDigest() {
  const path = join(REPO_ROOT, 'article-digest.md');
  if (!existsSync(path)) return;
  const content = safeRead(path);
  const file = 'article-digest.md';

  // Extract proper-noun names following "with", "by", "featuring", "produced by"
  const contextPatterns = [
    /(?:produced|produced by|with|featuring|hosted by|anchor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g,
    /(?:Source|Editor|Author):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g,
    /\*\*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\*\*/g,
  ];

  for (const re of contextPatterns) {
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1].trim();
      if (name.length > 5 && name.split(' ').length <= 4) {
        addRelationship(name, 'cited_in_my_work', file, content.slice(Math.max(0, m.index - 40), m.index + 80), null);
      }
    }
  }

  console.error('[scan-network] article-digest.md scanned');
}

// ── story-bank.md scan ────────────────────────────────────────────────────────

function scanStoryBank() {
  const path = join(REPO_ROOT, 'interview-prep', 'story-bank.md');
  if (!existsSync(path)) return;
  const content = safeRead(path);
  const file = 'interview-prep/story-bank.md';

  // Extract proper-noun names from STAR stories
  // Pattern: capitalized full names in interview narratives
  const re = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(content)) !== null) {
    const candidate = m[1];
    // Skip common false positives (acronyms, org names, section headers)
    if (/^(The|Source|Task|Action|Result|Story|Best|Format|How|This|What|When|Where|Why|March|April|May|June|July|August|September|October|November|December|January|February|Block|Stage|Report|Google|Claude|Fusion|LinkedIn|Anthropic|Amazon|Microsoft|Apple|OpenAI)$/.test(candidate.split(' ')[0])) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (candidate.split(' ').length >= 2) {
      addRelationship(candidate, 'cited_in_my_work', file, content.slice(Math.max(0, m.index - 30), m.index + 80), null);
    }
  }

  // Specific people already known from cv context
  const namedInStories = [
    { name: 'Ahmed Shihab-Eldin', context: 'Named in story-bank coalition story (April 2026)' },
  ];
  for (const p of namedInStories) {
    addRelationship(p.name, 'colleague', file, p.context, '2026-04-01');
    markMediaPotential(p.name);
  }

  console.error('[scan-network] story-bank.md scanned');
}

// ── LinkedIn Connections.csv scan ─────────────────────────────────────────────

function scanLinkedInConnections() {
  const csvPath = resolvePersonalFile('data', 'linkedin', 'Connections.csv');
  if (!existsSync(csvPath)) {
    console.error('[scan-network] data/linkedin/Connections.csv not found — skipping');
    return;
  }

  const content = safeRead(csvPath);
  const lines = content.split('\n');
  let headerLine = -1;
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('First Name,Last Name,URL,Email Address,Company,Position,Connected On')) {
      headerLine = i;
      break;
    }
  }

  if (headerLine < 0) {
    console.error('[scan-network] Could not find header row in Connections.csv');
    return;
  }

  const dataLines = lines.slice(headerLine + 1).filter(l => l.trim());

  for (const line of dataLines) {
    // CSV parsing — handle quoted fields
    const parts = parseCSVLine(line);
    if (parts.length < 6) continue;
    const [firstName, lastName, url, email, company, position, connectedOn] = parts;
    const fullName = `${firstName} ${lastName}`.trim();
    if (!fullName || fullName === ' ') continue;

    addRelationship(fullName, 'linkedin_connection', 'data/linkedin/Connections.csv',
      `${position || ''} at ${company || ''}`.trim(), connectedOn || null);
    setCompany(fullName, company || null, position || null);

    if (isMediaOrg(company)) markMediaPotential(fullName);

    count++;
  }

  console.error(`[scan-network] LinkedIn Connections.csv: ${count} connections loaded`);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── LinkedIn overrides ────────────────────────────────────────────────────────

function applyLinkedInOverrides() {
  const overridesPath = resolvePersonalFile('data', 'linkedin', 'overrides.json');
  if (!existsSync(overridesPath)) return;

  let overrides;
  try {
    overrides = JSON.parse(safeRead(overridesPath));
  } catch {
    return;
  }

  const { no_longer_at = {}, now_at = {}, notes: overrideNotes = {} } = overrides;

  // Apply "no_longer_at" — these people are at a company in CSV but have since left
  for (const [nameLower, companies] of Object.entries(no_longer_at)) {
    const id = slugify(nameLower);
    if (people.has(id)) {
      const p = people.get(id);
      p.notes += ` [override: no longer at ${Array.isArray(companies) ? companies.join(', ') : companies}]`;
    }
  }

  // Apply "now_at" — update current company/role
  for (const [nameLower, info] of Object.entries(now_at)) {
    const id = slugify(nameLower);
    if (people.has(id)) {
      const p = people.get(id);
      if (info.company) p.current_company = info.company;
      if (info.position) p.current_role = info.position;
    }
  }

  // Apply notes
  for (const [nameLower, note] of Object.entries(overrideNotes)) {
    const id = slugify(nameLower);
    if (people.has(id)) {
      people.get(id).notes += ` ${note}`;
    }
  }

  console.error('[scan-network] LinkedIn overrides applied');
}

// ── Memory files scan ─────────────────────────────────────────────────────────

function scanMemoryOverrides() {
  // Check main repo project memory for any named contacts
  const memoryFiles = [
    join(process.env.HOME, '.claude', 'projects',
      '-Users-mitchellwilliams-Documents-career-ops', 'memory',
      'reference_linkedin_overrides.md'),
  ];

  for (const mPath of memoryFiles) {
    if (!existsSync(mPath)) continue;
    const content = safeRead(mPath);
    // Extract any "X is now at Y" or "X left Z" patterns
    const patterns = [
      /([A-Z][a-z]+ [A-Z][a-z]+)\s+is (?:now\s+)?at\s+([\w\s]+?)(?:\.|,|$)/gim,
      /([A-Z][a-z]+ [A-Z][a-z]+)\s+left\s+([\w\s]+?)(?:\.|,|$)/gim,
      /([A-Z][a-z]+ [A-Z][a-z]+)\s+no longer at\s+([\w\s]+?)(?:\.|,|$)/gim,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(content)) !== null) {
        const name = m[1];
        addRelationship(name, 'linkedin_connection', mPath, content.slice(Math.max(0, m.index - 20), m.index + 80), null);
      }
    }
  }
}

// ── HM-intel files scan ───────────────────────────────────────────────────────

function scanHMIntel() {
  const hmDir = join(REPO_ROOT, 'data', 'hm-intel');
  if (!existsSync(hmDir)) return;

  const files = safeReaddir(hmDir).filter(e => !e.isDirectory() && (e.name.endsWith('.json') || e.name.endsWith('.md')));

  for (const entry of files) {
    const filePath = join(hmDir, entry.name);
    const content = safeRead(filePath);
    if (!content || entry.name.startsWith('_')) continue;

    if (entry.name.endsWith('.json')) {
      try {
        const data = JSON.parse(content);
        // HM intel schema: { name, company, role, ... }
        const name = data.name || data.hm_name || data.contact_name;
        const company = data.company || data.employer;
        const role = data.role || data.title || data.position;
        if (name) {
          addRelationship(name, 'recruiter', `data/hm-intel/${entry.name}`, `HM intel: ${company || ''} ${role || ''}`, null);
          if (company) setCompany(name, company, role);
          const p = getOrCreate(name);
          if (p) p.tap_potential = 'high';
        }
      } catch { /* skip malformed */ }
    }
  }

  console.error('[scan-network] HM intel scanned');
}

// ── Writing samples scan ──────────────────────────────────────────────────────

function scanWritingSamples() {
  // voice-reference.md is gitignored but may exist locally (or in main repo checkout)
  const path = resolvePersonalFile('writing-samples', 'voice-reference.md');
  if (!existsSync(path)) return;
  // We only read this file for names — explicitly read-only, no modifications
  const content = safeRead(path);
  const file = 'writing-samples/voice-reference.md';

  // Extract proper-noun bylines, editors, sources from journalism
  const sourcePatterns = [
    /Source:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g,
    /Editor:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g,
    /by ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g,
  ];
  for (const re of sourcePatterns) {
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1].trim();
      if (name.split(' ').length >= 2) {
        addRelationship(name, 'cited_in_my_work', file, content.slice(Math.max(0, m.index - 20), m.index + 60), null);
        markMediaPotential(name);
      }
    }
  }
  console.error('[scan-network] writing-samples/voice-reference.md scanned');
}

// ── Data directory scan ───────────────────────────────────────────────────────

function scanDataDirectory() {
  // Look for follow-ups.md and any recruiter contact logs
  const followUps = resolvePersonalFile('data', 'follow-ups.md');
  if (existsSync(followUps)) {
    const content = safeRead(followUps);
    const file = 'data/follow-ups.md';
    const re = /\|\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\|/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1].trim();
      if (name.split(' ').length >= 2) {
        addRelationship(name, 'recruiter', file, content.slice(Math.max(0, m.index - 20), m.index + 80), null);
      }
    }
  }

  // LinkedIn experience rewrites often contain colleague names
  const linkedInRewrites = resolvePersonalFile('data', 'linkedin-experience-rewrites-2026-05-07.md');
  if (existsSync(linkedInRewrites)) {
    const content = safeRead(linkedInRewrites).slice(0, 5000);
    const file = 'data/linkedin-experience-rewrites-2026-05-07.md';
    const nameRe = /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g;
    const skip = new Set(['Google Engineering', 'VP Level', 'Senior Director', 'Principal Engineer', 'Al Jazeera', 'HuffPost Live']);
    let m;
    while ((m = nameRe.exec(content)) !== null) {
      const name = m[1];
      if (!skip.has(name) && !name.match(/^(The|This|Our|My|An|A |In |Of |To |At |For |With )/i)) {
        addRelationship(name, 'colleague', file, content.slice(Math.max(0, m.index - 30), m.index + 70), null);
      }
    }
  }
}

// ── Target company enrichment ─────────────────────────────────────────────────

const TARGET_COMPANIES = [
  'anthropic', 'google', 'openai', 'meta', 'microsoft', 'amazon', 'apple',
  'nvidia', 'ai2', 'cohere', 'mistral', 'perplexity', 'cursor', 'anysphere',
  'databricks', 'deepgram', 'elevenlabs',
];

function enrichTapPotential() {
  for (const [, p] of people) {
    const company = (p.current_company || '').toLowerCase();

    if (TARGET_COMPANIES.some(tc => company.includes(tc))) {
      if (p.tap_potential === 'unknown') p.tap_potential = 'high';
    }

    if (p.press_media_potential && p.tap_potential === 'unknown') {
      p.tap_potential = 'medium';
    }

    // LinkedIn connections at target companies are high-value
    if (p.relationship_type.includes('linkedin_connection') && TARGET_COMPANIES.some(tc => company.includes(tc))) {
      p.tap_potential = 'high';
    }
  }
}

// ── Build summary ─────────────────────────────────────────────────────────────

function buildSummary(peopleArray) {
  const byRelationship = {};
  let mediaCount = 0;

  for (const p of peopleArray) {
    for (const r of p.relationship_type) {
      byRelationship[r] = (byRelationship[r] || 0) + 1;
    }
    if (p.press_media_potential) mediaCount++;
  }

  // Companies with known contacts
  const companyMap = {};
  for (const p of peopleArray) {
    const co = (p.current_company || '').trim();
    if (!co) continue;
    const coLower = co.toLowerCase();
    for (const tc of TARGET_COMPANIES) {
      if (coLower.includes(tc)) {
        if (!companyMap[tc]) companyMap[tc] = [];
        companyMap[tc].push(p.name);
      }
    }
  }

  const in_target_companies = Object.entries(companyMap)
    .map(([company, names]) => ({ company, count: names.length, names }))
    .sort((a, b) => b.count - a.count);

  return {
    total_people: peopleArray.length,
    by_relationship: byRelationship,
    media_press_contacts: mediaCount,
    in_target_companies,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.error('[scan-network] Starting full scan...');

scanCV();
scanArticleDigest();
scanStoryBank();
scanLinkedInConnections();
applyLinkedInOverrides();
scanMemoryOverrides();
scanHMIntel();
scanWritingSamples();
scanDataDirectory();
enrichTapPotential();

console.error('[scan-network] All scans complete, building output...');

let peopleArray = [...people.values()];

// Filter by target company if specified
if (TARGET_COMPANY) {
  peopleArray = peopleArray.filter(p =>
    (p.current_company || '').toLowerCase().includes(TARGET_COMPANY) ||
    p.evidence_sources.some(e => e.context.toLowerCase().includes(TARGET_COMPANY))
  );
  console.error(`[scan-network] Filtered to ${peopleArray.length} people for company: ${TARGET_COMPANY}`);
}

// Sort by tap_potential then name
const potentialOrder = { high: 0, medium: 1, low: 2, unknown: 3 };
peopleArray.sort((a, b) => {
  const pa = potentialOrder[a.tap_potential] ?? 3;
  const pb = potentialOrder[b.tap_potential] ?? 3;
  return pa !== pb ? pa - pb : a.name.localeCompare(b.name);
});

const output = {
  schema_version: '1.0.0',
  generated_at: new Date().toISOString(),
  people: peopleArray,
  summary: buildSummary(peopleArray),
};

const totalPeople = peopleArray.length;

if (DRY_RUN) {
  // Print summary only in dry-run to avoid dumping thousands of contacts
  const { people: _omitted, ...summaryOnly } = output;
  console.log(JSON.stringify({ ...summaryOnly, people_sample: peopleArray.slice(0, 3) }, null, 2));
  console.error(`[scan-network] DRY RUN — ${totalPeople} people found`);
} else {
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    ok: true,
    output_path: OUTPUT_PATH,
    total_people: totalPeople,
    summary: output.summary,
  }));
  console.error(`[scan-network] Written to ${OUTPUT_PATH}`);
}
