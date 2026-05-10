/**
 * enrich-401k-deep.mjs
 *
 * Phase 1: Detect role-enrichment JSONs with missing/vague 401k_match data.
 * Phase 2: Research gaps via Perplexity sonar-reasoning-pro.
 * Phase 3: Write biweekly_math deduction estimates into every JSON.
 *
 * Usage:
 *   node scripts/enrich-401k-deep.mjs              # all phases
 *   node scripts/enrich-401k-deep.mjs --skip-math  # only update 401k text, no deduction math
 *   node scripts/enrich-401k-deep.mjs --math-only  # only write biweekly_math, no Perplexity calls
 *   node scripts/enrich-401k-deep.mjs --dry-run    # print what would change, no writes
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const SKIP_MATH = args.includes('--skip-math');
const MATH_ONLY = args.includes('--math-only');

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const DIR  = join(ROOT, 'data', 'role-enrichment');
const SECRETS_FILE = join(os.homedir(), '.career-ops-secrets');

// ─── Load secrets ─────────────────────────────────────────────────────────────
function loadSecrets() {
  let text = '';
  try {
    text = readFileSync(SECRETS_FILE, 'utf8');
  } catch {
    return {};
  }
  const result = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Handle: export KEY=VALUE  or  KEY=VALUE
    // Values may be single-quoted or unquoted
    const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)=(['"]?)(.+)\2\s*$/);
    if (match) {
      result[match[1]] = match[3];
    }
  }
  return result;
}

const secrets = loadSecrets();
const PERPLEXITY_API_KEY = secrets.PERPLEXITY_API_KEY || process.env.PERPLEXITY_API_KEY || '';

// ─── Detect gap patterns ──────────────────────────────────────────────────────
function hasGap(val) {
  if (!val || val.trim() === '') return true;
  const lower = val.toLowerCase();
  return (
    lower === 'unknown' ||
    lower.includes('not confirmed') ||
    lower.includes('not public') ||
    lower.includes('percentage is not') ||
    lower.includes('not disclosed') ||
    lower.includes('not publicly') ||
    // Covers "match is offered, but specific matching percentage is not publicly disclosed"
    (lower.includes('match') && lower.includes('not') && lower.length > 80 && !lower.match(/\d+\s*%/))
  );
}

// ─── Load all JSONs ───────────────────────────────────────────────────────────
function loadAllFiles() {
  const files = readdirSync(DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('INDEX'))
    .sort();

  return files.map(filename => {
    const filePath = join(DIR, filename);
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return { filename, filePath, data };
  });
}

// ─── Phase 1: Find gaps ───────────────────────────────────────────────────────
function findGaps(entries) {
  return entries.filter(({ data }) => {
    const match = data.benefits?.['401k_match'] ?? '';
    return hasGap(match);
  });
}

// ─── Phase 2: Perplexity research ────────────────────────────────────────────
async function researchCompany(companyName) {
  if (!PERPLEXITY_API_KEY) {
    console.warn(`  [WARN] PERPLEXITY_API_KEY not set — skipping research for ${companyName}`);
    return null;
  }

  const prompt = `Research the exact 401(k) employer match rate at ${companyName} for US-based employees as of 2024-2025.
Focus on:
1. The specific match percentage (e.g., "4% Safe Harbor", "50% match up to 6%", "dollar-for-dollar up to 4%")
2. Vesting schedule (immediate vs cliff vs graded)
3. Any Glassdoor/Levels.fyi/Blind citations or benefit guide mentions

Return ONLY a JSON object (no markdown, no preamble):
{
  "company": "${companyName}",
  "match_rate": "[specific percentage or description, e.g. '4% dollar-for-dollar Safe Harbor']",
  "vesting": "[immediate | 1-year cliff | 2-4yr graded | unknown]",
  "confidence": "[high | medium | low]",
  "source_hint": "[brief citation, e.g. 'Glassdoor review 2024' or 'Levels.fyi 2025']"
}`;

  const body = JSON.stringify({
    model: 'sonar-reasoning-pro',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0,
  });

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const txt = await response.text();
    console.warn(`  [WARN] Perplexity HTTP ${response.status} for ${companyName}: ${txt.slice(0, 200)}`);
    return null;
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content ?? '';

  // Extract JSON from content (may have reasoning preamble)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn(`  [WARN] Could not parse JSON from Perplexity response for ${companyName}`);
    console.warn(`  Raw: ${content.slice(0, 300)}`);
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn(`  [WARN] JSON parse error for ${companyName}: ${e.message}`);
    return null;
  }
}

// ─── Phase 3: Biweekly math ───────────────────────────────────────────────────

// Parse copay field to monthly USD amount.
// Requires explicit monthly context to avoid mis-parsing copay/visit figures.
function parseCopayMonthly(copayStr) {
  if (!copayStr || copayStr.toLowerCase().includes('unknown')) return 300;
  // "$X/month", "$X monthly", "$X per month", "$X-Y/month" (take lower bound)
  const monthly = copayStr.match(/\$(\d+)(?:-\d+)?(?:\s*\/month|\s*monthly|\s*per\s*month)/i);
  if (monthly) return parseInt(monthly[1], 10);
  // "X monthly" without dollar sign
  const bare = copayStr.match(/(\d{3,})\s*(?:\/month|monthly|per\s*month)/i);
  if (bare) return parseInt(bare[1], 10);
  // No monthly anchor found — use industry default
  return 300;
}

// Parse the 401k match rate to compute employer contribution at 10% employee contribution
// Returns annual employer match in USD at a given salary
function parseMatchRate(matchStr, salary) {
  if (!matchStr || hasGap(matchStr)) return 0;
  const lower = matchStr.toLowerCase();

  // "matching X% of employee contributions up to Y% of compensation"
  // e.g. "matching 100% of employee contributions up to 4% of total annual compensation"
  const matchingUpTo = lower.match(
    /matching\s+(\d+(?:\.\d+)?)\s*%\s*of\s*(?:employee\s*)?contributions\s+up\s+to\s+(\d+(?:\.\d+)?)\s*%/
  );
  if (matchingUpTo) {
    const matchPct   = parseFloat(matchingUpTo[1]) / 100;  // e.g. 100% = 1.0
    const ceilingPct = parseFloat(matchingUpTo[2]) / 100;  // e.g. 4%  = 0.04
    const employeeContrib = Math.min(salary * 0.10, salary * ceilingPct);
    return employeeContrib * matchPct;
  }

  // "X% safe harbor" or "X% dollar-for-dollar" — employer matches X% of salary directly
  const safeHarbor = lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:safe\s*harbor|dollar.for.dollar)/);
  if (safeHarbor) {
    const rate = parseFloat(safeHarbor[1]) / 100;
    return Math.min(salary * rate, salary * 0.10);
  }

  // "dollar-for-dollar up to X%" — employer matches 100% up to X% of salary
  const dollarDollar = lower.match(/dollar.for.dollar.*?(\d+(?:\.\d+)?)\s*%/);
  if (dollarDollar) {
    const ceiling = parseFloat(dollarDollar[1]) / 100;
    return Math.min(salary * 0.10, salary * ceiling);
  }

  // "50% match up to 6%" — employer matches X% of contributions up to Y% of salary
  const pctOfPct = lower.match(
    /(\d+(?:\.\d+)?)\s*%\s*(?:match\s*)?(?:on|up\s*to|of)\s*(?:the\s*first\s*)?(\d+(?:\.\d+)?)\s*%/
  );
  if (pctOfPct) {
    const matchPct   = parseFloat(pctOfPct[1]) / 100;
    const ceilingPct = parseFloat(pctOfPct[2]) / 100;
    // Sanity check: if first pct is very large (>25%), it's likely "100% of X%" form
    // but we already handled that above; treat as direct salary match capped at ceiling
    if (matchPct > 0.25 && ceilingPct > 0 && ceilingPct < 0.15) {
      const employeeContrib = Math.min(salary * 0.10, salary * ceilingPct);
      return employeeContrib * matchPct;
    }
    const employeeContrib = Math.min(salary * 0.10, salary * ceilingPct);
    return employeeContrib * matchPct;
  }

  // Last resort: find a small standalone percentage (<=10%) as direct salary match ceiling
  // Avoid large percentages like "100%" which indicate match ratios, not salary ceilings
  const allPcts = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*%/g)]
    .map(m => parseFloat(m[1]))
    .filter(p => p > 0 && p <= 10);
  if (allPcts.length > 0) {
    const rate = allPcts[0] / 100;
    return Math.min(salary * rate, salary * 0.10);
  }

  return 0;
}

// IRS 2025 constants
const IRS_LIMIT_2025    = 23500;
const SS_WAGE_BASE_2025 = 176100;
const STD_DEDUCTION_2025 = 15000;

function computeMathAtSalary(salary, matchRateStr, copayMonthly) {
  const gross_biweekly = Math.round(salary / 26);

  // Employee 401k (10% but capped at IRS limit)
  const employee401k_annual = Math.min(salary * 0.10, IRS_LIMIT_2025);
  const employee401k = Math.round(employee401k_annual / 26);

  // Employer match
  const employerMatch_annual = parseMatchRate(matchRateStr, salary);
  const employer_match_est = Math.round(employerMatch_annual / 26);

  // Social Security (6.2% up to wage base)
  const ss_annual = Math.min(salary, SS_WAGE_BASE_2025) * 0.062;
  const social_security = Math.round(ss_annual / 26);

  // Medicare (1.45% + 0.9% additional over $200K for single filers)
  let medicare_annual = salary * 0.0145;
  if (salary > 200000) {
    medicare_annual += (salary - 200000) * 0.009;
  }
  const medicare = Math.round(medicare_annual / 26);

  // Health premium (individual, biweekly)
  const health_premium_est = Math.round((copayMonthly * 12) / 26);

  // Federal income tax estimate (single filer)
  // Taxable income = gross - pre-tax 401k - standard deduction
  const taxableIncome = Math.max(0, salary - employee401k_annual - STD_DEDUCTION_2025);
  let fed_tax_annual = 0;
  // 2025 brackets (approximate, single filer):
  //   10%  on $0-$11,925
  //   12%  on $11,925-$48,475
  //   22%  on $48,475-$103,350
  //   24%  on $103,350-$197,300
  //   32%  on $197,300-$243,725
  //   35%  on $243,725-$609,350
  //   37%  on $609,350+
  const brackets = [
    [11925,    0.10],
    [48475,    0.12],
    [103350,   0.22],
    [197300,   0.24],
    [243725,   0.32],
    [609350,   0.35],
    [Infinity, 0.37],
  ];
  let remaining = taxableIncome;
  let prev = 0;
  for (const [ceiling, rate] of brackets) {
    const band = ceiling - prev;
    const chunk = Math.min(remaining, band);
    fed_tax_annual += chunk * rate;
    remaining -= chunk;
    prev = ceiling;
    if (remaining <= 0) break;
  }
  const fed_tax_est = Math.round(fed_tax_annual / 26);

  // Estimated take-home
  const est_take_home = gross_biweekly
    - employee401k
    - social_security
    - medicare
    - health_premium_est
    - fed_tax_est;

  return {
    gross_biweekly,
    employee_401k: employee401k,
    employer_match_est,
    social_security,
    medicare,
    health_premium_est,
    fed_tax_est,
    est_take_home,
  };
}

function buildBiweeklyMath(data) {
  const matchStr   = data.benefits?.['401k_match'] ?? '';
  const copayStr   = data.benefits?.estimated_copay ?? '';
  const copayMonthly = parseCopayMonthly(copayStr);

  return {
    assumed_contribution_pct: 10,
    irs_limit_2025: IRS_LIMIT_2025,
    at_200k: computeMathAtSalary(200000, matchStr, copayMonthly),
    at_250k: computeMathAtSalary(250000, matchStr, copayMonthly),
    at_300k: computeMathAtSalary(300000, matchStr, copayMonthly),
    notes: [
      'Federal tax estimates are approximations for a single filer with 2025 standard deduction ($15,000).',
      'Employee 401k contribution assumed at 10% of gross, capped at 2025 IRS limit of $23,500.',
      'Social Security capped at $176,100 wage base (6.2%).',
      'Medicare: 1.45% flat + 0.9% additional on income over $200K (single filer).',
      `Health premium uses ${copayStr ? 'company-specific estimate' : 'industry default ($300/mo)'}; individual coverage, biweekly.`,
      'Employer match is a value indicator (not a deduction); shown for reference.',
    ].join(' '),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('enrich-401k-deep.mjs');
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}${MATH_ONLY ? ' | MATH-ONLY' : ''}${SKIP_MATH ? ' | SKIP-MATH' : ''}`);
  console.log(`  Dir:  ${DIR}`);
  console.log('');

  const entries = loadAllFiles();
  console.log(`Loaded ${entries.length} role-enrichment files.\n`);

  // ── Phase 1 ──
  const gaps = findGaps(entries);
  if (gaps.length === 0) {
    console.log('Phase 1: No 401k gaps found.\n');
  } else {
    console.log(`Phase 1: ${gaps.length} file(s) with missing/vague 401k_match data:`);
    for (const { filename, data } of gaps) {
      const company = data.company ?? 'unknown';
      const current = data.benefits?.['401k_match'] ?? '(missing)';
      console.log(`  [GAP] ${filename}`);
      console.log(`        company: ${company}`);
      console.log(`        current: ${current.slice(0, 100)}`);
    }
    console.log('');
  }

  // ── Phase 2 ──
  if (!MATH_ONLY && gaps.length > 0) {
    console.log('Phase 2: Researching via Perplexity sonar-reasoning-pro...\n');
    for (const entry of gaps) {
      const { data } = entry;
      const company = data.company ?? 'unknown';
      // Skip non-US companies (Mistral is French; no US 401k)
      if (company.toLowerCase().includes('mistral')) {
        console.log(`  [SKIP] ${company} — EU-based company, no US 401k`);
        continue;
      }

      console.log(`  Researching: ${company}...`);

      if (DRY_RUN) {
        console.log(`    [DRY-RUN] Would call Perplexity for: "${company}"`);
        continue;
      }

      const result = await researchCompany(company);
      if (!result) {
        console.log(`    [FAIL] No result for ${company}`);
        continue;
      }

      console.log(`    match_rate:  ${result.match_rate}`);
      console.log(`    vesting:     ${result.vesting}`);
      console.log(`    confidence:  ${result.confidence}`);
      console.log(`    source_hint: ${result.source_hint}`);

      // Update 401k_match if Perplexity returned usable data
      const isUsable = result.confidence !== 'low' || !hasGap(result.match_rate);
      if (isUsable && result.match_rate && result.match_rate !== 'unknown') {
        const newValue = `${result.match_rate}${result.vesting && result.vesting !== 'unknown' ? '; vesting: ' + result.vesting : ''} (${result.confidence} confidence; source: ${result.source_hint})`;
        entry.data.benefits['401k_match'] = newValue;
        entry._updated401k = true;
        console.log(`    -> Updated 401k_match to: ${newValue}`);
      } else {
        console.log(`    -> Confidence too low or match unknown; leaving field as-is`);
      }
      console.log('');
    }
  }

  // ── Phase 3 ──
  if (!SKIP_MATH) {
    console.log('Phase 3: Computing biweekly_math for all files...\n');
    for (const entry of entries) {
      const { filename, data } = entry;
      const company = data.company ?? 'unknown';
      const math = buildBiweeklyMath(data);

      const existed = !!data.biweekly_math;
      const changed = JSON.stringify(data.biweekly_math) !== JSON.stringify(math);

      if (DRY_RUN) {
        console.log(`  [DRY-RUN] ${filename} (${company})`);
        console.log(`    at_200k: gross=$${math.at_200k.gross_biweekly} | 401k=-$${math.at_200k.employee_401k} | SS=-$${math.at_200k.social_security} | medicare=-$${math.at_200k.medicare} | health=-$${math.at_200k.health_premium_est} | fed_tax=-$${math.at_200k.fed_tax_est} | take_home=$${math.at_200k.est_take_home} | employer_match=+$${math.at_200k.employer_match_est}`);
        console.log(`    at_250k: gross=$${math.at_250k.gross_biweekly} | take_home=$${math.at_250k.est_take_home}`);
        console.log(`    at_300k: gross=$${math.at_300k.gross_biweekly} | take_home=$${math.at_300k.est_take_home}`);
        console.log(`    action: ${existed ? (changed ? 'UPDATE' : 'NO-CHANGE') : 'ADD'}`);
      } else {
        entry.data.biweekly_math = math;
        entry._mathUpdated = true;
      }
    }
    if (!DRY_RUN) {
      console.log(`  Computed biweekly_math for ${entries.length} files`);
    }
    console.log('');
  }

  // ── Write ──
  if (!DRY_RUN) {
    let written = 0;
    for (const { filePath, data, _updated401k, _mathUpdated } of entries) {
      if (_updated401k || _mathUpdated) {
        writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        written++;
      }
    }
    console.log(`Wrote ${written} file(s).`);
  } else {
    console.log('[DRY-RUN] No files written.');
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
