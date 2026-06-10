#!/usr/bin/env node
/**
 * verify-mode-parity.mjs — semantic-anchor checks for localized modes.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MODES_DIR = process.env.CAREER_OPS_MODES || join(ROOT, 'modes');

const LOCALE_FILE_MAP = {
  de: { _shared: '_shared.md', oferta: 'angebot.md', apply: 'bewerben.md', pipeline: 'pipeline.md' },
  fr: { _shared: '_shared.md', oferta: 'offre.md', apply: 'postuler.md', pipeline: 'pipeline.md' },
  ja: { _shared: '_shared.md', oferta: 'kyujin.md', apply: 'oubo.md', pipeline: 'pipeline.md' },
  tr: { _shared: '_shared.md', oferta: 'is-ilani.md', apply: 'basvuru.md', pipeline: 'pipeline.md' },
  pt: { _shared: '_shared.md', oferta: 'oferta.md', apply: 'aplicar.md', pipeline: 'pipeline.md' },
  ru: { _shared: '_shared.md', oferta: 'oferta.md', apply: 'apply.md', pipeline: 'pipeline.md' },
  ua: { _shared: '_shared.md', oferta: 'oferta.md', apply: 'apply.md', pipeline: 'pipeline.md' },
};

const ANCHORS = {
  _shared: [
    { id: 'profile-source', pattern: /_profile\.md|profile\.yml/i },
    { id: 'no-hardcoded-metrics', pattern: /hardcode|hart cod|codificat|ハードコード|sabit|жорстко|жестко|hardcoded/i },
  ],
  oferta: [
    { id: 'posting-legitimacy', pattern: /legitimacy|legitimidad|legitimit|meşruiyet|正当性|легітим|легитим|legitimidade|glaubwürdig/i },
    { id: 'url-header', pattern: /\*\*URL:\*\*/i },
  ],
  apply: [
    { id: 'human-review-before-submit', pattern: /submit|send|apply|enviar|absenden|送信|başvur|відправ|отправ/i },
  ],
  pipeline: [
    { id: 'pdf-gate', pattern: /PDF/i },
    { id: 'tracker-output', pattern: /tracker|applications\.md|suivi|verfolg|追跡|izleyici|трекер/i },
  ],
};

function localeDirs(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'README.md')))
    .map((entry) => entry.name)
    .sort();
}

function checkFile({ locale, modeType, path }) {
  if (!existsSync(path)) {
    return [{
      level: 'error',
      locale,
      mode: modeType,
      file: path,
      anchor: 'file-exists',
      message: 'localized mode file is missing',
    }];
  }
  const content = readFileSync(path, 'utf-8');
  return (ANCHORS[modeType] || [])
    .filter(({ pattern }) => !pattern.test(content))
    .map(({ id }) => ({
      level: 'warning',
      locale,
      mode: modeType,
      file: path,
      anchor: id,
      message: `semantic anchor missing: ${id}`,
    }));
}

export function verifyModeParity({ modesDir = MODES_DIR } = {}) {
  const findings = [];
  for (const locale of localeDirs(modesDir)) {
    const fileMap = LOCALE_FILE_MAP[locale];
    if (!fileMap) {
      findings.push({
        level: 'warning',
        locale,
        mode: '*',
        file: join(modesDir, locale),
        anchor: 'locale-map',
        message: 'locale directory has no parity file map',
      });
      continue;
    }
    for (const [modeType, file] of Object.entries(fileMap)) {
      findings.push(...checkFile({
        locale,
        modeType,
        path: join(modesDir, locale, file),
      }));
    }
  }
  return findings.map((finding) => ({ ...finding, file: relative(modesDir, finding.file) || finding.file }));
}

function writeFixture(root, locale, files) {
  const dir = join(root, locale);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'README.md'), '# locale\n');
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(dir, file), content);
  }
}

function runSelfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'co-modes-'));
  try {
    writeFixture(dir, 'de', {
      '_shared.md': '_profile.md hardcode',
      'angebot.md': '**URL:**\nLegitimacy',
      'bewerben.md': 'submit only after review',
      'pipeline.md': 'PDF applications.md tracker',
    });
    writeFixture(dir, 'fr', {
      '_shared.md': '_profile.md',
      'offre.md': '**URL:**',
      'postuler.md': 'formulaire',
      'pipeline.md': 'PDF',
    });
    const findings = verifyModeParity({ modesDir: dir });
    const deErrors = findings.filter((f) => f.locale === 'de' && f.level === 'error');
    const frWarnings = findings.filter((f) => f.locale === 'fr' && f.level === 'warning');
    if (deErrors.length !== 0 || frWarnings.length === 0) {
      throw new Error(`unexpected self-test findings: ${JSON.stringify(findings)}`);
    }
    console.log('verify-mode-parity self-test passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--self-test')) return runSelfTest();
  const strict = process.argv.includes('--strict');
  const findings = verifyModeParity();
  const errors = findings.filter((finding) => finding.level === 'error').length;
  const warnings = findings.filter((finding) => finding.level === 'warning').length;
  console.log(JSON.stringify({ errors, warnings, findings }, null, 2));
  if (errors > 0 || (strict && warnings > 0)) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
