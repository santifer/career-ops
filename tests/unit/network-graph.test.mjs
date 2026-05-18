/**
 * tests/unit/network-graph.test.mjs
 *
 * Unit tests for lib/network-graph.mjs
 * Runs via: node --test tests/unit/network-graph.test.mjs
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const GRAPH_PATH = join(REPO_ROOT, 'data', 'network-graph.json');

// ── Fixture helpers ───────────────────────────────────────────────────────────

function writeGraph(data) {
  if (!existsSync(join(REPO_ROOT, 'data'))) {
    mkdirSync(join(REPO_ROOT, 'data'), { recursive: true });
  }
  writeFileSync(GRAPH_PATH, JSON.stringify(data, null, 2));
}

function removeGraph() {
  try { unlinkSync(GRAPH_PATH); } catch { /* ok */ }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MEDIA_PEOPLE = [
  {
    id: 'mara-van-ells',
    name: 'Mara Van Ells',
    current_role: 'On-camera principal',
    current_company: 'AJ+',
    relationship_type: ['colleague'],
    evidence_sources: [{ file: 'cv.md', context: 'Coached by Mitchell at AJ+; became on-camera principal with Emmy/Webby wins' }],
    last_known_contact: null,
    press_media_potential: true,
    tap_potential: 'high',
    notes: '',
  },
  {
    id: 'yara-elmjouie',
    name: 'Yara Elmjouie',
    current_role: 'On-camera principal',
    current_company: 'AJ+',
    relationship_type: ['colleague'],
    evidence_sources: [{ file: 'cv.md', context: 'Coached by Mitchell at AJ+; became on-camera principal with Emmy/Webby wins' }],
    last_known_contact: null,
    press_media_potential: true,
    tap_potential: 'high',
    notes: '',
  },
  {
    id: 'sana-saeed',
    name: 'Sana Saeed',
    current_role: 'On-camera principal',
    current_company: 'AJ+',
    relationship_type: ['colleague'],
    evidence_sources: [{ file: 'cv.md', context: 'Coached by Mitchell at AJ+; Emmy/Webby wins' }],
    last_known_contact: null,
    press_media_potential: true,
    tap_potential: 'high',
    notes: '',
  },
  {
    id: 'marc-lamont-hill',
    name: 'Marc Lamont Hill',
    current_role: 'TV Host',
    current_company: 'HuffPost Live',
    relationship_type: ['colleague'],
    evidence_sources: [{ file: 'cv.md', context: 'Host on trans military panel at HuffPost Live' }],
    last_known_contact: null,
    press_media_potential: true,
    tap_potential: 'high',
    notes: '',
  },
  {
    id: 'mariana-atencio',
    name: 'Mariana Atencio',
    current_role: 'Anchor',
    current_company: 'Fusion',
    relationship_type: ['colleague'],
    evidence_sources: [{ file: 'cv.md', context: 'Line producer for America with Jorge Ramos; Mariana Atencio confirmed live air credit' }],
    last_known_contact: null,
    press_media_potential: true,
    tap_potential: 'high',
    notes: '',
  },
  {
    id: 'ahmed-shihab-eldin',
    name: 'Ahmed Shihab-Eldin',
    current_role: 'TV Host / journalist',
    current_company: 'Al Jazeera',
    relationship_type: ['colleague'],
    evidence_sources: [{ file: 'interview-prep/story-bank.md', context: 'Named in coalition story, April 2026' }],
    last_known_contact: '2026-04-01T00:00:00.000Z',
    press_media_potential: true,
    tap_potential: 'high',
    notes: '',
  },
  {
    id: 'carmen-yuliz-cruz',
    name: 'Carmen Yulín Cruz',
    current_role: 'Mayor of San Juan',
    current_company: 'San Juan Municipality',
    relationship_type: ['interviewee'],
    evidence_sources: [{ file: 'cv.md', context: 'Field-produced crisis interview during active Hurricane Maria response' }],
    last_known_contact: null,
    press_media_potential: false,
    tap_potential: 'medium',
    notes: '',
  },
];

const ANTHROPIC_CONTACT = {
  id: 'alex-doe',
  name: 'Alex Doe',
  current_role: 'Research Scientist',
  current_company: 'Anthropic',
  relationship_type: ['linkedin_connection'],
  evidence_sources: [{ file: 'data/linkedin/Connections.csv', context: 'Research Scientist at Anthropic' }],
  last_known_contact: '2026-05-15T00:00:00.000Z',
  press_media_potential: false,
  tap_potential: 'high',
  notes: '',
};

const CNN_CONTACT = {
  id: 'karen-travers',
  name: 'Karen Travers',
  current_role: 'ABC News field reporter',
  current_company: 'ABC News',
  relationship_type: ['colleague'],
  evidence_sources: [{ file: 'cv.md', context: 'Integrated ABC News field packages in Fusion Nelson Mandela breaking-news special' }],
  last_known_contact: null,
  press_media_potential: true,
  tap_potential: 'high',
  notes: '',
};

function buildGraph(extra = []) {
  return {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    people: [...MEDIA_PEOPLE, ANTHROPIC_CONTACT, CNN_CONTACT, ...extra],
    summary: {
      total_people: MEDIA_PEOPLE.length + 2 + extra.length,
      by_relationship: {
        colleague: MEDIA_PEOPLE.length + 1,
        interviewee: 1,
        linkedin_connection: 1,
      },
      media_press_contacts: MEDIA_PEOPLE.length + 1,
      in_target_companies: [
        { company: 'anthropic', count: 1, names: ['Alex Doe'] },
      ],
    },
  };
}

// Import after setup
import {
  loadNetworkGraph,
  clearCache,
  findContactsAtCompany,
  findContactsInIndustry,
  findLeveragePathTo,
  checkGap,
  renderNetworkCard,
  getNetworkSummary,
} from '../../lib/network-graph.mjs';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('network-graph: schema validation', () => {
  afterEach(() => { clearCache(); removeGraph(); });

  test('loadNetworkGraph returns null when file missing', () => {
    removeGraph();
    clearCache();
    const g = loadNetworkGraph();
    assert.equal(g, null, 'Should return null when graph file does not exist');
  });

  test('loadNetworkGraph validates schema_version and people array', () => {
    writeGraph(buildGraph());
    clearCache();
    const g = loadNetworkGraph();
    assert.ok(g !== null, 'Should load valid graph');
    assert.equal(g.schema_version, '1.0.0');
    assert.ok(Array.isArray(g.people), 'people should be an array');
  });

  test('loadNetworkGraph returns null for invalid schema (missing people array)', () => {
    writeGraph({ schema_version: '1.0.0', summary: {} });
    clearCache();
    const g = loadNetworkGraph();
    assert.equal(g, null, 'Should return null for graph missing people array');
  });

  test('loadNetworkGraph caches result in-memory', () => {
    writeGraph(buildGraph());
    clearCache();
    const first = loadNetworkGraph();
    const second = loadNetworkGraph();
    assert.strictEqual(first, second, 'Second load should return cached object reference');
  });
});

describe('network-graph: media contacts — AJ+, CNN, HuffPost Live, Al Jazeera', () => {
  afterEach(() => { clearCache(); removeGraph(); });

  test('findContactsInIndustry("press") returns AJ+, HuffPost Live, Fusion, ABC News contacts', () => {
    writeGraph(buildGraph());
    clearCache();
    const contacts = findContactsInIndustry('press');
    assert.ok(contacts.length >= 5, `Expected ≥5 press contacts, got ${contacts.length}`);
    const names = contacts.map(c => c.name);
    assert.ok(names.includes('Mara Van Ells'), 'Should include Mara Van Ells (AJ+)');
    assert.ok(names.includes('Marc Lamont Hill'), 'Should include Marc Lamont Hill (HuffPost Live)');
    assert.ok(names.includes('Mariana Atencio'), 'Should include Mariana Atencio (Fusion)');
    assert.ok(names.includes('Karen Travers'), 'Should include Karen Travers (ABC News)');
    assert.ok(names.includes('Ahmed Shihab-Eldin'), 'Should include Ahmed Shihab-Eldin (Al Jazeera)');
  });

  test('findContactsInIndustry("media") returns press_media_potential=true contacts', () => {
    writeGraph(buildGraph());
    clearCache();
    const contacts = findContactsInIndustry('media');
    const mediaContacts = contacts.filter(c => c.press_media_potential);
    assert.ok(mediaContacts.length >= 5, 'Should return multiple press_media_potential contacts');
  });
});

describe('network-graph: press-journalist gap contradiction', () => {
  afterEach(() => { clearCache(); removeGraph(); });

  test('checkGap returns contradicts=true for "journalist network" gap given 14-year media history', () => {
    writeGraph(buildGraph());
    clearCache();
    const result = checkGap('journalist network gap');
    assert.equal(result.contradicts, true, 'Should contradict journalist network gap');
    assert.ok(result.evidence_summary.length > 0, 'Should have evidence summary');
    assert.ok(result.draft_response.length > 0, 'Should have a draft response');
    assert.ok(Array.isArray(result.contacts_to_tap), 'contacts_to_tap should be an array');
    assert.ok(result.contacts_to_tap.length > 0, 'Should have contacts to tap');
  });

  test('checkGap handles "press relations" variant', () => {
    writeGraph(buildGraph());
    clearCache();
    const result = checkGap('no press relations experience');
    assert.equal(result.contradicts, true);
  });

  test('checkGap handles "broadcast experience" variant', () => {
    writeGraph(buildGraph());
    clearCache();
    const result = checkGap('broadcast experience gap');
    assert.equal(result.contradicts, true);
    assert.ok(result.draft_response.includes('Al Jazeera') || result.draft_response.includes('contacts'), 'Draft response should reference media experience');
  });

  test('checkGap returns contradicts=false for unrelated gap', () => {
    writeGraph(buildGraph());
    clearCache();
    const result = checkGap('regulatory compliance in pharmaceutical industry');
    assert.equal(result.contradicts, false);
  });
});

describe('network-graph: Anthropic leverage path discovery', () => {
  afterEach(() => { clearCache(); removeGraph(); });

  test('findLeveragePathTo("anthropic") returns direct contacts', () => {
    writeGraph(buildGraph());
    clearCache();
    const result = findLeveragePathTo('anthropic');
    assert.ok(Array.isArray(result.direct), 'direct should be an array');
    assert.ok(result.direct.length > 0, 'Should find at least one direct Anthropic contact');
    assert.ok(result.direct.some(p => p.current_company?.toLowerCase().includes('anthropic')),
      'Direct contacts should be at Anthropic');
    assert.equal(result.no_path, false, 'Should not report no_path when direct contacts exist');
  });

  test('findLeveragePathTo returns no_path=true when no contacts at company', () => {
    writeGraph(buildGraph());
    clearCache();
    const result = findLeveragePathTo('palantir-defense-corp-xyz');
    assert.ok(result.direct.length === 0, 'No direct contacts at unknown company');
    assert.equal(result.no_path, true);
  });

  test('findContactsAtCompany("anthropic") returns linkedin connections at Anthropic', () => {
    writeGraph(buildGraph());
    clearCache();
    const contacts = findContactsAtCompany('anthropic');
    assert.ok(contacts.length > 0, 'Should find Anthropic contacts');
    assert.ok(contacts.every(c => (c.current_company || '').toLowerCase().includes('anthropic')),
      'All returned contacts should be at Anthropic');
  });
});

describe('network-graph: renderNetworkCard', () => {
  afterEach(() => { clearCache(); removeGraph(); });

  test('renderNetworkCard returns empty string for empty array', () => {
    const html = renderNetworkCard([]);
    assert.equal(html, '');
  });

  test('renderNetworkCard returns valid HTML for non-empty contacts', () => {
    const html = renderNetworkCard(MEDIA_PEOPLE.slice(0, 3), { label: 'AJ+ contacts' });
    assert.ok(html.length > 0, 'Should return non-empty HTML');
    assert.ok(html.includes('network-card'), 'Should include network-card class');
    assert.ok(html.includes('Mara Van Ells'), 'Should include contact name');
    assert.ok(html.includes('AJ+'), 'Should include company');
  });

  test('renderNetworkCard escapes HTML entities to prevent XSS', () => {
    const maliciousContact = {
      ...MEDIA_PEOPLE[0],
      name: '<script>alert(1)</script>',
      current_company: '<img onerror="alert(2)">',
      current_role: 'Normal role',
      relationship_type: ['colleague'],
    };
    const html = renderNetworkCard([maliciousContact]);
    // Raw tag delimiters must not appear — escaping < and > is sufficient to prevent execution
    assert.ok(!html.includes('<script>'), 'Script open tag must be escaped');
    assert.ok(!html.includes('</script>'), 'Script close tag must be escaped');
    assert.ok(!html.includes('<img '), 'Raw img tag must not appear');
    assert.ok(html.includes('&lt;script&gt;'), 'Should contain escaped version of script tag');
  });
});

describe('network-graph: getNetworkSummary', () => {
  afterEach(() => { clearCache(); removeGraph(); });

  test('getNetworkSummary returns null when graph missing', () => {
    removeGraph();
    clearCache();
    const s = getNetworkSummary();
    assert.equal(s, null);
  });

  test('getNetworkSummary includes total_people, by_relationship, media_press_contacts', () => {
    writeGraph(buildGraph());
    clearCache();
    const s = getNetworkSummary();
    assert.ok(s !== null, 'Should return summary');
    assert.ok(typeof s.total_people === 'number', 'total_people should be a number');
    assert.ok(typeof s.by_relationship === 'object', 'by_relationship should be an object');
    assert.ok(typeof s.media_press_contacts === 'number', 'media_press_contacts should be a number');
    assert.ok(s.media_press_contacts >= 5, 'Should have ≥5 media contacts in the rich fixture');
  });
});
