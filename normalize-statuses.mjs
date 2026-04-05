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
import { join } from 'path';

const CAREER_OPS = new URL('.', import.meta.url).pathname;
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

  // DUPLICADO variants → Discarded
  if (/^duplicado/i.test(s) || /^dup\b/i.test(s)) {
    return { status: 'Discarded', moveToNotes: raw.trim() };
  }

  // CERRADA → Discarded
  if (/^cerrada$/i.test(s)) return { status: 'Discarded' };

  // Cancelada (possibly with date) → Discarded
  if (/^cancelada/i.test(s)) return { status: 'Discarded' };

  // Descartada/Descartado → Discarded
  if (/^descartad[ao]$/i.test(s)) return { status: 'Discarded' };

  // Rechazada/Rechazado → Rejected
  if (/^rechazad[ao]$/i.test(s)) return { status: 'Rejected' };

  // Rechazado with date → Rejected (strip date)
  if (/^rechazado\s+\d{4}/i.test(s)) return { status: 'Rejected' };

  // Aplicado with date → Applied (strip date)
  if (/^aplicado\s+\d{4}/i.test(s)) return { status: 'Applied' };

  // Contacto/Contactado → Contacted
  if (/^contacto$/i.test(s) || /^contactado$/i.test(s)) return { status: 'Contacted' };

  // CONDICIONAL → Evaluated
  if (/^condicional$/i.test(s)) return { status: 'Evaluated' };

  // HOLD → Evaluated
  if (/^hold$/i.test(s)) return { status: 'Evaluated' };

  // MONITOR → Evaluated
  if (/^monitor$/i.test(s)) return { status: 'Evaluated' };

  // EVALUAR → Evaluated
  if (/^evaluar$/i.test(s)) return { status: 'Evaluated' };

  // Verificar → Evaluated
  if (/^verificar$/i.test(s)) return { status: 'Evaluated' };

  // GEO BLOCKER → SKIP
  if (/geo.?blocker/i.test(s)) return { status: 'SKIP' };

  // Repost #NNN → Discarded
  if (/^repost/i.test(s)) return { status: 'Discarded', moveToNotes: raw.trim() };

  // "—" (em dash, no status) → Descartado
  if (s === '—' || s === '-' || s === '') return { status: 'Descartado' };

  // Already canonical — just fix casing/bold
  const canonical = [
    'Evaluated', 'Applied', 'Contacted', 'Responded', 'Interview',
    'Offer', 'Rejected', 'Discarded', 'SKIP',
  ];
  for (const c of canonical) {
    if (lower === c.toLowerCase()) return { status: c };
  }

  // Aliases from states.yml
  if (['enviada', 'aplicada', 'aplicado', 'applied', 'sent'].includes(lower)) return { status: 'Applied' };
  if (['contacto', 'contactado'].includes(lower)) return { status: 'Contacted' };
  if (['respondido'].includes(lower)) return { status: 'Responded' };
  if (['evaluada'].includes(lower)) return { status: 'Evaluated' };
  if (['entrevista'].includes(lower)) return { status: 'Interview' };
  if (['oferta'].includes(lower)) return { status: 'Offer' };
  if (['cerrada', 'descartada', 'descartado'].includes(lower)) return { status: 'Discarded' };
  if (['rechazado', 'rechazada'].includes(lower)) return { status: 'Rejected' };
  if (['no aplicar', 'no_aplicar', 'skip'].includes(lower)) return { status: 'SKIP' };

  // Unknown — flag it
  return { status: null, unknown: true };
}

// Read applications.md
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
