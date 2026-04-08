/**
 * Career-Ops CLI - Logger Utility
 * Colored console output for better UX
 */

import chalk from 'chalk';

export const logger = {
  info: (msg) => console.log(chalk.blue('ℹ️  ') + msg),
  success: (msg) => console.log(chalk.green('✅ ') + msg),
  warning: (msg) => console.log(chalk.yellow('⚠️  ') + msg),
  error: (msg) => console.error(chalk.red('❌ ') + msg),
  
  section: (title) => {
    console.log('\n' + chalk.cyan('═'.repeat(80)));
    console.log(chalk.cyan.bold(title));
    console.log(chalk.cyan('═'.repeat(80)));
  },
  
  subsection: (title) => {
    console.log('\n' + chalk.yellow.bold('▸ ' + title));
  },
  
  list: (items) => {
    items.forEach(item => console.log(chalk.gray('  • ') + item));
  },
  
  score: (score) => {
    const num = parseFloat(score);
    let color = chalk.red;
    if (num >= 4.0) color = chalk.green;
    else if (num >= 3.5) color = chalk.yellow;
    else if (num >= 3.0) color = chalk.hex('#FFA500');
    
    console.log(color.bold(`📊 Score: ${score}/5`));
  },
  
  divider: () => console.log(chalk.gray('─'.repeat(80))),
  
  newLine: () => console.log()
};

export function formatReport(report) {
  // Color-code sections
  return report
    .replace(/#{1,2} (.*)/g, chalk.cyan.bold('$&'))
    .replace(/✅/g, chalk.green('✅'))
    .replace(/❌/g, chalk.red('❌'))
    .replace(/⚠️/g, chalk.yellow('⚠️'));
}
