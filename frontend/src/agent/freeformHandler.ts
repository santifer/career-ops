import type { ProposedUpdate } from '../types/agent';
import type { AgentContext } from './mockAgent';
import { getNextOnboardingQuestion, getOnboardingField } from './onboarding';

interface FreeformResult {
  response: string;
  updates?: ProposedUpdate[];
  followUp?: string;
}

interface Pattern {
  keywords: string[];
  handle: (text: string, context: AgentContext) => FreeformResult;
}

const patterns: Pattern[] = [
  {
    keywords: ['deal-breaker', 'dealbreaker', 'won\'t', 'never', 'refuse', 'no way', 'absolutely not', 'can\'t stand', 'hate', 'no on-site', 'no remote', 'no startups', 'no companies'],
    handle: (text, _ctx) => ({
      response: 'I\'ll add that to your deal-breakers.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'dealBreakers',
        field: 'dealBreakers',
        currentValue: '',
        proposedValue: text,
        reason: 'You mentioned this as something you won\'t accept in a role.',
        status: 'pending',
      }],
    }),
  },
  {
    keywords: ['salary', 'pay', 'compensation', 'money', 'earn', '$', 'k per', 'a year', 'per year'],
    handle: (text, _ctx) => ({
      response: 'I\'ll update your compensation expectations.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'compensation',
        field: 'targetRange',
        currentValue: _ctx.profile.compensation.targetRange,
        proposedValue: text,
        reason: 'You shared compensation expectations.',
        status: 'pending',
      }],
    }),
  },
  {
    keywords: ['interested in', 'looking for', 'target', 'want to work', 'want a role', 'role in', 'career in'],
    handle: (text, _ctx) => ({
      response: 'I\'ll add that to your target roles.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'targeting',
        field: 'primaryRoles',
        currentValue: _ctx.profile.targeting.primaryRoles.join(', '),
        proposedValue: text,
        reason: 'You expressed interest in this type of role.',
        status: 'pending',
      }],
    }),
  },
  {
    keywords: ['i know', 'i can', 'i\'ve used', 'experience with', 'skilled in', 'proficient', 'worked with'],
    handle: (text, _ctx) => ({
      response: 'I\'ll add that to your skills.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'strengths',
        field: 'keyStrengths',
        currentValue: '',
        proposedValue: text,
        reason: 'You mentioned this skill or experience.',
        status: 'pending',
      }],
    }),
  },
  {
    keywords: ['phone', 'number is', 'call me', 'reach me'],
    handle: (text, _ctx) => ({
      response: 'I\'ll update your phone number.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'identity',
        field: 'phone',
        currentValue: _ctx.profile.identity.phone,
        proposedValue: text.replace(/^.*?([\d+\-().\s]{7,}).*$/, '$1').trim() || text,
        reason: 'You shared your phone number.',
        status: 'pending',
      }],
    }),
  },
  {
    keywords: ['portfolio', 'website', 'site is', 'github', 'linkedin', '.com', '.io', '.dev'],
    handle: (text, _ctx) => {
      const field = text.toLowerCase().includes('github') ? 'github'
        : text.toLowerCase().includes('linkedin') ? 'linkedin'
        : 'portfolio';
      return {
        response: `I'll update your ${field}.`,
        updates: [{
          id: crypto.randomUUID(),
          section: 'identity',
          field,
          currentValue: '',
          proposedValue: text,
          reason: `You shared your ${field} URL.`,
          status: 'pending',
        }],
      };
    },
  },
  {
    keywords: ['achievement', 'proud of', 'best work', 'strongest', 'highlight', 'lead with'],
    handle: (text, _ctx) => ({
      response: 'That\'s a strong proof point. I\'ll add it to your strengths.',
      updates: [{
        id: crypto.randomUUID(),
        section: 'strengths',
        field: 'keyStrengths',
        currentValue: '',
        proposedValue: text,
        reason: 'You described this as a key achievement.',
        status: 'pending',
      }],
    }),
  },
];

export function handleFreeform(text: string, context: AgentContext): FreeformResult {
  const lower = text.toLowerCase();

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
