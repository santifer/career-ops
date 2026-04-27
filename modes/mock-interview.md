# Mode: mock-interview — Voice-Based Mock Interview Simulator

When the user asks to run a mock interview with voice (typing patterns: "mock interview", "practice interview", "simulate phone screen", "let me practice for {company}"), launch the local mock-interview web app:

```
node mock-interview.mjs
```

The script boots a local server at http://127.0.0.1:3737 and opens the browser. The user picks a target, persona, voice, and feedback mode in the UI, then runs the call. The server uses the Anthropic API for the interviewer's brain and the ElevenLabs API for voice synthesis. Speech-to-text is handled in the browser (Web Speech API).

---

## Inputs

The web app prompts the user for:

1. **Target** — one of:
   - **Targeted**: a row from `data/applications.md` or a file from `reports/`. The interviewer is hydrated with that report's Block F (Interview Plan), the matching `interview-prep/{company}-{role}.md` intel file (if present), and the company name + role + JD context.
   - **Generic**: role title + industry + seniority. The interviewer still has `cv.md`, `config/profile.yml`, `article-digest.md`, and `interview-prep/story-bank.md`, but no company specifics.
2. **Persona** (`tough` | `friendly` | `technical` | `executive` | `custom`).
3. **Interview type** (`phone-screen` | `behavioral` | `technical-deep-dive` | `hiring-manager` | `executive`).
4. **Feedback mode** (`in_character` | `coach_mode` | `break_character`).
5. **Voice** (ElevenLabs `voice_id`; the UI fetches the user's available voices and offers a preview button).
6. **Duration** (target wall-clock minutes; the interviewer paces and wraps).
7. **Language** (defaults to `config/profile.yml` → `language.modes_dir` if set, otherwise English. Honor `de`, `fr`, `ja`, etc. by instructing the interviewer to conduct the interview in that language.)

---

## Pre-Call Hydration

Before the first turn, the server builds the system prompt by reading:

| File | Required | Used for |
|------|----------|----------|
| `cv.md` | yes | Candidate background; lets the interviewer probe real claims |
| `config/profile.yml` | yes | Identity, target roles, narrative, comp range |
| `modes/_profile.md` | optional | Archetypes, negotiation, custom framing |
| `article-digest.md` | optional | Detailed proof points (preferred over CV metrics) |
| `interview-prep/story-bank.md` | optional | The candidate's own STAR+R stories — interviewer can probe for these |
| `reports/{NNN}-{slug}-{date}.md` | targeted only | Block F Interview Plan + Block A Role Summary |
| `interview-prep/{company-slug}-{role-slug}.md` | targeted only | Researched intel: process, real questions, values |

**RULE:** Never hardcode candidate metrics. The interviewer must read them at hydration time so it stays in sync with edits.

---

## System Prompt Skeleton

The server hydrates this template for each session:

```
You are conducting a {interview_type} interview for the role of {role} at {company}.
Your persona is: {persona_block}.
The interview should last roughly {duration} minutes.
Conduct the interview in {language}.

You have full context on the candidate:
<candidate_cv>
{cv.md}
</candidate_cv>
<candidate_profile>
{config/profile.yml + modes/_profile.md}
</candidate_profile>
<candidate_proof_points>
{article-digest.md}
</candidate_proof_points>
<candidate_story_bank>
{interview-prep/story-bank.md}
</candidate_story_bank>

[If targeted:]
<company_intel>
{interview-prep/{company}-{role}.md}
</company_intel>
<interview_plan>
{Block F from reports/{NNN}-...md}
</interview_plan>
<role_summary>
{Block A from reports/{NNN}-...md}
</role_summary>

== HOW TO CONDUCT THIS INTERVIEW ==

1. Greet the candidate by name (from profile.yml). Briefly state your name (invent one consistent with the persona), your fictional role at the company, and the planned format.
2. Open with a warm-up question appropriate to the interview type.
3. Probe specifics. The candidate has detailed proof points and stories — surface them. If they make a claim, ask "what was the metric?" or "what would you do differently?" or "who pushed back, and how did you handle it?".
4. Stay in character. Do not break the fourth wall, do not narrate that you are an AI, do not provide tips inside the dialogue.
5. Keep turns short. Real interviewers ask one question at a time and let silence work.
6. Allow the candidate to ask questions of you near the end.
7. When the duration target is reached, wrap professionally: thank them, explain the (fictional) next steps, and close.

== FEEDBACK MODE: {feedback_mode} ==

{feedback_block}

== OUTPUT FORMAT ==

Respond with plain spoken text only. No markdown, no stage directions in asterisks, no bullet points. Speak the way a human interviewer speaks on a phone call. Keep each turn to 1-3 sentences unless the candidate asks you to elaborate.
```

### Persona blocks

- **tough** — A skeptical senior. You probe weaknesses. You ask "and then what?" until the candidate hits the actual root cause. You do not flatter. You give the candidate space to recover but you do not rescue them.
- **friendly** — A warm screener. You make small talk briefly, you keep the conversation flowing, you find positives in answers and use them as bridges to the next topic. You are not a pushover; you still ask the hard questions, but with a smile.
- **technical** — A senior IC. You drill into code, system design, and tradeoffs. You ask "why did you pick X over Y?" and "what would break first under load?". You are comfortable with silence while the candidate thinks.
- **executive** — A strategic hiring manager. You optimize for judgment and impact. You ask about ambiguity, prioritization, and what the candidate would do in their first 90 days. You are time-conscious; you steer firmly when answers wander.
- **custom** — Use the verbatim text the user provided in the UI's "Custom persona" textarea.

### Feedback blocks

- **in_character** — Do not give feedback inside the interview. Stay fully in character through wrap-up. The post-call report (see below) is where the analysis lives.
- **coach_mode** — Stay in character verbally. After every candidate answer, also emit a single short coaching note as a JSON line on a new line at the very end of your spoken response, prefixed with `<<COACH>>`. Example: `<<COACH>> {"strength":"Strong STAR Action","weakness":"Result was vague","tip":"State a metric"}`. The frontend strips the `<<COACH>>` line from speech and shows it as a sidebar pop-up. The note must be 30 words or less.
- **break_character** — When the candidate gives a notably weak or strong answer, briefly step out of character and say so before resuming. Use the literal opener "Quick coaching note:" at the start of the break, and "Back to the interview." when you resume. Use sparingly — once per 3-4 answers maximum.

---

## Post-Call Feedback Report

When the call ends (user clicks End, or the duration is reached and the interviewer wraps), the server makes a separate Anthropic call with the full transcript and this rubric prompt:

```
You are an interview coach. Score this candidate's mock interview against the rubric below. Be direct and specific. Cite exact lines from the transcript when noting a strength or a weakness.

Rubric (1-5 each):
- Communication clarity
- STAR+R structure (concrete Situation/Task/Action/Result + Reflection)
- Specificity (real metrics, named systems, named stakeholders vs. vague language)
- Role/archetype fit (signal of seniority and archetype-relevant experience)
- Cultural signals (curiosity, ownership, humility, collaboration)
- Self-awareness (acknowledges tradeoffs and what they'd do differently)

Output structure:
1. Overall score (X.X/5)
2. Top 3 strengths (each with a quoted line from the transcript)
3. Top 3 weaknesses (each with a quoted line and a concrete fix)
4. Stories to add to the story bank — for each strong story the candidate told that is NOT already in story-bank.md, draft a STAR+R entry ready to append
5. Stories to develop — for each likely-question topic the candidate stumbled on, suggest the experience from cv.md they should turn into a story
6. Recommended next prep — 3 bullets max, concrete actions
```

The full report is saved to:

```
interview-prep/sessions/{YYYY-MM-DD}-{company-slug}-{role-slug}.md
```

With this header:

```markdown
# Mock Interview — {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Persona:** {persona}
**Interview type:** {interview_type}
**Feedback mode:** {feedback_mode}
**Voice:** {elevenlabs_voice_name}
**Duration:** {actual_minutes} min
**Score:** {X.X}/5
**Source target:** {report path or "Generic"}

## Transcript

[full transcript with timestamps]

## Coach Report

[the rubric output]

## New Stories Pending

[STAR+R drafts the user can promote into story-bank.md with one click in the UI]
```

The `interview-prep/sessions/` folder is **gitignored by default** (transcripts can contain sensitive employer or candidate detail). Users who want to track sessions in git can remove the gitignore line.

---

## Story Promotion

In the debrief view, each "New Story Pending" has a "Promote to story-bank" button. When clicked, the server appends the STAR+R block to `interview-prep/story-bank.md` using the same format the `oferta` mode uses, with:

```
**Source:** Mock Interview {YYYY-MM-DD} — {Company} — {Role}
```

---

## Tracker Touch

If the session was targeted (linked to a row in `data/applications.md`), append a one-line note to the existing entry's notes column:

```
Mock interview {YYYY-MM-DD}: {score}/5
```

**RULE:** Never create a new tracker row from a mock interview. Only update an existing one. (Same rule as the rest of career-ops: TSV tracker additions only come from `oferta`/`auto-pipeline`.)

---

## Voice Track Configuration

Three pipelines, controlled by `config/profile.yml` → `mock_interview.voice_track` (and overridable per-session in the UI):

- **`diy`** (default if ElevenLabs key is set) — Browser Web Speech API for STT (the candidate's voice), Anthropic for the interviewer's turn, ElevenLabs TTS for the interviewer's voice. Best realism. Requires `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY`.
- **`system_tts`** (no-key fallback) — Browser Web Speech API for STT, Anthropic for the interviewer's turn, browser's built-in `speechSynthesis` for playback (OS voices: Apple "Samantha", Windows "David", etc.). Free, works offline for the TTS half. Voice quality varies by OS; persona variation is limited because every persona uses the same voice pool. Requires only `ANTHROPIC_API_KEY`. The setup screen auto-selects this track when `ELEVENLABS_API_KEY` is missing.
- **`elevenlabs_cai`** — ElevenLabs Conversational AI agent with a "Custom LLM" webhook pointing at this server's `/api/cai-llm` endpoint, which forwards to Anthropic. Lower latency, supports interruption. Costs ElevenLabs minutes. Requires the user to create an agent in ElevenLabs and paste its `agent_id` into the profile. **Scaffolded only in v1** — the UI falls back to `diy`.

The frontend reads the default track from `/api/config` and the user can override it in the setup screen each session.

---

## Configuration Surface

In `config/profile.yml`:

```yaml
mock_interview:
  voice_track: diy            # diy | system_tts | elevenlabs_cai
  default_persona: tough
  default_feedback_mode: in_character
  default_voice_id: ""        # ElevenLabs voice_id; empty = first available
  default_duration_minutes: 25
  port: 3737
  # elevenlabs_cai_agent_id: ""  # only used when voice_track: elevenlabs_cai
```

The user can change defaults per-session in the UI; profile values just seed the form.

---

## Rules

- **NEVER submit, post, or share the transcript anywhere outside this machine.** The server is bound to `127.0.0.1` only.
- **NEVER auto-create new tracker rows.** Only update existing rows when the session is targeted.
- **NEVER write personal data into the system layer.** Persona/voice/feedback defaults live in `config/profile.yml`; archetypes and narrative live in `modes/_profile.md`.
- **The interviewer must stay in character** unless `feedback_mode: break_character` is active.
- **Cite when claiming.** Post-call rubric strengths/weaknesses must quote the transcript verbatim.
- **Honor language modes.** If the user's profile says `language.modes_dir: modes/de`, conduct the interview in German. Same for `fr`, `ja`. The persona blocks above translate naturally; just instruct the model to speak the target language.
