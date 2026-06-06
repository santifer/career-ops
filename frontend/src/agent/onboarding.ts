import type { CandidateProfile } from '../types/profile';

interface OnboardingCheck {
  field: string;
  question: string;
  check: (p: CandidateProfile) => boolean;
}

const checks: OnboardingCheck[] = [
  {
    field: 'dealBreakers',
    question: 'What are your deal-breakers? Things that would make you immediately pass on a role, no matter how good the rest looks.',
    check: p => p.dealBreakers.length > 0,
  },
  {
    field: 'identity.phone',
    question: 'Do you have a phone number you want to include in applications? Some companies prefer having one on file.',
    check: p => !!p.identity.phone,
  },
  {
    field: 'identity.portfolio',
    question: 'Do you have a portfolio or personal website? It helps differentiate you from other candidates.',
    check: p => !!p.identity.portfolio,
  },
  {
    field: 'identity.github',
    question: 'Do you have a GitHub profile? Even a few public repos can signal technical ability to hiring managers.',
    check: p => !!p.identity.github,
  },
  {
    field: 'strengths.keyStrengths',
    question: 'What would you say is your strongest professional achievement? The one thing you would lead with in any interview.',
    check: p => p.strengths.keyStrengths.length > 0,
  },
];

export function getNextOnboardingQuestion(profile: CandidateProfile): string | null {
  for (const check of checks) {
    if (!check.check(profile)) {
      return check.question;
    }
  }
  return null;
}

export function getOnboardingField(profile: CandidateProfile): string | null {
  for (const check of checks) {
    if (!check.check(profile)) {
      return check.field;
    }
  }
  return null;
}
