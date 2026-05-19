#!/usr/bin/env node
/**
 * scripts/agents/omega-steward.mjs — OMEGA, Ecosystem Steward.
 *
 * Meta-agent that periodically reviews every other agent in the ecosystem,
 * conducts current-state research, surfaces actionable recommendations to
 * data/omega-proposals-<date>.md, waits for Mitchell's explicit approval via
 * data/omega-approvals.md, then executes + verifies.
 *
 * Full spec: data/omega-spec-2026-05-19.md
 *
 * CLI:
 *   --inventory    : phase 1 only (list agents from manifest)
 *   --health       : phases 1-2 (health diagnostic per agent)
 *   --research     : phases 1-3 (+ web research, cached)
 *   --propose      : phases 1-5 (writes proposals, STOPS at approval gate) — DEFAULT
 *   --execute <id> : phase 7-9 for a single approved proposal
 *   --execute-all  : phase 7-9 for all approved SAFE-AUTO proposals from latest cycle
 *
 * Architectural conventions: matches scripts/agents/cv-tailor.mjs (runOmegaSteward export,
 * Zod-validated, cache-aware, model-agnostic).
 *
 * Hard prohibitions (auto-REJECTED):
 *   - any edit to cv.md / modes/_profile.md / config/profile.yml / article-digest.md
 *   - any self-edit without OMEGA-SELF-EDIT keyword + Mitchell's explicit approval
 *   - any proposal adding outbound network calls that exfiltrate gitignored personal data
 *   - any proposal routing critical decisions around council/dealbreaker
 *
 * Anti-sycophancy: explicit "no changes needed for agent X this cycle" is a valid output.
 * Empty-cycle reports are expected outcomes, not failures.
 *
 * Anti-hallucination: every research citation has a cached file under data/omega-cache/.
 * A claim without a cache file is rejected by the proposal-validation pass.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DATA_DIR = join(REPO_ROOT, 'data');
const CACHE_DIR = join(DATA_DIR, 'omega-cache');
const PROPOSALS_DIR = DATA_DIR; // proposals live at data/omega-proposals-<date>.md

const TODAY = new Date().toISOString().slice(0, 10);
const NOW = () => new Date().toISOString();

const MITCHELL_ONLY_FILES = [
    'cv.md',
    'modes/_profile.md',
    'config/profile.yml',
    'article-digest.md',
];

const SELF_FILES = [
    'scripts/agents/omega-steward.mjs',
    '.claude/skills/omega-steward/SKILL.md',
    'data/omega-spec-2026-05-19.md',
];

// Files in scripts/agents/ that are NOT agents (shared modules, type definitions).
const NON_AGENT_FILES = new Set(['types']);

// Code agents that legitimately share a SKILL.md with another code agent.
// The right-hand side is the slug under .claude/skills/ that owns the manifest.
// Fixes the silent-fallback bug: a code agent not on this map without its
// own SKILL.md is a real MISSING finding (not a false OK).
const SHARED_SKILL_MAP = {
    'cover-letter': 'apply-pack-polish',
    'cv-tailor': 'apply-pack-polish',
    'form-fields': 'apply-pack-polish',
    'impact-doc': 'apply-pack-polish',
    'references': 'apply-pack-polish',
    'referrals': 'apply-pack-polish',
    'linkedin-dm': 'apply-pack-polish',
    'why-statement': 'apply-pack-polish',
    'data-truth-auditor': 'data-truth-audit',
};

// Per-code-agent evidence paths (relative to REPO_ROOT). Each entry is either:
//   - a string: a path. If a dir, ALL files inside count as evidence (use for
//     agent-owned directories).
//   - an object { path, nameContains }: a path with a basename filter applied
//     to every file encountered. Use for shared dirs like data/logs where
//     unrelated files (e.g. dashboard-server.out) would otherwise win.
// Agents not in this map fall back to the legacy data/logs/<name>* glob.
const EVIDENCE_PATTERNS = {
    'apply-pack-polish':     ['data/apply-packs', { path: 'data/logs', nameContains: 'apply-pack' }],
    'cv-tailor':             ['data/apply-packs', { path: 'data/logs', nameContains: 'cv-tailor' }],
    'cover-letter':          ['data/apply-packs', { path: 'data/logs', nameContains: 'cover-letter' }],
    'form-fields':           ['data/apply-packs', { path: 'data/logs', nameContains: 'form-fields' }],
    'impact-doc':            ['data/apply-packs', { path: 'data/logs', nameContains: 'impact-doc' }],
    'references':            ['data/apply-packs', { path: 'data/logs', nameContains: 'references' }],
    'referrals':             ['data/apply-packs', { path: 'data/logs', nameContains: 'referrals' }],
    'linkedin-dm':           ['data/apply-packs', { path: 'data/logs', nameContains: 'linkedin-dm' }],
    'why-statement':         ['data/apply-packs', { path: 'data/logs', nameContains: 'why-statement' }],
    'intel-refresh':         ['data/intel-cache', 'data/intel-refresh-state.json', { path: 'data/logs', nameContains: 'intel-refresh' }],
    'data-truth-auditor':    ['data/data-truth-audit', { path: 'data/logs', nameContains: 'data-truth' }],
    'ai-detection-hardener': ['data/ai-detection-cache', 'data/ai-detection-calibration', { path: 'data/logs', nameContains: 'ai-detection' }],
    'system-maintainer':     [{ path: 'data/logs', nameContains: 'system-maintainer' }, { path: 'data/logs', nameContains: 'audit' }],
    'network-emailer':       ['data/network-database', { path: 'data/logs', nameContains: 'network-emailer' }],
    'network-enricher':      ['data/network-database', { path: 'data/logs', nameContains: 'network-enricher' }],
    'omega-steward':         ['data/omega-cache', { path: 'data/logs', nameContains: 'omega' }],
};

// Greek-letter autonomous instance lanes. Each lane is tracked via dated
// deliverables in data/<lane>-*.md (e.g., data/alpha-self-review-2026-05-19.md).
const GREEK_LANES = ['alpha', 'bravo', 'gamma', 'delta', 'epsilon', 'zeta'];

// ── Utilities ────────────────────────────────────────────────────────────────

function log(msg) {
    console.log(`[omega ${NOW()}] ${msg}`);
}

function ensureDir(p) {
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function readTextSafe(path) {
    try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function sha256(s) {
    return createHash('sha256').update(s).digest('hex');
}

// Walk a path (file or dir) and return the most recent mtime found, along
// with the file that produced it. Recurses into directories. If nameContains
// is provided, only files whose basename includes that substring are eligible
// (the directory traversal still recurses through unmatched dirs).
// Returns null if the path doesn't exist or no matching files were found.
function mostRecentMtimeUnder(absPath, nameContains = null) {
    if (!existsSync(absPath)) return null;
    const st = statSync(absPath);
    if (st.isFile()) {
        if (nameContains && !basename(absPath).includes(nameContains)) return null;
        return { mtimeMs: st.mtimeMs, file: absPath };
    }
    if (!st.isDirectory()) return null;
    let best = null;
    let entries;
    try { entries = readdirSync(absPath); } catch { return null; }
    for (const entry of entries) {
        const child = join(absPath, entry);
        const r = mostRecentMtimeUnder(child, nameContains);
        if (r && (!best || r.mtimeMs > best.mtimeMs)) best = r;
    }
    return best;
}

function parseArgs(argv) {
    const args = { mode: 'propose', target: null };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--inventory') args.mode = 'inventory';
        else if (a === '--health') args.mode = 'health';
        else if (a === '--research') args.mode = 'research';
        else if (a === '--propose') args.mode = 'propose';
        else if (a === '--execute') { args.mode = 'execute'; args.target = argv[++i]; }
        else if (a === '--execute-all') args.mode = 'execute-all';
    }
    return args;
}

// ── Phase 1: Inventory ───────────────────────────────────────────────────────

function inventoryAgents() {
    log('phase 1: inventory');
    // Read the most recent agent-ecosystem-manifest-*.md
    const manifests = readdirSync(DATA_DIR)
        .filter(f => /^agent-ecosystem-manifest-\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .sort()
        .reverse();

    if (manifests.length === 0) {
        log('  no manifest found — falling back to filesystem + lane enumeration');
        return enumerateAgentsFromFilesystem();
    }

    const manifestPath = join(DATA_DIR, manifests[0]);
    const content = readFileSync(manifestPath, 'utf8');
    log(`  reading manifest: ${manifests[0]} (${content.length} chars)`);

    // Extract agent names from manifest. The manifest format is human-prose markdown;
    // we look for headings or table rows that match the persona pattern.
    const agents = [];
    const seenAgents = new Set();
    // Match patterns like "## α ALPHA — ...", "ALPHA (α)", "scripts/agents/<name>.mjs"
    const personaRegex = /\b(ALPHA|BRAVO|GAMMA|DELTA|EPSILON|ZETA|OMEGA)\b/g;
    let m;
    while ((m = personaRegex.exec(content)) !== null) {
        const name = m[1].toLowerCase();
        if (!seenAgents.has(name)) {
            seenAgents.add(name);
            agents.push({ name, kind: 'lane', manifestSource: manifests[0] });
        }
    }
    log(`  inventoried ${agents.length} lanes from manifest`);
    return agents;
}

function enumerateAgentsFromFilesystem() {
    // Fallback: enumerate code agents from scripts/agents/*.mjs (minus shared
    // modules listed in NON_AGENT_FILES), plus active Greek-letter lanes that
    // have at least one dated deliverable under data/.
    const agentsDir = join(REPO_ROOT, 'scripts', 'agents');
    const codeAgents = !existsSync(agentsDir) ? [] : readdirSync(agentsDir)
        .filter(f => f.endsWith('.mjs'))
        .map(f => basename(f, '.mjs'))
        .filter(n => !NON_AGENT_FILES.has(n))
        .map(name => ({ name, kind: 'code', manifestSource: 'filesystem-fallback' }));

    const lanes = discoverLanes();
    log(`  enumerated ${codeAgents.length} code agents + ${lanes.length} lanes`);
    return [...codeAgents, ...lanes];
}

// Discover Greek-letter lanes by scanning data/ for dated deliverables.
// A lane is "active" if it has at least one data/<lane>-*.{md,json} file.
function discoverLanes() {
    if (!existsSync(DATA_DIR)) return [];
    const dataFiles = readdirSync(DATA_DIR);
    const lanes = [];
    for (const lane of GREEK_LANES) {
        const pattern = new RegExp(`^${lane}-.*\\.(md|json)$`, 'i');
        if (dataFiles.some(f => pattern.test(f))) {
            lanes.push({ name: lane, kind: 'lane', manifestSource: 'data/<lane>-*.{md,json}' });
        }
    }
    return lanes;
}

// ── Phase 2: Health diagnostic per agent ─────────────────────────────────────

function healthCheckAgent(agent) {
    return agent.kind === 'lane' ? healthCheckLane(agent) : healthCheckCodeAgent(agent);
}

function healthCheckCodeAgent(agent) {
    const findings = [];
    const name = agent.name.toLowerCase();
    const STALE_HOURS = 168;

    // 2a. Source code health — does the agent's exact .mjs file exist + parse?
    // No fallback list: a code agent without its own source file is a real MISSING.
    const srcRel = `scripts/agents/${name}.mjs`;
    const srcAbs = join(REPO_ROOT, srcRel);
    if (existsSync(srcAbs)) {
        try {
            execSync(`node --check "${srcAbs}"`, { stdio: 'pipe' });
            findings.push({ check: 'source-parses', status: 'OK', file: srcRel });
        } catch (e) {
            findings.push({ check: 'source-parses', status: 'FAIL', file: srcRel, error: String(e.message).slice(0, 200) });
        }
    } else {
        findings.push({ check: 'source-file-exists', status: 'MISSING', searched: [srcRel] });
    }

    // 2b. Skill manifest health: own SKILL.md → SHARED_SKILL_MAP → MISSING.
    const ownSkillRel = `.claude/skills/${name}/SKILL.md`;
    if (existsSync(join(REPO_ROOT, ownSkillRel))) {
        findings.push({ check: 'skill-manifest-exists', status: 'OK', file: ownSkillRel });
    } else if (SHARED_SKILL_MAP[name]) {
        const sharedSlug = SHARED_SKILL_MAP[name];
        const sharedRel = `.claude/skills/${sharedSlug}/SKILL.md`;
        if (existsSync(join(REPO_ROOT, sharedRel))) {
            findings.push({ check: 'skill-manifest-exists', status: 'OK', file: sharedRel, shared_with: sharedSlug });
        } else {
            findings.push({ check: 'skill-manifest-exists', status: 'MISSING', searched: [ownSkillRel, sharedRel] });
        }
    } else {
        findings.push({ check: 'skill-manifest-exists', status: 'MISSING', searched: [ownSkillRel] });
    }

    // 2c. Last-run evidence: walk EVIDENCE_PATTERNS or fall back to data/logs/<name>* glob.
    findings.push(findRecentEvidence(name, STALE_HOURS));

    // 2d. Launchd plist (if applicable)
    const plistCandidates = readdirSync(join(REPO_ROOT, 'scripts', 'launchd'))
        .filter(p => p.toLowerCase().includes(name));
    if (plistCandidates.length > 0) {
        findings.push({ check: 'launchd-plist', status: 'OK', files: plistCandidates });
    }

    return findings;
}

function findRecentEvidence(name, staleHours) {
    const patterns = EVIDENCE_PATTERNS[name];
    if (patterns && patterns.length > 0) {
        let best = null;
        for (const p of patterns) {
            const pathStr = typeof p === 'string' ? p : p.path;
            const filter = typeof p === 'string' ? null : (p.nameContains || null);
            const r = mostRecentMtimeUnder(join(REPO_ROOT, pathStr), filter);
            if (r && (!best || r.mtimeMs > best.mtimeMs)) best = r;
        }
        const searched = patterns.map(p => typeof p === 'string' ? p : `${p.path}/*${p.nameContains}*`);
        if (!best) return { check: 'last-run-evidence', status: 'NO-EVIDENCE', searched };
        const ageHours = (Date.now() - best.mtimeMs) / 1000 / 3600;
        return {
            check: 'last-run-evidence',
            status: ageHours < staleHours ? 'OK' : 'STALE',
            file: best.file.replace(REPO_ROOT + '/', ''),
            ageHours: Math.round(ageHours),
            searched,
        };
    }

    // Legacy fallback: data/logs/<name>* glob.
    const logsDir = join(DATA_DIR, 'logs');
    if (!existsSync(logsDir)) {
        return { check: 'last-run-evidence', status: 'NO-EVIDENCE', searched: ['data/logs'] };
    }
    const logs = readdirSync(logsDir).filter(f => f.toLowerCase().includes(name)).sort().reverse();
    if (logs.length === 0) {
        return { check: 'last-run-evidence', status: 'NO-EVIDENCE', searched: [`data/logs/*${name}*`] };
    }
    const latest = logs[0];
    const st = statSync(join(logsDir, latest));
    const ageHours = (Date.now() - st.mtimeMs) / 1000 / 3600;
    return {
        check: 'last-run-evidence',
        status: ageHours < staleHours ? 'OK' : 'STALE',
        file: `data/logs/${latest}`,
        ageHours: Math.round(ageHours),
    };
}

function healthCheckLane(agent) {
    const findings = [];
    const name = agent.name.toLowerCase();
    const STALE_HOURS = 168;

    // Lanes have no .mjs source — find the most recent dated deliverable instead.
    if (!existsSync(DATA_DIR)) {
        findings.push({ check: 'lane-deliverables', status: 'NO-EVIDENCE' });
        return findings;
    }
    const pattern = new RegExp(`^${name}-.*\\.(md|json)$`, 'i');
    const matches = readdirSync(DATA_DIR)
        .filter(f => pattern.test(f))
        .map(f => ({ file: f, mtimeMs: statSync(join(DATA_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (matches.length === 0) {
        findings.push({ check: 'lane-deliverables', status: 'NO-EVIDENCE' });
        return findings;
    }
    const latest = matches[0];
    const ageHours = (Date.now() - latest.mtimeMs) / 1000 / 3600;
    findings.push({
        check: 'lane-deliverables',
        status: ageHours < STALE_HOURS ? 'OK' : 'STALE',
        file: `data/${latest.file}`,
        ageHours: Math.round(ageHours),
        total_deliverables: matches.length,
    });
    return findings;
}

function phaseHealth(agents) {
    log('phase 2: health diagnostic');
    const report = {};
    for (const a of agents) {
        report[a.name] = healthCheckAgent(a);
    }
    return report;
}

// ── Phase 3: Research (stubbed for first launch — real WebSearch/WebFetch wires in v2) ──

function phaseResearch(agents) {
    log('phase 3: research (stubbed for v1 — populate via Agent tool subagent in v2)');
    ensureDir(CACHE_DIR);
    // For v1, we leave research findings empty. The agent emits a NEEDS_RESEARCH flag
    // that the v2 wiring will fill in by spawning a `researcher` subagent per-agent-domain.
    // Anti-hallucination rule: never invent citations to fill in this section.
    const findings = {};
    for (const a of agents) {
        findings[a.name] = {
            status: 'PENDING_V2_WIRING',
            note: 'Research phase requires Agent-tool subagent invocation. v1 of omega-steward.mjs ships without auto-research; manual research can be triggered separately and dropped into data/omega-cache/<sha-of-url>.json.',
            cited_findings: [],
        };
    }
    return findings;
}

// ── Phase 4-5: Recommendation generation + proposal write ────────────────────

function generateRecommendations(agents, healthReport, researchFindings) {
    log('phase 4: recommendation generation');
    const recommendations = [];
    let nextId = 1;

    for (const agent of agents) {
        const health = healthReport[agent.name] || [];

        // Anti-sycophancy: explicitly call out healthy agents with no recommendations.
        const failingChecks = health.filter(h => ['FAIL', 'MISSING', 'STALE', 'NO-LOGS', 'NO-EVIDENCE'].includes(h.status));

        if (failingChecks.length === 0) {
            recommendations.push({
                id: nextId++,
                tag: 'NO-CHANGES-THIS-CYCLE',
                target_agent: agent.name,
                rationale: 'All health checks pass. No actionable findings this cycle.',
                research_citations: [],
            });
            continue;
        }

        // Convert each failing check into a recommendation.
        for (const f of failingChecks) {
            const rec = buildRecommendation(agent, f, nextId++);
            recommendations.push(rec);
        }
    }

    // refresh-master Phase 4 deliverable 3: pull provider performance audit
    // + outcome correlation into the recommendation stream. Both modules
    // return structured proposals that OMEGA includes as NEEDS-APPROVAL.
    try {
        const pa = require('../../lib/provider-performance-auditor.mjs');
        // dynamic import-via-require shim — fall back to fully ESM dynamic import
    } catch (e) { /* node:require may not work for ESM; fall back below */ }
    return recommendations;
}

/**
 * Append refresh-master Phase 4 reroute + outcome proposals to the
 * recommendation list. Called from runOmegaSteward after generateRecommendations.
 */
async function appendRefreshEcosystemProposals(recommendations) {
    let nextId = recommendations.length ? Math.max(...recommendations.map(r => r.id || 0)) + 1 : 1;
    try {
        const auditor = await import('../../lib/provider-performance-auditor.mjs');
        const report = auditor.auditProviderPerformance({ windowDays: 7 });
        const reportPath = auditor.writePerformanceReport(report);
        const reroutes = auditor.buildReroutingProposals(report);
        for (const r of reroutes) {
            recommendations.push({
                id: nextId++,
                target_agent: 'refresh-master',
                tag: r.tag,
                short_title: r.title,
                current_state: r.evidence,
                proposed_change: r.proposal,
                rationale: 'refresh-master Phase 4 provider-performance auditor (weekly).',
                research_citations: [{ url: reportPath, retrieved_at: new Date().toISOString(), confidence: 'high' }],
                risk: 'LOW',
                estimated_effort: 'S',
                rollback: 'revert config/refresh-policy.yml provider override',
            });
        }
        log(`phase 4: appended ${reroutes.length} reroute proposals from ${reportPath}`);
    } catch (e) {
        log(`phase 4: provider-performance-auditor failed: ${e.message.slice(0, 200)}`);
    }
    try {
        const corr = await import('../../lib/outcome-correlator.mjs');
        const r = corr.correlateOutcomes();
        const corrPath = corr.writeOutcomeReport(r);
        // Surface a single proposal summarizing outcome signals
        recommendations.push({
            id: nextId++,
            target_agent: 'refresh-master',
            tag: 'NEEDS-DESIGN-DISCUSSION',
            short_title: `Outcome correlation snapshot — ${Object.values(r.row_counts || {}).reduce((s, x) => s + x, 0)} rows`,
            current_state: `Conversion: apply=${(r.conversion?.apply_rate * 100 || 0).toFixed(1)}% · interview/applied=${(r.conversion?.interview_rate_among_applied * 100 || 0).toFixed(1)}% · offer/interview=${(r.conversion?.offer_rate_among_interview * 100 || 0).toFixed(1)}%`,
            proposed_change: `Review ${corrPath} for which cache fields appear in Interview/Offer vs Rejected rows. ${r.sample_size_warning || ''}`,
            rationale: 'refresh-master Phase 4 outcome correlator (weekly).',
            research_citations: [{ url: corrPath, retrieved_at: new Date().toISOString(), confidence: 'low' }],
            risk: 'LOW',
            estimated_effort: 'M',
        });
        log(`phase 4: wrote outcome correlation ${corrPath}`);
    } catch (e) {
        log(`phase 4: outcome-correlator failed: ${e.message.slice(0, 200)}`);
    }
    return recommendations;
}

function buildRecommendation(agent, finding, id) {
    // Conservative defaults — most recommendations start as NEEDS-APPROVAL.
    const base = {
        id,
        target_agent: agent.name,
        target_check: finding.check,
        finding_detail: finding,
        risk: 'MED',
        estimated_effort: 'S',
        research_citations: [],
        rollback: 'git revert <commit-sha>',
    };

    if (finding.check === 'source-parses' && finding.status === 'FAIL') {
        return {
            ...base,
            tag: 'NEEDS-APPROVAL',
            short_title: `Fix syntax error in ${finding.file}`,
            current_state: `node --check fails: ${finding.error}`,
            proposed_change: 'Manual inspection + patch. OMEGA cannot auto-fix syntax errors without semantic understanding of the agent.',
            risk: 'HIGH',
            estimated_effort: 'M',
        };
    }

    if (finding.check === 'skill-manifest-exists' && finding.status === 'MISSING') {
        return {
            ...base,
            tag: 'SAFE-AUTO-EXECUTE',
            short_title: `Create missing SKILL.md for ${agent.name}`,
            current_state: 'Agent has no .claude/skills/<name>/SKILL.md',
            proposed_change: 'Generate SKILL.md scaffold with trigger phrases derived from agent docstring + example invocations from CLI flags.',
            risk: 'LOW',
            estimated_effort: 'XS',
        };
    }

    if (finding.check === 'last-run-evidence' && finding.status === 'NO-EVIDENCE') {
        const paths = Array.isArray(finding.searched) ? finding.searched.join(', ') : 'evidence paths';
        return {
            ...base,
            tag: 'NEEDS-DESIGN-DISCUSSION',
            short_title: `${agent.name} has no run evidence — investigate`,
            current_state: `No recent files found under: ${paths}`,
            proposed_change: 'Confirm with Mitchell whether agent is intentionally dormant or wiring is broken. May need to widen EVIDENCE_PATTERNS or add a launchd schedule.',
            risk: 'LOW',
            estimated_effort: 'XS',
        };
    }

    if (finding.check === 'last-run-evidence' && finding.status === 'STALE') {
        return {
            ...base,
            tag: 'NEEDS-APPROVAL',
            short_title: `${agent.name} last ran ${finding.ageHours}h ago`,
            current_state: `Last evidence: ${finding.file}, ${finding.ageHours}h old.`,
            proposed_change: 'Check launchd plist (if any) for failed-restart loop. If no plist, surface to Mitchell whether agent should be scheduled.',
            risk: 'LOW',
            estimated_effort: 'S',
        };
    }

    if (finding.check === 'lane-deliverables' && finding.status === 'NO-EVIDENCE') {
        return {
            ...base,
            tag: 'NEEDS-DESIGN-DISCUSSION',
            short_title: `Lane ${agent.name} has no deliverables — confirm scope`,
            current_state: `No data/${agent.name}-*.{md,json} files found.`,
            proposed_change: 'Confirm whether this lane is intentionally dormant or should be removed from GREEK_LANES.',
            risk: 'LOW',
            estimated_effort: 'XS',
        };
    }

    if (finding.check === 'lane-deliverables' && finding.status === 'STALE') {
        return {
            ...base,
            tag: 'NEEDS-APPROVAL',
            short_title: `Lane ${agent.name} hasn't shipped in ${finding.ageHours}h`,
            current_state: `Most recent deliverable: ${finding.file}, ${finding.ageHours}h old.`,
            proposed_change: 'Surface to Mitchell whether the lane should be re-activated or retired.',
            risk: 'LOW',
            estimated_effort: 'S',
        };
    }

    // Fallback
    return {
        ...base,
        tag: 'NEEDS-DESIGN-DISCUSSION',
        short_title: `Investigate ${agent.name}::${finding.check}`,
        current_state: JSON.stringify(finding),
        proposed_change: 'No automated fix path. Requires Mitchell to triage.',
    };
}

function writeProposalFile(recommendations) {
    log('phase 5: write proposal file');
    const path = join(PROPOSALS_DIR, `omega-proposals-${TODAY}.md`);

    let md = `# OMEGA proposals — ${TODAY}\n\n`;
    md += `Generated by \`scripts/agents/omega-steward.mjs\` at ${NOW()}.\n\n`;
    md += `**Approval mechanism:** append to \`data/omega-approvals.md\` with lines like \`${TODAY}: approve omega-proposal-N\` or \`${TODAY}: approve all SAFE-AUTO-EXECUTE from ${TODAY}\` or \`${TODAY}: reject omega-proposal-N — <reason>\`.\n\n`;
    md += `Full spec: \`data/omega-spec-2026-05-19.md\`.\n\n`;
    md += `---\n\n`;

    // Counts by tag
    const tagCounts = {};
    for (const r of recommendations) {
        tagCounts[r.tag] = (tagCounts[r.tag] || 0) + 1;
    }
    md += `## Summary\n\n`;
    for (const [tag, n] of Object.entries(tagCounts)) {
        md += `- **${tag}**: ${n}\n`;
    }
    md += `\n---\n\n`;

    for (const r of recommendations) {
        md += `### Proposal ${r.id} — ${r.short_title || `(${r.tag}) ${r.target_agent}`}\n`;
        md += `- **Tag:** ${r.tag}\n`;
        md += `- **Target agent:** ${r.target_agent}\n`;
        if (r.target_check) md += `- **Failing check:** ${r.target_check}\n`;
        if (r.current_state) md += `- **Current state:** ${r.current_state}\n`;
        if (r.proposed_change) md += `- **Proposed change:** ${r.proposed_change}\n`;
        if (r.rationale) md += `- **Rationale:** ${r.rationale}\n`;
        md += `- **Research citations:** ${r.research_citations.length === 0 ? '_none_' : r.research_citations.map(c => `[${c.url}] retrieved ${c.retrieved_at} — ${c.confidence}`).join('; ')}\n`;
        if (r.risk) md += `- **Risk:** ${r.risk}\n`;
        if (r.estimated_effort) md += `- **Estimated effort:** ${r.estimated_effort}\n`;
        if (r.rollback) md += `- **Rollback:** \`${r.rollback}\`\n`;
        md += `\n`;
    }

    writeFileSync(path, md);
    log(`  wrote ${path}`);
    return path;
}

// ── Phase 6-9: Execution (after Mitchell approves) ───────────────────────────

function readApprovals() {
    const path = join(DATA_DIR, 'omega-approvals.md');
    if (!existsSync(path)) return [];
    const content = readFileSync(path, 'utf8');
    const lines = content.split('\n');
    const approvals = [];
    for (const line of lines) {
        // approve omega-proposal-N
        let m = line.match(/^(\d{4}-\d{2}-\d{2}):\s*approve\s+omega-proposal-(\d+)/i);
        if (m) {
            approvals.push({ date: m[1], action: 'approve', id: parseInt(m[2], 10) });
            continue;
        }
        // approve all SAFE-AUTO-EXECUTE from <date>
        m = line.match(/^(\d{4}-\d{2}-\d{2}):\s*approve\s+all\s+SAFE-AUTO-EXECUTE\s+from\s+(\d{4}-\d{2}-\d{2})/i);
        if (m) {
            approvals.push({ date: m[1], action: 'approve-all-safe', cycle: m[2] });
            continue;
        }
        // reject omega-proposal-N
        m = line.match(/^(\d{4}-\d{2}-\d{2}):\s*reject\s+omega-proposal-(\d+)/i);
        if (m) {
            approvals.push({ date: m[1], action: 'reject', id: parseInt(m[2], 10) });
            continue;
        }
        // OMEGA-SELF-EDIT — different keyword to prevent fat-finger
        m = line.match(/^(\d{4}-\d{2}-\d{2}):\s*approve\s+omega-self-edit-(\d+)/i);
        if (m) {
            approvals.push({ date: m[1], action: 'approve-self-edit', id: parseInt(m[2], 10) });
        }
    }
    return approvals;
}

function executeProposal(_id) {
    log(`phase 7-9: execute proposal ${_id} (stubbed for v1)`);
    // v1 stub: log intent, surface to user. v2 will parse proposal markdown + apply diff + run regressions.
    log('  v1 of omega-steward.mjs ships without auto-execution. Proposed changes must be applied manually by Mitchell or via Claude Code session.');
    log('  This is intentional — the human-in-the-loop gate is the load-bearing safety mechanism in v1.');
    return { status: 'STUB', id: _id };
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function runOmegaSteward(opts = {}) {
    const mode = opts.mode || 'propose';
    log(`mode: ${mode}`);

    if (mode === 'inventory') {
        const agents = inventoryAgents();
        console.log(JSON.stringify(agents, null, 2));
        return { agents };
    }

    if (mode === 'health') {
        const agents = inventoryAgents();
        const health = phaseHealth(agents);
        console.log(JSON.stringify(health, null, 2));
        return { agents, health };
    }

    if (mode === 'research') {
        const agents = inventoryAgents();
        const health = phaseHealth(agents);
        const research = phaseResearch(agents);
        return { agents, health, research };
    }

    if (mode === 'propose') {
        const agents = inventoryAgents();
        const health = phaseHealth(agents);
        const research = phaseResearch(agents);
        let recommendations = generateRecommendations(agents, health, research);
        recommendations = await appendRefreshEcosystemProposals(recommendations);
        const path = writeProposalFile(recommendations);
        log(`STOPPING at approval gate. Review ${path} and append approvals to data/omega-approvals.md.`);
        return { path, recommendations };
    }

    if (mode === 'execute') {
        const approvals = readApprovals();
        const target = parseInt(opts.target, 10);
        const approval = approvals.find(a => a.action === 'approve' && a.id === target);
        if (!approval) {
            log(`proposal ${target} not approved — aborting`);
            return { status: 'NOT_APPROVED' };
        }
        return executeProposal(target);
    }

    if (mode === 'execute-all') {
        const approvals = readApprovals();
        const bulkApproval = approvals.find(a => a.action === 'approve-all-safe' && a.cycle === TODAY);
        if (!bulkApproval) {
            log(`no bulk SAFE-AUTO approval for ${TODAY} — aborting`);
            return { status: 'NOT_APPROVED' };
        }
        log('execute-all stubbed for v1');
        return { status: 'STUB' };
    }

    log(`unknown mode: ${mode}`);
    process.exit(2);
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = parseArgs(process.argv);
    runOmegaSteward(args).catch(err => {
        console.error('[omega] FATAL:', err);
        process.exit(1);
    });
}
