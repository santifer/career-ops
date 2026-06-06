import type { JobRecommendation, ProfileUpdatePath, ProposedUpdate } from '../types/agent';
import type { AgentContext } from './mockAgent';
import { getNextOnboardingQuestion } from './onboarding';

interface FreeformResult {
  response: string;
  updates?: ProposedUpdate[];
  jobRecommendation?: JobRecommendation;
  followUp?: string;
}

interface Pattern {
  keywords: string[];
  handle: (text: string, context: AgentContext) => FreeformResult;
}

const patterns: Pattern[] = [
  {
    keywords: ['deal-breaker', 'dealbreaker', 'won\'t', 'never', 'refuse', 'no way', 'absolutely not', 'can\'t stand', 'hate', 'no roles', 'no on-site', 'no remote', 'no startups', 'no companies'],
    handle: (text, context) => ({
      response: 'I\'ll add that to your deal-breakers.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'dealBreakers',
        field: 'dealBreakers',
        path: 'dealBreakers',
        operation: 'append',
        currentValue: context.profile.dealBreakers.join(', '),
        proposedValue: text,
        reason: 'You mentioned this as something you won\'t accept in a role.',
        status: 'pending',
      }],
    }),
  },
  {
    keywords: ['salary', 'pay', 'compensation', 'money', 'earn', '$', 'k per', 'a year', 'per year'],
    handle: (text, context) => ({
      response: 'I\'ll update your compensation expectations.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'compensation',
        field: 'targetRange',
        path: 'compensation.targetRange',
        operation: 'replace',
        currentValue: context.profile.compensation.targetRange,
        proposedValue: text,
        reason: 'You shared compensation expectations.',
        status: 'pending',
      }],
    }),
  },
  {
    keywords: ['interested in', 'looking for', 'target', 'want to work', 'want a role', 'role in', 'career in'],
    handle: (text, context) => ({
      response: 'I\'ll add that to your target roles.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'targeting',
        field: 'primaryRoles',
        path: 'targeting.primaryRoles',
        operation: 'append',
        currentValue: context.profile.targeting.primaryRoles.join(', '),
        proposedValue: text,
        reason: 'You expressed interest in this type of role.',
        status: 'pending',
      }],
    }),
  },
  {
    keywords: ['i know', 'i can', 'i\'ve used', 'experience with', 'skilled in', 'proficient', 'worked with'],
    handle: (text, context) => ({
      response: 'I\'ll add that to your skills.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'strengths',
        field: 'keyStrengths',
        path: 'strengths.keyStrengths',
        operation: 'append',
        currentValue: context.profile.strengths.keyStrengths.join(', '),
        proposedValue: text,
        reason: 'You mentioned this skill or experience.',
        status: 'pending',
      }],
    }),
  },
  {
    keywords: ['phone', 'number is', 'call me', 'reach me'],
    handle: (text, context) => ({
      response: 'I\'ll update your phone number.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'identity',
        field: 'phone',
        path: 'identity.phone',
        operation: 'replace',
        currentValue: context.profile.identity.phone,
        proposedValue: text.replace(/^.*?([\d+\-().\s]{7,}).*$/, '$1').trim() || text,
        reason: 'You shared your phone number.',
        status: 'pending',
      }],
    }),
  },
  {
    keywords: ['portfolio', 'website', 'site is', 'github', 'linkedin', '.com', '.io', '.dev'],
    handle: (text, context) => {
      const field = text.toLowerCase().includes('github') ? 'github'
        : text.toLowerCase().includes('linkedin') ? 'linkedin'
        : 'portfolio';
      const path = `identity.${field}` as ProfileUpdatePath;
      return {
        response: `I'll update your ${field}.`,
        updates: [{
          id: crypto.randomUUID(),
          section: 'identity',
          field,
          path,
          operation: 'replace',
          currentValue: context.profile.identity[field],
          proposedValue: text,
          reason: `You shared your ${field} URL.`,
          status: 'pending',
        }],
      };
    },
  },
  {
    keywords: ['achievement', 'proud of', 'best work', 'strongest', 'highlight', 'lead with'],
    handle: (text, context) => ({
      response: 'That\'s a strong proof point. I\'ll add it to your strengths.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'strengths',
        field: 'keyStrengths',
        path: 'strengths.keyStrengths',
        operation: 'append',
        currentValue: context.profile.strengths.keyStrengths.join(', '),
        proposedValue: text,
        reason: 'You described this as a key achievement.',
        status: 'pending',
      }],
    }),
  },
];

export function handleFreeform(text: string, context: AgentContext): FreeformResult {
  const lower = text.toLowerCase();
  const jobUrl = findJobUrl(text);

  if (jobUrl) {
    return {
      response: 'I can run the demo version of the first evaluation step from that URL. In Part 2 this would fetch the posting, verify it with the browser, and run the full career-ops scoring pipeline.',
      jobRecommendation: createMockJobRecommendation(jobUrl, context),
    };
  }

  // Try pattern matching
  for (const pattern of patterns) {
    if (pattern.keywords.some(kw => lower.includes(kw))) {
      const result = pattern.handle(text, context);
      // Add follow-up question
      const nextQ = getNextOnboardingQuestion(context.profile);
      if (nextQ) {
        result.followUp = nextQ;
      }
      return result;
    }
  }

  // Fallback: acknowledge and ask next onboarding question
  const nextQ = getNextOnboardingQuestion(context.profile);
  if (nextQ) {
    return {
      response: 'Got it, I\'ve noted that. Let me ask you something else.',
      followUp: nextQ,
    };
  }

  return {
    response: 'Thanks for sharing that. Your profile is looking solid. You can highlight text on the left and add comments to refine any section, or paste a job URL when you\'re ready to evaluate a role.',
  };
}

function findJobUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  if (!match) return null;

  const url = match[0].replace(/[.,;!?]+$/, '');
  return isJobUrl(url) ? url : null;
}

function isJobUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return [
    'greenhouse',
    'lever',
    'ashby',
    'workable',
    'careers',
    'jobs',
    'boards',
    '/job',
  ].some(signal => lower.includes(signal));
}

function createMockJobRecommendation(url: string, context: AgentContext): JobRecommendation {
  const targetRoles = context.profile.targeting.primaryRoles.slice(0, 2);
  const strengths = context.profile.strengths.keyStrengths.slice(0, 2);
  const dealBreakers = context.profile.dealBreakers.slice(0, 2);
  const hiddenDealBreakerCount = Math.max(context.profile.dealBreakers.length - dealBreakers.length, 0);
  const roleSummary = targetRoles.length > 0 ? targetRoles.join(' / ') : 'your target roles';

  return {
    url,
    score: '4.2/5',
    recommendation: 'Worth applying',
    matchReasons: [
      `The posting looks close to ${roleSummary}, which is already in your target profile.`,
      strengths[0]
        ? `It can be framed around your proof point: ${strengths[0]}`
        : 'Your CV has enough structured context for a first-pass recommendation.',
    ],
    risks: [
      context.profile.dealBreakers.length > 0
        ? `I would still check this against your deal-breakers: ${dealBreakers.join(', ')}${hiddenDealBreakerCount > 0 ? `, and ${hiddenDealBreakerCount} more.` : '.'}`
        : 'Your deal-breakers are not set yet, so this recommendation is optimistic.',
      'This Part 1 evaluation uses profile context only. Part 2 should fetch and verify the live posting before scoring.',
    ],
    cta: 'Next in the full product: verified report, tailored CV PDF, and tracker update.',
  };
}
