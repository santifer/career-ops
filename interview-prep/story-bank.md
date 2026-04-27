# Story Bank — Master STAR+R Stories

This file accumulates your best interview stories over time. Each evaluation (Block F) adds new stories here. Instead of memorizing 100 answers, maintain 5-10 deep stories that you can bend to answer almost any behavioral question.

## How it works

1. Every time `/career-ops oferta` generates Block F (Interview Plan), new STAR+R stories get appended here
2. Before your next interview, review this file — your stories are already organized by theme
3. The "Big Three" questions can be answered with stories from this bank:
   - "Tell me about yourself" → combine 2-3 stories into a narrative
   - "Tell me about your most impactful project" → pick your highest-impact story
   - "Tell me about a conflict you resolved" → find a story with a Reflection

## Stories

<!-- Stories will be added here as you evaluate offers -->
<!-- Format:
### [Theme] Story Title
**Source:** Report #NNN — Company — Role
**S (Situation):** ...
**T (Task):** ...
**A (Action):** ...
**R (Result):** ...
**Reflection:** What I learned / what I'd do differently
**Best for questions about:** [list of question types this story answers]
-->

### [ML + Scale] Fraud Detection ML Service
**Source:** Report #001 — Google WSE II, gTech Ads
**S:** Intuit needed real-time fraud detection on financial transactions — no existing ML service existed.
**T:** Design, build, and deploy a production ML service from scratch, processing 10K+ transactions daily.
**A:** FastAPI backend + scikit-learn + pandas models, containerized with Docker, deployed on AWS. Integrated into existing transaction pipeline.
**R:** 25% improvement in fraudulent pattern detection accuracy; 10K+ transactions/day processed reliably.
**Reflection:** Would have added model drift monitoring from day 1. Added it reactively after noticing accuracy degradation in production — now design for observability upfront.
**Best for questions about:** end-to-end ownership, ML in production, large-scale data, technical complexity, full-stack

---

### [Internal Tooling + Cross-functional] Customer Onboarding Platform
**Source:** Report #001 — Google WSE II, gTech Ads
**S:** Intuit's underwriting team was manually processing financial applications — 40% of their time wasted on data entry.
**T:** Build a platform to streamline application processing and automate data ingestion.
**A:** Python FastAPI backend + React.js frontend, integrated with existing data ingestion pipeline. Iterated with underwriting team on requirements before and during development.
**R:** 40% reduction in manual entry time for the underwriting team.
**Reflection:** Would have involved UX research with end users before writing UI code — iterated on the interface twice based on late feedback.
**Best for questions about:** internal tooling, cross-functional collaboration, user-facing systems, operational efficiency

---

### [Legacy Modernization + Scale] Microservices Migration (Assurant)
**Source:** Report #001 — Google WSE II, gTech Ads
**S:** Assurant's core application was a legacy monolith causing deployment bottlenecks and slow release cycles.
**T:** Design and build 15+ microservices to replace the monolith without disrupting production.
**A:** Java/Spring Boot + Docker + Kubernetes; incremental migration strategy to avoid downtime during cutover.
**R:** 40% improvement in deployment frequency; clean separation enabling parallel team development.
**Reflection:** Would have written more integration tests before the migration — added them reactively after catching edge cases in staging.
**Best for questions about:** system design, legacy modernization, microservices, reliability, large-scale refactoring

---

### [Data Visualization + Stakeholders] Analytics Dashboard (Intuit)
**Source:** Report #001 — Google WSE II, gTech Ads
**S:** Senior financial analysts couldn't visualize portfolio risk metrics in real-time — decisions delayed by slow reporting.
**T:** Build a dashboard that enables 50% faster data-driven decisions.
**A:** Angular + Node.js; worked directly with analysts to define which metrics mattered before writing any UI code.
**R:** 50% faster decision-making for senior financial analysts.
**Reflection:** Learned the value of involving stakeholders in design review before development — saved two full rounds of UI revisions.
**Best for questions about:** cross-functional collaboration, translating business needs to engineering, data-driven products

---

### [Real-time + Event-driven] Kafka Notification System (Assurant)
**Source:** Report #001 — Google WSE II, gTech Ads
**S:** 50,000+ clients needed instant policy update notifications — legacy batch jobs causing hours of delay.
**T:** Build a real-time notification system handling 5K+ events/minute.
**A:** Apache Kafka + WebSockets + Spring Boot; designed for horizontal scaling from the start.
**R:** Instant updates for 50K client base; 0 reported notification lag in first month post-launch.
**Reflection:** Would have load-tested at 10x expected volume from day 1 — discovered headroom issues only at peak load in month 2.
**Best for questions about:** real-time systems, high-throughput architecture, event-driven design, scale

---

### [Performance Optimization] Redis Caching Layer (Assurant)
**Source:** Report #001 — Google WSE II, gTech Ads
**S:** Average API response time was 200ms — impacting UX for a client-facing financial application.
**T:** Reduce latency without a full data layer refactor.
**A:** Implemented Redis caching for session data and frequently accessed objects; targeted highest-hit endpoints first.
**R:** 200ms → 50ms average API response time (75% reduction).
**Reflection:** Identify caching opportunities during initial design, not as a post-launch optimization — caching requirements are visible at design time if you ask the right questions.
**Best for questions about:** performance optimization, technical problem-solving, constraints, latency
