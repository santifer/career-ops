#!/usr/bin/env node
/**
 * Career-Ops CLI - Evaluate Command
 * Evaluates a job offer against your CV
 * 
 * Usage: career-ops evaluate <url-or-file> [options]
 * Example: career-ops evaluate "https://jobs.company.com/123" -t "Frontend Developer"
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { loadConfig, loadCV } from '../core/config.js';
import { LLMClient } from '../core/llm.js';
import { JobScraper } from '../core/scraper.js';
import { logger } from '../utils/logger.js';
import { saveReport, extractScore, ensureDirectories } from '../utils/helpers.js';

const program = new Command();

program
  .name('evaluate')
  .description('Evaluate a job offer against your CV')
  .argument('<url-or-file>', 'Job posting URL or local file path containing job description')
  .option('-t, --title <title>', 'Job title for the report (e.g., "Frontend Developer at Company")')
  .option('-c, --company <company>', 'Company name')
  .option('-m, --model <model>', 'LLM model to use', 'openrouter/auto')
  .option('-o, --output <file>', 'Custom output file path (optional)')
  .option('--no-pdf', 'Skip PDF generation')
  .option('--no-tracker', 'Skip adding to tracker')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (input, options) => {
    try {
      // Initialize
      logger.section('🎯 Career-Ops Job Evaluation');
      
      if (options.verbose) {
        logger.info('Loading configuration...');
      }
      
      const config = loadConfig();
      const llm = new LLMClient(config.apiKey, options.model || config.model, config.provider);
      
      // Load CV
      if (options.verbose) {
        logger.info('Loading CV...');
      }
      
      const cv = loadCV();
      
      // Load evaluation mode from modes/ directory (like Claude Code)
      const modePath = join(process.cwd(), 'modes', 'oferta.md');
      let modeContent = '';
      let sharedContent = '';
      
      // Load shared context first
      const sharedPath = join(process.cwd(), 'modes', '_shared.md');
      if (existsSync(sharedPath)) {
        sharedContent = readFileSync(sharedPath, 'utf-8');
        logger.success('Loaded shared context');
      }
      
      // Load evaluation mode
      if (existsSync(modePath)) {
        modeContent = readFileSync(modePath, 'utf-8');
        logger.success('Loaded oferta evaluation mode');
      } else {
        logger.warning('Mode file not found, using default');
        modeContent = buildDefaultMode();
      }
      
      // Fetch job description
      logger.info('Fetching job description...');
      
      let jobDescription;
      let jobUrl = input;
      
      if (input.startsWith('http://') || input.startsWith('https://')) {
        // Fetch from URL
        const scraper = new JobScraper();
        try {
          jobDescription = await scraper.fetch(input);
          logger.success('Job description fetched successfully');
        } catch (e) {
          logger.error(`Failed to fetch from URL: ${e.message}`);
          console.log('\n💡 Tip: Save the job description to a file and run:');
          console.log(`   career-ops evaluate job.txt -t "${options.title || 'Job Title'}"`);
          process.exit(1);
        }
      } else {
        // Read from file
        if (!existsSync(input)) {
          logger.error(`File not found: ${input}`);
          process.exit(1);
        }
        jobDescription = readFileSync(input, 'utf-8');
        jobUrl = 'file://' + input;
        logger.success(`Loaded job description from ${input}`);
      }
      
      // Build prompt
      const title = options.title || options.company || 'Unknown Position';
      
      const prompt = buildEvaluationPrompt(sharedContent + modeContent, cv, jobDescription, title, jobUrl);
      
      // Call LLM
      logger.info(`Evaluating with ${config.provider} AI...`);
      console.log(`   Model: ${options.model || config.model}`);
      console.log(`   Job: ${title}\n`);
      
      const result = await llm.chat(prompt, {
        maxTokens: 4000,
        temperature: 0.7
      });
      
      // Extract score
      const score = extractScore(result);
      
      // Display result
      logger.divider();
      logger.success('Evaluation complete!');
      
      if (score) {
        logger.score(`${score}/5`);
        
        if (score >= 4.0) {
          console.log(chalk.green('⭐ High match - Strong candidate!'));
        } else if (score >= 3.5) {
          console.log(chalk.yellow('✓ Good match - Worth applying'));
        } else if (score >= 3.0) {
          console.log(chalk.hex('#FFA500')('⚠ Moderate match - Consider carefully'));
        } else {
          console.log(chalk.red('❌ Low match - May not be a good fit'));
        }
      }
      
      logger.divider();
      console.log(result);
      
      // Extract company from URL if not provided
      const companyName = options.company || extractCompanyFromUrl(jobUrl) || 'unknown';
      
      // Save report
      ensureDirectories();
      const { filename, filepath } = saveReport(result, companyName, title);
      
      logger.success(`Report saved: ${filepath}`);
      
      // Add to tracker (unless --no-tracker)
      if (!options.noTracker) {
        try {
          await addToTracker(companyName, title, score, filepath, jobUrl);
          logger.success('Added to application tracker');
        } catch (e) {
          logger.warning(`Could not add to tracker: ${e.message}`);
        }
      }
      
      // Generate PDF (unless --no-pdf)
      if (!options.noPdf) {
        logger.info('Generating PDF...');
        console.log('   (PDF generation requires: npm run cli -- pdf)');
      }
      
      logger.section('Next Steps');
      console.log('1. Review the evaluation report above');
      console.log('2. If score >= 4.0, consider applying');
      console.log('3. Customize your CV for this specific role');
      console.log(`4. Report saved: reports/${filename}`);
      
    } catch (error) {
      logger.error(error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

function buildEvaluationPrompt(mode, cv, jobDescription, title, url) {
  return `
You are a career coach evaluating a job opportunity. Use the following framework to provide a comprehensive evaluation.

# CANDIDATE CV
${cv}

# EVALUATION FRAMEWORK
${mode}

# JOB TO EVALUATE
Title: ${title}
URL: ${url}
Description:
${jobDescription}

# INSTRUCTIONS
Provide a complete evaluation following the framework above. Include:

1. **Role Summary** - What is this job about? (company, domain, seniority)

2. **CV Match Analysis** - Map each job requirement to the candidate's experience:
   - ✅ Strong matches
   - ⚠️ Partial matches or gaps
   - ❌ Missing requirements
   For each gap, suggest mitigation strategy

3. **Fit Score** - Rate 1-5 based on:
   - Technical skills match (40%)
   - Experience level alignment (30%)
   - Domain/industry fit (20%)
   - Culture/values alignment (10%)
   
   Format: "Score: X.X/5"

4. **Recommendation** - Clear APPLY or SKIP with reasoning

5. **Next Steps** - Specific actions:
   - CV customization tips
   - Skills to highlight
   - Questions to ask
   - Potential red flags

Format your response in clear markdown sections. Be honest but encouraging.
`;
}

function extractCompanyFromUrl(url) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    // Extract company name from domain
    const parts = hostname.replace(/^www\./, '').split('.');
    if (parts.length >= 2) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
  } catch (e) {
    // If URL parsing fails, try to extract from string
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
    if (match) {
      const domain = match[1].split('.')[0];
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }
  return null;
}

async function addToTracker(company, role, score, reportPath, url) {
  // Simple implementation - append to applications.md
  const trackerPath = join(process.cwd(), 'data', 'applications.md');
  
  let content = '';
  if (existsSync(trackerPath)) {
    content = readFileSync(trackerPath, 'utf-8');
  } else {
    // Create header
    content = `# Applications Tracker\n\n`;
    content += `| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n`;
    content += `|---|------|---------|------|-------|--------|-----|--------|-------|\n`;
  }
  
  const date = new Date().toISOString().split('T')[0];
  const scoreStr = score ? `${score}/5` : 'N/A';
  const status = 'Evaluated';
  const num = Math.floor(Math.random() * 900) + 100; // Random 3-digit for now
  
  const newLine = `| ${num} | ${date} | ${company} | ${role} | ${scoreStr} | ${status} | - | [${num}](${reportPath}) | CLI evaluated |\n`;
  
  content += newLine;
  
  writeFileSync(trackerPath, content, 'utf-8');
}

program.parse();
