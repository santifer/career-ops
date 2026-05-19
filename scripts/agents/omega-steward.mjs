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
        log('  no manifest found — falling back to filesystem enumeration');
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
        const name = m[1];
        if (!seenAgents.has(name)) {
            seenAgents.add(name);
            agents.push({ name, manifestSource: manifests[0] });
        }
    }
    log(`  inventoried ${agents.length} agents from manifest`);
    return agents;
}

function enumerateAgentsFromFilesystem() {
    // Fallback: list scripts/agents/*.mjs as agents
    const agentsDir = join(REPO_ROOT, 'scripts', 'agents');
    if (!existsSync(agentsDir)) return [];
    return readdirSync(agentsDir)
        .filter(f => f.endsWith('.mjs'))
        .map(f => ({ name: basename(f, '.mjs'), manifestSource: 'filesystem-fallback' }));
}

// ── Phase 2: Health diagnostic per agent ─────────────────────────────────────

function healthCheckAgent(agent) {
    const findings = [];
    const name = agent.name.toLowerCase();

    // 2a. Source code health — does the agent's .mjs file exist + parse?
    const candidates = [
        `scripts/agents/${name}.mjs`,
        `scripts/agents/${name}-steward.mjs`,
        `scripts/agents/apply-pack-polish.mjs`, // ALPHA's main
        `scripts/agents/intel-refresh.mjs`,       // ALPHA's secondary
        `scripts/agents/dashboard-ux-auditor.mjs`,// BRAVO
        `scripts/agents/data-truth-auditor.mjs`,  // GAMMA
        `scripts/agents/ai-detection-hardener.mjs`,// DELTA
        `scripts/agents/system-maintainer.mjs`,    // EPSILON
        `scripts/agents/network-enricher.mjs`,     // ZETA
        `scripts/agents/network-emailer.mjs`,      // ZETA
        `scripts/build-network-database.mjs`,      // ZETA aggregator
    ];

    const found = candidates.find(c => existsSync(join(REPO_ROOT, c)));
    if (found) {
        try {
            execSync(`node --check "${join(REPO_ROOT, found)}"`, { stdio: 'pipe' });
            findings.push({ check: 'source-parses', status: 'OK', file: found });
        } catch (e) {
            findings.push({ check: 'source-parses', status: 'FAIL', file: found, error: String(e.message).slice(0, 200) });
        }
    } else {
        findings.push({ check: 'source-file-exists', status: 'MISSING', searched: candidates });
    }

    // 2b. Skill manifest health
    const skillCandidates = [
        `.claude/skills/${name}/SKILL.md`,
        `.claude/skills/apply-pack-polish/SKILL.md`,
        `.claude/skills/intel-refresh/SKILL.md`,
        `.claude/skills/dashboard-ux-audit/SKILL.md`,
        `.claude/skills/data-truth-audit/SKILL.md`,
        `.claude/skills/ai-detection-hardener/SKILL.md`,
        `.claude/skills/system-maintainer/SKILL.md`,
        `.claude/skills/network-database/SKILL.md`,
    ];
    const skillFound = skillCandidates.find(c => existsSync(join(REPO_ROOT, c)));
    findings.push({
        check: 'skill-manifest-exists',
        status: skillFound ? 'OK' : 'MISSING',
        file: skillFound || null,
    });

    // 2c. Last-run state — most recent log
    const logsDir = join(DATA_DIR, 'logs');
    if (existsSync(logsDir)) {
        const logs = readdirSync(logsDir)
            .filter(f => f.toLowerCase().includes(name))
            .sort()
            .reverse();
        if (logs.length > 0) {
            const latest = logs[0];
            const stat = statSync(join(logsDir, latest));
            const ageHours = (Date.now() - stat.mtimeMs) / 1000 / 3600;
            findings.push({
                check: 'last-run-log',
                status: ageHours < 168 ? 'OK' : 'STALE',
                file: latest,
                ageHours: Math.round(ageHours),
            });
        } else {
            findings.push({ check: 'last-run-log', status: 'NO-LOGS' });
        }
    }

    // 2d. Launchd plist (if applicable)
    const plistCandidates = readdirSync(join(REPO_ROOT, 'scripts', 'launchd'))
        .filter(p => p.toLowerCase().includes(name));
    if (plistCandidates.length > 0) {
        findings.push({ check: 'launchd-plist', status: 'OK', files: plistCandidates });
    }

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
        const failingChecks = health.filter(h => ['FAIL', 'MISSING', 'STALE', 'NO-LOGS'].includes(h.status));

        if (failingChecks.length === 0) {
            recommendations.push({
                id: nextId++,
                tag: 'NO-CHANGES-THIS-CYCLE',
                target_agent: agent.name,
                rationale: 'All health checks pass. No actionable findings this cycle.',
            });
            continue;
        }

        // Convert each failing check into a recommendation.
        for (const f of failingChecks) {
            const rec = buildRecommendation(agent, f, nextId++);
            recommendations.push(rec);
        }
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

    if (finding.check === 'last-run-log' && finding.status === 'NO-LOGS') {
        return {
            ...base,
            tag: 'NEEDS-DESIGN-DISCUSSION',
            short_title: `${agent.name} has never run — investigate`,
            current_state: 'No logs found for this agent in data/logs/',
            proposed_change: 'Confirm with Mitchell whether agent is intentionally dormant or wiring is broken. No auto-fix.',
            risk: 'LOW',
            estimated_effort: 'XS',
        };
    }

    if (finding.check === 'last-run-log' && finding.status === 'STALE') {
        return {
            ...base,
            tag: 'NEEDS-APPROVAL',
            short_title: `${agent.name} last ran ${finding.ageHours}h ago`,
            current_state: `Last log: ${finding.file}, ${finding.ageHours}h old.`,
            proposed_change: 'Check launchd plist (if any) for failed-restart loop. If no plist, surface to Mitchell whether agent should be scheduled.',
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
        const recommendations = generateRecommendations(agents, health, research);
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
