# Cover Letter LLM Template — Mitchell Williams
**Version:** 1.0 — 2026-05-11
**Prompt lives in:** `scripts/build-apply-packs.mjs` → `buildCoverLetter()`
**Voice reference:** `data/voice-reference-brief.md`
**Gold-standard example:** See `data/design-brief-application-pipeline-2026-05-11.md` §8

---

## Block 1 — Framing Frame (2-3 sentences)

**Purpose:** Establish the company-specific problem Mitchell is solving. Not an introduction. Not enthusiasm. A precise diagnosis.

**Shape:** `The challenge of [X] is one I've spent [timeframe] solving: [what that means operationally].`

**Anti-patterns:**
- ❌ "I am excited to apply for..."
- ❌ "With my background in AI and communications..."
- ❌ Any sentence starting with "I" as the first word
- ❌ Company flattery ("I've long admired...")

**What changes per role:** The specific tension (AI comms integrity vs. agent deployment vs. editorial scale vs. developer enablement). The timeframe. The operational meaning.

**What stays fixed:** The diagnostic framing. The historical authority. The absence of hedging.

---

## Block 2 — Signature Move (3-4 sentences)

**Purpose:** Prove the claim in Block 1 with the highest-value proof point. Narrative, not bullets. Every sentence has a metric or a named artifact.

**Shape:** `At [company], [what he built] — [metric]. [What that architecture required]. [How it maps to their need].`

**Em-dash rule:** At least one em-dash per sentence. The em-dash expands the claim operationally: `[claim] — [what that means]`.

**Anti-patterns:**
- ❌ Bullet list of matches (reads like a scraped eval report)
- ❌ Any metric not in the canonical list in `data/voice-reference-brief.md`
- ❌ "I believe my experience aligns with..."
- ❌ Two consecutive sentences starting with "I"

**What changes per role:** Which proof point leads (triage agent vs. RAG pipeline vs. AJ+ talent pipeline vs. The Stream launch vs. Fusion breaking news production). Which metric is most relevant.

**What stays fixed:** The narrative arc. The em-dash architecture. The metric precision.

---

## Block 3 — Human Differentiator (1-2 sentences)

**Purpose:** The thing most candidates can't say. Journalism + AI production in the same body of work. Make it about their blind spot, not his résumé.

**Shape:** `Before [current role], [historical credential] — [specific institutional name + award if relevant]. [What that era built that directly applies now].`

**Anti-patterns:**
- ❌ "My unique background combines journalism and AI"
- ❌ Generic: "I bring cross-functional experience"
- ❌ Listing all prior employers (save that for Block 2 if relevant)

**What changes per role:** Which historical credential is most relevant (The Stream for social-first AI; Fusion/CNN for live crisis comms; AJ+ for global scale + editorial discipline; HuffPost Live for real-time engagement systems).

**What stays fixed:** The framing that journalism and AI are not two separate eras — they're a continuous system-building practice.

---

## Block 4 — Conversational Asymmetry CTA (2-3 sentences)

**Purpose:** Lower the cost to engage by offering something specific. Not a request. An exchange.

**Shape:** `If [role condition], I'd value [time] to walk through [named artifact]. [One sentence on why that artifact is directly relevant to their current phase].`

**Anti-patterns:**
- ❌ "Please don't hesitate to reach out"
- ❌ "I'd love to connect"
- ❌ "I look forward to hearing from you"
- ❌ Any generic CTA
- ❌ Asking for the job — offer the artifact

**What changes per role:** The named artifact (Voice DNA Kill List design for editorial roles; career-ops repo architecture for FDE/SA roles; AJ+ talent pipeline pattern for enablement roles; Fusion breaking news infrastructure for live-ops roles).

**What stays fixed:** The specific time ask (15 minutes). The condition framing ("If the role is still open"). The offer of tangible value.

---

## Critic Pass Checklist (run after generation)

Before the file is written, the system runs a second LLM call checking:
- [ ] Kill List violations → hard rewrite
- [ ] Fabricated metrics → remove or replace with canonical
- [ ] Weak opening (starts with "I") → restructure
- [ ] Word count > 340 → cut one Block 2 sentence
- [ ] Fabrication guard flag → append `<!-- FABRICATION FLAGS -->` block

The critic does NOT change the structure — only the language.

---

## Tuning Notes

**If outputs are too generic:** Add more company-specific context to the user prompt. The system prompt is fixed; the user prompt is what changes the output.

**If voice sounds AI-flat:** Add 1-2 more examples from `interview-prep/story-bank.md` to the user prompt as "additional proof points."

**If word count keeps running long:** Lower `max_tokens` in the generation call to 1,000 and add an explicit `"Return exactly 300-320 words."` instruction.

**If the critic over-edits:** Reduce the critic prompt's scope. Start by only enforcing the Kill List, not the word count.
