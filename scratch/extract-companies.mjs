import fs from 'fs';
import path from 'path';

const pipelinePath = 'data/pipeline.md';
const scanHistoryPath = 'data/scan-history.tsv';
const jsonPath = 'scratch/linkedin-search-results.json';

const companies = new Set();

// 1. Parse JSON results
if (fs.existsSync(jsonPath)) {
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    for (const item of data) {
      if (item.company && (item.location?.toLowerCase().includes('berlin') || !item.location)) {
        companies.add(item.company.trim());
      }
    }
  } catch (e) {
    console.error('Error reading json:', e.message);
  }
}

// 2. Parse scan-history.tsv
if (fs.existsSync(scanHistoryPath)) {
  try {
    const lines = fs.readFileSync(scanHistoryPath, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const parts = line.split('\t');
      if (parts.length >= 5) {
        const company = parts[4];
        const location = parts[6] || '';
        if (company && (location.toLowerCase().includes('berlin') || !location)) {
          companies.add(company.trim());
        }
      }
    }
  } catch (e) {
    console.error('Error reading tsv:', e.message);
  }
}

// 3. Parse pipeline.md
if (fs.existsSync(pipelinePath)) {
  try {
    const text = fs.readFileSync(pipelinePath, 'utf-8');
    // Format is: - [ ] url | company | title
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.includes('|')) {
        const parts = line.split('|');
        if (parts.length >= 2) {
          const company = parts[1].trim();
          if (company && !company.startsWith('http') && !company.includes('[')) {
            companies.add(company);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error reading pipeline:', e.message);
  }
}

console.log(`Found ${companies.size} unique Berlin companies in local records:`);
const sortedCompanies = Array.from(companies).sort();
console.log(JSON.stringify(sortedCompanies, null, 2));
