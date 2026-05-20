/**
 * lib/heartbeat-system-banner.mjs — System-status banner for the heartbeat email.
 *
 * Per calibration brief 2026-05-16: heartbeat email should include a banner
 * confirming which Tier 5 system features are active + a runway-alert section
 * computed from the recruiter-pipeline-density widget data.
 *
 * Usage (from scripts/heartbeat.mjs):
 *   import { renderSystemBanner, renderRunwayAlert, renderDiscardPatternSection } from './lib/heartbeat-system-banner.mjs';
 *   const bannerHtml  = renderSystemBanner({ format: 'html' });
 *   const runwayHtml  = renderRunwayAlert({ format: 'html' });
 *   const discardHtml = renderDiscardPatternSection({ format: 'html', days: 7 });
 *
 * The banner reads the current state of the system to decide what to surface:
 *   - Are caps active? (PER_RUN_CAP_RUN_BATCH_USD set / default $25)
 *   - Is burst mode active?
 *   - Has TTO scoring landed? (lib/tto-estimator.mjs exists)
 *   - Has toxicity scoring landed? (lib/toxicity-scorer.mjs exists)
 *   - Has corpus auto-edit infra landed? (scripts/agent-commit.mjs exists)
 *   - Pipeline density health verdict (computed via dashboard API or directly)
 *
 * The discard-pattern section reads data/discard-reasons.jsonl (populated by
 * dashboard-server.mjs /api/discard-with-reason) and shows what Mitchell has
 * been rejecting in the last N days, so he sees the pattern + confirms the
 * system is aware of it. Auto-suppresses when zero discards in the window.
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

/**
 * renderCdpAuthHealthSection({ format }) → string
 *
 * Reads data/cdp-auth-state.json (written by scripts/cdp-auth-probe.mjs on a
 * 30-min cadence) and renders the auth-break alert banner. Three states:
 *
 *   - OK     : CDP up + LinkedIn signed in → small green badge or empty
 *   - AMBER  : CDP up + LinkedIn auth gone → amber banner, urgent
 *   - RED    : CDP DOWN → red banner, blocks the autonomous pipeline
 *
 * Suppresses entirely if the probe is FRESH (< 90 min ago) AND state is OK.
 * Shows a stale-probe warning if checked_at is > 6h ago.
 *
 * Wired into scripts/heartbeat.mjs near the top of the body so the alert is
 * the first thing Mitchell sees if the autonomous pipeline broke overnight.
 */
export function renderCdpAuthHealthSection({ format = 'html' } = {}) {
  const fp = join(ROOT, 'data/cdp-auth-state.json');
  if (!existsSync(fp)) {
    return format === 'text'
      ? '\nCDP AUTH PROBE — no state file yet (probe has not run). Run: node scripts/cdp-auth-probe.mjs\n'
      : '<div style="margin:14px 0;padding:12px 14px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:12px;color:#92400e"><strong>CDP auth probe</strong> — no state file yet. Run <code>node scripts/cdp-auth-probe.mjs</code> manually, or wait for the 30-min plist.</div>';
  }

  let state;
  try { state = JSON.parse(readFileSync(fp, 'utf-8')); } catch { return ''; }

  const ageMin = (Date.now() - Date.parse(state.checked_at)) / 60000;
  const stale = ageMin > 360; // 6h
  const ageLabel = ageMin < 60 ? `${Math.round(ageMin)}m ago` : `${(ageMin/60).toFixed(1)}h ago`;

  // OK state — suppress entirely if probe is fresh
  if (state.cdp_up && state.linkedin_signed_in && !stale) {
    if (format === 'text') return '';
    return '';
  }

  // Determine severity
  let level, headline, detail;
  if (!state.cdp_up) {
    level = 'RED';
    headline = 'CDP DOWN — autonomous enrichment pipeline is BROKEN';
    detail = `No listener on :9222. Daily Phase B' plist will produce zero data. Fix path on the desktop: <code>~/Desktop/OPEN-IF-LINKEDIN-AUTH-BREAKS.md</code>.`;
  } else if (state.linkedin_signed_in === false) {
    level = 'AMBER';
    headline = 'LinkedIn auth broken — daily enrichment will authwall';
    detail = `CDP is up but LinkedIn redirected to <code>${escapeHtml(state.linkedin_url_landed || '?')}</code>. Re-auth via the desktop runbook: <code>~/Desktop/OPEN-IF-LINKEDIN-AUTH-BREAKS.md</code>.`;
  } else if (stale) {
    level = 'AMBER';
    headline = `CDP auth probe is stale (last run ${ageLabel})`;
    detail = `The 30-min probe may have stopped. Check <code>launchctl print gui/$(id -u)/com.mitchell.career-ops.cdp-auth-probe</code>.`;
  } else {
    return ''; // shouldn't reach
  }

  if (format === 'text') {
    return [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `${level} — ${headline}`,
      `  probed ${ageLabel}`,
      `  ${detail.replace(/<[^>]+>/g, '')}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ].join('\n');
  }

  const colorMap = {
    RED:   { bg: '#fee2e2', border: '#fca5a5', fg: '#991b1b' },
    AMBER: { bg: '#fef3c7', border: '#fcd34d', fg: '#92400e' },
  };
  const c = colorMap[level];

  return `
<div style="margin:14px 0;padding:12px 14px;background:${c.bg};border:1px solid ${c.border};border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${c.fg};margin-bottom:6px">
    ${level} — CDP auth health
  </div>
  <div style="font-size:13.5px;color:${c.fg};font-weight:600;margin-bottom:6px;line-height:1.4">${escapeHtml(headline)}</div>
  <div style="font-size:12px;color:${c.fg};line-height:1.5">${detail}</div>
  <div style="font-size:10.5px;color:#6b7280;margin-top:8px">probed ${ageLabel} · <code>data/cdp-auth-state.json</code></div>
</div>`.trim();
}

/**
 * renderPolishSummarySection({ format, sinceHours }) → string
 *
 * Heartbeat section summarizing polish runs in the last `sinceHours` window
 * (default 24h). Auto-suppresses entirely when zero polishes ran — same
 * no-noise pattern as renderDiscardPatternSection.
 *
 * Pulls from data/apply-packs/<slug>/polish-orchestrator-summary.json via
 * the polish-status-loader. Shows one line per verdict bucket plus deep-link
 * row IDs so Mitchell can jump straight to the affected rows in the
 * dashboard.
 */
export async function renderPolishSummarySection({ format = 'html', sinceHours = 24 } = {}) {
  let loader;
  try { loader = await import('./polish-status-loader.mjs'); }
  catch { return ''; }

  const { all } = loader.loadAllPolishStatus();
  const group = loader.groupPolishStatus(all, { sinceHours });
  if (group.total === 0) return '';

  // Build per-bucket row id list for click-throughs
  const fmtRows = (bucket) => {
    if (!bucket || !bucket.length) return '';
    return bucket.slice(0, 6).map(s => `#${s.row_id}`).join(', ') + (bucket.length > 6 ? ` +${bucket.length - 6} more` : '');
  };

  const lines = [];
  if (group.counts.APPROVED > 0)    lines.push({ icon: '🟢', label: 'Approved',     count: group.counts.APPROVED,    rows: fmtRows(group.buckets.APPROVED) });
  if (group.counts.NEEDS_HUMAN > 0) lines.push({ icon: '🟡', label: 'Needs review', count: group.counts.NEEDS_HUMAN, rows: fmtRows(group.buckets.NEEDS_HUMAN) });
  if (group.counts.REJECTED > 0)    lines.push({ icon: '🔴', label: 'Rejected',     count: group.counts.REJECTED,    rows: fmtRows(group.buckets.REJECTED) });
  if (group.counts.ABANDONED > 0)   lines.push({ icon: '⏸', label: 'Abandoned',    count: group.counts.ABANDONED,   rows: fmtRows(group.buckets.ABANDONED) });

  const headerText = `Polish summary — last ${sinceHours}h · ${group.total} run${group.total === 1 ? '' : 's'}`;

  if (format === 'text' || format === 'markdown') {
    const isMd = format === 'markdown';
    const out = [];
    if (isMd) {
      out.push(`## ${headerText}`);
      out.push('');
    } else {
      out.push('');
      out.push(headerText);
      out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
    for (const l of lines) {
      out.push(`  ${l.icon} ${l.count} ${l.label}${l.rows ? `  (${l.rows})` : ''}`);
    }
    out.push('');
    return out.join('\n');
  }

  const rows = lines.map(l => `
    <tr>
      <td style="padding:4px 10px 4px 0;font-size:14px;vertical-align:middle;width:24px">${l.icon}</td>
      <td style="padding:4px 10px 4px 0;font-size:12.5px;color:#111827;vertical-align:middle;font-weight:600">${escapeHtml(String(l.count))} ${escapeHtml(l.label)}</td>
      <td style="padding:4px 0;font-size:11.5px;color:#6b7280;vertical-align:middle">${escapeHtml(l.rows)}</td>
    </tr>`).join('');

  return `
<div style="margin:14px 0;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin-bottom:6px">
    Polish summary — last ${sinceHours}h
  </div>
  <div style="font-size:12.5px;color:#374151;margin-bottom:6px">${group.total} polish run${group.total === 1 ? '' : 's'} since last heartbeat. Open the dashboard's apply-now table to see per-row polish status (🟢🟡🔴⏸ icons next to each score).</div>
  <table style="border-collapse:collapse;width:100%">${rows}</table>
</div>`.trim();
}

/**
 * renderDiscardPatternSection({ format, days }) → string
 *
 * Reads data/discard-reasons.jsonl, filters to entries from the last `days`
 * days (default 7), groups by auto-classified tag, and renders a section
 * showing the top tags with a representative reason verbatim for each.
 *
 * Auto-suppresses (returns empty string) when there are zero discards in the
 * window — same no-noise pattern as formatOutreachCadence in heartbeat.mjs.
 *
 * @param {object} opts
 * @param {'html'|'text'|'markdown'} opts.format
 * @param {number} opts.days  - rolling window (default 7)
 */
export function renderDiscardPatternSection({ format = 'html', days = 7 } = {}) {
  const fp = join(ROOT, 'data/discard-reasons.jsonl');
  if (!existsSync(fp)) return '';

  let raw;
  try { raw = readFileSync(fp, 'utf-8'); } catch { return ''; }
  const lines = raw.split('\n').filter(Boolean);

  const cutoff = Date.now() - days * 86400000;
  const entries = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (!obj || !obj.reason) continue;
      const ts = Date.parse(obj.ts);
      if (!isFinite(ts) || ts < cutoff) continue;
      entries.push(obj);
    } catch { /* skip malformed */ }
  }

  if (entries.length === 0) return '';

  // Group by tag, sort by count desc
  const groups = new Map();
  for (const e of entries) {
    const tag = e.tag || 'other';
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(e);
  }
  const sortedTags = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3); // top 3 tags

  const totalDiscards = entries.length;
  const headerText = `Rejected Pattern of the Week — ${totalDiscards} discard${totalDiscards === 1 ? '' : 's'} in last ${days}d`;

  if (format === 'text' || format === 'markdown') {
    const isMd = format === 'markdown';
    const out = [];
    if (isMd) {
      out.push(`## ${headerText}`);
      out.push('');
      out.push(`_What you've rejected from the apply queue in the last ${days} days. The triage prompt now consumes this so the next batch run doesn't re-surface the same anti-patterns ([lib/discard-pattern-injector.mjs](lib/discard-pattern-injector.mjs))._`);
      out.push('');
    } else {
      out.push('');
      out.push(`REJECTED PATTERN OF THE WEEK — ${totalDiscards} discard(s) in last ${days}d`);
      out.push('');
    }
    for (const [tag, list] of sortedTags) {
      const sample = list[0]; // most-recent within the group is sample[0] only if input is sorted; entries already filtered by ts but not sorted — pick most recent below
      const mostRecent = [...list].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
      const co = mostRecent.company ? `${mostRecent.company} — ` : '';
      const reason = truncate(mostRecent.reason, 160);
      if (isMd) {
        out.push(`**${tag}** (${list.length}): ${co}_${reason}_`);
      } else {
        out.push(`  [${tag}] ${list.length}x — ${co}${reason}`);
      }
    }
    if (isMd) out.push('');
    return out.join('\n');
  }

  // HTML — match the visual weight of renderRunwayAlert (compact, neutral
  // palette since discards are informational, not alarms)
  const tagRows = sortedTags.map(([tag, list]) => {
    const mostRecent = [...list].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
    const co = mostRecent.company ? `<strong>${escapeHtml(mostRecent.company)}</strong> — ` : '';
    const reason = escapeHtml(truncate(mostRecent.reason, 200));
    return `<tr>
      <td style="padding:4px 10px 4px 0;font-size:11.5px;color:#374151;vertical-align:top;width:90px"><span style="display:inline-block;padding:2px 8px;background:#e0e7ff;color:#3730a3;border-radius:12px;font-weight:600;font-size:11px">${escapeHtml(tag)}</span> <span style="color:#9ca3af">${list.length}x</span></td>
      <td style="padding:4px 0;font-size:11.5px;color:#4b5563;vertical-align:top;line-height:1.45">${co}<em>${reason}</em></td>
    </tr>`;
  }).join('');

  return `
<div style="margin:14px 0;padding:12px 14px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5b21b6;margin-bottom:6px">
    Rejected pattern of the week
    <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#7c3aed">· ${totalDiscards} discard${totalDiscards === 1 ? '' : 's'} in last ${days}d · feeds next triage batch</span>
  </div>
  <table style="border-collapse:collapse;width:100%">${tagRows}</table>
</div>`.trim();
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

// CLI smoke-test: node lib/heartbeat-system-banner.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(renderSystemBanner({ format: 'text' }));
  console.log('\n— Sample HTML (first 400 chars) —\n');
  console.log(renderSystemBanner({ format: 'html' }).slice(0, 400) + '...');
  console.log('\n— Discard pattern section (text) —\n');
  const txt = renderDiscardPatternSection({ format: 'text', days: 7 });
  console.log(txt || '(empty — no discards in last 7 days or file missing)');
  console.log('\n— Discard pattern section (markdown) —\n');
  const md = renderDiscardPatternSection({ format: 'markdown', days: 7 });
  console.log(md || '(empty — no discards in last 7 days or file missing)');
  console.log('\n— Discard pattern section (html, first 400 chars) —\n');
  const html = renderDiscardPatternSection({ format: 'html', days: 7 });
  console.log(html ? html.slice(0, 400) + '...' : '(empty)');
}
