/**
 * Email Inference Pipeline
 *
 * Pattern detection from example emails, email generation from
 * name + domain + pattern, and confidence scoring.
 */

/** @enum {string} */
export const PATTERNS = Object.freeze({
  FIRST_DOT_LAST: 'FIRST_DOT_LAST',
  FIRSTLAST: 'FIRSTLAST',
  FLAST: 'FLAST',
  FIRST: 'FIRST',
  LAST_DOT_FIRST: 'LAST_DOT_FIRST',
  LFIRST: 'LFIRST',
});

const JOB_BOARD_DOMAINS = new Set([
  'lever.co',
  'ashbyhq.com',
  'greenhouse.io',
  'workable.com',
  'linkedin.com',
  'indeed.com',
  'wellfound.com',
  'builtin.com',
]);

/**
 * Extract the company domain from a URL, handling job board URLs
 * by extracting the company slug from the path. Falls back to
 * guessing from the company name.
 *
 * @param {string|null} url
 * @param {string} [companyName]
 * @returns {string|null}
 */
export function extractDomain(url, companyName) {
  if (url) {
    try {
      const parsed = new URL(url);
      let hostname = parsed.hostname.replace(/^www\./, '');

      // Check if it's a job board domain
      const isJobBoard = [...JOB_BOARD_DOMAINS].some(
        (jb) => hostname === jb || hostname.endsWith(`.${jb}`),
      );

      if (isJobBoard) {
        // Extract company slug from path (first segment)
        const segments = parsed.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
          return `${segments[0]}.com`;
        }
      }

      return hostname;
    } catch {
      // fall through to name-based guess
    }
  }

  if (companyName) {
    const slug = companyName
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9-]/g, '');
    return `${slug}.com`;
  }

  return null;
}

/**
 * Detect the email pattern from a list of known email addresses
 * at the same domain.
 *
 * @param {string[]} emails
 * @returns {string|null} One of PATTERNS values or null
 */
export function detectEmailPattern(emails) {
  if (!emails || emails.length === 0) return null;

  // Parse each email into local part components
  const parsed = emails.map((e) => {
    const [local] = e.split('@');
    return local.toLowerCase();
  });

  // Try to detect patterns by testing each known format
  // We need at least one email to detect; more emails = higher confidence

  const patternChecks = [
    {
      pattern: PATTERNS.FIRST_DOT_LAST,
      test: (local) => /^[a-z]+\.[a-z][-a-z]*$/.test(local),
    },
    {
      pattern: PATTERNS.FIRSTLAST,
      test: (local) => /^[a-z]{4,}$/.test(local) && !isSingleName(local),
    },
    {
      pattern: PATTERNS.FLAST,
      test: (local) => /^[a-z][a-z]{2,}$/.test(local) && local.length <= 10,
    },
    {
      pattern: PATTERNS.FIRST,
      test: (local) => /^[a-z]{2,10}$/.test(local),
    },
  ];

  // FIRST_DOT_LAST is the easiest to identify
  if (parsed.every((l) => /^[a-z]+\.[a-z][-a-z]*$/.test(l))) {
    return PATTERNS.FIRST_DOT_LAST;
  }

  // FLAST: single initial + last name (e.g., jdoe, bsmith)
  if (
    parsed.length >= 2 &&
    parsed.every((l) => /^[a-z][a-z]{2,}$/.test(l) && l.length <= 10)
  ) {
    // Distinguish FLAST from FIRST by checking if first char looks like an initial
    // If all locals are short and start differently, could be FLAST or FIRST
    // FLAST: first char = first initial, rest = last name
    // FIRST: entire local = first name
    // Heuristic: if locals look like initial+lastname (3-7 chars), it's FLAST
    const looksLikeFlast = parsed.every((l) => l.length >= 3 && l.length <= 8);
    const looksLikeFirst = parsed.every((l) => l.length >= 2 && l.length <= 10);

    // Check if there's a pattern where first char varies but rest follows name patterns
    if (looksLikeFlast && parsed.length >= 2) {
      // If all have similar length patterns (initial + lastname), likely FLAST
      const avgLen =
        parsed.reduce((s, l) => s + l.length, 0) / parsed.length;
      if (avgLen >= 4 && avgLen <= 7) {
        return PATTERNS.FLAST;
      }
    }

    if (looksLikeFirst) {
      return PATTERNS.FIRST;
    }
  }

  // FIRSTLAST: concatenated first+last (e.g., janedoe)
  if (parsed.every((l) => /^[a-z]{5,}$/.test(l))) {
    return PATTERNS.FIRSTLAST;
  }

  // FIRST: short single names
  if (parsed.every((l) => /^[a-z]{2,10}$/.test(l))) {
    return PATTERNS.FIRST;
  }

  return null;
}

/**
 * Generate an email address from name components, domain, and pattern.
 *
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} domain
 * @param {string} pattern - One of PATTERNS values
 * @returns {string}
 */
export function generateEmail(firstName, lastName, domain, pattern) {
  const first = firstName.toLowerCase();
  const last = lastName.toLowerCase();

  switch (pattern) {
    case PATTERNS.FIRST_DOT_LAST:
      return `${first}.${last}@${domain}`;
    case PATTERNS.FIRSTLAST:
      return `${first}${last}@${domain}`;
    case PATTERNS.FLAST:
      return `${first[0]}${last}@${domain}`;
    case PATTERNS.FIRST:
      return `${first}@${domain}`;
    case PATTERNS.LAST_DOT_FIRST:
      return `${last}.${first}@${domain}`;
    case PATTERNS.LFIRST:
      return `${last[0]}${first}@${domain}`;
    default:
      throw new Error(`Unknown pattern: ${pattern}`);
  }
}

/**
 * Score confidence of an inferred email address.
 *
 * @param {object} factors
 * @param {string} factors.patternSource - 'team_page' | 'inferred' | 'guess'
 * @param {string} factors.nameCommonality - 'unique' | 'common'
 * @param {boolean} factors.patternConfirmed - Whether pattern was verified
 * @returns {'HIGH'|'MEDIUM'|'LOW'}
 */
export function scoreEmailConfidence({ patternSource, nameCommonality, patternConfirmed }) {
  let score = 0;

  // Pattern source weight
  if (patternSource === 'team_page') score += 3;
  else if (patternSource === 'inferred') score += 2;
  else score += 1; // guess

  // Name commonality
  if (nameCommonality === 'unique') score += 2;
  else score += 1; // common

  // Pattern confirmed
  if (patternConfirmed) score += 2;
  else score += 0;

  // Thresholds
  if (score >= 6) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}

/** Helper: check if a string looks like a single first name */
function isSingleName(str) {
  // Common short names that might fool the FIRSTLAST detector
  return str.length <= 5;
}
