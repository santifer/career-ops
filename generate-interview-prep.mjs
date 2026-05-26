#!/usr/bin/env node

/**
 * generate-interview-prep.mjs — Auto-generate interview prep docs
 *
 * Triggered when an application status changes to "Responded" or "Interview".
 * Reads the evaluation report, invokes Claude headless to run the interview-prep
 * mode, and notifies via Telegram.
 *
 * Usage:
 *   node generate-interview-prep.mjs --num 8               # generate prep for application #8
 *   node generate-interview-prep.mjs --company WorkOS      # match by company name
 *   node generate-interview-prep.mjs --check               # scan tracker for new Interview/Responded entries without prep
 *   node generate-interview-prep.mjs --dry-run             # show what would generate, don't execute
 *
 * Designed to run:
 *   - Manually: after updating status to "Interview" or "Responded"
 *   - Via telegram-listener: when "interview #N" command is received
 *   - Via daily cron: with --check flag to catch manual status edits
 *
 * Config (.env):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (optional — skips notify if missing)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { loadTelegramConfig, sendMessage } from './lib/telegram.mjs';

const PROJECT_DIR = resolve(import.meta.dirname || '.');
const TRACKER_FILE = join(PROJECT_DIR, 'data/applications.md');
const REPORTS_DIR = join(PROJECT_DIR, 'reports');
const PREP_DIR = join(PROJECT_DIR, 'interview-prep');
const CV_FILE = join(PROJECT_DIR, 'cv.md');
const PROFILE_FILE = join(PROJECT_DIR, 'config/profile.yml');
const STORY_BANK = join(PROJECT_DIR, 'interview-prep/story-bank.md');
const INTERVIEW_MODE = join(PROJECT_DIR, 'modes/interview-prep.md');

// ── Parse args ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CHECK_MODE = args.includes('--check');

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const targetNum = getArgValue('--num') ? parseInt(getArgValue('--num')) : null;
const targetCompany = getArgValue('--company');

// ── Tracker parser ───────────────────────────────────────────────────

function parseTrackerRows() {
  if (!existsSync(TRACKER_FILE)) return [];

  const content = readFileSync(TRACKER_FILE, 'utf-8');
  const rows = [];

  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || line.includes('---') || line.includes('Date')) continue;

    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 9) continue;

    const [num, date, company, role, score, status, pdf, report, notes] = cells;
    rows.push({
      num: parseInt(num),
      date,
      company,
      role,
      score,
      status,
      report,
      notes,
      raw: line,
    });
  }

  return rows;
}

// ── Check which rows need prep ───────────────────────────────────────

function getExistingPrepFiles() {
  if (!existsSync(PREP_DIR)) return [];
  return readdirSync(PREP_DIR).filter(f => f.endsWith('.md') && f !== 'story-bank.md');
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function hasPrepFile(company, role) {
  const existing = getExistingPrepFiles();
  const companySlug = slugify(company);
  // Check if any existing prep file matches this company
  return existing.some(f => f.includes(companySlug));
}

function getReportPath(reportCell) {
  // reportCell looks like: [008](reports/008-workos-detection-response-2026-05-25.md)
  const match = reportCell.match(/\(([^)]+)\)/);
  if (!match) return null;
  const relPath = match[1];
  const fullPath = join(PROJECT_DIR, relPath);
  return existsSync(fullPath) ? fullPath : null;
}

// ── Interview prep generation ────────────────────────────────────────

function buildPrompt(row, reportContent) {
  const cv = existsSync(CV_FILE) ? readFileSync(CV_FILE, 'utf-8') : '';
  const storyBank = existsSync(STORY_BANK) ? readFileSync(STORY_BANK, 'utf-8') : '';
  const mode = existsSync(INTERVIEW_MODE) ? readFileSync(INTERVIEW_MODE, 'utf-8') : '';

  const outputFile = `interview-prep/${slugify(row.company)}-${slugify(row.role)}.md`;

  return `You are generating an interview prep document for a specific company and role.

COMPANY: ${row.company}
ROLE: ${row.role}
SCORE: ${row.score}
DATE APPLIED: ${row.date}

--- EVALUATION REPORT ---
${reportContent}

--- CANDIDATE CV ---
${cv.slice(0, 4000)}

--- STORY BANK ---
${storyBank.slice(0, 3000)}

--- INTERVIEW PREP MODE INSTRUCTIONS ---
${mode}

--- INSTRUCTIONS ---
Generate a complete interview prep document following the mode instructions above.
Focus on actionable, specific preparation — not generic advice.
The candidate is Patrick Moore, Denver-based, security + AI + healthcare background.

Key things to include:
1. Company research summary (what they do, recent news, tech stack)
2. Likely interview process and rounds
3. Top 10 questions they'll probably ask (with suggested answers from CV/report)
4. Story bank mapping (which STAR stories from the story bank fit which questions)
5. Technical prep checklist (based on JD requirements)
6. Questions Patrick should ask them
7. Red flags / things to address proactively (gaps noted in the evaluation)

Output the full markdown document. Start with:
# Interview Intel: ${row.company} — ${row.role}

Save nothing — just output the complete markdown.`;
}

async function generatePrep(row) {
  const reportPath = getReportPath(row.report);
  if (!reportPath) {
    console.log(`  ⚠️  No report found for #${row.num} ${row.company}. Skipping.`);
    return null;
  }

  const reportContent = readFileSync(reportPath, 'utf-8');
  const prompt = buildPrompt(row, reportContent);
  const outputSlug = `${slugify(row.company)}-${slugify(row.role)}`;
  const outputPath = join(PREP_DIR, `${outputSlug}.md`);

  console.log(`  📝 Generating interview prep for ${row.company} — ${row.role}...`);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would generate: ${outputPath}`);
    console.log(`  [DRY RUN] Prompt length: ${prompt.length} chars`);
    return outputPath;
  }

  try {
    // Use claude -p for headless generation
    const result = execFileSync('claude', ['-p', prompt], {
      cwd: PROJECT_DIR,
      encoding: 'utf-8',
      timeout: 120_000, // 2 min max
      maxBuffer: 1024 * 1024, // 1MB output buffer
    });

    // Extract just the markdown content (strip any preamble)
    let content = result;
    const mdStart = content.indexOf('# Interview Intel:');
    if (mdStart > 0) {
      content = content.slice(mdStart);
    }

    // Add metadata header if not present
    if (!content.includes('**Researched:**')) {
      const today = new Date().toISOString().slice(0, 10);
      const header = `# Interview Intel: ${row.company} — ${row.role}\n\n**Report:** ${row.report}\n**Researched:** ${today}\n**Auto-generated:** Yes (generate-interview-prep.mjs)\n\n---\n\n`;
      if (content.startsWith('# Interview Intel:')) {
        // Replace the first line with our enriched header
        content = header + content.split('\n').slice(1).join('\n');
      } else {
        content = header + content;
      }
    }

    mkdirSync(PREP_DIR, { recursive: true });
    writeFileSync(outputPath, content);
    console.log(`  ✅ Saved: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error(`  ❌ Generation failed: ${err.message?.slice(0, 200)}`);
    return null;
  }
}

// ── Telegram notification ────────────────────────────────────────────

async function notifyTelegram(row, prepPath) {
  const config = loadTelegramConfig(join(PROJECT_DIR, '.env'));
  if (!config.token || !config.chatId) return;

  let msg = `<b>📋 Interview prep ready</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `<b>#${row.num} ${row.company}</b> — ${row.role}\n`;
  msg += `Score: ${row.score} | Status: ${row.status}\n\n`;
  msg += `<i>Prep doc generated. Key areas:\n`;
  msg += `• Company research + recent signals\n`;
  msg += `• Likely questions + suggested answers\n`;
  msg += `• Story bank mapping\n`;
  msg += `• Technical prep checklist</i>\n\n`;
  msg += `Review on MacBook: <code>interview-prep/${prepPath ? prepPath.split('/').pop() : '?'}</code>`;

  try {
    await sendMessage(config, config.chatId, msg);
    console.log(`  📱 Telegram notification sent`);
  } catch (err) {
    console.error(`  ⚠️  Telegram notify failed: ${err.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const rows = parseTrackerRows();

  if (rows.length === 0) {
    console.log('No applications in tracker.');
    return;
  }

  let targets = [];

  if (targetNum) {
    // Generate prep for specific application number
    const row = rows.find(r => r.num === targetNum);
    if (!row) {
      console.error(`❌ No application #${targetNum} in tracker.`);
      process.exit(1);
    }
    targets = [row];
  } else if (targetCompany) {
    // Match by company name (case-insensitive)
    targets = rows.filter(r =>
      r.company.toLowerCase().includes(targetCompany.toLowerCase()) &&
      ['Responded', 'Interview', 'Applied'].includes(r.status)
    );
    if (targets.length === 0) {
      console.error(`❌ No matching applications for "${targetCompany}".`);
      process.exit(1);
    }
  } else if (CHECK_MODE) {
    // Find all "Responded" or "Interview" rows without existing prep
    targets = rows.filter(r => {
      if (!['Responded', 'Interview'].includes(r.status)) return false;
      return !hasPrepFile(r.company, r.role);
    });

    if (targets.length === 0) {
      console.log('✅ All Interview/Responded applications already have prep docs.');
      return;
    }
  } else {
    console.error('Usage: node generate-interview-prep.mjs --num N | --company NAME | --check [--dry-run]');
    process.exit(1);
  }

  console.log(`\n📋 Generating interview prep for ${targets.length} application${targets.length !== 1 ? 's' : ''}\n`);

  for (const row of targets) {
    console.log(`━━━ #${row.num} ${row.company} — ${row.role} (${row.status}) ━━━`);

    // Skip if prep already exists (unless explicitly targeting by --num)
    if (!targetNum && hasPrepFile(row.company, row.role)) {
      console.log(`  ⏭️  Prep already exists, skipping.`);
      continue;
    }

    const prepPath = await generatePrep(row);

    if (prepPath && !DRY_RUN) {
      await notifyTelegram(row, prepPath);
    }

    console.log('');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
