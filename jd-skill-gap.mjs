#!/usr/bin/env node

/**
 * jd-skill-gap.mjs — Zero-LLM JD skill-gap checker.
 *
 * Extracts an explicit skill/requirement list from a JD (regex-based, no LLM
 * call — see extractJdSkills()), then classifies each one against cv.md into
 * three buckets so a CV can be tailored honestly instead of guessed at:
 *
 *   existing            — already a named skill in cv.md's Skills section
 *   supportedByResume    — not a named skill, but appears in prose elsewhere in cv.md
 *   gap                  — JD requires it, cv.md has no trace of it at all
 *   (nothing is ever auto-added — this tool only classifies and reports)
 *
 * Design note: the three-way classification (existing / supportedByResume / gap)
 * is inspired by the skill-verification pattern in srbhr/Resume-Matcher
 * (Apache-2.0) — specifically their four-way verify_skill_target_plan() split.
 * This is an independent reimplementation, not a code port: different language,
 * zero LLM calls, and folded down to three buckets because career-ops never
 * auto-adds a claim to cv.md either way (their jd_added/unsupported distinction
 * only matters if a tool is allowed to add something automatically).
 *
 * Usage:
 *   node jd-skill-gap.mjs jds/acme.md
 *   node jd-skill-gap.mjs jds/acme.md --summary
 *   node jd-skill-gap.mjs --self-test
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

// ── Config ──────────────────────────────────────────────────────────

const CV_PATH = 'cv.md';

// ── JD skill extraction (regex, no LLM) ─────────────────────────────
//
// Looks for lines/phrases under common JD requirement headers and comma/
// bullet-separated skill lists. Deliberately conservative: under-extracting
// (missing a skill) is recoverable by the user reading the JD themselves;
// over-extracting noise into "required skills" is not — it would misreport
// gaps that aren't real.

const REQUIREMENT_HEADER_RE =
  /^#{0,4}\s*(required|requirements|qualifications|must[- ]have|preferred|nice[- ]to[- ]have)s?\b.*$/im;

const BULLET_LINE_RE = /^\s*[-*•]\s*(.+)$/;

// A conservative skill-token extractor: pulls comma/slash/and-separated
// technical-looking tokens out of a requirement bullet, rather than treating
// the whole bullet as one skill string (JD bullets are often full sentences).
const SKILL_TOKEN_RE = /\b([A-Z][A-Za-z0-9+.#]{1,30}(?:\.[a-z]{2,4})?)\b/g;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'this', 'that',
  'must', 'able', 'strong', 'excellent', 'proven', 'a', 'an',
]);

/**
 * Extract candidate skill tokens from a JD's requirement-style sections.
 * @param {string} jdText
 * @returns {string[]}
 */
function extractJdSkills(jdText) {
  const lines = jdText.split('\n');
  const skills = new Set();
  let inRequirementsBlock = false;

  for (const line of lines) {
    if (REQUIREMENT_HEADER_RE.test(line)) {
      inRequirementsBlock = true;
      continue;
    }
    if (inRequirementsBlock && line.trim() === '') continue;
    if (inRequirementsBlock && /^#{1,4}\s/.test(line) && !REQUIREMENT_HEADER_RE.test(line)) {
      inRequirementsBlock = false;
    }

    const bulletMatch = BULLET_LINE_RE.exec(line);
    if (inRequirementsBlock && bulletMatch) {
      const bulletText = bulletMatch[1];
      let m;
      SKILL_TOKEN_RE.lastIndex = 0;
      while ((m = SKILL_TOKEN_RE.exec(bulletText)) !== null) {
        const token = m[1].trim();
        if (!STOPWORDS.has(token.toLowerCase()) && token.length > 1) {
          skills.add(token);
        }
      }
    }
  }
  return [...skills];
}

// ── Word-boundary text matching (same technique as Resume-Matcher's
//    _skill_mentioned_in_text — prevents "Java" matching inside "JavaScript") ──

/**
 * Word-boundary, case-insensitive check for whether a skill token appears in text.
 * @param {string} skill
 * @param {string} text
 * @returns {boolean}
 */
function skillMentionedInText(skill, text) {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'i');
  return re.test(text);
}

// ── Classification ───────────────────────────────────────────────────

/**
 * Classify each JD skill against cv.md into existing / supportedByResume / gap.
 * @param {string[]} jdSkills
 * @param {string} cvText
 * @returns {{existing: string[], supportedByResume: string[], gap: string[]}}
 */
function classifySkillGaps(jdSkills, cvText) {
  const skillsSectionMatch = cvText.match(/^#{1,4}\s*Skills\s*$([\s\S]*?)(?=^#{1,4}\s|\Z)/im);
  const namedSkillsText = skillsSectionMatch ? skillsSectionMatch[1] : '';
  const proseText = skillsSectionMatch
    ? cvText.slice(0, skillsSectionMatch.index) + cvText.slice(skillsSectionMatch.index + skillsSectionMatch[0].length)
    : cvText;

  const existing = [];
  const supportedByResume = [];
  const gap = [];

  for (const skill of jdSkills) {
    if (skillMentionedInText(skill, namedSkillsText)) {
      existing.push(skill);
    } else if (skillMentionedInText(skill, proseText)) {
      supportedByResume.push(skill);
    } else {
      gap.push(skill);
    }
  }

  return { existing, supportedByResume, gap };
}

// ── Exports (for test-all.mjs and other consumers) ───────────────────
export { extractJdSkills, skillMentionedInText, classifySkillGaps };

// ── CLI ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const summaryMode = args.includes('--summary');
const selfTestMode = args.includes('--self-test');
const jdPathArg = args.find(a => !a.startsWith('--'));

function runSelfTest() {
  let passed = 0, failed = 0;
  const eq = (label, actual, expected) => {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) {
      passed++;
    } else {
      failed++;
      console.log(`  FAIL: ${label}\n    expected: ${e}\n    actual:   ${a}`);
    }
  };

  const fakeJd = `
# Senior Engineer — Fabrikam Inc.

## Requirements
- Python, FastAPI, PostgreSQL
- Experience with Kubernetes
- Strong communication skills
`;
  const fakeCv = `
# Skills
Python, PostgreSQL, Docker

# Experience
Deployed services onto Kubernetes clusters and wrote FastAPI endpoints for internal tools.
`;

  const jdSkills = extractJdSkills(fakeJd);
  eq('extracts Python from requirements bullet', jdSkills.includes('Python'), true);
  eq('extracts Kubernetes from a separate bullet', jdSkills.includes('Kubernetes'), true);
  eq('does not extract stopword "Strong"', jdSkills.includes('Strong'), false);

  const result = classifySkillGaps(['Python', 'PostgreSQL', 'Kubernetes', 'FastAPI', 'Rust'], fakeCv);
  eq('Python classified as existing (named skill)', result.existing.includes('Python'), true);
  eq('Kubernetes classified as supportedByResume (prose only)', result.supportedByResume.includes('Kubernetes'), true);
  eq('FastAPI classified as supportedByResume (prose only)', result.supportedByResume.includes('FastAPI'), true);
  eq('Rust classified as a real gap', result.gap.includes('Rust'), true);

  console.log(`\njd-skill-gap self-test: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
if (selfTestMode) {
  runSelfTest();
} else {
  if (!jdPathArg || !existsSync(jdPathArg)) {
    console.error('Usage: node jd-skill-gap.mjs <jd-file> [--summary]');
    console.error('       node jd-skill-gap.mjs --self-test');
    process.exit(1);
  }
  if (!existsSync(CV_PATH)) {
    console.error(`Error: ${CV_PATH} not found — this is a user-layer file, create it first.`);
    process.exit(1);
  }

  const jdText = readFileSync(jdPathArg, 'utf-8');
  const cvText = readFileSync(CV_PATH, 'utf-8');
  const jdSkills = extractJdSkills(jdText);
  const result = classifySkillGaps(jdSkills, cvText);

  if (summaryMode) {
    console.log(`\nJD Skill-Gap Check`);
    console.log('─'.repeat(40));
    console.log(`JD skills found: ${jdSkills.length}`);
    console.log(`  ✅ Already in Skills section:   ${result.existing.join(', ') || '(none)'}`);
    console.log(`  📝 Mentioned in resume prose:   ${result.supportedByResume.join(', ') || '(none)'}`);
    console.log(`  ⚠️  Real gaps (not found anywhere): ${result.gap.join(', ') || '(none)'}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
} // end CLI guard
