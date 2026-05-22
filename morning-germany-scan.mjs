// morning-germany-scan.mjs - Full Germany job scan across all ATS platforms
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { makeHttpCtx } from './providers/_http.mjs';
import greenhouseProvider from './providers/greenhouse.mjs';
import ashbyProvider from './providers/ashby.mjs';
import leverProvider from './providers/lever.mjs';

dotenv.config();

// Config
const COMPANIES_PATH = 'config/berlin-direct-companies.json';
const OUTPUT_MD = 'scratch/morning-germany-jobs.md';
const PIPELINE_PATH = 'data/pipeline.md';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';

const providers = {
  greenhouse: greenhouseProvider,
  ashby: ashbyProvider,
  lever: leverProvider,
};

// Validate student/internship positions
function isStudentTechJob(title) {
  const lowerTitle = title.toLowerCase();
  const studentKeywords = [
    'werkstudent', 'working student', 'intern', 'praktikant', 'praktikum', 
    'student', 'internship', 'thesis', 'masterarbeit', 'bachelorarbeit'
  ];
  return studentKeywords.some(kw => lowerTitle.includes(kw));
}

// Filter for target tech roles
function isTargetTechRole(title) {
  const lowerTitle = title.toLowerCase();
  const targetRoles = [
    'machine learning', 'ml engineer', 'mlops', 'ai engineer', 'ai/ml', 'ai ',
    'data science', 'data scientist', 'data analyst', 'bi analyst', 'analytics',
    'full stack', 'fullstack', 'full-stack', 'software developer', 'developer', 'engineer',
    'backend', 'frontend', 'front-end'
  ];
  return targetRoles.some(role => lowerTitle.includes(role));
}

// Filter for Germany locations only
function isGermanyLocation(location) {
  if (!location) return false;
  const lowerLoc = location.toLowerCase();
  
  // Germany cities and regions
  const germanyKeywords = [
    'berlin', 'munich', 'münchen', 'cologne', 'köln', 'frankfurt', 'hamburg',
    'düsseldorf', 'dusseldorf', 'leverkusen', 'bonn', 'mannheim', 'heidelberg',
    'nuremberg', 'nürnberg', 'germany', 'deutschland', 'de', 'german', 'hesse', 'hessen'
  ];
  
  // Exclude these countries that sometimes appear with Germany keywords
  const excludeCountries = [
    'usa', 'united states', 'uk', 'united kingdom', 'canada', 'france', 'paris',
    'london', 'poland', 'belgrade', 'zurich', 'stockholm', 'switzerland'
  ];
  
  if (excludeCountries.some(exc => lowerLoc.includes(exc))) return false;
  
  return germanyKeywords.some(kw => lowerLoc.includes(kw));
}

// Load companies
async function loadCompanies() {
  try {
    const data = fs.readFileSync(COMPANIES_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading companies:', error.message);
    return [];
  }
}

// Load scan history
function loadScanHistory() {
  if (!fs.existsSync(SCAN_HISTORY_PATH)) {
    fs.writeFileSync(SCAN_HISTORY_PATH, 'company\turl\tlast_scanned\n', 'utf-8');
  }
  const content = fs.readFileSync(SCAN_HISTORY_PATH, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const history = {};
  for (const line of lines) {
    const [company, url] = line.split('\t');
    if (company && url) history[`${company}|${url}`] = true;
  }
  return history;
}

// Scan all companies
async function scanAllCompanies(companies) {
  const httpCtx = makeHttpCtx();
  const history = loadScanHistory();
  const newJobs = [];
  let scanned = 0;
  let errors = 0;

  console.log(`\n🌍 Starting full Germany ATS scan for ${companies.length} companies...`);

  for (const company of companies) {
    const provider = company.provider;
    if (!providers[provider]) {
      console.log(`⚠️ Unknown provider: ${provider} for ${company.name}`);
      continue;
    }

    try {
      const providerObj = providers[provider];
      const normalized = { ...company, careers_url: company.url };
      const jobs = await providerObj.fetch(normalized, httpCtx);

      if (!jobs || jobs.length === 0) {
        console.log(`✓ ${company.name}: 0 jobs`);
        scanned++;
        continue;
      }

      // Filter jobs
      const filtered = [];
      for (const job of jobs) {
        if (job.url && isStudentTechJob(job.title) && isTargetTechRole(job.title) && isGermanyLocation(job.location)) {
          // Check if already scanned
          const historyKey = `${company.name}|${job.url}`;
          if (!history[historyKey]) {
            filtered.push(job);
            history[historyKey] = true;
          }
        }
      }

      if (filtered.length > 0) {
        console.log(`✓ ${company.name}: ${filtered.length} new matching jobs`);
        newJobs.push(...filtered.map(j => ({
          company: company.name,
          title: j.title,
          location: j.location || 'Germany',
          url: j.url,
          source: company.provider
        })));
      } else {
        console.log(`✓ ${company.name}: 0 new matching jobs`);
      }

      scanned++;
    } catch (error) {
      console.error(`✗ ${company.name}: ${error.message}`);
      errors++;
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Scan complete: ${scanned}/${companies.length} scanned, ${errors} errors, ${newJobs.length} new jobs found`);
  
  // Save scan history
  let historyContent = 'company\turl\tlast_scanned\n';
  for (const key of Object.keys(history)) {
    const [company, url] = key.split('|');
    historyContent += `${company}\t${url}\t${new Date().toISOString()}\n`;
  }
  fs.writeFileSync(SCAN_HISTORY_PATH, historyContent, 'utf-8');

  return newJobs;
}

// Generate markdown report
function generateReport(jobs) {
  const now = new Date();
  const timestamp = now.toLocaleString('de-DE');

  let markdown = `# 🌍 Morning Germany Job Scan - ${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}\n\n`;
  markdown += `Generated at: **${timestamp}**\n`;
  markdown += `Found **${jobs.length}** new matching student/internship positions across Germany\n\n`;

  if (jobs.length === 0) {
    markdown += `No new matching positions found.\n`;
    return markdown;
  }

  markdown += `| Company | Role | Location | Source | Link |\n`;
  markdown += `| :--- | :--- | :--- | :--- | :--- |\n`;

  for (const job of jobs) {
    const cleanCompanyMD = job.company.replace(/\|/g, '-');
    const cleanTitleMD = job.title.replace(/\|/g, '-');
    const cleanLocationMD = (job.location || 'Germany').replace(/\|/g, '-');
    markdown += `| ${cleanCompanyMD} | ${cleanTitleMD} | ${cleanLocationMD} | \`${job.source}\` | [View Job](${job.url}) |\n`;
  }

  return markdown;
}

// Main
async function main() {
  try {
    const companies = await loadCompanies();
    const jobs = await scanAllCompanies(companies);
    const report = generateReport(jobs);

    // Save report
    fs.writeFileSync(OUTPUT_MD, report, 'utf8');
    console.log(`\n✅ Report saved to ${OUTPUT_MD}`);

    // Update pipeline
    if (jobs.length > 0) {
      try {
        let pipelineText = fs.readFileSync(PIPELINE_PATH, 'utf-8');
        const marker = '## Pendientes';
        const insertIdx = pipelineText.indexOf(marker);

        if (insertIdx !== -1) {
          const afterMarker = insertIdx + marker.length;
          const newLines = '\n' + jobs.map(j => `- [ ] ${j.url} | ${j.company} | ${j.title}`).join('\n');
          const updated = pipelineText.slice(0, afterMarker) + newLines + pipelineText.slice(afterMarker);
          fs.writeFileSync(PIPELINE_PATH, updated, 'utf-8');
          console.log(`✅ Pipeline updated with ${jobs.length} new jobs`);
        }
      } catch (pipelineError) {
        console.error('Warning: Could not update pipeline:', pipelineError.message);
      }
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
