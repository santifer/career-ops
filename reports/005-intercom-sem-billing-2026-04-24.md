# Evaluation: Intercom — Senior Engineering Manager, Team Billing

**Date:** 2026-04-24
**URL:** https://job-boards.greenhouse.io/intercom/jobs/7610485
**Archetype:** EM — Product Engineering
**Score:** 4.0/5
**Legitimacy:** High Confidence
**PDF:** ❌ pending

---

## A) Role Summary

| Dimension | Detail |
|-----------|--------|
| Archetype | EM — Product Engineering (billing systems) |
| Domain | SaaS / billing & payments infrastructure |
| Function | Lead billing team, own reliability, partner with cross-functional stakeholders |
| Seniority | Senior EM (5+ years managing rev-impacting teams) |
| Remote | Hybrid — London (days not stated; assume 2-3) |
| Team size | Not specified — implied medium-sized billing squad |
| Comp | Not disclosed |
| TL;DR | Own the engineering delivery for Intercom's billing platform — subscriptions, invoicing, metering, revenue recognition — with heavy emphasis on reliability, observability, and zero-tolerance for outages in revenue-critical systems |

---

## B) Match with CV

| JD Requirement | Match | Fergus's Evidence |
|----------------|-------|-------------------|
| 5+ years managing customer-facing or revenue-impacting teams | ⚠️ Close | 4 years EM at Ocado — one year short of stated requirement; impact is revenue-critical (warehouse orchestration) |
| Technical leadership with architecture and design review | ✅ Strong | Modular monolith, Lambda migration, architecture testing for module boundaries |
| Reliability and operational excellence (on-call, incident response, observability) | ✅ Direct match | SLOs + CloudWatch + PagerDuty before go-live; out-of-hours support; zero-incident partner migration |
| Migrations and modernisation | ✅ Strong | Lambda migration (85% cost, 5× faster); partner ordering system migration (zero incidents) |
| Cross-functional (Product, Design, Sales, Finance, Analytics) | ✅ Strong | "Closely collaborated with Product Management and UX"; orchestrated data scientists + analysts |
| Revenue-impacting launch quality | ✅ Strong | Zero-incident production launches; SLOs defined before go-live |
| Develop talent through coaching and delegation | ✅ Strong | Promotions to Senior, Staff, Senior Staff; 100% rotation graduate retention |
| Relentless about outcomes — identifies high-leverage problems | ✅ Strong | Automation of timesheet reminders (28→10 days); cycle time 30% improvement; Lambda cost reduction |
| Stripe Billing or similar platforms | ⚠️ Gap | No explicit billing platform exp — Ocado is logistics, not SaaS billing |
| SaaS / scale-up environment | ⚠️ Adjacent | Ocado is large-scale distributed systems; not a SaaS billing product context |

**Gaps:**
| Gap | Severity | Mitigation |
|-----|----------|------------|
| 4 vs 5+ years EM experience | Minor | Impact and depth compensate — promotions, zero-incident migrations, cross-team delivery |
| No SaaS billing domain experience | Moderate | Frame reliability mindset as transferable — SLOs, monitoring, and incident culture are domain-agnostic |
| No Stripe/billing platform knowledge | Minor | Nice-to-have in JD, not required; show pattern of fast domain ramp |

No hard blockers. Reliability/operational excellence stories are the strongest possible match.

---

## C) Level and Strategy

**Level detected:** Senior EM. "5+ years managing engineering teams" — above first-line EM but below Director. Likely manages one large squad or 2 small squads.

**Fergus's natural level:** Slight stretch — 4 years EM, but quality of evidence (promotions, zero-incident migrations, cross-functional delivery) is Senior EM calibre.

**How to sell:**
- Lead with reliability match: "The Billing team's core challenge — keeping revenue-critical systems operational at all times — is exactly what I've been building toward at Ocado: SLOs before go-live, monitoring that triggers before customers notice, incident playbooks that reduce MTTR."
- Lead with migration credibility: "I've delivered two zero-incident migrations — a partner ordering system migration and a Lambda infrastructure migration. Both required the same discipline that billing migrations demand: simulation data, staged rollouts, rollback plans."
- Lead with outcome orientation: "I reduced hosting cost by 85% and eliminated production incidents on a high-volume pipeline. I don't optimise for process compliance — I optimise for outcomes."
- On the 5-year gap: Frame depth over duration — "Four years of EM at Ocado at the scale and complexity I've operated has given me the equivalent exposure to senior-level challenges."

---

## D) Comp and Market

| | Data |
|-|------|
| JD | Not disclosed |
| Levels.fyi (London, Intercom SE) | £87.9k–£136k base for ICs |
| Glassdoor (Intercom Group EM, London) | Limited data; estimated £110k–£145k for Senior EM based on IC ranges + manager premium |
| Intercom context | Recently raised $250M Series D; AI-first product company competing intensely on Fin AI agent |
| Fergus's target | £95,000–£120,000 base |
| Assessment | Intercom's funding round and London Senior EM market suggest this role should land £110k–£145k base. High probability of meeting Fergus's target. Notable perk: all engineers get unlimited Claude Code — a signal about engineering culture quality. |

**Negotiation note:** Intercom is well-funded and AI-forward. Don't anchor low. Monzo's floor (£110.5k) is your market reference for the same archetype.

---

## E) Personalisation Plan

| # | Section | Current | Change | Why |
|---|---------|---------|--------|-----|
| 1 | Summary | "distributed systems, cloud architecture" | Add: "revenue-critical systems reliability, billing platform ownership" | Mirrors Intercom's billing mandate directly |
| 2 | SLO bullet | "Defined service level objectives and implemented monitoring" | Reframe: "Defined SLOs for revenue-critical services prior to go-live — zero post-launch incidents across two major migrations" | Resonates with billing team's zero-tolerance standard |
| 3 | Lambda bullet | 85% cost, 5× faster | Add outcome: "with zero production incidents" — emphasise the migration discipline, not just the optimisation | Billing = safe migrations over fast ones |
| 4 | Cover letter | N/A | "Your billing team's core challenge is the same one I've solved in logistics at Ocado: keeping revenue-critical systems running with zero tolerance for failure. My work on SLOs, monitoring architecture, and zero-incident migrations maps directly to what the Team Billing mandate requires." | Specific bridge to the role |

---

## F) Interview Plan

Key stories for Intercom Billing pillars:

| JD Pillar | Best story |
|-----------|-----------|
| Reliability / on-call | Story 7 — SLO + Monitoring Before Go-Live |
| Migrations | Story 9 — Partner Migration Zero Incidents |
| Cross-functional | Story 8 — PM/UX/Eng Alignment |
| Team development | Story 1 — Team Promotions Pipeline |
| Outcome orientation | Story 5 — AWS Lambda Migration |
| Process/delivery | Story 3 — Cycle Time Improvement |

**Red-flag pre-empts:**
- *"You haven't worked in billing or SaaS"* → "The engineering discipline required — SLOs, incident response, safe migrations, revenue-critical launches — is exactly what I've practiced in logistics at Ocado. Domain knowledge is a week of onboarding; the operational mindset I bring takes years to build."
- *"You're at 4 years EM, we said 5+"* → "I've operated at Senior EM scope throughout: cross-team project delivery, promotions pipeline, architecture decisions, zero-incident migrations. I'm happy to discuss the depth of any of those."

---

## G) Posting Legitimacy

**Assessment: High Confidence**

| Signal | Finding | Weight |
|--------|---------|--------|
| Greenhouse API — full JD returned | Active posting with complete description | Positive |
| Specific team named (Team Billing) | Real headcount, not generic | Positive |
| Specific technical responsibilities (SLOs, observability, Stripe mention) | JD written by engineering leadership | Positive |
| Intercom is a funded, growing company ($250M raise) | Real hiring budget | Positive |
| London office confirmed (hybrid) | Realistic for Fergus | Positive |

---

## Keywords

Senior Engineering Manager, billing, subscriptions, invoicing, metering, revenue recognition, reliability, observability, incident response, on-call, SLOs, migrations, Stripe Billing, cross-functional, operational excellence, London hybrid, SaaS, fintech-adjacent
