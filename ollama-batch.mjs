#!/usr/bin/env node
/**
 * ollama-batch.mjs — Ollama batch worker for career-ops
 *
 * Drop-in replacement for `claude -p` workers in batch-runner.sh.
 * Evaluates one job offer using a local Ollama model, writes the report .md
 * and tracker TSV, then prints a JSON summary to stdout for the orchestrator.
 *
 * Usage (invoked by batch-runner.sh --backend ollama):
 *   node ollama-batch.mjs \
 *     --url <URL> \
 *     --jd-file <PATH> \
 *     --report-num <NUM> \
 *     --date <YYYY-MM-DD> \
 *     --batch-id <ID>
 *
 * Environment:
 *   OLLAMA_BASE_URL     Ollama server base URL (default: http://localhost:11434)
 *   OLLAMA_MODEL        Model name (default: llama3.3)
 *   OLLAMA_TIMEOUT_MS   Request timeout in ms (default: 300000 = 5 min)
 *
 * Context window guidance:
 *   The system prompt (cv.md + modes files + JD) is typically 10K-15K tokens.
 *   Use a model with at least 32K context — llama3.3, mistral-nemo, qwen2.5.
 *   Smaller models (llama3.2:3b, phi3) may truncate and produce poor results.
 *
 * PDF generation:
 *   PDFs are not generated in Ollama batch mode (no tool-calling harness).
 *   Generate manually: node generate-pdf.mjs <html-file> <output.pdf>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as dns } from 'dns';

try {
  const { config } = await import('dotenv');
  config();
} catch { /* dotenv optional */ }

const ROOT = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    || 'llama3.3';
const TIMEOUT_MS      = parseInt(process.env.OLLAMA_TIMEOUT_MS || '300000', 10);

// Loopback guard — batch workers send cv.md + full JD to this endpoint.
// A remote URL silently exfiltrates private data.
{
  let hostname;
  try { hostname = new URL(OLLAMA_BASE_URL).hostname; }
  catch { console.error(`ERROR: invalid OLLAMA_BASE_URL: "${OLLAMA_BASE_URL}"`); process.exit(1); }
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (!isLoopback && process.env.OLLAMA_ALLOW_REMOTE !== '1') {
    console.error(
      `ERROR: remote OLLAMA_BASE_URL detected: ${OLLAMA_BASE_URL}\n` +
      `       Batch mode sends cv.md and job descriptions to this endpoint.\n` +
      `       Set OLLAMA_ALLOW_REMOTE=1 to use a remote endpoint intentionally.`
    );
    process.exit(1);
  }
}

const PATHS = {
  shared:  join(ROOT, 'modes', '_shared.md'),
  oferta:  join(ROOT, 'modes', 'oferta.md'),
  cv:      join(ROOT, 'cv.md'),
  reports: join(ROOT, 'reports'),
  tracker: join(ROOT, 'batch', 'tracker-additions'),
};

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
Usage: node ollama-batch.mjs \\
  --url <URL> \\
  --jd-file <PATH> \\
  --report-num <NUM> \\
  --date <YYYY-MM-DD> \\
  --batch-id <ID>

Environment:
  OLLAMA_BASE_URL   (default: http://localhost:11434)
  OLLAMA_MODEL      (default: llama3.3)
  OLLAMA_TIMEOUT_MS (default: 300000)

Invoked automatically by batch-runner.sh --backend ollama.
`);
  process.exit(0);
}

let url       = '';
let jdFile    = '';
let reportNum = '';
let date      = new Date().toISOString().split('T')[0];
let batchId   = '';
let minScore  = 0;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--url':        url       = args[++i]; break;
    case '--jd-file':    jdFile    = args[++i]; break;
    case '--report-num': reportNum = args[++i]; break;
    case '--date':       date      = args[++i]; break;
    case '--batch-id':   batchId   = args[++i]; break;
    case '--min-score': {
      const raw = args[++i];
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        console.error(`ERROR: invalid --min-score "${raw}" (must be a number)`);
        process.exit(1);
      }
      minScore = parsed;
      break;
    }
  }
}

if (!reportNum || !batchId) {
  console.error('ERROR: --report-num and --batch-id are required');
  process.exit(1);
}

// Validate inputs used in file paths to prevent path traversal.
if (!/^\d{1,6}$/.test(reportNum)) {
  console.error(`ERROR: invalid --report-num "${reportNum}" (must be numeric)`);
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`ERROR: invalid --date "${date}" (must be YYYY-MM-DD)`);
  process.exit(1);
}
if (!/^\d{1,10}$/.test(batchId)) {
  console.error(`ERROR: invalid --batch-id "${batchId}" (must be numeric)`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a file and return its trimmed contents, or a placeholder if missing.
 * @param {string} path - Absolute path to the file.
 * @param {string} label - Human-readable label used in the placeholder message.
 * @returns {string} File contents or a "[label not found]" placeholder.
 */
function readFile(path, label) {
  if (!existsSync(path)) return `[${label} not found — skipping]`;
  try {
    return readFileSync(path, 'utf-8').trim();
  } catch (err) {
    // Permission error, directory path, broken symlink, etc.
    // Return a placeholder so the worker emits a structured JSON failure
    // via fail() rather than crashing with a raw stack trace.
    process.stderr.write(`WARN: could not read ${label} at ${path}: ${err.message}\n`);
    return `[${label} unreadable — skipping]`;
  }
}

/**
 * Convert a string to a URL-safe slug (lowercase, hyphens, no leading/trailing hyphens).
 * @param {string} str - Input string (e.g. company name).
 * @returns {string} Slugified string, or "unknown" if the result would be empty.
 */
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

/**
 * Write a JSON failure summary to stdout and exit with code 1.
 * Called on any unrecoverable error so batch-runner.sh can parse the result.
 * @param {string} msg - Human-readable error description.
 * @param {Object} [extra={}] - Optional fields to merge into the output object.
 */
function fail(msg, extra = {}) {
  const out = {
    status:     'failed',
    id:         batchId,
    report_num: reportNum,
    company:    'unknown',
    role:       'unknown',
    score:      null,
    pdf:        null,
    report:     null,
    error:      msg,
    ...extra,
  };
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Get JD text — file first, URL fetch fallback
// ---------------------------------------------------------------------------
let jdText = '';

if (jdFile && existsSync(jdFile)) {
  jdText = readFileSync(jdFile, 'utf-8').trim();
}

if (!jdText && url) {
  // Validate URL before fetching to catch malformed input early.
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { fail(`Invalid JD URL: "${url}"`); }

  // SSRF guard: only allow http/https and reject private/loopback hosts.
  // JD URLs must be public job postings — there is no valid reason to fetch
  // from localhost or internal network ranges in batch mode.
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    fail(`JD URL must use http or https (got ${parsedUrl.protocol})`);
  }

  /**
   * Return true if an IP address string falls in a private/loopback/link-local range.
   * Covers IPv4 (127.*, 10.*, 192.168.*, 172.16-31.*, 169.254.*) and
   * IPv6 (::1, fe80::/10 link-local, fc00::/7 ULA).
   * @param {string} ip
   * @returns {boolean}
   */
  function isPrivateAddress(ip) {
    if (/^127\./.test(ip))                           return true; // IPv4 loopback
    if (/^10\./.test(ip))                            return true; // IPv4 private class A
    if (/^192\.168\./.test(ip))                      return true; // IPv4 private class C
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip))      return true; // IPv4 private class B
    if (/^169\.254\./.test(ip))                      return true; // IPv4 link-local
    if (ip === '::1')                                return true; // IPv6 loopback
    if (/^fe[89ab]/i.test(ip))                       return true; // IPv6 link-local fe80::/10
    if (/^f[cd]/i.test(ip))                          return true; // IPv6 ULA fc00::/7
    return false;
  }

  // Fast-fail on hostname literals before DNS resolution.
  const h = parsedUrl.hostname;
  if (h === 'localhost' || h === '::1' || h === '[::1]' || isPrivateAddress(h)) {
    fail(`JD URL points to a private/loopback address — refusing to fetch: ${url}`);
  }

  // DNS resolution check — guards against DNS rebinding where a public
  // hostname resolves to a private IP. Resolves both A and AAAA records.
  try {
    const [v4, v6] = await Promise.allSettled([
      dns.resolve4(h),
      dns.resolve6(h),
    ]);
    const allAddresses = [
      ...(v4.status === 'fulfilled' ? v4.value : []),
      ...(v6.status === 'fulfilled' ? v6.value : []),
    ];
    // If neither resolved, DNS lookup failed entirely — let fetch() surface the error.
    for (const addr of allAddresses) {
      if (isPrivateAddress(addr)) {
        fail(`JD URL hostname "${h}" resolves to a private address (${addr}) — SSRF guard`);
      }
    }
  } catch (dnsErr) {
    // dns.resolve4/resolve6 throw on NXDOMAIN etc. — let fetch() produce the
    // user-facing error; don't block on DNS errors alone.
  }

  try {
    // Use redirect:'manual' so we can validate each redirect destination
    // before following it — a public URL could redirect to a private IP
    // and bypass the hostname check above.
    let fetchUrl = url;
    const MAX_REDIRECTS = 5;
    let redirectsLeft = MAX_REDIRECTS;
    let res;

    while (redirectsLeft-- > 0) {
      res = await fetch(fetchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 career-ops/1.0' },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) fail(`Redirect with no Location header from ${fetchUrl}`);
        let redirectUrl;
        try { redirectUrl = new URL(location, fetchUrl); } catch {
          fail(`Invalid redirect Location: "${location}"`);
        }
        if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
          fail(`Redirect to non-http(s) URL blocked: ${redirectUrl.href}`);
        }
        const rh = redirectUrl.hostname;
        if (rh === 'localhost' || rh === '::1' || rh === '[::1]' || isPrivateAddress(rh)) {
          fail(`Redirect to private/loopback address blocked: ${redirectUrl.href}`);
        }
        // DNS-check the redirect destination too
        try {
          const [rv4, rv6] = await Promise.allSettled([
            dns.resolve4(rh),
            dns.resolve6(rh),
          ]);
          const rAddrs = [
            ...(rv4.status === 'fulfilled' ? rv4.value : []),
            ...(rv6.status === 'fulfilled' ? rv6.value : []),
          ];
          for (const addr of rAddrs) {
            if (isPrivateAddress(addr)) {
              fail(`Redirect hostname "${rh}" resolves to private address (${addr}) — SSRF guard`);
            }
          }
        } catch { /* DNS errors fall through to the next fetch attempt */ }
        fetchUrl = redirectUrl.href;
        continue;
      }

      break; // non-redirect response
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    jdText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50_000);
  } catch (err) {
    fail(`Could not fetch JD: ${err.message}`);
  }
}

if (!jdText) {
  fail('No JD text — jd-file missing/empty and URL fetch failed');
}

// ---------------------------------------------------------------------------
// Build prompt
// ---------------------------------------------------------------------------
const sharedCtx = readFile(PATHS.shared, 'modes/_shared.md');
const ofertaCtx = readFile(PATHS.oferta, 'modes/oferta.md');
const cvContent = readFile(PATHS.cv,     'cv.md');

const systemPrompt = `You are career-ops, an AI-powered job search assistant.
You evaluate job offers against the candidate's CV using a structured A-G scoring system.
Follow the evaluation methodology below exactly.

═══════════════════════════════════════════════════════
SYSTEM CONTEXT (_shared.md)
═══════════════════════════════════════════════════════
${sharedCtx}

═══════════════════════════════════════════════════════
EVALUATION MODE (oferta.md)
═══════════════════════════════════════════════════════
${ofertaCtx}

═══════════════════════════════════════════════════════
CANDIDATE RESUME (cv.md)
═══════════════════════════════════════════════════════
${cvContent}

═══════════════════════════════════════════════════════
OPERATING RULES FOR THIS BATCH SESSION
═══════════════════════════════════════════════════════
1. You do NOT have access to WebSearch, Playwright, or file-writing tools.
   - Block D (Comp research): use training-data salary estimates; note them as estimates.
   - Block G (Legitimacy): analyze JD text only. Mark posting freshness as "unverified (batch mode)".
   - File writing is handled by the script after you respond.
2. Generate all Blocks A through G in full.
3. At the very end output this exact machine-readable block (no extra whitespace):

---SCORE_SUMMARY---
COMPANY: <company name or "Unknown">
ROLE: <role title>
SCORE: <global score as decimal, e.g. 3.8>
ARCHETYPE: <detected archetype>
LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
---END_SUMMARY---
`;

const userMessage = `BATCH EVALUATION — Report #${reportNum} | Date: ${date} | Batch ID: ${batchId}
URL: ${url || 'N/A'}

JOB DESCRIPTION TO EVALUATE:

${jdText}`;

// ---------------------------------------------------------------------------
// Call Ollama (OpenAI-compatible endpoint)
// ---------------------------------------------------------------------------
const endpoint = `${OLLAMA_BASE_URL}/v1/chat/completions`;

let evalText;
try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:    OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      stream:      false,
      temperature: 0.4,
      options: { num_ctx: 32768 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    fail(`Ollama API error: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  evalText = data.choices?.[0]?.message?.content?.trim();
  if (!evalText) fail('Ollama returned an empty response');
} catch (err) {
  if (err.name === 'TimeoutError') {
    fail(`Ollama request timed out after ${Math.round(TIMEOUT_MS / 1000)}s — try a smaller model or increase OLLAMA_TIMEOUT_MS`);
  }
  fail(`Ollama API call failed: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Parse SCORE_SUMMARY block
// ---------------------------------------------------------------------------
const summaryMatch = evalText.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);

let company    = 'unknown';
let role       = 'unknown';
let score      = null;
let archetype  = 'unknown';
let legitimacy = 'Proceed with Caution';

if (summaryMatch) {
  const extract = (key) => {
    const m = summaryMatch[1].match(new RegExp(`${key}:\\s*(.+)`));
    return m ? m[1].trim() : 'unknown';
  };
  company    = extract('COMPANY');
  role       = extract('ROLE');
  const parsedScore = Number(extract('SCORE'));
  score      = Number.isFinite(parsedScore) ? parsedScore : null;
  archetype  = extract('ARCHETYPE');
  legitimacy = extract('LEGITIMACY');
} else {
  // The model didn't produce the expected summary block. Evaluation text
  // will still be saved so the user can read it, but scoring/gating is
  // unavailable. Stderr is captured to the log file by batch-runner.sh.
  process.stderr.write(
    `WARN: SCORE_SUMMARY block missing from model response for batch-id ${batchId}.\n` +
    `      Report will be saved with score=null. Check the log for the raw output.\n`
  );
}

// ---------------------------------------------------------------------------
// Min-score gate — checked BEFORE any file writes
// ---------------------------------------------------------------------------
if (minScore > 0 && score !== null && score < minScore) {
  const skipped = {
    status:     'skipped',
    id:         batchId,
    report_num: reportNum,
    company,
    role,
    score,
    legitimacy,
    pdf:        null,
    report:     null,
    error:      `score ${score} below --min-score ${minScore}`,
  };
  process.stdout.write(JSON.stringify(skipped) + '\n');
  process.exit(0);
}

const companySlug = slugify(company);
const reportFile  = `${reportNum}-${companySlug}-${date}.md`;
const reportPath  = join(PATHS.reports, reportFile);

// ---------------------------------------------------------------------------
// Write report .md
// ---------------------------------------------------------------------------
mkdirSync(PATHS.reports, { recursive: true });

const cleanEval = evalText.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim();

const reportContent = `# Evaluación: ${company} — ${role}

**Fecha:** ${date}
**Arquetipo:** ${archetype}
**Score:** ${score !== null ? score + '/5' : 'N/A'}
**Legitimacy:** ${legitimacy}
**URL:** ${url || 'N/A'}
**PDF:** ❌ (generate manually: \`node generate-pdf.mjs\`)
**Batch ID:** ${batchId}
**Tool:** Ollama (${OLLAMA_MODEL})
**Verification:** unverified (batch mode)

---

${cleanEval}
`;

writeFileSync(reportPath, reportContent, 'utf-8');

// ---------------------------------------------------------------------------
// Write tracker TSV
// ---------------------------------------------------------------------------
mkdirSync(PATHS.tracker, { recursive: true });

// Row ID (column 1) is intentionally set to 0 — merge-tracker.mjs assigns
// the real sequential number during merge. Computing it here would race
// with parallel workers all reading applications.md at the same time.
//
// Sanitize model-derived strings before writing to TSV: tab and newline
// characters would corrupt the column structure and break merge-tracker.mjs.
const sanitizeTsv = (v) => {
  const cleaned = String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  // Prefix cells starting with formula-trigger characters so spreadsheet
  // applications (Excel, Google Sheets) don't execute them as formulas.
  return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
};
const scoreStr    = score !== null ? `${score}/5` : 'N/A';
const reportLink  = `[${reportNum}](reports/${reportFile})`;
const notesStr    = sanitizeTsv(`${archetype} — ${legitimacy}`);
const tsvLine     = [0, date, sanitizeTsv(company), sanitizeTsv(role), 'Evaluada', scoreStr, '❌', reportLink, notesStr].join('\t');

writeFileSync(join(PATHS.tracker, `${batchId}.tsv`), tsvLine + '\n', 'utf-8');

// ---------------------------------------------------------------------------
// JSON summary to stdout (parsed by batch-runner.sh)
// ---------------------------------------------------------------------------
const summary = {
  status:     'completed',
  id:         batchId,
  report_num: reportNum,
  company,
  role,
  score,
  legitimacy,
  pdf:        null,
  report:     `reports/${reportFile}`,
  error:      null,
};

process.stdout.write(JSON.stringify(summary) + '\n');
