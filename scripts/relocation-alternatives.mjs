#!/usr/bin/env node
/**
 * relocation-alternatives.mjs
 *
 * If Thailand is eliminated by burning season — what's left?
 * East Asian cities/towns + South American options (Medellín, CDMX, Uruguay, etc.)
 * Applied against the user's full filter set.
 *
 * Usage: node scripts/relocation-alternatives.mjs
 * Output: /tmp/relocation-alternatives-YYYY-MM-DD.md
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
const OUT = `/tmp/relocation-alternatives-${TODAY}.md`;

const PROMPT = `
You are conducting rigorous relocation analysis for a specific individual who has eliminated
Thailand from his short-term relocation list due to burning season air quality concerns (specifically
the February–April agricultural burning that causes hazardous AQI 300+ conditions, particularly
in northern Thailand / Chiang Mai). Bangkok's traffic pollution is acknowledged as a separate,
lesser concern.

He has also permanently eliminated: Taiwan (short-term, due to 2027-2030 PRC conflict risk),
Japan (far-right resurgence, no marriage equality), India (BJP), Bhutan (LGBTQ invisibility),
ALL Western and European countries (cyclical ethnocentrism/xenophobia), ALL majority Muslim
countries, ALL Christian nationalist countries, ALL single-party authoritarian states.

Taiwan remains his long-term (2032+) forever-home target. The question is: what is his SHORT-TERM
base (2026–2032) if Thailand is also eliminated?

---

## HIS NON-NEGOTIABLE FILTERS (apply all four as eliminators):

**F1 — Political structure, not cultural texture:**
He is not filtering for Buddhist aesthetics. He is filtering to AVOID Christian nationalist,
Muslim majority, or Israel-aligned political power structures that historically enable fascism
and xenophobia. A country with Catholic/Christian cultural heritage that operates as a secular
liberal democracy with no meaningful religious political leverage (e.g., Uruguay) PASSES this
filter. A country with Buddhist nationalist movements that operate politically (e.g., Sri Lanka,
Myanmar, Thailand to a lesser degree) is a concern but not automatic elimination if democracy
holds. The question is: who controls political power and through what ideological apparatus?

**F2 — Democratic governance with no far-right fascist leverage.**
No military-authored constitutions functioning as override mechanisms. No single-party states.
No governments where far-right parties control coalition governance. A far-right party at 18%
in opposition with no ministerial positions is different from a far-right party governing.

**F3 — LGBTQ physical safety + social normalization + long arc structural safety.**
Not just legal status. Not just a gay district. A 41-year-old gay man needs to be able to
live openly — walk with a partner, exist in non-LGBTQ spaces, have his relationship legally
recognized and practically respected — without concealment or performance. "Decriminalized
but not normalized" is not sufficient for a forever-home evaluation. Physical safety is
a baseline; social normalization is the actual filter.

**F4 — Embedded vegetarian/vegan food culture + food safety materially better than US industrial.**
He is fully plant-based. The food culture must be structurally vegetarian/vegan, not just
"has vegetarian restaurants." Buddhist/Hindu temple food culture, Mesoamerican pre-colonial
plant-based staples, or strong organic agricultural movements all qualify. A city where
being vegan requires constant negotiation and special-ordering is not viable for a forever
home. Food safety: EU-level pesticide/contamination standards are the benchmark. US industrial
(51% EU MRL exceedance threshold) is the floor he is trying to beat, not match.

**Additional hard eliminators:**
- Countries that have been significant supporters of Israel's conduct in Gaza (post-October 2023)
- Countries experiencing active burning season equivalent that creates hazardous air quality
  for months per year
- Countries where healthcare infrastructure requires leaving for serious medical care
  (he is 41, planning a 40-year life — world-class hospital access is required, defined as
  JCI-accredited facilities or equivalent with specialist access for cardiology, oncology,
  complex surgery WITHOUT requiring international medical evacuation)

---

## SPECIFIC LOCATIONS TO EVALUATE

Assess each of the following honestly against all filters. Do not pad. If something fails,
say which filter and why. If something passes, say which specific data supports it.

### EAST ASIA / SOUTHEAST ASIA

**1. Bangkok, Thailand (burning season reassessment)**
Is Bangkok's air quality problem categorically different from Chiang Mai's burning season?
What are Bangkok's actual monthly AQI averages? Is there a period of the year where Bangkok's
air quality drops to hazardous levels? Is it the same agricultural burning phenomenon or
traffic/industrial pollution that is manageable differently? Can a Bangkok resident meaningfully
mitigate the air quality risk (HEPA filtration, timing, short trips elsewhere) in a way that
Chiang Mai residents cannot?

**2. South Korea (Seoul or secondary cities)**
Be direct about the Christian evangelical political movement — is it Christian nationalist in
the sense the user means (political power + xenophobia + anti-LGBTQ state leverage), or is it
a large minority with cultural influence but no state power? What is the realistic LGBTQ
environment for a visibly gay foreign man in Seoul in 2026? Is marriage equality likely in
the next 5–10 years given the 2027 Supreme Court cases? What does the actual daily
normalization look like vs. the legal status gap?

**3. Nepal (Kathmandu or Pokhara)**
Healthcare is the primary concern. What is the realistic medical infrastructure in 2026?
Can a 41-year-old with potential age-related health needs be served adequately without
medical evacuation to Bangkok or Delhi? What is the LGBTQ normalization level in practice
(not just the 2023 Supreme Court ruling, but daily life in Kathmandu)?

**4. Vietnam (Ho Chi Minh City / Da Nang)**
Single-party communist. Does the CPV operate with the ideological rigidity of the Chinese CCP
or with more practical pragmatism? Is there any scenario where Vietnam passes F2 in a
"functionally democratic with authoritarian structure" reading? What is the LGBTQ situation
in Ho Chi Minh City in 2026 — physical safety, social tolerance, legal risk?

**5. Any overlooked East/Southeast Asian city or town**
Are there cities, towns, or areas in East or Southeast Asia that this analysis has missed?
Look specifically at:
- Island or regional exceptions within larger countries (though national law applies)
- Smaller democracies or territories with non-standard political arrangements
- Cities within democratic non-Abrahamic countries that may have been overlooked
Be honest if there are none. Do not manufacture options.

### SOUTH AMERICA

**6. Medellín, Colombia**
Apply the filters directly. Colombia's political landscape includes Centro Democrático,
the evangelical conservative movement, and Uribismo — does this constitute Christian
nationalist political leverage in the user's sense? Is the current Petro government
a meaningful counterweight, and is it durable? What is the LGBTQ normalization level
in Medellín specifically vs. Colombia broadly? What is the expat gentrification resentment
situation in 2026 (he has already flagged this as a concern re: Spain)? Is Medellín's
food culture compatible with a fully plant-based lifestyle? What is Colombia's position
on Israel?

**7. Mexico City (CDMX) and/or Oaxaca**
This is a serious candidate — assess it fully.
F1: Mexico's governance is secular-left under Sheinbaum. The pre-colonial Mesoamerican
heritage (Aztec/Zapotec/Maya) is a genuine non-Abrahamic cultural substrate. Is CDMX's
day-to-day civic life meaningfully non-Abrahamic in the way the user needs? Or is Catholic
cultural dominance pervasive enough in daily life to feel like an Abrahamic environment?
F2: Is Morena's governance democratic in the structural sense? What is the realistic
risk of democratic backsliding? How strong is the far-right PAN/PRI/Frente Amplio opposition?
F3: Marriage equality nationwide since 2022, CDMX since 2010. What is the daily LGBTQ
normalization level for a visibly gay foreign man in Roma Norte / Condesa in 2026?
Physical safety specifically — not just legal status.
F4: Pre-colonial Mexican food culture is plant-heavy (corn/bean/squash). Oaxacan cuisine
is particularly vegetarian-rich. What is the food safety situation for a plant-based
resident sourcing from CDMX markets? What are the pesticide/contamination benchmarks?
Healthcare: ABC Medical Center, Médica Sur, Angeles hospitals. What is the actual quality
of specialist care for a 41-year-old long-term resident?
Gentrification: Roma/Condesa/Oaxaca are experiencing heavy American expat influx with
documented local resentment. How acute is this in 2026 and what does it mean for his
situation as an American settling there?
Mexico's Israel position: What is Sheinbaum's government's actual position?

**8. Uruguay (Montevideo)**
F1: Uruguay is the most secular country in Latin America — formally separated church from
state in 1919, Christmas is "Family Day," Easter is "Tourism Week." Does this qualify
as passing F1 under the user's definition (no Abrahamic political power structures)?
Or does the European settler-colonial cultural heritage disqualify it as "Western"?
F2: Stable liberal democracy with no meaningful far-right fascist leverage as of 2026.
F3: Marriage equality since 2013. What is the daily LGBTQ normalization level in Montevideo?
F4: Beef culture. What is the food safety standard? Is there a vegetarian food culture
emerging or is this a fundamental lifestyle incompatibility?
Healthcare: What is the realistic quality of the private mutualista system?
Israel position?

**9. Argentina (Buenos Aires, pre-Milei assessment + current reality)**
Milei's government: does it constitute Christian nationalist political leverage + Israel
alignment? Be specific — Milei has described himself as "God's lion," has met repeatedly
with Netanyahu, and has positioned Argentina as Israel's strongest South American ally.
Does this eliminate Argentina under the user's filters?

**10. Any overlooked South American city or town**
Are there cities or areas in South America this analysis has missed — specifically places
with: secular or non-Abrahamic political culture, marriage equality or strong LGBTQ rights,
embedded vegetarian food culture, good private healthcare, not experiencing acute expat
gentrification resentment? Consider secondary cities, coastal or interior towns, regional
exceptions. Name them specifically or honestly state there are none.

---

## WHAT HE SPECIFICALLY NEEDS:

1. **Air quality map** — Which of the above locations have hazardous air quality seasons
   comparable to Thailand's burning season? Which have year-round manageable air quality?

2. **Filter-by-filter scorecard** — For each location, which filters pass, which fail,
   and what is the specific evidence (not vague assessment)?

3. **The honest global conclusion** — After applying the full filter set to every serious
   candidate outside of Taiwan and Thailand, is there a clean short-term (2026–2032) base
   that passes all four filters? If not, what is the best one-filter compromise and which
   filter is it?

4. **South America specifically** — Is Mexico City or any South American city a genuine
   functional equivalent to Bangkok for this person's needs? Or is South America a category
   that fails on structural grounds (Catholic political culture, food safety, gentrification)?

Be direct. Use 2025–2026 data. Name actual data where it exists. Do not manufacture options
that do not exist. If the answer is "there is nothing else that passes," say that clearly.
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

console.log('🌏  Firing relocation alternatives research across 4 models in parallel...');
console.log('    Thailand eliminated (burning season) — scanning East Asia + South America');
console.log(`    Output: ${OUT}\n`);

const t0 = Date.now();
const [grok, perplexity, gemini, gpt] = await Promise.all([
  callGrok(PROMPT).then(r => { console.log(`  ✓ Grok        ${r.error ? '❌ ' + r.error : '✅ ' + r.ms + 'ms'}`); return r; }),
  callPerplexity(PROMPT).then(r => { console.log(`  ✓ Perplexity  ${r.error ? '❌ ' + r.error : '✅ ' + r.ms + 'ms'}`); return r; }),
  callGemini(PROMPT).then(r => { console.log(`  ✓ Gemini      ${r.error ? '❌ ' + r.error : '✅ ' + r.ms + 'ms'}`); return r; }),
  callGPT(PROMPT).then(r => { console.log(`  ✓ GPT/o3      ${r.error ? '❌ ' + r.error : '✅ ' + r.ms + 'ms'}`); return r; }),
]);

console.log(`\n  Total: ${((Date.now()-t0)/1000).toFixed(1)}s\n`);

let out = `# Relocation Alternatives — Thailand Eliminated — ${TODAY}\n\n`;
out += `Scanning: East Asia + South America against full filter set\n\n---\n\n`;

for (const r of [grok, perplexity, gemini, gpt]) {
  out += `## ${r.model}${r.tokens ? ` (${r.tokens} tok, ${r.ms}ms)` : ''}\n\n`;
  out += r.error ? `> ❌ Error: ${r.error}\n\n` : r.content + '\n\n';
  if (r.citations?.length) out += `**Citations:**\n${r.citations.map((c,i)=>`${i+1}. ${c}`).join('\n')}\n\n`;
  out += '---\n\n';
}

writeFileSync(OUT, out);
console.log(`📄  Results written to: ${OUT}`);
