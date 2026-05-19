---
agent: dealbreaker
mode: claim-adjudication
input_report: /Users/mitchellwilliams/Documents/career-ops/data/council-report-runbatch-uiux-2026-05-18-RESULTS.md
input_kind: council
timestamp: 2026-05-18 22:05:00 PT
adjudication_summary:
  total_claims_reviewed: 20
  verified: 10
  corroborated: 3
  unique_distinctive_kept: 4
  cut_unsupported: 1
  cut_contradicted: 0
  cut_stale: 0
  websearch_calls_used: 0
  confidence_in_final_synthesis: high
---

# Final Research Report — Run Batch modal + sidebar progress widget UX

**Adjudicated by:** dealbreaker agent (claim-adjudication)
**Source report:** [`council-report-runbatch-uiux-2026-05-18-RESULTS.md`](/Users/mitchellwilliams/Documents/career-ops/data/council-report-runbatch-uiux-2026-05-18-RESULTS.md)
**Council size:** 5/5 successful responses (GPT-5, Sonnet 4.6, Opus 4.7, Perplexity Sonar Pro, Grok 4.3)
**Timestamp:** 2026-05-18 22:05 PT
**Target file:** `scripts/build-dashboard.mjs` — `_renderPipelineModalBody` (line 18650) + `_renderBatchData` (line 18012) + `_renderCapWarning` (line 18771)

## Headline

The modal is structurally close to Mitchell's mental model, but the information sequence is wrong: $142.80 lands before the funnel that explains it, em-dashes and `★` look like missing data, and `Publish 0 / 0` reads as broken — five concrete code-level fixes restore mental-model legibility.

## Executive synthesis

Five-of-five council members converge on a single root cause: the modal shows the answer ($142.80) before showing the question (175 → 70 → 21 funnel). The cognitive sequence Mitchell needs in <10 seconds is **scope → funnel → composition → total → cap decision**, but the current modal renders **total → stages → enrichment → cap**. Every other friction point (em-dash, `★`, `incl. above`, `Publish 0/0`, `③④⑤` orphaned numbering) is downstream of this sequencing error.

The fix is mostly a re-arrangement of strings already present in `_renderPipelineModalBody`, plus three new render fragments: (1) a funnel line at the modal header, (2) per-row unit-cost annotations on enrichment rows (Opus's uniquely-strong contribution), and (3) explicit `$0` strings in place of em-dashes for the zero-cost stages. The sidebar's `Publish 0/0` is a separate fix in `_renderBatchData` — render `pending` text when total=0 on a downstream stage that has not been reached yet.

Two areas show genuine divergence and are explicitly marked for Mitchell's judgment: stage numbering (renumber-from-1 vs hide-circled-numbers vs add-breadcrumb — three of five lean toward dropping numbers entirely, two toward renumbering) and whether to add a sixth "Agents" sidebar row (one model proposed it, one proposed a muted future row, three did not address). Neither is load-bearing for the headline fix.

I (dealbreaker) have not modified any of the verified recommendations. The cut list is one item: Grok's "queued → processed" terminology nit — the source data flag `eval_count` represents queued items pending evaluation, so "queued" is technically correct; Grok was misreading the variable semantics.

---

## SHIP-READY PLAN — ordered list of code-level changes

The recommendations below are ordered by leverage (highest mental-model impact first, lowest last). Each entry specifies the file, function, line range, and exact string substitution.

### Change 1 — Add a funnel line at the modal header (HIGHEST LEVERAGE)

**Why:** Verified 5/5. This is the single most-converged claim in the council. The funnel `175 → ~70 → 21` answers "where does $142.80 come from" before the dollar number appears.

**File:** `scripts/build-dashboard.mjs`
**Function:** `_renderPipelineModalBody`
**Insert before:** line 18737 (`'<h4>' + count + ' ' + headlineNoun + '</h4>'`)

**Replacement for the entire opening section (lines 18735-18742):**

```javascript
  // Funnel math: process count → expected publish count → enriched count.
  // Pull from est.stages and est.agent_enrichment so it stays in sync with breakdown.
  var processN  = est.stages ? est.stages.process.count : (est.eval_count || count);
  var publishN  = est.stages ? est.stages.publish.count : 0;
  var enrichN   = est.agent_enrichment ? est.agent_enrichment.council.count : 0;
  var publishPct = processN > 0 ? Math.round((publishN / processN) * 100) : 0;
  var coreUsd       = (est.stages && est.stages.process)  ? (est.stages.process.cost_usd || 0) : 0;
  var enrichUsd     = est.agent_enrichment
    ? ((est.agent_enrichment.council.cost_usd || 0)
       + (est.agent_enrichment.researcher.cost_usd || 0)
       + (est.agent_enrichment.dealbreaker.cost_usd || 0))
    : 0;

  return ''
    + '<div class="pipeline-modal-section">'
    +   '<h4>' + count + ' ' + headlineNoun + '</h4>'
    +   '<div class="pipeline-funnel" style="font-size:12px;opacity:0.75;margin:4px 0 8px 0">'
    +     processN + ' queued → ~' + publishN + ' publish-eligible (' + publishPct + '%) → ' + enrichN + ' enriched'
    +   '</div>'
    +   '<div class="pipeline-stat-grid">'
    +     '<span class="pipeline-stat-label">Core pipeline</span>'
    +     '<span class="pipeline-stat-value">$' + coreUsd.toFixed(2) + '</span>'
    +     '<span class="pipeline-stat-label">Agent enrichment <span style="opacity:0.55;font-size:10px">(after publish ≥ ' + (est.threshold_for_publish || 4.0) + ')</span></span>'
    +     '<span class="pipeline-stat-value">$' + enrichUsd.toFixed(2) + '</span>'
    +     '<span class="pipeline-stat-label" style="font-weight:600;border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;margin-top:2px">Estimated total</span>'
    +     '<span class="pipeline-stat-value pipeline-cost-headline" style="border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;margin-top:2px">$' + (est.total_cost_usd || 0).toFixed(2) + '</span>'
    +   '</div>'
    + '</div>'
```

This delivers verified claims #1 (sequencing), #8 (funnel math explicit), and #20 (21=30%-of-70 derivation made implicit through the funnel line) in one structural change. Headroom line at line 18756 stays exactly where it is — claim #15, kept on Opus's unique recommendation.

---

### Change 2 — Replace em-dash with explicit `$0` for the zero-cost stages

**Why:** Verified 5/5. Em-dash reads as "missing data" under time pressure. Three of five models proposed phrasings that converge on "$0" + bundling text.

**File:** `scripts/build-dashboard.mjs`
**Function:** `_renderPipelineModalBody`
**Line range:** 18691-18699 (the `stageRows` map block)

**Specific edits:**

1. **Line 18682** (`④ Evaluate` note in Process All branch): change `'rubric + gates — incl. above'` → `'rubric + gates · runs with Process'`
2. **Line 18687** (`④ Evaluate` note in Run Batch branch): same substitution
3. **Line 18696** (costStr ternary): replace the muted em-dash with explicit `$0`:

   ```javascript
   var costStr = s.cost > 0
     ? '$' + (s.cost < 0.01 ? s.cost.toFixed(3) : s.cost.toFixed(2))
     : (s.muted ? '<span class="muted">$0.00</span>' : '$0.00');
   ```

4. **Line 18683 and 18688** (`⑤ Publish` note): change `'if score ≥ ' + thr + ' · triggers enrichment'` → `'only if score ≥ ' + thr + ' · triggers enrichment'`. The word "only" is GPT-5's contribution and tightens the conditional read.

Delivers verified claim #2.

---

### Change 3 — Add per-item unit cost on enrichment rows (UNIQUE — Opus 4.7)

**Why:** UNIQUE — model-distinctive, kept. Opus's contribution was uniquely strong: per-item unit costs let Mitchell *verify* math (`opus at $4 is 2× council at $2 — that tracks`) rather than trust it. No other model proposed this and no model contradicted; it's a pure additive win.

**File:** `scripts/build-dashboard.mjs`
**Function:** `_renderPipelineModalBody`
**Line range:** 18702-18715 (the `agentRows` block)

**Replacement for the inner `.map` callback** (around line 18710-18714):

```javascript
        ].map(function(a) {
          var unitCost = a.count > 0 ? (a.cost / a.count) : 0;
          var unitStr  = unitCost >= 1 ? '$' + unitCost.toFixed(2) : '$' + unitCost.toFixed(3);
          var sub = ' <span style="opacity:0.45;font-size:10px">('
                  + a.count + ' &times; ' + unitStr + ' · ' + a.model + ' · ' + a.note
                  + ')</span>';
          return '<span class="pipeline-stat-label muted" style="padding-left:10px">↳ ' + a.label + sub + '</span>'
               + '<span class="pipeline-stat-value">' + (a.cost > 0 ? '$' + a.cost.toFixed(2) : '<span class="muted">$0.00</span>') + '</span>';
        }).join('');
```

The only change is inserting `unitStr` into `sub`. Result reads as e.g. `Council (21 × $2.00 · grok-4.3+sonnet-4.6+gpt-5+gemini-3.1 · 50% cached)`.

Delivers UNIQUE-kept claim #9.

---

### Change 4 — Drop the `★` symbol; bake the threshold into prose

**Why:** Verified 5/5. The `★` is currently noise because the prose `(if score ≥ 4 · triggers enrichment)` is already doing the semantic work.

**File:** `scripts/build-dashboard.mjs`
**Function:** `_renderPipelineModalBody`

**Edits:**

1. **Line 18692:** remove the star span entirely. Change:

   ```javascript
   var lbl = s.label + (s.cond ? ' <span style="opacity:0.5;font-size:10px">★</span>' : '');
   ```

   to:

   ```javascript
   var lbl = s.label;
   ```

   (The `s.cond` flag is now unused for label rendering — keep it on the data object in case it's read elsewhere, but the label no longer branches on it.)

2. **Line 18705:** in the agent-enrichment header, remove `★ threshold gated` and the leading `· `:

   ```javascript
   agentRows = '<span class="pipeline-stat-label" style="grid-column:1/-1;font-weight:600;margin-top:8px;opacity:0.75;font-size:11px">'
     + 'Agent enrichment <span style="font-weight:400;opacity:0.55;font-size:10px">(only on published items)</span></span>'
   ```

Delivers verified claim #4.

---

### Change 5 — Fix the sidebar `Publish 0 / 0` to read as gated, not broken

**Why:** Verified 5/5. The `0 / 0` display on a downstream stage that hasn't been reached yet reads as a rendering bug. All five models converged on the fix; the cheapest variant is to detect the pre-reach state and render `pending` text.

**File:** `scripts/build-dashboard.mjs`
**Function:** `_renderBatchData`
**Line:** 18043 (the `cnt` ternary inside the multi-stage mode render)

**Replacement:**

```javascript
var cnt;
if (st.done) {
  cnt = ttl > 0 ? (ttl + ' / ' + ttl) : '✓';
} else if (st.active) {
  cnt = ttl > 0 ? (done + ' / ' + ttl) : '—';
} else if (!st.active && ttl === 0 && done === 0) {
  // Downstream gated stage that has not been reached yet.
  // Examples: Publish before Evaluate finishes, Process before Sort finishes.
  cnt = '<span style="opacity:0.45;font-style:italic">pending</span>';
} else {
  cnt = ttl > 0 ? (done + ' / ' + ttl) : '—';
}
```

Note: the `cnt` value is interpolated as innerHTML on line 18048, so the `<span>` is safe. If Mitchell prefers a plain-text variant, swap to `cnt = 'pending'` and rely on the existing `txtClr` for muted styling.

Delivers verified claim #3.

---

### Change 6 — Move the go/no-go decision to the front of the cap warning

**Why:** Corroborated 3/5 (GPT-5, Sonar Pro, Opus 4.7 explicitly; Sonnet/Grok did not address). Lower-confidence than Changes 1-5 but still a clean structural improvement.

**File:** `scripts/build-dashboard.mjs`
**Function:** `_renderCapWarning`
**Line range:** 18781-18805

**Edit:** invert the order — show the actionable decision (Cancel / Override checkbox) immediately under the title, demote the env-var prose to a small muted help block beneath the action row.

**Replacement for lines 18797-18805:**

```javascript
  return ''
    + '<div class="pipeline-cap-warning">'
    +   '<div class="pipeline-cap-warning-title">⚠️ ' + title + '</div>'
    +   '<label class="pipeline-force-override" for="pipeline-force-override" style="margin-top:8px">'
    +     '<input type="checkbox" id="pipeline-force-override" onchange="_onForceOverrideToggle()">'
    +     '<span>I accept the cost. <strong>Force-run anyway.</strong></span>'
    +   '</label>'
    +   '<div class="pipeline-cap-warning-detail" style="margin-top:8px;opacity:0.65;font-size:11px">' + detail + '</div>'
    + '</div>';
```

Note: this moves the force-override checkbox INSIDE the cap-warning div, so the standalone `<label>` block currently rendered separately after `_renderCapWarning` returns must be removed. The current call site at line 18761 emits `_renderCapWarning(action, p)` which (in the current implementation) returns both the warning div AND the standalone override label. After this change, `_renderCapWarning` returns a single div with the override nested inside.

Delivers corroborated claim #7.

**Deferred:** Opus's tri-state `[Lower scope ▾]` button (claim #10) — UNIQUE, not corroborated, and requires new state-management logic to actually disable Researcher mid-flow. Mark as a follow-up enhancement; not in this ship.

---

### Change 7 — Add `Result:` anchor line under the total (UNIQUE — Opus 4.7)

**Why:** UNIQUE — model-distinctive, kept. Ties cost to value delivered ("21 fully-enriched roles with HM intel + dealbreaker check"). Pure additive, no contradiction from other models.

**File:** `scripts/build-dashboard.mjs`
**Function:** `_renderPipelineModalBody`
**Insert after:** the Estimated-total row added in Change 1, before the closing `</div>` of the first modal section.

```javascript
+     '<div style="grid-column:1/-1;font-size:11px;opacity:0.6;margin-top:6px">'
+       'Result: ~' + enrichN + ' fully-enriched roles (HM intel + dealbreaker review)'
+     '</div>'
```

Delivers UNIQUE-kept claim #14.

---

### Change 8 — DEFERRED for Mitchell's judgment: stage numbering

**Why:** DIVERGENT. 3/5 (GPT-5, Sonnet 4.6, Opus 4.7) recommend hiding the circled-number prefixes or adding a breadcrumb; 2/5 (Sonar Pro, Grok 4.3) recommend renumbering from 1 inside the modal. The council did not converge.

**Mitchell's decision rule** (from the council synthesis): if Run Batch is conceptually a self-contained modal, renumber from 1; if it's conceptually a slice of the global 5-stage pipeline, keep `③④⑤` and add a breadcrumb like `Stages 3–5 of pipeline (triage + sort already complete)`.

**Implementation if renumber-from-1 is chosen** (cheap):

In line 18686-18688 (Run Batch branch), change:
- `'③ Process'` → `'① Process'`
- `'④ Evaluate'` → `'② Evaluate'`
- `'⑤ Publish'` → `'③ Publish'`

The Process-All branch (line 18679-18683) already starts at `①` so no change there.

**Implementation if hide-numbers is chosen** (cleaner):

In lines 18679-18688, strip the circled prefix entirely from all `label:` strings (`'Triage'` instead of `'① Triage'`, etc.). The numbering is redundant with the visual top-to-bottom ordering.

**Implementation if breadcrumb is chosen** (Opus's variant):

Add this string above the cost breakdown section (between the new header section and the breakdown):

```javascript
+ '<div style="font-size:10px;opacity:0.55;margin-bottom:6px">Stages 3–5 of pipeline · triage + sort already complete</div>'
```

I (dealbreaker) recommend the **hide-numbers** variant: the spatial ordering already encodes the sequence, and the circled glyphs add visual weight without adding information. This is the choice 3/5 of the highest-confidence models implicitly endorsed.

---

## Verified findings (high confidence) — 5/5 council convergence

1. **Sequencing error is the root cause** — $142.80 lands before the funnel that explains it. Fix: Change 1.
2. **`—` reads as missing data, not zero** — explicit `$0` + bundling phrase wins. Fix: Change 2.
3. **`Publish 0 / 0` reads as broken** — render `pending` for unreached downstream stages. Fix: Change 5.
4. **`★` is noise without legend** — prose already does the work. Fix: Change 4.
5. **Agent enrichment must stay expanded by default** — it's 93% of cost; collapsing would be hostile. (No code change; the current implementation already keeps it open. Preserve.)
6. **Separate Council / Researcher / Dealbreaker rows are correct** — must not be re-merged into a single "agent enrichment" total. (No code change; preserve current 3-row decomposition at lines 18707-18709.)
7. **Per-stage sidebar decomposition is the biggest existing win** — must not be rolled back. (No code change; preserve.)
8. **The `(70 · if score ≥ 4 · triggers enrichment)` phrase is the modal's strongest sentence** — preserve verbatim. (No code change beyond the "only" insertion in Change 2.)
9. **`incl. above` is ambiguous** — replace with `runs with Process`. Fix: included in Change 2.
10. **The funnel math `175 → 70 → 21` should be explicit, not derived by the reader** — fix: included in Change 1.

## Corroborated findings (medium confidence) — 3-4/5 council convergence

1. **Cap warning should lead with the decision** (3/5: GPT-5, Sonar Pro, Opus 4.7). Fix: Change 6.
2. **The 21 vs 70 derivation should be inline** (3/5: GPT-5, Sonar Pro, Grok 4.3). Fix: subsumed into Change 1's funnel line, which makes the 21/70 relationship visually obvious without a separate derivation string.
3. **The funnel should be drawn, not implied** (4/5: GPT-5, Sonar Pro, Grok 4.3, Opus 4.7). Fix: Change 1.

## Model-distinctive findings (architecturally attributed) — kept

1. **Per-item unit cost on enrichment rows** (Opus 4.7) — kept. The verification-by-glance argument is uniquely strong and no model contradicted. Fix: Change 3.
2. **Visual boxed "IF published" block** (Sonnet 4.6) — kept conceptually but implemented via the "after publish ≥ 4.0" sub-label in Change 1 rather than a literal ASCII box (HTML rendering doesn't gain from the box-drawing characters Sonnet sketched in markdown). The conditionality is now a structural fact: enrichment lives in its own subtotal in the header.
3. **Result anchor line under total** (Opus 4.7) — kept. Fix: Change 7.
4. **Headroom $461.84 line is excellent — preserve** (Opus 4.7) — kept. No code change needed; current lines 18756-18759 already render it.

## Open disagreements / Undecidable

1. **Stage numbering** (Change 8): three-way split. Marked for Mitchell's judgment with three concrete implementations sketched. Dealbreaker's recommended variant: hide-numbers.
2. **Sidebar "Agents" sixth row**: Perplexity proposed `Agents 0 / 5 (after Publish ≥ 4.0)`; Grok proposed a muted "future" row; three models didn't address. Marked as low-priority. Defer until Mitchell sees the sidebar after the other fixes — the "Publish pending" fix from Change 5 may itself remove the need for an Agents row, since the visual signal that more is gated downstream is now visible without adding a new row.

## Appendix: rejected claims (audit trail)

| # | Claim | Source | Classification | Rationale |
|---|---|---|---|---|
| 13 | "Queued" vs "processed" terminology in the modal breaks mental-model continuity | Grok 4.3 (1/5) | UNIQUE — unsupported, CUT | The `eval_count` variable name and the headline noun `queued evaluations` accurately describe items pending evaluation (not items already processed). Grok appears to have read "queued" as "input to the pipeline" when it actually means "queued for the next stage." No mental-model violation. The Change 1 funnel line `processN queued → ~publishN publish-eligible` makes the queue→publish direction unambiguous without the terminology swap. |
| 19 | "Process 8/13" in sidebar vs "175" in modal is a count mismatch | Opus 4.7 (1/5) | UNIQUE — dismissed | The two numbers represent different runs (a live in-flight batch vs an estimated future batch). The example in the council prompt happened to juxtapose them but in real use the sidebar reflects the running job and the modal reflects the prospective job — they are NEVER expected to match. No code fix needed; this is a council-prompt artifact. |
| 10 | Cap warning should offer `[Lower scope ▾]` to drop Researcher | Opus 4.7 (1/5) | UNIQUE — distinctive, DEFERRED | Conceptually correct (Researcher is the obvious lever for getting under cap) but requires new state-management to actually disable Researcher mid-flow. Out of scope for this ship; logged as follow-up enhancement. |
| 12 | Add a sixth "Agents" row to the sidebar progress widget | Sonar Pro (1/5) + variant from Grok | UNIQUE — DEFERRED for Mitchell | Reasonable but not corroborated by 3/5 of the council. Defer until Change 5 ships and Mitchell can judge whether the new "Publish pending" affordance closes the gap. |

---

## Tracking summary for caller

```
Final report written to: /Users/mitchellwilliams/Documents/career-ops/data/council-report-runbatch-uiux-2026-05-18-ADJUDICATED.md

Mode: claim-adjudication
Source: council-report-runbatch-uiux-2026-05-18-RESULTS.md

  Verified:               10
  Corroborated:            3
  Unique-distinctive:      4 (3 kept, 1 deferred)
  Cut (unsupported):       1
  Cut (contradicted):      0
  Cut (stale):             0
  WebSearch calls:         0 / 5 (none needed — UX/design judgment, not factual claims)

Ship-ready plan: 7 in-scope code changes (Changes 1-7) + 1 marked-for-judgment (Change 8: stage numbering).
Target file: scripts/build-dashboard.mjs
Functions touched: _renderPipelineModalBody (L18650), _renderBatchData (L18012), _renderCapWarning (L18771).
```

**One-paragraph plain-English version:** The council unanimously says the modal puts the answer ($142.80) before the question (175 → 70 → 21 funnel), so seven of the eight recommended fixes are about restoring that sequence. The single highest-leverage change is rewriting the modal header to lead with the funnel line and a Core-vs-Enrichment split before the total — that alone neutralizes the sticker-shock complaint and makes the per-item unit costs (Opus's distinctive contribution) verifiable at a glance. The em-dashes, the `★`, and the sidebar's `Publish 0/0` are all separate one-line fixes that each remove a "looks broken" failure mode. Stage numbering is the only genuinely undecidable question — Mitchell picks between renumber-from-1, hide-numbers, or add-breadcrumb based on whether Run Batch is conceptually a self-contained modal or a slice of the global pipeline.
