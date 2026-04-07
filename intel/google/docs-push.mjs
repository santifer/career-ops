/**
 * Google Docs push module — create outreach drafts as Google Docs.
 *
 * Uses the `gws` CLI via execFileSync. Pure functions are exported for testing.
 */

import { execFileSync } from 'node:child_process';

/**
 * Format an outreach draft into a structured document string.
 *
 * @param {{ company: string, role: string, hiringManager: string, draft: string }} params
 * @returns {string}
 */
export function formatOutreachDoc({ company, role, hiringManager, draft }) {
  const date = new Date().toISOString().slice(0, 10);
  const titleLine = `Outreach: ${company} — ${role}`;
  const toLine = `To: ${hiringManager}`;
  const separator = '---';

  return [
    titleLine,
    toLine,
    separator,
    draft,
    separator,
    `Generated: ${date}`,
  ].join('\n');
}

/**
 * Build gws CLI args for creating a Google Doc.
 *
 * @param {string|null|undefined} folderId — parent folder ID (omitted if falsy)
 * @param {string} title
 * @param {string} content
 * @returns {string[]}
 */
export function buildCreateArgs(folderId, title, content) {
  const args = [
    'docs',
    '+write',
    '--title', title,
    '--content', content,
  ];

  if (folderId) {
    args.push('--parent', folderId);
  }

  return args;
}

/**
 * Create a Google Doc and return its URL.
 *
 * @param {string|null} folderId
 * @param {string} title
 * @param {string} content
 * @returns {string} Google Docs URL extracted from gws output
 */
export function createDoc(folderId, title, content) {
  const args = buildCreateArgs(folderId, title, content);
  const output = execFileSync('gws', args, { encoding: 'utf8' });
  const match = output.match(/https:\/\/docs\.google\.com\/\S+/);
  return match ? match[0] : output.trim();
}

/**
 * Push an outreach draft to Google Docs.
 *
 * @param {string|null} folderId
 * @param {{ company: string, role: string, hiringManager: string, draft: string }} draft
 * @returns {string} Google Docs URL
 */
export function pushOutreachDraft(folderId, draft) {
  const { company, role } = draft;
  const title = `Outreach - ${company} - ${role}`;
  const content = formatOutreachDoc(draft);
  return createDoc(folderId, title, content);
}
