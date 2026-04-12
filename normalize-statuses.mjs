#!/usr/bin/env node
/**
 * normalize-statuses.mjs — Clean non-canonical states in applications.md
 *
 * Maps all non-canonical statuses to canonical ones per states.yml:
 *   Evaluada, Aplicado, Respondido, Entrevista, Oferta, Rechazado, Descartado, NO APLICAR
 *
 * Also strips markdown bold (**) and dates from the status field,
 * moving DUPLICADO info to the notes column.
 *
 * Run: node career-ops/normalize-statuses.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
// Support both layouts: data/applications.md (boilerplate) and applications.md (original)
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');
const DRY_RUN = process.argv.includes('--dry-run');

// Canonical status mapping
function normalizeStatus(raw) {
  // Strip markdown bold
  let s = raw.replace(/\*\*/g, '').trim();
  const lower = s.toLowerCase();

  // DUPLICADO/DUPLICATE variants → Discarded
  if (/^duplicado/i.test(s) || /^duplicated?/i.test(s) || /^dup\b/i.test(s)) {
    return { status: 'Discarded', moveToNotes: raw.trim() };
  }

  // CERRADA/CLOSED → Discarded
  if (/^cerrada$/i.test(s) || /^closed$/i.test(s)) return { status: 'Discarded' };

  // Cancelada/Canceled (possibly with date) → Discarded
  if (/^cancelada/i.test(s) || /^canceled?/i.test(s)) return { status: 'Discarded' };

  // Descartada/Discarded → Discarded
  if (/^descartada$/i.test(s) || /^discarded$/i.test(s)) return { status: 'Discarded' };

  // Descartado → Discarded
  if (/^descartado$/i.test(s)) return { status: 'Discarded' };

  // Rechazada/Rechazado/Rejected → Rejected
  if (/^rechazad[ao]$/i.test(s) || /^rejected$/i.test(s)) return { status: 'Rejected' };

  // Rechazado/Rejected with date → Rejected (strip date)
  if (/^rechazado\s+\d{4}/i.test(s) || /^rejected\s+\d{4}/i.test(s)) return { status: 'Rejected' };

  // Aplicado/Applied with date → Applied (strip date)
  if (/^aplicado\s+\d{4}/i.test(s) || /^applied\s+\d{4}/i.test(s)) return { status: 'Applied' };

  // CONDICIONAL/CONDITIONAL → Evaluated
  if (/^condicional$/i.test(s) || /^conditional$/i.test(s)) return { status: 'Evaluated' };

  // HOLD → Evaluated
  if (/^hold$/i.test(s)) return { status: 'Evaluated' };

  // MONITOR → SKIP
  if (/^monitor$/i.test(s)) return { status: 'SKIP' };

  // EVALUAR/EVALUATE → Evaluated
  if (/^evaluar$/i.test(s) || /^evaluate$/i.test(s)) return { status: 'Evaluated' };

  // Verificar/VERIFY → Evaluated
  if (/^verificar$/i.test(s) || /^verify$/i.test(s)) return { status: 'Evaluated' };

  // GEO BLOCKER → SKIP
  if (/geo.?blocker/i.test(s)) return { status: 'SKIP' };

  // Repost #NNN → Discarded
  if (/^repost/i.test(s)) return { status: 'Discarded', moveToNotes: raw.trim() };

  // "—" (em dash, no status) → Discarded
  if (s === '—' || s === '-' || s === '') return { status: 'Discarded' };

  // Already canonical (English, per states.yml) — just fix casing/bold
  const canonical = [
    'Evaluated', 'Applied', 'Responded', 'Interview',
    'Offer', 'Rejected', 'Discarded', 'SKIP',
  ];
  for (const c of canonical) {
    const mapping = {
      'Evaluada': 'Evaluated', 'Aplicado': 'Applied', 'Respondido': 'Responded',
      'Entrevista': 'Interview', 'Oferta': 'Offer', 'Rechazado': 'Rejected',
      'Descartado': 'Discarded', 'NO APLICAR': 'SKIP',
    };
    if (lower === c.toLowerCase()) return { status: mapping[c] || c };
  }

  // Spanish → English aliases
  if (['evaluada'].includes(lower)) return { status: 'Evaluated' };
  if (['aplicado', 'enviada', 'aplicada', 'applied', 'sent'].includes(lower)) return { status: 'Applied' };
  if (['respondido'].includes(lower)) return { status: 'Responded' };
  if (['entrevista'].includes(lower)) return { status: 'Interview' };
  if (['oferta'].includes(lower)) return { status: 'Offer' };
  if (['cerrada', 'descartada', 'closed', 'discarded', 'canceled'].includes(lower)) return { status: 'Discarded' };
  if (['no aplicar', 'no_aplicar', 'skip'].includes(lower)) return { status: 'SKIP' };

  // Unknown — flag it
  return { status: null, unknown: true };
}

export { normalizeStatus };

// Read applications.md
if (process.argv[1] === fileURLToPath(import.meta.url)) {
if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found. Nothing to normalize.');
  process.exit(0);
}
const content = readFileSync(APPS_FILE, 'utf-8');
const lines = content.split('\n');

let changes = 0;
let unknowns = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith('|')) continue;

  const parts = line.split('|').map(s => s.trim());
  // Format: ['', '#', 'fecha', 'empresa', 'rol', 'score', 'STATUS', 'pdf', 'report', 'notas', '']
  if (parts.length < 9) continue;
  if (parts[1] === '#' || parts[1] === '---' || parts[1] === '') continue;

  const num = parseInt(parts[1]);
  if (isNaN(num)) continue;

  const rawStatus = parts[6];
  const result = normalizeStatus(rawStatus);

  if (result.unknown) {
    unknowns.push({ num, rawStatus, line: i + 1 });
    continue;
  }

  if (result.status === rawStatus) continue; // Already canonical

  // Apply change
  const oldStatus = rawStatus;
  parts[6] = result.status;

  // Move DUPLICADO info to notes if needed
  if (result.moveToNotes && parts[9]) {
    const existing = parts[9] || '';
    if (!existing.includes(result.moveToNotes)) {
      parts[9] = result.moveToNotes + (existing ? '. ' + existing : '');
    }
  } else if (result.moveToNotes && !parts[9]) {
    parts[9] = result.moveToNotes;
  }

  // Also strip bold from score field
  if (parts[5]) {
    parts[5] = parts[5].replace(/\*\*/g, '');
  }

  // Reconstruct line
  const newLine = '| ' + parts.slice(1, -1).join(' | ') + ' |';
  lines[i] = newLine;
  changes++;

  console.log(`#${num}: "${oldStatus}" → "${result.status}"`);
}

if (unknowns.length > 0) {
  console.log(`\n⚠️  ${unknowns.length} unknown statuses:`);
  for (const u of unknowns) {
    console.log(`  #${u.num} (line ${u.line}): "${u.rawStatus}"`);
  }
}

console.log(`\n📊 ${changes} statuses normalized`);

if (!DRY_RUN && changes > 0) {
  // Backup first
  copyFileSync(APPS_FILE, APPS_FILE + '.bak');
  writeFileSync(APPS_FILE, lines.join('\n'));
  console.log('✅ Written to applications.md (backup: applications.md.bak)');
} else if (DRY_RUN) {
  console.log('(dry-run — no changes written)');
} else {
  console.log('✅ No changes needed');
}

} // end main guard
