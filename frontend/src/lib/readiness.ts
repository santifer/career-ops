import type { CandidateProfile } from '../types/profile';

export interface ReadinessResult {
  score: number;
  filled: number;
  total: number;
  missing: string[];
}

interface ReadinessField {
  label: string;
  check: (p: CandidateProfile) => boolean;
}

const fields: ReadinessField[] = [
  { label: 'Full name', check: p => !!p.identity.name },
  { label: 'Email', check: p => !!p.identity.email },
  { label: 'Location', check: p => !!p.identity.location },
  { label: 'Phone number', check: p => !!p.identity.phone },
  { label: 'LinkedIn', check: p => !!p.identity.linkedin },
  { label: 'Portfolio URL', check: p => !!p.identity.portfolio },
  { label: 'GitHub', check: p => !!p.identity.github },
  { label: 'Target roles', check: p => p.targeting.primaryRoles.length > 0 },
  { label: 'Role archetypes', check: p => p.targeting.archetypes.length > 0 },
  { label: 'Headline', check: p => !!p.narrative.headline },
  { label: 'Exit story', check: p => !!p.narrative.exitStory },
  { label: 'Superpowers', check: p => p.narrative.superpowers.length > 0 },
  { label: 'Proof points', check: p => p.narrative.proofPoints.length > 0 },
  { label: 'Salary range', check: p => !!p.compensation.targetRange },
  { label: 'Location flexibility', check: p => !!p.compensation.locationFlexibility },
  { label: 'Visa status', check: p => !!p.location.visaStatus },
  { label: 'Deal-breakers', check: p => p.dealBreakers.length > 0 },
  { label: 'CV summary', check: p => !!p.cv.summary },
  { label: 'Work experience', check: p => p.cv.experience.length > 0 },
  { label: 'Skills', check: p => Object.keys(p.cv.skills).length > 0 },
  { label: 'Search sources', check: p => p.searchSources.enabledCompanies > 0 },
  { label: 'Strongest achievement', check: p => p.strengths.keyStrengths.length > 0 },
];

export function computeReadiness(profile: CandidateProfile): ReadinessResult {
  const missing: string[] = [];
  let filled = 0;

  for (const f of fields) {
    if (f.check(profile)) {
      filled++;
    } else {
      missing.push(f.label);
    }
  }

  return {
    score: Math.round((filled / fields.length) * 100),
    filled,
    total: fields.length,
    missing,
  };
}
