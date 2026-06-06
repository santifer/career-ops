/**
 * prebuild.mjs — reads career-ops data files and generates src/data/seed.ts
 *
 * Reads: cv.md, config/profile.yml, modes/_profile.md, portals.yml, article-digest.md
 * Writes: src/data/seed.ts (a typed CandidateProfile export)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readFile(relPath) {
  try {
    return readFileSync(resolve(root, relPath), 'utf-8');
  } catch {
    console.warn(`Warning: ${relPath} not found, using empty`);
    return '';
  }
}

// ── Parse cv.md ──
function parseCv(raw) {
  const sections = {};
  let current = '';
  for (const line of raw.split('\n')) {
    const heading = line.match(/^##\s+(.+)/);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }

  // Parse experience entries (### headings)
  const experience = [];
  const expLines = sections['experience'] || [];
  let entry = null;
  for (const line of expLines) {
    const role = line.match(/^###\s+(.+)/);
    if (role) {
      if (entry) experience.push(entry);
      // Parse "Role — Company"
      const parts = role[1].split(/\s+[—–-]\s+/);
      entry = { title: parts[0].trim(), company: parts[1]?.trim() || '', dates: '', bullets: [] };
    } else if (entry && line.startsWith('**') && line.includes('–')) {
      entry.dates = line.replace(/\*\*/g, '').trim();
    } else if (entry && line.startsWith('- ')) {
      entry.bullets.push(line.slice(2).trim());
    }
  }
  if (entry) experience.push(entry);

  // Parse skills
  const skillLines = sections['skills'] || [];
  const skills = {};
  for (const line of skillLines) {
    const match = line.match(/^-\s+\*\*(.+?):\*\*\s+(.+)/);
    if (match) {
      skills[match[1].trim()] = match[2].split(',').map(s => s.trim());
    }
  }

  // Summary
  const summary = (sections['summary'] || []).filter(l => l.trim()).join(' ').trim();

  // Top-level info (before first ##)
  const topLines = raw.split(/^##/m)[0] || '';
  const education = [];
  const eduMatch = topLines.match(/Education:\*\*\s*(.+)/i);
  if (eduMatch) education.push(eduMatch[1].trim());

  const langMatch = topLines.match(/Languages:\*\*\s*(.+)/i);
  const languages = langMatch ? langMatch[1].split(',').map(s => s.trim()) : [];

  return { summary, experience, education, skills, languages };
}

// ── Parse profile.yml ──
function parseProfile(raw) {
  if (!raw) return {};
  return yaml.load(raw) || {};
}

// ── Parse _profile.md ──
function parseProfileMd(raw) {
  if (!raw) return { archetypes: [], framingRules: [], exitNarrative: '', compTargets: [] };

  const archetypes = [];
  const archMatch = raw.match(/\|[^|]*Archetype[^|]*\|[^|]*\|[^|]*\|[\s\S]*?(?=\n##|\n$)/i);
  if (archMatch) {
    const rows = archMatch[0].split('\n').filter(r => r.includes('|'));
    for (const row of rows.slice(2)) { // skip header + separator
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        archetypes.push({
          name: cells[0].replace(/\*\*/g, ''),
          axes: cells[1],
          whatTheyBuy: cells[2],
        });
      }
    }
  }

  // Exit narrative
  const exitMatch = raw.match(/\*\*Frame:\*\*\s*"([^"]+)"/);
  const exitNarrative = exitMatch ? exitMatch[1] : '';

  // Framing rules
  const framingRules = [];
  const rulesSection = raw.match(/## Key Framing Rules[\s\S]*?(?=\n##|$)/);
  if (rulesSection) {
    const rules = rulesSection[0].match(/\d+\.\s+\*\*.+?\*\*.*/g) || [];
    for (const r of rules) {
      framingRules.push(r.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '').trim());
    }
  }

  // Comp targets
  const compTargets = [];
  const compSection = raw.match(/## Your Comp Targets[\s\S]*?(?=\n##|$)/);
  if (compSection) {
    const rows = compSection[0].split('\n').filter(r => r.includes('|'));
    for (const row of rows.slice(2)) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        compTargets.push({ roleType: cells[0], market: cells[1], range: cells[2] });
      }
    }
  }

  return { archetypes, framingRules, exitNarrative, compTargets };
}

// ── Parse portals.yml ──
function parsePortals(raw) {
  if (!raw) return { totalCompanies: 0, enabledCompanies: 0, positiveKeywords: [], negativeKeywords: [] };
  const data = yaml.load(raw) || {};
  const companies = data.tracked_companies || [];
  const enabled = companies.filter(c => c.enabled !== false);
  return {
    totalCompanies: companies.length,
    enabledCompanies: enabled.length,
    positiveKeywords: data.title_filter?.positive || [],
    negativeKeywords: data.title_filter?.negative || [],
    companyNames: enabled.slice(0, 20).map(c => c.name),
  };
}

// ── Parse article-digest.md ──
function parseDigest(raw) {
  if (!raw) return [];
  const sections = [];
  let current = null;
  for (const line of raw.split('\n')) {
    const heading = line.match(/^##\s+(.+)/);
    if (heading) {
      if (current) sections.push(current);
      current = { section: heading[1].trim(), bullets: [] };
    } else if (current && line.startsWith('- ')) {
      current.bullets.push(line.slice(2).replace(/\*\*/g, '').trim());
    }
  }
  if (current) sections.push(current);
  return sections;
}

// ── Build ──
const cvRaw = readFile('cv.md');
const profileRaw = readFile('config/profile.yml');
const profileMdRaw = readFile('modes/_profile.md');
const portalsRaw = readFile('portals.yml');
const digestRaw = readFile('article-digest.md');

const cv = parseCv(cvRaw);
const profileYml = parseProfile(profileRaw);
const profileMd = parseProfileMd(profileMdRaw);
const portals = parsePortals(portalsRaw);
const proofPoints = parseDigest(digestRaw);

const candidate = profileYml.candidate || {};
const targetRoles = profileYml.target_roles || {};
const narrative = profileYml.narrative || {};
const compensation = profileYml.compensation || {};
const location = profileYml.location || {};

const seed = {
  identity: {
    name: candidate.full_name || '',
    email: candidate.email || '',
    phone: candidate.phone || '',
    location: candidate.location || '',
    timezone: location.timezone || '',
    languages: cv.languages,
    linkedin: candidate.linkedin || '',
    portfolio: candidate.portfolio_url || '',
    github: candidate.github || '',
  },
  targeting: {
    primaryRoles: targetRoles.primary || [],
    archetypes: (targetRoles.archetypes || []).map(a => ({
      name: a.name,
      level: a.level,
      fit: a.fit,
    })),
    industries: [],
  },
  narrative: {
    headline: narrative.headline || '',
    exitStory: profileMd.exitNarrative || narrative.exit_story || '',
    superpowers: narrative.superpowers || [],
    proofPoints: (narrative.proof_points || []).map(p => ({
      name: p.name,
      heroMetric: p.hero_metric,
    })),
  },
  compensation: {
    targetRange: compensation.target_range || '',
    currency: compensation.currency || '',
    minimum: compensation.minimum || '',
    locationFlexibility: compensation.location_flexibility || '',
  },
  location: {
    country: location.country || '',
    city: location.city || '',
    timezone: location.timezone || '',
    visaStatus: location.visa_status || '',
    onsiteAvailability: location.onsite_availability || '',
  },
  strengths: {
    skills: cv.skills,
    keyStrengths: (proofPoints.find(p => p.section.includes('Key Strengths'))?.bullets || []),
  },
  dealBreakers: [],
  cv: {
    summary: cv.summary,
    experience: cv.experience,
    education: cv.education,
    skills: cv.skills,
  },
  searchSources: portals,
  proofPoints: proofPoints.filter(p => !p.section.includes('Key Strengths')),
  profileMd: {
    archetypes: profileMd.archetypes,
    framingRules: profileMd.framingRules,
    compTargets: profileMd.compTargets,
  },
};

// Write seed.ts
mkdirSync(resolve(__dirname, 'src/data'), { recursive: true });
const output = `// Auto-generated by prebuild.mjs — do not edit manually
import type { CandidateProfile } from '../types/profile';

export const seedProfile: CandidateProfile = ${JSON.stringify(seed, null, 2)} as const;
`;
writeFileSync(resolve(__dirname, 'src/data/seed.ts'), output);
console.log('prebuild: wrote src/data/seed.ts');
