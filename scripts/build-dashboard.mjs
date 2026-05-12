#!/usr/bin/env node

/**
 * build-dashboard.mjs — single-file HTML dashboard generator
 *
 * Reads applications.md, reports/*.md, pipeline.md, scan-history.tsv,
 * portals.yml, and produces dashboard/index.html — a self-contained
 * browser dashboard with sortable tables, filters, and expand-on-click
 * detail rows. Open with: `open dashboard/index.html`
 *
 * Designed to be run after every batch + merge so the page stays
 * fresh. Wire into scripts/scan-unattended.mjs or run manually.
 *
 * Usage:
 *   node scripts/build-dashboard.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { parseApplicationsFile } from '../lib/parse-applications.mjs';
import { statusKey, statusBadgeClass, STATUS_KEY_SOURCE, STATUS_BADGE_CLASS_SOURCE } from '../lib/status-key.mjs';
import { networkSummary as _linkedInNetworkSummary, networkMeta as _linkedInNetworkMeta } from '../lib/linkedin-network.mjs';
const parseYaml = yaml.load;

const ROOT = process.cwd();
const APPLICATIONS_PATH = join(ROOT, 'data/applications.md');
const PIPELINE_PATH = join(ROOT, 'data/pipeline.md');
const SCAN_HISTORY_PATH = join(ROOT, 'data/scan-history.tsv');
const BATCH_STATE_PATH = join(ROOT, 'batch/batch-state.tsv');
const PORTALS_PATH = join(ROOT, 'portals.yml');
const REPORTS_DIR = join(ROOT, 'reports');
const HEARTBEAT_GLOB = (date) => join(ROOT, `data/heartbeat-${date}.md`);
const OVERPAY_CURRENT_PATH = join(ROOT, 'data/overpay-signals/CURRENT.md');
const ROLE_ENRICHMENT_DIR = join(ROOT, 'data/role-enrichment');
const PROFILE_YML_PATH = join(ROOT, 'config/profile.yml');
const CV_PATH = join(ROOT, 'cv.md');
const OUTREACH_TEMPLATES_PATH = join(ROOT, 'data/outreach-templates.md');
const OUT_PATH = join(ROOT, 'dashboard/index.html');

// ── Email-launcher build-time data ───────────────────────────────
// CV headline: first H1 (name) + first H2 (one-sentence lead) from cv.md.
// Falls back to profile.yml then generic placeholders if cv.md is missing.
function loadCvHeadline() {
  let name = '';
  let oneSentenceLead = '';
  if (existsSync(CV_PATH)) {
    const cv = readFileSync(CV_PATH, 'utf-8');
    const h1 = cv.match(/^#\s+(.+?)\s*$/m);
    const h2 = cv.match(/^##\s+(.+?)\s*$/m);
    if (h1) name = h1[1].trim();
    if (h2) oneSentenceLead = h2[1].trim();
  }
  if ((!name || !oneSentenceLead) && existsSync(PROFILE_YML_PATH)) {
    try {
      const cfg = parseYaml(readFileSync(PROFILE_YML_PATH, 'utf-8')) || {};
      if (!name) name = cfg?.profile?.name || cfg?.name || '';
      if (!oneSentenceLead) oneSentenceLead = cfg?.profile?.headline || cfg?.headline || '';
    } catch (_) { /* ignore */ }
  }
  return {
    name: name || 'Your Name',
    oneSentenceLead: oneSentenceLead || 'Brief one-sentence positioning lead.',
  };
}

// Hardcoded fallbacks — used when data/outreach-templates.md is missing
// or has no parseable Email-Template blocks. Subject/body use the
// {Company} {Role} {YourName} {OneSentenceLead} placeholders.
const EMAIL_TEMPLATE_FALLBACKS = [
  {
    id: 'cold-recruiter',
    label: 'Cold to recruiter',
    subject: 'Re: {Role} at {Company} — quick note',
    body: 'Hi,\n\nI just applied for the {Role} role at {Company} and wanted to introduce myself directly.\n\n{OneSentenceLead}\n\nHappy to share more or chat briefly if it would help your evaluation.\n\n— {YourName}',
  },
  {
    id: 'warm-intro',
    label: 'Warm intro followup',
    subject: 'Followup — {Role} at {Company}',
    body: 'Hi,\n\nThank you for the introduction earlier. I just submitted my application for the {Role} role at {Company}.\n\n{OneSentenceLead}\n\nLet me know if there is anything else useful I can send your way.\n\n— {YourName}',
  },
  {
    id: 'status-check',
    label: 'Status check',
    subject: 'Status check — {Role} application',
    body: 'Hi,\n\nI wanted to circle back on my application for the {Role} role at {Company}, submitted recently.\n\nI am still very interested and happy to provide any additional information that would help the evaluation.\n\n— {YourName}',
  },
];

// Parse data/outreach-templates.md for explicitly-marked email-launcher
// templates. Convention (opt-in, non-breaking with the existing rich
// outreach file): a fenced block of the form
//
//   ### Email Template: <Label>
//   **Subject:** <subject line with placeholders>
//   **Body:**
//   ```
//   <body text with placeholders>
//   ```
//
// Returns an array of {id,label,subject,body}; falls back to the
// hardcoded list when nothing parseable is found. Existing rich
// LinkedIn/Discord templates in the file are ignored — they are not
// mailto-shaped and would produce broken email drafts.
function loadEmailTemplates() {
  if (!existsSync(OUTREACH_TEMPLATES_PATH)) return EMAIL_TEMPLATE_FALLBACKS;
  let text = '';
  try { text = readFileSync(OUTREACH_TEMPLATES_PATH, 'utf-8'); } catch (_) { return EMAIL_TEMPLATE_FALLBACKS; }
  const re = /^###\s+Email\s+Template:\s*(.+?)\s*$([\s\S]*?)(?=^###\s+Email\s+Template:|^##\s|\Z)/gmi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const label = (m[1] || '').trim();
    const block = m[2] || '';
    const subj = block.match(/\*\*Subject:\*\*\s*(.+?)\s*$/m);
    const bodyFence = block.match(/\*\*Body:\*\*\s*\n+```[a-z]*\n([\s\S]*?)\n```/);
    const subject = subj ? subj[1].trim() : '';
    const body = bodyFence ? bodyFence[1].trim() : '';
    if (label && subject && body) {
      out.push({
        id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        label, subject, body,
      });
    }
  }
  return out.length ? out : EMAIL_TEMPLATE_FALLBACKS;
}

// ── Data extraction ───────────────────────────────────────────────

function parseApplications() {
  return parseApplicationsFile(APPLICATIONS_PATH);
}

// ── Per-build report cache ─────────────────────────────────────────
// Each report file is read at most once per build. The 10 getX wrappers
// below resolve to property reads on the cached parsed object, so a row
// that previously triggered ~10 readFileSync calls now triggers one.
// Reset at the top of build() so the cache never persists across builds.
const _reportCache = new Map();
let _reportCacheHits = 0;

function _resetReportCache() {
  _reportCache.clear();
  _reportCacheHits = 0;
}

function readReportOnce(reportPath) {
  if (!reportPath) return null;
  if (_reportCache.has(reportPath)) {
    _reportCacheHits++;
    return _reportCache.get(reportPath);
  }
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) {
    const empty = {
      exists: false, text: '',
      archetype: '', url: '', finalRecommendation: '',
      competitiveEdge: [], tldr: '', positioning: '', comp: '',
      compRaw: '', locationField: '',
      keyGaps: [], topStories: [], whyGapsDontBlock: '',
    };
    _reportCache.set(reportPath, empty);
    return empty;
  }
  const text = readFileSync(fullPath, 'utf-8');
  const parsed = {
    exists: true,
    text,
    archetype: _parseArchetype(text),
    url: _parseUrl(text),
    finalRecommendation: _parseFinalRecommendation(text),
    competitiveEdge: _parseCompetitiveEdge(text),
    tldr: _parseTldr(text),
    positioning: _parsePositioning(text),
    comp: _parseComp(text),
    compRaw: _parseCompRaw(text),
    locationField: _parseLocationField(text),
    keyGaps: _parseKeyGaps(text),
    topStories: _parseTopStories(text),
    whyGapsDontBlock: _parseWhyGapsDontBlock(text),
  };
  _reportCache.set(reportPath, parsed);
  return parsed;
}

function _parseUrl(text) {
  const head = text.slice(0, 3000);
  const m = head.match(/\*\*URL:\*\*\s*(\S+)/);
  return m ? m[1] : '';
}

function _parseArchetype(text) {
  const head = text.slice(0, 4000);
  // Format 1: **Archetype:** A1/A2/B ... (header block)
  const bold = head.match(/\*\*Archetype:\*\*\s*([^\n]+)/);
  // Format 2: | Archetype | A1/A2/B ... | (Block A table row)
  const table = head.match(/\|\s*Archetype\s*\|\s*([^|\n]+?)\s*\|/);
  const raw = (bold?.[1] || table?.[1] || '').replace(/\*\*/g, '');
  if (!raw) return '';
  const tierMatch = raw.match(/\b(A1|A2|B)\b/);
  return tierMatch ? tierMatch[1] : raw.slice(0, 30);
}

function _parseFinalRecommendation(text) {
  const finalIdx = text.indexOf('## Final Recommendation');
  const recIdx = text.indexOf('## Recommendation');
  let idx = -1, headerLen = 0;
  if (finalIdx !== -1) { idx = finalIdx; headerLen = '## Final Recommendation'.length; }
  else if (recIdx !== -1) { idx = recIdx; headerLen = '## Recommendation'.length; }
  if (idx === -1) return '';
  const after = text.slice(idx + headerLen);
  const next = after.indexOf('\n## ');
  const section = next === -1 ? after : after.slice(0, next);
  // First two paragraphs — enough for context without overflow
  const paragraphs = section.trim().split('\n\n').filter(p => p.trim());
  const combined = paragraphs.slice(0, 2).join(' ').replace(/\*\*/g, '').replace(/\n/g, ' ').trim();
  return combined.slice(0, 600);
}

function getReportUrl(reportPath) {
  return readReportOnce(reportPath)?.url || '';
}

function getReportArchetype(reportPath) {
  return readReportOnce(reportPath)?.archetype || '';
}

function getReportFinalRecommendation(reportPath) {
  return readReportOnce(reportPath)?.finalRecommendation || '';
}

// Parse data/overpay-signals/CURRENT.md once per build. Returns:
//   { byCompany: Map<lowercased-company, { posture, stage, confidence }>,
//     updated: ISO timestamp string or '' }
// File format (per scripts/overpay-signals.mjs prompt):
//   ## {Company} — {Role} (score {N})
//   **Equity / IPO posture:** {free text} (confidence: H/M/L)
// Also tolerates a markdown-table variant: a leading row whose first
// cell is the company and a column titled "Equity / IPO posture".
// Missing file → returns empty map; never throws.
// Role-enrichment loader. Reads JSON files from data/role-enrichment/, keyed
// by company+role slug. Schema (per file):
//   { company, role, relocation: {package_summary, amount_estimate_usd, ...},
//     benefits: {401k_match, healthcare, ...}, sentiment: {team_toxicity_grade, ...},
//     people: {likely_recruiter:{name,linkedin_url}, likely_hiring_manager:{...}} }
// Generated by scripts/enrich-roles.mjs (council research).
let _roleEnrichmentCache = null;
function loadRoleEnrichment() {
  if (_roleEnrichmentCache) return _roleEnrichmentCache;
  const map = new Map();
  if (!existsSync(ROLE_ENRICHMENT_DIR)) {
    _roleEnrichmentCache = map;
    return map;
  }
  let files = [];
  try { files = readdirSync(ROLE_ENRICHMENT_DIR).filter(f => f.endsWith('.json')); }
  catch { _roleEnrichmentCache = map; return map; }
  // First pass — load all entries.
  const raws = [];
  for (const f of files) {
    try {
      const obj = JSON.parse(readFileSync(join(ROLE_ENRICHMENT_DIR, f), 'utf-8'));
      if (!obj || !obj.company || !obj.role) continue;
      raws.push(obj);
    } catch (_) {}
  }
  // Tally name appearances across companies — if the same recruiter or hiring
  // manager name shows up at 2+ different companies, it's almost certainly
  // an LLM hallucination ("Sarah Chen", "Alex Rivera" are common 2026
  // failure-mode filler) and we should strip it.
  const nameCompanies = new Map(); // name -> Set<company>
  const tallyName = (name, company) => {
    if (!name || name === 'unknown') return;
    const k = name.toLowerCase().trim();
    if (!nameCompanies.has(k)) nameCompanies.set(k, new Set());
    nameCompanies.get(k).add(String(company || '').toLowerCase());
  };
  for (const o of raws) {
    tallyName(o.people?.likely_recruiter?.name, o.company);
    tallyName(o.people?.likely_hiring_manager?.name, o.company);
  }
  const isHallucinatedName = (name) => {
    if (!name || name === 'unknown') return false;
    const k = name.toLowerCase().trim();
    return (nameCompanies.get(k)?.size || 0) > 1;
  };
  // Synthetic LinkedIn URLs follow `linkedin.com/in/firstname-lastname-{company}`
  // or `firstnamelastname-{company}` — no real profile uses that pattern.
  const isSyntheticLinkedIn = (url, name, company) => {
    if (!url || url === 'unknown') return true;
    if (!/linkedin\.com\/in\//i.test(url)) return true;
    const slug = url.split('/in/')[1]?.split(/[\/?#]/)[0]?.toLowerCase() || '';
    const cLower = String(company || '').toLowerCase().replace(/\s+/g, '');
    if (cLower && slug.includes(cLower)) return true; // company name embedded = LLM-fabricated pattern
    if (name) {
      const nSlug = name.toLowerCase().replace(/[^a-z]/g, '');
      if (slug.replace(/[^a-z]/g, '') === nSlug + cLower) return true;
    }
    return false;
  };
  const sanitizePerson = (p, company) => {
    if (!p) return p;
    const out = { ...p };
    if (isHallucinatedName(out.name)) {
      out.name = 'unknown';
      out.linkedin_url = 'unknown';
      out.rationale = 'Name flagged as likely LLM hallucination (appeared at multiple unrelated companies). Manual LinkedIn search recommended.';
      return out;
    }
    if (out.linkedin_url && isSyntheticLinkedIn(out.linkedin_url, out.name, company)) {
      // Replace fabricated direct link with a real LinkedIn search URL.
      const q = encodeURIComponent(`${out.name} ${company}`);
      out.linkedin_url = `https://www.linkedin.com/search/results/people/?keywords=${q}`;
      out.linkedin_kind = 'search';
    }
    return out;
  };
  // Second pass — sanitize people fields, key + store.
  for (const obj of raws) {
    if (obj.people) {
      obj.people.likely_recruiter = sanitizePerson(obj.people.likely_recruiter, obj.company);
      obj.people.likely_hiring_manager = sanitizePerson(obj.people.likely_hiring_manager, obj.company);
    }
    const key = (obj.company + '|' + obj.role).toLowerCase();
    map.set(key, obj);
  }
  _roleEnrichmentCache = map;
  return map;
}
function getRoleEnrichment(company, role) {
  const map = loadRoleEnrichment();
  const key = String(company || '').toLowerCase() + '|' + String(role || '').toLowerCase();
  if (map.has(key)) return map.get(key);
  // Tolerant fallback — match by company prefix + role prefix.
  const cLower = String(company || '').toLowerCase();
  const rLower = String(role || '').toLowerCase();
  for (const [k, v] of map.entries()) {
    if (k.startsWith(cLower + '|') && rLower.startsWith(v.role.toLowerCase().slice(0, 20))) return v;
  }
  return null;
}

let _overpaySignalsCache = null;
function parseOverpaySignals() {
  if (_overpaySignalsCache) return _overpaySignalsCache;
  const empty = { byCompany: new Map(), updated: '' };
  if (!existsSync(OVERPAY_CURRENT_PATH)) {
    _overpaySignalsCache = empty;
    return empty;
  }
  let text = '';
  let mtime = '';
  try {
    text = readFileSync(OVERPAY_CURRENT_PATH, 'utf-8');
    mtime = statSync(OVERPAY_CURRENT_PATH).mtime.toISOString().slice(0, 10);
  } catch {
    _overpaySignalsCache = empty;
    return empty;
  }
  const byCompany = new Map();
  // Block format: ## Company — Role (score N) ... **Equity / IPO posture:** ...
  const blockRe = /^##\s+([^—\n]+?)\s+—\s+[^\n]*?\n([\s\S]*?)(?=^##\s|\Z)/gm;
  for (const m of text.matchAll(blockRe)) {
    const company = m[1].trim();
    const body = m[2];
    const postureMatch = body.match(/\*\*Equity\s*\/\s*IPO\s+posture:?\*\*\s*([^\n]+)/i);
    if (!postureMatch) continue;
    const raw = postureMatch[1].trim();
    const confMatch = raw.match(/\(confidence:\s*([HML])[^)]*\)\s*$/i);
    const posture = raw.replace(/\s*\(confidence:[^)]+\)\s*$/i, '').trim();
    byCompany.set(company.toLowerCase(), {
      posture,
      confidence: confMatch ? confMatch[1].toUpperCase() : '',
      stage: classifyEquityStage(posture),
    });
  }
  // Tolerant table-format fallback: rows like "| Company | ... | posture text |"
  // where one of the column headers contains "Equity" or "IPO posture".
  if (byCompany.size === 0) {
    const lines = text.split('\n');
    let postureCol = -1;
    let companyCol = -1;
    for (const line of lines) {
      if (!line.includes('|')) continue;
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (postureCol === -1) {
        const idx = cells.findIndex(c => /equity|ipo posture/i.test(c));
        if (idx !== -1) {
          postureCol = idx;
          companyCol = cells.findIndex(c => /^company$/i.test(c));
          if (companyCol === -1) companyCol = 0;
        }
        continue;
      }
      if (/^[-:|\s]+$/.test(line)) continue;
      if (cells.length <= postureCol) continue;
      const company = cells[companyCol];
      const posture = cells[postureCol];
      if (!company || !posture || /^equity|^ipo|^company$/i.test(company)) continue;
      byCompany.set(company.toLowerCase(), {
        posture,
        confidence: '',
        stage: classifyEquityStage(posture),
      });
    }
  }
  _overpaySignalsCache = { byCompany, updated: mtime };
  return _overpaySignalsCache;
}

// Map free-text posture → one of: 'late', 'cd', 'b', 'seed-a', 'public', 'unknown'
// Order matters: more specific signals win (e.g. "late-stage pre-IPO" → 'late',
// not 'b' just because the word "B" appears in "$1B"). Pre-IPO checks run BEFORE
// the public check because phrases like "no public tender" / "weighing IPO Q4"
// would otherwise false-positive into 'public'. Anthropic Series G + "no public
// tender or IPO timeline" was the canonical bug that motivated this ordering.
function classifyEquityStage(posture) {
  if (!posture) return 'unknown';
  const t = posture.toLowerCase();
  // 1. Pre-IPO Late-stage signals first — Series E/F/G/H, "pre-IPO", "late-stage"
  //    Most frontier AI labs (OpenAI/Anthropic/xAI/Mistral/Sierra/Cursor/etc) live
  //    here and their posture text often contains the word "public" in negation.
  if (/\bseries\s*[efgh]\b|series\s*d\+|\blate[\s-]?stage\b|\bpre-?ipo\b/.test(t)) return 'late';
  if (/\bseries\s*c\b|\bseries\s*d\b/.test(t)) return 'cd';
  if (/\bseries\s*b\b/.test(t)) return 'b';
  if (/\bseries\s*a\b|\bseed\b/.test(t)) return 'seed-a';
  // 2. True public signals — must be a CONFIRMED listing, not a negated reference.
  //    Negative lookbehind blocks "no public", "non-public", "not public".
  //    "ipo'd" / "post-ipo" / explicit exchange names are the strongest tells.
  if (/\bipo(?:'?d|ed)\b|post-?ipo|\b(?:listed|trading)\s+on\b|\bnyse\s*:\s*\w|\bnasdaq\s*:\s*\w/.test(t)) return 'public';
  if (/(?<!\b(?:no|non|not|never|without)[\s-])\bpublic(ly)?\s+(?:traded|listed|company|markets?)\b/.test(t)) return 'public';
  return 'unknown';
}

const EQUITY_STAGE_META = {
  'late':    { label: 'Pre-IPO Late', emoji: '🟢', cls: 'eq-late' },
  'cd':      { label: 'Pre-IPO C/D',  emoji: '🟢', cls: 'eq-cd' },
  'b':       { label: 'Pre-IPO B',    emoji: '🟡', cls: 'eq-b' },
  'seed-a':  { label: 'Pre-IPO Seed/A', emoji: '🟣', cls: 'eq-seed' },
  'public':  { label: 'Public',       emoji: '🔵', cls: 'eq-public' },
  'unknown': { label: 'Unknown',      emoji: '⚪', cls: 'eq-unknown' },
};

function getEquityForCompany(company) {
  if (!company) return null;
  const { byCompany } = parseOverpaySignals();
  return byCompany.get(company.toLowerCase()) || null;
}

// Render the equity-stage badge (table cell content). Returns either an em-dash
// span (no entry) or a colored chip with hover tooltip showing posture + as-of.
function equityBadge(company) {
  const data = getEquityForCompany(company);
  const { updated } = parseOverpaySignals();
  if (!data) {
    const tip = updated
      ? `No equity posture entry for ${company || 'this company'} (overpay-signals as of ${updated}).`
      : 'data/overpay-signals/CURRENT.md not present yet — run scripts/overpay-signals.mjs to populate.';
    const detail = JSON.stringify({
      kind: 'equity', company: company || '', stage: 'unknown', posture: '',
      confidence: '', updated: updated || '', empty: true, hint: tip,
    });
    return `<span class="equity-badge equity-badge-empty pill-popover-trigger" title="${escape(tip)}" aria-label="${escape(tip)}" tabindex="0" role="button" data-pill='${escape(detail)}' onclick="openPillPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPillPopover(this)}">—</span>`;
  }
  const meta = EQUITY_STAGE_META[data.stage] || EQUITY_STAGE_META.unknown;
  const tipParts = [data.posture];
  if (data.confidence) tipParts.push(`Confidence: ${data.confidence}`);
  if (updated) tipParts.push(`As of ${updated}`);
  const tip = tipParts.join(' · ');
  const detail = JSON.stringify({
    kind: 'equity', company: company || '', stage: data.stage,
    label: meta.label, emoji: meta.emoji, posture: data.posture || '',
    confidence: data.confidence || '', sources: data.sources || [],
    updated: updated || '', empty: false,
  });
  return `<span class="equity-badge ${meta.cls} pill-popover-trigger" data-equity-stage="${meta.cls}" title="${escape(tip)}" aria-label="${escape(`${meta.label}: ${tip}`)}" tabindex="0" role="button" data-pill='${escape(detail)}' onclick="openPillPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPillPopover(this)}">${meta.emoji} ${escape(meta.label)}</span>`;
}

// ── Base salary parsing + cell rendering ─────────────────────────────────────
// Tolerant parser for the Block A "Comp" cell. Reports vary wildly:
//   "$200,000 – $345,000 USD base + equity"
//   "$252K – $335K base + Equity"
//   "$160K–$200K base + 60/40 bonus split"
//   "€190,000–€215,000 EUR base"
//   "AUD $300-450K total comp ≈ USD $200-300K"
//   "Not disclosed in JD"
// Returns { min, max, currency, isTotalComp, raw } in $K (USD-equivalent
// when the cell flags an explicit USD bracket inside an FX hedge), or null
// if no parseable range was found.
function parseBaseSalary(rawComp) {
  if (!rawComp || typeof rawComp !== 'string') return null;
  const text = rawComp.replace(/[*_`]/g, '');
  // Prefer an explicit "USD $X-Y" bracket when the cell is an FX hedge
  // ("AUD $300-450K total comp ≈ USD $200-300K"). The USD bracket is the
  // one Mitchell cares about for floor compliance.
  const usdHedge = text.match(/USD\s*\$?\s*(\d{2,4})\s*[-–—]\s*\$?\s*(\d{2,4})\s*K/i);
  if (usdHedge) {
    const min = parseInt(usdHedge[1], 10);
    const max = parseInt(usdHedge[2], 10);
    if (min >= 30 && max <= 1500 && min <= max) {
      return { min, max, currency: 'USD', isTotalComp: /total\s*comp/i.test(text), raw: rawComp };
    }
  }
  // Range with K suffix on EITHER number (or both):
  //   "$200K-$280K"  | "$200-$280K"  | "$200K-280K"  | "$200-280K"
  // Greedy form: K must appear after at least the second number, optional on first.
  const kRange = text.match(/[\$€£]\s*(\d{2,4})\s*(?:K)?\s*[\-–—]\s*[\$€£]?\s*(\d{2,4})\s*K/i);
  if (kRange) {
    const min = parseInt(kRange[1], 10);
    const max = parseInt(kRange[2], 10);
    if (min >= 30 && max <= 1500 && min <= max) {
      const currency = /€/.test(text) ? 'EUR' : /£/.test(text) ? 'GBP' : 'USD';
      return { min, max, currency, isTotalComp: /total\s*comp|TC\b/i.test(text), raw: rawComp };
    }
  }
  // Reverse: K on first only (`$197K-$278`). Less common but seen.
  const kRangeRev = text.match(/[\$€£]\s*(\d{2,4})\s*K\s*[\-–—]\s*[\$€£]?\s*(\d{2,4})\b(?!\s*K)/i);
  if (kRangeRev) {
    const min = parseInt(kRangeRev[1], 10);
    const max = parseInt(kRangeRev[2], 10);
    if (min >= 30 && max <= 1500 && min <= max) {
      const currency = /€/.test(text) ? 'EUR' : /£/.test(text) ? 'GBP' : 'USD';
      return { min, max, currency, isTotalComp: /total\s*comp|TC\b/i.test(text), raw: rawComp };
    }
  }
  // Long-form range: "$200,000 – $345,000" (assume USD if $)
  const longRange = text.match(/[\$€£]\s*(\d{2,3})[,.](\d{3})\s*[\-–—]\s*[\$€£]?\s*(\d{2,3})[,.](\d{3})/);
  if (longRange) {
    const min = parseInt(longRange[1] + longRange[2], 10);
    const max = parseInt(longRange[3] + longRange[4], 10);
    if (min >= 30000 && max <= 1500000 && min <= max) {
      const currency = /€/.test(text) ? 'EUR' : /£/.test(text) ? 'GBP' : 'USD';
      return {
        min: Math.round(min / 1000), max: Math.round(max / 1000),
        currency, isTotalComp: /total\s*comp/i.test(text), raw: rawComp,
      };
    }
  }
  // Single $K figure (rare but possible): "$220K base"
  const single = text.match(/[\$€£]\s*(\d{2,4})\s*K\b/i);
  if (single) {
    const n = parseInt(single[1], 10);
    if (n >= 30 && n <= 1500) {
      const currency = /€/.test(text) ? 'EUR' : /£/.test(text) ? 'GBP' : 'USD';
      return { min: n, max: n, currency, isTotalComp: /total\s*comp/i.test(text), raw: rawComp };
    }
  }
  return null;
}

// ── Server-side COL / FX badge (mirrors client colBadge in buildTable) ──────
const _SRV_COL = {
  seattle: 100, bellevue: 100,
  'san francisco': 122, 'palo alto': 118,
  'new york': 118, nyc: 118,
  austin: 88, boston: 108, chicago: 94, dc: 103, washington: 103,
  london: 99, paris: 86, berlin: 78, amsterdam: 91,
  dublin: 90, singapore: 95, toronto: 91, montreal: 82,
  munich: 82, zurich: 135, zürich: 135,
};
const _SRV_FX = { USD: 1, EUR: 1.12, GBP: 1.28, CAD: 0.73, SGD: 0.75, CHF: 1.15 };

function serverColBadge(parsed, locationRaw) {
  if (!parsed || parsed.currency === 'USD') return '';
  const fx = _SRV_FX[parsed.currency] || 1;
  // parsed.min/max are already in $K units (e.g. 107 = €107K)
  const midK = (parsed.min + parsed.max) / 2;
  const usdK = Math.round(midK * fx);
  const locLow = (locationRaw || '').toLowerCase();
  let locCol = null; let locName = '';
  for (const [k, v] of Object.entries(_SRV_COL)) {
    if (locLow.includes(k)) { locCol = v; locName = k; break; }
  }
  if (!locCol) {
    return `<span class="col-badge" title="FX: ${parsed.currency}→USD">≈&thinsp;$${usdK}K USD</span>`;
  }
  const seattleK = Math.round(usdK * (100 / locCol));
  const delta = Math.round((seattleK - usdK) / usdK * 100);
  const color = delta >= 0 ? 'var(--green-fg)' : 'var(--orange-fg,#b45309)';
  const arrow = delta >= 0 ? '↑' : '↓';
  const sign  = delta >= 0 ? '+' : '';
  const note  = delta >= 0
    ? `Cheaper COL in ${locName} — buys more than $${usdK}K in Seattle`
    : `Higher COL in ${locName} — buys less than $${usdK}K in Seattle`;
  return `<span class="col-badge" style="color:${color}" title="Pre-tax. ${note}. COL: ${locName}=${locCol} vs Seattle=100">≈&thinsp;$${usdK}K USD · $${seattleK}K Seattle equiv ${arrow}${sign}${Math.abs(delta)}% QOL</span>`;
}

// Render the Base Salary table cell. Color tiers (Mitchell's targets):
//   ≥ targetMin (default $200K) — green
//   ≥ floor (default $175K) — amber
//   <  floor — red
//   no data — grey em-dash
function renderBaseCell(reportPath, floors, locationRaw) {
  const compRaw = getCompRaw(reportPath);
  const parsed = parseBaseSalary(compRaw);
  if (!parsed) {
    const tip = compRaw
      ? `Comp not parsed: ${compRaw.slice(0, 160)}`
      : 'Comp not parsed — see report';
    const detail = JSON.stringify({
      kind: 'base', empty: true, raw: compRaw || '', hint: tip,
    });
    return `<span class="base-chip base-chip-empty pill-popover-trigger" title="${escape(tip)}" aria-label="${escape(tip)}" tabindex="0" role="button" data-pill='${escape(detail)}' onclick="openPillPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPillPopover(this)}">—</span>`;
  }
  const { min, max, currency, isTotalComp } = parsed;
  let cls = 'base-chip-unknown';
  if (currency === 'USD') {
    if (min >= floors.targetMin) cls = 'base-chip-strong';
    else if (min >= 150) cls = 'base-chip-mid';
    else cls = 'base-chip-weak';
  } else {
    cls = 'base-chip-fx';
  }
  const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  const label = `${symbol}${min}K`;
  const range = min === max ? label : `${label}–${symbol}${max}K`;
  const tipParts = [
    `${range}${currency !== 'USD' ? ` ${currency}` : ''}`,
    isTotalComp ? 'total comp (not base)' : 'base salary',
  ];
  const tip = tipParts.join(' · ');
  const detail = JSON.stringify({
    kind: 'base', empty: false, min, max, currency, isTotalComp,
    range, label, raw: compRaw || '',
    floors: { target: floors.targetMin, floor: 175 },
  });
  const chip = `<span class="base-chip ${cls} pill-popover-trigger" data-base-min="${min}" title="${escape(tip)}" aria-label="${escape(tip)}" tabindex="0" role="button" data-pill='${escape(detail)}' onclick="openPillPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPillPopover(this)}">${escape(label)}</span>`;
  const badge = serverColBadge(parsed, locationRaw || '');
  return badge ? `<span class="base-fx-wrap">${chip}${badge}</span>` : chip;
}

// ── Location classification + cell rendering ────────────────────────────────
// Mitchell's preferred metros — sourced from config/profile.yml's
// compensation.location_flexibility narrative + the user's task spec.
// Stored as { canonical, aliases } so we can match short forms ("NYC")
// and long ("New York City").
const PREFERRED_LOCATIONS = [
  { canonical: 'Seattle', aliases: ['seattle', 'bellevue'] },
  { canonical: 'Chicago', aliases: ['chicago'] },
  { canonical: 'Dallas', aliases: ['dallas', 'fort worth', 'dfw'] },
  { canonical: 'NYC', aliases: ['nyc', 'new york', 'new york city', 'manhattan', 'brooklyn'] },
  { canonical: 'Portland', aliases: ['portland'] },
  { canonical: 'SF', aliases: ['san francisco', 'sf', 'bay area', 'south bay', 'palo alto', 'mountain view', 'menlo park', 'redwood city', 'san mateo'] },
  { canonical: 'Mexico City', aliases: ['mexico city', 'cdmx', 'ciudad de méxico'] },
  { canonical: 'Cuenca', aliases: ['cuenca'] },
  { canonical: 'Medellín', aliases: ['medellín', 'medellin'] },
  { canonical: 'London', aliases: ['london'] },
  { canonical: 'Dublin', aliases: ['dublin'] },
  { canonical: 'Glasgow', aliases: ['glasgow'] },
  { canonical: 'Berlin', aliases: ['berlin'] },
  { canonical: 'Lisbon', aliases: ['lisbon', 'lisboa'] },
  { canonical: 'Porto', aliases: ['porto'] },
  { canonical: 'Madrid', aliases: ['madrid'] },
  { canonical: 'Barcelona', aliases: ['barcelona'] },
  { canonical: 'Bilbao', aliases: ['bilbao'] },
  { canonical: 'San Sebastián', aliases: ['san sebastián', 'san sebastian', 'donostia'] },
  { canonical: 'Chiang Mai', aliases: ['chiang mai'] },
  { canonical: 'Chiang Rai', aliases: ['chiang rai'] },
];

// Classify a Block A "Location" / "Remote" field into a structured shape:
//   { kind: 'remote'|'hybrid'|'onsite'|'unknown',
//     city: 'Preferred canonical name' | extracted city string | '',
//     status: 'preferred'|'remote'|'outside'|'unknown' }
function classifyLocation(rawField, role) {
  const blob = `${rawField || ''} ${role || ''}`;
  const lc = blob.toLowerCase();
  // Detect kind. Order matters: "hybrid" wins over "remote" when both
  // appear because hybrid ⟹ partial onsite.
  let kind = 'unknown';
  if (/\bhybrid\b/.test(lc)) kind = 'hybrid';
  else if (/\bon-?site\b|\bin-person\b|\bin\s+office\b|\bonsite\b/.test(lc)) kind = 'onsite';
  else if (/\bremote\b/.test(lc) && !/no\s+remote|not\s+remote/.test(lc)) kind = 'remote';

  // Find a preferred-metro match. Reports typically lead with the city
  // ("Austin, TX (onsite per JD; ... Mitchell would relocate from Seattle ...)")
  // and then narrate. We match against the leading segment first to avoid
  // misclassifying a role's actual city as Seattle just because Mitchell's
  // current city is named in the narrative. Falls back to whole-blob.
  const leading = (rawField || '').split(/[—|;.()]/)[0] || '';
  let canonical = '';
  const findIn = (haystack) => {
    for (const loc of PREFERRED_LOCATIONS) {
      for (const alias of loc.aliases) {
        // \b boundaries so "fort worth" doesn't match inside "Fortworth Cleaners"
        const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (re.test(haystack)) return loc.canonical;
      }
    }
    return '';
  };
  canonical = findIn(leading) || findIn(blob);

  // Extract a fallback city if no preferred match — first capitalized token
  // sequence in the raw field is often the city ("Munich, Germany — hybrid").
  let extractedCity = '';
  if (!canonical && rawField) {
    const m = rawField.match(/^([A-Z][A-Za-zÀ-ÿ' .]+?)(?=[\s,;—\-(/]|$)/);
    if (m && m[1].length <= 30 && !/^(Hybrid|Remote|On|Onsite|Not|None|Open)$/i.test(m[1])) {
      extractedCity = m[1].trim();
    }
  }

  // Status (drives color):
  //   remote    -> blue (location-agnostic, Mitchell prefers)
  //   preferred -> green (city is in PREFERRED_LOCATIONS)
  //   outside   -> amber (specific city, not preferred)
  //   unknown   -> grey (no signal)
  let status = 'unknown';
  if (kind === 'remote' && !canonical) status = 'remote';
  else if (canonical) status = 'preferred';
  else if (extractedCity) status = 'outside';
  else if (kind === 'remote') status = 'remote';

  return { kind, city: canonical || extractedCity, status, raw: rawField };
}

function renderLocationCell(reportPath, company, role) {
  const rawField = getLocationField(reportPath);
  const enrich = company ? getRoleEnrichment(company, role) : null;
  const reloc = enrich?.relocation || null;
  if (!rawField) {
    const detail = JSON.stringify({ kind: 'location', empty: true, raw: '', hint: 'Location not parsed — see report', relocation: reloc });
    return `<span class="location-chip location-chip-empty pill-popover-trigger" title="Location not parsed — see report" aria-label="Location not parsed — see report" tabindex="0" role="button" data-pill='${escape(detail)}' onclick="openPillPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPillPopover(this)}">—</span>`;
  }
  const cls = classifyLocation(rawField, '');
  let icon = '';
  let label = '';
  let chipCls = '';
  if (cls.kind === 'remote' && !cls.city) {
    icon = '🏠'; label = 'Remote'; chipCls = 'location-chip-remote';
  } else if (cls.kind === 'remote' && cls.city) {
    icon = '🏠'; label = `Remote (${cls.city})`; chipCls = cls.status === 'preferred' ? 'location-chip-preferred' : 'location-chip-remote';
  } else if (cls.kind === 'hybrid') {
    icon = '🌐'; label = cls.city ? `Hybrid (${cls.city})` : 'Hybrid';
    chipCls = cls.status === 'preferred' ? 'location-chip-preferred' : cls.status === 'outside' ? 'location-chip-outside' : 'location-chip-unknown';
  } else if (cls.kind === 'onsite') {
    icon = '🏢'; label = cls.city || 'On-site';
    chipCls = cls.status === 'preferred' ? 'location-chip-preferred' : cls.status === 'outside' ? 'location-chip-outside' : 'location-chip-unknown';
  } else {
    icon = '📍'; label = cls.city || rawField.slice(0, 24);
    chipCls = cls.status === 'preferred' ? 'location-chip-preferred' : cls.status === 'outside' ? 'location-chip-outside' : 'location-chip-unknown';
  }
  const tip = rawField.slice(0, 200);
  const detail = JSON.stringify({
    kind: 'location', empty: false, icon, label, chipCls,
    raw: rawField, kindLabel: cls.kind, status: cls.status, city: cls.city || '',
    relocation: reloc, // {package_summary, amount_estimate_usd, policy_notes, sources}
  });
  // Mark chip with a small "✈" if relocation data exists, so the user knows
  // the popover has extra detail beyond plain location.
  const reloMark = reloc ? '<span class="location-relo-mark" title="Relocation package data available" aria-hidden="true">✈</span>' : '';
  return `<span class="location-chip ${chipCls} pill-popover-trigger" data-location-status="${cls.status}" title="${escape(tip)}" aria-label="${escape(`${label}: ${tip}`)}" tabindex="0" role="button" data-pill='${escape(detail)}' onclick="openPillPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPillPopover(this)}">${icon} ${escape(label)}${reloMark}</span>`;
}

// Benefits cell: shows a single primary signal (toxicity grade or "—") with
// a popover that expands to the full breakdown (401k, healthcare, sentiment,
// mental health, etc.). Empty when no data/role-enrichment/{slug}.json exists.
function renderBenefitsCell(company, role) {
  const enrich = getRoleEnrichment(company, role);
  if (!enrich || (!enrich.benefits && !enrich.sentiment)) {
    const detail = JSON.stringify({ kind: 'benefits', empty: true, hint: 'No enrichment data yet — run scripts/enrich-roles.mjs to populate.' });
    return `<span class="benefits-chip benefits-chip-empty pill-popover-trigger" title="No benefits data yet" aria-label="No benefits data yet" tabindex="0" role="button" data-pill='${escape(detail)}' onclick="openPillPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPillPopover(this)}">—</span>`;
  }
  const tox = parseInt(enrich.sentiment?.team_toxicity_grade, 10);
  const toxValid = Number.isFinite(tox) && tox >= 1 && tox <= 5;
  // Color tier — 1=healthiest=green, 5=avoid=red. Sort key piggy-backs on toxicity.
  let toxCls = 'benefits-chip-unknown';
  let toxIcon = '⚪';
  if (toxValid) {
    toxCls = tox <= 1 ? 'benefits-chip-strong'
           : tox <= 2 ? 'benefits-chip-mid'
           : tox <= 3 ? 'benefits-chip-neutral'
           : tox <= 4 ? 'benefits-chip-weak'
           : 'benefits-chip-bad';
    toxIcon = tox <= 1 ? '🟢' : tox <= 2 ? '🟢' : tox <= 3 ? '🟡' : tox <= 4 ? '🟠' : '🔴';
  }
  const label = toxValid ? `${toxIcon} ${tox}/5` : `${toxIcon} ?/5`;
  const tip = `Team health: ${toxValid ? tox + '/5 (1=healthy, 5=avoid)' : 'unknown'} · click for full benefits breakdown`;
  const detail = JSON.stringify({
    kind: 'benefits',
    empty: false,
    company,
    role,
    benefits: enrich.benefits || {},
    sentiment: enrich.sentiment || {},
    social: enrich.social_corroboration || null,
    biweekly_math: enrich.biweekly_math || null,
    confidence: enrich.confidence || '',
  });
  return `<span class="benefits-chip ${toxCls} pill-popover-trigger" data-tox-grade="${toxValid ? tox : ''}" title="${escape(tip)}" aria-label="${escape(tip)}" tabindex="0" role="button" data-pill='${escape(detail)}' onclick="openPillPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPillPopover(this)}">${escape(label)}</span>`;
}

// People cell: shows recruiter + hiring-manager LinkedIn links. Compact chip
// with a 👤 icon; popover expands to both names with rationale.
function renderPeopleCell(company, role) {
  const enrich = getRoleEnrichment(company, role);
  const people = enrich?.people || null;
  // Pull network signal — Mitchell's 1st + 2nd-degree LinkedIn contacts at
  // this company. Loaded lazily; safe-no-op if data/linkedin/Connections.csv
  // is absent.
  const network = _networkAtCompanySafe(company);
  const has1st = network && network.firstDegreeCount > 0;
  const has2nd = network && network.secondDegreeCount > 0;
  const has_research = !!(people && (people.likely_recruiter?.name || people.likely_hiring_manager?.name));
  // Empty state requires NO research AND NO network signal.
  if (!has_research && !has1st && !has2nd) {
    const detail = JSON.stringify({ kind: 'people', empty: true, hint: 'No recruiter/hiring-manager research yet — run scripts/enrich-roles.mjs.' });
    return `<span class="people-chip people-chip-empty pill-popover-trigger" title="No people data yet" aria-label="No people data yet" tabindex="0" role="button" data-pill='${escape(detail)}' onclick="openPillPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPillPopover(this)}">—</span>`;
  }
  const rec = people?.likely_recruiter?.name && people.likely_recruiter.name !== 'unknown' ? '👤' : '';
  const hm  = people?.likely_hiring_manager?.name && people.likely_hiring_manager.name !== 'unknown' ? '👔' : '';
  // 🤝 prefix shows network count when ≥1 first-degree contacts exist —
  // primary visual signal because warm intros beat cold outreach.
  const networkMark = has1st ? `🤝${network.firstDegreeCount} ` : (has2nd ? `🤝²${network.secondDegreeCount} ` : '');
  const labelMark = `${networkMark}${rec}${hm}`.trim() || '?';
  const tipParts = [];
  if (has1st) tipParts.push(`${network.firstDegreeCount} 1st-degree`);
  if (has2nd) tipParts.push(`${network.secondDegreeCount} 2nd-degree`);
  if (has_research) tipParts.push('recruiter/HM intel');
  const tip = `Click for ${tipParts.join(' + ')}`;
  const detail = JSON.stringify({
    kind: 'people',
    empty: false,
    company,
    role,
    recruiter: people?.likely_recruiter || {},
    hiring_manager: people?.likely_hiring_manager || {},
    network: network || null,
    confidence: enrich?.confidence || '',
  });
  return `<span class="people-chip pill-popover-trigger" title="${escape(tip)}" aria-label="${escape(tip)}" tabindex="0" role="button" data-pill='${escape(detail)}' onclick="openPillPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openPillPopover(this)}">${escape(labelMark)}</span>`;
}

// Safe wrapper — returns null if the CSV is absent so the dashboard
// builds cleanly without the LinkedIn export in place.
function _networkAtCompanySafe(company) {
  try {
    const s = _linkedInNetworkSummary(company);
    if (!s || (s.firstDegreeCount === 0 && s.secondDegreeCount === 0)) return null;
    return s;
  } catch { return null; }
}

// Render a single report's markdown to a self-contained HTML page that
// opens in the browser with the formatting already applied. Output lands
// in dashboard/reports/{slug}.html so the dashboard can link to it
// directly (no Cursor required, no key-shortcut needed).
function renderReportToHtml(reportPath, outputDir) {
  if (!reportPath) return null;
  const fullPath = join(ROOT, reportPath);
  if (!existsSync(fullPath)) return null;
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const md = readFileSync(fullPath, 'utf-8');
  marked.setOptions({ gfm: true, breaks: false });

  // Pull the title from the first H1 if present
  const title = (md.match(/^#\s+(.+)/) || [])[1] || basename(reportPath, '.md');

  // Split the markdown into: title, header-metadata block, body. The
  // header is the run of `**Key:** value` lines between the H1 and the
  // first `---` or first `## ` section heading. We extract those into a
  // structured info-card and remove them from the body before marked
  // renders it (so they don't render as a wall-of-text paragraph).
  const lines = md.split('\n');
  let bodyStart = 0;
  let h1Idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (h1Idx === -1 && lines[i].match(/^#\s+/)) { h1Idx = i; continue; }
    if (h1Idx >= 0 && (lines[i].trim() === '---' || lines[i].match(/^##\s/))) {
      bodyStart = i;
      break;
    }
  }
  if (bodyStart === 0) bodyStart = h1Idx + 1;

  const headerLines = lines.slice(h1Idx + 1, bodyStart);
  const bodyLines = lines.slice(bodyStart);

  // Parse `**Key:** value` pairs. A value may run over multiple lines,
  // so we accumulate until the next `**Key:**` line or blank line.
  const meta = [];
  let current = null;
  for (const line of headerLines) {
    const m = line.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    if (m) {
      if (current) meta.push(current);
      current = { key: m[1].trim(), value: m[2].trim() };
    } else if (current && line.trim()) {
      current.value += ' ' + line.trim();
    }
  }
  if (current) meta.push(current);

  // Render the body (post-header) with marked
  const body = marked.parse(bodyLines.join('\n'));

  // Build the structured header card. Score gets a colored badge.
  const metaCard = meta.length === 0 ? '' : `
<div class="meta-card">
  <table class="meta-table">
    ${meta.map(m => {
      let valHtml = escape(m.value);
      // Render URL value as a clickable link
      if (m.key.toLowerCase() === 'url' && /^https?:\/\//.test(m.value)) {
        valHtml = `<a href="${escape(m.value)}" target="_blank" rel="noopener">${escape(m.value)}</a>`;
      }
      // Score gets a green badge
      if (m.key.toLowerCase() === 'score') {
        const scoreNum = parseFloat((m.value.match(/(\d+(?:\.\d+)?)/) || [])[1] || 0);
        const cls = scoreNum >= 4.0 ? 'score-strong' : scoreNum >= 3.0 ? 'score-moderate' : 'score-weak';
        valHtml = `<span class="badge ${cls}" style="font-size:14px">${escape(m.value)}</span>`;
      }
      // Legitimacy gets color-coded
      if (m.key.toLowerCase() === 'legitimacy') {
        const v = m.value.toLowerCase();
        const cls = v.includes('high') ? 'score-strong' : v.includes('proceed') ? 'score-moderate' : 'score-weak';
        valHtml = `<span class="badge ${cls}">${escape(m.value)}</span>`;
      }
      return `<tr><th>${escape(m.key)}</th><td>${valHtml}</td></tr>`;
    }).join('\n    ')}
  </table>
</div>`;

  const inner = metaCard + body;

  // Visual identity: matches the dashboard's mission-control palette
  // (dark cobalt-slate, matrix-green accent, space backdrop). Same fonts,
  // same chip colors, same nav chrome. Tokens come from
  // lib/dashboard-tokens.mjs so the dashboard, the report HTML, and
  // the heartbeat email stay in sync as one product line.
  const wrapped = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(title)} · Career-Ops</title>
<meta name="color-scheme" content="dark">
<style>
  :root {
    --bg: #06070d;
    --surface: #11131c;
    --surface-2: #181b27;
    --border: #232737;
    --border-strong: #353a52;
    --text: #fafafa;
    --text-2: #e4e4e7;
    --text-3: #b8b8c0;
    --text-4: #9a9aa6;
    --green: #4ade80;
    --green-fg: #86efac;
    --green-fg-dark: #bbf7d0;
    --green-bg: rgba(22,163,74,0.12);
    --green-border: rgba(22,163,74,0.30);
    --blue-fg: #94a3b8;
    --amber-fg: #d4ba84;
    --amber-bg: rgba(168,123,72,0.14);
    --red-fg: #fca5a5;
    --red-bg: rgba(220,38,38,0.12);
    --font-ui: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
    --font-mono: 'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  body {
    font-family: var(--font-ui);
    color: var(--text-2); background: var(--bg);
    background-image:
      radial-gradient(ellipse 1200px 600px at 12% -10%, rgba(64, 224, 208, 0.06), transparent 60%),
      radial-gradient(ellipse 900px 500px at 88% 110%, rgba(139, 92, 246, 0.05), transparent 65%),
      radial-gradient(ellipse 700px 400px at 50% 50%, rgba(0, 255, 157, 0.025), transparent 70%);
    background-attachment: fixed;
    max-width: 920px;
    margin: 24px auto; padding: 24px 32px; line-height: 1.6; font-size: 15px;
    -webkit-font-smoothing: antialiased;
  }
  h1 {
    font-size: 28px; margin: 0 0 12px; padding-bottom: 10px;
    border-bottom: 2px solid var(--border-strong);
    color: var(--green-fg-dark); letter-spacing: -0.01em; font-weight: 700;
    text-shadow: 0 0 16px rgba(74,222,128,0.18);
  }
  h2 {
    font-size: 22px; margin: 30px 0 12px; padding: 0 0 6px 12px;
    color: var(--text); border-left: 3px solid var(--green-fg);
    font-weight: 700; letter-spacing: -0.01em;
  }
  h3 { font-size: 17px; margin: 20px 0 8px; color: var(--text); font-weight: 600; }
  p { color: var(--text-2); }
  table {
    border-collapse: separate; border-spacing: 0;
    width: 100%; margin: 16px 0; font-size: 14px;
    background: var(--surface);
    border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  }
  th {
    text-align: left; padding: 10px 14px;
    background: var(--surface-2); color: var(--text-3);
    font-weight: 600; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 10px 14px; vertical-align: top;
    color: var(--text-2);
    border-bottom: 1px solid var(--border);
  }
  tr:last-child td { border-bottom: none; }
  blockquote {
    margin: 16px 0; padding: 14px 18px;
    border-left: 3px solid var(--green-fg);
    background: var(--surface);
    color: var(--text-2); border-radius: 0 8px 8px 0;
  }
  code {
    background: var(--surface-2); padding: 2px 6px; border-radius: 4px;
    font-family: var(--font-mono); font-size: 13px;
    color: var(--green-fg); border: 1px solid var(--border);
  }
  pre {
    background: var(--surface); padding: 14px; border-radius: 8px;
    overflow-x: auto; border: 1px solid var(--border);
  }
  pre code { background: transparent; padding: 0; border: none; color: var(--text-2); }
  a {
    color: var(--green-fg); text-decoration: none;
    border-bottom: 1px dotted transparent;
    transition: border-color .12s, color .12s;
  }
  a:hover { color: var(--green-fg-dark); border-bottom-color: var(--green-fg-dark); }
  ul, ol { padding-left: 24px; color: var(--text-2); }
  li { margin: 4px 0; }
  hr {
    border: 0; height: 1px;
    background: linear-gradient(90deg, transparent 0%, var(--border) 50%, transparent 100%);
    margin: 28px 0;
  }
  strong { color: var(--text); font-weight: 600; }
  /* Mission-control header strip, matching the dashboard's hero look */
  .nav-back {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 18px; padding: 10px 14px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    font-size: 12px; color: var(--text-3);
    letter-spacing: 0.04em;
  }
  .nav-back .brand-eyebrow {
    font-size: 10px; text-transform: uppercase; font-weight: 700;
    letter-spacing: 0.18em; color: var(--green-fg);
  }
  .nav-back .nav-spacer { flex: 1; }
  .nav-back a {
    color: var(--green-fg); border-bottom: none;
    font-weight: 500;
  }
  .nav-back a:hover { color: var(--green-fg-dark); text-decoration: underline; }
  /* Block A meta card — same chrome as the dashboard's stat cards */
  .meta-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px 18px; margin: 16px 0 24px;
    box-shadow: 0 1px 0 rgba(0,0,0,0.20);
  }
  .meta-table { width: 100%; margin: 0; font-size: 14px; background: transparent; border: none; }
  .meta-table th {
    text-align: left; padding: 10px 18px 10px 0;
    vertical-align: top; font-weight: 600;
    color: var(--text-4); width: 150px; white-space: nowrap;
    background: transparent;
    border-bottom: 1px solid var(--border);
    text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em;
  }
  .meta-table td {
    padding: 10px 0; vertical-align: top;
    background: transparent;
    border-bottom: 1px solid var(--border);
    color: var(--text-2);
    font-family: var(--font-mono); font-size: 13px;
  }
  .meta-table tr:last-child th, .meta-table tr:last-child td { border-bottom: none; }
  .meta-table .badge {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 600; font-family: var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .meta-table .score-strong   { background: var(--green-bg);  color: var(--green-fg); border: 1px solid var(--green-border); }
  .meta-table .score-moderate { background: var(--amber-bg);  color: var(--amber-fg); }
  .meta-table .score-weak     { background: var(--red-bg);    color: var(--red-fg);   }
  @media (max-width: 720px) {
    body { padding: 16px 14px; margin: 12px auto; font-size: 14px; }
    h1 { font-size: 22px; } h2 { font-size: 18px; } h3 { font-size: 15px; }
    .meta-table th { width: 110px; }
  }
</style>
</head>
<body>
<div class="nav-back">
  <span class="brand-eyebrow">⚡ Career-Ops</span>
  <span class="nav-spacer"></span>
  <a href="../index.html">← Back to dashboard</a>
</div>
${inner}
<hr>
<div class="nav-back">
  <span class="brand-eyebrow">Report · ${escape(basename(reportPath, '.md'))}</span>
  <span class="nav-spacer"></span>
  <a href="../index.html">← Back to dashboard</a>
  <span style="color:var(--text-4)">·</span>
  <a href="file://${ROOT}/${reportPath}">Open raw markdown</a>
</div>
</body>
</html>`;

  const outName = basename(reportPath).replace(/\.md$/, '.html');
  const outPath = join(outputDir, outName);
  writeFileSync(outPath, wrapped);
  return outName;
}

// Helper — extract a section block from report text by its `## ` header.
// Accepts an array of regexes tried in order — first match wins.
// Handles both old format (## A) Role Summary) and new (## Block A — Role Summary).
function _extractSection(text, headerRe) {
  if (!text) return '';
  const patterns = Array.isArray(headerRe) ? headerRe : [headerRe];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const endIdx = rest.indexOf('\n## ');
    return endIdx === -1 ? rest : rest.slice(0, endIdx);
  }
  return '';
}

// Extract the TL;DR from Block A — typically the last row of the role
// summary table. Falls back to the full Block A if no TL;DR row found.
function _parseTldr(text) {
  const block = _extractSection(text, [/^## A\)[^\n]*$/m, /^## Block A\b[^\n]*$/m]);
  if (!block) return '';
  // Look for "| TL;DR | <value> |" in the table
  const tldrMatch = block.match(/\|\s*TL;DR\s*\|\s*([^\n]+?)\s*\|\s*$/m);
  if (tldrMatch) {
    return tldrMatch[1].replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 800);
  }
  return '';
}

// Extract positioning angle from Block C.
function _parsePositioning(text) {
  const block = _extractSection(text, [/^## C\)[^\n]*$/m, /^## Block C\b[^\n]*$/m]);
  if (!block) return '';
  // New format: "- **Positioning:** <prose>" bullet
  const bulletMatch = block.match(/\*\*Positioning:\*\*\s*([^\n]{30,})/);
  if (bulletMatch) return bulletMatch[1].replace(/\*\*/g, '').trim().slice(0, 600);
  // Old format: "Sell senior without overstatement" subsection
  const sellMatch = block.match(/\*\*Sell\s+(?:senior|the)[^\n]*\*\*[\s\S]*?(?=\n\n|\*\*If)/i);
  if (sellMatch) return sellMatch[0].replace(/\*\*/g, '').slice(0, 600).trim();
  // Fallback: first non-empty lines
  return block.trim().split('\n').filter(l => l.trim()).slice(0, 4).join(' ').slice(0, 500);
}

// Extract comp from Block A table.
function _parseComp(text) {
  const block = _extractSection(text, [/^## A\)[^\n]*$/m, /^## Block A\b[^\n]*$/m]);
  if (!block) return '';
  const m = block.match(/\|\s*Comp(?:ensation)?\s*\|\s*([^|\n]+?)\s*\|/im);
  return m ? m[1].replace(/\*\*/g, '').trim().slice(0, 120) : '';
}

// Pull the broader Comp cell (any "Comp..." prefix variant) for base-salary
// parsing — the Block A table uses many labels: "Comp", "Comp band (estimated)",
// "Comp (disclosed)", "Comp band (peer-set inferred)", etc. Returns the raw
// cell text trimmed; tolerant of label variation.
function _parseCompRaw(text) {
  // Tier 1: Block A "Comp" row (legacy 2-col + new 3-col with score-then-notes)
  const blockA = _extractSection(text, [/^## A\)[^\n]*$/m, /^## Block A\b[^\n]*$/m]);
  const fromTable = (block) => {
    if (!block) return '';
    const labelRe = /^\s*\|\s*\*?\*?\s*(?:Comp(?:ensation)?|Listed Annual Salary|Salary)\b[^|]*?\|/i;
    for (const line of block.split('\n')) {
      if (!labelRe.test(line)) continue;
      const cells = line.split('|').map(c => c.replace(/\*\*/g, '').trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const looksLikeComp = (s) => {
        if (!s) return false;
        if (/^\d+\/5\s*$/.test(s)) return false;
        if (/^(value|tier|score)\s*$/i.test(s)) return false;
        return /[\$€£]|\bK\b|\b(TC|base|comp|salary|total comp|OTE|range)\b/i.test(s);
      };
      for (let i = 1; i < cells.length; i++) {
        if (looksLikeComp(cells[i])) return cells[i].slice(0, 400);
      }
      const v = cells[1];
      if (v && !/^\d\/5\s*$/.test(v) && !/^value\s*$/i.test(v)) return v.slice(0, 400);
    }
    return '';
  };
  let v = fromTable(blockA);
  if (v) return v;

  // Tier 2: Block D "Comp and Market" / "Comp and Demand" — newer reports moved
  // the comp data here. Prefer the explicit "Estimated TC" / "Estimated base"
  // sentence (most authoritative), then the "OpenAI Program Manager | Median
  // $735K TC | ..." rows in the Levels.fyi table.
  const blockD = _extractSection(text, [
    /^## D\)[^\n]*Comp[^\n]*$/m,
    /^## Block D\b[^\n]*$/m,
  ]);
  if (blockD) {
    // Tier 2a: high-signal **bold** labels — the most authoritative source.
    //   **Listed:** $255,000 – $320,000 USD annually (CA/NY pay-transparency)
    //   **Estimated TC for this role:** $260K-$340K base + PPU equity
    //   **Comp band:** $300K-$355K base + 60/40 bonus split
    //   **Base:** $190K-$240K + equity refresher
    const boldLabelRe = /\*\*\s*(?:Estimated[^*:]*|Listed|Disclosed|Comp\s+band|Salary\s+band|Base\s+band|Base)[^*:]*?:?\s*\*\*\s*([^\n]+)/i;
    const boldLabeled = blockD.match(boldLabelRe);
    if (boldLabeled && boldLabeled[1] && /[\$€£]/.test(boldLabeled[1])) {
      return boldLabeled[1].replace(/\*\*/g, '').trim().slice(0, 400);
    }
    // Tier 2b: table search — the JD-disclosed band typically lives in a
    // markdown table. Inspect cell PAIRS: if the left cell labels the right
    // cell as base/listed/disclosed/posted, trust the right cell as the
    // actual base regardless of whether the value itself says "base".
    // Skip rows where the left cell says "Mitchell's target" / "target" /
    // "walk-away" / etc. (those are USER-config, not role-offered).
    let bestTableHit = null;
    const labelIsAuthoritative = (lbl) => /\b(base|listed|disclosed|posted|JD|salary\s+band|comp\s+band)\b/i.test(lbl) && !/target|walk[-\s]?away|floor|ceiling|mitchell/i.test(lbl);
    const labelIsUser = (lbl) => /target|walk[-\s]?away|mitchell|profile|floor/i.test(lbl);
    for (const line of blockD.split('\n')) {
      if (!line.includes('|')) continue;
      const cells = line.split('|').map(c => c.replace(/\*\*/g, '').trim()).filter(Boolean);
      if (cells.length < 2) continue;
      if (cells.some(c => /^range$/i.test(c) || /^---/.test(c) || /^source$/i.test(c) || /^note$/i.test(c) || /^data$/i.test(c) || /^dimension$/i.test(c))) continue;
      // Skip rows whose first cell is a user-config label (target / walk-away).
      if (labelIsUser(cells[0])) continue;
      // Pair-aware: if cells[0] is an authoritative label, return cells[1] if it has $.
      if (labelIsAuthoritative(cells[0]) && /[\$€£]\s*\d/.test(cells[1] || '')) {
        return cells[1].slice(0, 400);
      }
      // Otherwise scan all value cells; prefer one that mentions "base" inline.
      for (const c of cells.slice(1)) {
        if (!/[\$€£]\s*\d/.test(c)) continue;
        if (/\bbase\b/i.test(c)) return c.slice(0, 400);
        if (!bestTableHit && /\b(K|TC|range|comp|salary)\b/i.test(c)) bestTableHit = c;
      }
    }
    if (bestTableHit) return bestTableHit.slice(0, 400);
    // Tier 2c: bullet-list with strict labels ONLY (no "Total comp" / "Range"
    // because those mix base+equity and confuse parseBaseSalary).
    for (const line of blockD.split('\n')) {
      const m = line.match(/^[\s-*]*\*?\*?(?:Base|Listed|Disclosed)\*?\*?[^:]*:\s*([^\n]+)/i);
      if (m && /[\$€£]\s*\d/.test(m[1])) {
        return m[1].replace(/\*\*/g, '').trim().slice(0, 400);
      }
    }
    // Tier 2d (last resort): any line in Block D with a $-range — but skip
    // lines that mention "equity", "RSU", "vest", "PPU" (those are equity, not base)
    // and lines that say "TC" / "total comp" without "base" (those are total).
    const rangeRe = /[\$€£]\s*\d{2,4}(?:[,.]\d{3})?\s*K?\s*[\-–—]\s*[\$€£]?\s*\d{2,4}(?:[,.]\d{3})?\s*K?/i;
    for (const line of blockD.split('\n')) {
      if (!rangeRe.test(line)) continue;
      if (/\b(equity|RSU|PPU|vest|stock)\b/i.test(line) && !/\bbase\b/i.test(line)) continue;
      if (/\b(TC|total\s+comp)\b/i.test(line) && !/\bbase\b/i.test(line)) continue;
      return line.replace(/\*\*/g, '').trim().slice(0, 400);
    }
  }

  // Tier 3: Global Score table at bottom — "| Comp | 5/5 | $300-355K base... |"
  // Extract the third cell (notes) which carries the actual range.
  const globalScore = _extractSection(text, [/^## Global Score\b[^\n]*$/m, /^## Score Global\b[^\n]*$/m]);
  if (globalScore) {
    v = fromTable(globalScore);
    if (v) return v;
  }
  return '';
}

// Extract the Block A "Location" / "Remote" / "Location / Remote" / "Workplace"
// row. Returns the raw cell text (e.g. "Hybrid (San Francisco)", "London, UK
// — hybrid 25%", "Remote-eligible US"). Tolerant — first matching label wins.
function _parseLocationField(text) {
  const block = _extractSection(text, [/^## A\)[^\n]*$/m, /^## Block A\b[^\n]*$/m]);
  if (!block) return '';
  // Field names allow optional surrounding **bold** markdown (some reports
  // bold the label column). Order matters — most-specific labels first.
  const B = '(?:\\*\\*)?';
  const patterns = [
    new RegExp(`\\|\\s*${B}Location\\s*\\/\\s*Remote${B}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`, 'im'),
    new RegExp(`\\|\\s*${B}Location${B}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`, 'im'),
    new RegExp(`\\|\\s*${B}Locations${B}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`, 'im'),
    new RegExp(`\\|\\s*${B}Remote\\s+policy${B}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`, 'im'),
    new RegExp(`\\|\\s*${B}Remote${B}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`, 'im'),
    new RegExp(`\\|\\s*${B}Workplace[^|]*${B}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`, 'im'),
    new RegExp(`\\|\\s*${B}Geo[^|]*${B}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`, 'im'),
  ];
  for (const re of patterns) {
    const m = block.match(re);
    if (!m || !m[1]) continue;
    const v = m[1].replace(/\*\*/g, '').trim();
    // Reject divider rows + cells that are just a score.
    if (!v || /^-+$/.test(v) || /^\d\/5\s*$/.test(v)) continue;
    if (v.length > 250) return v.slice(0, 250);
    return v;
  }
  return '';
}

// Extract numbered key gaps from Block B — returns { title, detail } objects.
function _parseKeyGaps(text) {
  const block = _extractSection(text, [/^## B\)[^\n]*$/m, /^## Block B\b[^\n]*$/m]);
  if (!block) return [];
  const gapsSection = block.match(/\*\*Key gaps[^*]*\*\*[:\s]*\n([\s\S]*?)(?:\n\*\*Why|\n## |$)/i);
  if (!gapsSection) return [];
  return gapsSection[1]
    .split('\n')
    .filter(l => /^\d+\.\s/.test(l.trim()))
    .map(l => {
      const withoutNum = l.replace(/^\d+\.\s*/, '').trim();
      const titleMatch = withoutNum.match(/\*\*([^*]+)\*\*/);
      const title = (titleMatch ? titleMatch[1] : withoutNum.split('—')[0]).replace(/\*\*/g, '').trim();
      const dashIdx = withoutNum.indexOf('—');
      const detail = dashIdx > -1
        ? withoutNum.slice(dashIdx + 1).replace(/\*\*/g, '').trim().slice(0, 500)
        : '';
      return { title, detail };
    })
    .filter(g => g.title)
    .slice(0, 4);
}

// "Why these gaps don't block" from Block B.
function _parseWhyGapsDontBlock(text) {
  const block = _extractSection(text, [/^## B\)[^\n]*$/m, /^## Block B\b[^\n]*$/m]);
  if (!block) return '';
  const m = block.match(/\*\*Why these gaps don[''']t block[^*]*\*\*[:\s]*([^\n]+(?:\n(?!\*\*|\n).*)*)/i);
  return m ? m[1].replace(/\*\*/g, '').trim().slice(0, 600) : '';
}

// Per-gap strategies from Block C — matches by keyword from gap title.
// Cannot be cached at parse time because it depends on gap title; reads
// from the cached report text instead of disk.
function getGapStrategy(reportPath, gapTitle) {
  const cached = readReportOnce(reportPath);
  if (!cached?.exists) return '';
  const block = _extractSection(cached.text, [/^## C\)[^\n]*$/m, /^## Block C\b[^\n]*$/m]);
  if (!block) return '';
  // Look for "**<keyword> gap handling:**" or "**<keyword> gap:**" bullets
  const keyword = gapTitle.split(/\s+/)[0].replace(/[^a-z0-9]/gi, '');
  const re = new RegExp(`\\*\\*[^*]*${keyword}[^*]*(?:gap|handling)[^*]*\\*\\*[:\\s]*([^\\n]+)`, 'i');
  const m = block.match(re);
  return m ? m[1].replace(/\*\*/g, '').trim().slice(0, 600) : '';
}

// Extract STAR+R stories from Block F. Each STAR table row has
// columns: # | JD Requirement | Story | S | T | A | R | Reflection.
// We surface the JD-requirement column + the story column.
function _parseTopStories(text) {
  const block = _extractSection(text, [/^## F\)[^\n]*$/m, /^## Block F\b[^\n]*$/m]);
  if (!block) return [];
  const stories = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:|]+\s*\|/.test(line)) continue;
    if (/^\|\s*#\s*\|\s*JD\s*Requirement/i.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;
    // Column 0=#, 1=JD Requirement, 2=Story (4+ col old format has STAR columns after)
    const num = cells[0];
    const requirement = cells[1];
    const story = cells[2];
    if (!num || !requirement || !story) continue;
    if (!/^\d/.test(num)) continue;  // skip non-numeric first cells
    stories.push({ num, requirement, story });
  }
  return stories;
}

// Extract Mitchell's competitive-edge signals from Block B (CV Match) of
// a report. Handles three formats observed in the field:
//   1. English numeric — "**5/5**", "**4/5**"
//   2. Spanish categorical — "✅ UNIQUELY STRONG", "✅ STRONG", "MEDIUM", "WEAK"
//   3. Prose evaluation — "**HARD BLOCKER**", "Gap across..." (skip — negative)
// Returns rows sorted by strength (no slice — wrappers apply the limit).
function _parseCompetitiveEdge(text) {
  const startMatch = text.match(/^## B\)[^\n]*$/m) || text.match(/^## Block B\b[^\n]*$/m);
  if (!startMatch) return [];
  const start = startMatch.index + startMatch[0].length;
  const rest = text.slice(start);
  const endIdx = rest.indexOf('\n## ');
  const block = endIdx === -1 ? rest : rest.slice(0, endIdx);

  const rows = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*[-:|]+\s*\|/.test(line)) continue;                        // separator
    if (/^\|\s*(?:JD\s*Requirement|JD\s*requirement|Requisito|JD\s*Req)/i.test(line)) continue; // header
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 3) continue;
    const requirement = cells[0].replace(/\*\*/g, '');
    const evidence = cells[1];
    const matchCell = cells[2];

    let score = null;
    let label = '';

    // Format 1: numeric "N/5"
    const numMatch = matchCell.match(/(\d+(?:\.\d+)?)\s*\/\s*5/);
    if (numMatch) {
      score = parseFloat(numMatch[1]);
    }
    // Format 2: English/Spanish categorical + new ✅/⚠️ emoji format
    else if (/Exceptional|UNIQUELY\s+STRONG/i.test(matchCell)) { score = 5; label = 'Exceptional'; }
    else if (/✅\s*STRONG|^\s*STRONG\b|\*\*STRONG\*\*/i.test(matchCell)) { score = 4; label = 'Strong'; }
    else if (/✅?\s*MEDIUM|MEDIUM\s*MATCH|MODERATE/i.test(matchCell)) { score = 3; label = 'Medium'; }
    else if (/Adjacent/i.test(matchCell) && /✅/.test(matchCell)) { score = 3; label = 'Adjacent'; }
    else if (/✅?\s*WEAK|WEAK\s*MATCH|PARTIAL/i.test(matchCell)) { score = 2; label = 'Weak'; }
    else if (/⚠️/.test(matchCell)) { score = 2; label = 'Partial'; }
    else if (/✅/.test(matchCell)) { score = 4; label = 'Strong'; }
    // Format 3: explicit negatives — skip (they aren't competitive edges)
    else if (/HARD\s*BLOCKER|GAP\s|MISSING|NO\s*MATCH|FAIL\b/i.test(matchCell)) {
      continue;
    } else {
      continue;
    }

    if (score === null || !requirement) continue;
    rows.push({ score, requirement, evidence, label });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

function getTldr(reportPath) {
  return readReportOnce(reportPath)?.tldr || '';
}

function getPositioning(reportPath) {
  return readReportOnce(reportPath)?.positioning || '';
}

function getComp(reportPath) {
  return readReportOnce(reportPath)?.comp || '';
}

function getCompRaw(reportPath) {
  return readReportOnce(reportPath)?.compRaw || readReportOnce(reportPath)?.comp || '';
}

function getLocationField(reportPath) {
  return readReportOnce(reportPath)?.locationField || '';
}

function getKeyGaps(reportPath) {
  return readReportOnce(reportPath)?.keyGaps || [];
}

function getWhyGapsDontBlock(reportPath) {
  return readReportOnce(reportPath)?.whyGapsDontBlock || '';
}

function getTopStories(reportPath, limit = 2) {
  const stories = readReportOnce(reportPath)?.topStories || [];
  return stories.slice(0, limit);
}

function getCompetitiveEdge(reportPath, limit = 5) {
  const edges = readReportOnce(reportPath)?.competitiveEdge || [];
  return edges.slice(0, limit);
}

function countPipelinePending() {
  if (!existsSync(PIPELINE_PATH)) return 0;
  return readFileSync(PIPELINE_PATH, 'utf-8').split('\n').filter(l => l.startsWith('- [ ]')).length;
}

function countScanHistory() {
  if (!existsSync(SCAN_HISTORY_PATH)) return 0;
  const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').filter(l => l.trim());
  return Math.max(0, lines.length - 1);
}

// Build the last few scan "events" for the live ticker in the toolbar.
// scan-history.tsv only has dates (not HH:MM), so we anchor the most-recent
// date's events to the file mtime (a real scan-run timestamp) and back off
// by ~6h per prior date for older groups. Returns up to 5 events
// newest-first, plus a lastScanIso anchor.
function loadLiveScanEvents(limit = 5) {
  if (!existsSync(SCAN_HISTORY_PATH)) return { events: [], lastScanIso: null };
  const stat = statSync(SCAN_HISTORY_PATH);
  const mtime = stat.mtime.getTime();
  const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { events: [], lastScanIso: new Date(mtime).toISOString() };
  const groups = new Map();
  for (let i = 1; i < lines.length; i++) {
    const [, first_seen, , , company, status] = lines[i].split('\t');
    if (!first_seen || !company) continue;
    if (status && status.trim() !== 'added') continue;
    const trimmed = company.trim();
    // Skip synthetic placeholders ("(from email)", "Unknown", empty parens).
    if (!trimmed || trimmed.startsWith('(') || /^unknown$/i.test(trimmed)) continue;
    const key = `${first_seen}__${trimmed}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const sorted = [...groups.entries()]
    .map(([k, count]) => {
      const [date, company] = k.split('__');
      return { date, company, count };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.count - a.count));
  const newestDate = sorted.length ? sorted[0].date : null;
  const events = sorted.slice(0, limit).map((g) => {
    const dayDelta = newestDate ? (new Date(newestDate) - new Date(g.date)) / 86400000 : 0;
    const ts = mtime - dayDelta * 24 * 3600 * 1000 - (g === sorted[0] ? 0 : 6 * 60 * 1000);
    return { company: g.company, count: g.count, ts: new Date(ts).toISOString() };
  });
  return { events, lastScanIso: new Date(mtime).toISOString() };
}

// Count distinct batch runs in batch-state.tsv using a 15-min gap heuristic on started_at.
// Mirrors the grouping logic in dashboard-server.mjs detailBatches().
function countBatchRuns() {
  if (!existsSync(BATCH_STATE_PATH)) return 0;
  const GAP_MS = 15 * 60 * 1000;
  const starts = readFileSync(BATCH_STATE_PATH, 'utf-8').split('\n')
    .filter(l => l.trim() && !l.startsWith('id'))
    .map(l => l.split('\t')[3])
    .filter(Boolean)
    .sort();
  let runs = 0, prev = 0;
  for (const s of starts) {
    const ts = new Date(s).getTime();
    if (!runs || (ts - prev) > GAP_MS) runs++;
    prev = ts;
  }
  return runs;
}

function getEnabledPortals() {
  if (!existsSync(PORTALS_PATH)) return { tracked: 0, queries: 0 };
  const cfg = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const tracked = (cfg.tracked_companies || []).filter(c => c.enabled !== false).length;
  const queries = (cfg.search_queries || []).filter(q => q.enabled !== false).length;
  return { tracked, queries };
}

// Snapshot of the most recent batch run for the mission-control strip.
// Returns: { state, completed, total, running, failed, pct, startedAtIso, isIdle }.
// state ∈ {"running","completed","idle"}. The isIdle flag is true when no
// running rows remain or the last update was >2h ago. Polled live by the
// strip JS via /api/batch-live; this is just the build-time seed.
function loadBatchSnapshot() {
  if (!existsSync(BATCH_STATE_PATH)) {
    return { state: 'idle', completed: 0, total: 0, running: 0, failed: 0, pct: 0, startedAtIso: null, isIdle: true };
  }
  const lines = readFileSync(BATCH_STATE_PATH, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('id'));
  if (!lines.length) {
    return { state: 'idle', completed: 0, total: 0, running: 0, failed: 0, pct: 0, startedAtIso: null, isIdle: true };
  }
  let completed = 0, running = 0, failed = 0;
  let earliestStart = null;
  for (const l of lines) {
    const cols = l.split('\t');
    const status = (cols[2] || '').trim();
    const startedAt = cols[3] || '';
    if (status === 'completed') completed++;
    else if (status === 'running') running++;
    else if (status === 'failed') failed++;
    if (status === 'running' && startedAt) {
      if (!earliestStart || startedAt < earliestStart) earliestStart = startedAt;
    }
  }
  // Total comes from batch-input.tsv if present; otherwise fall back to state
  // row count. Take the max of the two to handle the case where state has
  // older completed rows than the current input (input got rotated).
  const inputPath = join(ROOT, 'batch/batch-input.tsv');
  let total = lines.length;
  if (existsSync(inputPath)) {
    const inputLines = readFileSync(inputPath, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('id'));
    if (inputLines.length) total = Math.max(inputLines.length, lines.length);
  }
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  // "idle" if no running rows AND most recent started_at is older than 2h.
  let mostRecentStart = null;
  for (const l of lines) {
    const startedAt = l.split('\t')[3];
    if (startedAt && (!mostRecentStart || startedAt > mostRecentStart)) mostRecentStart = startedAt;
  }
  const recentMs = mostRecentStart ? Date.now() - new Date(mostRecentStart).getTime() : Infinity;
  const isIdle = running === 0 && recentMs > 2 * 3600 * 1000;
  const state = running > 0 ? 'running' : (completed >= total && total > 0 ? 'completed' : 'idle');
  return {
    state,
    completed,
    total,
    running,
    failed,
    pct,
    startedAtIso: earliestStart ? new Date(earliestStart).toISOString() : null,
    mostRecentIso: mostRecentStart ? new Date(mostRecentStart).toISOString() : null,
    isIdle,
  };
}

// Aggregate system health for the strip's right-side pill. Surfaces three
// signals: in-flight job count (Applied + Responded + Interview + Offer),
// batch failures in the last 24h, and scan recency. Returns a roll-up:
// "healthy" if 0 failures + last scan <24h; "warn" if any 24h failures or
// stale scan (>48h); "fail" if scan >7d.
function loadSystemHealthSnapshot(apps) {
  const inFlight = apps.filter(r => /^(applied|responded|interview|offer)$/i.test(r.status)).length;
  let failed24h = 0;
  if (existsSync(BATCH_STATE_PATH)) {
    const lines = readFileSync(BATCH_STATE_PATH, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('id'));
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const l of lines) {
      const cols = l.split('\t');
      if ((cols[2] || '').trim() !== 'failed') continue;
      const completedAt = cols[4] || cols[3] || '';
      if (!completedAt) continue;
      if (new Date(completedAt).getTime() >= cutoff) failed24h++;
    }
  }
  let scanAgeMs = Infinity;
  if (existsSync(SCAN_HISTORY_PATH)) {
    scanAgeMs = Date.now() - statSync(SCAN_HISTORY_PATH).mtime.getTime();
  }
  let status = 'healthy';
  if (scanAgeMs > 7 * 24 * 3600 * 1000) status = 'fail';
  else if (failed24h > 0 || scanAgeMs > 48 * 3600 * 1000) status = 'warn';
  return { inFlight, failed24h, scanAgeMs: Number.isFinite(scanAgeMs) ? scanAgeMs : -1, status };
}

function countTodaysReports(date) {
  if (!existsSync(REPORTS_DIR)) return 0;
  return readdirSync(REPORTS_DIR).filter(f => f.includes(date) && f.endsWith('.md')).length;
}

// ── KPI sparklines + 7-day deltas (Phase 6 item 3.1) ──────────────
// Build a 14-day daily series per metric; the last 7 days are the
// "current week" and the prior 7 days are the comparison window.
const SPARKLINE_DAYS = 14;
function dailyBuckets(today) {
  const todayMs = new Date(today + 'T00:00:00Z').getTime();
  const out = [];
  for (let i = SPARKLINE_DAYS - 1; i >= 0; i--) {
    const dayMs = todayMs - i * 86400000;
    out.push({ date: new Date(dayMs).toISOString().slice(0, 10), count: 0 });
  }
  return out;
}
function tallyDates(today, dates) {
  const buckets = dailyBuckets(today);
  const idx = Object.fromEntries(buckets.map((b, i) => [b.date, i]));
  for (const d of dates) {
    const i = idx[d];
    if (i !== undefined) buckets[i].count++;
  }
  return buckets.map(b => b.count);
}
function summarizeSeries(daily) {
  const half = Math.floor(daily.length / 2);
  const prev7 = daily.slice(0, half).reduce((a, b) => a + b, 0);
  const current7 = daily.slice(half).reduce((a, b) => a + b, 0);
  return { daily, current7, prev7, delta: current7 - prev7 };
}
function computeKPISparklines(apps, today) {
  const applyNowDates = apps
    .filter(r => r.score >= 4.0 && /^(evaluated|responded)$/i.test(r.status))
    .map(r => r.date).filter(Boolean);
  const totalDates = apps.map(r => r.date).filter(Boolean);
  const appliedDates = apps
    .filter(r => /^(applied|responded|interview|offer)$/i.test(r.status))
    .map(r => r.date).filter(Boolean);
  // Companies per day = distinct companies seen on that day
  const companyByDate = {};
  for (const r of apps) {
    if (!r.date || !r.company) continue;
    if (!companyByDate[r.date]) companyByDate[r.date] = new Set();
    companyByDate[r.date].add(r.company.toLowerCase());
  }
  const companyDaily = dailyBuckets(today).map(b => (companyByDate[b.date] || new Set()).size);
  // URLs scanned per day from scan-history.tsv (column index 1 = first_seen)
  const scanDates = [];
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').slice(1);
    for (const l of lines) {
      const cols = l.split('\t');
      if (cols[1]) scanDates.push(cols[1]);
    }
  }
  // Distinct batch runs per day (15-min gap heuristic — same as countBatchRuns)
  const batchDatesByDay = {};
  if (existsSync(BATCH_STATE_PATH)) {
    const GAP_MS = 15 * 60 * 1000;
    const starts = readFileSync(BATCH_STATE_PATH, 'utf-8').split('\n')
      .filter(l => l.trim() && !l.startsWith('id'))
      .map(l => l.split('\t')[3])
      .filter(Boolean)
      .sort();
    let prev = 0;
    for (const s of starts) {
      const ts = new Date(s).getTime();
      if (!prev || (ts - prev) > GAP_MS) {
        const d = new Date(ts).toISOString().slice(0, 10);
        batchDatesByDay[d] = (batchDatesByDay[d] || 0) + 1;
      }
      prev = ts;
    }
  }
  const batchDaily = dailyBuckets(today).map(b => batchDatesByDay[b.date] || 0);
  return {
    applyNow: summarizeSeries(tallyDates(today, applyNowDates)),
    total:    summarizeSeries(tallyDates(today, totalDates)),
    applied:  summarizeSeries(tallyDates(today, appliedDates)),
    companies: summarizeSeries(companyDaily),
    scanned:  summarizeSeries(tallyDates(today, scanDates)),
    batches:  summarizeSeries(batchDaily),
  };
}
function sparklineSVG(daily, color, label) {
  const W = 80, H = 24, PAD = 2;
  const max = Math.max(1, ...daily);
  const stepX = (W - PAD * 2) / Math.max(1, daily.length - 1);
  const pts = daily.map((v, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const title = `${label} — 14-day trend (current 7-day vs previous 7-day)`;
  return `<svg class="sparkline" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><title>${title}</title><path d="M${pts.join(' L')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function deltaIndicator(delta) {
  if (delta === 0) return `<span class="stat-delta stat-delta-flat">±0 vs last week</span>`;
  const sign = delta > 0 ? '+' : '';
  const cls = delta > 0 ? 'stat-delta-up' : 'stat-delta-down';
  return `<span class="stat-delta ${cls}">${sign}${delta} vs last week</span>`;
}
// Hero-balance sparkline: stretches to fill the card width as a background fill.
function heroSparklineSVG(daily, label) {
  const W = 200, H = 60, PAD = 1;
  const max = Math.max(1, ...daily);
  const stepX = (W - PAD * 2) / Math.max(1, daily.length - 1);
  const pts = daily.map((v, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const title = `${label} — 14-day trend (background fill)`;
  return `<svg class="hero-sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${title}"><title>${title}</title><path d="M${pts.join(' L')}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function deltaPill(delta) {
  if (delta === 0) return `<span class="hero-delta-pill hero-delta-flat" title="No change vs previous 7 days">±0 vs last 7d</span>`;
  const sign = delta > 0 ? '+' : '';
  const cls = delta > 0 ? 'hero-delta-up' : 'hero-delta-down';
  const arrow = delta > 0 ? '▲' : '▼';
  return `<span class="hero-delta-pill ${cls}" title="Change vs previous 7 days">${arrow} ${sign}${delta} vs last 7d</span>`;
}

// ── Tier legend (from modes/_profile.md §1) ───────────────────────
// Single source of truth for tier badge tooltips and the legend modal.
// Sub-tier variants (A2-AB, A2-AE, A2-PgM, A2-SA) are rendered as A2
// in the table (regex strips), but listed in the legend for clarity.
const TIER_LEGEND = [
  {
    code: 'A1',
    name: 'Residency / Fellowship Programs',
    summary: 'Cohort-based programs explicitly for career pivoters; lower technical gate. +1.5x base score weight.',
    examples: 'Tarbell AI Journalism, IAPS AI Policy, Horizon, Berkman Klein, Apple AIML Residency, OpenAI Residency, Perplexity Research Residency.',
  },
  {
    code: 'A2',
    name: 'AI Solutions Architect / Agent Builder / Enablement / PgM',
    summary: 'Primary aspirational target. Scored at full weight; no portfolio gate.',
    examples: 'AI Solutions Architect (A2-SA), Forward Deployed Engineer, Applied AI Engineer, AI Enablement Lead (A2-AE), AI Program Manager (A2-PgM), AI Technical Program Manager, Agent Builder (A2-AB), Technical Deployment Lead.',
  },
  {
    code: 'B',
    name: 'Communications / Editorial at AI-native companies',
    summary: 'Pragmatic bridge. Must pass AI-nativity filter (core product is AI or AI is structural to roadmap).',
    examples: 'Developer Education Lead, Developer Advocate, Communications Lead/Manager, Engineering Editorial Lead, Technical Writer, Editorial Lead, Content Strategy Lead.',
  },
];
const TIER_BY_CODE = Object.fromEntries(TIER_LEGEND.map(t => [t.code, t]));
function tierTooltip(code) {
  const t = TIER_BY_CODE[code];
  if (!t) return '';
  return `${t.code} — ${t.name}. ${t.summary}`;
}

// ── HTML rendering ────────────────────────────────────────────────

const escape = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function scoreBadgeClass(score) {
  if (score >= 4.0) return 'score-strong';
  if (score >= 3.0) return 'score-moderate';
  return 'score-weak';
}

function evalAge(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 0) return '';
  if (days >= 14) return `<span class="age-red">${days}d ⚠</span>`;
  if (days >= 10) return `<span class="age-amber">${days}d</span>`;
  if (days < 30) return `${days}d`;
  const weeks = Math.round(days / 7);
  return `${weeks}w`;
}

// statusKey + statusBadgeClass live in lib/status-key.mjs (single source
// of truth — see imports above). The client bundle also injects them
// via STATUS_KEY_SOURCE so all three layers stay in sync.

// Map common company → careers/jobs landing page. Falls back to a Google
// `site:` query when the company isn't in the map so the link is still useful.
const CAREERS_URLS = {
  'openai': 'https://openai.com/careers/search/',
  'anthropic': 'https://www.anthropic.com/jobs',
  'mistral ai': 'https://mistral.ai/careers',
  'mistral': 'https://mistral.ai/careers',
  'cohere': 'https://cohere.com/careers',
  'perplexity': 'https://www.perplexity.ai/hub/careers',
  'sierra': 'https://sierra.ai/careers',
  'cursor': 'https://cursor.com/careers',
  'elevenlabs': 'https://elevenlabs.io/careers',
  'cognition': 'https://cognition.ai/careers',
  'pinecone': 'https://www.pinecone.io/careers/',
  'synthesia': 'https://www.synthesia.io/careers',
  'ramp': 'https://ramp.com/careers',
  'waymo': 'https://waymo.com/careers/',
  'nvidia': 'https://www.nvidia.com/en-us/about-nvidia/careers/',
  'micron': 'https://careers.micron.com/careers',
  'amazon': 'https://www.amazon.jobs/en/',
  'amazon aws': 'https://www.amazon.jobs/en/teams/aws',
  'aws': 'https://www.amazon.jobs/en/teams/aws',
  'google': 'https://careers.google.com/jobs/',
  'meta': 'https://www.metacareers.com/jobs',
  'apple': 'https://jobs.apple.com/en-us/search',
  'microsoft': 'https://careers.microsoft.com/v2/global/en/home.html',
  'figma': 'https://www.figma.com/careers/',
  'notion': 'https://www.notion.so/careers',
  'linear': 'https://linear.app/careers',
  'vercel': 'https://vercel.com/careers',
  'fireworks ai': 'https://fireworks.ai/careers',
  'fireworks': 'https://fireworks.ai/careers',
  'adobe': 'https://www.adobe.com/careers.html',
};
function companyCareersUrl(company) {
  if (!company) return null;
  const key = String(company).trim().toLowerCase();
  if (CAREERS_URLS[key]) return CAREERS_URLS[key];
  // Loose match — handle "Anthropic (Series G)" etc.
  for (const [k, v] of Object.entries(CAREERS_URLS)) {
    if (key.startsWith(k + ' ') || key === k) return v;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(company + ' careers jobs')}`;
}

// ── Tracker note formatter ──────────────────────────────────────────
// Parses the dense notes field from applications.md into structured HTML:
// re-eval badge → decision badge → semicolon-split bullet list.
function formatTrackerNote(text) {
  if (!text || !text.trim()) return '';
  const esc = escape; // reuse existing escape helper

  let rest = text.trim();

  // Extract all leading "Re-eval DATE (X→Y). " prefixes (can repeat)
  const reevals = [];
  let m;
  const reevalRe = /^Re-eval\s+(\d{4}-\d{2}-\d{2})(?:\s*\([^)]*\))?\.\s*/;
  while ((m = rest.match(reevalRe))) {
    reevals.push(rest.slice(0, m[0].length - 2).trim()); // strip trailing ". "
    rest = rest.slice(m[0].length);
  }

  // Extract decision keyword + optional priority up to " — " or " – "
  let decision = '';
  let decisionClass = 'tn-decision';
  const decMatch = rest.match(/^((?:APPLY|SKIP|DEFER)(?:\s+(?:HIGH(?:\s+CONFIDENCE)?|\([^)]*\)|[A-Z]+))*)\s*[-–—]\s*/);
  if (decMatch) {
    decision = decMatch[1].trim();
    rest = rest.slice(decMatch[0].length);
    if (decision.startsWith('APPLY')) decisionClass += ' tn-apply';
    else if (decision.startsWith('SKIP'))  decisionClass += ' tn-skip';
    else                                   decisionClass += ' tn-defer';
  }

  // Split remaining text on "; " into bullets (ignore lone semicolons mid-word)
  const bullets = rest.split(/;\s+(?=[A-Z\(0-9"'#])/).filter(s => s.trim());

  // Build HTML
  let html = '<div class="tn-wrap">';

  // Header row: re-eval badges + decision badge
  if (reevals.length || decision) {
    html += '<div class="tn-header">';
    for (const re of reevals) {
      html += `<span class="tn-reeval">${esc(re)}</span>`;
    }
    if (decision) html += `<span class="${esc(decisionClass)}">${esc(decision)}</span>`;
    html += '</div>';
  }

  // Body: bullet list or single paragraph
  if (bullets.length > 1) {
    html += '<ul class="tn-list">';
    for (const b of bullets) html += `<li>${esc(b.replace(/;\s*$/, ''))}</li>`;
    html += '</ul>';
  } else if (bullets.length === 1) {
    html += `<p class="tn-text">${esc(bullets[0])}</p>`;
  }

  html += '</div>';
  return html;
}

function renderRow(r, idx) {
  const archetype = getReportArchetype(r.reportPath);
  const url = getReportUrl(r.reportPath);
  const finalRec = getReportFinalRecommendation(r.reportPath);
  const edge = getCompetitiveEdge(r.reportPath);
  // Action cell: Report (formatted .html) + Email (compose draft) + Verify
  // (claims/research). The JD URL is wired directly on the role title now,
  // so a separate "Apply" link is redundant.
  const reportHtmlLink = r.reportPath
    ? `<a href="reports/${basename(r.reportPath).replace(/\.md$/, '.html')}" target="_blank" onclick="event.stopPropagation()" title="Open formatted report in browser">Report</a>`
    : '';
  const verifySlug = r.reportPath ? basename(r.reportPath) : '';
  const verifyBtn = verifySlug
    ? `<a href="javascript:void(0)" onclick="openVerify('${verifySlug}');event.stopPropagation()" style="color:#8250df" title="Verify claims + research queries">Verify</a>`
    : '';
  const emailBtn = `<a href="javascript:void(0)" class="email-launch-btn" onclick="openEmailPopover(this);event.stopPropagation()" data-company="${escape(r.company)}" data-role="${escape(r.role)}" style="color:#0969da" title="Draft outreach email" aria-label="Draft email for ${escape(r.company)} ${escape(r.role)}">Email</a>`;
  const applyLink = [reportHtmlLink, emailBtn, verifyBtn].filter(Boolean).join(' · ') || '<span class="muted">—</span>';
  // Clickable report link — file:// URL opens the .md in the OS default
  // app (Cursor, after we set it via duti). Stop event propagation so
  // clicking the link doesn't toggle the row's expand state.
  const reportAbs = r.reportPath ? `file://${ROOT}/${r.reportPath}` : '';
  const reportPathDisplay = r.reportPath
    ? `<a href="${escape(reportAbs)}" onclick="event.stopPropagation()" title="Open in Cursor">${escape(r.reportPath)}</a>`
    : '<span class="muted">—</span>';

  // Pull richer signals for the expand panel.
  const tldr = getTldr(r.reportPath);
  const positioning = getPositioning(r.reportPath);
  const stories = getTopStories(r.reportPath, 3);
  const comp = getComp(r.reportPath);
  const gaps = getKeyGaps(r.reportPath);
  const whyOk = getWhyGapsDontBlock(r.reportPath);

  // Throttle row classes
  const throttleClass = r._throttle?.status === 'pickone' ? 'row-throttle-pickone'
    : r._throttle?.status === 'defer' ? 'row-throttle-defer'
    : r._throttle?.status === 'blocked' ? 'row-throttle-blocked'
    : '';

  // ── Meta chips ──────────────────────────────────────────
  const metaChips = [
    comp ? `<span class="meta-chip meta-chip-comp">💰 ${escape(comp)}</span>` : '',
    archetype ? `<span class="meta-chip meta-chip-tier">${escape(archetype)}</span>` : '',
    r.date ? `<span class="meta-chip">📅 ${escape(r.date)}</span>` : '',
  ].filter(Boolean).join('');

  // ── Intro: TL;DR + positioning (compact, full-width) ─────
  const tldrCard = tldr ? `<div class="dcard" style="margin-bottom:8px">
    <div class="dcard-label">Role at a glance</div>
    <div class="dcard-body">${escape(tldr)}</div>
  </div>` : '';

  const posCard = positioning ? `<div class="dcard" style="margin-bottom:8px">
    <div class="dcard-label">How to position</div>
    <div class="dcard-body">${escape(positioning).replace(/\n/g, '<br>')}</div>
  </div>` : '';

  // ── Card 1: Match (green / WHAT FITS) ────────────────────
  const matchCard = edge.length ? `<div class="dcard dcard--match">
    <div class="dcard-label">WHAT FITS</div>
    <ul class="match-list">
      ${edge.map(e => `<li class="${e.score >= 4 ? 'match-yes' : 'match-partial'}">
        <span class="match-icon">${e.score >= 4 ? '✓' : '~'}</span>
        <div>
          <div class="match-req">${escape(e.requirement.slice(0, 90))}</div>
          <div class="match-ev">${escape(e.evidence.slice(0, 160))}</div>
        </div>
      </li>`).join('')}
    </ul>
  </div>` : '';

  // ── Card 2: Gap (amber / WHAT'S MISSING) ─────────────────
  const gapCard = gaps.length ? `<div class="dcard dcard--gap">
    <div class="dcard-label">WHAT'S MISSING <span style="font-size:9px;font-weight:400;color:var(--text-4);margin-left:4px">click for strategy</span></div>
    <div class="dcard-gaps">${gaps.map(g => {
      const strategy = getGapStrategy(r.reportPath, g.title);
      const detailHtml = g.detail ? marked.parse(g.detail) : '';
      const strategyHtml = strategy ? marked.parse(strategy) : '';
      const whyHtml = whyOk ? marked.parse(whyOk) : '';
      return `<span class="gap-chip gap-chip-interactive"
        onclick="openGapModal(this);event.stopPropagation()"
        data-title="${escape(g.title)}"
        data-detail="${escape(detailHtml)}"
        data-strategy="${escape(strategyHtml)}"
        data-why="${escape(whyHtml)}"
        title="Click for addressing strategy">⚠ ${escape(g.title)}</span>`;
    }).join('')}</div>
    ${whyOk ? `<div class="dcard-gap-prose">${escape(whyOk).replace(/\n/g, '<br>')}</div>` : ''}
  </div>` : '';

  // ── Card 3: Story (purple / STORIES TO LEAD WITH) ────────
  const storyCard = stories.length ? `<div class="dcard dcard--story">
    <div class="dcard-label">STORIES TO LEAD WITH</div>
    ${stories.map((s, i) => `<div class="dcard-story-row">
      <span class="story-n">${i + 1}</span>
      <div>
        <div class="story-req">${escape(s.requirement.slice(0, 110))}</div>
        <div class="story-ev">${escape(s.story.slice(0, 240))}${s.story.length > 240 ? '…' : ''}</div>
      </div>
    </div>`).join('')}
  </div>` : '';

  // ── Card 4: Action (blue / Apply / Skip / Defer) ─────────
  const actionCard = (finalRec || url) ? `<div class="dcard dcard--action">
    <div>
      <div class="dcard-label" style="margin-bottom:4px">ACTION</div>
      <div class="dcard-action-text">${escape(finalRec || 'No recommendation captured.')}</div>
    </div>
    <div class="dcard-action-buttons">
      ${url ? `<a href="${escape(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="dcard-btn dcard-btn--primary">Apply →</a>` : ''}
      <button type="button" class="dcard-btn" onclick="event.stopPropagation()" data-action="skip" data-num="${escape(String(r.num || ''))}">Skip</button>
      <button type="button" class="dcard-btn" onclick="event.stopPropagation()" data-action="defer" data-num="${escape(String(r.num || ''))}">Defer</button>
    </div>
  </div>` : '';

  // ── Card 5: Notes & activity (slate / append-only log) ───
  // Server populates entries lazily via GET /api/notes/:num on first
  // expand. Card always renders (every row can have notes), with an
  // empty state until the first note arrives.
  const notesCard = `<div class="dcard dcard--notes" data-notes-num="${escape(String(r.num || ''))}">
    <div class="dcard-label">NOTES &amp; ACTIVITY</div>
    <div class="notes-compose">
      <textarea class="notes-input" maxlength="1000" rows="2"
        placeholder="Add a note (followed up, recruiter response, etc.) — 1000 char max"
        onclick="event.stopPropagation()"
        oninput="updateNotesCounter(this);event.stopPropagation()"
        onkeydown="event.stopPropagation()"
        aria-label="Add a note for row #${escape(String(r.num || ''))}"></textarea>
      <div class="notes-compose-row">
        <span class="notes-counter" aria-live="polite">0 / 1000</span>
        <button type="button" class="dcard-btn notes-add-btn"
          onclick="addRowNote(this);event.stopPropagation()"
          data-num="${escape(String(r.num || ''))}">Add note</button>
      </div>
    </div>
    <div class="notes-list" data-notes-list>
      <div class="notes-empty muted-text">No notes yet — add one above. Status changes are auto-logged.</div>
    </div>
  </div>`;

  // ── Recommendation banner ────────────────────────────────
  const recBanner = finalRec ? `<div class="rec-banner">
    <span class="rec-label">Rec</span>
    <span class="rec-text">${escape(finalRec)}</span>
    ${url ? `<a href="${escape(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="rec-btn">Apply →</a>` : ''}
  </div>` : url ? `<div style="font-size:12px;margin-top:6px"><a href="${escape(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 View JD</a></div>` : '';

  // Inline gap chips shown on mobile cards only (top 3 by getKeyGaps order)
  const cardGapChips = gaps.length ? `<div class="card-gaps-mobile">${gaps.slice(0, 3).map(g =>
    `<span class="gap-chip gap-chip-mobile">⚠ ${escape(g.title)}</span>`
  ).join('')}</div>` : '';

  // ── Search index: tldr + recommendation + topGaps + topEdges ─
  // Lowercased + whitespace-collapsed so the client filter can do a
  // simple substring match against a normalized query.
  const searchIndex = [
    tldr,
    finalRec,
    ...gaps.flatMap(g => [g.title, g.detail]),
    ...edge.flatMap(e => [e.requirement, e.evidence, e.label]),
  ].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();

  // Equity / IPO posture — primary filter signal. Empty when no overpay-signals
  // entry exists for this company; rendered as a hairline em-dash.
  const equityData = getEquityForCompany(r.company);
  const equityStage = equityData ? equityData.stage : 'unknown';
  const equityCell = equityBadge(r.company);

  // Wave H: Base salary + Location chips. Both render as muted em-dash when
  // the report doesn't carry parseable signal — never crashes.
  const locationRaw = getLocationField(r.reportPath);
  const baseCell = renderBaseCell(r.reportPath, _COMP_FLOORS, locationRaw);
  const locationCell = renderLocationCell(r.reportPath, r.company, r.role);
  const benefitsCell = renderBenefitsCell(r.company, r.role);
  const peopleCell = renderPeopleCell(r.company, r.role);

  return `
<tr class="row ${throttleClass}" data-num="${r.num}" data-row-id="${escape(idx)}" data-score="${r.score}" data-archetype="${escape(archetype)}" data-company="${escape(r.company.toLowerCase())}" data-status="${escape(r.status.toLowerCase())}" data-role="${escape(r.role.toLowerCase())}" data-equity="${escape(equityStage)}" data-search="${escape(searchIndex)}" onclick="toggleDetail('${idx}')">
  <td class="bulk-cell"><input type="checkbox" class="bulk-checkbox" data-num="${r.num}" aria-label="Select row #${r.num} (${escape(r.company)})" onclick="event.stopPropagation();handleRowCheckbox(this)"></td>
  <td><span class="badge score-badge-lg ${scoreBadgeClass(r.score)}">${r.score.toFixed(1)}</span></td>
  <td class="base-cell">${baseCell}</td>
  <td><a href="${escape(companyCareersUrl(r.company))}" target="_blank" rel="noopener" class="company-link" onclick="event.stopPropagation()" title="Open ${escape(r.company)} careers page"><strong>${escape(r.company)}</strong></a>${archetype ? `<span class="tier-tag" tabindex="0" role="button" data-tooltip="${escape(tierTooltip(archetype))}" aria-label="Tier ${escape(archetype)}: ${escape(tierTooltip(archetype))}" onclick="event.stopPropagation();openTierLegend('${escape(archetype)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openTierLegend('${escape(archetype)}')}">${escape(archetype)}</span>` : ''}</td>
  <td class="role-cell">${url ? `<a href="${escape(url)}" target="_blank" rel="noopener" class="role-link" onclick="event.stopPropagation()" title="Open original job posting">${escape(r.role)}</a>` : escape(r.role)}${cardGapChips}</td>
  <td class="status-cell"><span class="badge status-pill ${statusBadgeClass(r.status)}" data-status="${statusKey(r.status)}" data-num="${r.num}" role="button" tabindex="0" onclick="openStatusPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){openStatusPopover(this);event.preventDefault();event.stopPropagation()}" title="Click to change status">${escape(r.status)}</span></td>
  <td class="equity-cell">${equityCell}</td>
  <td class="location-cell">${locationCell}</td>
  <td class="benefits-cell">${benefitsCell}</td>
  <td class="people-cell">${peopleCell}</td>
  <td class="muted-text mobile-hide">${escape(r.date)}</td>
  <td class="muted-text">${evalAge(r.date)}</td>
  <td class="action-cell">${applyLink}</td>
</tr>
<tr class="detail-row" id="detail-${idx}" style="display:none">
  <td colspan="13">
    <div class="detail-block">
      ${r._throttle?.label ? `<div class="throttle-banner throttle-${r._throttle.status}">${escape(r._throttle.label)}<br><span class="muted-text">${escape(r._throttle.note || '')}</span></div>` : ''}
      ${r.notes ? `<div class="dcard dcard--tracker-note" style="margin-bottom:8px"><div class="dcard-label">TRACKER NOTE</div>${formatTrackerNote(r.notes)}</div>` : ''}
      ${metaChips ? `<div class="detail-meta">${metaChips}</div>` : ''}
      ${tldrCard}${posCard}
      <div class="detail-grid">
        <div class="detail-col">${matchCard}</div>
        <div class="detail-col">${gapCard}</div>
      </div>
      ${storyCard}
      ${actionCard}
      ${notesCard}
    </div>
  </td>
</tr>`;
}

// ── Comp analytics ─────────────────────────────────────────────────
// Read $K floors from config/profile.yml (compensation block). Defaults
// match the example profile so the dashboard renders sane numbers when
// the file is missing or unparseable.
// Memoized at module load — used by row renderers without round-tripping
// through main(). Recomputed if the dashboard process is re-imported.
let _COMP_FLOORS = { floor: 175, seattleFloor: 180, targetMin: 200, targetMax: 320 };

function loadCompFloors() {
  const defaults = { floor: 175, seattleFloor: 180, targetMin: 200, targetMax: 320 };
  if (!existsSync(PROFILE_YML_PATH)) return defaults;
  try {
    const cfg = parseYaml(readFileSync(PROFILE_YML_PATH, 'utf-8'));
    const c = cfg?.compensation || {};
    const parseK = (s, fallback) => {
      const m = String(s || '').match(/(\d+)\s*K/i);
      return m ? parseInt(m[1], 10) : fallback;
    };
    const range = String(c.target_range || '').match(/\$?\s*(\d+)\s*K\s*[-–—]\s*\$?\s*(\d+)\s*K/i);
    return {
      floor: parseK(c.minimum, defaults.floor),
      seattleFloor: parseK(c.seattle_floor, defaults.seattleFloor),
      targetMin: range ? parseInt(range[1], 10) : defaults.targetMin,
      targetMax: range ? parseInt(range[2], 10) : defaults.targetMax,
    };
  } catch { return defaults; }
}

// Parse the Block A "Comp" cell into a numeric K-range. Returns null when
// the cell is a score (e.g. "2/5"), a non-USD figure, or otherwise unusable.
function parseCompRange(comp) {
  if (!comp || typeof comp !== 'string') return null;
  const text = comp.replace(/[*_`]/g, '');
  const range = text.match(/\$\s*(\d{2,4})\s*K?\s*[\-–—]\s*\$?\s*(\d{2,4})\s*K/i);
  if (range) {
    const min = parseInt(range[1], 10);
    const max = parseInt(range[2], 10);
    if (min >= 30 && max <= 1500 && min <= max) {
      return { min, max, midpoint: Math.round((min + max) / 2), hasEquity: /equity|rsu|stock/i.test(text) };
    }
  }
  const single = text.match(/\$\s*(\d{2,4})\s*K\b/i);
  if (single) {
    const n = parseInt(single[1], 10);
    if (n >= 30 && n <= 1500) {
      return { min: n, max: n, midpoint: n, hasEquity: /equity|rsu|stock/i.test(text) };
    }
  }
  return null;
}

function computeCompAnalytics(apps) {
  const rows = [];
  for (const r of apps) {
    if (!r.reportPath) continue;
    const parsed = parseCompRange(getComp(r.reportPath));
    if (!parsed) continue;
    const archetype = (getReportArchetype(r.reportPath) || '').match(/A1|A2|B/)?.[0] || 'unknown';
    const stage = getEquityForCompany(r.company)?.stage || 'unknown';
    // 4-yr value proxy: midpoint × 4 (base) + 50% if equity is mentioned.
    // Reports rarely quantify RSUs, so this is a directional ranking, not a quote.
    const fourYrValue = Math.round(parsed.midpoint * 4 * (parsed.hasEquity ? 1.5 : 1));
    rows.push({ company: r.company, role: r.role, num: r.num, score: r.score, comp: parsed, archetype, equityStage: stage, fourYrValue });
  }
  const buckets = [
    { label: '$100–150K', min: 100, max: 150, count: 0 },
    { label: '$150–200K', min: 150, max: 200, count: 0 },
    { label: '$200–250K', min: 200, max: 250, count: 0 },
    { label: '$250–300K', min: 250, max: 300, count: 0 },
    { label: '$300–350K', min: 300, max: 350, count: 0 },
    { label: '$350–400K', min: 350, max: 400, count: 0 },
    { label: '$400–500K', min: 400, max: 500, count: 0 },
    { label: '$500K+',    min: 500, max: Infinity, count: 0 },
  ];
  for (const r of rows) {
    const m = r.comp.midpoint;
    const b = buckets.find(b => m >= b.min && m < b.max);
    if (b) b.count++;
  }
  const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const i = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? Math.round((s[i - 1] + s[i]) / 2) : s[i];
  };
  const tierMeta = { A1: 'A1 — Residency', A2: 'A2 — AI Builder', B: 'B — Comms' };
  const medians = ['A1', 'A2', 'B'].map(t => {
    const tierRows = rows.filter(r => r.archetype === t);
    return { tier: t, label: tierMeta[t], count: tierRows.length, median: median(tierRows.map(r => r.comp.midpoint)) };
  });
  return {
    rows, buckets, medians, total: rows.length,
    overallMedian: median(rows.map(r => r.comp.midpoint)),
    topEarners: [...rows].sort((a, b) => b.fourYrValue - a.fourYrValue).slice(0, 10),
  };
}

function renderCompAnalytics(analytics, floors) {
  const { buckets, medians, overallMedian, topEarners, total } = analytics;
  if (total === 0) {
    return `<div class="panel" id="comp-analytics-panel">
      <div class="panel-title collapsible" onclick="togglePanel('comp-analytics-panel',event)">Comp Analytics <span class="panel-chevron">▾</span></div>
      <p style="color:var(--text-3);font-size:13px">No parseable comp data yet — Block A's Comp row needs an explicit USD range to be picked up here.</p>
    </div>`;
  }
  const maxBucket = Math.max(...buckets.map(b => b.count), 1);
  const histHtml = buckets.map(b => {
    const pct = (b.count / maxBucket) * 100;
    const inFloor = b.min >= floors.seattleFloor;
    return `<div class="comp-hist-row" role="listitem" aria-label="${escape(b.label)}: ${b.count} evaluation${b.count === 1 ? '' : 's'}">
      <div class="comp-hist-label">${b.label}</div>
      <div class="comp-hist-track" aria-hidden="true"><div class="comp-hist-fill ${inFloor ? 'above-floor' : 'below-floor'}" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="comp-hist-count">${b.count}</div>
    </div>`;
  }).join('');
  const floorRows = [
    { label: 'All evaluations', median: overallMedian, count: total },
    ...medians,
  ];
  const chartMax = Math.max(...floorRows.map(r => r.median || 0), floors.seattleFloor, floors.targetMax) + 50;
  const floorPct = ((floors.seattleFloor / chartMax) * 100).toFixed(1);
  const floorHtml = floorRows.map(row => {
    if (!row.count) {
      return `<div class="comp-floor-row empty"><div class="comp-floor-label">${escape(row.label)} <span class="comp-floor-count">(0)</span></div><div class="comp-floor-bar-track"><div class="comp-floor-empty">No comp data</div><div class="comp-floor-floor-line" style="left:${floorPct}%" aria-hidden="true"></div></div><div class="comp-floor-value">—</div></div>`;
    }
    const pct = ((row.median / chartMax) * 100).toFixed(1);
    const above = row.median >= floors.seattleFloor;
    return `<div class="comp-floor-row" role="img" aria-label="${escape(row.label)}: median $${row.median}K (${row.count} evaluation${row.count === 1 ? '' : 's'}) — ${above ? 'above' : 'below'} $${floors.seattleFloor}K floor">
      <div class="comp-floor-label">${escape(row.label)} <span class="comp-floor-count">(${row.count})</span></div>
      <div class="comp-floor-bar-track">
        <div class="comp-floor-bar ${above ? 'above' : 'below'}" style="width:${pct}%"></div>
        <div class="comp-floor-floor-line" style="left:${floorPct}%" aria-hidden="true" title="Seattle floor: $${floors.seattleFloor}K"></div>
      </div>
      <div class="comp-floor-value ${above ? 'good' : 'bad'}">$${row.median}K</div>
    </div>`;
  }).join('');
  const stageClass = (s) => (s === 'late' || s === 'cd') ? 'top-earner-green' : s === 'public' ? 'top-earner-blue' : (s === 'b' || s === 'seed-a') ? 'top-earner-amber' : 'top-earner-grey';
  const fmt$ = (n) => n >= 1000 ? `$${(n / 1000).toFixed(2)}M` : `$${n}K`;
  const topHtml = topEarners.map(r => {
    const meta = EQUITY_STAGE_META[r.equityStage] || EQUITY_STAGE_META.unknown;
    const range = r.comp.min === r.comp.max ? `$${r.comp.min}K` : `$${r.comp.min}–${r.comp.max}K`;
    return `<tr class="${stageClass(r.equityStage)}">
      <td>${escape(r.company)}</td>
      <td class="role-cell">${escape(r.role.length > 56 ? r.role.slice(0, 53) + '…' : r.role)}</td>
      <td>${range}${r.comp.hasEquity ? ' <span class="comp-eq-tag" title="Equity / RSU mentioned in JD">+eq</span>' : ''}</td>
      <td class="num">${fmt$(r.fourYrValue)}</td>
      <td><span class="equity-badge ${meta.cls}" title="${escape(meta.label)}">${meta.emoji} ${escape(meta.label)}</span></td>
    </tr>`;
  }).join('');
  return `
  <div class="panel" id="comp-analytics-panel">
    <div class="panel-title collapsible" onclick="togglePanel('comp-analytics-panel',event)">Comp Analytics <span class="pill" style="background:var(--blue-fg)">${total} parseable</span> <span class="panel-chevron">▾</span></div>
    <p class="comp-subnote">Parsed from each report's Block A Comp row. Seattle floor: <strong>$${floors.seattleFloor}K</strong> · Target: <strong>$${floors.targetMin}K–$${floors.targetMax}K</strong>. 4-yr est. = midpoint × 4 (× 1.5 if equity mentioned) — directional, not a quote.</p>
    <div class="comp-grid">
      <div class="comp-sub">
        <h3 class="comp-sub-title">Comp range distribution</h3>
        <div class="comp-hist" role="list" aria-label="Comp range distribution across ${total} evaluations">${histHtml}</div>
      </div>
      <div class="comp-sub">
        <h3 class="comp-sub-title">Median vs Seattle floor</h3>
        <div class="comp-floor-chart">${floorHtml}</div>
      </div>
      <div class="comp-sub comp-sub-wide">
        <h3 class="comp-sub-title">Top 10 by 4-year value</h3>
        <div class="comp-top-scroll"><table class="comp-top-table" aria-label="Top 10 evaluations by 4-year comp value">
          <thead><tr><th>Company</th><th>Role</th><th>Range</th><th class="num">4yr est.</th><th>Stage</th></tr></thead>
          <tbody>${topHtml}</tbody>
        </table></div>
      </div>
    </div>
  </div>`;
}

function build() {
  // Reset the per-build report cache so successive invocations (e.g. tests
  // that import build()) don't carry stale parsed reports across builds.
  _resetReportCache();

  if (!existsSync(dirname(OUT_PATH))) mkdirSync(dirname(OUT_PATH), { recursive: true });
  const reportsHtmlDir = join(dirname(OUT_PATH), 'reports');

  // Pre-render every report.md to dashboard/reports/{name}.html so the
  // dashboard's Report links open formatted previews in the browser
  // (no Cursor / no key-shortcut required).
  const allReports = existsSync(REPORTS_DIR) ? readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md')) : [];
  let renderedCount = 0;
  for (const f of allReports) {
    if (renderReportToHtml(`reports/${f}`, reportsHtmlDir)) renderedCount++;
  }

  const apps = parseApplications();
  const today = new Date().toISOString().slice(0, 10);
  const generated = new Date().toISOString();
  const generatedShort = new Date(generated).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles'
  });
  let appVersion = '';
  try { appVersion = readFileSync(join(ROOT, 'VERSION'), 'utf-8').trim(); } catch (e) { /* ignore */ }

  // Stats
  const total = apps.length;
  // Apply-Now: candidates Mitchell can act on today. Excludes "Interview"
  // status (already in motion) per his preference.
  const applyNow = apps.filter(r => r.score >= 4.0 && /^(evaluated|responded)$/i.test(r.status));

  // Throttle policy — heuristic guidance based on aggregated candidate
  // reports (Blind, Reddit, LinkedIn, Grok-verified April 2026). NOT
  // official company policy. Real cooldown depends on rejection stage:
  // app-screen ≈ 2-3mo, phone ≈ 3-6mo, onsite ≈ 6-12mo. Recruiter
  // goodwill matters more than calendar — over-applying flags spam.
  const THROTTLE_POLICY = {
    'anthropic': { cap: 1, cooldown: '3-12 months by rejection stage', note: '#1 target. ATS tracks COMPANY-WIDE, not by role. Spamming auto-flags low-priority. Apply to the single highest-scoring Mitchell-shaped role; wait for resolution before next.' },
    'openai':    { cap: 2, cooldown: 'Variable (recruiter-dependent)', note: 'Less rigid than Anthropic. Some recruiters explicitly say "reapply anytime." If rejected, ask the recruiter for the re-application window.' },
    'stripe':    { cap: 3, cooldown: 'Variable; check rejection email', note: 'Sparse data. Distinct teams (Press vs. Atlas vs. Payments) treated separately. Some reports of 6-12mo for same role family.' },
  };

  // Load real rejection history from auto-scrape + manual corpus to compute
  // per-company cooldown end dates. Stage-aware: app_screen=3mo, phone=6mo,
  // onsite=12mo (from modes/_profile.md §0a heuristics).
  function loadRejectionHistory() {
    const rejections = [];
    // Source 1: auto-scraped JSON
    const autoPath = join(ROOT, 'data/rejection-history.json');
    if (existsSync(autoPath)) {
      try {
        const auto = JSON.parse(readFileSync(autoPath, 'utf-8'));
        for (const r of auto) {
          if (!r.is_rejection) continue;
          rejections.push({
            company: (r.company || '').toLowerCase(),
            role: r.role || '',
            date: r._date || '',
            stage: r.rejection_stage || 'unspecified',
            source: 'auto-scrape',
          });
        }
      } catch {}
    }
    // Source 2: corpus/rejections.md hand-stubbed entries
    const corpusPath = join(ROOT, 'corpus/rejections.md');
    if (existsSync(corpusPath)) {
      const text = readFileSync(corpusPath, 'utf-8');
      for (const m of text.matchAll(/^#{2,3}\s+([^—\n]+?)\s+—\s+([^—\n]+?)\s+—\s+(\d{4}[-\/]\d{2}(?:[-\/]\d{2})?)/gm)) {
        const company = m[1].trim();
        if (/pattern summary|cross-references|other rejections/i.test(company)) continue;
        const role = m[2].trim();
        const dateStr = m[3].replace(/\//g, '-');
        const date = dateStr.length === 7 ? `${dateStr}-01` : dateStr;
        // Try to find stage in the following block
        const blockStart = m.index + m[0].length;
        const blockEnd = text.indexOf('\n##', blockStart);
        const block = text.slice(blockStart, blockEnd === -1 ? blockStart + 1500 : blockEnd);
        const stageHint = /Stage:\*\*\s+([^\n]+)/.exec(block)?.[1] || '';
        let stage = 'unspecified';
        if (/onsite|final\s*round|full\s*loop/i.test(stageHint)) stage = 'onsite_loop';
        else if (/phone|recruiter\s*screen/i.test(stageHint)) stage = 'phone_screen';
        else if (/online\s*assessment|take\s*home/i.test(stageHint)) stage = 'take_home_oa';
        else if (/app(?:lication)?\s*screen/i.test(stageHint)) stage = 'app_screen';
        else if (/withdrawn|silen/i.test(stageHint)) stage = 'auto_withdrawn';
        rejections.push({ company: company.toLowerCase(), role, date, stage, source: 'corpus' });
      }
    }
    return rejections;
  }

  function cooldownMonths(stage) {
    if (stage === 'onsite_loop' || stage === 'final_round') return 12;
    if (stage === 'take_home_oa' || stage === 'phone_screen') return 6;
    if (stage === 'auto_withdrawn') return 0;
    return 3;  // app_screen / unspecified
  }

  function getCompanyCooldownStatus(company, rejections, today = new Date()) {
    const matches = rejections.filter(r => r.company === company.toLowerCase() && r.stage !== 'auto_withdrawn');
    if (matches.length === 0) return null;
    let latestEnd = new Date(0);
    let driverRej = null;
    for (const r of matches) {
      const d = new Date(r.date);
      d.setMonth(d.getMonth() + cooldownMonths(r.stage));
      if (d > latestEnd) { latestEnd = d; driverRej = r; }
    }
    const isActive = latestEnd > today;
    return { isActive, latestEnd, driverRejection: driverRej, totalCount: matches.length };
  }

  const rejectionHistory = loadRejectionHistory();
  const activeAppsByCompany = {};
  for (const r of apps) {
    if (!/^(Applied|Responded|Interview|Offer)$/i.test(r.status)) continue;
    const k = r.company.toLowerCase();
    activeAppsByCompany[k] = (activeAppsByCompany[k] || 0) + 1;
  }

  // Group Apply-Now by company so we can render "pick the highest" guidance
  // for throttled companies. Within each company group, the highest-scoring
  // role is "recommended"; the rest are "deferred" (still listed but flagged).
  const applyNowByCompany = {};
  for (const r of applyNow) {
    const k = r.company.toLowerCase();
    if (!applyNowByCompany[k]) applyNowByCompany[k] = [];
    applyNowByCompany[k].push(r);
  }
  // Tag each row with its throttle status. Layer 1 = active-application
  // cap (in-flight apps at this company). Layer 2 = stage-aware cooldown
  // from rejection history. Both can fire simultaneously.
  const todayDate = new Date();
  for (const r of applyNow) {
    const k = r.company.toLowerCase();
    const policy = THROTTLE_POLICY[k];
    const active = activeAppsByCompany[k] || 0;
    const groupRows = applyNowByCompany[k].sort((a, b) => b.score - a.score);
    const isTopOfCompany = groupRows[0].num === r.num;
    const cooldown = getCompanyCooldownStatus(r.company, rejectionHistory, todayDate);

    // Cooldown layer takes priority — if there's an active rejection
    // cooldown, surface it as the primary signal.
    if (cooldown && cooldown.isActive) {
      const endStr = cooldown.latestEnd.toISOString().slice(0, 10);
      const driver = cooldown.driverRejection;
      r._throttle = {
        status: 'cooldown',
        label: `🛑 Rejection cooldown active until ${endStr} (${cooldown.totalCount} prior rejection${cooldown.totalCount === 1 ? '' : 's'} at ${r.company})`,
        note: `Driver: ${driver.role} (${driver.date}, stage: ${driver.stage}). Re-apply window cleared on ${endStr} per stage-aware heuristic. Override if you have an internal referral or recruiter says re-apply sooner.`,
      };
    } else if (policy && active >= policy.cap) {
      r._throttle = { status: 'blocked', label: `🛑 ${policy.cap} active app${policy.cap === 1 ? '' : 's'} at ${r.company} — defer until resolved`, note: policy.note };
    } else if (groupRows.length > 1 && !isTopOfCompany) {
      r._throttle = { status: 'defer', label: `⏸ Defer — apply to higher-scored ${r.company} role first`, note: policy?.note || 'Pick highest-scored at the same company first.' };
    } else if (groupRows.length > 1 && isTopOfCompany) {
      const cooldownNote = cooldown ? ` · Past cooldown cleared ${cooldown.latestEnd.toISOString().slice(0, 10)}` : '';
      r._throttle = { status: 'pickone', label: `⭐ Apply this ONE first (${groupRows.length - 1} other ${r.company} roles deferred${cooldownNote})`, note: policy?.note || '' };
    } else if (cooldown) {
      // Cooldown cleared — show informational note
      r._throttle = { status: 'open', label: `✅ Past cooldown cleared ${cooldown.latestEnd.toISOString().slice(0, 10)} (${cooldown.totalCount} prior rejection${cooldown.totalCount === 1 ? '' : 's'})`, note: 'Window has elapsed; safe to re-apply.' };
    } else {
      r._throttle = { status: 'open', label: '', note: '' };
    }
  }
  const applied = apps.filter(r => /applied|interview|offer/i.test(r.status));
  const pipelinePending = countPipelinePending();
  const scanTotal = countScanHistory();
  const batchRuns = countBatchRuns();
  const portals = getEnabledPortals();
  const reportsToday = countTodaysReports(today);
  const liveTicker = loadLiveScanEvents();
  const liveTickerJson = JSON.stringify(liveTicker).replace(/<\//g, '<\\/');
  const batchSnapshot = loadBatchSnapshot();
  const healthSnapshot = loadSystemHealthSnapshot(apps);
  const mcStripJson = JSON.stringify({ batch: batchSnapshot, health: healthSnapshot }).replace(/<\//g, '<\\/');
  const kpiSpark = computeKPISparklines(apps, today);

  // Sorted views
  const sortedByScore = [...apps].sort((a, b) => b.score - a.score);
  const applyNowSorted = [...applyNow].sort((a, b) => b.score - a.score);

  // Score buckets
  const buckets = { '4.0+': 0, '3.0-3.9': 0, '2.0-2.9': 0, '1.0-1.9': 0, '0-0.9': 0 };
  for (const r of apps) {
    if (r.score >= 4.0) buckets['4.0+']++;
    else if (r.score >= 3.0) buckets['3.0-3.9']++;
    else if (r.score >= 2.0) buckets['2.0-2.9']++;
    else if (r.score >= 1.0) buckets['1.0-1.9']++;
    else buckets['0-0.9']++;
  }

  // Top companies
  const byCompany = {};
  for (const r of apps) {
    byCompany[r.company] = (byCompany[r.company] || 0) + 1;
  }
  const topCompanies = Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 15);

  // Trends — last 12 weeks (rolling 7-day windows ending today)
  const DAY_MS = 86400000;
  const todayMs = new Date(today + 'T00:00:00Z').getTime();
  const trendWeeks = [];
  for (let w = 11; w >= 0; w--) {
    const endMs = todayMs - w * 7 * DAY_MS;
    const startMs = endMs - 6 * DAY_MS;
    trendWeeks.push({
      label: new Date(startMs).toISOString().slice(5, 10),
      startMs, endMs,
      count: 0, scoreSum: 0, scoreCount: 0,
    });
  }
  for (const r of apps) {
    if (!r.date) continue;
    const ms = new Date(r.date + 'T00:00:00Z').getTime();
    if (isNaN(ms)) continue;
    for (const wk of trendWeeks) {
      if (ms >= wk.startMs && ms <= wk.endMs) {
        wk.count++;
        if (r.score > 0) { wk.scoreSum += r.score; wk.scoreCount++; }
        break;
      }
    }
  }

  // Funnel — current pipeline by canonical status
  const funnelOrder = [
    { key: 'Evaluated', cls: 'fn-eval' },
    { key: 'Applied',   cls: 'fn-apply' },
    { key: 'Interview', cls: 'fn-int' },
    { key: 'Offer',     cls: 'fn-offer' },
    { key: 'Rejected',  cls: 'fn-rej' },
  ];
  const funnel = Object.fromEntries(funnelOrder.map(s => [s.key, 0]));
  for (const r of apps) {
    const s = (r.status || '').replace(/\*\*/g, '').trim();
    if (funnel.hasOwnProperty(s)) funnel[s]++;
    else if (/interview/i.test(s)) funnel.Interview++;
  }
  // Comp analytics — distribution, floor gap, top earners.
  const compFloors = loadCompFloors();
  _COMP_FLOORS = compFloors;
  const compAnalytics = computeCompAnalytics(apps);

  // Apply-now table rows
  const applyNowRows = applyNowSorted.map((r, i) => renderRow(r, `apply-${i}`)).join('\n');
  const allRows = sortedByScore.map((r, i) => renderRow(r, `all-${i}`)).join('\n');

  // ── Cmd-K palette data ────────────────────────────────────────────
  // Compact index of every row + the 5 most recently dated reports.
  const cmdkRows = sortedByScore.map((r, i) => ({
    num: r.num,
    rowId: `all-${i}`,
    company: r.company,
    role: r.role,
    score: r.score,
    archetype: getReportArchetype(r.reportPath) || '',
    status: r.status,
  }));
  const recentReports = [...apps]
    .filter(r => r.reportPath)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5)
    .map(r => ({
      slug: basename(r.reportPath).replace(/\.md$/, '.html'),
      title: `${r.company} — ${r.role}`,
      date: r.date,
      num: r.num,
    }));
  // Escape </ to keep the JSON safe inside a <script> tag.
  const cmdkPayload = JSON.stringify({ rows: cmdkRows, reports: recentReports }).replace(/<\//g, '<\\/');

  // Email-launcher payload — templates + sender identity. Keeping the
  // identity in build-time JSON (rather than fetched at runtime) means
  // mailto: drafts work even when the dashboard is opened as a static
  // file off disk, with no server.
  const emailHeadline = loadCvHeadline();
  const emailTemplates = loadEmailTemplates();
  const emailLauncherPayload = JSON.stringify({
    sender: emailHeadline,
    templates: emailTemplates,
  }).replace(/<\//g, '<\\/');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Career-Ops Dashboard — ${today}</title>
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon-180.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0c0a09">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Career-Ops">
<!-- iOS PWA splash screens (standalone mode). Generated by dashboard/assets/render-splash.mjs. -->
<link rel="apple-touch-startup-image" href="/assets/splash-1290x2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/assets/splash-1179x2556.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/assets/splash-1284x2778.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/assets/splash-1170x2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/assets/splash-1242x2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/assets/splash-1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/assets/splash-828x1792.png"  media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/assets/splash-750x1334.png"  media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/assets/splash-1620x2160.png" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/assets/splash-1668x2388.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="apple-touch-startup-image" href="/assets/splash-2048x2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  /* ── Design tokens ─────────────────────────────────────────────── */
  :root {
    --bg: #f8f9fb;
    --surface: #ffffff;
    --surface-2: #f4f4f6;
    --border: #e5e7eb;
    --border-strong: #d1d5db;
    --text: #111827;
    --text-2: #374151;
    --text-3: #6b7280;
    --text-4: #9ca3af;
    --green: #15803d;
    --green-fg: #16a34a;
    --green-fg-dark: #166534;
    --green-bg: #dcfce7;
    --green-border: #86efac;
    /* ── Single-accent palette (Phase 7 Item 2, Wave I) ──────────
       Editorial-restraint move per data/dashboard-phase7-inspiration-2026-05-10.md:
       reserve saturation for green (act) and red (blocked) only.
       Blue / amber / purple are demoted to desaturated semantic tokens
       (~50% chroma drop) so the eye is drawn to Apply-Now and to
       blocked/error states first. Hue is preserved enough to keep
       links readable as links and warnings readable as warnings,
       but no longer competes with green/red for visual weight. */
    --blue: #475c75;
    --blue-fg: #5a76a6;
    --blue-fg-dark: #3d4f6b;
    --blue-bg: #e8edf4;
    --blue-border: #c0cad9;
    --amber: #8a6840;
    --amber-fg: #a87b48;
    --amber-fg-dark: #6b5430;
    --amber-bg: #f4ede1;
    --amber-border: #d8c79f;
    --red: #b91c1c;
    --red-fg: #dc2626;
    --red-fg-dark: #991b1b;
    --red-bg: #fee2e2;
    --red-border: #fca5a5;
    --purple: #5d5670;
    --purple-fg: #847a99;
    --purple-fg-dark: #4f4960;
    --purple-bg: #ecebf0;
    --purple-border: #cac6d4;
    --radius: 8px;
    --radius-sm: 6px;
    --radius-full: 9999px;
    --section-gap: 64px;
    --shadow-sm: 0 1px 2px 0 rgba(0,0,0,.05);
    --shadow: 0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1);
    --shadow-md: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1);
    --shadow-lg: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1);
    --ring-green: 0 0 0 3px rgba(22,163,74,.15);
    --ring-blue: 0 0 0 3px rgba(90,118,166,.18);
    /* ── Monospace accent surface (Phase 6 #1.3) ─────────────────
       Dev-tool aesthetic for data, timestamps, IDs, and numerics.
       JetBrains Mono ships tnum + ss01-ss20 features; we enable
       tnum on numeric containers so digits column-align even when
       the surface itself is non-tabular. */
    --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    /* ── Motion tokens (Phase 6 #1.2) ────────────────────────────
       Material-style standard easing; duration tuned for
       row reorder + status pill writeback at 250ms. */
    --motion-duration: 250ms;
    --motion-duration-fast: 180ms;
    --motion-ease: cubic-bezier(0.4, 0, 0.2, 1);
  }
  body.dark {
    /* Dark surfaces tuned so all body text hits WCAG AAA (≥7:1) on --bg
       and at least AA (≥4.5:1) on the brightest surface (--surface-2).
       Mission-control / space vibe: cool slate-blue base, deep enough for
       OLED affinity but with a hint of cobalt warmth so the matrix-green
       accent (hero balance, role-link hover) reads as the single dominant
       signal color instead of fighting a neutral dead-grey background. */
    --bg: #06070d;
    --surface: #11131c;
    --surface-2: #181b27;
    --border: #232737;
    --border-strong: #353a52;
    --text: #fafafa;
    --text-2: #e4e4e7;
    --text-3: #b8b8c0;
    --text-4: #9a9aa6;
    --green: #4ade80;
    --green-fg: #86efac;
    --green-fg-dark: #bbf7d0;
    --green-bg: rgba(22,163,74,.12);
    --green-border: rgba(22,163,74,.3);
    /* Dark-mode equivalents of the Phase 7 single-accent palette.
       Greens + reds keep their saturated dark-mode values; blue / amber /
       purple are dropped to slate / muted-ochre / near-monochrome so the
       Apply-Now CTA and FAIL/blocked states remain the only saturated
       surfaces on the page. */
    --blue: #a4b0c2;
    --blue-fg: #94a3b8;
    --blue-fg-dark: #cbd5e1;
    --blue-bg: rgba(100,116,139,.14);
    --blue-border: rgba(100,116,139,.3);
    --amber: #c2a571;
    --amber-fg: #d4ba84;
    --amber-fg-dark: #e6d4a8;
    --amber-bg: rgba(168,123,72,.14);
    --amber-border: rgba(168,123,72,.3);
    --red: #f87171;
    --red-fg: #fca5a5;
    --red-fg-dark: #fecaca;
    --red-bg: rgba(220,38,38,.12);
    --red-border: rgba(220,38,38,.3);
    --purple: #b3afbf;
    --purple-fg: #a39db5;
    --purple-fg-dark: #cdc8d6;
    --purple-bg: rgba(132,122,153,.14);
    --purple-border: rgba(132,122,153,.3);
    /* Two-layer focus ring for dark mode: outer glow + inner crisp ring
       so the indicator reads on both raised surfaces and the page bg
       without fighting the colored token underneath. */
    --ring-green: 0 0 0 2px rgba(10,10,11,.95), 0 0 0 4px rgba(74,222,128,.55), 0 0 12px rgba(74,222,128,.18);
    --ring-blue:  0 0 0 2px rgba(10,10,11,.95), 0 0 0 4px rgba(148,163,184,.55), 0 0 12px rgba(148,163,184,.18);
  }

  /* Space ambient — only in dark mode. Two soft radial gradients painted
     onto the body via background-image so they layer behind every panel
     without affecting click targets or scroll perf. Stays off in light. */
  body.dark {
    background-color: var(--bg);
    background-image:
      radial-gradient(ellipse 1200px 600px at 12% -10%, rgba(64, 224, 208, 0.06), transparent 60%),
      radial-gradient(ellipse 900px 500px at 88% 110%, rgba(139, 92, 246, 0.05), transparent 65%),
      radial-gradient(ellipse 700px 400px at 50% 50%, rgba(0, 255, 157, 0.025), transparent 70%);
    background-attachment: fixed;
  }
  /* Apply-Now hero gets a stronger matrix-green glow when in dark mode —
     the room's only saturated focal point. */
  body.dark .stat-hero-balance {
    background:
      radial-gradient(ellipse at left center, rgba(0,255,157,0.16) 0%, rgba(0,255,157,0.05) 35%, var(--surface) 78%);
    border-color: rgba(0,255,157,0.18);
    box-shadow: 0 0 0 1px rgba(0,255,157,0.08), 0 8px 32px rgba(0,255,157,0.06);
  }
  body.dark .stat-hero-balance::before {
    background: linear-gradient(90deg, #00ff9d, rgba(0,255,157,0.4) 30%, transparent);
    box-shadow: 0 0 12px rgba(0,255,157,0.4);
  }
  body.dark .stat-hero-balance .stat-value {
    color: #4ade80;
    text-shadow: 0 0 24px rgba(74,222,128,0.35);
  }
  body.dark .stat-hero-balance:hover {
    border-color: rgba(0,255,157,0.45);
    box-shadow: 0 0 0 1px rgba(0,255,157,0.25), 0 12px 48px rgba(0,255,157,0.18);
  }
  body.dark a.role-link:hover, body.dark a.role-link:focus-visible {
    color: #4ade80;
    text-shadow: 0 0 8px rgba(74,222,128,0.45);
    border-bottom-color: #4ade80;
  }

  /* OLED true-black mode — opt-in via Cmd-K or the body.oled class.
     Saves power on AMOLED panels and adds visual depth: surfaces sit
     against pure black so the elevation hierarchy is more legible. */
  body.dark.oled {
    --bg: #000000;
    --surface: #0a0a0d;
    --surface-2: #131319;
    --border: #1f1f24;
    --border-strong: #2e2e36;
    /* Re-derive the focus-ring outer halo against the new --bg. */
    --ring-green: 0 0 0 2px rgba(0,0,0,.95), 0 0 0 4px rgba(74,222,128,.55), 0 0 12px rgba(74,222,128,.18);
    --ring-blue:  0 0 0 2px rgba(0,0,0,.95), 0 0 0 4px rgba(147,197,253,.55), 0 0 12px rgba(147,197,253,.18);
  }

  /* Tinted card surfaces in dark mode — Linear-style depth via subtle
     1.5–4% color washes layered as background-image gradients on top of
     the surface fill. Direct background-image (rather than a pseudo-
     element overlay) sidesteps the stacking conflict with existing
     decorative ::before bars and keeps hover state simple. */
  body.dark .panel-strong {
    background-image: linear-gradient(160deg, rgba(74,222,128,.04) 0%, rgba(74,222,128,0) 55%);
  }
  body.dark #comp-analytics-panel {
    background-image: linear-gradient(160deg, rgba(96,165,250,.035) 0%, rgba(96,165,250,0) 55%);
  }
  body.dark #trends-panel {
    background-image: linear-gradient(160deg, rgba(167,139,250,.03) 0%, rgba(167,139,250,0) 55%);
  }
  body.dark .stat-strong {
    background-image: linear-gradient(155deg, rgba(74,222,128,.045) 0%, rgba(74,222,128,0) 60%);
  }

  /* Caret visibility — on dark, default cursor color tracks --text and is
     a hairline; declaring caret-color explicitly keeps it bright against
     all input surfaces (filters, search, Cmd-K, quick-add textarea). */
  body.dark input,
  body.dark textarea,
  body.dark select {
    caret-color: var(--blue-fg);
  }

  /* ── Reset & base ────────────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    color: var(--text);
    background: var(--bg);
    margin: 0;
    /* Padding moved to .app-main so the persistent left sidebar can
       sit flush against the viewport edge. */
    padding: 0;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  .container { max-width: 1400px; margin: 0 auto; }

  /* ── Persistent left sidebar nav (Phase 7 Item 4) ────────────────
     Spatial IA via a sticky left rail with section anchors.
       • desktop ≥1280px : 200px expanded with text labels
       • 720–1279px      : 56px collapsed, icons only
       • <720px          : hidden offscreen + hamburger drawer
     Sections highlight as the user scrolls (IntersectionObserver).
     Cmd-K still works as primary keyboard nav for power users. */
  :root {
    --sidebar-w: 200px;
    --sidebar-w-collapsed: 56px;
  }
  .app-shell {
    display: grid;
    grid-template-columns: var(--sidebar-w) 1fr;
    min-height: 100vh;
  }
  .app-main {
    padding: 24px 28px;
    min-width: 0;
  }
  .sidebar {
    position: sticky;
    top: 0;
    align-self: start;
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    z-index: 50;
    transition: transform .25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  body.dark .sidebar { background: var(--surface); border-right-color: var(--border); }
  .sidebar-brand {
    display: flex; align-items: center; gap: 10px;
    padding: 18px 16px 14px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    font-weight: 700; font-size: 14px; letter-spacing: -0.2px;
    flex-shrink: 0;
  }
  .sidebar-favicon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border-radius: 6px;
    background: linear-gradient(135deg, var(--green-fg), var(--blue-fg));
    color: #fff; font-size: 13px; font-weight: 700;
    flex-shrink: 0;
  }
  .sidebar-brand-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sidebar-nav {
    display: flex; flex-direction: column;
    padding: 10px 8px;
    flex: 1 1 auto;
    gap: 2px;
  }
  .sidebar-link {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px;
    border-radius: var(--radius-sm, 6px);
    border: 0;
    background: transparent;
    color: var(--text-2);
    font-size: 13px; font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    border-left: 3px solid transparent;
    margin-left: -3px;
    transition: background .12s, color .12s, border-color .12s;
    font-family: inherit;
    text-align: left;
    width: 100%;
  }
  .sidebar-link:hover {
    background: var(--surface-2);
    color: var(--text);
    text-decoration: none;
  }
  .sidebar-link.active {
    background: var(--surface-2);
    color: var(--text);
    border-left-color: var(--green-fg);
    font-weight: 600;
  }
  .sidebar-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px;
    font-size: 14px;
    flex-shrink: 0;
  }
  .sidebar-label {
    flex: 1 1 auto;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sidebar-footer {
    padding: 10px 12px 14px;
    border-top: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 8px;
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-3);
  }
  .sidebar-mini-ticker {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 11px; color: var(--text-3);
    overflow: hidden;
  }
  .sidebar-mini-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--green-fg);
    flex-shrink: 0;
    box-shadow: 0 0 0 0 currentColor;
    animation: sidebar-dot-pulse 2s ease-out infinite;
  }
  @keyframes sidebar-dot-pulse {
    0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
    70% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
    100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sidebar-mini-dot { animation: none; }
  }
  .sidebar-mini-text {
    flex: 1 1 auto;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sidebar-version {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10.5px; color: var(--text-4);
    text-align: center;
    letter-spacing: 0.3px;
  }

  /* Hamburger toggle — only visible on mobile <720px. */
  .sidebar-toggle {
    display: none;
    position: fixed; top: 14px; left: 12px;
    z-index: 9001;
    width: 38px; height: 38px;
    align-items: center; justify-content: center;
    border-radius: var(--radius-sm, 6px);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-2);
    font-size: 18px; line-height: 1;
    cursor: pointer;
    font-family: inherit;
  }
  .sidebar-toggle:hover { background: var(--surface-2); }

  /* Backdrop for mobile drawer state. */
  .sidebar-backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.42);
    opacity: 0;
    pointer-events: none;
    transition: opacity .22s ease;
    z-index: 8999;
  }
  .sidebar-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
  }

  /* Collapsed icon-only mode at narrower desktop widths. */
  @media (max-width: 1279px) and (min-width: 721px) {
    .app-shell { grid-template-columns: var(--sidebar-w-collapsed) 1fr; }
    .sidebar-brand { justify-content: center; padding: 18px 8px 14px; }
    .sidebar-brand-name { display: none; }
    .sidebar-nav { padding: 10px 6px; }
    .sidebar-link {
      justify-content: center;
      padding: 9px 6px;
      gap: 0;
    }
    .sidebar-link .sidebar-label { display: none; }
    .sidebar-footer { padding: 8px 6px 12px; align-items: center; }
    .sidebar-mini-ticker {
      padding: 6px;
      width: 32px; height: 32px;
      justify-content: center;
      border-radius: 50%;
    }
    .sidebar-mini-text { display: none; }
    .sidebar-version { font-size: 9px; }
  }

  /* User-toggled collapse — mirrors the narrow-viewport rules but works at any
     width >720px. Persisted via localStorage (init in initSidebarCollapse). */
  @media (min-width: 721px) {
    body.sidebar-collapsed .app-shell { grid-template-columns: var(--sidebar-w-collapsed) 1fr; }
    body.sidebar-collapsed .sidebar-brand { justify-content: center; padding: 18px 8px 14px; }
    body.sidebar-collapsed .sidebar-brand-name { display: none; }
    body.sidebar-collapsed .sidebar-nav { padding: 10px 6px; }
    body.sidebar-collapsed .sidebar-link { justify-content: center; padding: 9px 6px; gap: 0; }
    body.sidebar-collapsed .sidebar-link .sidebar-label { display: none; }
    body.sidebar-collapsed .sidebar-footer { padding: 8px 6px 12px; align-items: center; }
    body.sidebar-collapsed .sidebar-mini-ticker {
      padding: 6px; width: 32px; height: 32px;
      justify-content: center; border-radius: 50%;
    }
    body.sidebar-collapsed .sidebar-mini-text { display: none; }
    body.sidebar-collapsed .sidebar-version { font-size: 9px; }
    body.sidebar-collapsed .sidebar-collapse-btn .sidebar-collapse-icon { transform: rotate(180deg); }
    body.sidebar-collapsed .sidebar-collapse-btn .sidebar-collapse-label { display: none; }
  }
  .sidebar-collapse-btn {
    display: none;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-3);
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 11px;
    align-items: center; gap: 6px;
    margin-bottom: 8px;
    transition: border-color .12s, color .12s, background .12s;
  }
  .sidebar-collapse-btn:hover { border-color: var(--border-strong); color: var(--text); background: var(--surface); }
  .sidebar-collapse-icon {
    display: inline-block; width: 12px; height: 12px;
    transition: transform .15s ease;
  }
  @media (min-width: 1280px) {
    .sidebar-collapse-btn { display: inline-flex; }
  }

  /* Mobile drawer mode. */
  @media (max-width: 720px) {
    .app-shell { grid-template-columns: 1fr; }
    .sidebar {
      position: fixed; left: 0; top: 0; bottom: 0;
      width: var(--sidebar-w);
      height: 100vh;
      transform: translateX(-100%);
      box-shadow: 2px 0 24px rgba(0, 0, 0, 0.25);
    }
    .sidebar.open { transform: translateX(0); }
    .sidebar-toggle { display: inline-flex; }
    /* Push toolbar right of the hamburger so brand stays legible. */
    .toolbar h1 { padding-left: 44px; }
  }
  h1 { margin: 0 0 2px; font-size: 22px; font-weight: 700; letter-spacing: -0.4px; }
  h2 { margin: 32px 0 14px; font-size: 16px; font-weight: 600; padding-bottom: 8px;
       border-bottom: 1px solid var(--border); letter-spacing: -0.2px; }
  a { color: var(--blue-fg); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px;
         background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }
  .subtle { color: var(--text-3); font-size: 12.5px; margin-bottom: 20px; }
  .muted { color: var(--text-4); }
  .muted-text { color: var(--text-3); font-size: 12px; }

  /* ── Accessibility utilities ─────────────────────────────────── */
  /* Visually hidden but exposed to assistive tech (WCAG 1.3.1, 4.1.2). */
  .sr-only {
    position: absolute !important; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
    white-space: nowrap; border: 0;
  }
  /* Skip-link is the first focusable element on the page (WCAG 2.4.1). */
  .skip-link {
    position: absolute; top: -40px; left: 8px;
    background: var(--blue-fg-dark); color: #fff;
    padding: 10px 14px; border-radius: var(--radius-sm);
    font-weight: 600; font-size: 13px; z-index: 10000;
    text-decoration: none;
  }
  .skip-link:focus { top: 8px; outline: 2px solid var(--text); outline-offset: 2px; }
  /* Global focus-visible ring for keyboard navigation (WCAG 2.4.7). */
  a:focus-visible,
  button:focus-visible,
  [tabindex]:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--blue-fg);
    outline-offset: 2px;
    border-radius: inherit;
  }
  /* Dark-mode focus: swap the flat 2px outline for the dual-ring
     pattern (inner crisp ring + outer glow) defined by --ring-blue.
     The flat outline fights raised surfaces; the glow reads against
     both --bg and --surface without sacrificing visibility on tinted
     panels. The thin outline is kept so the indicator survives even
     if box-shadow is suppressed (e.g., screenshot tools). */
  body.dark a:focus-visible,
  body.dark button:focus-visible,
  body.dark [tabindex]:focus-visible,
  body.dark input:focus-visible,
  body.dark select:focus-visible,
  body.dark textarea:focus-visible {
    outline: 1px solid var(--blue-fg);
    outline-offset: 1px;
    box-shadow: var(--ring-blue);
  }

  /* ── Left sidebar nav (Phase 7 Item 4) ───────────────────────────
     A persistent left rail with section anchors. At ≥1280px the
     sidebar shows full labels (200px). At 720–1280px it collapses
     to icon-only (56px). Below 720px it's hidden — the existing
     mobile bottom tab bar handles primary nav, with a hamburger
     in the toolbar that opens this same sidebar as a slide-in
     drawer. The toolbar (top) stays unchanged — power users still
     get Cmd-K, Search, Add role, Dark, Batch from the top header. */
  .layout {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 24px;
    align-items: start;
  }
  .sidebar {
    position: sticky;
    top: 16px;
    height: calc(100vh - 32px);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    padding: 16px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .sidebar-brand {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 8px 12px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 8px;
    color: var(--text);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: -0.2px;
  }
  .sidebar-brand-icon {
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--green-fg);
    color: #fff;
    border-radius: 5px;
    font-size: 13px; font-weight: 700;
    flex-shrink: 0;
  }
  .sidebar-brand-text {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sidebar-nav {
    display: flex; flex-direction: column; gap: 2px;
    flex: 1;
    margin: 0; padding: 0;
    list-style: none;
  }
  .sidebar-link {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border-left: 2px solid transparent;
    color: var(--text-2);
    font-size: 13px; font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    background: transparent;
    width: 100%;
    text-align: left;
    border-top: 0; border-right: 0; border-bottom: 0;
    transition: background .12s ease, color .12s ease, border-color .12s ease;
    font-family: inherit;
  }
  .sidebar-link:hover {
    background: var(--surface-2);
    color: var(--text);
    text-decoration: none;
  }
  .sidebar-link[aria-current="true"] {
    /* Active section: green left border + slightly darker bg. */
    background: var(--surface-2);
    color: var(--text);
    border-left-color: var(--green-fg);
    font-weight: 600;
  }
  .sidebar-link-icon {
    font-size: 14px; line-height: 1;
    width: 20px; text-align: center; flex-shrink: 0;
  }
  .sidebar-link-label {
    flex: 1; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sidebar-foot {
    margin-top: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 6px;
    font-size: 11px;
    color: var(--text-3);
  }
  .sidebar-ticker {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px;
    color: var(--text-3);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    padding: 2px 4px;
  }
  .sidebar-ticker-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--green-fg);
    flex-shrink: 0;
  }
  .sidebar-ticker[data-freshness="stale"] .sidebar-ticker-dot { background: var(--text-4); }
  .sidebar-ticker[data-freshness="warm"]  .sidebar-ticker-dot { background: var(--amber-fg); }
  .sidebar-ticker-text {
    flex: 1; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sidebar-version {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10.5px;
    color: var(--text-4);
    padding: 0 4px;
  }
  /* Hamburger lives in the toolbar; only surfaces below 720px
     where the sidebar slides in/out as an overlay drawer. */
  .sidebar-hamburger { display: none; }
  .sidebar-backdrop {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 90;
  }
  body.sidebar-open .sidebar-backdrop { display: block; }

  @media (max-width: 1279px) and (min-width: 721px) {
    /* Collapsed icon-rail. Labels hidden, brand text hidden, but
       the layout grid stays so main shifts right by 56px. */
    .layout { grid-template-columns: 56px 1fr; gap: 16px; }
    .sidebar { padding: 12px 6px 10px; }
    .sidebar-brand { justify-content: center; padding: 4px 0 12px; }
    .sidebar-brand-text { display: none; }
    .sidebar-link { justify-content: center; padding: 10px 6px; gap: 0; }
    .sidebar-link-label { display: none; }
    .sidebar-foot { align-items: center; padding-top: 8px; }
    .sidebar-ticker-text, .sidebar-version { display: none; }
  }

  @media (max-width: 720px) {
    /* Sidebar leaves the grid on mobile. The existing bottom tab
       bar covers primary nav; the hamburger gives access to the
       same section anchors as a slide-in drawer. */
    .layout { display: block; }
    .sidebar {
      position: fixed;
      top: 0; left: 0;
      width: 80vw; max-width: 280px;
      height: 100vh;
      border-radius: 0;
      border-top: 0; border-bottom: 0; border-left: 0;
      transform: translateX(-105%);
      transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 95;
    }
    body.sidebar-open .sidebar { transform: translateX(0); }
    @media (prefers-reduced-motion: reduce) {
      .sidebar { transition: none; }
    }
    .sidebar-hamburger {
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 17px; line-height: 1;
      padding: 5px 10px;
    }
    .sidebar-link-label { display: inline; }
    .sidebar-brand-text { display: inline; }
  }

  /* Bump container max-width when sidebar is showing so main
     content doesn't squeeze against its existing 1400px ceiling. */
  @media (min-width: 1280px) {
    .container { max-width: 1600px; }
  }

  /* ── Toolbar ─────────────────────────────────────────────────── */
  .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap; }
  .toolbar h1 { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .toolbar-btn {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 5px 13px;
    font-size: 12px; font-weight: 500; cursor: pointer;
    color: var(--text-3); transition: background .12s, border-color .12s;
    font-family: inherit;
  }
  .toolbar-btn:hover { background: var(--surface-2); border-color: var(--border-strong); color: var(--text-2); }
  /* Overflow ··· button: only surfaces on narrow viewports (<480px) where
     the search/add-role buttons would crowd the title. Calls
     openMobileSettingsSheet() which already exposes Search / Add role /
     Theme / Demo via the same bottom sheet used by the tab bar. */
  .toolbar-overflow-btn { display: none; font-size: 18px; line-height: 1; padding: 5px 12px; }
  .cmdk-trigger { display: inline-flex; align-items: center; gap: 8px; padding-right: 6px; min-width: 220px; }
  .cmdk-trigger-label { color: var(--text-3); flex: 1; text-align: left; }
  .cmdk-trigger-kbd {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 4px; padding: 1px 6px; font-size: 11px; color: var(--text-3);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  /* ── Live scan ticker ──────────────────────────────────────────
     Small pill in the toolbar that rolls through the most recent
     scan events. Proves the dashboard isn't a static screenshot. */
  .live-ticker {
    display: inline-flex; align-items: center; gap: 7px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 999px; padding: 4px 10px 4px 8px;
    font-size: 11.5px; color: var(--text-3); cursor: default;
    max-width: 280px; overflow: hidden; user-select: none;
  }
  .live-ticker:hover { border-color: var(--border-strong); color: var(--text-2); }
  .live-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #9ca3af; flex-shrink: 0;
    box-shadow: 0 0 0 0 currentColor;
  }
  .live-ticker[data-freshness="fresh"] .live-dot { background: #16a34a; color: rgba(22,163,74,.5); animation: live-pulse 2.4s ease-out infinite; }
  .live-ticker[data-freshness="warm"]  .live-dot { background: #d97706; color: rgba(217,119,6,.4); }
  .live-ticker[data-freshness="stale"] .live-dot { background: #9ca3af; }
  body.dark .live-ticker[data-freshness="warm"] .live-dot { background: #fbbf24; color: rgba(251,191,36,.45); }
  body.dark .live-ticker[data-freshness="stale"] .live-dot { background: #6b7280; }
  @keyframes live-pulse {
    0%   { box-shadow: 0 0 0 0 currentColor; }
    70%  { box-shadow: 0 0 0 6px rgba(0,0,0,0); }
    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
  }
  .live-text {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: opacity .35s ease;
  }
  .live-ticker[data-anim="out"] .live-text { opacity: 0; }
  .live-ticker[data-empty="1"] .live-text { font-style: italic; opacity: .7; }
  @media (prefers-reduced-motion: reduce) {
    .live-ticker .live-dot { animation: none !important; }
    .live-text { transition: none; }
  }

  /* ── Mission-control hero strip (Phase 7 Item 1) ────────────────
     Slim sticky bar that sits between the toolbar and the stat strip.
     Promotes the live scan ticker (formerly buried in the toolbar)
     to the first 40 vertical pixels, alongside a batch-progress
     indicator and a system-health pill. The page should feel "alive"
     even when nothing is happening — pulsing dot + ticking elapsed. */
  .mc-strip {
    position: sticky; top: 0; z-index: 12;
    display: grid; grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center; gap: 14px;
    padding: 6px 14px; min-height: 40px;
    background: linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    font-family: ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace;
    font-size: 11.5px; color: var(--text-3);
    backdrop-filter: blur(8px);
    margin: 0 -28px 12px;  /* break out of body's 28px padding for full-bleed feel */
  }
  body.dark .mc-strip {
    background: linear-gradient(180deg, rgba(0,0,0,.18) 0%, rgba(255,255,255,.01) 100%);
  }
  /* Live ticker placement inside the strip — drops the pill chrome
     since the strip itself provides the visual containment. */
  .mc-strip .live-ticker {
    background: transparent; border: none; padding: 0; max-width: none; gap: 8px;
  }
  .mc-strip .live-ticker:hover { background: transparent; border: none; color: var(--text-2); }
  .mc-strip .live-text { font-family: inherit; }

  .mc-batch {
    display: inline-flex; align-items: center; gap: 8px;
    color: var(--text-3); white-space: nowrap;
  }
  .mc-batch-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--text-4); flex-shrink: 0;
    box-shadow: 0 0 0 0 currentColor;
  }
  .mc-batch[data-state="running"] .mc-batch-dot {
    background: var(--green-fg, #16a34a);
    color: rgba(22,163,74,.5);
    animation: mc-pulse 2.4s ease-out infinite;
  }
  .mc-batch[data-state="completed"] .mc-batch-dot { background: var(--green-fg, #16a34a); }
  .mc-batch[data-state="idle"] .mc-batch-dot { background: var(--text-4); }
  .mc-batch[data-state="failed"] .mc-batch-dot { background: #dc2626; }
  body.dark .mc-batch[data-state="running"] .mc-batch-dot { background: #4ade80; color: rgba(74,222,128,.45); }
  .mc-batch-text { font-variant-numeric: tabular-nums; }

  .mc-health {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 11px; color: var(--text-3);
    white-space: nowrap;
  }
  .mc-health-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--green-fg, #16a34a); flex-shrink: 0;
  }
  .mc-health[data-status="warn"] .mc-health-dot { background: #d97706; }
  .mc-health[data-status="warn"] { border-color: rgba(217,119,6,.4); color: var(--text-2); }
  .mc-health[data-status="fail"] .mc-health-dot { background: #dc2626; }
  .mc-health[data-status="fail"] { border-color: rgba(220,38,38,.4); color: var(--text-2); }
  body.dark .mc-health[data-status="warn"] .mc-health-dot { background: #fbbf24; }

  @keyframes mc-pulse {
    0%   { box-shadow: 0 0 0 0 currentColor; }
    70%  { box-shadow: 0 0 0 5px rgba(0,0,0,0); }
    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mc-batch[data-state="running"] .mc-batch-dot { animation: none !important; }
  }

  /* Slide-in on first paint — reads as "system booting." */
  .mc-strip { animation: mc-strip-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both; }
  @keyframes mc-strip-in {
    from { transform: translateY(-100%); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mc-strip { animation: none; }
  }

  /* Mobile: collapse to a single line (just dot + most-recent event).
     Hide the middle batch detail and the right health pill text;
     the left ticker carries the "is system live" signal alone. */
  @media (max-width: 720px) {
    .mc-strip {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px; padding: 5px 12px; min-height: 32px;
      font-size: 11px;
    }
    .mc-batch { display: none; }
    .mc-health { padding: 2px 8px; font-size: 10.5px; }
    .mc-health .mc-health-text { display: none; }
    .mc-strip .live-text { font-size: 11px; }
  }
  @media (max-width: 480px) {
    .mc-strip { margin-left: -12px; margin-right: -12px; }
  }

  /* ── Cmd-K command palette ─────────────────────────────────── */
  #cmdk-backdrop {
    display: none; position: fixed; inset: 0; z-index: 100;
    background: rgba(15, 17, 21, 0.42); backdrop-filter: blur(2px);
    align-items: flex-start; justify-content: center; padding-top: 14vh;
  }
  #cmdk-backdrop.visible { display: flex; }
  #cmdk-modal {
    width: min(640px, calc(100vw - 32px));
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: 0 20px 60px rgba(0,0,0,.25);
    overflow: hidden; display: flex; flex-direction: column;
    max-height: 70vh;
  }
  .cmdk-input-wrap {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px; border-bottom: 1px solid var(--border);
  }
  .cmdk-input-icon { color: var(--text-3); font-size: 16px; }
  #cmdk-input {
    flex: 1; border: none; outline: none; background: transparent;
    font: inherit; font-size: 15px; color: var(--text);
  }
  #cmdk-input::placeholder { color: var(--text-4); }
  .cmdk-input-hint {
    font-size: 11px; color: var(--text-4);
    background: var(--surface-2); padding: 2px 7px; border-radius: 4px;
    border: 1px solid var(--border);
  }
  #cmdk-list {
    overflow-y: auto; flex: 1; padding: 6px 0;
  }
  .cmdk-section-label {
    font-size: 10.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--text-4);
    padding: 10px 16px 4px;
  }
  .cmdk-item {
    display: flex; align-items: center; gap: 12px;
    padding: 9px 16px; cursor: pointer; user-select: none;
    border-left: 2px solid transparent;
  }
  .cmdk-item.active {
    background: var(--surface-2); border-left-color: var(--blue-fg);
  }
  .cmdk-item-icon {
    width: 22px; height: 22px; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--surface-2); border-radius: 5px; font-size: 12px;
    color: var(--text-3);
  }
  .cmdk-item.active .cmdk-item-icon { background: var(--surface); color: var(--text-2); }
  .cmdk-item-body { flex: 1; min-width: 0; }
  .cmdk-item-title {
    font-size: 13.5px; color: var(--text); font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cmdk-item-sub {
    font-size: 11.5px; color: var(--text-3); margin-top: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cmdk-item-meta {
    font-size: 11px; color: var(--text-4); flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .cmdk-empty { padding: 28px 16px; text-align: center; color: var(--text-4); font-size: 13px; }
  .cmdk-footer {
    display: flex; gap: 14px; padding: 8px 16px;
    border-top: 1px solid var(--border); background: var(--surface-2);
    font-size: 11px; color: var(--text-4);
  }
  .cmdk-footer kbd {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 3px; padding: 0 5px; font-size: 10.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    margin: 0 2px;
  }
  @keyframes cmdk-flash {
    0%, 100% { background: transparent; }
    20%, 60% { background: rgba(9, 105, 218, 0.12); }
  }
  tr.row.cmdk-flash > td { animation: cmdk-flash 1.6s ease-in-out; }
  @media (max-width: 640px) {
    .cmdk-trigger { min-width: 0; }
    .cmdk-trigger-label { display: none; }
    #cmdk-modal { width: calc(100vw - 16px); max-height: 80vh; }
    #cmdk-backdrop { padding-top: 8vh; }
  }

  /* ── KPI stat cards: bento-grid composition (2 heroes + 4 small + strip) ──
     Layout reads as deliberate composition rather than a 3+3+orphan stack.
     Cols 1-2 + 3-4 are 2x2 heroes (Apply-Now, Total Evals); cols 5-6 hold
     a 2x2 cluster of four small cards; row 3 is a full-width strip card. */
  /* ── Tightest mobile (iPhone-class, ≤480px) ──────────────────── */
  /* "Career-Ops Dashboard" wraps to 3 lines on iPhone — drop the
     "Dashboard" suffix and collapse Search/+Add behind a ··· button
     that opens the mobile settings sheet. Dark + Batch toggles stay
     visible because they're 1-tap actions. */
  /* Tablet/narrow desktop: drop "Dashboard" suffix so title doesn't truncate
     when toolbar is busy with Search + Add role + Dark + Batch. */
  @media (max-width: 1280px) {
    .toolbar h1 .brand-suffix { display: none; }
  }
  @media (max-width: 480px) {
    .toolbar h1 { font-size: 17px; letter-spacing: -0.3px; }
    .toolbar .cmdk-trigger,
    .toolbar .quickadd-btn { display: none; }
    .toolbar .toolbar-overflow-btn { display: inline-flex; align-items: center; justify-content: center; }
  }

  /* ── KPI stat cards: 3+3 hero (primary tier on top, secondary below) ── */
  .stats {
    margin: 16px 0 24px;
  }
  /* Hero promoted to its own row above the secondary strip.
     Hero = full-width "mission balance" card. Strip = clean 6-col secondary grid below. */
  .stats-hero-row {
    display: block;
    margin: 8px 0 8px;
  }
  .stats-bento {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    grid-auto-rows: 86px;
    gap: 8px;
    margin: 0 0 16px;
  }
  .stat-hero { grid-column: span 1; grid-row: span 1; }
  .stat-cell { grid-column: span 1; }
  .stat-strip { grid-column: 1 / -1; }
  /* Mobile label swap: .label-short hidden on desktop, shown on mobile inside stat-cells */
  .label-short { display: none; }
  /* Tablet */
  @media (max-width: 1080px) {
    .stats-bento { grid-template-columns: repeat(3, 1fr); grid-auto-rows: 82px; }
  }
  /* Mobile */
  @media (max-width: 720px) {
    .stats-bento {
      grid-template-columns: repeat(2, 1fr);
      grid-auto-rows: 76px;
      gap: 6px;
    }
    .stat-hero { grid-column: 1 / -1; grid-row: span 1; }
    .stat-cell, .stat-strip { grid-column: span 1; grid-row: span 1; }
    .stat-strip { grid-column: 1 / -1; }
    /* Swap to short labels inside stat-cells on mobile */
    .stat-cell .label-full { display: none; }
    .stat-cell .label-short { display: inline; }
  }
  .stat {
    background: var(--surface); padding: 8px 12px; border-radius: var(--radius);
    border: 1px solid var(--border); box-shadow: var(--shadow-sm);
    transition: border-color .15s, box-shadow .15s;
    position: relative; overflow: hidden;
    display: flex; flex-direction: column; justify-content: center;
    gap: 2px; min-height: 0;
  }
  .stat-label {
    font-size: 10px !important; line-height: 1.2;
    letter-spacing: 0.04em; word-break: normal; hyphens: none;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .stat::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--border); border-radius: var(--radius) var(--radius) 0 0;
  }
  .stat-strong::before { background: var(--green-fg); }
  .stat { cursor: pointer; }
  .stat:hover { border-color: var(--border-strong); box-shadow: var(--shadow); }
  .stat.active { border-color: var(--blue-fg); box-shadow: var(--ring-blue); }
  .stat-strong:hover, .stat-strong.active { border-color: var(--green-fg); box-shadow: var(--ring-green); }
  .stat-label { font-size: 11px; color: var(--text-3); text-transform: uppercase;
                letter-spacing: 0.06em; font-weight: 600; }
  .stat-value {
    font-size: 22px; font-weight: 700; color: var(--text);
    margin: 0; letter-spacing: -0.4px; line-height: 1;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }
  .stat-strong .stat-value { color: var(--green-fg); }
  .stat-caret {
    position: absolute; top: 10px; right: 12px;
    font-size: 13px; color: var(--text-4); line-height: 1;
    transition: color .12s, transform .12s;
  }
  .stat:hover .stat-caret { color: var(--text-3); }
  .stat.active .stat-caret { color: var(--blue-fg); transform: rotate(180deg); }
  /* Hero tier: same height as cells in the compact strip, but bolder accent stripe + green-tinted value */
  .stat-hero { padding: 8px 12px; }
  .stat-hero::before { height: 3px; }
  .stat-hero .stat-label { font-size: 10px !important; }
  .stat-hero .stat-value { font-size: 26px; line-height: 1; letter-spacing: -0.6px; margin: 0; }
  @media (max-width: 720px) {
    .stat-hero .stat-value { font-size: 30px; }
  }
  /* Hero balance — promoted to its own full-width row. Mission-control vibe. */
  .stat-hero-balance {
    display: flex; flex-direction: row; align-items: center;
    justify-content: space-between; gap: 24px;
    width: 100%;
    min-height: 96px;
    padding: 16px 24px;
    background:
      radial-gradient(ellipse at left center, rgba(0,255,157,0.10) 0%, rgba(22,163,74,0.04) 35%, var(--surface) 75%);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    overflow: hidden; position: relative; cursor: pointer;
    transition: border-color .15s, box-shadow .15s;
  }
  .stat-hero-balance::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, var(--green-fg), transparent);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  .stat-hero-balance:hover { border-color: var(--green-fg); box-shadow: var(--ring-green); }
  .stat-hero-balance .stat-label,
  .stat-hero-balance .stat-value,
  .stat-hero-balance .stat-caret { position: relative; z-index: 2; }
  .stat-hero-balance .stat-label {
    font-size: 11px !important; color: var(--text-3);
    margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.08em;
    font-weight: 600; white-space: nowrap; overflow: visible;
  }
  .stat-hero-balance .stat-value {
    font-size: 56px; line-height: 1; letter-spacing: -1.8px; margin: 0;
    color: var(--green-fg);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1, "ss01" 1;
    font-optical-sizing: auto;
  }
  .stat-hero-balance .stat-caret { display: none; }
  .stat-hero-balance .hero-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .stat-hero-balance .hero-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  @media (max-width: 720px) {
    .stat-hero-balance { padding: 14px 18px; min-height: 88px; gap: 12px; }
    .stat-hero-balance .stat-value { font-size: 46px; letter-spacing: -1.4px; }
  }
  .hero-sparkline-bg {
    position: absolute; left: 0; right: 0; bottom: 0;
    height: 60%;
    pointer-events: none; z-index: 1;
    color: var(--green-fg);
    opacity: 0.18;
    display: flex; align-items: stretch;
  }
  .hero-sparkline-bg .hero-sparkline {
    width: 100%; height: 100%; display: block;
  }
  .stat-hero-balance:hover .hero-sparkline-bg { opacity: 0.38; }
  .hero-delta-pill {
    position: relative; z-index: 3;
    font-family: var(--font-mono);
    font-size: 12px; font-weight: 600; letter-spacing: 0.01em;
    padding: 5px 12px; border-radius: 999px;
    white-space: nowrap; line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }
  .hero-delta-up   { background: rgba(22,163,74,0.14); color: var(--green-fg); }
  .hero-delta-down { background: rgba(217,119,6,0.14); color: var(--amber-fg); }
  .hero-delta-flat { background: rgba(127,127,127,0.10); color: var(--text-3); }
  .stat-hero-balance .stat-caret { top: 14px; right: auto; left: 14px; }
  @media (max-width: 720px) {
    .stat-hero-balance { min-height: 88px; padding: 12px 14px 14px; }
    .stat-hero-balance .stat-value { font-size: 50px; letter-spacing: -1.5px; }
    .hero-delta-pill { top: 10px; right: 10px; font-size: 10px; padding: 2px 7px; }
    .stat-hero-balance .stat-caret { top: 12px; left: 10px; }
  }
  /* Small tier: identical to base .stat in compact strip */
  .stat-cell { padding: 8px 12px; }
  .stat-cell .stat-value { font-size: 22px; letter-spacing: -0.4px; }
  .stat-cell::before { height: 2px; }
  /* Strip tier: same compact metrics, full-width row */
  .stat-strip { padding: 14px 18px; flex-direction: row; align-items: center; gap: 14px; justify-content: flex-start; }
  .stat-strip .stat-label { margin-right: 4px; }
  .stat-strip .stat-value { font-size: 24px; letter-spacing: -0.5px; margin-top: 0; }
  .stat-strip::before { height: 2px; }
  @media (max-width: 720px) {
    .stat-strip { flex-direction: column; align-items: flex-start; gap: 4px; }
  }

  /* ── KPI sparkline + 7-day delta (Phase 6 item 3.1) ─────────── */
  .stat-trend {
    display: flex; align-items: center; justify-content: space-between;
    gap: 4px; margin: 0; min-height: 12px; font-size: 9px;
  }
  .stat-trend .stat-delta { font-size: 9px; }
  .stat-trend .sparkline { height: 14px; max-width: 50px; }
  .stat-delta {
    font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em; line-height: 1.2; white-space: nowrap;
  }
  .stat-delta-up   { color: var(--green-fg); }
  .stat-delta-down { color: var(--amber-fg); }
  .stat-delta-flat { color: var(--text-3); font-weight: 500; }
  .sparkline {
    flex-shrink: 0; display: block; opacity: .85;
    overflow: visible; vertical-align: middle;
  }
  .stat:hover .sparkline { opacity: 1; }
  .stat-secondary .stat-trend { min-height: 22px; }

  /* ── Panels / cards ──────────────────────────────────────────── */
  .panel {
    background: var(--surface); border-radius: var(--radius);
    border: 1px solid var(--border); box-shadow: var(--shadow-sm);
    padding: 14px 18px; margin-bottom: 16px;
  }
  .panel-strong {
    border-color: var(--green-fg);
    box-shadow: var(--shadow-sm), 0 0 0 1px var(--green-fg), 0 4px 20px rgba(22,163,74,.08);
    position: relative;
  }
  .panel-strong::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--green-fg); border-radius: var(--radius) var(--radius) 0 0;
  }
  .panel-title {
    font-size: 18px; font-weight: 700; margin: 0 0 8px;
    letter-spacing: -0.3px; color: var(--text); display: flex; align-items: center; gap: 10px;
  }
  .panel-title.collapsible { cursor: pointer; user-select: none; }
  .panel-title.collapsible:hover { opacity: 0.82; }
  .panel-chevron {
    margin-left: auto; font-size: 11px; color: var(--text-3);
    transition: transform 0.2s; flex-shrink: 0; padding-left: 6px;
  }
  .panel-collapsed .panel-chevron { transform: rotate(-90deg); }
  .panel-collapsed > *:not(.panel-title) { display: none !important; }
  .panel-subtitle { font-size: 11px; color: var(--text-3); margin: 0 0 8px; }
  .panel-title .pill {
    font-size: 11px; font-weight: 600;
    background: var(--green-fg-dark); color: #fff;
    padding: 1px 9px; border-radius: var(--radius-full);
    letter-spacing: 0;
  }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: var(--section-gap); }

  /* ── Apply-Now drag-and-drop reorder ─────────────────────────── */
  /* Reset-order button — small, secondary, only shown when custom order
     is active. Pushed to the right of the panel-title with margin-left:auto. */
  .reset-order-btn {
    margin-left: auto;
    font-size: 12px; font-weight: 500;
    background: var(--surface-2); color: var(--text-2);
    border: 1px solid var(--border-strong);
    padding: 4px 10px; border-radius: var(--radius-sm);
    cursor: pointer; letter-spacing: 0;
  }
  .reset-order-btn:hover { background: var(--surface); color: var(--text); border-color: var(--text-3); }

  /* Drag handle: hidden by default, fades in on row hover. On touch
     devices (no hover), it stays visible at low opacity so the affordance
     is discoverable without hovering. The handle is keyboard-focusable
     for accessibility (Tab to it; Space/Enter could later wire keyboard
     reorder, out of scope here). */
  .apply-drag-handle {
    display: inline-block;
    width: 16px; margin-right: 6px;
    color: var(--text-4); cursor: grab;
    font-weight: 700; line-height: 1; vertical-align: middle;
    user-select: none; -webkit-user-select: none;
    touch-action: none;
    opacity: 0; transition: opacity .12s ease;
  }
  #apply-now-tbody tr.row:hover .apply-drag-handle,
  #apply-now-tbody tr.row:focus-within .apply-drag-handle { opacity: 1; }
  .apply-drag-handle:active { cursor: grabbing; }
  .apply-drag-handle:focus-visible { outline: 2px solid var(--blue-fg); outline-offset: 2px; opacity: 1; }
  @media (hover: none) {
    .apply-drag-handle { opacity: .5; }
  }

  /* Dragged row: ghosted while in flight. */
  #apply-now-tbody tr.row.drag-source,
  #apply-now-tbody tr.detail-row.drag-source {
    opacity: .35;
  }

  /* Drop-zone indicator: a coloured top/bottom border on the target row. */
  #apply-now-tbody tr.row.drop-target-above > td { box-shadow: inset 0 3px 0 0 var(--blue-fg); }
  #apply-now-tbody tr.row.drop-target-below > td { box-shadow: inset 0 -3px 0 0 var(--blue-fg); }

  /* Honor reduced-motion: kill the opacity transition on the handle. */
  @media (prefers-reduced-motion: reduce) {
    .apply-drag-handle { transition: none; }
  }

  /* ── Comp Analytics ──────────────────────────────────────────── */
  #comp-analytics-panel .comp-subnote { color: var(--text-3); font-size: 12.5px; margin: -6px 0 18px; }
  #comp-analytics-panel .comp-subnote strong { color: var(--text-2); font-weight: 600; }
  .comp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 24px; }
  .comp-sub { min-width: 0; }
  .comp-sub-wide { grid-column: 1 / -1; }
  .comp-sub-title { font-size: 11.5px; font-weight: 600; color: var(--text-3); margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.06em; }
  .comp-hist-row { display: grid; grid-template-columns: 96px 1fr 32px; gap: 10px; align-items: center; padding: 4px 0; font-size: 12.5px; }
  .comp-hist-label { color: var(--text-3); font-variant-numeric: tabular-nums; }
  .comp-hist-track { background: var(--surface-2); border-radius: 4px; height: 14px; overflow: hidden; }
  .comp-hist-fill { height: 100%; border-radius: 4px; min-width: 0; transition: width .25s; }
  .comp-hist-fill.above-floor { background: var(--green-fg); }
  .comp-hist-fill.below-floor { background: var(--red-fg); opacity: .65; }
  .comp-hist-count { color: var(--text-2); font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
  .comp-floor-chart { display: flex; flex-direction: column; gap: 8px; }
  .comp-floor-row { display: grid; grid-template-columns: 130px 1fr 60px; gap: 10px; align-items: center; font-size: 12.5px; }
  .comp-floor-row.empty .comp-floor-value { color: var(--text-4); font-weight: 400; }
  .comp-floor-label { color: var(--text-2); font-weight: 500; }
  .comp-floor-count { color: var(--text-4); font-weight: 400; font-size: 11px; }
  .comp-floor-bar-track { background: var(--surface-2); border-radius: 4px; height: 18px; position: relative; overflow: hidden; }
  .comp-floor-bar { height: 100%; border-radius: 4px; transition: width .25s; }
  .comp-floor-bar.above { background: var(--green-fg); }
  .comp-floor-bar.below { background: var(--red-fg); }
  .comp-floor-empty { color: var(--text-4); font-size: 11px; padding: 0 8px; line-height: 18px; }
  .comp-floor-floor-line { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--amber-fg); pointer-events: none; box-shadow: 0 0 0 1px var(--bg); }
  .comp-floor-value { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .comp-floor-value.good { color: var(--green-fg-dark); }
  .comp-floor-value.bad { color: var(--red-fg-dark); }
  .comp-top-scroll { overflow-x: auto; }
  .comp-top-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .comp-top-table th { background: var(--surface-2); color: var(--text-3); padding: 7px 10px; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .06em; text-align: left; border-bottom: 1px solid var(--border); }
  .comp-top-table th.num, .comp-top-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .comp-top-table td { padding: 7px 10px; border-bottom: 1px solid var(--border); color: var(--text-2); }
  .comp-top-table td.num { font-weight: 600; color: var(--text); }
  .comp-top-table tr.top-earner-green td:first-child { box-shadow: inset 3px 0 0 0 var(--green-fg); }
  .comp-top-table tr.top-earner-blue td:first-child { box-shadow: inset 3px 0 0 0 var(--blue-fg); }
  .comp-top-table tr.top-earner-amber td:first-child { box-shadow: inset 3px 0 0 0 var(--amber-fg); }
  .comp-top-table tr.top-earner-grey td:first-child { box-shadow: inset 3px 0 0 0 var(--text-4); }
  .comp-eq-tag { display: inline-block; font-size: 10px; padding: 0 5px; margin-left: 4px; border-radius: 4px; background: var(--green-bg); color: var(--green-fg-dark); font-weight: 500; }

  /* ── Tables ──────────────────────────────────────────────────── */
  .table-scroll { overflow-x: auto; overflow-y: auto; max-height: 520px; border-radius: 0 0 var(--radius-sm) var(--radius-sm); position: relative; }
  /* Visual hint when the table can scroll horizontally — a small ↔
     badge in the bottom-right of the wrapper. Driven by the
     data-can-scroll-x attribute set in initTableHorizontalScroll
     on first paint. */
  .table-scroll[data-can-scroll-x="1"]::after {
    content: '↔';
    position: sticky; right: 6px; bottom: 6px;
    float: right;
    font-size: 14px; opacity: 0.45;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    pointer-events: none;
    z-index: 2;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead { position: sticky; top: 0; z-index: 2; }
  th {
    text-align: left; padding: 9px 12px;
    background: var(--surface-2); color: var(--text-3);
    font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { background: var(--border); color: var(--text-2); }
  .sort-arrow { color: var(--blue-fg); font-size: 10px; }
  td {
    padding: 10px 12px; border-bottom: 1px solid var(--border);
    vertical-align: top; color: var(--text-2); font-weight: 400;
  }
  tr.row { cursor: pointer; transition: background .1s; }
  tr.row:hover td { background: var(--surface-2); }
  td.num {
    color: var(--text-3);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }
  .role-cell { color: var(--text); font-weight: 500; }
  /* Role + company become primary links — strong visual affordance, no decoration
     until hover so the table stays scannable. */
  a.role-link, a.company-link {
    color: inherit; text-decoration: none;
    border-bottom: 1px dotted transparent;
    transition: border-color .12s ease, color .12s ease;
  }
  a.role-link:hover, a.role-link:focus-visible {
    color: var(--green-fg); border-bottom-color: var(--green-fg);
  }
  a.company-link:hover, a.company-link:focus-visible {
    color: var(--blue-fg); border-bottom-color: var(--blue-fg);
  }
  a.role-link:focus-visible, a.company-link:focus-visible { outline: none; }
  /* Action-cell links rendered as 44×44 padded buttons (WCAG 2.5.5). */
  td.action-cell { white-space: nowrap; }
  td.action-cell a {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 44px; min-height: 44px;
    padding: 6px 10px; margin: -6px 0;
    color: var(--blue-fg-dark); font-weight: 500; font-size: 12px;
    border-radius: var(--radius-sm);
    box-sizing: border-box;
  }
  td.action-cell a:hover { background: var(--surface-2); text-decoration: underline; }
  td.action-cell .action-sep { color: var(--text-4); padding: 0 2px; user-select: none; }
  .tier-tag {
    font-size: 10px; color: var(--text-3); background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 0 5px; margin-left: 5px; font-weight: 500; vertical-align: middle;
    cursor: pointer; position: relative; display: inline-block;
    transition: background .12s, border-color .12s, color .12s;
  }
  .tier-tag:hover, .tier-tag:focus {
    background: var(--blue-bg); border-color: var(--blue-border);
    color: var(--blue-fg); outline: none;
  }
  .tier-tag:focus-visible { box-shadow: var(--ring-blue); }
  /* CSS-only tooltip: pulls from data-tooltip; appears on hover/focus.
     Wraps to ~280px and floats above the badge. Pointer-events:none so
     the tooltip itself never steals the click. */
  .tier-tag::after {
    content: attr(data-tooltip);
    position: absolute; bottom: calc(100% + 8px); left: 50%;
    transform: translateX(-50%) translateY(4px);
    background: var(--text); color: var(--surface);
    padding: 8px 11px; border-radius: var(--radius-sm);
    font-size: 11.5px; font-weight: 500; line-height: 1.45;
    white-space: normal; width: max-content; max-width: 280px;
    box-shadow: var(--shadow-md); pointer-events: none;
    opacity: 0; visibility: hidden;
    transition: opacity .15s ease-out, transform .15s ease-out, visibility .15s;
    z-index: 1500; text-align: left;
  }
  .tier-tag:hover::after, .tier-tag:focus::after, .tier-tag:focus-visible::after {
    opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0);
  }
  .tier-tag[data-tooltip=""]::after { display: none; }
  .tier-tag-sub { background: #e0f2fe; color: #0369a1; border-color: #7dd3fc; font-size: 9px; }
  .col-badge { font-size: 10px; font-weight: 500; margin-left: 6px; white-space: nowrap; cursor: help; }
  .base-fx-wrap { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 2px; }

  /* Column-header (?) info button that opens the full legend modal. */
  .tier-legend-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; margin-left: 4px; padding: 0;
    border: 1px solid var(--border); border-radius: 50%;
    background: var(--surface); color: var(--text-3);
    font-size: 10px; font-weight: 700; font-family: inherit;
    cursor: pointer; vertical-align: middle; line-height: 1;
    transition: background .12s, color .12s, border-color .12s;
  }
  .tier-legend-btn:hover, .tier-legend-btn:focus-visible {
    background: var(--blue-bg); border-color: var(--blue-border);
    color: var(--blue-fg); outline: none;
  }
  .tier-legend-btn:focus-visible { box-shadow: var(--ring-blue); }

  /* Tier-legend modal — same shape as gap modal for consistency. */
  #tier-legend-backdrop, #equity-legend-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2000; backdrop-filter: blur(2px); }
  #tier-legend-backdrop.visible, #equity-legend-backdrop.visible { display: block; }
  #tier-legend-modal, #equity-legend-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    width: min(640px, 96vw); max-height: 82vh; overflow-y: auto; z-index: 2001;
    background: var(--surface); border-radius: 12px; border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }
  .tier-legend-header {
    position: sticky; top: 0; background: var(--surface);
    border-bottom: 1px solid var(--border); padding: 14px 20px;
    display: flex; align-items: center; gap: 10px; z-index: 1;
    border-radius: 12px 12px 0 0;
  }
  .tier-legend-title { font-size: 15px; font-weight: 600; flex: 1; color: var(--text); }
  .tier-legend-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
  .tier-legend-row {
    display: grid; grid-template-columns: 56px 1fr; gap: 14px;
    padding: 12px 14px; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface-2);
    transition: border-color .12s;
  }
  .tier-legend-row.tier-row-highlight { border-color: var(--blue-fg); box-shadow: var(--ring-blue); }
  .tier-legend-code {
    font-size: 14px; font-weight: 700; color: var(--blue-fg);
    text-align: center; padding-top: 2px; font-variant-numeric: tabular-nums;
  }
  .tier-legend-name { font-size: 13.5px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
  .tier-legend-summary { font-size: 12.5px; color: var(--text-2); line-height: 1.55; margin-bottom: 6px; }
  .tier-legend-examples { font-size: 11.5px; color: var(--text-3); line-height: 1.5; font-style: italic; }

  /* ── Throttle row visual states ──────────────────────────────── */
  tr.row-throttle-pickone > td:first-child { box-shadow: inset 3px 0 0 var(--amber-fg); }
  tr.row-throttle-defer { opacity: .6; }
  tr.row-throttle-defer > td:first-child { box-shadow: inset 3px 0 0 var(--text-4); }
  tr.row-throttle-blocked { opacity: .4; }
  tr.row-throttle-blocked > td:first-child { box-shadow: inset 3px 0 0 var(--red-fg); }
  tr.row-throttle-cooldown { opacity: .45; }
  tr.row-throttle-cooldown > td:first-child { box-shadow: inset 3px 0 0 var(--red-fg); }
  tr.row-throttle-open > td:first-child { box-shadow: inset 3px 0 0 var(--green-fg); }
  .throttle-banner { padding: 11px 14px; border-radius: var(--radius-sm); margin: 4px 0 12px; font-weight: 500; font-size: 13px; line-height: 1.5; }
  .throttle-pickone  { background: var(--amber-bg);  color: var(--amber);  border-left: 3px solid var(--amber-fg); }
  .throttle-defer    { background: var(--surface-2); color: var(--text-3); border-left: 3px solid var(--text-4); }
  .throttle-blocked, .throttle-cooldown { background: var(--red-bg); color: var(--red-fg); border-left: 3px solid var(--red-fg); }
  .throttle-open     { background: var(--green-bg);  color: var(--green);  border-left: 3px solid var(--green-fg); }

  /* ── Badges ──────────────────────────────────────────────────── */
  .badge {
    display: inline-flex; align-items: center;
    padding: 2px 9px; border-radius: var(--radius-full);
    font-size: 11.5px; font-weight: 600;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .score-badge-lg {
    font-size: 13px; padding: 3px 11px;
    font-family: var(--font-mono);
    font-feature-settings: "tnum" 1;
    letter-spacing: -0.01em;
  }
  .score-strong  { background: var(--green-bg);  color: var(--green); }
  .score-moderate { background: var(--amber-bg); color: var(--amber); }
  .score-weak    { background: var(--surface-2); color: var(--text-3); }
  /* Status pills use the *-fg-dark tokens to clear WCAG AA 4.5:1 on tinted bg */
  .status-evaluated { background: var(--blue-bg);   color: var(--blue-fg-dark); }
  .status-applied   { background: var(--amber-bg);  color: var(--amber-fg-dark); }
  .status-interview { background: var(--purple-bg); color: var(--purple-fg-dark); }
  .status-offer     { background: var(--green-bg);  color: var(--green-fg-dark); }
  .status-rejected  { background: var(--red-bg);    color: var(--red-fg-dark); }
  .status-discarded { background: var(--surface-2); color: var(--text-3); }

  /* Leading semantic dot per status (Linear/Notion convention) */
  .badge[data-status]::before {
    content: '●';
    font-size: 8px;
    line-height: 1;
    margin-right: 6px;
    vertical-align: middle;
    color: var(--text-3);
  }
  .badge[data-status="evaluated"]::before { color: var(--text-3); }
  .badge[data-status="applied"]::before   { color: var(--blue-fg); }
  .badge[data-status="responded"]::before { color: var(--purple-fg); }
  .badge[data-status="interview"]::before { color: var(--amber-fg); }
  .badge[data-status="offer"]::before     { color: var(--green-fg); }
  .badge[data-status="rejected"]::before  { color: var(--red-fg); }
  .badge[data-status="discarded"]::before { color: var(--text-4); }
  .badge[data-status="skip"]::before      { color: #64748b; }
  body.dark .badge[data-status="skip"]::before { color: #94a3b8; }

  /* ── Age badges ──────────────────────────────────────────────── */
  .age-stale { color: var(--red-fg); font-weight: 600; font-size: 12px; }
  .age-ok    { color: var(--text-3); font-size: 12px; }
  .age-amber { color: #92400e; font-weight: 600; }
  .age-red   { color: #991b1b; font-weight: 600; }

  /* ── Filters bar ─────────────────────────────────────────────── */
  .filters { display: flex; flex-direction: column; gap: 8px; margin: 0 0 14px; }
  .filters-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .filters input, .filters select {
    padding: 7px 11px; font-size: 13px; font-family: inherit;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text);
    outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .filters-row input[type="search"] { flex: 1; min-width: 200px; }
  .filters input:focus, .filters select:focus {
    border-color: var(--blue-fg); box-shadow: var(--ring-blue);
  }
  .filters-sticky {
    position: sticky; top: 0; z-index: 10;
    background: var(--surface);
    padding: 12px 0; margin: 0 0 4px;
    border-bottom: 1px solid var(--border);
    box-shadow: 0 4px 6px -4px rgba(0,0,0,.08);
  }
  body.dark .filters-sticky { box-shadow: 0 4px 6px -4px rgba(0,0,0,.4); }

  /* ── Saved views ─────────────────────────────────────────────── */
  .saved-views-row {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
    padding-bottom: 4px; border-bottom: 1px dashed var(--border);
  }
  .saved-views-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--text-3);
    padding-right: 6px; flex-shrink: 0;
  }
  .saved-views-chips { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; min-width: 0; }
  .saved-view-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 4px 3px 9px;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius-full); font-size: 12px; color: var(--text-2);
    cursor: pointer; transition: background .12s, border-color .12s, color .12s;
    user-select: none;
  }
  .saved-view-chip:hover { background: var(--blue-bg); border-color: var(--blue-border); color: var(--blue-fg-dark); }
  .saved-view-chip.active { background: var(--blue-bg); border-color: var(--blue-fg); color: var(--blue-fg-dark); font-weight: 600; }
  .saved-view-chip-name { white-space: nowrap; }
  .saved-view-chip-summary {
    font-size: 10.5px; color: var(--text-4); font-weight: 400;
    margin-left: 4px; white-space: nowrap;
  }
  .saved-view-chip:hover .saved-view-chip-summary,
  .saved-view-chip.active .saved-view-chip-summary { color: inherit; opacity: .75; }
  .saved-view-chip-delete {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; border-radius: 50%;
    background: transparent; border: 0; padding: 0; margin-left: 2px;
    color: var(--text-4); font-size: 14px; line-height: 1;
    cursor: pointer; transition: background .12s, color .12s;
  }
  .saved-view-chip-delete:hover { background: var(--red-bg, #ffebe9); color: var(--red-fg); }
  .saved-view-btn {
    padding: 4px 10px; font-size: 12px; font-family: inherit; font-weight: 500;
    border: 1px dashed var(--border); border-radius: var(--radius-full);
    background: transparent; color: var(--text-3);
    cursor: pointer; transition: border-color .12s, color .12s, background .12s;
    white-space: nowrap;
  }
  .saved-view-btn:hover { border-color: var(--blue-fg); color: var(--blue-fg); }
  .saved-view-btn.primary {
    border-style: solid; background: var(--blue-fg); border-color: var(--blue-fg);
    color: #fff;
  }
  .saved-view-btn.primary:hover { filter: brightness(0.95); color: #fff; }
  .saved-view-prompt {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
    padding: 6px 0;
  }
  .saved-view-prompt input[type="text"] {
    flex: 1; min-width: 200px;
    padding: 6px 10px; font-size: 13px; font-family: inherit;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); outline: none;
  }
  .saved-view-prompt input[type="text"]:focus {
    border-color: var(--blue-fg); box-shadow: var(--ring-blue);
  }
  .saved-view-error { font-size: 11.5px; color: var(--red-fg); }
  .saved-views-empty {
    font-size: 11.5px; color: var(--text-4); font-style: italic; padding: 2px 0;
  }

  /* ── Bar chart ───────────────────────────────────────────────── */
  .bar-chart { display: flex; flex-direction: column; gap: 9px; }
  .bar-row { display: grid; grid-template-columns: 110px 1fr 38px; gap: 10px; align-items: center; font-size: 13px; }
  .bar-track { background: var(--surface-2); height: 14px; border-radius: var(--radius-full); overflow: hidden; }
  .bar-fill { background: linear-gradient(90deg, var(--green-fg), var(--blue-fg)); height: 100%; border-radius: var(--radius-full); }
  .bar-row-label { font-weight: 500; color: var(--text-2); font-size: 12.5px; }
  .bar-row-count { text-align: right; color: var(--text-3); font-variant-numeric: tabular-nums; font-weight: 600; font-size: 12.5px; }

  /* ── Trend graphs ────────────────────────────────────────────── */
  .trends-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  }
  .trend-card-wide { grid-column: 1 / -1; }
  .trend-card {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 12px 14px 10px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .trend-card-title {
    font-size: 12px; font-weight: 600; color: var(--text-2);
    display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  }
  .trend-card-sub { font-size: 10.5px; font-weight: 500; color: var(--text-4); }
  .trend-svg { width: 100%; height: auto; display: block; }
  .trend-svg-funnel { height: 36px; }
  .trend-bar { fill: var(--blue-fg); transition: fill .15s; }
  .trend-bar:hover { fill: var(--blue-fg-dark); }
  .trend-line { stroke: var(--green-fg); stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
  .trend-dot { fill: var(--green-fg); stroke: var(--surface-2); stroke-width: 1; transition: r .15s; }
  .trend-dot.empty { fill: var(--text-4); opacity: 0.5; }
  .trend-dot:hover { r: 4; }
  .trend-axis { stroke: var(--border-strong); stroke-width: 0.5; stroke-dasharray: 2 2; opacity: 0.6; }
  .trend-fn { stroke: var(--surface); stroke-width: 1; transition: opacity .15s; }
  .trend-fn:hover { opacity: 0.85; }
  .trend-fn.fn-eval  { fill: var(--text-4); }
  .trend-fn.fn-apply { fill: var(--blue-fg); }
  .trend-fn.fn-int   { fill: var(--purple-fg); }
  .trend-fn.fn-offer { fill: var(--green-fg); }
  .trend-fn.fn-rej   { fill: var(--red-fg); opacity: 0.7; }
  .trend-legend {
    display: flex; flex-wrap: wrap; gap: 10px;
    font-size: 11px; color: var(--text-3); margin-top: 4px;
  }
  .trend-legend-item { display: inline-flex; align-items: center; gap: 4px; }
  .trend-legend-swatch {
    width: 9px; height: 9px; border-radius: 2px; display: inline-block;
  }
  .trend-legend-swatch.fn-eval  { background: var(--text-4); }
  .trend-legend-swatch.fn-apply { background: var(--blue-fg); }
  .trend-legend-swatch.fn-int   { background: var(--purple-fg); }
  .trend-legend-swatch.fn-offer { background: var(--green-fg); }
  .trend-legend-swatch.fn-rej   { background: var(--red-fg); opacity: 0.7; }

  /* ── Segmented distribution bar ──────────────────────────────── */
  .seg-bar { display: flex; flex-direction: column; gap: 6px; }
  .seg-bar-counts { display: flex; gap: 2px; align-items: flex-end; height: 22px; }
  .seg-bar-count {
    flex: 1; text-align: center; font-size: 11.5px; font-weight: 600;
    color: var(--text-2); font-variant-numeric: tabular-nums;
    transition: opacity .15s;
  }
  .seg-bar-count.zero { opacity: 0.35; font-weight: 500; }
  .seg-bar-track {
    display: flex; height: 26px; border-radius: var(--radius-sm);
    overflow: hidden; background: var(--surface-2); border: 1px solid var(--border);
  }
  .seg-bar-segment {
    height: 100%; transition: flex-grow .25s;
    border-right: 1px solid var(--surface);
  }
  .seg-bar-segment:last-child { border-right: none; }
  .seg-bar-segment.zero { flex-grow: 0.05 !important; opacity: 0.35; }
  .seg-bar-segment.s-strong   { background: var(--green-fg); }
  .seg-bar-segment.s-good     { background: var(--blue-fg); }
  .seg-bar-segment.s-moderate { background: var(--amber-fg); }
  .seg-bar-segment.s-weak     { background: var(--red-fg); opacity: 0.7; }
  .seg-bar-segment.s-none     { background: var(--text-4); opacity: 0.5; }
  .seg-bar-labels { display: flex; gap: 2px; }
  .seg-bar-label {
    flex: 1; text-align: center; font-size: 10.5px; font-weight: 600;
    color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em;
  }
  .seg-bar-label .seg-bar-range { display: block; font-size: 10px; font-weight: 500;
    color: var(--text-4); text-transform: none; letter-spacing: 0; margin-top: 1px; }

  /* ── Detail expand panel ─────────────────────────────────────── */
  .detail-block { background: var(--surface-2); padding: 14px 16px; border-radius: var(--radius-sm); margin: 2px 0; font-size: 13px; }
  .detail-section { margin: 10px 0; }
  .detail-section code { background: var(--surface); padding: 2px 6px; border-radius: 4px; }
  .tldr-box, .positioning-box {
    background: var(--surface); padding: 10px 13px;
    border-left: 3px solid var(--blue-fg); border-radius: 4px;
    line-height: 1.55; font-size: 13px;
  }
  .tldr-box { border-left-color: var(--green-fg); }
  .edge-trigger { cursor: pointer; user-select: none; }
  .edge-trigger:hover { filter: brightness(0.92); }
  /* Meta chips */
  .detail-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
  .meta-chip {
    display: inline-flex; align-items: center; padding: 2px 9px;
    border-radius: var(--radius-full); font-size: 11px; font-weight: 600;
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-3); gap: 3px;
  }
  .meta-chip-comp { background: var(--green-bg); border-color: var(--green-border); color: var(--green); }
  .meta-chip-tier { background: var(--blue-bg);  border-color: var(--blue-border);  color: var(--blue-fg-dark); }
  /* Equity / IPO posture badge — primary filter signal */
  .equity-cell { white-space: nowrap; }
  .equity-badge {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 8px; border-radius: var(--radius-full);
    font-size: 11px; font-weight: 600;
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text-3);
    cursor: help;
  }
  .equity-badge.eq-late   { background: var(--green-bg);  border-color: var(--green-border);  color: var(--green); }
  .equity-badge.eq-cd     { background: var(--green-bg);  border-color: var(--green-border);  color: var(--green-fg-dark); }
  .equity-badge.eq-b      { background: var(--amber-bg);  border-color: var(--amber-border);  color: var(--amber); }
  .equity-badge.eq-seed   { background: var(--purple-bg); border-color: var(--purple-border); color: var(--purple); }
  .equity-badge.eq-public { background: var(--blue-bg);   border-color: var(--blue-border);   color: var(--blue-fg-dark); }
  .equity-badge.eq-unknown { background: var(--surface-2); border-color: var(--border); color: var(--text-4); }
  .equity-badge-empty {
    background: transparent; border-color: transparent;
    color: var(--text-4); font-weight: 400; padding: 2px 4px;
  }

  /* ── Wave H: Base salary + Location chips ─────────────────────────── */
  .base-cell { white-space: nowrap; }
  .base-chip {
    display: inline-flex; align-items: center;
    padding: 2px 8px; border-radius: var(--radius-full);
    font-size: 11.5px; font-weight: 600;
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text-3);
    cursor: help;
    font-variant-numeric: tabular-nums;
  }
  .base-chip-strong { background: var(--green-bg);  border-color: var(--green-border);  color: var(--green); }
  .base-chip-mid    { background: var(--amber-bg);  border-color: var(--amber-border);  color: var(--amber); }
  .base-chip-weak   { background: var(--red-bg);    border-color: var(--red-border);    color: var(--red); }
  .base-chip-fx     { background: var(--blue-bg);   border-color: var(--blue-border);   color: var(--blue-fg-dark); }
  .base-chip-unknown, .base-chip-empty {
    background: transparent; border-color: transparent;
    color: var(--text-4); font-weight: 400; padding: 2px 4px;
  }
  .location-cell { white-space: nowrap; }
  .location-chip {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 8px; border-radius: var(--radius-full);
    font-size: 11px; font-weight: 600; max-width: 220px;
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text-3);
    cursor: help;
    overflow: hidden; text-overflow: ellipsis;
  }
  .location-chip-preferred { background: var(--green-bg); border-color: var(--green-border); color: var(--green); }
  .location-chip-remote    { background: var(--blue-bg);  border-color: var(--blue-border);  color: var(--blue-fg-dark); }
  .location-chip-outside   { background: var(--amber-bg); border-color: var(--amber-border); color: var(--amber); }
  .location-chip-unknown   { background: var(--surface-2); border-color: var(--border); color: var(--text-4); }
  .location-chip-empty {
    background: transparent; border-color: transparent;
    color: var(--text-4); font-weight: 400; padding: 2px 4px;
  }
  .location-relo-mark {
    display: inline-block; margin-left: 4px;
    color: var(--blue-fg-dark); font-size: 10px;
    opacity: 0.7;
  }
  .location-chip:hover .location-relo-mark { opacity: 1; }

  /* Benefits chip — toxicity grade as primary visual signal. */
  .benefits-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px; border-radius: 999px;
    border: 1px solid var(--border);
    font-size: 11px; font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: help;
    transition: border-color .12s, background .12s;
  }
  .benefits-chip:hover { border-color: var(--border-strong); }
  .benefits-chip-strong  { background: var(--green-bg);  border-color: var(--green-border);  color: var(--green-fg-dark); }
  .benefits-chip-mid     { background: var(--green-bg);  border-color: var(--green-border);  color: var(--green-fg); opacity: 0.85; }
  .benefits-chip-neutral { background: var(--amber-bg);  border-color: var(--amber-border);  color: var(--amber-fg-dark); }
  .benefits-chip-weak    { background: var(--amber-bg);  border-color: var(--amber-border);  color: var(--amber-fg); }
  .benefits-chip-bad     { background: var(--red-bg);    border-color: var(--red-border);    color: var(--red-fg); }
  .benefits-chip-unknown { background: var(--surface-2); color: var(--text-4); }
  .benefits-chip-empty {
    background: transparent; border-color: transparent;
    color: var(--text-4); font-weight: 400; padding: 2px 4px;
  }

  /* People chip — recruiter + hiring-manager indicators */
  .people-chip {
    display: inline-flex; align-items: center; gap: 2px;
    padding: 3px 8px; border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    font-size: 12px;
    cursor: help;
    transition: border-color .12s, background .12s;
  }
  .people-chip:hover { border-color: var(--blue-fg); background: var(--blue-bg); color: var(--blue-fg-dark); }
  .people-chip-empty {
    background: transparent; border-color: transparent;
    color: var(--text-4); padding: 2px 4px;
  }

  /* Popover sub-section labels for the new richer kinds */
  #pill-popover .pill-popover-section-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-3); font-weight: 700;
    margin-top: 10px; padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  #pill-popover .pill-popover-section-label:first-of-type { border-top: none; padding-top: 0; margin-top: 4px; }
  #pill-popover .pill-popover-meta-inline {
    font-size: 11px; color: var(--text-4); font-style: italic;
    margin-top: 2px;
  }
  #pill-popover .pill-popover-linkedin-link {
    color: var(--blue-fg-dark); font-weight: 600;
    text-decoration: none; font-size: 13px;
  }
  #pill-popover .pill-popover-linkedin-link:hover { text-decoration: underline; }
  #pill-popover .network-list {
    display: flex; flex-direction: column; gap: 6px;
    padding-top: 4px;
  }
  #pill-popover .network-contact-row {
    border-bottom: 1px solid var(--border);
    padding-bottom: 5px;
  }
  #pill-popover .network-contact-row:last-child { border-bottom: none; padding-bottom: 0; }
  #pill-popover .network-contact-name { font-size: 12.5px; font-weight: 500; }
  #pill-popover .network-contact-title {
    font-size: 11px; color: var(--text-3); line-height: 1.3;
    margin-top: 1px;
  }
  #pill-popover .network-warm-intro {
    font-size: 11px; line-height: 1.4;
    margin-top: 4px;
    color: var(--green-fg);
    font-weight: 500;
  }
  #pill-popover .network-warm-intro a.warm-intro-target {
    color: var(--green-fg-dark);
    text-decoration: underline;
    text-underline-offset: 2px;
    font-weight: 600;
  }
  #pill-popover .network-warm-intro a.warm-intro-target:hover {
    color: var(--green-fg);
  }
  body.dark #pill-popover { max-width: 420px; }
  /* Two-column detail grid */
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .detail-col  { display: flex; flex-direction: column; gap: 8px; }
  @media (max-width: 640px) { .detail-grid { grid-template-columns: 1fr; } }
  .dcard { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; }
  .dcard-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-4); margin-bottom: 6px; }
  .dcard-body { font-size: 12.5px; line-height: 1.55; color: var(--text-2); }
  .dcard-gaps { display: flex; flex-wrap: wrap; gap: 4px; }
  .gap-chip {
    font-size: 11px; padding: 2px 8px;
    background: var(--amber-bg); border: 1px solid var(--amber-border);
    border-radius: var(--radius-full); color: var(--amber);
  }
  .gap-chip-interactive { cursor: pointer; transition: background .12s, transform .1s; }
  .gap-chip-interactive:hover { background: var(--amber-border); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
  /* Section cards — colored left border + uppercase label */
  .dcard--match  { border-left: 3px solid var(--green-fg); }
  .dcard--gap    { border-left: 3px solid var(--amber-fg); }
  .dcard--story  { border-left: 3px solid var(--purple-fg); }
  .dcard--action { border-left: 3px solid var(--blue-fg);
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .dcard--action .dcard-action-text {
    flex: 1; min-width: 200px; font-size: 12.5px;
    line-height: 1.45; color: var(--text-2);
  }
  .dcard--action .dcard-action-buttons {
    display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap;
  }
  /* ── Tracker note card ─────────────────────────────────────── */
  .dcard--tracker-note { border-left: 3px solid var(--blue-fg); }
  .tn-wrap { font-size: 12px; line-height: 1.5; }
  .tn-header { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 7px; }
  .tn-reeval {
    font-size: 10.5px; font-weight: 600; color: var(--text-4);
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 4px; padding: 1px 6px; white-space: nowrap;
  }
  .tn-decision {
    font-size: 11px; font-weight: 700; padding: 2px 8px;
    border-radius: 4px; white-space: nowrap;
  }
  .tn-apply  { background: #dcfce7; color: #166534; }
  .tn-skip   { background: #fee2e2; color: #991b1b; }
  .tn-defer  { background: #fef9c3; color: #713f12; }
  .tn-list {
    margin: 0; padding-left: 16px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .tn-list li { color: var(--text-2); }
  .tn-text { margin: 0; color: var(--text-2); }
  /* Dark-mode overrides for decision badges */
  body.dark .tn-apply { background: #14532d; color: #86efac; }
  body.dark .tn-skip  { background: #450a0a; color: #fca5a5; }
  body.dark .tn-defer { background: #422006; color: #fde68a; }
  /* ── Notes & activity card (5th card) ────────────────────────── */
  .dcard--notes  { border-left: 3px solid var(--text-4); }
  .notes-compose { display: flex; flex-direction: column; gap: 6px; }
  .notes-input {
    width: 100%; box-sizing: border-box; resize: vertical; min-height: 44px;
    padding: 7px 9px; font-family: inherit; font-size: 12.5px;
    line-height: 1.45; color: var(--text); background: var(--surface-2);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .notes-input:focus {
    outline: none; border-color: var(--blue-fg);
    box-shadow: 0 0 0 2px rgba(0,120,212,0.18);
  }
  .notes-compose-row {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  .notes-counter { font-size: 11px; color: var(--text-4); }
  .notes-counter.over { color: var(--amber); font-weight: 600; }
  .notes-list {
    margin-top: 10px; display: flex; flex-direction: column; gap: 6px;
    max-height: 320px; overflow-y: auto;
  }
  .notes-empty { font-size: 11.5px; padding: 4px 0; }
  .note-entry {
    display: flex; flex-direction: column; gap: 3px;
    padding: 7px 9px; background: var(--surface-2);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    font-size: 12px; line-height: 1.45;
  }
  .note-entry-head {
    display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
    font-size: 10.5px; color: var(--text-4);
  }
  .note-type-badge {
    font-size: 9.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; padding: 1px 6px; border-radius: var(--radius-full);
  }
  .note-type-badge.type-note   { background: var(--surface); color: var(--text-3); border: 1px solid var(--border); }
  .note-type-badge.type-status { background: var(--blue-bg); color: var(--blue); border: 1px solid var(--blue-border); }
  .note-text {
    color: var(--text-2); white-space: pre-wrap; word-break: break-word;
  }
  .note-toggle {
    align-self: flex-start; background: none; border: none;
    color: var(--blue); font-size: 11px; cursor: pointer; padding: 2px 0;
    font-family: inherit;
  }
  .note-toggle:hover { text-decoration: underline; }
  .dcard-btn {
    padding: 5px 12px; border-radius: var(--radius-sm); font-size: 12px;
    font-weight: 600; text-decoration: none; white-space: nowrap;
    border: 1px solid var(--border); background: var(--surface-2);
    color: var(--text-2); cursor: pointer; font-family: inherit;
    transition: background .12s, border-color .12s, color .12s;
  }
  .dcard-btn:hover { background: var(--surface); border-color: var(--text-4); color: var(--text); text-decoration: none; }
  .dcard-btn--primary { background: var(--blue-fg); color: #fff; border-color: var(--blue-fg); }
  .dcard-btn--primary:hover { background: var(--blue); color: #fff; border-color: var(--blue); }
  .dcard-gap-prose { font-size: 12px; line-height: 1.5; color: var(--text-3); margin-top: 7px; }
  .dcard-story-row { display: flex; gap: 9px; align-items: flex-start; padding: 6px 0; }
  .dcard-story-row + .dcard-story-row { border-top: 1px dashed var(--border); }
  /* Match list */
  .match-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .match-list li { display: flex; gap: 7px; align-items: flex-start; }
  .match-icon { width: 15px; height: 15px; border-radius: 50%; font-size: 9px; font-weight: 800;
                display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
  .match-yes .match-icon     { background: var(--green-bg);  color: var(--green); }
  .match-partial .match-icon { background: var(--amber-bg);  color: var(--amber); }
  .match-req { font-size: 12px; font-weight: 600; color: var(--text); line-height: 1.3; }
  .match-ev  { font-size: 11.5px; color: var(--text-3); line-height: 1.4; margin-top: 1px; }
  /* Stories */
  .detail-stories-wrap { margin-bottom: 10px; }
  .story-chips { display: flex; flex-direction: column; gap: 5px; }
  .story-chip {
    display: flex; gap: 9px; align-items: flex-start;
    background: var(--surface); border-left: 3px solid var(--purple-fg);
    border-radius: 4px; padding: 7px 10px;
  }
  .story-n {
    font-size: 10px; font-weight: 700; color: var(--purple-fg-dark);
    background: var(--purple-bg); border-radius: 50%;
    width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 2px;
  }
  .story-req { font-size: 12px; font-weight: 600; color: var(--text); }
  .story-ev  { font-size: 11.5px; color: var(--text-3); margin-top: 2px; line-height: 1.4; }
  /* Recommendation banner */
  .rec-banner {
    display: flex; align-items: center; gap: 10px;
    background: var(--green-bg); border: 1px solid var(--green-border);
    border-radius: var(--radius-sm); padding: 9px 12px; flex-wrap: wrap; margin-top: 4px;
  }
  .rec-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
    background: var(--green-fg-dark); color: #fff; padding: 2px 8px; border-radius: var(--radius-full);
    white-space: nowrap;
  }
  .rec-text  { font-size: 12.5px; color: var(--text-2); flex: 1; min-width: 0; line-height: 1.4; }
  .rec-btn {
    background: var(--green-fg-dark); color: #fff; padding: 5px 13px;
    border-radius: var(--radius-sm); font-size: 12px; font-weight: 600;
    text-decoration: none; white-space: nowrap; transition: background .12s;
  }
  .rec-btn:hover { background: var(--green); color: #fff; text-decoration: none; }
  /* Dark-mode pill overrides — *-fg-dark in dark mode is the LIGHT variant
     used for text on tinted backgrounds, but solid pill bg needs dark text. */
  body.dark .panel-title .pill,
  body.dark .rec-label,
  body.dark .rec-btn,
  body.dark .skip-link { color: #0a0a0b; }
  body.dark .rec-btn:hover { color: #0a0a0b; }

  /* ── Stat panels (expandable) ────────────────────────────────── */
  .stat-panel {
    display: none; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: var(--shadow-sm);
    padding: 20px 24px; margin-bottom: 16px;
  }
  .stat-panel.open { display: block; }
  .stat-panel-title { font-size: 16px; font-weight: 600; margin: 0 0 14px; display: flex; align-items: center; gap: 10px; letter-spacing: -0.2px; }
  .stat-panel-title .pill { font-size: 11px; background: var(--blue-fg); color: #fff; padding: 1px 9px; border-radius: var(--radius-full); }
  .stat-panel .loading { color: var(--text-3); font-size: 13px; padding: 12px 0; }
  /* ── Skeleton loaders ────────────────────────────────────────── */
  .skeleton-stack { display: flex; flex-direction: column; gap: 10px; padding: 6px 0 4px; }
  .skeleton-bar {
    height: 18px; border-radius: var(--radius-sm);
    background: linear-gradient(90deg, var(--surface-2) 0%, var(--border) 50%, var(--surface-2) 100%);
    background-size: 200% 100%; animation: skeleton-pulse 1.4s ease-in-out infinite;
  }
  .skeleton-bar.sk-title { height: 22px; width: 38%; }
  .skeleton-bar.sk-line  { height: 14px; width: 92%; }
  .skeleton-bar.sk-line-short { height: 14px; width: 64%; }
  @keyframes skeleton-pulse {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .skeleton-error { color: var(--red-fg); font-size: 13px; padding: 12px 0; }
  .bucket-grid { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
  .bucket-card {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 12px 16px; min-width: 100px; text-align: center;
  }
  /* Single-row variant — score buckets + status buckets in one strip with a
     subtle divider between the two groups. Cards flex to share width evenly
     and shrink to fit. Wraps gracefully on narrow viewports. */
  .bucket-grid-row { flex-wrap: nowrap; align-items: stretch; gap: 8px; }
  .bucket-grid-row .bucket-card {
    flex: 1 1 0;
    min-width: 0;
    padding: 10px 8px;
  }
  .bucket-grid-row .bucket-card .bval { font-size: 20px; }
  .bucket-grid-row .bucket-card .blbl { font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Recent evaluations — collapsed shows top 5 visible row pairs (10 trs:
     5 .row + 5 hidden .detail-row siblings). Expand reveals the rest. */
  .recent-evals-header {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; margin-bottom: 6px;
  }
  .recent-evals-meta {
    font-size: 11px; color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .recent-evals-wrap.collapsed tbody tr:nth-child(n+11) { display: none !important; }
  .recent-evals-toggle {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 8px; padding: 7px 14px;
    background: transparent; color: var(--text-2);
    border: 1px solid var(--border); border-radius: 6px;
    font-size: 12px; font-weight: 500; cursor: pointer;
    font-family: inherit;
    transition: border-color .12s, color .12s, background .12s;
  }
  .recent-evals-toggle:hover {
    border-color: var(--border-strong); color: var(--text);
    background: var(--surface-2);
  }
  .recent-evals-toggle:focus-visible { outline: 2px solid var(--blue-fg); outline-offset: 2px; }
  .bucket-divider {
    flex: 0 0 1px;
    align-self: stretch;
    background: var(--border);
    margin: 6px 6px;
  }
  @media (max-width: 880px) {
    .bucket-grid-row { flex-wrap: wrap; }
    .bucket-grid-row .bucket-card { flex: 1 1 calc(33% - 8px); min-width: 90px; }
    .bucket-divider { display: none; }
  }
  .bucket-card .bval { font-size: 22px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .bucket-card .blbl { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }

  /* ── Sidebar batch widget (replaces floating overlay) ─────────── */
  .sidebar-batch {
    margin: 4px 8px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 6px);
    overflow: hidden;
    font-size: 12px;
    flex-shrink: 0;
  }
  .sidebar-batch-header {
    padding: 7px 10px 5px;
    font-weight: 600; font-size: 12px; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sidebar-batch-bar { height: 3px; background: var(--border); }
  .sidebar-batch-fill { height: 100%; background: linear-gradient(90deg, var(--green-fg), var(--blue-fg)); transition: width .5s; }
  .sidebar-batch-stats { padding: 5px 10px 7px; }
  .sidebar-batch-stat { display: flex; justify-content: space-between; padding: 2px 0; }
  .sidebar-batch-stat-label { color: var(--text-3); }
  .sidebar-batch-stat-val { font-weight: 600; color: var(--text); }
  .sidebar-batch-recent { margin-top: 5px; }
  .sidebar-batch-recent-item {
    padding: 3px 0; border-top: 1px solid var(--border);
    font-size: 11px; color: var(--text-3);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  /* Collapsed / icon-only mode: hide stats, keep header + bar. */
  @media (max-width: 1279px) and (min-width: 721px) {
    .sidebar-batch { margin: 4px 4px 8px; }
    .sidebar-batch-stats { display: none; }
  }
  body.sidebar-collapsed .sidebar-batch { margin: 4px 4px 8px; }
  body.sidebar-collapsed .sidebar-batch-stats { display: none; }
  /* On mobile the sidebar is a nav drawer — batch widget doesn't belong there. */
  @media (max-width: 720px) {
    #sidebar-batch { display: none !important; }
  }

  /* ── Verify modal ────────────────────────────────────────────── */
  #verify-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2000; backdrop-filter: blur(2px); }
  #verify-backdrop.visible { display: block; }
  #verify-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    width: min(680px,96vw); max-height: 80vh; overflow-y: auto; z-index: 2001;
    background: var(--surface); border-radius: 12px; border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }
  .verify-header {
    position: sticky; top: 0; background: var(--surface); border-bottom: 1px solid var(--border);
    padding: 16px 20px; display: flex; align-items: center; gap: 10px;
    border-radius: 12px 12px 0 0;
  }
  .verify-title { font-size: 15px; font-weight: 600; flex: 1; color: var(--text); }
  .verify-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text-3); padding: 0 2px; }
  .verify-close:hover { color: var(--text); }
  .verify-body { padding: 20px; }
  .verify-section { margin-bottom: 18px; }
  .verify-section h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); font-weight: 700; }
  .verify-claim { padding: 8px 12px; margin: 4px 0; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 13px; line-height: 1.5; }
  .query-card { margin: 6px 0; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
  .query-card-header { padding: 10px 14px; background: var(--surface-2); font-weight: 600; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
  .query-text { padding: 10px 14px; font-size: 12.5px; line-height: 1.6; color: var(--text-3); font-family: ui-monospace, monospace; }
  .copy-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
    padding: 3px 10px; font-size: 11px; cursor: pointer; color: var(--text-3); font-family: inherit;
  }
  .copy-btn:hover { background: var(--surface-2); color: var(--text-2); }
  .evidence-area {
    width: 100%; min-height: 100px; padding: 10px; border: 1px solid var(--border);
    border-radius: var(--radius-sm); font-size: 13px; font-family: inherit;
    resize: vertical; background: var(--surface); color: var(--text);
  }
  .evidence-area:focus { outline: none; border-color: var(--blue-fg); box-shadow: var(--ring-blue); }
  .save-evidence-btn {
    margin-top: 8px; background: var(--green-fg); color: #fff; border: none;
    padding: 7px 16px; border-radius: var(--radius-sm); font-size: 13px; cursor: pointer; font-family: inherit;
  }
  .save-evidence-btn:hover { background: var(--green); }

  /* ── Gap modal ───────────────────────────────────────────────── */
  #gap-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2000; backdrop-filter: blur(2px); }
  #gap-backdrop.visible { display: block; }
  #gap-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    width: min(620px,96vw); max-height: 82vh; overflow-y: auto; z-index: 2001;
    background: var(--surface); border-radius: 12px; border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }
  .gap-modal-header {
    position: sticky; top: 0; background: var(--surface); border-bottom: 1px solid var(--border);
    padding: 14px 20px; display: flex; align-items: center; gap: 10px; z-index: 1;
    border-radius: 12px 12px 0 0;
  }
  .gap-modal-badge {
    font-size: 11px; padding: 2px 9px; border-radius: var(--radius-full); font-weight: 600;
    background: var(--amber-bg); border: 1px solid var(--amber-border); color: var(--amber); flex-shrink: 0;
  }
  .gap-modal-title { font-size: 15px; font-weight: 600; flex: 1; color: var(--text); }
  .gap-modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .gap-section { border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border); }
  .gap-section-label {
    padding: 8px 14px; background: var(--surface-2); font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); border-bottom: 1px solid var(--border);
  }
  .gap-section-body { padding: 12px 14px; font-size: 13px; line-height: 1.65; color: var(--text-2); }
  .gap-section-body p { margin: 0 0 6px; }
  .gap-section-body p:last-child { margin: 0; }
  .gap-section-body ul, .gap-section-body ol { margin: 4px 0 6px; padding-left: 22px; }
  .gap-section-body li { margin: 2px 0; }
  .gap-section-body li > p { margin: 0; }
  .gap-section-body h1, .gap-section-body h2, .gap-section-body h3, .gap-section-body h4 {
    margin: 8px 0 4px; font-size: 13px; font-weight: 700; color: var(--text); letter-spacing: -0.1px;
  }
  .gap-section-body code {
    background: var(--surface-2); padding: 1px 5px; border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  }
  .gap-section-body pre {
    background: var(--surface-2); padding: 9px 12px; border-radius: var(--radius-sm);
    overflow-x: auto; font-size: 12px; margin: 6px 0;
  }
  .gap-section-body pre code { background: none; padding: 0; }
  .gap-section-body strong { color: var(--text); font-weight: 600; }
  .gap-section-body a { color: var(--blue-fg); }
  .gap-section.gap-ok { border-color: var(--green-border); }
  .gap-section.gap-ok .gap-section-label { background: var(--green-bg); color: var(--green); border-color: var(--green-border); }
  .gap-section.gap-strategy { border-color: var(--purple-border); }
  .gap-section.gap-strategy .gap-section-label { background: var(--purple-bg); color: var(--purple); border-color: var(--purple-border); }
  .gap-empty { color: var(--text-4); font-style: italic; font-size: 13px; padding: 8px 0; }

  /* ── Quick-add role modal ───────────────────────────────────── */
  #quickadd-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2000; backdrop-filter: blur(2px); }
  #quickadd-backdrop.visible { display: flex; }
  #quickadd-modal {
    position: fixed; top: 18vh; left: 50%; transform: translateX(-50%);
    width: min(520px,96vw); max-height: 70vh; overflow-y: auto; z-index: 2001;
    background: var(--surface); border-radius: 12px; border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }
  .quickadd-header {
    position: sticky; top: 0; background: var(--surface); border-bottom: 1px solid var(--border);
    padding: 14px 20px; display: flex; align-items: center; gap: 10px;
    border-radius: 12px 12px 0 0;
  }
  .quickadd-title { font-size: 15px; font-weight: 600; flex: 1; color: var(--text); }
  .quickadd-body { padding: 18px 20px 20px; display: flex; flex-direction: column; gap: 12px; }
  .quickadd-hint { font-size: 12px; color: var(--text-3); margin: 0; }
  #quickadd-url {
    width: 100%; padding: 11px 14px; font-size: 14px;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface-2); color: var(--text); font-family: inherit;
    box-sizing: border-box;
  }
  #quickadd-url:focus { outline: 2px solid var(--blue-fg); outline-offset: -1px; }
  .quickadd-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .quickadd-submit { background: var(--blue-fg); color: white; border-color: var(--blue-fg); }
  .quickadd-submit:hover { filter: brightness(1.05); }
  .quickadd-submit[disabled] { opacity: 0.6; cursor: not-allowed; }

  /* ── Toast component ─────────────────────────────────────────── */
  #toast-container {
    position: fixed; right: 18px; bottom: 18px; z-index: 3000;
    display: flex; flex-direction: column; gap: 8px;
    max-width: min(360px, calc(100vw - 36px)); pointer-events: none;
  }
  .toast {
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border); border-left: 3px solid var(--blue-fg);
    border-radius: var(--radius-sm); box-shadow: var(--shadow-md);
    padding: 11px 14px; font-size: 13px; line-height: 1.5;
    pointer-events: auto;
    animation: toast-in .22s ease-out;
    display: flex; align-items: flex-start; gap: 9px;
  }
  .toast.toast-leave { animation: toast-out .25s ease-in forwards; }
  .toast-success { border-left-color: var(--green-fg); }
  .toast-error   { border-left-color: var(--red-fg); }
  .toast-info    { border-left-color: var(--blue-fg); }
  .toast-icon { flex-shrink: 0; font-size: 14px; line-height: 1.45; }
  .toast-success .toast-icon { color: var(--green-fg); }
  .toast-error   .toast-icon { color: var(--red-fg); }
  .toast-info    .toast-icon { color: var(--blue-fg); }
  .toast-msg { flex: 1; min-width: 0; word-wrap: break-word; }
  .toast-close {
    background: none; border: none; cursor: pointer;
    color: var(--text-4); font-size: 14px; padding: 0 0 0 4px;
    flex-shrink: 0; line-height: 1;
  }
  .toast-close:hover { color: var(--text-2); }
  @keyframes toast-in {
    0%   { opacity: 0; transform: translateY(12px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes toast-out {
    0%   { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(8px); }
  }

  /* ── Inline status popover ───────────────────────────────────── */
  .status-pill { cursor: pointer; user-select: none; }
  .status-pill:hover { box-shadow: 0 0 0 2px var(--blue-bg); }
  .status-pill:focus-visible { outline: 2px solid var(--blue-fg); outline-offset: 2px; }
  .status-pill.status-pill-pending { opacity: 0.6; pointer-events: none; }
  #status-popover {
    position: absolute; z-index: 2500;
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    padding: 4px;
    min-width: 140px;
    font-size: 13px;
    display: none;
  }
  #status-popover.is-open { display: block; }
  .status-popover-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 7px 10px;
    background: transparent; border: none; cursor: pointer;
    font: inherit; color: var(--text); text-align: left;
    border-radius: 4px;
    line-height: 1.3;
  }
  .status-popover-item:hover { background: var(--surface-2); }
  .status-popover-item.is-current { font-weight: 600; background: var(--blue-bg); color: var(--blue-fg); }
  .status-popover-item:focus-visible { outline: 2px solid var(--blue-fg); outline-offset: -2px; }
  .status-popover-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  @media (hover: none) and (pointer: coarse), (max-width: 640px) {
    .status-popover-item { min-height: 44px; padding: 12px 14px; }
  }

  /* ── Inline email-template popover ───────────────────────────── */
  #email-popover {
    position: absolute; z-index: 2500;
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    padding: 6px;
    min-width: 220px;
    font-size: 13px;
    display: none;
  }
  #email-popover.is-open { display: block; }

  /* Cell popover (Equity / Base / Location detail). Same chrome as the
     email popover but wider so the source list / raw comp string fits. */
  #pill-popover {
    position: absolute; z-index: 2500;
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    padding: 12px 14px;
    min-width: 280px; max-width: 420px;
    /* Cap height + scroll internally so tall content (Benefits/People with
       all sections populated) never bleeds off the viewport. _positionFloater
       sets max-height dynamically so we never need to scroll-the-page-then-
       scroll-the-popover. */
    max-height: 80vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    font-size: 13px; line-height: 1.5;
    display: none;
  }
  #pill-popover::-webkit-scrollbar { width: 8px; }
  #pill-popover::-webkit-scrollbar-track { background: transparent; }
  #pill-popover::-webkit-scrollbar-thumb {
    background: var(--border-strong); border-radius: 4px;
  }
  #pill-popover::-webkit-scrollbar-thumb:hover { background: var(--text-4); }
  body.dark #pill-popover {
    background: var(--surface);
    border-color: var(--border-strong);
    box-shadow: 0 8px 32px rgba(0,0,0,.55);
  }
  #pill-popover.is-open { display: block; }
  #pill-popover .pill-popover-kind {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-3); font-weight: 700; margin-bottom: 4px;
  }
  #pill-popover .pill-popover-headline {
    font-size: 15px; font-weight: 600; color: var(--text); margin: 0 0 8px 0;
  }
  #pill-popover .pill-popover-body {
    color: var(--text-2); font-size: 12px; line-height: 1.5;
  }
  #pill-popover .pill-popover-meta {
    margin-top: 10px; padding-top: 8px;
    border-top: 1px solid var(--border);
    font-size: 11px; color: var(--text-3);
  }
  #pill-popover .pill-popover-row {
    display: flex; gap: 8px; margin: 3px 0;
  }
  #pill-popover .pill-popover-row dt {
    color: var(--text-4); flex: 0 0 78px; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  #pill-popover .pill-popover-row dd { margin: 0; flex: 1; color: var(--text-2); font-size: 12px; }
  #pill-popover .bw-table {
    width: 100%; border-collapse: collapse; font-size: 12px; margin: 6px 0;
  }
  #pill-popover .bw-table th,
  #pill-popover .bw-table td { padding: 4px 7px; text-align: right; }
  #pill-popover .bw-table th:first-child,
  #pill-popover .bw-table td:first-child { text-align: left; }
  #pill-popover .bw-table thead { background: var(--surface-2); font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
  #pill-popover .bw-table tbody tr:nth-child(even) { background: var(--surface-2); }
  #pill-popover .bw-tier { font-weight: 600; color: var(--text-2); }
  #pill-popover .bw-take { color: var(--green-fg); font-weight: 700; }
  #pill-popover .bw-match { color: var(--blue-fg); font-size: 11px; }
  #pill-popover .pill-popover-sources {
    margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--border);
  }
  #pill-popover .pill-popover-sources a {
    display: block; padding: 2px 0; color: var(--blue-fg-dark);
    font-size: 11px; text-decoration: none;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #pill-popover .pill-popover-sources a:hover { text-decoration: underline; }
  #pill-popover .pill-popover-empty {
    color: var(--text-3); font-style: italic; font-size: 12px;
  }
  .pill-popover-trigger { cursor: pointer; }
  .pill-popover-trigger:focus-visible { outline: 2px solid var(--blue-fg); outline-offset: 2px; border-radius: 4px; }
  #email-popover .email-popover-header {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-3); font-weight: 700; padding: 4px 8px 6px;
  }
  .email-popover-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 8px 10px;
    background: transparent; border: none; cursor: pointer;
    font: inherit; color: var(--text); text-align: left;
    border-radius: 4px; line-height: 1.3;
  }
  .email-popover-item:hover { background: var(--surface-2); }
  .email-popover-item:focus-visible { outline: 2px solid var(--blue-fg); outline-offset: -2px; }
  .email-popover-item .email-popover-count {
    margin-left: auto; font-size: 10px; color: var(--text-4);
  }
  @media (hover: none) and (pointer: coarse), (max-width: 640px) {
    .email-popover-item { min-height: 44px; padding: 12px 14px; }
  }

  /* ── Bulk operations: row checkboxes + floating action bar ───── */
  /* Checkbox column is collapsed by default; revealed once any row is
     selected (via row-click handler) or when select-mode is forced
     on (Cmd-K toggle). Using width:0 + visibility:hidden keeps the
     column structure intact for sortTable / colspan math. */
  .bulk-th, .bulk-cell {
    width: 0;
    padding: 0 !important;
    visibility: hidden;
    overflow: hidden;
    transition: width .12s ease;
  }
  body.select-mode .bulk-th,
  body.select-mode .bulk-cell {
    width: 28px;
    padding: 6px 6px !important;
    visibility: visible;
  }
  .bulk-checkbox, .bulk-header-checkbox {
    width: 16px; height: 16px;
    cursor: pointer;
    accent-color: var(--blue-fg, #0969da);
    margin: 0;
  }
  tr.row.is-bulk-selected > td {
    background: var(--blue-bg, #ddf4ff) !important;
  }
  #bulk-action-bar {
    position: fixed;
    top: 12px; left: 50%; transform: translateX(-50%) translateY(-8px);
    z-index: 4000;
    background: var(--surface, #fff);
    border: 1px solid var(--border, #d0d7de);
    border-radius: 999px;
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(140,149,159,.2));
    padding: 6px 10px;
    opacity: 0;
    pointer-events: none;
    transition: opacity .15s ease, transform .15s ease;
  }
  #bulk-action-bar:not([hidden]) {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
  }
  .bulk-bar-inner {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 13px; color: var(--text);
  }
  .bulk-bar-count {
    padding: 0 8px 0 6px;
    color: var(--text-2, #57606a);
    white-space: nowrap;
  }
  .bulk-bar-count strong {
    color: var(--text, #1f2328);
    font-weight: 600;
  }
  .bulk-btn {
    background: var(--surface-2, #f6f8fa);
    color: var(--text, #1f2328);
    border: 1px solid var(--border, #d0d7de);
    padding: 6px 12px;
    border-radius: 999px;
    cursor: pointer;
    font: inherit;
    font-size: 12.5px;
    line-height: 1;
    transition: background .1s ease;
  }
  .bulk-btn:hover { background: var(--surface, #fff); }
  .bulk-btn-primary {
    background: var(--blue-fg, #0969da);
    color: #fff;
    border-color: var(--blue-fg, #0969da);
  }
  .bulk-btn-primary:hover { background: #0860c7; color: #fff; }
  .bulk-btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--text-3, #6e7781);
  }
  .bulk-btn-ghost:hover { background: var(--surface-2, #f6f8fa); color: var(--text); }
  @media (hover: none) and (pointer: coarse), (max-width: 640px) {
    body.select-mode .bulk-th, body.select-mode .bulk-cell { width: 36px; }
    .bulk-checkbox, .bulk-header-checkbox { width: 22px; height: 22px; }
    .bulk-btn { min-height: 36px; padding: 8px 14px; font-size: 13px; }
    #bulk-action-bar { top: 8px; max-width: calc(100vw - 16px); }
  }

  /* ── Touch-target audit (>=44x44 on coarse pointers / mobile) ─── */
  @media (hover: none) and (pointer: coarse), (max-width: 640px) {
    .toolbar-btn { min-height: 44px; min-width: 44px; padding: 10px 16px; font-size: 13px; }
    .stat { min-height: 88px; padding: 16px 18px; }
    th.sortable { min-height: 44px; padding-top: 12px; padding-bottom: 12px; }
    tr.row > td { padding-top: 12px; padding-bottom: 12px; }
    .gap-chip-interactive { min-height: 44px; padding: 12px 14px; display: inline-flex; align-items: center; }
    .badge { min-height: 28px; padding: 6px 12px; }
    td > .badge, .badge.score-badge-lg { min-height: 32px; padding: 7px 12px; }
    /* Pills inside tappable rows get a wider hit-area through their td padding above. */
    .verify-close { min-height: 44px; min-width: 44px; padding: 10px; font-size: 18px; }
    /* Live ticker now sits inside the mission-control strip (full row),
       so on mobile it doesn't need to collapse to a dot. The strip itself
       collapses via its own media query (see .mc-strip rules). */
    #dark-toggle { min-height: 44px; min-width: 44px; }
    .rec-btn { min-height: 44px; padding: 12px 18px; display: inline-flex; align-items: center; }
    .filters input, .filters select { min-height: 44px; padding: 10px 12px; font-size: 14px; }
    .verify-submit { min-height: 44px; padding: 12px 20px; }
  }

  /* ── Mobile-only gap chips on cards (hidden on desktop) ───────── */
  .card-gaps-mobile { display: none; }
  .gap-chip-mobile {
    font-size: 11px; padding: 3px 9px;
    background: var(--amber-bg); border: 1px solid var(--amber-border);
    border-radius: var(--radius-full); color: var(--amber);
    white-space: nowrap;
  }

  /* ── Mobile bottom-sheet (drawer) for row detail ──────────────── */
  /* iOS-style bottom sheet: slides up from the bottom edge with a
     rubber-band drag handle. Backdrop fades in (display:block stays so
     opacity transitions cleanly; pointer-events block taps when hidden).
     Honors safe-area-inset-bottom so the iPhone home indicator never
     covers the action area at rest. */
  #mobile-sheet-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.55); z-index: 2500;
    -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
    opacity: 0; pointer-events: none;
    transition: opacity .22s ease-out;
  }
  #mobile-sheet-backdrop.visible { opacity: 1; pointer-events: auto; }
  #mobile-sheet {
    position: fixed; left: 0; right: 0; bottom: 0;
    max-height: 85vh; display: flex; flex-direction: column;
    background: var(--surface);
    border-top: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -10px 30px rgba(0,0,0,.25);
    z-index: 2501;
    transform: translateY(100%);
    transition: transform .28s cubic-bezier(.32,.72,0,1);
    padding-bottom: env(safe-area-inset-bottom);
    will-change: transform;
  }
  #mobile-sheet-backdrop.visible #mobile-sheet { transform: translateY(0); }
  /* Rubber-band drag handle: 4px pill, expanded to a 24px-tall hit area
     so finger drags catch reliably without a visible gutter. */
  .mobile-sheet-handle {
    width: 40px; height: 4px; border-radius: 2px;
    background: var(--border-strong);
    margin: 0 auto;
    flex-shrink: 0;
  }
  .mobile-sheet-handle-grip {
    flex-shrink: 0;
    padding: 10px 0 6px;
    cursor: grab;
    touch-action: none;
  }
  .mobile-sheet-handle-grip:active { cursor: grabbing; }
  .mobile-sheet-header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px 12px;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: var(--surface); z-index: 1;
  }
  .mobile-sheet-title {
    flex: 1; font-weight: 600; font-size: 15px;
    color: var(--text); line-height: 1.35;
    overflow: hidden; text-overflow: ellipsis;
  }
  .mobile-sheet-close {
    background: none; border: none; font-size: 22px; cursor: pointer;
    color: var(--text-3); padding: 0;
    min-height: 44px; min-width: 44px; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm);
  }
  .mobile-sheet-close:hover, .mobile-sheet-close:active { color: var(--text); background: var(--surface-2); }
  .mobile-sheet-body {
    padding: 12px 14px 24px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1 1 auto; min-height: 0;
    overscroll-behavior: contain;
  }
  /* While the user is dragging the sheet down, suppress the slide-back
     transition so translateY tracks the finger 1:1. JS removes the class
     on release; transition snaps it home (or to closed). */
  #mobile-sheet.is-dragging { transition: none !important; }
  /* Reduced-motion: drag stays smooth (touch is the primary input on
     mobile, so 1:1 finger tracking is essential), but the slide-in /
     slide-out transitions become instant. Backdrop fade also instant. */
  @media (prefers-reduced-motion: reduce) {
    #mobile-sheet { transition: none !important; }
    #mobile-sheet-backdrop { transition: none !important; }
  }

  /* ── Right-rail context drawer (desktop ≥1280, full-overlay 720–1280) ─
     Replaces the inline expand-row pattern on tablet+desktop. The main
     table stays visible; drawer overlays the rightmost 420px (or full
     width on tablet). Mobile keeps the bottom-sheet pattern. */
  #right-rail-drawer {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: 420px; max-width: 100vw;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: -8px 0 28px rgba(0,0,0,.18);
    transform: translateX(100%);
    transition: transform .26s cubic-bezier(.16,1,.3,1);
    z-index: 2400;
    display: none;
    flex-direction: column;
    will-change: transform;
  }
  #right-rail-drawer.open { transform: translateX(0); }
  #right-rail-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.32);
    z-index: 2399;
    opacity: 0; pointer-events: none;
    transition: opacity .22s ease-out;
    display: none;
  }
  #right-rail-backdrop.visible { opacity: 1; pointer-events: auto; }
  .drawer-header {
    flex-shrink: 0;
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    position: relative;
  }
  .drawer-title-row {
    display: flex; align-items: flex-start; gap: 12px;
  }
  .drawer-logo {
    flex-shrink: 0; width: 40px; height: 40px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    object-fit: contain;
  }
  .drawer-logo-fallback {
    display: inline-flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 16px; color: var(--text-2);
    border: 1px solid var(--border);
  }
  .drawer-title-meta { flex: 1; min-width: 0; }
  .drawer-company {
    font-weight: 700; font-size: 16px; color: var(--text);
    line-height: 1.25; display: flex; align-items: center; gap: 6px;
    flex-wrap: wrap;
  }
  .drawer-company-link {
    color: var(--text); text-decoration: none;
    border-bottom: 1px dotted transparent;
    transition: color .12s, border-color .12s;
  }
  .drawer-company-link:hover, .drawer-company-link:focus-visible {
    color: var(--blue-fg-dark);
    border-bottom-color: var(--blue-fg-dark);
  }
  .drawer-role {
    margin-top: 2px;
    font-size: 13px; color: var(--text-2); line-height: 1.4;
    overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .drawer-role-link {
    color: var(--text-2); text-decoration: none;
    border-bottom: 1px dotted transparent;
    transition: color .12s, border-color .12s;
  }
  .drawer-role-link:hover, .drawer-role-link:focus-visible {
    color: var(--green-fg);
    border-bottom-color: var(--green-fg);
  }
  .drawer-chip-row {
    display: flex; align-items: center; gap: 6px;
    margin-top: 10px; flex-wrap: wrap;
  }
  .drawer-close {
    position: absolute; top: 10px; right: 10px;
    background: none; border: none; cursor: pointer;
    color: var(--text-3); font-size: 18px; line-height: 1;
    width: 32px; height: 32px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm);
  }
  .drawer-close:hover { color: var(--text); background: var(--surface-2); }
  .drawer-body {
    flex: 1 1 auto; min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 14px 16px 16px;
  }
  .drawer-body .detail-block { margin: 0; padding: 0; border: 0; background: transparent; }
  .drawer-action-bar {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--surface);
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
    display: flex; gap: 8px;
    position: sticky; bottom: 0;
  }
  .drawer-action-bar button {
    flex: 1; padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-size: 13px; font-weight: 600;
    cursor: pointer;
    transition: background .12s ease, border-color .12s ease, color .12s ease;
  }
  .drawer-action-bar button:hover { background: var(--surface-2); }
  .drawer-action-bar .drawer-btn-primary {
    background: var(--green-fg);
    border-color: var(--green-fg);
    color: #062611;
  }
  .drawer-action-bar .drawer-btn-primary:hover { filter: brightness(.95); background: var(--green-fg); }
  .drawer-action-bar .drawer-btn-primary[disabled] { opacity: .5; cursor: not-allowed; }
  /* Selected-row indicator: 3px left accent + subtle bg highlight so the
     user always knows which row the drawer is showing. */
  tr.row.row-selected > td { background: var(--surface-2); }
  tr.row.row-selected > td:first-child {
    box-shadow: inset 3px 0 0 var(--green-fg);
  }
  /* Desktop ≥1280px: drawer is always 420px and the body gets right
     padding equal to the drawer so content can scroll under but isn't
     fully hidden (when the drawer is open). */
  @media (min-width: 1280px) {
    body.right-rail-open { padding-right: 520px; }
    #right-rail-drawer { display: flex; width: 520px; }
  }
  @media (min-width: 1600px) {
    body.right-rail-open { padding-right: 600px; }
    #right-rail-drawer { display: flex; width: 600px; }
  }
  /* Tablet 720–1279px: drawer becomes a full-overlay (modal-like, with
     backdrop). No body padding shift — drawer floats over the table. */
  @media (min-width: 721px) and (max-width: 1279px) {
    #right-rail-drawer { display: flex; width: min(560px, 92vw); }
    #right-rail-backdrop.visible { display: block; }
  }
  /* Inside the drawer (any width), the side-by-side detail-grid would
     squeeze each col below 200px — single-column reads much better. */
  .drawer-body .detail-grid { grid-template-columns: 1fr !important; }
  .drawer-body .detail-col  { gap: 12px; }
  .drawer-body .dcard       { width: 100%; }
  /* Mobile <720px: drawer hidden entirely; toggleDetail routes to the
     existing bottom-sheet pattern from Wave G. */
  @media (max-width: 720px) {
    #right-rail-drawer, #right-rail-backdrop { display: none !important; }
    body.right-rail-open { padding-right: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    #right-rail-drawer { transition: none !important; }
    #right-rail-backdrop { transition: none !important; }
  }

  /* ── Pull-to-refresh indicator (mobile only) ──────────────────── */
  /* A small pill that drops in from above the toolbar as the user pulls.
     Hidden by default; JS sets translateY + opacity during the gesture
     and the .refreshing class spins the icon while data reloads. */
  #pull-to-refresh {
    position: fixed; left: 50%; top: max(8px, env(safe-area-inset-top));
    transform: translate(-50%, -120%);
    display: none;
    align-items: center; gap: 8px;
    padding: 8px 14px;
    background: var(--surface);
    color: var(--text-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-md);
    font-size: 12.5px; font-weight: 600;
    z-index: 4500; pointer-events: none;
    transition: transform .18s ease-out, opacity .18s ease-out;
    will-change: transform, opacity;
  }
  #pull-to-refresh.visible { display: inline-flex; }
  #pull-to-refresh .ptr-icon {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid currentColor; border-top-color: transparent;
    border-radius: 50%;
    transform: rotate(0deg);
    transition: transform .18s linear;
  }
  #pull-to-refresh.refreshing .ptr-icon { animation: ptr-spin .7s linear infinite; }
  @keyframes ptr-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    #pull-to-refresh, #pull-to-refresh .ptr-icon { transition: none !important; animation: none !important; }
  }

  /* ── Mobile bottom tab bar (Apply-Now / All / Charts / Settings) */
  /* Native-iOS-feel tab strip pinned to the bottom of the viewport on
     mobile. Honors safe-area-inset-bottom so the home indicator on
     notched iPhones doesn't crowd the tap targets. Hidden ≥721px so
     the desktop toolbar stays in charge. */
  #mobile-tabbar { display: none; }
  @media (max-width: 720px) {
    #mobile-tabbar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      position: fixed; left: 0; right: 0; bottom: 0;
      padding-bottom: max(6px, env(safe-area-inset-bottom));
      padding-top: 6px;
      background: var(--surface);
      border-top: 1px solid var(--border-strong);
      box-shadow: 0 -4px 16px rgba(0,0,0,0.10);
      z-index: 2300;
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      backdrop-filter: saturate(180%) blur(20px);
      background: color-mix(in srgb, var(--surface) 88%, transparent);
    }
    .mobile-tab {
      appearance: none; background: transparent; border: 0;
      font-family: inherit; color: var(--text-3);
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: 4px 6px;
      min-height: 44px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: color .12s ease-out, transform .08s ease-out;
    }
    .mobile-tab .tab-icon {
      font-size: 19px; line-height: 1; display: inline-block;
      transition: transform .12s ease-out;
    }
    .mobile-tab .tab-label {
      font-size: 10.5px; font-weight: 600; letter-spacing: 0.2px;
    }
    .mobile-tab[aria-selected="true"] {
      color: var(--blue-fg);
    }
    .mobile-tab[aria-selected="true"] .tab-icon {
      transform: scale(1.08);
    }
    .mobile-tab:active .tab-icon { transform: scale(.92); }
    /* Pad the main column bottom so the last row isn't hidden under the
       mobile tab bar. (Padding lives on .app-main now that body has a
       sidebar grid wrapper — see Phase 7 sidebar block above.) */
    .app-main { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
    /* Lift bulk-action-bar, batch overlay and toast above the tab bar. */
    #bulk-action-bar { bottom: calc(76px + env(safe-area-inset-bottom)) !important; top: auto !important; }
    #toast-container { bottom: calc(76px + env(safe-area-inset-bottom)) !important; }
    /* Mobile sheet sits above the tab bar — its bottom is 0 but z-index
       is higher and we extend its content padding to clear the bar. */
    #mobile-sheet { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mobile-tab, .mobile-tab .tab-icon { transition: none !important; }
  }

  /* ── Haptic-style tap feedback (mobile only) ──────────────────── */
  /* Tapping any actionable element kicks off a brief scale + opacity
     pulse that mimics native iOS responsiveness. JS toggles
     .tap-pulsing on pointerdown for the touch case so desktop click
     behavior is untouched. */
  @media (hover: none) and (pointer: coarse) {
    .tap-pulsing {
      transform: scale(0.97) !important;
      opacity: 0.78 !important;
      transition: transform .07s ease-out, opacity .07s ease-out !important;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tap-pulsing { transform: none !important; opacity: 1 !important; }
  }

  /* ── Long-press multi-select on mobile ────────────────────────── */
  /* While a row is being long-pressed, halo it so the user gets a
     pre-commit cue. JS clears this either on selection commit or on
     pointer cancel. */
  tr.row.is-long-pressing {
    background: var(--blue-bg) !important;
    box-shadow: inset 3px 0 0 var(--blue-fg);
  }

  /* ── Mobile breakpoint: tables → cards (Apply-Now primary) ────── */
  @media (max-width: 720px) {
    .app-main { padding: 14px 12px 80px; }
    .container { max-width: 100%; }

    /* Tighter toolbar */
    .toolbar h1 { font-size: 18px; }
    .subtle { font-size: 12px; margin-bottom: 14px; }

    /* Stats: 2-up grid */
    .stats { grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 18px; }
    .stat { padding: 14px 14px; min-height: 80px; }
    .stat-value { font-size: 24px; margin-top: 4px; }
    .stat-label { font-size: 10.5px; }
    .stat-caret { font-size: 10px; margin-top: 6px; }
    /* Stat-panel: constrained height + scrollable so it doesn't bury cards */
    .stat-panel { padding: 14px 12px; max-height: 65vh; overflow-y: auto; }
    .stat-panel-title { font-size: 14px; margin-bottom: 10px; }
    /* Hero balance: allow label to wrap on narrow screens */
    .stat-hero-balance .stat-label { white-space: normal; }

    /* Panels: tighter */
    .panel { padding: 16px 14px; }
    .panel-title { font-size: 15px; }

    /* Filters become full-width stacked controls */
    .filters input, .filters select { width: 100%; min-width: 0; flex: 1 1 100%; }

    /* Charts grid → 1 column on mobile */
    .charts-grid { grid-template-columns: 1fr; gap: 12px; }
    .trends-grid { grid-template-columns: 1fr; gap: 10px; }
    .trend-card-wide { grid-column: 1 / -1; }
    .comp-grid { grid-template-columns: 1fr; gap: 18px; }
    .comp-hist-row { grid-template-columns: 84px 1fr 28px; }
    .comp-floor-row { grid-template-columns: 100px 1fr 50px; }

    /* Show the gap chips on cards */
    .card-gaps-mobile {
      display: flex; flex-wrap: wrap; gap: 4px;
      margin-top: 8px;
    }

    /* Apply-Now Queue → card layout. Keeps semantic <table> for sort/filter
       JS while CSS rewrites the visual layout for narrow viewports. */
    #apply-now-section .table-scroll {
      max-height: none;
      overflow: visible;
      border-radius: 0;
    }
    #apply-now-section table,
    #apply-now-section thead,
    #apply-now-section tbody,
    #apply-now-section tr.row,
    #apply-now-section tr.row > td {
      display: block;
      width: auto;
    }
    #apply-now-section table { width: 100%; }
    #apply-now-section thead { display: none; }
    #apply-now-section tr.row {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 14px 12px;
      margin: 0 0 10px;
      box-shadow: var(--shadow-sm);
      cursor: pointer;
      min-height: 44px;
      transition: background .12s, border-color .12s;
    }
    #apply-now-section tr.row:active { background: var(--surface-2); border-color: var(--border-strong); }
    #apply-now-section tr.row > td {
      border-bottom: none;
      padding: 0;
      background: transparent !important;
    }
    /* Hide eval date column on mobile (Apply-Now cards & All-Evals scroll
       table); "Age" is the primary recency cue. */
    td.mobile-hide, th.mobile-hide { display: none !important; }
    /* Score chip: top-left, inline */
    #apply-now-section tr.row > td:nth-child(2) {
      display: inline-block;
      margin: 0 10px 6px 0;
      vertical-align: top;
    }
    /* Company column (was nth-child(3) before Wave H added Base) */
    #apply-now-section tr.row > td:nth-child(4) {
      display: inline-block;
      font-size: 15px;
      line-height: 1.35;
      vertical-align: top;
    }
    /* Role: full-width below the title row */
    #apply-now-section tr.row > td.role-cell {
      display: block;
      margin-top: 4px;
      font-size: 13.5px;
      color: var(--text-2);
      font-weight: 500;
      line-height: 1.4;
    }
    /* Wave H: Base + Location chips collapse into a meta row directly
       below role on the stacked card. Class-based so column index drift
       doesn't break this on the next column add. */
    #apply-now-section tr.row > td.base-cell,
    #apply-now-section tr.row > td.location-cell {
      display: inline-flex;
      align-items: center;
      margin: 6px 6px 0 0;
    }
    /* Status pill + equity badge + age: bottom meta line. Class-based
       so column index drift doesn't break the layout. */
    #apply-now-section tr.row > td.status-cell,
    #apply-now-section tr.row > td.equity-cell,
    #apply-now-section tr.row > td.muted-text:not(.mobile-hide) {
      display: inline-flex;
      align-items: center;
      margin: 8px 8px 0 0;
    }
    /* Equity badge on stacked card stays compact next to status */
    #apply-now-section tr.row > td.equity-cell { white-space: nowrap; }
    /* Action links: separated row, right-aligned, large hit-area */
    #apply-now-section tr.row > td.action-cell {
      display: block;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      text-align: right;
      font-size: 13px;
    }
    #apply-now-section tr.row > td.action-cell a {
      display: inline-block;
      min-height: 44px; line-height: 44px;
      padding: 0 12px;
      margin-left: 4px;
    }

    /* All Evaluations panel: keep tabular layout but allow horizontal scroll */
    #all-tbody, .panel:not(#apply-now-section) tbody { display: table-row-group; }
    #all-tbody tr.row, .panel:not(#apply-now-section) tr.row { display: table-row; }
    #all-tbody tr.row > td, .panel:not(#apply-now-section) tr.row > td { display: table-cell; }
    .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

    /* Inline detail row hidden on mobile — content moves into bottom sheet */
    tr.detail-row { display: none !important; }

    /* Detail card grid → 1 col inside the sheet */
    .detail-grid { grid-template-columns: 1fr !important; }
    .detail-block { padding: 12px; }

    /* Modal sizing */
    #verify-modal, #gap-modal { width: 96vw; max-height: 86vh; }
    .gap-modal-body { padding: 14px; }

    /* Batch overlay: full-width sticky bottom */

    /* Toast positioning: leave room for batch overlay */
    #toast-container { right: 12px; left: 12px; bottom: 12px; max-width: none; }
  }

  /* ── Micro-animations (Wave B #21) ───────────────────────────── */
  /* Reduced-motion users get instant state changes, no animations. */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    /* 1. Stat card hover — gentle scale + elevation shift (120ms) */
    .stat {
      transition: transform .12s ease-out,
                  border-color .15s ease-out,
                  box-shadow .12s ease-out;
    }
    .stat:hover { transform: scale(1.01); }
    .stat:active { transform: scale(0.998); }

    /* 2. Row click expand — fade-in + slight slide on the inner block (180ms) */
    @keyframes row-expand-in {
      0%   { opacity: 0; transform: translateY(-4px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    tr.detail-row .detail-block {
      animation: row-expand-in .18s ease-out;
      transform-origin: top center;
    }

    /* 3. Status pill — smooth color transition on writeback (200ms) */
    .status-pill {
      transition: background-color .2s ease,
                  color .2s ease,
                  border-color .2s ease,
                  box-shadow .12s ease;
    }

    /* 4. Cmd-K palette — backdrop fade + modal scale-up (100ms, premium ease) */
    @keyframes cmdk-backdrop-fade-in {
      0%   { opacity: 0; }
      100% { opacity: 1; }
    }
    @keyframes cmdk-modal-scale-in {
      0%   { opacity: 0; transform: scale(0.96); }
      100% { opacity: 1; transform: scale(1); }
    }
    #cmdk-backdrop.visible {
      animation: cmdk-backdrop-fade-in .1s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #cmdk-backdrop.visible #cmdk-modal {
      animation: cmdk-modal-scale-in .1s cubic-bezier(0.16, 1, 0.3, 1);
      transform-origin: top center;
    }

    /* 5. Gap / verify / tier-legend modals — backdrop fade + modal scale-up (120ms) */
    @keyframes modal-backdrop-fade-in {
      0%   { opacity: 0; }
      100% { opacity: 1; }
    }
    @keyframes modal-translate-scale-in {
      0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
      100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    #verify-backdrop.visible,
    #gap-backdrop.visible,
    #tier-legend-backdrop.visible {
      animation: modal-backdrop-fade-in .12s ease-out;
    }
    #verify-backdrop.visible #verify-modal,
    #gap-backdrop.visible #gap-modal,
    #tier-legend-backdrop.visible #tier-legend-modal {
      animation: modal-translate-scale-in .12s ease-out;
    }

    /* 6. Toast — slide up from bottom + fade in (150ms); slide down on dismiss.
       Overrides the existing toast-in/toast-out keyframes with tighter timing
       and a slightly larger travel distance for a more pronounced 'arrival'. */
    @keyframes toast-in {
      0%   { opacity: 0; transform: translateY(14px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes toast-out {
      0%   { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(14px); }
    }
    .toast { animation: toast-in .15s ease-out; }
    .toast.toast-leave { animation: toast-out .15s ease-in forwards; }

    /* 7. Click feedback — radial ripple on subtle interactive surfaces.
       Scoped to elements that already have predictable sizing + safe overflow.
       The pseudo-element is layered behind content; pointer-events disabled. */
    @keyframes ripple-pulse {
      0%   { opacity: 0.32; transform: translate(-50%, -50%) scale(0); }
      70%  { opacity: 0.06; }
      100% { opacity: 0;    transform: translate(-50%, -50%) scale(2.4); }
    }
    .stat::after,
    .gap-chip-interactive::after {
      content: ''; position: absolute; top: 50%; left: 50%;
      width: 140%; aspect-ratio: 1;
      border-radius: 50%;
      background: radial-gradient(circle, var(--blue-fg) 0%, transparent 70%);
      opacity: 0; pointer-events: none;
      transform: translate(-50%, -50%) scale(0);
      z-index: 0;
    }
    /* Keep stat content above the ripple layer. */
    .stat > * { position: relative; z-index: 1; }
    .stat:active::after,
    .gap-chip-interactive:active::after {
      animation: ripple-pulse 1s ease-out;
    }
    .gap-chip-interactive { position: relative; overflow: hidden; }
  }

  /* ── Wave G — Monospace accent surface (Phase 6 #1.3) ──────────
     Dev-tool aesthetic: data, timestamps, URLs, IDs, and numeric
     stats render in JetBrains Mono. tnum keeps digits column-aligned
     so scores in adjacent rows line up at the decimal point. Inter
     stays the body face for prose; this is a targeted accent only. */
  .mono,
  .stat-value,
  .score-badge-lg,
  td.num,
  td.muted-text,
  .note-entry-head,
  .bucket-card .bval,
  .comp-hist-label,
  .comp-hist-count,
  .comp-floor-value,
  .bar-row-count,
  td.action-cell a,
  .query-text,
  .activity-ts,
  .batch-row-id,
  code {
    font-family: var(--font-mono);
    font-feature-settings: "tnum" 1;
  }
  /* Mono-on-data needs a hair of optical compensation: JetBrains Mono
     reads ~5% larger than Inter at the same px size. Pull data cells in
     so columns don't look bloated next to prose. */
  td.muted-text { font-size: 11.5px; letter-spacing: -0.005em; }
  .note-entry-head { font-feature-settings: "tnum" 1; }
  .note-entry-head .note-type-badge { font-family: 'Inter', sans-serif; }

  /* ── Wave G — Filter / sort / expand micro-interactions (#1.2) ──
     250ms standard easing on the five high-traffic surfaces. The
     reduced-motion guard at the top of the cascade already neutralizes
     these via the global *::transition-duration override; the
     no-preference block layers richer transforms on top. */
  @media (prefers-reduced-motion: no-preference) {
    /* 1. Filter input → row hide/show (250ms fade-in on rows that
       just became visible). Hidden rows are still display:none so
       the table collapses cleanly; visible rows pulse a fade-in
       triggered by the .row-fade-in class added in applyFilters(). */
    @keyframes row-fade-in-wave-g {
      from { opacity: 0; transform: translateY(-3px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    tr.row.row-fade-in {
      animation: row-fade-in-wave-g var(--motion-duration) var(--motion-ease);
    }

    /* 2. Sort column click → row reorder (sort-pulse: a brief flash
       along the tbody confirming the reshuffle landed). The DOM
       reorder itself is instantaneous, but the eye needs a cue. */
    @keyframes sort-pulse-wave-g {
      0%   { background: transparent; }
      18%  { background: rgba(37, 99, 235, 0.06); }
      100% { background: transparent; }
    }
    tbody.sort-pulse > tr.row > td {
      animation: sort-pulse-wave-g var(--motion-duration) var(--motion-ease);
    }
    body.dark tbody.sort-pulse > tr.row > td {
      animation-name: sort-pulse-wave-g-dark;
    }
    @keyframes sort-pulse-wave-g-dark {
      0%   { background: transparent; }
      18%  { background: rgba(96, 165, 250, 0.10); }
      100% { background: transparent; }
    }

    /* 3. Expand-row reveal — keep existing 180ms keyframe but tween
       the height/opacity over 250ms with the standard ease so the
       inner block doesn't pop. The existing row-expand-in keyframe
       on .detail-block stays as-is for backward compat; this layer
       adds the smoother motion on the .detail-row itself. */
    tr.detail-row .detail-block {
      animation-duration: var(--motion-duration);
      animation-timing-function: var(--motion-ease);
    }

    /* 4. Status pill click → popover open/close. The pill's
       background-color transition was already 200ms ease — bump it
       to 250ms standard ease for consistency. Popover gets a fade
       + scale-in via the .is-open class. */
    .status-pill {
      transition: background-color var(--motion-duration) var(--motion-ease),
                  color var(--motion-duration) var(--motion-ease),
                  border-color var(--motion-duration) var(--motion-ease),
                  box-shadow var(--motion-duration-fast) var(--motion-ease);
    }
    @keyframes popover-open-wave-g {
      from { opacity: 0; transform: translateY(-4px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    #status-popover.is-open,
    #email-popover.is-open {
      animation: popover-open-wave-g var(--motion-duration-fast) var(--motion-ease);
      transform-origin: top center;
    }

    /* 5. Bulk-select checkbox → row highlight. The existing rule
       sets background to var(--blue-bg) instantly; layer a 250ms
       transition so the highlight breathes in/out. */
    tr.row > td {
      transition: background-color var(--motion-duration) var(--motion-ease);
    }
    /* Hover background stays snappier (existing 100ms feel) so the
       cursor doesn't drag a comet trail; only bulk-select gets the
       longer highlight tween. */
    tr.row:hover > td {
      transition-duration: 100ms;
    }
  }
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>

<!-- Hamburger toggle (mobile only) and overlay backdrop for the
     persistent left sidebar. Hidden on desktop via CSS. -->
<button type="button" class="sidebar-toggle" id="sidebar-toggle-btn"
  onclick="toggleSidebar()" aria-label="Open navigation menu" aria-expanded="false"
  aria-controls="sidebar">☰</button>
<div class="sidebar-backdrop" id="sidebar-backdrop"
  onclick="closeSidebar()" aria-hidden="true"></div>

<div class="app-shell">

  <!-- Persistent left sidebar nav (Phase 7 Item 4).
       Sections jump to anchors and highlight as the user scrolls
       (IntersectionObserver). Cmd-K remains the primary nav for
       power users; this rail is for spatial orientation. -->
  <aside class="sidebar" id="sidebar" aria-label="Primary navigation">
    <div class="sidebar-brand">
      <span class="sidebar-favicon" aria-hidden="true">⚡</span>
      <span class="sidebar-brand-name">Career-Ops</span>
    </div>
    <nav class="sidebar-nav" aria-label="Sections">
      <a href="#overview-section" class="sidebar-link" data-section="overview-section" title="Overview">
        <span class="sidebar-icon" aria-hidden="true">📊</span><span class="sidebar-label">Overview</span>
      </a>
      <a href="#apply-now-section" class="sidebar-link" data-section="apply-now-section" title="Apply-Now Queue">
        <span class="sidebar-icon" aria-hidden="true">🎯</span><span class="sidebar-label">Apply-Now</span>
      </a>
      <a href="#all-evaluations-section" class="sidebar-link" data-section="all-evaluations-section" title="All Evaluations">
        <span class="sidebar-icon" aria-hidden="true">📋</span><span class="sidebar-label">All Evaluations</span>
      </a>
      <a href="#trends-panel" class="sidebar-link" data-section="trends-panel" title="Trends + Analytics">
        <span class="sidebar-icon" aria-hidden="true">📈</span><span class="sidebar-label">Trends</span>
      </a>
      <a href="#companies-panel" class="sidebar-link" data-section="companies-panel" title="Companies">
        <span class="sidebar-icon" aria-hidden="true">🏢</span><span class="sidebar-label">Companies</span>
      </a>
      <button type="button" class="sidebar-link" onclick="openMobileSettingsSheet();closeSidebar();" title="Settings">
        <span class="sidebar-icon" aria-hidden="true">⚙️</span><span class="sidebar-label">Settings</span>
      </button>
    </nav>
    <div id="sidebar-batch" class="sidebar-batch" style="display:none" aria-label="Batch progress" aria-live="polite">
      <div class="sidebar-batch-header"><span id="sidebar-batch-title">⚡ Batch</span></div>
      <div class="sidebar-batch-bar"><div class="sidebar-batch-fill" id="sidebar-batch-bar-fill" style="width:0%"></div></div>
      <div class="sidebar-batch-stats" id="sidebar-batch-stats"></div>
    </div>
    <div class="sidebar-footer">
      <button type="button" class="sidebar-collapse-btn" id="sidebar-collapse-btn" onclick="toggleSidebarCollapse()" aria-label="Collapse sidebar" title="Collapse sidebar (⌘\\)">
        <svg class="sidebar-collapse-icon" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="sidebar-collapse-label">Collapse</span>
      </button>
      <!-- Mini-ticker removed 2026-05-10: same scan activity already lives in
           the mission-control strip at the top of the page (#live-text).
           Sidebar duplicate added clutter without new info. -->
      <div class="sidebar-version" title="Career-Ops version">v${escape(appVersion || '?')}</div>
    </div>
  </aside>

  <div class="app-main">
  <div class="container">

  <header class="toolbar" role="banner">
    <button class="toolbar-btn sidebar-hamburger" onclick="toggleSidebar()" id="sidebar-hamburger-btn" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false" title="Open navigation">☰</button>
    <h1 class="sr-only">Career-Ops Dashboard</h1>
    <button class="toolbar-btn cmdk-trigger" onclick="openCmdK()" title="Open command palette (⌘K / Ctrl-K)" aria-label="Open command palette (Cmd+K or Ctrl+K)">
      <span class="cmdk-trigger-label">Search…</span>
      <span class="cmdk-trigger-kbd">⌘K</span>
    </button>
    <button class="toolbar-btn quickadd-btn" onclick="openQuickAdd()" id="quickadd-btn" title="Add a role URL to the pipeline" aria-label="Add role to pipeline">+ Add role</button>
    <button class="toolbar-btn toolbar-overflow-btn" onclick="openMobileSettingsSheet()" id="toolbar-overflow-btn" aria-label="More options" title="More options">···</button>
    <button class="toolbar-btn" onclick="toggleDark()" id="dark-toggle" aria-label="Toggle dark mode">☀︎ Light</button>
  </header>

  <!-- Mission-control hero strip (Phase 7 Item 1): live ticker + batch + health -->
  <div class="mc-strip" role="status" aria-label="Mission-control telemetry strip">
    <div class="live-ticker" id="live-ticker" aria-live="polite" aria-label="Most recent scanner activity" tabindex="0" title="Click to expand on mobile">
      <span class="live-dot" id="live-dot" aria-hidden="true"></span>
      <span class="live-text" id="live-text">—</span>
    </div>
    <div class="mc-batch" id="mc-batch" data-state="idle" aria-label="Batch progress" title="Batch progress">
      <span class="mc-batch-dot" aria-hidden="true"></span>
      <span class="mc-batch-text" id="mc-batch-text">No batch running</span>
    </div>
    <div class="mc-health pill-popover-trigger" id="mc-health" data-status="healthy" aria-label="System health — click to expand" title="Click for full health detail (batch · scans · pipeline · errors)" role="button" tabindex="0" onclick="openHealthPopover(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openHealthPopover(this)}">
      <span class="mc-health-dot" aria-hidden="true"></span>
      <span class="mc-health-text" id="mc-health-text">all healthy</span>
    </div>
  </div>

  <div class="subtle" id="dashboard-meta" title="${escape(generated)}"><span id="live-updated">Updated ${escape(generated)}</span> · ${reportsToday} reports today</div>

  <main id="main">


  <!-- Cmd-K command palette -->
  <div id="cmdk-backdrop" role="dialog" aria-modal="true" aria-label="Command palette" onclick="closeCmdK()">
    <div id="cmdk-modal" onclick="event.stopPropagation()">
      <div class="cmdk-input-wrap">
        <span class="cmdk-input-icon">⌕</span>
        <input id="cmdk-input" type="text" placeholder="Jump to row, run an action, open a recent report…" autocomplete="off" spellcheck="false" />
        <span class="cmdk-input-hint">esc to close</span>
      </div>
      <div id="cmdk-list" role="listbox" aria-label="Command palette results"></div>
      <div class="cmdk-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> select</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  </div>

  <!-- Gap addressing modal -->
  <div id="gap-backdrop" onclick="closeGapModal()">
    <div id="gap-modal" onclick="event.stopPropagation()">
      <div class="gap-modal-header">
        <span class="gap-modal-badge">⚠ Gap</span>
        <div class="gap-modal-title" id="gap-modal-title"></div>
        <button class="verify-close" onclick="closeGapModal()">✕</button>
      </div>
      <div class="gap-modal-body" id="gap-modal-body"></div>
    </div>
  </div>

  <!-- Quick-add role modal -->
  <div id="quickadd-backdrop" onclick="closeQuickAdd()" role="dialog" aria-modal="true" aria-labelledby="quickadd-title">
    <div id="quickadd-modal" onclick="event.stopPropagation()">
      <div class="quickadd-header">
        <div class="quickadd-title" id="quickadd-title">Add role to pipeline</div>
        <button class="verify-close" onclick="closeQuickAdd()" aria-label="Close">✕</button>
      </div>
      <div class="quickadd-body">
        <form id="quickadd-form" onsubmit="submitQuickAdd(event); return false;">
          <input id="quickadd-url" type="text" placeholder="Paste role URL or search term" autocomplete="off" spellcheck="false" required />
          <p class="quickadd-hint">Appends to <code>data/pipeline.md</code> with today's date. Auto-detects ATS pattern (Greenhouse / Ashby / Lever / Workday / LinkedIn). Skips duplicates already in scan history.</p>
          <div class="quickadd-actions">
            <button type="button" class="toolbar-btn" onclick="closeQuickAdd()">Cancel</button>
            <button type="submit" class="toolbar-btn quickadd-submit" id="quickadd-submit-btn">Add to pipeline</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Tier-legend modal -->
  <div id="tier-legend-backdrop" onclick="closeTierLegend()" role="dialog" aria-modal="true" aria-labelledby="tier-legend-title">
    <div id="tier-legend-modal" onclick="event.stopPropagation()">
      <div class="tier-legend-header">
        <div class="tier-legend-title" id="tier-legend-title">Tier badges</div>
        <button class="verify-close" onclick="closeTierLegend()" aria-label="Close">✕</button>
      </div>
      <div class="tier-legend-body" id="tier-legend-body"></div>
    </div>
  </div>

  <!-- Equity-legend modal -->
  <div id="equity-legend-backdrop" onclick="closeEquityLegend()" role="dialog" aria-modal="true" aria-labelledby="equity-legend-title">
    <div id="equity-legend-modal" onclick="event.stopPropagation()">
      <div class="tier-legend-header">
        <div class="tier-legend-title" id="equity-legend-title">Equity / IPO posture</div>
        <button class="verify-close" onclick="closeEquityLegend()" aria-label="Close">✕</button>
      </div>
      <div class="tier-legend-body">
        <p style="font-size:12.5px;line-height:1.55;color:var(--text-2);margin:0 0 10px">Mitchell's primary filter: total comp + pre-IPO equity timing + RSU value-at-vest. Source: <code>data/overpay-signals/CURRENT.md</code> (refreshed weekly).</p>
        <ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px;font-size:12.5px">
          <li><span class="equity-badge eq-late">🟢 Pre-IPO Late</span> — late-stage / pre-IPO / Series E+. Highest-upside zone.</li>
          <li><span class="equity-badge eq-cd">🟢 Pre-IPO C/D</span> — Series C or D. Maturing but pre-liquidity.</li>
          <li><span class="equity-badge eq-b">🟡 Pre-IPO B</span> — Series B. Early but viable; longer runway to exit.</li>
          <li><span class="equity-badge eq-seed">🟣 Pre-IPO Seed/A</span> — very early; high variance, lottery-ticket equity.</li>
          <li><span class="equity-badge eq-public">🔵 Public</span> — listed; mature RSU, predictable but capped upside.</li>
          <li><span class="equity-badge eq-unknown">⚪ Unknown</span> — signal entry exists but stage not classifiable.</li>
          <li><span class="equity-badge equity-badge-empty">—</span> — no entry in CURRENT.md (yet).</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Toast container -->
  <div id="toast-container" aria-live="polite" aria-atomic="false"></div>

  <!-- Mobile bottom sheet (slide-up drawer) for row detail on <720px -->
  <div id="mobile-sheet-backdrop" onclick="closeMobileSheet()" role="dialog" aria-modal="true" aria-labelledby="mobile-sheet-title" aria-hidden="true">
    <div id="mobile-sheet" onclick="event.stopPropagation()">
      <div class="mobile-sheet-handle-grip" id="mobile-sheet-handle-grip" aria-hidden="true">
        <div class="mobile-sheet-handle"></div>
      </div>
      <div class="mobile-sheet-header">
        <div class="mobile-sheet-title" id="mobile-sheet-title"></div>
        <button class="mobile-sheet-close" onclick="closeMobileSheet()" aria-label="Close">✕</button>
      </div>
      <div class="mobile-sheet-body" id="mobile-sheet-body"></div>
    </div>
  </div>

  <!-- Right-rail context drawer (desktop ≥1280, full-overlay 720–1280).
       Replaces inline expand-row pattern; mobile keeps bottom-sheet. -->
  <div id="right-rail-backdrop" onclick="closeRightRail()" aria-hidden="true"></div>
  <aside id="right-rail-drawer" role="complementary" aria-label="Row context drawer" aria-hidden="true">
    <div class="drawer-header" id="right-rail-header"></div>
    <div class="drawer-body" id="right-rail-body"></div>
    <div class="drawer-action-bar" id="right-rail-actions"></div>
  </aside>

  <!-- Pull-to-refresh indicator (mobile only, JS-driven) -->
  <div id="pull-to-refresh" role="status" aria-live="polite" aria-hidden="true">
    <span class="ptr-icon" aria-hidden="true"></span>
    <span class="ptr-label" id="ptr-label">Pull to refresh</span>
  </div>

  <!-- Mobile bottom tab bar (Apply-Now / All / Charts / Settings).
       Hidden on desktop via CSS. Tabs scroll the corresponding section
       into view; "Settings" reuses the mobile-sheet to expose the
       theme toggle, demo mode, and command palette without needing the
       cramped top toolbar on small screens. -->
  <nav id="mobile-tabbar" role="tablist" aria-label="Sections">
    <button type="button" class="mobile-tab" role="tab" aria-selected="true" data-tab-target="apply-now-section" aria-controls="apply-now-section" onclick="switchMobileTab('apply-now-section', this)">
      <span class="tab-icon" aria-hidden="true">⚡</span><span class="tab-label">Apply</span>
    </button>
    <button type="button" class="mobile-tab" role="tab" aria-selected="false" data-tab-target="all-evaluations-section" aria-controls="all-evaluations-section" onclick="switchMobileTab('all-evaluations-section', this)">
      <span class="tab-icon" aria-hidden="true">≡</span><span class="tab-label">All</span>
    </button>
    <button type="button" class="mobile-tab" role="tab" aria-selected="false" data-tab-target="charts-section" aria-controls="charts-section" onclick="switchMobileTab('charts-section', this)">
      <span class="tab-icon" aria-hidden="true">▦</span><span class="tab-label">Charts</span>
    </button>
    <button type="button" class="mobile-tab" role="tab" aria-selected="false" data-tab-target="__settings__" aria-controls="mobile-sheet" onclick="openMobileSettingsSheet(this)">
      <span class="tab-icon" aria-hidden="true">⚙︎</span><span class="tab-label">Settings</span>
    </button>
  </nav>

  <!-- Inline status writeback popover -->
  <div id="status-popover" role="menu" aria-label="Set status"></div>

  <!-- Inline email template launcher popover -->
  <div id="email-popover" role="menu" aria-label="Pick an email template"></div>

  <!-- Shared cell-popover (Equity / Base / Location) -->
  <div id="pill-popover" role="dialog" aria-label="Cell detail" aria-hidden="true"></div>

  <!-- Bulk action bar (visible only when ≥1 row selected) -->
  <div id="bulk-action-bar" role="region" aria-label="Bulk actions" hidden>
    <div class="bulk-bar-inner">
      <span class="bulk-bar-count" aria-live="polite"><strong id="bulk-count">0</strong> selected</span>
      <button type="button" class="bulk-btn bulk-btn-primary" onclick="bulkApply('Applied')" aria-label="Mark selected rows as Applied">Mark Applied</button>
      <button type="button" class="bulk-btn" onclick="bulkApply('SKIP')" aria-label="Mark selected rows as SKIP">Mark Skip</button>
      <button type="button" class="bulk-btn bulk-btn-ghost" onclick="bulkClearSelection()" aria-label="Clear selection">Clear</button>
    </div>
  </div>

  <!-- Verify claims modal -->
  <div id="verify-backdrop" onclick="closeVerify()">
    <div id="verify-modal" onclick="event.stopPropagation()">
      <div class="verify-header">
        <div class="verify-title" id="verify-title">Verify claims</div>
        <button class="verify-close" onclick="closeVerify()">✕</button>
      </div>
      <div class="verify-body" id="verify-body"></div>
    </div>
  </div>

  <div class="stats" id="overview-section">
    <div class="stats-hero-row">
      <div class="stat-hero-balance ${applyNow.length > 0 ? 'stat-strong' : ''}" onclick="document.getElementById('apply-now-section').scrollIntoView({behavior:'smooth'})" title="Click to scroll to Apply-Now queue" role="button" tabindex="0">
        <div class="hero-sparkline-bg" aria-hidden="true">${heroSparklineSVG(kpiSpark.applyNow.daily, 'Apply-Now')}</div>
        <div class="hero-left">
          <div class="stat-label">Apply-Now Queue · score ≥ 4.0</div>
          <div class="stat-value" id="live-apply-now">${applyNow.length}</div>
        </div>
        <div class="hero-right">
          ${deltaPill(kpiSpark.applyNow.delta)}
        </div>
      </div>
    </div>
    <div class="stats-bento">
      <div class="stat stat-hero" onclick="toggleStatPanel('evaluations')" title="Click to see all evaluations">
        <div class="stat-label">Total evaluations</div>
        <div class="stat-value" id="live-total">${total}</div>
        <div class="stat-trend">${deltaIndicator(kpiSpark.total.delta)}${sparklineSVG(kpiSpark.total.daily, 'var(--text-3)', 'Total evaluations')}</div>
        <span class="stat-caret" aria-hidden="true">▾</span><span class="sr-only">Click to expand</span>
      </div>
      <div class="stat stat-cell" onclick="toggleStatPanel('pending')" title="Click to see pipeline">
        <div class="stat-label"><span class="label-full">Pipeline pending</span><span class="label-short">Pending</span></div>
        <div class="stat-value" id="live-pipeline">${pipelinePending}</div>
        <div class="stat-trend"><span class="stat-delta stat-delta-flat" title="Snapshot — pipeline depth has no daily history">— snapshot</span></div>
        <span class="stat-caret" aria-hidden="true">▾</span><span class="sr-only">Click to expand</span>
      </div>
      <div class="stat stat-cell" onclick="toggleStatPanel('companies')" title="Click to see all tracked companies">
        <div class="stat-label"><span class="label-full">Companies tracked</span><span class="label-short">Companies</span></div>
        <div class="stat-value">${portals.tracked}</div>
        <span class="stat-caret" aria-hidden="true">▾</span><span class="sr-only">Click to expand</span>
      </div>
      <div class="stat stat-cell" onclick="toggleStatPanel('scanned')" title="Click to see scan activity">
        <div class="stat-label"><span class="label-full">URLs scanned</span><span class="label-short">Scanned</span></div>
        <div class="stat-value" id="live-scanned">${scanTotal}</div>
        <span class="stat-caret" aria-hidden="true">▾</span><span class="sr-only">Click to expand</span>
      </div>
      <div class="stat stat-cell" onclick="toggleStatPanel('batches')" title="Click to see batch run history">
        <div class="stat-label"><span class="label-full">Batches run</span><span class="label-short">Batches</span></div>
        <div class="stat-value" id="live-batches">${batchRuns}</div>
        <span class="stat-caret" aria-hidden="true">▾</span><span class="sr-only">Click to expand</span>
      </div>
      <div class="stat stat-cell" onclick="toggleStatPanel('applied')" title="Click to see in-flight applications">
        <div class="stat-label"><span class="label-full">Applied / In process</span><span class="label-short">Applied</span></div>
        <div class="stat-value" id="live-applied">${applied.length}</div>
        <div class="stat-trend">${deltaIndicator(kpiSpark.applied.delta)}${sparklineSVG(kpiSpark.applied.daily, 'var(--text-3)', 'Applied / In process')}</div>
        <span class="stat-caret" aria-hidden="true">▾</span><span class="sr-only">Click to expand</span>
      </div>
    </div>
  </div>

  <!-- Expandable stat panels (loaded live from /api/detail/*) -->
  <div class="stat-panel" id="stat-panel-evaluations"></div>
  <div class="stat-panel" id="stat-panel-applied"></div>
  <div class="stat-panel" id="stat-panel-pending"></div>
  <div class="stat-panel" id="stat-panel-companies"></div>
  <div class="stat-panel" id="stat-panel-scanned"></div>
  <div class="stat-panel" id="stat-panel-batches"></div>

  ${applyNow.length > 0 ? `
  <div class="panel panel-strong" id="apply-now-section">
    <div class="panel-title collapsible" onclick="togglePanel('apply-now-section',event)">Apply-Now Queue <span class="pill">${applyNow.length}</span>
      <button type="button" id="apply-now-reset-order" class="reset-order-btn" hidden
        onclick="event.stopPropagation();resetApplyNowOrder()" aria-label="Reset to default sort (score desc, then date)">
        ↺ Reset order
      </button>
      <span class="panel-chevron">▾</span>
    </div>
    <p class="panel-subtitle" title="Drag a row's ⋮⋮ handle to prioritize. Click any row to expand.">Score ≥ 4.0 · Evaluated / Responded / Interview only</p>
    <div class="table-scroll"><table>
      <thead><tr>
        <th class="bulk-th"><input type="checkbox" class="bulk-header-checkbox" data-tbody="apply-now-tbody" aria-label="Select all visible rows in Apply-Now" onclick="handleHeaderCheckbox(this)"></th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 1, 'num', this, event)">Score</th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 2, 'num', this, event)" title="Lower-bound base salary parsed from Block A Comp row">Base</th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 3, 'str', this, event)">Company <button type="button" class="tier-legend-btn" title="Tier badge legend" aria-label="Show tier badge legend" onclick="event.stopPropagation();openTierLegend()">?</button></th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 4, 'str', this, event)">Role</th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 5, 'str', this, event)">Status</th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 6, 'str', this, event)">Equity <button type="button" class="tier-legend-btn" title="Equity stage legend" aria-label="Show equity stage legend" onclick="event.stopPropagation();openEquityLegend()">?</button></th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 7, 'str', this, event)" title="Location / remote posture parsed from Block A">Location</th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 8, 'num', this, event)" title="Team-toxicity grade (1=healthy → 5=avoid). Click any chip for full benefits + sentiment breakdown.">Benefits</th>
        <th onclick="event.stopPropagation()" title="Recruiter + hiring-manager LinkedIn lookups">People</th>
        <th class="sortable mobile-hide" onclick="sortTable('apply-now-tbody', 10, 'str', this, event)">Eval Date</th>
        <th class="sortable" onclick="sortTable('apply-now-tbody', 11, 'num', this, event)">Age</th>
        <th>Action</th>
      </tr></thead>
      <tbody id="apply-now-tbody">
        ${applyNowRows}
      </tbody>
    </table></div>
  </div>
  ` : `
  <div class="panel" id="apply-now-section">
    <div class="panel-title collapsible" onclick="togglePanel('apply-now-section',event)">Apply-Now Queue <span class="panel-chevron">▾</span></div>
    <p style="color:#57606a;font-size:13px">No evaluations meeting the 4.0 apply floor right now. Either today's batch was wrong-shape (review highest-scored discards below) or the batch hasn't completed yet.</p>
  </div>
  `}

  <div class="panel" id="all-evaluations-section">
    <div class="panel-title collapsible" onclick="togglePanel('all-evaluations-section',event)">All Evaluations <span class="pill" style="background:#0969da">${total}</span> <span class="panel-chevron">▾</span></div>
    <div class="filters filters-sticky" role="search">
      <div class="saved-views-row" aria-label="Saved filter views">
        <span class="saved-views-label">Saved views</span>
        <div id="saved-views-chips" class="saved-views-chips" role="list"></div>
        <button type="button" id="saved-view-save-btn" class="saved-view-btn"
          onclick="openSaveViewPrompt()" aria-label="Save current filters as a named view">
          + Save current view
        </button>
      </div>
      <div id="saved-view-prompt" class="saved-view-prompt" hidden>
        <input type="text" id="saved-view-name" maxlength="30"
          placeholder="View name (max 30 chars, letters/numbers/spaces)"
          aria-label="Saved view name"
          onkeydown="if(event.key==='Enter'){event.preventDefault();confirmSaveView();}else if(event.key==='Escape'){event.preventDefault();cancelSaveView();}">
        <button type="button" class="saved-view-btn primary" onclick="confirmSaveView()">Save</button>
        <button type="button" class="saved-view-btn" onclick="cancelSaveView()">Cancel</button>
        <span id="saved-view-error" class="saved-view-error" aria-live="polite"></span>
      </div>
      <div class="filters-row">
        <input type="search" id="filter-text" placeholder="Search company, role, gaps, stories, recommendation…"
          aria-label="Search evaluations by company, role, gaps, stories, or recommendation" oninput="applyFilters()">
        <select id="filter-tier" aria-label="Filter by archetype tier" onchange="applyFilters()">
          <option value="">All tiers</option>
          <option value="A1">A1 — Residency</option>
          <option value="A2">A2 — AI Builder</option>
          <option value="B">B — Comms / Editorial</option>
        </select>
        <select id="filter-score" aria-label="Filter by minimum score" onchange="applyFilters()">
          <option value="">All scores</option>
          <option value="4.5">≥ 4.5 only</option>
          <option value="4">≥ 4.0 only</option>
          <option value="3">≥ 3.0 only</option>
          <option value="2">≥ 2.0 only</option>
        </select>
        <select id="filter-status" aria-label="Filter by application status" onchange="applyFilters()">
          <option value="">All statuses</option>
          <option value="evaluated">Evaluated (no action)</option>
          <option value="applied">Applied</option>
          <option value="interview">Interview</option>
          <option value="discarded">Discarded</option>
          <option value="rejected">Rejected</option>
        </select>
        <select id="filter-equity" aria-label="Filter by equity / IPO stage" onchange="applyFilters()">
          <option value="">All equity stages</option>
          <option value="late">🟢 Pre-IPO Late</option>
          <option value="cd">🟢 Pre-IPO C/D</option>
          <option value="b">🟡 Pre-IPO B</option>
          <option value="seed-a">🟣 Pre-IPO Seed/A</option>
          <option value="public">🔵 Public</option>
          <option value="unknown">⚪ Unknown</option>
        </select>
      </div>
    </div>
    <div class="table-scroll"><table>
      <thead><tr>
        <th class="bulk-th"><input type="checkbox" class="bulk-header-checkbox" data-tbody="all-tbody" aria-label="Select all visible rows in All Evaluations" onclick="handleHeaderCheckbox(this)"></th>
        <th class="sortable" onclick="sortTable('all-tbody', 1, 'num', this, event)">Score</th>
        <th class="sortable" onclick="sortTable('all-tbody', 2, 'num', this, event)" title="Lower-bound base salary parsed from Block A Comp row">Base</th>
        <th class="sortable" onclick="sortTable('all-tbody', 3, 'str', this, event)">Company <button type="button" class="tier-legend-btn" title="Tier badge legend" aria-label="Show tier badge legend" onclick="event.stopPropagation();openTierLegend()">?</button></th>
        <th class="sortable" onclick="sortTable('all-tbody', 4, 'str', this, event)">Role</th>
        <th class="sortable" onclick="sortTable('all-tbody', 5, 'str', this, event)">Status</th>
        <th class="sortable" onclick="sortTable('all-tbody', 6, 'str', this, event)">Equity <button type="button" class="tier-legend-btn" title="Equity stage legend" aria-label="Show equity stage legend" onclick="event.stopPropagation();openEquityLegend()">?</button></th>
        <th class="sortable" onclick="sortTable('all-tbody', 7, 'str', this, event)" title="Location / remote posture parsed from Block A">Location</th>
        <th class="sortable" onclick="sortTable('all-tbody', 8, 'num', this, event)" title="Team-toxicity grade (1=healthy → 5=avoid). Click any chip for full benefits breakdown.">Benefits</th>
        <th onclick="event.stopPropagation()" title="Recruiter + hiring-manager LinkedIn lookups">People</th>
        <th class="sortable mobile-hide" onclick="sortTable('all-tbody', 10, 'str', this, event)">Eval Date</th>
        <th class="sortable" onclick="sortTable('all-tbody', 11, 'num', this, event)">Age</th>
        <th>Action</th>
      </tr></thead>
      <tbody id="all-tbody">
        ${allRows}
      </tbody>
    </table></div>
  </div>

  <div class="charts-grid" id="charts-section">
  <div class="panel" id="score-dist-panel">
    <div class="panel-title collapsible" onclick="togglePanel('score-dist-panel',event)">Score Distribution <span class="panel-chevron">▾</span></div>
    ${(() => {
      const segDefs = [
        { range: '4.0+',     label: 'Strong',   key: '4.0+',     cls: 's-strong'   },
        { range: '3.0–3.9',  label: 'Good',     key: '3.0-3.9',  cls: 's-good'     },
        { range: '2.0–2.9',  label: 'Moderate', key: '2.0-2.9',  cls: 's-moderate' },
        { range: '1.0–1.9',  label: 'Weak',     key: '1.0-1.9',  cls: 's-weak'     },
        { range: '0–0.9',    label: 'No fit',   key: '0-0.9',    cls: 's-none'     },
      ];
      const totals = segDefs.map(s => buckets[s.key] || 0);
      const totalAll = totals.reduce((a, b) => a + b, 0) || 1;
      return `<div class="seg-bar" role="group" aria-label="Score distribution across ${totalAll} evaluation${totalAll === 1 ? '' : 's'}">
        <div class="seg-bar-counts" aria-hidden="true">
          ${segDefs.map((s, i) => `<div class="seg-bar-count${totals[i] === 0 ? ' zero' : ''}">${totals[i]}</div>`).join('')}
        </div>
        <div class="seg-bar-track">
          ${segDefs.map((s, i) => {
            const pct = ((totals[i]/totalAll)*100).toFixed(0);
            const label = `${s.label.toUpperCase()}: ${totals[i]} evaluation${totals[i] === 1 ? '' : 's'} at ${s.range} (${pct}%)`;
            return `<div class="seg-bar-segment ${s.cls}${totals[i] === 0 ? ' zero' : ''}" style="flex-grow:${totals[i]}" role="img" aria-label="${label}" title="${s.label} (${s.range}): ${totals[i]} (${pct}%)"></div>`;
          }).join('')}
        </div>
        <div class="seg-bar-labels" aria-hidden="true">
          ${segDefs.map(s => `<div class="seg-bar-label">${s.label}<span class="seg-bar-range">${s.range}</span></div>`).join('')}
        </div>
      </div>`;
    })()}
  </div>

  <div class="panel" id="companies-panel">
    <div class="panel-title collapsible" onclick="togglePanel('companies-panel',event)">Top Companies (by evaluation count) <span class="panel-chevron">▾</span></div>
    <div class="bar-chart" role="list" aria-label="Top companies by evaluation count">
      ${topCompanies.map(([company, count]) => {
        const max = topCompanies[0][1];
        const pct = (count / max) * 100;
        return `
        <div class="bar-row" role="listitem" aria-label="${escape(company)}: ${count} evaluation${count === 1 ? '' : 's'}">
          <div class="bar-row-label">${escape(company)}</div>
          <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
          <div class="bar-row-count" aria-hidden="true">${count}</div>
        </div>`;
      }).join('')}
    </div>
  </div>
  </div>

  <div class="panel" id="trends-panel">
    <div class="panel-title collapsible" onclick="togglePanel('trends-panel',event)">Trends <span class="panel-chevron">▾</span></div>
    ${(() => {
      const W = 280, H = 80, PAD = 4;
      const counts = trendWeeks.map(w => w.count);
      const maxCount = Math.max(1, ...counts);
      const barW = (W - PAD * 2) / 12;

      // Apps per week — bar chart
      const barsSvg = trendWeeks.map((wk, i) => {
        const h = (wk.count / maxCount) * (H - PAD * 2 - 12);
        const x = PAD + i * barW + 1;
        const y = H - PAD - h;
        return `<rect class="trend-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>Week of ${wk.label}: ${wk.count} app${wk.count === 1 ? '' : 's'}</title></rect>`;
      }).join('');

      // Avg score per week — line chart
      const avgs = trendWeeks.map(w => w.scoreCount > 0 ? w.scoreSum / w.scoreCount : 0);
      const yScore = (v) => {
        const top = PAD + 4, bot = H - PAD - 4;
        return bot - (v / 5) * (bot - top);
      };
      const xScore = (i) => PAD + barW * i + barW / 2;
      const linePath = avgs.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScore(i).toFixed(1)},${yScore(v).toFixed(1)}`).join(' ');
      const dots = avgs.map((v, i) => {
        const wk = trendWeeks[i];
        const tip = wk.scoreCount > 0
          ? `Week of ${wk.label}: avg ${v.toFixed(2)}/5 (${wk.scoreCount} eval${wk.scoreCount === 1 ? '' : 's'})`
          : `Week of ${wk.label}: no evaluations`;
        return `<circle class="trend-dot${wk.scoreCount === 0 ? ' empty' : ''}" cx="${xScore(i).toFixed(1)}" cy="${yScore(v).toFixed(1)}" r="2.4"><title>${tip}</title></circle>`;
      }).join('');

      // Funnel — horizontal stacked bar
      const FW = 280, FH = 36;
      const funnelTotal = funnelOrder.reduce((a, s) => a + funnel[s.key], 0) || 1;
      let cursor = 0;
      const funnelSegs = funnelOrder.map(s => {
        const v = funnel[s.key];
        const w = (v / funnelTotal) * FW;
        const seg = `<rect class="trend-fn ${s.cls}" x="${cursor.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${FH}"><title>${s.key}: ${v} (${((v / funnelTotal) * 100).toFixed(0)}%)</title></rect>`;
        cursor += w;
        return seg;
      }).join('');
      const funnelLegend = funnelOrder.map(s => `<span class="trend-legend-item"><span class="trend-legend-swatch ${s.cls}"></span>${s.key} <strong>${funnel[s.key]}</strong></span>`).join('');

      return `<div class="trends-grid">
        <div class="trend-card">
          <div class="trend-card-title">Apps / week <span class="trend-card-sub">last 12w · ${counts.reduce((a, b) => a + b, 0)} total</span></div>
          <svg class="trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Applications per week, last 12 weeks">${barsSvg}</svg>
        </div>
        <div class="trend-card">
          <div class="trend-card-title">Avg score / week <span class="trend-card-sub">last 12w · 0–5 scale</span></div>
          <svg class="trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average score per week, last 12 weeks">
            <line x1="${PAD}" y1="${yScore(4).toFixed(1)}" x2="${W - PAD}" y2="${yScore(4).toFixed(1)}" class="trend-axis"/>
            <path d="${linePath}" class="trend-line" fill="none"/>
            ${dots}
          </svg>
        </div>
        <div class="trend-card trend-card-wide">
          <div class="trend-card-title">Pipeline funnel <span class="trend-card-sub">${funnelTotal} tracked</span></div>
          <svg class="trend-svg trend-svg-funnel" viewBox="0 0 ${FW} ${FH}" role="img" aria-label="Pipeline funnel by stage">${funnelSegs}</svg>
          <div class="trend-legend">${funnelLegend}</div>
        </div>
      </div>`;
    })()}
  </div>
  ${renderCompAnalytics(compAnalytics, compFloors)}

  </main>
  </div><!-- /.app-main -->
</div><!-- /.app-shell -->

<script>
// ── Collapsible panels ──────────────────────────────────────────
function togglePanel(id, event) {
  if (event && event.target && event.target !== event.currentTarget) {
    const tgt = event.target;
    if (tgt.closest('button,input,a,select,textarea')) return;
  }
  const el = document.getElementById(id);
  if (!el) return;
  const collapsed = el.classList.toggle('panel-collapsed');
  const chevron = el.querySelector('.panel-title .panel-chevron');
  if (chevron) chevron.textContent = collapsed ? '▸' : '▾';
  try { sessionStorage.setItem('panel-' + id, collapsed ? '1' : '0'); } catch(_) {}
}
window.togglePanel = togglePanel;
function initPanelCollapse() {
  const panels = document.querySelectorAll('[id]');
  for (const el of panels) {
    let val;
    try { val = sessionStorage.getItem('panel-' + el.id); } catch(_) {}
    if (val === '1' && el.querySelector('.panel-title.collapsible')) {
      el.classList.add('panel-collapsed');
      const chevron = el.querySelector('.panel-title .panel-chevron');
      if (chevron) chevron.textContent = '▸';
    }
  }
}
document.addEventListener('DOMContentLoaded', initPanelCollapse);

// ── Dark mode ───────────────────────────────────────────────────
const DARK_KEY = 'career-ops-dark';
function initDark() {
  // Default = dark. Only switch to light if the user has explicitly chosen it.
  // Mission-control / matrix vibe is the brand voice.
  const saved = localStorage.getItem(DARK_KEY);
  if (saved === 'light') applyDark(false);
  else applyDark(true);
}
function applyDark(on) {
  document.body.classList.toggle('dark', on);
  const btn = document.getElementById('dark-toggle');
  if (btn) btn.textContent = on ? '☀︎ Light' : '⏾ Dark';
}
function toggleDark() {
  const on = !document.body.classList.contains('dark');
  localStorage.setItem(DARK_KEY, on ? 'dark' : 'light');
  applyDark(on);
}

// ── Live scan ticker ────────────────────────────────────────────
// Rolls through the most recent scan events to prove the dashboard
// is live, not a static screenshot. Data is baked at build time
// (scan-history.tsv is generated by scan.mjs, no runtime polling).
const LIVE_TICKER_DATA = ${liveTickerJson};
function _liveAge(ms) {
  const s = Math.max(0, ms / 1000);
  if (s < 60)        return Math.round(s) + 's ago';
  if (s < 3600)      return Math.round(s / 60) + 'm ago';
  if (s < 86400)     return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}
function _liveFreshness(ageMs) {
  if (ageMs < 3600000)      return 'fresh';
  if (ageMs < 21600000)     return 'warm';
  return 'stale';
}
function _liveFormat(ev) {
  return 'Scanned ' + ev.company + ' · ' + ev.count + ' new role' + (ev.count === 1 ? '' : 's') + ' · ' + _liveAge(Date.now() - new Date(ev.ts).getTime());
}
function initLiveTicker() {
  const el = document.getElementById('live-ticker');
  const txt = document.getElementById('live-text');
  if (!el || !txt) return;
  const data = LIVE_TICKER_DATA || { events: [], lastScanIso: null };
  const events = data.events || [];
  if (!events.length) {
    el.setAttribute('data-empty', '1');
    el.setAttribute('data-freshness', 'stale');
    txt.textContent = 'No scans yet';
    return;
  }
  const setFreshness = () => {
    const lastTs = data.lastScanIso ? new Date(data.lastScanIso).getTime() : new Date(events[0].ts).getTime();
    el.setAttribute('data-freshness', _liveFreshness(Date.now() - lastTs));
    const lastDate = new Date(lastTs);
    const hhmm = lastDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' });
    el.setAttribute('title', 'Last scan: ' + hhmm + ' PT · click to expand');
  };
  setFreshness();
  // Mobile tap-to-expand
  el.addEventListener('click', () => el.classList.toggle('expanded'));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || events.length === 1) {
    txt.textContent = _liveFormat(events[0]);
    setInterval(() => { txt.textContent = _liveFormat(events[0]); setFreshness(); }, 30000);
    return;
  }
  let i = 0;
  txt.textContent = _liveFormat(events[0]);
  setInterval(() => {
    el.setAttribute('data-anim', 'out');
    setTimeout(() => {
      i = (i + 1) % events.length;
      txt.textContent = _liveFormat(events[i]);
      setFreshness();
      el.setAttribute('data-anim', 'in');
    }, 350);
  }, 4000);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLiveTicker);
} else {
  initLiveTicker();
}

// ── Wheel → horizontal-scroll on table hover ────────────────────────
// When the cursor is over a .table-scroll wrapper that has actual
// horizontal overflow (i.e. the table is wider than its container),
// translate vertical wheel motion into horizontal scrollLeft. Falls
// back to the page default vertical scroll when:
//   - the user holds shift (lets them still page-scroll over the table)
//   - the table has no horizontal overflow
//   - the wheel motion is already horizontal (trackpad swipe)
//   - the table has reached its left/right edge in the scroll direction
//     (so scrolling past the edge falls through to the page)
function initTableHorizontalScroll() {
  document.addEventListener('wheel', (e) => {
    if (e.shiftKey) return; // user explicitly wants page scroll
    const wrap = e.target.closest && e.target.closest('.table-scroll');
    if (!wrap) return;
    const canScrollX = wrap.scrollWidth > wrap.clientWidth + 1;
    if (!canScrollX) return;
    // Treat horizontal trackpad swipes as-is; only redirect VERTICAL wheel.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    // If the table has vertical overflow, let the browser scroll it
    // vertically — don't hijack the wheel for horizontal movement.
    if (wrap.scrollHeight > wrap.clientHeight + 1) return;
    const delta = e.deltaY;
    const atLeftEdge  = wrap.scrollLeft <= 0 && delta < 0;
    const atRightEdge = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 1 && delta > 0;
    if (atLeftEdge || atRightEdge) return; // let page scroll resume past the edge
    e.preventDefault();
    wrap.scrollLeft += delta;
  }, { passive: false });
  // Subtle visual cue: when the cursor is over a horizontally-scrollable
  // table, swap the cursor to the col-resize style on the leftmost column
  // (cells inherit). Only attaches if the table actually overflows.
  document.querySelectorAll('.table-scroll').forEach(wrap => {
    if (wrap.scrollWidth > wrap.clientWidth + 1) {
      wrap.dataset.canScrollX = '1';
    }
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTableHorizontalScroll);
} else {
  initTableHorizontalScroll();
}

// ── Mission-control hero strip (Phase 7 Item 1) ─────────────────
// Build-seeded snapshot of batch + system health. Refreshed live
// from /api/batch-live every 30s when the dashboard server is up;
// in static-file mode the seed values are what the user sees.
const MC_STRIP_DATA = ${mcStripJson};
function _mcFmtElapsed(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60)   return s + 's elapsed';
  if (s < 3600) return Math.round(s / 60) + 'm elapsed';
  return Math.round(s / 3600) + 'h elapsed';
}
function _mcFmtAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'never';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60)    return s + 's ago';
  if (s < 3600)  return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}
function _mcRenderBatch(batch) {
  const el = document.getElementById('mc-batch');
  const txt = document.getElementById('mc-batch-text');
  if (!el || !txt) return;
  if (!batch || batch.isIdle || batch.state === 'idle') {
    el.setAttribute('data-state', 'idle');
    txt.textContent = 'No batch running';
    return;
  }
  if (batch.state === 'running' && batch.startedAtIso) {
    el.setAttribute('data-state', 'running');
    const elapsed = Date.now() - new Date(batch.startedAtIso).getTime();
    txt.textContent = 'Batch ' + batch.completed + '/' + batch.total + ' · ' + (batch.pct || 0) + '% · ' + _mcFmtElapsed(elapsed);
    return;
  }
  if (batch.state === 'completed' && batch.total > 0) {
    el.setAttribute('data-state', 'completed');
    txt.textContent = 'Batch ✓ ' + batch.completed + '/' + batch.total + ' · 100%';
    return;
  }
  if (batch.failed > 0) {
    el.setAttribute('data-state', 'failed');
    txt.textContent = batch.failed + ' failed · ' + batch.completed + '/' + batch.total;
    return;
  }
  el.setAttribute('data-state', 'idle');
  txt.textContent = 'No batch running';
}
function _mcRenderHealth(health) {
  const el = document.getElementById('mc-health');
  const txt = document.getElementById('mc-health-text');
  if (!el || !txt) return;
  const status = (health && health.status) || 'healthy';
  el.setAttribute('data-status', status);
  const inFlight = (health && typeof health.inFlight === 'number') ? health.inFlight : 0;
  const failed24 = (health && health.failed24h) || 0;
  let label;
  if (status === 'healthy') label = inFlight + ' jobs · all healthy';
  else if (status === 'warn') label = inFlight + ' jobs · ' + (failed24 ? failed24 + ' recent fail' + (failed24 === 1 ? '' : 's') : 'scan stale');
  else label = inFlight + ' jobs · scan offline';
  txt.textContent = label;
}
function initMissionControlStrip() {
  const seed = MC_STRIP_DATA || { batch: null, health: null };
  let lastBatch = seed.batch;
  let lastHealth = seed.health;
  _mcRenderBatch(lastBatch);
  _mcRenderHealth(lastHealth);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Tick elapsed time every 1s while a batch is running. Skipped under
  // reduced-motion to honor the OS-level preference (per Phase 7 spec).
  if (!reduced) {
    setInterval(() => {
      if (lastBatch && lastBatch.state === 'running' && !lastBatch.isIdle) {
        _mcRenderBatch(lastBatch);
      }
    }, 1000);
  }

  // Poll the live batch endpoint every 30s if available. Reuses the same
  // /api/batch-live source as the floating batch overlay so the two stay
  // in sync. apiFetch() is a no-op in static-file (file://) mode.
  async function refresh() {
    try {
      const data = await apiFetch('/api/batch-live');
      if (!data) return;
      const running = data.running || 0;
      const completed = data.completed || 0;
      const total = data.total || 0;
      const failed = data.failed || 0;
      const pct = data.pct || 0;
      // Find earliest running started_at for the elapsed clock
      let earliestStart = null;
      let mostRecent = null;
      for (const r of (data.rows || [])) {
        if (r.status === 'running' && r.started_at) {
          if (!earliestStart || r.started_at < earliestStart) earliestStart = r.started_at;
        }
        if (r.started_at && (!mostRecent || r.started_at > mostRecent)) mostRecent = r.started_at;
      }
      const recentMs = mostRecent ? Date.now() - new Date(mostRecent).getTime() : Infinity;
      const isIdle = running === 0 && recentMs > 2 * 3600 * 1000;
      const state = running > 0
        ? 'running'
        : (completed >= total && total > 0 ? 'completed' : (failed > 0 ? 'failed' : 'idle'));
      lastBatch = {
        state, completed, total, running, failed, pct,
        startedAtIso: earliestStart ? new Date(earliestStart).toISOString() : null,
        isIdle,
      };
      _mcRenderBatch(lastBatch);

      // Roll health: any failed runs in the live snapshot bump health to "warn".
      const newHealth = Object.assign({}, lastHealth || {});
      newHealth.failed24h = failed;
      const baseStatus = (lastHealth && lastHealth.status) || 'healthy';
      if (failed > 0 && baseStatus === 'healthy') newHealth.status = 'warn';
      else if (failed === 0) newHealth.status = baseStatus;
      lastHealth = newHealth;
      _mcRenderHealth(lastHealth);
    } catch (_) { /* server not running — keep seed values */ }
  }
  refresh();
  setInterval(refresh, 30000);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMissionControlStrip);
} else {
  initMissionControlStrip();
}

// ── Persistent left sidebar (Phase 7 Item 4) ────────────────────
// IntersectionObserver highlights the section currently in the
// viewport; falls back to plain anchor links when the API is missing.
// Hamburger toggles the drawer on mobile (<720px). The mini-ticker in
// the sidebar footer mirrors the toolbar's #live-text via MutationObserver.
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  const btn = document.getElementById('sidebar-toggle-btn');
  if (!sb) return;
  const open = sb.classList.toggle('open');
  if (bd) bd.classList.toggle('visible', open);
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  const btn = document.getElementById('sidebar-toggle-btn');
  if (sb) sb.classList.remove('open');
  if (bd) bd.classList.remove('visible');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;

// Desktop sidebar collapse — body class swap + localStorage persistence.
// Cmd/Ctrl + \\ toggles. Distinct from mobile drawer (toggleSidebar).
function applySidebarCollapse(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', !!collapsed);
  const btn = document.getElementById('sidebar-collapse-btn');
  if (btn) {
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.setAttribute('title', collapsed ? 'Expand sidebar (⌘\\\\)' : 'Collapse sidebar (⌘\\\\)');
  }
}
function toggleSidebarCollapse() {
  const next = !document.body.classList.contains('sidebar-collapsed');
  applySidebarCollapse(next);
  try { localStorage.setItem('career-ops-sidebar-collapsed', next ? '1' : '0'); } catch (e) {}
}
function initSidebarCollapse() {
  let stored = '0';
  try { stored = localStorage.getItem('career-ops-sidebar-collapsed') || '0'; } catch (e) {}
  applySidebarCollapse(stored === '1');
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === '\\\\') {
      e.preventDefault();
      toggleSidebarCollapse();
    }
  });
}
window.toggleSidebarCollapse = toggleSidebarCollapse;

function initSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  const links = Array.from(sb.querySelectorAll('a.sidebar-link[data-section]'));
  if (!links.length) return;

  const setActive = (id) => {
    links.forEach(a => a.classList.toggle('active', a.dataset.section === id));
  };

  // Click → smooth-scroll + close drawer on mobile. Browsers handle the
  // hash anchor jump on their own; we also close the mobile drawer.
  links.forEach(a => {
    a.addEventListener('click', () => {
      const id = a.dataset.section;
      if (id) setActive(id);
      // Close drawer if open (mobile only).
      if (window.matchMedia('(max-width: 720px)').matches) {
        closeSidebar();
      }
    });
  });

  // IntersectionObserver — pick the section closest to the top of
  // the viewport that's currently visible. Gracefully no-ops when the
  // API is unavailable; plain anchor links still work.
  if (!('IntersectionObserver' in window)) return;
  const sections = links.map(a => document.getElementById(a.dataset.section)).filter(Boolean);
  if (!sections.length) return;

  const visible = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
      else visible.delete(e.target.id);
    });
    if (!visible.size) return;
    let topId = null, topRatio = -1;
    for (const [id, ratio] of visible) {
      if (ratio > topRatio) { topRatio = ratio; topId = id; }
    }
    if (topId) setActive(topId);
  }, {
    // Bias toward the top portion of the viewport so the active link
    // tracks the section the user is reading, not whatever's at the bottom.
    rootMargin: '-10% 0px -55% 0px',
    threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
  });
  sections.forEach(s => io.observe(s));

  // Default: highlight the first section (Overview) at load.
  setActive(sections[0].id);

  // Mirror live-text into the sidebar mini-ticker. Cheap MutationObserver
  // since #live-text already exists and is updated by initLiveTicker().
  const liveText = document.getElementById('live-text');
  const miniText = document.getElementById('sidebar-mini-text');
  if (liveText && miniText) {
    const sync = () => { miniText.textContent = liveText.textContent || '—'; };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(liveText, { childList: true, characterData: true, subtree: true });
  }

  // Esc closes the mobile drawer.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && sb.classList.contains('open')) closeSidebar();
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebar);
  document.addEventListener('DOMContentLoaded', initSidebarCollapse);
} else {
  initSidebar();
  initSidebarCollapse();
}

// ── OLED true-black mode ────────────────────────────────────────
// Layers on top of dark mode: replaces dark-grey surfaces with pure
// black for AMOLED power savings + visual depth. Has no effect when
// the page is in light mode (the .oled class is harmless there).
const OLED_KEY = 'career-ops-oled';
function applyOled(on) {
  document.body.classList.toggle('oled', on);
  // Keep the iOS standalone status bar in sync with the active bg.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', on ? '#000000' : '#0c0a09');
}
function initOled() {
  let saved = null;
  try { saved = localStorage.getItem(OLED_KEY); } catch (e) {}
  if (saved === '1') applyOled(true);
}
function toggleOled() {
  const on = !document.body.classList.contains('oled');
  try { localStorage.setItem(OLED_KEY, on ? '1' : '0'); } catch (e) {}
  applyOled(on);
  if (typeof toast === 'function') {
    toast(on ? 'OLED black mode on' : 'OLED black mode off', 'info');
  }
}

// ── Demo mode toggle ────────────────────────────────────────────
// Demo mode swaps real candidate data for plausible fake data so the
// dashboard is safe to screen-share in interviews. The swap itself is
// applied at render time by the bootstrap at the bottom of the page;
// this toggle just flips the URL flag + localStorage key and reloads.
const DEMO_MODE_KEY = 'careerOps.demoMode';
function toggleDemoMode() {
  const url = new URL(window.location.href);
  // ?share=token forces demo regardless of flag — toggle is a no-op there.
  if (url.searchParams.has('share')) {
    if (typeof toast === 'function') toast('Demo mode is forced by the active share link', 'info');
    return;
  }
  let on = false;
  try { on = localStorage.getItem(DEMO_MODE_KEY) === '1'; } catch (e) {}
  if (!on) on = url.searchParams.get('demo') === '1';
  if (on) {
    try { localStorage.removeItem(DEMO_MODE_KEY); } catch (e) {}
    url.searchParams.delete('demo');
  } else {
    try { localStorage.setItem(DEMO_MODE_KEY, '1'); } catch (e) {}
    url.searchParams.set('demo', '1');
  }
  window.location.href = url.toString();
}
window.toggleDemoMode = toggleDemoMode;

// ── Row expand ──────────────────────────────────────────────────
const MOBILE_BREAKPOINT_MQ = window.matchMedia('(max-width: 720px)');
const TABLET_BREAKPOINT_MQ = window.matchMedia('(min-width: 721px) and (max-width: 1279px)');
const DESKTOP_BREAKPOINT_MQ = window.matchMedia('(min-width: 1280px)');
function isMobileViewport() { return MOBILE_BREAKPOINT_MQ.matches; }
function isTabletViewport() { return TABLET_BREAKPOINT_MQ.matches; }
function isDesktopViewport() { return DESKTOP_BREAKPOINT_MQ.matches; }

// "Use inline expand instead" — Cmd-K toggle to fall back to the legacy
// inline expand-row UX. Persisted in localStorage so the choice survives
// reloads.
const RAIL_INLINE_KEY = 'dashboard.useInlineExpand';
function useInlineExpand() {
  try { return localStorage.getItem(RAIL_INLINE_KEY) === '1'; } catch (e) { return false; }
}
function setUseInlineExpand(v) {
  try { localStorage.setItem(RAIL_INLINE_KEY, v ? '1' : '0'); } catch (e) {}
  if (v) closeRightRail();
}

let _railSelectedIdx = null;

function toggleDetail(idx) {
  const detail = document.getElementById('detail-' + idx);
  if (!detail) return;
  if (isMobileViewport()) {
    openMobileSheetForDetail(detail);
    // Lazy-load notes for the cloned card inside the bottom sheet.
    setTimeout(() => hydrateNotesIn(document.getElementById('mobile-sheet-body')), 0);
    return;
  }
  if (!useInlineExpand()) {
    if (_railSelectedIdx === idx) {
      closeRightRail();
    } else {
      openRightRailForDetail(idx, detail);
    }
    return;
  }
  detail.style.display = detail.style.display === 'none' ? '' : 'none';
  if (detail.style.display !== 'none') hydrateNotesIn(detail);
}

function _drawerEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function openRightRailForDetail(idx, detailRow) {
  const drawer = document.getElementById('right-rail-drawer');
  const backdrop = document.getElementById('right-rail-backdrop');
  if (!drawer || !detailRow) return;
  const row = detailRow.previousElementSibling;
  const block = detailRow.querySelector('.detail-block');

  // Pull the row's existing chips/badges so the drawer header stays
  // visually aligned with the table row it's describing. Selectors use
  // class-based queries (not nth-child) so they survive column reorders.
  const company = row?.querySelector('a.company-link strong, td strong')?.textContent.trim() || '';
  const roleLinkEl = row?.querySelector('td.role-cell a.role-link');
  const role = (roleLinkEl?.textContent || row?.querySelector('td.role-cell')?.textContent || '').trim();
  const num = row?.dataset.num || '';
  const scoreEl = row?.querySelector('.score-badge-lg');
  const scoreHtml = scoreEl ? scoreEl.outerHTML : '';
  const statusEl = row?.querySelector('td.status-cell .status-pill, .status-pill');
  const statusHtml = statusEl ? statusEl.outerHTML : '';
  const tierEl = row?.querySelector('.tier-tag');
  const tierHtml = tierEl ? tierEl.outerHTML : '';

  // Favicon: prefer the role-title link (now the canonical JD URL since
  // we dropped the Apply column). Fall back to the company /careers link
  // or any external anchor in the row.
  let logoHost = '';
  let applyHref = '';
  const roleLinkHref = row?.querySelector('td.role-cell a.role-link[href]')?.href || '';
  const companyLinkHref = row?.querySelector('a.company-link[href]')?.href || '';
  // Pick favicon source: prefer the actual JD URL hostname, fall back to
  // the company /careers page hostname.
  const jdAnchor = row?.querySelector('td.role-cell a.role-link[href], a.company-link[href]')
    || row?.querySelector('td.action-cell a[href]:not([href^="#"]):not([href^="reports/"]):not([href^="javascript:"]):not([href^="file:"])');
  if (jdAnchor && jdAnchor.href) {
    applyHref = jdAnchor.href;
    try { logoHost = new URL(applyHref).hostname; } catch (e) {}
  }
  const fallbackChar = (company.charAt(0) || '?').toUpperCase();
  const logoHtml = logoHost
    ? '<img class="drawer-logo" alt="" data-fallback="' + _drawerEscape(fallbackChar) + '" src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(logoHost) + '&sz=64">'
    : '<div class="drawer-logo drawer-logo-fallback">' + _drawerEscape(fallbackChar) + '</div>';

  const headerEl = drawer.querySelector('#right-rail-header');
  const bodyEl = drawer.querySelector('#right-rail-body');
  const actionsEl = drawer.querySelector('#right-rail-actions');

  if (headerEl) {
    headerEl.innerHTML = '<button type="button" class="drawer-close" aria-label="Close drawer" onclick="closeRightRail()">✕</button>'
      + '<div class="drawer-title-row">'
      +   logoHtml
      +   '<div class="drawer-title-meta">'
      +     '<div class="drawer-company">'
      +       (companyLinkHref
            ? '<a href="' + _drawerEscape(companyLinkHref) + '" target="_blank" rel="noopener" class="drawer-company-link" title="Open company careers page"><span class="drawer-company-name">' + _drawerEscape(company) + '</span></a>'
            : '<span class="drawer-company-name">' + _drawerEscape(company) + '</span>')
      +       (tierHtml || '')
      +     '</div>'
      +     (roleLinkHref
          ? '<div class="drawer-role"><a href="' + _drawerEscape(roleLinkHref) + '" target="_blank" rel="noopener" class="drawer-role-link" title="Open original job posting">' + _drawerEscape(role) + ' →</a></div>'
          : '<div class="drawer-role">' + _drawerEscape(role) + '</div>')
      +   '</div>'
      + '</div>'
      + '<div class="drawer-chip-row">' + scoreHtml + statusHtml + '</div>';
    // Wire favicon-load failure → single-letter fallback. Inline onerror=
    // attributes nested inside a JS string of HTML get gnarly with quoting,
    // so we attach the listener after innerHTML is set.
    const img = headerEl.querySelector('img.drawer-logo[data-fallback]');
    if (img) {
      img.addEventListener('error', () => {
        const fb = document.createElement('div');
        fb.className = 'drawer-logo drawer-logo-fallback';
        fb.textContent = img.dataset.fallback || '?';
        img.replaceWith(fb);
      }, { once: true });
    }
  }
  if (bodyEl) {
    bodyEl.innerHTML = '';
    if (block) {
      bodyEl.appendChild(block.cloneNode(true));
    } else {
      bodyEl.innerHTML = '<p class="muted">No details available.</p>';
    }
    bodyEl.scrollTop = 0;
    setTimeout(() => hydrateNotesIn(bodyEl), 0);
  }
  if (actionsEl) {
    const applyBtnHtml = applyHref
      ? '<button type="button" class="drawer-btn-primary" data-drawer-action="apply">Apply</button>'
      : '<button type="button" class="drawer-btn-primary" disabled>Apply</button>';
    const skipBtnHtml = num
      ? '<button type="button" data-drawer-action="skip">Skip</button>'
      : '<button type="button" disabled>Skip</button>';
    const deferBtnHtml = num
      ? '<button type="button" data-drawer-action="defer">Defer</button>'
      : '<button type="button" disabled>Defer</button>';
    actionsEl.innerHTML = applyBtnHtml + skipBtnHtml + deferBtnHtml;
    // Wire actions after innerHTML — keeps the HTML-as-string clean of
    // nested-quote escaping and lets us close the rail in one place.
    const applyBtnEl = actionsEl.querySelector('button[data-drawer-action="apply"]');
    if (applyBtnEl && applyHref) {
      applyBtnEl.addEventListener('click', () => {
        window.open(applyHref, '_blank', 'noopener');
      });
    }
    const skipBtnEl = actionsEl.querySelector('button[data-drawer-action="skip"]');
    if (skipBtnEl && num) {
      skipBtnEl.addEventListener('click', () => drawerQuickStatus(num, 'Discarded'));
    }
    const deferBtnEl = actionsEl.querySelector('button[data-drawer-action="defer"]');
    if (deferBtnEl && num) {
      deferBtnEl.addEventListener('click', () => drawerQuickStatus(num, 'Evaluated'));
    }
  }

  // Persistent left-border highlight on the originating row.
  document.querySelectorAll('tr.row.row-selected').forEach(el => el.classList.remove('row-selected'));
  if (row) row.classList.add('row-selected');

  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('right-rail-open');
  if (backdrop && isTabletViewport()) {
    backdrop.classList.add('visible');
    backdrop.removeAttribute('aria-hidden');
  } else if (backdrop) {
    backdrop.classList.remove('visible');
    backdrop.setAttribute('aria-hidden', 'true');
  }
  _railSelectedIdx = idx;
}

function closeRightRail() {
  const drawer = document.getElementById('right-rail-drawer');
  const backdrop = document.getElementById('right-rail-backdrop');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  if (backdrop) {
    backdrop.classList.remove('visible');
    backdrop.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('right-rail-open');
  document.querySelectorAll('tr.row.row-selected').forEach(el => el.classList.remove('row-selected'));
  _railSelectedIdx = null;
}

// Apply/Skip/Defer in the drawer footer reuse the existing /api/status
// endpoint by simulating a click on the row's status pill. Keeps a single
// code path for status writeback, optimistic UI, and toast feedback.
async function drawerQuickStatus(num, newStatus) {
  const badge = document.querySelector('.status-pill[data-num="' + num + '"]');
  if (!badge) {
    if (window.toast) window.toast('Could not locate row #' + num, 'error');
    return;
  }
  if (typeof openStatusPopover === 'function') openStatusPopover(badge);
  if (typeof applyStatus === 'function') {
    await applyStatus(newStatus);
  } else if (typeof closeStatusPopover === 'function') {
    closeStatusPopover();
  }
  closeRightRail();
}
window.drawerQuickStatus = drawerQuickStatus;
window.closeRightRail = closeRightRail;
window.openRightRailForDetail = openRightRailForDetail;
window.setUseInlineExpand = setUseInlineExpand;

// ── Notes & activity (per-row append-only log) ──────────────────
const NOTE_MAX_CHARS = 1000;
const NOTE_PREVIEW_CHARS = 200;

function escapeNoteHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatNoteTs(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso || '';
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return iso || ''; }
}

function renderNoteEntry(entry) {
  const ts = formatNoteTs(entry.ts);
  const type = entry.type === 'status' ? 'status' : 'note';
  const label = type === 'status' ? 'Status' : 'Note';
  const text = String(entry.text || '');
  const isLong = text.length > NOTE_PREVIEW_CHARS;
  const preview = isLong ? text.slice(0, NOTE_PREVIEW_CHARS) + '…' : text;
  const previewHtml = escapeNoteHtml(preview);
  const fullHtml = escapeNoteHtml(text);
  const toggle = isLong
    ? '<button type="button" class="note-toggle" onclick="toggleNoteExpand(this);event.stopPropagation()" data-collapsed="1">Show more</button>'
    : '';
  return '<div class="note-entry">'
    + '<div class="note-entry-head">'
    +   '<span class="note-type-badge type-' + type + '">' + label + '</span>'
    +   '<span>' + escapeNoteHtml(ts) + '</span>'
    + '</div>'
    + '<div class="note-text" data-preview="' + previewHtml + '" data-full="' + fullHtml + '">' + previewHtml + '</div>'
    + toggle
    + '</div>';
}

function toggleNoteExpand(btn) {
  const entry = btn.closest('.note-entry');
  if (!entry) return;
  const textEl = entry.querySelector('.note-text');
  if (!textEl) return;
  const collapsed = btn.dataset.collapsed === '1';
  if (collapsed) {
    textEl.textContent = textEl.dataset.full || '';
    btn.textContent = 'Show less';
    btn.dataset.collapsed = '0';
  } else {
    textEl.textContent = textEl.dataset.preview || '';
    btn.textContent = 'Show more';
    btn.dataset.collapsed = '1';
  }
}
window.toggleNoteExpand = toggleNoteExpand;

function renderNotesList(listEl, entries) {
  if (!listEl) return;
  if (!Array.isArray(entries) || entries.length === 0) {
    listEl.innerHTML = '<div class="notes-empty muted-text">No notes yet — add one above. Status changes are auto-logged.</div>';
    return;
  }
  listEl.innerHTML = entries.map(renderNoteEntry).join('');
}

function hydrateNotesIn(container) {
  if (!container) return;
  const cards = container.querySelectorAll('.dcard--notes[data-notes-num]');
  cards.forEach(card => {
    if (card.dataset.notesLoaded === '1') return;
    const num = card.dataset.notesNum;
    if (!num) return;
    card.dataset.notesLoaded = '1';
    fetch('/api/notes/' + encodeURIComponent(num))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !data.ok) return;
        const list = card.querySelector('[data-notes-list]');
        renderNotesList(list, data.entries);
      })
      .catch(() => {
        card.dataset.notesLoaded = '';
      });
  });
}

function updateNotesCounter(textarea) {
  const card = textarea.closest('.dcard--notes');
  if (!card) return;
  const counter = card.querySelector('.notes-counter');
  if (!counter) return;
  const len = textarea.value.length;
  counter.textContent = len + ' / ' + NOTE_MAX_CHARS;
  counter.classList.toggle('over', len >= NOTE_MAX_CHARS);
}
window.updateNotesCounter = updateNotesCounter;

function addRowNote(btn) {
  const card = btn.closest('.dcard--notes');
  if (!card) return;
  const num = card.dataset.notesNum || btn.dataset.num;
  const textarea = card.querySelector('.notes-input');
  if (!textarea || !num) return;
  const text = textarea.value.trim();
  if (!text) {
    textarea.focus();
    return;
  }
  if (text.length > NOTE_MAX_CHARS) {
    alert('Note exceeds ' + NOTE_MAX_CHARS + ' characters.');
    return;
  }
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Saving…';
  fetch('/api/notes/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ num: parseInt(num, 10), text }),
  })
    .then(r => r.json().then(j => ({ ok: r.ok, body: j })))
    .then(({ ok, body }) => {
      if (!ok || !body || !body.ok) {
        const msg = (body && body.error) || 'Failed to save note';
        alert(msg);
        return;
      }
      textarea.value = '';
      updateNotesCounter(textarea);
      const list = card.querySelector('[data-notes-list]');
      renderNotesList(list, body.entries);
    })
    .catch(err => alert('Network error: ' + err.message))
    .finally(() => {
      btn.disabled = false;
      btn.textContent = originalLabel;
    });
}
window.addRowNote = addRowNote;
window.hydrateNotesIn = hydrateNotesIn;

function openMobileSheetForDetail(detailRow) {
  const block = detailRow.querySelector('.detail-block');
  const row = detailRow.previousElementSibling;
  const company = row?.querySelector('td:nth-child(2)')?.innerText.trim() || '';
  const role = row?.querySelector('td:nth-child(3)')?.innerText.trim() || '';
  const title = company + (role ? ' — ' + role : '');
  const titleEl = document.getElementById('mobile-sheet-title');
  const bodyEl = document.getElementById('mobile-sheet-body');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = title || 'Details';
  bodyEl.innerHTML = '';
  if (block) {
    bodyEl.appendChild(block.cloneNode(true));
  } else {
    bodyEl.innerHTML = '<p class="muted">No details available.</p>';
  }
  // Reset any inline scroll position so each open starts at the top —
  // matters because dismiss-on-drag-down only triggers when scrollTop=0.
  bodyEl.scrollTop = 0;
  const bd = document.getElementById('mobile-sheet-backdrop');
  bd.classList.add('visible');
  bd.removeAttribute('aria-hidden');
  document.body.style.overflow = 'hidden';
}

function closeMobileSheet() {
  const bd = document.getElementById('mobile-sheet-backdrop');
  if (bd) {
    bd.classList.remove('visible');
    bd.setAttribute('aria-hidden', 'true');
  }
  document.body.style.overflow = '';
}

// ESC closes mobile sheet AND right-rail drawer (whichever is open).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMobileSheet();
    if (document.getElementById('right-rail-drawer')?.classList.contains('open')) {
      closeRightRail();
    }
  }
});

// If the viewport widens past the breakpoint with the sheet open, close it
// so we don't leave a phantom modal layered over the desktop view. The
// inverse case (desktop → mobile with the drawer open) closes the drawer
// so the mobile bottom-sheet pattern takes over cleanly.
MOBILE_BREAKPOINT_MQ.addEventListener?.('change', (e) => {
  if (!e.matches) closeMobileSheet();
  else closeRightRail();
});

// ── Saved filter views ──────────────────────────────────────────
const SAVED_VIEWS_KEY = 'dashboard.savedViews';
const SAVED_VIEW_NAME_RE = /^[A-Za-z0-9 ≥\\-_/.+]{1,30}$/;
const SEEDED_SAVED_VIEWS = [
  { name: 'Apply-Now ≥ 4.5',    filters: { text: '', tier: '',   score: '4.5', status: 'evaluated', equity: '' } },
  { name: 'Anthropic everything', filters: { text: 'anthropic', tier: '',   score: '', status: '', equity: '' } },
  { name: 'Tier A2 only',       filters: { text: '', tier: 'A2', score: '', status: '', equity: '' } },
  { name: 'Pre-IPO late stage', filters: { text: '', tier: '',   score: '', status: '', equity: 'late' } },
];

function loadSavedViews() {
  let raw = null;
  try { raw = localStorage.getItem(SAVED_VIEWS_KEY); } catch (e) { return [...SEEDED_SAVED_VIEWS]; }
  if (raw == null) {
    try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(SEEDED_SAVED_VIEWS)); } catch (e) {}
    return [...SEEDED_SAVED_VIEWS];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(v => v && typeof v.name === 'string' && v.filters && typeof v.filters === 'object');
  } catch (e) { return []; }
}

function persistSavedViews(views) {
  try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views)); } catch (e) {}
}

function _currentFilterState() {
  return {
    text:   (document.getElementById('filter-text')?.value || '').trim(),
    tier:   document.getElementById('filter-tier')?.value || '',
    score:  document.getElementById('filter-score')?.value || '',
    status: document.getElementById('filter-status')?.value || '',
    equity: document.getElementById('filter-equity')?.value || '',
  };
}

function _filtersEqual(a, b) {
  if (!a || !b) return false;
  return (a.text || '') === (b.text || '') &&
         (a.tier || '') === (b.tier || '') &&
         (a.score || '') === (b.score || '') &&
         (a.status || '') === (b.status || '') &&
         (a.equity || '') === (b.equity || '');
}

function _summarizeFilters(f) {
  const parts = [];
  if (f.text)   parts.push('"' + (f.text.length > 14 ? f.text.slice(0, 13) + '…' : f.text) + '"');
  if (f.tier)   parts.push(f.tier);
  if (f.score)  parts.push('≥ ' + f.score);
  if (f.status) parts.push(f.status);
  if (f.equity) parts.push(f.equity);
  return parts.join(' · ') || 'all rows';
}

function renderSavedViewChips() {
  const host = document.getElementById('saved-views-chips');
  if (!host) return;
  const views = loadSavedViews();
  const current = _currentFilterState();
  if (!views.length) {
    host.innerHTML = '<span class="saved-views-empty">No saved views — set filters and click "+ Save current view".</span>';
    return;
  }
  host.innerHTML = views.map((v, i) => {
    const active = _filtersEqual(v.filters, current);
    return '<span class="saved-view-chip' + (active ? ' active' : '') + '" role="listitem" tabindex="0"' +
           ' data-view-idx="' + i + '"' +
           ' title="Apply view: ' + _esc(v.name) + ' (' + _esc(_summarizeFilters(v.filters)) + ')"' +
           ' onclick="applySavedViewByIndex(' + i + ')"' +
           ' onkeydown="if(event.key===\\'Enter\\'||event.key===\\' \\'){event.preventDefault();applySavedViewByIndex(' + i + ');}">' +
           '<span class="saved-view-chip-name">' + _esc(v.name) + '</span>' +
           '<span class="saved-view-chip-summary">' + _esc(_summarizeFilters(v.filters)) + '</span>' +
           '<button type="button" class="saved-view-chip-delete" aria-label="Delete saved view: ' + _esc(v.name) + '"' +
           ' onclick="event.stopPropagation();deleteSavedViewByIndex(' + i + ')">×</button>' +
           '</span>';
  }).join('');
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function applySavedViewByIndex(i) {
  const views = loadSavedViews();
  const v = views[i];
  if (!v) return;
  applySavedView(v);
}

function applySavedView(v) {
  if (!v || !v.filters) return;
  const f = v.filters;
  const ft  = document.getElementById('filter-text');
  const fT  = document.getElementById('filter-tier');
  const fS  = document.getElementById('filter-score');
  const fSt = document.getElementById('filter-status');
  const fEq = document.getElementById('filter-equity');
  if (ft)  ft.value  = f.text   || '';
  if (fT)  fT.value  = f.tier   || '';
  if (fS)  fS.value  = f.score  || '';
  if (fSt) fSt.value = f.status || '';
  if (fEq) fEq.value = f.equity || '';
  if (typeof applyFilters === 'function') applyFilters();
  renderSavedViewChips();
  if (typeof toast === 'function') toast('View: ' + v.name, 'info');
}

function deleteSavedViewByIndex(i) {
  const views = loadSavedViews();
  if (i < 0 || i >= views.length) return;
  const removed = views.splice(i, 1)[0];
  persistSavedViews(views);
  renderSavedViewChips();
  if (typeof toast === 'function' && removed) toast('Deleted "' + removed.name + '"', 'info');
}

function openSaveViewPrompt() {
  const prompt = document.getElementById('saved-view-prompt');
  const input = document.getElementById('saved-view-name');
  const err = document.getElementById('saved-view-error');
  if (!prompt || !input) return;
  if (err) err.textContent = '';
  prompt.hidden = false;
  input.value = '';
  setTimeout(() => input.focus(), 0);
}

function cancelSaveView() {
  const prompt = document.getElementById('saved-view-prompt');
  const err = document.getElementById('saved-view-error');
  if (prompt) prompt.hidden = true;
  if (err) err.textContent = '';
}

function confirmSaveView() {
  const input = document.getElementById('saved-view-name');
  const err = document.getElementById('saved-view-error');
  if (!input) return;
  const name = (input.value || '').trim();
  if (!name) {
    if (err) err.textContent = 'Name required.';
    return;
  }
  if (name.length > 30) {
    if (err) err.textContent = 'Max 30 characters.';
    return;
  }
  if (!SAVED_VIEW_NAME_RE.test(name)) {
    if (err) err.textContent = 'Letters, numbers, spaces, and -_/.+≥ only.';
    return;
  }
  const views = loadSavedViews();
  const filters = _currentFilterState();
  const existingIdx = views.findIndex(v => v.name.toLowerCase() === name.toLowerCase());
  if (existingIdx >= 0) {
    views[existingIdx] = { name, filters };
  } else {
    views.push({ name, filters });
  }
  persistSavedViews(views);
  cancelSaveView();
  renderSavedViewChips();
  if (typeof toast === 'function') toast('Saved view: ' + name, 'success');
}

function initSavedViews() {
  loadSavedViews();
  renderSavedViewChips();
}

// ── Table filter + sort ─────────────────────────────────────────
function applyFilters() {
  const rawText = (document.getElementById('filter-text').value || '').toLowerCase();
  const text = rawText.replace(/\\s+/g, ' ').trim();
  const tier = document.getElementById('filter-tier').value;
  const score = parseFloat(document.getElementById('filter-score').value || '0');
  const status = document.getElementById('filter-status').value;
  const equity = (document.getElementById('filter-equity') || {}).value || '';
  const rows = document.querySelectorAll('#all-tbody tr.row');
  for (const row of rows) {
    const detail = row.nextElementSibling;
    let show = true;
    if (text) {
      const haystack = (row.dataset.search || '') + ' ' + (row.dataset.company || '') + ' ' + (row.dataset.role || '') + ' ' + (row.dataset.status || '');
      if (!haystack.includes(text)) show = false;
    }
    if (tier && row.dataset.archetype !== tier) show = false;
    if (score && parseFloat(row.dataset.score) < score) show = false;
    if (status && !row.dataset.status.includes(status)) show = false;
    if (equity && (row.dataset.equity || '') !== equity) show = false;
    // Wave G: fade-in rows that flip from hidden→visible. Skip when
    // reduced-motion is on (CSS animation is already neutered, but
    // we save the reflow caused by force-restarting it).
    const wasHidden = row.style.display === 'none';
    row.style.display = show ? '' : 'none';
    if (show && wasHidden && !REDUCE_MOTION_MQ.matches) {
      row.classList.remove('row-fade-in');
      void row.offsetWidth; // restart the keyframe
      row.classList.add('row-fade-in');
    }
    if (detail && detail.classList.contains('detail-row'))
      detail.style.display = show && detail.style.display !== 'none' ? detail.style.display : 'none';
  }
  if (typeof renderSavedViewChips === 'function') renderSavedViewChips();
  if (typeof _bulkUpdateHeaderCheckboxes === 'function') _bulkUpdateHeaderCheckboxes();
}

function sortTable(tbodyId, colIdx, type, thEl, evt) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  // Multi-column sort via shift-click. Without shift = replace stack with
  // single entry. With shift = if column is already in stack, toggle its
  // direction; otherwise append it as the next tiebreaker level.
  const isShift = !!(evt && (evt.shiftKey || evt.metaKey));
  let stack = [];
  try { stack = JSON.parse(tbody.dataset.sortStack || '[]'); } catch (_) { stack = []; }
  if (!isShift) {
    // Single-column sort (legacy behavior + toggle direction).
    const existing = stack.find(s => s.col === colIdx);
    const dir = existing && existing.dir === 'desc' ? 'asc' : 'desc';
    stack = [{ col: colIdx, type, dir }];
  } else {
    const idx = stack.findIndex(s => s.col === colIdx);
    if (idx >= 0) {
      // Toggle direction at that level (cycle desc → asc → remove).
      if (stack[idx].dir === 'desc') stack[idx].dir = 'asc';
      else stack.splice(idx, 1);
    } else {
      stack.push({ col: colIdx, type, dir: 'desc' });
    }
    // Cap stack at 4 levels — beyond that the sort intent is unreadable.
    stack = stack.slice(0, 4);
  }
  if (!stack.length) stack = [{ col: colIdx, type, dir: 'desc' }];
  tbody.dataset.sortStack = JSON.stringify(stack);
  // Update header indicators across the table — show level number for
  // multi-sort, plain arrow for single.
  const thead = tbody.closest('table')?.querySelector('thead');
  thead?.querySelectorAll('.sortable').forEach(th => {
    th.querySelector('.sort-arrow')?.remove();
  });
  if (thead) {
    stack.forEach((entry, i) => {
      const headerEls = thead.querySelectorAll('.sortable');
      // Find the th whose onclick references this colIdx — relies on the
      // existing onclick attribute pattern: sortTable(_, COL, _, this, evt)
      const target = Array.from(headerEls).find(th => {
        // Double-escape inside the build's outer template literal so the
        // backslashes survive into the rendered <script>. Without \\(, \\s, \\d
        // the emitted regex is /sortTable([^,]+,s*(d+)/ which is invalid.
        const m = (th.getAttribute('onclick') || '').match(/sortTable\\([^,]+,\\s*(\\d+)/);
        return m && parseInt(m[1], 10) === entry.col;
      });
      if (!target) return;
      const arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = (entry.dir === 'desc' ? ' ▼' : ' ▲') + (stack.length > 1 ? String(i + 1) : '');
      target.appendChild(arrow);
    });
  }
  // Collect paired rows (main + detail)
  const allTr = Array.from(tbody.children);
  const pairs = [];
  for (let i = 0; i < allTr.length; i++) {
    if (allTr[i].classList.contains('row')) {
      const next = allTr[i + 1];
      const detail = next?.classList.contains('detail-row') ? next : null;
      pairs.push({ main: allTr[i], detail });
      if (detail) i++;
    }
  }
  // Prefer a child element's data-sort-value when present (Base column
  // ships numeric data-base-min; equity, location chips can ship a custom
  // sort key). Falls back to innerText for legacy columns.
  const cellSortValue = (td) => {
    if (!td) return '';
    const child = td.firstElementChild;
    if (child) {
      if (child.dataset && child.dataset.sortValue !== undefined) return child.dataset.sortValue;
      if (child.dataset && child.dataset.baseMin !== undefined) return child.dataset.baseMin;
      if (child.dataset && child.dataset.locationStatus !== undefined) {
        // Map status to sort weight: preferred > remote > outside > unknown
        const map = { preferred: '1', remote: '2', outside: '3', unknown: '4' };
        return (map[child.dataset.locationStatus] || '5') + ' ' + (td.innerText.trim());
      }
    }
    return td.innerText.trim();
  };
  // Walk the sort stack: the first entry is the primary key, subsequent
  // entries are tiebreakers. Returns 0 only when every level matches.
  pairs.sort((a, b) => {
    for (const entry of stack) {
      const av = cellSortValue(a.main.children[entry.col]);
      const bv = cellSortValue(b.main.children[entry.col]);
      let cmp = entry.type === 'num'
        ? (parseFloat(av) || 0) - (parseFloat(bv) || 0)
        : String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      if (cmp === 0) continue;
      return entry.dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
  for (const { main, detail } of pairs) {
    tbody.appendChild(main);
    if (detail) tbody.appendChild(detail);
  }
  // Wave G: visual confirmation that the reorder landed. The pulse
  // is a 250ms tinted flash on the rows; reduced-motion is honored
  // by the no-preference media query around the @keyframes.
  if (!REDUCE_MOTION_MQ.matches) {
    tbody.classList.remove('sort-pulse');
    void tbody.offsetWidth;
    tbody.classList.add('sort-pulse');
    setTimeout(() => tbody.classList.remove('sort-pulse'), 300);
  }
}

// ── Apply-Now drag-and-drop reorder ─────────────────────────────
// Persists user-defined row priority to localStorage as an array of row
// nums. Two input modes: HTML5 drag API for mouse, pointer events with a
// long-press for touch.
const APPLY_NOW_ORDER_KEY = 'dashboard.applyNowOrder';
const APPLY_NOW_LONG_PRESS_MS = 350;
const REDUCE_MOTION_MQ = window.matchMedia('(prefers-reduced-motion: reduce)');

function loadApplyNowOrder() {
  try {
    const raw = localStorage.getItem(APPLY_NOW_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(n => Number.isFinite(n));
  } catch (e) { return null; }
}

function saveApplyNowOrder() {
  const tbody = document.getElementById('apply-now-tbody');
  if (!tbody) return;
  const order = [];
  for (const tr of tbody.querySelectorAll('tr.row')) {
    const n = parseInt(tr.dataset.num, 10);
    if (Number.isFinite(n)) order.push(n);
  }
  try { localStorage.setItem(APPLY_NOW_ORDER_KEY, JSON.stringify(order)); } catch (e) {}
  updateResetOrderBtnVisibility();
}

function updateResetOrderBtnVisibility() {
  const btn = document.getElementById('apply-now-reset-order');
  if (!btn) return;
  const order = loadApplyNowOrder();
  btn.hidden = !(order && order.length);
}

// Pair main row + its detail row so we can move them together.
function _applyNowPairs(tbody) {
  const all = Array.from(tbody.children);
  const pairs = [];
  for (let i = 0; i < all.length; i++) {
    if (all[i].classList.contains('row')) {
      const next = all[i + 1];
      const detail = next && next.classList.contains('detail-row') ? next : null;
      pairs.push({ main: all[i], detail });
      if (detail) i++;
    }
  }
  return pairs;
}

function applyApplyNowOrder() {
  const tbody = document.getElementById('apply-now-tbody');
  if (!tbody) return;
  const order = loadApplyNowOrder();
  if (!order || !order.length) { updateResetOrderBtnVisibility(); return; }
  const pairs = _applyNowPairs(tbody);
  const byNum = new Map();
  for (const p of pairs) {
    const n = parseInt(p.main.dataset.num, 10);
    if (Number.isFinite(n)) byNum.set(n, p);
  }
  const seen = new Set();
  const ordered = [];
  for (const n of order) {
    const p = byNum.get(n);
    if (p && !seen.has(n)) { ordered.push(p); seen.add(n); }
  }
  for (const p of pairs) {
    const n = parseInt(p.main.dataset.num, 10);
    if (!seen.has(n)) ordered.push(p);
  }
  for (const { main, detail } of ordered) {
    tbody.appendChild(main);
    if (detail) tbody.appendChild(detail);
  }
  updateResetOrderBtnVisibility();
}

function resetApplyNowOrder() {
  try { localStorage.removeItem(APPLY_NOW_ORDER_KEY); } catch (e) {}
  const tbody = document.getElementById('apply-now-tbody');
  if (!tbody) return;
  // Default sort: score desc, then date desc (most recent first).
  const pairs = _applyNowPairs(tbody);
  pairs.sort((a, b) => {
    const sa = parseFloat(a.main.dataset.score) || 0;
    const sb = parseFloat(b.main.dataset.score) || 0;
    if (sb !== sa) return sb - sa;
    const da = a.main.children[5]?.innerText.trim() || '';
    const db = b.main.children[5]?.innerText.trim() || '';
    return db.localeCompare(da);
  });
  for (const { main, detail } of pairs) {
    tbody.appendChild(main);
    if (detail) tbody.appendChild(detail);
  }
  // Clear any stale sort-direction indicators on the apply-now thead.
  delete tbody.dataset.sortCol;
  delete tbody.dataset.sortDir;
  const thead = tbody.closest('table')?.querySelector('thead');
  thead?.querySelectorAll('.sort-arrow').forEach(el => el.remove());
  updateResetOrderBtnVisibility();
}

// Inject a drag handle into each apply-now row's score cell. The handle
// owns the drag, not the whole row — clicking elsewhere still toggles
// row expand without accidentally starting a drag.
function _injectApplyNowHandles() {
  const tbody = document.getElementById('apply-now-tbody');
  if (!tbody) return;
  const rows = tbody.querySelectorAll('tr.row');
  for (const tr of rows) {
    if (tr.querySelector('.apply-drag-handle')) continue;
    const firstTd = tr.children[0];
    if (!firstTd) continue;
    const handle = document.createElement('span');
    handle.className = 'apply-drag-handle';
    handle.setAttribute('role', 'button');
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('aria-label', 'Drag to reorder this row');
    handle.setAttribute('title', 'Drag to reorder');
    handle.setAttribute('draggable', 'true');
    handle.textContent = '⋮⋮';
    handle.addEventListener('click', (e) => e.stopPropagation());
    firstTd.insertBefore(handle, firstTd.firstChild);
  }
}

let _dragSrcRow = null;
let _dragLastTarget = null;

function _clearDropIndicators() {
  const tbody = document.getElementById('apply-now-tbody');
  if (!tbody) return;
  for (const tr of tbody.querySelectorAll('tr.row.drop-target-above, tr.row.drop-target-below')) {
    tr.classList.remove('drop-target-above', 'drop-target-below');
  }
}

function _markGhost(srcRow, on) {
  if (!srcRow) return;
  srcRow.classList.toggle('drag-source', !!on);
  const detail = srcRow.nextElementSibling;
  if (detail && detail.classList.contains('detail-row')) {
    detail.classList.toggle('drag-source', !!on);
  }
}

function _moveRowBefore(srcRow, targetRow, position) {
  // Move src + its paired detail row to a new position relative to target.
  // position: 'above' | 'below' | 'end'
  const tbody = srcRow.parentNode;
  if (!tbody) return;
  const srcDetail = srcRow.nextElementSibling?.classList.contains('detail-row')
    ? srcRow.nextElementSibling : null;
  if (position === 'end' || !targetRow) {
    tbody.appendChild(srcRow);
    if (srcDetail) tbody.appendChild(srcDetail);
    return;
  }
  if (position === 'above') {
    tbody.insertBefore(srcRow, targetRow);
    if (srcDetail) tbody.insertBefore(srcDetail, targetRow);
  } else {
    // Insert after target's paired detail (if any), else after target.
    const targetDetail = targetRow.nextElementSibling?.classList.contains('detail-row')
      ? targetRow.nextElementSibling : null;
    const anchor = targetDetail ? targetDetail.nextSibling : targetRow.nextSibling;
    tbody.insertBefore(srcRow, anchor);
    if (srcDetail) tbody.insertBefore(srcDetail, anchor);
  }
}

function _rowFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const tr = el.closest('tr.row');
  if (!tr || tr.parentNode?.id !== 'apply-now-tbody') return null;
  return tr;
}

function _onApplyNowDragStart(e) {
  const handle = e.target.closest('.apply-drag-handle');
  if (!handle) return;
  const row = handle.closest('tr.row');
  if (!row) return;
  _dragSrcRow = row;
  _markGhost(row, true);
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    // Required by Firefox to start drag.
    try { e.dataTransfer.setData('text/plain', row.dataset.num || ''); } catch (err) {}
  }
}

function _onApplyNowDragOver(e) {
  if (!_dragSrcRow) return;
  const row = e.target.closest('tr.row');
  if (!row || row.parentNode?.id !== 'apply-now-tbody') return;
  if (row === _dragSrcRow) { e.preventDefault(); return; }
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const rect = row.getBoundingClientRect();
  const above = (e.clientY - rect.top) < rect.height / 2;
  if (_dragLastTarget && _dragLastTarget !== row) {
    _dragLastTarget.classList.remove('drop-target-above', 'drop-target-below');
  }
  row.classList.toggle('drop-target-above', above);
  row.classList.toggle('drop-target-below', !above);
  _dragLastTarget = row;
}

function _onApplyNowDrop(e) {
  if (!_dragSrcRow) return;
  e.preventDefault();
  const row = (e.target.closest && e.target.closest('tr.row')) || _dragLastTarget;
  if (row && row !== _dragSrcRow && row.parentNode?.id === 'apply-now-tbody') {
    const above = row.classList.contains('drop-target-above');
    _moveRowBefore(_dragSrcRow, row, above ? 'above' : 'below');
    saveApplyNowOrder();
  }
  _markGhost(_dragSrcRow, false);
  _clearDropIndicators();
  _dragSrcRow = null; _dragLastTarget = null;
}

function _onApplyNowDragEnd() {
  if (_dragSrcRow) _markGhost(_dragSrcRow, false);
  _clearDropIndicators();
  _dragSrcRow = null; _dragLastTarget = null;
}

// ── Touch / pointer fallback ──
// Long-press on the handle (~350ms) initiates a manual drag tracked via
// pointermove. We don't suppress click on tiny taps so accidental
// long-presses are recoverable.
let _pressTimer = null;
let _pressActive = false;
let _pressHandle = null;
let _pressSrcRow = null;
let _pressPointerId = null;

function _onApplyNowPointerDown(e) {
  if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
  const handle = e.target.closest('.apply-drag-handle');
  if (!handle) return;
  const row = handle.closest('tr.row');
  if (!row) return;
  _pressHandle = handle; _pressSrcRow = row; _pressPointerId = e.pointerId;
  _pressActive = false;
  clearTimeout(_pressTimer);
  _pressTimer = setTimeout(() => {
    _pressActive = true;
    _markGhost(row, true);
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    if (navigator.vibrate && !REDUCE_MOTION_MQ.matches) {
      try { navigator.vibrate(10); } catch (err) {}
    }
  }, APPLY_NOW_LONG_PRESS_MS);
}

function _onApplyNowPointerMove(e) {
  if (!_pressActive || e.pointerId !== _pressPointerId) return;
  e.preventDefault();
  const row = _rowFromPoint(e.clientX, e.clientY);
  if (!row || row === _pressSrcRow) {
    if (_dragLastTarget) {
      _dragLastTarget.classList.remove('drop-target-above', 'drop-target-below');
      _dragLastTarget = null;
    }
    return;
  }
  const rect = row.getBoundingClientRect();
  const above = (e.clientY - rect.top) < rect.height / 2;
  if (_dragLastTarget && _dragLastTarget !== row) {
    _dragLastTarget.classList.remove('drop-target-above', 'drop-target-below');
  }
  row.classList.toggle('drop-target-above', above);
  row.classList.toggle('drop-target-below', !above);
  _dragLastTarget = row;
}

function _onApplyNowPointerUp(e) {
  clearTimeout(_pressTimer);
  if (!_pressActive) {
    _pressHandle = _pressSrcRow = _pressPointerId = null;
    return;
  }
  if (_pressSrcRow && _dragLastTarget && _dragLastTarget !== _pressSrcRow) {
    const above = _dragLastTarget.classList.contains('drop-target-above');
    _moveRowBefore(_pressSrcRow, _dragLastTarget, above ? 'above' : 'below');
    saveApplyNowOrder();
  }
  if (_pressSrcRow) _markGhost(_pressSrcRow, false);
  _clearDropIndicators();
  try { _pressHandle?.releasePointerCapture(_pressPointerId); } catch (err) {}
  _pressActive = false;
  _pressHandle = _pressSrcRow = _pressPointerId = null;
  _dragLastTarget = null;
}

function _onApplyNowPointerCancel() {
  clearTimeout(_pressTimer);
  if (_pressSrcRow) _markGhost(_pressSrcRow, false);
  _clearDropIndicators();
  _pressActive = false;
  _pressHandle = _pressSrcRow = _pressPointerId = null;
  _dragLastTarget = null;
}

function initApplyNowDrag() {
  const tbody = document.getElementById('apply-now-tbody');
  if (!tbody) return;
  _injectApplyNowHandles();
  applyApplyNowOrder();
  tbody.addEventListener('dragstart', _onApplyNowDragStart);
  tbody.addEventListener('dragover', _onApplyNowDragOver);
  tbody.addEventListener('drop', _onApplyNowDrop);
  tbody.addEventListener('dragend', _onApplyNowDragEnd);
  tbody.addEventListener('dragleave', (e) => {
    // Clear indicator when leaving the tbody entirely.
    const to = e.relatedTarget;
    if (!to || !tbody.contains(to)) _clearDropIndicators();
  });
  tbody.addEventListener('pointerdown', _onApplyNowPointerDown);
  tbody.addEventListener('pointermove', _onApplyNowPointerMove);
  tbody.addEventListener('pointerup', _onApplyNowPointerUp);
  tbody.addEventListener('pointercancel', _onApplyNowPointerCancel);
}
window.resetApplyNowOrder = resetApplyNowOrder;

// ── Live API helpers ────────────────────────────────────────────
const BASE = window.location.hostname === 'localhost' || window.location.hostname.endsWith('.careers-ops.com')
  ? '' : null;   // null = file:// mode, no live APIs

async function apiFetch(path) {
  if (BASE === null) return null;
  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ── Stat card expand panels ─────────────────────────────────────
const _loadedPanels = {};

async function toggleStatPanel(key) {
  const panel = document.getElementById('stat-panel-' + key);
  if (!panel) return;
  const isOpen = panel.classList.contains('open');

  // Close all other panels
  document.querySelectorAll('.stat-panel.open').forEach(p => {
    p.classList.remove('open');
    const k = p.id.replace('stat-panel-', '');
    document.querySelectorAll('.stat[onclick*="' + k + '"]').forEach(s => s.classList.remove('active'));
  });

  if (isOpen) return;  // just closing

  panel.classList.add('open');
  document.querySelectorAll('.stat[onclick*="' + key + '"]').forEach(s => s.classList.add('active'));

  if (_loadedPanels[key]) return;  // already populated
  _loadedPanels[key] = true;

  panel.innerHTML = '<div class="skeleton-stack" aria-busy="true" aria-label="Loading">'
    + '<div class="skeleton-bar sk-title"></div>'
    + '<div class="skeleton-bar sk-line"></div>'
    + '<div class="skeleton-bar sk-line-short"></div>'
    + '</div>';

  const data = await apiFetch('/api/detail/' + key);
  if (!data) {
    panel.innerHTML = '<div class="skeleton-error">Could not reach live server — view the table below for static data.</div>';
    return;
  }

  panel.innerHTML = renderStatPanel(key, data);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// ── COL / Currency enrichment ───────────────────────────────────
const _COL = {
  seattle: 100, 'bellevue': 100,
  'san francisco': 122, ' sf ': 122, 'palo alto': 118,
  'new york': 118, 'nyc': 118, ' ny ': 118,
  'austin': 88, 'boston': 108, 'chicago': 94, 'dc': 103, 'washington': 103,
  'london': 99, 'paris': 86, 'berlin': 78, 'amsterdam': 91,
  'dublin': 90, 'singapore': 95, 'toronto': 91, 'montreal': 82,
  'munich': 82, 'zurich': 135, 'zürich': 135,
};
const _FX = { USD: 1, EUR: 1.12, GBP: 1.28, CAD: 0.73, SGD: 0.75, CHF: 1.15 };

function _detectCurrency(comp) {
  if (!comp) return 'USD';
  if (comp.includes('€') || /\bEUR\b/.test(comp)) return 'EUR';
  if (comp.includes('£') || /\bGBP\b/.test(comp)) return 'GBP';
  if (/\bCAD\b/.test(comp)) return 'CAD';
  if (/\bSGD\b/.test(comp)) return 'SGD';
  if (/\bCHF\b/.test(comp)) return 'CHF';
  return 'USD';
}

function colBadge(comp, location) {
  const currency = _detectCurrency(comp);
  if (currency === 'USD') return ''; // no badge needed for US roles
  const fx = _FX[currency] || 1;

  // Extract numeric salary (handle K notation, ranges → midpoint)
  const raw = (comp || '').replace(/,/g, '');
  const nums = [];
  for (const m of raw.matchAll(/([\d.]+)\s*[Kk]/g)) nums.push(parseFloat(m[1]) * 1000);
  if (!nums.length) for (const m of raw.matchAll(/([\d]{4,7})/g)) nums.push(parseFloat(m[1]));
  if (!nums.length) return '';
  const mid = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
  const usd = Math.round(mid * fx);
  const usdK = Math.round(usd / 1000);

  // Find COL for location
  const locLow = (location || '').toLowerCase();
  let locCol = null; let locName = '';
  for (const [k, v] of Object.entries(_COL)) {
    if (locLow.includes(k)) { locCol = v; locName = k.trim(); break; }
  }
  if (!locCol) return \`<span class="col-badge" title="FX converted (COL unknown)">≈ $\${usdK}K USD</span>\`;

  const seattleEquiv = Math.round(usd * (100 / locCol));
  const seattleK = Math.round(seattleEquiv / 1000);
  const delta = Math.round((seattleEquiv - usd) / usd * 100);
  const color = delta >= 0 ? 'var(--green-fg)' : 'var(--orange-fg,#b45309)';
  const arrow = delta >= 0 ? '↑' : '↓';
  const sign = delta >= 0 ? '+' : '';
  const note = delta >= 0
    ? \`Cheaper COL in \${locName} — buys more than $\${usdK}K would in Seattle\`
    : \`Higher COL in \${locName} — buys less than $\${usdK}K would in Seattle\`;

  return \`<span class="col-badge" style="color:\${color}" title="Pre-tax. \${note}. COL index: \${locName} \${locCol} vs Seattle 100.">≈ $\${usdK}K USD · $\${seattleK}K Seattle equiv \${arrow}\${sign}\${Math.abs(delta)}% QOL</span>\`;
}

function evalAge(d) {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (isNaN(days) || days < 0) return '';
  if (days >= 14) return \`<span class="age-red">\${days}d ⚠</span>\`;
  if (days >= 10) return \`<span class="age-amber">\${days}d</span>\`;
  if (days < 30) return days + 'd';
  return Math.round(days/7) + 'w';
}
function scoreBadge(s) {
  if (!s && s !== 0) return '<span class="muted">—</span>';
  const cls = s >= 4 ? 'score-strong' : s >= 3 ? 'score-moderate' : 'score-weak';
  return \`<span class="badge \${cls}">\${Number(s).toFixed(1)}</span>\`;
}
function bSubType(role) {
  const r = (role || '').toLowerCase();
  if (/developer.?advocate|devrel|dev.?rel|developer.?relations/.test(r)) return 'Dev Advocate';
  if (/exec(utive)?.*(comms?|communications?)|vp.*(comms?|communications?)|chief.?comm/.test(r)) return 'Exec Comms';
  if (/editorial|editor[^i]|content.?lead|journalist|storytell/.test(r)) return 'Editorial';
  if (/comms?.?(engineer|eng\\b)|technical.?(comms?|comm)|engineering.?comms?/.test(r)) return 'Eng Comms';
  if (/ai.?(comms?|communications?|content|advocate)|(comms?|content).?(ai|llm|genai)/.test(r)) return 'AI Comms';
  return null;
}
function toggleRecentEvals() {
  const wrap = document.getElementById('recent-evals-wrap');
  const btn = document.getElementById('recent-evals-toggle');
  if (!wrap) return;
  const collapsed = wrap.classList.toggle('collapsed');
  const total = parseInt(wrap.getAttribute('data-total') || '0', 10);
  const meta = document.querySelector('.recent-evals-shown');
  if (meta) meta.textContent = collapsed ? '5' : String(total);
  if (btn) {
    btn.textContent = collapsed ? 'Show all ' + total + ' \\u25be' : 'Show top 5 \\u25b4';
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
}
window.toggleRecentEvals = toggleRecentEvals;
${STATUS_KEY_SOURCE}
function statusBadge(st, num) {
  if (!st) return '';
  const key = statusKey(st);
  const cls = key === 'skip' ? 'status-discarded'
    : key === 'responded' ? 'status-evaluated'
    : \`status-\${key}\`;
  if (num === undefined || num === null || num === '') {
    return \`<span class="badge \${cls}" data-status="\${key}">\${esc(st)}</span>\`;
  }
  return \`<span class="badge status-pill \${cls}" data-status="\${key}" data-num="\${esc(String(num))}" role="button" tabindex="0" onclick="openStatusPopover(this);event.stopPropagation()" onkeydown="if(event.key==='Enter'||event.key===' '){openStatusPopover(this);event.preventDefault();event.stopPropagation()}" title="Click to change status">\${esc(st)}</span>\`;
}

function rowActions(r) {
  const slug = (r.reportPath || r.report || '').replace(/^reports\\//, '');
  const htmlLink = slug
    ? \`<a href="reports/\${slug.replace(/\\.md$/,'.html')}" target="_blank" onclick="event.stopPropagation()">Report</a>\`
    : '';
  const url = r.reportSummary?.url || '';
  const applyLink = url
    ? \`<a href="\${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Apply</a>\`
    : '';
  const verifyBtn = slug
    ? \`<a href="javascript:void(0)" onclick="openVerify('\${slug}');event.stopPropagation()" style="color:#8250df">Verify</a>\`
    : '';
  return [htmlLink, applyLink, verifyBtn].filter(Boolean).join(' · ') || '<span class="muted">—</span>';
}

function buildTable(rows, panelId) {
  if (!rows || !rows.length) return '<p style="color:#57606a;font-size:13px;margin:0">No items.</p>';
  const trows = rows.map((r, i) => {
    const slug = (r.reportPath || r.report || '').replace(/^reports\\//,'');
    const archetypeFull = r.reportSummary?.archetype || r.archetype || '';
    const tierMatch = archetypeFull.match(/\\b(A1|A2|B)\\b/);
    const archetype = tierMatch ? tierMatch[1] : (archetypeFull.slice(0, 3) || '');
    const sub = archetype === 'B' ? bSubType(r.role || '') : null;
    const tldrRaw = r.reportSummary?.tldr || '';
    const tldr = tldrRaw.includes('|') ? '' : tldrRaw; // skip raw table markdown
    const comp = r.reportSummary?.comp || '';
    const location = r.reportSummary?.location || '';
    const url = r.reportSummary?.url || '';
    const rec = r.reportSummary?.recommendation || '';
    const colTag = colBadge(comp, location);
    return \`<tr class="row" onclick="toggleDetail('sp-\${panelId}-\${i}')">
      <td>\${scoreBadge(r.score)}</td>
      <td><strong>\${esc(r.company||'')}</strong>\${archetype ? \`<span class="tier-tag" tabindex="0" role="button" data-tooltip="\${esc(tierTooltipJS(archetype))}" aria-label="Tier \${esc(archetype)}: \${esc(tierTooltipJS(archetype))}" onclick="event.stopPropagation();openTierLegend('\${esc(archetype)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openTierLegend('\${esc(archetype)}')}">\${esc(archetype)}</span>\` : ''}\${sub ? \`<span class="tier-tag tier-tag-sub">\${esc(sub)}</span>\` : ''}</td>
      <td class="role-cell">\${esc(r.role||'')}</td>
      <td>\${statusBadge(r.status, r.num)}</td>
      <td class="muted-text">\${esc(r.date||'')}</td>
      <td class="muted-text">\${evalAge(r.date||'')}</td>
      <td class="action-cell">\${rowActions(r)}</td>
    </tr>
    <tr class="detail-row" id="detail-sp-\${panelId}-\${i}" style="display:none">
      <td colspan="7">
        <div class="detail-block">
          \${(comp || archetype || r.date) ? \`<div class="detail-meta">
            \${comp ? \`<span class="meta-chip meta-chip-comp">💰 \${esc(comp)}\${colTag}</span>\` : ''}
            \${archetype ? \`<span class="meta-chip meta-chip-tier">\${esc(archetype)}</span>\` : ''}
          </div>\` : ''}
          \${tldr ? \`<div class="dcard" style="margin-bottom:8px"><div class="dcard-label">Role at a glance</div><div class="dcard-body">\${esc(tldr)}</div></div>\` : ''}
          \${rec ? \`<div class="rec-banner"><span class="rec-label">Rec</span><span class="rec-text">\${esc(rec)}</span>\${url ? \`<a href="\${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="rec-btn">Apply →</a>\` : ''}</div>\` : url ? \`<div style="font-size:12px;margin-top:6px"><a href="\${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 View JD</a></div>\` : ''}
        </div>
      </td>
    </tr>\`;
  }).join('');

  return \`<div style="overflow-x:auto"><table>
    <thead><tr>
      <th>Score</th><th>Company</th><th>Role</th><th>Status</th><th>Eval Date</th><th>Age</th><th>Action</th>
    </tr></thead>
    <tbody>\${trows}</tbody>
  </table></div>\`;
}

function renderStatPanel(key, data) {
  const title = data.title || key;
  const rows = (data.rows || []).slice(0, 100);
  const count = data.total || rows.length;

  if (key === 'evaluations') {
    // Score bucket cards + status breakdown + recent table
    const buckets = data.buckets || {};
    const byStatus = data.byStatus || {};
    const bucketCards = Object.entries(buckets).map(([label, val]) =>
      \`<div class="bucket-card"><div class="bval">\${val}</div><div class="blbl">\${label}</div></div>\`
    ).join('');
    const statusCards = Object.entries(byStatus).map(([st, val]) =>
      \`<div class="bucket-card"><div class="bval">\${val}</div><div class="blbl">\${st}</div></div>\`
    ).join('');
    const recentRows = (data.recent || rows).slice(0, 30);
    const recentTotal = recentRows.length;
    const hasMore = recentTotal > 5;
    return \`<div class="stat-panel-title">\${esc(title)} <span class="pill">\${count}</span> <span style="font-size:12px;color:#57606a;font-weight:400">· live</span></div>
      <div style="margin-bottom:16px"><div class="bucket-grid bucket-grid-row" style="margin-top:8px">\${bucketCards}<span class="bucket-divider" aria-hidden="true"></span>\${statusCards}</div></div>
      <div class="recent-evals-header">
        <strong style="font-size:13px">Recent evaluations</strong>
        \${hasMore ? \`<span class="recent-evals-meta">Showing <span class="recent-evals-shown">5</span> of \${recentTotal}</span>\` : ''}
      </div>
      <div class="recent-evals-wrap collapsed" id="recent-evals-wrap" data-total="\${recentTotal}" style="margin-top:10px">\${buildTable(recentRows, key)}</div>
      \${hasMore ? \`<button type="button" class="recent-evals-toggle" id="recent-evals-toggle" onclick="toggleRecentEvals()" aria-expanded="false">Show all \${recentTotal} ▾</button>\` : ''}\`;
  }

  if (key === 'pending') {
    const tiers = data.tiers || [];
    const items = data.items || [];
    const tierCards = tiers.map(t =>
      \`<div class="bucket-card"><div class="bval">\${t.count}</div><div class="blbl">\${esc(t.label)}</div></div>\`
    ).join('');
    const platformColors = {
      LinkedIn: '#0a66c2', Ashby: '#6366f1', Greenhouse: '#1a7f37',
      Lever: '#e36b00', WWR: '#0ea5e9', RemoteOK: '#16a34a',
      Workable: '#7c3aed', Stripe: '#635bff', Coinbase: '#0052ff',
      Amazon: '#f90', Unknown: '#57606a',
    };
    const itemRows = items.slice(0, 100).map(item => {
      const pColor = platformColors[item.platform] || '#57606a';
      const daysLabel = item.daysInQueue != null
        ? (item.daysInQueue > 30
            ? \`<span class="age-stale">\${item.daysInQueue}d ⚠</span>\`
            : \`<span class="age-ok">\${item.daysInQueue}d</span>\`)
        : '';
      const companyCell = item.company
        ? \`<strong>\${esc(item.company)}</strong>\`
        : \`<span class="muted">—</span>\`;
      const roleCell = item.role
        ? \`<span class="role-cell">\${esc(item.role.slice(0,70))}\${item.role.length > 70 ? '…' : ''}</span>\`
        : \`<span class="muted">Unknown</span>\`;
      return \`<tr>
        <td><span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700;background:\${pColor}22;color:\${pColor};border:1px solid \${pColor}55">\${esc(item.platform)}</span></td>
        <td>\${companyCell}</td>
        <td>\${roleCell}</td>
        <td class="muted-text">\${daysLabel}</td>
        <td class="muted-text"><a href="\${esc(item.url)}" target="_blank" rel="noopener" title="\${esc(item.url)}">Open →</a></td>
      </tr>\`;
    }).join('');
    const staleCount = items.filter(i => i.daysInQueue != null && i.daysInQueue > 30).length;
    const staleWarning = staleCount > 0
      ? \`<p style="font-size:12px;color:#cf222e;margin:0 0 12px"><strong>\${staleCount}</strong> items have been pending 30+ days — postings may be closed.</p>\`
      : '';
    return \`<div class="stat-panel-title">\${esc(title)} <span class="pill">\${data.total}</span> <span style="font-size:12px;color:#57606a;font-weight:400">· live</span></div>
      <div class="bucket-grid" style="margin-bottom:12px">\${tierCards}</div>
      \${staleWarning}
      <strong style="font-size:13px">Pending URLs — click Open to preview, then paste URL into chat to evaluate</strong>
      <div style="margin-top:10px;overflow-x:auto;max-height:440px;overflow-y:auto"><table>
        <thead><tr><th>Platform</th><th>Company</th><th>Title / Role</th><th>Age</th><th>Link</th></tr></thead>
        <tbody>\${itemRows}</tbody>
      </table></div>\`;
  }

  if (key === 'batches') {
    const batches = data.batches || [];
    const fmtDuration = ms => {
      if (ms == null || isNaN(ms) || ms < 0) return '—';
      const min = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      if (min >= 60) return Math.floor(min/60) + 'h ' + (min%60) + 'm';
      if (min >= 1) return min + 'm ' + (sec ? sec + 's' : '');
      return sec + 's';
    };
    const fmtTime = s => {
      if (!s) return '—';
      try { return new Date(s).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
      catch { return s; }
    };
    if (!batches.length) {
      return \`<div class="stat-panel-title">\${esc(title)} <span class="pill">0</span></div>
        <p style="color:#57606a;font-size:13px;margin:0">No batch runs recorded yet.</p>\`;
    }
    const rowsHtml = batches.map((b, i) => {
      const avg = b.avgScore != null ? scoreBadge(b.avgScore) : '<span class="muted">—</span>';
      const failedCell = b.failed > 0
        ? \`<span style="color:var(--red-fg);font-weight:600">\${b.failed}</span>\`
        : \`<span class="muted">0</span>\`;
      return \`<tr class="row" onclick="selectBatch('\${esc(b.batch_id || '')}')" title="Drill into batch (coming soon)">
        <td class="muted-text">\${esc(fmtTime(b.started_at))}</td>
        <td><strong>\${b.completed}</strong></td>
        <td>\${failedCell}</td>
        <td class="muted-text">\${b.total}</td>
        <td class="muted-text">\${esc(fmtDuration(b.duration_ms))}</td>
        <td>\${avg}</td>
      </tr>\`;
    }).join('');
    const totalCompleted = batches.reduce((a,b) => a + b.completed, 0);
    const totalFailed    = batches.reduce((a,b) => a + b.failed, 0);
    const successRate = (totalCompleted + totalFailed) > 0
      ? Math.round((totalCompleted / (totalCompleted + totalFailed)) * 100)
      : null;
    return \`<div class="stat-panel-title">\${esc(title)} <span class="pill">\${data.total}</span> <span style="font-size:12px;color:#57606a;font-weight:400">· last \${batches.length}</span></div>
      <div class="bucket-grid" style="margin-bottom:12px">
        <div class="bucket-card"><div class="bval">\${totalCompleted}</div><div class="blbl">Completed</div></div>
        <div class="bucket-card"><div class="bval">\${totalFailed}</div><div class="blbl">Failed</div></div>
        <div class="bucket-card"><div class="bval">\${successRate != null ? successRate + '%' : '—'}</div><div class="blbl">Success rate</div></div>
      </div>
      <strong style="font-size:13px">Last \${batches.length} batch runs</strong>
      <div style="margin-top:10px;overflow-x:auto"><table>
        <thead><tr><th>Started</th><th>✓</th><th>✕</th><th>Total</th><th>Duration</th><th>Avg score</th></tr></thead>
        <tbody>\${rowsHtml}</tbody>
      </table></div>\`;
  }

  if (key === 'companies') {
    const buckets = data.buckets || {};
    const crows = data.rows || [];
    const bucketCards = Object.entries(buckets).map(([label, val]) =>
      \`<div class="bucket-card"><div class="bval">\${val}</div><div class="blbl">\${esc(label)}</div></div>\`
    ).join('');
    const trows = crows.map(r => {
      const lastScan = r.lastScanned || '';
      const inactive = r.daysSinceScan != null && r.daysSinceScan > 30;
      const lastCell = lastScan
        ? (inactive
            ? \`<span class="age-stale">\${esc(lastScan)} (\${r.daysSinceScan}d)</span>\`
            : \`<span class="age-ok">\${esc(lastScan)}</span>\`)
        : \`<span class="muted">never</span>\`;
      const safeName = String(r.company || '').replace(/'/g, "\\\\'").replace(/"/g, '&quot;');
      return \`<tr class="row" onclick="filterTablesByCompany('\${safeName}')" title="Click to filter Apply-Now / All Evaluations to \${esc(r.company)}">
        <td><strong>\${esc(r.company)}</strong></td>
        <td class="muted-text">\${esc(r.portal || '—')}</td>
        <td>\${r.evals || 0}</td>
        <td>\${r.applyNow || 0}</td>
        <td class="muted-text">\${lastCell}</td>
        <td class="muted-text">\${r.rolesFound || 0}</td>
      </tr>\`;
    }).join('');
    return \`<div class="stat-panel-title">\${esc(data.title || 'Companies Tracked')} <span class="pill">\${data.total || crows.length}</span> <span style="font-size:12px;color:#57606a;font-weight:400">· live</span></div>
      <div class="bucket-grid" style="margin-bottom:12px">\${bucketCards}</div>
      <p style="font-size:12px;color:#57606a;margin:0 0 8px">Click a row to filter Apply-Now / All Evaluations to that company.</p>
      <div style="overflow-x:auto;max-height:440px;overflow-y:auto"><table>
        <thead><tr><th>Company</th><th>Portal</th><th>Evals</th><th>Apply-Now</th><th>Last scanned</th><th>Roles found</th></tr></thead>
        <tbody>\${trows || '<tr><td colspan="6" style="color:#57606a;font-size:12px">No companies yet.</td></tr>'}</tbody>
      </table></div>\`;
  }

  if (key === 'scanned') {
    const buckets = data.buckets || {};
    const daily = data.daily || [];
    const recent = data.recent || [];
    const bucketCards = Object.entries(buckets).map(([label, val]) =>
      \`<div class="bucket-card"><div class="bval">\${val}</div><div class="blbl">\${esc(label)}</div></div>\`
    ).join('');
    const maxC = Math.max(1, ...daily.map(d => d.count || 0));
    const W = 320, H = 60;
    const BW = Math.max(2, Math.floor(W / Math.max(1, daily.length)) - 1);
    const bars = daily.map((d, i) => {
      const h = Math.max(1, Math.round(((d.count || 0) / maxC) * (H - 8)));
      const x = i * (BW + 1);
      const y = H - h;
      return \`<rect x="\${x}" y="\${y}" width="\${BW}" height="\${h}" fill="var(--blue-fg, #0969da)" opacity="0.7"><title>\${d.date}: \${d.count}</title></rect>\`;
    }).join('');
    const chart = daily.length
      ? \`<svg viewBox="0 0 \${W} \${H}" preserveAspectRatio="none" width="100%" height="60" role="img" aria-label="Scans per day, last \${daily.length} days" style="background:rgba(0,0,0,0.02);border-radius:4px">\${bars}</svg>\`
      : '<p style="color:#57606a;font-size:12px;margin:0">No scan history yet.</p>';
    const trows = recent.slice(0, 100).map(r => {
      const ok = (r.newRolesFound || 0) > 0;
      const status = ok
        ? \`<span style="color:var(--green-fg, #1a7f37);font-weight:600">✓ success</span>\`
        : \`<span class="muted">no new</span>\`;
      return \`<tr>
        <td class="muted-text">\${esc(r.timestamp || '')}</td>
        <td><strong>\${esc(r.company || '—')}</strong></td>
        <td class="muted-text">\${esc(r.portal || '—')}</td>
        <td>\${r.newRolesFound || 0}</td>
        <td>\${status}</td>
      </tr>\`;
    }).join('');
    return \`<div class="stat-panel-title">\${esc(data.title || 'URLs Scanned')} <span class="pill">\${data.total || 0}</span> <span style="font-size:12px;color:#57606a;font-weight:400">· live</span></div>
      <div class="bucket-grid" style="margin-bottom:12px">\${bucketCards}</div>
      <div style="margin-bottom:12px"><strong style="font-size:13px">Scans per day — last \${daily.length} days</strong>
        <div style="margin-top:6px">\${chart}</div>
      </div>
      <strong style="font-size:13px">Recent scan events</strong>
      <div style="margin-top:10px;overflow-x:auto;max-height:440px;overflow-y:auto"><table>
        <thead><tr><th>Date</th><th>Company</th><th>Portal</th><th>New roles</th><th>Status</th></tr></thead>
        <tbody>\${trows || '<tr><td colspan="5" style="color:#57606a;font-size:12px">No scan history yet.</td></tr>'}</tbody>
      </table></div>\`;
  }

  // Default: title + full table
  return \`<div class="stat-panel-title">\${esc(title)} \${count ? \`<span class="pill">\${count}</span>\` : ''} <span style="font-size:12px;color:#57606a;font-weight:400">· live</span></div>
    \${buildTable(rows, key)}\`;
}

// ── Per-company filter (driven by Companies tracked panel rows) ──────
function filterTablesByCompany(name) {
  if (!name) return clearCompanyFilter();
  window._companyFilter = name;
  const lower = String(name).toLowerCase();
  ['apply-now-tbody', 'all-tbody'].forEach(tbodyId => {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      if (tr.classList.contains('detail-row')) { tr.style.display = 'none'; return; }
      const cells = tr.querySelectorAll('td');
      // Apply-Now and All Eval tables both have: bulk(0), score(1), company(2), ...
      const companyCell = cells[2];
      const text = (companyCell?.textContent || '').toLowerCase();
      tr.style.display = text.includes(lower) ? '' : 'none';
    });
  });
  showCompanyFilterBanner(name);
  document.querySelectorAll('.stat-panel.open').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.stat.active').forEach(s => s.classList.remove('active'));
  const applyNow = document.getElementById('apply-now-section');
  if (applyNow && applyNow.scrollIntoView) applyNow.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearCompanyFilter() {
  window._companyFilter = null;
  ['apply-now-tbody', 'all-tbody'].forEach(tbodyId => {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      if (tr.classList.contains('detail-row')) tr.style.display = 'none';
      else tr.style.display = '';
    });
  });
  const banner = document.getElementById('company-filter-banner');
  if (banner) banner.remove();
}

function showCompanyFilterBanner(name) {
  let banner = document.getElementById('company-filter-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'company-filter-banner';
    banner.style.cssText = 'position:sticky;top:0;z-index:50;background:#0969da;color:#fff;padding:8px 14px;font-size:13px;display:flex;align-items:center;border-radius:4px;margin:8px 0';
    const apply = document.getElementById('apply-now-section');
    if (apply && apply.parentNode) apply.parentNode.insertBefore(banner, apply);
    else document.body.prepend(banner);
  }
  banner.innerHTML = '🔎 Filtered by company: <strong style="margin:0 8px">' + esc(name) + '</strong> <button type="button" onclick="clearCompanyFilter()" style="margin-left:auto;background:rgba(255,255,255,0.2);border:0;color:#fff;padding:4px 10px;border-radius:3px;cursor:pointer">Clear</button>';
}

// Drill-down into a specific batch run is a Phase 3 follow-up.
// TODO(phase3): wire selectBatch() to a per-batch detail panel listing each
// row (URL, status, report link, score, error). For now, log + toast.
function selectBatch(batchId) {
  if (!batchId) return;
  if (typeof toast === 'function') toast('Per-batch drill-down coming soon — batch ' + batchId, 'info');
  console.log('[selectBatch] batch_id=' + batchId);
}

// ── Sidebar batch widget ────────────────────────────────────────
let _batchInterval = null;

async function pollBatch() {
  const data = await apiFetch('/api/batch-live');
  if (!data) return;
  const widget = document.getElementById('sidebar-batch');
  if (!widget) return;

  if (data.total > 0) {
    widget.style.display = '';
    document.getElementById('sidebar-batch-title').textContent =
      \`⚡ Batch: \${data.completed}/\${data.total} (\${data.pct?.toFixed(0) || 0}%)\`;
    const bar = document.getElementById('sidebar-batch-bar-fill');
    if (bar) bar.style.width = (data.pct || 0) + '%';

    const recent = (data.rows || []).filter(r => r.status === 'completed').slice(0, 3);
    document.getElementById('sidebar-batch-stats').innerHTML =
      \`<div class="sidebar-batch-stat"><span class="sidebar-batch-stat-label">Completed</span><span class="sidebar-batch-stat-val">\${data.completed}</span></div>
       <div class="sidebar-batch-stat"><span class="sidebar-batch-stat-label">Failed</span><span class="sidebar-batch-stat-val">\${data.failed || 0}</span></div>
       <div class="sidebar-batch-stat"><span class="sidebar-batch-stat-label">Running</span><span class="sidebar-batch-stat-val">\${data.running || 0}</span></div>
       <div class="sidebar-batch-stat"><span class="sidebar-batch-stat-label">Pending</span><span class="sidebar-batch-stat-val">\${data.pending || 0}</span></div>
       \${recent.length ? '<div class="sidebar-batch-recent">' + recent.map(r =>
         \`<div class="sidebar-batch-recent-item">✅ \${r.company || ''} — \${r.role || r.id || ''}</div>\`
       ).join('') + '</div>' : ''}\`;

    if (data.completed >= data.total && data.total > 0 && !data.running) {
      clearInterval(_batchInterval);
      _batchInterval = null;
    }
  } else {
    widget.style.display = 'none';
  }
}

// ── Verify claims modal ─────────────────────────────────────────
async function openVerify(slug) {
  const data = await apiFetch('/api/verify/' + slug);
  const title = document.getElementById('verify-title');
  const body = document.getElementById('verify-body');
  if (!data) {
    title.textContent = 'Verify claims';
    body.innerHTML = '<p style="color:#cf222e">Could not load report data. Make sure the dashboard server is running.</p>';
    document.getElementById('verify-backdrop').classList.add('visible');
    return;
  }

  title.textContent = \`\${data.company} — \${data.role}\`;

  const claims = (data.cvMatchClaims || []).map(c => \`<div class="verify-claim">\${c}</div>\`).join('');
  const stars = (data.starStories || []).map(s =>
    \`<div class="verify-claim"><strong>\${s.label}:</strong> \${s.detail}</div>\`
  ).join('');
  const queries = Object.values(data.queries || {}).map(q => \`
    <div class="query-card">
      <div class="query-card-header">
        <span>\${q.label} — \${q.platform}</span>
        <button class="copy-btn" onclick="navigator.clipboard.writeText(this.closest('.query-card').querySelector('.query-text').textContent)">Copy</button>
      </div>
      <div class="query-text">\${q.query}</div>
    </div>\`
  ).join('');

  const evidenceSection = \`
    <div class="verify-section">
      <h4>📝 Add evidence (saved to report Block H)</h4>
      <textarea class="evidence-area" id="evidence-text" placeholder="Paste research findings, recruiter notes, or Grok/Perplexity output here…"></textarea>
      <button class="save-evidence-btn" onclick="saveEvidence('\${data.reportSlug}')">Save to Report</button>
      \${data.hasEvidence ? '<span style="margin-left:10px;color:#8250df;font-size:12px">✦ Evidence block already exists (will be replaced)</span>' : ''}
    </div>\`;

  body.innerHTML = \`
    \${claims ? '<div class="verify-section"><h4>📋 CV match claims to substantiate</h4>' + claims + '</div>' : ''}
    \${stars ? '<div class="verify-section"><h4>⭐ STAR stories</h4>' + stars + '</div>' : ''}
    \${data.finalRec ? '<div class="verify-section"><h4>🎯 Final recommendation</h4><div class="verify-claim">' + data.finalRec + '</div></div>' : ''}
    <div class="verify-section"><h4>🔍 Research queries</h4>\${queries}</div>
    \${evidenceSection}
  \`;

  document.getElementById('verify-backdrop').classList.add('visible');
}

async function saveEvidence(slug) {
  const text = document.getElementById('evidence-text')?.value || '';
  if (!text.trim()) return;
  const r = await fetch('/api/save-evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportSlug: slug, evidenceText: text }),
  });
  const btn = document.querySelector('.save-evidence-btn');
  if (r.ok) {
    if (btn) { btn.textContent = '✅ Saved!'; setTimeout(() => { btn.textContent = 'Save to Report'; }, 2000); }
  } else {
    if (btn) { btn.textContent = '❌ Error'; setTimeout(() => { btn.textContent = 'Save to Report'; }, 2000); }
  }
}

function closeVerify() {
  document.getElementById('verify-backdrop').classList.remove('visible');
}

// ── Gap modal ──────────────────────────────────────────────────
function openGapModal(el) {
  const title = el.dataset.title || '';
  const detail = el.dataset.detail || '';
  const strategy = el.dataset.strategy || '';
  const why = el.dataset.why || '';

  document.getElementById('gap-modal-title').textContent = title;

  const sections = [];

  if (detail) {
    sections.push(\`<div class="gap-section">
      <div class="gap-section-label">What the gap is</div>
      <div class="gap-section-body">\${detail}</div>
    </div>\`);
  }

  if (strategy) {
    sections.push(\`<div class="gap-section gap-strategy">
      <div class="gap-section-label">How to address it</div>
      <div class="gap-section-body">\${strategy}</div>
    </div>\`);
  }

  if (why) {
    sections.push(\`<div class="gap-section gap-ok">
      <div class="gap-section-label">Why this doesn't block you</div>
      <div class="gap-section-body">\${why}</div>
    </div>\`);
  }

  if (!sections.length) {
    sections.push(\`<p class="gap-empty">No additional detail available for this gap.</p>\`);
  }

  document.getElementById('gap-modal-body').innerHTML = sections.join('');
  document.getElementById('gap-backdrop').classList.add('visible');
}

function closeGapModal() {
  document.getElementById('gap-backdrop').classList.remove('visible');
}

// ── Tier-legend modal ──────────────────────────────────────────
const TIER_LEGEND = ${JSON.stringify(TIER_LEGEND)};
const TIER_BY_CODE = Object.fromEntries(TIER_LEGEND.map(t => [t.code, t]));
function tierTooltipJS(code) {
  // Sub-tier variants (A2-AB, A2-AE, A2-PgM, A2-SA) map to A2.
  const base = (String(code).match(/^(A1|A2|B)/) || [])[1] || code;
  const t = TIER_BY_CODE[base];
  return t ? t.code + ' — ' + t.name + '. ' + t.summary : '';
}
let _tierLegendLastFocus = null;
function openTierLegend(highlightCode) {
  _tierLegendLastFocus = document.activeElement;
  const body = document.getElementById('tier-legend-body');
  const base = highlightCode ? (String(highlightCode).match(/^(A1|A2|B)/) || [])[1] : '';
  body.innerHTML = TIER_LEGEND.map(t => {
    const cls = (base && base === t.code) ? 'tier-legend-row tier-row-highlight' : 'tier-legend-row';
    return '<div class="' + cls + '">' +
      '<div class="tier-legend-code">' + esc(t.code) + '</div>' +
      '<div>' +
        '<div class="tier-legend-name">' + esc(t.name) + '</div>' +
        '<div class="tier-legend-summary">' + esc(t.summary) + '</div>' +
        '<div class="tier-legend-examples">Examples: ' + esc(t.examples) + '</div>' +
      '</div></div>';
  }).join('');
  const backdrop = document.getElementById('tier-legend-backdrop');
  backdrop.classList.add('visible');
  const close = backdrop.querySelector('.verify-close');
  if (close) close.focus();
}
function closeTierLegend() {
  document.getElementById('tier-legend-backdrop').classList.remove('visible');
  if (_tierLegendLastFocus && _tierLegendLastFocus.focus) {
    _tierLegendLastFocus.focus();
    _tierLegendLastFocus = null;
  }
}

let _equityLegendLastFocus = null;
function openEquityLegend() {
  _equityLegendLastFocus = document.activeElement;
  const backdrop = document.getElementById('equity-legend-backdrop');
  if (!backdrop) return;
  backdrop.classList.add('visible');
  const close = backdrop.querySelector('.verify-close');
  if (close) close.focus();
}
function closeEquityLegend() {
  const backdrop = document.getElementById('equity-legend-backdrop');
  if (!backdrop) return;
  backdrop.classList.remove('visible');
  if (_equityLegendLastFocus && _equityLegendLastFocus.focus) {
    _equityLegendLastFocus.focus();
    _equityLegendLastFocus = null;
  }
}

// ── Live stats refresh ──────────────────────────────────────────
async function refreshLiveStats() {
  const data = await apiFetch('/api/stats');
  if (!data) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.textContent = v; };
  set('live-apply-now', data.applyNow);
  set('live-total', data.totalEvals);
  set('live-applied', data.applied);
  set('live-pipeline', data.pipelinePending);
  set('live-scanned', data.scanned);
  set('live-batches', data.batch?.runs);
  const upd = document.getElementById('live-updated');
  if (upd && data.lastUpdated) {
    const t = new Date(data.lastUpdated).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles'
    });
    upd.textContent = 'Updated ' + t + ' PT';
    const meta = document.getElementById('dashboard-meta');
    if (meta) meta.title = data.lastUpdated;
  }
}

// ── Email-launcher state ────────────────────────────────────────
// Build-time payload: { sender:{name,oneSentenceLead}, templates:[{id,label,subject,body}] }
const EMAIL_LAUNCHER_DATA = ${emailLauncherPayload};
const EMAIL_USAGE_KEY = 'careerOps.emailLauncher.usage.v1';
let _emailActiveBtn = null;
let _emailOutsideHandler = null;

function _emailLoadUsage() {
  try {
    const raw = localStorage.getItem(EMAIL_USAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (_) { return {}; }
}

function _emailIncrUsage(id) {
  if (!id) return;
  const usage = _emailLoadUsage();
  usage[id] = (usage[id] || 0) + 1;
  try { localStorage.setItem(EMAIL_USAGE_KEY, JSON.stringify(usage)); } catch (_) {}
}

function _emailFillTemplate(tpl, vars) {
  // Replace {Token} placeholders. Unmatched tokens are left intact so
  // missing values are obvious to the user before they hit Send.
  const replace = (s) => String(s || '').replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null ? String(vars[k]) : m);
  return { subject: replace(tpl.subject), body: replace(tpl.body) };
}

function _emailDecodeHtml(s) {
  // The data attributes were HTML-escaped at build time. Convert
  // entities back to literal characters before they enter the mailto
  // URL — mailto encoders treat & and < as ordinary text.
  if (!s) return '';
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  return ta.value;
}

function openEmailPopover(btnEl) {
  closeEmailPopover();
  const pop = document.getElementById('email-popover');
  if (!pop || !btnEl) return;
  _emailActiveBtn = btnEl;
  const company = _emailDecodeHtml(btnEl.dataset.company || '');
  const role = _emailDecodeHtml(btnEl.dataset.role || '');
  const templates = (EMAIL_LAUNCHER_DATA && EMAIL_LAUNCHER_DATA.templates) || [];
  const usage = _emailLoadUsage();
  // Most-used first; ties keep the original (build-time) order, which
  // is the natural recruiter → warm → status flow.
  const sorted = templates.slice().map((t, i) => ({ t, i, n: usage[t.id] || 0 }))
    .sort((a, b) => (b.n - a.n) || (a.i - b.i))
    .map(x => x.t);
  pop.innerHTML = '<div class="email-popover-header">Draft email — ' + esc(company || '?') + '</div>'
    + sorted.map(t => {
      const n = usage[t.id] || 0;
      return '<button type="button" role="menuitem" class="email-popover-item" data-id="' + esc(t.id) + '">'
        + '<span>' + esc(t.label) + '</span>'
        + (n > 0 ? '<span class="email-popover-count">' + n + '×</span>' : '')
        + '</button>';
    }).join('');
  pop.querySelectorAll('.email-popover-item').forEach(btn => {
    btn.addEventListener('click', evt => {
      evt.stopPropagation();
      _emailLaunchById(btn.dataset.id, { company, role });
    });
  });
  // Anchor below the link, viewport-clamped (matches status-popover)
  const rect = btnEl.getBoundingClientRect();
  pop.classList.add('is-open');
  const popW = pop.offsetWidth || 220;
  let left = rect.left + window.scrollX;
  const maxLeft = window.scrollX + window.innerWidth - popW - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);
  pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  pop.style.left = left + 'px';
  _emailOutsideHandler = (evt) => {
    if (evt.target.closest('#email-popover')) return;
    if (evt.target === btnEl) return;
    closeEmailPopover();
  };
  setTimeout(() => document.addEventListener('click', _emailOutsideHandler), 0);
}

function closeEmailPopover() {
  const pop = document.getElementById('email-popover');
  if (pop) { pop.classList.remove('is-open'); pop.innerHTML = ''; }
  _emailActiveBtn = null;
  if (_emailOutsideHandler) {
    document.removeEventListener('click', _emailOutsideHandler);
    _emailOutsideHandler = null;
  }
}

// ── Pill popover (Equity / Base / Location detail) ─────────────
let _pillOutsideHandler = null;
let _pillActiveEl = null;
function openPillPopover(el) {
  const pop = document.getElementById('pill-popover');
  if (!pop || !el) return;
  if (_pillActiveEl === el && pop.classList.contains('is-open')) {
    closePillPopover();
    return;
  }
  let detail = {};
  try { detail = JSON.parse(el.getAttribute('data-pill') || '{}'); } catch (e) { return; }
  pop.innerHTML = _renderPillPopover(detail);
  pop.classList.add('is-open');
  pop.setAttribute('aria-hidden', 'false');
  _positionFloater(pop, el);
  _pillActiveEl = el;
  _pillOutsideHandler = (evt) => {
    if (evt.target.closest('#pill-popover')) return;
    if (evt.target === el || el.contains(evt.target)) return;
    closePillPopover();
  };
  setTimeout(() => document.addEventListener('click', _pillOutsideHandler), 0);
  document.addEventListener('keydown', _pillEscHandler);
}
function closePillPopover() {
  const pop = document.getElementById('pill-popover');
  if (pop) { pop.classList.remove('is-open'); pop.innerHTML = ''; pop.setAttribute('aria-hidden', 'true'); }
  _pillActiveEl = null;
  if (_pillOutsideHandler) {
    document.removeEventListener('click', _pillOutsideHandler);
    _pillOutsideHandler = null;
  }
  document.removeEventListener('keydown', _pillEscHandler);
}
function _pillEscHandler(e) { if (e.key === 'Escape') closePillPopover(); }
function _positionFloater(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  // Reset state so the next measurement reflects natural content height,
  // not the previous frame's clamped value.
  pop.style.visibility = 'hidden';
  pop.style.top = '0px'; pop.style.left = '0px';
  pop.style.maxHeight = ''; // let it measure natural size first
  pop.style.bottom = 'auto';
  // Force a reflow so we can measure natural dimensions.
  void pop.offsetHeight;
  const naturalH = pop.scrollHeight;
  const popW = pop.offsetWidth;
  const margin = 12;
  const gap = 6;
  const vpH = window.innerHeight;
  const vpW = window.innerWidth;
  // Available vertical space below vs above the chip, in viewport coords.
  const spaceBelow = vpH - r.bottom - margin;
  const spaceAbove = r.top - margin;
  // Decide orientation: prefer below if it fits naturally, else above if it
  // fits naturally. If neither fits, pick whichever side has more room and
  // CAP the height so we scroll internally instead of bleeding off-screen.
  let orientation; // 'below' | 'above'
  let maxH;
  if (naturalH <= spaceBelow) {
    orientation = 'below';
    maxH = spaceBelow;
  } else if (naturalH <= spaceAbove) {
    orientation = 'above';
    maxH = spaceAbove;
  } else if (spaceBelow >= spaceAbove) {
    orientation = 'below';
    maxH = Math.max(spaceBelow, 200); // never collapse below 200px
  } else {
    orientation = 'above';
    maxH = Math.max(spaceAbove, 200);
  }
  // Apply the measured max-height (in viewport coords) so the popover scrolls
  // internally rather than overflowing the page.
  pop.style.maxHeight = Math.min(maxH, vpH - 2 * margin) + 'px';
  // Re-measure after clamp (height may have shrunk).
  void pop.offsetHeight;
  const popH = pop.offsetHeight;
  // Vertical placement: viewport coords + scroll offset.
  let top = orientation === 'below'
    ? window.scrollY + r.bottom + gap
    : window.scrollY + r.top - popH - gap;
  // Final hard clamp: never let the top go above the viewport's visible top
  // or bottom go below visible bottom. (Belt-and-braces; the orientation
  // logic above should already prevent this.)
  const minTop = window.scrollY + margin;
  const maxTop = window.scrollY + vpH - popH - margin;
  if (top < minTop) top = minTop;
  if (top > maxTop) top = maxTop;
  // Horizontal placement: prefer left-aligned with the chip; clamp to viewport.
  let left = window.scrollX + r.left;
  if (left + popW > window.scrollX + vpW - margin) {
    left = window.scrollX + vpW - popW - margin;
  }
  if (left < window.scrollX + margin) left = window.scrollX + margin;
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
  pop.style.visibility = '';
  // Always start scrolled to top so the headline is visible — without this,
  // when the popover flips above and gets clamped, the previous scroll
  // position (or auto-scroll-to-bottom) hides the section labels.
  pop.scrollTop = 0;
}
function _renderPillPopover(d) {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  if (d.kind === 'equity') {
    if (d.empty) {
      return '<div class="pill-popover-kind">Equity / IPO posture</div>'
        + '<h4 class="pill-popover-headline">' + esc(d.company || '?') + ' — no entry yet</h4>'
        + '<div class="pill-popover-body pill-popover-empty">'
        + esc(d.hint || '') + '</div>'
        + '<div class="pill-popover-meta">Run <code>node scripts/overpay-signals.mjs</code> to enrich.</div>';
    }
    const sources = (d.sources || []).slice(0, 4)
      .map(u => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + '</a>').join('');
    return '<div class="pill-popover-kind">Equity / IPO posture · ' + esc(d.company) + '</div>'
      + '<h4 class="pill-popover-headline">' + esc((d.emoji ? d.emoji + ' ' : '') + d.label) + '</h4>'
      + '<div class="pill-popover-body">' + esc(d.posture || '') + '</div>'
      + (sources ? '<div class="pill-popover-sources">' + sources + '</div>' : '')
      + '<div class="pill-popover-meta">'
      + (d.confidence ? 'Confidence: ' + esc(d.confidence) + ' · ' : '')
      + (d.updated ? 'As of ' + esc(d.updated) : '')
      + '</div>';
  }
  if (d.kind === 'base') {
    if (d.empty) {
      return '<div class="pill-popover-kind">Base salary</div>'
        + '<h4 class="pill-popover-headline">Not parseable</h4>'
        + '<div class="pill-popover-body pill-popover-empty">'
        + (d.raw ? 'Raw comp string from report:<br><code>' + esc(d.raw.slice(0, 240)) + '</code>' : esc(d.hint || ''))
        + '</div>';
    }
    const tier = d.min >= (d.floors && d.floors.target ? d.floors.target : 200)
      ? 'meets target floor' : (d.min >= 175 ? 'meets minimum floor' : 'below floor');
    return '<div class="pill-popover-kind">Base salary</div>'
      + '<h4 class="pill-popover-headline">' + esc(d.range || d.label) + '</h4>'
      + '<dl class="pill-popover-body">'
      + '<div class="pill-popover-row"><dt>Currency</dt><dd>' + esc(d.currency || '?') + '</dd></div>'
      + '<div class="pill-popover-row"><dt>Type</dt><dd>' + (d.isTotalComp ? 'Total comp' : 'Base salary') + '</dd></div>'
      + '<div class="pill-popover-row"><dt>Tier</dt><dd>' + esc(tier) + '</dd></div>'
      + '</dl>'
      + (d.raw ? '<div class="pill-popover-meta">From report Block A:<br><code style="font-size:10px">'
          + esc(d.raw.slice(0, 200)) + '</code></div>' : '');
  }
  if (d.kind === 'location') {
    if (d.empty) {
      return '<div class="pill-popover-kind">Location</div>'
        + '<h4 class="pill-popover-headline">Not parsed</h4>'
        + '<div class="pill-popover-body pill-popover-empty">' + esc(d.hint || '') + '</div>'
        + (d.relocation ? _renderRelocationBlock(d.relocation) : '');
    }
    return '<div class="pill-popover-kind">Location</div>'
      + '<h4 class="pill-popover-headline">' + esc((d.icon ? d.icon + ' ' : '') + d.label) + '</h4>'
      + '<dl class="pill-popover-body">'
      + (d.kindLabel ? '<div class="pill-popover-row"><dt>Type</dt><dd>' + esc(d.kindLabel) + '</dd></div>' : '')
      + (d.city ? '<div class="pill-popover-row"><dt>City</dt><dd>' + esc(d.city) + '</dd></div>' : '')
      + (d.status ? '<div class="pill-popover-row"><dt>Match</dt><dd>' + esc(d.status) + ' (vs preferred metros)</dd></div>' : '')
      + '</dl>'
      + (d.raw ? '<div class="pill-popover-meta">From report Block A:<br><code style="font-size:10px">'
          + esc(d.raw.slice(0, 200)) + '</code></div>' : '')
      + (d.relocation ? _renderRelocationBlock(d.relocation) : '');
  }
  if (d.kind === 'benefits') {
    if (d.empty) {
      return '<div class="pill-popover-kind">Benefits + Sentiment</div>'
        + '<h4 class="pill-popover-headline">Not researched yet</h4>'
        + '<div class="pill-popover-body pill-popover-empty">' + esc(d.hint || '') + '</div>'
        + '<div class="pill-popover-meta">Run <code>node scripts/enrich-roles.mjs --top=5</code> to populate.</div>';
    }
    const b = d.benefits || {};
    const s = d.sentiment || {};
    const tox = s.team_toxicity_grade;
    const toxLabel = tox ? tox + '/5 (1=healthy, 5=avoid)' : 'unknown';
    const row = (label, val) => val && val !== 'unknown'
      ? '<div class="pill-popover-row"><dt>' + esc(label) + '</dt><dd>' + esc(String(val)) + '</dd></div>'
      : '';
    return '<div class="pill-popover-kind">Benefits · ' + esc(d.company || '') + '</div>'
      + '<h4 class="pill-popover-headline">Team health: ' + esc(toxLabel) + '</h4>'
      + '<div class="pill-popover-section-label">Comp + retirement</div>'
      + '<dl class="pill-popover-body">'
      + row('401(k) match', b['401k_match'])
      + row('Estimated copay', b.estimated_copay)
      + '</dl>'
      + '<div class="pill-popover-section-label">Health</div>'
      + '<dl class="pill-popover-body">'
      + row('Healthcare', b.healthcare)
      + row('Dental + vision', b.dental_vision)
      + row('Mental health', b.mental_health)
      + '</dl>'
      + '<div class="pill-popover-section-label">Day-to-day</div>'
      + '<dl class="pill-popover-body">'
      + row('Meals', b.meals_provided)
      + row('Other perks', b.other_perks)
      + '</dl>'
      + '<div class="pill-popover-section-label">Sentiment signals</div>'
      + '<dl class="pill-popover-body">'
      + row('Blind', s.blind_score)
      + row('Glassdoor', s.glassdoor_score)
      + row('Reddit pulse', s.reddit_pulse)
      + row('X / Twitter', s.x_pulse)
      + '</dl>'
      + _renderSocialCorroborationBlock(d.social)
      + _renderBiweeklyMathBlock(d.biweekly_math)
      + (d.confidence ? '<div class="pill-popover-meta">Confidence: ' + esc(d.confidence) + '</div>' : '');
  }
  if (d.kind === 'people') {
    if (d.empty) {
      return '<div class="pill-popover-kind">Recruiter + Hiring Manager</div>'
        + '<h4 class="pill-popover-headline">Not researched yet</h4>'
        + '<div class="pill-popover-body pill-popover-empty">' + esc(d.hint || '') + '</div>'
        + '<div class="pill-popover-meta">Run <code>node scripts/enrich-roles.mjs --top=5</code> to populate.</div>';
    }
    const personBlock = (label, p) => {
      if (!p || !p.name || p.name === 'unknown') {
        return '<div class="pill-popover-section-label">' + esc(label) + '</div>'
          + '<div class="pill-popover-empty">Not confidently identified — '
          + (p && p.rationale ? esc(p.rationale.slice(0, 200)) : 'manual LinkedIn search recommended')
          + '</div>';
      }
      let linkedin;
      if (!p.linkedin_url || p.linkedin_url === 'unknown') {
        linkedin = esc(p.name) + ' <span class="pill-popover-meta-inline">(LinkedIn unknown)</span>';
      } else if (p.linkedin_kind === 'search') {
        // Synthetic URL replaced with a real LinkedIn people-search query.
        linkedin = esc(p.name) + ' '
          + '<a href="' + esc(p.linkedin_url) + '" target="_blank" rel="noopener" class="pill-popover-linkedin-link">→ Search LinkedIn</a>';
      } else {
        linkedin = '<a href="' + esc(p.linkedin_url) + '" target="_blank" rel="noopener" class="pill-popover-linkedin-link">' + esc(p.name) + ' → LinkedIn</a>';
      }
      return '<div class="pill-popover-section-label">' + esc(label) + '</div>'
        + '<div class="pill-popover-body">' + linkedin + '</div>'
        + (p.rationale ? '<div class="pill-popover-meta-inline">' + esc(p.rationale) + '</div>' : '');
    };
    return '<div class="pill-popover-kind">People · ' + esc(d.company || '') + '</div>'
      + '<h4 class="pill-popover-headline">' + esc(d.role || '') + '</h4>'
      + _renderNetworkBlock(d.network)
      + personBlock('Likely recruiter', d.recruiter)
      + personBlock('Likely hiring manager', d.hiring_manager)
      + (d.confidence ? '<div class="pill-popover-meta">Confidence: ' + esc(d.confidence) + '</div>' : '');
  }
  return '<div class="pill-popover-empty">No detail available.</div>';
}
// Social-corroboration block — surfaces what Grok's x_search found about
// employees actually posting about comp/benefits/team-toxicity on Blind, X,
// Reddit. Renders only when populated by scripts/enrich-roles-corroborate.mjs.
// Network block — Mitchell's 1st-degree LinkedIn contacts at this company
// (from data/linkedin/Connections.csv) and 2nd-degree (from a Chrome-scrape
// pass against linkedin.com/company/{slug}/people?facetNetwork=S).
function _renderNetworkBlock(n) {
  if (!n || (n.firstDegreeCount === 0 && n.secondDegreeCount === 0)) return '';
  const esc = (str) => String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const introsLine = (c) => {
    // For 2nd-degree contacts: render warm-intro paths if mutuals are resolved.
    // c.mutuals_resolved comes from networkSummary in lib/linkedin-network.mjs
    // and only contains entries whose name matched a 1st-degree contact.
    const resolved = (c.mutuals_resolved || []).filter(m => m.url);
    if (!resolved.length) return '';
    const top = resolved.slice(0, 3).map(m => {
      // Pre-fill a LinkedIn message URL asking for the intro.
      const subject = encodeURIComponent('Quick intro request');
      const messageUrl = m.url ? m.url + '#' : '';
      return '<a href="' + esc(m.url) + '" target="_blank" rel="noopener" class="warm-intro-target">' + esc(m.name) + '</a>';
    }).join(', ');
    const overflow = resolved.length > 3 ? ' + ' + (resolved.length - 3) + ' more' : '';
    return '<div class="network-warm-intro">→ ask ' + top + overflow + ' to intro</div>';
  };
  const contactRow = (c) => {
    const name = ((c.first || '') + ' ' + (c.last || '')).trim() || (c.name || '');
    const url = c.url || '';
    const title = c.position || c.title || '';
    const when = c.when ? ' · ' + c.when : '';
    const link = url
      ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="pill-popover-linkedin-link">' + esc(name) + ' →</a>'
      : esc(name);
    return '<div class="network-contact-row">'
      +   '<div class="network-contact-name">' + link + '</div>'
      +   (title ? '<div class="network-contact-title">' + esc(title) + esc(when) + '</div>' : '')
      +   introsLine(c)
      + '</div>';
  };
  let html = '';
  if (n.firstDegreeCount > 0) {
    html += '<div class="pill-popover-section-label">🤝 Your 1st-degree at this company (' + n.firstDegreeCount + ')</div>'
      + '<div class="pill-popover-body network-list">'
      + (n.firstDegree || []).slice(0, 10).map(contactRow).join('')
      + (n.firstDegreeCount > 10 ? '<div class="pill-popover-meta-inline">+ ' + (n.firstDegreeCount - 10) + ' more</div>' : '')
      + '</div>';
  }
  if (n.secondDegreeCount > 0) {
    html += '<div class="pill-popover-section-label">🤝² 2nd-degree at this company (' + n.secondDegreeCount + ')</div>'
      + '<div class="pill-popover-body network-list">'
      + (n.secondDegree || []).slice(0, 8).map(contactRow).join('')
      + (n.secondDegreeCount > 8 ? '<div class="pill-popover-meta-inline">+ ' + (n.secondDegreeCount - 8) + ' more — see scraped JSON</div>' : '')
      + (n.secondDegreeMeta?.generated_at ? '<div class="pill-popover-meta-inline">Scraped ' + esc(n.secondDegreeMeta.generated_at.slice(0, 10)) + '</div>' : '')
      + '</div>';
  }
  return html;
}

function _renderBiweeklyMathBlock(m) {
  if (!m) return '';
  const esc = (str) => String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmt = (n) => n != null ? '$' + Number(n).toLocaleString() : '—';
  const tierRow = (label, t) => {
    if (!t) return '';
    return '<tr>'
      + '<td class="bw-tier">' + esc(label) + '</td>'
      + '<td>' + fmt(t.gross_biweekly) + '</td>'
      + '<td class="bw-take">' + fmt(t.est_take_home) + '</td>'
      + '<td class="bw-match">+' + fmt(t.employer_match_est) + '</td>'
      + '</tr>';
  };
  return '<div class="pill-popover-section-label">Biweekly paycheck estimate (10% 401k, single filer)</div>'
    + '<table class="bw-table">'
    + '<thead><tr><th>Base</th><th>Gross/check</th><th>~Take-home</th><th>Co. match</th></tr></thead>'
    + '<tbody>'
    + tierRow('$200K', m.at_200k)
    + tierRow('$250K', m.at_250k)
    + tierRow('$300K', m.at_300k)
    + '</tbody>'
    + '</table>';
}

function _renderSocialCorroborationBlock(s) {
  if (!s) return '';
  const esc = (str) => String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const has = (v) => v && v !== 'unknown' && v !== 'no public signal' && v !== 'no Blind evidence found' && v !== 'no X evidence found' && v !== 'none surfaced' && v !== 'none identified';
  const row = (label, val) => has(val)
    ? '<div class="pill-popover-row"><dt>' + esc(label) + '</dt><dd>' + esc(String(val).slice(0, 360)) + '</dd></div>'
    : '';
  const comp = s.comp_corroboration || {};
  const ben = s.benefits_corroboration || {};
  const sent = s.sentiment_corroboration || {};
  const ppl = s.people_corroboration || {};
  // Aggregate "any signal" check — skip the whole block if Grok came back
  // entirely empty (saves vertical space in the popover).
  const anyHit = [
    comp.blind_thread_evidence, comp.x_twitter_evidence, comp.leveling_evidence,
    ben['401k_signal'], ben.healthcare_signal, ben.mental_health_signal,
    sent.blind_recent_posts, sent.x_team_signal, sent.reddit_signal,
    sent.biggest_red_flag_in_socials, sent.biggest_green_flag_in_socials,
    ppl.recommended_outreach_target, ppl.named_employees_posting,
  ].some(has);
  if (!anyHit) return '';
  const toxOverride = sent.toxicity_grade_corroborated;
  return '<div class="pill-popover-section-label" style="margin-top:14px">🔎 Social corroboration (Grok + X + Web search)</div>'
    + (toxOverride ? '<div class="pill-popover-meta-inline">Social-only toxicity grade: <strong>' + esc(String(toxOverride)) + '/5</strong></div>' : '')
    + (has(sent.biggest_red_flag_in_socials)
        ? '<div class="pill-popover-row"><dt>🚩 Red flag</dt><dd>' + esc(String(sent.biggest_red_flag_in_socials).slice(0, 300)) + '</dd></div>'
        : '')
    + (has(sent.biggest_green_flag_in_socials)
        ? '<div class="pill-popover-row"><dt>✅ Green flag</dt><dd>' + esc(String(sent.biggest_green_flag_in_socials).slice(0, 300)) + '</dd></div>'
        : '')
    + (has(comp.agreement_with_council)
        ? '<div class="pill-popover-row"><dt>Comp agreement</dt><dd>' + esc(String(comp.agreement_with_council).slice(0, 200)) + '</dd></div>'
        : '')
    + (has(comp.blind_thread_evidence) || has(comp.leveling_evidence)
        ? '<div class="pill-popover-section-label">Comp evidence</div><dl class="pill-popover-body">'
          + row('Blind threads', comp.blind_thread_evidence)
          + row('Levels.fyi', comp.leveling_evidence)
          + row('X / Twitter', comp.x_twitter_evidence)
          + '</dl>'
        : '')
    + (has(sent.blind_recent_posts) || has(sent.reddit_signal) || has(sent.x_team_signal)
        ? '<div class="pill-popover-section-label">Last 90d sentiment</div><dl class="pill-popover-body">'
          + row('Blind (90d)', sent.blind_recent_posts)
          + row('Reddit', sent.reddit_signal)
          + row('X team posts', sent.x_team_signal)
          + '</dl>'
        : '')
    + (has(ppl.recommended_outreach_target) || has(ppl.named_employees_posting)
        ? '<div class="pill-popover-section-label">People intel</div><dl class="pill-popover-body">'
          + row('Outreach target', ppl.recommended_outreach_target)
          + row('Posting employees', ppl.named_employees_posting)
          + row('Team visibility', ppl.hiring_team_visibility)
          + '</dl>'
        : '');
}

function _renderRelocationBlock(r) {
  if (!r) return '';
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const has = (v) => v && v !== 'unknown';
  if (!has(r.package_summary) && !has(r.amount_estimate_usd) && !has(r.policy_notes)) return '';
  return '<div class="pill-popover-section-label" style="margin-top:10px">✈ Relocation</div>'
    + '<div class="pill-popover-body">'
    + (has(r.amount_estimate_usd) ? '<div><strong>' + esc(r.amount_estimate_usd) + '</strong></div>' : '')
    + (has(r.package_summary) ? '<div>' + esc(r.package_summary) + '</div>' : '')
    + (has(r.policy_notes) ? '<div class="pill-popover-meta-inline">' + esc(r.policy_notes) + '</div>' : '')
    + '</div>';
}
window.openPillPopover = openPillPopover;
window.closePillPopover = closePillPopover;

// System health popover — opens from the mc-health pill in the toolbar.
// Fetches /api/batch-live for live state, then layers on counts already
// available in the rendered DOM (live-applied, live-pipeline, etc.).
async function openHealthPopover(anchor) {
  // Reuse the pill-popover singleton + positioning logic.
  const pop = document.getElementById('pill-popover');
  if (!pop || !anchor) return;
  // If already open from this anchor, toggle closed.
  if (typeof closePillPopover === 'function' &&
      pop.classList.contains('is-open') &&
      pop.dataset.healthAnchor === '1') {
    closePillPopover();
    pop.dataset.healthAnchor = '';
    return;
  }
  // Pull fresh data with a short skeleton state so the popover opens snappy.
  pop.innerHTML = _renderHealthPopover({ loading: true });
  pop.classList.add('is-open');
  pop.dataset.healthAnchor = '1';
  _positionFloater(pop, anchor);
  let data = {};
  try {
    const r = await fetch('/api/batch-live', { cache: 'no-cache' });
    if (r.ok) data = await r.json();
  } catch (_) {}
  // Layer in the rendered-DOM counts.
  const dom = {
    applied:    parseInt(document.getElementById('live-applied')?.textContent || '0', 10) || 0,
    pipeline:   parseInt(document.getElementById('live-pipeline')?.textContent || '0', 10) || 0,
    applyNow:   parseInt(document.getElementById('live-apply-now')?.textContent || '0', 10) || 0,
    total:      parseInt(document.getElementById('live-total')?.textContent || '0', 10) || 0,
    scanned:    parseInt(document.getElementById('live-scanned')?.textContent || '0', 10) || 0,
    lastScan:   document.getElementById('live-text')?.textContent || '',
    healthText: document.getElementById('mc-health-text')?.textContent || '',
    batchText:  document.getElementById('mc-batch-text')?.textContent || '',
  };
  pop.innerHTML = _renderHealthPopover({ data, dom });
  _positionFloater(pop, anchor);
}
function _renderHealthPopover(opts) {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  if (opts.loading) {
    return '<div class="pill-popover-kind">System Health</div>'
      + '<h4 class="pill-popover-headline">Loading…</h4>'
      + '<div class="pill-popover-body pill-popover-empty">Fetching live batch + scan state.</div>';
  }
  const { data, dom } = opts;
  const b = data.batch || {};
  const h = data.health || {};
  const row = (label, val) => val !== undefined && val !== null && val !== ''
    ? '<div class="pill-popover-row"><dt>' + esc(label) + '</dt><dd>' + esc(String(val)) + '</dd></div>'
    : '';
  const fmtAge = (ms) => {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'unknown';
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60)    return s + 's ago';
    if (s < 3600)  return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  };
  const overallStatus = h.status || 'healthy';
  const statusEmoji = overallStatus === 'healthy' ? '🟢' : overallStatus === 'degraded' ? '🟡' : '🔴';
  return '<div class="pill-popover-kind">System Health</div>'
    + '<h4 class="pill-popover-headline">' + statusEmoji + ' ' + esc(overallStatus.toUpperCase()) + '</h4>'
    + '<div class="pill-popover-section-label">Pipeline activity</div>'
    + '<dl class="pill-popover-body">'
    + row('Apply-Now ≥4.0', dom.applyNow)
    + row('Total evaluations', dom.total)
    + row('Pipeline pending', dom.pipeline)
    + row('In-flight applications', dom.applied)
    + row('URLs scanned (lifetime)', dom.scanned)
    + '</dl>'
    + '<div class="pill-popover-section-label">Batch processor</div>'
    + '<dl class="pill-popover-body">'
    + row('State', b.state || 'idle')
    + row('Completed', (b.completed != null ? b.completed : '—') + (b.total ? ' / ' + b.total : ''))
    + row('Failed', b.failed)
    + row('Running', b.running)
    + row('Last activity', b.mostRecentIso ? fmtAge(Date.now() - new Date(b.mostRecentIso).getTime()) : 'never')
    + '</dl>'
    + '<div class="pill-popover-section-label">Scan freshness</div>'
    + '<dl class="pill-popover-body">'
    + row('Last scan', dom.lastScan || 'unknown')
    + row('Scanner heartbeat', h.scanAgeMs != null ? fmtAge(h.scanAgeMs) : 'unknown')
    + row('Failed jobs (24h)', h.failed24h)
    + row('In-flight workers', h.inFlight)
    + '</dl>'
    + '<div class="pill-popover-meta">Refresh by closing + reopening; auto-polls every 30s on the strip itself.</div>';
}
window.openHealthPopover = openHealthPopover;

function _emailLaunchById(id, ctx) {
  const tpl = (EMAIL_LAUNCHER_DATA.templates || []).find(t => t.id === id);
  if (!tpl) { closeEmailPopover(); return; }
  const sender = (EMAIL_LAUNCHER_DATA && EMAIL_LAUNCHER_DATA.sender) || {};
  const filled = _emailFillTemplate(tpl, {
    Company: ctx.company || '',
    Role: ctx.role || '',
    YourName: sender.name || '',
    OneSentenceLead: sender.oneSentenceLead || '',
  });
  const url = 'mailto:?subject=' + encodeURIComponent(filled.subject)
    + '&body=' + encodeURIComponent(filled.body);
  _emailIncrUsage(id);
  closeEmailPopover();
  // window.open with _self lets the OS handler intercept; falls back
  // gracefully to direct nav if the browser blocks the new context.
  try { window.location.href = url; }
  catch (_) { window.open(url, '_self'); }
}

window.openEmailPopover = openEmailPopover;
window.closeEmailPopover = closeEmailPopover;

// ── Cmd-K command palette ───────────────────────────────────────
const CMDK_DATA = ${cmdkPayload};
let _cmdkOpen = false;
let _cmdkActive = 0;
let _cmdkItems = [];
let _cmdkPrevFocus = null;

function _cmdkActions() {
  return [
    { id: 'act-dark', icon: '◐', title: 'Toggle dark mode', sub: 'Switch between light and dark theme', run: () => toggleDark() },
    { id: 'act-oled', icon: '⬛', title: 'Toggle OLED black mode', sub: 'Pure-black surfaces — AMOLED power savings + extra visual depth (dark mode only)', run: () => toggleOled() },
    { id: 'act-demo', icon: '🎭', title: 'Toggle demo mode', sub: 'Swap real candidate data for fake names — safe for screen sharing', run: () => toggleDemoMode() },
    { id: 'act-top',  icon: '↑', title: 'Scroll to top of dashboard', sub: 'Jump to the page header', run: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { id: 'act-apply', icon: '✦', title: 'Open Apply-Now panel', sub: 'Scroll to ranked apply-now queue', run: () => {
      const el = document.getElementById('apply-now-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } },
    { id: 'act-batch', icon: '⚡', title: 'Batch progress', sub: 'Scroll to batch progress in sidebar', run: () => {
      const el = document.getElementById('sidebar-batch');
      if (el && el.style.display !== 'none') el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      else toast('No batch running', 'info');
    } },
    { id: 'act-scan', icon: '⟳', title: 'Run scan (show command)', sub: 'Display the shell command to run a portal scan', run: () => {
      toast('Run in terminal: node scan.mjs', 'info');
    } },
    { id: 'act-select-mode', icon: '☑', title: 'Toggle select mode', sub: 'Show / hide row checkboxes for bulk status updates', run: () => toggleSelectMode() },
    { id: 'act-add-role', icon: '+', title: 'Add role', sub: 'Paste a role URL — appends to pipeline.md for next triage', run: () => openQuickAdd() },
    { id: 'act-inline-expand', icon: '↕', title: (useInlineExpand() ? 'Use right rail instead' : 'Use inline expand instead'), sub: 'Switch row detail UX between inline expand-row and right-rail drawer', run: () => {
      const next = !useInlineExpand();
      setUseInlineExpand(next);
      if (window.toast) window.toast(next ? 'Row detail: inline expand' : 'Row detail: right-rail drawer', 'success');
    } },
  ];
}

function _cmdkBuildItems(query) {
  const q = (query || '').trim().toLowerCase();
  const items = [];
  const actions = _cmdkActions();
  const matchedActions = q
    ? actions.filter(a => a.title.toLowerCase().includes(q) || (a.sub || '').toLowerCase().includes(q))
    : actions;
  if (matchedActions.length) {
    items.push({ section: 'Actions' });
    for (const a of matchedActions) items.push({ kind: 'action', ...a });
  }
  const savedViews = (typeof loadSavedViews === 'function') ? loadSavedViews() : [];
  const matchedViews = q
    ? savedViews.filter(v => v.name.toLowerCase().includes(q) || ('view ' + v.name).toLowerCase().includes(q))
    : savedViews;
  if (matchedViews.length) {
    items.push({ section: 'Saved views' });
    for (const v of matchedViews) {
      items.push({
        kind: 'action',
        id: 'view-' + v.name,
        icon: '⌖',
        title: 'View: ' + v.name,
        sub: _summarizeFilters(v.filters),
        run: () => applySavedView(v),
      });
    }
  }
  const rows = CMDK_DATA.rows || [];
  let matchedRows = rows;
  if (q) {
    matchedRows = rows.filter(r =>
      (r.company || '').toLowerCase().includes(q) ||
      (r.role || '').toLowerCase().includes(q) ||
      String(r.num).startsWith(q) ||
      (r.archetype || '').toLowerCase() === q
    );
  }
  matchedRows = matchedRows.slice(0, q ? 25 : 12);
  if (matchedRows.length) {
    items.push({ section: 'Jump to row' });
    for (const r of matchedRows) {
      items.push({
        kind: 'row',
        id: 'row-' + r.num,
        icon: r.score >= 4 ? '★' : '·',
        title: r.company + ' — ' + r.role,
        sub: '#' + r.num + (r.archetype ? ' · ' + r.archetype : '') + (r.status ? ' · ' + r.status : ''),
        meta: (r.score || 0).toFixed(1),
        rowId: r.rowId,
        num: r.num,
      });
    }
  }
  const reports = CMDK_DATA.reports || [];
  const matchedReports = q
    ? reports.filter(r => r.title.toLowerCase().includes(q))
    : reports;
  if (matchedReports.length) {
    items.push({ section: 'Recent reports' });
    for (const r of matchedReports) {
      items.push({
        kind: 'report',
        id: 'rep-' + r.slug,
        icon: '📄',
        title: r.title,
        sub: r.date ? 'Generated ' + r.date : '',
        slug: r.slug,
      });
    }
  }
  return items;
}

function _cmdkRender() {
  const list = document.getElementById('cmdk-list');
  if (!list) return;
  const flat = _cmdkItems.filter(it => it.kind);
  if (!flat.length) {
    list.innerHTML = '<div class="cmdk-empty">No matches</div>';
    return;
  }
  let activeFlat = 0;
  let html = '';
  let flatIdx = 0;
  for (const it of _cmdkItems) {
    if (it.section) {
      html += '<div class="cmdk-section-label">' + it.section + '</div>';
      continue;
    }
    const isActive = flatIdx === _cmdkActive;
    if (isActive) activeFlat = flatIdx;
    html += '<div class="cmdk-item' + (isActive ? ' active' : '') + '" role="option" data-flat="' + flatIdx + '">'
         + '<span class="cmdk-item-icon">' + it.icon + '</span>'
         + '<div class="cmdk-item-body">'
         + '<div class="cmdk-item-title">' + _cmdkEsc(it.title) + '</div>'
         + (it.sub ? '<div class="cmdk-item-sub">' + _cmdkEsc(it.sub) + '</div>' : '')
         + '</div>'
         + (it.meta ? '<span class="cmdk-item-meta">' + _cmdkEsc(it.meta) + '</span>' : '')
         + '</div>';
    flatIdx++;
  }
  list.innerHTML = html;
  list.querySelectorAll('.cmdk-item').forEach(el => {
    el.addEventListener('mousemove', () => {
      const i = parseInt(el.dataset.flat, 10);
      if (i !== _cmdkActive) { _cmdkActive = i; _cmdkRender(); }
    });
    el.addEventListener('click', () => {
      _cmdkActive = parseInt(el.dataset.flat, 10);
      _cmdkExecute();
    });
  });
  const activeEl = list.querySelector('.cmdk-item.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function _cmdkEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function _cmdkRefresh() {
  const input = document.getElementById('cmdk-input');
  _cmdkItems = _cmdkBuildItems(input ? input.value : '');
  const flatCount = _cmdkItems.filter(it => it.kind).length;
  if (_cmdkActive >= flatCount) _cmdkActive = 0;
  _cmdkRender();
}

function openCmdK() {
  if (_cmdkOpen) return;
  _cmdkOpen = true;
  _cmdkPrevFocus = document.activeElement;
  const bd = document.getElementById('cmdk-backdrop');
  const input = document.getElementById('cmdk-input');
  if (!bd || !input) return;
  bd.classList.add('visible');
  input.value = '';
  _cmdkActive = 0;
  _cmdkRefresh();
  setTimeout(() => input.focus(), 0);
}

function closeCmdK() {
  if (!_cmdkOpen) return;
  _cmdkOpen = false;
  const bd = document.getElementById('cmdk-backdrop');
  if (bd) bd.classList.remove('visible');
  if (_cmdkPrevFocus && typeof _cmdkPrevFocus.focus === 'function') {
    try { _cmdkPrevFocus.focus(); } catch (e) {}
  }
}

function _cmdkExecute() {
  const flat = _cmdkItems.filter(it => it.kind);
  const it = flat[_cmdkActive];
  if (!it) return;
  closeCmdK();
  if (it.kind === 'action') {
    setTimeout(() => it.run(), 30);
  } else if (it.kind === 'row') {
    setTimeout(() => _cmdkJumpToRow(it.rowId, it.num), 30);
  } else if (it.kind === 'report') {
    window.open('reports/' + it.slug, '_blank', 'noopener');
  }
}

function _cmdkJumpToRow(rowId, num) {
  const tbody = document.getElementById('all-tbody');
  if (!tbody) return;
  let row = rowId ? tbody.querySelector('tr.row[data-row-id="' + rowId + '"]') : null;
  if (!row && num != null) row = tbody.querySelector('tr.row[data-num="' + num + '"]');
  if (!row) { toast('Row not found', 'info'); return; }
  // Clear filters so the row is visible
  const ft = document.getElementById('filter-text');
  const fT = document.getElementById('filter-tier');
  const fS = document.getElementById('filter-score');
  const fSt = document.getElementById('filter-status');
  const fEq = document.getElementById('filter-equity');
  if (ft) ft.value = '';
  if (fT) fT.value = '';
  if (fS) fS.value = '';
  if (fSt) fSt.value = '';
  if (fEq) fEq.value = '';
  if (typeof applyFilters === 'function') applyFilters();
  row.style.display = '';
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.remove('cmdk-flash');
  // Force reflow so the animation re-triggers each invocation.
  void row.offsetWidth;
  row.classList.add('cmdk-flash');
  setTimeout(() => row.classList.remove('cmdk-flash'), 1700);
}

document.addEventListener('keydown', e => {
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
  const cmdK = (isMac ? e.metaKey : e.ctrlKey) && (e.key === 'k' || e.key === 'K');
  if (cmdK) {
    e.preventDefault();
    if (_cmdkOpen) closeCmdK(); else openCmdK();
    return;
  }
  if (!_cmdkOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); closeCmdK(); return; }
  if (e.key === 'Tab') { e.preventDefault(); return; } // focus trap
  const flat = _cmdkItems.filter(it => it.kind);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (flat.length) { _cmdkActive = (_cmdkActive + 1) % flat.length; _cmdkRender(); }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (flat.length) { _cmdkActive = (_cmdkActive - 1 + flat.length) % flat.length; _cmdkRender(); }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    _cmdkExecute();
  } else if (e.key === 'Home') {
    e.preventDefault();
    _cmdkActive = 0; _cmdkRender();
  } else if (e.key === 'End') {
    e.preventDefault();
    _cmdkActive = Math.max(0, flat.length - 1); _cmdkRender();
  }
});

// Script runs after DOM is parsed (placed at end of body); attach immediately.
(function _cmdkInit() {
  const input = document.getElementById('cmdk-input');
  if (input) input.addEventListener('input', () => { _cmdkActive = 0; _cmdkRefresh(); });
})();

// ── Keyboard shortcuts ──────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (typeof _cmdkOpen !== 'undefined' && _cmdkOpen) return;
  if (e.key === 'Escape') { closeVerify(); closeGapModal(); closeTierLegend(); closeStatusPopover(); closeQuickAdd(); }
});

// ── Inline status writeback ─────────────────────────────────────
const STATUS_CANONICAL = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP'];
const STATUS_CLASS_MAP = {
  evaluated: 'status-evaluated',
  applied:   'status-applied',
  responded: 'status-evaluated',
  interview: 'status-interview',
  offer:     'status-offer',
  rejected:  'status-rejected',
  discarded: 'status-discarded',
  skip:      'status-discarded',
};
let _statusActiveBadge = null;
let _statusOutsideHandler = null;

${STATUS_BADGE_CLASS_SOURCE}
const statusClassFor = statusBadgeClass;

function clearStatusClasses(el) {
  el.classList.remove('status-evaluated','status-applied','status-interview','status-offer','status-rejected','status-discarded');
}

function openStatusPopover(badgeEl) {
  closeStatusPopover();
  const pop = document.getElementById('status-popover');
  if (!pop || !badgeEl) return;
  _statusActiveBadge = badgeEl;
  const current = (badgeEl.textContent || '').trim();
  pop.innerHTML = STATUS_CANONICAL.map(s => {
    const isCurrent = s.toLowerCase() === current.toLowerCase();
    const cls = STATUS_CLASS_MAP[s.toLowerCase()] || 'status-evaluated';
    return '<button type="button" role="menuitem" class="status-popover-item' + (isCurrent ? ' is-current' : '') + '" data-status="' + s + '">'
      + '<span class="status-popover-dot badge ' + cls + '" aria-hidden="true" style="padding:0;min-height:0;width:8px;height:8px;border-radius:50%"></span>'
      + s + (isCurrent ? ' ✓' : '')
      + '</button>';
  }).join('');
  pop.querySelectorAll('.status-popover-item').forEach(btn => {
    btn.addEventListener('click', evt => {
      evt.stopPropagation();
      applyStatus(btn.dataset.status);
    });
  });
  // Anchor below the badge, viewport-clamped
  const rect = badgeEl.getBoundingClientRect();
  pop.classList.add('is-open');
  const popW = pop.offsetWidth || 160;
  let left = rect.left + window.scrollX;
  const maxLeft = window.scrollX + window.innerWidth - popW - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);
  pop.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
  pop.style.left = left + 'px';
  // Outside-click to close (next tick so we don't catch the opening click)
  _statusOutsideHandler = (evt) => {
    if (evt.target.closest('#status-popover')) return;
    if (evt.target === badgeEl) return;
    closeStatusPopover();
  };
  setTimeout(() => document.addEventListener('click', _statusOutsideHandler), 0);
}

function closeStatusPopover() {
  const pop = document.getElementById('status-popover');
  if (pop) { pop.classList.remove('is-open'); pop.innerHTML = ''; }
  _statusActiveBadge = null;
  if (_statusOutsideHandler) {
    document.removeEventListener('click', _statusOutsideHandler);
    _statusOutsideHandler = null;
  }
}

async function applyStatus(newStatus) {
  if (!_statusActiveBadge) return;
  const badge = _statusActiveBadge;
  const num = badge.dataset.num;
  const original = (badge.textContent || '').trim();
  if (!num) { closeStatusPopover(); return; }
  if (newStatus === original) { closeStatusPopover(); return; }
  const tr = badge.closest('tr');
  const originalRowStatus = tr ? tr.dataset.status : null;

  // Optimistic UI swap
  badge.textContent = newStatus;
  clearStatusClasses(badge);
  badge.classList.add(statusClassFor(newStatus));
  badge.classList.add('status-pill-pending');
  if (tr) tr.dataset.status = newStatus.toLowerCase();
  closeStatusPopover();

  try {
    const res = await fetch('/api/status', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ num: parseInt(num, 10), status: newStatus }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data.ok) {
      throw new Error(data && data.error ? data.error : ('HTTP ' + res.status));
    }
    badge.classList.remove('status-pill-pending');
    if (window.toast) window.toast('#' + num + ' → ' + newStatus, 'success');
  } catch (err) {
    // Revert
    badge.textContent = original;
    clearStatusClasses(badge);
    badge.classList.add(statusClassFor(original));
    badge.classList.remove('status-pill-pending');
    if (tr && originalRowStatus !== null) tr.dataset.status = originalRowStatus;
    if (window.toast) window.toast('Status update failed: ' + (err && err.message || 'unknown error'), 'error');
  }
}

window.openStatusPopover = openStatusPopover;
window.closeStatusPopover = closeStatusPopover;
window.applyStatus = applyStatus;

// ── Bulk operations: select rows + bulk status writeback ────────
// Selection state is keyed by row-num (the canonical applications.md id),
// persisted to localStorage so an accidental refresh doesn't lose it.
const BULK_STORAGE_KEY = 'careerOps.bulkSelection.v1';
const BULK_MODE_KEY = 'careerOps.bulkMode.v1';
const _bulkSelected = new Set();

function _bulkLoadFromStorage() {
  try {
    const raw = localStorage.getItem(BULK_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) for (const n of arr) _bulkSelected.add(String(n));
  } catch (_) {}
  try {
    if (localStorage.getItem(BULK_MODE_KEY) === '1') document.body.classList.add('select-mode');
  } catch (_) {}
}

function _bulkPersist() {
  try { localStorage.setItem(BULK_STORAGE_KEY, JSON.stringify([..._bulkSelected])); }
  catch (_) {}
}

function _bulkPersistMode() {
  try {
    if (document.body.classList.contains('select-mode')) localStorage.setItem(BULK_MODE_KEY, '1');
    else localStorage.removeItem(BULK_MODE_KEY);
  } catch (_) {}
}

function _bulkSyncCheckboxesFromState() {
  document.querySelectorAll('.bulk-checkbox').forEach(cb => {
    const num = cb.dataset.num;
    const isSel = _bulkSelected.has(String(num));
    cb.checked = isSel;
    const tr = cb.closest('tr.row');
    if (tr) tr.classList.toggle('is-bulk-selected', isSel);
  });
  _bulkUpdateHeaderCheckboxes();
}

function _bulkUpdateBar() {
  const bar = document.getElementById('bulk-action-bar');
  const count = document.getElementById('bulk-count');
  if (!bar || !count) return;
  count.textContent = String(_bulkSelected.size);
  if (_bulkSelected.size > 0) {
    bar.hidden = false;
    // First selection auto-enables select mode so the column reveals
    if (!document.body.classList.contains('select-mode')) {
      document.body.classList.add('select-mode');
      _bulkPersistMode();
    }
  } else {
    bar.hidden = true;
  }
}

function _bulkVisibleRowsIn(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return [];
  return [...tbody.querySelectorAll('tr.row')].filter(r => r.style.display !== 'none');
}

function _bulkUpdateHeaderCheckboxes() {
  document.querySelectorAll('.bulk-header-checkbox').forEach(hc => {
    const tbodyId = hc.dataset.tbody;
    const visibleRows = _bulkVisibleRowsIn(tbodyId);
    if (!visibleRows.length) {
      hc.checked = false;
      hc.indeterminate = false;
      return;
    }
    const selVisible = visibleRows.filter(r => _bulkSelected.has(String(r.dataset.num))).length;
    if (selVisible === 0) {
      hc.checked = false;
      hc.indeterminate = false;
    } else if (selVisible === visibleRows.length) {
      hc.checked = true;
      hc.indeterminate = false;
    } else {
      hc.checked = false;
      hc.indeterminate = true;
    }
  });
}

function handleRowCheckbox(cb) {
  const num = String(cb.dataset.num || '');
  if (!num) return;
  if (cb.checked) _bulkSelected.add(num);
  else _bulkSelected.delete(num);
  const tr = cb.closest('tr.row');
  if (tr) tr.classList.toggle('is-bulk-selected', cb.checked);
  _bulkPersist();
  _bulkUpdateBar();
  _bulkUpdateHeaderCheckboxes();
}

function handleHeaderCheckbox(hc) {
  const tbodyId = hc.dataset.tbody;
  const visibleRows = _bulkVisibleRowsIn(tbodyId);
  if (!visibleRows.length) { hc.checked = false; return; }
  const allSelected = visibleRows.every(r => _bulkSelected.has(String(r.dataset.num)));
  for (const tr of visibleRows) {
    const num = String(tr.dataset.num || '');
    if (!num) continue;
    if (allSelected) _bulkSelected.delete(num);
    else _bulkSelected.add(num);
  }
  _bulkPersist();
  _bulkSyncCheckboxesFromState();
  _bulkUpdateBar();
}

function bulkClearSelection() {
  _bulkSelected.clear();
  _bulkPersist();
  document.querySelectorAll('.bulk-checkbox').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('tr.row.is-bulk-selected').forEach(tr => tr.classList.remove('is-bulk-selected'));
  _bulkUpdateHeaderCheckboxes();
  _bulkUpdateBar();
}

function toggleSelectMode() {
  document.body.classList.toggle('select-mode');
  _bulkPersistMode();
  if (!document.body.classList.contains('select-mode')) bulkClearSelection();
  if (window.toast) window.toast(document.body.classList.contains('select-mode') ? 'Select mode on' : 'Select mode off', 'info');
}

async function bulkApply(newStatus) {
  if (_bulkSelected.size === 0) return;
  if (!newStatus) return;
  const nums = [..._bulkSelected].map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n));
  if (!nums.length) return;

  // Snapshot for revert
  const snapshot = [];
  for (const num of nums) {
    const badge = document.querySelector('.status-pill[data-num="' + num + '"]');
    const tr = document.querySelector('tr.row[data-num="' + num + '"]');
    if (!badge) continue;
    snapshot.push({
      num,
      badge,
      tr,
      origText: (badge.textContent || '').trim(),
      origClasses: [...badge.classList],
      origRowStatus: tr ? tr.dataset.status : null,
    });
  }

  // Optimistic swap
  for (const s of snapshot) {
    s.badge.textContent = newStatus;
    clearStatusClasses(s.badge);
    s.badge.classList.add(statusClassFor(newStatus));
    s.badge.classList.add('status-pill-pending');
    if (s.tr) s.tr.dataset.status = newStatus.toLowerCase();
  }

  try {
    const res = await fetch('/api/status/bulk', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ nums, status: newStatus }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data.ok) {
      throw new Error(data && data.error ? data.error : ('HTTP ' + res.status));
    }
    for (const s of snapshot) s.badge.classList.remove('status-pill-pending');
    const updatedCount = (data.updated || []).length;
    const missingCount = (data.notFound || []).length;
    bulkClearSelection();
    if (window.toast) {
      const msg = updatedCount + ' row' + (updatedCount === 1 ? '' : 's') + ' → ' + newStatus
        + (missingCount ? ' (' + missingCount + ' not found)' : '');
      window.toast(msg, missingCount ? 'info' : 'success');
    }
  } catch (err) {
    // Revert all optimistic changes
    for (const s of snapshot) {
      s.badge.textContent = s.origText;
      s.badge.className = s.origClasses.join(' ');
      s.badge.classList.remove('status-pill-pending');
      if (s.tr && s.origRowStatus !== null) s.tr.dataset.status = s.origRowStatus;
    }
    if (window.toast) window.toast('Bulk update failed: ' + (err && err.message || 'unknown'), 'error');
  }
}

window.handleRowCheckbox = handleRowCheckbox;
window.handleHeaderCheckbox = handleHeaderCheckbox;
window.bulkClearSelection = bulkClearSelection;
window.bulkApply = bulkApply;
window.toggleSelectMode = toggleSelectMode;
// ── Quick-add role modal ────────────────────────────────────────
function openQuickAdd() {
  const bd = document.getElementById('quickadd-backdrop');
  const inp = document.getElementById('quickadd-url');
  if (!bd || !inp) return;
  bd.classList.add('visible');
  inp.value = '';
  const btn = document.getElementById('quickadd-submit-btn');
  if (btn) btn.disabled = false;
  setTimeout(() => inp.focus(), 0);
}

function closeQuickAdd() {
  const bd = document.getElementById('quickadd-backdrop');
  if (bd) bd.classList.remove('visible');
}

async function submitQuickAdd(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const inp = document.getElementById('quickadd-url');
  const btn = document.getElementById('quickadd-submit-btn');
  const raw = inp ? inp.value.trim() : '';
  if (!raw) return;
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/pipeline/add', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url: raw }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (data && data.ok) {
      closeQuickAdd();
      const tag = data.ats && data.ats !== 'unknown' ? ' (' + data.ats + ')' : '';
      if (window.toast) window.toast('Added' + tag + ' — will triage in next scan', 'success');
    } else if (data && data.duplicate) {
      closeQuickAdd();
      if (window.toast) window.toast('Already in pipeline', 'info');
    } else {
      const msg = (data && data.error) || ('HTTP ' + res.status);
      if (window.toast) window.toast(msg, 'error');
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    if (window.toast) window.toast('Network error: ' + (err && err.message || 'unknown'), 'error');
    if (btn) btn.disabled = false;
  }
}

window.openQuickAdd = openQuickAdd;
window.closeQuickAdd = closeQuickAdd;
window.submitQuickAdd = submitQuickAdd;

// ── Toast ───────────────────────────────────────────────────────
window.toast = function(msg, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = type === 'success' || type === 'error' || type === 'info' ? type : 'info';
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = 'toast toast-' + t;
  el.setAttribute('role', t === 'error' ? 'alert' : 'status');
  el.innerHTML = '<span class="toast-icon">' + icons[t] + '</span>'
    + '<span class="toast-msg"></span>'
    + '<button class="toast-close" aria-label="Dismiss">✕</button>';
  el.querySelector('.toast-msg').textContent = String(msg ?? '');
  const dismiss = () => {
    if (el.classList.contains('toast-leave')) return;
    el.classList.add('toast-leave');
    setTimeout(() => el.remove(), 260);
  };
  el.querySelector('.toast-close').addEventListener('click', dismiss);
  container.appendChild(el);
  setTimeout(dismiss, 4000);
  return el;
};

// ── Mobile gestures: swipe-to-dismiss the bottom sheet ─────────
// Only attaches on touch/pen pointers so desktop click + drag-to-select
// remain untouched. Swipe-down from anywhere inside the sheet (not just
// the handle) → dismiss past 30% of sheet height OR fast flick velocity.
(function () {
  const SHEET_DISMISS_RATIO = 0.30;        // 30% of sheet height = commit
  const SHEET_FLICK_VELOCITY = 0.55;       // px/ms — quick flick wins early
  let _sheetDrag = null;

  function _sheetEl()    { return document.getElementById('mobile-sheet'); }
  function _sheetBd()    { return document.getElementById('mobile-sheet-backdrop'); }

  function _onSheetPointerDown(e) {
    if (e.pointerType === 'mouse') return;
    const sheet = _sheetEl();
    if (!sheet || !_sheetBd()?.classList.contains('visible')) return;
    // Drag is always allowed from the handle grip. From the body we only
    // initiate when scrolled to top — otherwise swipe-down should scroll
    // the inner body, not dismiss the sheet (matches native iOS UX).
    const grip = document.getElementById('mobile-sheet-handle-grip');
    const bodyEl = document.getElementById('mobile-sheet-body');
    const fromGrip = !!(grip && grip.contains(e.target));
    if (!fromGrip && bodyEl && bodyEl.scrollTop > 0) return;
    _sheetDrag = {
      startY: e.clientY,
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
      pointerId: e.pointerId,
      committed: false,
      fromGrip: fromGrip,
    };
    sheet.classList.add('is-dragging');
  }

  function _onSheetPointerMove(e) {
    if (!_sheetDrag || e.pointerId !== _sheetDrag.pointerId) return;
    const sheet = _sheetEl();
    if (!sheet) return;
    const dy = Math.max(0, e.clientY - _sheetDrag.startY);
    // Track velocity over the last move for flick detection.
    const now = performance.now();
    const dt = Math.max(1, now - _sheetDrag.lastT);
    _sheetDrag.velocity = (e.clientY - _sheetDrag.lastY) / dt;
    _sheetDrag.lastY = e.clientY; _sheetDrag.lastT = now;
    if (dy <= 0) { sheet.style.transform = ''; return; }
    // Apply rubber-band-free 1:1 follow + fade the backdrop in proportion.
    sheet.style.transform = 'translateY(' + dy + 'px)';
    const bd = _sheetBd();
    if (bd) {
      const sheetH = sheet.getBoundingClientRect().height || 1;
      const fade = Math.max(0, 1 - (dy / sheetH));
      bd.style.background = 'rgba(0,0,0,' + (0.55 * fade).toFixed(3) + ')';
    }
    if (dy > 6) e.preventDefault();
  }

  function _onSheetPointerUp(e) {
    if (!_sheetDrag || e.pointerId !== _sheetDrag.pointerId) return;
    const sheet = _sheetEl();
    if (!sheet) { _sheetDrag = null; return; }
    sheet.classList.remove('is-dragging');
    const sheetH = sheet.getBoundingClientRect().height || 1;
    const dy = Math.max(0, e.clientY - _sheetDrag.startY);
    const flicking = _sheetDrag.velocity > SHEET_FLICK_VELOCITY;
    const past = dy / sheetH > SHEET_DISMISS_RATIO;
    _sheetDrag = null;
    if (past || flicking) {
      // Commit: animate to closed via existing closeMobileSheet() path.
      // Reset inline transform so the CSS .visible rule animates cleanly.
      sheet.style.transform = '';
      const bd = _sheetBd();
      if (bd) bd.style.background = '';
      closeMobileSheet();
    } else {
      // Snap back. Clear inline transform; the .visible rule (translateY 0)
      // is restored automatically by the transition we re-enabled.
      sheet.style.transform = '';
      const bd = _sheetBd();
      if (bd) bd.style.background = '';
    }
  }

  function _attachSheetGestures() {
    const sheet = _sheetEl();
    if (!sheet || sheet._gesturesWired) return;
    sheet._gesturesWired = true;
    sheet.addEventListener('pointerdown', _onSheetPointerDown, { passive: true });
    sheet.addEventListener('pointermove', _onSheetPointerMove, { passive: false });
    sheet.addEventListener('pointerup', _onSheetPointerUp, { passive: true });
    sheet.addEventListener('pointercancel', _onSheetPointerUp, { passive: true });
  }

  // Hook lazily; sheet exists at page load but stay defensive.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _attachSheetGestures);
  } else {
    _attachSheetGestures();
  }
})();

// ── Mobile gestures: pull-to-refresh ────────────────────────────
// Activates when the page is scrolled to top AND the user starts a
// downward drag with a touch/pen pointer. Past the threshold a release
// triggers refreshLiveStats() (cheap; no full reload). Desktop mouse
// users are unaffected.
(function () {
  const PTR_TRIGGER_PX = 70;     // committed pull distance
  const PTR_MAX_PX = 110;        // visual cap on indicator drop
  const PTR_RESIST = 0.55;       // rubber-band scaling on the visual offset
  let _ptr = null;
  let _refreshing = false;

  function _ptrEl()    { return document.getElementById('pull-to-refresh'); }
  function _ptrLabel() { return document.getElementById('ptr-label'); }

  function _isAtTop() { return (window.scrollY || document.documentElement.scrollTop || 0) <= 0; }

  function _onPtrDown(e) {
    if (e.pointerType === 'mouse') return;
    if (_refreshing) return;
    if (!_isAtTop()) return;
    // Don't start a pull if the touch begins inside the sheet (its own
    // gesture owns vertical drags) or inside any modal/overlay.
    const t = e.target;
    if (t && t.closest && (
      t.closest('#mobile-sheet') ||
      t.closest('#mobile-sheet-backdrop') ||
      t.closest('#cmdk-modal') ||
      t.closest('#mobile-tabbar') ||
      t.closest('#verify-modal') ||
      t.closest('#gap-modal') ||
      t.closest('#quickadd-modal')
    )) return;
    _ptr = { startY: e.clientY, pointerId: e.pointerId, dy: 0, armed: false };
  }

  function _onPtrMove(e) {
    if (!_ptr || e.pointerId !== _ptr.pointerId || _refreshing) return;
    const raw = e.clientY - _ptr.startY;
    if (raw <= 0) {
      // Upward / sideways drag — abort silently.
      const el = _ptrEl();
      if (el) el.style.transform = '';
      _ptr.dy = 0; _ptr.armed = false;
      return;
    }
    if (!_isAtTop()) {
      // User scrolled while pulling — bail out, treat as scroll.
      _hidePtr(false);
      _ptr = null;
      return;
    }
    // Apply rubber-band resistance so the indicator doesn't fly off
    // even on a wild drag.
    const visual = Math.min(PTR_MAX_PX, raw * PTR_RESIST);
    _ptr.dy = raw;
    const el = _ptrEl();
    if (!el) return;
    el.classList.add('visible');
    el.setAttribute('aria-hidden', 'false');
    el.style.transform = 'translate(-50%, ' + (visual - 60) + 'px)';
    el.style.opacity = String(Math.min(1, visual / 50));
    // Once past the trigger, swap the label so the user sees a
    // commit affordance.
    const armed = raw >= PTR_TRIGGER_PX;
    if (armed !== _ptr.armed) {
      _ptr.armed = armed;
      const lbl = _ptrLabel();
      if (lbl) lbl.textContent = armed ? 'Release to refresh' : 'Pull to refresh';
    }
    // Block native overscroll bounce while the pull is active.
    if (raw > 4) e.preventDefault();
  }

  function _onPtrUp(e) {
    if (!_ptr || e.pointerId !== _ptr.pointerId) return;
    const armed = _ptr.armed;
    const wasPulling = _ptr.dy > 4;
    _ptr = null;
    if (!armed) { _hidePtr(false); return; }
    if (!wasPulling) { _hidePtr(false); return; }
    _commitRefresh();
  }

  function _hidePtr(/* keepVisibleForCommit */) {
    const el = _ptrEl();
    if (!el) return;
    el.style.transform = '';
    el.style.opacity = '';
    el.classList.remove('visible');
    el.setAttribute('aria-hidden', 'true');
  }

  async function _commitRefresh() {
    if (_refreshing) return;
    _refreshing = true;
    const el = _ptrEl();
    const lbl = _ptrLabel();
    if (el) {
      el.classList.add('visible', 'refreshing');
      el.setAttribute('aria-hidden', 'false');
      el.style.transform = 'translate(-50%, 14px)';
      el.style.opacity = '1';
    }
    if (lbl) lbl.textContent = 'Refreshing…';
    try {
      // Cheap refresh path: refreshLiveStats() + pollBatch() update the
      // surfaces that change second-to-second without a full SPA reload.
      // Falls back to a full reload only if both are missing (e.g. share
      // mode page strips them).
      const tasks = [];
      if (typeof refreshLiveStats === 'function') tasks.push(Promise.resolve(refreshLiveStats()).catch(() => {}));
      if (typeof pollBatch === 'function')        tasks.push(Promise.resolve(pollBatch()).catch(() => {}));
      if (!tasks.length) {
        location.reload();
        return;
      }
      // Floor at 600ms so the spinner is perceptible — refresh felt too
      // instant in testing and the user couldn't tell anything happened.
      await Promise.all([
        Promise.all(tasks),
        new Promise(r => setTimeout(r, 600)),
      ]);
      if (lbl) lbl.textContent = 'Updated';
      if (typeof toast === 'function') toast('Refreshed', 'success');
    } catch (err) {
      if (lbl) lbl.textContent = 'Refresh failed';
      if (typeof toast === 'function') toast('Refresh failed', 'error');
    } finally {
      setTimeout(() => {
        _refreshing = false;
        if (el) el.classList.remove('refreshing');
        _hidePtr();
        if (lbl) lbl.textContent = 'Pull to refresh';
      }, 350);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.addEventListener('pointerdown',  _onPtrDown,  { passive: true });
      window.addEventListener('pointermove',  _onPtrMove,  { passive: false });
      window.addEventListener('pointerup',    _onPtrUp,    { passive: true });
      window.addEventListener('pointercancel',_onPtrUp,    { passive: true });
    });
  } else {
    window.addEventListener('pointerdown',   _onPtrDown,  { passive: true });
    window.addEventListener('pointermove',   _onPtrMove,  { passive: false });
    window.addEventListener('pointerup',     _onPtrUp,    { passive: true });
    window.addEventListener('pointercancel', _onPtrUp,    { passive: true });
  }
})();

// ── Mobile gestures: long-press on a row → toggle bulk-select ──
// Touch alternative to the checkbox column, which is comfortable on
// desktop but cramped on a phone. Long-press of ~480ms toggles the
// row's selection and slides the bulk-action bar in (or out, on the
// last deselect). Desktop click flow is fully untouched: we only arm
// on pointerType touch/pen, and we cancel the timer on pointermove
// past a small threshold so an inadvertent scroll doesn't trigger.
(function () {
  const LP_DURATION_MS = 480;
  const LP_MOVE_TOLERANCE = 8;     // px before we cancel as "moved"
  let _lp = null;

  function _resetVisualOnRow(row) {
    if (row) row.classList.remove('is-long-pressing');
  }

  function _onRowPointerDown(e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    // Don't fight the drag handle (its own pointerdown handler runs first
    // for the apply-now reorder gesture).
    if (e.target.closest('.apply-drag-handle')) return;
    // Ignore taps on interactive descendants — link/button/input/select.
    if (e.target.closest('a, button, input, select, textarea, .status-pill, .gap-chip-interactive')) return;
    const row = e.target.closest('tr.row');
    if (!row) return;
    const num = row.dataset.num;
    if (!num) return;
    if (_lp) { _cancelLP(); }
    _lp = {
      row, num: String(num),
      startX: e.clientX, startY: e.clientY,
      pointerId: e.pointerId,
      committed: false,
      timer: setTimeout(() => {
        if (!_lp) return;
        _lp.committed = true;
        // Toggle selection via the existing bulk plumbing so persistence,
        // header-checkbox sync, and the action bar all stay coherent.
        if (typeof _bulkSelected !== 'undefined') {
          if (_bulkSelected.has(_lp.num)) _bulkSelected.delete(_lp.num);
          else _bulkSelected.add(_lp.num);
        }
        try {
          if (typeof _bulkPersist === 'function') _bulkPersist();
          if (typeof _bulkSyncCheckboxesFromState === 'function') _bulkSyncCheckboxesFromState();
          if (typeof _bulkUpdateBar === 'function') _bulkUpdateBar();
        } catch (err) {}
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) {} }
        _resetVisualOnRow(_lp.row);
      }, LP_DURATION_MS),
    };
    row.classList.add('is-long-pressing');
  }

  function _onRowPointerMove(e) {
    if (!_lp || e.pointerId !== _lp.pointerId) return;
    const dx = Math.abs(e.clientX - _lp.startX);
    const dy = Math.abs(e.clientY - _lp.startY);
    if (dx > LP_MOVE_TOLERANCE || dy > LP_MOVE_TOLERANCE) {
      _cancelLP();
    }
  }

  function _onRowPointerUp(e) {
    if (!_lp || e.pointerId !== _lp.pointerId) return;
    const wasCommitted = _lp.committed;
    const row = _lp.row;
    _cancelLP();
    // If the long-press committed, swallow the resulting click so the
    // row doesn't also expand its detail sheet.
    if (wasCommitted && row) {
      row.dataset.lpSwallow = '1';
      setTimeout(() => { delete row.dataset.lpSwallow; }, 350);
    }
  }

  function _cancelLP() {
    if (!_lp) return;
    clearTimeout(_lp.timer);
    _resetVisualOnRow(_lp.row);
    _lp = null;
  }

  function _attachLP() {
    const apply = document.getElementById('apply-now-tbody');
    const all = document.getElementById('all-tbody');
    for (const tbody of [apply, all]) {
      if (!tbody || tbody._lpWired) continue;
      tbody._lpWired = true;
      tbody.addEventListener('pointerdown',   _onRowPointerDown, { passive: true });
      tbody.addEventListener('pointermove',   _onRowPointerMove, { passive: true });
      tbody.addEventListener('pointerup',     _onRowPointerUp,   { passive: true });
      tbody.addEventListener('pointercancel', _onRowPointerUp,   { passive: true });
    }
  }

  // Click guard: if a long-press just toggled selection, swallow the
  // click that would otherwise expand the detail row.
  function _swallowClickAfterLP(e) {
    const row = e.target.closest && e.target.closest('tr.row');
    if (row && row.dataset.lpSwallow === '1') {
      e.preventDefault();
      e.stopPropagation();
      delete row.dataset.lpSwallow;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      _attachLP();
      document.addEventListener('click', _swallowClickAfterLP, true);
    });
  } else {
    _attachLP();
    document.addEventListener('click', _swallowClickAfterLP, true);
  }
})();

// ── Mobile gestures: haptic-style tap pulse ─────────────────────
// Adds a brief scale + opacity pulse to actionable elements on
// pointerdown for touch pointers only. Mimics native iOS button
// feedback. Desktop hover/click states are completely unchanged
// because we gate on pointerType + the CSS itself is wrapped in a
// (pointer: coarse) media query.
(function () {
  const SELECTOR = 'button, .toolbar-btn, .stat, .mobile-tab, .saved-view-chip, .reset-order-btn, .bulk-btn, .toast-close, .mobile-sheet-close, .verify-close, .equity-badge, .tier-badge';
  function _onTapDown(e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    const el = e.target.closest(SELECTOR);
    if (!el) return;
    el.classList.add('tap-pulsing');
  }
  function _onTapUpOrCancel(e) {
    document.querySelectorAll('.tap-pulsing').forEach(el => el.classList.remove('tap-pulsing'));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.addEventListener('pointerdown',  _onTapDown,        { passive: true });
      document.addEventListener('pointerup',    _onTapUpOrCancel,  { passive: true });
      document.addEventListener('pointercancel',_onTapUpOrCancel,  { passive: true });
      document.addEventListener('pointerleave', _onTapUpOrCancel,  { passive: true });
    });
  } else {
    document.addEventListener('pointerdown',   _onTapDown,        { passive: true });
    document.addEventListener('pointerup',     _onTapUpOrCancel,  { passive: true });
    document.addEventListener('pointercancel', _onTapUpOrCancel,  { passive: true });
    document.addEventListener('pointerleave',  _onTapUpOrCancel,  { passive: true });
  }
})();

// ── Mobile bottom tab bar ───────────────────────────────────────
// Tabs map to existing sections: Apply-Now / All / Charts. The
// Settings tab opens a mobile bottom-sheet hosting the desktop
// toolbar's controls (theme, demo mode, command palette) so they
// stay reachable without a fixed top bar.
function switchMobileTab(targetId, btn) {
  if (!targetId) return;
  // Mark the new tab selected; clear the others.
  document.querySelectorAll('#mobile-tabbar .mobile-tab').forEach(b => {
    b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
  });
  if (targetId === '__settings__') return; // settings handled separately
  const el = document.getElementById(targetId);
  if (!el) return;
  // Account for the safe-area-aware bottom inset of the tab bar so
  // the section header isn't crowded against the top.
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.switchMobileTab = switchMobileTab;

function openMobileSettingsSheet(btn) {
  if (btn) {
    document.querySelectorAll('#mobile-tabbar .mobile-tab').forEach(b => {
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
  }
  const titleEl = document.getElementById('mobile-sheet-title');
  const bodyEl = document.getElementById('mobile-sheet-body');
  const bd = document.getElementById('mobile-sheet-backdrop');
  if (!titleEl || !bodyEl || !bd) return;
  const isDark = document.body.classList.contains('dark');
  let demoOn = false;
  try { demoOn = localStorage.getItem('careerOps.demoMode') === '1'; } catch (e) {}
  titleEl.textContent = 'Settings';
  bodyEl.innerHTML = (
    '<div style="display:grid;gap:10px">' +
      '<button type="button" class="toolbar-btn" style="min-height:48px;width:100%;text-align:left;padding:12px 14px" onclick="toggleDark();openMobileSettingsSheet()">' +
        (isDark ? '☀︎  Switch to light mode' : '⏾  Switch to dark mode') +
      '</button>' +
      '<button type="button" class="toolbar-btn" style="min-height:48px;width:100%;text-align:left;padding:12px 14px" onclick="closeMobileSheet();openCmdK()">' +
        '⌕  Open command palette' +
      '</button>' +
      '<button type="button" class="toolbar-btn" style="min-height:48px;width:100%;text-align:left;padding:12px 14px" onclick="closeMobileSheet();openQuickAdd()">' +
        '+  Add role to pipeline' +
      '</button>' +
      '<button type="button" class="toolbar-btn" style="min-height:48px;width:100%;text-align:left;padding:12px 14px" onclick="toggleDemoMode()">' +
        (demoOn ? '🎭  Disable demo mode' : '🎭  Enable demo mode') +
      '</button>' +
      '<p class="muted-text" style="margin:6px 2px 0;line-height:1.45">Pull-to-refresh: drag down from the top of the page. Long-press a row to enter multi-select mode.</p>' +
    '</div>'
  );
  bodyEl.scrollTop = 0;
  bd.classList.add('visible');
  bd.removeAttribute('aria-hidden');
  document.body.style.overflow = 'hidden';
}
window.openMobileSettingsSheet = openMobileSettingsSheet;

// When the settings sheet (or any sheet) closes, restore the Apply-Now
// tab as the default selection so the bar reflects the on-screen state.
(function () {
  const bd = document.getElementById('mobile-sheet-backdrop');
  if (!bd) return;
  const obs = new MutationObserver(() => {
    if (!bd.classList.contains('visible')) {
      // Reset to Apply tab when no sheet is open.
      const tabs = document.querySelectorAll('#mobile-tabbar .mobile-tab');
      tabs.forEach((b, i) => b.setAttribute('aria-selected', i === 0 ? 'true' : 'false'));
    }
  });
  obs.observe(bd, { attributes: true, attributeFilter: ['class'] });
})();

// Sync the active tab to whichever section is currently most visible.
// Cheap IntersectionObserver: only fires on mobile, and only when a
// section header crosses the upper third of the viewport.
(function () {
  if (typeof IntersectionObserver === 'undefined') return;
  const targets = ['apply-now-section', 'all-evaluations-section', 'charts-section']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if (!targets.length) return;
  function _updateTab(id) {
    document.querySelectorAll('#mobile-tabbar .mobile-tab').forEach(b => {
      b.setAttribute('aria-selected', b.dataset.tabTarget === id ? 'true' : 'false');
    });
  }
  const io = new IntersectionObserver((entries) => {
    if (window.innerWidth > 720) return;
    // Pick the most-visible target.
    let best = null;
    for (const ent of entries) {
      if (!ent.isIntersecting) continue;
      if (!best || ent.intersectionRatio > best.intersectionRatio) best = ent;
    }
    if (best) _updateTab(best.target.id);
  }, { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
  for (const t of targets) io.observe(t);
})();

// ── Init ────────────────────────────────────────────────────────
initDark();
initOled();
initSavedViews();
initApplyNowDrag();
refreshLiveStats();
_batchInterval = setInterval(pollBatch, 2000);
pollBatch();
setInterval(refreshLiveStats, 30000);

_bulkLoadFromStorage();
_bulkSyncCheckboxesFromState();
_bulkUpdateBar();

// ── PWA service worker ─────────────────────────────────────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .catch(err => console.warn('[sw] registration failed:', err));
  });
}
</script>

<!-- ── Share-link / demo-mode (read-only recruiter view) ──────── -->
<style>
  /* Share-link banner */
  #share-banner {
    display: none;
    position: sticky; top: 0; z-index: 3000;
    padding: 10px 16px;
    background: linear-gradient(90deg, #fef3c7, #fde68a);
    color: #78350f;
    font-size: 13px; font-weight: 600;
    border-bottom: 1px solid #f59e0b;
    text-align: center;
  }
  body.share-mode #share-banner { display: block; }
  body.share-mode { padding-top: 0; }

  /* Standalone demo banner — distinct from share-link banner so the user
     sees a clear visual cue when demo is enabled without a share token.
     Sticky at top, dismissable for the current view, reappears on reload. */
  #demo-banner {
    display: none;
    position: sticky; top: 0; z-index: 3000;
    padding: 10px 16px;
    background: linear-gradient(90deg, #fde68a, #fcd34d);
    color: #7c2d12;
    font-size: 13px; font-weight: 600;
    border-bottom: 1px solid #f59e0b;
    text-align: center;
    align-items: center; justify-content: center; gap: 14px;
  }
  body.demo-mode:not(.share-mode):not(.demo-banner-dismissed) #demo-banner {
    display: flex;
  }
  #demo-banner-close {
    background: rgba(255,255,255,0.5); border: 1px solid currentColor;
    border-radius: 4px; color: inherit;
    padding: 2px 10px; cursor: pointer; font-size: 12px; font-weight: 600;
  }
  #demo-banner-close:hover { background: rgba(255,255,255,0.85); }

  /* Hide write-action surfaces in share mode */
  body.share-mode .action-cell a[href]:not([href^="#"]):not([href^="reports/"]),
  body.share-mode .action-cell a[onclick*="openVerify"],
  body.share-mode .dcard--action,
  body.share-mode .dcard--notes,
  body.share-mode .rec-btn,
  body.share-mode #sidebar-batch,
  body.share-mode .toolbar-btn.cmdk-trigger,
  body.share-mode #cmdk-backdrop,
  body.share-mode #verify-backdrop,
  body.share-mode [data-action="skip"],
  body.share-mode [data-action="defer"] {
    display: none !important;
  }

  /* Status pills become non-interactive */
  body.share-mode .status-pill {
    pointer-events: none !important;
    cursor: default !important;
    opacity: 0.85;
  }
  body.share-mode #status-popover { display: none !important; }

  /* Demo redaction visual hint */
  body.demo-mode .meta-chip-comp { opacity: 0.65; }
</style>
<div id="share-banner" role="status" aria-live="polite">
  <span id="share-banner-text">Read-only share — loading…</span>
</div>
<div id="demo-banner" role="status" aria-live="polite">
  <span>🎭 DEMO MODE — fake data for screen sharing</span>
  <button type="button" id="demo-banner-close" aria-label="Dismiss demo banner for this view">Dismiss</button>
</div>
<script>
// ── Share / demo bootstrap ─────────────────────────────────────
// Three independent ways to enter demo mode:
//   1. ?demo=1 in the URL                       (shareable / explicit)
//   2. localStorage 'careerOps.demoMode' === '1' (Cmd-K toggle persistence)
//   3. ?share=token (forces demo)                (PR #17 share-link flow)
// All three coexist; #3 always wins for hiding write surfaces. The
// data swap below runs whenever ANY of them is active.
(function () {
  var params = new URLSearchParams(window.location.search);
  var shareToken = params.get('share');
  var urlDemo = params.get('demo') === '1';
  var lsDemo = false;
  try { lsDemo = localStorage.getItem('careerOps.demoMode') === '1'; } catch (e) {}
  // ?demo=1 in URL → also persist to localStorage so the toggle survives
  // a manual reload that drops the query string.
  if (urlDemo) {
    try { localStorage.setItem('careerOps.demoMode', '1'); } catch (e) {}
  }
  var demoMode = !!shareToken || urlDemo || lsDemo;
  if (!shareToken && !demoMode) return;

  function init() {
    if (shareToken) {
      document.body.classList.add('share-mode');
      fetch('/api/share/verify?token=' + encodeURIComponent(shareToken))
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (j) {
          var el = document.getElementById('share-banner-text');
          if (!el) return;
          if (j && j.valid && j.expires) {
            var d = new Date(j.expires);
            el.textContent = 'Read-only share — expires ' + d.toLocaleString();
          } else {
            el.textContent = 'Read-only share — link expired or invalid';
          }
        })
        .catch(function () {
          var el = document.getElementById('share-banner-text');
          if (el) el.textContent = 'Read-only share — server unavailable';
        });
    }
    if (demoMode) {
      document.body.classList.add('demo-mode');
      var closeBtn = document.getElementById('demo-banner-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          // In-memory dismiss only — banner reappears on reload as a
          // safety reminder that fake data is still being shown.
          document.body.classList.add('demo-banner-dismissed');
        });
      }
      runDemoSwap();
    }
  }

  // djb2-style stable hash → unsigned 32-bit. Used so each real company
  // maps to the same fake name across reloads (and the next user's run).
  function _hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  // Plausible-but-fictional names. The Microsoft "fictitious sample"
  // brand list (Contoso, Fabrikam, Adatum…) is a known-safe vocabulary —
  // unambiguously fake to anyone who recognizes them, but ordinary
  // enough to read as real to anyone else watching a screen-share.
  var DEMO_COMPANIES = [
    'Acme AI', 'Northwind Labs', 'Initech', 'Contoso AI', 'Fabrikam',
    'Tailspin Systems', 'Wingtip Software', 'Adatum Inc', 'Litware AI',
    'Proseware Labs', 'Trey Research', 'Lucerne Studios', 'Adventure Works',
    'Wide World Tech', 'Margie Analytics'
  ];
  var DEMO_ROLES = [
    'Senior Engineer', 'Product Manager', 'Engineering Manager',
    'Software Engineer', 'Senior Product Manager', 'Staff Engineer',
    'Principal Engineer', 'Tech Lead', 'Senior Manager', 'Director of Engineering'
  ];
  var DEMO_COMP_BUCKETS = [
    '$120K–$150K', '$150K–$200K', '$200K–$250K',
    '$250K–$300K', '$300K–$400K', '$400K+'
  ];

  function pickFromList(list, key) { return list[_hash(key) % list.length]; }

  function buildCompanyMap() {
    // Collect every distinct real company string. Sort alphabetically so
    // the linear-probing collision resolution is reproducible regardless
    // of DOM order.
    var raws = new Set();
    document.querySelectorAll('[data-company]').forEach(function (el) {
      var raw = (el.getAttribute('data-company') || '').trim().toLowerCase();
      if (raw) raws.add(raw);
    });
    var sorted = Array.from(raws).sort();
    var map = new Map();
    var taken = new Set();
    sorted.forEach(function (raw) {
      var idx = _hash(raw) % DEMO_COMPANIES.length;
      var attempts = 0;
      while (taken.has(idx) && attempts < DEMO_COMPANIES.length) {
        idx = (idx + 1) % DEMO_COMPANIES.length;
        attempts++;
      }
      taken.add(idx);
      map.set(raw, DEMO_COMPANIES[idx]);
    });
    return map;
  }

  function escapeRegex(s) {
    return s.replace(/[\\\\^.*+?()[\\]{}|]/g, '\\\\$&').replace(/\\$/g, '\\\\$');
  }

  function runDemoSwap() {
    var map = buildCompanyMap();
    if (map.size === 0) return;

    // Per-row swaps: company, role, comp chip
    document.querySelectorAll('tr[data-company]').forEach(function (tr) {
      var rawCompany = (tr.getAttribute('data-company') || '').trim();
      var fakeCompany = map.get(rawCompany);
      if (fakeCompany) {
        var strong = tr.querySelector('td:nth-child(2) strong');
        if (strong) strong.textContent = fakeCompany;
        tr.removeAttribute('data-search');
        tr.setAttribute('data-company', fakeCompany.toLowerCase());
      }
      // Replace role-cell text node (preserves child elements like
      // .card-gaps-mobile that share the same cell).
      var roleCell = tr.querySelector('td.role-cell');
      var rawRole = (tr.getAttribute('data-role') || '').trim();
      if (roleCell && rawRole) {
        var fakeRole = pickFromList(DEMO_ROLES, rawCompany + '|' + rawRole);
        var firstText = null;
        for (var i = 0; i < roleCell.childNodes.length; i++) {
          var ch = roleCell.childNodes[i];
          if (ch.nodeType === 3) { firstText = ch; break; }
        }
        if (firstText) firstText.nodeValue = fakeRole;
        else roleCell.insertBefore(document.createTextNode(fakeRole), roleCell.firstChild);
        tr.setAttribute('data-role', fakeRole.toLowerCase());
      }
    });

    // Comp chips → bucket-only. The chip lives inside the detail-row,
    // which has id="detail-{rowId}" but no data-company/role itself —
    // pull those from the matching visible row via data-row-id so the
    // hash key is meaningful and stable across reloads.
    document.querySelectorAll('.meta-chip-comp').forEach(function (el) {
      var tr = el.closest('tr');
      var key = '';
      if (tr && tr.id && tr.id.indexOf('detail-') === 0) {
        var rowId = tr.id.slice('detail-'.length);
        var src = document.querySelector('tr.row[data-row-id="' + rowId + '"]');
        if (src) {
          key = (src.getAttribute('data-company') || '') + '|' + (src.getAttribute('data-role') || '');
        } else {
          key = rowId;
        }
      } else {
        key = (tr && tr.id) || (el.textContent || '');
      }
      el.textContent = '💰 ' + pickFromList(DEMO_COMP_BUCKETS, key);
    });

    // Global text replacement: every mention of a real company name in
    // body text gets swapped to its mapped fake. Longest-first so that
    // "Anthropic AI" is replaced before "Anthropic" if both appear.
    var realNames = Array.from(map.keys()).filter(function (n) { return n.length >= 3; });
    realNames.sort(function (a, b) { return b.length - a.length; });
    var globalRe = null;
    if (realNames.length) {
      var alt = realNames.map(escapeRegex).join('|');
      globalRe = new RegExp('\\\\b(' + alt + ')\\\\b', 'gi');
    }

    if (globalRe) {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          var p = n.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (p.closest('script,style,#share-banner,#demo-banner')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var node;
      while ((node = walker.nextNode())) {
        var orig = node.nodeValue;
        var swapped = orig.replace(globalRe, function (m) {
          return map.get(m.toLowerCase()) || m;
        });
        if (swapped !== orig) node.nodeValue = swapped;
      }
    }

    // Email + phone redactions
    var emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}/gi;
    var phoneRe = /\\+?\\d[\\d\\s().-]{8,}\\d/g;
    var w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p || p.closest('script,style,#share-banner,#demo-banner')) return NodeFilter.FILTER_REJECT;
        emailRe.lastIndex = 0; phoneRe.lastIndex = 0;
        if (emailRe.test(n.nodeValue) || phoneRe.test(n.nodeValue)) {
          emailRe.lastIndex = 0; phoneRe.lastIndex = 0;
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    });
    var n2;
    while ((n2 = w2.nextNode())) {
      n2.nodeValue = n2.nodeValue
        .replace(emailRe, '[email redacted]')
        .replace(phoneRe, '[phone redacted]');
    }

    // Strip click-through on apply / report links so an over-eager
    // recruiter can't click through to the real JD or report file. We
    // keep the visual element (button + label) intact — only the href
    // is neutered. Internal anchors (#…) and Cmd-K back-to-top scrolls
    // still work.
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
      a.setAttribute('data-demo-original-href', href);
      a.setAttribute('href', '#');
      a.removeAttribute('target');
      a.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>
</body>
</html>`;

  writeFileSync(OUT_PATH, html);
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`  Total evaluations: ${total}`);
  console.log(`  Apply-Now queue:   ${applyNow.length}`);
  console.log(`  Pipeline pending:  ${pipelinePending}`);
  console.log(`  Reports rendered:  ${renderedCount} → dashboard/reports/`);
  console.log(`  Reports parsed:    ${_reportCache.size} (cache hits: ${_reportCacheHits})`);
  console.log(`Open with: open dashboard/index.html`);
}

build();
