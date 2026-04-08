#!/usr/bin/env node
/**
 * Career-Ops CLI - Scan Command
 * Scan job portals for new offers
 * 
 * Usage: career-ops scan [options]
 */

import { Command } from 'commander';
import { loadConfig } from '../core/config.js';
import { JobScraper } from '../core/scraper.js';
import { logger } from '../utils/logger.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Table from 'cli-table3';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'child_process';

const program = new Command();

program
  .name('scan')
  .description('Scan job portals for new offers')
  .option('-c, --companies <companies>', 'Specific companies to scan (comma-separated)')
  .option('-l, --limit <number>', 'Limit results per company', '10')
  .option('--output <file>', 'Output file', 'data/pipeline.md')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (options) => {
    try {
      logger.section('🔍 Scanning Job Portals');
      
      // Load scan mode from modes/ directory (like Claude Code)
      const modePath = join(process.cwd(), 'modes', 'scan.md');
      let scanMode = '';
      if (existsSync(modePath)) {
        scanMode = readFileSync(modePath, 'utf-8');
        logger.success('Loaded scan mode');
      }
      
      const config = loadConfig();
      const scraper = new JobScraper();
      const limit = parseInt(options.limit);
      
      if (!config.portals?.tracked_companies) {
        logger.error('No companies configured. Check portals.yml');
        process.exit(1);
      }
      
      // Filter companies if specified
      let companies = config.portals.tracked_companies.filter(c => c.enabled !== false);
      if (options.companies) {
        const companyList = options.companies.split(',').map(c => c.trim().toLowerCase());
        companies = companies.filter(c => 
          companyList.includes(c.name.toLowerCase())
        );
      }
      
      logger.info(`Scanning ${companies.length} companies...`);
      
      const allJobs = [];
      
      // Scan each company
      for (const company of companies) {
        if (options.verbose) {
          logger.subsection(`Scanning ${company.name}...`);
        }
        
        try {
          if (!company.careers_url) {
            if (options.verbose) {
              logger.warning(`${company.name}: No careers_url configured`);
            }
            continue;
          }
          
          const content = await scraper.fetch(company.careers_url);
          
          // Parse job listings from content
          const jobs = parseJobListings(content, company);
          
          if (jobs.length > 0) {
            allJobs.push(...jobs.slice(0, limit));
            if (options.verbose) {
              logger.success(`Found ${jobs.length} jobs at ${company.name}`);
            }
          }
        } catch (e) {
          if (options.verbose) {
            logger.warning(`${company.name}: ${e.message}`);
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Filter by title keywords
      const filteredJobs = filterByKeywords(allJobs, config.portals?.title_filter);
      
      // Remove duplicates
      const uniqueJobs = removeDuplicates(filteredJobs);
      
      // Load existing pipeline
      const pipelinePath = join(process.cwd(), options.output);
      let existingJobs = [];
      if (existsSync(pipelinePath)) {
        const content = readFileSync(pipelinePath, 'utf-8');
        existingJobs = parsePipeline(content);
      }
      
      // Find new jobs
      const newJobs = uniqueJobs.filter(job => 
        !existingJobs.some(ej => ej.url === job.url)
      );
      
      // Save to pipeline
      if (newJobs.length > 0) {
        savePipeline(pipelinePath, [...existingJobs, ...newJobs]);
        logger.success(`Added ${newJobs.length} new jobs to pipeline`);
      } else {
        logger.info('No new jobs found');
      }
      
      // Display summary
      logger.section('Scan Summary');
      console.log(`Companies scanned: ${companies.length}`);
      console.log(`Total jobs found: ${uniqueJobs.length}`);
      console.log(`New jobs added: ${newJobs.length}`);
      
      if (newJobs.length > 0) {
        logger.subsection('New Jobs:');
        
        // Create table
        const table = new Table({
          head: ['#', 'Company', 'Title', 'Location', 'URL'],
          colWidths: [4, 15, 30, 15, 40],
          style: { head: ['cyan', 'bold'] }
        });
        
        newJobs.forEach((job, i) => {
          const url = job.url || job.careers_url || 'N/A';
          const shortUrl = url.length > 37 ? url.substring(0, 37) + '...' : url;
          table.push([
            chalk.yellow(i + 1),
            job.company.substring(0, 13),
            job.title.substring(0, 28),
            (job.location || 'Remote').substring(0, 13),
            chalk.blue(shortUrl)
          ]);
        });
        
        console.log(table.toString());
        
        // Interactive selection
        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            ...newJobs.slice(0, 10).map((job, i) => ({
              name: `${i + 1}. Evaluate ${job.title} at ${job.company}`,
              value: { type: 'evaluate', job, index: i }
            })),
            new inquirer.Separator(),
            { name: '💾 Save all to pipeline & exit', value: { type: 'exit' } }
          ]
        }]);
        
        if (action.type === 'evaluate') {
          const selectedJob = action.job;
          logger.info(`\n▶️  Running evaluate for: ${selectedJob.title} at ${selectedJob.company}`);
          
          // Run evaluate command
          const evaluateProcess = spawn('node', [
            join(process.cwd(), 'cli/bin/career-ops-cli.js'),
            'evaluate',
            selectedJob.url || selectedJob.careers_url,
            '-t', selectedJob.title,
            '-c', selectedJob.company
          ], {
            stdio: 'inherit',
            shell: true
          });
          
          evaluateProcess.on('close', (code) => {
            process.exit(code);
          });
          
          return; // Exit early, let the spawned process handle it
        }
      }
      
      logger.info(`\n✅ Jobs saved to ${options.output}`);
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

function parseJobListings(content, company) {
  // Basic parsing - look for job listings in content
  const jobs = [];
  
  // Common patterns for job listings
  const patterns = [
    /([A-Z][a-zA-Z\s]+(?:Engineer|Developer|Manager|Designer|Analyst|Director))[^\n]*/g,
    /Job Title:\s*([^\n]+)/gi,
    /Position:\s*([^\n]+)/gi
  ];
  
  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const title = match[1]?.trim();
      if (title && title.length > 5 && title.length < 100) {
        jobs.push({
          title: title,
          company: company.name,
          url: company.careers_url,
          date: new Date().toISOString().split('T')[0],
          source: 'scan'
        });
      }
    }
  }
  
  return jobs;
}

function filterByKeywords(jobs, filters) {
  if (!filters?.positive) return jobs;
  
  return jobs.filter(job => {
    const text = `${job.title} ${job.company}`.toLowerCase();
    
    // Check positive keywords
    const hasPositive = filters.positive.some(kw => 
      text.includes(kw.toLowerCase())
    );
    
    if (!hasPositive) return false;
    
    // Check negative keywords
    if (filters.negative) {
      const hasNegative = filters.negative.some(kw => 
        text.includes(kw.toLowerCase())
      );
      if (hasNegative) return false;
    }
    
    return true;
  });
}

function removeDuplicates(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    const key = `${job.title}-${job.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parsePipeline(content) {
  const jobs = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('|') && !line.startsWith('|---')) {
      const parts = line.split('|').map(p => p.trim()).filter(p => p);
      if (parts.length >= 3 && parts[0] !== '#') {
        jobs.push({
          num: parts[0],
          title: parts[1],
          company: parts[2],
          url: parts[3] || '',
          date: parts[4] || ''
        });
      }
    }
  }
  
  return jobs;
}

function savePipeline(path, jobs) {
  let content = '# Job Pipeline\n\n';
  content += '| # | Title | Company | URL | Date Added | Status |\n';
  content += '|---|-------|---------|-----|------------|--------|\n';
  
  jobs.forEach((job, i) => {
    const num = i + 1;
    const title = job.title || 'Unknown';
    const company = job.company || 'Unknown';
    const url = job.url || '';
    const date = job.date || new Date().toISOString().split('T')[0];
    const status = job.status || 'New';
    
    content += `| ${num} | ${title} | ${company} | ${url} | ${date} | ${status} |\n`;
  });
  
  writeFileSync(path, content, 'utf-8');
}

program.parse();
