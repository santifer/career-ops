#!/usr/bin/env node
/**
 * Career-Ops CLI - Apply Command
 * Fill application forms with AI assistance
 * 
 * Usage: career-ops apply <url> [options]
 */

import { Command } from 'commander';
import { loadConfig, loadCV, loadMode } from '../core/config.js';
import { LLMClient } from '../core/llm.js';
import { JobScraper } from '../core/scraper.js';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('apply')
  .description('Fill application forms with AI assistance')
  .argument('<url>', 'Job application URL')
  .option('-t, --title <title>', 'Job title')
  .option('-c, --company <company>', 'Company name')
  .option('-m, --model <model>', 'LLM model to use', 'openrouter/auto')
  .option('--dry-run', 'Show answers without submitting')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (url, options) => {
    try {
      logger.section('📝 Application Assistant');
      
      logger.info('Loading configuration...');
      const config = loadConfig();
      const llm = new LLMClient(config.apiKey, options.model || config.model, config.provider);
      
      // Load CV and apply mode
      const cv = loadCV();
      const mode = loadMode('apply');
      
      // Fetch job description
      logger.info('Fetching job description...');
      const scraper = new JobScraper();
      let jobDescription;
      
      try {
        jobDescription = await scraper.fetch(url);
      } catch (e) {
        logger.warning('Could not auto-fetch job description. Please paste it manually when prompted.');
        jobDescription = '[Job description not available - user should paste when answering questions]';
      }
      
      // Build prompt
      const prompt = buildApplyPrompt(mode, cv, jobDescription, options);
      
      // Call LLM for application strategy
      logger.info('Generating application strategy...');
      const result = await llm.chat(prompt, {
        maxTokens: 3500,
        temperature: 0.7
      });
      
      // Display results
      logger.divider();
      console.log(result);
      logger.divider();
      
      // Important warning
      logger.section('⚠️ IMPORTANT');
      console.log(chalk.red.bold('DO NOT auto-submit applications.'));
      console.log('Copy the suggested answers above and paste them manually.');
      console.log('Always review and customize before submitting.\n');
      
      if (options.dryRun) {
        logger.info('Dry run mode - no action taken');
      }
      
      logger.success('Application assistance complete!');
      logger.info('Next: Copy the answers above and complete the application manually.');
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

function buildApplyPrompt(mode, cv, jobDescription, options) {
  return `
You are helping a candidate fill out a job application.

# CANDIDATE CV
${cv}

# JOB
Title: ${options.title || 'Not specified'}
Company: ${options.company || 'Not specified'}
Description:
${jobDescription}

# YOUR TASK
Help the candidate with:

1. **Cover Letter Draft** - Write a tailored cover letter (3-4 paragraphs) highlighting relevant experience

2. **Common Questions** - Suggest answers for typical questions:
   - "Why are you interested in this role?"
   - "Why do you want to work at [Company]?"
   - "Tell us about yourself"
   - "What are your strengths?"
   - "Where do you see yourself in 5 years?"

3. **Salary Expectations** - Based on the role level and location, suggest a reasonable range

4. **Portfolio/Projects** - Which projects from the CV should be highlighted? Provide 2-3 bullet points

5. **Red Flags to Address** - Any gaps or concerns the candidate should proactively address

6. **Questions to Ask** - 3-5 thoughtful questions to ask the interviewer

Format your response clearly with headers for each section. Make answers specific to the candidate's experience and the job requirements.

**IMPORTANT:** This is for guidance only. The candidate should review and customize all answers before submitting.
`;
}

program.parse();
