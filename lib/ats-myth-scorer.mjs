/**
 * lib/ats-myth-scorer.mjs
 * Detect ATS-bypass anti-patterns in CV/JD pairs.
 *
 * Finding #50 (dashboard-optimization-strategy): "no production-grade ATS bypass exists."
 * This scorer warns when materials drift into anti-patterns that create risk (ATS
 * rejection, recruiter red flags) without delivering any real bypass benefit.
 *
 * Deterministic — no LLM calls, no new deps.
 */

// ─── Band thresholds ──────────────────────────────────────────────────────────
const BANDS = [
  { max: 15, band: 'clean', label: 'Clean', description: 'No detectable ATS anti-patterns.' },
  { max: 35, band: 'mild', label: 'Mild', description: 'Minor patterns detected — low risk, monitor.' },
  { max: 60, band: 'moderate', label: 'Moderate', description: 'Notable anti-patterns — review recommended.' },
  { max: 100, band: 'high-risk', label: 'High Risk', description: 'Multiple ATS bypass signals detected — revise before submitting.' },
];

// ─── Signal detectors ─────────────────────────────────────────────────────────

/**
 * Detect white/invisible text in HTML (classic keyword-stuffing hack).
 * Signals: color:#fff|white combined with text content that isn't in a visible hero/button.
 *
 * @param {string} html
 * @returns {{ detected: boolean, instances: string[], weight: number }}
 */
function detectWhiteText(html) {
  if (!html) return { detected: false, instances: [], weight: 0 };

  const instances = [];

  // Match inline style with white/near-white color on elements with text content
  const whiteColorRe = /(?:color\s*:\s*(?:#(?:fff|ffffff|fefefe|f0f0f0)|white|rgb\(25[0-5],\s*25[0-5],\s*25[0-5]\)))/gi;
  const styleTagRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;

  // Check inline styles
  const inlineRe = /style\s*=\s*["'][^"']*(?:color\s*:\s*(?:#(?:fff|ffffff)|white))[^"']*["']/gi;
  let m;
  while ((m = inlineRe.exec(html)) !== null) {
    instances.push(`inline white-color style at char ${m.index}`);
  }

  // Check style blocks for color:white rules
  while ((m = styleTagRe.exec(html)) !== null) {
    const block = m[1];
    if (whiteColorRe.test(block)) {
      instances.push('style block contains white/near-white color rule');
      whiteColorRe.lastIndex = 0;
    }
  }

  return {
    detected: instances.length > 0,
    instances,
    weight: instances.length > 0 ? Math.min(30, instances.length * 10) : 0,
  };
}

/**
 * Detect font-size:0, font-size:1px — hidden text trick.
 *
 * @param {string} html
 * @returns {{ detected: boolean, instances: string[], weight: number }}
 */
function detectHiddenFontSize(html) {
  if (!html) return { detected: false, instances: [], weight: 0 };

  const instances = [];
  const re = /font-size\s*:\s*(?:0(?:px)?|1px|\.1(?:px|rem|em))/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    instances.push(`tiny font-size at char ${m.index}: "${m[0]}"`);
  }

  return {
    detected: instances.length > 0,
    instances,
    weight: instances.length > 0 ? Math.min(35, instances.length * 12) : 0,
  };
}

/**
 * Detect two-column HTML layouts. Many ATS parsers fail on multi-column HTML,
 * leading to garbled text ordering and dropped keywords.
 *
 * @param {string} html
 * @returns {{ detected: boolean, instances: string[], weight: number }}
 */
function detectTwoColumnLayout(html) {
  if (!html) return { detected: false, instances: [], weight: 0 };

  const instances = [];

  // CSS grid/flex with >=2 columns
  const gridColRe = /grid-template-columns\s*:[^;]*(?:\s+\S+){1,}/gi;
  let m;
  while ((m = gridColRe.exec(html)) !== null) {
    // More than 1 column
    const val = m[0];
    const cols = val.split(/\s+(?!\s*:)/).filter(t => t && !t.includes(':'));
    if (cols.length >= 2) {
      instances.push(`grid-template-columns multi-col: "${val.trim().substring(0, 60)}"`);
    }
  }

  // float:left/right on adjacent divs (classic 2-col trick)
  const floatRe = /float\s*:\s*(?:left|right)/gi;
  const floatCount = (html.match(floatRe) ?? []).length;
  if (floatCount >= 2) {
    instances.push(`${floatCount} float declarations — likely 2-column layout`);
  }

  // display:flex + width hints
  const flexColRe = /display\s*:\s*flex[^}]*(?:width\s*:\s*(?:4[0-9]|5[0-5])%)/gi;
  while ((m = flexColRe.exec(html)) !== null) {
    instances.push('flex-based 2-column hint detected');
  }

  return {
    detected: instances.length > 0,
    instances,
    weight: instances.length > 0 ? Math.min(20, instances.length * 7) : 0,
  };
}

/**
 * Detect keyword-density spikes: any single token appearing >5% of all words.
 *
 * @param {string} text  plain text (CV or JD)
 * @param {number} [threshold=0.05]
 * @returns {{ detected: boolean, instances: string[], weight: number }}
 */
function detectKeywordDensitySpike(text, threshold = 0.05) {
  if (!text || text.length < 50) return { detected: false, instances: [], weight: 0 };

  // Tokenize: lowercase alpha sequences of length >= 4 (skip stopwords via length)
  const tokens = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  if (tokens.length < 20) return { detected: false, instances: [], weight: 0 };

  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);

  const instances = [];
  for (const [word, count] of freq.entries()) {
    const density = count / tokens.length;
    if (density > threshold) {
      instances.push(`"${word}" appears ${count}x (${(density * 100).toFixed(1)}% of words)`);
    }
  }

  return {
    detected: instances.length > 0,
    instances,
    weight: instances.length > 0 ? Math.min(25, instances.length * 8) : 0,
  };
}

/**
 * Detect inline display:none blocks — hidden keyword containers.
 *
 * @param {string} html
 * @returns {{ detected: boolean, instances: string[], weight: number }}
 */
function detectDisplayNone(html) {
  if (!html) return { detected: false, instances: [], weight: 0 };

  const instances = [];
  const re = /display\s*:\s*none/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    instances.push(`display:none at char ${m.index}`);
  }

  return {
    detected: instances.length > 0,
    instances,
    weight: instances.length > 0 ? Math.min(30, instances.length * 10) : 0,
  };
}

/**
 * Detect visibility:hidden blocks — another invisible keyword container approach.
 *
 * @param {string} html
 * @returns {{ detected: boolean, instances: string[], weight: number }}
 */
function detectVisibilityHidden(html) {
  if (!html) return { detected: false, instances: [], weight: 0 };

  const instances = [];
  const re = /visibility\s*:\s*hidden/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    instances.push(`visibility:hidden at char ${m.index}`);
  }

  return {
    detected: instances.length > 0,
    instances,
    weight: instances.length > 0 ? Math.min(25, instances.length * 8) : 0,
  };
}

/**
 * Detect keyword list dumps in plain text: lines that are purely comma/pipe
 * separated keywords with no context (common in old "keyword section" myths).
 *
 * @param {string} text
 * @returns {{ detected: boolean, instances: string[], weight: number }}
 */
function detectKeywordDump(text) {
  if (!text) return { detected: false, instances: [], weight: 0 };

  const instances = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 20) continue;
    // A keyword dump: mostly word-like tokens separated by delimiters, no sentence structure
    const words = trimmed.split(/[,|/•·]+/).map(w => w.trim()).filter(Boolean);
    if (words.length >= 6) {
      const avgLen = words.reduce((s, w) => s + w.length, 0) / words.length;
      const hasVerbs = /\b(?:managed|built|led|created|developed|designed|shipped|delivered)\b/i.test(trimmed);
      if (avgLen < 15 && !hasVerbs && words.length >= 6) {
        instances.push(`Possible keyword dump: "${trimmed.substring(0, 80)}..."`);
      }
    }
  }

  return {
    detected: instances.length > 0,
    instances,
    weight: instances.length > 0 ? Math.min(20, instances.length * 5) : 0,
  };
}

// ─── Score aggregation ────────────────────────────────────────────────────────

/**
 * Map raw score to band object.
 */
function scoreToBand(score) {
  for (const b of BANDS) {
    if (score <= b.max) return b;
  }
  return BANDS[BANDS.length - 1];
}

/**
 * Primary export: score a CV/JD pair for ATS-bypass anti-patterns.
 *
 * @param {object} params
 * @param {string} params.cvText      plain-text CV
 * @param {string} params.jdText      plain-text JD (used for keyword density comparison)
 * @param {string} [params.cvHtml]    HTML source of CV (for structural checks)
 * @param {object} [params.cvPdfMeta] PDF metadata (currently unused, reserved for future)
 * @returns {{ score: number, band: string, signals_detected: Array, recommendations: Array }}
 */
export function scoreAtsMyth({ cvText, jdText, cvHtml, cvPdfMeta }) {
  const signals_detected = [];
  let total_weight = 0;

  // Run all detectors
  const htmlChecks = [
    { name: 'white_text', fn: () => detectWhiteText(cvHtml), severity: 'critical' },
    { name: 'hidden_font_size', fn: () => detectHiddenFontSize(cvHtml), severity: 'critical' },
    { name: 'two_column_layout', fn: () => detectTwoColumnLayout(cvHtml), severity: 'moderate' },
    { name: 'display_none', fn: () => detectDisplayNone(cvHtml), severity: 'critical' },
    { name: 'visibility_hidden', fn: () => detectVisibilityHidden(cvHtml), severity: 'critical' },
  ];

  const textChecks = [
    { name: 'keyword_density_spike', fn: () => detectKeywordDensitySpike(cvText), severity: 'moderate' },
    { name: 'keyword_dump', fn: () => detectKeywordDump(cvText), severity: 'low' },
  ];

  const allChecks = [...(cvHtml ? htmlChecks : []), ...textChecks];

  for (const check of allChecks) {
    const result = check.fn();
    if (result.detected) {
      signals_detected.push({
        signal: check.name,
        severity: check.severity,
        instances: result.instances,
        weight: result.weight,
      });
      total_weight += result.weight;
    }
  }

  const score = Math.min(100, total_weight);
  const bandInfo = scoreToBand(score);

  const recommendations = buildRecommendations(signals_detected, score);

  return {
    score,
    band: bandInfo.band,
    band_label: bandInfo.label,
    band_description: bandInfo.description,
    signals_detected,
    recommendations,
  };
}

/**
 * Generate actionable recommendations based on detected signals.
 *
 * @param {Array} signals
 * @param {number} score
 * @returns {string[]}
 */
function buildRecommendations(signals, score) {
  const recs = [];

  const has = (name) => signals.some(s => s.signal === name);

  if (has('white_text') || has('hidden_font_size') || has('display_none') || has('visibility_hidden')) {
    recs.push('Remove all invisible/hidden text — ATS parsers detect this; recruiters who notice it disqualify immediately.');
  }

  if (has('two_column_layout')) {
    recs.push('Switch to single-column HTML for ATS submission. Two-column layouts cause text to be read in wrong order by most ATS parsers.');
  }

  if (has('keyword_density_spike')) {
    recs.push('Reduce keyword density — spikes above 5% trigger spam filters in modern ATS. Integrate keywords naturally into achievement bullets instead.');
  }

  if (has('keyword_dump')) {
    recs.push('Replace keyword dump sections with contextual bullets. "Skills: Python, SQL, LLMs" is weaker than a bullet demonstrating those skills in context.');
  }

  if (score === 0) {
    recs.push('No ATS anti-patterns detected. Focus on content quality: quantified achievements, role-keyword alignment, clean formatting.');
  }

  if (score > 35) {
    recs.push('Finding #50 reminder: no production-grade ATS bypass exists. Clean formatting + genuine keyword alignment outperforms all bypass tactics.');
  }

  return recs;
}

/**
 * Render an HTML card for inline display when reviewing AI-drafted materials.
 *
 * @param {object} result  output of scoreAtsMyth()
 * @returns {string} HTML snippet
 */
export function renderAtsCard(result) {
  const bandColors = {
    clean: '#68d391',
    mild: '#f6e05e',
    moderate: '#f6ad55',
    'high-risk': '#fc8181',
  };
  const color = bandColors[result.band] ?? '#a0aec0';

  const signalRows = result.signals_detected.length > 0
    ? result.signals_detected.map(s => `
      <tr>
        <td style="padding:4px 8px;color:${s.severity === 'critical' ? '#fc8181' : '#f6ad55'};font-weight:600">${s.signal.replace(/_/g, ' ')}</td>
        <td style="padding:4px 8px;color:#a0aec0;font-size:11px">${s.instances.slice(0, 2).join(' | ')}</td>
        <td style="padding:4px 8px;text-align:right;color:#e2e8f0">+${s.weight}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:4px 8px;color:#68d391">No signals detected</td></tr>`;

  const recList = result.recommendations.map(r =>
    `<li style="margin-bottom:4px;color:#e2e8f0">${r}</li>`
  ).join('');

  return `
<div class="ats-myth-card" style="font-family:system-ui,sans-serif;font-size:13px;color:#e2e8f0;padding:16px;background:#1a202c;border-radius:8px;min-width:320px;max-width:560px">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    <div style="font-weight:600;font-size:15px;color:#90cdf4">ATS Myth Score</div>
    <div style="font-size:22px;font-weight:700;color:${color}">${result.score}</div>
    <div style="background:${color};color:#1a202c;font-weight:700;font-size:11px;padding:2px 7px;border-radius:12px;text-transform:uppercase">${result.band_label}</div>
  </div>
  <div style="color:#a0aec0;font-size:12px;margin-bottom:12px">${result.band_description}</div>

  ${result.signals_detected.length > 0 ? `
  <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12px">
    <thead><tr style="border-bottom:1px solid #2d3748">
      <th style="text-align:left;padding:4px 8px;color:#718096;font-size:10px">Signal</th>
      <th style="text-align:left;padding:4px 8px;color:#718096;font-size:10px">Detail</th>
      <th style="text-align:right;padding:4px 8px;color:#718096;font-size:10px">Pts</th>
    </tr></thead>
    <tbody>${signalRows}</tbody>
  </table>` : ''}

  <div>
    <div style="color:#a0aec0;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Recommendations</div>
    <ul style="margin:0;padding-left:16px;font-size:12px">${recList}</ul>
  </div>
</div>`.trim();
}

export { BANDS };
