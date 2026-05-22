// scratch/clean-data.mjs
import fs from 'fs';

const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';

// 1. Clean scan-history.tsv
if (fs.existsSync(SCAN_HISTORY_PATH)) {
  const content = fs.readFileSync(SCAN_HISTORY_PATH, 'utf-8');
  const lines = content.split('\n');
  const cleanedLines = lines.filter(line => {
    return !line.includes('\tlinkedin-morning\t');
  });
  
  fs.writeFileSync(SCAN_HISTORY_PATH, cleanedLines.join('\n'), 'utf-8');
  console.log(`Successfully cleaned ${SCAN_HISTORY_PATH}. Removed ${lines.length - cleanedLines.length} lines.`);
}

// 2. Clean pipeline.md
if (fs.existsSync(PIPELINE_PATH)) {
  const content = fs.readFileSync(PIPELINE_PATH, 'utf-8');
  const lines = content.split('\n');
  const cleanedLines = lines.filter(line => {
    // Filter out the job links from linkedin that match morning scan format
    return !line.includes('de.linkedin.com/jobs/view/') || !line.includes('|');
  });
  
  fs.writeFileSync(PIPELINE_PATH, cleanedLines.join('\n'), 'utf-8');
  console.log(`Successfully cleaned ${PIPELINE_PATH}. Removed ${lines.length - cleanedLines.length} lines.`);
}

// 3. Delete generated reports
const filesToDelete = [
  'output/morning-berlin-jobs.csv',
  'scratch/morning-berlin-jobs.md'
];

filesToDelete.forEach(file => {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`Deleted ${file}`);
  }
});
