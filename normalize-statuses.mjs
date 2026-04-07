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

  // DUPLICADO variants → Descartado
  if (/^duplicado/i.test(s) || /^dup\b/i.test(s)) {
    return { status: 'Descartado', moveToNotes: raw.trim() };
  }

  // CERRADA → Descartado
  if (/^cerrada$/i.test(s)) return { status: 'Descartado' };

  // Cancelada (possibly with date) → Descartado
  if (/^cancelada/i.test(s)) return { status: 'Descartado' };

  // Descartada → Descartado
  if (/^descartada$/i.test(s)) return { status: 'Descartado' };

  // Rechazada → Rechazado
  if (/^rechazada$/i.test(s)) return { status: 'Rechazado' };

  // Rechazado with date → Rechazado (strip date)
  if (/^rechazado\s+\d{4}/i.test(s)) return { status: 'Rechazado' };

  // Aplicado with date → Aplicado (strip date)
  if (/^aplicado\s+\d{4}/i.test(s)) return { status: 'Aplicado' };

  // CONDICIONAL → Evaluada
  if (/^condicional$/i.test(s)) return { status: 'Evaluada' };

  // HOLD → Evaluada
  if (/^hold$/i.test(s)) return { status: 'Evaluada' };

  // MONITOR → Evaluada
  if (/^monitor$/i.test(s)) return { status: 'Evaluada' };

  // EVALUAR → Evaluada
  if (/^evaluar$/i.test(s)) return { status: 'Evaluada' };

  // Verificar → Evaluada
  if (/^verificar$/i.test(s)) return { status: 'Evaluada' };

  // GEO BLOCKER → NO APLICAR
  if (/geo.?blocker/i.test(s)) return { status: 'NO APLICAR' };

  // Repost #NNN → Descartado
  if (/^repost/i.test(s)) return { status: 'Descartado', moveToNotes: raw.trim() };

  // "—" (em dash, no status) → Descartado
  if (s === '—' || s === '-' || s === '') return { status: 'Descartado' };

  // Already canonical — just fix casing/bold
  const canonical = [
    'Evaluada', 'Aplicado', 'Respondido', 'Entrevista',
    'Oferta', 'Rechazado', 'Descartado', 'NO APLICAR',
  ];
  for (const c of canonical) {
    if (lower === c.toLowerCase()) return { status: c };
  }

  // Aliases from states.yml
  if (['enviada', 'aplicada', 'applied', 'sent'].includes(lower)) return { status: 'Aplicado' };
  if (['cerrada', 'descartada'].includes(lower)) return { status: 'Descartado' };
  if (['no aplicar', 'no_aplicar', 'skip'].includes(lower)) return { status: 'NO APLICAR' };

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
