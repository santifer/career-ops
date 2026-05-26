#!/usr/bin/env node

/**
 * apply-orchestrator.mjs — Shared apply pipeline for auto-apply + Telegram reply
 *
 * Encapsulates: evaluate → generate CV/CL → apply-auto.mjs → tracker update.
 * Called by auto-pipeline.mjs (tier 1: score ≥ threshold) and
 * telegram-listener.mjs (tier 2: Patrick replies "apply #N").
 *
 * Usage (standalone):
 *   node apply-orchestrator.mjs --url <url> --dry-run
 *   node apply-orchestrator.mjs --url <url> --submit
 *
 * As a module:
 *   import { runApplyPipeline, evaluateAndMaybeApply } from './apply-orchestrator.mjs';
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { loadEnv } from './lib/telegram.mjs';

const PROJECT_DIR = resolve(import.meta.dirname || '.');
const REPORTS_DIR = join(PROJECT_DIR, 'reports');
const OUTPUT_DIR = join(PROJECT_DIR, 'output');
const COVER_LETTERS_DIR = join(PROJECT_DIR, 'output/cover-letters');
const TRACKER_DIR = join(PROJECT_DIR, 'batch/tracker-additions');
const TRACKER_FILE = join(PROJECT_DIR, 'data/applications.md');
const PROFILE_PATH = join(PROJECT_DIR, 'config/profile.yml');

// ── Config reader ────────────────────────────────────────────────────

function readProfile() {
  if (!existsSync(PROFILE_PATH)) return {};
  const raw = readFileSync(PROFILE_PATH, 'utf-8');
  // Minimal YAML parse for the fields we need
  const get = (key) => {
    const m = raw.match(new RegExp(`^\\s*${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'));
    return m ? m[1] : '';
  };
  return {
    full_name: get('full_name'),
    email: get('email'),
    phone: get('phone'),
    location: get('location'),
    linkedin: get('linkedin'),
    portfolio_url: get('portfolio_url'),
    auto_apply_threshold: parseFloat(get('auto_apply_threshold')) || 4.5,
    auto_apply_enabled: get('auto_apply_enabled') !== 'false',
    apply_threshold: parseFloat(get('apply_threshold')) || 4.0,
  };
}

// ── Report reader ────────────────────────────────────────────────────

function findReportForUrl(url) {
  if (!existsSync(REPORTS_DIR)) return null;
  for (const file of readdirSync(REPORTS_DIR).sort().reverse()) {
    if (!file.endsWith('.md')) continue;
    const content = readFileSync(join(REPORTS_DIR, file), 'utf-8');
    if (content.includes(url)) {
      const scoreMatch = content.match(/\*\*Score:\*\*\s*([0-9.]+)\/5/);
      const headerMatch = content.match(/# (?:Evaluation|Evaluación):\s*(.+?)\s*[—–-]\s*(.+)/);
      const numMatch = file.match(/^(\d+)/);
      return {
        file,
        path: join(REPORTS_DIR, file),
        score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
        company: headerMatch ? headerMatch[1].trim() : 'Unknown',
        role: headerMatch ? headerMatch[2].trim() : 'Unknown',
        num: numMatch ? numMatch[1] : '000',
      };
    }
  }
  return null;
}

function nextReportNum() {
  let max = 0;
  if (existsSync(REPORTS_DIR)) {
    for (const f of readdirSync(REPORTS_DIR)) {
      const m = f.match(/^(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return String(max + 1).padStart(3, '0');
}

// ── Tracker helpers ──────────────────────────────────────────────────

function isAlreadyApplied(url) {
  if (!existsSync(TRACKER_FILE)) return false;
  const content = readFileSync(TRACKER_FILE, 'utf-8');
  return content.includes(url) && content.includes('Applied');
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Detect platform ──────────────────────────────────────────────────

function detectPlatform(url) {
  if (/jobs\.ashbyhq\.com/i.test(url)) return 'ashby';
  if (/stripe\.com\/jobs/i.test(url)) return 'stripe';
  if (/boards\.greenhouse\.io/i.test(url)) return 'greenhouse';
  if (/jobs\.lever\.co/i.test(url)) return 'lever';
  return 'generic';
}

// ── Core pipeline ────────────────────────────────────────────────────

/**
 * Run the full apply pipeline for a single job.
 *
 * @param {object} opts
 * @param {string} opts.url — Job posting URL
 * @param {string} [opts.company] — Company name (extracted from report if not provided)
 * @param {string} [opts.role] — Role title (extracted from report if not provided)
 * @param {number} [opts.score] — Score (extracted from report if not provided)
 * @param {string} [opts.reportPath] — Path to existing report (skips evaluation)
 * @param {string} [opts.reportNum] — Report number
 * @param {boolean} [opts.dryRun=false] — Print what would happen, don't execute
 * @param {boolean} [opts.submit=true] — Pass --submit to apply-auto.mjs
 * @returns {Promise<{success: boolean, pdfPath?: string, coverLetterPath?: string, screenshotPath?: string, error?: string}>}
 */
export async function runApplyPipeline(opts) {
  const {
    url,
    dryRun = false,
    submit = true,
  } = opts;
  let { company, role, score, reportPath, reportNum } = opts;

  const today = new Date().toISOString().slice(0, 10);
  const platform = detectPlatform(url);

  // Check if already applied
  if (isAlreadyApplied(url)) {
    return { success: false, error: `Already applied to ${url}` };
  }

  // Find or use existing report
  if (!reportPath) {
    const existing = findReportForUrl(url);
    if (existing) {
      reportPath = existing.path;
      company = company || existing.company;
      role = role || existing.role;
      score = score || existing.score;
      reportNum = reportNum || existing.num;
    } else {
      return { success: false, error: `No evaluation report found for ${url}. Run evaluation first.` };
    }
  }

  const slug = slugify(company || 'unknown');
  const pdfName = `cv-patrick-moore-${slug}-${today}.pdf`;
  const pdfPath = join(OUTPUT_DIR, pdfName);
  const clName = `cl-${slug}-${today}.md`;
  const clPath = join(COVER_LETTERS_DIR, clName);
  const screenshotPath = join(OUTPUT_DIR, `apply-screenshot-${slug}-${today}.png`);

  console.log(`\n📋 Apply pipeline: ${company} — ${role} (${score}/5)`);
  console.log(`   Platform: ${platform}`);
  console.log(`   URL: ${url}`);

  if (dryRun) {
    console.log('   [DRY RUN] Would generate CV, cover letter, and submit application.');
    return { success: true, pdfPath, coverLetterPath: clPath, screenshotPath };
  }

  // Step 1: Generate tailored CV PDF (if not already exists)
  if (!existsSync(pdfPath)) {
    console.log('   Step 1: Generating tailored CV PDF...');
    try {
      const cvPrompt = `Generate a tailored CV for Patrick Moore for this role:
Company: ${company}
Role: ${role}
Report: ${reportPath}

Read cv.md for the base CV content.
Read modes/pdf.md for the PDF generation instructions.
Read modes/_profile.md for Patrick's narrative framing.
Read the evaluation report at ${reportPath} for match analysis.

Generate the tailored HTML CV and save it as a PDF using:
  node generate-pdf.mjs <html-file> ${pdfPath}

IMPORTANT: The output PDF must be saved at exactly: ${pdfPath}`;

      execSync(`claude -p --dangerously-skip-permissions "${cvPrompt.replace(/"/g, '\\"')}"`, {
        cwd: PROJECT_DIR,
        timeout: 180000, // 3 min
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (existsSync(pdfPath)) {
        console.log(`   ✅ CV PDF: ${pdfName}`);
      } else {
        console.log('   ⚠️  CV generation completed but PDF not found. Using most recent CV...');
        // Fall back to most recent CV PDF
        const existingPdfs = existsSync(OUTPUT_DIR) ?
          readdirSync(OUTPUT_DIR).filter(f => f.startsWith('cv-') && f.endsWith('.pdf')).sort().reverse() : [];
        if (existingPdfs.length > 0) {
          const fallback = join(OUTPUT_DIR, existingPdfs[0]);
          console.log(`   Using fallback: ${existingPdfs[0]}`);
          // We'll use the fallback path below
        }
      }
    } catch (err) {
      console.error(`   ❌ CV generation failed: ${err.message?.slice(0, 100)}`);
    }
  } else {
    console.log(`   Step 1: CV PDF already exists: ${pdfName}`);
  }

  // Step 2: Generate cover letter (if not already exists)
  if (!existsSync(clPath)) {
    console.log('   Step 2: Generating cover letter...');
    try {
      const clPrompt = `Generate a cover letter for Patrick Moore for this role:
Company: ${company}
Role: ${role}
URL: ${url}

Read the evaluation report at: ${reportPath}
Read cv.md for proof points.
Read article-digest.md for detailed proof points.
Read modes/_profile.md "Writing Style" section for voice rules.
Read modes/cover-letter.md for the full cover letter mode instructions.

Output ONLY the cover letter in the format specified in modes/cover-letter.md.
Save it to: ${clPath}

IMPORTANT: Follow Patrick's voice rules EXACTLY. No corporate speak. No "leveraging."
Short punchy sentences. Concrete specifics. Casual confidence. 75-120 words, 5-6 sentences.`;

      mkdirSync(COVER_LETTERS_DIR, { recursive: true });
      execSync(`claude -p --dangerously-skip-permissions "${clPrompt.replace(/"/g, '\\"')}"`, {
        cwd: PROJECT_DIR,
        timeout: 120000, // 2 min
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (existsSync(clPath)) {
        console.log(`   ✅ Cover letter: ${clName}`);
      } else {
        console.log('   ⚠️  Cover letter generation completed but file not found.');
      }
    } catch (err) {
      console.error(`   ❌ Cover letter failed: ${err.message?.slice(0, 100)}`);
    }
  } else {
    console.log(`   Step 2: Cover letter already exists: ${clName}`);
  }

  // Find the actual PDF to use (generated or fallback)
  let actualPdf = pdfPath;
  if (!existsSync(pdfPath)) {
    const existingPdfs = existsSync(OUTPUT_DIR) ?
      readdirSync(OUTPUT_DIR).filter(f => f.startsWith('cv-') && f.endsWith('.pdf')).sort().reverse() : [];
    if (existingPdfs.length > 0) {
      actualPdf = join(OUTPUT_DIR, existingPdfs[0]);
    } else {
      return { success: false, error: 'No CV PDF available. Generate one first.' };
    }
  }

  // Step 3: Run apply-auto.mjs
  console.log(`   Step 3: Filling application form (${platform})...`);
  try {
    const applyArgs = [
      'apply-auto.mjs',
      url,
      actualPdf,
      `--screenshot=${screenshotPath}`,
    ];
    if (submit) applyArgs.push('--submit');
    if (existsSync(clPath)) applyArgs.push(`--cover-letter=${clPath}`);

    // Check for auth state
    const authPaths = [
      join(PROJECT_DIR, 'auth/linkedin-state.json'),
      join(PROJECT_DIR, 'auth/browser-state.json'),
    ];
    for (const auth of authPaths) {
      if (existsSync(auth)) {
        applyArgs.push(`--auth=${auth}`);
        break;
      }
    }

    const result = spawnSync('node', applyArgs, {
      cwd: PROJECT_DIR,
      timeout: 300000, // 5 min
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status === 0) {
      console.log('   ✅ Application submitted successfully');
    } else {
      const stderr = (result.stderr || '').trim();
      const stdout = (result.stdout || '').trim();

      // Check for CAPTCHA or known failures
      if (/captcha|recaptcha|hcaptcha|turnstile/i.test(stderr + stdout)) {
        return {
          success: false,
          error: `CAPTCHA detected on ${platform}. Apply manually: ${url}`,
          screenshotPath: existsSync(screenshotPath) ? screenshotPath : undefined,
        };
      }

      return {
        success: false,
        error: `apply-auto.mjs exited with code ${result.status}: ${stderr.slice(0, 200)}`,
        screenshotPath: existsSync(screenshotPath) ? screenshotPath : undefined,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `apply-auto.mjs error: ${err.message?.slice(0, 200)}`,
      screenshotPath: existsSync(screenshotPath) ? screenshotPath : undefined,
    };
  }

  // Step 4: Update tracker
  console.log('   Step 4: Updating tracker...');
  try {
    mkdirSync(TRACKER_DIR, { recursive: true });
    const tsvLine = [
      reportNum || nextReportNum(),
      today,
      company,
      role,
      'Applied',
      `${score}/5`,
      '✅',
      `[${reportNum}](reports/${reportNum}-${slug}-${today}.md)`,
      `Auto-applied ${today} via apply-orchestrator (${platform}); score ${score}/5`,
    ].join('\t');

    const tsvPath = join(TRACKER_DIR, `${reportNum}-${slug}.tsv`);
    writeFileSync(tsvPath, tsvLine + '\n');
    console.log(`   ✅ Tracker TSV written: ${tsvPath}`);

    // Run merge
    execSync('node merge-tracker.mjs', {
      cwd: PROJECT_DIR,
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log('   ✅ Tracker merged');
  } catch (err) {
    console.error(`   ⚠️  Tracker update failed: ${err.message?.slice(0, 100)}`);
  }

  return {
    success: true,
    pdfPath: existsSync(actualPdf) ? actualPdf : undefined,
    coverLetterPath: existsSync(clPath) ? clPath : undefined,
    screenshotPath: existsSync(screenshotPath) ? screenshotPath : undefined,
  };
}

/**
 * Evaluate a job URL and auto-apply if score meets threshold.
 *
 * @param {object} opts
 * @param {string} opts.url — Job posting URL
 * @param {string} [opts.company] — Company name hint
 * @param {string} [opts.title] — Role title hint
 * @param {boolean} [opts.dryRun=false]
 * @returns {Promise<{score: number, applied: boolean, report?: string, error?: string}>}
 */
export async function evaluateAndMaybeApply(opts) {
  const { url, company, title, dryRun = false } = opts;
  const profile = readProfile();

  // Check if already evaluated
  const existing = findReportForUrl(url);
  if (existing) {
    console.log(`Already evaluated: ${existing.company} — ${existing.role} (${existing.score}/5)`);

    if (existing.score >= profile.auto_apply_threshold && profile.auto_apply_enabled) {
      console.log(`Score ${existing.score} >= ${profile.auto_apply_threshold} threshold — auto-applying...`);
      const result = await runApplyPipeline({
        url,
        company: existing.company,
        role: existing.role,
        score: existing.score,
        reportPath: existing.path,
        reportNum: existing.num,
        dryRun,
      });
      return { score: existing.score, applied: result.success, report: existing.path, error: result.error };
    }

    return { score: existing.score, applied: false, report: existing.path };
  }

  // Run evaluation via claude -p
  const reportNum = nextReportNum();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`Evaluating: ${company || 'Unknown'} — ${title || 'Unknown'}...`);

  if (dryRun) {
    console.log('[DRY RUN] Would evaluate and potentially auto-apply.');
    return { score: 0, applied: false };
  }

  const evalPrompt = `Evaluate this job offer using the full career-ops pipeline.

URL: ${url}
Report number: ${reportNum}
Date: ${today}

Follow the instructions in modes/oferta.md for the A-G evaluation.
Read cv.md, article-digest.md, modes/_shared.md, and modes/_profile.md.
Save the report to: reports/${reportNum}-{company-slug}-${today}.md
Write the tracker TSV to: batch/tracker-additions/${reportNum}-{company-slug}.tsv

IMPORTANT: Include **Score:** and **URL:** headers in the report.`;

  try {
    execSync(`claude -p --dangerously-skip-permissions "${evalPrompt.replace(/"/g, '\\"')}"`, {
      cwd: PROJECT_DIR,
      timeout: 300000, // 5 min
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    return { score: 0, applied: false, error: `Evaluation failed: ${err.message?.slice(0, 200)}` };
  }

  // Read the result
  const report = findReportForUrl(url);
  if (!report) {
    return { score: 0, applied: false, error: 'Evaluation completed but no report found.' };
  }

  console.log(`Evaluation complete: ${report.company} — ${report.role} (${report.score}/5)`);

  // Auto-apply gate
  if (report.score >= profile.auto_apply_threshold && profile.auto_apply_enabled) {
    console.log(`Score ${report.score} >= ${profile.auto_apply_threshold} threshold — auto-applying...`);
    const result = await runApplyPipeline({
      url,
      company: report.company,
      role: report.role,
      score: report.score,
      reportPath: report.path,
      reportNum: report.num,
    });
    return { score: report.score, applied: result.success, report: report.path, error: result.error };
  }

  return { score: report.score, applied: false, report: report.path };
}

// ── CLI entry point ──────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('apply-orchestrator.mjs')) {
  const args = process.argv.slice(2);
  const urlArg = args.find(a => a.startsWith('--url='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');
  const submit = args.includes('--submit');

  if (!urlArg) {
    console.log('Usage: node apply-orchestrator.mjs --url <url> [--submit] [--dry-run]');
    process.exit(1);
  }

  evaluateAndMaybeApply({ url: urlArg, dryRun })
    .then(result => {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      process.exit(result.error ? 1 : 0);
    })
    .catch(err => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}
