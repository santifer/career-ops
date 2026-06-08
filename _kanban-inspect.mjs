import { readFileSync } from 'fs';
const h = readFileSync('dashboard/job-pulse-kanban.html', 'utf8');
const re = /\{[^{}]*id:'(live-\d+)'[^{}]*\}/gs;
const rows = [];
for (const mm of h.matchAll(re)) {
  const b = mm[0];
  const get = (rx) => (b.match(rx) || [])[1];
  rows.push({
    id: get(/id:'(live-\d+)'/),
    co: get(/company:'([^']+)'/),
    role: get(/role:'([^']+)'/),
    gr: get(/grade:'([A-F])'/),
    col: get(/columnId:'([^']+)'/),
    ref: get(/isWarmReferral:(true|false)/),
  });
}
const groups = {};
for (const r of rows) groups[r.col] = (groups[r.col] || 0) + 1;
console.log('TOTAL live cards:', rows.length);
console.log('column counts:', JSON.stringify(groups));
console.log('');
console.log('new-hot + autosubmit-ready cards:');
for (const r of rows) {
  if (r.col === 'new-hot' || r.col === 'autosubmit-ready')
    console.log('  ' + r.id + ' [' + r.gr + '] ref=' + r.ref + ' ' + r.col + ' — ' + r.co + ' | ' + r.role);
}
