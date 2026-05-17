# Mode: recruiter-find — Recruiter Outreach Generator

Generate ready-to-send LinkedIn connection notes (≤300 chars) and follow-up messages for recruiter outreach.
Covers three real scenarios: a friend forwarded a profile, you found a job and want to reach the recruiter,
or a recruiter already DMed you and you want a polished reply.

Before generating any message, read `config/profile.yml` and `modes/_profile.md`. All proof points must
come from these files — never hardcode metrics.

---

## Step 0 — Scenario Detection (runs first, gates everything else)

Identify which scenario applies from what the user provided:

| Scenario | Trigger signals | Flow |
|----------|----------------|------|
| **A** — Friend forwarded a recruiter profile | URL contains `linkedin.com/in/` and no job URL is present | Skip Steps 1–2, go to Step 3 |
| **B** — User has a job, wants to find/message the recruiter | Job URL (`greenhouse.io`, `lever.co`, `ashbyhq.com`, `linkedin.com/jobs`, `/jobs/`, `/careers/`) or "Company + Role" text | Full flow Steps 1–7 |
| **C** — Recruiter already DMed the user | Phrases like "messaged me", "reached out", "got a DM", "they contacted me", or user pastes an inbound message | Skip Steps 1–2, go to Step 3, then Step 5C |

**Ambiguous input:** Ask exactly one question — "Are you (A) sharing a recruiter's LinkedIn profile, (B) looking for who to contact about a specific role, or (C) replying to a recruiter who messaged you?"

**Both a `linkedin.com/in/` URL and a job URL provided:** Scenario B wins — more context = better message.

---

## Step 1 — Extract Context

**Scenario A (LinkedIn profile URL only):**
- Extract the slug from the URL (`linkedin.com/in/{slug}`). Do not attempt to scrape or navigate to it.
- Ask: "What do you know about this recruiter? (name, title, company they recruit for)" — one question, accept whatever they say.
- Proceed with whatever context is provided. If nothing is known, proceed to Step 4 with archetype as unknown.

**Scenario B (job URL or company+role text):**
- Check `reports/` for an existing file matching the company name slug (e.g., `reports/003-hume-ai-*.md`). If found, read Block A and Block B from that report — faster than re-fetching, already evaluated.
- If no report exists and a URL was provided: use WebFetch to extract company name, role title, and 2–3 key requirements from the job posting. Extract only what's needed for archetype classification — do not run a full A-F evaluation here.
- If WebFetch fails (404, login wall, empty): ask the user to paste the role title and 2–3 key requirements as text.
- If only company+role text was given (no URL): use it directly.

**Scenario C (inbound recruiter message):**
- Parse the message for: company name, role mentioned (if any), recruiter's name (if signed), and key role signals.
- These become the inputs for Step 4.

---

## Step 2 — Generate LinkedIn Search Queries (Scenario B only)

The user runs these in their browser — do NOT run WebSearch yourself, as LinkedIn requires login and blocks programmatic access.

Generate three queries using variables extracted in Step 1:

- `{company}` = company name as given (preserve capitalisation for quoted strings)
- `{company-slug}` = lowercase, spaces to hyphens, punctuation removed (e.g., "Scale AI" → `scale-ai`, "Hume AI" → `hume-ai`)
- `{role-area-terms}` = from archetype detected in Step 4 (pre-compute if possible, or default to `"AI" OR "ML"` if archetype not yet known):
  - Platform / LLMOps → `"LLMOps" OR "model serving" OR "ML platform"`
  - Agentic / Automation → `"AI agents" OR "LLM" OR "automation"`
  - Founding AI Engineer → `"AI" OR "startup" OR "founding"`
  - Solutions Architect → `"enterprise AI" OR "ML" OR "RAG"`
  - Forward Deployed → `"AI" OR "ML" OR "technical"`
  - Senior ML Engineer → `"machine learning" OR "MLOps" OR "data science"`

Output this block verbatim (substituting variables):

```
### LinkedIn Search Queries — {Company} / {Role}

Query 1 — Google (broadest):
"talent acquisition" OR "technical recruiter" OR "recruiting" "{company}" site:linkedin.com/in

Query 2 — Google (role-targeted):
"technical recruiter" OR "engineering recruiter" "{company}" {role-area-terms}

Query 3 — LinkedIn Company People page:
Go to: linkedin.com/company/{company-slug}/people
Filter by: Department → Human Resources
(LinkedIn slug is a best guess — verify by visiting the company page and copying from the URL)
```

Then prompt: "Run one of these, find the right profile, paste the LinkedIn URL back here. I'll generate the message immediately."

**Exception:** If the user asks you to search for them, run WebSearch with Query 1 and return whatever results appear, noting that results may be incomplete without login.

---

## Step 3 — Load Candidate Profile

Read the following. This step runs for all three scenarios.

1. **`config/profile.yml`** — extract:
   - `candidate.full_name`
   - `candidate.linkedin`
   - `candidate.github` (this is the portfolio link)
   - `narrative.headline`
   - `candidate.canonical_resume` — if this key exists, use the path it contains. If the key is missing, default to `~/Ventures/career/resumes/Gaurav_Resume_AI-latest.pdf` and note: "Add `canonical_resume` to `config/profile.yml` so this updates automatically."

2. **`modes/_profile.md`** — extract the **Adaptive Framing table** (columns: "If the role is... | Emphasize about you... | Key proof points"). This table drives all proof point selection in Steps 4 and 5.

---

## Step 4 — Archetype Classification

Classify the role or recruiter focus into one of six archetypes using signals from context:

| Archetype | Signal keywords / context |
|-----------|--------------------------|
| Platform / LLMOps | "LLMOps", "model serving", "evaluation", "vLLM", "pipeline", "observability", "inference" |
| Agentic / Automation | "agent", "workflow", "orchestration", "multi-agent", "AutoGen", "LangGraph", "agentic" |
| Founding AI Engineer | startup, "founding", "0 to 1", Series A/B, small team, "first AI hire" |
| Solutions Architect | "enterprise", "RAG", "architecture", "integration", "Elasticsearch", "solutions" |
| Forward Deployed | "client-facing", "field", "deployed", "prototype", "customer", "forward deployed" |
| Senior ML Engineer | "ML pipelines", "feature engineering", "MLOps", "training", "ETL", "data science" |

**Source of signals by scenario:**
- Scenario A: recruiter's company type and title (from what user shared)
- Scenario B: key requirements extracted from the job posting / report Block A
- Scenario C: signals in the inbound recruiter message

**Default if unknown:** Platform / LLMOps — broadest coverage, aligns with primary archetype from `config/profile.yml`.
Always note in output: "Defaulted to Platform/LLMOps — tell me if a different archetype fits better."

---

## Step 5 — Generate Messages

### Proof Point Selection (applies to all sub-paths)

1. Read the archetype row's "Key proof points" cell from the `modes/_profile.md` Adaptive Framing table.
2. From those proof points, select the single metric that contains the largest or most specific number (e.g., 2.7M, 5M+, 35%).
3. Pick the one most relevant to the role context if there is a tie — job context beats raw scale.
4. Never combine two proof points in a 300-char note. One concrete number hits harder than two vague claims.

---

### 5A — Scenario A: Connection Note (profile forwarded, no job context)

**Framework — 3 sentences, ≤300 chars total:**

- S1 (Fit): What you build vs. what they recruit for. Direct and specific.
- S2 (Proof): The single proof point metric selected above.
- S3 (CTA): Soft ask. "Happy to send my CV if relevant."

**Rules:**
- Do NOT say "I'm looking for a job" or "I'm job hunting"
- Do NOT say "I'm passionate about" or "I'm excited to"
- No phone number
- Reserve resume + portfolio for the follow-up message (Step 5D) — no space in 300 chars

**Character discipline:**
1. Draft the note.
2. Count characters including spaces and punctuation. Show `[N/300]`.
3. If over 300: shorten S1 first (drop adjectives, compress phrasing). Then shorten S3 ("Happy to send my CV.").
4. Never cut the proof point number (2.7M stays 2.7M).
5. Never use ellipsis to save characters.
6. If still over 300 after trimming: flag it — `[OVER LIMIT: N/300 — shorten before sending]`.

**Output:**
```
## Connection Note — {Recruiter Name or "Recruiter at {Company}"} [{N}/300 chars]

{note text, copy-paste ready}

Archetype: {detected} | Proof point: {metric used}
```

---

### 5B — Scenario B: Connection Note (job found, recruiter identified)

Same framework as 5A, with S1 referencing the specific role:

- S1: "Saw the {Role Title} opening at {Company} — my {N}-year background in {archetype area} is a direct match."
- S2: Same proof point selection as 5A.
- S3: "Happy to send my CV if timing works."

**Key rule:** Frame as "I saw your opening" — they have a need, you are responding to it. Never say "I'm looking for a job."

**Output:** Same format as 5A, plus one reference line below showing the job URL.

---

### 5C — Scenario C: Reply to Inbound Recruiter Message

No 300-char limit — this is a DM reply. Target 80–120 words.

**Framework:**
- Opening (1 sentence): Acknowledge warmly. Skip "I'm excited" — jump to fit. "Thanks for reaching out" is fine if the tone warrants it.
- S2 (Fit): Confirm alignment with the role they mentioned + archetype strength.
- S3 (Proof): One proof point selected via the same algorithm.
- S4 (Offer): "Happy to share my resume and portfolio — what's the best next step?"

**Output:**
```
## Reply to {Recruiter Name} / {Company}

{reply text, copy-paste ready}

---
When they say yes, send:
- Resume: {canonical_resume path}
- Portfolio: {candidate.github}
- LinkedIn: {candidate.linkedin}
```

---

### 5D — Follow-up Message (Scenarios A and B only)

Generated alongside the connection note in the same response. This message is sent after the recruiter accepts the connection request.

**Structure (150–200 words):**

- P1 (2 sentences): Thank them for connecting. One sentence on why you're reaching out — reference their company/role (Scenario B) or their recruiting focus (Scenario A).
- P2 (2–3 sentences): Proof point narrative. Use the primary proof point from Step 5A/5B plus one supporting metric from the same archetype row in `_profile.md`. Write as a mini-story — what you built, at what scale, and what it achieved. Not bullets.
- P3 (1–2 sentences): The offer. "Happy to share my resume and GitHub portfolio — both give a clearer picture than a profile summary. Would a quick call make sense?"
- Closing: "Best, {candidate.full_name}"

Resources block (below the message, not hyperlinked inline — LinkedIn DMs do not render links as clickable):
```
Resume: {canonical_resume path}
Portfolio: {candidate.github}
```

**Rules for P2:**
- Never say "I'm currently looking for new opportunities"
- Never use "circling back", "touching base", "just wanted to follow up"
- Show raw URLs in the resources block, not hyperlinked text

**Word count:** Count words. If under 150 → expand P2. If over 200 → trim P1.

**Output:**
```
## Follow-up Message (send after they accept) [{N} words]

{message text, copy-paste ready}

---
Attach / include:
- Resume: {canonical_resume path}
- Portfolio: {candidate.github}
```

---

## Step 6 — Duplicate Check

Before logging anything, search `data/follow-ups.md` for an existing row where the Company column matches the current recruiter's company (case-insensitive substring match).

| Match type | Action |
|-----------|--------|
| Company + Contact name both match | Definite duplicate. Show the existing row and ask: "I see prior outreach to {Company} via {Contact}. Update the existing entry, or log this as a new contact?" |
| Company matches, Contact is different | Different recruiter at same company. Log as new row with a note differentiating them. |
| No match | Proceed to Step 7. |

---

## Step 7 — Log Outreach

Tell the user: "Let me know when you've sent the connection note and I'll log it."

Log only after the user confirms they sent the message.

Append to `data/follow-ups.md` using this row format:

```
| {next #} | outreach | — | {Company} | {Role or "General AI/ML Recruiting"} | LinkedIn-Note | {Contact name or slug} | {YYYY-MM-DD} | Archetype: {archetype}. Proof point: {metric used}. |
```

If `data/follow-ups.md` header uses the old schema (columns: `# | Company | Role | Applied Date | ...`), rewrite the header to the new schema before appending:

```
| # | Type | App# | Company | Role | Channel | Contact | Date Sent | Notes |
|---|------|------|---------|------|---------|---------|-----------|-------|
```

Column semantics:
- `Type`: `outreach` (recruiter-find) or `follow-up` (followup mode)
- `App#`: application number from `applications.md`, or `—` if no application exists yet
- `Channel`: `LinkedIn-Note` (connection request), `LinkedIn-DM` (after connecting), `Email`
- `Contact`: recruiter's name or LinkedIn slug
- `Date Sent`: `YYYY-MM-DD`

---

## Rules

### NEVER
- Use "I'm passionate about", "I'm excited to", or "I'm eager to"
- Open with "I'm looking for a job" or "I'm job hunting"
- Include the phone number in any outreach message
- Include the resume link or portfolio URL in the 300-char connection note (no space for it)
- Output a note over 300 characters without flagging it as `[OVER LIMIT: N/300]`
- Hardcode proof point metrics — always read from `modes/_profile.md` and `config/profile.yml`
- Log outreach the user has not confirmed sending
- Scrape or navigate to LinkedIn profile URLs — generate search queries for the user to run instead

### ALWAYS
- Show character count `[N/300]` next to every connection note
- Include resume + portfolio offer in the follow-up message (Step 5D) and in Scenario C replies
- Read `modes/_profile.md` Adaptive Framing table before selecting any proof point
- Select exactly one primary proof point per connection note — one concrete number beats two claims
- Check `data/follow-ups.md` for duplicates before logging (Step 6)
- Output all pieces in one response: connection note + follow-up message + log confirmation prompt
- Show resources as raw URLs (not markdown hyperlinks) in message bodies — LinkedIn doesn't render them clickable
