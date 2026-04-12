import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname);
const mdPath = resolve(ROOT, 'data/applications.md');
const jsonPath = resolve(ROOT, 'data/applications.json');

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  try {
    const text = await readFile(mdPath, 'utf8');
    const lines = text.split('\n');
    let inTable = false;
    let apps = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) continue;
      
      // Skip headers and separators
      if (trimmed.includes('---') || trimmed.includes('| Report | Date | Company |')) {
        inTable = true;
        continue;
      }

      if (inTable) {
        const parts = trimmed.split('|').map(s => s.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        if (parts.length >= 6) {
          const report = parts[0]; // e.g. [001](...)
          const reportMatch = report.match(/\[(\d+)\]\(([^)]+)\)/);
          const scoreMatch = parts[4].match(/([\d.]+)/);
          
          apps.push({
            number: reportMatch ? parseInt(reportMatch[1], 10) : apps.length + 1,
            date: parts[1],
            company: parts[2],
            role: parts[3],
            status: 'Applied', // Need to infer or hardcode basic
            score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
            scoreRaw: parts[4],
            hasPdf: parts[5].includes('✅'),
            reportPath: reportMatch ? reportMatch[2] : '',
            reportNumber: reportMatch ? reportMatch[1] : String(apps.length + 1).padStart(3, '0'),
            notes: parts.length > 6 ? parts[6] : '',
            jobUrl: ''
          });
        }
      }
    }

    const payload = {
      version: "1.0",
      applications: apps
    };

    if (isDryRun) {
      console.log('DRY RUN OUTPUT:');
      console.log(JSON.stringify(payload, null, 2));
    } else {
      await writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`Successfully migrated ${apps.length} applications to JSON at ${jsonPath}`);
    }

  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No applications.md file found. Skipping migration.');
    } else {
      console.error('Failed to parse applications:', err);
    }
  }
}

run();
