# Council Research Report — Run Batch modal + sidebar progress widget UX review

**Run timestamp:** 2026-05-18 20:39 PT
**Prompt:** Review the Run Batch modal cost breakdown + sidebar progress widget — friction points, recommended changes, and mental-model alignment in <10 seconds.
([full prompt](/Users/mitchellwilliams/.claude/agents/runs/prompt-20260518-203946.txt))
**Models called:** 5 succeeded, 0 failed, 0 skipped
**Total runtime:** ~46s (parallel; longest single call: Opus 4.7 @ 44.8s)
**Total tokens:** 19,273 across 5 models
**Estimated spend:** ~$0.70 (Opus ~$0.30, GPT-5/Gemini-class ~$0.15, Sonnet ~$0.10, Grok ~$0.10, Perplexity ~$0.05) — well under the $10 cap and far under the $2.50/model cap
**Raw council JSON:** [`/Users/mitchellwilliams/.claude/agents/runs/council-20260518-203946.json`](/Users/mitchellwilliams/.claude/agents/runs/council-20260518-203946.json)

---

## Executive synthesis

All five council members converge on the same headline: **the modal is structurally close to Mitchell's mental model, but the information sequence is wrong.** $142.80 leads the layout, but it should be the *output* of a funnel-then-composition reveal, not the opening shot. Every model independently proposed the same fix — show the funnel (175 → 70 → 21) and the cost split (core $10.50 vs enrichment $132.30) **before** the headline total. This is the single most-converged recommendation in the report.

The second-strongest convergence: **drop "incl. above" and the em-dash.** All five models flagged `Evaluate (175 · rubric + gates — incl. above) —` as ambiguous. The unanimous fix is explicit "$0" with bundling text — phrasings ranged from "free · runs with Process" (GPT-5, Sonar, Opus) to "no separate LLM cost" (GPT-5's secondary suggestion) to "zero extra cost" (Grok). Em-dashes read as "missing data" under time pressure; explicit zero beats them.

Third convergence: **the `Publish 0 / 0` sidebar state reads as broken, not gated.** Every model called this out. Recommended replacements: `Publish — pending evaluate` (Opus), `Publish · waiting for scores ≥ 4.0` (GPT-5), `Publish 0 / 13 (waiting on Evaluate)` (Sonar), `Publish 0 / 70 (pending)` (Grok), `— / — (pending)` (Sonnet 4.6). All variants share the same fix: never render `0 / 0` for a gated downstream stage; always show either a target denominator or an explicit "pending" state.

Where the models diverge: **stage numbering.** GPT-5, Sonnet 4.6, and Opus 4.7 all recommend either hiding the circled numbers (③④⑤) entirely or annotating them as a sub-range ("Stages 3–5 of pipeline"). Perplexity and Grok lean toward renumbering from 1 inside the Run Batch modal. There is no consensus on which is correct — but there IS consensus that `③` appearing without `①②` is a cognitive speed bump. The decision rule: if Run Batch is a self-contained modal, renumber; if Run Batch is conceptually a slice of the global pipeline, keep numbers but add a breadcrumb. Mitchell's call.

Fourth area of agreement: **the ★ symbol should be dropped or legended.** Five-of-five say it's noise without explanation. The prose `(if score ≥ 4)` is doing all the semantic work; the star adds nothing.

Two distinctive contributions worth flagging individually:
- **Opus 4.7** uniquely proposed per-item unit costs on each enrichment row (e.g., `Council 21 × $2.00 (50% cached) $42.00`), which lets Mitchell *verify* math at a glance ("yes, opus at $4 is 2× council at $2 — that tracks") rather than trust it. This is the highest-leverage single addition in the entire report. Opus also uniquely flagged that "Lower scope" should be a button in the cap warning, letting Mitchell toggle off Researcher (the $84 line) — which is the obvious lever for getting under cap without raising it.
- **Sonnet 4.6** uniquely proposed a visual boxed/indented enrichment block (`┌─ IF published (est. 70 items · score ≥ 4.0) ──┐`) so conditionality is a *spatial fact*, not a clause buried in a parenthetical. This is the strongest typographic-restructuring suggestion of the five.
- **GPT-5 and Perplexity** uniquely emphasized that the cap warning should lead with the decision (`[Run anyway] [Cancel]`) and demote the `PER_RUN_CAP_RUN_BATCH_USD` env-var prose to small help text. Opus extended this into a tri-state button row.

The lowest-confidence area of the report: whether to add a "Agents" row to the sidebar as a sixth stage (Perplexity proposed it; Grok proposed a muted future row instead; the other three did not address it). Mental-model-purity argument cuts both ways — agents *are* downstream of publish in Mitchell's diagram, but they're per-role enrichment, not per-batch pipeline stages.

**Bottom line for the dealbreaker pass:** the top-priority changes are (1) information re-sequence at the modal header, (2) explicit `$0 · runs with Process` for Evaluate, (3) per-item unit cost on enrichment rows, (4) fix `Publish 0 / 0` in the sidebar, (5) actionable decision row in the cap warning. Stage-numbering and ★-symbol decisions are lower-priority polish.

---

## Per-model responses

### openai:gpt-5 (modelUsed: gpt-5.5) — 4,346 tokens, 41,080ms

## 1. Friction points

The UI is much closer to Mitchell's mental model than before, but it still asks the user to do too much interpretation in a 10-second, "should I spend $150?" moment.

### Friction point 1: The headline number appears before the explanation

Current:

```txt
175 QUEUED EVALUATIONS          Estimated total cost   $142.80
```

This is honest, but it is cognitively abrupt. A user sees `$142.80` before they understand that most of it is not the 175 evaluations themselves — it is enrichment on the expected published subset. The later breakdown explains it, but the first impression may be "175 evals cost $142.80," which is misleading relative to Mitchell's model.

A better immediate framing would be:

```txt
Estimated max run cost: $142.80
Mostly enrichment after publish threshold
```

or:

```txt
175 queued → ~70 publish-eligible → 21 enriched
Estimated total: $142.80
```

That sequence maps cost to funnel shape before price shock.

### Friction point 2: The counts do not explain the funnel math

The modal shows:

```txt
Process 175
Publish 70
Council 21
Researcher 21
Dealbreaker 21
```

A technical user may infer that 70 is 40% of 175, and 21 is some subset of published jobs. But a non-engineer will ask: Why do only 21 of 70 published items get council/researcher/dealbreaker? Is that expected? Is it because of cache? Is it a bug? Is it one agent per role or per company?

The context says enrichment agents run on published items, with cost scaling around 40%. But the API shows enrichment count `21`, not `70`. That discrepancy is the biggest remaining comprehension issue. If 21 is correct because of another sampling/caching/role grouping rule, the UI needs to say so. If 21 means "net paid calls after cache/filters," the label should say that.

### Friction point 3: "Evaluate — incl. above" is ambiguous

Current:

```txt
④ Evaluate (175 · rubric + gates — incl. above)        —
```

"incl. above" can mean "included in Process," "included in the total above," or "the cost is hidden inside another stage." The dash also requires interpretation: zero? free? bundled? not applicable?

For Mitchell's mental model, Evaluate is a real stage even though it has no separate LLM cost. So the label should preserve the stage while making cost behavior obvious:

```txt
Evaluate  175 · rubric + gates · free, runs with Process   $0
```

or:

```txt
Evaluate  175 · rubric + gates · no separate LLM cost      $0
```

### Friction point 4: Symbols carry meaning without enough legend

Current:

```txt
⑤ Publish ★ (70 · if score ≥ 4 · triggers enrichment) —
Agent enrichment (published items only · ★ threshold gated)
```

The star is visually noticeable, but it does not naturally mean "threshold gated." It could mean important, favorite, premium, recommended, or high quality. The text helps, but in a 10-second scan the star is more decoration than information.

If the UI uses a symbol, the symbol should be self-evident or explicitly labeled once:

```txt
Publish threshold: score ≥ 4.0
```

Then the star is unnecessary.

### Friction point 5: The sidebar progress widget hides why Publish is `0 / 0`

Current:

```txt
▱▱▱▱▱  Publish    0 / 0
```

This may be technically correct during live processing, but it looks broken. In Mitchell's mental model, Publish depends on Evaluate results. So "0 / 0" should be replaced with a pending conditional state:

```txt
Publish    pending scores ≥ 4.0
```

## 2. Recommended changes

### Change 1: Replace the top headline with a funnel summary before the dollar total

Recommended:

```txt
Run Batch estimate

175 queued → ~70 may publish → 21 enriched
Estimated total cost: $142.80
```

### Change 2: Split the cost breakdown into "Base pipeline" and "Post-publish enrichment"

```txt
COST BREAKDOWN

Base pipeline
Process      175 queued · sonnet batch                 $10.50
Evaluate     175 scored · rubric + gates · $0 extra     $0
Publish      ~70 if score ≥ 4.0 · deterministic         $0

Post-publish enrichment
Runs only after Publish threshold
Council      21 enriched · 4-LLM consensus · 50% cached $42.00
Researcher   21 enriched · HM + comp intel              $84.00
Dealbreaker  21 enriched · sonnet adjudicator            $6.30
```

### Change 3: Replace stage numbers and star with plain-language dependencies

```txt
Process
Evaluate
Publish if score ≥ 4.0
```

### Change 4: Make the cap warning actionable with the exact decision

```txt
⚠️ Over per-run cap

This run is estimated at $142.80, which is $117.80 over your $25 cap.

To proceed:
[ ] I understand this run may cost up to $142.80
[Run anyway]  [Cancel]
```

### Change 5: Fix the sidebar conditional states

```txt
▱▱▱▱▱  Publish    waiting for scores ≥ 4.0
```

## 3. Does the UI reveal Mitchell's mental model or hide it?

It mostly reveals the model, but with some avoidable decoding. The phrase `(70 · if score ≥ 4 · triggers enrichment)` is exactly the right conceptual dependency. The numbering `③ Process` obscures modal scope. `Evaluate (incl. above) —` obscures cost ownership. `Publish 0 / 0` obscures gating.

## 4. Direct answers to sub-questions

- **③ Process numbering:** Confusing. Hide numeric stage prefixes in the Run Batch cost modal. If you want to preserve global mental model, show it once as a small breadcrumb: `Run Batch covers: Process → Evaluate → Publish`.
- **★ symbol:** Not legible by itself. Remove and use text `Publish if score ≥ 4.0`.
- **Agent enrichment collapsed?** Stay open by default. Enrichment is $132.30 of $142.80 — collapsing hides the answer to "why is this $142.80?"
- **$142.80 shock?** Yes. Better sequence: scope → funnel → cost → cap → decision.
- **"Evaluate (incl. above) —":** Reword. Use `Evaluate · no separate LLM cost · $0`.

## 5. What is working — keep

Keep the separate agent line items (`↳ Council / Researcher / Dealbreaker`). Do not collapse into "agent enrichment" only. Keep the per-stage sidebar progress.

---

### perplexity:sonar-pro — 4,002 tokens, 19,289ms, 6 citations

## 1. Friction points in a 10-second glance

1. **Mismatch between "175 queued" and "21 agents" is opaque.** A non-engineer will likely ask: "Why 175 items but only 21 Council/Researcher/Dealbreaker runs?" The jump from `175 → 70 published → 21 agent calls` is implied but not clearly surfaced.

2. **Top-line $142.80 with $10.50 in the main stages feels like a bait-and-switch.** Under time pressure, many people will see "core pipeline = $10.50" and struggle to reconcile that with $142.80. It's not obvious that the agents are the real driver.

3. **Stage naming vs sidebar progress is inconsistent.** The modal shows only ③–⑤. There is no "agents" stage in the sidebar, even though they dominate cost. Also, seeing "0 / 0 Publish" makes the user question whether anything will ever publish.

4. **Symbols and jargon are under-explained.** `★` threshold gating not explained. "incl. above" is vague. "4-LLM consensus · 50% cached" is cognitively heavy in a budget moment.

5. **The run-cap warning appears after the scary number and is wordy.** Mitchell in "decide fast" mode wants: "Over cap. This run will cost $142.80 (> $25). Proceed?"

## 2. Recommended changes

### Change 1: Reframe the header around "core vs agents"

```text
175 queued jobs

This run (estimated)
- Core pipeline (Process + Evaluate + Publish):   $10.50
- Agent enrichment (Council / Researcher / Dealbreaker): $132.30
= Total estimated cost:                           $142.80
```

### Change 2: Explicitly show the funnel counts and publish rate

```text
Funnel (estimates for this batch)
- Jobs to process:            175
- Expected to publish (score ≥ 4.0): 70  (≈ 40%)
- Enriched with agents:       21  (≈ 30% of published)
```

### Change 3: Clarify zero-cost stage wording

```text
④ Evaluate (175 · rubric + gates · free · runs with Process)  $0
⑤ Publish ★ (70 · if score ≥ 4.0 · free)                     $0
```

### Change 4: Simplify and elevate the run-cap warning

```text
Total estimated cost: $142.80   (over your $25 per-run cap)

[ Proceed anyway ]  [ Cancel ]
```

### Change 5: Add an "Agents" row to the sidebar and avoid "0 / 0"

```text
▰▰▰▰▰  Triage       15 / 15  ✓
▰▰▰▰▰  Sort         15 / 15  ✓
▰▰▰▱▱  Process      8 / 13
▰▰▰▱▱  Evaluate     8 / 13
▱▱▱▱▱  Publish      0 / 13   (waiting on Evaluate)
▱▱▱▱▱  Agents       0 / 5    (after Publish ≥ 4.0)
```

## 3. Does the UI reveal or hide the mental model?

**Reveals:** Sidebar sequence `Triage → Sort → Process → Evaluate → Publish` mirrors mental model. The modal stage list at least exposes that Run Batch operates on later stages.

**Hides:** The absence of Triage and Sort in the modal makes ③–⑤ look arbitrary. Agent enrichment is verbally explained as "after publish" but not structurally framed as "stage 6." Publish-bar in sidebar doesn't visually indicate it gates agents.

## 4. Sub-questions

- **③ Process numbering:** Confusing. Renumber from 1 inside Run Batch modal. Sidebar keeps full 5-stage.
- **★ symbol:** Noise without legend. Add inline legend or bake into label: `Publish (score ≥ 4.0 ★)`.
- **Agent enrichment collapsed?** Stay open. Collapsing hides the part Mitchell most cares about. Label as `Agent enrichment (major cost driver)`.
- **$142.80 shock?** Yes. Show "Core vs Agents" side-by-side first, then over-cap state, then line-item detail.
- **"Evaluate (incl. above) —"?** No. Replace with `Evaluate (rubric + gates · free · runs with Process)  $0`.

## 5. What's working

1. Clear separation of stages vs agents is conceptually right.
2. Sidebar per-stage progress is a solid improvement.

**Citations:**

1. <https://www.youtube.com/watch?v=UbXpRv5ApKA>
2. <https://www.youtube.com/shorts/IzAQGPqcW7g>
3. <http://job-boards.greenhouse.io/figure/jobs/8463088002>
4. <https://careers.google.com/jobs/results/97074557646447302-senior-staff-product-designer/>
5. <https://ouryahoo.wd5.myworkdayjobs.com/en-US/careers/job/Senior-Product-Designer--Universal-Navigation-System_JR0026926>
6. <https://uxdesign.cc/dashboards-are-a-powerful-tool-that-you-probably-shouldnt-try-to-make-b7c1b46512de>

(Note: Sonar Pro's citations are tangential to the UX question — most are job postings the model surfaced as proxies for "what does professional dashboard design look like." The actual UX recommendations are model-internal, not grounded in these citations.)

---

### xai:grok-4 (modelUsed: grok-4.3) — 2,979 tokens, 14,003ms

## 1. Friction points

**First**, the headline cost sits above any explanation of scope. The line `175 QUEUED EVALUATIONS Estimated total cost $142.80` forces a non-engineer to pause and mentally map "queued evaluations" onto the pipeline stages he knows. Nothing on-screen says these 175 items have already passed triage and sort, so the number feels arbitrary.

**Second**, the stage numbering and symbols still require cross-referencing. The labels `③ Process … $10.50` use circled numbers that only make sense if the user remembers stages 1–2 are omitted. The lone ★ on Publish has no legend.

**Third**, the agent-enrichment block presents three separate line items without showing how their 21-count derives from the 70 publish candidates. A quick glance yields `Council (21) $42.00` and `Researcher (21) $84.00` without any visual cue that 21 = 30% of 70.

## 2. Recommended changes

**Change A – Reorder the top block**

```
Run Batch on 175 processed items
Estimated total cost: $142.80 (details below)
```

**Change B – Renumber stages from 1 inside the modal**

```
1. Process (175 items)               $10.50
2. Evaluate (runs with Process)      —
3. Publish only if score ≥ 4.0       —
```

**Change C – Add a one-line derivation under Agent enrichment**

```
Agent enrichment (only on items that reach Publish)
21 items = 30 % of 70 Publish candidates
```

**Change D – Replace the ★ with inline text**

Change `③ Publish ★ (70 · if score ≥ 4 · …)` to `③ Publish (70 only if score ≥ 4.0)`.

**Change E – Keep the sidebar stages but add a thin "future" row**

```
Publish    0 / 70 (pending)
```

## 3. Mental-model alignment

**Working:** Sidebar lists Triage → Sort → Process → Evaluate → Publish with live counts. Modal's "Agent enrichment (published items only · ★ threshold gated)" correctly signals enrichment fires only after Publish.

**Obscuring:** Modal omits triage/sort, so 175 appears without context. "Process (175 · queued items)" uses "queued" instead of "processed."

## 4. Sub-questions

- **Numbering:** ③–⑤ is confusing for Run Batch. Renumber from 1 inside the modal.
- **★ symbol:** Noise. Replace with explicit phrase "only if score ≥ 4.0".
- **Agent enrichment collapsed?** Keep open. Collapsing would hide $132.30 of $142.80 and force an extra click.
- **$142.80 at top:** Shocks before context. Reordered headline supplies scope first.
- **"Evaluate (incl. above) —":** Unclear. Better: `Evaluate (runs with Process, zero extra cost) —`.

## 5. What's working

The explicit separation of Process ($10.50) from the three agent-enrichment lines prevents the old "lumped cost" problem. The sidebar's per-stage progress bars already give a live decomposition matching the pipeline.

---

### anthropic:claude-sonnet-4-6 — 3,508 tokens, 40,667ms

## 1. Friction Points

**① The $142.80 headline hits before context.** Mitchell sees a big number before he understands that 93% of it ($132.30) is conditional on a 40% publish rate. First instinct is sticker shock, not analysis.

**② "incl. above" and "—" for Evaluate is a dead end.** Reads like a placeholder or rendering bug. Wastes 2–3 seconds.

**③ "Agent enrichment (published items only · ★ threshold gated)" is a clause, not a signal.** The conditionality — the single most important cost-shaping fact — is buried in a parenthetical.

**④ The numbering ③④⑤ is orphaned.** A non-engineer will scan for ①② before reading the rest. Wasted 2–3 seconds.

**⑤ The sidebar's `Publish 0 / 0` is ambiguous.** Looks like an error or uninitialized state mid-run.

## 2. Recommended Changes

**Change 1 — Flip the information sequence in the modal header.**

```
175 queued evaluations
Processing cost:   $10.50  (this run, certain)
Enrichment cost:  ~$132.30  (if ~40% publish · 70 items estimated)
──────────────────────────────────────────
Estimated total:  $142.80
```

**Change 2 — Replace ③④⑤ with plain labels, drop circled numbers.**

```
Pipeline:  [Triage ✓] [Sort ✓] → Process · Evaluate · Publish
```

**Change 3 — Rewrite the Evaluate line.**

```
Evaluate   (175 · rubric + gates · free · runs with Process)   —
```

**Change 4 — Make the conditional cost block visually distinct.**

```
┌─ IF published (est. 70 items · score ≥ 4.0) ──────────────┐
│  Council     21 × 4-LLM consensus · 50% cached   $42.00   │
│  Researcher  21 × opus + 4 LLMs · HM + comp      $84.00   │
│  Dealbreaker 21 × sonnet adjudicator               $6.30   │
│                                        subtotal  $132.30   │
└────────────────────────────────────────────────────────────┘
```

**Change 5 — Fix `Publish 0 / 0`.** Use `— / —   (pending)` or `0 published so far`.

## 3. Reveals or Hides the Mental Model?

**Works:** Sidebar widget with per-stage rows. Agent enrichment broken into Council/Researcher/Dealbreaker (was a pre-fix blind spot).

**Obscures:** Modal buries conditionality in a parenthetical. ★ symbol load-bearing without legend. Em-dashes look like missing data.

## 4. Sub-Questions

- **③④⑤ numbering:** Hide or replace. Use plain stage names.
- **★ legibility:** Noise without legend. Add inline key or drop and use spatial conditional block.
- **Agent enrichment collapsed?** Stay open. $132 of conditional spend.
- **$142.80 shock:** Yes. Show certain cost before conditional before total.
- **"Evaluate (incl. above) —":** Wrong. Use `free · runs with Process`.

## 5. What's Working

The per-stage sidebar decomposition is excellent. Surfacing Researcher and Dealbreaker as separate line items is correct.

---

### anthropic:claude-opus-4-7 — 4,438 tokens, 44,846ms

## 1. Friction points

1. **The $142.80 headline lands before the explanation of why it's so high.** Mental model says "process is the bulk LLM cost" ($10.50), but the actual driver is enrichment ($132.30, ~93% of the run). Mitchell has to read 8 lines down to discover this. That's a "bait" feeling even though the numbers are honest.

2. **The cap warning buries the actionable decision in prose.** No clear "Proceed / Cancel / Raise cap" tri-state.

3. **The enrichment math is invisible.** Researcher costs double Council despite same count. Why? Because opus is expensive, but the UI never says that. Mitchell has to *trust* the numbers rather than *verify* them at a glance.

Secondary: sidebar `Publish 0 / 0` reads as "broken." `Process 8/13` vs modal's `175` is a count mismatch.

## 2. Recommended changes

**(a) Lead with a two-line cost summary, not a single total.**

```
175 items → 70 publishable (40%) → 21 enriched
LLM batch  $10.50   ·   Enrichment  $132.30   ·   Total  $142.80
```

**(b) Replace the warning block with an explicit decision row.**

```
⚠ $142.80 exceeds $25/run cap
[ Cancel ]  [ Lower scope ▾ ]  [ Override once ]  [ Raise cap permanently ]
```

"Lower scope" should let him toggle off Researcher (the $84 line) — which is the obvious lever.

**(c) Show the per-item unit cost on each enrichment row.**

```
↳ Council     21 items × $2.00  (50% cached)         $42.00
↳ Researcher  21 items × $4.00  (opus + 4 LLMs)      $84.00
↳ Dealbreaker 21 items × $0.30  (sonnet)              $6.30
```

Now Mitchell can mentally check "yes, opus is 2× council, that tracks."

**(d) Fix the sidebar's empty-publish row.** `Publish — pending evaluate` in grey-italic.

**(e) Add a one-line "what this run buys you" under the total.**

```
Result: 21 fully-enriched roles with HM intel + dealbreaker check
```

## 3. Mental-model legibility

**Works:** The cost breakdown's stage numbering and indented `↳ Council / Researcher / Dealbreaker` does mirror his pipeline. Parenthetical `(70 · if score ≥ 4 · triggers enrichment)` is the single best line in the modal.

**Obscures:** Model is *implicitly* present but never drawn. No horizontal pipeline diagram showing 175 → 175 → 70 → 21 funneling down. Reader has to assemble the funnel from scattered numbers.

## 4. Sub-questions

- **③④⑤ numbering:** Confusing. Keep numbers but add faint header `Stages 3–5 of pipeline (triage + sort already complete)`.
- **★ symbol:** Noise. Drop — prose already does the work.
- **Agent enrichment collapsed?** Stay open. It's 93% of cost; collapsing would be hostile to go/no-go.
- **$142.80 shock:** Yes. Better sequence: scope → composition → total → decision.
- **"Evaluate (incl. above) —":** Em-dash reads as "missing data," not "$0." Better: `Evaluate (175 · free · bundled with Process)`.

## 5. What's working — don't touch

- The sidebar's per-stage progress decomposition.
- The `Headroom $461.84` line. Quietly excellent: reframes $142.80 against budget rather than in isolation.

---

## Claim ledger

| # | Claim | Models asserting | Concrete fix proposed |
|---|---|---|---|
| 1 | The $142.80 headline appears before any explanation of why it's high, causing sticker shock before comprehension | GPT-5, Sonar Pro, Grok 4.3, Sonnet 4.6, Opus 4.7 (5/5) | Reorder header: funnel (175→70→21) + composition ($10.50 core / $132.30 enrichment) BEFORE the $142.80 total |
| 2 | "incl. above" and the em-dash for Evaluate are ambiguous; em-dash reads as "missing data" not "$0" | GPT-5, Sonar Pro, Grok 4.3, Sonnet 4.6, Opus 4.7 (5/5) | Replace with `Evaluate (175 · free · runs with Process) $0` (or equivalent explicit zero) |
| 3 | The sidebar's `Publish 0 / 0` reads as broken/uninitialized, not as gated-downstream-stage | GPT-5, Sonar Pro, Grok 4.3, Sonnet 4.6, Opus 4.7 (5/5) | Render as `Publish — pending evaluate` or `Publish 0 / 70 (pending)` or `Publish · waiting for scores ≥ 4.0` |
| 4 | The `★` threshold-gating symbol is noise without an inline legend | GPT-5, Sonar Pro, Grok 4.3, Sonnet 4.6, Opus 4.7 (5/5) | Drop the star; rely on prose `if score ≥ 4.0`. Or add one-line key. |
| 5 | The Agent enrichment section should stay open by default — it's the majority of cost | GPT-5, Sonar Pro, Grok 4.3, Sonnet 4.6, Opus 4.7 (5/5) | Keep expanded. Optionally label as "(major cost driver)" or show subtotal |
| 6 | The ③④⑤ numbering is confusing because ①② don't appear in the Run Batch modal | GPT-5, Sonar Pro, Grok 4.3, Sonnet 4.6, Opus 4.7 (5/5) | DIVERGENT FIX: GPT-5/Sonnet/Opus → hide numbers entirely or add breadcrumb; Sonar/Grok → renumber from 1 |
| 7 | The cap warning is prose-heavy when it should lead with the go/no-go decision | GPT-5, Sonar Pro, Opus 4.7 (3/5) | Lead with `[Run anyway] [Cancel]` (or tri-state); demote env-var prose to small help text |
| 8 | The 175 → 70 → 21 funnel math is implicit; the UI never draws or states the funnel | GPT-5, Sonar Pro, Grok 4.3, Opus 4.7 (4/5) | Add an explicit funnel line: `175 queued → ~70 publish-eligible → 21 enriched` |
| 9 | Per-item unit cost on enrichment rows would let Mitchell verify math at a glance | Opus 4.7 (1/5 — uniquely his) | Add `21 × $X.XX` per row: `Council 21 × $2.00, Researcher 21 × $4.00, Dealbreaker 21 × $0.30` |
| 10 | The cap warning should offer a "lower scope" toggle to drop Researcher (the $84 line) | Opus 4.7 (1/5 — uniquely his) | Add `[Lower scope ▾]` button that lets user toggle off enrichment subsystems |
| 11 | Visual boxed/indented "IF published" block makes conditionality a spatial fact | Sonnet 4.6 (1/5 — uniquely hers) | Render enrichment rows inside a box labeled `IF published (est. 70 items · score ≥ 4.0)` |
| 12 | Add a sixth "Agents" row to the sidebar progress widget | Sonar Pro (1/5 — uniquely hers) | Append `Agents 0 / 5 (after Publish ≥ 4.0)` row to sidebar |
| 13 | "Queued" vs "processed" terminology in the modal breaks mental-model continuity | Grok 4.3 (1/5 — uniquely his) | Change `Process (175 · queued items)` to `Process (175 · processed items)` (or "Run Batch on 175 processed items") |
| 14 | Result anchor line under the total ties cost to value delivered | Opus 4.7 (1/5 — uniquely his) | Add `Result: 21 fully-enriched roles with HM intel + dealbreaker check` under total |
| 15 | The Headroom $461.84 line is excellent and should be preserved adjacent to the total | Opus 4.7 (1/5 — uniquely his, but not contradicted) | Keep `Headroom` line in any redesign |
| 16 | Separate Council / Researcher / Dealbreaker rows are correct and must not be re-merged | GPT-5, Sonar Pro, Grok 4.3, Sonnet 4.6, Opus 4.7 (5/5) | Preserve current 3-row decomposition |
| 17 | Per-stage sidebar decomposition is the single biggest existing win and must not be rolled back | GPT-5, Sonar Pro, Grok 4.3, Sonnet 4.6, Opus 4.7 (5/5) | Preserve 5-stage row layout |
| 18 | The `(70 · if score ≥ 4 · triggers enrichment)` phrase on the Publish line is the modal's strongest sentence | Opus 4.7 explicitly; implicitly endorsed by all 5 (no model recommended removing it) | Preserve the phrase; consider replicating its directness elsewhere |
| 19 | "Process 8/13" in the sidebar vs "175" in the modal is a count mismatch that confuses first-time users | Opus 4.7 (1/5 — uniquely his) | Either note that the example sidebar and modal represent different runs, or unify the example |
| 20 | The 21-count vs 70-publish discrepancy needs an explicit derivation ("21 = 30% of 70") | GPT-5, Sonar Pro, Grok 4.3 (3/5) | Add inline derivation: `21 items = 30% of 70 Publish candidates` |

---

## Errors and skips

**Initial run:** 2 of 5 models skipped — `anthropic:claude-sonnet-4-6` and `anthropic:claude-opus-4-7` — because the shell pre-sets `ANTHROPIC_API_KEY=""` and `run-council.mjs` uses `import 'dotenv/config'` (which does NOT override existing env vars). The memory note `reference_env_secrets.md` documents this exact failure mode.

**Recovery:** Re-ran the two Anthropic models with `unset ANTHROPIC_API_KEY` first, so dotenv could pick up the real value from `.env`. Both succeeded on the retry (Sonnet 40.7s, Opus 44.8s). Merged into the canonical JSON.

**Suggested infra fix (out of scope for this run):** Patch `scripts/run-council.mjs` line 26 from `import 'dotenv/config'` to an explicit `dotenv.config({ override: true })` call so the shell-empty trap can't bite again. Same fix applies anywhere else in the codebase that does the bare `dotenv/config` import.

No other errors. No jailbreak refusals. No grounding URLs (none of the models triggered search tools for this UX prompt — appropriate, since the question is design judgment, not factual lookup).
