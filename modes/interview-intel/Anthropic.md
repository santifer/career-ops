# Anthropic Interview Intelligence

## Overview

Anthropic's interview process is deliberately different from the standard FAANG playbook. The focus is on safety-conscious thinking, genuine intellectual depth, and your ability to hold complexity without collapsing it. If you're used to grinding LeetCode and calling it prep, you'll be underprepared here. The team wants to see how you reason, not just what you know.

The process also includes an async writing component, which signals something real about the culture: they communicate in writing, they value clarity, and they expect you to as well.

> Verify: Process details change. Confirm the current format with your recruiter before the first call.

---

## Stages

| Stage | Format | Typical Duration |
|-------|--------|-----------------|
| Recruiter screen | 30 min phone call | Within 1 week |
| Hiring manager call | 45-60 min, background and scope discussion | Within 1-2 weeks |
| Written exercise (some roles) | Async, 1-3 hours at home | 1 week window |
| Technical screen | 60-90 min, coding or ML depth | Within 2 weeks |
| Virtual on-site | 4-5 rounds x 60 min each | Scheduled as a block |
| Reference checks and offer | Thorough references, then written offer | 1-2 weeks post on-site |

### On-site round breakdown (Research Engineer or Applied Engineer)

- **Coding x 1-2** -- problem solving, clean code over raw speed
- **ML depth x 1** -- model internals, RLHF, Constitutional AI, evaluation design
- **System design x 1** -- ML infrastructure or research tooling at scale
- **Behavioral and values x 1** -- safety thinking, intellectual humility, collaboration
- **Research discussion x 1** -- often a paper review or a walkthrough of your own work

---

## Typical Questions

### Behavioral

- "Why Anthropic specifically? What's your view on the approach we're taking?"
- "Tell me about a time you identified a risk in a project that others hadn't considered."
- "Describe a situation where you had to change your mind about something important."
- "How do you handle being wrong in public?"
- "What's the hardest ethical or technical tradeoff you've faced in your work?"

### ML / Applied AI

- "How does Constitutional AI differ from standard RLHF? What does it get right and where does it fall short?"
- "Design an evaluation suite for a model that needs to be both helpful and safe."
- "How would you measure whether a model is genuinely uncertain vs. confidently wrong?"
- "Walk me through how you'd red-team a new model capability before shipping."
- "What's your intuition for why scaling continues to work, and where do you think it breaks?"

### System Design

- "Design a real-time model evaluation pipeline that can run thousands of prompts per day."
- "Design a human feedback collection system that resists rater bias and gaming."
- "Design a research infrastructure that lets 50 researchers run experiments without stepping on each other."

---

## Coding Tasks

The coding bar here is real but not FAANG-competitive-programmer-hard. What they care about most:

- Writing clean, readable code. Not clever code.
- Handling edge cases explicitly.
- Being able to reason about complexity and tradeoffs out loud.
- Python fluency. NumPy and PyTorch comfort helps for ML roles.

Common problem types: graph or tree manipulation, string processing, simulation problems, implementing ML components (attention, simple backprop) from scratch.

---

## Cultural & Technical Signals

| Signal | What they're looking for |
|--------|--------------------------|
| **Safety-first thinking** | Not as a buzzword. As a real lens you apply to technical decisions. If you've never thought about what happens when your model is wrong in a high-stakes context, it will show. |
| **Intellectual honesty** | Saying "I'm not sure" and then reasoning carefully is valued. Confident answers to questions you don't actually understand are not. |
| **Writing quality** | Anthropic communicates in documents. Your written exercise and how you talk through problems in the interview both matter. |
| **Curiosity over credentials** | What have you actually read, built, or thought about? Breadth of genuine curiosity beats an impressive CV with shallow depth. |
| **Collaborative disagreement** | You should be able to push back thoughtfully without it feeling like a conflict. |
| **Mission fit** | They're not looking for "excited about AI." They want people who've genuinely grappled with what safe, beneficial AI means in practice. |

---

## Pro Tips

1. **Take the writing exercise seriously.** Treat it like a first-day deliverable, not a box to check. Clarity, structure, and depth all count. Many candidates underinvest here.
2. **Read the Anthropic research blog and Constitutional AI paper.** Not to recite them, but to have an actual opinion on them. "I agree with your approach to X but I think Y is an open problem" is a great conversation starter.
3. **Prepare a real answer to "why Anthropic."** The bar here is high. "I believe in the mission" is not enough. Show you understand the specific bets Anthropic is making and why you think they're right.
4. **Compensation is competitive.** Anthropic has raised significant capital. Base and equity are in the FAANG range for senior roles. Signing bonus has the most flexibility.
5. **The process is slower than it looks.** Scheduling async exercises plus multiple rounds takes time. Follow up politely if you don't hear back after a week at each stage.
6. **Ask about the team's current research agenda.** Not just what they published last year. What are they working on now? What's the hardest open problem? The answer tells you a lot about what you'd actually be doing.

---

*Sources: public Glassdoor reviews, Blind threads, Anthropic research blog, open candidate write-ups. Verify current process with your recruiter.*
