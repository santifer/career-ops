---
company: Workday
project: Flowise Development Agent
dates: 2024-Q3 to present
archetypes:
  - AI Solutions Architect
  - AI Forward Deployed Engineer
  - AI Product Manager
capabilities:
  - agentic-architecture
  - mcp-a2a
  - multi-agent-orchestration
  - product-incubation
hero_metrics:
  - 7 specialized agents
  - 62 MCP tools
  - compressed 4-6 weeks to under 5 days
  - adopted by several hundred developers
---

# Workday Flowise Development Agent  - STAR Framework (Interview/External)

## SITUATION

Workday acquired Flowise in mid-2025  - an open-source low-code agent builder built on LangGraph and LlamaIndex. The platform was central to Workday's strategy: it would power how customers and internal teams build AI agents on the Workday platform. There was just one problem.

Even with a visual UI, Flowise still required deep AI engineering knowledge to build effective agent workflows. You needed to understand node architectures, credential binding patterns, API schemas, prompt engineering, and testing methodologies. The learning curve was steep  - and the Global AI Accelerator's entire mission depended on scaling agent development to 4,000+ consultants who were domain experts (HR, Finance, Supply Chain), not AI engineers.

At the same time, Workday needed Flowise agents that could connect to its own ecosystem  - the CIS inference gateway (1,425+ models), Workday APIs via MCP, ASOR for agent governance  - but none of that connectivity existed in the base Flowise platform. The tool didn't speak Workday.

80% of enterprise AI projects fail to deliver measurable value. The bottleneck was never the technology, it was the gap between what the tools could theoretically do and what practitioners could actually build with them.

Meanwhile, the traditional approach to building customer agent POCs required a dedicated engineering team and 6-8 weeks of sequential work (architecture research, integration builds, debugging, governance, distribution, testing, hardening). It was manual, fragile, created knowledge silos, and was nearly impossible to replicate for the next customer. In competitive bid situations, this meant months before a first demo, while competitors were moving faster.

---

## TASK

I saw the opportunity and started building. Nobody assigned this. Nobody asked for it. I recognized that the same AI capabilities we were selling to customers could solve our own internal productivity problem: use AI to build AI.

My self-defined mandate:
- **Build a developer co-pilot for Flowise** that compresses 6-8 weeks of traditional agent development to under 2 days with a single architect, enabling consultants to build customer POCs at 10-20x speed in presales and win competitive bids
- **Make Flowise speak Workday** by extending the platform with native connectivity to Workday's AI infrastructure
- **Encode operational intelligence** by capturing the hard-won knowledge from hundreds of build scenarios into reusable skills that any builder could leverage
- **Discover secondary use cases** like whether the same tool that builds agents could also test them

I was sole PM, architect, and engineer. One-person product incubation, ~1,000 hours of development.

---

## ACTION

### Built the MCP Control Plane (62 Tools)

Started by reverse-engineering the Flowise open-source codebase. The public API documentation covered about 20 endpoints, but I discovered the platform had nearly 60+ API endpoints that were essential for programmatic control. I built a custom MCP server using FastMCP that exposed every one of these as tool calls:

- 62 tools across 18 groups covering the entire Flowise REST API
- Full CRUD for chatflows, agentflows, assistants, tools, variables, document stores
- Prediction execution, flow validation, credential management, marketplace templates
- Async httpx client with connection reuse and corporate proxy bypass
- Human-in-the-loop support for resuming paused agentflow executions

This meant any AI agent  - through Cursor IDE or any MCP client  - could now build, configure, test, and deploy Flowise agents without touching the UI.

### Extended Flowise with Workday-Native Capabilities

Built a custom Docker image that extends the base Flowise platform with 8 custom nodes and 5 patched internals:

- **CIS LLM and ChatModel nodes** connecting to Workday's internal inference gateway (1,425+ models)
- **WorkdayMCP tool nodes** calling Workday APIs from inside agentflows via MCP protocol
- **OAuth2 credential types** for both production and sandbox tenants, auto-populated by automation scripts
- **Parallel execution node** enabling true concurrent branch execution in agentflows (Promise.all)
- **Human-in-the-loop node** for pausing execution pending human approval
- **Patched Flowise internals:** agentflow runner (parallel handler), ChatOpenAI (CIS routing), ExecuteFlows (cross-flow execution), DirectReply (structured output)

One `docker compose up` and you have Flowise connected to Workday natively.

### Pushed Custom Nodes to the Internal Flowise Community

I didn't keep these nodes local. I pushed them upstream into the internal Flowise Docker image used by several hundred developers across Workday. Created a visual architecture placemat documenting all nodes organized by function (Brain → Hands → Keys → Flow Control → Under the Hood) and delivered training sessions to the community. Now every developer on the platform can build Workday-connected agents with CIS inference, MCP tool calls, and OAuth credential management out of the box  - capabilities that didn't exist before I built and contributed them.

### Built the Workday Integration Infrastructure

Created a complete OAuth2 automation and agent lifecycle management pipeline:

- Playwright-based browser automation for Workday OAuth2 authorization code flow
- Programmatic ASOR agent registration, skill configuration, and activation
- Per-agent credential management with isolated token lifecycles
- Schema library cataloging 261 Workday MCP tools with WIDs, 105 REST/SOAP API specs

### Designed the Intelligence Layer (4 Agent Skills)

This is what separates the product from a simple API wrapper. I built four specialized skills encoding operational intelligence refined through ~1,000 real-world build scenarios:

- **flowise-builder:** The core operating playbook. Phase-structured build loop (discover → plan → patch → test → converge), hard rules learned through failures (credential binding must be in TWO places, read-before-write, one-change-per-iteration), 23 error patterns with cascade analysis, backup/restore protocol
- **cis-reference:** 80+ tested CIS configuration patterns from Tiers 1-4 stress testing. Provider compatibility matrix, known bugs, patched node behaviors
- **workday-auth:** OAuth setup automation, agent registration, WID lookup, multi-tenant support
- **workday-troubleshooting:** Runtime error diagnosis  - 403s, S22 permission errors, BPSP triage, credential expiry detection

The skills encode "the way you fine-tune a model with curated domain data, except here the domain is enterprise Flowise + Workday architecture."

### Built the LangGraph Co-Pilot (The Brain)

Implemented a LangGraph state machine as the orchestration engine:

```
discover → check_credentials → plan → [human approves] → patch → test → converge → [human reviews] → done
```

Provider-agnostic reasoning engine (Claude and OpenAI implementations). The agent uses the 62 MCP tools to inspect the current state, plans the build, executes minimal changes with mandatory read-before-write discipline, tests via automated prediction execution, and converges toward the Definition of Done. Human-in-the-loop gates at plan approval and result review ensure the developer stays in control.

Wrapped the entire graph in a FastAPI service with session management, interrupt handling, and persistent thread state.

### Discovered a Secondary Use Case: AI-Powered Testing Harness (Already Finding Real Bugs)

Beyond the primary developer co-pilot function, I realized through iterative development that the same system that builds agents can also test them. I refactored the platform into an automated AI testing harness and pointed it at Workday's core AI products (MCP and A2A) as the initial targets.

How it works: engineers collaborate with the agent to build a comprehensive 25–100 case test plan. The agent runs the full suite end-to-end, documents results, and flags bugs  - all autonomously. I've already surfaced real vulnerabilities and bugs that have been reported to the product/engineering teams.

The impact: compresses what would take a human engineer approximately a week into ~2–3 hours. Unlocks vulnerability, penetration, and edge case testing that was practically out of reach before  - making the products more robust for customers.

I'm now scaling this beyond solo operation: sitting down with the MCP and A2A product/engineering teams to get them set up locally. Going from one-man army to 2–3 engineers per team running the harness as an AI engineering force multiplier.

### Evolved to Multi-Agent Orchestration (v2  - Flowise Dev Agent MCP)

The v1 copilot proved the concept. Then I re-architected the entire system into a multi-agent orchestration platform  - 7 specialized agents coordinated through a markdown-driven workflow blueprint, with dynamic skill injection from PostgreSQL, circuit breakers, and a self-improving learning loop.

The key insight: a single monolithic agent hitting 62 API tools creates context pollution. The v2 decomposes into purpose-built agents  - an Architect that gathers requirements one question at a time, a Builder that implements using MCP tools with mandatory read-before-write discipline, a Tester that classifies failures into 5 categories with intelligent routing (known errors go back to Builder, architectural issues escalate to Architect, external deps surface to the developer). Skills aren't baked into prompts anymore  - they're structured documents stored in PostgreSQL, loaded on demand by trigger type, with LRU caching.

The system learns: after each session, a Synthesizer agent analyzes which skills correlated with passing tests, identifies new error patterns, and proposes improvements. A Skill Promoter evaluates candidates against thresholds (minimum 3 sessions, 80% success rate) before promoting to the master tier that all users receive. This creates a learning flywheel that gets smarter with every build session.

Built the entire v2 in a single implementation sprint using Claude Code with subagent-driven development  - 33 tasks across 6 phases, 100 tests passing, 11 Architecture Decision Records documenting every design choice. 4-service Docker Compose deployment with health checks and auto-migration.

### Engineered a Three-Layer Platform Business Model (Extend Pro + Flex Credits)

Discovered that the same tool that accelerates internal development has a direct revenue-generating application for Workday's Extend Pro developer community  - and designed a three-layer platform model around it:

**Session-level self-improvement:** When an Extend Pro customer starts a session, they pull skills as MCP resources via the auth API. As they build, the skills agent in their session identifies gaps and automatically patches session-level skills in real time. The tool gets smarter for that customer within a single session.

**Global promotion across all customers:** The backend Skills Admin agent continuously scans session logs across thousands of parallel customer sessions, identifies the highest-performing skill adjustments, and promotes them to the global master skill set. Every new customer session inherits the accumulated intelligence of every previous session. The more customers use it, the smarter it gets for everyone.

**Tiered flex credit pricing on MCP resources:** Different skills carry different flex credit costs proportional to value delivered  - lightweight documentation skills at ~0.5 credits, core Builder/Architect skills at ~2 credits, premium advanced architecture skills at a higher tier. Workday monetizes proportionally to the sophistication of what's being consumed.

The combined flywheel: customers pull skills → sessions self-improve → best improvements promote globally → global skills become more valuable → premium tiers drive higher credit consumption → more revenue. This is a self-improving product that generates increasing revenue as it scales.

Meeting with Henry (Flowise founder) in early April 2026 to discuss product strategy, the tiered resource pricing model, and monetization for the Extend Pro Workday developer community.

### Aligning for Platform Integration  - Desktop Developer Agent

My agent is now converging with a broader Workday developer tooling initiative. Three independent developer copilots  - the Desktop Developer Agent (for Extend apps), a Workday Orchestrate copilot, and my Flowise Dev Agent  - are being unified under a single orchestration layer. A developer makes a request, and the orchestrator routes it to the right sub-agent based on what they're building.

I've been working with the Desktop Developer Agent team to understand their architecture and align on patterns so my agent can be easily portable as a sub-agent. This is why the v2 was built with clean API boundaries (FastAPI gateway, API key auth, MCP-native design)  - it was architected for exactly this kind of integration. All three teams are preparing to present our individual agents at DEVCON, Workday's annual developer conference.

---

## RESULT

### Product Capability
- **64 MCP tools** (62 Flowise API + 2 skill management) providing complete programmatic control
- **7 specialized agents** with blueprint-driven orchestration replacing monolithic state machine
- **8 custom nodes + 5 patched internals** making Flowise Workday-native
- **7+ dynamic skills** in PostgreSQL with trigger-based loading, LRU caching, and promotion pipeline
- **261 Workday APIs cataloged**, 303 Flowise node schemas documented
- **9-table PostgreSQL schema** tracking sessions, tasks, skills, events, and metrics
- **100 tests passing** across unit, integration, and E2E coverage
- **11 Architecture Decision Records** documenting every major design choice
- **10-20x development speed increase** in POC environments  - leave discovery on day one, return with working demo on day two
- **Self-improving learning loop**  - Synthesizer + Promoter pipeline that promotes high-performing skills across all sessions

### Strategic Impact
- **Fundamentally changed the development paradigm:** Compressed agent development from 6-8 weeks with a dedicated team to under 2 days with a single architect. One architect directs strategy, design, and decisions; the Flowise Dev Agent delivers implementation at machine speed. Same repeatable playbook for every customer deployment
- **Direct competitive weapon in presales:** Enables consultants to build production-ready customer POCs at 10-20x speed. In competitive bid situations, Workday can demonstrate working agentic solutions while competitors are still assembling teams and scoping requirements
- **Directly enables the Accelerator's mission:** Consultants who are domain experts (not AI engineers) can build working agent workflows using the co-pilot
- **Validates the "Custom Agent Builders" specialty:** Jon built the tool that the specialty domain is designed to deliver
- **Community-wide adoption:** Custom nodes pushed upstream to internal Flowise image used by several hundred developers  - training delivered, architecture placemat created, enabling faster Workday-connected agent builds across the entire developer community
- **Secondary use case: testing harness producing real results:** Already surfacing vulnerabilities and bugs in Workday's MCP and A2A products, compressing a week of testing to ~2-3 hours. Scaling to MCP and A2A engineering teams as embedded capability
- **Three-layer platform business model:** Engineered a self-improving revenue flywheel  - session-level skill improvement per customer, global promotion of best patterns across all customers via backend admin agent, and tiered flex credit pricing on MCP resources (0.5 credits for lightweight skills → 2+ credits for advanced architecture). The tool gets smarter as it scales and monetizes proportionally to value delivered. Product strategy session with Flowise founder (Henry) scheduled
- **Built ahead of the product roadmap:** Through collaboration with the Flowise product team and founder, discovered that many custom nodes Jon built independently are on the product team's roadmap for integration into Workday Build (core platform). Jon's existing implementations are now candidates to accelerate product engineering's planned development  - turning months of roadmap work into days of adaptation
- **Converging into Workday's unified developer agent platform:** Three independent copilots (Extend, Orchestrate, Flowise) being unified under a single Desktop Developer Agent orchestration layer. Jon's agent becomes a sub-agent called when developers build in Flowise. Presenting at DEVCON alongside the other teams
- **Demonstrates Workday platform extensibility:** Custom nodes, patched internals, MCP integration  - proof that the platform can be deeply customized for enterprise needs
- **Production-ready deployment:** 4-service Docker Compose with health checks, auto-migration, backup/restore automation (20-backup retention, 4-hour intervals)

### Technical Depth
- Full-stack AI engineering: Python (async), TypeScript (Flowise nodes), Docker (4-service composition), MCP (protocol implementation), Playwright (browser automation), PostgreSQL (asyncpg)
- Multi-agent architecture: 7 agents with BaseAgent ABC, ReAct loops, blueprint-driven routing, 5-category failure classification with circuit breakers and escalation
- Provider-agnostic architecture: ReasoningEngine abstraction supporting Claude, OpenAI, and future providers
- Schema-driven development: 261 + 303 machine-readable specs eliminating API hallucination
- Self-improving system: Synthesis pipeline with threshold-based skill promotion across sessions
- Two-version product evolution: v1 single-agent copilot → v2 multi-agent orchestration platform with learning loop

---

## Why This Matters

This project is the single strongest demonstration of five things:

1. **Zero-to-one product instinct.** Nobody assigned this. I saw a gap  - Flowise was powerful but inaccessible  - and built a complete product to close it. Then I re-architected it into a production-grade multi-agent platform. Same pattern as every major career accomplishment: Wasco (built the automation nobody asked for), Chevron (hacked the cutover tools), AWS (built the Strategic Intelligence Tool), Griz (built the AI creative pipeline).

2. **Technical depth at the frontier.** MCP servers, multi-agent orchestration with blueprint-driven routing, custom TypeScript nodes compiled into Docker images, dynamic skill injection from PostgreSQL, self-improving synthesis loops, provider-agnostic LLM abstraction, 5-category failure classification with circuit breakers. This isn't surface-level AI work  - it's infrastructure engineering for the next generation of enterprise AI tools.

3. **Product thinking applied to AI tools.** The value isn't in the 64 MCP tools. It's in the skills that encode what I learned building ~1,000 agent workflows  - and the system that automatically discovers and promotes new skills. The same way you fine-tune a model with domain data, except the system fine-tunes itself.

4. **"AI that builds AI."** This is the meta-level thesis: AI as infrastructure for building more AI. v2 takes it further  - it's AI that builds AI and learns from the process. It's the logical conclusion of my entire career arc  - from state machines at Wasco to self-improving agentic platforms at Workday.

5. **Force multiplication and competitive advantage.** The 10-20x speed claim isn't about making one engineer faster. It's about compressing 6-8 weeks of traditional agent development to under 2 days, turning architects and delivery teams into AI builders, and giving Workday a direct weapon for winning competitive bids in presales. The v2 architecture, with its learning loop and flex credit scaffolding, is designed to scale this from an internal tool to a customer-facing platform that Jon is taking to market with the Flowise CEO. That's the Accelerator's entire mission in one product.

---

## Interview Positioning

- **"I built a developer co-pilot that compressed agent development from 6-8 weeks with a full team to under 2 days with a single architect. It's a repeatable playbook that lets our consultants build production-ready customer POCs at 10-20x speed and win competitive bids."**
- **"I then re-architected it into a 7-agent orchestration platform with dynamic skill injection, self-improving learning loops, and 100 tests passing"**
- **"I reverse-engineered the Flowise open-source stack, discovered 3x more API endpoints than documented, and built an MCP server giving any AI agent complete programmatic control over the platform"**
- **"v1 was a single copilot with 62 tools. v2 decomposes into 7 specialized agents coordinated through a markdown blueprint  - the Architect gathers requirements, the Builder implements, the Tester classifies failures into 5 categories with intelligent routing"**
- **"The system learns from itself: after each session, a Synthesizer agent identifies winning patterns and promotes high-performing skills across all users. It's not static  - it gets better with every build"**
- **"In POC environments, this delivers 10-20x speed improvement  - teams can leave discovery on day one and return with a working agent demo on day two"**
- **"I refactored it into a testing harness that's already finding real bugs in Workday's core AI products  - compressing a week of testing to 2-3 hours  - and I'm scaling it to the MCP and A2A engineering teams"**
- **"I designed a three-layer platform model: the tool self-improves per session, a backend admin agent promotes the best patterns across all customers globally, and we price MCP resources on a tiered flex credit model  - lightweight skills at 0.5 credits, heavy architecture at 2+. The more customers use it, the smarter and more valuable it becomes"**
- **"I was sole PM, architect, and engineer. ~1,000 hours. Nobody assigned it  - I saw the gap and built the product, then re-architected it"**
- **"This is AI as infrastructure for building more AI  - and a system that improves itself. That's the thesis that defines where enterprise software is heading"**

This project positions you as someone who doesn't just use AI tools  - you build the tools that build AI, and then you build the system that makes those tools learn. That's a fundamentally different value proposition.
