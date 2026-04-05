# Modo: contacto — LinkedIn Power Move

## Step 0 — Load evaluation context

**Before generating any message, check for an existing evaluation report.**

1. Identify the company + role (from user input, current conversation, or most recent evaluation)
2. Search `reports/` for a matching report (Grep case-insensitive by company name)
3. If a report exists, read it and extract:
   - **Archetype** detected (Step 0 of evaluation)
   - **Top 3 proof points** from Block B (the JD requirements where CV match was strongest)
   - **Score** and key gaps from Block B
   - **STAR stories** from Block F that are most relevant
   - **Case study** recommended in Block F
4. Also read `data/applications.md` to check current status of this application
5. If NO report exists, inform the user and offer to run an evaluation first — or proceed with cv.md only

This context is what makes the outreach message specific instead of generic.

## Step 1 — Identify targets

Use WebSearch to find:
- Hiring manager of the team
- Recruiter assigned to the role
- 2-3 peers on the team (people in a similar role)

## Step 2 — Select primary target

Choose the person who would most benefit from the candidate joining. Typically:
- For IC roles: the hiring manager or tech lead
- For leadership roles: a peer or the person the role reports to
- Avoid cold-messaging the recruiter first unless no other option — a warm intro from a team member is stronger

## Step 3 — Generate message

**The message must draw from the evaluation report, not generic claims.**

Framework (3 sentences, max 300 characters for LinkedIn connection request):

- **Sentence 1 (Hook)**: Something specific about their company or current challenge with AI — NOT generic. If the report's Block A identified the domain and function, reference it.
- **Sentence 2 (Proof)**: The single strongest proof point from Block B's top matches. Use the exact framing that scored highest against the JD. If article-digest.md has a quantified metric for this proof point, use it.
- **Sentence 3 (Proposal)**: Quick chat, no pressure — "Would love to chat about [specific topic from the JD] for 15 min"

**Archetype-adapted framing** (from the report):
- If FDE → emphasize fast delivery, client-facing results
- If SA → emphasize system design, integration wins
- If PM → emphasize product discovery, stakeholder outcomes
- If LLMOps → emphasize production metrics, evals, observability
- If Agentic → emphasize orchestration, reliability, HITL
- If Transformation → emphasize adoption, change management, org impact

## Step 4 — Versions

Generate:
- EN (default)
- ES (if the company or target is Spanish-speaking)
- **Follow-up variant**: A longer version (2-3 sentences) for LinkedIn InMail or email, where the 300-char limit doesn't apply. This version can include a second proof point and a link to the relevant case study from Block F.

## Step 5 — Alternative targets

List 2-3 backup contacts with justification for why they're good second choices.

## Message rules

- Max 300 characters for connection request version
- NO corporate-speak
- NO "I'm passionate about..."
- Something that makes them want to respond
- NEVER share phone number
- **Every claim must trace back to cv.md or article-digest.md** — no invented metrics
