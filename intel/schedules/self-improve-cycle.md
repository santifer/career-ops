# Schedule: Self-Improvement (overnight, 2am)

## Purpose

Run an autoresearch-style evaluation loop to analyze evaluation history, detect strategy drift, and optimize prompts. Uses Gemma 4 as the reasoning engine for Loop 2. Outputs a morning briefing and updates the strategy ledger with optimization history.

## Trigger

- **Time:** 2:00 AM local (overnight)
- **Type:** background agent
- **Frequency:** nightly (but Loop 2 only runs if data sufficient; Loop 3 only runs monthly or on plateau)

## Prerequisites

- **Gemma 4 is required for this schedule.** If Gemma 4 is not available, skip entirely and log: `[SKIPPED] self-improve-cycle: Gemma 4 not available`.
- Do not substitute another model for Gemma 4 — the optimization logic is calibrated for its reasoning style.

## Steps

### Pre-flight check

- Read `data/applications.md` — count total evaluations
- Read `intel/strategy-ledger.md` — check last optimization date, current strategy version
- Determine which loops to run (see loop conditions below)

---

### Loop 1: Strategy Analysis (always runs)

**Goal:** Identify patterns in evaluation history and surface strategic insights.

1. Load last 20-30 evaluations from `data/applications.md` and corresponding reports from `reports/`
2. Analyze:
   - Score distribution: are scores clustering high or low? Calibration drift?
   - Apply rate vs. score: is the user applying to offers above/below their threshold?
   - Rejection patterns: any common signals in discarded/rejected offers?
   - Company type patterns: startup vs. corp, domain, size — what's converting?
3. Write findings to `intel/strategy-ledger.md` under `## Loop 1 — {date}`
4. Generate 2-3 strategic recommendations (e.g., "raise score threshold", "deprioritize domain X", "emphasize skill Y")

---

### Loop 2: Prompt Optimization via Gemma 4 (runs if data sufficient)

**Condition:** >= 10 evaluations in `data/applications.md`

**Goal:** Use Gemma 4 to analyze evaluation prompt quality and suggest improvements.

1. Load `modes/_shared.md`, `modes/oferta.md`, and `batch/batch-prompt.md`
2. Load a sample of 5-10 recent evaluation reports from `reports/`
3. **Invoke Gemma 4** with the following task:
   - Review the evaluation prompts and sample outputs
   - Identify: inconsistencies, missing criteria, over/under-weighted factors, prompt ambiguities
   - Suggest specific prompt edits (diff format preferred)
4. Review Gemma 4's suggestions:
   - Auto-apply minor wording fixes (low-risk)
   - Flag structural changes for user review in `intel/flags.md`
5. Log optimization history to `intel/strategy-ledger.md` under `## Loop 2 — {date}`
   - Include: what was analyzed, what was auto-applied, what was flagged

**Config:**
```yaml
use_gemma: true  # required — skip loop if false or unavailable
gemma_model: gemma-4
max_iterations: 20
sample_size: 10
auto_apply: minor_wording_only
flag_threshold: structural_changes
```

---

### Loop 3: Deep Calibration (monthly or on plateau)

**Condition:** Last Loop 3 run was > 30 days ago OR score variance < 0.3 across last 15 evals (plateau detected)

**Goal:** Full recalibration of scoring weights and archetype fit criteria.

1. Aggregate full evaluation history
2. Compare stated priorities (`config/profile.yml`) with revealed preferences (what scored high + got applied to)
3. Rebuild archetype weights in `modes/_shared.md` to reflect actual behavior
4. Update `config/profile.yml` narrative section if significant drift detected
5. Log to `intel/strategy-ledger.md` under `## Loop 3 — {date}`

---

### Morning Briefing

After all applicable loops complete, write a morning briefing to `intel/intelligence.md`:

```
## Morning Brief — {date}

**Self-Improve Cycle complete.**

- Loop 1: [summary of strategy findings]
- Loop 2: [what was optimized / skipped]
- Loop 3: [ran / skipped — reason]

**Actions taken:** [list of auto-applied changes]
**Flagged for review:** [list of items in intel/flags.md]
**Next optimization:** [estimated date for Loop 3]
```

## Config

```yaml
trigger: cron(0 2 * * *)  # 2am daily
use_gemma: true            # required
gemma_model: gemma-4
max_iterations: 20
skip_if_gemma_unavailable: true
loops:
  loop_1: always
  loop_2:
    condition: evaluations >= 10
  loop_3:
    condition: days_since_last >= 30 OR score_variance < 0.3
output:
  strategy_ledger: intel/strategy-ledger.md
  briefing: intel/intelligence.md
  flags: intel/flags.md
```

## Notes

- This schedule is the system's learning engine. The quality of output improves over time as more evaluations accumulate.
- Never edit `modes/_shared.md` structural content without writing the change to strategy-ledger first
- Loop 2 auto-applies only cosmetic/wording changes; anything that changes scoring logic goes to `intel/flags.md` for user review
