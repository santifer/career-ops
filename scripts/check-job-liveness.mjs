#!/usr/bin/env node
/**
 * check-job-liveness.mjs — HEAD-request liveness check for job posting URLs
 *
 * B7: Before launching Playwright, verify the posting is still live.
 * Saves ~500 wasted browser sessions per run on expired/redirect listings.
 *
 * Usage (module): import { checkLiveness } from './check-job-liveness.mjs'
 * Usage (CLI):    node scripts/check-job-liveness.mjs <url>
 *
 * Returns: { alive: bool, status: number, reason: string, redirect?: string }
 */

import https from 'node:https';
import http  from 'node:http';
import { URL } from 'node:url';
import path  from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

const LIVENESS_TIMEOUT_MS = 5000;

// Domains / path patterns that look like careers destinations (redirect is OK)
const CAREERS_RE = /greenhouse\.io|lever\.co|ashby|workday|icims\.com|indeed\.com|linkedin\.com|careers\.|\/jobs|\/careers|\/apply|hiring/i;

/**
 * Performs a HEAD request to check if a job URL is still live.
 *
 * Reasons for alive:false:
 *   404 / 410         — gone
 *   5xx              — server error
 *   redirect-to-non-careers-domain — homepage redirect (common for closed listings)
 *   timeout           — server unreachable within 5 s
 *   network-error     — DNS failure, connection refused, etc.
 *   invalid-url       — malformed URL
 *
 * @param {string} jobUrl
 * @returns {Promise<{alive: boolean, status: number, reason: string, redirect?: string}>}
 */
export async function checkLiveness(jobUrl) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(jobUrl);
    } catch {
      return resolve({ alive: false, status: 0, reason: 'invalid-url' });
    }

    const isHttps = parsed.protocol === 'https:';
    const mod     = isHttps ? https : http;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port:     parsed.port || (isHttps ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'HEAD',
        headers:  {
          'User-Agent': 'Mozilla/5.0 (compatible; career-ops-liveness/1.0; +https://github.com/santifer/career-ops)',
          'Accept':     '*/*',
        },
        timeout: LIVENESS_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode;

        // Consume response body so the socket is released
        res.resume();

        if (status === 404 || status === 410) {
          return resolve({ alive: false, status, reason: `${status}` });
        }

        if (status >= 500) {
          return resolve({ alive: false, status, reason: `server-error-${status}` });
        }

        if (status >= 301 && status <= 308) {
          const location = res.headers.location || '';
          if (!location) {
            return resolve({ alive: false, status, reason: 'redirect-no-location' });
          }
          let redir;
          try {
            redir = new URL(location, jobUrl);
          } catch {
            return resolve({ alive: false, status, redirect: location, reason: 'redirect-invalid-url' });
          }
          if (!CAREERS_RE.test(redir.hostname + redir.pathname)) {
            // Redirect points to something that looks nothing like a careers site
            return resolve({ alive: false, status, redirect: location, reason: 'redirect-to-non-careers-domain' });
          }
          // Canonical / tracker redirect within a careers ecosystem — treat as alive
          return resolve({ alive: true, status, redirect: location });
        }

        // 2xx — posting is live
        resolve({ alive: true, status });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ alive: false, status: 0, reason: 'timeout' });
    });

    req.on('error', (e) => {
      resolve({ alive: false, status: 0, reason: `network-error: ${e.code || e.message}` });
    });

    req.end();
  });
}

// ── CLI mode ──────────────────────────────────────────────────────────────────

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node scripts/check-job-liveness.mjs <url>');
    process.exit(1);
  }
  const result = await checkLiveness(url);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.alive ? 0 : 1);
}
