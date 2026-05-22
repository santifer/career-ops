// scratch/find-matching-companies.mjs
import fs from 'fs';
import yaml from 'js-yaml';

const companiesJsonPath = 'scratch/berlin-companies-scraped.json';
const portalsYmlPath = 'portals.yml';

if (!fs.existsSync(companiesJsonPath)) {
  console.error(`Missing ${companiesJsonPath}`);
  process.exit(1);
}
if (!fs.existsSync(portalsYmlPath)) {
  console.error(`Missing ${portalsYmlPath}`);
  process.exit(1);
}

const berlinCompanies = JSON.parse(fs.readFileSync(companiesJsonPath, 'utf-8'));
const portalsConfig = yaml.load(fs.readFileSync(portalsYmlPath, 'utf-8'));
const trackedCompanies = portalsConfig.tracked_companies || [];

const trackedNamesLower = new Set(trackedCompanies.map(c => c.name.toLowerCase()));
const matched = [];
const unmatched = [];

for (const company of berlinCompanies) {
  const nameLower = company.name.toLowerCase();
  // Find match by exact name or substring
  const foundTracked = trackedCompanies.find(c => {
    const tcLower = c.name.toLowerCase();
    return tcLower === nameLower || tcLower.includes(nameLower) || nameLower.includes(tcLower);
  });
  
  if (foundTracked) {
    matched.push({
      scrapedName: company.name,
      trackedName: foundTracked.name,
      careers_url: foundTracked.careers_url,
      api: foundTracked.api,
      scan_method: foundTracked.scan_method
    });
  } else {
    unmatched.push(company);
  }
}

console.log(`Matched companies: ${matched.length}`);
console.log(`Unmatched companies: ${unmatched.length}`);
console.log('\n--- Matched Examples ---');
console.log(matched.slice(0, 15));
console.log('\n--- Unmatched Examples ---');
console.log(unmatched.slice(0, 15));
