# Voice-Resolved — Polisher's Authoritative Rule Book

Reconciled 2026-05-19 by email-review-setup-wizard. Synthesizes:
- `writing-samples/voice-reference.md` (rank: highest · weight 1.0 — the canonical exemplar carries authority)
- `.claude/knowledge/brain/personality-communication-style.md` (provides the "why" — psychological architecture behind the rules)

The two source files **agree** — they reinforce each other, not contradict. voice-reference.md is the rule book; personality-communication-style.md explains why each rule exists. The polisher prioritizes voice-reference.md when conflicts arise (none observed at reconciliation time, but rule kept in case the personality file drifts).

# Lead architecture (Rule 1 — highest priority)

Lead with the conclusion, then the reasoning.
- Source: voice-reference.md "Lead architecture" (problem-statement opener naming the gap, not the concept) + personality-communication-style.md DISC DI ("Lead with the conclusion, then provide supporting reasoning. Do not build up to the point slowly.")
- Polisher action: every section's first sentence is the verdict. Reasoning follows. The TL;DR carries the day's verdict in 2-3 sentences.

# Em-dash density

Target 40-50% sentences with at least one em dash. Canonical exemplar carries 14 em dashes across 5 paragraphs.
- Source: voice-reference.md exemplar note 2.
- Polisher action: do not strip em dashes when polishing. If the orchestrator's draft has zero em dashes in a long section, the polisher inserts where natural.

# Root-word discipline

No root repeats within ~50 words. Track verbs, nouns, and adjectives.
- Source: voice-reference.md exemplar note 6.
- Polisher action: scan polished output for repeated roots within 50-word windows; rewrite to vary.

# Metric anchoring

Every quantitative claim is canonical and grounded — e.g., "160 hours/year," ">90% classification accuracy." No round-number hand-waving.
- Source: voice-reference.md exemplar note 3.
- Polisher action: do not soften specific metrics. Preserve commit SHAs, confidence percentages, finding IDs, council vote tallies exactly as the orchestrator emitted them.

# Earned closer

Section closes with a structural observation, not a declared feeling. Example: "The cognitive move is identical. The stakes inside an engineering organization are just structured differently."
- Source: voice-reference.md exemplar note 4 + personality-communication-style.md "interpretation before facts."
- Polisher action: scan section closers for declared-feeling patterns ("This makes me feel optimistic," "I'm excited about," "It's wonderful that"). Replace with structural observation grounded in the data shown.

# Colloquial emotional vocabulary

When emotional register is necessary, use colloquial verbs rather than abstract feeling nouns. "Glazed over," "watched the same thing happen," not "I felt frustrated," "I observed disengagement."
- Source: voice-reference.md exemplar note 5.
- Polisher action: scan for therapy-speak emotional nouns; replace with concrete verbs.

# Banned vocabulary (hard refuse)

These tokens are removed from any polished output. Substitute with direct phrasing.

| Banned | Replace with |
|---|---|
| leverage (as verb) | use, apply, draw on |
| synergy | overlap, mutual fit, joint effect |
| best-in-class | top-tier, leading, the strongest |
| deliverable | output, result, the thing shipped |
| actionable insights | clear next steps, findings worth acting on |
| low-hanging fruit | the easy wins, the obvious starts |
| moving forward | next, from here, going on |
| circle back | come back to, revisit |
| double-click (as verb) | dig in, drill into |
| deep-dive (as verb) | examine closely, investigate |
| touch base | check in, follow up |
| action item | next action, the thing to do |
| ideate | brainstorm, draft, sketch |
| hold space | sit with, make room for |
| feel into | sense, gauge, read |
| lean in | commit, engage, push into |
| self-care narrative | (no substitute — delete) |

Source: voice-reference.md banned-vocab list (synthesized from full corpus).

# Hedge-word refuse list

These soften writing without adding accuracy. Remove or replace with direct phrasing.

| Hedge | Replace with |
|---|---|
| perhaps | (delete; assert directly) |
| might want to consider | should, recommend |
| it could be worth | worth, plan to |
| potentially | (delete; assert directly) |
| arguably | (delete; assert directly) |
| seemingly | appears to, looks like |
| just (as filler) | (delete) |
| somewhat | (delete; quantify if possible) |
| basically | (delete) |
| sort of | (delete) |
| kind of | (delete) |

Source: voice-reference.md hedge-word policy + personality-communication-style.md DISC DI directness.

# Shared Vision framing

Frame as possibility, future, interpretation — not facts-only. "The data suggests" beats "the data shows."
- Source: personality-communication-style.md Shared Vision 93 + voice-reference.md "agency-first framing."
- Polisher action: bias toward forward-looking phrasing for analysis sections. The Effort & trajectory section especially.

# Smart Brevity in bullets

Bulleted findings follow: **<bold lead>** — <one-line continuation>. Maximum one level of nesting.
- Source: voice-reference.md Smart Brevity rules + personality-communication-style.md "In writing: well-organized with clear headers, logical flow."
- Polisher action: enforce bullet syntax across the report.

# Sentence length

Average 18-22 words. Hard cap 35. If a sentence runs >25 words, consider splitting; if >35, split.
- Source: voice-reference.md exemplar pattern + personality-communication-style.md "When excited: fast and interruptive" (which means tight sentences when calm).
- Polisher action: scan sentence lengths post-rewrite; flag offenders for split.

# RSD-safety overrides (covered in polisher spec)

The RSD-safe framing rules live in `email-review-polisher.md`. They override these voice rules in any conflict — e.g., if a hedge-word removal would produce "you failed at X," soften via the RSD-safety table instead. The polisher resolves the conflict.

# Self-check checklist (polisher runs at the end of each pass)

1. Did every section open with the verdict before the reasoning? (Rule 1)
2. Are em dashes present at the 40-50% target rate? (Rule 2)
3. Any root-word repeats within 50 words? (Rule 3)
4. Are metrics preserved verbatim? (Rule 4)
5. Are section closers structural observations, not declared feelings? (Rule 5)
6. Banned-vocab grep returns empty? (Rule 7)
7. Hedge-word grep returns empty? (Rule 8)
8. Sentence-length average ≤22? Max ≤35?
9. (Friday only) Effort & trajectory section present and grounded in real diffs?
10. RSD-safety rules applied where conflicts arose?

If any check fails, fix and re-check. The polished output is returned only when all 10 pass.
