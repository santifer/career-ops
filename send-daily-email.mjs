import { readFileSync } from 'fs';
import { join } from 'path';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || 'career-ops <onboarding@resend.dev>';
const TO = process.env.NOTIFY_EMAIL;
const TODAY = '2026-05-06';
const TSV_PATH = '/home/user/career-ops/data/scan-history.tsv';

// Read TSV and filter for today's added roles
const lines = readFileSync(TSV_PATH, 'utf8').trim().split('\n');
const headers = lines[0].split('\t');
const todayRoles = lines.slice(1)
  .map(line => {
    const cols = line.split('\t');
    return {
      url: cols[0],
      first_seen: cols[1],
      portal: cols[2],
      title: cols[3],
      company: cols[4],
      status: cols[5]
    };
  })
  .filter(r => r.first_seen === TODAY && r.status === 'added');

console.log(`Roles found for ${TODAY}: ${todayRoles.length}`);

// Group by tier
const groups = { api: [], t1: [], t2: [], t3: [], seriesA: [], general: [] };

for (const role of todayRoles) {
  const p = (role.portal || '').toLowerCase();
  if (p.startsWith('[api') || p.startsWith('[ats')) {
    groups.api.push(role);
  } else if (p.startsWith('[t1:')) {
    groups.t1.push(role);
  } else if (p.startsWith('[t2:')) {
    groups.t2.push(role);
  } else if (p.startsWith('[t3:')) {
    groups.t3.push(role);
  } else if (p.startsWith('[seriesa:') || p.startsWith('[series a:')) {
    groups.seriesA.push(role);
  } else {
    groups.general.push(role);
  }
}

const apiCount = groups.api.length;
const webCount = todayRoles.length - apiCount;
const total = todayRoles.length;

// If no roles found, send Monty Python quote
if (total === 0) {
  const subject = `career-ops: no new roles today - ${TODAY}`;
  const html = `
    <div style="font-family: monospace; padding: 24px; background: #0d1117; color: #c9d1d9;">
      <h2 style="color: #58a6ff;">career-ops daily scan — ${TODAY}</h2>
      <p style="font-size: 1.1em; color: #8b949e;">No new roles found today.</p>
      <blockquote style="border-left: 3px solid #30363d; margin: 24px 0; padding: 12px 20px; color: #8b949e; font-style: italic;">
        "We are the knights who say 'No positions matching your criteria were found at this time.'"
        <br><br>— The Knights Who Say Ni, <em>Monty Python and the Holy Grail</em>
      </blockquote>
      <p style="color: #8b949e; font-size: 0.85em;">Try again tomorrow. The market shall yield.</p>
    </div>
  `;
  await sendEmail(subject, html);
  process.exit(0);
}

// Build tier table HTML
function buildTable(roles, tier) {
  if (!roles.length) return '';
  const rows = roles.map(r => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #30363d;"><a href="${r.url}" style="color: #58a6ff; text-decoration: none;">${escHtml(r.title)}</a></td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #30363d; color: #c9d1d9;">${escHtml(r.company)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #30363d; color: #8b949e; font-size: 0.85em;">${escHtml(r.portal)}</td>
    </tr>
  `).join('');

  const tierColors = {
    api: '#f0883e',
    t1: '#3fb950',
    t2: '#58a6ff',
    t3: '#d2a8ff',
    seriesA: '#ffa657',
    general: '#8b949e'
  };
  const tierLabels = {
    api: '🤖 API (Direct ATS)',
    t1: '🏆 Tier 1 — VC Portfolios',
    t2: '⛓️ Tier 2 — Web3 Native',
    t3: '🔍 Tier 3 — Niche Boards',
    seriesA: '🚀 Series A / Growth Stage',
    general: '📋 General'
  };

  const color = tierColors[tier] || '#8b949e';
  const label = tierLabels[tier] || tier;

  return `
    <div style="margin-bottom: 32px;">
      <h3 style="color: ${color}; border-bottom: 2px solid ${color}; padding-bottom: 6px;">${label} <span style="font-size: 0.8em; color: #8b949e;">(${roles.length})</span></h3>
      <table style="width: 100%; border-collapse: collapse; background: #161b22; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background: #21262d;">
            <th style="padding: 10px 12px; text-align: left; color: #8b949e; font-weight: normal; font-size: 0.85em;">ROLE</th>
            <th style="padding: 10px 12px; text-align: left; color: #8b949e; font-weight: normal; font-size: 0.85em;">COMPANY</th>
            <th style="padding: 10px 12px; text-align: left; color: #8b949e; font-weight: normal; font-size: 0.85em;">SOURCE</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const subject = `career-ops: ${total} new role(s) (${apiCount} API + ${webCount} WebSearch) - ${TODAY}`;

const tierOrder = ['api', 't1', 't2', 't3', 'seriesA', 'general'];
const tablesHtml = tierOrder.map(t => buildTable(groups[t], t)).join('');

const statsHtml = tierOrder
  .filter(t => groups[t].length > 0)
  .map(t => `<span style="margin-right: 16px; color: #8b949e;">${t.toUpperCase()}: <strong style="color: #c9d1d9;">${groups[t].length}</strong></span>`)
  .join('');

const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace; background: #0d1117; color: #c9d1d9; margin: 0; padding: 0;">
  <div style="max-width: 900px; margin: 0 auto; padding: 24px;">
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
      <h1 style="margin: 0 0 8px 0; color: #58a6ff; font-size: 1.4em;">career-ops daily scan</h1>
      <p style="margin: 0; color: #8b949e;">${TODAY} · ${total} new roles found</p>
    </div>

    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 24px; margin-bottom: 24px; display: flex; flex-wrap: wrap;">
      ${statsHtml}
    </div>

    ${tablesHtml}

    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #30363d; color: #8b949e; font-size: 0.8em;">
      Generated by career-ops · Run <code>/career-ops pipeline</code> to process
    </div>
  </div>
</body>
</html>
`;

async function sendEmail(subj, htmlBody) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      subject: subj,
      html: htmlBody
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error('Resend error:', JSON.stringify(data));
    process.exit(1);
  }
  console.log('Email sent:', data.id);
  console.log('Subject:', subj);
  console.log('To:', TO);
}

await sendEmail(subject, html);
