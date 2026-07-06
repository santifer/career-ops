#!/usr/bin/env node
/**
 * verify-posting.mjs — Domain legitimacy check for job postings
 *
 * Uses free OpenOSINT tools (whois, dns, dorks) to verify whether a
 * job posting URL belongs to a real, established company domain.
 * Outputs a Block G-compatible legitimacy assessment.
 *
 * Usage:
 *   node verify-posting.mjs <job-posting-url>
 *   node verify-posting.mjs https://jobs.lever.co/acme/abc123
 *   node verify-posting.mjs --json https://greenhouse.io/...   (machine-readable)
 */

import { spawnSync } from 'child_process';
import { URL } from 'url';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const urlArg = args.find(a => !a.startsWith('--'));

if (!urlArg) {
  console.error('Usage: node verify-posting.mjs [--json] <job-posting-url>');
  process.exit(1);
}

// ── 1. Parse domain ──────────────────────────────────────────────────────────

let parsed;
try {
  parsed = new URL(urlArg.startsWith('http') ? urlArg : `https://${urlArg}`);
} catch {
  console.error(`❌ Invalid URL: ${urlArg}`);
  process.exit(1);
}

const fullDomain = parsed.hostname; // e.g. jobs.lever.co
const parts = fullDomain.split('.');
// Root domain = last two parts (or three for .co.uk etc)
const rootDomain = parts.length > 2 ? parts.slice(-2).join('.') : fullDomain;

// Known ATS/job board domains — these are intermediaries, not the company itself
const ATS_DOMAINS = new Set([
  'lever.co', 'greenhouse.io', 'ashbyhq.com', 'workable.com',
  'smartrecruiters.com', 'jobvite.com', 'icims.com', 'breezy.hr',
  'recruitee.com', 'bamboohr.com', 'workday.com', 'taleo.net',
  'myworkdayjobs.com', 'linkedin.com', 'indeed.com', 'glassdoor.com',
  'ziprecruiter.com', 'monster.com', 'careerbuilder.com', 'dice.com',
]);

const isAtsDomain = ATS_DOMAINS.has(rootDomain);

// Try to extract company domain from ATS URL path
// e.g. jobs.lever.co/acme → acme (need to look up separately)
let companySlug = null;
if (isAtsDomain) {
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  companySlug = pathParts[0] || null;
}

// ── 2. Run OpenOSINT tools via Python ────────────────────────────────────────

function runPython(script) {
  const result = spawnSync('python', ['-c', script], {
    encoding: 'utf8',
    timeout: 30000,
  });
  return {
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
    ok: result.status === 0,
  };
}

function runWhois(domain) {
  const script = `
import whois, json, sys
try:
    w = whois.whois("${domain}")
    out = {
        "registrar": str(w.registrar or ""),
        "creation_date": str(w.creation_date[0] if isinstance(w.creation_date, list) else w.creation_date or ""),
        "expiration_date": str(w.expiration_date[0] if isinstance(w.expiration_date, list) else w.expiration_date or ""),
        "name_servers": list(w.name_servers or []),
        "org": str(w.org or ""),
        "country": str(w.country or ""),
        "status": str(w.status[0] if isinstance(w.status, list) else w.status or ""),
    }
    print(json.dumps(out))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
  const r = runPython(script);
  try { return JSON.parse(r.stdout); } catch { return { error: r.stderr || 'parse error' }; }
}

function runDns(domain) {
  const script = `
import dns.resolver, json
results = {}
for rtype in ["A", "MX", "TXT", "NS"]:
    try:
        answers = dns.resolver.resolve("${domain}", rtype, lifetime=5)
        results[rtype] = [str(r) for r in answers]
    except Exception as e:
        results[rtype] = []
print(json.dumps(results))
`;
  const r = runPython(script);
  try { return JSON.parse(r.stdout); } catch { return {}; }
}

// ── 3. Analyze signals ───────────────────────────────────────────────────────

function analyzeWhois(w) {
  const signals = [];
  let score = 0; // positive = trustworthy

  if (w.error) {
    signals.push({ label: 'WHOIS lookup failed', detail: w.error, weight: 0 });
    return { signals, score, domainAge: null };
  }

  // Domain age
  let domainAge = null;
  if (w.creation_date && !w.creation_date.includes('None')) {
    try {
      const created = new Date(w.creation_date);
      const ageYears = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24 * 365);
      domainAge = Math.round(ageYears * 10) / 10;
      if (ageYears >= 5) {
        score += 3;
        signals.push({ label: `Domain age: ${domainAge}y`, detail: 'Established domain (5+ years)', weight: 'positive' });
      } else if (ageYears >= 2) {
        score += 1;
        signals.push({ label: `Domain age: ${domainAge}y`, detail: 'Reasonably established (2-5 years)', weight: 'neutral' });
      } else if (ageYears < 0.5) {
        score -= 3;
        signals.push({ label: `Domain age: ${domainAge}y`, detail: '⚠️ Very new domain (under 6 months)', weight: 'negative' });
      } else {
        signals.push({ label: `Domain age: ${domainAge}y`, detail: 'Young domain (6mo-2yr) — not unusual for startups', weight: 'neutral' });
      }
    } catch {}
  }

  // Registrar
  if (w.registrar) {
    const r = w.registrar.toLowerCase();
    const enterpriseRegistrars = ['markmonitor', 'cscglobal', 'verisign', 'networksolutions', 'safenames'];
    if (enterpriseRegistrars.some(e => r.includes(e))) {
      score += 2;
      signals.push({ label: `Registrar: ${w.registrar}`, detail: 'Enterprise-grade registrar — used by established companies', weight: 'positive' });
    } else {
      signals.push({ label: `Registrar: ${w.registrar}`, detail: 'Standard registrar', weight: 'neutral' });
    }
  }

  // Expiration
  if (w.expiration_date && !w.expiration_date.includes('None')) {
    try {
      const exp = new Date(w.expiration_date);
      const daysToExp = (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysToExp < 30) {
        score -= 2;
        signals.push({ label: 'Domain expiring soon', detail: `⚠️ Expires in ${Math.round(daysToExp)} days`, weight: 'negative' });
      } else if (daysToExp > 365) {
        score += 1;
        signals.push({ label: 'Domain renewal', detail: 'Renewed well in advance — active maintenance', weight: 'positive' });
      }
    } catch {}
  }

  // Org field
  if (w.org && !w.org.includes('None') && w.org.length > 2) {
    signals.push({ label: `Org: ${w.org}`, detail: 'Registration org field populated', weight: 'neutral' });
  }

  return { signals, score, domainAge };
}

function analyzeDns(dns) {
  const signals = [];
  let score = 0;

  if (dns.MX && dns.MX.length > 0) {
    const mx = dns.MX.join(' ').toLowerCase();
    if (mx.includes('google') || mx.includes('outlook') || mx.includes('microsoft') || mx.includes('proofpoint') || mx.includes('mimecast')) {
      score += 2;
      signals.push({ label: 'MX: corporate email provider', detail: `Uses ${dns.MX[0]}`, weight: 'positive' });
    } else {
      score += 1;
      signals.push({ label: 'MX records present', detail: 'Company has email infrastructure', weight: 'positive' });
    }
  } else {
    score -= 1;
    signals.push({ label: 'No MX records', detail: '⚠️ Domain has no email setup — unusual for a hiring company', weight: 'negative' });
  }

  if (dns.TXT && dns.TXT.length > 0) {
    const txt = dns.TXT.join(' ').toLowerCase();
    if (txt.includes('v=spf1')) {
      score += 1;
      signals.push({ label: 'SPF record present', detail: 'Email authentication configured', weight: 'positive' });
    }
    if (txt.includes('google-site-verification') || txt.includes('ms=') || txt.includes('atlassian')) {
      score += 1;
      signals.push({ label: 'Service verification records', detail: 'Uses enterprise services (Google/Microsoft/Atlassian)', weight: 'positive' });
    }
  }

  if (dns.A && dns.A.length > 0) {
    signals.push({ label: `A record: ${dns.A[0]}`, detail: 'Domain resolves to an IP', weight: 'neutral' });
  } else {
    score -= 2;
    signals.push({ label: 'No A record', detail: '⚠️ Domain does not resolve — possibly defunct', weight: 'negative' });
  }

  return { signals, score };
}

function verdict(totalScore, isAts) {
  if (isAts) {
    if (totalScore >= 4) return 'High Confidence';
    if (totalScore >= 1) return 'Proceed with Caution';
    return 'Suspicious';
  }
  if (totalScore >= 5) return 'High Confidence';
  if (totalScore >= 2) return 'Proceed with Caution';
  return 'Suspicious';
}

// ── 4. Main ──────────────────────────────────────────────────────────────────

if (!jsonMode) {
  console.log(`\n🔍 Verifying job posting domain: ${fullDomain}`);
  if (isAtsDomain) {
    console.log(`   (ATS platform: ${rootDomain}${companySlug ? ` → company slug: "${companySlug}"` : ''})`);
    console.log(`   Checking ATS platform domain credibility...\n`);
  } else {
    console.log(`   Root domain: ${rootDomain}\n`);
  }
}

const targetDomain = rootDomain;

const [whoisData, dnsData] = await Promise.all([
  Promise.resolve(runWhois(targetDomain)),
  Promise.resolve(runDns(targetDomain)),
]);

const whoisAnalysis = analyzeWhois(whoisData);
const dnsAnalysis = analyzeDns(dnsData);
const totalScore = whoisAnalysis.score + dnsAnalysis.score;
const tier = verdict(totalScore, isAtsDomain);

const allSignals = [...whoisAnalysis.signals, ...dnsAnalysis.signals];

// ── 5. Output ─────────────────────────────────────────────────────────────────

if (jsonMode) {
  console.log(JSON.stringify({
    url: urlArg,
    domain: fullDomain,
    rootDomain: targetDomain,
    isAtsPlatform: isAtsDomain,
    companySlug,
    domainAge: whoisAnalysis.domainAge,
    score: totalScore,
    verdict: tier,
    signals: allSignals,
    whois: whoisData,
    dns: dnsData,
  }, null, 2));
  process.exit(0);
}

// Human-readable output
const ICONS = { positive: '✅', negative: '⚠️', neutral: '·' };
const tierIcon = { 'High Confidence': '🟢', 'Proceed with Caution': '🟡', 'Suspicious': '🔴' };

console.log('─'.repeat(60));
console.log(`${tierIcon[tier]} Block G — Domain Legitimacy: ${tier}`);
console.log('─'.repeat(60));

if (isAtsDomain) {
  console.log(`\nℹ️  Posted via ATS platform (${rootDomain})`);
  if (companySlug) console.log(`   Company identifier: "${companySlug}"`);
  console.log(`   Note: ATS platforms are used by real companies but also by ghost postings.`);
  console.log(`   Domain signals below are for the ATS platform itself.\n`);
}

console.log('Signals:\n');
for (const s of allSignals) {
  const icon = ICONS[s.weight] || '·';
  console.log(`  ${icon}  ${s.label}`);
  console.log(`       ${s.detail}`);
}

console.log(`\nDomain score: ${totalScore > 0 ? '+' : ''}${totalScore}`);
console.log('\n' + '─'.repeat(60));
console.log(`Assessment: ${tierIcon[tier]} ${tier}`);

const notes = {
  'High Confidence': 'Domain signals are consistent with a real, established company. Proceed with the application.',
  'Proceed with Caution': 'Mixed domain signals. Cross-reference the company name with LinkedIn/Crunchbase before investing significant time.',
  'Suspicious': 'Multiple domain signals are concerning. Verify the company exists independently before applying or sharing personal information.',
};
console.log(`\n${notes[tier]}\n`);

if (isAtsDomain && companySlug) {
  console.log(`💡 Tip: Search "${companySlug}" on LinkedIn and Crunchbase to verify the company is real.`);
  console.log(`   The ATS platform domain being legitimate does not confirm the hiring company is real.\n`);
}
