# CV -- Sam Rivera

**Location:** Berlin, Germany (remote-friendly, EU timezones)
**Email:** sam@example.com
**LinkedIn:** linkedin.com/in/sam-rivera-example
**Portfolio:** sam-rivera.example.dev
**GitHub:** github.com/sam-rivera-example

## Professional Summary

Senior AI engineer **and** senior technical instructor -- a rare combination. 7 years shipping production AI systems (60K+ LOC in production at a knowledge-graph SaaS, real-time agent infrastructure handling 4M+ events/month) **and** 5,200+ hours teaching applied AI to working engineers (80+ careers launched into ML/AI roles, 92% course completion rate across 11 cohorts). Teaching keeps the engineering sharp; engineering keeps the teaching grounded. Comfortable owning either side or both.

## Recent Engineering (last 12 months)

- Shipped a multi-agent LangGraph orchestration layer for an internal agent platform: planner + executor + critic loop with HITL checkpoints. ~14K LOC TypeScript, deployed on Bun + Redis. Cut average task-completion latency 38%.
- Open-sourced `agent-skills-kit` (fictional example project): 2.4K GitHub stars, 11 contributors, used by ~120 weekly active developers.
- Wrote and merged 47 PRs in the last 12 months across two production codebases. Open to walking through any of them in interview.

## Work Experience

### Knowledge-Graph SaaS GmbH -- Berlin
**Senior AI Engineer / Team Lead**
2022-2026

- Owned the AI subsystem of a Neo4j-backed enterprise knowledge graph product (97K LOC across the AI layer at handover, ~60K of which I wrote or substantially refactored).
- Designed and shipped the embedding pipeline (chunker -> dedupe -> Azure OpenAI embed -> Chroma + Neo4j sync). Throughput went from ~50 docs/min to ~1,800 docs/min after a rewrite around batched async + connection pooling.
- Built the agent layer: LangChain + LangGraph, 12-factor agents pattern, Redis-backed checkpointer, observability via LangSmith. Handled 4M+ agent events/month at peak.
- Led a team of 3 engineers + 1 designer. Ran weekly architecture reviews and pair-programming sessions. Shipped on-call rotation and incident review playbook.
- Built the customer-facing eval dashboard: latency, cost-per-query, hallucination rate, retrieval precision/recall. Used in monthly customer business reviews.

### Applied AI Bootcamp -- Berlin (parallel role, same window)
**Lead Instructor, AI Engineering Track**
2022-2026

- Designed and delivered a 4-week immersive AI Engineering curriculum (Bun, TypeScript, LangChain, LangGraph, Redis, Neo4j, LangSmith, MCP, Anthropic SDK). Ran 6 cohorts. Average cohort size 14.
- Designed and delivered a 4-week immersive Applied Python for AI curriculum (Python, FastAPI, ChromaDB, Gradio, HuggingFace Transformers, wandb). Ran 5 cohorts.
- 5,200+ teaching hours total across both tracks (lecture + lab + 1:1 office hours).
- 80+ alumni placed into AI/ML engineering roles. Maintained the alumni outcomes spreadsheet personally.
- Course NPS: 71. Completion rate: 92% (industry average for intensive bootcamps is 60-75%).
- Built the assessment rubric and the capstone-week format adopted by the school across all technical tracks.

### Mid-stage AI Consultancy -- Remote
**ML Engineer**
2019-2022

- Delivered ~9 client engagements: NLP classification, recommender systems, and 2 early LLM prototypes (GPT-3 era).
- Built the internal eval harness adopted across the consultancy. Reduced "vibes-check" review cycles to a 20-minute structured CI run.
- Mentored 4 junior engineers. Two are now senior ICs at FAANG-tier companies. (This is when I discovered I liked teaching as much as building.)

### Mobile Games Studio -- Remote
**Backend Engineer**
2017-2019

- Built backend services for a live-ops mobile game: matchmaking, leaderboards, in-app purchase reconciliation. Python + Postgres + Redis.
- Wrote the internal SDK onboarding doc that cut new-hire ramp-up from 3 weeks to 8 days.

## Projects

- **`agent-skills-kit`** (fictional example, open source) -- TypeScript scaffolding for building agent skills with HITL approval gates. **2,400+ GitHub stars**, 11 contributors, ~120 weekly active devs. Featured in 2 community newsletters.
- **`pplx-embed-local-runner`** (fictional example, open source) -- Local runner for small open embedding models with a drop-in OpenAI-compatible API. **610 stars**, used in 3 of the bootcamp's lab exercises.
- **Curriculum: AI Engineering 4-Week Intensive** -- complete syllabus + 38 lecture scripts + 16 graded projects with BRONZE/SILVER/GOLD/DIAMOND difficulty tiers. Used by 6 cohorts; written entirely by me.

## Education

- BSc Computer Science, TU Example (2017)
- Self-directed: Andrew Ng MLOps specialization, fast.ai Part 1+2, hand-rolled implementations of attention + RAG from scratch.

## Speaking and Writing

- "Why your bootcamp's LLM module is wrong" -- BerlinML meetup, 2025. ~120 attendees.
- "Production agents, the boring parts" -- internal talk at 2 partner companies.
- ~12 long-form blog posts on agent architecture, eval design, and teaching technical material to working engineers.

## Skills

### Engineering
- **Languages:** TypeScript, Python, Go (read-comfortable), SQL
- **AI/ML:** LangChain, LangGraph, Anthropic Claude SDK, HuggingFace Transformers/Trainer, scikit-learn, PyTorch (basics), MCP
- **Infra:** Bun, Node.js, FastAPI, Gradio, Redis, Neo4j, ChromaDB, Postgres, Docker, GitHub Actions
- **Observability:** LangSmith, Grafana, custom eval dashboards, wandb

### Teaching
- **Curriculum design:** Bronze/Silver/Gold/Diamond difficulty tiering, capstone formats, lab/lecture split
- **Delivery:** Lecture, hands-on lab, 1:1 office hours, code review at scale, pair programming
- **Audience:** Working engineers (career-changers), university CS students, internal team enablement
- **Assessment:** Rubrics, capstone projects, portfolio review, mock-interview design

### Cross-cutting
- Public speaking (German + English), technical writing, hiring loop design, mentorship.
