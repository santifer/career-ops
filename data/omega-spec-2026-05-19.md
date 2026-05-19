# OMEGA — Ecosystem Steward (spec)

**Status:** v1 draft, written 2026-05-19 prior to first launch. Subject to revision after first proposal cycle.

**Provisional codename:** OMEGA. The agent that watches the other agents.

---

## Purpose

A meta-agent that periodically reviews every other agent in the career-ops ecosystem (ALPHA / BRAVO / GAMMA / DELTA / EPSILON / ZETA + any future additions), conducts current-state research on each agent's domain, surfaces actionable recommendations for keeping each agent running at peak quality, **waits for Mitchell's explicit approval**, then executes approved recommendations and verifies.

OMEGA is the only agent in the ecosystem that **mutates other agents**. That power is the reason for its human-in-the-loop gate.

## What OMEGA reviews per agent

For each agent in `data/agent-ecosystem-manifest-*.md`:

1. **Source code health** — `scripts/agents/<name>.mjs` parses, exports `runX()` per cv-tailor.mjs convention, has Zod schemas where applicable, has cache-handling, has timeout-bounded fetches.
2. **Skill manifest health** — `.claude/skills/<name>/SKILL.md` has trigger phrases, example invocations, inputs/outputs/constraints, anti-hallucination + anti-sycophancy reminders.
3. **Last-run state** — most recent log in `data/logs/<name>-*.log` succeeded, no flapping, no rate-limit storms.
4. **Dependency health** — declared MCPs reachable, declared models still in service (e.g., not a deprecated Sonnet variant), API keys present in `.env`.
5. **Subagent-spawning health** — if the agent spawns subagents (Agent tool, council-of-models, researcher, dealbreaker), confirm those subagent types are still listed in the available-agents roster and their behavior contracts haven't changed.
6. **Output quality samples** — pull the last 3 outputs from data/, verify they have provenance/source_urls/confidence fields where required, and have not silently degraded.
7. **Knowledge-base access** — confirm the agent can still read `~/Documents/council-os/`, `cv.md`, `article-digest.md`, `modes/_profile.md` (read-only files), and that nothing it depends on has moved.
8. **Local OS integration** — confirm any launchd plist for the agent is loaded and not in failed-restart loop.

## What OMEGA researches

For each agent domain, OMEGA runs a bounded web + deep research pass:

- **ALPHA (apply-pack quality):** latest research on anti-drift, voice fidelity, application-materials best practices; recent ATS scoring changes.
- **BRAVO (visual UX):** dashboard UX research, design-system updates, accessibility standards revisions.
- **GAMMA (data truth):** data-validation tooling, observability for metric pipelines, lineage-tracking standards.
- **DELTA (AI detection):** detector vendor updates, peer-reviewed detector accuracy studies (cite DOIs), ATS-vendor detection-feature rollouts.
- **EPSILON (SRE):** launchd best practices, macOS version-specific quirks (Tahoe spawn bug is a current example), secrets management.
- **ZETA (network):** graph DB tooling, Hunter/Apollo API schema changes, LinkedIn export format changes.

Each research finding MUST cite:
- Source URL
- Retrieved-at timestamp (ISO-8601)
- One-sentence summary of what's relevant
- Confidence band (`vendor-claimed` / `peer-reviewed` / `community-reported` / `firsthand-tested`)

Cached to `data/omega-cache/<sha256-of-url>.json` for later verification.

## Recommendation tagging

Every recommendation OMEGA generates is tagged with ONE of:

- **`SAFE-AUTO-EXECUTE`** — documentation updates, manifest entries, optional CLI flag additions, version-bump dependencies that pass tests, log-rotation tweaks. Cumulatively touches ≤5 files. No prompt/model/architecture changes.
- **`NEEDS-APPROVAL`** — substantive code changes, prompt edits, model changes, new dependency additions, breaking CLI changes. Mitchell must explicitly approve before execution.
- **`NEEDS-DESIGN-DISCUSSION`** — architectural shifts, new agent creation, agent deprecation, anything affecting the cross-agent coordination protocol. Mitchell + OMEGA pair-design awake before any execution.

## Hard prohibitions (auto-REJECTED — OMEGA refuses to even propose)

- **Mitchell-only files:** any change to `cv.md`, `modes/_profile.md`, `config/profile.yml`, `article-digest.md`. These are personal ground truth.
- **Self-mutation without explicit gate:** OMEGA cannot modify `scripts/agents/omega-steward.mjs` or `.claude/skills/omega-steward/SKILL.md` without an explicit `OMEGA-SELF-EDIT` proposal Mitchell approves with a typed `approve omega-self-edit-N` (different keyword from regular proposals — to prevent fat-fingered approval).
- **Personal-data exfiltration:** any change that adds a new outbound network call that includes content from gitignored files (`data/applications.md`, `data/hm-intel/*.json`, `data/network-database.json`, `data/contacts-enriched.json`, etc.) without explicit user opt-in.
- **Council/dealbreaker bypass:** changes that route critical decisions around the council or dealbreaker subagents (anti-sycophancy infrastructure).

## Approval mechanism

OMEGA writes proposals to `data/omega-proposals-<YYYY-MM-DD>.md` with this schema per proposal:

```
### Proposal N — <short title>
- **Tag:** SAFE-AUTO-EXECUTE | NEEDS-APPROVAL | NEEDS-DESIGN-DISCUSSION
- **Target agent:** ALPHA | BRAVO | ...
- **Target file(s):** <file:line refs>
- **Current state:** <one-paragraph description>
- **Proposed change:** <one-paragraph description>
- **Research citations:** [URL — retrieved YYYY-MM-DDTHH:MMZ — confidence band]
- **Risk:** LOW | MED | HIGH
- **Rollback:** <how to undo in 1 command>
- **Estimated effort:** XS / S / M / L / XL
- **Diff preview:** <unified diff>
```

Mitchell approves by appending to `data/omega-approvals.md`:

```
2026-05-26: approve omega-proposal-3
2026-05-26: approve all SAFE-AUTO-EXECUTE from 2026-05-26
2026-05-26: reject omega-proposal-7 — model change is premature
2026-05-26: approve omega-self-edit-1
```

OMEGA polls this file at the start of its execution phase. Any proposal not approved (or explicitly rejected) is DEFERRED to the next cycle. After 3 cycles of deferral, OMEGA escalates by tagging `STALE-PROPOSAL` and surfacing in the manifest.

## Workflow phases

1. **Inventory** — list agents from manifest. No fabrication.
2. **Health check** — per-agent diagnostic from §"What OMEGA reviews".
3. **Research** — per-agent web + deep research from §"What OMEGA researches". Cached.
4. **Recommendation generation** — produce tagged recommendations. Council-of-models adjudication on disputed claims.
5. **Proposal write** — `data/omega-proposals-<date>.md` lands.
6. **STOP** — wait for Mitchell. No auto-execution. Even SAFE-AUTO items wait for the manifest of approvals to land.
7. **Execution** — for each approved proposal: apply diff, `node --check`, run target agent's regression tests if any exist, commit individually with traceable message `"omega: <proposal-N> <short title> (per omega-proposals-<date>)"`.
8. **Verification** — run target agent's smoke test post-change. If it fails, auto-rollback via the proposal's recorded rollback command.
9. **Manifest update** — update `data/agent-ecosystem-manifest-*.md` with last-stewarded timestamp + diff summary.
10. **Stewardship report** — write `data/omega-stewardship-report-<date>.md` listing what changed, what got rolled back, what's deferred.

## Cadence

- **Initial:** weekly Friday 08:00 PT — gives Mitchell the weekend to review proposals before next run.
- **After 4 successful cycles with no rollbacks:** can move to daily if Mitchell wants. Default stays weekly.

## CLI

```
node scripts/agents/omega-steward.mjs --inventory    # phase 1 only
node scripts/agents/omega-steward.mjs --health       # phases 1-2
node scripts/agents/omega-steward.mjs --research     # phases 1-3
node scripts/agents/omega-steward.mjs --propose      # phases 1-5; stops at approval gate (DEFAULT for weekly cron)
node scripts/agents/omega-steward.mjs --execute <id> # phase 7-9 for a single approved proposal
node scripts/agents/omega-steward.mjs --execute-all  # phase 7-9 for all approved proposals from latest cycle
```

## Skill triggers

`.claude/skills/omega-steward/SKILL.md` triggers on:
- "review the agent ecosystem"
- "check what's stale in my agents"
- "run the steward"
- "propose agent improvements"
- "what should I update across my agents"
- "execute the omega proposals"

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| OMEGA hallucinates a "latest development" that doesn't exist → bad recommendation | Council adjudication on every claim; cached URL + retrieved-at; dealbreaker rejection if uncited |
| OMEGA breaks a working agent in the name of "improvement" | Approval gate; per-proposal rollback command pre-recorded; post-execution smoke test |
| OMEGA proposes changes that drift agents away from Mitchell's intent | Mitchell-only files explicitly protected; recommendations sized to ≤5 files for SAFE-AUTO |
| OMEGA mutates itself recursively | Self-edit gate uses different approval keyword than regular proposals |
| Research findings get stale between cycles | All cached findings tagged with retrieved-at; OMEGA refuses to act on findings older than 30 days without re-verification |
| Bias toward "always recommend something" (sycophancy in reverse — false productivity) | Anti-sycophancy charter applies: OMEGA must surface "no changes needed for agent X this cycle" when true; that's a valid output, not a failure |

## Anti-sycophancy specific to OMEGA

OMEGA's natural failure mode is the opposite of typical AI sycophancy: it might over-propose to seem productive. Counter-rule: each cycle, OMEGA MUST explicitly list which agents need NO changes this cycle, with one-sentence rationale. Empty-cycle reports ("all 6 agents healthy, no proposals this week") are valid + expected outcomes.

## Anti-hallucination specific to OMEGA

Beyond the global charter: OMEGA must NOT claim to have read documentation it didn't actually fetch. Every doc-citation includes the cached file path under `data/omega-cache/`. A claim without a corresponding cache file is auto-rejected by the proposal-validation pass.

## Open questions for Mitchell

- **Q1:** Should OMEGA have authority to add ENTIRELY NEW agents (vs only mutate existing ones)? Default in v1: NO. Adding new agents requires a `NEEDS-DESIGN-DISCUSSION` proposal.
- **Q2:** Should OMEGA's research findings feed into the underlying agents' contexts (e.g., DELTA learns about a new GPTZero feature from OMEGA's research)? Default in v1: research goes into proposals, not directly into agent contexts. Less coupling.
- **Q3:** Cadence — weekly Friday correct, or different day/time? Default in v1: Friday 08:00 PT.
- **Q4:** Should OMEGA's stewardship report get its own celebrity sunrise voice? Default in v1: NO. Stewardship reports are factual; the cunty-voice format is for the IC agents' overnight sunrise briefs only.
