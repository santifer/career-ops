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

# Workday Flowise Development Agent  - Project Details

## Overview

Sole inventor, architect, and developer of "Cursorwise" / Flowise Dev Agent, a full-stack AI development co-pilot that compresses agent development from 6-8 weeks with a dedicated engineering team to under 2 days with a single architect. This is the primary developer tool enabling Workday's internal consultants to build customer POCs at 10-20x speed in presales settings, win competitive bids against other vendors, and deploy production-ready agentic solutions on dramatically compressed timelines. You describe what you want, and the system drives the entire build lifecycle from discovery through testing to production deployment. Built as a one-person product incubation effort with an estimated 500-1,000+ hours of solo development, this project represents the most technically deep AI engineering work in Jon's career. Jon is actively working with the Flowise CEO (Henry) to take this product to market and monetize it through Workday's Extend Pro platform.

**Duration:** August 2025 to present (Q1 2026)
**Role:** Sole Product Manager, AI Software Engineer, and Product Strategist
**Organization:** Workday Professional Services  - Global AI Accelerator (product incubation)
**Team:** Solo ("one-man army")
**Codebase:** Two repositories  - Cursorwise (v1 foundation) and Flowise Dev Agent MCP (v2 multi-agent orchestration)

---

## Business Context

In August 2025, Workday acquired Flowise  - an open-source low-code agent builder built on LangGraph and LlamaIndex. The platform had a nice visual UI, but Jon identified a critical adoption barrier: even with the low-code interface, builders still needed deep AI engineering knowledge to construct effective agent workflows. The learning curve was steep.

The opportunity: use AI to build AI, creating a developer co-pilot that further democratizes agent development in Flowise. If Flowise lowered the barrier from "must write code" to "must understand AI architecture," this tool would lower it again to "describe what you want built."

This directly served the Global AI Accelerator's mandate to scale AI capabilities across 4,000+ consultants. Most consultants are domain experts (HR, Finance, etc.), not AI engineers. A tool that lets architects, product leaders, and delivery teams build working agent workflows without deep engineering expertise would be a force multiplier for the entire Accelerator team.

**The competitive advantage:** In presales settings, Workday consultants traditionally needed a dedicated engineering team and 6-8 weeks to build a customer POC (architecture research, sequential integration builds, debugging, governance, distribution, testing, hardening). This tool replaces that entire cycle with a single architect working alongside the Flowise Dev Agent, producing a production-ready demo in under 2 days using the same repeatable playbook for every customer deployment. This speed-to-value advantage is a direct weapon for winning competitive bids against other vendors, because Workday can demonstrate working agentic solutions while competitors are still scoping requirements.

---

## What Was Built

### System Architecture  - Three Integrated Platforms

**1. MCP Server (62 Tools via FastMCP)**

Built a comprehensive Model Context Protocol server exposing the entire Flowise REST API as tool calls. This gives any AI agent (via Cursor IDE or other MCP clients) full programmatic control over Flowise:

- **62 tools across 18 groups:** System (ping, nodes), Chatflows (full CRUD), Agentflows (full CRUD + generate), Predictions, Assistants, Tools, Variables, Document Stores, Doc Chunks, Doc Operations, Chat Messages, Feedback, Leads, Vectors, History, Credentials, Validation/Introspection, Marketplace
- **Async httpx client** with lifespan-managed connections and corporate proxy bypass
- **API discovery:** Started from 20 documented public APIs, reverse-engineered the open-source Flowise codebase to discover and expose 60+ endpoints total  - many undocumented but essential for programmatic flow building
- **Human-in-the-loop support:** `resume_human_input` tool for pausing/resuming agentflow execution at approval gates

**2. Custom Flowise Docker Image (8 Custom Nodes + 5 Patched Internals)**

Extended the base Flowise Docker image with Workday-native capabilities compiled and injected at build time:

**Custom Nodes:**
- **CIS LLM Node**  - Connects to Workday's internal CIS inference gateway (1,425+ models including Gemini, Claude, GPT). Uses Feature Key auth (AD username), no external API keys needed
- **CIS ChatModel Node**  - Chat-optimized CIS node with streaming, temperature, model selection. Drop-in ChatOpenAI replacement
- **WorkdayOAuth2 Credential**  - OAuth2 credential type for production Workday tenants, auto-populated by OAuth automation scripts
- **WorkdayOAuth2SUV Credential**  - Separate credential type for SUV (sandbox) tenants with isolated token lifecycle
- **WorkdayMCP Tool**  - Calls Workday APIs from inside agentflows via MCP protocol, extracts WIDs from tool-catalog.json
- **WorkdayMCP_SUV Tool**  - Same as WorkdayMCP routed through SUV tenant credentials
- **Parallel Execution Node**  - True parallel execution for agentflows via Promise.all concurrency
- **HumanInput Node**  - Human-in-the-loop gate that pauses agentflow execution pending human approval

**Patched Flowise Internals:**
- `buildAgentflow.js`  - Parallel execution handler enabling the Parallel node's Promise.all concurrency
- `ChatOpenAI.ts`  - Extended for CIS endpoint routing and custom parameter passthrough
- `ExecuteFlows.ts`  - Cross-flow execution support (one agentflow invoking another)
- `DirectReply.ts`  - Enhanced response handling for structured output in agentflow pipelines
- `HumanInput.ts`  - HITL interrupt node with iterative loop-back support

**Community Adoption & Enablement:**

The custom nodes were not kept local  - Jon pushed them upstream into the internal Flowise Docker image used by the entire Workday Flowise developer community (several hundred developers). This means every developer building agents on the internal Flowise platform now has access to CIS inference gateway connectivity, Workday MCP tool nodes, OAuth2 credential types, parallel execution, and HITL capabilities out of the box.

Jon also:
- **Created a visual architecture placemat** documenting all 8 custom nodes + 5 patched internals, organized by function (Brain: CIS nodes → Hands: WorkdayMCP tool nodes → Keys: OAuth2 credential types → Flow Control: Parallel/HITL/ExecuteFlow → Under the Hood: patched internals), with a wiring example showing how they compose in a Workday agentflow
- **Delivered training sessions** to the Flowise community on how to use the custom nodes
- **Created and delivered the Flowise Introduction KSS (March 2026):** A 17-slide enablement presentation delivered to 100+ AI practitioners in the KSS AI subgroup (Knowledge Sharing Session). Covered the full Flowise platform (three visual builders: Assistant, Chatflow, Agentflow V2), getting started at Workday (prerequisites, Docker setup, CIS integration), three live demos of increasing complexity (Simple CIS Chatbot → Workday API Agent calling Get Workers via ASOR → Multi-Agent Orchestration), ASOR 3P agent registration walkthrough, and the Workday Build integration roadmap (MFE in AppBuilder → Analyst Day Apr 2026 → DevCon EA Jun 2026 → GA Sep 2026 R2). Created as a reusable enablement asset for the broader AI practitioner community to get upskilled on custom agent development.
- **Impact:** Several hundred developers can now build Workday-connected agents faster and more efficiently, use internal CIS tooling behind corporate proxies, connect to Workday APIs via MCP, and store/manage OAuth2 credentials  - capabilities that didn't exist before Jon built and contributed these nodes

**3. Workday Integration Infrastructure**

Complete OAuth2 automation and agent lifecycle management:
- **Playwright-based OAuth automation:** Automated browser login for Workday OAuth2 authorization code flow
- **ASOR agent registration via API:** Programmatic agent registration, skill configuration, WID lookup, activation
- **Per-agent credential management:** Each registered agent gets its own folder with registration.json and credentials.json
- **Token refresh cycles:** Automated token lifecycle from Workday → local storage → Flowise variables
- **Schema library:** 261 Workday MCP tools cataloged with WIDs, 50 REST OpenAPI specifications, 55 SOAP WSDL specifications, 303 Flowise node schemas

### The Intelligence Layer  - 4 Agent Skills

What makes this more than a wrapper: four specialized skills that encode operational intelligence refined through ~1,000 real-world Flowise build scenarios:

**1. flowise-builder**  - The core build skill. Operating playbook for constructing chatflows and agentflows via MCP. Includes: phase-structured build loop (discover → plan → patch → test → converge), hard rules (credential binding in TWO places, read-before-write, one-change-per-iteration), validation workflow, backup/restore protocol. References: credential cheatsheet, error diagnosis (23 error patterns with cascade analysis), data safety rules, orchestration patterns, API integration patterns.

**2. cis-reference**  - CIS API configuration patterns. 80+ tested patterns from Tiers 1-4 stress testing. Covers: Custom Tool sandbox rules, agentflow architecture, provider compatibility matrix, known bugs, patched node behaviors.

**3. workday-auth**  - Interactive OAuth setup automation. API Client registration, ASOR agent registration, WID lookup from tool-catalog.json, token lifecycle management, multi-tenant support.

**4. workday-troubleshooting**  - Runtime error diagnosis for Workday integrations. Covers: 403 forbidden errors, S22 permission errors, Business Process Security Policy triage, credential expiry detection.

### LangGraph Co-Pilot Agent (The "Brain")

A LangGraph state machine implementing the full build lifecycle with human-in-the-loop gates:

```
START → discover → check_credentials → plan → [HITL: plan approval] → patch → test → converge → [HITL: result review] → END
```

**State machine features:**
- **Discover phase:** Read-only MCP calls across all registered domains. Inspects existing chatflows, available node types, credentials, marketplace templates
- **Plan phase:** Structured plan with Goal, Inputs, Outputs, Constraints, Success Criteria, Pattern, Action. No tool calls  - pure reasoning
- **Credential check:** Automatic detection of missing credentials with HITL interrupt for developer to provide IDs
- **Patch phase:** Minimal writes with mandatory read-before-write, one-change-per-iteration, change summary before every update
- **Test phase:** Automated testing via create_prediction (happy path + edge cases), with configurable pass@k reliability testing (1-5 trials)
- **Converge phase:** Evaluates Definition of Done, routes back to plan if not met
- **Human-in-the-loop:** Plan approval and result review interrupts. Developer can approve, edit, or iterate

**Provider-agnostic reasoning engine:** Abstract ReasoningEngine base class with Claude (Anthropic SDK) and OpenAI implementations. New providers plug in without touching orchestration logic.

**FastAPI service layer:** HTTP API wrapping the LangGraph graph with session management, interrupt handling, and persistent thread state.

### Testing & Research Artifacts

The `Testing/` and `temp-scripts/` directories contain extensive research and development artifacts documenting the iterative build process:

- **A2A Discovery:** Agent-to-Agent protocol research, gateway discovery, orchestration testing
- **ASOR-MCP Discovery:** MCP API schema discovery, tool catalog mining, Workday Graph API (Trident) exploration
- **Job Change Discovery:** End-to-end agent development for Workday job change workflows
- **Agentflow Migration:** Migration patterns from chatflows to agentflow architecture
- **CIS Observations:** CIS inference gateway behavior documentation
- **150+ test/build scripts** in temp-scripts: parse, build, discover, extract, validate scripts covering every aspect of the Flowise + Workday integration surface

---

## v2 Architecture: Flowise Dev Agent MCP  - Multi-Agent Orchestration System

The v2 represents a fundamental architectural evolution from v1's single LangGraph state machine into a multi-agent orchestration system with dynamic skill injection, PostgreSQL-backed persistence, and a self-improving learning loop. This is the architecture aligned with the Extend Pro monetization path.

**Repository:** Flowise Dev Agent MCP (hosted on Workday GHE)
**Foundation:** Forked from the Beads architecture (session management, task coordination, multi-agent persistence patterns), with 62 MCP tools and operational intelligence ported from Cursorwise v1.

### Core Architectural Shift: Blueprint-Driven Orchestration

v1 used a hardcoded LangGraph state machine (discover → plan → patch → test → converge). v2 replaces this with a **markdown workflow blueprint**  - a human-readable document that defines the entire workflow as parseable steps. The `BlueprintParser` reads the markdown and produces a `Workflow` object that the Orchestrator executes.

**Default Blueprint  - 9 Steps:**
```
Understand → Discover → Plan → Patch → Validate → Test → Document → Converge → Synthesis
```

Each step declares: assigned agent, HITL gate (yes/no), required/on-demand skills, exit condition, max iterations, failure routes, and loopback targets. The blueprint is a configuration file, not code  - changing the workflow means editing a markdown file, not rewriting orchestration logic.

### 7 Specialized Agents

v1 had one monolithic agent doing everything. v2 decomposes into 7 purpose-built agents, each operating on specific workflow steps:

**1. Orchestrator Agent**  - Routes work, manages state, enforces circuit breakers (50 soft / 100 hard LLM call budget), handles HITL gates. Does not do domain work  - pure coordination. Classifies test failures into 5 categories (A-E) with intelligent routing and escalation.

**2. Architect Agent**  - Owns Understand, Discover, and Plan steps. Gathers requirements (one question per turn), clarifies scope, designs solutions using MCP tool discovery, presents build plans for human approval. Scales from quick fixes to complex multi-agent orchestration designs.

**3. Builder Agent**  - Owns Discover, Patch, and Validate steps. Implements solutions using 62 Flowise APIs. Inline unit testing with mandatory read-before-write discipline. Loads credential-cheatsheet, error-diagnosis, and a2a-patterns skills on demand.

**4. Tester Agent**  - Owns Test step. Runs E2E test scenarios in sequence: trivial → happy_path → edge_case. 5-category failure classification with regex-based pattern matching (11 known error patterns for Category A, 6 external dependency patterns for Category D). Session-isolated testing via create_prediction with unique session IDs.

**5. Documentation Agent**  - Owns Document step. Produces 6 artifacts: decision log, change log, test traceability, deferred scope, flow state snapshot, and user-facing documentation. Serves three audiences: developer, Synthesizer agent, and Tester agent.

**6. Resource Manager Agent**  - Owns Update and Promote steps. Writes skill updates to PostgreSQL, manages master ↔ session tier lifecycle. Executes promotion decisions from the Skill Promoter.

**7. Synthesizer Agent**  - Owns Synthesis step (runs asynchronously after session completion). Analyzes completed sessions for skill improvement opportunities: which skills correlated with passing tests, new error patterns, builder patterns worth documenting, underperforming skills needing trigger refinement.

### Dynamic Skill Injection (Pillar 1)

Skills are **not baked into prompts**. They're structured markdown documents stored in PostgreSQL, loaded on demand during agent execution:

- **SkillStore**  - asyncpg-backed CRUD for `master_skills` table with upsert, listing by agent, and caching
- **SkillInjector**  - Trigger-based loading with LRU cache. `load_for_agent()` fetches always-on skills; `load_skill()` fetches on-demand skills. `build_system_prompt()` assembles agent identity + loaded skills into a coherent system prompt
- **Two resource tiers (scaffolded):** Master tier (global, updated by Synthesizer) and Session tier (per-user variations, scaffolded for future flex credit system)
- **7 seed skills** ported from Cursorwise: flowise-builder-core, credential-cheatsheet, error-diagnosis, data-safety, flowise-builder-guide, flowise-node-reference, a2a-orchestration-patterns

### Human-in-the-Loop (Pillar 2)

Collaborative by design  - not fully autonomous. HITL gates at: Understand (requirement gathering), Plan (developer approves design), Converge (developer accepts or requests changes). The `HITLManager` in the orchestrator layer handles interrupt/resume semantics. Budget checkpoints at 50 (soft) and 100 (hard) LLM calls surface cost decisions to the user.

### Continuous Improvement Loop (Pillar 3)

A backend admin process that runs after session completion:

- **SessionScanner**  - Finds completed, unscanned sessions
- **SynthesisPipeline**  - Orchestrates: scan → gather session data (events, metrics, failures) → Synthesizer analyzes → Resource Manager applies recommendations → mark scanned
- **SkillPromoter**  - Threshold-based evaluation: minimum 3 sessions + 80% success rate for skill promotion to master tier
- **AdminScheduler**  - Periodic execution of synthesis cycles

This creates a learning flywheel: sessions produce data → data feeds the Synthesizer → Synthesizer proposes skill improvements → improvements flow to all future sessions.

### Production-Ready Infrastructure (Pillar 4)

**Docker Compose  - 4 Services:**
- `postgres` (agent database, port 5433)  - 9 tables: sessions, tasks, task_dependencies, master_skills, session_skills, workflow_state, agent_events, skill_metrics, schema_version
- `flowise` (patched image with CIS nodes, port 3002)  - Same custom nodes and patches as v1
- `flowise-postgres` (Flowise data, isolated from agent DB)  - PostgreSQL 16 with named volumes
- `agent` (FastAPI + MCP server, port 8006)  - API key authentication middleware, health checks, auto-migration

**64 MCP Tools**  - 62 Flowise API tools (ported from v1) + 2 skill management tools (`list_skills`, `get_skill`)

**100 Tests**  - Unit, integration, and E2E coverage across: agents (architect, builder, tester, orchestrator, documentation, resource_manager, synthesizer), orchestrator infrastructure (blueprint, state, HITL, events, registry), skills (store, injector, models, seed, promoter), admin (scheduler, pipeline, scanner), API, and config.

**11 Architecture Decision Records (ADRs)**  - Documenting every major design choice: port allocation, patched Flowise image, PostgreSQL-backed Flowise, backup/restore strategy, retention policy, self-contained skill repo, skill loading model, builder skill refactor, architect requirement gathering, tester test strategy, documentation templates.

### BaseAgent Framework  - ReAct Loop

All 7 agents inherit from `BaseAgent`, which provides:
- `run()`  - Loads always-on + on-demand skills, executes agent logic, records completion events
- `react_loop()`  - ReAct reasoning loop (LLM → tool calls → LLM) with configurable max rounds (default 15). Builds system prompt dynamically from loaded skills.
- Provider-agnostic via `ReasoningEngine` abstraction (Claude + OpenAI implementations, same as v1)

### v1 → v2 Product Arc

| Dimension | v1 (Cursorwise) | v2 (Flowise Dev Agent MCP) |
|-----------|-----------------|---------------------------|
| Orchestration | LangGraph state machine (hardcoded) | Markdown blueprint (configurable) |
| Agents | 1 monolithic agent | 7 specialized agents |
| Skills | 4 file-based skills (manual loading) | 7+ DB-backed skills (trigger-based, cached) |
| Persistence | In-memory + Flowise API | PostgreSQL (9 tables, sessions, state, metrics) |
| Testing | Manual via create_prediction | TesterAgent with 5-category failure classification |
| Improvement | Manual skill editing | Automated synthesis loop (Synthesizer + Promoter) |
| Deployment | Local Python + Docker | 4-service Docker Compose with health checks |
| MCP Tools | 62 | 64 (62 + 2 skill tools) |
| Test Suite | Ad hoc | 100 tests (pytest + pytest-asyncio) |
| Architecture Docs | README only | 11 ADRs + 6-phase implementation plans + roadmap |

---

### Secondary Use Case: AI-Powered Automated Testing Harness

Beyond the primary developer co-pilot function, Jon discovered a high-value secondary use case: using the same platform for full end-to-end automated testing of Workday's core AI products (MCP and A2A protocol implementations). This capability emerged organically from the platform's ability to programmatically build, invoke, and validate agent workflows.

**How it works:** Engineers collaborate with the agent to build a comprehensive test plan (25–100 cases). The agent then runs the full suite end-to-end, documents results, and flags bugs  - all autonomously without touching the keyboard.

**Initial targets:** Workday's core AI products  - MCP and A2A (Agent-to-Agent) protocol implementations.

**Results already achieved:**
- Real vulnerabilities and bugs surfaced and reported to product/engineering teams
- Testing compressed from what would take a human engineer approximately one week down to ~2–3 hours
- Edge case, vulnerability, and penetration testing that was previously impractical is now systematically executable
- Dramatically accelerates release cycles  - engineers focus on innovation instead of swirling on fixing issues

**Scaling plan (in progress as of late March 2026):**
- Sitting down with MCP and A2A product/engineering teams to get them set up locally with the agent
- Goal: go from Jon as sole operator to 2–3 engineers per team running it as an AI engineering force multiplier
- Transition from "one-man army" to embedded team capability

### Monetization & Product Strategy: Extend Pro  - Three-Layer Platform Model

Jon has engineered a mechanism for the tool to serve Workday's Extend Pro developer community (external customers who build custom agents on the Workday platform). The product vision operates on three interconnected layers:

**Layer 1  - Session-Level Self-Improvement:**
When an Extend Pro customer activates a session, they pull down agent skills as MCP resources via the authenticated API. As they build, the skills agent within their session identifies gaps in the current skills  - a credential pattern not covered, an error not in the diagnosis guide, a node configuration not documented  - and automatically patches the session-level skills in real time. Those improvements are logged to that customer's session database (`session_skills` table). So even within a single build session, the tool is getting smarter for that specific customer's context.

**Layer 2  - Global Promotion via Backend Admin Agent:**
The Synthesizer/Skills Admin agent continuously scans session logs across all customers  - potentially thousands of sessions running in parallel. It identifies which session-level skill adjustments are producing the best outcomes (highest test pass rates, fewest retries, fastest builds). The best-performing adjustments get promoted to the global master skill set (`master_skills` table). When any new customer pulls down a fresh session, they receive the accumulated intelligence of every previous customer's session. This is the flywheel: the more customers use it, the smarter the global skill set becomes, which makes the tool more valuable for the next customer.

**Layer 3  - Tiered Flex Credit Pricing on MCP Resources:**
The monetization isn't flat  - it's priced at the individual MCP resource level based on the skill tier being consumed. Different skills carry different flex credit costs proportional to the value they deliver:

- **Lightweight skills** (e.g., documentation templates): ~0.5 flex credits  - basic operational support
- **Core development skills** (e.g., Flowise Builder, Flowise Architect skills): ~2 flex credits  - the primary development acceleration
- **Premium/advanced skills** (e.g., heavy architecture, complex orchestration patterns): higher credit tier  - deep architectural guidance that requires richer MCP resources

This tiered pricing means Workday monetizes proportionally to the sophistication of what's being consumed. A customer doing basic flow documentation pays less than one designing a complex multi-agent orchestration system. And as the global skill set improves through Layer 2, the premium tiers become more valuable  - driving higher credit consumption.

**The combined flywheel:** Customers pull skills → sessions self-improve → best improvements promote globally → global skills get better → premium tiers become more valuable → higher flex credit consumption → more revenue. This is a self-improving product that generates increasing revenue as it scales.

**Product strategy session with Henry (Flowise founder)** scheduled for early April 2026 to discuss product strategy and monetization for the Extend Pro Workday developer community, integration with the broader Flowise commercial roadmap, and the tiered resource pricing model.

### Product Roadmap Convergence  - Custom Nodes → Core Product

Through collaboration with the Flowise product team and eventually with Henry (Flowise founder), Jon discovered that many of the custom nodes he built independently  - CIS integration, WorkdayMCP connectivity, credential management, proxy handling  - are on the Flowise product team's roadmap for integration into Workday's core platform ("Workday Build"). The product team is currently working on integrating Flowise into the Workday stack, and their planned development overlaps significantly with work Jon has already completed.

**What this means:** Jon built ahead of the product roadmap in a vacuum. The custom nodes he developed for the internal Flowise community (several hundred developers) and pushed upstream to the internal Flowise image are now candidates to accelerate the product team's own roadmap items  - potentially turning months of planned development into days of adaptation from Jon's existing implementations.

**Current status (late March 2026):** Working with the Flowise product teams to map synergies between Jon's existing custom nodes and their roadmap items. The goal is to identify which of Jon's implementations can be directly leveraged or adapted to accelerate the core product integration of Flowise into the Workday stack.

### Platform Integration  - Desktop Developer Agent & Multi-Product Orchestration

Jon's Flowise Dev Agent is converging with a broader Workday developer tooling initiative. Three independent developer copilot efforts are being unified under a single orchestration layer:

**The Three Sub-Agents:**

1. **Desktop Developer Agent (Extend)**  - An internal team is building a desktop developer agent for Workday's Build/Extend product. It serves as a copilot helping developers build Extend apps. Architecture includes a Browser layer (Developer Agent Web with Build Developer UI, App Builder Web SDK, Orchestration Agent), a Developer Server / Extend Cloud Services layer (Orchestrator routing to sub-agents  - Build/Update, PRD UI Page, Admin/Integration  - each with Toolset APIs, connected to CIS via Model Provider API), and a Desktop layer (Developer Agent Desktop with MCP Server, CLI, Build Developer interface).

2. **Workday Orchestrate Copilot**  - A separate team is building a developer copilot for the Workday Orchestrate product.

3. **Flowise Dev Agent (Jon's product)**  - The agent-building copilot for Flowise. This would live as a sub-agent that the Desktop Developer Agent's Orchestrator calls when a developer's request involves building in Flowise.

**The Unified Vision:** A single developer entry point  - the Desktop Developer Agent  - with an orchestration layer that routes requests to the correct sub-agent based on what the developer is trying to build. Request to build an Extend app → routes to the Extend sub-agent. Request to build an agent in Flowise → routes to Jon's Flowise Dev Agent. Request to build an orchestration → routes to the Orchestrate copilot.

**Jon's role:** Working with the Desktop Developer Agent team to understand their architecture and align on architectural patterns so the Flowise Dev Agent can be easily portable as a sub-agent at a later point. This explains the v2's emphasis on clean API boundaries (FastAPI gateway, API key auth middleware) and MCP-native design  - it was architected for exactly this kind of integration.

**DEVCON Presentation:** All three teams are preparing to present their individual agents at DEVCON (Workday's annual developer conference). This is the public debut of the unified developer agent vision.

---

## Technical Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| MCP Server | FastMCP | 62 tools registered via stdio pipe to Cursor IDE |
| HTTP Client | httpx (async) | Non-blocking Flowise REST client with connection reuse and proxy bypass |
| OAuth Server | FastAPI + Uvicorn | HTTPS callback server for Workday OAuth2 token exchange (port 8000) |
| Browser Automation | Playwright | Automated Workday login for OAuth authorization code flow |
| LLM Abstraction | Anthropic SDK + OpenAI SDK | Provider-agnostic ReasoningEngine with tool calling |
| Co-Pilot Agent | LangGraph | State machine: discover → plan → patch → test → converge (with HITL gates) |
| Validation | Pydantic + pydantic-settings | Configuration, environment parsing, data models |
| Container | Docker Compose | Flowise + OAuth server + PostgreSQL in unified image |
| Database | PostgreSQL | Persistent Flowise storage |
| Build | esbuild | TypeScript compilation of custom nodes at Docker build time |
| Runtime | Python 3.12+ | Async-first with type hints throughout |

---

## Scale & Scope Metrics

- **62 MCP tools** covering entire Flowise REST API (18 tool groups)
- **8 custom Flowise nodes** compiled and injected at Docker build time
- **5 patched Flowise internals** extending core platform capabilities
- **4 agent skills** encoding ~1,000 real-world build scenarios
- **261 Workday MCP tools** cataloged with WIDs and functional areas
- **105 REST + SOAP API specifications** indexed (50 OpenAPI + 55 WSDL)
- **303 Flowise node schemas** documented (inputs, credentials, base classes, 24 categories)
- **23 error patterns** with cascade analysis in error diagnosis reference
- **80+ CIS patterns** tested across Tiers 1-4 stress testing
- **150+ test/research scripts** documenting iterative development
- **10-20x development speed increase** in POC environments (concept to working agentic workflow)
- **~1,000 hours** of solo development investment

---

## Innovation & Differentiation

**What makes this novel:**

1. **A new development paradigm: Speed to Value.** Traditional agent development requires a dedicated engineering team, 6-8 weeks of sequential work (architecture research, integration builds, debugging, governance, distribution, testing, hardening), and is fragile, siloed, and hard to replicate for the next customer. The Flowise Dev Agent replaces this with a single human architect directing an AI agent that delivers at machine speed. Result: under 2 days, one architect, repeatable playbook for every customer deployment. Not boilerplate; the agent has learned enterprise patterns from ~1,000 real-world build scenarios.

2. **Agent that builds agents.** This is a meta-level tool, AI as infrastructure for building more AI. The same LangGraph state machine that powers enterprise agent workflows is used to construct those workflows programmatically.

3. **MCP as the control plane.** By exposing the entire Flowise API surface as MCP tools, any AI agent can now build, test, and deploy Flowise agents without human UI interaction. This is not a wrapper, it's a new development paradigm.

4. **Operational intelligence, not just API access.** The 4 skills encode hard-won knowledge from ~1,000 build scenarios: credential binding rules, error diagnosis heuristics, CIS configuration patterns, orchestration patterns. The agent doesn't guess, it knows.

5. **Workday-native from Day One.** The custom Docker image speaks Workday natively: CIS inference gateway (1,425+ models), WorkdayMCP tools, OAuth2 automation, ASOR agent registration. One `docker compose up` and you have Flowise connected to Workday.

6. **Full end-to-end automated testing.** A secondary use case: the same tool that builds agents can validate them, compressing ~1 week of manual MCP/A2A testing to ~2-3 hours and surfacing real bugs to product/engineering. Positions the tool as both a development accelerator and a QA platform.

7. **Presales weapon.** In competitive bid situations, Workday can demonstrate working production-ready agentic solutions in under 2 days while competitors are still assembling teams and scoping requirements. This is a direct competitive differentiator for winning enterprise deals.

---

## Capability Clusters Demonstrated

1. **Product Strategy & Go-to-Market**  - Identified the market gap (Flowise learning curve), defined the product vision (developer co-pilot that compresses 6-8 weeks to <2 days), articulated the competitive value (10-20x presales POC speed, competitive bid advantage), positioned for internal adoption and external commercialization with Flowise CEO

2. **AI/Agentic Development & Architecture**  - Built the entire stack: MCP server (FastMCP), LangGraph state machine, custom Flowise nodes (TypeScript), patched platform internals, Docker image composition, async Python, provider-agnostic LLM abstraction. Deep expertise in MCP protocol, LangGraph, LlamaIndex ecosystem.

3. **Customer Discovery & Executive Engagement**  - Identified the user persona (consultants who are domain experts, not AI engineers), validated the 10-20x POC speed claim through iterative build scenarios, discovered secondary use case (automated testing harness for MCP/A2A) through hands-on usage

4. **Operational Scaling & Team Design**  - Designed the skills architecture for knowledge transfer (operational playbooks, not tribal knowledge). Built schema-driven development approach (261 Workday APIs, 303 node schemas) enabling anyone to build without memorizing API surfaces.

5. **Product Incubation & Commercialization**  - Solo end-to-end product development from research through architecture through implementation. MIT-licensed. Two-version evolution (v1 Cursorwise to v2 Flowise Dev Agent MCP). Actively working with Flowise CEO to take the product to market through Extend Pro, and collaborating with internal teams on testing harness deployment to MCP/A2A engineering.

---

## Notes for Context

- This is Jon's solo product incubation project, he was PM, AI engineer, and product strategist
- The "zero-to-one" pattern: nobody asked for this. Jon saw the gap, started building, and created a product
- The technical depth here is unmatched in Jon's portfolio: MCP server development, LangGraph state machines, custom TypeScript node development, Docker image composition, Playwright automation, provider-agnostic LLM abstraction
- The LinkedIn post framing ("AI that builds AI") is the elevator pitch
- v2 repo (Flowise Dev Agent MCP) represents the evolution to multi-agent orchestration with 7 specialized agents, dynamic skill injection, and a self-improving learning loop
- **Primary framing: developer co-pilot** that compresses 6-8 weeks of traditional agent development to <2 days, enabling 10-20x POC speed in presales, competitive bid wins, and production-ready agentic solutions on compressed timelines
- **Secondary framing: automated testing harness** for MCP/A2A endpoints (1 week to 2-3 hours), which Jon discovered as a secondary use case
- **Go-to-market: Jon is actively working with the Flowise CEO (Henry)** to commercialize through Extend Pro with the three-layer monetization model
- This project directly demonstrates the "Custom Agent Builders" specialty Jon owns on the Accelerator team
