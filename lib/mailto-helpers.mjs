/**
 * lib/mailto-helpers.mjs — RFC 6068-compliant mailto: URL builder.
 *
 * RFC 6068 Section 5 mandates %0D%0A (CRLF) for line-breaks in the body
 * parameter. encodeURIComponent produces %0A (LF only) for \n characters;
 * this module forces the required CRLF encoding.
 *
 * Practical truncation limit: ~2,000 chars total URL length across most
 * desktop and mobile clients. We cap the pre-filled body at 1,800 chars
 * to leave headroom for subject + email address.
 *
 * Usage:
 *   import { buildMailtoUrl, buildOutreachMailto } from './lib/mailto-helpers.mjs';
 *   const url = buildMailtoUrl({ to: 'foo@bar.com', subject: 'Hi', body: 'Hello\nWorld' });
 */

const MAX_MAILTO_CHARS = 1800; // practical safe limit across clients

/**
 * Encode a string for use as a mailto: parameter value.
 * Encodes all URI-reserved chars + forces CRLF newlines per RFC 6068 §5.
 */
function mailtoEncode(str) {
  if (!str) return '';
  // encodeURIComponent encodes everything except A-Z a-z 0-9 - _ . ! ~ * ' ( )
  // We then replace the %0A LF sequences with %0D%0A CRLF as RFC 6068 requires.
  return encodeURIComponent(String(str)).replace(/%0A/g, '%0D%0A');
}

/**
 * Build a mailto: URL with optional subject and body pre-fill.
 *
 * @param {object} opts
 * @param {string}  opts.to       - recipient email (can be empty for 'mailto:?...' form)
 * @param {string} [opts.subject] - subject line (not encoded yet)
 * @param {string} [opts.body]    - body text with real newlines (not encoded yet)
 * @param {number} [opts.maxChars=1800] - max total URL length before body trim
 * @returns {string} fully formed mailto: URL
 */
export function buildMailtoUrl({ to = '', subject = '', body = '', maxChars = MAX_MAILTO_CHARS } = {}) {
  const subjectParam = subject ? `subject=${mailtoEncode(subject)}` : '';
  const bodyEncoded  = mailtoEncode(body);
  let bodyParam      = body ? `body=${bodyEncoded}` : '';

  const base = `mailto:${to}`;
  const params = [subjectParam, bodyParam].filter(Boolean).join('&');
  let url = params ? `${base}?${params}` : base;

  // If over limit, trim the body until we fit. Keep subject intact.
  if (url.length > maxChars && body) {
    // Binary-search trim point so we don't iterate character-by-character.
    let trimLen = body.length;
    const prefix = params.indexOf('body=') !== -1
      ? `${base}?${subjectParam}${subjectParam ? '&' : ''}body=`
      : `${base}?body=`;
    const headroom = maxChars - prefix.length - 6; // 6 chars for '...' encoded (3 = %2E%2E%2E)

    // Walk backwards from full body until encoded fits
    while (trimLen > 0) {
      const candidate = mailtoEncode(body.slice(0, trimLen) + '...');
      const testUrl = `${prefix}${candidate}`;
      if (testUrl.length <= maxChars) {
        bodyParam = `body=${candidate}`;
        break;
      }
      // Cut by ~50 chars at a time for efficiency
      trimLen = Math.max(0, trimLen - 50);
    }

    const newParams = [subjectParam, bodyParam].filter(Boolean).join('&');
    url = newParams ? `${base}?${newParams}` : base;
  }

  return url;
}

/**
 * Build a mailto: URL for an outreach contact, using the contact's intel
 * and next_action recommendation to pre-fill subject + body.
 *
 * @param {object} contact - contact record from lib/outreach-tracker.mjs
 * @param {string} senderName - Mitchell's name for the signature
 * @returns {{ url: string, subject: string, bodyPreview: string }}
 */
export function buildOutreachMailto(contact, senderName = 'Mitchell') {
  const name       = contact.name || 'there';
  const firstName  = name.split(' ')[0];
  const company    = contact.company || 'your company';
  const titleAt    = contact.title_at_send || contact.contact_type || 'recruiter';
  const email      = contact.intel?.email_guess || '';
  const nx         = contact.next_action;

  // Subject: use strategy name if available, otherwise generic follow-up
  let subject;
  if (nx?.strategy_name) {
    subject = `Re: ${company} opportunity — ${nx.strategy_name}`;
  } else {
    subject = `Following up — ${company}`;
  }
  // Keep subject under 80 chars for inbox preview
  if (subject.length > 80) subject = subject.slice(0, 77).trimEnd() + '...';

  // Body: build from the next_action rationale + standard framing.
  // Use the pre-existing analysis text verbatim where possible to avoid
  // generating net-new prose — per task spec.
  const lines = [];
  lines.push(`Hi ${firstName},`);
  lines.push('');

  if (nx?.rationale) {
    // Rationale is the system's analysis of why this strategy applies.
    // Reuse it verbatim, trimmed to fit.
    const rationale = String(nx.rationale)
      .replace(/^(Rationale:|Strategy:|Note:)\s*/i, '')
      .trim()
      .slice(0, 300);
    lines.push(rationale);
    lines.push('');
  } else {
    lines.push(`I wanted to follow up on my earlier message about opportunities at ${company}.`);
    lines.push('');
  }

  // Add the strategy-specific context if available
  if (nx?.strategy_id && nx?.strategy_name) {
    lines.push(`[Strategy ${nx.strategy_id}: ${nx.strategy_name}]`);
    lines.push('');
  }

  lines.push(`Would love to connect when you have a moment.`);
  lines.push('');
  lines.push(`Best,`);
  lines.push(senderName);

  const body = lines.join('\n');

  const url = buildMailtoUrl({ to: email, subject, body });

  // Body preview for UI display (first 120 chars, single-line)
  const bodyPreview = body.replace(/\n+/g, ' ').slice(0, 120);

  return { url, subject, bodyPreview };
}
