# Article Digest — Patrick Moore

> Compact proof points with metrics. Career-ops reads this AT evaluation time
> instead of hardcoding numbers in modes/_shared.md. Update as you ship work.
>
> Status: **in-progress** — drafted from resume content on 2026-05-08; metric
> fields marked `[TBD]` are awaiting Patrick's input via the article-digest
> walkthrough.

---

## /viecure — current role (Jul 2025 – Present)

**Important framing — the agents are not the whole job.** Patrick is on a 3-person platform/security team at Viecure and the role is broad. The Claude agent fleet (next subsection) is **only the last several weeks** of the work; the bulk of the role is steady-state cloud security, platform engineering, governance authorship, and operating the internal Claude Code platform. When evaluating roles, weight the security/platform/governance work first; surface the agent fleet as evidence of recent execution velocity, not as the whole job description.

**Product context:** Viecure is building a **brand-new oncology EMR** ground-up — Azure SaaS, MS SQL Server, AI-native by design — under HIPAA / HITRUST / SOC 2-track controls. Two environments today (dev + stg); **"stg is effectively prod"** because the EMR hasn't shipped yet, so stg carries production-grade load and data shapes.

### What Patrick actually does day-to-day at Viecure

| Layer | What he owns / contributes |
|---|---|
| **Security stack** | Selected, deployed, and operates Microsoft Defender suite (Cloud, Endpoint, Identity), Taegis XDR, Palo Alto. Vuln scanning, EDR, SIEM, IAM/governance. |
| **Network & cloud arch** | Firewall + NSG rules, secure connectivity for clinical workloads, Terraform for networking and app infra (App Services, AKS, Functions, SQL). |
| **Compliance & policy** | Authored ransomware, IAM/access, and HIPAA documentation for the SOC 2 / HITRUST cert effort. Authored the org-wide AI acceptable usage policy. Designed the agent identity / service-account model and the security review process for new agent deployments. |
| **Internal Claude Code platform** | Org-wide Claude Code plugins for API-key users + org-wide Claude Code skills for OAuth users. Drives all AI coding at Viecure. |
| **MCP / agent infra** | 3 Key Vaults, 3 Function Apps, 2 proxy MCP servers (ADO + Figma), service hooks/webhooks across ADO/Jira/Figma/Slack. |
| **Agent fleet (recent)** | Three Claude agents shipped to production in the last several weeks (see below). |
| **Admin** | Azure DevOps, Jira, Intune administration for the engineering organization. |

**Strongest single proof of value at Viecure:** *"most of the company's daily Claude usage flows through MCP servers, agents, and governance built and operated by Patrick"* — this is true across all the layers above, not just the agents.

---

## /viecure — Claude agent fleet (recent: last several weeks of 2026)

**Three agents in production**, plus the MCP servers, proxy infra, and governance underneath. **This is the most recent work** at Viecure, not the steady-state job — frame it as "shipped this in the last several weeks" rather than "this is what I do."

### Patrick's design philosophy (load-bearing for senior AI roles)

> "I try to make everyone better at their job by making agents to empower them in automated ways so they don't have to interact with AI — it interacts with them."

That framing changes what the fleet is *for*: it's not a chatbot suite, it's invisible automation that comes to engineers/designers/ops people on their existing surfaces (PR, Jira ticket, Figma comment, Slack post) and **raises the floor** of what every team member ships. Use this quote in interviews and apply-form prose for AI/agentic roles — it's a stronger differentiator than any KPI.

### Agent 1 — PR Review Agent
- **Status:** Live in production since April 2026.
- **Architecture:** Anthropic Managed Agent on Sonnet 4.6.
- **What it does:** Reviews pull requests in Azure DevOps and posts structured feedback automatically.
- **Cost signal:** Was costing **~$100/day** (~$36K/yr) on Sonnet 4.6 — a real, defensible inference budget for one agent in healthcare prod. (Cost optimization is an ongoing effort — see calibration notes below.)
- **Volume:** **~100 PRs reviewed per day** (~25–30K/yr).
- **Trust signal & adoption posture:** Feedback is **opt-in** — devs can ignore. Even skeptics liked the info. The intent is "raising the floor" so every dev gets automated feedback without it being mandatory; not gating merges, not replacing human review. Front-end devs found the (initially back-end-leaning) framing less useful — calibration is **ongoing** with input from the dev org.
- **Resume framing (Patrick's preferred angle):** Lead with the *philosophy* and the *adoption posture* (opt-in, raises the floor, 100/day, devs trust the info even when they don't act on it) rather than a single percentage. The "skeptics liked the info" line is the strongest qualitative signal.
- **Architecture note:** No proxy needed for ADO — Azure DevOps integrates directly. (Compare with Figma below.)

### Agent 2 — Product Review Agent (Jira + Figma)
- **Status:** In production.
- **What it does:** Reviews product/design work — wired into Figma for design review and into Jira for ticket triage.
- **Where feedback lands:** Jira comments; ticket state transitions when needed (moves tickets if a triage decision implies a status change); inline comments alongside the PR Review agent's feedback in the related PR when design intent and code diverge.
- **MCP architecture (the differentiator):** Patrick built an **Azure-hosted MCP proxy** for Figma so the agent doesn't hit Figma data directly. Original problem: **the Figma data path was hitting 429 rate limits from Anthropic servers** and disrupting the Anthropic Managed Agent. Patrick designed and deployed a proxy MCP server inside Viecure's Azure tenant that fronts Figma and feeds the agent only what it needs — fixing the rate-limit problem and gaining a controlled audit/security boundary for Figma data in a HIPAA/HITRUST environment.
- **Atlassian / Jira side:** **No proxy needed** — Atlassian's MCP support is mature; Jira flows directly. Concrete contrast Patrick can use in interviews: "Figma needed an MCP proxy to clear 429s, Atlassian was native."
- **Volume / lead metric:** [TBD — Patrick may not track these as discrete numbers; the philosophy framing is the primary pitch]

### Agent 3 — App Insights Agent (the operational loop)
- **Status:** In production. **Recently shipped — not yet in the public resume.** First week already produced devs finding real performance improvements off the back of its output.
- **Environments watched:** **Dev + Stg.** Because Viecure is building a brand-new EMR, **stg is effectively prod** (production-grade load and data). Read this as "the agent watches our most production-like environment for a healthcare product about to ship," not "the agent watches test envs."
- **What it does:** Runs daily at **7am** and produces a structured analysis posted to Slack. Slack readers can spawn Jira tickets directly from the post.
- **Daily output includes:**
  - Most-used APIs
  - Slowest APIs
  - Error roll-ups
  - **7-day and 30-day error baselines** (so spikes vs ambient noise are obvious)
- **The closed loop (this is the differentiator):**
  1. Analyzes Dev + Stg App Insights → posts daily report to Slack.
  2. Slack readers can request a Jira ticket from the post.
  3. Agent **writes the ticket** (description, repro context from App Insights).
  4. Agent **analyzes ticket audience** and assigns the right engineer.
  5. Agent **tags** the ticket appropriately.
  6. Agent **updates Slack** to inform readers a ticket has been created and assigned.
- **Early ROI (week 1):** Devs already found ways to improve app performance from the daily reports. The 7-day/30-day baseline is the first thing teams reach for in performance triage.
- **Why this is more than another agent:** It's not "Claude reads logs and summarizes." It's a multi-step operational workflow with HITL (humans approve ticket creation), agent-driven assignment, and bidirectional Slack ↔ Jira sync. It's the kind of thing FDE / Applied-AI / AI-Platform hiring managers ask about because most teams *talk* about "AI ops" but very few have it actually wired in production.
- **Lead metric:** Lead with the architecture (closed loop, dev/stg coverage, baseline-aware) and the week-1 ROI; specific numbers can come from interview follow-ups.

### Underlying infra — what Patrick built and operates org-wide

For all three agents and the broader org's Claude usage:

| Component | Count / detail |
|---|---|
| **Azure Key Vaults** | 3 |
| **Azure Function Apps** | 3 |
| **Service hooks** | "where needed" — into ADO, Jira, Figma, Slack |
| **Webhooks** | "where needed" — same surfaces |
| **Proxy MCP servers** | 2 — Azure DevOps proxy + Figma proxy |

The Figma proxy MCP is the single most "show, don't tell" engineering proof point in the fleet — it's a real-world workaround for an Anthropic-side 429 issue, built inside a regulated tenant, and it's the right architecture *anyway* (audit boundary, controlled data flow, HIPAA/HITRUST friendly).

**Adoption signal:** "most of the company's daily Claude usage flows through MCP servers, agents, and governance built and operated by Patrick" (cv.md).

### Underlying ops — AI Governance
- **Authored:** AI usage policy (org-wide, the canonical document), agent identity / service-account model, security review process for new agent deployments.
- **Audience:** Whole engineering org.
- **Hero metric:** [TBD — # of agents reviewed/approved under this process, # of policy violations caught/prevented]

### Internal Claude Code platform — org-wide developer enablement

This is a separate proof point from the agent fleet — Patrick operates an **internal Claude Code platform** for the whole engineering org, and **drives all AI coding efforts** at Viecure.

| Layer | What Patrick built | Who it's for |
|---|---|---|
| **Org-wide Claude Code plugins** | Custom plugins (hooks, MCPs, behavior extensions) shipped org-wide | API-key users (developers running Claude Code with their own API keys) |
| **Org-wide Claude Code skills** | Custom user-invocable skills (`/...` commands, workflows) shipped org-wide | OAuth users (developers on the Claude.ai Pro/Max subscription path) |
| **AI acceptable usage policy** | Authored the canonical policy that governs both groups | Whole org |
| **AI coding leadership** | Owns and drives all AI coding efforts at the company | Engineering org |

**Why this matters in interviews:** Most candidates can talk about *using* Claude Code. Very few can describe *operating it as a platform* for an engineering org — managing both the API-key path and the OAuth path, shipping plugins and skills as internal products, and authoring the policy that controls how the team uses AI. This is exactly what AI Platform / Developer Experience / AI Enablement teams at AI labs hire for.

**Lead framing for senior AI Platform / DX roles:** "I run an internal Claude Code platform for ~N engineers. We operate two access paths (API-key plugins for developers, OAuth skills for everyone else), with the AI usage policy I authored as the connective tissue."

- **Headcount served:** [TBD — engineers + others on the OAuth path]
- **Plugin / skill count:** [TBD — how many shipped to date]
- **Adoption signal:** "most of the company's daily Claude usage flows through MCP servers, agents, and governance built and operated by Patrick" already covers this — but a number on plugins/skills shipped + usage frequency would be even better when you have a moment.

---

## /viecure — Security stack maturation

**One-liner:** Took a previously messy Azure environment to SOC 2 / HITRUST track shape on a 3-person team. Selected, deployed, and operates the security stack end-to-end.

- **Stack stood up / matured:** Microsoft Defender suite (Cloud, Endpoint, Identity), Taegis XDR, Palo Alto.
- **Coverage:** Vuln scanning, EDR, SIEM, IAM/governance.
- **Network:** Firewall + NSG rules, secure connectivity for clinical workloads, Terraform for networking + app infra (App Services, AKS, Functions, SQL).
- **Hero metric:** [TBD — vulns closed, controls now in scope, time-to-detect improvement, etc.]
- **Compliance docs authored:** Ransomware, IAM/access, HIPAA — feeding the SOC 2 / HITRUST cert effort underway.

---

## /envision-healthcare — Cloud Security Engineer II (2018–2025)

**One-liner:** Six years across HIPAA & HITRUST-regulated cloud security at Envision Healthcare, promoted twice (Sysadmin → System Engineer I → Cloud Security Engineer II). The years where Patrick built the security DNA that the Viecure work sits on top of.

### Security stack operated end-to-end
- Wiz, AWS Security Hub, Zscaler, Tanium, SentinelOne, Rapid7 — selected, deployed, and operated in production.
- This is the toolchain hiring managers want operator-level fluency in for senior cloud security roles. Patrick has it.

### IAM-as-code rollout
- **What it replaced:** A manual ticket-driven access process across AWS and Azure.
- **What it became:** Version-controlled IAM policy automation in **Terraform + PowerShell** — codified, auditable, peer-reviewable.
- **Why it matters:** This is the direct ancestor of the agent work at Viecure. Same instinct (automate the toil), same toolchain (Terraform / scripts), seven years earlier with a security framing.
- **Scale at peak:** **30,000 employees** (clinical + non-clinical) under management. **95% AWS** primary CSP. **~100 AWS accounts across 3 tenants** — this is a real enterprise control plane, not a small-shop deployment.
- **Resume framing:** "I codified IAM policy across ~100 AWS accounts in 3 tenants serving 30,000 employees" is the line — concrete, verifiable enterprise scale.

### Automation that retired ops toil — the war story

Patrick's lead Envision proof point in his own words: **"built automated processes that eliminated teams."**

This is a powerful business outcome but **needs careful framing in interviews and apply prose** because "eliminated teams" can read two ways:
- **(A) Efficiency win** — automation removed the *need* for repetitive-ops headcount; the company reorganized accordingly. Strong signal for hiring managers focused on AI/automation ROI.
- **(B) Job displacement** — same fact stated bluntly. Some hiring managers (especially at AI-ethics-conscious or unionized orgs) will read this as a red flag about how the candidate frames human cost.

**Recommended interview framing options** (Patrick to pick whichever is most accurate):
- *"I built automation that retired hundreds of FTE-hours per week of repetitive ops work — the org reorganized around the freed-up capacity."*
- *"The work I automated at Envision was real, ongoing toil — by the end, the manual processes I replaced no longer required dedicated teams."*
- *"My automation work eliminated the need for the manual processes those teams ran. That's the throughline to the agent work at Viecure: I make repetitive work disappear."*

In **resume bullet form**, lean toward outcome rather than headcount: *"PowerShell, Bash, and Python automation that retired hundreds of FTE-hours/week of repetitive security operations work — direct ancestor of the agent work shipped at Viecure."*

The verbatim phrase "eliminated teams" is the right thing for *Patrick's own* notes (it's how he experienced the impact) but reframe outward depending on audience.

### Tanium + 3-MDM rollout
- **Co-led enterprise Tanium rollout** across the org.
- **Stood up three MDM platforms** (Intune, Jamf, Mosyle) covering Windows and macOS clinical fleets — three different platforms because clinical hardware is heterogeneous.
- **Scale:** **Tens of thousands of endpoints** under management. **99% Windows** fleet (the macOS slice is the smaller clinical/exec set that Jamf and Mosyle covered).
- **Why it matters:** Demonstrates ability to roll out endpoint management at scale across mixed fleets in healthcare — tens of thousands of endpoints is a real enterprise number that maps directly to the multi-tenant / multi-stack work AI infra and security platform teams hire for.

### Promotions / longevity signal
- Sysadmin (2018) → System Engineer I (\~2022) → Cloud Security Engineer II (Jul 2024). Two promotions in six years on automation and ownership; not a "hop and dash" candidate.

---

## /moorelab.cloud — personal site & lab

**One-liner:** Personal portfolio + auto-regenerated /now block + lab notes; signals "builder who runs systems for fun, not just at work."

- **URL:** https://moorelab.cloud
- **Stack:** Static site, regenerated weekly by `build/refresh-dynamic.py` pulling recent GitHub activity + curated notes. The /now block is dynamic and reflects current focus.
- **Sub-properties:** [hackerzork.moorelab.cloud/play](https://hackerzork.moorelab.cloud/play) — playable text-adventure game built alongside Claude.
- **Resume:** The site hosts four role-tabbed resume variants (AI & Security, Cloud, Condensed, Detailed Full History). Note: as of 2026-05-08 the page is **stale relative to cv.md** — doesn't yet mention the App Insights agent, the Claude Code platform work, or the security-first framing.
- **Homelab proof point:** HA Proxmox + OPNsense (the same lab now running the career-ops scanner LXC), self-hosted AI tooling, multi-VLAN segmentation. This is the unspoken half of "security engineer first" — Patrick designs and operates secure networks for fun.

---

## /github.com/tricheboars

**One-liner:** Public homelab tooling, self-hosted AI infra, MCP/agent prototypes — visible builder signal that backs up the resume.

- **URL:** https://github.com/tricheboars/
- **Why it matters in evaluations:** Hiring managers at AI labs and dev-tools companies look at GitHub activity for builder signal. Patrick has public repos around homelab IaC, MCP/agent prototypes, and the hackerzork text-adventure — concrete evidence that the "agents in production at work" claim isn't a one-off.
- **Hero repos:** [TBD — pick 2–3 most representative when prompted; hackerzork is the one with public traction]

---

## Cross-cutting narrative

**Patrick is a security engineer first.** That's the foundation — the lens, the identity, the throughline across 25+ years of healthcare, finance, defense, and government cyber.

The other hats are layered on top, in order:

1. **Security engineer** (foundation) — HIPAA / HITRUST / SOC 2 documentation personally authored; Defender / Taegis / Palo Alto / Wiz operated end-to-end; AWS SAA-C03; AI usage policy authoring.
2. **System engineer** (built on #1) — 3 Key Vaults, 3 Function Apps, 2 proxy MCP servers, IAM-as-code in Terraform + PowerShell, Tanium + 3-MDM rollouts, HA Proxmox / OPNsense homelab.
3. **AI engineer** (built on #1 + #2) — three Claude agents in production, internal Claude Code platform (org-wide plugins for API users + skills for OAuth users), MCP server author, agent identity / service-account model designer.
4. **Social engineer / "the glue"** (what makes it ship) — brought skeptical devs along on the PR review agent ("even skeptics liked the info"), iterating with front-end devs on calibration mismatch, drives consensus on AI policy, ships across team boundaries. Double meaning intentional: security discipline + people glue.

**That stack on the same person is rare.** Most candidates split cleanly into one bucket — the security person who *talks* about AI, the AI person who *skips* compliance, the solo builder who can't bring others along. Patrick has all four functions on one resume, with seven years of healthcare-regulated cloud security as the foundation everything else stands on.

**Lead with security DNA.** The pitch order is "security engineer who *also* ships Claude agents in prod and runs Claude Code as a platform" — never "AI engineer with security background." The security identity is foundational, not flavor.
