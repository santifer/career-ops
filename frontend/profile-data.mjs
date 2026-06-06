import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';

const defaultRootDir = resolve(import.meta.dirname, '..');

function readFile(rootDir, relPath) {
  try {
    return readFileSync(resolve(rootDir, relPath), 'utf-8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return '';
  }
}

function exists(rootDir, relPath) {
  return existsSync(resolve(rootDir, relPath));
}

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

  const experience = [];
  const expLines = sections.experience || [];
  let entry = null;
  for (const line of expLines) {
    const role = line.match(/^###\s+(.+)/);
    if (role) {
      if (entry) experience.push(entry);
      const parts = role[1].split(/\s+[-\u2013\u2014]\s+/);
      entry = { title: parts[0].trim(), company: parts[1]?.trim() || '', dates: '', bullets: [] };
    } else if (entry && line.startsWith('**') && /[-\u2013\u2014]/.test(line)) {
      entry.dates = line.replace(/\*\*/g, '').trim();
    } else if (entry && line.startsWith('- ')) {
      entry.bullets.push(line.slice(2).trim());
    }
  }
  if (entry) experience.push(entry);

  const skillLines = sections.skills || [];
  const skills = {};
  for (const line of skillLines) {
    const match = line.match(/^-\s+\*\*(.+?):\*\*\s+(.+)/);
    if (match) {
      skills[match[1].trim()] = match[2].split(',').map(s => s.trim());
    }
  }

  const summary = (sections.summary || [])
    .filter(l => l.trim() && !/^-{3,}$/.test(l.trim()))
    .join(' ')
    .trim();
  const topLines = raw.split(/^##/m)[0] || '';
  const education = [];
  const eduMatch = topLines.match(/Education:\*\*\s*(.+)/i);
  if (eduMatch) education.push(eduMatch[1].trim());

  const langMatch = topLines.match(/Languages:\*\*\s*(.+)/i);
  const languages = langMatch ? langMatch[1].split(',').map(s => s.trim()) : [];

  return { summary, experience, education, skills, languages };
}

function parseProfile(raw) {
  if (!raw) return {};
  return yaml.load(raw) || {};
}

function parseProfileMd(raw) {
  if (!raw) return { archetypes: [], framingRules: [], exitNarrative: '', compTargets: [] };

  const archetypes = [];
  const archMatch = raw.match(/\|[^|]*Archetype[^|]*\|[^|]*\|[^|]*\|[\s\S]*?(?=\n##|\n$)/i);
  if (archMatch) {
    const rows = archMatch[0].split('\n').filter(r => r.includes('|'));
    for (const row of rows.slice(2)) {
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

  const exitMatch = raw.match(/\*\*Frame:\*\*\s*"([^"]+)"/);
  const exitNarrative = exitMatch ? exitMatch[1] : '';

  const framingRules = [];
  const rulesSection = raw.match(/## Key Framing Rules[\s\S]*?(?=\n##|$)/);
  if (rulesSection) {
    const rules = rulesSection[0].match(/\d+\.\s+\*\*.+?\*\*.*/g) || [];
    for (const r of rules) {
      framingRules.push(r.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '').trim());
    }
  }

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

function parsePortals(raw) {
  if (!raw) {
    return {
      totalCompanies: 0,
      enabledCompanies: 0,
      positiveKeywords: [],
      negativeKeywords: [],
      seniorityBoost: [],
      allowedRegions: [],
      alwaysAllowedRegions: [],
      blockedRegions: [],
      searchQueries: [],
      enabledSearchQueries: 0,
      companyNames: [],
    };
  }

  const data = yaml.load(raw) || {};
  const companies = data.tracked_companies || [];
  const enabled = companies.filter(c => c.enabled !== false);
  const searchQueries = data.search_queries || [];
  const enabledSearchQueries = searchQueries.filter(q => q.enabled !== false);

  return {
    totalCompanies: companies.length,
    enabledCompanies: enabled.length,
    positiveKeywords: data.title_filter?.positive || [],
    negativeKeywords: data.title_filter?.negative || [],
    seniorityBoost: data.title_filter?.seniority_boost || [],
    allowedRegions: data.location_filter?.allow || [],
    alwaysAllowedRegions: data.location_filter?.always_allow || [],
    blockedRegions: data.location_filter?.block || [],
    searchQueries: enabledSearchQueries.map(q => q.query || q.name).filter(Boolean),
    enabledSearchQueries: enabledSearchQueries.length,
    companyNames: enabled.slice(0, 20).map(c => c.name),
  };
}

function parseDigest(raw) {
  if (!raw) return [];
  const sections = [];
  let current = null;
  for (const line of raw.split('\n')) {
    const heading = line.match(/^##\s+(.+)/);
    if (heading) {
      if (current) sections.push(current);
      current = { section: heading[1].trim(), bullets: [] };
    } else if (current) {
      const bullet = line.match(/^-\s+(.+)/) || line.match(/^\d+\.\s+(.+)/);
      if (bullet) current.bullets.push(bullet[1].replace(/\*\*/g, '').trim());
    }
  }
  if (current) sections.push(current);
  return sections;
}

export function buildProfile({ rootDir = defaultRootDir } = {}) {
  const cvRaw = readFile(rootDir, 'cv.md');
  const profileRaw = readFile(rootDir, 'config/profile.yml');
  const profileMdRaw = readFile(rootDir, 'modes/_profile.md');
  const portalsRaw = readFile(rootDir, 'portals.yml');
  const digestRaw = readFile(rootDir, 'article-digest.md');

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
  const dealBreakers = profileYml.deal_breakers || {};
  const hardNo = dealBreakers.hard_no || [];
  const likelyNo = dealBreakers.likely_no || [];

  return {
    identity: {
      name: candidate.full_name || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      location: candidate.location || '',
      timezone: location.timezone || '',
      languages: cv.languages,
      linkedin: candidate.linkedin || '',
      portfolio: candidate.portfolio_url || '',
      substack: candidate.substack || '',
      github: candidate.github || '',
    },
    targeting: {
      primaryRoles: targetRoles.primary || [],
      secondaryRoles: targetRoles.secondary || (targetRoles.archetypes || [])
        .filter(a => a.fit === 'secondary')
        .map(a => a.name),
      archetypes: (targetRoles.archetypes || []).map(a => ({
        name: a.name,
        level: a.level,
        fit: a.fit,
      })),
      industries: targetRoles.industries || [],
      notRelevantRoles: targetRoles.not_relevant || hardNo,
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
      floors: {
        australia: compensation.floors?.australia || '',
        taiwan: compensation.floors?.taiwan || '',
      },
      exceptionsAllowed: compensation.exceptions_allowed || 'Only consider exceptions when there is a specific strategic reason.',
    },
    location: {
      country: location.country || '',
      city: location.city || '',
      timezone: location.timezone || '',
      visaStatus: location.visa_status || '',
      onsiteAvailability: location.onsite_availability || '',
      remotePreference: location.remote_preference || compensation.location_flexibility || '',
      relocationPreference: location.relocation_preference || location.onsite_availability || '',
      hybridTolerance: location.hybrid_tolerance || location.onsite_availability || '',
    },
    strengths: {
      skills: cv.skills,
      keyStrengths: proofPoints.find(p => p.section.includes('Key Strengths'))?.bullets || [],
    },
    dealBreakers: [...hardNo, ...likelyNo],
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
    setup: {
      files: {
        cvExists: exists(rootDir, 'cv.md'),
        cvHasContent: cvRaw.trim().length > 0,
        articleDigestExists: exists(rootDir, 'article-digest.md'),
        articleDigestHasContent: digestRaw.trim().length > 0,
        articleDigestHasLinks: /https?:\/\//.test(digestRaw),
        pipelineExists: exists(rootDir, 'data/pipeline.md'),
        applicationsExists: exists(rootDir, 'data/applications.md'),
      },
      pdf: {
        outputFormat: profileYml.cv?.output_format || '',
        autoPdfScoreThreshold: String(profileYml.cv?.auto_pdf_score_threshold || profileYml.auto_pdf_score_threshold || '3.5'),
      },
      systemHealth: {
        doctorScriptExists: exists(rootDir, 'doctor.mjs'),
        verifyScriptExists: exists(rootDir, 'verify-pipeline.mjs'),
        scanScriptExists: exists(rootDir, 'scan.mjs'),
      },
    },
  };
}
