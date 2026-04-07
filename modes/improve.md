# Mode: improve — Self-Improvement Cycle

Closes the feedback loop on the entire pipeline: calibrates scoring principles from real outcomes, optimizes evaluation prompts against a validated test set, and reviews the harness criteria itself when optimization plateaus.

**Runs automatically on the overnight schedule** (`self_improve_cycle` in `config/intel.yml`). Can also be triggered manually at any time.

## Triggers

- `/career-ops improve`
- "run self-improvement"
- "optimize the pipeline"
- Overnight schedule via `config/intel.yml → schedules.self_improve_cycle`

## Prerequisites

Read these files before starting (fail gracefully if any are missing):

| File | Required | Purpose |
|------|----------|---------|
| `config/strategy-ledger.md` | Yes | Calibration log + principles |
| `config/exemplars/` | No | Hand-labeled exemplar JDs for test set |
| `config/intel.yml` | No | Local AI config (Gemma / Ollama) |
| `data/applications.md` | Yes | Outcomes: applied, interviewed, offered, rejected |
| `data/outreach.md` | No | Outreach outcomes: replied, ignored, bounced |
| `modes/_shared.md` | Yes | Archetypes and scoring weights |
| `modes/oferta.md` | Yes | Evaluation prompt to be optimized |

If `config/strategy-ledger.md` is missing, copy from `config/strategy-ledger.template.md` and inform the user.

---

## Loop 1 — Strategy Ledger Analysis

**Always runs** regardless of data volume. Skips principle promotion if data is insufficient, but still reports status.

### Step 1: Read calibration log

Parse `config/strategy-ledger.md` → Calibration Log table.

Count entries since the last analysis run (check Optimization History for `last_analysis_date`).

If fewer than 10 new entries since last run:
> "Strategy Ledger: only {N} new calibration entries since last analysis (need 10). Skipping principle promotion. Add more outcomes to `config/strategy-ledger.md` to enable learning."

If 10+ entries, proceed.

### Step 2: Analyze calibration data

Extract patterns across the log:

1. **Score accuracy**: Which score ranges predicted apply vs. skip correctly? Which over-predicted (high score, user skipped) or under-predicted (low score, user applied anyway)?
2. **Dimension drift**: Are any scoring dimensions consistently too generous or too harsh? (e.g., "remote flexibility" always maxed out, "compensation" always undercounted)
3. **Dismissal patterns**: Companies or role types where multiple offers were discarded — is there a structural reason?
4. **Outreach signal** (if `data/outreach.md` exists): Which message frames got replies? Which were ignored? Any correlation with archetype, seniority, or company size?

### Step 3: Principle distillation

Apply these rules to promote, prune, or hold hypotheses:

**Promote to Guiding or Cautionary:**
- Requires n >= 10 data points across 3+ distinct industries or company types
- Pattern must be directionally consistent (not contradicted by >20% of data points)
- Must be actionable (a concrete scoring or framing change, not a vague observation)

**Demote or prune:**
- Any principle contradicted by new evidence (accuracy drops below 60%)
- Principles that have not been tested against fresh data in 30+ days
- Principles that, when removed from scoring, change fewer than 30% of scores by >0.5 — they may not be load-bearing

**Hold as Active Hypothesis:**
- Patterns with n < 10 data points, even if the direction looks clear

### Step 4: Conflict detection (MANDATORY before applying)

Before writing any principle updates, check for conflicts with `config/profile.yml`:

1. Read `config/profile.yml → deal_breakers` and `config/profile.yml → preferences`
2. For each proposed principle, check: does it contradict a user-defined deal-breaker?
3. If conflict found: flag it, do NOT promote the principle. Report to user:
   > "Principle '{X}' conflicts with your deal-breaker '{Y}'. Not promoted. Override in profile.yml if you want this."

**Precedence rule: profile.yml deal-breakers always override strategy-ledger principles.** The ledger learns from behavior; the profile defines intent.

### Step 5: Bias detection

Before finalizing updates, run bias checks:

- **Industry diversity**: Are the n >= 10 data points spread across 3+ industries? If all from one sector, hold as hypothesis.
- **Recency bias**: Are recent entries dominating? Weight older entries only if they've been contradicted by newer data.
- **Survivorship bias**: Are dismissal patterns based only on offers you evaluated, not offers you never saw? Note this limitation.
- **Circular scoring**: Did a principle raise scores for a role type → user applied more → more data points → principle gets reinforced? Flag if detected.

### Step 6: Update strategy-ledger.md

Write the updated ledger:
- Move promoted hypotheses to Guiding or Cautionary sections
- Prune demoted principles (move to an `## Archive` section at the bottom with reason + date)
- Add new Active Hypotheses
- Append a summary row to Optimization History

Report what changed.

---

## Loop 2 — Prompt Optimization

**Requires**: 10+ evaluated offers in `data/applications.md` with known user actions (Applied, Discarded, SKIP, or equivalent). Skips if insufficient data.

### Step 1: Readiness check

Count rows in `data/applications.md` where status is NOT `Evaluated` (i.e., the user took an action). Need minimum 10.

If fewer than 10:
> "Prompt Optimization: only {N} offers with known outcomes (need 10). Evaluate more offers and take action on them to unlock this loop."
Skip to Loop 3.

### Step 2: Build test set

Assemble 10–20 past JDs with known outcomes:

1. Read `data/applications.md` → find offers with clear outcomes (Applied / Discarded / SKIP / Offer / Rejected)
2. For each, find corresponding report in `reports/` — this contains the original JD text and evaluation
3. If `config/exemplars/` exists, include any hand-labeled exemplars (these are highest-quality signal)
4. Prefer diversity: spread across archetypes, seniority levels, score ranges, and outcomes
5. Label each: `{expected_score_range, expected_recommendation, actual_user_action}`

### Step 3: Define binary eval criteria (GEPA-inspired)

Each test JD is scored against these binary pass/fail criteria:

| Criterion | Pass condition |
|-----------|---------------|
| **Score accuracy** | Generated score within ±0.5 of consensus expected range |
| **Deal-breaker detection** | All profile.yml deal-breakers surfaced if present in JD |
| **Proof point citation** | At least 2 specific CV metrics or projects cited in Block B |
| **Recommendation alignment** | Apply / Skip recommendation matches user's actual action |
| **Archetype classification** | Detected archetype matches expected archetype |
| **Company signal reflection** | Evaluation references company-specific context (size, stage, domain) |

Pass rate = (passed criteria across all test JDs) / (total criteria checks).

### Step 4: Eval–reflect–propose loop

**Model selection:**
1. Check `config/intel.yml → gemma.model` — if Ollama is running locally with that model, use it (free, unlimited iterations)
2. Fallback: use Claude with a hard cap of 5 iterations (API cost)

Check Ollama availability:
```bash
ollama list 2>/dev/null | grep -i gemma
```

**Loop parameters:**
- Max iterations: 20 (Gemma) or 5 (Claude fallback)
- Early stop: if pass rate >= 95% or 3 consecutive iterations with <0.5% improvement
- Plateau detection: 3 consecutive runs with <1% improvement → exit, flag for Loop 3

**Each iteration:**
1. Evaluate all test JDs using current `modes/oferta.md` + `modes/_shared.md`
2. Score each binary criterion — compute overall pass rate
3. Identify lowest-scoring criterion — focus reflection there
4. Reflect: which specific prompt instructions caused failures on that criterion?
5. Propose targeted edit (surgical — one section at a time, not full rewrites)
6. Apply edit to working copy
7. Re-evaluate the subset of test JDs that previously failed on that criterion
8. If pass rate improved: keep edit, log it
9. If pass rate stayed flat or regressed: discard edit, try different approach

### Step 5: Transfer validation (MANDATORY)

After Gemma 4 proposes changes, validate that improvements transfer to Claude:

1. Select 3–5 test JDs from the failing set
2. Run evals on Claude using the proposed changes
3. Compute Claude pass rate before and after
4. Only present proposed changes to the user **if Claude pass rate also improves**

If transfer fails:
> "Gemma proposed changes that improved Gemma's pass rate ({before}% → {after}%) but did not improve Claude's pass rate. Changes discarded. This may indicate model-specific prompt sensitivity — the reflection logic may need to target more universal evaluation patterns."

### Step 6: Human gate (MANDATORY — NEVER auto-apply)

Present the proposed changes with:
- Side-by-side diff of each changed section
- Pass rate before and after
- Which criteria improved and by how much
- Number of test JDs affected

**Never write to `modes/oferta.md` or `modes/_shared.md` without explicit user approval.**

Wait for user to say "approve", "reject", or "show details".

---

## Loop 3 — Meta-Harness Review

**Runs when:**
- Monthly (check Optimization History for last meta-harness review date — if >30 days, run)
- Loop 2 has plateaued 3 consecutive runs with <1% improvement

The meta-harness review asks: is the **eval criteria itself** the bottleneck?

### Step 1: Analyze Loop 2 history

Read `config/strategy-ledger.md → Optimization History` for Loop 2 entries.

Look for:
- **Always-passing criteria**: if a criterion passes >95% of the time across all recent runs, it may be too easy — not differentiating
- **Always-failing criteria**: if a criterion fails >80% of the time, it may be miscalibrated, ambiguous, or impossible to satisfy with current modes
- **Unstable criteria**: if pass rate oscillates by >10% between runs without mode changes, the criterion may be under-specified

### Step 2: Propose updated criteria or reflection prompts

Based on the analysis, propose one or more of:
- Strengthen a criterion (tighten the pass condition to be more meaningful)
- Weaken a criterion (loosen if it's structurally impossible with current data)
- Retire a criterion (remove if it's always-passing and adding no signal)
- Add a new criterion (if a failure pattern in Loop 2 isn't covered)
- Update reflection prompts to better target failure patterns

### Step 3: Human gate

Present proposed harness changes with rationale. Do not update eval criteria without approval.

After approval, record the change in `config/strategy-ledger.md → Optimization History` with Loop = `meta-harness`.

---

## Output Format

After all loops complete, print a single structured report:

```
Self-Improvement Report — {YYYY-MM-DD HH:MM}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Loop 1 — Strategy Ledger
  Calibration entries analyzed: {N}
  Principles promoted: {N_guiding} guiding, {N_cautionary} cautionary
  Principles pruned: {N}
  Active hypotheses: {N}
  Conflicts with profile.yml: {N} (blocked, not promoted)

Loop 2 — Prompt Optimization
  Test set size: {N} JDs ({N_applied} applied, {N_discarded} discarded)
  Model used: {gemma/claude} ({N} iterations)
  Pass rate: {before}% → {after}% ({delta:+.1f}%)
  Criteria improved: {list}
  Transfer validated: {yes/no/n/a}
  Proposed changes: {summary of what changed}

Loop 3 — Meta-Harness Review
  Status: {ran/skipped — reason}
  Findings: {summary or "—"}
  Proposed criteria changes: {summary or "—"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Approve Loop 2 changes? (yes / no / show details)
Approve Loop 3 changes? (yes / no / n/a)
```

If Loop 2 has no proposed changes (already at plateau or insufficient data), omit the approval prompt for it.

---

## Post-Approval

After user approves Loop 2 changes:
1. Apply edits to `modes/oferta.md` and/or `modes/_shared.md`
2. Record in `config/strategy-ledger.md → Optimization History`: date, loop ID, pass rate before/after, changes summary, `Approved: yes`
3. Confirm: "Changes applied. The next evaluation will use the updated prompts."

After user approves Loop 3 changes:
1. Update the eval criteria used in future Loop 2 runs (document in `config/strategy-ledger.md`)
2. Record in Optimization History with Loop = `meta-harness`

If user rejects changes:
1. Record in Optimization History with `Approved: no`
2. Note what was rejected — this prevents proposing the same change again until evidence shifts

---

## Scheduling

If `config/intel.yml` exists and `schedules.self_improve_cycle` is set:
- This mode runs automatically at the scheduled time (overnight by default)
- Results are saved to `reports/improve-{YYYY-MM-DD}.md` and surfaced on next session start
- Human gate still applies — changes are NEVER auto-applied even in scheduled runs

To configure: set `schedules.self_improve_cycle` in `config/intel.yml` (e.g., `"overnight"`, `"48h"`, `"weekly"`).
