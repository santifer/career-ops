/**
 * lib/story-child-page.mjs — Per-story narrative child page renderer.
 *
 * Each "Story to Lead With" entry in any role drawer becomes a navigable
 * HTML child page with four sections:
 *
 *   1. Narrative — prose pulled from corpus (cv.md, article-digest.md,
 *      story-bank.md, voice-reference.md, interview-prep/*.md), anchored
 *      to the story; footnotes cite exact cv.md:L## ranges.
 *   2. Predicted Questions — 3-5 role + hmIntel-aware interview questions
 *      (LLM-generated via opts.llmClient or lib/council.mjs cheap path,
 *      cached 24h at data/strategy-cache/story-{rowId}-{storySlug}.json).
 *   3. Voice-Anchored Answer Frameworks — STAR+R structure per question,
 *      in Mitchell's voice.
 *   4. Remix Prompts — copy-paste-ready prompts for cover letter /
 *      why-statement / LinkedIn DM / Loom script using this story as anchor.
 *
 * Design principles (per DESIGN_PRINCIPLES.md):
 *   1. Scannability — 4 clearly demarcated sections, not prose walls
 *   2. Action proximity — remix prompts surfaced in section 4, ready to copy
 *   3. Strengths + limitations — answer frameworks show the STAR+R shape AND
 *      the gap/caveat (what might not land with this HM)
 *   4. Background transparency — cache path + hit/miss logged in return value
 *   5. Future-action awareness — remix prompts include next-step context
 *
 * Cost: ~$0.02/render via claude-haiku-4-5 cheap path, cached 24h.
 * Override LLM client in opts.llmClient for testing (no budget burn).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  renderChildPageHTML,
  fnRef,
  slugify,
} from './child-page-template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_DIR = join(REPO_ROOT, 'data', 'strategy-cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const DEFAULT_CHEAP_MODEL = 'anthropic:claude-haiku-4-5';

// ---------------------------------------------------------------------------
// Corpus readers — read corpus files; fall back gracefully if missing
// ---------------------------------------------------------------------------

function readCorpusFile(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Reads and bundles the voice corpus files for the story render.
 * Falls back gracefully for any missing file.
 *
 * @param {string} repoRoot
 * @param {object} [hmIntelPath] — path to hm-intel JSON, or null
 * @returns {{ cv: string, articleDigest: string, storyBank: string, voiceRef: string, hmIntel: object|null }}
 */
function readCorpus(repoRoot, hmIntelPath = null) {
  const cv = readCorpusFile(join(repoRoot, 'cv.md'));
  const articleDigest = readCorpusFile(join(repoRoot, 'article-digest.md'));
  const storyBank = readCorpusFile(join(repoRoot, 'interview-prep', 'story-bank.md'));
  const voiceRef = readCorpusFile(join(repoRoot, 'writing-samples', 'voice-reference.md'));

  let hmIntel = null;
  if (hmIntelPath) {
    try {
      const raw = readFileSync(hmIntelPath, 'utf-8');
      hmIntel = JSON.parse(raw);
    } catch {
      hmIntel = null;
    }
  }

  return { cv, articleDigest, storyBank, voiceRef, hmIntel };
}

/**
 * Resolve path to hm-intel JSON file for a given company + role slug.
 * Returns null if the file does not exist.
 *
 * @param {string} repoRoot
 * @param {string} companySlug
 * @param {string} roleSlug
 * @returns {string|null}
 */
function resolveHmIntelPath(repoRoot, companySlug, roleSlug) {
  const candidate = join(repoRoot, 'data', 'hm-intel', `${companySlug}-${roleSlug}.json`);
  return existsSync(candidate) ? candidate : null;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function cacheKey(rowId, storySlug) {
  return `story-${rowId}-${storySlug}`;
}

function cacheFilePath(key, cacheDir) {
  return join(cacheDir || CACHE_DIR, `${key}.json`);
}

function readCache(key, cacheDir) {
  const path = cacheFilePath(key, cacheDir);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if (!raw.ts || Date.now() - raw.ts > CACHE_TTL_MS) return null;
    return raw.data;
  } catch {
    return null;
  }
}

function writeCache(key, data, cacheDir) {
  const dir = cacheDir || CACHE_DIR;
  mkdirSync(dir, { recursive: true });
  writeFileSync(cacheFilePath(key, dir), JSON.stringify({ ts: Date.now(), data }, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// LLM generation — predicted questions + STAR+R frameworks
// ---------------------------------------------------------------------------

/**
 * Calls the LLM to generate predicted questions + STAR+R frameworks.
 * Uses opts.llmClient if provided (for testing), else falls back to
 * lib/council.mjs callCouncil on the cheap claude-haiku-4-5 path.
 *
 * @param {object} params
 * @param {object} params.story — { name, context, anchor_cv_refs }
 * @param {string} params.role — role title
 * @param {string} params.company — company name
 * @param {object|null} params.hmIntel — parsed hm-intel JSON, or null
 * @param {string} params.corpusSnippet — truncated corpus context
 * @param {Function} [params.llmClient] — optional mock: async (prompt) => { questions, frameworks }
 * @returns {Promise<{ questions: string[], frameworks: string[], cacheHit: boolean }>}
 */
async function generateQuestionsAndFrameworks({
  story,
  role,
  company,
  hmIntel,
  corpusSnippet,
  llmClient,
}) {
  // ---------------------------------------------------------------------------
  // HM-intel-aware prompt enrichment (Wave G3 / story-hm-intel)
  // ---------------------------------------------------------------------------
  // When hmIntel is present, the prompt gains three enrichment blocks:
  //   A. Signal calibration  — calibrate questions to the HM's specific focus
  //      areas (Python depth, system design, cross-functional credibility, etc.)
  //   B. Lead with what matters — answer frameworks lead with the dimension the
  //      HM most values per their LinkedIn posts, podcast picks, or research
  //   C. Remix tailoring — explicit cover-letter / why-statement instructions
  //      that reflect the HM's publicly demonstrated preferences
  // When hmIntel is absent the prompt falls back to a generic role-shape variant.
  // ---------------------------------------------------------------------------

  let hmContext = '';
  let hmSignalBlock = '';
  let hmRemixTailoringBlock = '';

  if (hmIntel) {
    const hmSnippet = JSON.stringify(hmIntel, null, 2).slice(0, 1600);

    // A: Signal calibration — extract priority keywords/themes from hmIntel
    const priorityKeywords = (hmIntel.top_third_priority_keywords || []).slice(0, 6);
    const hmName = hmIntel.name || hmIntel.hm_name || 'the hiring manager';
    const hmLinkedinPosts = (hmIntel.linkedin_posts_summary || hmIntel.public_signal || '').slice(0, 400);
    const hmDepthFocus = (hmIntel.technical_depth_focus || hmIntel.depth_focus || []).join(', ');
    const hmValuesDimension = hmIntel.top_value_dimension || hmIntel.values_dimension || '';

    hmContext = `\n\n## Hiring Manager Intel (calibrate all output to this)\n${hmSnippet}`;

    // B: Signal-calibrated question instructions
    if (priorityKeywords.length > 0 || hmDepthFocus) {
      const depthInstruction = hmDepthFocus
        ? `Include 1-2 questions probing ${hmDepthFocus} depth specifically — this HM's research signals a strong preference for candidates who can go deep here.`
        : '';
      const keywordInstruction = priorityKeywords.length > 0
        ? `Ensure at least one question connects to each of these HM priority keywords: ${priorityKeywords.join(', ')}.`
        : '';
      const postInstruction = hmLinkedinPosts
        ? `Context from their public presence: "${hmLinkedinPosts.trim()}" — calibrate tone and framing to match what this person publicly values.`
        : '';

      hmSignalBlock = [
        '## HM Signal Calibration (REQUIRED)',
        depthInstruction,
        keywordInstruction,
        postInstruction,
      ].filter(Boolean).join('\n');
    }

    // C: Remix tailoring instructions
    if (hmValuesDimension || hmLinkedinPosts) {
      const leadDimension = hmValuesDimension
        ? `LEAD every answer framework with the "${hmValuesDimension}" dimension since this is what this HM most values per their research profile.`
        : '';
      const coverLetterInstruction = hmLinkedinPosts
        ? `When writing the cover letter remix prompt, explicitly instruct the writer to open with the dimension the HM has publicly praised — not a generic hook.`
        : '';
      hmRemixTailoringBlock = [
        '## HM-Specific Remix Tailoring (REQUIRED)',
        leadDimension,
        coverLetterInstruction,
        `In the cover letter remix prompt, add: "Note: This HM's public presence signals strong appreciation for ${hmValuesDimension || 'technical depth and delivery velocity'} — lead there."`,
      ].filter(Boolean).join('\n');
    }
  }

  const genericCalibrationBlock = !hmIntel
    ? '## Calibration Note\nNo HM intel available for this role. Use generic role-shape calibration — questions should cover system design breadth, cross-functional leadership, and delivery velocity as the default signal cluster for senior IC/PgM roles.'
    : '';

  const prompt = `You are a career coach helping prepare for an interview at ${company} for the role of ${role}.

Story being led with: "${story.name}"
Context: ${story.context || '(none)'}
${hmContext}

Corpus snippet (CV + story bank excerpt):
${corpusSnippet.slice(0, 2000)}

${hmSignalBlock}
${hmRemixTailoringBlock}
${genericCalibrationBlock}

Generate exactly 4 interview questions a hiring manager at ${company} would likely ask based on this story and role${hmIntel ? ', calibrated to the HM signal patterns above' : ''}. Then provide a STAR+R (Situation, Task, Action, Result, Reflection) answer framework for each question${hmIntel ? ', leading each framework with the dimension the HM most values' : ''}, written in a direct, precise voice. Format as JSON:
{
  "questions": ["Q1", "Q2", "Q3", "Q4"],
  "frameworks": [
    "**Situation:** ...\n**Task:** ...\n**Action:** ...\n**Result:** ...\n**Reflection:** ...",
    ...
  ]
}
Return only valid JSON, no commentary.`;

  if (llmClient) {
    return { ...(await llmClient(prompt)), cacheHit: false };
  }

  // Real path: council.mjs on cheap claude-haiku-4-5
  const { callCouncil } = await import('./council.mjs');
  const { results } = await callCouncil({
    prompt,
    models: [DEFAULT_CHEAP_MODEL],
    opts: { temperature: 0 },
  });

  const result = results.find((r) => r.content && !r.error);
  if (!result) throw new Error('story-child-page: LLM call returned no content');

  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('story-child-page: LLM response contained no JSON');

  const parsed = JSON.parse(jsonMatch[0]);
  return { questions: parsed.questions || [], frameworks: parsed.frameworks || [], cacheHit: false };
}

// ---------------------------------------------------------------------------
// Remix prompts — copy-paste-ready prompts for 4 channels
// ---------------------------------------------------------------------------

/**
 * @param {object} story
 * @param {string} role
 * @param {string} company
 * @param {object|null} [hmIntel] — optional; adds HM-specific tailoring instructions
 */
function buildRemixPrompts(story, role, company, hmIntel = null) {
  const anchor = `"${story.name}"`;

  // HM-specific tailoring suffix for cover letter and why-statement
  const hmName = hmIntel ? (hmIntel.name || hmIntel.hm_name || null) : null;
  const hmValuesDimension = hmIntel
    ? (hmIntel.top_value_dimension || hmIntel.values_dimension || null)
    : null;
  const hmLinkedinPosts = hmIntel
    ? (hmIntel.linkedin_posts_summary || hmIntel.public_signal || null)
    : null;

  let hmCoverLetterSuffix = '';
  let hmWhySuffix = '';
  if (hmIntel) {
    const hmRef = hmName ? ` Note: the likely reviewer${hmName ? ` (${hmName})` : ''} has` : ' Note: HM intel signals';
    if (hmValuesDimension) {
      hmCoverLetterSuffix = `${hmRef} publicly emphasized "${hmValuesDimension}" — lead the cover letter with the dimension that most directly demonstrates this rather than a generic hook.`;
      hmWhySuffix = `${hmRef} publicly emphasized "${hmValuesDimension}" — connect Mitchell's answer explicitly to this theme.`;
    } else if (hmLinkedinPosts) {
      hmCoverLetterSuffix = `${hmRef} the following public interests: "${hmLinkedinPosts.slice(0, 200).trim()}…" — reflect this in the opening hook.`;
    }
  }

  return [
    {
      channel: 'Cover Letter',
      prompt: `Write a 4-paragraph cover letter opening for a ${role} application at ${company}. Lead with the story ${anchor} as the hook. Use direct, precise prose — no filler phrases.${hmCoverLetterSuffix ? ' ' + hmCoverLetterSuffix : ''}`,
    },
    {
      channel: 'Why Statement',
      prompt: `Write a 2-sentence "Why ${company}?" statement grounded in the story ${anchor}. Make it specific — connect what the story demonstrated to what ${company} is building right now.${hmWhySuffix ? ' ' + hmWhySuffix : ''}`,
    },
    {
      channel: 'LinkedIn DM',
      prompt: `Write a 3-sentence LinkedIn DM to a ${company} hiring manager or recruiter. Reference the story ${anchor} naturally without being self-promotional. End with a specific ask (15-min call, open to chat, etc.).`,
    },
    {
      channel: 'Loom Script',
      prompt: `Write a 60-second Loom intro script for a ${role} application to ${company}, using the story ${anchor} as the narrative spine. Structure: hook (5s) → story beat (30s) → specific value prop for ${company} (15s) → CTA (10s).`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildNarrativeSection(story, corpus, footnotes) {
  const { cv, articleDigest, storyBank } = corpus;

  // Find relevant corpus lines for the story
  const storyName = story.name || '';
  const cvLines = cv.split('\n');

  // Look for anchor refs in cv
  const anchorRefs = (story.anchor_cv_refs || []).map((ref) => {
    const lineNum = typeof ref === 'number' ? ref : null;
    if (lineNum) {
      const line = cvLines[lineNum - 1] || '';
      return { line: lineNum, text: line.trim() };
    }
    return null;
  }).filter(Boolean);

  // Build narrative prose
  const contextText = story.context || `This story demonstrates ${storyName}.`;
  const noteId = 'cv-anchor';
  let refMarker = '';

  if (anchorRefs.length > 0) {
    footnotes.push({
      id: noteId,
      text: `CV anchor for "${storyName}"`,
      refs: anchorRefs.map((r) => ({ file: 'cv.md', lineStart: r.line, lineEnd: r.line })),
    });
    refMarker = fnRef(noteId, footnotes.length);
  }

  // Check article-digest for matching content
  const digestSnippet = articleDigest
    ? articleDigest.split('\n').find((l) => l.toLowerCase().includes(storyName.toLowerCase().split(' ')[0]))
    : null;

  const digestHtml = digestSnippet
    ? `<blockquote style="margin:1em 0;padding:0.75em 1em;border-left:3px solid var(--accent);background:var(--surface);border-radius:0 var(--radius-sm) var(--radius-sm) 0;font-size:var(--fs-body);color:var(--text-2)">${escapeHtml(digestSnippet.replace(/^[-*]\s*/, ''))}</blockquote>`
    : '';

  const storyBankSnippet = extractStoryBankEntry(storyBank, storyName);
  const storyBankHtml = storyBankSnippet
    ? `<details style="margin-top:var(--space-3)">
        <summary style="cursor:pointer;font-weight:600;font-size:var(--fs-body);color:var(--text-2)">Story bank entry</summary>
        <pre style="font-family:var(--font-mono);font-size:var(--fs-caption);white-space:pre-wrap;color:var(--text-3);margin:var(--space-2) 0 0">${escapeHtml(storyBankSnippet)}</pre>
       </details>`
    : '';

  const body = `<p>${escapeHtml(contextText)}${refMarker}</p>
${digestHtml}
${storyBankHtml}`;

  return { heading: 'Narrative', body, kind: 'card' };
}

/**
 * @param {string[]} questions
 * @param {object|null} hmIntel — the full hmIntel object (used for refreshed_at)
 */
function buildQuestionsSection(questions, hmIntel) {
  const hmIntelPresent = !!hmIntel;
  let hmNote;
  if (hmIntelPresent) {
    const refreshedAt = hmIntel.refreshed_at || hmIntel.snapshot_date || null;
    const snapshotNote = refreshedAt
      ? `Calibrated to HM intel snapshot from <time datetime="${escapeHtml(refreshedAt)}">${escapeHtml(refreshedAt)}</time>.`
      : 'Calibrated to hiring manager signal patterns.';
    hmNote = `<p style="font-size:var(--fs-caption);color:var(--green-fg);margin:0 0 var(--space-3)">${snapshotNote}</p>`;
  } else {
    hmNote = '<p style="font-size:var(--fs-caption);color:var(--text-4);margin:0 0 var(--space-3)">Generic role-shape calibration (no HM intel cached).</p>';
  }

  const qList = questions
    .map((q, i) => `<li><strong>${i + 1}.</strong> ${escapeHtml(q)}</li>`)
    .join('\n');

  const body = `${hmNote}<ol style="padding-left:var(--space-5);color:var(--text-2);line-height:var(--lh-relaxed)">${qList}</ol>`;
  return { heading: 'Predicted Questions', body, kind: 'list' };
}

function buildFrameworksSection(questions, frameworks) {
  const pairs = questions.map((q, i) => {
    const fw = frameworks[i] || '(framework unavailable)';
    // Convert **bold** markdown to <strong>
    const fwHtml = fw
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    return `<div style="margin-bottom:var(--space-5);padding:var(--space-3) var(--space-4);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)">
  <p style="font-weight:600;color:var(--text-2);margin:0 0 var(--space-2);font-size:var(--fs-body)">${escapeHtml(q)}</p>
  <div style="font-size:var(--fs-body);color:var(--text-3);line-height:var(--lh-relaxed)">${fwHtml}</div>
</div>`;
  });

  const body = pairs.join('\n');
  return { heading: 'Voice-Anchored Answer Frameworks', body };
}

function buildRemixSection(remixPrompts) {
  const cards = remixPrompts.map((p) => {
    const textareaId = `remix-${slugify(p.channel)}`;
    return `<div style="margin-bottom:var(--space-4)">
  <label for="${textareaId}" style="display:block;font-size:var(--fs-meta);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-4);margin-bottom:var(--space-1)">${escapeHtml(p.channel)}</label>
  <textarea id="${textareaId}" readonly style="width:100%;min-height:80px;padding:var(--space-2) var(--space-3);font-family:var(--font-mono);font-size:var(--fs-caption);color:var(--text-2);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);resize:vertical;line-height:var(--lh-relaxed)">${escapeHtml(p.prompt)}</textarea>
</div>`;
  });

  const body = `<p style="font-size:var(--fs-caption);color:var(--text-3);margin:0 0 var(--space-4)">Copy any prompt into your preferred AI assistant, or use it as a brief for your own writing.</p>
${cards.join('\n')}`;

  return { heading: 'Remix Prompts', body, kind: 'card' };
}

// ---------------------------------------------------------------------------
// Main export: renderStoryChildPage
// ---------------------------------------------------------------------------

/**
 * Renders a full story child page HTML file.
 *
 * @param {object} params
 * @param {object} params.story — { name: string, context?: string, anchor_cv_refs?: number[] }
 * @param {string} params.role — job title
 * @param {string} params.company — company name
 * @param {string|number} params.rowId — application tracker row ID
 * @param {object} [params.hmIntel] — parsed hm-intel data (optional; falls back if not provided)
 * @param {object} [params.voiceCorpus] — pre-loaded corpus object (optional; reads from disk if not provided)
 * @param {object} [params.opts]
 * @param {Function} [params.opts.llmClient] — async (prompt: string) => { questions: string[], frameworks: string[] }
 * @param {string} [params.opts.repoRoot] — override repo root (for testing)
 * @param {boolean} [params.opts.dryRun] — skip LLM call, use placeholder content
 * @returns {Promise<{ html: string, path: string, cacheHit: boolean }>}
 */
export async function renderStoryChildPage({
  story,
  role,
  company,
  rowId,
  hmIntel = null,
  voiceCorpus = null,
  opts = {},
} = {}) {
  if (!story?.name) throw new Error('renderStoryChildPage: story.name is required');
  if (!role) throw new Error('renderStoryChildPage: role is required');
  if (!company) throw new Error('renderStoryChildPage: company is required');
  if (rowId == null) throw new Error('renderStoryChildPage: rowId is required');

  const repoRoot = opts.repoRoot || REPO_ROOT;
  const cacheDir = join(repoRoot, 'data', 'strategy-cache');
  const companySlug = slugify(company);
  const roleSlug = slugify(role);
  const storySlug = slugify(story.name);
  const key = cacheKey(rowId, storySlug);

  // Load corpus from disk unless pre-supplied
  let corpus = voiceCorpus;
  if (!corpus) {
    const hmIntelPath = hmIntel
      ? null // already provided
      : resolveHmIntelPath(repoRoot, companySlug, roleSlug);

    corpus = readCorpus(repoRoot, hmIntelPath);

    // If hmIntel wasn't passed in, use the one from disk (may be null)
    if (!hmIntel && corpus.hmIntel) {
      hmIntel = corpus.hmIntel;
    }
  }

  // Corpus snippet for LLM prompt
  const corpusSnippet = [
    corpus.cv.slice(0, 800),
    corpus.storyBank.slice(0, 600),
  ].filter(Boolean).join('\n\n---\n\n');

  // LLM call — check cache first
  let questions, frameworks, cacheHit;
  const cached = readCache(key, cacheDir);

  if (cached) {
    questions = cached.questions;
    frameworks = cached.frameworks;
    cacheHit = true;
  } else if (opts.dryRun) {
    questions = [
      `How have you approached ${story.name} in a fast-moving environment?`,
      `Walk me through a time when ${story.name} required cross-functional alignment.`,
      `What would you do differently now, knowing what you know?`,
      `How does ${story.name} connect to your work at ${company}?`,
    ];
    frameworks = questions.map((q) =>
      `**Situation:** [Brief context for ${story.name}]\n**Task:** [What needed to happen]\n**Action:** [Specific steps taken]\n**Result:** [Quantified or described outcome]\n**Reflection:** [What this says about your approach — connects to ${company}'s context]`
    );
    cacheHit = false;
  } else {
    const result = await generateQuestionsAndFrameworks({
      story,
      role,
      company,
      hmIntel,
      corpusSnippet,
      llmClient: opts.llmClient,
    });
    questions = result.questions;
    frameworks = result.frameworks;
    cacheHit = result.cacheHit;
    writeCache(key, { questions, frameworks }, cacheDir);
  }

  // Build footnotes array (populated by section builders)
  const footnotes = [];

  // Build sections
  const narrativeSection = buildNarrativeSection(story, corpus, footnotes);
  const questionsSection = buildQuestionsSection(questions, hmIntel);
  const frameworksSection = buildFrameworksSection(questions, frameworks);
  const remixSection = buildRemixSection(buildRemixPrompts(story, role, company, hmIntel));

  // Side nav anchors
  const side_nav = [
    { label: 'Narrative', href: '#section-0-narrative' },
    { label: 'Predicted Questions', href: '#section-1-predicted-questions' },
    { label: 'Answer Frameworks', href: '#section-2-voice-anchored-answer-frameworks' },
    { label: 'Remix Prompts', href: '#section-3-remix-prompts' },
  ];

  // Breadcrumbs
  const breadcrumbs = [
    { label: 'Dashboard', href: '/' },
    { label: `${company} — Row ${rowId}`, href: `/?row=${rowId}` },
    { label: 'Stories', href: '#' },
  ];

  const html = renderChildPageHTML({
    title: story.name,
    sections: [narrativeSection, questionsSection, frameworksSection, remixSection],
    footnotes,
    side_nav,
    breadcrumbs,
  });

  // Determine output path
  const applyPackDir = join(
    repoRoot,
    'data',
    'apply-packs',
    `${rowId}-${companySlug}`,
    'stories'
  );
  const outPath = join(applyPackDir, `${storySlug}.html`);

  return { html, path: outPath, cacheHit };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractStoryBankEntry(storyBank, storyName) {
  if (!storyBank) return null;
  const lines = storyBank.split('\n');
  const nameFirst = storyName.toLowerCase().split(' ')[0];
  const startIdx = lines.findIndex((l) =>
    l.toLowerCase().includes(nameFirst) && (l.startsWith('#') || l.startsWith('**'))
  );
  if (startIdx === -1) return null;

  const entry = [];
  for (let i = startIdx; i < Math.min(startIdx + 15, lines.length); i++) {
    if (i > startIdx && (lines[i].startsWith('#') || lines[i].startsWith('**')) && lines[i] !== lines[startIdx]) break;
    entry.push(lines[i]);
  }
  return entry.join('\n').trim() || null;
}
