/**
 * lib/heartbeat-system-banner.mjs — System-status banner for the heartbeat email.
 *
 * Per calibration brief 2026-05-16: heartbeat email should include a banner
 * confirming which Tier 5 system features are active + a runway-alert section
 * computed from the recruiter-pipeline-density widget data.
 *
 * Usage (from scripts/heartbeat.mjs):
 *   import { renderSystemBanner, renderRunwayAlert } from './lib/heartbeat-system-banner.mjs';
 *   const bannerHtml = renderSystemBanner({ format: 'html' });
 *   const runwayHtml = renderRunwayAlert({ format: 'html' });
 *
 * The banner reads the current state of the system to decide what to surface:
 *   - Are caps active? (PER_RUN_CAP_RUN_BATCH_USD set / default $25)
 *   - Is burst mode active?
 *   - Has TTO scoring landed? (lib/tto-estimator.mjs exists)
 *   - Has toxicity scoring landed? (lib/toxicity-scorer.mjs exists)
 *   - Has corpus auto-edit infra landed? (scripts/agent-commit.mjs exists)
 *   - Pipeline density health verdict (computed via dashboard API or directly)
 *
 * Wire into scripts/heartbeat.mjs near the top of the daily summary body.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function exists(rel) { return existsSync(join(ROOT, rel)); }

function getActiveFeatures() {
  return [
    { label: 'Per-run cost caps',                active: true,
      detail: `Run Batch $${process.env.PER_RUN_CAP_RUN_BATCH_USD || '25'} · Process All $${process.env.PER_RUN_CAP_PROCESS_ALL_USD || '250'} · Monthly $${process.env.MONTHLY_BUDGET_USD || '500'}` },
    { label: 'Time-to-Offer scoring',            active: exists('lib/tto-estimator.mjs'),
      detail: 'Runway-aware triage weight — fast-cycle companies preferred' },
    { label: 'Company-toxicity flagging',        active: exists('lib/toxicity-scorer.mjs'),
      detail: 'Flag-for-review composite (never auto-trash)' },
    { label: 'Recruiter pipeline-density alert', active: exists('dashboard-server.mjs'),
      detail: 'Runway health verdict — surfaced below' },
    { label: 'Corpus auto-edit + git audit',     active: exists('scripts/agent-commit.mjs'),
      detail: 'Agents may edit cv.md / profile / story-bank / modes — git is the audit trail' },
    { label: 'Council-of-models orchestration',  active: exists('lib/council.mjs'),
      detail: '7-model parallel research via /council, /dealbreaker, /github-readiness, /linkedin-readiness skills' },
    { label: 'Burst mode',                       active: !!process.env.MONTHLY_BUDGET_USD_BURST && parseFloat(process.env.MONTHLY_BUDGET_USD_BURST) > 0,
      detail: process.env.MONTHLY_BUDGET_USD_BURST ? `+$${process.env.MONTHLY_BUDGET_USD_BURST} until ${process.env.MONTHLY_BUDGET_BURST_UNTIL || 'untouched until set'}` : 'Set MONTHLY_BUDGET_USD_BURST + MONTHLY_BUDGET_BURST_UNTIL to enable' },
  ];
}

/**
 * renderSystemBanner({ format }) → string
 *
 * @param {object} opts
 * @param {'html'|'text'} opts.format - 'html' for email body, 'text' for stdout/logs
 */
export function renderSystemBanner({ format = 'html' } = {}) {
  const features = getActiveFeatures();
  const activeCount = features.filter(f => f.active).length;

  if (format === 'text') {
    const lines = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `SYSTEM STATUS — ${activeCount}/${features.length} Tier 5 features active`,
      '(calibration brief 2026-05-16)',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ];
    for (const f of features) {
      lines.push(`  ${f.active ? '✓' : '·'}  ${f.label.padEnd(38)}  ${f.detail}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  // HTML
  const rows = features.map(f => {
    const dot = f.active
      ? '<span style="color:#16a34a;font-weight:700">●</span>'
      : '<span style="color:#9ca3af">○</span>';
    return `<tr>
      <td style="padding:4px 10px 4px 0;font-size:12px;vertical-align:top;width:14px">${dot}</td>
      <td style="padding:4px 10px 4px 0;font-size:12.5px;color:#111827;vertical-align:top;font-weight:${f.active ? 600 : 400}">${escapeHtml(f.label)}</td>
      <td style="padding:4px 0;font-size:11.5px;color:#6b7280;vertical-align:top">${escapeHtml(f.detail)}</td>
    </tr>`;
  }).join('');

  return `
<div style="margin:18px 0;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin-bottom:8px">
    System status — ${activeCount}/${features.length} Tier 5 features active
    <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#9ca3af">· per calibration 2026-05-16</span>
  </div>
  <table style="border-collapse:collapse;width:100%">${rows}</table>
</div>`.trim();
}

/**
 * renderRunwayAlert({ pipelineDensity, format }) → string
 *
 * @param {object} pipelineDensity - output of computeRecruiterPipelineDensity() from dashboard-server.mjs.
 *                                   If omitted, returns a placeholder.
 * @param {'html'|'text'} opts.format
 */
export function renderRunwayAlert({ pipelineDensity, format = 'html' } = {}) {
  if (!pipelineDensity || !pipelineDensity.ok) {
    return format === 'html'
      ? '<div style="margin:12px 0;padding:10px;background:#fef9c3;border-radius:6px;color:#854d0e;font-size:12px">Runway alert: pipeline-density data unavailable (heartbeat ran before outreach tracker loaded).</div>'
      : 'Runway alert: pipeline-density data unavailable.';
  }

  const { health, runway_alert, contacts, velocity, runway_weeks } = pipelineDensity;
  const colorMap = {
    healthy:  { bg: '#dcfce7', border: '#86efac', fg: '#166534' },
    stretched:{ bg: '#fef3c7', border: '#fcd34d', fg: '#92400e' },
    critical: { bg: '#fee2e2', border: '#fca5a5', fg: '#991b1b' },
  };
  const c = colorMap[health] || colorMap.stretched;

  if (format === 'text') {
    return [
      '',
      `RUNWAY ALERT — ${runway_weeks}-week window`,
      runway_alert,
      `  active conversations:  ${contacts.active}  (responded ${contacts.responded} / ${contacts.total} total, ${Math.round(contacts.response_rate*100)}% rate)`,
      `  touches last 7d:       ${velocity.touches_last_7d}`,
      `  touches last 30d:      ${velocity.touches_last_30d}`,
      `  last touch:            ${velocity.days_since_last_touch != null ? velocity.days_since_last_touch + 'd ago' : 'unknown'}`,
      '',
    ].join('\n');
  }

  return `
<div style="margin:14px 0;padding:12px 14px;background:${c.bg};border:1px solid ${c.border};border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${c.fg};margin-bottom:6px">
    Runway alert — ${runway_weeks}-week window
  </div>
  <div style="font-size:13px;color:${c.fg};font-weight:600;margin-bottom:8px;line-height:1.4">${escapeHtml(runway_alert)}</div>
  <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:11.5px;color:#374151">
    <span><strong>${contacts.active}</strong> active conv.</span>
    <span><strong>${contacts.responded}</strong> responded (${Math.round(contacts.response_rate*100)}%)</span>
    <span><strong>${velocity.touches_last_7d}</strong> touches/7d</span>
    <span><strong>${velocity.touches_last_30d}</strong> touches/30d</span>
    <span>last touch: <strong>${velocity.days_since_last_touch != null ? velocity.days_since_last_touch + 'd' : 'n/a'}</strong></span>
  </div>
</div>`.trim();
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// CLI smoke-test: node lib/heartbeat-system-banner.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(renderSystemBanner({ format: 'text' }));
  console.log('\n— Sample HTML (first 400 chars) —\n');
  console.log(renderSystemBanner({ format: 'html' }).slice(0, 400) + '...');
}
