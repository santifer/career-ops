#!/usr/bin/env node
/**
 * relocation-career-strategy.mjs
 *
 * Multi-model strategic analysis: optimal career + wealth path for
 * Thailand (short-term) and Taiwan (long-term) relocation.
 *
 * Fires simultaneously across:
 *   - xAI Grok (web_search + x_search)
 *   - Perplexity sonar-deep-research
 *   - Gemini 2.5 Pro (Google Search grounded)
 *   - OpenAI GPT-5 / o3 fallback
 *
 * Usage: node scripts/relocation-career-strategy.mjs
 * Output: /tmp/relocation-career-strategy-YYYY-MM-DD.md
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

try {
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch {}

const TODAY = new Date().toISOString().slice(0, 10);
const OUT = `/tmp/relocation-career-strategy-${TODAY}.md`;

const PROMPT = `
You are conducting rigorous strategic career and financial planning for a specific individual.
Read every detail of his profile carefully — the analysis must be tailored to him, not generic.

---

## THE INDIVIDUAL

**Name:** Mitchell Williams, 41, gay white American male, US citizen
**Current role:** Internal Communications Lead + Program Manager, Google xGE (Office of Cross-Google Engineering)
**Current location:** Seattle, WA
**Total comp target:** $200K–$320K USD
**Minimum floor:** $175K (fully remote / international preferred)

**Core skills and demonstrated production:**
- AI agent engineering at production scale: shipped three LLM agents for Google's top 0.5% of 180,000 engineers
  - Autonomous Communications Triage Agent (three-prompt architecture: triage/revise/escalate, conditional KB loading) — ~160 operational hours/year recaptured at >90% classification accuracy for ~1,000 Principal/Distinguished/Fellow engineers
  - Executive RAG Pipeline / "Voice DNA" — 90% drafting latency reduction, 99% stylistic fidelity for VP-level communications
  - AI-driven senior engineering mentorship platform — 90% admin reduction (3.5hrs → 20min/match), 300%+ deployment capacity scaling
  - All three run unattended; triage system maintained 100% operational continuity through a multi-month absence
- LLM orchestration, MCP (Model Context Protocol), RAG pipelines, prompt engineering, autonomous agents, Claude Code
- Executive and principal-level communications at engineering scale — ghostwriting and briefing for VP/L8-L10 audience
- 13 years in broadcast journalism before Google: Al Jazeera English (The Stream founding team), HuffPost Live, Fusion (ABC/Univision), AJ+, CNN
- Live broadcast production under active litigation exposure (Scientology coverage), multi-stakeholder OPSEC, crisis comms
- Applied AI certifications: Anthropic AI Fluency, Claude 101, Introduction to Agent Skills, Introduction to MCP (all March 2026)
- Personal projects: career-ops (agentic job-search pipeline, public GitHub), Voice OS (1.08M-word personal corpus analysis), Tax Verification Agent ($19K error caught)
- Node.js, Apps Script, Python (learning), Playwright, YAML, Markdown

**Target roles:**
- Primary: AI Solutions Architect, Forward Deployed Engineer, Applied AI Engineer, AI Enablement Lead, AI Program Manager / Technical Program Manager
- Secondary: Communications Manager (AI-native), Developer Education Lead, Engineering Editorial Lead

**CV notes relevant to career strategy:**
- He produced an investigative segment at AJ+ exposing Senate co-sponsors of a BDS criminalization bill who had not read the bill they signed. This is documented on his public CV. He is openly pro-Palestinian and views Israel's conduct as a dealbreaker in evaluating governments and employers.
- He has documented connections to LGBTQ advocacy journalism going back to 2012 (trans military panel, PrEP coverage ahead of mainstream, Jazz episode pre-TLC). His identity and values are public.
- He has NO interest in roles at companies with significant Israel defense/surveillance contracts, pro-Israel political alignment, or cultures where his public political positions would create employment risk.

---

## HIS RELOCATION PLAN

**Short-term destination (2026–2032): Bangkok, Thailand**
- Reasons: Buddhist cultural foundation (non-Abrahamic), same-sex marriage now law (effective January 2025), world-class international hospitals (Bumrungrad, Bangkok Hospital, Samitivej — JCI-accredited), not Western, not Israel-aligned, not Christian nationalist
- He is plant-based/vegan — needs embedded food culture, not just restaurant options
- He will NOT be returning to the United States permanently

**Long-term destination (2032–2045+): Taipei, Taiwan**
- Taiwan passes all his filters — Buddhist/Taoist culture, full marriage equality, National Health Insurance, EU-level food safety, functioning democracy
- Taiwan on hold 2026–2032 due to PRC conflict risk (2027–2030 danger window per CSIS/RAND analysis)
- Once the danger window resolves favorably, Taiwan becomes his permanent home

**Political filters (non-negotiable, affects employer selection too):**
- No Christian nationalist, Muslim majority, or Israel-aligned governance or employer culture
- No Western/European country as a permanent base
- He can speak freely about Israel-Palestine, US foreign policy, and his values without employment or legal risk
- He will not compromise his political voice for an employer

---

## THE STRATEGIC QUESTIONS

Answer each of the following with specificity, current data, and honest tradeoff analysis. Do not give him generic expat advice. Apply his exact profile.

### QUESTION 1: TIMING — How many more years in the US optimizes lifetime wealth?

Given his current Google total comp likely in the $195K–$250K range (Seattle market, senior IC/PgM L5-L6), what is the mathematical case for staying in the US for 1, 2, 3, or 5 more years before Bangkok?

Factor in:
- US tech AI market comp trajectory for his archetype (AI Solutions Architect / Forward Deployed Engineer / Applied AI PgM) in 2026–2028
- The cost-of-living differential between Seattle and Bangkok (his spending power multiplies dramatically — what does this mean for net wealth accumulation per year?)
- What savings/runway amount makes Bangkok livable as a fully independent operator without US-employer dependency?
- Tax implications of the move (FEIE, Foreign Tax Credit, US worldwide taxation of citizens — he cannot escape US taxes by moving)
- At what savings number does the Bangkok move become self-sustaining regardless of employment?

### QUESTION 2: LEGAL STRUCTURE — What entity and tax structure maximizes his income from Bangkok?

He will be working remotely — either as an employee of a US/global company or as an independent operator. Analyze:

**Option A: Remain a US employee (W-2) while living in Bangkok**
- Which companies and roles allow full remote from Southeast Asia?
- What does US tech comp look like for remote roles at his level when the employer knows he's in Thailand?
- HR/legal risk of working US W-2 while resident in Thailand — permanent establishment risk, payroll tax issues, benefits cliff

**Option B: US LLC / S-Corp structure with client contracts**
- Wyoming or Delaware LLC for freelance/consulting
- Self-employment tax burden vs. W-2
- FEIE ($126,500 exempt in 2024, adjusts annually) — how much of his income is shielded?
- Thai tax implications: does Thailand tax foreign-sourced income for residents? What changed with Thailand's 2024 tax rule update (Revenue Department Ruling P.161/2566)?
- What consulting rate does his profile support? ($200–$400/hr range? What's realistic for his archetype?)

**Option C: Thailand BOI / SMART Visa / LTR Visa structure**
- Thailand's Long-Term Resident (LTR) Visa: "Work-From-Thailand Professional" category — does he qualify? What income/employer requirements apply?
- Thailand's SMART Visa for tech talent — eligibility for his profile
- What tax exemptions apply under LTR status? (LTR holders reportedly pay 17% flat tax on Thai-sourced income)
- What's the practical visa path for someone at his level moving to Bangkok to work remotely for non-Thai clients?

**Option D: Singapore/Hong Kong/UK entity for Asia-based billing**
- Pros/cons of billing through a Singapore Pte. Ltd. vs. keeping everything US-structured
- Singapore's tax treaty with the US; territorial tax system benefits
- Is this worth the overhead for someone at his income level?

What is the optimal structure, and what are the realistic after-tax income scenarios under each?

### QUESTION 3: EMPLOYER + CLIENT TARGETING — Which companies and client types are Bangkok-compatible at his comp level?

Name specific companies, not categories. Consider:

**Remote-first or remote-friendly AI companies that:**
- Hire internationally / allow SEA-based employees or contractors
- Do NOT have significant Israel defense/surveillance contracts (he will not work there)
- Are building the kinds of AI systems his archetype fits (Forward Deployed, AI Enablement, Solutions Architect)
- Pay at or above his $175K floor even for remote/international work
- Have cultures where his political positions (pro-Palestinian, anti-Christian nationalism) are not employment-liabilities

**Consulting/freelance client types that:**
- Pay $200–$400/hr or equivalent project rates
- Need AI agent architecture, executive comms AI, or LLM pipeline work
- Can be served entirely remotely from Bangkok
- Are not in the Israel-defense/surveillance space

Name specific companies. Name what his consulting positioning should be. Name what his rate ceiling realistically is.

### QUESTION 4: CAREER POSITIONING — What should he build in the next 12–24 months to maximize earning power from Bangkok?

Given that he is already shipping production agents at Google and has a public GitHub, what specific moves in 2026–2027 materially increase his Bangkok-independent income ceiling?

- Should he stay at Google for another 1–2 years specifically to acquire credentials/projects that command higher freelance rates?
- What certifications, publications, or public work would most move his consulting rate?
- What is the "minimum viable exit" from Google that still gives him Bangkok-level income independence?
- How should he position his public identity (thestorytellermitch.com, LinkedIn, GitHub) for the Bangkok-based operator persona?

### QUESTION 5: TAIWAN LONG-TERM — What does the career path look like from Bangkok to Taipei?

Assuming he moves to Taipei around 2032–2038:
- Taiwan Employment Gold Card: does his profile qualify under the "Digital" or "Special Professions" category? What are current (2026) income and credential requirements?
- What Taiwan-based companies or regional roles would be natural next steps from his Bangkok consulting base?
- What should he be building from 2026–2032 in Bangkok that sets up a Taipei career or consulting practice for the second half of his life?
- Is there a scenario where his Bangkok consulting practice evolves into a Southeast Asia / APAC AI consultancy that makes Taiwan a regional hub rather than a fresh start?

### QUESTION 6: RISK ASSESSMENT — What are the realistic threats to this plan?

Be direct about:
- US taxation risk: can he actually implement FEIE + LLC structure without triggering IRS scrutiny at his income level?
- Thailand political risk: the 2017 military-authored constitution is still in effect. What is the realistic scenario where Thailand's political situation becomes untenable for a gay American with public political opinions?
- Thailand LGBTQ risk: same-sex marriage is now law, but what is the realistic social and legal environment for a visibly gay foreign man living openly in Bangkok in 2026–2030?
- Employment risk: his CV documents pro-Palestinian editorial work at AJ+ and explicit BDS coverage. What is the realistic risk that this limits his employer options in the US tech market in 2026?
- The Taiwan timing risk: if the danger window extends past 2032 or Taiwan falls, what is the contingency plan from Bangkok?

---

Be specific. Use current data (2025–2026). Name actual companies, actual visa categories, actual tax rules, actual numbers. Do not hedge into vague career advice. He has done the research on the relocation side — now he needs the career and financial architecture to make it executable.
`.trim();

async function callGrok(prompt) {
  const key = process.env.XAI_API_KEY;
  if (!key) return { model: 'xai:grok', error: 'XAI_API_KEY not set' };
  const t0 = Date.now();
  for (const model of ['grok-4.3', 'grok-4-0709', 'grok-3-fast']) {
    try {
      const r = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          input: [{ role: 'user', content: prompt }],
          tools: [{ type: 'web_search' }, { type: 'x_search' }],
        }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!r.ok) { const t = await r.text(); if (r.status === 404 || r.status === 400) continue; return { model: `xai:${model}`, error: `HTTP ${r.status}: ${t.slice(0,240)}` }; }
      const j = await r.json();
      let content = j.output_text || '';
      if (!content && Array.isArray(j.output)) {
        const texts = [];
        for (const item of j.output) {
          if (item.type === 'message' && Array.isArray(item.content))
            for (const c of item.content)
              if ((c.type === 'output_text' || c.type === 'text') && c.text) texts.push(c.text);
        }
        content = texts.join('\n');
      }
      return { model: `xai:${model}+web+x_search`, content, tokens: j.usage?.total_tokens || 0, ms: Date.now() - t0 };
    } catch (e) { if (e.name === 'TimeoutError') return { model: `xai:${model}`, error: 'Timeout' }; continue; }
  }
  return { model: 'xai:grok', error: 'All variants unavailable' };
}

async function callPerplexity(prompt) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return { model: 'perplexity:sonar-deep-research', error: 'PERPLEXITY_API_KEY not set' };
  const t0 = Date.now();
  try {
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'sonar-deep-research', messages: [{ role: 'user', content: prompt }], max_tokens: 8000 }),
      signal: AbortSignal.timeout(360_000),
    });
    if (!r.ok) return { model: 'perplexity:sonar-deep-research', error: `HTTP ${r.status}: ${(await r.text()).slice(0,240)}` };
    const j = await r.json();
    return { model: 'perplexity:sonar-deep-research', content: j.choices?.[0]?.message?.content || '', citations: j.citations || [], tokens: j.usage?.total_tokens || 0, ms: Date.now() - t0 };
  } catch (e) { return { model: 'perplexity:sonar-deep-research', error: e.name === 'TimeoutError' ? 'Timeout' : String(e.message) }; }
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { model: 'google:gemini', error: 'GEMINI_API_KEY not set' };
  const t0 = Date.now();
  for (const model of ['gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-2.5-pro']) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 8000 }, tools: [{ google_search: {} }] };
      let r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300_000) });
      if (!r.ok) {
        const errTxt = await r.text();
        if (errTxt.includes('google_search')) {
          body.tools = [{ google_search_retrieval: {} }];
          r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300_000) });
          if (!r.ok) { if (r.status === 404) continue; return { model: `google:${model}`, error: `HTTP ${r.status}` }; }
        } else { if (r.status === 404) continue; return { model: `google:${model}`, error: `HTTP ${r.status}: ${errTxt.slice(0,240)}` }; }
      }
      const j = await r.json();
      return { model: `google:${model}+search`, content: (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''), tokens: j.usageMetadata?.totalTokenCount || 0, ms: Date.now() - t0 };
    } catch (e) { if (e.name === 'TimeoutError') return { model: `google:${model}`, error: 'Timeout' }; continue; }
  }
  return { model: 'google:gemini', error: 'All variants unavailable' };
}

async function callGPT(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { model: 'openai:gpt', error: 'OPENAI_API_KEY not set' };
  const t0 = Date.now();
  for (const [model, body] of [
    ['gpt-4o', { model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], max_tokens: 8000 }],
    ['o3',     { model: 'o3',     messages: [{ role: 'user', content: prompt }], max_completion_tokens: 8000 }],
    ['o1',     { model: 'o1',     messages: [{ role: 'user', content: prompt }], max_completion_tokens: 6000 }],
  ]) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(240_000),
      });
      if (!r.ok) { if (r.status === 404 || r.status === 400) continue; return { model: `openai:${model}`, error: `HTTP ${r.status}: ${(await r.text()).slice(0,240)}` }; }
      const j = await r.json();
      return { model: `openai:${model}`, content: j.choices?.[0]?.message?.content || '', tokens: j.usage?.total_tokens || 0, ms: Date.now() - t0 };
    } catch (e) { if (e.name === 'TimeoutError') return { model: `openai:${model}`, error: 'Timeout' }; continue; }
  }
  return { model: 'openai:gpt', error: 'All variants unavailable' };
}

console.log('🌏  Firing relocation career strategy research across 4 models in parallel...');
console.log('    Profile: Mitchell Williams — Google AI PgM → Bangkok → Taipei');
console.log('    Questions: timing, legal structure, employer targeting, positioning, Taiwan path, risk');
console.log(`    Output: ${OUT}\n`);

const t0 = Date.now();
const [grok, perplexity, gemini, gpt] = await Promise.all([
  callGrok(PROMPT).then(r => { console.log(`  ✓ Grok        ${r.error ? '❌ ' + r.error : '✅ ' + r.ms + 'ms'}`); return r; }),
  callPerplexity(PROMPT).then(r => { console.log(`  ✓ Perplexity  ${r.error ? '❌ ' + r.error : '✅ ' + r.ms + 'ms'}`); return r; }),
  callGemini(PROMPT).then(r => { console.log(`  ✓ Gemini      ${r.error ? '❌ ' + r.error : '✅ ' + r.ms + 'ms'}`); return r; }),
  callGPT(PROMPT).then(r => { console.log(`  ✓ GPT/o3      ${r.error ? '❌ ' + r.error : '✅ ' + r.ms + 'ms'}`); return r; }),
]);

console.log(`\n  Total: ${((Date.now()-t0)/1000).toFixed(1)}s\n`);

let out = `# Relocation Career Strategy — Mitchell Williams — ${TODAY}\n\n`;
out += `Profile: Google AI PgM + Agent Builder → Bangkok (2026–2032) → Taipei (2032+)\n`;
out += `Questions: timing | legal structure | employer targeting | positioning | Taiwan path | risk\n\n---\n\n`;

for (const r of [grok, perplexity, gemini, gpt]) {
  out += `## ${r.model}${r.tokens ? ` (${r.tokens} tok, ${r.ms}ms)` : ''}\n\n`;
  out += r.error ? `> ❌ Error: ${r.error}\n\n` : r.content + '\n\n';
  if (r.citations?.length) out += `**Citations:**\n${r.citations.map((c,i)=>`${i+1}. ${c}`).join('\n')}\n\n`;
  out += '---\n\n';
}

writeFileSync(OUT, out);
console.log(`📄  Results written to: ${OUT}`);
