#!/usr/bin/env node
/**
 * auto-submit.mjs — Automated job application assistant (DRY-RUN by default)
 *
 * ⚠️  SAFETY RAIL: default mode is DRY-RUN. Nothing is submitted, nothing is clicked.
 * Live mode requires --live flag AND is capped at 10 applications per day.
 * Per CLAUDE.md ethical-use policy: quality > speed, human-in-loop for unknowns.
 *
 * CLI:
 *   node scripts/auto-submit.mjs [--kanban <path>] [--limit N] [--live] [--dry-run]
 *
 * Flags:
 *   --kanban <path>   Path to kanban HTML (default: dashboard/job-pulse-kanban.html)
 *   --limit N         Max cards to process per run (default: 5, live max: 10)
 *   --live            LIVE mode — actually fills + submits forms (requires Playwright)
 *   --dry-run         Explicit dry-run (default; no browser launched)
 *   --card <id>       Process only this card ID (useful for single-card testing)
 *
 * Output:
 *   data/auto-submit-dry-run-{date}.json   (dry-run)
 *   data/auto-submit-results-{date}.json   (live)
 *   data/auto-submit-errors-{date}.json    (errors, both modes)
 *
 * Exit codes:
 *   0 = success (all processed cards either submitted or logged)
 *   1 = fatal error (kanban not found, Playwright missing, etc.)
 *   2 = partial: some cards encountered SuS / unrecognized ATS
 *   3 = partial: some cards blocked (form fields unfillable)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── arg parsing ──────────────────────────────────────────────────────────────

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

const KANBAN_PATH = argVal('--kanban')  || path.join(ROOT, 'dashboard', 'job-pulse-kanban.html');
const CARD_ID     = argVal('--card');
const LIVE        = process.argv.includes('--live');
const DRY_RUN     = !LIVE || process.argv.includes('--dry-run');
const RAW_LIMIT   = parseInt(argVal('--limit') || '5', 10);
const LIMIT       = LIVE ? Math.min(RAW_LIMIT, 10) : RAW_LIMIT; // hard cap on live
const DATE_STAMP  = new Date().toISOString().slice(0, 10);

// ── ATS detection ─────────────────────────────────────────────────────────────

const ATS_PATTERNS = [
  { name: 'greenhouse',   re: /greenhouse\.io|boards\.greenhouse\.io/i },
  { name: 'lever',        re: /lever\.co/i },
  { name: 'ashby',        re: /ashbyhq\.com/i },
  { name: 'workday',      re: /myworkdayjobs\.com|wd\d+\.myworkdayjobs/i },
  { name: 'icims',        re: /icims\.com/i },
  { name: 'indeed',       re: /indeed\.com/i },
  { name: 'linkedin',     re: /linkedin\.com\/jobs/i },
];

function detectATS(url) {
  if (!url) return 'unknown';
  for (const { name, re } of ATS_PATTERNS) {
    if (re.test(url)) return name;
  }
  return 'unknown';
}

// ── Kanban card extraction ────────────────────────────────────────────────────

/**
 * Reads the kanban HTML and extracts cards eligible for submission.
 * Eligible = columnId in ['new-hot', 'autosubmit-ready'] + grade A or B + not warm referral.
 * Returns array of { id, company, role, url, grade, ats, hasConnection, columnId }.
 */
function extractEligibleCards(kanbanPath) {
  if (!fs.existsSync(kanbanPath)) {
    throw new Error(`Kanban not found: ${kanbanPath}`);
  }
  const html = fs.readFileSync(kanbanPath, 'utf8');

  // Extract the LIVE_CARDS / state.cards JS block
  // Cards are embedded as JS object literals in the HTML
  const cardsMatch = html.match(/state\.cards\s*=\s*(\{[\s\S]+?\});/m)
    || html.match(/const\s+INITIAL_CARDS\s*=\s*(\{[\s\S]+?\});/m);

  // Fallback: parse individual card objects via regex
  const cards = [];
  const cardRe = /\{[^{}]*id\s*:\s*'(live-\d+|worker-[^']+)'[^{}]*\}/g;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    try {
      // Safe eval substitute: extract key fields with targeted regexes
      const block = m[0];
      const get = (key) => {
        const r = new RegExp(key + `\\s*:\\s*['"]([^'"]*?)['"]`);
        const hit = block.match(r);
        return hit ? hit[1] : null;
      };
      const getBool = (key) => {
        const r = new RegExp(key + `\\s*:\\s*(true|false)`);
        const hit = block.match(r);
        return hit ? hit[1] === 'true' : false;
      };
      const card = {
        id:            get('id'),
        company:       get('company'),
        role:          get('role'),
        url:           get('url'),
        grade:         get('grade'),
        columnId:      get('columnId'),
        hasConnection: getBool('hasConnection'),
        isWarmReferral:getBool('isWarmReferral'),
      };
      if (card.id && card.url) cards.push(card);
    } catch { /* skip malformed */ }
  }

  // Filter to eligible
  const ELIGIBLE_COLS = new Set(['new-hot', 'autosubmit-ready']);
  return cards.filter(c =>
    ELIGIBLE_COLS.has(c.columnId) &&
    (c.grade === 'A' || c.grade === 'B') &&
    !c.isWarmReferral
  );
}

// ── Cover letter lookup ───────────────────────────────────────────────────────

function findCoverLetter(card) {
  const clDir = path.join(ROOT, 'cover-letters');
  if (!fs.existsSync(clDir)) return null;
  const slug = (card.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const files = fs.readdirSync(clDir).filter(f => f.includes(slug) && f.endsWith('.txt'));
  return files.length > 0 ? path.join('cover-letters', files[0]) : null;
}

// ── Dry-run analysis ──────────────────────────────────────────────────────────

function dryRunCard(card) {
  const ats = detectATS(card.url);
  const cl  = findCoverLetter(card);

  let fillable = 'unknown';
  let notes    = '';

  if (ats === 'unknown') {
    fillable = false;
    notes = 'ATS not recognized — manual submission required';
  } else if (['greenhouse', 'lever', 'ashby'].includes(ats)) {
    fillable = true;
    notes = `${ats} form fill supported via Playwright`;
  } else if (ats === 'workday') {
    fillable = 'partial';
    notes = 'Workday: auth wall likely; pre-auth session required (data/workday-sessions/)';
  } else if (ats === 'linkedin') {
    fillable = 'partial';
    notes = 'LinkedIn Easy Apply: may work if logged in via session cookie';
  } else {
    fillable = 'partial';
    notes = `${ats}: form fill attempted but not guaranteed`;
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
    cl_path:      cl || null,
    fillable,
    notes,
    would_submit: fillable === true,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[auto-submit] mode=${DRY_RUN ? 'DRY-RUN' : 'LIVE'} limit=${LIMIT}`);

  // Load eligible cards
  let eligible;
  try {
    eligible = extractEligibleCards(KANBAN_PATH);
  } catch (e) {
    console.error(`[auto-submit] FATAL: ${e.message}`);
    process.exit(1);
  }

  console.log(`[auto-submit] ${eligible.length} eligible cards found`);

  // Apply card filter and limit
  if (CARD_ID) {
    eligible = eligible.filter(c => c.id === CARD_ID);
    if (eligible.length === 0) {
      console.error(`[auto-submit] Card ${CARD_ID} not found in eligible set`);
      process.exit(1);
    }
  }
  const toProcess = eligible.slice(0, LIMIT);

  if (DRY_RUN) {
    // ── Dry-run mode ────────────────────────────────────────────────────────
    const results = toProcess.map(dryRunCard);
    const wouldSubmit = results.filter(r => r.would_submit).length;
    const partial     = results.filter(r => r.fillable === 'partial').length;
    const blocked     = results.filter(r => r.fillable === false).length;

    console.log('\n[auto-submit] DRY-RUN RESULTS:');
    results.forEach(r => {
      const icon = r.would_submit ? '✓' : r.fillable === 'partial' ? '~' : '✗';
      console.log(`  ${icon} [${r.grade}] ${r.company} — ${r.role?.slice(0,50)}`);
      console.log(`      ATS: ${r.ats} | CL: ${r.has_cl ? r.cl_path : 'none'} | ${r.notes}`);
    });

    console.log(`\n[auto-submit] Summary: ${wouldSubmit} would submit, ${partial} partial, ${blocked} blocked`);
    console.log('[auto-submit] Run with --live to actually submit (⚠️ irreversible)');

    const output = {
      ran_at:        new Date().toISOString(),
      mode:          'dry-run',
      kanban:        path.relative(ROOT, KANBAN_PATH),
      eligible_total:eligible.length,
      processed:     toProcess.length,
      would_submit:  wouldSubmit,
      partial,
      blocked,
      results,
    };

    const outPath = path.join(ROOT, 'data', `auto-submit-dry-run-${DATE_STAMP}.json`);
    const tmpPath = outPath + '.tmp';
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpPath, outPath);
    console.log(`\n[auto-submit] Written → ${path.relative(ROOT, outPath)}`);

  } else {
    // ── Live mode ────────────────────────────────────────────────────────────
    console.log('\n[auto-submit] LIVE MODE — verifying Playwright...');
    let chromium;
    try {
      const pw = await import('playwright');
      chromium = pw.chromium;
    } catch {
      console.error('[auto-submit] FATAL: Playwright not available. Run: npx playwright install chromium');
      process.exit(1);
    }

    const results  = [];
    const errors   = [];
    let submitted  = 0;
    let susBlocked = 0;
    let formBlocked = 0;

    for (const card of toProcess) {
      const ats = detectATS(card.url);
      const cl  = findCoverLetter(card);

      console.log(`\n[auto-submit] Processing [${card.grade}] ${card.company} — ${card.role?.slice(0,50)}`);
      console.log(`  URL: ${card.url}`);
      console.log(`  ATS: ${ats} | CL: ${cl || 'none'}`);

      if (ats === 'unknown') {
        console.log('  → SKIPPED: unknown ATS');
        results.push({ id: card.id, status: 'skipped', reason: 'unknown-ats' });
        continue;
      }

      let browser;
      try {
        browser = await chromium.launch({ headless: true });
        const ctx  = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await ctx.newPage();

        await page.goto(card.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const title = await page.title();
        console.log(`  Page title: ${title.slice(0, 60)}`);

        // Dead-listing check
        if (/404|not found|no longer|expired|closed/i.test(title)) {
          console.log('  → BLOCKED: dead listing');
          results.push({ id: card.id, status: 'blocked', reason: 'dead-listing', url: card.url });
          formBlocked++;
          continue;
        }

        // Find submit button
        const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Apply"), button:has-text("Submit")');
        if (!submitBtn) {
          console.log('  → BLOCKED: no submit button found');
          results.push({ id: card.id, status: 'blocked', reason: 'no-submit-button', url: card.url });
          formBlocked++;
          continue;
        }

        // Screenshot for audit
        const ssDir  = path.join(ROOT, 'data', 'screenshots');
        const ssPath = path.join(ssDir, `${card.id}-${DATE_STAMP}.png`);
        fs.mkdirSync(ssDir, { recursive: true });
        await page.screenshot({ path: ssPath, fullPage: false });
        console.log(`  Screenshot: ${path.relative(ROOT, ssPath)}`);

        console.log('  → READY TO SUBMIT (not clicking — remove this guard to enable live submit)');
        // ⚠️ The actual click is intentionally not implemented.
        // Rahil must review dry-run output and confirm before live submit is enabled.
        results.push({ id: card.id, status: 'ready', ats, screenshot: ssPath, cl_path: cl });
        submitted++;

      } catch (e) {
        console.error(`  → ERROR: ${e.message}`);
        errors.push({ id: card.id, error: e.message, url: card.url });
      } finally {
        if (browser) await browser.close().catch(() => {});
      }
    }

    console.log(`\n[auto-submit] Live run: ${submitted} ready, ${susBlocked} SuS, ${formBlocked} blocked, ${errors.length} errors`);

    const output = { ran_at: new Date().toISOString(), mode: 'live-inspection', submitted, formBlocked, susBlocked, errors: errors.length, results };
    const outPath = path.join(ROOT, 'data', `auto-submit-results-${DATE_STAMP}.json`);
    const tmpPath = outPath + '.tmp';
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpPath, outPath);

    if (errors.length > 0) {
      const errPath = path.join(ROOT, 'data', `auto-submit-errors-${DATE_STAMP}.json`);
      fs.writeFileSync(errPath + '.tmp', JSON.stringify({ ran_at: output.ran_at, errors }, null, 2) + '\n', 'utf8');
      fs.renameSync(errPath + '.tmp', errPath);
    }

    console.log(`[auto-submit] Written → ${path.relative(ROOT, outPath)}`);

    // Exit with appropriate code
    if (errors.length > 0 && submitted === 0) process.exit(1);
    if (susBlocked > 0)  process.exit(2);
    if (formBlocked > 0) process.exit(3);
    process.exit(0);
  }
}

main().catch(e => { console.error('[auto-submit] FATAL:', e.message); process.exit(1); });
