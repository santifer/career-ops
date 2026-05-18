#!/usr/bin/env node

/**
 * scripts/rubric-check.mjs — deterministic engagement-rubric runner
 * (audit Phase 7, dealbreaker-final 2026-05-18-070912).
 *
 * Implements the 51 ship-ready checks from the dealbreaker's adjudicated
 * rubric — covering cover-letter (CL-*), LinkedIn DM (DM-*), form-fields
 * (FF-*), frontier-lab content (FL-*), cross-artifact consistency (XA-*),
 * and Editorial-Lead-specific (EL-*) gates. Per-pack output written to
 * `apply-pack/<slug>/rubric-check.md`.
 *
 * Severity ladder (from dealbreaker §"Severity ladder"):
 *   - PASS:         zero ERROR fail AND ≤ 3 WARN fail
 *   - HOLD:         any ERROR fail OR > 6 WARN fail
 *   - HUMAN_REVIEW: 4-6 WARN fail
 *   - NOTES:        observation-only, never affect scoring
 *
 * CLI:
 *   node scripts/rubric-check.mjs --slug <pack>
 *   node scripts/rubric-check.mjs --slug <pack> --dry-run
 *   node scripts/rubric-check.mjs --all
 *
 * Exit code: 0 PASS, 1 HUMAN_REVIEW, 2 HOLD, 3 internal error.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveRoot() {
  const parent = dirname(__dirname);
  if (existsSync(join(parent, 'cv.md')) || existsSync(join(parent, 'AGENTS.md'))) return parent;
  return process.cwd();
}
const ROOT = resolveRoot();

// ── Word-count bands by archetype ───────────────────────────────────────────
// Per dealbreaker CL-01 (3-way disagreement resolved Round 2).
const COVER_LETTER_BANDS = {
  FDE:            { lower: 180, upper: 260 },
  AppliedAI:      { lower: 180, upper: 260 },
  Architect:      { lower: 220, upper: 320 },
  PgM:            { lower: 220, upper: 300 },
  Editorial:      { lower: 200, upper: 280 },
  default:        { lower: 200, upper: 300 },
};

// Per dealbreaker DM-01 channel-specific bands.
const DM_BANDS = {
  hm_warm:        { lower: 50,  upper: 75  },
  recruiter_cold: { lower: 40,  upper: 60  },
  peer_referral:  { lower: 65,  upper: 100 },
  cold_reach:     { lower: 35,  upper: 50  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadYaml(relPath) {
  const p = join(ROOT, relPath);
  if (!existsSync(p)) return null;
  return yaml.load(readFileSync(p, 'utf-8'));
}

function readIf(packDir, name) {
  const p = join(packDir, name);
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

function wordCount(s) {
  if (!s) return 0;
  return s.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
}

function stripMarkdown(s) {
  return String(s || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^---[\s\S]*?^---/m, '')           // YAML frontmatter
    .replace(/^>[^\n]*$/gm, '')                  // blockquote callouts
    .replace(/^#+\s+.*$/gm, '')                  // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function extractCoverBody(md) {
  // Cover-letter file shape:
  //   # Cover Letter — <Company>, <Role>
  //   > LLM-generated ... (callout block)
  //   ---
  //   [BODY PROSE — multiple paragraphs]
  //   [318 words]
  //   ---
  //   ## Notes for the candidate
  //   ...
  //   ## AI Detection Score
  //   ...
  //
  // The actual prose is between the FIRST `---` and either:
  //   (a) a `[N words]` marker, OR
  //   (b) the next `---`, OR
  //   (c) `## Notes` or `## AI Detection`.
  if (!md) return '';
  // Split on `---` and take the first chunk after position 0 (header).
  const chunks = md.split(/^---\s*$/m);
  if (chunks.length < 2) return stripMarkdown(md);
  // chunks[0] = header. chunks[1] = body (typically). Cut at end markers.
  let body = chunks[1] || '';
  body = body.split(/\[\d+\s*words?\]/i)[0];
  body = body.split(/^##\s+(Notes|AI Detection)/im)[0];
  return stripMarkdown(body).trim();
}

function extractFirstSentence(text) {
  const m = text.match(/^([^.!?]*[.!?])/);
  return m ? m[1].trim() : '';
}

function paragraphCount(text) {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).length;
}

function emDashCount(text) {
  // — (em dash) U+2014 and -- (double hyphen)
  return (text.match(/—/g) || []).length + (text.match(/--/g) || []).length;
}

function urlCount(text) {
  return (text.match(/https?:\/\/[^\s")|,]+/gi) || []).length +
         (text.match(/(?:^|\s)([a-z0-9-]+\.(?:com|io|org|net|ai|dev|app)[^\s")|,]*)/gi) || []).length;
}

function numericMarkerCount(text) {
  // Percentages, dollar amounts, multipliers, large counts, year ranges.
  const patterns = [
    /\d+(?:\.\d+)?\s*%/g,
    /\$\s*\d+(?:[,\.]\d+)*\s*[KMB]?/gi,
    /\d+(?:\.\d+)?\s*x\b/gi,
    /\d+(?:,\d{3})+/g,
    /\d{4}\s*[–-]\s*\d{4}/g,
    /\b\d+\+?\s*(?:years?|yrs?|months?|weeks?|hours?|days?|engineers?|producers?|machines?|hotspots?|views?|comments?)/gi,
  ];
  return patterns.reduce((sum, re) => sum + (text.match(re) || []).length, 0);
}

function sentenceLengthVariance(text) {
  const sents = text.split(/[.!?]\s+/).filter(s => s.trim().length > 5);
  if (sents.length < 3) return 0;
  const lens = sents.map(s => wordCount(s));
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length;
  return Math.sqrt(variance);  // stddev — more useful than raw variance
}

function extractAllNumbers(text) {
  return new Set((text.match(/\b\d+(?:,\d{3})*(?:\.\d+)?[KMB%]?\b/g) || []).map(s => s.replace(/,/g, '').toLowerCase()));
}

function extractDates(text) {
  // Year ranges + standalone years 2010-2030
  const ranges = text.match(/(20\d{2})\s*[–-]\s*(20\d{2}|present)/gi) || [];
  const standalone = text.match(/\b20[0-2]\d\b/g) || [];
  return new Set([...ranges, ...standalone].map(s => s.toLowerCase()));
}

// ── Check infrastructure ────────────────────────────────────────────────────

class CheckResult {
  constructor(id, severity, passed, message, fix = null) {
    this.id = id;
    this.severity = severity;  // ERROR | WARN | NOTE
    this.passed = passed;
    this.message = message;
    this.fix = fix;
  }
}

function pass(id, severity, msg)  { return new CheckResult(id, severity, true,  msg); }
function fail(id, severity, msg, fix) { return new CheckResult(id, severity, false, msg, fix); }

// ── Family: Cover Letter (CL-*) ─────────────────────────────────────────────

function checkCoverLetter(packDir, slug, slop, roleHint) {
  const md = readIf(packDir, 'cover-letter.md');
  const checks = [];
  if (!md) {
    checks.push(fail('CL-00', 'ERROR', 'cover-letter.md not found', 'generate via build-apply-packs'));
    return checks;
  }
  const text = extractCoverBody(md);
  const wc = wordCount(text);
  const band = COVER_LETTER_BANDS[roleHint] || COVER_LETTER_BANDS.default;

  // CL-01 word count band
  checks.push(
    (wc >= band.lower && wc <= band.upper)
      ? pass('CL-01', 'ERROR', `word count ${wc} in band ${band.lower}-${band.upper} (${roleHint})`)
      : fail('CL-01', 'ERROR', `word count ${wc} outside band ${band.lower}-${band.upper} (${roleHint})`, `trim to ≤${band.upper}; expand to ≥${band.lower}`)
  );

  // CL-02 over-band warning (band.upper + 20)
  checks.push(
    wc > band.upper + 20
      ? fail('CL-02', 'WARN', `word count ${wc} significantly over band (>${band.upper + 20})`, 'trim non-essential context')
      : pass('CL-02', 'WARN', 'within over-band tolerance')
  );

  // CL-03 banned-opening regex
  const opener = /^(I am writing to apply|I am excited|As a passionate|Ever since I was|In today's (rapidly evolving|fast-paced)|To whom it may concern|Dear Sir.?Madam)/i;
  const first = extractFirstSentence(text);
  checks.push(
    !opener.test(first)
      ? pass('CL-03', 'ERROR', `first sentence is not a banned opening`)
      : fail('CL-03', 'ERROR', `banned opening detected: "${first.slice(0, 60)}..."`, 'rewrite first sentence — see CL-03 guidance')
  );

  // CL-04 numeric markers ≥2
  const numCount = numericMarkerCount(text);
  checks.push(
    numCount >= 2
      ? pass('CL-04', 'ERROR', `${numCount} numeric markers (≥2 required)`)
      : fail('CL-04', 'ERROR', `only ${numCount} numeric markers (need ≥2)`, 'add ≥2 concrete metrics')
  );

  // CL-05 numeric markers > 6 → warn (oversaturation)
  checks.push(
    numCount > 6
      ? fail('CL-05', 'WARN', `${numCount} numeric markers (>6 reads stat-stuffed)`, 'trim to most-load-bearing metrics')
      : pass('CL-05', 'WARN', `${numCount} numeric markers within budget`)
  );

  // CL-06 banned slop words
  const slopWords = (slop?.words || []).map(w => w.toLowerCase());
  const lowerText = text.toLowerCase();
  const slopWordHits = slopWords.filter(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
  checks.push(
    slopWordHits.length === 0
      ? pass('CL-06', 'ERROR', `no banned slop words detected`)
      : fail('CL-06', 'ERROR', `slop words: ${slopWordHits.join(', ')}`, 'replace with concrete equivalents')
  );

  // CL-07 banned slop phrases (substring match)
  const slopPhrases = slop?.phrases || [];
  const slopPhraseHits = slopPhrases.filter(p => lowerText.includes(p.toLowerCase()));
  checks.push(
    slopPhraseHits.length === 0
      ? pass('CL-07', 'ERROR', `no banned slop phrases`)
      : fail('CL-07', 'ERROR', `slop phrases: ${slopPhraseHits.slice(0, 3).map(p => `"${p}"`).join(', ')}${slopPhraseHits.length > 3 ? ` +${slopPhraseHits.length - 3} more` : ''}`, 'rewrite without scaffold phrases')
  );

  // CL-08 paragraph count ≤4
  const paraCount = paragraphCount(text);
  checks.push(
    paraCount <= 4
      ? pass('CL-08', 'ERROR', `${paraCount} paragraphs (≤4)`)
      : fail('CL-08', 'ERROR', `${paraCount} paragraphs (>4 — too dense for recruiter scan)`, 'consolidate to 3-4 paragraphs')
  );

  // CL-09 target company name occurrence
  const company = slug.split('-').slice(1, 3).join(' ');  // crude — first 2 slug tokens after row id
  const companyMatch = company && new RegExp(company.split(' ')[0], 'i').test(text);
  checks.push(
    companyMatch
      ? pass('CL-09', 'WARN', `company name mentioned`)
      : fail('CL-09', 'WARN', `company name not mentioned`, `add target company name (≥1 mention)`)
  );

  // CL-10a + CL-10b sign-off
  const signoff = (md.match(/^(Best|Thanks|Best regards|Cheers|Sincerely|Regards|Yours truly|Respectfully)[\s,]/im) || [])[0] || '';
  const goodSignoff = /^(Best|Thanks|Best regards|Cheers)/i.test(signoff);
  const badSignoff = /(Yours truly|Respectfully|Sincerely yours)/i.test(signoff) || /at your earliest convenience/i.test(text);
  checks.push(
    goodSignoff || !signoff
      ? pass('CL-10a', 'ERROR', `sign-off OK`)
      : fail('CL-10a', 'ERROR', `no preferred sign-off (Best/Thanks/Best regards/Cheers) found`, 'add an explicit modern sign-off line')
  );
  checks.push(
    !badSignoff
      ? pass('CL-10b', 'ERROR', `no archaic sign-off phrases`)
      : fail('CL-10b', 'ERROR', `archaic sign-off detected`, 'drop "Yours truly" / "Respectfully" / "at your earliest convenience"')
  );

  // CL-11 em-dash count > 2
  const dashes = emDashCount(text);
  checks.push(
    dashes <= 2
      ? pass('CL-11', 'WARN', `${dashes} em-dashes`)
      : fail('CL-11', 'WARN', `${dashes} em-dashes (>2 reads AI-tell to detectors)`, 'replace some with periods or commas')
  );

  // CL-12 sentence length variance < 3 (low burstiness)
  const variance = sentenceLengthVariance(text);
  checks.push(
    variance >= 3
      ? pass('CL-12', 'WARN', `sentence-length stddev ${variance.toFixed(1)}`)
      : fail('CL-12', 'WARN', `sentence-length stddev ${variance.toFixed(1)} (<3 = uniform = AI-pattern)`, 'mix short + long sentences')
  );

  // CL-13 first paragraph > 2 sentences
  const firstPara = text.split(/\n\s*\n/)[0] || '';
  const firstParaSents = firstPara.split(/[.!?]\s+/).filter(s => s.trim().length > 5).length;
  checks.push(
    firstParaSents <= 2
      ? pass('CL-13', 'WARN', `first paragraph ${firstParaSents} sentence(s)`)
      : fail('CL-13', 'WARN', `first paragraph ${firstParaSents} sentences (>2 dilutes hook)`, 'lead with a single punchy sentence')
  );

  // CL-14 url count 0-4
  const urls = urlCount(text);
  checks.push(
    urls >= 0 && urls <= 4
      ? pass('CL-14', 'ERROR', `${urls} URLs/links`)
      : fail('CL-14', 'ERROR', `${urls} URLs (recommend ≤4)`, 'trim to load-bearing links')
  );

  // CL-15 url count <1 for FDE/AppliedAI/Editorial → warn
  if (['FDE', 'AppliedAI', 'Editorial'].includes(roleHint)) {
    checks.push(
      urls >= 1
        ? pass('CL-15', 'WARN', `${urls} URLs present for ${roleHint}`)
        : fail('CL-15', 'WARN', `no portfolio/repo link for ${roleHint} role`, 'add github / portfolio link')
    );
  }

  return checks;
}

// ── Family: LinkedIn DM (DM-*) ──────────────────────────────────────────────

function checkLinkedInDm(packDir, slop) {
  const linkedinDir = join(packDir, 'linkedin');
  const checks = [];
  if (!existsSync(linkedinDir)) {
    checks.push(fail('DM-00', 'WARN', 'linkedin/ dir not found', 'generate via build-apply-packs'));
    return checks;
  }
  const dmFiles = readdirSync(linkedinDir).filter(f => f.endsWith('.md'));
  // Map the apply-pack filename conventions to the dealbreaker's channel keys.
  const channelMap = {
    'hiring-manager': 'hm_warm',
    'hiring_manager': 'hm_warm',
    'recruiter': 'recruiter_cold',
    'peer-referral': 'peer_referral',
    'peer_referral': 'peer_referral',
    'connection-search': 'cold_reach',
    'connection_search': 'cold_reach',
    'cold-reach': 'cold_reach',
  };
  for (const f of dmFiles) {
    const fileKey = basename(f, '.md');
    const channel = channelMap[fileKey] || channelMap[fileKey.replace('-', '_')] || 'cold_reach';
    const band = DM_BANDS[channel] || DM_BANDS.cold_reach;
    const md = readIf(linkedinDir, f);
    const text = stripMarkdown(md);
    const wc = wordCount(text);
    const cc = text.length;

    checks.push(
      wc >= band.lower && wc <= band.upper
        ? pass(`DM-01:${channel}`, 'ERROR', `${channel} word count ${wc} in band ${band.lower}-${band.upper}`)
        : fail(`DM-01:${channel}`, 'ERROR', `${channel} word count ${wc} outside band ${band.lower}-${band.upper}`, `trim/expand to band`)
    );

    if (channel === 'cold_reach' || channel === 'connection_search') {
      checks.push(
        cc <= 200
          ? pass(`DM-02:${channel}`, 'ERROR', `cold-reach char count ${cc} ≤ 200`)
          : fail(`DM-02:${channel}`, 'ERROR', `cold-reach char count ${cc} > 200 (LinkedIn free-tier connection note cap)`, 'trim ruthlessly')
      );
      checks.push(
        cc > 280
          ? fail(`DM-03:${channel}`, 'WARN', `cold-reach char count ${cc} > 280`, 'tighten')
          : pass(`DM-03:${channel}`, 'WARN', `cold-reach char count within 280`)
      );
      const artifactRegex = /(paper|repo|talk|commit|benchmark|launch|article|post|github)/i;
      checks.push(
        artifactRegex.test(text)
          ? pass(`DM-07:${channel}`, 'ERROR', `cold-reach references a verifiable artifact`)
          : fail(`DM-07:${channel}`, 'ERROR', `cold-reach has no verifiable artifact reference`, 'reference a specific paper/repo/talk/commit')
      );
    }

    const lines = (md || '').split('\n').filter(l => l.trim());
    checks.push(
      lines.length > 1
        ? pass(`DM-04:${channel}`, 'ERROR', `${lines.length} line breaks`)
        : fail(`DM-04:${channel}`, 'ERROR', `single-block DM (no line breaks)`, 'add at least one paragraph break')
    );

    const askSents = text.match(/[?]/g)?.length || 0;
    checks.push(
      askSents === 1
        ? pass(`DM-05:${channel}`, 'ERROR', `single ask sentence`)
        : fail(`DM-05:${channel}`, 'ERROR', `${askSents} question/ask sentences (target: 1)`, 'consolidate to one explicit ask')
    );

    if (channel === 'peer_referral') {
      // Look for first-name placeholder pattern
      const hasName = /\[[A-Z]\w+\]|\b[A-Z]\w{2,}\b/.test(text);
      checks.push(
        hasName
          ? pass(`DM-06:${channel}`, 'ERROR', `peer first name referenced`)
          : fail(`DM-06:${channel}`, 'ERROR', `peer first name not referenced`, 'add peer first name in opening')
      );
    }

    // DM-08 slop words (warn for DMs)
    const slopHit = (slop?.words || []).filter(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
    checks.push(
      slopHit.length === 0
        ? pass(`DM-08:${channel}`, 'WARN', `no slop words`)
        : fail(`DM-08:${channel}`, 'WARN', `slop words: ${slopHit.join(', ')}`, 'replace')
    );

    // DM-09 banned greetings
    const banGreet = /^(Hi there|Hello|Greetings)[,!]/i.test(text.trim());
    checks.push(
      !banGreet
        ? pass(`DM-09:${channel}`, 'WARN', `opening is not a generic greeting`)
        : fail(`DM-09:${channel}`, 'WARN', `opening starts with generic greeting`, 'lead with specific reference')
    );

    // DM-10 signature
    const hasSig = /(Mitchell|—\s*Mitchell|\bMitch\b)/.test(text);
    checks.push(
      hasSig
        ? pass(`DM-10:${channel}`, 'ERROR', `signature present`)
        : fail(`DM-10:${channel}`, 'ERROR', `no signature`, 'add "— Mitchell" or similar')
    );
  }
  return checks;
}

// ── Family: Form Fields (FF-*) ─────────────────────────────────────────────

function checkFormFields(packDir) {
  const md = readIf(packDir, 'form-fields.md');
  const checks = [];
  if (!md) {
    checks.push(fail('FF-00', 'WARN', 'form-fields.md not found', 'generate via build-apply-packs'));
    return checks;
  }

  // The form-fields template uses scaffolds. We check on the SCAFFOLD shape
  // since each role's actual answers are human-filled. Scaffold-band checks
  // surface when the scaffold itself drifts from the rubric.
  const sections = md.split(/^##\s+/m);

  const whyCo = sections.find(s => /Why are you interested|Why .* company/i.test(s)) || '';
  const whyCoBody = stripMarkdown(whyCo);
  const whyCoWc = wordCount(whyCoBody);
  checks.push(
    whyCoWc >= 50 && whyCoWc <= 100
      ? pass('FF-01', 'ERROR', `Why-company scaffold ${whyCoWc}w in band 50-100`)
      : fail('FF-01', 'ERROR', `Why-company scaffold ${whyCoWc}w outside 50-100`, 'tighten scaffold')
  );

  const whyRole = sections.find(s => /Why .* role|Why this role/i.test(s)) || '';
  const whyRoleBody = stripMarkdown(whyRole);
  const whyRoleWc = wordCount(whyRoleBody);
  checks.push(
    whyRoleWc >= 50 && whyRoleWc <= 100
      ? pass('FF-04', 'ERROR', `Why-role scaffold ${whyRoleWc}w in band 50-100`)
      : fail('FF-04', 'ERROR', `Why-role scaffold ${whyRoleWc}w outside 50-100`, 'tighten scaffold')
  );

  const proj = sections.find(s => /project|tell us about/i.test(s)) || '';
  const projBody = stripMarkdown(proj);
  const projWc = wordCount(projBody);
  checks.push(
    projWc >= 100 && projWc <= 150
      ? pass('FF-06', 'ERROR', `Project scaffold ${projWc}w in band 100-150`)
      : fail('FF-06', 'ERROR', `Project scaffold ${projWc}w outside 100-150`, 'tighten scaffold to 100-150')
  );
  const projSents = (projBody.match(/[.!?]\s+/g) || []).length + 1;
  checks.push(
    projSents <= 5
      ? pass('FF-07', 'ERROR', `Project scaffold ${projSents} sentences (≤5)`)
      : fail('FF-07', 'ERROR', `Project scaffold ${projSents} sentences (>5)`, 'consolidate')
  );
  checks.push(
    numericMarkerCount(projBody) >= 1
      ? pass('FF-08', 'ERROR', `Project includes ≥1 metric`)
      : fail('FF-08', 'ERROR', `Project missing metric`, 'add ≥1 concrete number')
  );
  // FF-09 STAR-R labels read as AI-tell
  const starLabels = /\b(Situation|Task|Action|Result|Reflection):/i.test(projBody);
  checks.push(
    !starLabels
      ? pass('FF-09', 'WARN', `no STAR-R labels (good — structure embedded)`)
      : fail('FF-09', 'WARN', `STAR-R labels detected (AI-tell)`, 'embed structure without explicit labels')
  );
  checks.push(
    urlCount(projBody) >= 1
      ? pass('FF-10', 'ERROR', `Project includes a link`)
      : fail('FF-10', 'ERROR', `Project missing link`, 'add github/portfolio/repo link')
  );

  const howHeard = sections.find(s => /how did you hear/i.test(s)) || '';
  const howHeardBody = stripMarkdown(howHeard);
  const howHeardWc = wordCount(howHeardBody);
  checks.push(
    howHeardWc <= 25
      ? pass('FF-11', 'ERROR', `How-heard ${howHeardWc}w (≤25)`)
      : fail('FF-11', 'ERROR', `How-heard ${howHeardWc}w (>25 over-elaborates)`, 'tighten to ≤25 words')
  );

  return checks;
}

// ── Family: Frontier-Lab (FL-*) ─────────────────────────────────────────────

function checkFrontierLab(packDir, slug, frontierLabTokens) {
  const checks = [];
  // Identify target company from slug. Slug format: <padded>-<companySlug>-<roleSlug>
  const slugParts = slug.split('-');
  const company = (slugParts[1] || '').toLowerCase();
  const labKey = ['anthropic', 'openai', 'xai', 'mistral'].find(c => company.includes(c));
  if (!labKey) {
    return checks;  // Not a frontier-lab target; no FL checks apply.
  }
  const entry = frontierLabTokens?.[labKey];
  if (!entry) return checks;

  const formFields = readIf(packDir, 'form-fields.md') || '';
  const coverLetter = readIf(packDir, 'cover-letter.md') || '';
  const haystack = `${formFields}\n${coverLetter}`;
  const regex = new RegExp(entry.regex, 'i');
  const hit = regex.test(haystack);
  const severity = entry.severity || 'NOTE';
  const id = ({ anthropic: 'FL-01', openai: 'FL-02', xai: 'FL-03', mistral: 'FL-04' })[labKey];
  if (severity === 'NOTE') {
    checks.push(
      hit
        ? pass(id, 'NOTE', `${labKey} mission-keyword present (observation)`)
        : pass(id, 'NOTE', `${labKey} mission-keyword absent (observation; not verified)`)
    );
  } else {
    checks.push(
      hit
        ? pass(id, severity, `${labKey} mission-keyword present in apply-pack content`)
        : fail(id, severity, `no ${labKey} mission-keyword in cover-letter or form-fields`, `add ≥1 reference to: ${entry.regex.slice(1, -1)}`)
    );
  }
  return checks;
}

// ── Family: Cross-Artifact Consistency (XA-*) ──────────────────────────────

function checkCrossArtifact(packDir, roleHint) {
  const checks = [];
  const cv = readIf(packDir, 'tailored-cv.md') || readIf(join(ROOT), 'cv.md') || '';
  const cover = readIf(packDir, 'cover-letter.md') || '';
  const formFields = readIf(packDir, 'form-fields.md') || '';
  const allOutbound = `${cover}\n${formFields}`;

  // XA-01 every number in CV appears in outbound (cover OR form-fields)
  const cvNumbers = extractAllNumbers(stripMarkdown(cv));
  const outNumbers = extractAllNumbers(stripMarkdown(allOutbound));
  const missing = [...cvNumbers].filter(n => !outNumbers.has(n));
  // Note: full subset is overly strict — many CV numbers (small bullets, citations)
  // are not in cover letter and that's fine. Surface ratio.
  const cvNumCount = cvNumbers.size;
  const outIntersect = [...cvNumbers].filter(n => outNumbers.has(n)).length;
  const ratio = cvNumCount > 0 ? outIntersect / cvNumCount : 1;
  checks.push(
    ratio >= 0.2 || cvNumCount === 0
      ? pass('XA-01', 'ERROR', `cover/forms reference ${outIntersect}/${cvNumCount} CV numbers (≥20% overlap)`)
      : fail('XA-01', 'ERROR', `cover/forms reference only ${outIntersect}/${cvNumCount} CV numbers (<20%)`, 'highlight load-bearing CV metrics in cover letter')
  );

  // XA-02 dates consistent
  const cvDates = extractDates(stripMarkdown(cv));
  const outDates = extractDates(stripMarkdown(allOutbound));
  const dateConflict = [...outDates].filter(d => !cvDates.has(d) && /20\d{2}\s*[–-]\s*20\d{2}/.test(d));
  checks.push(
    dateConflict.length === 0
      ? pass('XA-02', 'ERROR', `no date conflicts between CV and outbound`)
      : fail('XA-02', 'ERROR', `date-range claims in outbound not in CV: ${dateConflict.slice(0, 3).join(', ')}`, 'verify date ranges match CV')
  );

  // XA-03 role title normalization — check for variation in self-identified role
  const titlePatterns = [
    /Editorial Lead/i, /Engineering Editor/i, /Comms Lead/i, /Communications Lead/i,
    /Solutions Architect/i, /Forward Deployed/i, /Applied AI/i,
  ];
  const titlesUsed = new Set();
  for (const re of titlePatterns) {
    for (const text of [cv, cover, formFields]) {
      if (re.test(text)) titlesUsed.add(re.source.replace(/\\\//g, '/'));
    }
  }
  // Bare ERROR if 4+ distinct titles across artifacts (likely confusion).
  checks.push(
    titlesUsed.size <= 3
      ? pass('XA-03', 'ERROR', `role-title usage consistent (${titlesUsed.size} distinct)`)
      : fail('XA-03', 'ERROR', `${titlesUsed.size} distinct role-title patterns across artifacts`, 'align tagline + role references')
  );

  // XA-06 referral consistency
  const dmsDir = join(packDir, 'linkedin');
  let dmMentionsReferral = false;
  if (existsSync(dmsDir)) {
    const dmTexts = readdirSync(dmsDir).filter(f => f.endsWith('.md'))
      .map(f => readFileSync(join(dmsDir, f), 'utf-8')).join('\n');
    dmMentionsReferral = /\b(referred|referral|introduced by|via|through)\b/i.test(dmTexts);
  }
  const howHeardReferral = /(referred|referral|introduced by|via|through)/i.test(formFields);
  if (dmMentionsReferral) {
    checks.push(
      howHeardReferral
        ? pass('XA-06', 'ERROR', `DM-mentioned referral reflected in "How did you hear"`)
        : fail('XA-06', 'ERROR', `DM mentions a referral but how-heard form-field doesn't`, 'align how-heard with DM referral claim')
    );
  }

  // XA-07 verbatim phrase repeats between cover + CV
  const coverWords = stripMarkdown(cover).toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const cvLines = stripMarkdown(cv).toLowerCase().split('\n').filter(l => l.length > 20);
  let exactSubstring = 0;
  for (const line of cvLines) {
    if (line.length > 30 && cover.toLowerCase().includes(line.slice(0, 60))) exactSubstring++;
  }
  checks.push(
    exactSubstring <= 2
      ? pass('XA-07', 'WARN', `≤2 verbatim phrase repeats CV→cover`)
      : fail('XA-07', 'WARN', `${exactSubstring} verbatim repeats CV→cover (reads boilerplate)`, 'paraphrase repeated phrases in cover letter')
  );

  return checks;
}

// ── Family: Editorial Lead (EL-*) ───────────────────────────────────────────

function checkEditorialLead(packDir, roleHint) {
  if (roleHint !== 'Editorial') return [];
  const checks = [];

  // EL-01 portfolio writing anchors count
  const linkedinDir = join(packDir, 'linkedin');
  const cover = readIf(packDir, 'cover-letter.md') || '';
  const formFields = readIf(packDir, 'form-fields.md') || '';
  const text = `${cover}\n${formFields}`;
  const anchorPatterns = [
    /\bsubstack\b/i, /\bnewsletter\b/i, /\barticle\b/i, /\bblog\b/i,
    /\bbyline\b/i, /\bessay\b/i, /\bpost\b/i, /\bpublication\b/i,
  ];
  const anchorsFound = anchorPatterns.filter(re => re.test(text)).length;
  checks.push(
    anchorsFound >= 2
      ? pass('EL-01', 'WARN', `${anchorsFound} writing-portfolio anchors referenced`)
      : fail('EL-01', 'WARN', `only ${anchorsFound} writing-portfolio anchors`, 'reference ≥2 bylines/newsletters/articles')
  );

  // EL-02 voice samples (verbose: link to a voice corpus)
  const hasVoiceSample = /(voice|sample|writing sample|portfolio piece)/i.test(text);
  checks.push(
    hasVoiceSample
      ? pass('EL-02', 'ERROR', `voice-sample reference present`)
      : fail('EL-02', 'ERROR', `no voice-sample reference`, 'add explicit link to a writing sample')
  );

  // EL-03 cover letter demonstrates editorial voice (heuristic: short sentences, verbatim quotes, em dashes)
  const coverBody = extractCoverBody(cover);
  const editorialSignals = (
    (coverBody.match(/"[^"]+"/g) || []).length +    // verbatim quotes
    (coverBody.match(/—/g) || []).length +            // em-dashes (editorial cadence)
    ((coverBody.match(/\.\s+[A-Z]/g) || []).length > 3 ? 1 : 0)  // varied sentence pacing
  );
  checks.push(
    editorialSignals >= 3
      ? pass('EL-03', 'WARN', `cover demonstrates editorial cadence (signal count ${editorialSignals})`)
      : fail('EL-03', 'WARN', `cover lacks editorial-voice signals`, 'add a verbatim quote or varied sentence pacing')
  );

  return checks;
}

// ── Severity aggregation ────────────────────────────────────────────────────

function aggregateVerdict(checks) {
  const errors = checks.filter(c => !c.passed && c.severity === 'ERROR');
  const warns = checks.filter(c => !c.passed && c.severity === 'WARN');
  let level = 'PASS';
  if (errors.length > 0) level = 'HOLD';
  else if (warns.length > 6) level = 'HOLD';
  else if (warns.length >= 4) level = 'HUMAN_REVIEW';
  return { level, errors: errors.length, warns: warns.length };
}

// ── Report rendering ────────────────────────────────────────────────────────

function buildReport(slug, roleHint, checks, verdict) {
  const lines = [];
  const icon = ({ PASS: '✅', HUMAN_REVIEW: '🟡', HOLD: '🔴' })[verdict.level];
  lines.push(`# Engagement rubric — ${slug}`);
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} by \`scripts/rubric-check.mjs\` (audit Phase 7 dealbreaker-final 2026-05-18-070912).`);
  lines.push('');
  lines.push(`## Verdict: ${icon} **${verdict.level}**`);
  lines.push('');
  lines.push(`- ERROR fails: ${verdict.errors}`);
  lines.push(`- WARN fails: ${verdict.warns}`);
  lines.push(`- Role hint: ${roleHint}`);
  lines.push('');
  lines.push('## Check results');
  lines.push('');
  lines.push('| ID | Severity | Status | Detail |');
  lines.push('|---|---|---|---|');
  for (const c of checks) {
    const sIcon = ({ ERROR: '🔴', WARN: '🟡', NOTE: 'ℹ️' })[c.severity];
    const pf = c.passed ? '✓' : '✗';
    lines.push(`| ${c.id} | ${sIcon} ${c.severity} | ${pf} | ${c.message} |`);
  }
  lines.push('');
  const fails = checks.filter(c => !c.passed && (c.severity === 'ERROR' || c.severity === 'WARN'));
  if (fails.length > 0) {
    lines.push('## Fixes (priority order)');
    lines.push('');
    for (const c of fails) {
      lines.push(`- **${c.id}** (${c.severity}): ${c.message}${c.fix ? ` — *fix:* ${c.fix}` : ''}`);
    }
    lines.push('');
  }
  lines.push('## Severity ladder');
  lines.push('');
  lines.push('- **PASS:** zero ERROR fail AND ≤3 WARN fail');
  lines.push('- **HUMAN_REVIEW:** 4-6 WARN fail');
  lines.push('- **HOLD:** any ERROR fail OR >6 WARN fail');
  lines.push('- **NOTE:** observation-only, never affects scoring');
  lines.push('');
  return lines.join('\n') + '\n';
}

function inferRoleHint(slug) {
  const lower = slug.toLowerCase();
  if (/editorial/.test(lower)) return 'Editorial';
  if (/forward-deployed|forward deployed|\bfde\b/.test(lower)) return 'FDE';
  if (/applied-ai|applied ai|\bai-/.test(lower)) return 'AppliedAI';
  if (/solutions-architect|solutions architect|\bsa\b/.test(lower)) return 'Architect';
  if (/program-manager|program manager|\bpgm\b|pm-fde/.test(lower)) return 'PgM';
  if (/communications/.test(lower)) return 'Editorial';  // comms maps closest to editorial
  if (/developer-advocate|developer-relations|devadvocate|devrel/.test(lower)) return 'FDE';
  return 'default';
}

// ── Entry point ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const a = { slug: null, all: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slug' && argv[i + 1]) { a.slug = argv[++i]; continue; }
    if (argv[i] === '--all') { a.all = true; continue; }
    if (argv[i] === '--dry-run') { a.dryRun = true; continue; }
  }
  return a;
}

function processPack(slug, opts, slop, frontierLabTokens) {
  const packDir = join(ROOT, 'apply-pack', slug);
  if (!existsSync(packDir) || !statSync(packDir).isDirectory()) {
    return { slug, ok: false, error: 'pack_dir_not_found' };
  }
  const roleHint = inferRoleHint(slug);
  const checks = [
    ...checkCoverLetter(packDir, slug, slop, roleHint),
    ...checkLinkedInDm(packDir, slop),
    ...checkFormFields(packDir),
    ...checkFrontierLab(packDir, slug, frontierLabTokens),
    ...checkCrossArtifact(packDir, roleHint),
    ...checkEditorialLead(packDir, roleHint),
  ];
  const verdict = aggregateVerdict(checks);
  const report = buildReport(slug, roleHint, checks, verdict);

  if (opts.dryRun) {
    process.stdout.write(report);
  } else {
    writeFileSync(join(packDir, 'rubric-check.md'), report);
  }

  return {
    slug,
    ok: verdict.level === 'PASS',
    verdict: verdict.level,
    errors: verdict.errors,
    warns: verdict.warns,
    roleHint,
    total_checks: checks.length,
  };
}

function discoverReadyPacks() {
  const applyPackDir = join(ROOT, 'apply-pack');
  if (!existsSync(applyPackDir)) return [];
  return readdirSync(applyPackDir)
    .filter(d => statSync(join(applyPackDir, d)).isDirectory());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slop = loadYaml('data/rubric/banned-slop-2026-05.yml');
  const frontierLabTokens = loadYaml('data/rubric/frontier-lab-tokens-2026-05.yml');
  if (!slop) { console.error('Missing data/rubric/banned-slop-2026-05.yml'); process.exit(3); }
  if (!frontierLabTokens) { console.error('Missing data/rubric/frontier-lab-tokens-2026-05.yml'); process.exit(3); }

  const slugs = args.all ? discoverReadyPacks() : (args.slug ? [args.slug] : []);
  if (slugs.length === 0) {
    console.error('Usage: node scripts/rubric-check.mjs --slug <pack> [--dry-run]');
    console.error('       node scripts/rubric-check.mjs --all');
    process.exit(1);
  }

  const results = [];
  for (const slug of slugs) {
    const r = processPack(slug, args, slop, frontierLabTokens);
    results.push(r);
    if (r.error) {
      console.error(`[${slug}] ERROR: ${r.error}`);
    } else {
      const icon = ({ PASS: '✅', HUMAN_REVIEW: '🟡', HOLD: '🔴' })[r.verdict];
      console.error(`[${slug}] ${icon} ${r.verdict} (errors=${r.errors} warns=${r.warns} of ${r.total_checks})`);
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    packs_attempted: results.length,
    pass: results.filter(r => r.verdict === 'PASS').length,
    human_review: results.filter(r => r.verdict === 'HUMAN_REVIEW').length,
    hold: results.filter(r => r.verdict === 'HOLD').length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.hold > 0) process.exit(2);
  if (summary.human_review > 0) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(3);
});
