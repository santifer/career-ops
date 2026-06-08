#!/usr/bin/env node
/**
 * Print the canonical golden path for the Job Pulse Kanban file.
 * Single source of truth: assets/golden-path.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goldenPathFile = path.resolve(__dirname, '..', 'assets', 'golden-path.txt');

if (!fs.existsSync(goldenPathFile)) {
  console.error(`golden-path.txt not found at ${goldenPathFile}`);
  process.exit(2);
}
const goldenPath = fs.readFileSync(goldenPathFile, 'utf8').trim();
console.log(goldenPath);
