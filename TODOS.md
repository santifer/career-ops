# TODOS

Deferred work captured during plan reviews. Each item has enough context for someone picking it up in 3 months.

---

## Extract PDF flow from batch-prompt.md into a separate file

**What:** Move `## Paso 4 — PDF opcional` (lines 230-319 of `batch/batch-prompt.md`, ~90 lines) into a standalone `batch/pdf-prompt-extension.md`, referenced only when `PDF_CONFIRMED=yes`.

**Why:** Today the section is conditional on `PDF_CONFIRMED` but still consumes prompt tokens and reasoning budget on every Codex invocation that never triggers it. Bridge path already disables PDF; batch path rarely triggers it. Pure prompt tax.

**Pros:**
- Smaller base prompt for the common path (faster prefill, fewer reasoning tokens on "when not to do this")
- Cleaner separation — the PDF pipeline is genuinely a different workflow
- Easier to evolve PDF logic without touching the evaluation path

**Cons:**
- Two files to keep in sync
- Slight complexity in the prompt loader (conditional append)

**Context:** Discovered in the latency review of 2026-04-12. At that time `bridge/bridge-prompt.md` was introduced as the extension-path prompt; PDF extraction into its own file is the batch-path equivalent cleanup. Don't attempt until the bridge/batch split has settled and the eval harness is in place to catch prompt-behavior drift.

**Depends on / blocked by:** Landing the Phase 1+2 latency optimization PR first. That PR establishes the prompt-variant seam that this refactor extends.

---

## CODEX_BRIDGE_MODEL env override for A/B testing smaller models

**What:** Add an env var that lets the bridge override the model passed to `codex exec` (default: whatever `~/.codex/config.toml` has set, typically `gpt-5.4`). Candidates to test: `gpt-5.4-mini`, or any faster model in the Codex-supported list.

**Why:** Once the eval harness from the latency PR exists, flipping the model is cheap and measurable. If `reasoning=medium` isn't fast enough and we want to push further, a smaller model is the next lever — but only with quality gates.

**Pros:**
- Pure config knob, no code-path risk
- Reuses the eval harness to decide objectively
- Rollback is flipping an env var

**Cons:**
- Smaller models are known to be weaker on Block B (CV match specificity) and Block F (STAR story generation)
- Requires the eval harness as a precondition — without it, this is a silent quality-regression risk

**Context:** User flagged smaller-model swap as a latency lever but correctly identified it as quality-regressive in the 2026-04-12 review. Defer until:
1. Eval harness is in place and passing
2. `CODEX_BRIDGE_REASONING=medium` has been running in prod for ≥ 2 weeks with no score-delta complaints

**Depends on / blocked by:** Eval harness (Phase 1+2 PR).
