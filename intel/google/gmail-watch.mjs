/**
 * Gmail Watch — polls Gmail for recruiter emails via the `gws` CLI.
 * Pure functions are exported separately for testability.
 */

import { execFileSync } from 'node:child_process';

/** Default subject-line patterns that indicate recruiter/application emails. */
const DEFAULT_PATTERNS = ['interview', 'application', 'next steps', 'offer', 'phone screen', 'recruiter'];

/**
 * Check if a subject line matches any recruiter pattern.
 * Case-insensitive substring match.
 *
 * @param {string} subject
 * @param {string[]} [patterns]
 * @returns {boolean}
 */
export function matchesRecruiterPattern(subject, patterns = DEFAULT_PATTERNS) {
  const lower = subject.toLowerCase();
  return patterns.some(p => lower.includes(p.toLowerCase()));
}

/**
 * Classify an email body into an application status.
 * Checks Offer first, then Interview, then Rejected; defaults to 'Responded'.
 *
 * @param {string} body
 * @returns {'Offer'|'Interview'|'Rejected'|'Responded'}
 */
export function classifyResponse(body) {
  if (/\b(extend (an )?offer|offer letter|compensation package|pleased to offer)\b/i.test(body)) {
    return 'Offer';
  }
  if (/\b(schedule|interview|meet|call|screen|chat)\b/i.test(body)) {
    return 'Interview';
  }
  if (/\b(move forward with other|not moving forward|decided not to|unfortunately|regret)\b/i.test(body)) {
    return 'Rejected';
  }
  return 'Responded';
}

/**
 * Parse a raw Gmail message object into a structured record.
 *
 * @param {{ from: string, subject: string, body: string, date: string }} msg
 * @returns {{ from: string, domain: string|undefined, subject: string, date: string, suggestedStatus: string, bodyPreview: string }}
 */
export function parseGmailMessage(msg) {
  const { from, subject, body, date } = msg;
  return {
    from,
    domain: from.split('@')[1],
    subject,
    date,
    suggestedStatus: classifyResponse(body),
    bodyPreview: body.slice(0, 200),
  };
}

/**
 * Poll Gmail for messages after a given date matching recruiter patterns.
 * Calls the `gws gmail +list` CLI command.
 *
 * @param {string} afterDate — ISO date string, e.g. '2026-01-01'
 * @param {string[]} [patterns]
 * @returns {Array<ReturnType<parseGmailMessage>>}
 */
export function pollGmail(afterDate, patterns = DEFAULT_PATTERNS) {
  try {
    const query = `after:${afterDate}`;
    const raw = execFileSync('gws', ['gmail', '+list', '--query', query, '--format', 'json'], {
      encoding: 'utf8',
    });
    const messages = JSON.parse(raw);
    return messages
      .filter(msg => matchesRecruiterPattern(msg.subject ?? '', patterns))
      .map(parseGmailMessage);
  } catch {
    return [];
  }
}
