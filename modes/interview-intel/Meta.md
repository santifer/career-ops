# Meta Interview Intelligence

## Overview

Meta interviews are execution-focused and move faster than most FAANG companies. The process is highly structured, with interviewers submitting numerical scores per category. Those scores do two things: filter candidates and calibrate their level. So if you're aiming for E6, your stories need to reflect E6 scope, not just E5 quality work.

AI and ML roles (FAIR, GenAI, Meta AI) add real ML depth on top of the standard loop.

> Verify: Process details change. Confirm the current format with your recruiter before the first call.

---

## Stages

| Stage | Format | Typical Duration |
|-------|--------|-----------------|
| Recruiter screen | 30 min phone call | 3-5 days to schedule |
| Technical phone screen x 1 | 45-60 min, coding in a shared IDE | Within 2 weeks |
| Virtual on-site | 4-5 rounds x 45 min each | Scheduled as a full day |
| Hiring committee review | Internal, candidate not present | 1-2 weeks |
| Offer | Written, negotiation window | 1 week post-committee |

### On-site round breakdown (SWE or ML Engineer, E4-E6)

- **Coding x 2** -- algorithms and data structures
- **System design x 1** -- large-scale distributed systems or ML infrastructure
- **Behavioral x 1** -- leadership, collaboration, Meta values
- **ML design x 1** (ML roles only) -- modeling, evaluation, production ML

---

## Typical Questions

### Behavioral

- "Tell me about a time you had a significant impact on a product or system."
- "Describe a situation where you had to work through conflict with a teammate."
- "Give an example of when you pushed back on a direction. What was the outcome?"
- "How do you prioritize when you have more work than time?"
- "Tell me about a time you failed. What did you learn?"

### ML / Applied AI

- "How would you build a content ranking model for a social feed at scale?"
- "Walk me through how you'd handle concept drift in a production recommendation system."
- "Design an experiment to measure the impact of a new ML model on user engagement."
- "How do you balance precision and recall in a content moderation classifier?"
- "What are the tradeoffs between model size and serving latency at Meta's scale?"

### System Design

- "Design Facebook's News Feed ranking and delivery pipeline."
- "Design a real-time messaging system like WhatsApp for 1B+ users."
- "Design a distributed event stream processor for clickstream data."
- "Design a feature store for a large-scale ML platform."

---

## Coding Tasks

Expect LeetCode medium to hard. Two problems in 45 minutes is common:

- Graph problems: BFS, DFS, shortest path, connected components
- Dynamic programming on sequences or grids
- Tree traversal and manipulation
- Interval merging and scheduling
- Hash map and frequency counting patterns
- Binary search on answer

Python, Java, C++, or JavaScript are all accepted. Python is most common. Write clean, readable code. Your interviewer will penalize unnecessary complexity.

Meta frequently wraps classic problems in custom packaging. "LRU cache with expiry" instead of plain LRU, for example. Practice recognizing the underlying pattern behind a custom problem description.

---

## Cultural & Technical Signals

| Signal | What they're looking for |
|--------|--------------------------|
| **Impact orientation** | Everything is framed around impact. "Increased DAU by 12%" beats "improved the system." Quantify outcomes in every behavioral story. |
| **Execution speed** | Meta rewards people who ship. Show you can move from idea to production without sacrificing quality. |
| **Data fluency** | Strong ML candidates talk in metrics, experiments, and statistical significance, not just model architectures. |
| **Ownership mentality** | "I designed, built, launched, and monitored" beats "I contributed to." |
| **Low-ego collaboration** | Meta values directness without politics. Disagree and commit. You don't need credit to contribute. |
| **Scale instinct** | Designs that ignore Meta's actual scale (billions of users, petabytes per day) score low automatically. |

---

## Pro Tips

1. **Every behavioral story needs a number at the end.** "The system became faster" doesn't land. "Latency dropped from 800ms to 120ms, reducing drop-off by 14%" does.
2. **Understand the four scoring dimensions.** Coding, system design, behavioral, and culture fit are all scored independently. Prepare for all four equally, not just the one you're comfortable with.
3. **For ML roles, know A/B testing deeply.** Meta runs thousands of experiments simultaneously. Type I and II errors, sample size calculation, novelty effects, holdout sets: all fair game.
4. **Your E-level matters.** If you think you're operating at E6, make sure your stories reflect staff-level impact: cross-team, multi-quarter, high ambiguity.
5. **Compensation is negotiable.** Base, RSU, and signing are all movable. Levels.fyi has accurate band data. A competing offer from another top company is your strongest lever.
6. **Ask about org stability.** Meta has restructured significantly across Reality Labs and AI orgs. It's not a red flag to ask which bets the team is on and how headcount decisions get made.

---

*Sources: public Glassdoor reviews, Blind threads, Meta engineering blog, open candidate write-ups. Verify current process with your recruiter.*
