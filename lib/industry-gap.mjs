/**
 * lib/industry-gap.mjs — Adjacent-Industry Radar (Inventory B2, v1)
 *
 * Mitchell's quote: "the highest paying industries when it comes to
 * incentivizing my entire experience and my goals to build ai products
 * that's outside the realm of their capabilities and day to day knowledge"
 *
 * v1 ships a static-table radar that scores ~12 non-tech industries by:
 *   - compensation_density: estimated % of roles paying ≥$250K USD (from public
 *     compensation surveys + Mitchell's calibration brief)
 *   - ai_gap: estimated distance from AI-native capability (higher = more
 *     opportunity for someone like Mitchell to be the bridge)
 *   - fit_with_mitchell: how well Mitchell's comms × builder stack maps
 *
 * Composite score = 0.4 × compensation_density + 0.35 × ai_gap + 0.25 × fit
 *
 * No LLM, no fetcher. The seed table here is from public references; Mitchell
 * can edit values + ranking as he learns. Future v2 could re-derive these from
 * Levels.fyi / Glassdoor / industry-deployment-maturity APIs.
 */

// Seed table — 2026-05-18.
// compensation_density: 0-1, % of roles paying ≥$250K (rough heuristic)
// ai_gap: 0-1, higher = more opportunity (less AI-native already)
// fit_with_mitchell: 0-1, how well comms × builder × FDE × AI-PgM maps
const SEED_TABLE = [
  // Finance — Mitchell's brief calls this out as a high-WTP non-tech sector
  { industry: 'Hedge Funds / Quant',     compensation_density: 0.85, ai_gap: 0.55, fit_with_mitchell: 0.65, notes: 'Top of comp density. Quant tools are already AI-adjacent but very few have FDE/comms-bridge layer. Mitchell could land at a fund building internal AI ops.' },
  { industry: 'Private Equity',          compensation_density: 0.80, ai_gap: 0.70, fit_with_mitchell: 0.55, notes: 'High comp density. Lots of AI gap — most PE firms still use Excel + analysts. Operator + AI-builder profile rare here.' },
  { industry: 'Investment Banking',      compensation_density: 0.75, ai_gap: 0.65, fit_with_mitchell: 0.50, notes: 'Trading desks moving fast; deal teams still slow. Mitchell would need to learn industry vernacular.' },
  { industry: 'Wealth Management',       compensation_density: 0.55, ai_gap: 0.75, fit_with_mitchell: 0.55, notes: 'AI-advisor revolution underway. Comms/client-facing AI = perfect fit. Lower comp ceiling than HF.' },

  // Health — Mitchell's brief calls this out too
  { industry: 'Pharma R&D',              compensation_density: 0.70, ai_gap: 0.60, fit_with_mitchell: 0.50, notes: 'Late-stage AI adoption in trials + drug discovery. Comm role would be AI-explainer to MDs.' },
  { industry: 'Medical Devices',         compensation_density: 0.60, ai_gap: 0.70, fit_with_mitchell: 0.45, notes: 'Slower AI adoption. Comms + builder role would be early-team.' },
  { industry: 'HealthTech (Series B+)',  compensation_density: 0.55, ai_gap: 0.40, fit_with_mitchell: 0.75, notes: 'AI-native already; closer to tech. Higher fit, lower gap.' },
  { industry: 'Biotech (Genomics/AI)',   compensation_density: 0.70, ai_gap: 0.50, fit_with_mitchell: 0.60, notes: 'AI-genomics players hiring AI-PgM + comms hybrids. Comp comparable to top tech.' },

  // Legal
  { industry: 'AmLaw 100 (Legal Tech)',  compensation_density: 0.75, ai_gap: 0.80, fit_with_mitchell: 0.50, notes: 'Highest AI gap of any field — almost zero internal AI tooling. Mitchell could be the AI-bridge but legal vernacular is steep.' },

  // Insurance
  { industry: 'Insurance (Underwriting)',compensation_density: 0.55, ai_gap: 0.70, fit_with_mitchell: 0.50, notes: 'High AI gap; lower comp ceiling. Underwriting/claims AI = real opportunity.' },

  // Energy / industrials
  { industry: 'Energy Trading',          compensation_density: 0.80, ai_gap: 0.60, fit_with_mitchell: 0.45, notes: 'Very high comp. AI gap moderate. Industry vernacular very steep.' },
  { industry: 'Aerospace / Defense',     compensation_density: 0.65, ai_gap: 0.55, fit_with_mitchell: 0.40, notes: 'Clearance often required. AI-PgM roles emerging.' },
];

const WEIGHT_COMP = 0.40;
const WEIGHT_AI_GAP = 0.35;
const WEIGHT_FIT = 0.25;

/**
 * Compute composite score per industry + return ranked list.
 * @returns {Array<{rank, industry, score, compensation_density, ai_gap, fit_with_mitchell, notes}>}
 */
export function getIndustryGapRanking() {
  return SEED_TABLE
    .map((entry) => {
      const score = Math.round((
        WEIGHT_COMP * entry.compensation_density +
        WEIGHT_AI_GAP * entry.ai_gap +
        WEIGHT_FIT * entry.fit_with_mitchell
      ) * 100);
      return { ...entry, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((row, i) => ({ rank: i + 1, ...row }));
}

/**
 * Render the radar table HTML for the drill-in popout.
 * @param {Array<Object>} ranked - result of getIndustryGapRanking()
 * @returns {string} HTML
 */
export function renderIndustryGapTable(ranked) {
  if (!ranked || !ranked.length) {
    return '<p style="color:var(--text-3);font-size:12px">No industry data — edit lib/industry-gap.mjs SEED_TABLE to populate.</p>';
  }
  const rows = ranked.map((r) => `
    <tr>
      <td style="padding:6px 10px;font-family:var(--font-mono);font-size:11px;color:var(--text-3);text-align:right">${r.rank}</td>
      <td style="padding:6px 10px;font-weight:600;color:var(--text)">${escape(r.industry)}</td>
      <td style="padding:6px 10px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:var(--text)">${r.score}</td>
      <td style="padding:6px 10px;text-align:right;font-size:11px;color:var(--text-3);font-variant-numeric:tabular-nums">${Math.round(r.compensation_density * 100)}%</td>
      <td style="padding:6px 10px;text-align:right;font-size:11px;color:var(--text-3);font-variant-numeric:tabular-nums">${Math.round(r.ai_gap * 100)}%</td>
      <td style="padding:6px 10px;text-align:right;font-size:11px;color:var(--text-3);font-variant-numeric:tabular-nums">${Math.round(r.fit_with_mitchell * 100)}%</td>
    </tr>
    <tr><td colspan="6" style="padding:0 10px 8px 32px;font-size:11px;color:var(--text-3);font-style:italic">${escape(r.notes)}</td></tr>
  `).join('');
  return `
<div style="font-size:13px;color:var(--text-2);line-height:1.5">
  <p style="margin:0 0 12px;color:var(--text-3);font-size:12px">Composite 0-100 = 0.40×Comp + 0.35×AI-gap + 0.25×Fit. Higher = better opportunity for an AI-bridge profile like yours. Edit <code>lib/industry-gap.mjs</code> to tune weights or add industries.</p>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead>
      <tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">#</th>
        <th style="text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">Industry</th>
        <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">Score</th>
        <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">Comp</th>
        <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">AI-gap</th>
        <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">Fit</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`.trim();
}

function escape(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// CLI: node lib/industry-gap.mjs
const __isMain = import.meta.url === `file://${process.argv[1]}`;
if (__isMain) {
  console.log(JSON.stringify(getIndustryGapRanking(), null, 2));
}
