#!/usr/bin/env node
/**
 * fix-slugs.mjs — Verify and fix wrong ATS board slugs in portals.yml
 *
 * For each failing company, fetches their careers page, follows redirects,
 * and detects if they use Greenhouse / Ashby / Lever. Then updates portals.yml.
 *
 * Usage:
 *   node fix-slugs.mjs           # check + auto-fix portals.yml
 *   node fix-slugs.mjs --dry-run # check only, print results, no edits
 */

import { readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';

const DRY_RUN = process.argv.includes('--dry-run');
const TIMEOUT_MS = 12_000;
const CONCURRENCY = 5;

// ── Companies to check ────────────────────────────────────────────────
// Each entry: name (must match portals.yml), careers page to probe
const COMPANIES = [
  { name: 'Ada',               url: 'https://www.ada.cx/company/careers' },
  { name: '1Password',         url: 'https://1password.com/careers' },
  { name: 'Lightspeed Commerce', url: 'https://www.lightspeedhq.com/careers' },
  { name: 'Shopify',           url: 'https://www.shopify.com/careers' },
  { name: 'ApplyBoard',        url: 'https://www.applyboard.com/careers' },
  { name: 'Wealthsimple',      url: 'https://www.wealthsimple.com/en-ca/careers' },
  { name: 'Loblaw Digital',    url: 'https://loblawdigital.co/careers' },
  { name: 'Points (Loyalty One)', url: 'https://www.points.com/about/careers' },
  { name: 'Myplanet',          url: 'https://www.myplanet.com/careers' },
  { name: 'FreshBooks',        url: 'https://www.freshbooks.com/careers' },
  { name: 'Docebo',            url: 'https://www.docebo.com/careers' },
  { name: 'League',            url: 'https://league.com/careers' },
  { name: 'PointClickCare',    url: 'https://pointclickcare.com/careers' },
  { name: 'Intelliware',       url: 'https://intelliware.com/careers' },
  { name: 'Tulip Retail',      url: 'https://tulip.co/careers' },
  { name: 'Vidyard',           url: 'https://www.vidyard.com/careers' },
  { name: 'BlueCat',           url: 'https://bluecatnetworks.com/careers' },
  { name: 'Vena Solutions',    url: 'https://www.venasolutions.com/careers' },
  { name: 'BenchSci',          url: 'https://www.benchsci.com/careers' },
  { name: 'Fiix',              url: 'https://www.fiixsoftware.com/careers' },
  { name: 'Kinaxis',           url: 'https://www.kinaxis.com/en/careers' },
  { name: 'Axonify',           url: 'https://axonify.com/careers' },
  { name: 'Arctic Wolf',       url: 'https://arcticwolf.com/company/careers' },
  { name: 'Magnet Forensics',  url: 'https://www.magnetforensics.com/careers' },
  { name: 'eSentire',          url: 'https://www.esentire.com/careers' },
  { name: 'Auvik',             url: 'https://www.auvik.com/company/careers' },
  { name: 'Clio',              url: 'https://www.clio.com/about/careers' },
  { name: 'Dialogue',          url: 'https://www.dialogue.co/en/careers' },
  { name: 'Visier',            url: 'https://www.visier.com/company/careers' },
  { name: 'Properly',          url: 'https://www.properly.ca/careers' },
  { name: 'Klue',              url: 'https://klue.com/careers' },
  { name: 'AppDirect',         url: 'https://www.appdirect.com/about/careers' },
  { name: 'Jobber',            url: 'https://getjobber.com/careers' },
  { name: 'KOHO',              url: 'https://www.koho.ca/careers' },
  { name: 'Humi',              url: 'https://www.humi.ca/careers' },
  { name: 'Clearco',           url: 'https://clear.co/careers' },
  { name: 'Loopio',            url: 'https://www.loopio.com/careers' },
  { name: 'Forma.ai',          url: 'https://www.forma.ai/careers' },
  { name: 'Plusgrade',         url: 'https://www.plusgrade.com/careers' },
  { name: 'BioRender',         url: 'https://www.biorender.com/careers' },
  { name: 'Avidbots',          url: 'https://www.avidbots.com/careers' },
];

// ── ATS detection ─────────────────────────────────────────────────────

function detectFromUrl(finalUrl) {
  if (!finalUrl) return null;

  const ghMatch = finalUrl.match(/(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([^/?#]+)/);
  if (ghMatch) return { ats: 'greenhouse', slug: ghMatch[1], careers_url: `https://job-boards.greenhouse.io/${ghMatch[1]}` };

  const ashbyMatch = finalUrl.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) return { ats: 'ashby', slug: ashbyMatch[1], careers_url: `https://jobs.ashbyhq.com/${ashbyMatch[1]}` };

  const leverMatch = finalUrl.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) return { ats: 'lever', slug: leverMatch[1], careers_url: `https://jobs.lever.co/${leverMatch[1]}` };

  return null;
}

function detectFromBody(html, _baseUrl) {
  if (!html) return null;

  const patterns = [
    { re: /(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([a-z0-9_-]+)/gi, ats: 'greenhouse', fmt: s => `https://job-boards.greenhouse.io/${s}` },
    { re: /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/gi, ats: 'ashby', fmt: s => `https://jobs.ashbyhq.com/${s}` },
    { re: /jobs\.lever\.co\/([a-z0-9_-]+)/gi, ats: 'lever', fmt: s => `https://jobs.lever.co/${s}` },
  ];

  for (const { re, ats, fmt } of patterns) {
    const m = re.exec(html);
    if (m) return { ats, slug: m[1], careers_url: fmt(m[1]) };
  }

  // Detect other ATS (unsupported — mark for disabling)
  if (/workday\.com|myworkdayjobs\.com/i.test(html)) return { ats: 'workday', slug: null, careers_url: null };
  if (/smartrecruiters\.com/i.test(html)) return { ats: 'smartrecruiters', slug: null, careers_url: null };
  if (/rippling\.com\/jobs/i.test(html)) return { ats: 'rippling', slug: null, careers_url: null };
  if (/icims\.com/i.test(html)) return { ats: 'icims', slug: null, careers_url: null };
  if (/taleo\.net/i.test(html)) return { ats: 'taleo', slug: null, careers_url: null };

  return null;
}

// ── Fetch with redirect tracking ──────────────────────────────────────

async function fetchWithRedirects(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; career-ops-slug-checker/1.0)' },
    });
    const finalUrl = res.url;
    const html = res.ok ? await res.text() : '';
    return { finalUrl, html, status: res.status };
  } catch (err) {
    return { finalUrl: null, html: '', status: 0, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── Verify ATS API slug works ─────────────────────────────────────────

async function verifySlug(detected) {
  if (!detected || !detected.slug) return false;

  let apiUrl;
  if (detected.ats === 'greenhouse') apiUrl = `https://boards-api.greenhouse.io/v1/boards/${detected.slug}/jobs`;
  else if (detected.ats === 'ashby') apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${detected.slug}?includeCompensation=true`;
  else if (detected.ats === 'lever') apiUrl = `https://api.lever.co/v0/postings/${detected.slug}`;
  else return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── Check one company ─────────────────────────────────────────────────

async function checkCompany(company) {
  process.stdout.write(`  Checking ${company.name}... `);
  const { finalUrl, html, status, error } = await fetchWithRedirects(company.url);

  if (error) {
    console.log(`network error: ${error}`);
    return { name: company.name, status: 'error', error };
  }

  // 1. Try to detect from final redirect URL
  let detected = detectFromUrl(finalUrl);

  // 2. If not in URL, scan HTML body
  if (!detected) detected = detectFromBody(html, finalUrl);

  if (!detected) {
    console.log(`unknown (HTTP ${status}, final: ${finalUrl?.slice(0, 60)})`);
    return { name: company.name, status: 'unknown', finalUrl };
  }

  if (!detected.careers_url) {
    console.log(`unsupported ATS: ${detected.ats}`);
    return { name: company.name, status: 'unsupported', ats: detected.ats };
  }

  // 3. Verify API actually responds
  const verified = await verifySlug(detected);
  if (verified) {
    console.log(`✓ ${detected.ats} → ${detected.careers_url}`);
    return { name: company.name, status: 'fixed', ...detected };
  } else {
    console.log(`detected ${detected.ats}/${detected.slug} but API returned 404`);
    return { name: company.name, status: 'slug-mismatch', ...detected };
  }
}

// ── Parallel execution ────────────────────────────────────────────────

async function parallelCheck(companies, limit) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < companies.length) {
      const company = companies[i++];
      results.push(await checkCompany(company));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, companies.length) }, worker));
  return results;
}

// ── Update portals.yml ────────────────────────────────────────────────

function updatePortals(results) {
  const portalsPath = 'portals.yml';
  const config = yaml.load(readFileSync(portalsPath, 'utf-8'));
  const companies = config.tracked_companies || [];

  let fixed = 0, disabled = 0;

  for (const result of results) {
    const entry = companies.find(c => c.name === result.name);
    if (!entry) continue;

    if (result.status === 'fixed') {
      entry.careers_url = result.careers_url;
      fixed++;
    } else if (result.status === 'unsupported' || result.status === 'unknown') {
      entry.enabled = false;
      entry._note = result.ats ? `uses ${result.ats} — not supported by scan.mjs` : 'careers page not detected';
      disabled++;
    }
    // slug-mismatch and error: leave as-is, let user investigate
  }

  if (!DRY_RUN) {
    writeFileSync(portalsPath, yaml.dump(config, { lineWidth: 120, quotingType: '"' }), 'utf-8');
    console.log(`\nportals.yml updated: ${fixed} fixed, ${disabled} disabled.`);
  } else {
    console.log(`\n[dry run] Would update: ${fixed} fixed, ${disabled} disabled.`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`Checking ${COMPANIES.length} companies (concurrency: ${CONCURRENCY})${DRY_RUN ? ' [dry run]' : ''}...\n`);
  const results = await parallelCheck(COMPANIES, CONCURRENCY);

  console.log('\n── Summary ───────────────────────────────────────────');
  const fixed     = results.filter(r => r.status === 'fixed');
  const mismatched = results.filter(r => r.status === 'slug-mismatch');
  const unsupported = results.filter(r => r.status === 'unsupported');
  const unknown   = results.filter(r => r.status === 'unknown');
  const errors    = results.filter(r => r.status === 'error');

  if (fixed.length) {
    console.log(`\n✓ Fixed (${fixed.length}):`);
    for (const r of fixed) console.log(`  ${r.name}: ${r.careers_url}`);
  }
  if (mismatched.length) {
    console.log(`\n⚠ Detected but API mismatch (${mismatched.length}) — manual check needed:`);
    for (const r of mismatched) console.log(`  ${r.name}: ${r.ats} / ${r.slug} → ${r.careers_url}`);
  }
  if (unsupported.length) {
    console.log(`\n✗ Unsupported ATS — will disable (${unsupported.length}):`);
    for (const r of unsupported) console.log(`  ${r.name}: ${r.ats}`);
  }
  if (unknown.length) {
    console.log(`\n? Unknown (${unknown.length}):`);
    for (const r of unknown) console.log(`  ${r.name}`);
  }
  if (errors.length) {
    console.log(`\n✗ Network errors (${errors.length}):`);
    for (const r of errors) console.log(`  ${r.name}: ${r.error}`);
  }

  if (!DRY_RUN) updatePortals(results);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
