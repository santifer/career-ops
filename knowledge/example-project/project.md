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

# Acme Corp API Platform Migration — Project Details

## Overview

Led the migration of Acme's monolithic REST API (Rails, 200K LOC) to a
microservices architecture on Kubernetes. The legacy API served 15M
requests/day but had become a deployment bottleneck — a single change
required a full regression cycle and 4-hour deploy window.

**Duration:** January 2021 – December 2021
**Role:** Technical Lead / Backend Engineer
**Team:** 4 engineers (2 senior, 1 mid, 1 junior)

---

## Business Context

Acme's B2B SaaS platform had grown to 800+ enterprise customers. The
monolith's deploy cadence (weekly, with 4-hour windows) was blocking
feature velocity. Customer-facing latency had crept to 450ms p99 as the
codebase grew. The VP of Engineering approved a migration initiative after
two major outages traced to deployment coupling.

---

## What Was Built

### Strangler Fig Migration Pattern

Rather than a big-bang rewrite, used a strangler fig pattern with an API
gateway (Kong) routing traffic progressively from the monolith to new
services:

1. **Domain decomposition** — mapped the monolith into 12 bounded contexts
   using event storming workshops with product and engineering
2. **Shared-nothing services** — each service owns its database (Postgres),
   communicates via async events (Kafka) for eventual consistency
3. **Progressive traffic shifting** — Kong gateway with canary rules,
   0.1% → 1% → 10% → 50% → 100% per service over 2-3 weeks

### Key Technical Decisions

- **Kafka for inter-service communication** — chose over synchronous REST
  to decouple services and handle backpressure during migration
- **Schema registry** — Avro schemas with compatibility checks to prevent
  breaking changes across teams
- **Distributed tracing** — Jaeger instrumentation from day one; critical
  for debugging cross-service latency during the hybrid monolith phase

---

## Scale & Metrics

- **12 microservices** extracted from monolith over 10 months
- **40ms p99 latency** (down from 450ms — 11x improvement)
- **15M requests/day** served through the new architecture
- **Zero-downtime cutover** — progressive migration, no maintenance windows
- **Deploy cadence** went from weekly/4-hour to multiple daily/2-minute
- **4-person team** delivered on schedule with no production incidents

---

## Notes for Context

This project is best positioned for roles requiring:
- Hands-on backend/infra migration experience at scale
- Technical leadership of small, high-output teams
- Architectural decision-making under production constraints
- Comfort with distributed systems complexity (eventual consistency, tracing)

The "strangler fig" story resonates particularly well in interviews —
it shows pragmatic migration thinking vs. risky big-bang rewrites.
