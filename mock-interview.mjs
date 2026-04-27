#!/usr/bin/env node
/**
 * mock-interview.mjs — Voice-based mock interview server
 *
 * Boots a local HTTP server on 127.0.0.1:{port} and opens the browser to the
 * mock-interview web app. The browser handles mic capture (Web Speech API) and
 * audio playback. This server proxies the Anthropic API (interviewer brain)
 * and ElevenLabs (voice synthesis), and keeps API keys off the client.
 *
 * Reads:
 *   cv.md, config/profile.yml, modes/_profile.md, article-digest.md,
 *   interview-prep/story-bank.md, reports/*.md, interview-prep/{slug}.md
 *
 * Writes:
 *   interview-prep/sessions/{date}-{slug}.md   (transcripts + coach reports)
 *   interview-prep/story-bank.md               (when user promotes a story)
 *
 * Usage:
 *   node mock-interview.mjs            # boot and open browser
 *   node mock-interview.mjs --check    # boot, hit /api/config, exit (smoke test)
 *   node mock-interview.mjs --no-open  # boot but don't open browser
 *
 * Env (.env):
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   ELEVENLABS_API_KEY=...
 *
 * See modes/mock-interview.md for the behavioral spec.
 */

import http from 'node:http';
import { readFile, writeFile, readdir, mkdir, appendFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import dotenv from 'dotenv';
import yaml from 'js-yaml';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);
const WEB_ROOT = path.join(ROOT, 'web', 'mock-interview');
const SESSIONS_DIR = path.join(ROOT, 'interview-prep', 'sessions');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';

// In-memory session store. Resets when the process restarts.
const sessions = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Profile + context loading
// ─────────────────────────────────────────────────────────────────────────────

async function readIfExists(p) {
  try { return await readFile(p, 'utf8'); } catch { return null; }
}

async function loadProfile() {
  const raw = await readIfExists(path.join(ROOT, 'config', 'profile.yml'));
  if (!raw) return {};
  try { return yaml.load(raw) || {}; } catch (e) {
    console.warn('[mock] profile.yml parse error:', e.message);
    return {};
  }
}

function defaults(profile) {
  const m = profile?.mock_interview || {};
  return {
    voice_track: m.voice_track || 'diy',
    default_persona: m.default_persona || 'tough',
    default_feedback_mode: m.default_feedback_mode || 'in_character',
    default_voice_id: m.default_voice_id || '',
    default_duration_minutes: m.default_duration_minutes || 25,
    port: m.port || 3737,
    language: profile?.language?.modes_dir
      ? profile.language.modes_dir.replace(/^modes\//, '') || 'en'
      : 'en',
  };
}

async function loadCandidateContext() {
  const cv = await readIfExists(path.join(ROOT, 'cv.md'));
  const profileRaw = await readIfExists(path.join(ROOT, 'config', 'profile.yml'));
  const profileMd = await readIfExists(path.join(ROOT, 'modes', '_profile.md'));
  const articleDigest = await readIfExists(path.join(ROOT, 'article-digest.md'));
  const storyBank = await readIfExists(path.join(ROOT, 'interview-prep', 'story-bank.md'));
  return { cv, profileRaw, profileMd, articleDigest, storyBank };
}

async function listTargets() {
  const reportsDir = path.join(ROOT, 'reports');
  const out = [];
  try {
    const files = await readdir(reportsDir);
    for (const f of files.sort()) {
      if (!f.endsWith('.md') || f.startsWith('.')) continue;
      // Filename: NNN-{slug}-{YYYY-MM-DD}.md
      const m = f.match(/^(\d{3})-(.+)-(\d{4}-\d{2}-\d{2})\.md$/);
      if (!m) continue;
      const [, num, slug, date] = m;
      const fp = path.join(reportsDir, f);
      const content = await readIfExists(fp);
      let company = slug, role = '', score = '';
      if (content) {
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          // Strip common evaluation-prefix labels in EN/ES/FR/DE/JA before splitting.
          const cleaned = titleMatch[1]
            .replace(/^\s*(Evaluation|Evaluación|Évaluation|Evaluierung|評価)\s*:\s*/i, '')
            .trim();
          // Try "Company — Role" pattern
          const parts = cleaned.split(/[—-]/).map(s => s.trim()).filter(Boolean);
          if (parts.length >= 2) { company = parts[0]; role = parts.slice(1).join(' — '); }
          else company = cleaned;
        }
        const scoreMatch = content.match(/\*\*Score:\*\*\s*([\d.]+)/i);
        if (scoreMatch) score = scoreMatch[1];
      }
      out.push({ id: f.replace(/\.md$/, ''), num, slug, date, company, role, score, file: fp });
    }
  } catch { /* no reports/ dir */ }
  return out;
}

async function loadTargetContext(targetId) {
  if (!targetId) return null;
  const fp = path.join(ROOT, 'reports', `${targetId}.md`);
  const report = await readIfExists(fp);
  if (!report) return null;
  // Extract Block A (Role Summary) and Block F (Interview Plan)
  const blockA = extractBlock(report, /##\s+Block A[^\n]*/i, /\n##\s+Block [BCDEFG]/i);
  const blockF = extractBlock(report, /##\s+Block F[^\n]*/i, /\n##\s+Block [G-Z]/i);
  // Try to find a matching company-specific intel file
  const m = targetId.match(/^\d{3}-(.+)-\d{4}-\d{2}-\d{2}$/);
  const slug = m ? m[1] : targetId;
  const intelFp = await findIntelFile(slug);
  const intel = intelFp ? await readIfExists(intelFp) : null;
  return { reportPath: fp, report, blockA, blockF, intel, intelPath: intelFp };
}

async function findIntelFile(slug) {
  const dir = path.join(ROOT, 'interview-prep');
  try {
    const files = await readdir(dir);
    // slug looks like "company-role"; intel files look like "company-role.md"
    // Match by leading company token.
    const company = slug.split('-')[0];
    const candidate = files.find(f =>
      f.endsWith('.md') &&
      f !== 'story-bank.md' &&
      (f.replace(/\.md$/, '') === slug || f.startsWith(company + '-'))
    );
    return candidate ? path.join(dir, candidate) : null;
  } catch { return null; }
}

function extractBlock(text, startRe, endRe) {
  const start = text.search(startRe);
  if (start < 0) return null;
  const after = text.slice(start);
  const endIdx = after.slice(1).search(endRe);
  return endIdx < 0 ? after.trim() : after.slice(0, endIdx + 1).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Persona + feedback + system prompt
// ─────────────────────────────────────────────────────────────────────────────

const PERSONAS = {
  tough: 'A skeptical senior. You probe weaknesses. You ask "and then what?" until the candidate hits the actual root cause. You do not flatter. You give the candidate space to recover but you do not rescue them.',
  friendly: 'A warm screener. You make small talk briefly, you keep the conversation flowing, you find positives in answers and use them as bridges to the next topic. You are not a pushover; you still ask the hard questions, but with a smile.',
  technical: 'A senior IC. You drill into code, system design, and tradeoffs. You ask "why did you pick X over Y?" and "what would break first under load?". You are comfortable with silence while the candidate thinks.',
  executive: 'A strategic hiring manager. You optimize for judgment and impact. You ask about ambiguity, prioritization, and what the candidate would do in their first 90 days. You are time-conscious; you steer firmly when answers wander.',
};

const FEEDBACK_BLOCKS = {
  in_character: 'Stay fully in character through wrap-up. Do not give feedback inside the interview itself. The post-call analysis happens after the call ends.',
  coach_mode: 'Stay in character verbally. After each candidate answer, in addition to your spoken response, append a single coaching note as a JSON line on a new line at the very end of your response, prefixed with `<<COACH>>`. Example: `<<COACH>> {"strength":"Strong STAR Action","weakness":"Result was vague","tip":"State a metric"}`. The note must be 30 words or less. The frontend will strip this line from the spoken audio and show it as a sidebar pop-up.',
  break_character: 'When the candidate gives a notably weak or strong answer, briefly step out of character and say so before resuming. Use the literal opener "Quick coaching note:" at the start of the break, and "Back to the interview." when you resume. Use sparingly — at most once per 3-4 answers.',
};

const LANGUAGE_NAMES = {
  en: 'English', de: 'German', fr: 'French', ja: 'Japanese', es: 'Spanish',
  pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', ko: 'Korean',
};

function buildSystemPrompt({
  cfg, candidate, target, role, company, industry, persona, customPersona,
  interviewType, feedbackMode, durationMinutes, language,
}) {
  const personaText = persona === 'custom'
    ? (customPersona || 'A balanced interviewer.')
    : (PERSONAS[persona] || PERSONAS.tough);
  const feedbackText = FEEDBACK_BLOCKS[feedbackMode] || FEEDBACK_BLOCKS.in_character;
  const languageName = LANGUAGE_NAMES[language] || 'English';

  const parts = [];
  parts.push(`You are conducting a ${interviewType.replace(/-/g, ' ')} interview for the role of ${role || 'the role'} at ${company || 'the company'}${industry ? ` (${industry} industry)` : ''}.`);
  parts.push(`Your persona is: ${personaText}`);
  parts.push(`The interview should last roughly ${durationMinutes} minutes.`);
  parts.push(`Conduct the interview in ${languageName}.`);
  parts.push('');
  parts.push('You have full context on the candidate:');
  if (candidate.cv) parts.push(`<candidate_cv>\n${candidate.cv}\n</candidate_cv>`);
  if (candidate.profileRaw) parts.push(`<candidate_profile>\n${candidate.profileRaw}\n</candidate_profile>`);
  if (candidate.profileMd) parts.push(`<candidate_profile_narrative>\n${candidate.profileMd}\n</candidate_profile_narrative>`);
  if (candidate.articleDigest) parts.push(`<candidate_proof_points>\n${candidate.articleDigest}\n</candidate_proof_points>`);
  if (candidate.storyBank) parts.push(`<candidate_story_bank>\n${candidate.storyBank}\n</candidate_story_bank>`);
  if (target?.intel) parts.push(`<company_intel>\n${target.intel}\n</company_intel>`);
  if (target?.blockA) parts.push(`<role_summary>\n${target.blockA}\n</role_summary>`);
  if (target?.blockF) parts.push(`<interview_plan>\n${target.blockF}\n</interview_plan>`);
  parts.push('');
  parts.push('== HOW TO CONDUCT THIS INTERVIEW ==');
  parts.push('1. Greet the candidate by name (from profile). Briefly state your name (invent a consistent one), your fictional role at the company, and the planned format.');
  parts.push('2. Open with a warm-up question appropriate to the interview type.');
  parts.push('3. Probe specifics. The candidate has detailed proof points and stories — surface them. If they make a claim, ask "what was the metric?" or "what would you do differently?" or "who pushed back?".');
  parts.push('4. Stay in character. Do not break the fourth wall, do not narrate that you are an AI.');
  parts.push('5. Keep turns short. One question at a time. Let silence work.');
  parts.push('6. Allow the candidate to ask questions of you near the end.');
  parts.push('7. When the duration target is reached, wrap professionally: thank them, explain the (fictional) next steps, close.');
  parts.push('');
  parts.push(`== FEEDBACK MODE: ${feedbackMode} ==`);
  parts.push(feedbackText);
  parts.push('');
  parts.push('== OUTPUT FORMAT ==');
  parts.push('Respond with plain spoken text only. No markdown, no stage directions in asterisks, no bullet points, no headings. Speak the way a human interviewer speaks on a phone call. Keep each turn to 1-3 sentences unless the candidate asks you to elaborate. The current turn begins now: greet the candidate and ask your first question.');
  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic
// ─────────────────────────────────────────────────────────────────────────────

async function callAnthropic({ system, messages, maxTokens = 600 }) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set in .env');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Anthropic ${r.status}: ${err}`);
  }
  const data = await r.json();
  const text = (data.content || []).map(b => b.text || '').join('').trim();
  return text;
}

function splitCoachNote(text) {
  // Look for `<<COACH>> {...}` on its own line at the end.
  const m = text.match(/\n*<<COACH>>\s*(\{[\s\S]*?\})\s*$/);
  if (!m) return { speech: text, coach: null };
  const speech = text.slice(0, m.index).trim();
  let coach = null;
  try { coach = JSON.parse(m[1]); } catch { coach = { raw: m[1] }; }
  return { speech, coach };
}

// ─────────────────────────────────────────────────────────────────────────────
// ElevenLabs
// ─────────────────────────────────────────────────────────────────────────────

let voicesCache = null;
async function listVoices() {
  if (voicesCache) return voicesCache;
  if (!ELEVENLABS_API_KEY) return [];
  const r = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
  });
  if (!r.ok) return [];
  const data = await r.json();
  voicesCache = (data.voices || []).map(v => ({
    voice_id: v.voice_id,
    name: v.name,
    labels: v.labels || {},
    preview_url: v.preview_url || null,
  }));
  return voicesCache;
}

async function synthesizeSpeech({ text, voiceId }) {
  if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set in .env');
  if (!voiceId) throw new Error('voiceId required');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'content-type': 'application/json',
      'accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`ElevenLabs ${r.status}: ${err}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

// ─────────────────────────────────────────────────────────────────────────────
// Session lifecycle
// ─────────────────────────────────────────────────────────────────────────────

async function startSession(opts) {
  const profile = await loadProfile();
  const cfg = defaults(profile);
  const candidate = await loadCandidateContext();
  const target = opts.targetId ? await loadTargetContext(opts.targetId) : null;
  const sysPrompt = buildSystemPrompt({
    cfg, candidate, target,
    role: opts.role || (target?.blockA ? extractRoleFromBlockA(target.blockA) : ''),
    company: opts.company || (opts.targetId ? slugToCompany(opts.targetId) : ''),
    industry: opts.industry || '',
    persona: opts.persona || cfg.default_persona,
    customPersona: opts.customPersona || '',
    interviewType: opts.interviewType || 'phone-screen',
    feedbackMode: opts.feedbackMode || cfg.default_feedback_mode,
    durationMinutes: opts.durationMinutes || cfg.default_duration_minutes,
    language: opts.language || cfg.language || 'en',
  });

  const sessionId = randomUUID();
  const session = {
    id: sessionId,
    createdAt: new Date().toISOString(),
    opts: { ...opts, voiceTrack: opts.voiceTrack || cfg.voice_track },
    systemPrompt: sysPrompt,
    history: [],   // Anthropic-format messages
    transcript: [], // [{role: 'interviewer'|'candidate', text, ts}]
    target,
    candidateName: extractCandidateName(candidate.profileRaw) || 'Candidate',
  };
  sessions.set(sessionId, session);

  // Generate the opener immediately
  const opener = await callAnthropic({
    system: sysPrompt,
    messages: [{ role: 'user', content: '[The candidate has just picked up the phone.]' }],
    maxTokens: 250,
  });
  const { speech, coach } = splitCoachNote(opener);
  session.history.push({ role: 'user', content: '[The candidate has just picked up the phone.]' });
  session.history.push({ role: 'assistant', content: opener });
  session.transcript.push({ role: 'interviewer', text: speech, ts: new Date().toISOString() });

  return { sessionId, openingTurn: { speech, coach } };
}

function extractCandidateName(profileYaml) {
  if (!profileYaml) return null;
  const m = profileYaml.match(/full_name:\s*"?([^"\n]+)"?/);
  return m ? m[1].trim() : null;
}

function extractRoleFromBlockA(blockA) {
  // Block A is a free-form table; just look for "Seniority" or fall back.
  const m = blockA.match(/role|position|title/i);
  return m ? '' : '';
}

function slugToCompany(targetId) {
  // "042-acme-staff-eng-2026-04-26" → "Acme"
  const m = targetId.match(/^\d{3}-([^-]+)/);
  if (!m) return '';
  return m[1].charAt(0).toUpperCase() + m[1].slice(1);
}

async function takeTurn(sessionId, candidateText) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('session not found');
  s.history.push({ role: 'user', content: candidateText });
  s.transcript.push({ role: 'candidate', text: candidateText, ts: new Date().toISOString() });
  const reply = await callAnthropic({ system: s.systemPrompt, messages: s.history, maxTokens: 500 });
  s.history.push({ role: 'assistant', content: reply });
  const { speech, coach } = splitCoachNote(reply);
  s.transcript.push({ role: 'interviewer', text: speech, ts: new Date().toISOString() });
  return { speech, coach };
}

async function endSession(sessionId, actualMinutes) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('session not found');

  const transcriptText = s.transcript
    .map(t => `${t.role === 'interviewer' ? 'INTERVIEWER' : 'CANDIDATE'}: ${t.text}`)
    .join('\n\n');

  const rubricSystem = `You are an interview coach. Score this candidate's mock interview against the rubric below. Be direct and specific. Cite exact lines from the transcript when noting a strength or a weakness.

Rubric (1-5 each):
- Communication clarity
- STAR+R structure (concrete Situation/Task/Action/Result + Reflection)
- Specificity (real metrics, named systems, named stakeholders vs. vague language)
- Role/archetype fit (signal of seniority and archetype-relevant experience)
- Cultural signals (curiosity, ownership, humility, collaboration)
- Self-awareness (acknowledges tradeoffs and what they'd do differently)

Output structure (markdown):
1. Overall score (X.X/5)
2. Per-dimension scores in a table
3. Top 3 strengths (each with a quoted line from the transcript)
4. Top 3 weaknesses (each with a quoted line and a concrete fix)
5. ## New Stories Pending — for each strong story the candidate told that is NOT already in the candidate's story bank, draft a STAR+R entry ready to append. Use this exact format for each story:

\`\`\`
### [Theme] Story Title
**Source:** Mock Interview {DATE} — {COMPANY} — {ROLE}
**S (Situation):** ...
**T (Task):** ...
**A (Action):** ...
**R (Result):** ...
**Reflection:** ...
**Best for questions about:** ...
\`\`\`

6. ## Stories to Develop — for each likely-question topic the candidate stumbled on, suggest the experience from their CV they should turn into a story
7. ## Recommended Next Prep — 3 bullets max, concrete actions
`;

  const candidate = await loadCandidateContext();
  const userMsg = `<candidate_cv>\n${candidate.cv || ''}\n</candidate_cv>\n\n<existing_story_bank>\n${candidate.storyBank || '(empty)'}\n</existing_story_bank>\n\n<transcript>\n${transcriptText}\n</transcript>`;

  const report = await callAnthropic({
    system: rubricSystem,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 3000,
  });

  // Parse "New Stories Pending" blocks for the promote-story endpoint
  const newStories = parseNewStories(report);
  s.coachReport = report;
  s.newStories = newStories;
  s.actualMinutes = actualMinutes;

  // Write session file
  const meta = s.opts;
  const date = s.createdAt.slice(0, 10);
  const company = (meta.company || (s.target ? slugToCompany(meta.targetId) : 'Generic')).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'generic';
  const role = (meta.role || 'role').replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '');
  const fname = `${date}-${company}-${role}.md`;
  const fp = path.join(SESSIONS_DIR, fname);
  await mkdir(SESSIONS_DIR, { recursive: true });

  const scoreMatch = report.match(/(\d\.\d)\s*\/\s*5/);
  const score = scoreMatch ? scoreMatch[1] : '?';

  const fileBody = `# Mock Interview — ${meta.company || 'Generic'} — ${meta.role || ''}

**Date:** ${date}
**Persona:** ${meta.persona || 'tough'}
**Interview type:** ${meta.interviewType || 'phone-screen'}
**Feedback mode:** ${meta.feedbackMode || 'in_character'}
**Voice track:** ${meta.voiceTrack || meta.voice_track || 'diy'}
**Voice ID:** ${meta.voiceId || meta.osVoiceName || '(default)'}
**Duration:** ${actualMinutes || '?'} min
**Score:** ${score}/5
**Source target:** ${meta.targetId ? `reports/${meta.targetId}.md` : 'Generic'}

## Transcript

${s.transcript.map(t => `**${t.role === 'interviewer' ? 'Interviewer' : 'Candidate'} (${t.ts.slice(11, 16)}):** ${t.text}`).join('\n\n')}

## Coach Report

${report}
`;
  await writeFile(fp, fileBody, 'utf8');

  return { reportMarkdown: report, newStories, sessionFile: fp, score };
}

function parseNewStories(report) {
  // Extract STAR+R blocks under "New Stories Pending" section
  const sectionMatch = report.match(/##\s+New Stories Pending([\s\S]*?)(?=\n##\s|$)/);
  if (!sectionMatch) return [];
  const section = sectionMatch[1];
  const blocks = [...section.matchAll(/```[\s\S]*?###\s+([^\n]+)\n([\s\S]*?)```/g)];
  return blocks.map((m, i) => ({
    index: i,
    title: m[1].trim(),
    body: m[0].replace(/^```[a-z]*\n?|```$/g, '').trim(),
  }));
}

async function promoteStory(sessionId, storyIndex) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('session not found');
  const story = s.newStories?.[storyIndex];
  if (!story) throw new Error('story not found');
  const bankFp = path.join(ROOT, 'interview-prep', 'story-bank.md');
  const existing = (await readIfExists(bankFp)) || '';
  const sep = existing.endsWith('\n\n') ? '' : (existing.endsWith('\n') ? '\n' : '\n\n');
  await writeFile(bankFp, existing + sep + story.body + '\n', 'utf8');
  return { ok: true, file: bankFp };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP plumbing
// ─────────────────────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(new Error('Invalid JSON body: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

async function serveStatic(res, urlPath) {
  // Map "/mock-interview/foo" → web/mock-interview/foo
  const sub = urlPath.replace(/^\/mock-interview\/?/, '') || 'index.html';
  const safe = sub.replace(/\.\.+/g, '').replace(/^\/+/, '');
  const fp = path.join(WEB_ROOT, safe);
  try {
    const data = await readFile(fp);
    const ext = path.extname(fp);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found: ' + urlPath);
  }
}

async function handle(req, res) {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  try {
    // ─── static ──────────────────────────────────────────────────────────
    if (p === '/' || p === '/mock-interview' || p.startsWith('/mock-interview/')) {
      return serveStatic(res, p === '/' ? '/mock-interview/' : p);
    }

    // ─── API ─────────────────────────────────────────────────────────────
    if (p === '/api/config' && req.method === 'GET') {
      const profile = await loadProfile();
      const cfg = defaults(profile);
      return send(res, 200, {
        defaults: cfg,
        candidate_name: profile?.candidate?.full_name || 'Candidate',
        has_anthropic_key: !!ANTHROPIC_API_KEY,
        has_elevenlabs_key: !!ELEVENLABS_API_KEY,
      });
    }

    if (p === '/api/voices' && req.method === 'GET') {
      const voices = await listVoices();
      return send(res, 200, { voices });
    }

    if (p === '/api/targets' && req.method === 'GET') {
      const targets = await listTargets();
      return send(res, 200, { targets });
    }

    if (p === '/api/voice-preview' && req.method === 'POST') {
      const body = await readBody(req);
      const text = body.text || 'Hi, this is your mock interviewer. Let\u2019s get started in a moment.';
      try {
        const audio = await synthesizeSpeech({ text, voiceId: body.voiceId });
        res.writeHead(200, { 'content-type': 'audio/mpeg' });
        return res.end(audio);
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
    }

    if (p === '/api/session/start' && req.method === 'POST') {
      const body = await readBody(req);
      const out = await startSession(body);
      return send(res, 200, out);
    }

    let m;
    if ((m = p.match(/^\/api\/session\/([^/]+)\/turn$/)) && req.method === 'POST') {
      const body = await readBody(req);
      const out = await takeTurn(m[1], body.userTranscript || '');
      return send(res, 200, out);
    }

    if ((m = p.match(/^\/api\/session\/([^/]+)\/tts$/)) && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const audio = await synthesizeSpeech({ text: body.text || '', voiceId: body.voiceId });
        res.writeHead(200, { 'content-type': 'audio/mpeg' });
        return res.end(audio);
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
    }

    if ((m = p.match(/^\/api\/session\/([^/]+)\/end$/)) && req.method === 'POST') {
      const body = await readBody(req);
      const out = await endSession(m[1], body.actualMinutes || 0);
      return send(res, 200, out);
    }

    if ((m = p.match(/^\/api\/session\/([^/]+)\/promote-story$/)) && req.method === 'POST') {
      const body = await readBody(req);
      const out = await promoteStory(m[1], body.storyIndex);
      return send(res, 200, out);
    }

    return send(res, 404, { error: 'Unknown route: ' + p });
  } catch (e) {
    console.error('[mock] handler error:', e);
    return send(res, 500, { error: e.message || String(e) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32'           ? `start "" "${url}"`
    :                                          `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function main() {
  const profile = await loadProfile();
  const cfg = defaults(profile);
  const args = process.argv.slice(2);
  const noOpen = args.includes('--no-open');
  const checkOnly = args.includes('--check');

  // Pre-flight warnings
  if (!ANTHROPIC_API_KEY) console.warn('[mock] WARNING: ANTHROPIC_API_KEY is not set. Interviewer turns will fail. Add it to .env.');
  if (!ELEVENLABS_API_KEY) console.warn('[mock] WARNING: ELEVENLABS_API_KEY is not set. TTS will fail. Add it to .env.');

  const server = http.createServer(handle);
  server.listen(cfg.port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${cfg.port}/mock-interview/`;
    console.log(`[mock] mock-interview server listening at ${url}`);
    console.log(`[mock] voice track: ${cfg.voice_track}    persona default: ${cfg.default_persona}    feedback default: ${cfg.default_feedback_mode}`);
    if (cfg.voice_track === 'elevenlabs_cai') {
      console.log('[mock] note: elevenlabs_cai track is scaffolded but not wired in v1; falling back to diy in the UI.');
    }
    if (checkOnly) {
      // Hit /api/config and exit
      fetch(`http://127.0.0.1:${cfg.port}/api/config`)
        .then(r => r.json())
        .then(j => { console.log('[mock] /api/config OK:', JSON.stringify(j)); server.close(() => process.exit(0)); })
        .catch(e => { console.error('[mock] /api/config FAILED:', e); server.close(() => process.exit(1)); });
      return;
    }
    if (!noOpen) openBrowser(url);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
