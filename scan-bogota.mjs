#!/usr/bin/env node

// Scan Bogotá: Job offers in Bogotá, Colombia only
// Backs up portals.yml, modifies for Bogotá, runs scan, filters results by location, restores

import { execSync } from 'child_process';
import fs from 'fs';

const backup = 'portals.yml.bak';

// Backup
fs.copyFileSync('portals.yml', backup);

// Modify portals.yml for Bogotá (add Colombia/Bogotá to queries)
let content = fs.readFileSync('portals.yml', 'utf8');
// Add "Colombia" "Bogotá" to LinkedIn queries
content = content.replace(/query: 'site:linkedin\.com\/jobs "desarrollador/g, 'query: \'site:linkedin.com/jobs "desarrollador" "Colombia" "Bogotá"');
content = content.replace(/query: 'site:linkedin\.com\/jobs "RPA"/g, 'query: \'site:linkedin.com/jobs "RPA" "Colombia" "Bogotá"');
// Add to Computrabajo
content = content.replace(/"desarrollador" OR "full stack" OR "backend" OR "frontend"/g, '"desarrollador" OR "full stack" OR "backend" OR "frontend" "Bogotá" "Colombia"');
fs.writeFileSync('portals.yml', content);

// Run scan
execSync('node scan.mjs', { stdio: 'inherit' });

// Run websearch for Bogotá
try {
  execSync('node websearch-bogota.mjs', { stdio: 'inherit' });
} catch (e) {
  console.log('Websearch failed, but API scan completed.');
}

// Filter pipeline.md to keep only offers with "Colombia" or "Bogotá" in location
const pipelinePath = 'data/pipeline.md';
let pipelineContent = fs.readFileSync(pipelinePath, 'utf8');
const lines = pipelineContent.split('\n');
const filteredLines = lines.filter(line => {
  if (line.startsWith('- [ ]')) {
    // Check if contains Colombia or Bogotá
    return line.includes('Colombia') || line.includes('Bogotá');
  }
  return true; // Keep headers and other lines
});
const newContent = filteredLines.join('\n');
fs.writeFileSync(pipelinePath, newContent);

// Restore
fs.copyFileSync(backup, 'portals.yml');
fs.unlinkSync(backup);

console.log('Filtered pipeline.md to Bogotá/Colombia offers only.');