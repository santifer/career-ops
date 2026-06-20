#!/usr/bin/env node

/**
 * write-profile.mjs — the CANONICAL, merge-safe writer for config/profile.yml.
 *
 * THE single source of truth for profile writes: both the CLI onboarding and the
 * web (/api/profile) call THIS, so they produce byte-identical, merge-safe files —
 * no parallel-engine drift. (Part of the career-ops 2.0 web work; drafted by
 * career-ops-ui, owned by the maintainer.)
 *
 * DATA CONTRACT (config/profile.yml is a USER-LAYER file — see DATA_CONTRACT.md):
 *   - NEVER clobber: deep-merge ONLY the proposed keys onto the existing file;
 *     archetypes / narrative / proof_points / and every unspecified field survive.
 *   - First create: seed structure from config/profile.example.yml when present.
 *   - Always valid YAML; atomic write (temp + rename) so an interrupted write can
 *     never truncate the user's profile.
 *
 * Usage:
 *   echo '{"name":"Ada","email":"a@x.com","roles":["AI Engineer"],"compMin":70000,"compMax":95000,"currency":"EUR","location":"Madrid","remote":"Remote (EU)","seniority":"Senior"}' \
 *     | node write-profile.mjs --json
 *   node write-profile.mjs --json --file path/to/patch.json
 *   node write-profile.mjs --json --dry-run        # print the merged YAML, write nothing
 *
 * Stdout (always JSON on --json): {"ok":true,"seeded":false,"path":"config/profile.yml","changed":["candidate.full_name",...]}
 *
 * Patch fields (all optional; only confident fields should be sent):
 *   name → candidate.full_name · email → candidate.email · location → candidate.location
 *   roles[] → target_roles.primary · compMin+compMax → compensation.target_range
 *   currency → compensation.currency · remote → compensation.location_flexibility
 *   seniority → seniority
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const PROFILE_PATH = process.env.CAREER_OPS_PROFILE || 'config/profile.yml';
const EXAMPLE_PATH = 'config/profile.example.yml';

function parseArgs(argv) {
  const a = argv.slice(2);
  const valueOf = (flag) => {
    const i = a.indexOf(flag);
    return i !== -1 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : null;
  };
  return { json: a.includes('--json'), dryRun: a.includes('--dry-run'), file: valueOf('--file') };
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (d) => (buf += d));
    process.stdin.on('end', () => resolve(buf));
    // No stdin piped (TTY) → resolve empty so we can error cleanly.
    if (process.stdin.isTTY) resolve('');
  });
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge src onto dst (objects recurse; arrays/scalars replace). Non-mutating.
 *  Records every leaf path that changed into `changed`. */
function deepMerge(dst, src, changed, prefix = '') {
  const out = isObj(dst) ? { ...dst } : {};
  for (const [k, v] of Object.entries(src)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isObj(v)) {
      out[k] = deepMerge(out[k], v, changed, key);
    } else {
      if (JSON.stringify(out[k]) !== JSON.stringify(v)) changed.push(key);
      out[k] = v;
    }
  }
  return out;
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);

/** Map the flat web/CLI patch into the canonical profile.yml shape. */
function patchToProfile(p) {
  const out = {};
  const candidate = {};
  if (str(p.name)) candidate.full_name = str(p.name);
  if (str(p.email)) candidate.email = str(p.email);
  if (str(p.location)) candidate.location = str(p.location);
  if (Object.keys(candidate).length) out.candidate = candidate;

  const roles = Array.isArray(p.roles) ? p.roles.filter((r) => typeof r === 'string' && r.trim()).map((r) => r.trim()).slice(0, 6) : [];
  if (roles.length) out.target_roles = { primary: roles };

  const comp = {};
  if (num(p.compMin) && num(p.compMax)) comp.target_range = `${num(p.compMin)}-${num(p.compMax)}`;
  if (str(p.currency)) comp.currency = str(p.currency);
  if (str(p.remote)) comp.location_flexibility = str(p.remote);
  if (Object.keys(comp).length) out.compensation = comp;
  // NOTE: seniority is intentionally NOT written — it has no canonical home in
  // profile.yml (it's encoded in the role titles + read from the CV). Archetypes/
  // narrative live in modes/_profile.md, NOT here, so this writer never touches them.
  return out;
}

function loadYaml(file) {
  try {
    const doc = yaml.load(readFileSync(file, 'utf-8'));
    return isObj(doc) ? doc : {};
  } catch {
    return null;
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const fail = (msg) => {
    process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
    process.exit(1);
  };

  let raw;
  try {
    raw = opts.file ? readFileSync(opts.file, 'utf-8') : await readStdin();
  } catch (e) {
    return fail(`could not read patch: ${e.message}`);
  }
  let patch;
  try {
    patch = JSON.parse(raw || '{}');
  } catch {
    return fail('patch is not valid JSON');
  }

  const proposed = patchToProfile(patch);
  if (Object.keys(proposed).length === 0) return fail('nothing to write (no recognized fields)');

  // DATA-LOSS GUARD (bug-class #649/#704/#920/#958): distinguish "no profile yet"
  // (safe to seed) from "profile EXISTS but is malformed" (NEVER overwrite — that
  // would silently destroy the user's archetypes/narrative/comp on a stray tab).
  let base;
  let seeded = false;
  if (!existsSync(PROFILE_PATH)) {
    base = loadYaml(EXAMPLE_PATH) ?? {};
    seeded = Object.keys(base).length > 0;
  } else {
    base = loadYaml(PROFILE_PATH);
    if (base === null) {
      return fail('config/profile.yml exists but is not valid YAML — refusing to overwrite (fix it or move it aside)');
    }
    if (!opts.dryRun) {
      try {
        copyFileSync(PROFILE_PATH, `${PROFILE_PATH}.bak`); // belt-and-suspenders snapshot
      } catch {
        /* best-effort */
      }
    }
  }

  const changed = [];
  const merged = deepMerge(base ?? {}, proposed, changed);
  const out = yaml.dump(merged, { lineWidth: 100, noRefs: true });

  if (opts.dryRun) {
    if (opts.json) process.stdout.write(JSON.stringify({ ok: true, seeded, path: PROFILE_PATH, changed, dryRun: true }) + '\n');
    else process.stdout.write(out);
    return;
  }

  try {
    mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
    const tmp = `${PROFILE_PATH}.tmp-${process.pid}`;
    writeFileSync(tmp, out, 'utf-8');
    renameSync(tmp, PROFILE_PATH); // atomic
  } catch (e) {
    return fail(`write failed: ${e.message}`);
  }

  process.stdout.write(JSON.stringify({ ok: true, seeded, path: PROFILE_PATH, changed }) + '\n');
}

main();
