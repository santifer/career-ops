#!/usr/bin/env node

// Scan international: Worldwide job offers
// Backs up portals.yml, modifies for international, runs scan, restores

import { execSync } from 'child_process';
import fs from 'fs';

const backup = 'portals.yml.bak';

// Backup
fs.copyFileSync('portals.yml', backup);

// Modify portals.yml for international (remove location filters)
let content = fs.readFileSync('portals.yml', 'utf8');
content = content.replace(/"Colombia"/g, '');
content = content.replace(/"Bogotá"/g, '');
content = content.replace(/"solicitud sencilla"/g, ''); // Remove specific filters
fs.writeFileSync('portals.yml', content);

// Run scan
execSync('node scan.mjs', { stdio: 'inherit' });

// Restore
fs.copyFileSync(backup, 'portals.yml');
fs.unlinkSync(backup);