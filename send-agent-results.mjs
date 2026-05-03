import 'dotenv/config';
import { createTransport } from 'nodemailer';
import { readFileSync } from 'fs';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || GMAIL_USER;

const today = new Date().toISOString().slice(0, 10);

// Read scan-history.tsv
const tsvContent = readFileSync('./data/scan-history.tsv', 'utf-8');
const lines = tsvContent.trim().split('\n');

// Skip header line
const entries = lines.slice(1).map(line => {
  const cols = line.split('\t');
  return {
    url: cols[0],
    date: cols[1],
    portal: cols[2],
    title: cols[3],
    company: cols[4],
    status: cols[5],
  };
});

// Filter: today's date AND status=added AND portal does NOT start with greenhouse-api or ashby-api
const newRoles = entries.filter(e =>
  e.date === today &&
  e.status === 'added' &&
  !e.portal.startsWith('greenhouse-api') &&
  !e.portal.startsWith('ashby-api')
);

if (newRoles.length === 0) {
  console.log('No new roles from WebSearch scan, no email sent.');
  process.exit(0);
}

console.log(`Found ${newRoles.length} new roles from WebSearch scan. Sending email...`);

// Split into Remote vs Other
const isRemote = r =>
  /remote/i.test(r.title) || /remote/i.test(r.portal);

const remoteRoles = newRoles.filter(isRemote);
const otherRoles  = newRoles.filter(r => !isRemote(r));

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildTable(roles) {
  if (roles.length === 0) return '<p style="color:#6b7280;font-size:13px;padding:8px 0;">None found.</p>';
  const rows = roles.map(r => `
  <tr>
    <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827;">${escapeHtml(r.company)}</td>
    <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${escapeHtml(r.title)}</td>
    <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
      <a href="${r.url}" style="color: #2563eb; text-decoration: none;">View posting</a>
    </td>
  </tr>`).join('');

  return `
  <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
    <thead>
      <tr style="background-color: #f3f4f6;">
        <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Company</th>
        <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Role</th>
        <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Link</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; max-width: 800px; margin: 0 auto; padding: 24px;">

  <h2 style="color: #111827; margin-bottom: 4px;">career-ops full portal scan — ${today}</h2>
  <p style="color: #6b7280; margin-top: 0;">${newRoles.length} new role(s) · ${remoteRoles.length} remote · ${otherRoles.length} other</p>

  <h3 style="margin-top: 28px; margin-bottom: 4px; color: #111827; font-size: 15px;">
    🌍 Remote <span style="font-weight: 400; color: #6b7280; font-size: 13px;">(${remoteRoles.length})</span>
  </h3>
  ${buildTable(remoteRoles)}

  <h3 style="margin-top: 28px; margin-bottom: 4px; color: #111827; font-size: 15px;">
    📍 Other <span style="font-weight: 400; color: #6b7280; font-size: 13px;">(${otherRoles.length})</span>
  </h3>
  ${buildTable(otherRoles)}

  <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
    career-ops scan — ${new Date().toISOString()} | ${newRoles.length} WebSearch role(s) added to pipeline.md
  </p>
</body>
</html>
`;

const transporter = createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

const mailOptions = {
  from: `"career-ops 🔍" <${GMAIL_USER}>`,
  to: NOTIFY_EMAIL,
  subject: `career-ops: ${newRoles.length} new role(s) from full portal scan — ${today}`,
  html,
};

try {
  const info = await transporter.sendMail(mailOptions);
  console.log(`Email sent successfully: ${info.messageId}`);
  console.log(`Recipient: ${NOTIFY_EMAIL}`);
  console.log(`Remote (${remoteRoles.length}):`);
  remoteRoles.forEach(r => console.log(`  🌍 ${r.company} — ${r.title}`));
  console.log(`Other (${otherRoles.length}):`);
  otherRoles.forEach(r => console.log(`  📍 ${r.company} — ${r.title}`));
} catch (err) {
  console.error('Failed to send email:', err.message);
  process.exit(1);
}
