// scratch/probe-ats.mjs
import fs from 'fs';
import yaml from 'js-yaml';

const companiesJsonPath = 'scratch/berlin-companies-scraped.json';
const portalsYmlPath = 'portals.yml';

const berlinCompanies = JSON.parse(fs.readFileSync(companiesJsonPath, 'utf-8'));
const portalsConfig = yaml.load(fs.readFileSync(portalsYmlPath, 'utf-8'));
const trackedCompanies = portalsConfig.tracked_companies || [];

const trackedNames = new Set(trackedCompanies.map(c => c.name.toLowerCase()));

// Find unmatched companies
const unmatched = berlinCompanies.filter(c => {
  const nameLower = c.name.toLowerCase();
  return !trackedCompanies.some(tc => {
    const tcLower = tc.name.toLowerCase();
    return tcLower === nameLower || tcLower.includes(nameLower) || nameLower.includes(tcLower);
  });
});

console.log(`Probing ${unmatched.length} unmatched companies...`);

// Helper to generate slug candidates
function getSlugCandidates(name) {
  const cleanName = name
    .replace(/\s*(?:gmbh|se|ag|group|gmbh\s*&\s*co\.\s*kg|gmbh\s*&\s*co\s*kg|gmbh\s*und\s*co\s*kg|inc|ltd|co)\b/gi, '')
    .trim();
    
  const candidates = new Set();
  
  // Standard slug: lowercase, replace non-alphanumeric with hyphen
  const standard = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (standard) candidates.add(standard);
  
  // Stripped slug: lowercase, remove non-alphanumeric completely
  const stripped = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (stripped) candidates.add(stripped);

  // Original name slug (with suffix)
  const withSuffix = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (withSuffix) candidates.add(withSuffix);

  return Array.from(candidates);
}

// Probing functions
async function checkGreenhouse(slug) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
  try {
    const res = await fetch(url, { method: 'GET' });
    if (res.status === 200) {
      return { provider: 'greenhouse', url: `https://job-boards.greenhouse.io/${slug}`, api: url };
    }
  } catch (e) {}
  return null;
}

async function checkLever(slug) {
  const url = `https://api.lever.co/v0/postings/${slug}`;
  try {
    const res = await fetch(url, { method: 'GET' });
    if (res.status === 200) {
      return { provider: 'lever', url: `https://jobs.lever.co/${slug}`, api: url };
    }
  } catch (e) {}
  return null;
}

async function checkAshby(slug) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  try {
    const res = await fetch(url, { method: 'GET' });
    if (res.status === 200) {
      return { provider: 'ashby', url: `https://jobs.ashbyhq.com/${slug}`, api: url };
    }
  } catch (e) {}
  return null;
}

async function probeCompany(company) {
  const candidates = getSlugCandidates(company.name);
  for (const slug of candidates) {
    // Greenhouse
    let res = await checkGreenhouse(slug);
    if (res) return { company, ...res, slug };
    
    // Lever
    res = await checkLever(slug);
    if (res) return { company, ...res, slug };
    
    // Ashby
    res = await checkAshby(slug);
    if (res) return { company, ...res, slug };
  }
  return null;
}

async function main() {
  const found = [];
  const limit = 5; // concurrency
  
  for (let i = 0; i < unmatched.length; i += limit) {
    const batch = unmatched.slice(i, i + limit);
    const promises = batch.map(c => probeCompany(c));
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r) {
        console.log(`✅ Found: ${r.company.name} -> ${r.provider} (${r.url})`);
        found.push(r);
      }
    }
    // Sleep a tiny bit to avoid hitting rate limits
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\nScan finished. Resolved ${found.length} / ${unmatched.length} companies.`);
  
  // Save findings to scratch file
  fs.writeFileSync('scratch/resolved-ats-companies.json', JSON.stringify(found, null, 2), 'utf-8');
}

main().catch(console.error);
