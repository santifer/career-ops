# CV -- Sam Rivera

**Location:** Berlin, Germany (remote-friendly, EU timezones)
**Email:** sam@example.com
**LinkedIn:** linkedin.com/in/sam-rivera-example
**Portfolio:** sam-rivera.example.dev
**GitHub:** github.com/sam-rivera-example

## Professional Summary

Two jobs at once for the last four years: senior AI engineer at a knowledge-graph SaaS (60K LOC of the AI subsystem, agent infra handling 4M+ events/month), and lead instructor at an applied AI bootcamp (5,200 teaching hours, 80 alumni placed into ML/AI roles, 92% completion across 11 cohorts). I keep doing both because the bootcamp work forces me to write code people can actually read, and the production work keeps the curriculum from becoming a fairy tale. I will take a role that is mostly engineering, mostly teaching, or both.

## Recent engineering (last 12 months)

- Wrote a planner / executor / critic loop on top of LangGraph for the internal agent platform. HITL checkpoints, Redis-backed checkpointer, ~14K LOC TypeScript on Bun. Average task-completion latency went from 9.2s to 5.7s after the executor stopped re-running the planner on retries (this was the bug that cost me a weekend).
- `agent-skills-kit` (fictional example) is the open source spinoff of the same loop. 2.4K stars, 11 outside contributors. I mostly maintain it on Sundays.
- 47 merged PRs across two production codebases in the last year. Happy to walk through any of them in an interview, including the ones I would write differently now.

## Work Experience

### Knowledge-Graph SaaS GmbH -- Berlin
**Senior AI Engineer / Team Lead**
2022-2026

- Owned the AI subsystem of a Neo4j-backed enterprise knowledge graph product. The AI layer was 97K LOC at handover; I wrote or rewrote around 60K of that.
- Embedding pipeline: chunker, dedupe, Azure OpenAI embed, Chroma + Neo4j sync. Throughput was ~50 docs/min when I picked it up. After I rewrote it around batched async and a real connection pool, it sat at 1,800 docs/min in production. The bottleneck the whole time was a single sync HTTP client nobody had thought to look at.
- Built the agent layer with LangChain and LangGraph using the 12-factor agents pattern. Redis-backed checkpointer, observability through LangSmith. 4M+ agent events/month at peak.
- Ran a team of three engineers and one designer. Weekly architecture review, pair programming on Tuesdays, an on-call rotation that went from "we don't have one" to a 30-minute response SLO with a written playbook.
- Built the customer-facing eval dashboard: latency, cost-per-query, hallucination rate, retrieval precision and recall. We walked through it with customers in their monthly business reviews.

### Applied AI Bootcamp -- Berlin (parallel role, same window)
**Lead Instructor, AI Engineering Track**
2022-2026

- Wrote and ran a 4-week AI Engineering curriculum: Bun, TypeScript, LangChain, LangGraph, Redis, Neo4j, LangSmith, MCP, Anthropic SDK. Six cohorts, average size 14.
- Wrote and ran a 4-week Applied Python for AI curriculum: Python, FastAPI, ChromaDB, Gradio, HuggingFace Transformers, wandb. Five cohorts.
- 5,200 teaching hours total across both tracks (lecture + lab + 1:1 office hours). I keep a real spreadsheet, not a vibes count.
- 80 alumni placed into AI/ML engineering roles so far. I personally maintain the outcomes tracker because the school does not.
- NPS 71. Completion rate 92%, against an industry baseline of 60-75% for intensive bootcamps.
- Wrote the assessment rubric and the capstone-week format the school later adopted across all technical tracks. I lost an argument about timeboxing the capstone and was right two cohorts later.

### Mid-stage AI Consultancy -- Remote
**ML Engineer**
2019-2022

- Nine client engagements: NLP classification, two recommender systems, and two early LLM prototypes back when GPT-3 was the only game in town.
- Wrote the internal eval harness the rest of the consultancy adopted. Cut "vibes-check" review cycles down to a 20-minute structured CI run.
- Mentored four junior engineers. Two are now senior ICs at FAANG-tier companies. This is the job where I figured out I liked teaching as much as building.

### Mobile Games Studio -- Remote
**Backend Engineer**
2017-2019

- Backend services for a live-ops mobile game: matchmaking, leaderboards, IAP reconciliation. Python, Postgres, Redis.
- Rewrote the internal SDK onboarding doc. New-hire ramp-up went from three weeks to eight days. The old doc had a 14-step setup that nobody on the current team had actually run end-to-end.

## Projects

- `agent-skills-kit` (fictional example, open source) -- TypeScript scaffolding for agent skills with HITL approval gates. 2.4K GitHub stars, 11 outside contributors, ~120 weekly active developers. Newsletter mentions in TLDR AI and Ben's Bites.
- `pplx-embed-local-runner` (fictional example, open source) -- a small local runner for open embedding models with a drop-in OpenAI-compatible API. 610 stars. Three of the bootcamp lab exercises run against it instead of paid APIs.
- AI Engineering 4-Week Intensive -- the full curriculum: syllabus, 38 lecture scripts, 16 graded projects on Bronze / Silver / Gold / Diamond difficulty tiers. Used in six cohorts. Written by me, debugged by the students.

## Education

- BSc Computer Science, TU Example (2017)
- Self-directed: Andrew Ng MLOps specialization, fast.ai Part 1+2, hand-rolled implementations of attention + RAG from scratch.

## Speaking and writing

- "Why your bootcamp's LLM module is wrong" -- BerlinML meetup, 2025. ~120 in the room.
- "Production agents, the boring parts" -- internal talk at two partner companies. The boring parts are timeouts and idempotency.
- About 12 long-form blog posts on agent architecture, eval design, and teaching technical material to working engineers. The eval-design one is the only one I'd link unprompted.

## Skills

Engineering: TypeScript, Python (daily), Go (I can read it and write small things), SQL. LangChain, LangGraph, Anthropic SDK, HuggingFace Transformers/Trainer, scikit-learn, PyTorch (basics, not research-level), MCP. Bun, Node.js, FastAPI, Gradio, Redis, Neo4j, ChromaDB, Postgres, Docker, GitHub Actions. LangSmith, Grafana, custom eval dashboards, wandb.

Teaching: curriculum design with Bronze/Silver/Gold/Diamond difficulty tiering, capstone formats, lab vs lecture split. Delivery: lecture, hands-on lab, 1:1 office hours, code review at scale, pair programming. I have taught working engineers (career-changers), university CS students, and internal teams. Assessment work: rubrics, capstone projects, portfolio review, mock-interview design.

Other: public speaking in German and English, technical writing, hiring loop design, mentorship.
