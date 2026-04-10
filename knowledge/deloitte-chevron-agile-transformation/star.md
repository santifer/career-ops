---
company: Deloitte
project: Chevron Agile Transformation
dates: 2019-2022
archetypes:
  - AI Transformation Lead
  - AI Consultant / Strategy
capabilities:
  - agile-transformation
  - program-management
  - ops-scaling
hero_metrics:
  - 500+ people
  - 36+ scrum teams
  - real-time CIO visibility
  - 1200+ features tracked
---

# Chevron Scaled Agile Transformation: STAR Framework (Interview)

## THE CHALLENGE (Situation)

I was managing multiple projects simultaneously on Chevron's $100M/year enterprise ERP transformation program. The quality management products were delivering value. The data migration was on track. But I kept running into the same structural problem: the entire 500+ person program was still running waterfall, and there was no delivery architecture connecting requirements to build.

Here's what that looked like:
- Requirements gathering phase that lasted months
- No traceability from business requirements through design decisions to development work
- Long development cycles with minimal feedback
- Issues discovered late (sometimes too late to fix)
- Limited stakeholder visibility until the very end
- No standardized way to decompose design decisions into development artifacts
- No dependency management across teams
- Slow feedback loops

For a transformation as complex and ambitious as Chevron's, waterfall was choking the program. Business requirements were evolving as people understood what the platform could enable. Different workstreams had dependencies that needed real-time coordination, not monthly status meetings. Stakeholders needed to see progress, not promises. Teams needed to adapt faster. And nobody had defined how detailed design transitions into build, or how 36 teams coordinate their work without stepping on each other.

The industry was moving toward Agile. But Agile as taught in textbooks works for small teams building single products. Chevron's challenge: scale Agile to 500 people working on an enterprise transformation where a single misstep could break the program. And beyond Agile methodology, the program needed an entire delivery architecture: how requirements flow into design decisions, how design decisions get dispositioned into development work, how development is tracked and governed, and how all of that rolls up into program-level visibility.

I was asked to design the entire operating engine. I joined the Joint Operations Committee and took on a director-level role designing how the program works from end to end.

---

## THE ACTION (Task)

I took on four interconnected challenges:

### 1. Designing the End-to-End Delivery Architecture

Before deploying Agile, I had to solve a more fundamental problem: there was no framework for how detailed design transitions into build. Teams had requirements documents, but no structured path from requirements to delivered software. I designed the entire delivery architecture.

**Traceability Framework:**
I architected the end-to-end traceability chain that connected business intent to delivered software:

Product Requirements --> Key Design Decisions --> RICEF Objects --> ADO Features & Stories --> Delivered Software

**How it worked:**
- **Product Requirements Backlog:** I established the intake and backlog management process. Each business requirement was logged, prioritized, and tracked through disposition.
- **Key Design Decisions (KDDs):** Requirements were packaged into key design decisions. Each KDD captured the business need, evaluated options, and documented the chosen approach. This gave the program traceability of decision-making, so anyone could understand why something was built a certain way.
- **RICEF Disposition:** Each KDD was dispositioned into one or more RICEF objects (Reports, Interfaces, Conversions, Enhancements, Forms) for custom development, or flagged as standard configuration. This was the critical handoff from "what we decided" to "what we build."
- **Standardized ADO Templates:** For each RICEF object type, I architected a standard set of Azure DevOps features and stories that teams could import into their backlog and customize. These templates tracked the full lifecycle: functional spec development, technical spec development, build execution, and testing. This meant all 36 scrum teams were using a consistent delivery framework while retaining the flexibility to customize for their specific items.

At any point, leadership could trace a delivered feature back through the technical spec, functional spec, RICEF object, key design decision, and original product requirement. Nothing was built without a documented decision chain.

**Governance Framework:**
I architected a governance framework that provided traceability of decision-making across the program. Decision authority was clearly defined at each level. Every key design decision was documented with rationale, alternatives considered, and approval chain. Governance gates existed at critical transitions: requirements to design, design to build, build to test, test to release.

**Architectural Runway:**
I implemented the Architectural Runway, a recurring architectural governance series comprising key leaders from all functional pillars and the program's head architects. This series evaluated cross-cutting technical decisions affecting multiple scrum teams, ensured architectural consistency, resolved technical conflicts before they became blockers, and maintained a forward-looking architectural backlog so infrastructure and platform work stayed ahead of feature delivery.

### 2. Designing the Scaled Agile Operating Model

With the delivery architecture in place, I designed the organizational structure to execute it at scale.

**36+ Scrum Teams Organized by Functional Pillar:**
- Materials Management pillar: multiple scrum teams
- Finance pillar: multiple scrum teams
- Hydrocarbon Value Chain pillar: multiple scrum teams
- Asset Management pillar: multiple scrum teams
- Plus supporting teams (infrastructure, quality, etc.)

Each team had 6-10 people, a product owner, and a scrum master. Each team imported the standardized ADO templates for their RICEF objects and customized them for their specific work items.

**Layered Coordination:**
- Teams worked in 2-week sprints
- Agile Release Trains (ARTs) grouped 5-10 teams by pillar and coordinated their work
- ART leads managed dependencies within pillars
- Solution Train coordinated across pillars
- Program steering committee (CIO + pillar leads) made program-level decisions
- Architectural Runway provided cross-cutting technical governance

**Dependency Framework:**
I architected a dependency management framework across all 36 scrum teams. Each sprint planning cycle, teams identified dependencies on other teams' deliverables. Dependencies were logged in ADO and visualized in the integrated project plan. During quarterly PI planning events (all 500+ people in the room), dependencies were explicitly negotiated between teams and ARTs. Dependencies at risk triggered automatic escalation to ART leads, and cross-ART dependencies escalated to the Solution Train level.

With 36 teams working in parallel, a single missed dependency could cascade into delays across multiple pillars. This framework made those risks visible and manageable.

**Governance Without Killing Agility:**
The risk with scaling Agile: you add so many governance gates that you eliminate the speed benefits. I had to find the balance:
- Clear decision authority at each level (product owner, architecture review board, steering committee, CIO)
- Clear escalation paths with no politics or ambiguity
- Monthly release cadence coordinated across all 36 teams
- Architectural Runway keeping technical decisions aligned without bottlenecking teams

**Metrics & Incentives Aligned to Delivery:**
I established metrics that would drive delivery behavior:
- Velocity (features delivered per sprint, not features planned)
- Quality (defects, test pass rates)
- Cycle time (days from story to production)
- Dependency impact (did my team's delays block other teams)
- Traceability coverage (percentage of items with full requirement-to-delivery chain)

Not "how much was planned in the phase," but "what was actually delivered in this sprint?"

### 3. Building the Integrated Visibility System

The delivery architecture and operating model only work if you can see what's happening. With 500 people across 36 teams, you can't rely on status meetings. Everything had to map into the integrated project plan.

I built an integrated data pipeline: Azure DevOps --> Custom VBA --> Microsoft Project --> Power BI

**Azure DevOps Layer:**
Teams tracked thousands of stories, features, and epics using the standardized RICEF templates. Real-time updates as work moved through sprints. Full traceability metadata embedded in each work item.

**VBA Transformation Layer (The Key Innovation):**
Azure DevOps data by itself doesn't tell the program story. I built a VBA application that:
- Extracted raw data from Azure DevOps (tens of thousands of work items)
- Applied business logic to aggregate and enrich (stories to features to epics, RICEF rollups, dependency mapping)
- Calculated derived metrics (velocity trends, cycle time, predictive completion dates)
- Prepared data for project management and analytics consumption
- Batch refresh 2x daily (morning and afternoon)

This middle layer translated granular team-level data into program-level insights.

**Microsoft Project Layer:**
Mapped every story 1:1 to the integrated project plan. Real-time status synchronized from Azure DevOps. Assignment tracking. Critical path highlighting. Dependency visualization across teams and releases.

**Power BI Dashboarding:**
I built 5+ distinct dashboards for different personas:
- **CIO Dashboard:** Program health at a glance. Are we on track? What's the biggest risk?
- **Program Lead Dashboard:** Feature delivery. Which features are on track? Which dependencies are blocking progress?
- **ART Lead Dashboard:** Team health within my pillar. Velocity trends. Where do I need to intervene?
- **Scrum Team Dashboard:** Sprint progress. Burndown. What are blockers?
- **Portfolio Dashboard:** Capacity planning. Resource utilization. Throughput.
- **Dependency Dashboard:** Cross-team dependency status. Blocking items. Cascade risk.

Every dashboard was relevant to its audience. The CIO doesn't care about sprint burndowns. Teams don't care about portfolio trends. I made sure everyone saw what mattered to them.

**Coverage at Scale:**
1,200+ features tracked across 35 scrum teams, 500+ people. Real-time updates. Full traceability from product requirement to delivered story.

### 4. Leading the Organizational Change

Building the delivery architecture, operating model, and visibility system is technical and strategic work. The hard part is cultural change.

I had to convince 500+ people to change how they worked:

**Training:**
- Foundation training for everyone (Agile principles, the traceability framework, how to use ADO templates, how to read dashboards)
- Role-specific training (product owners trained on KDD process and backlog management, developers trained on RICEF templates and ADO workflow)
- Specialized training for partners and vendors who had to integrate
- Ongoing coaching for teams struggling with adoption

**Pillar-Level Change Leadership:**
I worked with each pillar lead (functional executives) to make the shift:
- Explained the delivery architecture and how it connected their requirements to delivered software
- Helped them understand their new role (product owner vs. requirements gatekeeping)
- Supported them in managing resistance
- Coached them through first sprints and PI planning events
- Celebrated early wins to build momentum

**Backlog & Prioritization Discipline:**
Critical for preventing bad Agile. I established product management discipline:
- Each pillar maintained a prioritized backlog
- Features were decomposed through the KDD/RICEF process into appropriately sized stories
- Prioritization was based on business value, not politics
- Dependencies between pillars were explicit and managed through the dependency framework

**Cultural Transformation:**
The deepest change was mindset:
- From "waterfall deliverables" to "incremental value delivery"
- From "hide problems until ready" to "transparency and feedback"
- From "no traceability" to "every decision documented and traceable"
- From "central planning and control" to "distributed decision-making with clear boundaries"
- From "blame the team that missed the deadline" to "learn and improve"

I embodied those values. I didn't run status meetings where I judged teams. I ran retrospectives where we learned together. I didn't hide bad metrics. I published them to drive improvement.

---

## THE RESULT (Result)

**Delivery Architecture:**
- End-to-end traceability from product requirement to delivered software across all 36 scrum teams
- Standardized RICEF-to-ADO templates adopted program-wide, enabling consistent delivery processes
- Governance framework with full decision traceability at every level
- Architectural Runway maintaining technical alignment across the program
- Dependency management framework preventing cross-team cascade failures

**Organizational Transformation:**
- 500+ person organization successfully transitioned from waterfall to hybrid Agile with an integrated delivery architecture
- 36+ scrum teams operating in coordinated cadence
- Quarterly PI planning events with full alignment (all 500+ people making strategic decisions together)
- Monthly release cycles with features from multiple teams shipping together

**Visibility & Execution:**
- Real-time visibility from story level all the way to CIO
- 1,200+ features tracked across 35 teams with full traceability metadata
- Metrics-driven program management (velocity, quality, cycle time, dependency health) replacing gut-feel status
- Every person had dashboard relevant to their decisions

**Delivery Improvement:**
- Faster feedback loops enabling quicker adaptation to changing requirements
- Better coordination across teams through dependency framework
- Increased team autonomy (standardized processes enabled teams to self-manage)
- Reduced central bottlenecks (decisions distributed to appropriate levels)

**Stakeholder Confidence:**
- Increased executive visibility and transparency
- Monthly releases providing visible progress to leadership
- PI planning events enabling strategic alignment and course correction
- Full decision traceability providing governance audit trail

---

## WHY THIS MATTERS

This role taught me critical lessons about designing delivery systems at enterprise scale:

**1. Delivery Architecture Precedes Methodology**
You can deploy Agile ceremonies all day, but without an underlying delivery architecture (how requirements flow into design, how design flows into build, how build is governed), teams will be "doing Agile" without actually delivering. The traceability framework was the foundation everything else built on.

**2. Scaling Requires System Design, Not Just Training**
Agile training teaches principles and practices. But scaling to 500 people requires operating model design, governance, and coordination mechanisms. You have to design the system that enables Agile to scale. That's the hard work.

**3. Visibility Replaces Hierarchy**
With 500 people, you can't manage through hierarchy. You have to give people visibility and decision authority. "Here's the dashboard. Here's where we are. What decisions do we need to make?" That's how you scale without adding layers of management.

**4. Metrics Drive Culture**
How you measure success drives behavior. I stopped measuring "features committed in the waterfall plan" and started measuring "features actually delivered in the sprint." That single shift drove behavioral change across the entire organization.

**5. Change Happens Through Local Empowerment, Not Centralized Push**
I could have tried to transform 500 people from the center. Instead, I worked with the functional pillar leads. They influenced their teams. That distributed change approach moved faster than centralized mandates.

---

## COMPETENCY ANCHORS

**Enterprise Delivery Architecture & Program Design:**
- Designed end-to-end traceability framework (requirements to KDDs to RICEF to ADO to delivery)
- Architected standardized ADO templates enabling consistent delivery across 36 scrum teams
- Implemented Architectural Runway and governance framework with decision traceability
- Director-level scope on Joint Operations Committee

**Operational Scaling & Team Design:**
- Designed operating model for 500+ person Agile program with 36+ scrum teams
- Built dependency management framework across all teams
- Established governance enabling coordination without central bottlenecks

**Systems Thinking & Architecture:**
- Designed integrated data pipeline (Azure DevOps to VBA to Project to Power BI)
- Built multi-persona dashboards providing relevant visibility to different audiences
- Created automated metrics and alerting for program management
- Architected RICEF-to-ADO template system for lifecycle tracking

**Change Leadership & Influence:**
- Led organizational transformation from waterfall to Agile across 500+ people
- Worked with functional leaders to drive adoption of both Agile methodology and delivery architecture
- Established cultural change through metrics, incentives, and continuous improvement

**Impact Quantification:**
- 36+ scrum teams operating with standardized delivery processes
- 1,200+ features tracked in real-time with full traceability
- Measurable improvements in delivery velocity, quality, and cross-team coordination

---

## HOW TO TELL THIS STORY

**In a delivery architecture context:** "I designed the entire delivery engine for a 500+ person Fortune 10 enterprise transformation. That meant architecting the traceability framework from product requirements through key design decisions into RICEF objects and standardized ADO templates. Every team knew how design becomes build, every decision was documented, and every delivered feature could be traced back to its originating requirement."

**In a scaling/operations context:** "I designed the operating model for a 500+ person transformation: 36+ scrum teams, 8+ ARTs, dependency management framework, and an integrated visibility system tracking 1,200+ features. The key was combining delivery architecture (how work flows from design to build) with scaled Agile methodology (how 36 teams coordinate) so the program could execute with both speed and governance."

**In a technology/systems context:** "I built an integrated data pipeline connecting Azure DevOps to program management (Project) to analytics (Power BI), with standardized RICEF templates feeding traceability metadata into every layer. That pipeline gave us real-time visibility from story level to CIO, with full traceability from requirement to delivery."

**In a change/culture context:** "Scaling delivery at this level isn't about training. It's about designing the delivery architecture (traceability, governance, dependency management) and then embedding it into how people work. I led that change by working with local leaders, establishing metrics that drove delivery behaviors, and implementing standardized processes that gave teams autonomy within a consistent framework."

---

## POTENTIAL INTERVIEW QUESTIONS & BRIDGES

**Q: Tell me about leading organizational change.**
Bridge: This transformation was fundamentally about changing how 500 people design and deliver software. I didn't just deploy Agile methodology. I designed the entire delivery architecture: how requirements flow into design decisions, how design decisions get dispositioned into RICEF objects, how each object type has a standardized development lifecycle. That delivery architecture, combined with governance and cultural change, is what made the transformation stick.

**Q: How do you scale systems and processes?**
Bridge: Scaling requires removing ambiguity. With 500 people in waterfall, nobody knew how design becomes build. I architected a traceability framework that standardized the path from requirement to delivery, then built dependency management across 36 teams, and created visibility systems so everyone could make good decisions at their level. Standardized processes gave teams autonomy. Visibility replaced hierarchy. That's how you scale.

**Q: Tell me about designing systems for large organizations.**
Bridge: I designed both the delivery architecture (how work flows from requirements through design to build) and the visibility system (how you see what's happening at every level). The key was building standardized templates that every team could customize, a dependency framework that prevented cascade failures, and multi-persona dashboards so every audience saw what mattered to them. Director-level system design for a Fortune 10 program.

**Q: Tell me about a time you had to manage complexity.**
Bridge: Designing the delivery engine for a 500-person program is complex on every dimension. You need delivery architecture (how do requirements become software?), operating model (how are 36 teams organized?), governance (who decides what?), dependency management (how do teams coordinate?), and visibility (who knows what's happening?). I designed each system, integrated them, and made sure they reinforced each other. The traceability framework was the backbone connecting all of it.

**Q: How do you measure success for a transformation?**
Bridge: I didn't measure "did people take the training?" I measured delivery outcomes: velocity (are we delivering more?), quality (are we delivering better?), cycle time (are we delivering faster?), and traceability coverage (can we trace every delivery back to its originating requirement?). Metrics should measure what matters, not what's easy to measure. And the dependency health metrics told us whether teams were actually coordinating or just working in parallel.
