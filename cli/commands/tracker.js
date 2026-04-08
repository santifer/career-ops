#!/usr/bin/env node
/**
 * Career-Ops CLI - Tracker Command
 * Manage your job application tracker
 * 
 * Usage: career-ops tracker [command] [options]
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import Table from 'cli-table3';
import { logger } from '../utils/logger.js';

const program = new Command();

const TRACKER_FILE = join(process.cwd(), 'data', 'applications.md');

program
  .name('tracker')
  .description('View and manage your job application tracker')
  .option('-v, --verbose', 'Show detailed information');

// Default: list all applications
program
  .command('list', { isDefault: true })
  .description('List all applications in the tracker')
  .option('-s, --status <status>', 'Filter by status (e.g., Applied, Interview, Offer)')
  .option('--sort <field>', 'Sort by field (date, company, score)', 'date')
  .action((options) => {
    try {
      logger.section('📋 Application Tracker');
      
      if (!existsSync(TRACKER_FILE)) {
        logger.info('No applications found. Tracker file will be created when you evaluate jobs.');
        console.log('\n💡 Run: career-ops evaluate <url> to add your first application');
        return;
      }
      
      const content = readFileSync(TRACKER_FILE, 'utf-8');
      const applications = parseTracker(content);
      
      if (applications.length === 0) {
        logger.info('No applications found in tracker.');
        return;
      }
      
      // Filter by status if specified
      let filtered = applications;
      if (options.status) {
        filtered = applications.filter(app => 
          app.status.toLowerCase() === options.status.toLowerCase()
        );
      }
      
      // Sort
      filtered.sort((a, b) => {
        if (options.sort === 'date') {
          return new Date(b.date) - new Date(a.date);
        } else if (options.sort === 'score') {
          return parseFloat(b.score) - parseFloat(a.score);
        } else if (options.sort === 'company') {
          return a.company.localeCompare(b.company);
        }
        return 0;
      });
      
      // Display table
      const table = new Table({
        head: ['#', 'Date', 'Company', 'Role', 'Score', 'Status'],
        colWidths: [5, 12, 20, 30, 10, 15]
      });
      
      for (const app of filtered) {
        const score = app.score ? app.score.padEnd(5) : 'N/A  ';
        let statusColor = chalk.white;
        
        if (app.status === 'Applied') statusColor = chalk.blue;
        else if (app.status === 'Interview') statusColor = chalk.yellow;
        else if (app.status === 'Offer') statusColor = chalk.green;
        else if (app.status === 'Rejected') statusColor = chalk.red;
        
        table.push([
          app.num,
          app.date,
          truncate(app.company, 18),
          truncate(app.role, 28),
          score,
          statusColor(app.status)
        ]);
      }
      
      console.log(table.toString());
      
      // Statistics
      logger.newLine();
      logger.subsection('Statistics');
      const total = applications.length;
      const applied = applications.filter(a => a.status === 'Applied').length;
      const interview = applications.filter(a => a.status === 'Interview').length;
      const offer = applications.filter(a => a.status === 'Offer').length;
      const rejected = applications.filter(a => a.status === 'Rejected').length;
      
      console.log(`  Total: ${total} | Applied: ${applied} | Interview: ${interview} | Offer: ${offer} | Rejected: ${rejected}`);
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

// Add new application
program
  .command('add')
  .description('Add a new application to the tracker')
  .requiredOption('-c, --company <company>', 'Company name')
  .requiredOption('-r, --role <role>', 'Job role/title')
  .option('-s, --score <score>', 'Fit score (e.g., 4.2)')
  .option('--status <status>', 'Application status', 'Evaluated')
  .option('--url <url>', 'Job posting URL')
  .action((options) => {
    try {
      logger.section('➕ Add to Tracker');
      
      let content = '';
      if (existsSync(TRACKER_FILE)) {
        content = readFileSync(TRACKER_FILE, 'utf-8');
      } else {
        // Create header
        content = `# Applications Tracker\n\n`;
        content += `| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n`;
        content += `|---|------|---------|------|-------|--------|-----|--------|-------|\n`;
      }
      
      // Generate next number
      const existing = parseTracker(content);
      const nextNum = existing.length > 0 
        ? Math.max(...existing.map(a => parseInt(a.num))) + 1 
        : 1;
      
      const date = new Date().toISOString().split('T')[0];
      const scoreStr = options.score ? `${options.score}/5` : '-';
      
      const newLine = `| ${nextNum} | ${date} | ${options.company} | ${options.role} | ${scoreStr} | ${options.status} | - | - | ${options.url ? `URL: ${options.url}` : 'Added via CLI'} |\n`;
      
      content += newLine;
      writeFileSync(TRACKER_FILE, content, 'utf-8');
      
      logger.success(`Added application #${nextNum}: ${options.role} at ${options.company}`);
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

// Update status
program
  .command('update <number>')
  .description('Update the status of an application')
  .requiredOption('-s, --status <status>', 'New status (Applied, Interview, Offer, Rejected, etc.)')
  .option('-n, --notes <notes>', 'Additional notes')
  .action((number, options) => {
    try {
      logger.section('📝 Update Application');
      
      if (!existsSync(TRACKER_FILE)) {
        logger.error('No tracker file found');
        process.exit(1);
      }
      
      let content = readFileSync(TRACKER_FILE, 'utf-8');
      const lines = content.split('\n');
      
      // Find and update the line
      let found = false;
      const updatedLines = lines.map(line => {
        if (line.startsWith(`| ${number} |`)) {
          found = true;
          const parts = line.split('|').map(p => p.trim());
          // Update status (index 6) and notes (index 9)
          parts[6] = options.status;
          if (options.notes) {
            parts[9] = options.notes;
          }
          return parts.join(' | ');
        }
        return line;
      });
      
      if (!found) {
        logger.error(`Application #${number} not found`);
        process.exit(1);
      }
      
      writeFileSync(TRACKER_FILE, updatedLines.join('\n'), 'utf-8');
      
      logger.success(`Updated application #${number} to status: ${options.status}`);
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

// Show stats
program
  .command('stats')
  .description('Show application statistics')
  .action(() => {
    try {
      logger.section('📊 Application Statistics');
      
      if (!existsSync(TRACKER_FILE)) {
        logger.info('No applications found.');
        return;
      }
      
      const content = readFileSync(TRACKER_FILE, 'utf-8');
      const applications = parseTracker(content);
      
      const total = applications.length;
      const byStatus = {};
      const byMonth = {};
      
      for (const app of applications) {
        // Count by status
        byStatus[app.status] = (byStatus[app.status] || 0) + 1;
        
        // Count by month
        const month = app.date.slice(0, 7); // YYYY-MM
        byMonth[month] = (byMonth[month] || 0) + 1;
      }
      
      console.log(chalk.bold('\nOverview:'));
      console.log(`  Total Applications: ${total}`);
      
      console.log(chalk.bold('\nBy Status:'));
      for (const [status, count] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
        const bar = '█'.repeat(count);
        console.log(`  ${status.padEnd(15)} ${bar} ${count}`);
      }
      
      console.log(chalk.bold('\nBy Month:'));
      for (const [month, count] of Object.entries(byMonth).sort()) {
        console.log(`  ${month}: ${count} applications`);
      }
      
      // Calculate rates
      const applied = byStatus['Applied'] || 0;
      const interviews = byStatus['Interview'] || 0;
      const offers = byStatus['Offer'] || 0;
      
      if (applied > 0) {
        console.log(chalk.bold('\nConversion Rates:'));
        console.log(`  Application → Interview: ${((interviews / applied) * 100).toFixed(1)}%`);
        console.log(`  Interview → Offer: ${offers > 0 ? ((offers / interviews) * 100).toFixed(1) : 0}%`);
      }
      
    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

// Parse tracker markdown table
function parseTracker(content) {
  const lines = content.split('\n');
  const applications = [];
  
  for (const line of lines) {
    if (line.startsWith('|') && !line.startsWith('|---')) {
      const parts = line.split('|').map(p => p.trim()).filter(p => p);
      if (parts.length >= 5 && !isNaN(parseInt(parts[0]))) {
        applications.push({
          num: parts[0],
          date: parts[1],
          company: parts[2],
          role: parts[3],
          score: parts[4] !== '-' ? parts[4] : '',
          status: parts[5] || 'Evaluated',
          pdf: parts[6],
          report: parts[7],
          notes: parts[8] || ''
        });
      }
    }
  }
  
  return applications;
}

function truncate(str, maxLength) {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

program.parse();
