#!/usr/bin/env node
/**
 * scripts/weekly-calibration-prompt.mjs
 *
 * Inventory Document B item #6 — "Weekly Gemini Calibration Prompt"
 * Mitchell's quote: "I would also love a gemini prompt that I can use to
 * surface from the document what you need and then give that to you once a
 * week for calibration..."
 *
 * What this generates: a system-authored prompt that Mitchell pastes into
 * Gemini in his browser. Gemini sees the corpus snapshot + the calibration
 * questions and walks Mitchell through 5-10 targeted asks tailored to the
 * current state of his corpus + pipeline + open evaluations. Mitchell drops
 * the response back into the Update Drawer (B5).
 *
 * What this does NOT do (by design — v1 MVP):
 *   - Does NOT call Gemini directly. The Gemini PROMPT is the artifact.
 *   - Does NOT auto-update cv.md, modes/_profile.md, applications.md from
 *     Mitchell's answers. That happens via the Update Drawer (B5).
 *
 * Inputs read (calibration "what the system needs" detector):
 *   - cv.md                       — current CV
 *   - modes/_profile.md           — user-layer customization overlay
 *   - data/applications.md        — tracker
 *   - data/pipeline.md            — inbox of pending URLs
 *   - data/heartbeat-*.md         — last 4 weeks
 *   - data/career-calibration-*.md — most recent calibration brief
 *   - data/hm-intel/*.json        — hiring-manager intel files
 *
 * Gap-detection rules (each maps to a question Mitchell will see):
 *   (a) Stale comp values:        rows with "$XXX-YYYK" patterns and no
 *                                  active hm-intel JSON within the last 30
 *                                  days for the same company+role
 *   (b) Open evaluations awaiting Mitchell's call: status=Evaluated &
 *       score≥4.0 & no Applied/Discarded action in 7+ days (by tracker date)
 *   (c) Recent corpus gaps:       tech/skills mentioned in last 14 days of
 *                                  evaluation reports but NOT on cv.md
 *   (d) Open hiring-manager intel: hm-intel/*.json with status=unknown
 *                                  contacts (no validated outreach hook)
 *   (e) Calibration brief drift:  whether the most recent brief is older
 *                                  than 30 days (asks Mitchell to refresh)
 *   (f) Geography / runway constraints (always asks for re-confirmation)
 *
 * Output:
 *   data/weekly-calibration-prompt-{YYYY-MM-DD}.md
 *
 * Usage:
 *   node scripts/weekly-calibration-prompt.mjs            # generate
 *   node scripts/weekly-calibration-prompt.mjs --date=2026-05-18
 *   node scripts/weekly-calibration-prompt.mjs --dry-run  # don't write
 *
 * Returns JSON on stdout:
 *   { ok, path, questions_count, gaps_detected, date }
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const dateArg = args.find(a => a.startsWith('--date='));
const DRY_RUN = args.includes('--dry-run');
const TARGET_DATE = dateArg
  ? dateArg.split('=')[1]
  : new Date().toISOString().slice(0, 10);

// ── Helpers ────────────────────────────────────────────────────────────────

function safeRead(path) {
  try { return existsSync(path) ? readFileSync(path, 'utf-8') : ''; }
  catch { return ''; }
}

function safeStat(path) {
  try { return existsSync(path) ? statSync(path) : null; }
  catch { return null; }
}

function daysSince(dateStr) {
  const t = Date.parse(dateStr);
  if (!isFinite(t)) return Infinity;
  return Math.round((Date.now() - t) / 86400000);
}

function parseDateFromFilename(name) {
  const m = name.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ── Source loaders ─────────────────────────────────────────────────────────

function loadCv() {
  const path = join(ROOT, 'cv.md');
  return { path, content: safeRead(path), exists: existsSync(path) };
}

function loadProfile() {
  const path = join(ROOT, 'modes/_profile.md');
  return { path, content: safeRead(path), exists: existsSync(path) };
}

function loadApplications() {
  const path = join(ROOT, 'data/applications.md');
  const content = safeRead(path);
  // Tracker rows: | num | date | company | role | score/5 | status | pdf | report | notes |
  const rows = [];
  for (const line of content.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map(c => c.trim());
    if (cells.length < 10) continue;
    if (cells[1] === '#' || cells[1].startsWith('---')) continue;
    const num = parseInt(cells[1], 10);
    if (!isFinite(num)) continue;
    const scoreMatch = (cells[5] || '').match(/(\d+(?:\.\d+)?)/);
    rows.push({
      num,
      date:    cells[2],
      company: cells[3],
      role:    cells[4],
      score:   scoreMatch ? parseFloat(scoreMatch[1]) : null,
      status:  cells[6],
      pdf:     cells[7],
      report:  cells[8],
      notes:   cells[9] || '',
    });
  }
  return { path, rows, exists: existsSync(path) };
}

function loadPipeline() {
  const path = join(ROOT, 'data/pipeline.md');
  const content = safeRead(path);
  // Count pending (unchecked) entries in Pendientes/Pending section
  const lines = content.split('\n');
  let inPending = false;
  let pending = 0;
  let processed = 0;
  for (const line of lines) {
    if (/^##\s+(Pendientes|Pending)/i.test(line)) { inPending = true; continue; }
    if (/^##\s+(Procesadas|Processed)/i.test(line)) { inPending = false; continue; }
    if (/^##\s+/.test(line)) { inPending = false; continue; }
    if (inPending && /^\s*-\s+\[\s\]\s+/.test(line)) pending++;
    if (inPending && /^\s*-\s+\[x\]\s+/.test(line)) processed++;
  }
  return { path, pending, processed, exists: existsSync(path) };
}

function loadRecentHeartbeats(weeks = 4) {
  const dataDir = join(ROOT, 'data');
  if (!existsSync(dataDir)) return [];
  const cutoff = Date.now() - weeks * 7 * 86400000;
  const files = readdirSync(dataDir)
    .filter(f => /^heartbeat-\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map(f => {
      const d = parseDateFromFilename(f);
      return { file: f, date: d, ts: d ? Date.parse(d) : 0 };
    })
    .filter(f => f.ts >= cutoff)
    .sort((a, b) => b.ts - a.ts);
  return files;
}

function loadMostRecentCalibrationBrief() {
  const dataDir = join(ROOT, 'data');
  if (!existsSync(dataDir)) return null;
  const briefs = readdirSync(dataDir)
    .filter(f => /^career-calibration-\d{8}-\d{6}\.md$/.test(f))
    .map(f => ({ file: f, stat: safeStat(join(dataDir, f)) }))
    .filter(b => b.stat)
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  if (!briefs.length) return null;
  const { file, stat } = briefs[0];
  return {
    file,
    path: join(dataDir, file),
    content: safeRead(join(dataDir, file)),
    days_old: Math.round((Date.now() - stat.mtimeMs) / 86400000),
  };
}

function loadHmIntel() {
  const dir = join(ROOT, 'data/hm-intel');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const intel = [];
  for (const f of files) {
    const path = join(dir, f);
    const stat = safeStat(path);
    let data = null;
    try { data = JSON.parse(safeRead(path)); } catch { continue; }
    intel.push({
      file: f,
      path,
      data,
      days_old: stat ? Math.round((Date.now() - stat.mtimeMs) / 86400000) : Infinity,
    });
  }
  return intel;
}

// ── Gap detectors ──────────────────────────────────────────────────────────

function detectStaleComp(applications, hmIntel) {
  // Stale comp = tracker row that mentions "$XXX-YYYK" or "$XXXK-$YYYK" in
  // the notes AND there is no hm-intel JSON for the same company within the
  // last 30 days. Cap at top 5 most-likely-relevant (highest score, recent).
  const compPattern = /\$\d{2,3}[Kk]?\s*[-–to]+\s*\$?\d{2,3}[Kk]/;
  const hmByCompany = new Map();
  for (const intel of hmIntel) {
    const co = (intel.data?.company || '').toLowerCase();
    if (!co) continue;
    const prev = hmByCompany.get(co);
    if (!prev || prev.days_old > intel.days_old) hmByCompany.set(co, intel);
  }
  const stale = [];
  for (const row of applications.rows) {
    if (!compPattern.test(row.notes || '')) continue;
    const co = (row.company || '').toLowerCase();
    const intel = hmByCompany.get(co);
    if (intel && intel.days_old <= 30) continue;
    stale.push(row);
  }
  // Prioritize: recent date desc, then score desc
  stale.sort((a, b) => {
    const da = Date.parse(a.date) || 0;
    const db = Date.parse(b.date) || 0;
    if (db !== da) return db - da;
    return (b.score || 0) - (a.score || 0);
  });
  return stale.slice(0, 5);
}

function detectStuckEvaluations(applications) {
  // status=Evaluated & score>=4.0 & date older than 7d (by tracker date)
  // and not marked Applied/Discarded somewhere. We dedupe by company+role.
  const cutoff = 7;
  const stuck = [];
  const seenKey = new Set();
  for (const row of applications.rows) {
    if (row.status !== 'Evaluated') continue;
    if (!row.score || row.score < 4.0) continue;
    if (daysSince(row.date) < cutoff) continue;
    const key = `${(row.company || '').toLowerCase()}::${(row.role || '').toLowerCase()}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    stuck.push(row);
  }
  // Highest score first, then oldest first (most overdue calls).
  stuck.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0);
  });
  return stuck.slice(0, 8);
}

function detectCorpusGaps(applications, cv) {
  // Scan recent (<=14d) evaluation rows for tech / framework keywords that
  // never appear in cv.md. Returns a set of candidate "system-needs-to-ask"
  // skill terms. The list is intentionally small + tightly scoped — we only
  // surface a handful so Mitchell isn't drowning in noise. The vocabulary
  // below favors hiring-signal markers from the calibration brief; agent
  // can extend later if Mitchell wants finer coverage.
  const vocab = [
    'GRPO', 'DPO', 'PPO', 'RLHF', 'RLAIF',
    'NeMo', 'AutoGen', 'CrewAI', 'LangGraph', 'LangChain',
    'Pinecone', 'Weaviate', 'Qdrant', 'Chroma',
    'Vertex AI', 'Bedrock', 'SageMaker',
    'Kubernetes', 'Terraform', 'Airflow',
    'eval framework', 'A/B testing platform', 'feature flagging',
    'CUDA', 'Triton', 'PyTorch', 'TensorFlow',
  ];
  const cvLower = (cv.content || '').toLowerCase();
  const counts = new Map();
  const cutoff = Date.now() - 14 * 86400000;
  for (const row of applications.rows) {
    const ts = Date.parse(row.date) || 0;
    if (ts < cutoff) continue;
    const haystack = (row.notes || '').toLowerCase();
    for (const term of vocab) {
      if (!haystack.includes(term.toLowerCase())) continue;
      if (cvLower.includes(term.toLowerCase())) continue;
      counts.set(term, (counts.get(term) || 0) + 1);
    }
  }
  // Sort by frequency
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([term, count]) => ({ term, count }));
}

function detectIntelGaps(hmIntel) {
  // Open intel = files where no hiring_manager has a HIGH confidence AND
  // file is older than 14d. Surfaces "this person we identified — is it
  // still the right one?" questions.
  const open = [];
  for (const intel of hmIntel) {
    if (intel.days_old < 14) continue;
    const hms = intel.data?.hiring_managers || [];
    const hasHigh = hms.some(h => (h.confidence || '').toUpperCase() === 'HIGH');
    if (hasHigh) continue;
    if (!hms.length) continue; // skip empty files entirely
    open.push({
      file: intel.file,
      company: intel.data?.company || '?',
      role: intel.data?.role || '?',
      days_old: intel.days_old,
      first_hm: hms[0]?.name || '(unknown)',
      first_hm_title: hms[0]?.title || '',
    });
  }
  // Most stale first, then alphabetical
  open.sort((a, b) => b.days_old - a.days_old);
  return open.slice(0, 5);
}

function briefDrift(brief) {
  if (!brief) return { drift: true, days_old: null, reason: 'no_brief_found' };
  return {
    drift: brief.days_old >= 30,
    days_old: brief.days_old,
    reason: brief.days_old >= 30 ? 'older_than_30d' : 'recent',
    file: brief.file,
  };
}

// ── Question composer ──────────────────────────────────────────────────────

function composeQuestions({
  staleComp, stuckEvals, corpusGaps, intelGaps, brief, pipeline, applications,
}) {
  const questions = [];

  // Q1 — Stuck evaluations (highest-leverage signal: should we apply yes/no?)
  if (stuckEvals.length > 0) {
    const lines = stuckEvals.map(r =>
      `   - [${r.num}] ${r.company} — ${r.role} (score ${r.score?.toFixed(1) || '?'}/5, evaluated ${r.date}, ${daysSince(r.date)}d ago)`
    );
    questions.push({
      id: 'stuck_evaluations',
      title: 'Open evaluations awaiting a call',
      ask: `Mitchell, the system has ${stuckEvals.length} evaluation${stuckEvals.length === 1 ? '' : 's'} sitting at ≥ 4.0/5 with no Applied or Discarded status for 7+ days. For each, give me one of: \`APPLY\` (with one sentence on why now), \`DISCARD\` (with one sentence on why), or \`HOLD\` (with the trigger that would unstick it).`,
      detail_lines: lines,
    });
  }

  // Q2 — Stale comp citations
  if (staleComp.length > 0) {
    const lines = staleComp.map(r =>
      `   - ${r.company} — ${r.role}: notes cite a $ range, last fresh check > 30d ago`
    );
    questions.push({
      id: 'stale_comp',
      title: 'Compensation values needing a fresh source',
      ask: `For each row below, give me a one-line answer of the form \`{company} — {role}: $XXX-YYYK base, $ZZZ-WWWK TC, source: {Levels.fyi | Glassdoor | Blind | recruiter screen}, dated {YYYY-MM-DD}\`. If you can't easily get a number, say \`SKIP — defer until intel refresh\`.`,
      detail_lines: lines,
    });
  }

  // Q3 — Corpus gaps (tech mentioned in JDs that's not on cv.md)
  if (corpusGaps.length > 0) {
    const lines = corpusGaps.map(g =>
      `   - **${g.term}** (mentioned in ${g.count} JD${g.count === 1 ? '' : 's'} in the last 14 days, not on cv.md)`
    );
    questions.push({
      id: 'corpus_gaps',
      title: 'Skills surfacing in JDs but missing from your CV',
      ask: 'For each, give me one of: `ADD — {1-sentence proof point I can write into cv.md}`, `LEARN — {course or project I plan to ship by {date}}`, or `IGNORE — not pursuing this signal`.',
      detail_lines: lines,
    });
  }

  // Q4 — Hiring-manager intel — does Mitchell agree these are still the
  //      right people to target?
  if (intelGaps.length > 0) {
    const lines = intelGaps.map(g =>
      `   - ${g.company} — ${g.role}: lead contact ${g.first_hm}${g.first_hm_title ? ` (${g.first_hm_title})` : ''}, intel ${g.days_old}d old, no HIGH-confidence consensus`
    );
    questions.push({
      id: 'intel_validation',
      title: 'Hiring-manager intel files needing your sign-off',
      ask: 'For each, give me one of: `CONFIRM — proceed with this person`, `REPLACE — {name and title of better contact}`, or `KILL — drop this role from the pipeline because {reason}`.',
      detail_lines: lines,
    });
  }

  // Q5 — Calibration brief drift
  const drift = briefDrift(brief);
  if (drift.drift) {
    questions.push({
      id: 'brief_refresh',
      title: 'Calibration brief drift check',
      ask: `Your most recent career-calibration brief is ${drift.days_old == null ? 'missing' : `${drift.days_old} days old`}. In 3-5 sentences: have your role-priority order, comp targets, geography, or runway changed since? If yes, name the change. If no, just say "STILL CURRENT" and we'll keep using the existing brief.`,
      detail_lines: drift.file ? [`   - Current brief: data/${drift.file}`] : [],
    });
  }

  // Q6 — Pipeline / runway re-confirmation (always asked — anchor question)
  questions.push({
    id: 'runway_check',
    title: 'Weekly runway + headspace check',
    ask: `In 2-3 sentences, tell me: (a) how many active recruiter conversations you have this week, (b) your current best-case "earliest realistic offer" date, and (c) any external pressure that's changed in the last 7 days (Google role intensity, family, health, finances).`,
    detail_lines: [
      `   - Tracker total: ${applications.rows.length} rows`,
      `   - Pipeline queue: ${pipeline.pending} pending, ${pipeline.processed} processed`,
    ],
  });

  // Q7 — Open question — what surprised Mitchell this week
  questions.push({
    id: 'surprise',
    title: 'What surprised you this week',
    ask: 'In 1-3 sentences: one thing the system showed you this week that surprised you (good or bad). The agent uses this to adjust scoring weights, archetype priorities, or what to surface vs. suppress in next week\'s heartbeats.',
    detail_lines: [],
  });

  // Q8 — Free-form catch-all
  questions.push({
    id: 'catch_all',
    title: 'Anything else',
    ask: 'Open mic. Anything you want the agent to know, change, fix, build, or stop doing. Treat this as the answer to "if I were sitting next to you for 5 minutes right now, what would I tell you?"',
    detail_lines: [],
  });

  return questions;
}

// ── Prompt renderer ────────────────────────────────────────────────────────

function renderPrompt({ date, questions, brief, applications, pipeline }) {
  const header = `# Weekly Calibration Prompt — ${date}

> **How to use this:** Copy everything between the \`=== GEMINI PROMPT START ===\`
> and \`=== GEMINI PROMPT END ===\` markers below. Paste into Gemini (or any other
> capable model). Answer the questions inline. Then come back to the career-ops
> dashboard, open the **Update Drawer**, and paste the full Gemini conversation
> (your answers included) back in. The agent will parse it, propose changes to
> your corpus + tracker, and you'll review the diff before anything is committed.

> **Why this exists (your own words):** "I would also love a gemini prompt that
> I can use to surface from the document what you need and then give that to
> you once a week for calibration..."

---

`;

  const promptBody = [];
  promptBody.push('=== GEMINI PROMPT START ===');
  promptBody.push('');
  promptBody.push(`You are helping Mitchell Williams calibrate his AI-driven job-search system, career-ops. The system runs autonomously and surfaces ~5-10 ranked Apply-Now roles per week. To keep ranking accurate it needs Mitchell's live judgment on ${questions.length} specific questions.`);
  promptBody.push('');
  promptBody.push('## Context the system already knows');
  promptBody.push('');
  promptBody.push(`- **Pipeline:** ${applications.rows.length} tracker rows, ${pipeline.pending} pending URLs in the inbox.`);
  if (brief) {
    const daysLabel = brief.days_old === 1 ? '1 day old' : `${brief.days_old} days old`;
    promptBody.push(`- **Most recent calibration brief:** ${brief.file} (${daysLabel}).`);
  } else {
    promptBody.push('- **Most recent calibration brief:** none on file.');
  }
  promptBody.push('- **Target archetypes (priority order):** AI Program Manager > AI Solutions Architect > Forward Deployed Engineer > AI Enablement Lead > Engineering Editorial Lead (bridge role only).');
  promptBody.push('- **Comp target:** $250-320K TC; floor $175K base; pre-IPO Series C+ only.');
  promptBody.push('- **Geography:** Seattle (current) > West Coast metros > Dallas/Chicago > NYC > international.');
  promptBody.push('- **Runway constraint:** under 3 months if Mitchell leaves Google without an offer — needs offer in hand before transition.');
  promptBody.push('');
  promptBody.push('## Your job');
  promptBody.push('');
  promptBody.push(`Walk Mitchell through the ${questions.length} questions below **in order**. Wait for his answer before moving to the next. Keep answers concise — one or two sentences each is plenty. When done, summarize his answers in a single markdown block titled \`# Career-Ops Calibration Response — ${date}\` that he can paste straight back into the system.`);
  promptBody.push('');
  promptBody.push('---');
  promptBody.push('');
  promptBody.push('## Questions');
  promptBody.push('');

  questions.forEach((q, idx) => {
    promptBody.push(`### Q${idx + 1}. ${q.title}`);
    promptBody.push('');
    promptBody.push(q.ask);
    if (q.detail_lines && q.detail_lines.length > 0) {
      promptBody.push('');
      for (const line of q.detail_lines) promptBody.push(line);
    }
    promptBody.push('');
  });

  promptBody.push('---');
  promptBody.push('');
  promptBody.push('When all questions are answered, output the final response block exactly in this format so the system can parse it:');
  promptBody.push('');
  promptBody.push('```markdown');
  promptBody.push(`# Career-Ops Calibration Response — ${date}`);
  for (const q of questions) {
    promptBody.push('');
    promptBody.push(`## ${q.title}`);
    promptBody.push('{Mitchell\'s answer here}');
  }
  promptBody.push('```');
  promptBody.push('');
  promptBody.push('=== GEMINI PROMPT END ===');
  promptBody.push('');

  const responseTemplate = `---

## Paste Mitchell's response below (or use the Update Drawer)

After Mitchell answers in Gemini, paste the full response block here OR open the
Update Drawer on the dashboard — either works. The agent will detect the new
content on the next dashboard rebuild.

\`\`\`markdown
# Career-Ops Calibration Response — ${date}

(paste Gemini's final summary block here)
\`\`\`

---

*Generated by \`scripts/weekly-calibration-prompt.mjs\`. To regenerate manually:*
\`node scripts/weekly-calibration-prompt.mjs\`
`;

  return header + promptBody.join('\n') + '\n' + responseTemplate;
}

// ── State writer ───────────────────────────────────────────────────────────

function updateCalibrationState({ date, path, questions_count }) {
  const statePath = join(ROOT, 'data/calibration-state.json');
  let state = {
    last_prompt_generated: null,
    last_prompt_path: null,
    last_prompt_questions: 0,
    last_prompt_answered: null,
    history: [],
  };
  if (existsSync(statePath)) {
    try { state = JSON.parse(safeRead(statePath)); } catch { /* keep defaults */ }
    if (!Array.isArray(state.history)) state.history = [];
  }
  state.last_prompt_generated = date;
  state.last_prompt_path = path;
  state.last_prompt_questions = questions_count;
  state.history.unshift({ date, path, questions: questions_count });
  state.history = state.history.slice(0, 26); // keep ~6 months
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  return statePath;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const cv = loadCv();
  const profile = loadProfile();
  const applications = loadApplications();
  const pipeline = loadPipeline();
  const heartbeats = loadRecentHeartbeats(4);
  const brief = loadMostRecentCalibrationBrief();
  const hmIntel = loadHmIntel();

  const staleComp  = detectStaleComp(applications, hmIntel);
  const stuckEvals = detectStuckEvaluations(applications);
  const corpusGaps = detectCorpusGaps(applications, cv);
  const intelGaps  = detectIntelGaps(hmIntel);

  const questions = composeQuestions({
    staleComp, stuckEvals, corpusGaps, intelGaps, brief, pipeline, applications,
  });

  const promptText = renderPrompt({
    date: TARGET_DATE,
    questions,
    brief,
    applications,
    pipeline,
  });

  const outPath = join(ROOT, `data/weekly-calibration-prompt-${TARGET_DATE}.md`);

  if (DRY_RUN) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      would_write: outPath,
      questions_count: questions.length,
      gaps_detected: {
        stale_comp: staleComp.length,
        stuck_evaluations: stuckEvals.length,
        corpus_gaps: corpusGaps.length,
        intel_gaps: intelGaps.length,
        brief_drift_days: brief ? brief.days_old : null,
      },
      date: TARGET_DATE,
      sources_loaded: {
        cv: cv.exists,
        profile: profile.exists,
        applications_rows: applications.rows.length,
        pipeline_pending: pipeline.pending,
        heartbeats_last_4w: heartbeats.length,
        most_recent_brief: brief ? brief.file : null,
        hm_intel_files: hmIntel.length,
      },
    }, null, 2));
    return;
  }

  writeFileSync(outPath, promptText);
  const statePath = updateCalibrationState({
    date: TARGET_DATE,
    path: outPath,
    questions_count: questions.length,
  });

  console.log(JSON.stringify({
    ok: true,
    path: outPath,
    state_path: statePath,
    questions_count: questions.length,
    gaps_detected: {
      stale_comp: staleComp.length,
      stuck_evaluations: stuckEvals.length,
      corpus_gaps: corpusGaps.length,
      intel_gaps: intelGaps.length,
      brief_drift_days: brief ? brief.days_old : null,
    },
    date: TARGET_DATE,
  }, null, 2));
}

main();
