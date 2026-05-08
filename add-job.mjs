#!/usr/bin/env node
// add-job.mjs - Scrape, score, and add a single job URL to the database

import sql from './db/client.mjs';
import { chromium } from 'playwright';

const url = process.argv[2];
const userId = process.env.SCAN_USER_ID || 1;

if (!url) {
  console.error('Usage: node add-job.mjs <job_url>');
  process.exit(1);
}

// Calculate ATS-like score based on JD vs profile keywords
function calculateJobScore(jdText, profile) {
  const jdLower = (jdText || '').toLowerCase();
  const superpowers = profile?.narrative?.superpowers || [];
  const positiveKeywords = profile?.targeting_keywords?.positive || [];
  const negativeKeywords = profile?.targeting_keywords?.negative || [];

  let score = 5; // Base score

  // Positive matches
  for (const kw of positiveKeywords) {
    if (jdLower.includes(kw.toLowerCase())) score += 1;
  }

  // Superpowers match
  for (const sp of superpowers) {
    const words = sp.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && jdLower.includes(word)) score += 0.5;
    }
  }

  // Negative penalty
  for (const kw of negativeKeywords) {
    if (jdLower.includes(kw.toLowerCase())) score -= 2;
  }

  return Math.max(0, Math.min(10, Math.round(score)));
}

// Extract company name from URL
function extractCompanyFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    // Handle subdomains: jobs.company.com or company.ashbyhq.com
    if (hostname.includes('ashbyhq.com') || hostname.includes('greenhouse.io')) {
      const match = url.match(/\/([^/]+)\/\d+/);
      if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
    // Default: second-level domain
    if (parts.length >= 2) {
      return parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1);
    }
  } catch (e) {
    // ignore
  }
  return 'Unknown Company';
}

// Extract job title from JD text (first line or heading)
function extractTitleFromJd(jdText) {
  if (!jdText) return 'Unknown Role';
  const lines = jdText.split('\n').filter(l => l.trim());
  // Look for common title patterns
  for (const line of lines.slice(0, 20)) {
    const trimmed = line.trim();
    if (/\b(engineer|developer|manager|architect|lead|director|head|vp)\b/i.test(trimmed)) {
      if (trimmed.length < 100) return trimmed;
    }
  }
  return lines[0]?.slice(0, 100) || 'Unknown Role';
}

// Scrape JD using Playwright
async function scrapeJD(url) {
  console.log(`🌐 Scraping job description from: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Try to find JD in common containers first
    const selectors = [
      '[data-testid="job-description"]',
      '.job-description',
      '#job-description',
      '[class*="description"]',
      'main',
      'article'
    ];

    let jdText = '';
    for (const selector of selectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          jdText = await el.innerText();
          if (jdText.length > 200) break;
        }
      } catch {}
    }

    // Fallback to body text
    if (!jdText || jdText.length < 200) {
      jdText = await page.evaluate(() => document.body.innerText);
    }

    await browser.close();
    return jdText.trim();
  } catch (err) {
    await browser.close();
    throw new Error(`Scrape failed: ${err.message}`);
  }
}

async function main() {
  console.log(`➕ Adding job: ${url}`);

  // Check if already exists
  const existing = await sql`
    SELECT id FROM jobs WHERE url = ${url} AND user_id = ${userId} LIMIT 1
  `;
  if (existing.length > 0) {
    console.log(`⚠️ Job already exists in database (ID: ${existing[0].id})`);
    console.log(`   Run: tailor ${existing[0].id} --deep`);
    process.exit(0);
  }

  // Load user profile for scoring
  const [profileRow] = await sql`
    SELECT resume_context, targeting_keywords FROM user_profiles WHERE user_id = ${userId}
  `;
  if (!profileRow) {
    console.error('❌ Profile not found. Please complete your profile in Settings first.');
    process.exit(1);
  }

  const profile = {
    ...profileRow.resume_context,
    targeting_keywords: profileRow.targeting_keywords || { positive: [], negative: [] }
  };

  // Scrape JD
  let jdText;
  try {
    jdText = await scrapeJD(url);
    console.log(`✓ Scraped ${jdText.length} characters`);
  } catch (e) {
    console.error(`❌ Failed to scrape: ${e.message}`);
    process.exit(1);
  }

  // Extract metadata
  const company = extractCompanyFromUrl(url);
  const title = extractTitleFromJd(jdText);
  const cleanUrl = url.split('?')[0];
  const score = calculateJobScore(jdText, profile);

  // Insert to database
  const [inserted] = await sql`
    INSERT INTO jobs (user_id, url, canonical_url, company, title, source, score, jd_text, created_at)
    VALUES (${userId}, ${url}, ${cleanUrl}, ${company}, ${title}, 'manual-add', ${score}, ${jdText.slice(0, 25000)}, NOW())
    RETURNING id, company, title, score
  `;

  console.log(`\n✅ Job added successfully!`);
  console.log(`   ID: ${inserted.id}`);
  console.log(`   Company: ${inserted.company}`);
  console.log(`   Title: ${inserted.title}`);
  console.log(`   Score: ${inserted.score}/10`);
  console.log(`\n📄 Next steps:`);
  console.log(`   tailor ${inserted.id} --deep    → Generate resume & cover letter`);
  console.log(`   apply ${inserted.id} --deep     → Auto-fill application`);
}

main().catch(e => {
  console.error(`❌ Error: ${e.message}`);
  process.exit(1);
});
