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

### [High-Load Go] TorEnergy DSP Scaling
**Source:** Report #003 - Booking.com - Golang Developer - B2B
**S (Situation):** TorEnergy's DSP traffic and ad spend were growing quickly, and latency on the bidding path directly affected revenue.
**T (Task):** Scale Go backend services while keeping bid responses fast and production reliability stable.
**A (Action):** Optimized critical-path Go code, introduced event-driven caching with NATS, migrated services to Kubernetes, and tuned object allocation and pooling.
**R (Result):** Scaled from 10K to 25K RPS in 4 months, supported $500K daily ad spend, cut latency by 60%, and reached 99.9% uptime.
**Reflection:** Measure before optimizing. The biggest gains came from combining profiling, architecture changes, and operational discipline.
**Best for questions about:** high-load Go, performance, microservices, Kubernetes migration, production ownership.

### [Reliability] Delivery Hero Kafka Data Healing
**Source:** Report #003 - Booking.com - Golang Developer - B2B
**S (Situation):** Kafka ingestion failures created inconsistent downstream navigation data across distributed systems.
**T (Task):** Restore data consistency safely without relying on risky manual fixes.
**A (Action):** Built data-healing pipelines, validated replay paths, and aligned recovery logic with canary migration strategy.
**R (Result):** Restored consistency across distributed systems and reduced operational risk during production migrations.
**Reflection:** Reliability features need explicit replay, idempotency, and observability design from the start.
**Best for questions about:** production troubleshooting, Kafka, data consistency, reliability, distributed systems.

### [Cloud Backend Delivery] Namadgi Microservices Platform
**Source:** Report #003 - Booking.com - Golang Developer - B2B
**S (Situation):** Namadgi needed multiple startup backends to move from MVP to reliable production operation.
**T (Task):** Build scalable backend services and deploy them with repeatable release processes.
**A (Action):** Designed Go REST/gRPC APIs, PostgreSQL/Redis-backed service boundaries, Kubernetes deployments, CI/CD pipelines, rate limits, and circuit breakers.
**R (Result):** Processed 1M+ requests/day, delivered 3 startup backends to production, and achieved 99.9% uptime.
**Reflection:** Good service boundaries and boring deployment automation reduce both outage risk and onboarding cost.
**Best for questions about:** REST APIs, microservices, Kubernetes, CI/CD, backend ownership, startup-to-production delivery.
