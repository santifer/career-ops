---
company: Acme Corp
project: API Platform Migration
dates: 2021-Q1 to 2021-Q4
archetypes:
  - Backend Engineer
  - Technical Lead
capabilities:
  - microservices
  - api-design
  - system-migration
  - team-leadership
hero_metrics:
  - 40ms p99 latency (from 450ms)
  - 12 microservices extracted
  - zero-downtime cutover
  - 4-person team
---

# Acme Corp API Platform Migration — STAR+R Framework

## SITUATION

Acme's monolithic Rails API (200K LOC, 15M requests/day) had become a
deployment bottleneck for 800+ enterprise customers. P99 latency had crept
to 450ms. Deploys required weekly 4-hour windows with full regression. Two
major outages in Q4 2020 — both traced to deployment coupling — triggered
VP-level approval for a migration initiative.

The core tension: the API was generating revenue and couldn't go down, but
every week it stayed monolithic made the problem harder to fix.

---

## TASK

Lead a 4-person team to migrate the monolith to microservices without
disrupting the 800+ customers relying on 15M daily requests. Constraints:
zero-downtime (no maintenance windows), no feature freezes (product
couldn't pause for 10 months), and the junior engineer needed to ship
production code within the first month.

---

## ACTION

**Chose the strangler fig pattern over big-bang rewrite.** Ran event
storming workshops with product and engineering to decompose the monolith
into 12 bounded contexts. Set up a Kong API gateway for progressive traffic
shifting — 0.1% canary, then 1%, 10%, 50%, 100% over 2-3 weeks per
service. Each service got its own Postgres database and communicated via
Kafka events for eventual consistency.

**Built the observability layer first.** Instrumented Jaeger distributed
tracing before extracting the first service. This was the decision that
saved us — during the hybrid phase (monolith + services running in
parallel), tracing was the only way to debug cross-service latency spikes.

**Invested in developer experience.** Schema registry with Avro
compatibility checks prevented breaking changes. Standardized service
templates (Dockerfile, CI pipeline, health checks, Kafka consumer patterns)
so the team could spin up a new service in under a day.

**Mentored the junior engineer through production ownership.** Paired on
the first two service extractions, then gave her full ownership of
services 3-5 with code review support. She shipped all three on schedule.

---

## RESULT

- **40ms p99 latency** — down from 450ms (11x improvement)
- **12 microservices** extracted over 10 months, on schedule
- **Zero-downtime cutover** — progressive migration, no maintenance windows
- **Deploy cadence** improved from weekly/4-hour to multiple daily/2-minute
- **Zero production incidents** during the entire migration
- **Junior engineer** promoted to mid-level 6 months later, citing the
  migration as her strongest growth period

---

## REFLECTION

The biggest lesson: **the observability investment paid for itself 10x.**
Every instinct said "start extracting services immediately" — but spending
the first 3 weeks on tracing, logging, and canary infrastructure meant we
caught problems at 0.1% traffic instead of 100%. The two times we found
latency regressions, they affected fewer than 1,000 requests total.

The strangler fig pattern also taught me that **migration is a product
problem, not just an engineering problem.** The event storming workshops
with product managers were essential — they identified which bounded
contexts had the highest coupling to revenue features, which determined
our extraction order. We migrated the lowest-risk, highest-pain services
first, building confidence and tooling before tackling the critical path.

---

## Interview Positioning

- **"Led a zero-downtime migration of a 200K LOC monolith serving 15M
  requests/day to 12 microservices. P99 latency dropped from 450ms to
  40ms. No production incidents across the 10-month migration."**
- **"The key decision was investing 3 weeks in observability before
  extracting the first service. Distributed tracing caught regressions
  at 0.1% canary traffic instead of 100%."**
- **"Used a strangler fig pattern with progressive traffic shifting —
  started at 0.1% canary per service, scaled to 100% over 2-3 weeks.
  Zero maintenance windows."**
