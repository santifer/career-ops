#!/usr/bin/env node
/**
 * auto-apply.mjs — Autonomous Application Engine (Phase 8)
 *
 * Finds assembled packages with "Evaluated" status in applications.md,
 * fills the form via Playwright, runs Kimi AI pre-submit review, submits.
 * Updates tracker to "Applied" on success.
 *
 * Usage:
 *   node auto-apply.mjs                     → process all eligible packages
 *   node auto-apply.mjs --num 062           → process single package
 *   node auto-apply.mjs --dry-run           → fill but do NOT submit
 *   node auto-apply.mjs --threshold 4.0     → min score (default: 4.0)
 *   node auto-apply.mjs --workers 1         → parallel instances (default: 1)
 *   node auto-apply.mjs --no-review         → skip Kimi pre-submit review
 *   node auto-apply.mjs --verbose           → detailed output
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = __dirname;

// ─── Args ─────────────────────────────────────────────────────────────────────

function argValue(flag, def = '') {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : def;
}

const ONLY_NUM  = argValue('--num');
const DRY_RUN   = process.argv.includes('--dry-run');
const NO_REVIEW = process.argv.includes('--no-review');
const VERBOSE   = process.argv.includes('--verbose');
const THRESHOLD = parseFloat(argValue('--threshold', '4.0'));
const WORKERS   = parseInt(argValue('--workers', '1'), 10);
const TODAY     = new Date().toISOString().split('T')[0];

// ─── Paths ─────────────────────────────────────────────────────────────────────

const PACKAGES_DIR = join(PROJECT_DIR, 'output', 'packages');
const TRACKER_FILE = join(PROJECT_DIR, 'data', 'applications.md');
const LOG_DIR      = join(PROJECT_DIR, 'batch', 'logs');
const LOG_FILE     = join(LOG_DIR, `auto-apply-${TODAY}.log`);
// Resume PDF path is resolved later (after identity loads) — see resolveResumePath()
const LEGACY_RESUME_PDF = join(PROJECT_DIR, 'output', 'tony-walteur-cv.pdf');
const PROFILE_FILE = join(PROJECT_DIR, 'config', 'profile.yml');
const TMP_DIR      = join(PROJECT_DIR, 'batch', 'tmp');

// ─── Candidate identity (loaded from config/profile.yml — no PII in source) ──
// Uses the same regex-based parser as dashboard-web/server.mjs:loadProfile.
// Avoids a YAML dependency for a config that's just simple key/value pairs.

function loadCandidateIdentity() {
  if (!existsSync(PROFILE_FILE)) {
    throw new Error(`config/profile.yml not found. Copy config/profile.example.yml and fill in your details.`);
  }
  const yml = readFileSync(PROFILE_FILE, 'utf8');
  // Scope reads to the candidate: block so we don't accidentally pick up
  // values from other top-level sections that share field names.
  const candidateBlock = yml.match(/^candidate:\s*\n([\s\S]*?)(?=^\S|\Z)/m);
  const scope = candidateBlock ? candidateBlock[1] : yml;
  const get = (key) => {
    const m = scope.match(new RegExp(`^\\s+${key}:\\s*"?([^"\\n]+?)"?\\s*$`, 'm'));
    return m ? m[1].trim() : '';
  };

  const fullName = get('full_name');
  const email    = get('email');
  const phone    = get('phone');
  const location = get('location');
  const linkedinRaw = get('linkedin');
  const linkedin = linkedinRaw && !/^https?:\/\//i.test(linkedinRaw)
    ? `https://${linkedinRaw.replace(/^\/+/, '')}`
    : linkedinRaw;

  const missing = Object.entries({ full_name: fullName, email, phone }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`config/profile.yml missing required fields under 'candidate:': ${missing.join(', ')}`);
  }

  const [firstName, ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(' ');
  const locParts = location.split(',').map(s => s.trim()).filter(Boolean);

  return {
    firstName: firstName || '',
    lastName:  lastName  || '',
    email,
    phone,
    linkedin,
    location,
    city:    locParts[0] || '',
    country: locParts[locParts.length - 1] || '',
  };
}

const TONY = loadCandidateIdentity();

// ─── Resume PDF path (derived from profile, with legacy fallback) ────────────

function kebabCase(s) {
  return String(s).toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-');
}

function resolveResumePath() {
  const fullName = `${TONY.firstName} ${TONY.lastName}`.trim();
  const slug = fullName ? kebabCase(fullName) : '';
  const derived = slug ? join(PROJECT_DIR, 'output', `${slug}-cv.pdf`) : '';
  // Prefer derived path if it exists, else legacy filename, else derived (so
  // generate-cv-pdf.mjs writes to the new location next time).
  if (derived && existsSync(derived)) return derived;
  if (existsSync(LEGACY_RESUME_PDF)) return LEGACY_RESUME_PDF;
  return derived || LEGACY_RESUME_PDF;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg, level = 'INFO') {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  const prefix = level === 'ERROR' ? '✖ ' : level === 'WARN' ? '⚠ ' : '  ';
  console.log(`${prefix}${msg}`);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch { /* non-critical */ }
}

function logDetail(num, msg) {
  const ts = new Date().toISOString();
  if (VERBOSE) console.log(`    [${num}] ${msg}`);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(join(LOG_DIR, `apply-${num}-${TODAY}.log`), `[${ts}] ${msg}\n`, 'utf8');
  } catch { /* non-critical */ }
}

// ─── Candidate discovery ──────────────────────────────────────────────────────

function findEvaluatedEntries() {
  if (!existsSync(TRACKER_FILE)) return [];

  const candidates = [];
  for (const line of readFileSync(TRACKER_FILE, 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue;
    // | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
    const cells = line.split('|').map(c => c.trim());
    // cells[0]='' cells[1]=# cells[2]=Date cells[3]=Company cells[4]=Role
    //             cells[5]=Score cells[6]=Status cells[7]=PDF cells[8]=Report
    if (cells.length < 8) continue;
    const num     = cells[1];
    const company = cells[3];
    const role    = cells[4];
    const score   = cells[5];
    const status  = cells[6];
    const report  = cells[8] || '';

    if (!num?.match(/^\d+$/)) continue;
    if (status !== 'Evaluated') continue;

    const scoreNum = parseFloat(score?.replace('/5', '') || '0');
    if (scoreNum < THRESHOLD) continue;

    // Tracker # (cells[1]) is sequential and may not match the package directory
    // when an offer has been re-evaluated. The Report column links to the actual
    // package: [NNN](reports/NNN-...). Extract that number for package lookup;
    // fall back to tracker # if the link is missing or malformed.
    const reportMatch = report.match(/\[(\d+)\]/);
    const packageRaw  = reportMatch ? reportMatch[1] : num;

    candidates.push({
      num:        num.padStart(3, '0'),         // tracker # (for status updates)
      packageNum: packageRaw.padStart(3, '0'),  // package # (for directory lookup)
      company:    company || '',
      role:       role || '',
      score:      scoreNum,
      rawScore:   score || '',
    });
  }
  return candidates;
}

function findPackageDir(num) {
  if (!existsSync(PACKAGES_DIR)) return null;
  const match = readdirSync(PACKAGES_DIR).find(d => d.startsWith(num + '-') || d.startsWith(parseInt(num, 10) + '-'));
  return match ? join(PACKAGES_DIR, match) : null;
}

function readPackage(pkgDir) {
  const ctxPath = join(pkgDir, 'context.md');
  if (!existsSync(ctxPath)) return null;

  const ctx = readFileSync(ctxPath, 'utf8');
  const urlMatch = ctx.match(/\*\*URL:\*\*\s*(https?:\/\/[^\s\n]+)/);
  const url = urlMatch?.[1]?.trim() || '';

  const clPath = join(pkgDir, 'cover-letter.md');
  const coverLetter = existsSync(clPath) ? readFileSync(clPath, 'utf8') : '';

  return { url, coverLetter, ctx };
}

// ─── ATS detection ────────────────────────────────────────────────────────────

function detectAts(url) {
  if (!url) return 'unknown';
  if (/greenhouse\.io/i.test(url))       return 'greenhouse';
  if (/ashbyhq\.com/i.test(url))         return 'ashby';
  if (/lever\.co/i.test(url))            return 'lever';
  if (/workday\.com|workdayjobs/i.test(url)) return 'workday';
  if (/smartrecruiters/i.test(url))      return 'smartrecruiters';
  return 'generic';
}

// ─── Resume PDF ───────────────────────────────────────────────────────────────

function ensureResumePdf() {
  let pdfPath = resolveResumePath();
  if (existsSync(pdfPath)) return pdfPath;
  log('Generating resume PDF...', 'WARN');
  spawnSync('node', ['generate-cv-pdf.mjs'], { cwd: PROJECT_DIR, encoding: 'utf8', timeout: 60_000 });
  pdfPath = resolveResumePath();
  if (!existsSync(pdfPath)) throw new Error('Could not generate resume PDF');
  return pdfPath;
}

function writeCoverLetterFile(num, content) {
  mkdirSync(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, `cover-letter-${num}.txt`);
  const plain = content
    .replace(/^#+\s+.+\n/gm, '')          // remove headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')     // bold
    .replace(/\*([^*]+)\*/g, '$1')         // italic
    .replace(/---+\n?/g, '')               // hr
    .trim();
  writeFileSync(path, plain, 'utf8');
  return path;
}

// ─── Kimi API ─────────────────────────────────────────────────────────────────

async function callKimi(system, user, maxTokens = 2000) {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) throw new Error('KIMI_API_KEY not set');

  const base = (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, '');
  const resp = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'moonshot-v1-128k',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.1,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) throw new Error(`Kimi ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const json = await resp.json();
  return json.choices?.[0]?.message?.content || '';
}

// ─── Generate form answers via Kimi ──────────────────────────────────────────

async function generateAnswers(fields, pkg, jobCtx) {
  const profile = existsSync(PROFILE_FILE) ? readFileSync(PROFILE_FILE, 'utf8') : '';

  const fullName = `${TONY.firstName} ${TONY.lastName}`.trim();
  const system = `You are an expert job application assistant filling out forms for ${fullName}.
Rules:
- NEVER fabricate metrics or experiences not in the profile.
- NEVER use em-dashes (—). Use commas or periods instead.
- Be direct, confident, and concise.
- Answer in first person as ${TONY.firstName}.
- For salary: return "Competitive / Market rate".
- For "How did you hear about us": return "LinkedIn".`;

  const user = `Fill these application form fields for ${fullName}.

ROLE CONTEXT: ${jobCtx}

CANDIDATE PROFILE (profile.yml):
${profile.slice(0, 4000)}

COVER LETTER FOR THIS ROLE:
${pkg.coverLetter?.slice(0, 2000) || '(not available)'}

FORM FIELDS:
${JSON.stringify(fields, null, 2)}

Return ONLY a valid JSON object mapping each field's "id" to its fill value.
Rules per field type:
- file (resume): "FILE_UPLOAD_RESUME"
- file (cover letter): "FILE_UPLOAD_COVER_LETTER"
- checkbox (consent/privacy): "CHECK"
- select: return exactly one of the listed options
- radio: return exactly one of the listed options
- text/email/tel: direct value
- textarea: 2-4 sentence answer (or adapt from cover letter for "why this company" questions)
- location/city: "${TONY.location}" or "${TONY.city}" or "${TONY.country}" as appropriate
- first_name: "${TONY.firstName}", last_name: "${TONY.lastName}", email: "${TONY.email}", phone: "${TONY.phone}"
- linkedin: "${TONY.linkedin}"

Return ONLY the JSON object, no explanation or markdown.`;

  const raw = await callKimi(system, user, 2500);
  const match = raw.match(/\{[\s\S]+\}/);
  if (!match) throw new Error(`No JSON in Kimi response: ${raw.slice(0, 300)}`);
  return JSON.parse(match[0]);
}

// ─── Kimi pre-submit review ───────────────────────────────────────────────────

async function reviewApplication(filledData, jobCtx, pkg) {
  const candidateName = `${TONY.firstName} ${TONY.lastName}`.trim();
  const system = `You are a quality reviewer for ${candidateName}'s job applications.
Respond with EXACTLY "APPROVED" or "FLAGGED: [reason]" — nothing else.`;

  const user = `Review this application before submission.

ROLE: ${jobCtx}

FILLED FORM DATA:
${JSON.stringify(filledData, null, 2)}

COVER LETTER:
${pkg.coverLetter?.slice(0, 1000) || '(none)'}

Check for: wrong name/email, empty required fields, obvious factual errors, em-dashes in answers.
Respond with APPROVED or FLAGGED: [reason]`;

  const raw = (await callKimi(system, user, 200)).trim();
  return {
    approved: raw.startsWith('APPROVED'),
    reason: raw.startsWith('FLAGGED:') ? raw.replace('FLAGGED:', '').trim() : raw,
  };
}

// ─── Form field extractor (runs in page context) ──────────────────────────────

async function extractFields(page) {
  return page.evaluate(() => {
    const fields = [];
    const seen = new Set();

    const findLabel = (el) => {
      if (el.id) {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        if (lbl) return lbl.textContent.replace(/\s+/g, ' ').trim();
      }
      const parent = el.closest('[class*="field"], [class*="question"], [class*="input"], li, .field-row');
      if (parent) {
        const lbl = parent.querySelector('label, legend');
        if (lbl) return lbl.textContent.replace(/\s+/g, ' ').trim();
      }
      return el.placeholder || el.getAttribute('aria-label') || '';
    };

    const elements = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]), textarea, select'
    );

    for (const el of elements) {
      const id   = el.id || el.name || `field_${fields.length}`;
      const name = el.name || el.id || '';
      if (seen.has(id + name)) continue;
      seen.add(id + name);

      const type = el.tagName === 'SELECT' ? 'select'
        : el.tagName === 'TEXTAREA' ? 'textarea'
        : (el.type || 'text').toLowerCase();

      const options = type === 'select'
        ? Array.from(el.options)
            .map(o => o.text.trim())
            .filter(t => t && !/^(--|select|choose|pick)/i.test(t))
        : type === 'radio'
        ? Array.from(document.querySelectorAll(`[name="${el.name}"]`)).map(r => r.value)
        : [];

      fields.push({
        id, name, type,
        label: findLabel(el),
        options,
        required: el.required || el.getAttribute('aria-required') === 'true',
      });
    }

    return fields;
  });
}

// ─── Apply hardcoded identity values ─────────────────────────────────────────

function mergeIdentity(answers, fields) {
  const identity = {
    first_name: TONY.firstName, firstname: TONY.firstName,
    last_name:  TONY.lastName,  lastname:  TONY.lastName,
    email:      TONY.email,     phone:     TONY.phone,
    phone_number: TONY.phone,   linkedin_profile: TONY.linkedin,
    linkedin:   TONY.linkedin,  'applicant[first_name]': TONY.firstName,
    'applicant[last_name]': TONY.lastName, 'applicant[email]': TONY.email,
    'applicant[phone]':     TONY.phone,
  };

  for (const [key, val] of Object.entries(identity)) {
    if (fields.some(f => f.id === key || f.name === key)) {
      answers[key] = val;
    }
  }
  return answers;
}

// ─── Fill one field ───────────────────────────────────────────────────────────

async function fillField(page, field, value, resumePdf, coverTxt, num) {
  if (!value || value === '') return;

  const selector = field.id
    ? `#${CSS.escape ? CSS.escape(field.id) : field.id}`
    : `[name="${field.name}"]`;

  try {
    if (field.type === 'file') {
      const isResume = /resume|cv/i.test(field.label + field.id + field.name);
      const isCL     = /cover.?letter|cover_letter/i.test(field.label + field.id + field.name);
      if (isResume && value === 'FILE_UPLOAD_RESUME') {
        const el = page.locator(`${selector}, [name="${field.name}"]`).first();
        await el.setInputFiles(resumePdf);
        logDetail(num, `Uploaded resume PDF`);
      } else if (isCL && value === 'FILE_UPLOAD_COVER_LETTER') {
        const el = page.locator(`${selector}, [name="${field.name}"]`).first();
        await el.setInputFiles(coverTxt);
        logDetail(num, `Uploaded cover letter`);
      }
    } else if (field.type === 'select') {
      const el = page.locator(`${selector}, select[name="${field.name}"]`).first();
      await el.selectOption({ label: value }).catch(() => el.selectOption(value)).catch(() => {});
    } else if (field.type === 'checkbox') {
      if (value === 'CHECK') {
        const el = page.locator(`${selector}`).first();
        const checked = await el.isChecked().catch(() => false);
        if (!checked) await el.check();
      }
    } else if (field.type === 'radio') {
      const radios = page.locator(`[name="${field.name}"]`);
      const count = await radios.count();
      for (let i = 0; i < count; i++) {
        const r = radios.nth(i);
        const v = await r.getAttribute('value').catch(() => '');
        if (v && v.toLowerCase() === String(value).toLowerCase()) {
          await r.check();
          break;
        }
      }
    } else {
      // text, email, tel, number, textarea
      const el = page.locator(`${selector}, [name="${field.name}"]`).first();
      await el.fill(String(value));
    }
  } catch (err) {
    logDetail(num, `Field fill failed [${field.label || field.id}]: ${err.message}`);
  }
}

// ─── Navigate to application form ─────────────────────────────────────────────

async function navigateToForm(page, context, url, ats) {
  // ── ATS-specific direct form URLs ──────────────────────────────────────────
  // Ashby: job listing is /{id}, application form is /{id}/application
  if (ats === 'ashby' && !/\/application$/.test(url)) {
    const formUrl = url.replace(/\/$/, '') + '/application';
    logDetail('nav', `Ashby: navigating directly to application form: ${formUrl}`);
    await page.goto(formUrl, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForTimeout(2000);
    return page;
  }

  // Greenhouse: /jobs/{id} → /jobs/{id}/apply or click Apply
  if (ats === 'greenhouse' && !/\/apply$/.test(url)) {
    const applyUrl = url.replace(/\/$/, '') + '/apply';
    logDetail('nav', `Greenhouse: trying direct apply URL: ${applyUrl}`);
    await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1500);
    // If that landed on a 404-like page, fall through to button-click
    const hasForm = await page.$('form, [role="form"]') !== null;
    if (hasForm) return page;
    // Fall through to button-click path
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1500);
  } else {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1500);
  }

  // ── Generic: look for Apply button and click it ────────────────────────────
  const applySelectors = [
    'a[href*="/applications/new"]',
    'a[href*="?gh_src"]',
    'a:has-text("Apply for this job")',
    'a:has-text("Apply Now")',
    'button:has-text("Apply for this job")',
    'button:has-text("Apply Now")',
    'button:has-text("Apply")',
    '.apply-button',
    '#apply-button',
    '[data-mapped="true"] a',
  ];

  for (const sel of applySelectors) {
    const btn = page.locator(sel).first();
    if (await btn.count() > 0) {
      const href = await btn.getAttribute('href').catch(() => null);
      logDetail('nav', `Found Apply button [${sel}]${href ? ` → ${href}` : ''}`);

      // Handle new tab
      const [newPage] = await Promise.all([
        context.waitForEvent('page', { timeout: 5_000 }).catch(() => null),
        btn.click({ timeout: 5_000 }).catch(() => {}),
      ]);

      if (newPage) {
        await newPage.waitForLoadState('domcontentloaded');
        await newPage.waitForTimeout(2000);
        return newPage;
      }

      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(2000);
      break;
    }
  }

  return page;
}

// ─── Apply to one package ─────────────────────────────────────────────────────

async function applyToPackage(candidate) {
  const { num, packageNum, company, role, score } = candidate;
  const tag = packageNum === num ? num : `${packageNum}/tracker#${num}`;
  log(`[${tag}] ${company} — ${role} (${score}/5)`);

  // 1. Find package (by report/package number, NOT tracker #)
  const pkgDir = findPackageDir(packageNum);
  if (!pkgDir) {
    log(`[${tag}] No package directory — skipping`, 'WARN');
    return { num, packageNum, status: 'skipped', reason: 'no package dir' };
  }

  const pkg = readPackage(pkgDir);
  if (!pkg?.url) {
    log(`[${tag}] No URL in package context — skipping`, 'WARN');
    return { num, packageNum, status: 'skipped', reason: 'no url' };
  }

  const ats    = detectAts(pkg.url);
  const jobCtx = `${company} — ${role} (Score: ${score}/5)`;
  logDetail(packageNum, `ATS: ${ats} | URL: ${pkg.url}`);

  // 2. Ensure resume PDF
  let resumePdf;
  try { resumePdf = ensureResumePdf(); } catch (err) {
    log(`[${tag}] Resume PDF unavailable: ${err.message}`, 'ERROR');
    return { num, packageNum, status: 'error', reason: err.message };
  }

  const coverTxt = writeCoverLetterFile(packageNum, pkg.coverLetter || '');

  // 3. Launch browser
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  let browser;
  let activePage;

  try {
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();

    // 4. Navigate (handles Apply button + new tab)
    activePage = await navigateToForm(page, context, pkg.url, ats);

    // 5. Check for form
    const hasForm = await activePage.$('form, [role="form"]') !== null;
    if (!hasForm) {
      await browser.close();
      log(`[${tag}] No form found on page — skipping`, 'WARN');
      return { num, packageNum, status: 'skipped', reason: 'no fillable form found' };
    }

    // 6. Extract fields
    const fields = await extractFields(activePage);
    if (fields.length === 0) {
      await browser.close();
      log(`[${tag}] No input fields detected — skipping`, 'WARN');
      return { num, packageNum, status: 'skipped', reason: 'no input fields' };
    }

    logDetail(packageNum, `${fields.length} fields: ${fields.slice(0, 5).map(f => f.label || f.id).join(', ')}${fields.length > 5 ? '…' : ''}`);

    // 7. Generate answers via Kimi (soft-fail in dry-run when key missing)
    let answers;
    const hasKimiKey = !!process.env.KIMI_API_KEY;
    if (!hasKimiKey && DRY_RUN) {
      logDetail(packageNum, 'KIMI_API_KEY not set — dry-run will show identity-only fields');
      answers = {};
    } else {
      try {
        answers = await generateAnswers(fields, pkg, jobCtx);
      } catch (err) {
        await browser.close();
        log(`[${tag}] Kimi fill generation failed: ${err.message}`, 'ERROR');
        return { num, packageNum, status: 'error', reason: err.message };
      }
    }

    // Hardcoded identity overrides
    answers = mergeIdentity(answers, fields);

    logDetail(packageNum, `Generated ${Object.keys(answers).length} answers`);

    if (DRY_RUN) {
      log(`[${tag}] DRY RUN — would fill ${fields.length} fields (${Object.keys(answers).length} have values):`);
      for (const [k, v] of Object.entries(answers)) {
        const f = fields.find(f => f.id === k || f.name === k);
        const label = f?.label || k;
        log(`    ${label}: ${String(v).slice(0, 80)}`);
      }
      await browser.close();
      return { num, packageNum, status: 'dry-run', company, role, fieldsCount: fields.length };
    }

    // 8. Fill fields
    const filledLog = {};
    for (const field of fields) {
      const value = answers[field.id] ?? answers[field.name];
      if (value === undefined || value === null || value === '') continue;
      await fillField(activePage, field, value, resumePdf, coverTxt, packageNum);
      filledLog[field.label || field.id] = String(value).slice(0, 100);
    }

    // 9. Kimi pre-submit review
    if (!NO_REVIEW) {
      try {
        const review = await reviewApplication(filledLog, jobCtx, pkg);
        logDetail(packageNum, `Review: ${review.approved ? 'APPROVED' : `FLAGGED — ${review.reason}`}`);
        if (!review.approved) {
          await browser.close();
          log(`[${tag}] Flagged by AI review: ${review.reason}`, 'WARN');
          return { num, packageNum, status: 'flagged', reason: review.reason };
        }
        log(`[${tag}] AI review: APPROVED`);
      } catch (err) {
        logDetail(packageNum, `Review failed (proceeding): ${err.message}`);
      }
    }

    // 10. Submit
    const submitSelectors = [
      '#submit_app',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit Application")',
      'button:has-text("Submit")',
      'button:has-text("Send Application")',
      'button:has-text("Apply")',
      '[data-submit="true"]',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = activePage.locator(sel).last();
      if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 10_000 });
        await activePage.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
        submitted = true;
        break;
      }
    }

    if (!submitted) {
      await browser.close();
      log(`[${tag}] Submit button not found`, 'WARN');
      return { num, packageNum, status: 'skipped', reason: 'submit button not found' };
    }

    // 11. Verify confirmation
    await activePage.waitForTimeout(2000);
    const bodyText = await activePage.textContent('body').catch(() => '');
    const confirmed = /thank you|application received|we.ve received|successfully submitted|your application/i.test(bodyText);

    if (!confirmed) {
      logDetail(packageNum, 'No confirmation text found — submission may have failed');
    }

    await browser.close();

    // 12. Update tracker (uses tracker # to find the row)
    updateTrackerStatus(num, 'Applied');

    log(`[${tag}] ✓ Applied → ${company} — ${role}${confirmed ? ' (confirmed)' : ' (unverified)'}`);
    return { num, packageNum, status: 'applied', company, role, confirmed };

  } catch (err) {
    try { await browser?.close(); } catch { /* ignore */ }
    log(`[${tag}] Error: ${err.message}`, 'ERROR');
    logDetail(packageNum, `Stack: ${err.stack}`);
    return { num, packageNum, status: 'error', reason: err.message };
  }
}

// ─── Tracker update ───────────────────────────────────────────────────────────

function updateTrackerStatus(num, newStatus) {
  if (!existsSync(TRACKER_FILE)) return;

  const numPadded = num.padStart(3, '0');
  const numInt    = String(parseInt(numPadded, 10));

  const updated = readFileSync(TRACKER_FILE, 'utf8').split('\n').map(line => {
    if (!line.startsWith('|')) return line;
    const cells = line.split('|');
    if (cells.length < 8) return line;
    const rowNum = cells[1]?.trim();
    if (rowNum !== numPadded && rowNum !== numInt) return line;
    // | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
    //   1    2       3        4      5       6        7     8        9
    cells[6] = ` ${newStatus} `;
    return cells.join('|');
  }).join('\n');

  writeFileSync(TRACKER_FILE, updated, 'utf8');
  log(`[${num}] Tracker → ${newStatus}`);
}

// ─── Worker pool ──────────────────────────────────────────────────────────────

async function runPool(items, concurrency, fn) {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await fn(items[i], i); }
      catch (err) { results[i] = { error: err.message, item: items[i] }; }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const bar = '─'.repeat(58);
  console.log(`\n┌${bar}┐\n│  Auto-Apply Engine — Phase 8${' '.repeat(29)}│\n└${bar}┘`);
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE SUBMIT'} | Threshold: ${THRESHOLD}/5 | Workers: ${WORKERS} | Review: ${NO_REVIEW ? 'off' : 'on'}`);

  // Ensure resume PDF is ready upfront
  try { ensureResumePdf(); } catch (err) {
    log(`Resume PDF: ${err.message} (will retry per application)`, 'WARN');
  }

  // Discover candidates
  let candidates = findEvaluatedEntries();

  if (ONLY_NUM) {
    const target = ONLY_NUM.padStart(3, '0');
    // Match on package # (preferred) or tracker # (fallback) so users can pass
    // either "062" (package directory) or "73" (tracker row).
    candidates = candidates.filter(c => c.packageNum === target || c.num === target);
    if (candidates.length === 0) {
      log(`No Evaluated entry found for #${target} above threshold ${THRESHOLD}`);
      return;
    }
  }

  if (candidates.length === 0) {
    log(`No "Evaluated" packages found with score >= ${THRESHOLD}`);
    console.log(JSON.stringify({ status: 'done', applied: 0, skipped: 0, flagged: 0, errors: 0 }));
    return;
  }

  log(`${candidates.length} candidate(s) to process`);

  const results = await runPool(candidates, WORKERS, (c, i) =>
    // Stagger starts to avoid bot detection
    new Promise(r => setTimeout(r, i * 3000)).then(() => applyToPackage(c))
  );

  const applied  = results.filter(r => r?.status === 'applied').length;
  const skipped  = results.filter(r => r?.status === 'skipped').length;
  const flagged  = results.filter(r => r?.status === 'flagged').length;
  const errors   = results.filter(r => r?.status === 'error' || r?.error).length;
  const dryRuns  = results.filter(r => r?.status === 'dry-run').length;

  console.log(`\n┌${bar}┐\n│  Auto-Apply Summary${' '.repeat(38)}│\n└${bar}┘`);
  log(`Applied: ${applied} | Skipped: ${skipped} | Flagged: ${flagged} | Errors: ${errors}${dryRuns ? ` | Dry-runs: ${dryRuns}` : ''}`);

  if (flagged > 0) log(`${flagged} application(s) flagged by AI review — check batch/logs/apply-*-${TODAY}.log`, 'WARN');

  console.log(JSON.stringify({ status: 'done', applied, skipped, flagged, errors, dryRuns }));
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
