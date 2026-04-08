#!/usr/bin/env node
/**
 * Career-Ops CLI - Job Search Command
 * AI-powered job search based on CV
 * 
 * Usage: career-ops job-search [options]
 */

import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { loadConfig, loadCV } from '../core/config.js';
import { LLMClient } from '../core/llm.js';
import inquirer from 'inquirer';

const program = new Command();

program
  .name('job-search')
  .description('AI-powered job search based on your CV')
  .option('-l, --location <locations>', 'Comma-separated locations (e.g., "UAE,Saudi,Remote")', 'Remote')
  .option('-r, --role <role>', 'Target role (overrides CV profile)')
  .option('-m, --model <model>', 'LLM model', 'openrouter/auto')
  .option('-s, --save', 'Save results to jobs-found.md', false)
  .action(async (options) => {
    try {
      logger.section('🔍 AI Job Search');
      
      // Load CV
      let cv = '';
      let targetRoles = [];
      try {
        const config = loadConfig();
        cv = loadCV();
        targetRoles = options.role ? [options.role] : (config.profile?.target_roles?.primary || []);
        logger.success('Loaded CV and profile');
      } catch (e) {
        logger.error('CV not found. Please ensure cv.md exists.');
        process.exit(1);
      }
      
      // Parse locations
      const locations = options.location.split(',').map(l => l.trim());
      logger.info(`Searching for jobs in: ${locations.join(', ')}`);
      if (targetRoles.length) {
        logger.info(`Target roles: ${targetRoles.join(', ')}`);
      }
      
      // Initialize LLM
      const config = loadConfig();
      const llm = new LLMClient(config.apiKey, options.model || config.model, config.provider);
      
      // Build prompt
      const prompt = buildJobSearchPrompt(cv, targetRoles, locations);
      
      logger.info('Searching for matching job opportunities...');
      
      // Call AI
      const result = await llm.chat(prompt, {
        maxTokens: 4000,
        temperature: 0.7
      });
      
      // Parse results
      const jobs = parseJobResults(result);
      
      if (jobs.length === 0) {
        logger.warning('No specific jobs found. Try broadening your search.');
        return;
      }
      
      logger.success(`Found ${jobs.length} job opportunities!\n`);
      
      // Display jobs in table format
      console.log('═══════════════════════════════════════════════════════════════════════════════');
      console.log('📋 JOB OPPORTUNITIES');
      console.log('═══════════════════════════════════════════════════════════════════════════════\n');
      
      jobs.forEach((job, i) => {
        console.log(`┌─ Job ${i + 1}: ${job.title || 'Unknown Role'}`);
        console.log(`│  🏢 Company: ${job.company || 'Unknown'}`);
        console.log(`│  📍 Location: ${job.location || locations.join(', ')}`);
        console.log(`│  🔗 URL: ${job.url || 'Search company careers page'}`);
        console.log(`│  📝 Why it matches: ${job.match_reason || 'Matches your skills'}`);
        console.log(`│  💡 Action: ${job.action || 'Apply directly on company website'}`);
        console.log(`└─────────────────────────────────────────────────────────────────────────\n`);
      });
      
      // Interactive selection
      const { selectedJobs } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selectedJobs',
        message: 'Select jobs to evaluate (space to select, enter to confirm):',
        choices: jobs.slice(0, 10).map((job, i) => ({
          name: `${job.company || 'Unknown'} - ${job.title || 'Role'} (${job.location || 'Remote'})`,
          value: job,
          checked: false
        }))
      }]);
      
      if (selectedJobs.length > 0) {
        logger.info(`\n▶️  You selected ${selectedJobs.length} jobs to evaluate`);
        
        for (const job of selectedJobs) {
          if (job.url) {
            logger.info(`\nEvaluating: ${job.title} at ${job.company}`);
            
            // Spawn evaluate command
            const { spawn } = await import('child_process');
            const evaluateProcess = spawn('node', [
              join(process.cwd(), 'cli/bin/career-ops-cli.js'),
              'evaluate',
              job.url,
              '-t', job.title || 'Job at ' + job.company,
              '-c', job.company || 'unknown'
            ], {
              stdio: 'inherit',
              shell: true
            });
            
            await new Promise((resolve) => {
              evaluateProcess.on('close', () => resolve());
            });
          }
        }
      }
      
      // Save results if requested
      if (options.save) {
        const outputPath = join(process.cwd(), 'jobs-found.md');
        const content = `# Jobs Found - ${new Date().toLocaleDateString()}

## Search Criteria
- **Locations:** ${locations.join(', ')}
- **Target Roles:** ${targetRoles.join(', ') || 'Based on CV'}

## Results (${jobs.length} jobs)

${jobs.map((job, i) => `### ${i + 1}. ${job.title || 'Role'} at ${job.company || 'Unknown'}
- **Location:** ${job.location || 'Remote'}
- **URL:** ${job.url || 'N/A'}
- **Why it matches:** ${job.match_reason || 'N/A'}
- **Action:** ${job.action || 'Apply on company website'}

`).join('')}

---
*Generated by Career-Ops AI Job Search*
`;
        writeFileSync(outputPath, content, 'utf-8');
        logger.success(`Results saved to: ${outputPath}`);
      }
      
      logger.divider();
      logger.info('Next steps:');
      logger.info('1. Review the jobs above');
      logger.info('2. Run: career-ops evaluate <job-url> for detailed analysis');
      logger.info('3. Or select jobs above to evaluate automatically');
      
    } catch (error) {
      logger.error(`Job search failed: ${error.message}`);
      process.exit(1);
    }
  });

function buildJobSearchPrompt(cv, targetRoles, locations) {
  return `
You are an expert job search assistant. Find REAL, CURRENT job openings that match this candidate.

# CANDIDATE CV
${cv.substring(0, 2500)}

# SEARCH CRITERIA
Target Roles: ${targetRoles.join(', ') || 'Any tech role matching CV'}
Locations: ${locations.join(', ')}

# TASK
Find 10-15 specific job openings that:
1. Are actively hiring (current open positions)
2. Match the candidate's skills and experience level
3. Are at real companies with career pages
4. Fit the location preferences (remote or specified countries)

For each job, provide:
- Specific job title
- Company name
- Location (city/country or Remote)
- Direct application URL (careers page or job posting)
- Why this job matches the candidate's profile
- Recommended action (apply now, check requirements, etc.)

FORMAT YOUR RESPONSE AS JSON:
[
  {
    "title": "Senior Frontend Engineer",
    "company": "Vercel",
    "location": "Remote",
    "url": "https://vercel.com/careers/senior-frontend",
    "match_reason": "Matches React/Next.js skills from CV",
    "action": "Apply directly - strong match"
  }
]

IMPORTANT: Only include real companies and actual job URLs. If you don't know a specific URL, indicate to search the company's careers page.

ONLY return valid JSON. No markdown, no extra text.`;
}

function parseJobResults(result) {
  try {
    // Try to extract JSON
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Fallback parsing
  }
  
  // Manual extraction fallback
  const jobs = [];
  const lines = result.split('\n');
  let currentJob = null;
  
  for (const line of lines) {
    // Look for numbered items or job titles
    const titleMatch = line.match(/(?:^\d+[.\-]\s*|\*\s*|Job[:\-]\s*)(.+?)(?:\s*[-@]|\s+at\s+|\s*\(|\s+https)/i);
    if (titleMatch) {
      if (currentJob && currentJob.title) {
        jobs.push(currentJob);
      }
      currentJob = {
        title: titleMatch[1].trim(),
        company: '',
        location: '',
        url: '',
        match_reason: '',
        action: ''
      };
    } else if (currentJob) {
      // Extract company
      const companyMatch = line.match(/(?:Company|at)[:\s]+(.+)/i);
      if (companyMatch) currentJob.company = companyMatch[1].trim();
      
      // Extract URL
      const urlMatch = line.match(/https?:\/\/[^\s]+/);
      if (urlMatch) currentJob.url = urlMatch[0];
      
      // Extract location
      const locMatch = line.match(/(?:Location|📍)[:\s]+(.+)/i);
      if (locMatch) currentJob.location = locMatch[1].trim();
    }
  }
  
  if (currentJob && currentJob.title) {
    jobs.push(currentJob);
  }
  
  return jobs;
}

program.parse();
