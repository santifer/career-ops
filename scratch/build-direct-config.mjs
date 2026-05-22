// scratch/build-direct-config.mjs
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

const companiesJsonPath = 'scratch/berlin-companies-scraped.json';
const portalsYmlPath = 'portals.yml';
const resolvedJsonPath = 'scratch/resolved-ats-companies.json';
const configDir = 'config';
const configPath = path.join(configDir, 'berlin-direct-companies.json');

if (!fs.existsSync(companiesJsonPath) || !fs.existsSync(portalsYmlPath)) {
  console.error('Required source files are missing.');
  process.exit(1);
}

const berlinCompanies = JSON.parse(fs.readFileSync(companiesJsonPath, 'utf-8'));
const portalsConfig = yaml.load(fs.readFileSync(portalsYmlPath, 'utf-8'));
const trackedCompanies = portalsConfig.tracked_companies || [];

// Load probe results if they exist
let resolvedAts = [];
if (fs.existsSync(resolvedJsonPath)) {
  resolvedAts = JSON.parse(fs.readFileSync(resolvedJsonPath, 'utf-8'));
}

const results = [];
const seenNames = new Set();

// 1. Process matches from portals.yml
for (const company of berlinCompanies) {
  const nameLower = company.name.toLowerCase();
  
  const foundTracked = trackedCompanies.find(c => {
    const tcLower = c.name.toLowerCase();
    return tcLower === nameLower || tcLower.includes(nameLower) || nameLower.includes(tcLower);
  });
  
  if (foundTracked) {
    let provider = foundTracked.provider;
    let url = foundTracked.careers_url;
    let api = foundTracked.api;
    
    // Auto-detect provider and api if not explicitly set
    if (!provider && url) {
      if (url.includes('lever.co')) {
        provider = 'lever';
        const match = url.match(/jobs\.lever\.co\/([^/?#]+)/);
        if (match) api = `https://api.lever.co/v0/postings/${match[1]}`;
      } else if (url.includes('greenhouse.io')) {
        provider = 'greenhouse';
        const match = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
        if (match) api = `https://boards-api.greenhouse.io/v1/boards/${match[1]}/jobs`;
      } else if (url.includes('ashbyhq.com')) {
        provider = 'ashby';
        const match = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
        if (match) api = `https://api.ashbyhq.com/posting-api/job-board/${match[1]}?includeCompensation=true`;
      }
    }
    
    if (provider && api) {
      seenNames.add(nameLower);
      results.push({
        name: company.name,
        provider,
        url,
        api
      });
    }
  }
}

// 2. Process matches from probe findings
for (const item of resolvedAts) {
  const nameLower = item.company.name.toLowerCase();
  if (!seenNames.has(nameLower)) {
    seenNames.add(nameLower);
    results.push({
      name: item.company.name,
      provider: item.provider,
      url: item.url,
      api: item.api
    });
  }
}

// Sort alphabetically by name
results.sort((a, b) => a.name.localeCompare(b.name));

// Write to config file
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

fs.writeFileSync(configPath, JSON.stringify(results, null, 2), 'utf-8');
console.log(`Successfully wrote ${results.length} direct career profiles to ${configPath}`);
