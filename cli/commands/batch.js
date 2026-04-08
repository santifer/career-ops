#!/usr/bin/env node
/**
 * Career-Ops CLI - Batch Command
 * Batch evaluate multiple job offers
 * 
 * Usage: career-ops batch <input-file> [options]
 */

import { Command } from 'commander';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig, loadCV, loadMode } from '../core/config.js';
import { LLMClient } from '../core/llm.js';
import { logger } from '../utils/logger.js';
import { saveReport, extractScore, delay } from '../utils/helpers.js';

const program = new Command();

program
  .name('batch')
  .description('Batch evaluate multiple job offers')
  .argument('<input-file>', 'TSV file with columns: url, company, role')
  .option('-p, --parallel <number>', 'Number of parallel evaluations', '1')
  .option('-d, --delay <ms>', 'Delay between evaluations (ms)', '2000')
  .option('-m, --model <model>', 'LLM model to use', 'openrouter/auto')
  .option('-o, --output <dir>', 'Output directory', 'reports')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (inputFile, options) => {
    try {
      logger.section('📦 Batch Job Evaluation');
      
      // Validate input file
      if (!existsSync(inputFile)) {
        logger.error(`Input file not found: ${inputFile}`);
        console.log('\nExpected TSV format:');
        console.log('url\tcompany\trole');
        console.log('https://jobs.company.com/123\tCompany\tFrontend Developer');
        process.exit(1);
      }
      
      // Load configuration
      const config = loadConfig();
      const llm = new LLMClient(config.apiKey, options.model || config.model, config.provider);
      
      // Load CV and batch prompt (like Claude Code batch worker)
      const cv = loadCV();
      const batchPromptPath = join(process.cwd(), 'batch', 'batch-prompt.md');
      let batchPrompt = '';
      if (existsSync(batchPromptPath)) {
        batchPrompt = readFileSync(batchPromptPath, 'utf-8');
        logger.success('Loaded batch worker prompt');
      } else {
        // Fallback to oferta mode
        batchPrompt = loadMode('oferta');
        logger.warning('Batch prompt not found, using oferta mode');
      }
      
      // Parse input file
      const content = readFileSync(inputFile, 'utf-8');
      const jobs = parseTSV(content);
      
      logger.info(`Loaded ${jobs.length} jobs from ${inputFile}`);
      
      if (jobs.length === 0) {
        logger.error('No jobs found in input file');
        process.exit(1);
      }
      
      // Results tracking
      const results = [];
      const errors = [];
      
      // Process jobs
      const parallel = parseInt(options.parallel);
      const delayMs = parseInt(options.delay);
      
      logger.info(`Processing with ${parallel} parallel workers...`);
      
      for (let i = 0; i < jobs.length; i += parallel) {
        const batch = jobs.slice(i, i + parallel);
        
        if (options.verbose) {
          logger.subsection(`Batch ${Math.floor(i / parallel) + 1}/${Math.ceil(jobs.length / parallel)}`);
        }
        
        // Process batch in parallel
        const promises = batch.map(async (job, idx) => {
          const jobNum = i + idx + 1;
          
          try {
            if (options.verbose) {
              console.log(`  [${jobNum}/${jobs.length}] Evaluating: ${job.role} at ${job.company}`);
            }
            
            // Build prompt using batch worker prompt
            const prompt = buildEvaluationPrompt(batchPrompt, cv, job.description || job.url, job.role, job.url);
            
            // Call LLM
            const result = await llm.chat(prompt, {
              maxTokens: 3000,
              temperature: 0.7
            });
            
            // Extract score
            const score = extractScore(result);
            
            // Save report
            const { filepath } = saveReport(result, job.company, job.role);
            
            results.push({
              num: jobNum,
              company: job.company,
              role: job.role,
              score: score,
              status: 'success',
              report: filepath
            });
            
            if (options.verbose) {
              logger.success(`  ✓ Score: ${score || 'N/A'}/5`);
            }
            
          } catch (error) {
            errors.push({
              num: jobNum,
              company: job.company,
              role: job.role,
              error: error.message
            });
            
            if (options.verbose) {
              logger.error(`  ✗ ${error.message}`);
            }
          }
        });
        
        await Promise.all(promises);
        
        // Delay between batches
        if (i + parallel < jobs.length) {
          await delay(delayMs);
        }
      }
      
      // Generate summary report
      generateSummaryReport(results, errors, inputFile);
      
      // Display results
      logger.section('Batch Evaluation Complete');
      console.log(`Total jobs: ${jobs.length}`);
      console.log(`Successful: ${results.length}`);
      console.log(`Failed: ${errors.length}`);
      
      if (results.length > 0) {
        const scores = results.filter(r => r.score).map(r => r.score);
        if (scores.length > 0) {
          const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
          console.log(`Average score: ${avgScore.toFixed(2)}/5`);
        }
        
        // High-scoring jobs
        const highScoring = results.filter(r => r.score >= 4.0);
        if (highScoring.length > 0) {
          logger.subsection('High Priority Jobs (Score >= 4.0):');
          highScoring.forEach(job => {
            console.log(`  • ${job.role} at ${job.company} (${job.score}/5)`);
          });
        }
      }
      
      // Save batch results
      const batchResultsPath = join(process.cwd(), 'batch', 'batch-results.json');
      writeFileSync(batchResultsPath, JSON.stringify({ results, errors }, null, 2), 'utf-8');
      logger.info(`Results saved: ${batchResultsPath}`);
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

function parseTSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const jobs = [];
  
  // Skip header if present
  const startIndex = lines[0].toLowerCase().includes('url') ? 1 : 0;
  
  for (let i = startIndex; i < lines.length; i++) {
    const parts = lines[i].split('\t').map(p => p.trim());
    
    if (parts.length >= 1) {
      jobs.push({
        url: parts[0],
        company: parts[1] || 'Unknown',
        role: parts[2] || 'Unknown Position',
        description: parts[3] || ''
      });
    }
  }
  
  return jobs;
}

function buildEvaluationPrompt(mode, cv, jobDescription, title, url) {
  return `
You are a career coach evaluating a job opportunity.

# CANDIDATE CV
${cv}

# EVALUATION FRAMEWORK
${mode}

# JOB TO EVALUATE
Title: ${title}
URL: ${url}
Description:
${jobDescription}

Provide a concise evaluation with:
1. Brief role summary
2. Key matches and gaps
3. Fit score (1-5)
4. APPLY or SKIP recommendation
5. One key action item

Format: "Score: X.X/5"
`;
}

function generateSummaryReport(results, errors, inputFile) {
  const date = new Date().toISOString().split('T')[0];
  const summaryPath = join(process.cwd(), 'batch', `batch-summary-${date}.md`);
  
  let content = `# Batch Evaluation Summary\n\n`;
  content += `**Date:** ${date}\n`;
  content += `**Input:** ${inputFile}\n\n`;
  
  content += `## Overview\n\n`;
  content += `- Total jobs: ${results.length + errors.length}\n`;
  content += `- Successful: ${results.length}\n`;
  content += `- Failed: ${errors.length}\n\n`;
  
  if (results.length > 0) {
    const scores = results.filter(r => r.score).map(r => r.score);
    if (scores.length > 0) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      content += `- Average score: ${avgScore.toFixed(2)}/5\n\n`;
    }
    
    // High priority
    const highPriority = results.filter(r => r.score >= 4.0);
    if (highPriority.length > 0) {
      content += `## High Priority (${highPriority.length})\n\n`;
      highPriority.forEach(job => {
        content += `- **${job.role}** at ${job.company} - ${job.score}/5\n`;
      });
      content += `\n`;
    }
    
    // Medium priority
    const mediumPriority = results.filter(r => r.score >= 3.5 && r.score < 4.0);
    if (mediumPriority.length > 0) {
      content += `## Medium Priority (${mediumPriority.length})\n\n`;
      mediumPriority.forEach(job => {
        content += `- **${job.role}** at ${job.company} - ${job.score}/5\n`;
      });
      content += `\n`;
    }
  }
  
  if (errors.length > 0) {
    content += `## Errors (${errors.length})\n\n`;
    errors.forEach(err => {
      content += `- ${err.role} at ${err.company}: ${err.error}\n`;
    });
  }
  
  writeFileSync(summaryPath, content, 'utf-8');
}

program.parse();
