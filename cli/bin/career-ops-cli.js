#!/usr/bin/env node
/**
 * Career-Ops CLI
 * Standalone command-line interface for Career-Ops
 * Works without Claude Code subscription
 * 
 * Supports:
 *   - OpenRouter API (recommended, pay-as-you-go)
 *   - Anthropic API (alternative)
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('career-ops')
  .description('Career-Ops CLI - Job search automation without Claude Code')
  .version(packageJson.version)
  .configureOutput({
    outputError: (str, write) => write(chalk.red(str))
  });

// Main commands - using executableFile to point to command files
program
  .command('evaluate <url-or-file>', 'Evaluate a job offer against your CV', { executableFile: '../commands/evaluate.js' })
  .command('tracker [command]', 'View and manage application tracker', { executableFile: '../commands/tracker.js' })
  .command('pdf [company-slug]', 'Generate ATS-optimized CV PDF', { executableFile: '../commands/pdf.js' })
  .command('scan', 'Scan job portals for new offers', { executableFile: '../commands/scan.js' })
  .command('batch <input-file>', 'Batch evaluate multiple jobs', { executableFile: '../commands/batch.js' })
  .command('apply <url>', 'Fill application forms with AI assistance', { executableFile: '../commands/apply.js' })
  .command('contact <company>', 'LinkedIn outreach message generator', { executableFile: '../commands/contact.js' })
  .command('deep <company>', 'Deep company research for interview prep', { executableFile: '../commands/deep.js' })
  .command('training <course>', 'Evaluate a course/certification', { executableFile: '../commands/training.js' })
  .command('project <project>', 'Evaluate a portfolio project', { executableFile: '../commands/project.js' })
  .command('add-companies [category]', 'Bulk add companies to portals.yml', { executableFile: '../commands/add-companies.js' })
  .command('job-search', 'AI-powered job search based on CV', { executableFile: '../commands/job-search.js' });

// Utility commands
program
  .command('doctor')
  .description('Check system health and prerequisites')
  .action(async () => {
    console.log(chalk.cyan('\n🏥 Career-Ops Doctor\n'));
    
    // Pre-load modules
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const dotenv = await import('dotenv');
    
    // Load .env file
    const envPath = join(process.cwd(), '.env');
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
    
    const checks = [
      { name: 'Node.js >= 18', cmd: 'node --version' },
      { name: 'cv.md exists', file: 'cv.md' },
      { name: 'config/profile.yml', file: 'config/profile.yml' },
      { name: 'API key configured', env: ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY'] },
      { name: 'Playwright installed', cmd: 'npx playwright --version' }
    ];
    
    // Run checks
    console.log('Running checks...\n');
    
    for (const check of checks) {
      process.stdout.write(`  ${check.name.padEnd(30)} `);
      
      if (check.file) {
        if (existsSync(join(process.cwd(), check.file))) {
          console.log(chalk.green('✓'));
        } else {
          console.log(chalk.red('✗'));
          console.log(chalk.yellow(`    → Create ${check.file}`));
        }
      } else if (check.env) {
        const found = check.env.some(key => process.env[key]);
        if (found) {
          console.log(chalk.green('✓'));
        } else {
          console.log(chalk.red('✗'));
          console.log(chalk.yellow(`    → Set ${check.env[0]} in .env`));
        }
      } else {
        console.log(chalk.gray('? (manual check)'));
      }
    }
    
    console.log('\n' + chalk.cyan('Fix any issues above, then run:'));
    console.log('  career-ops evaluate <job-url>\n');
  });

program
  .command('config')
  .description('Configure Career-Ops CLI')
  .option('--show', 'Show current configuration')
  .option('--set-api-key <key>', 'Set API key')
  .option('--set-model <model>', 'Set default model')
  .action(async (options) => {
    const { loadConfig } = await import('../core/config.js');
    const { writeFileSync, existsSync } = await import('fs');
    const { join } = await import('path');
    
    if (options.show) {
      console.log(chalk.cyan('\n⚙️  Career-Ops Configuration\n'));
      try {
        const config = loadConfig();
        console.log(`Provider: ${chalk.green(config.provider)}`);
        console.log(`Model: ${chalk.green(config.model)}`);
        console.log(`API Key: ${chalk.green(config.apiKey.slice(0, 10) + '...')}`);
        console.log(`\nProfile: ${config.profile?.candidate?.full_name || 'Not configured'}`);
      } catch (e) {
        console.log(chalk.red('Not configured: ' + e.message));
      }
    } else if (options.setApiKey) {
      const envPath = join(process.cwd(), '.env');
      let env = '';
      if (existsSync(envPath)) {
        env = readFileSync(envPath, 'utf-8') + '\n';
      }
      
      env += `OPENROUTER_API_KEY=${options.setApiKey}\n`;
      writeFileSync(envPath, env);
      
      console.log(chalk.green('✓ API key saved to .env'));
    } else {
      console.log(chalk.cyan('\n⚙️  Career-Ops Configuration\n'));
      console.log('Usage:');
      console.log('  career-ops config --show');
      console.log('  career-ops config --set-api-key <key>');
      console.log('  career-ops config --set-model <model>');
    }
  });

// Help text
program.on('--help', () => {
  console.log('');
  console.log(chalk.cyan('Examples:'));
  console.log('  $ career-ops evaluate https://jobs.company.com/123 -t "Frontend Developer"');
  console.log('  $ career-ops tracker list');
  console.log('  $ career-ops tracker add -c "Google" -r "Software Engineer" -s 4.5');
  console.log('  $ career-ops pdf google');
  console.log('');
  console.log(chalk.cyan('Documentation:'));
  console.log('  Full guide: CLI-GUIDE.md');
  console.log('  Original:  https://github.com/santifer/career-ops');
  console.log('');
});

// Show help if no command provided
if (process.argv.length <= 2) {
  program.help();
}

program.parse();
