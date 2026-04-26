import fs from 'fs';
import path from 'path';

const appRoot = process.cwd();
const repoRoot = path.join(appRoot, '..');
const runtimeRoot = path.join(appRoot, 'runtime-assets');

const copyFileIfExists = (src, dest) => {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
};

const copyDirIfExists = (src, dest) => {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  return true;
};

fs.mkdirSync(runtimeRoot, { recursive: true });

copyFileIfExists(path.join(repoRoot, 'portals.yml'), path.join(runtimeRoot, 'portals.yml'));
copyDirIfExists(path.join(repoRoot, 'portals', 'scrapers'), path.join(runtimeRoot, 'portals', 'scrapers'));
copyFileIfExists(path.join(repoRoot, 'generate-pdf.mjs'), path.join(runtimeRoot, 'generate-pdf.mjs'));
copyFileIfExists(
  path.join(repoRoot, 'templates', 'ats-template.html'),
  path.join(runtimeRoot, 'templates', 'ats-template.html')
);
copyFileIfExists(
  path.join(repoRoot, 'templates', 'cover-letter.html'),
  path.join(runtimeRoot, 'templates', 'cover-letter.html')
);

console.log('Prepared runtime-assets bundle for serverless execution.');
