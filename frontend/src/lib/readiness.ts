import type { CandidateProfile } from '../types/profile';

export interface ReadinessResult {
  score: number;
  filled: number;
  total: number;
  missing: string[];
  missingItems: ReadinessMissingItem[];
}

export interface ReadinessMissingItem {
  label: string;
  missing: string[];
  priority: 'critical' | 'normal';
}

interface ReadinessCheck {
  label: string;
  check: (p: CandidateProfile) => boolean;
}

interface ReadinessArea {
  label: string;
  priority?: 'critical' | 'normal';
  checks: ReadinessCheck[];
}

const areas: ReadinessArea[] = [
  {
    label: 'Identity',
    checks: [
      { label: 'Full name', check: p => hasText(p.identity.name) },
      { label: 'Email', check: p => hasText(p.identity.email) },
      { label: 'Phone', check: p => hasText(p.identity.phone) },
      { label: 'Location', check: p => hasText(p.identity.location) },
      { label: 'LinkedIn', check: p => hasText(p.identity.linkedin) },
      { label: 'Portfolio URL', check: p => hasText(p.identity.portfolio) },
      { label: 'Substack', check: p => hasText(p.identity.substack) },
      { label: 'GitHub', check: p => hasText(p.identity.github) },
    ],
  },
  {
    label: 'Target roles',
    priority: 'critical',
    checks: [
      { label: 'Primary roles', check: p => p.targeting.primaryRoles.length > 0 },
      { label: 'Secondary roles', check: p => p.targeting.secondaryRoles.length > 0 },
      { label: 'Role archetypes', check: p => p.targeting.archetypes.length > 0 && p.profileMd.archetypes.length > 0 },
      { label: 'Jobs that are not relevant', check: p => p.targeting.notRelevantRoles.length > 0 },
    ],
  },
  {
    label: 'Salary floors',
    priority: 'critical',
    checks: [
      { label: 'AU floor', check: p => hasText(p.compensation.floors.australia) },
      { label: 'Taiwan floor', check: p => hasText(p.compensation.floors.taiwan) },
      { label: 'Preferred range', check: p => hasText(p.compensation.targetRange) },
      { label: 'Exception policy', check: p => hasText(p.compensation.exceptionsAllowed) },
    ],
  },
  {
    label: 'Location policy',
    priority: 'critical',
    checks: [
      { label: 'Current city and timezone', check: p => hasText(p.location.city) && hasText(p.location.timezone) },
      { label: 'Work rights or visa status', check: p => hasText(p.location.visaStatus) },
      { label: 'Remote preference', check: p => mentions(p.location.remotePreference, ['remote']) },
      { label: 'Melbourne relocation preference', check: p => mentions(p.location.relocationPreference, ['melbourne', 'relocat']) },
      { label: 'Hybrid or on-site tolerance', check: p => hasText(p.location.hybridTolerance) || hasText(p.location.onsiteAvailability) },
    ],
  },
  {
    label: 'Deal-breakers',
    priority: 'critical',
    checks: [
      { label: 'Hard no roles', check: p => p.targeting.notRelevantRoles.length > 0 || p.dealBreakers.length > 0 },
      { label: 'Hard no industries', check: p => p.searchSources.negativeKeywords.length > 0 || mentions(join(p.dealBreakers), ['industr', 'crypto', 'web3']) },
      { label: 'Minimum salary', check: p => mentions(join(p.dealBreakers) || p.compensation.minimum, ['a$', 'nt$', 'salary', 'below']) },
      { label: 'Pure sales or quota tolerance', check: p => mentions(join(p.dealBreakers), ['quota', 'sales', 'outbound']) },
      { label: 'Company stage preference', check: p => mentions(join(p.dealBreakers) + join(p.searchSources.searchQueries), ['startup', 'stage', 'product']) },
      { label: 'Work style red flags', check: p => mentions(join(p.dealBreakers), ['ownership', 'support', 'implementation', 'on-site', 'onsite']) },
    ],
  },
  {
    label: 'CV source',
    checks: [
      { label: 'cv.md exists', check: p => p.setup.files.cvExists && p.setup.files.cvHasContent },
      { label: 'Accurate dates', check: p => p.cv.experience.length > 0 && p.cv.experience.every(exp => hasText(exp.dates)) },
      { label: 'Strong metrics', check: p => hasMetric(p.cv.summary + join(p.cv.experience.flatMap(exp => exp.bullets))) },
      { label: 'Correct role titles', check: p => p.cv.experience.length > 0 && p.cv.experience.every(exp => hasText(exp.title)) },
      { label: 'No outdated positioning', check: p => !/---|todo|tbd|placeholder/i.test(p.cv.summary) },
      { label: 'Matches target roles', check: p => mentions(p.cv.summary + join(p.cv.experience.map(exp => exp.title)), roleKeywords(p)) },
    ],
  },
  {
    label: 'Proof points',
    checks: [
      { label: 'article-digest.md exists', check: p => p.setup.files.articleDigestExists && p.setup.files.articleDigestHasContent },
      { label: 'Metrics', check: p => p.setup.files.articleDigestHasContent && hasMetric(join(p.proofPoints.flatMap(point => point.bullets))) },
      { label: 'Case studies and wins', check: p => p.proofPoints.length > 0 && mentions(join(p.proofPoints.map(point => point.section)), ['renmory', 'mercer', 'grey', 'sweetee']) },
      { label: 'Product, growth, and automation wins', check: p => mentions(join(p.proofPoints.flatMap(point => point.bullets)), ['product', 'growth', 'automation']) },
      { label: 'Links to published work', check: p => p.setup.files.articleDigestHasLinks || hasText(p.identity.portfolio) || hasText(p.identity.substack) },
    ],
  },
  {
    label: 'Title filters',
    priority: 'critical',
    checks: [
      { label: 'Positive title filters', check: p => p.searchSources.positiveKeywords.length > 0 },
      { label: 'Negative title filters', check: p => p.searchSources.negativeKeywords.length > 0 },
      { label: 'Seniority boosts', check: p => p.searchSources.seniorityBoost.length > 0 },
    ],
  },
  {
    label: 'Location filters',
    priority: 'critical',
    checks: [
      { label: 'Allowed regions', check: p => p.searchSources.allowedRegions.length > 0 },
      { label: 'Always-allowed regions', check: p => p.searchSources.alwaysAllowedRegions.length > 0 },
      { label: 'Blocked regions', check: p => p.searchSources.blockedRegions.length > 0 },
    ],
  },
  {
    label: 'Focus companies',
    priority: 'critical',
    checks: [
      { label: 'Tracked company list', check: p => p.searchSources.totalCompanies > 0 },
      { label: 'Enabled focus companies', check: p => p.searchSources.enabledCompanies > 0 },
      { label: 'Visible company names', check: p => p.searchSources.companyNames.length > 0 },
    ],
  },
  {
    label: 'Search queries',
    checks: [
      { label: 'Enabled search queries', check: p => p.searchSources.enabledSearchQueries > 0 },
      { label: 'Queries match target roles', check: p => mentions(join(p.searchSources.searchQueries), roleKeywords(p)) },
    ],
  },
  {
    label: 'Pipeline inbox',
    checks: [
      { label: 'data/pipeline.md exists', check: p => p.setup.files.pipelineExists },
    ],
  },
  {
    label: 'Application tracker',
    checks: [
      { label: 'data/applications.md exists', check: p => p.setup.files.applicationsExists },
    ],
  },
  {
    label: 'PDF settings',
    checks: [
      { label: 'Output format', check: p => hasText(p.setup.pdf.outputFormat) },
      { label: 'Auto-PDF score threshold', check: p => hasText(p.setup.pdf.autoPdfScoreThreshold) },
    ],
  },
  {
    label: 'System health',
    checks: [
      { label: 'doctor.mjs available', check: p => p.setup.systemHealth.doctorScriptExists },
      { label: 'verify-pipeline.mjs available', check: p => p.setup.systemHealth.verifyScriptExists },
      { label: 'scan.mjs available', check: p => p.setup.systemHealth.scanScriptExists },
    ],
  },
];

export function computeReadiness(profile: CandidateProfile): ReadinessResult {
  const missingItems: ReadinessMissingItem[] = [];
  let filled = 0;

  for (const area of areas) {
    const missing = area.checks
      .filter(check => !check.check(profile))
      .map(check => check.label);

    if (missing.length === 0) {
      filled++;
    } else {
      missingItems.push({
        label: area.label,
        missing,
        priority: area.priority || 'normal',
      });
    }
  }

  return {
    score: Math.round((filled / areas.length) * 100),
    filled,
    total: areas.length,
    missing: missingItems.map(item => item.label),
    missingItems,
  };
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function join(values: string[]): string {
  return values.join(' ');
}

function mentions(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function hasMetric(text: string): boolean {
  return /\d/.test(text);
}

function roleKeywords(profile: CandidateProfile): string[] {
  return [
    ...profile.targeting.primaryRoles,
    ...profile.targeting.secondaryRoles,
    ...profile.targeting.archetypes.map(role => role.name),
  ]
    .flatMap(role => role.split(/[\s/]+/))
    .filter(term => term.length > 3);
}
