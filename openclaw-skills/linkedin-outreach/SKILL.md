---
name: linkedin-outreach
description: Generate tailored LinkedIn outreach messages for job applications. Use when asked to write LinkedIn connection requests, reach out to recruiters/hiring managers/peers, or prepare pre-interview messages. Triggers on "linkedin message", "outreach", "connection request", "contact recruiter", "reach out to hiring manager".
---

# LinkedIn Outreach

Generate tailored LinkedIn connection messages based on contact type and company research. 3-sentence framework, max 300 characters.

## Contact Types

### Recruiter (Talent Acquisition / Sourcing)

| Sentence | Purpose | Content |
|----------|---------|---------|
| 1 — Fit | Direct match criteria | Role, relevant experience, availability or location |
| 2 — Proof | Pre-answer screening questions | Quantified credential |
| 3 — CTA | Low-commitment ask | "Happy to share my CV if this aligns with what you're looking for" |

### Hiring Manager (Team Lead)

| Sentence | Purpose | Content |
|----------|---------|---------|
| 1 — Hook | Specific team challenge | From JD, company blog, or recent news |
| 2 — Proof | Quantified achievement | Solving similar problem |
| 3 — CTA | Genuine interest ask | "Would love to hear how your team is approaching [challenge]" |

### Peer (Referral — Indirect)

| Sentence | Purpose | Content |
|----------|---------|---------|
| 1 — Interest | Genuine reference to their work | Blog post, talk, project, publication |
| 2 — Connection | Shared context (NOT a job pitch) | Your work in the same space |
| 3 — CTA | Conversation opener | "I've been working on similar problems, would love to hear your take on [topic]" |

**Critical:** Never ask for a job directly.

### Interviewer (Pre-Interview)

| Sentence | Purpose | Content |
|----------|---------|---------|
| 1 — Research | Specific reference to their work | Genuine, not generic |
| 2 — Context | Light connection to your experience | In that domain |
| 3 — CTA | Friendly close | "Looking forward to our conversation on [date]" |

**Tone:** Light, prepared, not desperate.

## Workflow

1. **Research targets** using web search: hiring manager, recruiter, peers, interviewer
2. **Classify contact type** from role/title
3. **Research company** for specific hooks (blog posts, news, team challenges)
4. **Generate message** using the 3-sentence framework
5. **Provide alternatives** with justification

## Message Rules

- **Max 300 characters** (LinkedIn connection request limit)
- No corporate-speak ("passionate about", "results-oriented", "synergy")
- Write something that makes them want to reply
- **Never share phone number**
- All output in **English**
- Contact type changes **emphasis**, not structure

## Reference Data

- Candidate profile: `cv.md` in project root (proof points for Sentence 2)
- Application context: `applications.md` for company/role details
