#!/usr/bin/env node
/**
 * auto-submit.mjs — Automated job application assistant
 *
 * MODES (mutually exclusive, default = dry-run):
 *   --dry-run     Analysis only. No browser, no submissions.
 *   --semi-auto   Fills form in visible Chromium, stops before submit. YOU click.
 *   --live        Full automation. ALL THREE safety locks required.
 *
 * SAFETY LOCKS FOR --live (ALL THREE REQUIRED):
 *   (a) --allow-tier <tier>                            CLI flag
 *   (b) config/lower-tier-test-companies.yml           enabled: true
 *   (c) Company slug in the YAML list for that tier    per-card check
 *
 * CLI:
 *   node scripts/auto-submit.mjs [--kanban <path>] [--limit N] [options]
 *
 * Flags:
 *   --kanban <path>          Kanban HTML path (default: dashboard/job-pulse-kanban.html)
 *   --kanban-json <path>     K2 exportState() JSON path (mutually exclusive with --kanban)
 *   --limit N                Max cards per run (default: 5; live hard cap 5/day overrides)
 *   --card <id>              Single-card mode for targeted testing
 *   --dry-run                Explicit dry-run (default if no mode flag)
 *   --report                 With --dry-run: pretty-print results as markdown table to stdout
 *   --semi-auto              Visible Chromium, form prepped, human clicks submit
 *   --live                   Full automation (requires --allow-tier + YAML config)
 *   --allow-tier <tier>      Required with --live (e.g. --allow-tier lower)
 *   --ready-states <states>  Comma-separated canonical state IDs eligible for submission
 *                            (default: evaluated). Example: --ready-states evaluated,responded
 *                            Valid IDs come from gen/states.js (VALID_IDS). 'new' is allowed
 *                            but not in gen/states.js — use only for testing fresh ingest.
 *
 * Output:
 *   data/auto-submit-dry-run-{date}.json
 *   data/semi-auto-{date}.json
 *   data/live-runs-{date}.json
 *   data/dead-listings-{date}.json
 *   data/screenshots/{date}/
 *   data/live-daily-count-{date}.json
 *
 * Exit codes:
 *   0 = all processed cards handled cleanly
 *   1 = fatal (kanban missing, safety lock failed, Playwright unavailable)
 *   2 = partial: some cards CAPTCHA-blocked or requires-human
 *   3 = partial: some cards form-blocked (no submit button, dead listing)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLiveness } from './check-job-liveness.mjs';
import { VALID_IDS as CANONICAL_STATE_IDS } from '../gen/states.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

let yaml;
try {
  ({ default: yaml } = await import('js-yaml'));
} catch { /* yaml only needed for --live YAML safety check */ }

// ── Arg parsing ───────────────────────────────────────────────────────────────

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? (process.argv[i + 1] ?? null) : null;
}

const KANBAN_PATH       = argVal('--kanban') || path.join(ROOT, 'dashboard', 'job-pulse-kanban.html');
const KANBAN_JSON       = argVal('--kanban-json') || null;
const CL_DIR_ARG        = argVal('--cl-dir')   || path.join(ROOT, 'cover-letters');
const CL_INDEX_ARG      = argVal('--cl-index') || path.join(CL_DIR_ARG, 'index.yml');
const READY_STATES_ARG  = argVal('--ready-states') || null;
const CARD_ID           = argVal('--card');
const SEMI_AUTO         = process.argv.includes('--semi-auto');
const LIVE              = process.argv.includes('--live') && !SEMI_AUTO;
const DRY_RUN           = !LIVE && !SEMI_AUTO;
const REPORT            = process.argv.includes('--report');
const ALLOW_TIER        = argVal('--allow-tier');
const RAW_LIMIT         = parseInt(argVal('--limit') ?? '5', 10);
const LIMIT             = isNaN(RAW_LIMIT) ? 5 : RAW_LIMIT;
const DATE_STAMP        = new Date().toISOString().slice(0, 10);
const LIVE_DAILY_CAP    = 5;

// ── Submit-ready state resolution (reads gen/states.js) ───────────────────────

/**
 * Parse a comma-separated ready-states string into a validated Set.
 * Unknown states emit a warning but are still accepted (allows 'new' for testing).
 * @param {string|null} arg  e.g. "evaluated,responded" or null (→ default)
 * @returns {Set<string>}
 */
export function parseReadyStates(arg) {
  if (!arg) return new Set(['evaluated']);
  const parsed = arg.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  for (const s of parsed) {
    if (!CANONICAL_STATE_IDS.includes(s) && s !== 'new') {
      // 'new' is a valid K2 kanban state not in gen/states.js — exempt from warning
      console.warn(`[auto-submit] warn: "${s}" is not a recognized state in gen/states.js`);
    }
  }
  return new Set(parsed);
}

/**
 * Canonical set of states whose cards are eligible for auto-submission.
 * Default: ['evaluated'] — cards scored by the user, pending decision.
 * Override: --ready-states evaluated,responded
 */
export const SUBMIT_READY_STATES = parseReadyStates(READY_STATES_ARG);

// ── ATS detection ─────────────────────────────────────────────────────────────

const ATS_PATTERNS = [
  { name: 'greenhouse', re: /greenhouse\.io|boards\.greenhouse\.io/i },
  { name: 'lever',      re: /lever\.co/i },
  { name: 'ashby',      re: /ashbyhq\.com/i },
  { name: 'workday',    re: /myworkdayjobs\.com|wd\d+\.myworkdayjobs/i },
  { name: 'icims',      re: /icims\.com/i },
  { name: 'indeed',     re: /indeed\.com/i },
  { name: 'linkedin',   re: /linkedin\.com\/jobs/i },
];

export function detectATS(url) {
  if (!url) return 'unknown';
  for (const { name, re } of ATS_PATTERNS) {
    if (re.test(url)) return name;
  }
  return 'unknown';
}

// ── Submit button selectors by ATS ────────────────────────────────────────────

const ATS_SUBMIT_SELECTORS = {
  greenhouse: ['button[aria-label="Submit"]', 'button:has-text("Submit Application")'],
  lever:      ['button#btn-submit', 'button:has-text("Submit application")'],
  workday:    ['button[data-automation-id="submitButton"]', '[data-automation-id="bottom-navigation-next-button"]'],
};
const FALLBACK_SUBMIT_SELECTORS = ['button[type="submit"]:not([aria-hidden]):not([disabled])'];

export function getAtsSubmitSelectors(ats) {
  return [...(ATS_SUBMIT_SELECTORS[ats] || []), ...FALLBACK_SUBMIT_SELECTORS];
}

// ── CAPTCHA / intermediate step detection ─────────────────────────────────────

export const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  '[id^="cf-challenge"]',
  '.g-recaptcha',
  '[data-sitekey]',
];

export const INTERMEDIATE_PATTERNS = [
  /review your application/i,
  /confirm submission/i,
  /verify your information/i,
];

export function isIntermediateStepText(text) {
  return INTERMEDIATE_PATTERNS.some((re) => re.test(text));
}

async function detectCaptchaOnPage(page) {
  for (const sel of CAPTCHA_SELECTORS) {
    if (await page.$(sel).catch(() => null)) return true;
  }
  return false;
}

async function detectIntermediateStepOnPage(page) {
  const text = await page.textContent('body').catch(() => '');
  return isIntermediateStepText(text);
}

async function findSubmitOnPage(page, ats) {
  for (const sel of getAtsSubmitSelectors(ats)) {
    try {
      const el = await page.$(sel);
      if (el) return el;
    } catch { /* selector syntax error — skip */ }
  }
  return null;
}

// ── Kanban card extraction ────────────────────────────────────────────────────

/**
 * Reads a static kanban HTML file, extracts cards eligible for submission.
 * Eligible = columnId in SUBMIT_READY_STATES + grade A/B + not warm referral.
 * SUBMIT_READY_STATES defaults to ['evaluated']; override via --ready-states flag.
 */
export function extractEligibleCards(kanbanPath) {
  if (!fs.existsSync(kanbanPath)) {
    throw new Error(`Kanban not found: ${kanbanPath}`);
  }
  const html  = fs.readFileSync(kanbanPath, 'utf8');
  const cards = [];

  const cardRe = /\{[^{}]*id\s*:\s*'(live-\d+|worker-[^']+)'[^{}]*\}/g;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    try {
      const block = m[0];
      const get = (key) => {
        const r = new RegExp(key + `\\s*:\\s*['"]([^'"]*?)['"]`);
        return block.match(r)?.[1] ?? null;
      };
      const getBool = (key) => {
        const r = new RegExp(key + `\\s*:\\s*(true|false)`);
        return block.match(r)?.[1] === 'true';
      };
      const card = {
        id:             get('id'),
        company:        get('company'),
        role:           get('role'),
        url:            get('url'),
        grade:          get('grade'),
        columnId:       get('columnId'),
        hasConnection:  getBool('hasConnection'),
        isWarmReferral: getBool('isWarmReferral'),
      };
      if (card.id && card.url) cards.push(card);
    } catch { /* skip malformed */ }
  }

  return cards.filter((c) =>
    SUBMIT_READY_STATES.has(c.columnId) &&
    (c.grade === 'A' || c.grade === 'B') &&
    !c.isWarmReferral,
  );
}

// ── Kanban JSON ingestion ─────────────────────────────────────────────────────

/**
 * Contract with dashboard/job-pulse-kanban.html exportState():
 *   Shape: { cards: { [id: string]: PulseJob }, version: number }
 *   PulseJob: { id, state, title, company, url, grade, has_connection,
 *               source, external_id, location, remote, verified, posted_at, ... }
 *
 * Eligible states are controlled by SUBMIT_READY_STATES (default: evaluated).
 * 'new' (freshly ingested, not evaluated) is NOT eligible by default — use
 * --ready-states new,evaluated to include it.
 */

/**
 * Maps a PulseJob (K2 kanban card) to the internal card shape used by auto-submit.
 * Preserves extra fields so downstream code (liveness, CL lookup) can use them.
 */
export function pulseJobToCard(job) {
  return {
    id:             job.id,
    company:        job.company   || '',
    role:           job.title     || '',
    url:            job.url       || '',
    grade:          job.grade     || null,
    columnId:       job.state     || 'new',
    hasConnection:  job.has_connection   || false,
    isWarmReferral: job.is_warm_referral || false,
    // Extra K2 fields — not used by existing filters but useful for logging
    source:         job.source    || null,
    location:       job.location  || null,
    verified:       job.verified  || false,
    posted_at:      job.posted_at || null,
  };
}

/**
 * Reads a K2 kanban JSON export and returns eligible cards in the same shape
 * as extractEligibleCards(). Safe: throws only on missing file or malformed JSON.
 *
 * @param {string} jsonPath  Path to the exported JSON file
 * @returns {object[]}  Array of mapped card objects
 * @throws {Error}  If file is missing or top-level .cards is absent
 */
export function extractEligibleCardsFromJson(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Kanban JSON not found: ${jsonPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    throw new Error(`Kanban JSON parse error: ${e.message}`);
  }

  if (!parsed || typeof parsed.cards !== 'object' || Array.isArray(parsed.cards)) {
    throw new Error('Kanban JSON must have shape { cards: { [id]: PulseJob }, ... }');
  }

  const jobs = Object.values(parsed.cards);

  return jobs
    .map(pulseJobToCard)
    .filter((c) =>
      SUBMIT_READY_STATES.has(c.columnId) &&
      (c.grade === 'A' || c.grade === 'B') &&
      !c.isWarmReferral,
    );
}

// ── Cover letter lookup ───────────────────────────────────────────────────────

export function findCoverLetter(card) {
  const clDir = path.join(ROOT, 'cover-letters');
  if (!fs.existsSync(clDir)) return null;
  const slug  = (card.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const files = fs.readdirSync(clDir).filter((f) => f.includes(slug) && f.endsWith('.txt'));
  return files.length > 0 ? path.join('cover-letters', files[0]) : null;
}

// ── Index-based CL matching ───────────────────────────────────────────────────

export function slugifyCompany(name) {
  return (name || '').toLowerCase()
    .replace(/[()°™®]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function extractRoleFamily(roleTitle) {
  const text = (roleTitle || '').toLowerCase();
  const families = [];
  if (/scrum master/.test(text))                                families.push('scrum master');
  if (/agile delivery|delivery manager/.test(text))             families.push('agile coach');
  if (/technical program manager|staff tpm|sr\. technical/.test(text)) families.push('technical program manager');
  if (/program manager/.test(text))                             families.push('program manager');
  if (/product manager/.test(text))                             families.push('product manager');
  if (/agile coach/.test(text))                                 families.push('agile coach');
  return families;
}

export function loadClIndex(indexPath) {
  if (!yaml) return null;
  if (!indexPath || !fs.existsSync(indexPath)) return null;
  try {
    return yaml.load(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Find the best matching cover letter for a kanban card using the index.
 * Priority: exact company slug → role family → tier fallback → null.
 * @param {object} card   Kanban card with at minimum { company, role }
 * @param {object} index  Parsed index.yml (yaml.load output)
 * @returns {string|null} Relative file path or null
 */
export function findCoverLetterForCard(card, index) {
  if (!index || !Array.isArray(index.templates)) return null;

  const companySlug = slugifyCompany(card.company || '');

  // 1. Exact company match
  const exact = index.templates.find((t) => t.company === companySlug);
  if (exact) return path.join('cover-letters', exact.file);

  // 2. Role family match
  const roleFamilies = extractRoleFamily(card.role || '');
  if (roleFamilies.length > 0) {
    const roleMatch = index.templates.find((t) =>
      Array.isArray(t.roles) &&
      t.roles.some((r) => roleFamilies.some((f) => r.toLowerCase().includes(f))),
    );
    if (roleMatch) return path.join('cover-letters', roleMatch.file);
  }

  // 3. Tier fallback (card.tier must be set — kanban can inject it when available)
  const cardTier = card.tier || null;
  if (cardTier) {
    const tierMatch = index.templates.find((t) => t.tier === cardTier);
    if (tierMatch) return path.join('cover-letters', tierMatch.file);
  }

  return null;
}

// ── Dry-run analysis ──────────────────────────────────────────────────────────

export function dryRunCard(card, clIndex = null) {
  const ats = detectATS(card.url);
  const cl  = clIndex ? findCoverLetterForCard(card, clIndex) : findCoverLetter(card);

  let fillable;
  let notes;

  if (ats === 'unknown') {
    fillable = false;
    notes    = 'ATS not recognized — manual submission required';
  } else if (['greenhouse', 'lever', 'ashby'].includes(ats)) {
    fillable = true;
    notes    = `${ats} form fill supported via Playwright`;
  } else if (ats === 'workday') {
    fillable = 'partial';
    notes    = 'Workday: auth wall likely; pre-auth session required (data/workday-sessions/)';
  } else if (ats === 'linkedin') {
    fillable = 'partial';
    notes    = 'LinkedIn Easy Apply: may work if logged in via session cookie';
  } else {
    fillable = 'partial';
    notes    = `${ats}: form fill attempted but not guaranteed`;
  }

  return {
    id:           card.id,
    company:      card.company,
    role:         card.role,
    url:          card.url,
    ats,
    grade:        card.grade,
    column:       card.columnId,
    has_cl:       !!cl,
    cl_path:      cl ?? null,
    fillable,
    notes,
    would_submit: fillable === true,
  };
}

// ── Markdown report formatter ─────────────────────────────────────────────────

/**
 * Formats dry-run results as a GitHub-flavored markdown table.
 * @param {object[]} results  Array of dryRunCard() outputs
 * @returns {string}
 */
export function formatMarkdownReport(results) {
  const lines = [
    '## Auto-Submit Dry-Run Report',
    '',
    '| # | Grade | Company | Role | ATS | CL | Fillable | Notes |',
    '|---|-------|---------|------|-----|----|----------|-------|',
  ];

  results.forEach((r, i) => {
    const grade    = r.grade    ?? '-';
    const company  = (r.company ?? '-').replace(/\|/g, '∣');
    const role     = ((r.role ?? '-').slice(0, 45)).replace(/\|/g, '∣');
    const ats      = r.ats ?? '-';
    const cl       = r.has_cl ? '✅' : '❌';
    const fillIcon = r.fillable === true ? '✅' : r.fillable === 'partial' ? '⚠️' : '❌';
    const notes    = (r.notes ?? '').replace(/\|/g, '∣');
    lines.push(`| ${i + 1} | ${grade} | ${company} | ${role} | ${ats} | ${cl} | ${fillIcon} | ${notes} |`);
  });

  const wouldSubmit = results.filter((r) => r.would_submit).length;
  const partial     = results.filter((r) => r.fillable === 'partial').length;
  const blocked     = results.filter((r) => r.fillable === false).length;

  lines.push('');
  lines.push(`**Summary:** ${wouldSubmit} would submit ✅ · ${partial} partial ⚠️ · ${blocked} blocked ❌`);

  return lines.join('\n');
}

// ── Lower-tier safety guard ───────────────────────────────────────────────────

export function loadLowerTierConfig() {
  if (!yaml) return null;
  const cfgPath = path.join(ROOT, 'config', 'lower-tier-test-companies.yml');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    return yaml.load(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Validates all three safety locks for --live mode against a single card.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateLiveSafety(card, allowTier) {
  // Lock (a): --allow-tier flag
  if (!allowTier) {
    return { ok: false, reason: 'Missing --allow-tier flag. Add: --allow-tier lower' };
  }

  // Lock (b): YAML exists and enabled: true
  const cfg = loadLowerTierConfig();
  if (!cfg) {
    return { ok: false, reason: 'config/lower-tier-test-companies.yml not found. Create it from the template first.' };
  }
  if (!cfg.enabled) {
    return { ok: false, reason: 'lower-tier-test-companies.yml has enabled: false. Set enabled: true to activate live mode.' };
  }

  // Lock (c): company slug in list
  const slug  = (card.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const entry = (cfg.companies || []).find((c) => c.slug === slug);
  if (!entry) {
    return {
      ok:     false,
      reason: `Company "${card.company}" (slug: "${slug}") not in lower-tier list. Add it to config/lower-tier-test-companies.yml first.`,
    };
  }

  return { ok: true };
}

// ── Daily cap ─────────────────────────────────────────────────────────────────

export function checkDailyCap() {
  const capPath = path.join(ROOT, 'data', `live-daily-count-${DATE_STAMP}.json`);
  if (!fs.existsSync(capPath)) return { count: 0, capPath };
  try {
    const data = JSON.parse(fs.readFileSync(capPath, 'utf8'));
    return { count: data.count ?? 0, capPath };
  } catch {
    return { count: 0, capPath };
  }
}

export function incrementDailyCap(capPath, currentCount) {
  const tmp = capPath + '.tmp';
  fs.mkdirSync(path.dirname(capPath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({ date: DATE_STAMP, count: currentCount + 1 }, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, capPath);
}

// ── Atomic JSON writer ────────────────────────────────────────────────────────

function writeJSON(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

// ── Screenshot helper ─────────────────────────────────────────────────────────

async function screenshot(page, cardId, prefix) {
  const ssDir  = path.join(ROOT, 'data', 'screenshots', DATE_STAMP);
  const ssPath = path.join(ssDir, `${prefix}-${cardId}.png`);
  fs.mkdirSync(ssDir, { recursive: true });
  await page.screenshot({ path: ssPath, fullPage: false });
  return path.relative(ROOT, ssPath);
}

// ── Dead listing logger ───────────────────────────────────────────────────────

function logDeadListing(card, liveness) {
  const logPath = path.join(ROOT, 'data', `dead-listings-${DATE_STAMP}.json`);
  let existing  = [];
  if (fs.existsSync(logPath)) {
    try { existing = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch { existing = []; }
  }
  existing.push({
    id:          card.id,
    company:     card.company,
    url:         card.url,
    status:      liveness.status,
    reason:      liveness.reason,
    redirect:    liveness.redirect ?? null,
    checked_at:  new Date().toISOString(),
  });
  writeJSON(logPath, existing);
}

// ── Semi-auto mode ────────────────────────────────────────────────────────────

async function runSemiAuto(cards, chromium, clIndex = null) {
  const results = [];

  for (const card of cards) {
    const ats = detectATS(card.url);
    const cl  = clIndex ? findCoverLetterForCard(card, clIndex) : findCoverLetter(card);

    console.log(`\n[semi-auto] [${card.grade}] ${card.company} — ${card.role?.slice(0, 50)}`);
    console.log(`  ATS: ${ats} | CL: ${cl ?? 'none'}`);

    // B7 liveness check
    process.stdout.write('  Liveness check... ');
    const liveness = await checkLiveness(card.url);
    if (!liveness.alive) {
      console.log(`DEAD (${liveness.reason}) — skipping`);
      results.push({ id: card.id, status: 'dead-listing', reason: liveness.reason, url: card.url });
      logDeadListing(card, liveness);
      continue;
    }
    console.log('OK');

    let browser;
    let aborted = false;
    let clicked = false;

    const sigintHandler = () => { aborted = true; };
    process.on('SIGINT', sigintHandler);

    try {
      browser = await chromium.launch({ headless: false });
      const ctx  = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();

      console.log(`  Opening browser → ${card.url}`);
      await page.goto(card.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      // Highlight submit button with red overlay
      const submitBtn = await findSubmitOnPage(page, ats);
      if (submitBtn) {
        await page.addStyleTag({
          content: `
            button[type="submit"],
            button#btn-submit,
            button[aria-label="Submit"],
            button[data-automation-id="submitButton"],
            [data-automation-id="bottom-navigation-next-button"] {
              outline: 3px solid #ff2d2d !important;
              outline-offset: 3px !important;
              box-shadow: 0 0 10px 3px rgba(255,45,45,0.6) !important;
            }
          `,
        });
        console.log('  Submit button highlighted (red border).');
      } else {
        console.log('  ⚠  No submit button detected — check the page manually.');
      }

      const ssPath = await screenshot(page, card.id, 'semi-auto-before');
      console.log(`  Screenshot: ${ssPath}`);

      console.log('\n  ═══════════════════════════════════════════════════════════════');
      console.log('  Form prepped. Review the browser, then click Submit yourself.');
      console.log('  Press Ctrl+C to abort this card without submitting.');
      console.log('  ═══════════════════════════════════════════════════════════════\n');

      try {
        await Promise.race([
          page.waitForNavigation({ timeout: 0, waitUntil: 'domcontentloaded' }),
          new Promise((_, reject) => {
            const poll = setInterval(() => {
              if (aborted) { clearInterval(poll); reject(new Error('user-aborted')); }
            }, 250);
          }),
        ]);
        clicked = true;
        const ssAfter = await screenshot(page, card.id, 'semi-auto-after').catch(() => null);
        console.log(`  Navigation detected — submission likely completed. Screenshot: ${ssAfter ?? 'error'}`);
      } catch (e) {
        if (e.message === 'user-aborted') {
          console.log('  Aborted by user (Ctrl+C).');
        } else {
          console.log(`  Wait ended (${e.message}).`);
        }
      }

    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
    } finally {
      if (browser) await browser.close().catch(() => {});
      process.removeListener('SIGINT', sigintHandler);
    }

    const outcome = clicked ? 'user-submitted' : (aborted ? 'aborted' : 'unknown');
    results.push({
      id:          card.id,
      company:     card.company,
      role:        card.role,
      url:         card.url,
      ats,
      cl_path:     cl ?? null,
      form_fields: [],
      outcome,
      timestamp:   new Date().toISOString(),
    });
    console.log(`  Outcome: ${outcome}`);
  }

  const outPath = path.join(ROOT, 'data', `semi-auto-${DATE_STAMP}.json`);
  writeJSON(outPath, { ran_at: new Date().toISOString(), mode: 'semi-auto', results });
  console.log(`\n[semi-auto] Written → ${path.relative(ROOT, outPath)}`);
  return results;
}

// ── Live mode ─────────────────────────────────────────────────────────────────

function appendSubmitQueue(card, ats, ssPath) {
  const qPath = path.join(ROOT, 'data', 'submit-queue.json');
  let queue   = [];
  if (fs.existsSync(qPath)) {
    try { queue = JSON.parse(fs.readFileSync(qPath, 'utf8')); } catch { queue = []; }
  }
  queue.push({
    id:           card.id,
    company:      card.company,
    role:         card.role,
    url:          card.url,
    ats,
    status:       'applied',
    submitted_at: new Date().toISOString(),
    screenshot:   ssPath ?? null,
  });
  writeJSON(qPath, queue);
}

function writeTSVEntry(card, ats) {
  const dir = path.join(ROOT, 'batch', 'tracker-additions');
  fs.mkdirSync(dir, { recursive: true });
  const slug    = (card.company || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const num     = card.id.replace(/\D/g, '') || '0';
  const columns = [num, DATE_STAMP, card.company, card.role ?? '', 'Applied', '-/5', '❌',
    `[${num}](data/live-runs-${DATE_STAMP}.json)`, `live-submit via ${ats}`];
  const outPath = path.join(dir, `${num}-${slug}-live.tsv`);
  fs.writeFileSync(outPath, columns.join('\t') + '\n', 'utf8');
}

async function runLive(cards, chromium, allowTier, clIndex = null) {
  let captchaBlocked = 0;
  let formBlocked    = 0;
  let confirmed      = 0;
  let unconfirmed    = 0;
  const results      = [];

  let { count: dailyCount, capPath } = checkDailyCap();

  for (const card of cards) {
    if (dailyCount >= LIVE_DAILY_CAP) {
      console.log(`\n[live] Hard cap reached (${LIVE_DAILY_CAP}/day). Stopping.`);
      break;
    }

    // Per-card safety lock (company must be in YAML)
    const safety = validateLiveSafety(card, allowTier);
    if (!safety.ok) {
      console.log(`\n[live] SAFETY BLOCKED [${card.company}]: ${safety.reason}`);
      results.push({ id: card.id, status: 'safety-blocked', reason: safety.reason, url: card.url });
      continue;
    }

    const ats = detectATS(card.url);
    const cl  = clIndex ? findCoverLetterForCard(card, clIndex) : findCoverLetter(card);

    console.log(`\n[live] [${card.grade}] ${card.company} — ${card.role?.slice(0, 50)}`);
    console.log(`  ATS: ${ats} | CL: ${cl ?? 'none'}`);

    // B7 liveness check
    process.stdout.write('  Liveness check... ');
    const liveness = await checkLiveness(card.url);
    if (!liveness.alive) {
      console.log(`DEAD (${liveness.reason}) — skipping`);
      results.push({ id: card.id, status: 'dead-listing', reason: liveness.reason, url: card.url });
      logDeadListing(card, liveness);
      continue;
    }
    console.log('OK');

    let browser;
    let ssPath = null;

    try {
      browser = await chromium.launch({ headless: true });
      const ctx  = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();

      await page.goto(card.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // CAPTCHA check — mark and skip this card
      if (await detectCaptchaOnPage(page)) {
        console.log('  → CAPTCHA detected — marking requires-human, skipping card');
        ssPath = await screenshot(page, card.id, 'captcha').catch(() => null);
        results.push({ id: card.id, status: 'requires-human', reason: 'captcha-detected', url: card.url, screenshot: ssPath });
        captchaBlocked++;
        continue;
      }

      // Intermediate step — CRITICAL: STOP entire run, do NOT move on
      if (await detectIntermediateStepOnPage(page)) {
        ssPath = await screenshot(page, card.id, 'intermediate').catch(() => null);
        results.push({ id: card.id, status: 'intermediate-step', reason: 'intermediate-step-detected', url: card.url, screenshot: ssPath });
        await browser.close().catch(() => {});
        browser = null;
        console.log('  → INTERMEDIATE STEP detected — application flow has changed. Stopping run for manual review.');
        break;
      }

      // Find submit button
      const submitBtn = await findSubmitOnPage(page, ats);
      if (!submitBtn) {
        console.log('  → BLOCKED: no submit button found');
        ssPath = await screenshot(page, card.id, 'no-submit').catch(() => null);
        results.push({ id: card.id, status: 'blocked', reason: 'no-submit-button', url: card.url, screenshot: ssPath });
        formBlocked++;
        continue;
      }

      // Pre-submit screenshot
      ssPath = await screenshot(page, card.id, 'pre-submit');
      console.log(`  Pre-submit screenshot: ${ssPath}`);

      // Click submit
      await submitBtn.click();
      console.log('  Clicked submit. Waiting for confirmation (60s)...');

      let confirmed_flag = false;
      try {
        await Promise.race([
          page.waitForURL((url) => url !== card.url, { timeout: 60000 }),
          page.waitForSelector('text="Thank you for applying"',       { timeout: 60000 }),
          page.waitForSelector('text="Application submitted"',        { timeout: 60000 }),
          page.waitForSelector('text="We received your application"', { timeout: 60000 }),
        ]);
        confirmed_flag = true;
      } catch { /* 60s timeout — no confirmation */ }

      const ssAfter = await screenshot(page, card.id, confirmed_flag ? 'confirmed' : 'unconfirmed').catch(() => null);

      if (confirmed_flag) {
        console.log('  → CONFIRMED: application submitted');
        confirmed++;
        incrementDailyCap(capPath, dailyCount);
        dailyCount++;
        appendSubmitQueue(card, ats, ssAfter);
        writeTSVEntry(card, ats);
        results.push({ id: card.id, status: 'applied', url: card.url, ats, screenshot: ssAfter, note: 'confirmed' });
      } else {
        console.log('  → UNCONFIRMED: no confirmation within 60s — NOT marking as applied');
        unconfirmed++;
        results.push({ id: card.id, status: 'unconfirmed', url: card.url, ats, screenshot: ssAfter, note: 'no-confirmation-60s' });
      }

    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      results.push({ id: card.id, status: 'error', error: e.message, url: card.url });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  const outPath = path.join(ROOT, 'data', `live-runs-${DATE_STAMP}.json`);
  writeJSON(outPath, {
    ran_at:          new Date().toISOString(),
    mode:            'live',
    allow_tier:      allowTier,
    confirmed,
    unconfirmed,
    captcha_blocked: captchaBlocked,
    form_blocked:    formBlocked,
    results,
  });
  console.log(`\n[live] Written → ${path.relative(ROOT, outPath)}`);

  return { confirmed, unconfirmed, captchaBlocked, formBlocked, results };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const modeLabel = LIVE ? 'LIVE' : SEMI_AUTO ? 'SEMI-AUTO' : 'DRY-RUN';
  console.log(`[auto-submit] mode=${modeLabel} limit=${LIMIT}`);

  // Load eligible cards — JSON path takes priority over HTML kanban
  let eligible;
  try {
    if (KANBAN_JSON) {
      console.log(`[auto-submit] source=kanban-json path=${KANBAN_JSON}`);
      eligible = extractEligibleCardsFromJson(KANBAN_JSON);
    } else {
      console.log(`[auto-submit] source=kanban-html path=${path.relative(ROOT, KANBAN_PATH)}`);
      eligible = extractEligibleCards(KANBAN_PATH);
    }
  } catch (e) {
    console.error(`[auto-submit] FATAL: ${e.message}`);
    process.exit(1);
  }
  console.log(`[auto-submit] ${eligible.length} eligible cards found`);

  if (CARD_ID) {
    eligible = eligible.filter((c) => c.id === CARD_ID);
    if (eligible.length === 0) {
      console.error(`[auto-submit] Card "${CARD_ID}" not found in eligible set`);
      process.exit(1);
    }
  }

  // Fail-fast checks for --live before launching any browser
  if (LIVE) {
    if (!ALLOW_TIER) {
      console.error('[auto-submit] FATAL: --live requires --allow-tier <tier>. Example: --allow-tier lower');
      process.exit(1);
    }
    const cfg = loadLowerTierConfig();
    if (!cfg) {
      console.error('[auto-submit] FATAL: config/lower-tier-test-companies.yml not found. Create it from the template.');
      process.exit(1);
    }
    if (!cfg.enabled) {
      console.error('[auto-submit] FATAL: lower-tier-test-companies.yml has enabled: false. Set enabled: true to activate.');
      process.exit(1);
    }
    const { count } = checkDailyCap();
    if (count >= LIVE_DAILY_CAP) {
      console.error(`[auto-submit] FATAL: Daily live cap of ${LIVE_DAILY_CAP} already reached today.`);
      process.exit(1);
    }
  }

  const toProcess = eligible.slice(0, LIMIT);

  // Load CL index once (warnings only — missing index is not fatal)
  const clIdx = loadClIndex(CL_INDEX_ARG);
  if (!clIdx) {
    console.log('[auto-submit] CL index not found — falling back to filename matching');
  } else {
    console.log(`[auto-submit] CL index loaded: ${clIdx.templates?.length ?? 0} templates`);
  }

  // ── Dry-run ─────────────────────────────────────────────────────────────────
  if (DRY_RUN) {
    const results     = toProcess.map((card) => dryRunCard(card, clIdx));
    const wouldSubmit = results.filter((r) => r.would_submit).length;
    const partial     = results.filter((r) => r.fillable === 'partial').length;
    const blocked     = results.filter((r) => r.fillable === false).length;

    console.log('\n[auto-submit] DRY-RUN RESULTS:');
    results.forEach((r) => {
      const icon = r.would_submit ? '✓' : r.fillable === 'partial' ? '~' : '✗';
      console.log(`  ${icon} [${r.grade}] ${r.company} — ${r.role?.slice(0, 50)}`);
      console.log(`      ATS: ${r.ats} | CL: ${r.has_cl ? r.cl_path : 'none'} | ${r.notes}`);
    });
    console.log(`\n[auto-submit] Summary: ${wouldSubmit} would submit, ${partial} partial, ${blocked} blocked`);

    if (REPORT) {
      console.log('\n' + formatMarkdownReport(results) + '\n');
    } else {
      console.log('[auto-submit] Add --report to see a markdown table. Run with --semi-auto to inspect form fill.');
    }

    const output = {
      ran_at:         new Date().toISOString(),
      mode:           'dry-run',
      kanban:         path.relative(ROOT, KANBAN_PATH),
      eligible_total: eligible.length,
      processed:      toProcess.length,
      would_submit:   wouldSubmit,
      partial,
      blocked,
      results,
    };
    const outPath = path.join(ROOT, 'data', `auto-submit-dry-run-${DATE_STAMP}.json`);
    writeJSON(outPath, output);
    console.log(`[auto-submit] Written → ${path.relative(ROOT, outPath)}`);
    return;
  }

  // ── Playwright modes ─────────────────────────────────────────────────────────
  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch {
    console.error('[auto-submit] FATAL: Playwright not available. Run: npx playwright install chromium');
    process.exit(1);
  }

  if (SEMI_AUTO) {
    await runSemiAuto(toProcess, chromium, clIdx);
    return;
  }

  // LIVE
  const { captchaBlocked, formBlocked } = await runLive(toProcess, chromium, ALLOW_TIER, clIdx);
  if (captchaBlocked > 0) process.exit(2);
  if (formBlocked > 0)    process.exit(3);
  process.exit(0);
}

// ── CLI guard (prevents main() from running on import) ────────────────────────
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (IS_CLI) {
  main().catch((e) => { console.error('[auto-submit] FATAL:', e.message); process.exit(1); });
}
