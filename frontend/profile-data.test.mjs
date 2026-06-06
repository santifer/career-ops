import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { buildProfile } from './profile-data.mjs';

function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'career-ops-profile-'));
}

function writeFile(rootDir, relPath, contents) {
  const target = join(rootDir, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

test('buildProfile reads a populated fixture from rootDir', () => {
  const rootDir = makeRoot();
  try {
    writeFile(rootDir, 'cv.md', `# Test Candidate

**Languages:** English, Mandarin
**Education:** Bachelor of Commerce

## Summary

Growth operator with analytics depth.

## Experience

### Founder - ExampleCo
**Jan 2024 - Present**

- Grew a product from zero.

## Skills

- **Growth:** SEO, Lifecycle
- **Technical:** JavaScript, SQL
`);

    writeFile(rootDir, 'config/profile.yml', `candidate:
  full_name: "Test Candidate"
  email: "test@example.com"
  phone: "+1"
  location: "Taipei"
  linkedin: "linkedin"
  portfolio_url: "portfolio"
  substack: "substack"
  github: "github"
target_roles:
  primary:
    - "Growth Manager"
  archetypes:
    - name: "Growth"
      level: "Mid"
      fit: "primary"
    - name: "Sales"
      level: "Mid"
      fit: "secondary"
  industries:
    - "Fintech"
narrative:
  headline: "Growth founder"
  exit_story: "Fallback exit story"
  superpowers:
    - "Full funnel"
  proof_points:
    - name: "ExampleCo"
      hero_metric: "100 users"
compensation:
  target_range: "A$90K-110K"
  currency: "AUD"
  minimum: "A$90K"
  location_flexibility: "Remote"
  floors:
    australia: "A$90K"
    taiwan: "NT$100K"
location:
  country: "Taiwan"
  city: "Taipei"
  timezone: "GMT+8"
  visa_status: "Full work rights"
  onsite_availability: "Hybrid ok"
deal_breakers:
  hard_no:
    - "Daily onsite"
  likely_no:
    - "Pure outbound"
cv:
  output_format: "html"
  auto_pdf_score_threshold: 4
`);

    writeFile(rootDir, 'modes/_profile.md', `# User Profile

## Your Target Roles

| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **Growth** | Funnel | Experiments |

## Your Exit Narrative

**Frame:** "Live exit story"

## Your Comp Targets

| Role Type | Market | Range |
|-----------|--------|-------|
| Growth | AU | A$90K |

## Key Framing Rules

1. **Lead with proof.** Show outcomes.
`);

    writeFile(rootDir, 'portals.yml', `title_filter:
  positive:
    - Growth
  negative:
    - Intern
  seniority_boost:
    - Senior
location_filter:
  allow:
    - Taiwan
  always_allow:
    - Australia
  block:
    - Mars
tracked_companies:
  - name: Alpha
    enabled: true
  - name: Beta
    enabled: false
search_queries:
  - name: Growth query
    query: '"Growth" Taiwan'
    enabled: true
  - name: Disabled
    query: disabled
    enabled: false
`);

    writeFile(rootDir, 'article-digest.md', `# Digest

## ExampleCo

- Built **100 users** quickly

## Key Strengths

1. **Full-funnel ownership**
`);

    writeFile(rootDir, 'data/pipeline.md', '# Pipeline\n');
    writeFile(rootDir, 'data/applications.md', '# Applications\n');
    writeFile(rootDir, 'doctor.mjs', '');
    writeFile(rootDir, 'verify-pipeline.mjs', '');
    writeFile(rootDir, 'scan.mjs', '');

    const profile = buildProfile({ rootDir });

    assert.equal(profile.identity.name, 'Test Candidate');
    assert.deepEqual(profile.identity.languages, ['English', 'Mandarin']);
    assert.equal(profile.targeting.secondaryRoles[0], 'Sales');
    assert.equal(profile.narrative.exitStory, 'Live exit story');
    assert.equal(profile.compensation.floors.australia, 'A$90K');
    assert.equal(profile.location.timezone, 'GMT+8');
    assert.deepEqual(profile.dealBreakers, ['Daily onsite', 'Pure outbound']);
    assert.equal(profile.cv.experience[0].company, 'ExampleCo');
    assert.equal(profile.searchSources.totalCompanies, 2);
    assert.equal(profile.searchSources.enabledCompanies, 1);
    assert.deepEqual(profile.searchSources.companyNames, ['Alpha']);
    assert.equal(profile.profileMd.archetypes[0].whatTheyBuy, 'Experiments');
    assert.equal(profile.profileMd.framingRules[0], 'Lead with proof. Show outcomes.');
    assert.equal(profile.profileMd.compTargets[0].range, 'A$90K');
    assert.equal(profile.proofPoints[0].section, 'ExampleCo');
    assert.deepEqual(profile.strengths.keyStrengths, ['Full-funnel ownership']);
    assert.equal(profile.setup.files.cvExists, true);
    assert.equal(profile.setup.files.pipelineExists, true);
    assert.equal(profile.setup.pdf.autoPdfScoreThreshold, '4');
    assert.equal(profile.setup.systemHealth.scanScriptExists, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('buildProfile tolerates missing source files with empty defaults', () => {
  const rootDir = makeRoot();
  try {
    const profile = buildProfile({ rootDir });

    assert.equal(profile.identity.name, '');
    assert.deepEqual(profile.targeting.primaryRoles, []);
    assert.deepEqual(profile.proofPoints, []);
    assert.equal(profile.searchSources.totalCompanies, 0);
    assert.equal(profile.setup.files.cvExists, false);
    assert.equal(profile.setup.files.cvHasContent, false);
    assert.equal(profile.setup.files.articleDigestExists, false);
    assert.equal(profile.setup.systemHealth.verifyScriptExists, false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('buildProfile surfaces malformed YAML as an error', () => {
  const rootDir = makeRoot();
  try {
    writeFile(rootDir, 'config/profile.yml', 'candidate: [');

    assert.throws(
      () => buildProfile({ rootDir }),
      /unexpected end of the stream|bad indentation|missed comma/i,
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
