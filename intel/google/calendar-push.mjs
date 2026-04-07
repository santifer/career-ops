/**
 * Google Calendar push module — create interview events.
 *
 * Uses the `gws` CLI via execFileSync. Pure functions are exported for testing.
 */

import { execFileSync } from 'node:child_process';

/**
 * Format an event description with all relevant interview context.
 *
 * @param {{ company: string, role: string, score: string, reportLink: string, notes: string }} params
 * @returns {string}
 */
export function formatEventDescription({ company, role, score, reportLink, notes }) {
  const lines = [
    `Company: ${company}`,
    `Role: ${role}`,
  ];

  if (score) lines.push(`Score: ${score}`);
  if (reportLink) lines.push(`Report: ${reportLink}`);
  if (notes) lines.push(`Notes: ${notes}`);

  return lines.join('\n');
}

/**
 * Build gws CLI args for inserting a calendar event.
 * Optional fields (end, description, location) are omitted when falsy.
 *
 * @param {{ title: string, start: string, end?: string, description?: string, location?: string }} params
 * @returns {string[]}
 */
export function buildInsertArgs({ title, start, end, description, location }) {
  const args = [
    'calendar',
    '+insert',
    '--title', title,
    '--start', start,
  ];

  if (end) args.push('--end', end);
  if (description) args.push('--description', description);
  if (location) args.push('--location', location);

  return args;
}

/**
 * Calculate an ISO end time by adding durationMinutes to a start ISO string.
 *
 * @param {string} startIso — ISO 8601 datetime string
 * @param {number} durationMinutes
 * @returns {string} ISO 8601 end datetime
 */
function addMinutes(startIso, durationMinutes) {
  const date = new Date(startIso);
  date.setMinutes(date.getMinutes() + durationMinutes);
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}

/**
 * Create an interview event in Google Calendar.
 *
 * @param {{ company: string, role: string, start: string, durationMinutes?: number, score: string, reportLink: string, notes: string }} params
 * @returns {string} stdout from gws
 */
export function createInterviewEvent({
  company,
  role,
  start,
  durationMinutes = 60,
  score,
  reportLink,
  notes,
}) {
  const title = `Interview: ${company} - ${role}`;
  const end = addMinutes(start, durationMinutes);
  const description = formatEventDescription({ company, role, score, reportLink, notes });

  const args = buildInsertArgs({ title, start, end, description });
  return execFileSync('gws', args, { encoding: 'utf8' });
}
