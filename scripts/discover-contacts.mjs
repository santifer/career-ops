#!/usr/bin/env node
/**
 * scripts/discover-contacts.mjs — Phase 4 contact discovery.
 *
 * Given a target company, produce a unified contact card pulling signal from
 * every personal surface Mitchell has connected:
 *   • data/linkedin/Connections.csv          (1st-degree LinkedIn)
 *   • data/linkedin/2nd-degree/{slug}.json   (LinkedIn 2nd-degree, if scraped)
 *   • data/linkedin/overrides.json           (manual no-longer-at / now-at)
 *   • data/outreach-state.json               (logged touches per contact)
 *   • data/company-intel-cache/{slug}/       (cached council intel)
 *   • data/hm-intel/{slug}-{role}.json       (deep HM intel from prior research)
 *   • Gmail        (MCP — search threads for company domain + named contacts)
 *   • Google Drive (MCP — search docs mentioning company / HM)
 *   • Google Cal   (MCP — past meetings with anyone at the company)
 *   • X / Twitter  (stub — pending future connector)
 *
 * ─── Design pivot: hybrid orchestration ──────────────────────────────────
 * MCP tools are Claude Code tool calls, not Node fetch calls — a Node script
 * cannot directly invoke `mcp__gmail__search_threads` etc. So this script
 * runs in a hybrid mode:
 *
 *   1. Local sources (Connections.csv, overrides, 2nd-degree files, outreach
 *      state, cached intel) are fully aggregated by this script.
 *   2. MCP-dependent sources are emitted as a structured task list in
 *      data/contact-discovery-tasks/{slug}-{ts}.md — a fresh Claude Code
 *      session (or the council-of-models orchestrator) reads this file, makes
 *      the MCP calls, and merges results back into the JSON.
 *
 * --no-mcp skips the task-list emission and runs local-only. The local layer
 * alone is already substantial — for most companies Mitchell has 1st-degree
 * coverage via Connections.csv plus warm-intro paths via 2nd-degree scrapes.
 *
 * CLI:
 *   node scripts/discover-contacts.mjs --company "Anthropic"
 *   node scripts/discover-contacts.mjs --company "Anthropic" --role "Strategic Operations Manager"
 *   node scripts/discover-contacts.mjs --company "Anthropic" --depth 2
 *   node scripts/discover-contacts.mjs --company "Anthropic" --no-mcp
 *   node scripts/discover-contacts.mjs --company "Anthropic" --out path/to/custom.md
 *
 * Output:
 *   data/contact-cards/{slug}/contact-card-{ts}.json
 *   data/contact-cards/{slug}/contact-card-{ts}.md
 *   data/contact-discovery-tasks/{slug}-{ts}.md   (unless --no-mcp)
 *
 * All output paths are under data/ — gitignored as personal contact data.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeCompany,
  getContactsAtCompany,
  getSecondDegreeAtCompany,
  networkSummary,
  getWarmIntroPaths,
  networkMeta,
} from '../lib/linkedin-network.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── MCP tool name patterns ──────────────────────────────────────────────
// These are the tool names the emitted task list will instruct an agent to
// call. Actual installed names may vary across Claude Code MCP server
// configurations — the task list documents the expected shape, and the agent
// substitutes the correct name at invocation time. The Node script never
// tries to call these directly.
const MCP_TOOL_HINTS = {
  gmail: [
    'mcp__gmail__search_threads',
    'mcp__gmail__get_thread',
    'mcp__111895ab-e89d-4d23-a6a9-6f79f783d9ca__search_threads', // observed connector id 2026-05-16
    'mcp__111895ab-e89d-4d23-a6a9-6f79f783d9ca__get_thread',
  ],
  drive: [
    'mcp__drive__search_files',
    'mcp__drive__read_file_content',
    'mcp__88e88cb7-03de-4ec5-9105-9f0af9ca7a3d__search_files',
    'mcp__88e88cb7-03de-4ec5-9105-9f0af9ca7a3d__read_file_content',
  ],
  calendar: [
    'mcp__calendar__list_events',
    'mcp__calendar__search',
    'mcp__8cb73d08-ce39-4e09-a4d6-6a7fa370a7fc__list_events',
    'mcp__8cb73d08-ce39-4e09-a4d6-6a7fa370a7fc__list_calendars',
  ],
  x_twitter: [
    // No X connector available yet (2026-05-16). Stubbed for future use —
    // Mitchell can run scripts/scrape-x-activity.mjs in the meantime.
  ],
};

// ─── CLI parsing ─────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { company: '', role: '', depth: 1, mcp: true, outPath: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--company') { out.company = next; i++; }
    else if (a.startsWith('--company=')) { out.company = a.split('=').slice(1).join('='); }
    else if (a === '--role') { out.role = next; i++; }
    else if (a.startsWith('--role=')) { out.role = a.split('=').slice(1).join('='); }
    else if (a === '--depth') { out.depth = Number(next); i++; }
    else if (a.startsWith('--depth=')) { out.depth = Number(a.split('=')[1]); }
    else if (a === '--no-mcp') { out.mcp = false; }
    else if (a === '--out') { out.outPath = next; i++; }
    else if (a.startsWith('--out=')) { out.outPath = a.split('=').slice(1).join('='); }
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return out;
}

function printHelp() {
  console.log(`discover-contacts.mjs — Phase 4 unified contact discovery

Usage:
  node scripts/discover-contacts.mjs --company "Anthropic"
  node scripts/discover-contacts.mjs --company "Anthropic" --role "Strategic Operations Manager"
  node scripts/discover-contacts.mjs --company "Anthropic" --depth 2
  node scripts/discover-contacts.mjs --company "Anthropic" --no-mcp
  node scripts/discover-contacts.mjs --company "Anthropic" --out data/contact-cards/anthropic-custom.md

Flags:
  --company NAME    (required) Target company
  --role TITLE      (optional) Specific role for HM-intel matching
  --depth 1|2       Include 2nd-degree warm-intro paths (default 1)
  --no-mcp          Skip MCP task-list emission (local sources only)
  --out PATH        Override default markdown output path

Output:
  data/contact-cards/{slug}/contact-card-{ts}.json
  data/contact-cards/{slug}/contact-card-{ts}.md
  data/contact-discovery-tasks/{slug}-{ts}.md   (unless --no-mcp)
`);
}

// ─── Slug helpers ─────────────────────────────────────────────────────────
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nowIso() {
  return new Date().toISOString();
}

function tsCompact() {
  // Filesystem-safe variant of ISO with colons/dots flattened.
  return nowIso().replace(/[:.]/g, '-');
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

// ─── Local-source readers ────────────────────────────────────────────────

function readOutreachState() {
  const p = join(ROOT, 'data/outreach-state.json');
  if (!existsSync(p)) return { contacts: [] };
  try { return JSON.parse(readFileSync(p, 'utf-8')); }
  catch { return { contacts: [] }; }
}

function readCompanyIntelCache(slug) {
  const dir = join(ROOT, 'data/company-intel-cache', slug);
  if (!existsSync(dir)) return null;
  // Latest intel-*.json wins.
  const files = readdirSync(dir).filter(f => /^intel-.*\.json$/.test(f)).sort();
  if (!files.length) return null;
  try {
    const obj = JSON.parse(readFileSync(join(dir, files[files.length - 1]), 'utf-8'));
    return { path: join('data/company-intel-cache', slug, files[files.length - 1]), data: obj };
  } catch { return null; }
}

function readHmIntel(companySlug, roleSlug) {
  const dir = join(ROOT, 'data/hm-intel');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const matches = [];
  for (const f of files) {
    if (!f.toLowerCase().startsWith(companySlug + '-')) continue;
    if (roleSlug && !f.toLowerCase().includes(roleSlug)) continue;
    try {
      const obj = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      matches.push({ file: f, data: obj });
    } catch (_) {}
  }
  return matches;
}

// Map a 1st-degree connection record to the contact-card schema, enriched
// with the latest outreach-state touch if one exists for this person.
function toFirstDegreeCard(c, outreachByKey) {
  const fullName = `${c.first || ''} ${c.last || ''}`.trim();
  const urlKey = (c.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  const nameKey = `${fullName}|${normalizeCompany(c.company)}`.toLowerCase();
  const touch = outreachByKey.get(urlKey) || outreachByKey.get(nameKey) || null;
  let lastVia = 'none';
  let lastDate = null;
  if (touch && touch.touches && touch.touches.length) {
    const last = touch.touches[touch.touches.length - 1];
    lastVia = last.channel || 'none';
    lastDate = last.ts || null;
  }
  return {
    name: fullName,
    title: c.position || '',
    company: c.company || '',
    linkedin_url: c.url || '',
    email_known: null, // privacy: lib/linkedin-network.mjs strips email at parse time
    x_handle: touch?.intel?.x_handle || null,
    connected_on: c.when || '',
    note: c.note || null,
    last_contact_via: lastVia,
    last_contact_date: lastDate,
    warm_path: 'direct',
    outreach_status: touch?.status || null,
    outreach_tier: touch?.tier || null,
    source_flag: c._source || 'csv',
  };
}

function toSecondDegreePath(warmPath) {
  // getWarmIntroPaths returns objects like:
  //   { target_name, target_url, target_title, target_location,
  //     mutual_count, resolved_intros: [{name, url, position, atCompany}] }
  const intros = warmPath.resolved_intros || [];
  return intros.map(intro => ({
    introducer_name:    intro.name,
    introducer_url:     intro.url,
    introducer_company: intro.atCompany,
    introducer_title:   intro.position,
    target_name:        warmPath.target_name,
    target_url:         warmPath.target_url,
    target_title:       warmPath.target_title || '',
    hop_count:          2,
    mutual_count:       warmPath.mutual_count,
  }));
}

// ─── Recommendation engine ───────────────────────────────────────────────

// Pick the warmest contact for the recommendation block. Priority order:
//   1. 1st-degree with prior responded outreach
//   2. 1st-degree with any prior outreach touch
//   3. 1st-degree, never contacted, sorted by most-recently-connected
//   4. 2nd-degree warm-intro path with most mutuals
//   5. Cached HM intel (named individual from prior council research)
//   6. None — surface the cold-outreach fallback
function recommendPrimaryContact(card) {
  const fd = card.first_degree || [];

  const responded = fd.find(c => c.outreach_status === 'responded' || c.outreach_status === 'warm');
  if (responded) {
    return {
      name: responded.name,
      type: '1st-degree, prior reply',
      rationale: `1st-degree LinkedIn connection at ${responded.company || card.company} with outreach status "${responded.outreach_status}". Most recent contact via ${responded.last_contact_via} on ${responded.last_contact_date || 'unknown date'}.`,
    };
  }

  const touched = fd.find(c => c.last_contact_via && c.last_contact_via !== 'none');
  if (touched) {
    return {
      name: touched.name,
      type: '1st-degree, prior outreach',
      rationale: `1st-degree LinkedIn connection with prior touch via ${touched.last_contact_via} on ${touched.last_contact_date || 'unknown date'}. Awaiting reply; consider follow-up cadence before re-engaging.`,
    };
  }

  if (fd.length) {
    const first = fd[0];
    return {
      name: first.name,
      type: '1st-degree, never contacted',
      rationale: `1st-degree LinkedIn connection at ${first.company || card.company}, connected ${first.connected_on || 'unknown date'}. Direct DM is the warmest available path.`,
    };
  }

  const paths = card.second_degree_paths || [];
  if (paths.length) {
    const strongest = paths[0];
    return {
      name: strongest.target_name,
      type: '2nd-degree via warm intro',
      rationale: `No 1st-degree contacts. Strongest warm-intro path: ${strongest.introducer_name} (1st-degree, ${strongest.introducer_company || 'unknown company'}) → ${strongest.target_name} (${strongest.target_title || 'role unknown'}). ${strongest.mutual_count || '?'} total mutuals at the target.`,
    };
  }

  const hm = (card.cached_hm_intel || []).find(h => h.data?.hiring_managers?.length);
  if (hm) {
    const top = hm.data.hiring_managers[0];
    return {
      name: top.name,
      type: 'HM from cached council intel',
      rationale: `No personal-network coverage. Cached hiring-manager intel from prior council research identifies ${top.name} (${top.title || 'title unknown'}) as the likely owner of this req. Confidence: ${top.confidence || 'unknown'}. Cold-outreach territory — use the hook in ${hm.file}.`,
    };
  }

  return {
    name: null,
    type: 'no warm path',
    rationale: 'No 1st-degree connections, no warm-intro paths, no cached HM intel for this company. Run scripts/scrape-linkedin-2nd-degree.mjs to map 2nd-degree coverage, then re-run discover-contacts.',
  };
}

// ─── Main orchestrator ───────────────────────────────────────────────────

function buildCard(args) {
  const { company, role, depth } = args;
  const slug = slugify(company);
  const roleSlug = role ? slugify(role) : '';

  const meta = networkMeta();
  const sourcesUsed = [];
  const sourcesSkipped = [];

  // ─ Local: 1st-degree ──────────────────────────────────────────────────
  const firstRaw = getContactsAtCompany(company);
  if (meta.csvLoaded) {
    sourcesUsed.push('connections_csv');
  } else {
    sourcesSkipped.push({ name: 'connections_csv', reason: 'data/linkedin/Connections.csv not found' });
  }

  // overrides.json is loaded internally by lib/linkedin-network.mjs, so flag
  // it as used iff its file actually exists.
  if (existsSync(join(ROOT, 'data/linkedin/overrides.json'))) {
    sourcesUsed.push('linkedin_overrides');
  }

  // ─ Local: outreach state ──────────────────────────────────────────────
  const outreach = readOutreachState();
  const outreachByKey = new Map();
  for (const c of outreach.contacts || []) {
    if (normalizeCompany(c.company || '') !== normalizeCompany(company)) continue;
    if (c.contact_id) {
      const id = String(c.contact_id).replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
      outreachByKey.set(id, c);
    }
    if (c.name) {
      const k = `${c.name}|${normalizeCompany(c.company || '')}`.toLowerCase();
      outreachByKey.set(k, c);
    }
  }
  if (existsSync(join(ROOT, 'data/outreach-state.json'))) sourcesUsed.push('outreach_state');

  const firstDegree = firstRaw.map(c => toFirstDegreeCard(c, outreachByKey));

  // ─ Local: 2nd-degree warm intros ──────────────────────────────────────
  let secondDegreePaths = [];
  if (depth >= 2) {
    const sd = getSecondDegreeAtCompany(company);
    if (sd) {
      sourcesUsed.push('linkedin_2nd_degree');
      const paths = getWarmIntroPaths(company);
      // Flatten — each warm-intro path can expand into multiple (introducer, target) pairs.
      secondDegreePaths = paths.flatMap(toSecondDegreePath);
    } else {
      sourcesSkipped.push({
        name: 'linkedin_2nd_degree',
        reason: `No data/linkedin/2nd-degree/{slug}.json for "${company}". Run scripts/scrape-linkedin-2nd-degree.mjs to add coverage.`,
      });
    }
  }

  // ─ Local: cached council intel ────────────────────────────────────────
  const intelCache = readCompanyIntelCache(slug);
  if (intelCache) sourcesUsed.push('company_intel_cache');

  // ─ Local: deep HM intel ───────────────────────────────────────────────
  const hmIntel = readHmIntel(slug, roleSlug);
  if (hmIntel.length) sourcesUsed.push('hm_intel');

  // ─ MCP placeholders (filled in by agent via task list) ────────────────
  if (args.mcp) {
    sourcesSkipped.push({
      name: 'gmail',
      reason: 'MCP tool — must be invoked by Claude Code session; see data/contact-discovery-tasks/ for task list.',
    });
    sourcesSkipped.push({
      name: 'drive',
      reason: 'MCP tool — must be invoked by Claude Code session; see data/contact-discovery-tasks/ for task list.',
    });
    sourcesSkipped.push({
      name: 'calendar',
      reason: 'MCP tool — must be invoked by Claude Code session; see data/contact-discovery-tasks/ for task list.',
    });
  } else {
    sourcesSkipped.push({ name: 'gmail',    reason: '--no-mcp: skipped' });
    sourcesSkipped.push({ name: 'drive',    reason: '--no-mcp: skipped' });
    sourcesSkipped.push({ name: 'calendar', reason: '--no-mcp: skipped' });
  }
  sourcesSkipped.push({ name: 'x_twitter', reason: 'X / Twitter connector not available yet — pending future MCP. Run scripts/scrape-x-activity.mjs for manual scrape.' });

  const card = {
    schema_version: 1,
    company,
    company_normalized: normalizeCompany(company),
    company_slug: slug,
    role: role || null,
    role_slug: roleSlug || null,
    depth,
    computed_at: nowIso(),
    sources_used: sourcesUsed,
    sources_skipped: sourcesSkipped,
    first_degree: firstDegree,
    second_degree_paths: secondDegreePaths,
    cached_company_intel: intelCache ? {
      path: intelCache.path,
      computed_at: intelCache.data?.computed_at || null,
      hiring_posture: intelCache.data?.hiring_posture || null,
      toxicity_verdict: intelCache.data?.toxicity_score?.verdict || null,
      hiring_manager_hint: intelCache.data?.hiring_manager?.name || null,
    } : null,
    cached_hm_intel: hmIntel.map(h => ({
      file: h.file,
      role: h.data?.role || null,
      synthesized_at: h.data?.synthesized_at || null,
      hiring_managers: (h.data?.hiring_managers || []).map(hm => ({
        name: hm.name,
        title: hm.title || null,
        linkedin_url: hm.linkedin_url || null,
        professional_email: hm.professional_email || null,
        x_handle: hm.x_handle || null,
        confidence: hm.confidence || null,
      })),
      recruiters: (h.data?.recruiters || []).map(r => ({
        name: r.name,
        title: r.title || null,
        linkedin_url: r.linkedin_url || null,
        professional_email: r.professional_email || null,
        confidence: r.confidence || null,
      })),
    })),
    // MCP-populated slots (left empty for the agent to fill in):
    gmail_threads:   [],
    drive_docs:      [],
    calendar_events: [],
    x_twitter:       [],
    primary_contact_recommendation: null,
    network_meta: {
      total_contacts_indexed: meta.totalContacts,
      csv_updated: meta.csvUpdated,
    },
  };
  card.primary_contact_recommendation = recommendPrimaryContact(card);
  return card;
}

// ─── Markdown rendering ──────────────────────────────────────────────────

function renderCardMarkdown(card) {
  const lines = [];
  lines.push(`# Contact Card — ${card.company}`);
  lines.push('');
  lines.push(`- **Computed:** ${card.computed_at}`);
  if (card.role) lines.push(`- **Role focus:** ${card.role}`);
  lines.push(`- **Depth:** ${card.depth}`);
  lines.push(`- **Sources used:** ${card.sources_used.join(', ') || '(none)'}`);
  lines.push(`- **Sources skipped:** ${card.sources_skipped.map(s => s.name).join(', ') || '(none)'}`);
  lines.push(`- **Network meta:** ${card.network_meta.total_contacts_indexed} contacts indexed (CSV updated ${card.network_meta.csv_updated || '?'})`);
  lines.push('');

  // Primary recommendation up top — this is the action-cut.
  lines.push('## Primary contact recommendation');
  lines.push('');
  const rec = card.primary_contact_recommendation;
  if (rec.name) {
    lines.push(`**${rec.name}** _(${rec.type})_`);
    lines.push('');
    lines.push(rec.rationale);
  } else {
    lines.push(`_${rec.rationale}_`);
  }
  lines.push('');

  // 1st-degree
  lines.push(`## 1st-degree contacts (${card.first_degree.length})`);
  lines.push('');
  if (!card.first_degree.length) {
    lines.push('_None._');
  } else {
    lines.push('| Name | Title | Connected | Last touch | Status | LinkedIn |');
    lines.push('|------|-------|-----------|------------|--------|----------|');
    for (const c of card.first_degree) {
      const url = c.linkedin_url ? `[link](${c.linkedin_url})` : '—';
      const touch = c.last_contact_date ? `${c.last_contact_via} · ${c.last_contact_date.slice(0, 10)}` : (c.last_contact_via || 'none');
      lines.push(`| ${c.name} | ${c.title || '—'} | ${c.connected_on || '—'} | ${touch} | ${c.outreach_status || '—'} | ${url} |`);
    }
  }
  lines.push('');

  // 2nd-degree warm intros
  lines.push(`## 2nd-degree warm-intro paths (${card.second_degree_paths.length})`);
  lines.push('');
  if (!card.second_degree_paths.length) {
    if (card.depth < 2) {
      lines.push('_Skipped — pass `--depth 2` to include 2nd-degree paths._');
    } else {
      lines.push('_None found. Run scripts/scrape-linkedin-2nd-degree.mjs to add coverage for this company._');
    }
  } else {
    lines.push('| Introducer (1st-degree) | Introducer @ | Target (2nd-degree) | Target title | Mutuals |');
    lines.push('|-------------------------|--------------|---------------------|--------------|---------|');
    for (const p of card.second_degree_paths) {
      const intro = p.introducer_url ? `[${p.introducer_name}](${p.introducer_url})` : p.introducer_name;
      const target = p.target_url ? `[${p.target_name}](${p.target_url})` : p.target_name;
      lines.push(`| ${intro} | ${p.introducer_company || '—'} | ${target} | ${p.target_title || '—'} | ${p.mutual_count ?? '?'} |`);
    }
  }
  lines.push('');

  // Cached HM intel
  if (card.cached_hm_intel.length) {
    lines.push('## Cached HM intel (prior council research)');
    lines.push('');
    for (const h of card.cached_hm_intel) {
      lines.push(`### ${h.role || h.file}`);
      lines.push('');
      lines.push(`_Source: data/hm-intel/${h.file} · synthesized ${h.synthesized_at || '?'}_`);
      lines.push('');
      if (h.hiring_managers.length) {
        lines.push('**Hiring managers:**');
        for (const hm of h.hiring_managers) {
          const link = hm.linkedin_url ? ` · [LinkedIn](${hm.linkedin_url})` : '';
          const email = hm.professional_email ? ` · ${hm.professional_email}` : '';
          lines.push(`- **${hm.name}** — ${hm.title || '?'} _(confidence: ${hm.confidence || '?'})_${link}${email}`);
        }
        lines.push('');
      }
      if (h.recruiters.length) {
        lines.push('**Recruiters:**');
        for (const r of h.recruiters) {
          const link = r.linkedin_url ? ` · [LinkedIn](${r.linkedin_url})` : '';
          const email = r.professional_email ? ` · ${r.professional_email}` : '';
          lines.push(`- **${r.name}** — ${r.title || '?'} _(confidence: ${r.confidence || '?'})_${link}${email}`);
        }
        lines.push('');
      }
    }
  }

  // Cached company intel
  if (card.cached_company_intel) {
    lines.push('## Cached company intel');
    lines.push('');
    lines.push(`- **Path:** ${card.cached_company_intel.path}`);
    lines.push(`- **Computed:** ${card.cached_company_intel.computed_at || '?'}`);
    lines.push(`- **Hiring posture:** ${card.cached_company_intel.hiring_posture || '?'}`);
    lines.push(`- **Toxicity:** ${card.cached_company_intel.toxicity_verdict || '?'}`);
    if (card.cached_company_intel.hiring_manager_hint) {
      lines.push(`- **HM hint from intel:** ${card.cached_company_intel.hiring_manager_hint}`);
    }
    lines.push('');
  }

  // MCP-populated sections — show placeholders if empty so reader knows to expect them.
  const mcpSections = [
    { key: 'gmail_threads',   header: 'Gmail threads',    skipName: 'gmail' },
    { key: 'drive_docs',      header: 'Drive docs',       skipName: 'drive' },
    { key: 'calendar_events', header: 'Calendar events',  skipName: 'calendar' },
    { key: 'x_twitter',       header: 'X / Twitter',      skipName: 'x_twitter' },
  ];
  for (const sec of mcpSections) {
    const vals = card[sec.key] || [];
    lines.push(`## ${sec.header} (${vals.length})`);
    lines.push('');
    if (!vals.length) {
      const skip = card.sources_skipped.find(s => s.name === sec.skipName);
      lines.push(`_${skip ? skip.reason : 'No data.'}_`);
    } else {
      for (const v of vals) {
        const summary = v.subject || v.title || v.summary || JSON.stringify(v).slice(0, 80);
        const date = v.date || v.modified || '?';
        lines.push(`- ${summary} — ${date}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── MCP task-list emitter ───────────────────────────────────────────────

function buildMcpTaskList(card, args) {
  const lines = [];
  const slug = card.company_slug;
  const seedNames = [
    ...card.first_degree.slice(0, 5).map(c => c.name),
    ...(card.cached_hm_intel.flatMap(h => h.hiring_managers.map(hm => hm.name)).slice(0, 5)),
  ].filter(Boolean);

  // Derive a likely email domain heuristically: companyslug + .com / .ai.
  // Agent should refine with overrides from cached intel if available.
  const domainGuesses = [`${slug}.com`, `${slug}.ai`];

  lines.push(`# Contact Discovery — MCP Task List`);
  lines.push('');
  lines.push(`**Target company:** ${card.company}`);
  if (card.role) lines.push(`**Role focus:** ${card.role}`);
  lines.push(`**Computed:** ${card.computed_at}`);
  lines.push(`**Local card:** data/contact-cards/${slug}/contact-card-${tsCompact()}.json (see directory for latest)`);
  lines.push('');
  lines.push('## What this file is');
  lines.push('');
  lines.push('Node scripts in this repo cannot directly invoke MCP tools — those are Claude Code tool calls.');
  lines.push('This file lists the MCP queries an agent (the council-of-models orchestrator, or a fresh Claude Code session) should execute,');
  lines.push('then describes the exact JSON shape to merge back into the contact-card JSON above.');
  lines.push('');
  lines.push('## Seed inputs');
  lines.push('');
  lines.push(`- **Company:** ${card.company}`);
  lines.push(`- **Email domain guesses:** ${domainGuesses.join(', ')} _(refine if cached intel has a better signal)_`);
  lines.push(`- **Named people to search by name:**`);
  if (seedNames.length) {
    for (const n of seedNames) lines.push(`  - ${n}`);
  } else {
    lines.push('  - _(no 1st-degree or cached HM seeds — search by company name + domain only)_');
  }
  lines.push('');

  // ─ Gmail task ────────────────────────────────────────────────────────
  lines.push('## Task 1 — Gmail threads');
  lines.push('');
  lines.push('**Tools to try (use whichever is installed):**');
  for (const t of MCP_TOOL_HINTS.gmail) lines.push(`- \`${t}\``);
  lines.push('');
  lines.push('**Queries:**');
  lines.push('');
  lines.push('1. Search by domain:');
  lines.push('   ```');
  for (const d of domainGuesses) lines.push(`   from:${d} OR to:${d}`);
  lines.push('   ```');
  if (seedNames.length) {
    lines.push('2. Search by named individual (one query per person):');
    lines.push('   ```');
    for (const n of seedNames) lines.push(`   "${n}"`);
    lines.push('   ```');
  }
  lines.push('');
  lines.push('**Merge schema (append each result to `gmail_threads` in the JSON):**');
  lines.push('```json');
  lines.push('{');
  lines.push('  "thread_id": "...",');
  lines.push('  "subject": "...",');
  lines.push('  "from": "...",');
  lines.push('  "to": "...",');
  lines.push('  "date": "...",');
  lines.push('  "snippet": "..."');
  lines.push('}');
  lines.push('```');
  lines.push('');

  // ─ Drive task ────────────────────────────────────────────────────────
  lines.push('## Task 2 — Google Drive docs');
  lines.push('');
  lines.push('**Tools to try:**');
  for (const t of MCP_TOOL_HINTS.drive) lines.push(`- \`${t}\``);
  lines.push('');
  lines.push('**Queries:**');
  lines.push('');
  lines.push(`1. Search Drive for "${card.company}" in document titles and body content.`);
  if (card.role) lines.push(`2. Search Drive for "${card.role}" combined with "${card.company}".`);
  if (seedNames.length) {
    lines.push('3. Search for documents mentioning the named individuals (one search per person):');
    for (const n of seedNames) lines.push(`   - "${n}"`);
  }
  lines.push('');
  lines.push('**Merge schema (append each to `drive_docs`):**');
  lines.push('```json');
  lines.push('{');
  lines.push('  "file_id": "...",');
  lines.push('  "title": "...",');
  lines.push('  "mime_type": "...",');
  lines.push('  "modified": "...",');
  lines.push('  "web_view_link": "...",');
  lines.push('  "snippet": "..."');
  lines.push('}');
  lines.push('```');
  lines.push('');

  // ─ Calendar task ─────────────────────────────────────────────────────
  lines.push('## Task 3 — Google Calendar events');
  lines.push('');
  lines.push('**Tools to try:**');
  for (const t of MCP_TOOL_HINTS.calendar) lines.push(`- \`${t}\``);
  lines.push('');
  lines.push('**Queries:**');
  lines.push('');
  lines.push(`1. List past 12 months of events; filter for any attendee email matching ${domainGuesses.join(' or ')}.`);
  if (seedNames.length) {
    lines.push('2. List past events with attendees whose displayName matches a seed name:');
    for (const n of seedNames) lines.push(`   - "${n}"`);
  }
  lines.push('');
  lines.push('**Merge schema (append each to `calendar_events`):**');
  lines.push('```json');
  lines.push('{');
  lines.push('  "event_id": "...",');
  lines.push('  "summary": "...",');
  lines.push('  "date": "...",');
  lines.push('  "attendees": [{ "email": "...", "name": "..." }],');
  lines.push('  "organizer": "...",');
  lines.push('  "calendar_link": "..."');
  lines.push('}');
  lines.push('```');
  lines.push('');

  // ─ X / Twitter task ─────────────────────────────────────────────────
  lines.push('## Task 4 — X / Twitter (stub)');
  lines.push('');
  lines.push('No X connector available as of 2026-05-16. Two manual paths:');
  lines.push('');
  lines.push(`1. Run \`node scripts/scrape-x-activity.mjs --handle <handle>\` for each named contact with a known X handle.`);
  lines.push('2. Skip until an X MCP server is connected.');
  lines.push('');
  lines.push('**Merge schema (append each to `x_twitter`):**');
  lines.push('```json');
  lines.push('{');
  lines.push('  "name": "...",');
  lines.push('  "handle": "...",');
  lines.push('  "last_post_date": "...",');
  lines.push('  "recent_themes": ["..."]');
  lines.push('}');
  lines.push('```');
  lines.push('');

  // ─ Re-recommend after merge ─────────────────────────────────────────
  lines.push('## After merging');
  lines.push('');
  lines.push('1. Re-run the recommendation logic in `scripts/discover-contacts.mjs` against the enriched JSON (or just hand the enriched JSON back to the user — the recommendation field can be re-derived by importing `recommendPrimaryContact`).');
  lines.push('2. Confirm `sources_used` now includes any MCP source you populated.');
  lines.push('3. Remove the corresponding entry from `sources_skipped`.');
  lines.push('');

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);
  if (!args.company) {
    console.error('Error: --company is required.\n');
    printHelp();
    process.exit(2);
  }
  if (![1, 2].includes(args.depth)) {
    console.error(`Error: --depth must be 1 or 2 (got ${args.depth}).`);
    process.exit(2);
  }

  const card = buildCard(args);
  const slug = card.company_slug;
  const ts = tsCompact();

  // Output paths.
  const cardDir = join(ROOT, 'data/contact-cards', slug);
  ensureDir(cardDir);
  const jsonPath = join(cardDir, `contact-card-${ts}.json`);
  const mdPath = args.outPath
    ? (args.outPath.replace(/\{ts\}/g, ts).replace(/\{slug\}/g, slug))
    : join(cardDir, `contact-card-${ts}.md`);

  // Resolve --out path if it's relative or contains the literal {ts}/{slug}.
  const mdAbsPath = mdPath.startsWith('/') ? mdPath : join(ROOT, mdPath);
  ensureDir(dirname(mdAbsPath));

  writeFileSync(jsonPath, JSON.stringify(card, null, 2));
  writeFileSync(mdAbsPath, renderCardMarkdown(card));

  let taskPath = null;
  if (args.mcp) {
    const taskDir = join(ROOT, 'data/contact-discovery-tasks');
    ensureDir(taskDir);
    taskPath = join(taskDir, `${slug}-${ts}.md`);
    writeFileSync(taskPath, buildMcpTaskList(card, args));
  }

  // Console summary.
  console.log(`Contact card for ${card.company} (${slug}):`);
  console.log(`  1st-degree contacts:        ${card.first_degree.length}`);
  console.log(`  2nd-degree warm intros:     ${card.second_degree_paths.length}`);
  console.log(`  Cached HM intel files:      ${card.cached_hm_intel.length}`);
  console.log(`  Cached company intel:       ${card.cached_company_intel ? 'yes' : 'no'}`);
  console.log(`  Sources used:               ${card.sources_used.join(', ')}`);
  console.log(`  Sources skipped:            ${card.sources_skipped.map(s => s.name).join(', ')}`);
  console.log('');
  console.log(`  Primary recommendation:     ${card.primary_contact_recommendation.name || '(none)'} (${card.primary_contact_recommendation.type})`);
  console.log('');
  console.log(`  JSON:           ${jsonPath}`);
  console.log(`  Markdown:       ${mdAbsPath}`);
  if (taskPath) console.log(`  MCP task list:  ${taskPath}`);
}

main();
