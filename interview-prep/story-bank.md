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

### [AI Security] Azure-hosted MCP proxy for Figma (clear 429s + audit boundary)
**Source:** Reports #002/#003 — Abridge — AppSec/InfraSec
**S (Situation):** Viecure's Product Review agent (Figma design review + Jira triage) was hitting Anthropic-side 429 rate limits when pulling Figma data directly.
**T (Task):** Unblock the agent without losing the Figma data shape. Gain a security/audit boundary in the process.
**A (Action):** Designed and deployed a proxy MCP server inside Viecure's Azure tenant. Fronts Figma, feeds the agent only what it needs. Deliberate contrast with Atlassian/Jira side which doesn't need a proxy (mature MCP support).
**R (Result):** 429s cleared, agent restored. The proxy doubles as a HIPAA/HITRUST audit boundary for Figma data in a regulated tenant.
**Reflection:** When an integration's data path causes a problem, the right fix is often the proxy you'd want for compliance reasons anyway.
**Best for questions about:** system design, security architecture, AI agent integrations, regulatory constraints, creative problem-solving

---

### [AI Governance] Security review process for new agent deployments
**Source:** Reports #002/#003 — Abridge — AppSec/InfraSec
**S (Situation):** New agent deployments at Viecure needed a governance layer in a HIPAA/HITRUST-track environment. No formal review process existed.
**T (Task):** Author the security review process and agent identity / service-account model. Make it work on a 3-person team without becoming a bottleneck.
**A (Action):** Designed the security review process and agent identity model that every Claude agent in prod ships through. Light enough to ship agents in days, not weeks.
**R (Result):** All three agents in production went through this review. No governance escapes. Audit-ready posture.
**Reflection:** AI governance is most useful when it ships with the first agent, not retro-fitted. The process is the product — the artifact you hand to a HITRUST auditor.
**Best for questions about:** AI governance, threat modeling, founding-team security, regulatory compliance, process design

---

### [Founding Security] Security stack maturation in a messy Azure environment
**Source:** Reports #002/#003 — Abridge — AppSec/InfraSec
**S (Situation):** Joined Viecure as security-engineering hire on a 3-person platform/security team. Inherited a messy Azure environment with weak coverage.
**T (Task):** Mature the security stack to SOC 2 / HITRUST track shape.
**A (Action):** Selected and deployed Microsoft Defender suite (Cloud, Endpoint, Identity), Taegis XDR, and Palo Alto. Picked tools that integrate with regulatory work already in flight.
**R (Result):** Stack operates end-to-end: vuln scanning, EDR, SIEM, IAM/governance. SOC 2 / HITRUST-track shape. Policy documentation authored alongside.
**Reflection:** Tool sprawl is the second-biggest enemy after coverage gaps. Pick paved-road tooling that integrates with the regulatory work — coverage compounds, sprawl doesn't.
**Best for questions about:** founding-team security, inheriting a mess, tool selection, SOC 2/HITRUST, security program maturation

---

### [Adoption] PR Review agent + bringing skeptical devs along
**Source:** Reports #002/#003 — Abridge — AppSec/InfraSec
**S (Situation):** PR Review agent (Managed Agent on Sonnet 4.6, ~100 PRs/day in ADO) was back-end-leaning. Front-end devs found feedback less useful.
**T (Task):** Keep opt-in adoption rising without making the agent mandatory. Iterate the prompt, not the policy.
**A (Action):** Sat with front-end devs to understand calibration mismatch. Iterated the system prompt and review structure. Kept opt-in posture intact.
**R (Result):** "Even skeptics liked the info." Adoption held. Agent still live at ~100 PRs/day, ~$100/day on Sonnet 4.6.
**Reflection:** The agent is the easy part; bringing the dev org along is the work. Opt-in adoption is a signal — if the right surface is opting out, the prompt needs to change, not the policy.
**Best for questions about:** cross-functional influence, handling pushback, AI adoption, iterating on product, stakeholder management

---

### [AI Ops] App Insights closed-loop ops agent
**Source:** Reports #002/#003 — Abridge — AppSec/InfraSec
**S (Situation):** Dev + stg App Insights data at Viecure was rich but nobody read it. Perf and error issues caught reactively.
**T (Task):** Build an agent that turns telemetry into actionable engineering work end-to-end, not just summaries.
**A (Action):** Daily 7am run against App Insights — structured Slack post (top APIs, slowest APIs, error roll-ups, 7d + 30d baselines). Readers can request a Jira ticket; agent writes it with repro context, picks assignee, confirms back in Slack.
**R (Result):** Week-1 wins: engineers identifying real perf improvements. The 7d/30d baseline became the go-to for performance triage.
**Reflection:** This is multi-step HITL: agent → human approval → agent action → confirmation. The meaningful unit isn't "AI summary," it's "AI workflow with humans at the inflection points."
**Best for questions about:** exploration to production, non-obvious AI architecture, multi-step HITL, observability, proactive engineering

---

### [Scale] Envision IAM-as-code at ~100 AWS accounts / 30K employees
**Source:** Reports #002/#003 — Abridge — AppSec/InfraSec
**S (Situation):** Manual ticket-driven IAM access process across AWS + Azure at Envision Healthcare (HIPAA + HITRUST estate).
**T (Task):** Codify IAM policy as code; replace the ticket process with version-controlled automation.
**A (Action):** Built IAM policy automation in Terraform + PowerShell across AWS + Azure. Peer-reviewable, auditable, repeatable.
**R (Result):** Replaced manual process across ~100 AWS accounts in 3 tenants serving 30,000 employees.
**Reflection:** Every "agent" pattern is a generalization of a "scripted automation" pattern. The toolchain changed, the impulse didn't.
**Best for questions about:** scale, IaC at enterprise size, long-horizon automation impact, career arc

---

### [Platform] Internal Claude Code platform (org-wide plugins + skills + AI policy)
**Source:** Reports #002/#003 — Abridge — AppSec/InfraSec
**S (Situation):** Inconsistent Claude Code usage at Viecure — some on API keys, some on OAuth, no shared standards, rising compliance risk.
**T (Task):** Operate Claude Code as a platform org-wide — not as a tool — so both access paths are consistent, governed, and improvable.
**A (Action):** Shipped org-wide Claude Code plugins (API-key path) and skills (OAuth path) as internal products. Authored the AI acceptable usage policy as connective tissue.
**R (Result):** Most of the company's daily Claude usage flows through tooling, plugins, skills, agents, and governance Patrick built.
**Reflection:** When adoption is uneven and policy is missing, ship both products and policy together — neither alone changes behavior.
**Best for questions about:** operating AI as a platform, cross-functional product ownership, AI vendor evaluation, governance at scale
