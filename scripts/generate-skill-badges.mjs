#!/usr/bin/env node
/**
 * scripts/generate-skill-badges.mjs — Nano Banana 2 skill medallion badge generator
 *
 * Generates circular skill medallion badges using Gemini 3.1 Flash Image (Nano Banana 2)
 * for the Career-Ops Phase 4 skill-tracker visual layer.
 *
 * Subject Consistency approach: Nano Banana 2's Subject Consistency operates via
 * REFERENCE IMAGES passed in `contents.parts.inline_data` (verified May 2026 via
 * https://ai.google.dev/gemini-api/docs/image-generation). The model maintains
 * stylistic consistency across up to 14 reference objects. Implementation:
 *   1. Generate badge #1 with no reference (style anchor).
 *   2. For badges #2-N, pass badge #1 as a reference image with a "match the
 *      circular medallion style, line-art, palette, and proportions" prompt.
 *
 * Usage:
 *   node scripts/generate-skill-badges.mjs --dry-run --limit 1
 *   node scripts/generate-skill-badges.mjs --limit 10
 *   node scripts/generate-skill-badges.mjs --skills python,sql --limit 2
 *   node scripts/generate-skill-badges.mjs --style "muted geometric, line-art"
 *
 * Outputs:
 *   data/skill-tracker/badges/{slug}.png       — 512x512 PNG (one per skill)
 *   data/skill-tracker/badges/{slug}.json      — prompt + metadata
 *   data/skill-tracker/badges/README.md        — index + cost summary
 *
 * Budget guardrails:
 *   - Per-image cost: ~$0.045 (Nano Banana 2 standard pricing)
 *   - Hard ceiling: $1.00 total (configurable via --max-spend)
 *   - Aborts before next call if running total would exceed ceiling
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const BADGES_DIR = join(ROOT, 'data', 'skill-tracker', 'badges');

// ─── Load .env (matching scripts/humanize-check.mjs pattern) ──────────────
try {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m) process.env[m[1]] = m[2].trim(); // override:true per memory rule
    }
  }
} catch {}

// ─── Constants ────────────────────────────────────────────────────────────
const MODEL = 'gemini-3.1-flash-image-preview';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const PER_IMAGE_COST_USD = 0.045; // verified May 2026 — standard tier
const DEFAULT_HARD_CEILING_USD = 1.00;
const DEFAULT_STYLE_ANCHOR = 'circular medallion, line-art minimalist, neutral palette aligned with Career-Ops dashboard (#16a34a green accent, slate-blue background #475c75), flat geometric, no photorealism, no text, transparent ring on dark background, legible at 64px display size';

// Fallback skill list (used if data/courses.yml does not exist yet)
const FALLBACK_SKILLS = [
  { name: 'Python (agent-build)', slug: 'python-agent-build', symbol: 'a stylized snake forming a geometric ouroboros around a small terminal cursor' },
  { name: 'SQL (data analysis)', slug: 'sql-data-analysis', symbol: 'a stacked database cylinder with three diagonal query lines flowing outward' },
  { name: 'Technical Program Management', slug: 'technical-program-management', symbol: 'a triangular project gantt chart inside a circle with three connecting nodes' },
  { name: 'AI Product Management', slug: 'ai-product-management', symbol: 'a neural-network node graph forming a product roadmap arrow' },
  { name: 'Voice & brand', slug: 'voice-brand', symbol: 'a microphone silhouette merging into a sound wave with a quill underneath' },
  { name: 'Cross-functional leadership', slug: 'cross-functional-leadership', symbol: 'three interlocking team arrows converging at a single point inside the circle' },
  { name: 'Forward Deployed Engineering', slug: 'forward-deployed-engineering', symbol: 'a deployment rocket arc with a wrench-and-bracket icon at its base' },
  { name: 'Solutions Architecture', slug: 'solutions-architecture', symbol: 'a layered architecture diagram with three stacked component blocks and connecting lines' },
  { name: 'Editorial & Communications', slug: 'editorial-communications', symbol: 'an open book with a quill and a small broadcast antenna above' },
  { name: 'Shipping velocity', slug: 'shipping-velocity', symbol: 'a paper airplane in motion with three speed lines trailing behind it' },
];

// ─── CLI arg parsing ──────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cli = {
  dryRun: argv.includes('--dry-run'),
  limit: 10,
  skills: null,
  style: DEFAULT_STYLE_ANCHOR,
  maxSpend: DEFAULT_HARD_CEILING_USD,
  noConsistency: argv.includes('--no-consistency'),
};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--limit' && argv[i + 1]) cli.limit = parseInt(argv[++i], 10);
  else if (argv[i] === '--skills' && argv[i + 1]) cli.skills = argv[++i].split(',').map(s => s.trim());
  else if (argv[i] === '--style' && argv[i + 1]) cli.style = argv[++i];
  else if (argv[i] === '--max-spend' && argv[i + 1]) cli.maxSpend = parseFloat(argv[++i]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

function loadSkillsFromCoursesYml() {
  const coursesPath = join(ROOT, 'data', 'courses.yml');
  if (!existsSync(coursesPath)) return null;
  // Minimal YAML parsing — we expect `skills:\n  - name: foo\n    slug: foo\n` shape.
  try {
    const text = readFileSync(coursesPath, 'utf8');
    const out = [];
    let current = null;
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+$/, '');
      if (/^\s*-\s*name:\s*/.test(line)) {
        if (current) out.push(current);
        current = { name: line.replace(/^\s*-\s*name:\s*/, '').trim().replace(/^["']|["']$/g, '') };
      } else if (current && /^\s+slug:\s*/.test(line)) {
        current.slug = line.replace(/^\s+slug:\s*/, '').trim().replace(/^["']|["']$/g, '');
      } else if (current && /^\s+symbol:\s*/.test(line)) {
        current.symbol = line.replace(/^\s+symbol:\s*/, '').trim().replace(/^["']|["']$/g, '');
      }
    }
    if (current) out.push(current);
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function buildPrompt(skill, styleAnchor) {
  const symbolHint = skill.symbol || `an abstract geometric icon representing the concept of "${skill.name}"`;
  return [
    `Generate a circular medallion skill badge for: ${skill.name}.`,
    ``,
    `Visual subject: ${symbolHint}.`,
    ``,
    `Style anchor (CRITICAL — match exactly): ${styleAnchor}.`,
    ``,
    `Composition: 512x512 px square PNG. Centered circular medallion with thin outer ring.`,
    `Background outside the medallion: solid dark slate-blue (#475c75) OR transparent — pick whichever reads cleanest.`,
    `Inside the medallion: muted geometric line-art on a slightly darker plate, with a single green (#16a34a) highlight accent.`,
    `WCAG-aware contrast: badge symbol must remain legible at 64px display size with sufficient contrast against the medallion plate.`,
    ``,
    `Rules: NO text or letterforms inside the badge. NO photorealism. NO human faces. NO copyrighted logos or brand marks. NO gradients. Flat, minimalist, slightly editorial.`,
  ].join('\n');
}

function loadReferencePngAsBase64(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path).toString('base64');
}

async function callNanoBanana({ promptText, referenceBase64 = null }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing from environment');

  const parts = [{ text: promptText }];
  if (referenceBase64) {
    // Subject Consistency: pass the anchor image as a reference part.
    // Per https://ai.google.dev/gemini-api/docs/image-generation, multiple
    // inline_data parts in `contents` enable feature consistency across calls.
    parts.push({
      inline_data: {
        mime_type: 'image/png',
        data: referenceBase64,
      },
    });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
    },
  };

  const url = `${ENDPOINT}?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: text.slice(0, 1000) };
  }
  let json;
  try { json = JSON.parse(text); }
  catch (e) { return { ok: false, status: res.status, error: `JSON parse fail: ${e.message}` }; }

  // Walk candidates for the inline_data part containing PNG bytes.
  let pngBase64 = null;
  let textPart = null;
  for (const cand of (json.candidates || [])) {
    for (const part of (cand.content?.parts || [])) {
      if (part.inlineData?.data) {
        pngBase64 = part.inlineData.data;
      } else if (part.inline_data?.data) {
        // snake_case fallback
        pngBase64 = part.inline_data.data;
      } else if (part.text) {
        textPart = part.text;
      }
    }
  }
  if (!pngBase64) {
    return { ok: false, status: res.status, error: `No image part in response. Text part: ${textPart?.slice(0, 200) || 'none'}` };
  }
  return { ok: true, pngBase64, raw: json };
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  ensureDir(BADGES_DIR);

  // Source skill list
  let skills;
  if (cli.skills) {
    skills = cli.skills.map(s => {
      const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const match = FALLBACK_SKILLS.find(f => f.slug === slug || f.name.toLowerCase().includes(s.toLowerCase()));
      return match || { name: s, slug, symbol: null };
    });
  } else {
    skills = loadSkillsFromCoursesYml() || FALLBACK_SKILLS;
  }
  skills = skills.slice(0, cli.limit);

  console.log(`[badges] target=${skills.length} | dryRun=${cli.dryRun} | maxSpend=$${cli.maxSpend.toFixed(2)} | subjectConsistency=${!cli.noConsistency}`);
  console.log(`[badges] style anchor: ${cli.style}`);

  // Dry run: print prompt for first skill and exit.
  if (cli.dryRun) {
    const sample = skills[0];
    const prompt = buildPrompt(sample, cli.style);
    console.log('\n── DRY RUN — prompt for skill[0] ───────────────────────────');
    console.log(`skill: ${sample.name} (slug: ${sample.slug})`);
    console.log('---');
    console.log(prompt);
    console.log('---');
    console.log(`estimated cost if run: $${(skills.length * PER_IMAGE_COST_USD).toFixed(3)}`);
    return;
  }

  // Pre-flight: API key present?
  if (!process.env.GEMINI_API_KEY) {
    console.error('[badges] FATAL: GEMINI_API_KEY missing — abort');
    process.exit(1);
  }

  const results = [];
  let totalCost = 0;
  let anchorBase64 = null; // first successful badge becomes the style anchor for the rest

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const slug = skill.slug;
    const pngPath = join(BADGES_DIR, `${slug}.png`);
    const jsonPath = join(BADGES_DIR, `${slug}.json`);

    // Cost guard: would the next call exceed ceiling?
    if (totalCost + PER_IMAGE_COST_USD > cli.maxSpend) {
      console.error(`[badges] STOP: next call would exceed cap ($${(totalCost + PER_IMAGE_COST_USD).toFixed(3)} > $${cli.maxSpend.toFixed(2)})`);
      break;
    }

    const promptText = buildPrompt(skill, cli.style);
    const useRef = !cli.noConsistency && anchorBase64 && i > 0;

    console.log(`[badges] [${i + 1}/${skills.length}] ${skill.name} — ${useRef ? 'with anchor ref' : 'no ref (anchor)'}`);
    const startedAt = Date.now();
    const out = await callNanoBanana({
      promptText,
      referenceBase64: useRef ? anchorBase64 : null,
    });
    const durMs = Date.now() - startedAt;

    if (!out.ok) {
      console.error(`[badges] FAIL [${slug}] status=${out.status} err=${out.error}`);
      results.push({ slug, name: skill.name, ok: false, error: out.error, status: out.status });
      // Stop immediately if first call fails — likely misnamed model.
      if (i === 0) {
        console.error('[badges] First call failed — aborting to avoid burning budget on a broken endpoint.');
        break;
      }
      continue;
    }

    // Save PNG
    const pngBytes = Buffer.from(out.pngBase64, 'base64');
    writeFileSync(pngPath, pngBytes);
    const sizeKb = Math.round(pngBytes.length / 1024);

    // Capture anchor on first success
    if (!anchorBase64) anchorBase64 = out.pngBase64;

    totalCost += PER_IMAGE_COST_USD;

    const meta = {
      skill_name: skill.name,
      slug,
      symbol_hint: skill.symbol || null,
      model: MODEL,
      style_anchor: cli.style,
      used_subject_consistency: useRef,
      reference_skill: useRef ? skills[0].slug : null,
      prompt: promptText,
      png_path: `data/skill-tracker/badges/${slug}.png`,
      png_size_kb: sizeKb,
      cost_usd_estimated: PER_IMAGE_COST_USD,
      generated_at: new Date().toISOString(),
      duration_ms: durMs,
    };
    writeFileSync(jsonPath, JSON.stringify(meta, null, 2));

    results.push({ slug, name: skill.name, ok: true, sizeKb, durMs });
    console.log(`[badges]   saved ${slug}.png (${sizeKb} KB, ${durMs}ms) | running cost: $${totalCost.toFixed(3)}`);
  }

  // ── README.md ────────────────────────────────────────────────────────
  const success = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const avgKb = success.length ? Math.round(success.reduce((a, r) => a + r.sizeKb, 0) / success.length) : 0;

  const readme = [
    `# Skill Medallion Badges`,
    ``,
    `Generated ${new Date().toISOString().slice(0, 10)} via \`scripts/generate-skill-badges.mjs\` using Nano Banana 2 (\`${MODEL}\`).`,
    ``,
    `## Summary`,
    ``,
    `- Badges generated: **${success.length}/${results.length}**`,
    `- Subject Consistency: **${cli.noConsistency ? 'disabled' : 'enabled'}** (badge 1 is the style anchor; badges 2-${success.length} reference it via \`inline_data\` per https://ai.google.dev/gemini-api/docs/image-generation)`,
    `- Total estimated API spend: **$${totalCost.toFixed(3)}** (hard ceiling was $${cli.maxSpend.toFixed(2)})`,
    `- Average file size: **${avgKb} KB**`,
    `- Style anchor used: \`${cli.style}\``,
    ``,
    `## Badges`,
    ``,
    `| # | Skill | Slug | File | Size | Status |`,
    `|---|-------|------|------|------|--------|`,
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | \`${r.slug}\` | [\`${r.slug}.png\`](./${r.slug}.png) | ${r.ok ? r.sizeKb + ' KB' : '—'} | ${r.ok ? 'ok' : 'FAILED: ' + (r.error || '').slice(0, 80)} |`),
    ``,
    `## How to regenerate a single badge`,
    ``,
    '```bash',
    `node scripts/generate-skill-badges.mjs --skills <slug> --limit 1`,
    '```',
    ``,
    `(Slugs are listed above. Adding \`--no-consistency\` disables the reference-image anchor.)`,
    ``,
    `## How to regenerate all badges`,
    ``,
    '```bash',
    `node scripts/generate-skill-badges.mjs --limit 10`,
    '```',
    ``,
    `## Subject Consistency mechanism`,
    ``,
    `Per the Gemini Image Generation docs (verified 2026-05-17), Nano Banana 2 does NOT take a dedicated`,
    `\`tools: [{ subject_consistency: {} }]\` flag. Consistency is achieved by passing one or more`,
    `reference images via \`contents.parts.inline_data\` (up to 14 objects).`,
    ``,
    `This script generates badge #1 with NO reference (it IS the anchor), then passes badge #1 as an`,
    `\`inline_data\` reference for badges #2-N alongside the matching style-anchor prompt text.`,
    failed.length ? `\n## Failures\n\n${failed.map(r => `- \`${r.slug}\`: ${r.error}`).join('\n')}\n` : '',
  ].join('\n');

  writeFileSync(join(BADGES_DIR, 'README.md'), readme);
  console.log(`\n[badges] DONE — ${success.length}/${results.length} generated | total cost ~$${totalCost.toFixed(3)} | avg ${avgKb} KB`);
  console.log(`[badges] README: data/skill-tracker/badges/README.md`);

  // Final JSON summary for the orchestrator
  console.log('\n── SUMMARY (JSON) ─────────────────────────────────────────');
  console.log(JSON.stringify({
    skills_generated: success.length,
    skills_attempted: results.length,
    skill_slugs: success.map(r => r.slug),
    subject_consistency_used: !cli.noConsistency && success.length > 1,
    total_cost_usd: Number(totalCost.toFixed(4)),
    avg_file_size_kb: avgKb,
    failures: failed.map(r => ({ slug: r.slug, error: (r.error || '').slice(0, 200) })),
  }, null, 2));
}

main().catch(e => {
  console.error('[badges] UNCAUGHT:', e.stack || e.message);
  process.exit(1);
});
