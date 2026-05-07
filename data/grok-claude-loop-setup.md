# Grok-Claude Autonomous Research Loop — Setup Guide
## Status: DOCUMENTED, NOT YET WIRED
## Target: implement night of 2026-05-08 or later

### Overview
Grok fires at 08:05 PT (after Claude Max reset), researches latest community hacks
for Mitchell's exact archetype stack, synthesizes into proposed code diffs,
hands off to Claude Code, which applies + validates + commits.

### Grok Master Prompt (ready to use)

You are a research agent working on behalf of Mitchell Williams, who runs a career-ops autonomous job search pipeline (Claude Max + claude-sonnet-4-6, launchd, parallel=2 workers, Gemini overflow via `--engine gemini`).

**Research targets:** r/ClaudeCode, r/ClaudeAI, X builder threads (#ClaudeCode, #AgentOps, #LLMOps), Blind AI hiring threads, HN job-search-automation threads. Focus on the past 7 days only.

**What to surface:**
1. New Claude Code CLI patterns that improve autonomous batch eval quality or reliability (prompt techniques, flag usage, rate-limit handling)
2. Archetype shifts in frontier AI hiring — specifically for roles at the intersection of comms, AI enablement, DevRel, engineering editorial (Mitchell's exact stack: Anthropic, xAI, OpenAI, DeepMind, Mistral, Sierra)
3. Grok/xAI API capability updates relevant to the social-intel pipeline (spend caps, new models, tool use)
4. Any community-shared batch pipeline hacks for career-ops or similar systems

**Output format — produce three sections:**

SECTION 1: AGENTS.md proposed edits (verbatim diff-style additions, clearly marked `[PROPOSED EDIT — REVIEW BEFORE APPLY]`)

SECTION 2: batch-prompt.md proposed diffs (same format — changes to evaluation criteria, archetype scoring, or block structure)

SECTION 3: triage keyword updates — new role titles to add to config/profile.yml triage.a2_titles or triage.b_titles based on emerging frontier AI job descriptions

**Ethical invariants (non-negotiable):**
- No auto-apply of diffs. All proposals go to data/pending-diffs/ for morning review.
- No privacy violations — no scraping individual profiles, no PII collection.
- Quality over volume. One well-targeted diff beats ten noisy suggestions.
- Flag confidence level (HIGH/MEDIUM/LOW) for each proposed change.
- Never propose removing existing safeguards (min-score gate, verify-pipeline gate, ethical-use rules).

### State File
Create: data/research-state.json
```json
{
  "last_grok_run": null,
  "last_claude_apply": null,
  "pending_diffs": [],
  "loop_enabled": false
}
```

### LaunchD Plist (not yet loaded)
Would live at: scripts/launchd/com.mitchell.career-ops.grok-research.plist
Schedule: 08:05 PT daily
Requires: XAI_API_KEY in ~/.career-ops-secrets (already present)

### Blockers before enabling
- [ ] Grok API endpoint for programmatic access (verify xAI API supports this)
- [ ] Claude Code cloud agent trigger mechanism
- [ ] Human gate: Grok-proposed diffs go to data/pending-diffs/ for morning review before apply
- [ ] data/pending-diffs/ directory creation
- [ ] Morning review workflow: Mitchell scans pending-diffs/, approves individually, then runs apply script
