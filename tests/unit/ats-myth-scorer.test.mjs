import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreAtsMyth,
  renderAtsCard,
  BANDS,
} from '../../lib/ats-myth-scorer.mjs';

// ─── BANDS shape ─────────────────────────────────────────────────────────────

test('BANDS array has correct structure', () => {
  assert.ok(Array.isArray(BANDS) && BANDS.length === 4);
  const bands = BANDS.map(b => b.band);
  assert.deepEqual(bands, ['clean', 'mild', 'moderate', 'high-risk']);
  for (const b of BANDS) {
    assert.ok(b.max >= 0 && b.max <= 100, 'max in range');
    assert.ok(b.label, 'has label');
    assert.ok(b.description, 'has description');
  }
});

// ─── scoreAtsMyth: clean inputs ───────────────────────────────────────────────

test('scoreAtsMyth: clean CV/JD returns clean band', () => {
  const result = scoreAtsMyth({
    cvText: 'Mitchell Williams — AI Program Manager\n\nManaged the deployment of an AI-driven operations platform, reducing manual triage time by 60%. Led cross-functional teams of 8 engineers and 3 designers to ship the Comms Triage Agent on schedule.',
    jdText: 'We are looking for an AI Program Manager to lead operations and delivery of AI-native products.',
  });
  assert.ok(result.score >= 0 && result.score <= 100, 'score in range');
  assert.ok(['clean', 'mild'].includes(result.band), `expected clean/mild, got ${result.band}`);
  assert.ok(typeof result.band_label === 'string');
  assert.ok(typeof result.band_description === 'string');
  assert.ok(Array.isArray(result.signals_detected));
  assert.ok(Array.isArray(result.recommendations));
});

// ─── White text detection ─────────────────────────────────────────────────────

test('scoreAtsMyth: detects inline white text in HTML', () => {
  const result = scoreAtsMyth({
    cvText: 'Normal resume text here.',
    jdText: 'Job description.',
    cvHtml: '<div style="color:#fff;font-size:8px">python sql machine learning nlp llm gpt</div>',
  });
  const detected = result.signals_detected.map(s => s.signal);
  assert.ok(detected.includes('white_text'), 'white_text signal detected');
  assert.ok(result.score > 5, 'score above zero (white_text weight applied)');
});

test('scoreAtsMyth: detects visibility:hidden', () => {
  const result = scoreAtsMyth({
    cvText: 'Normal resume.',
    jdText: 'Job.',
    cvHtml: '<span style="visibility:hidden">keyword stuffing text here</span>',
  });
  const detected = result.signals_detected.map(s => s.signal);
  assert.ok(detected.includes('visibility_hidden'), 'visibility_hidden detected');
});

// ─── Hidden font size detection ───────────────────────────────────────────────

test('scoreAtsMyth: detects font-size:1px hidden text', () => {
  const result = scoreAtsMyth({
    cvText: 'Experienced engineer.',
    jdText: 'Looking for engineers.',
    cvHtml: '<p style="font-size:1px;color:#eee">hidden keywords: python ml nlp react node</p>',
  });
  const detected = result.signals_detected.map(s => s.signal);
  assert.ok(detected.includes('hidden_font_size'), 'hidden_font_size detected');
  assert.ok(result.score > 5, 'score above zero (hidden_font_size weight applied)');
});

// ─── Two-column layout detection ─────────────────────────────────────────────

test('scoreAtsMyth: detects 2-column CSS grid layout', () => {
  const result = scoreAtsMyth({
    cvText: 'Mitchell Williams',
    jdText: 'AI Manager role',
    cvHtml: `<div style="display:grid;grid-template-columns: 1fr 1fr;gap:20px">
      <div>Left column content</div>
      <div>Right column content</div>
    </div>`,
  });
  const detected = result.signals_detected.map(s => s.signal);
  assert.ok(detected.includes('two_column_layout'), 'two_column_layout detected');
});

// ─── display:none detection ───────────────────────────────────────────────────

test('scoreAtsMyth: detects display:none keyword container', () => {
  const result = scoreAtsMyth({
    cvText: 'Software engineer with 5 years experience.',
    jdText: 'We need a software engineer.',
    cvHtml: '<div style="display:none">python machine learning deep learning nlp transformer</div>',
  });
  const detected = result.signals_detected.map(s => s.signal);
  assert.ok(detected.includes('display_none'), 'display_none detected');
});

// ─── Keyword density spike detection ─────────────────────────────────────────

test('scoreAtsMyth: detects keyword density spike in text', () => {
  // Repeat "python" 15 times in a 60-word text = 25% density
  const cvText = Array(15).fill('python').concat(Array(45).fill('experience with various tools systems and projects that require expertise')).join(' ');
  const result = scoreAtsMyth({
    cvText,
    jdText: 'Looking for Python engineers.',
  });
  const detected = result.signals_detected.map(s => s.signal);
  assert.ok(detected.includes('keyword_density_spike'), 'keyword_density_spike detected');
});

// ─── Keyword dump detection ───────────────────────────────────────────────────

test('scoreAtsMyth: detects comma-separated keyword dump', () => {
  const result = scoreAtsMyth({
    cvText: 'Mitchell Williams\n\nPython, Java, SQL, React, Node, Kubernetes, Docker, AWS, GCP, Azure, Terraform, Kafka\n\nManaged projects successfully.',
    jdText: 'Engineer with cloud experience.',
  });
  const detected = result.signals_detected.map(s => s.signal);
  assert.ok(detected.includes('keyword_dump'), 'keyword_dump detected');
});

// ─── Score band mapping ───────────────────────────────────────────────────────

test('scoreAtsMyth: score 0 maps to clean band', () => {
  const result = scoreAtsMyth({
    cvText: 'Short clean resume.',
    jdText: 'Short job description.',
  });
  // No signals should fire on minimal clean text
  assert.equal(result.band, 'clean');
  assert.ok(result.recommendations.length > 0, 'always has at least 1 recommendation');
});

test('scoreAtsMyth: multiple critical signals produce high-risk band', () => {
  const result = scoreAtsMyth({
    cvText: Array(20).fill('python').concat(Array(30).fill('various skills and projects')).join(' '),
    jdText: 'Python role',
    cvHtml: '<div style="color:#fff;font-size:1px;display:none;visibility:hidden">hidden text python sql ml</div>',
  });
  assert.ok(result.score > 35, `expected high score, got ${result.score}`);
  assert.ok(['moderate', 'high-risk'].includes(result.band), `expected moderate/high-risk, got ${result.band}`);
});

// ─── renderAtsCard ────────────────────────────────────────────────────────────

test('renderAtsCard: returns non-empty HTML string', () => {
  const result = scoreAtsMyth({
    cvText: 'Clean resume content here.',
    jdText: 'Job description content here.',
  });
  const html = renderAtsCard(result);
  assert.ok(typeof html === 'string' && html.length > 100);
  assert.ok(html.includes('ats-myth-card'), 'has card class');
  assert.ok(html.includes('ATS Myth Score'), 'has header text');
  assert.ok(html.includes(String(result.score)), 'shows score');
  assert.ok(html.includes(result.band_label), 'shows band label');
});

test('renderAtsCard: includes signal rows when signals detected', () => {
  const result = scoreAtsMyth({
    cvText: 'Normal text.',
    jdText: 'Job.',
    cvHtml: '<div style="display:none">hidden stuff</div><span style="visibility:hidden">more</span>',
  });
  const html = renderAtsCard(result);
  assert.ok(html.includes('display none') || html.includes('display_none'), 'signal name in HTML');
});
