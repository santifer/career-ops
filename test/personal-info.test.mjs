import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// Dynamic import so each test can control the config path via env / temp files
async function importLoader() {
  return import('../scripts/load-personal-info.mjs');
}

// Helper: write a temp personal-info.yml and return its path
function writeTempConfig(dir, content) {
  const p = path.join(dir, 'personal-info.yml');
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Helper: write a dummy resume file
function writeTempResume(dir) {
  const p = path.join(dir, 'resume.pdf');
  fs.writeFileSync(p, 'PDF stub', 'utf8');
  return p;
}

// ── Template file tests ───────────────────────────────────────────────────────

describe('personal-info.yml.template', () => {

  test('template file exists', () => {
    const templatePath = path.join(ROOT, 'config', 'personal-info.yml.template');
    assert.ok(fs.existsSync(templatePath), 'config/personal-info.yml.template should exist');
  });

  test('template is valid YAML', async () => {
    const templatePath = path.join(ROOT, 'config', 'personal-info.yml.template');
    const { default: yaml } = await import('js-yaml');
    const content = fs.readFileSync(templatePath, 'utf8');
    const parsed = yaml.load(content);
    assert.ok(parsed !== null, 'template should be non-null YAML');
    assert.equal(typeof parsed, 'object', 'template should parse to object');
  });

  test('template has all required top-level keys', async () => {
    const templatePath = path.join(ROOT, 'config', 'personal-info.yml.template');
    const { default: yaml } = await import('js-yaml');
    const parsed = yaml.load(fs.readFileSync(templatePath, 'utf8'));
    const required = ['name', 'contact', 'location', 'links', 'work_auth', 'experience', 'resume', 'cover_letter', 'salary', 'custom'];
    for (const key of required) {
      assert.ok(key in parsed, `template should have top-level key: ${key}`);
    }
  });

  test('template custom section has expected fields', async () => {
    const templatePath = path.join(ROOT, 'config', 'personal-info.yml.template');
    const { default: yaml } = await import('js-yaml');
    const parsed = yaml.load(fs.readFileSync(templatePath, 'utf8'));
    assert.ok('how_heard' in parsed.custom, 'custom should have how_heard');
    assert.ok('authorized_to_work' in parsed.custom, 'custom should have authorized_to_work');
    assert.ok('veteran_status' in parsed.custom, 'custom should have veteran_status');
  });

});

// ── loadPersonalInfo validation tests ────────────────────────────────────────

describe('loadPersonalInfo', () => {

  test('throws PersonalInfoError when config file missing', async () => {
    const { loadPersonalInfo, PersonalInfoError } = await importLoader();

    // Temporarily rename existing config so the loader can't find it
    const cfg = path.join(ROOT, 'config', 'personal-info.yml');
    const tmp = cfg + '.test-backup';
    const existed = fs.existsSync(cfg);
    if (existed) fs.renameSync(cfg, tmp);

    try {
      await assert.rejects(
        () => loadPersonalInfo(),
        (err) => err instanceof PersonalInfoError && err.message.includes('personal-info.yml not found'),
        'should throw PersonalInfoError when file missing'
      );
    } finally {
      if (existed) fs.renameSync(tmp, cfg);
    }
  });

  test('throws PersonalInfoError when required fields empty', async () => {
    const { loadPersonalInfo, PersonalInfoError } = await importLoader();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-test-'));
    const resumePath = writeTempResume(dir);

    // Valid file but missing first name
    writeTempConfig(dir, `name:\n  first: ""\n  last: "Smith"\ncontact:\n  email: "test@x.com"\nresume:\n  path: "${resumePath.replace(/\\/g, '\\\\')}"\n`);

    // Point loader at the temp dir by monkey-patching CONFIG_PATH is not possible
    // across module cache — use the real loader with a real missing field approach:
    // Write to the actual config path temporarily
    const cfg = path.join(ROOT, 'config', 'personal-info.yml');
    const tmp = cfg + '.test-backup';
    const existed = fs.existsSync(cfg);
    if (existed) fs.renameSync(cfg, tmp);

    fs.writeFileSync(cfg, `name:\n  first: ""\n  last: "Smith"\ncontact:\n  email: "test@x.com"\nresume:\n  path: "${resumePath.replace(/\\/g, '\\\\')}"\n`, 'utf8');

    try {
      await assert.rejects(
        () => loadPersonalInfo(),
        (err) => err instanceof PersonalInfoError && err.message.includes('name.first is required'),
        'should fail on missing first name'
      );
    } finally {
      if (existed) fs.renameSync(tmp, cfg);
      else fs.unlinkSync(cfg);
      fs.rmSync(dir, { recursive: true });
    }
  });

  test('throws PersonalInfoError when resume file does not exist', async () => {
    const { loadPersonalInfo, PersonalInfoError } = await importLoader();

    const cfg = path.join(ROOT, 'config', 'personal-info.yml');
    const tmp = cfg + '.test-backup';
    const existed = fs.existsSync(cfg);
    if (existed) fs.renameSync(cfg, tmp);

    fs.writeFileSync(cfg,
      `name:\n  first: "Jane"\n  last: "Doe"\ncontact:\n  email: "j@d.com"\nresume:\n  path: "/nonexistent/resume.pdf"\n`,
      'utf8'
    );

    try {
      await assert.rejects(
        () => loadPersonalInfo(),
        (err) => err instanceof PersonalInfoError && err.message.includes('resume.path file not found'),
        'should fail when resume file is missing'
      );
    } finally {
      if (existed) fs.renameSync(tmp, cfg);
      else fs.unlinkSync(cfg);
    }
  });

  test('auto-derives name.full when empty', async () => {
    const { loadPersonalInfo } = await importLoader();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-test-'));
    const resumePath = writeTempResume(dir);

    const cfg = path.join(ROOT, 'config', 'personal-info.yml');
    const tmp = cfg + '.test-backup';
    const existed = fs.existsSync(cfg);
    if (existed) fs.renameSync(cfg, tmp);

    fs.writeFileSync(cfg,
      `name:\n  first: "Jane"\n  last: "Doe"\n  full: ""\ncontact:\n  email: "j@d.com"\nresume:\n  path: "${resumePath.replace(/\\/g, '\\\\')}"\n`,
      'utf8'
    );

    let info;
    try {
      info = await loadPersonalInfo();
    } finally {
      if (existed) fs.renameSync(tmp, cfg);
      else fs.unlinkSync(cfg);
      fs.rmSync(dir, { recursive: true });
    }

    assert.equal(info.name.full, 'Jane Doe', 'should auto-derive full name');
  });

  test('preserves explicit name.full when provided', async () => {
    const { loadPersonalInfo } = await importLoader();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-test-'));
    const resumePath = writeTempResume(dir);

    const cfg = path.join(ROOT, 'config', 'personal-info.yml');
    const tmp = cfg + '.test-backup';
    const existed = fs.existsSync(cfg);
    if (existed) fs.renameSync(cfg, tmp);

    fs.writeFileSync(cfg,
      `name:\n  first: "Jane"\n  last: "Doe"\n  full: "Jane A. Doe"\ncontact:\n  email: "j@d.com"\nresume:\n  path: "${resumePath.replace(/\\/g, '\\\\')}"\n`,
      'utf8'
    );

    let info;
    try {
      info = await loadPersonalInfo();
    } finally {
      if (existed) fs.renameSync(tmp, cfg);
      else fs.unlinkSync(cfg);
      fs.rmSync(dir, { recursive: true });
    }

    assert.equal(info.name.full, 'Jane A. Doe', 'should preserve explicit full name');
  });

  test('missing email triggers validation error', async () => {
    const { loadPersonalInfo, PersonalInfoError } = await importLoader();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-test-'));
    const resumePath = writeTempResume(dir);

    const cfg = path.join(ROOT, 'config', 'personal-info.yml');
    const tmp = cfg + '.test-backup';
    const existed = fs.existsSync(cfg);
    if (existed) fs.renameSync(cfg, tmp);

    fs.writeFileSync(cfg,
      `name:\n  first: "Jane"\n  last: "Doe"\ncontact:\n  email: ""\nresume:\n  path: "${resumePath.replace(/\\/g, '\\\\')}"\n`,
      'utf8'
    );

    try {
      await assert.rejects(
        () => loadPersonalInfo(),
        (err) => err instanceof PersonalInfoError && err.message.includes('contact.email is required'),
        'should fail on empty email'
      );
    } finally {
      if (existed) fs.renameSync(tmp, cfg);
      else fs.unlinkSync(cfg);
      fs.rmSync(dir, { recursive: true });
    }
  });

});

// ── .gitignore PII guard ──────────────────────────────────────────────────────

describe('gitignore PII guard', () => {

  test('config/personal-info.yml is gitignored', () => {
    const giPath = path.join(ROOT, '.gitignore');
    assert.ok(fs.existsSync(giPath), '.gitignore should exist');
    const content = fs.readFileSync(giPath, 'utf8');
    assert.ok(
      content.includes('config/personal-info.yml'),
      '.gitignore should contain config/personal-info.yml'
    );
  });

  test('config/personal-info.yml.template is NOT gitignored', () => {
    const giPath = path.join(ROOT, '.gitignore');
    const content = fs.readFileSync(giPath, 'utf8');
    // The pattern must not match the .template file
    const lines = content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const blockingLines = lines.filter((l) => {
      // Would this line prevent committing the template?
      // Only exact match or *.yml patterns matter
      return l === 'config/personal-info.yml.template' ||
             l === 'config/*.yml' ||
             l === 'config/**';
    });
    assert.equal(blockingLines.length, 0, 'template file should not be gitignored');
  });

});
