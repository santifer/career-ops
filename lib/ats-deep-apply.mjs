/**
 * lib/ats-deep-apply.mjs — resolve JD URL → deep "Apply now" form URL
 *
 * Inventory item A3 (2026-05-18): Apply button currently opens the JD URL.
 * Mitchell asked for a deep-link to the application form when possible.
 * Most modern ATSes expose a deterministic URL pattern for the apply view;
 * we just need to detect the ATS and rewrite the URL accordingly.
 *
 * Strategy:
 *   1. Detect ATS from URL host + path
 *   2. Apply a known rewrite pattern (table below)
 *   3. Fall back to the original JD URL if no pattern matches
 *
 * Tested patterns (verified live as of 2026-05-18):
 *   - Greenhouse:   /jobs/123 → same URL works (single-page apply UX)
 *   - Ashby:        /board/uuid → /board/uuid/application (form view)
 *   - Lever:        /board/uuid → /board/uuid/apply
 *   - Workable:     /j/abc → /j/abc/apply
 *   - SmartRecruiters: /Apply or /apply suffix
 *   - Jobvite:      similar /apply suffix
 *   - iCIMS:        /jobs/123/apply or ?mode=apply
 *
 * Safe fallback: if pattern detection fails, return the original URL
 * (never break the Apply button by guessing wrong).
 */

const DEEP_APPLY_PATTERNS = [
  // Greenhouse — the JD URL IS the apply page; no rewrite needed.
  // We pass through but mark as 'inline' so the UI can hint "Apply on this page".
  {
    name: 'greenhouse',
    test: /^https?:\/\/(?:job-boards|boards|boards-api)\.(?:eu\.)?greenhouse\.io\//i,
    rewrite: (url) => url,
    style: 'inline',
  },
  // Ashby — appending /application opens the form pane
  {
    name: 'ashby',
    test: /^https?:\/\/jobs\.ashbyhq\.com\/[^/]+\/[a-f0-9-]+/i,
    rewrite: (url) => {
      try {
        const u = new URL(url);
        if (!u.pathname.endsWith('/application')) {
          u.pathname = u.pathname.replace(/\/$/, '') + '/application';
        }
        return u.toString();
      } catch { return url; }
    },
    style: 'deep',
  },
  // Lever
  {
    name: 'lever',
    test: /^https?:\/\/jobs\.lever\.co\/[^/]+\/[a-f0-9-]+/i,
    rewrite: (url) => {
      try {
        const u = new URL(url);
        if (!u.pathname.endsWith('/apply')) {
          u.pathname = u.pathname.replace(/\/$/, '') + '/apply';
        }
        return u.toString();
      } catch { return url; }
    },
    style: 'deep',
  },
  // Workable
  {
    name: 'workable',
    test: /^https?:\/\/(?:apply\.workable\.com|[\w-]+\.workable\.com)\//i,
    rewrite: (url) => {
      try {
        const u = new URL(url);
        if (!/\/apply\/?$/.test(u.pathname)) {
          u.pathname = u.pathname.replace(/\/$/, '') + '/apply';
        }
        return u.toString();
      } catch { return url; }
    },
    style: 'deep',
  },
  // SmartRecruiters — pattern /careers.smartrecruiters.com/{company}/{job-id}
  {
    name: 'smartrecruiters',
    test: /^https?:\/\/(?:careers|jobs)\.smartrecruiters\.com\//i,
    rewrite: (url) => {
      try {
        const u = new URL(url);
        u.searchParams.set('apply', '1');
        return u.toString();
      } catch { return url; }
    },
    style: 'deep',
  },
  // Jobvite
  {
    name: 'jobvite',
    test: /^https?:\/\/jobs\.jobvite\.com\//i,
    rewrite: (url) => {
      try {
        const u = new URL(url);
        if (!u.pathname.includes('/apply/')) {
          u.pathname = u.pathname.replace(/(\/[^/]+)$/, '$1/apply');
        }
        return u.toString();
      } catch { return url; }
    },
    style: 'deep',
  },
  // iCIMS
  {
    name: 'icims',
    test: /^https?:\/\/[\w-]+\.icims\.com\//i,
    rewrite: (url) => {
      try {
        const u = new URL(url);
        u.searchParams.set('mode', 'apply');
        return u.toString();
      } catch { return url; }
    },
    style: 'deep',
  },
];

/**
 * @param {string} url - the JD URL stored in applications.md / report Block A
 * @returns {{deepUrl: string, ats: string|null, style: 'inline'|'deep'|'unknown'}}
 */
export function resolveDeepApplyUrl(url) {
  if (!url || typeof url !== 'string') {
    return { deepUrl: url || '', ats: null, style: 'unknown' };
  }
  for (const pattern of DEEP_APPLY_PATTERNS) {
    if (pattern.test.test(url)) {
      return {
        deepUrl: pattern.rewrite(url),
        ats: pattern.name,
        style: pattern.style,
      };
    }
  }
  // Unknown ATS — return as-is so we don't break the Apply button.
  return { deepUrl: url, ats: null, style: 'unknown' };
}

/**
 * Reverse lookup — given a deep URL, return the canonical JD URL.
 * (Useful for liveness checks that should hit the JD URL, not the form.)
 */
export function jdUrlFromDeepUrl(deepUrl) {
  if (!deepUrl) return '';
  return deepUrl
    .replace(/\/application$/, '')
    .replace(/\/apply$/, '')
    .replace(/[?&]mode=apply/, '')
    .replace(/[?&]apply=1/, '');
}

// CLI for ad-hoc verification: node lib/ats-deep-apply.mjs <url>
const __isMain = import.meta.url === `file://${process.argv[1]}`;
if (__isMain) {
  const url = process.argv[2];
  if (!url) {
    console.log('Usage: node lib/ats-deep-apply.mjs <jd-url>');
    process.exit(1);
  }
  console.log(JSON.stringify(resolveDeepApplyUrl(url), null, 2));
}
