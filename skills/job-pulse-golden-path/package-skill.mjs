#!/usr/bin/env node
/**
 * package-skill.mjs
 *
 * Cross-platform packager for the job-pulse-golden-path skill.
 * Produces a .skill file (zip with renamed extension) in the output dir.
 *
 * Usage (from anywhere with Node 18+):
 *   node package-skill.mjs [skill-dir] [output-dir]
 *
 * Defaults:
 *   skill-dir  = directory containing this script
 *   output-dir = $USERPROFILE\career-ops\output (Windows) or ~/career-ops/output
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const skillDir = path.resolve(process.argv[2] || __dirname);
const outputDir = path.resolve(
  process.argv[3]
    || process.env.SKILL_OUTPUT_DIR
    || path.join(os.homedir(), 'career-ops', 'output'),
);
const skillName = path.basename(skillDir);

if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
  console.error(`SKILL.md not found in ${skillDir} — is this really a skill folder?`);
  process.exit(2);
}
fs.mkdirSync(outputDir, { recursive: true });
const skillPath = path.join(outputDir, `${skillName}.skill`);
if (fs.existsSync(skillPath)) fs.unlinkSync(skillPath);

// Walk the skill directory recursively, returning entries we want in the zip.
function walk(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name.startsWith('.git')) continue;
    if (entry.name.endsWith('.skill') || entry.name.endsWith('.zip')) continue;
    const abs = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push({ kind: 'dir', rel: rel + '/', abs });
      out.push(...walk(abs, rel));
    } else if (entry.isFile()) {
      out.push({ kind: 'file', rel, abs });
    }
  }
  return out;
}

// Minimal ZIP writer (DEFLATE, no encryption, no Zip64). Sufficient for
// small skill bundles (<4 GB total).
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  const t = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  const d = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { t, d };
}

const entries = walk(skillDir);
const localChunks = [];
const centralChunks = [];
let offset = 0;

for (const e of entries) {
  const nameBuf = Buffer.from(e.rel, 'utf8');
  const isDir = e.kind === 'dir';
  const raw = isDir ? Buffer.alloc(0) : fs.readFileSync(e.abs);
  const stat = isDir ? null : fs.statSync(e.abs);
  const date = stat ? stat.mtime : new Date();
  const { t: dosT, d: dosD } = dosTime(date);
  const crc = isDir ? 0 : crc32(raw);
  const compressed = isDir ? Buffer.alloc(0) : zlib.deflateRawSync(raw);
  const method = isDir ? 0 : 8; // 0=store, 8=deflate
  const useStore = !isDir && compressed.length >= raw.length;
  const data = useStore ? raw : compressed;
  const finalMethod = useStore ? 0 : method;

  // Local file header
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);                // version needed
  localHeader.writeUInt16LE(0x0800, 6);            // flags: utf-8 names
  localHeader.writeUInt16LE(finalMethod, 8);
  localHeader.writeUInt16LE(dosT, 10);
  localHeader.writeUInt16LE(dosD, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(raw.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);

  localChunks.push(localHeader, nameBuf, data);

  // Central directory header
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x031E, 4);                // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(finalMethod, 10);
  central.writeUInt16LE(dosT, 12);
  central.writeUInt16LE(dosD, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(isDir ? 0x10 : 0, 38);     // external attrs (dir bit)
  central.writeUInt32LE(offset, 42);

  centralChunks.push(central, nameBuf);

  offset += localHeader.length + nameBuf.length + data.length;
}

const centralStart = offset;
const centralBuf = Buffer.concat(centralChunks);
offset += centralBuf.length;

const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(entries.length, 8);
eocd.writeUInt16LE(entries.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(centralStart, 16);
eocd.writeUInt16LE(0, 20);

fs.writeFileSync(skillPath, Buffer.concat([...localChunks, centralBuf, eocd]));
console.log(`OK: ${skillPath}`);
console.log(`    files:   ${entries.length}`);
console.log(`    size:    ${fs.statSync(skillPath).size} bytes`);
console.log('');
console.log('Install in any Cowork chat by dragging this .skill file into the chat,');
console.log('or via the skills installer in your Claude desktop app.');
