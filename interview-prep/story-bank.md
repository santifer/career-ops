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

### [Risk Framework / Innovation] Building the 7MQ Risk Model from Scratch

**Source:** Report #017 — State Street — Digital Assets Product Owner (AVP); CoinDCX experience

**S (Situation):** When I joined CoinDCX as Manager of Strategy & Growth for New Listings, the exchange had no systematic way to evaluate whether a new token was safe to list. Listing decisions were ad hoc — driven by relationship pressure from project teams, market hype, or individual judgement. This exposed the exchange to fraud risk, regulatory scrutiny, and reputational damage. We were one bad listing away from a headline.

**T (Task):** I was tasked with designing and deploying a scalable, data-driven risk assessment framework that could evaluate every new token listing objectively — balancing growth (more listings = more trading volume) against risk (scams, rug pulls, regulatory non-compliance).

**A (Action):**
- Researched what quantitative signals best predicted token failure or fraud — on-chain metrics, team credibility, tokenomics, liquidity depth, community signals, regulatory posture, and market manipulation indicators.
- Designed the 7MQ model: a seven-dimensional scoring matrix that pulled real-time data via APIs from CoinMarketCap, Santiment, and TAAPI to auto-score each listing candidate.
- Built the scoring rubric with clear thresholds — green/amber/red bands — so the decision wasn't subjective anymore. A token either passed or it didn't.
- Validated the model with trading and compliance teams through backtesting against past listing decisions — including ones that had gone wrong.
- Filed a patent application for the methodology (patent pending).

**R (Result):** The 7MQ model became the standard for all listing decisions at CoinDCX. It replaced ad hoc calls with a repeatable, auditable process. It caught several high-risk tokens that would previously have been listed. The exchange's risk posture improved measurably, and the model was recognized as intellectual property worth protecting (patent filing).

**Reflection:** The biggest lesson was that the best risk frameworks don't slow down business — they accelerate good decisions by removing ambiguity. When I built 7MQ, the trading team initially pushed back ("this will slow us down"), but once they saw it actually made their job easier — no more endless debates about whether to list something — they became the model's biggest advocates. I'd apply the same principle at State Street: a rigorous tokenized asset risk framework should make product decisions faster, not slower.

**Best for questions about:** Building something from zero, innovation in risk management, balancing growth vs. risk, data-driven decision making, working in ambiguous/evolving markets, product development in regulated environments.

---

### [Building from Zero / Ambiguity] Designing the Institutional OTC Desk at WazirX

**Source:** Report #017 — State Street — Digital Assets Product Owner (AVP); WazirX experience

**S (Situation):** WazirX decided to launch an institutional OTC desk and HNI vertical — a new line of business to serve high-net-worth individuals and institutional clients entering the crypto space. The problem: there was literally nothing to build on. No operations structure, no risk framework, no client onboarding playbook, no liquidity management process. I was brought in to build it from the ground up.

**T (Task):** Design and operationalize the complete OTC desk — from operations architecture and risk management to client engagement and liquidity monitoring — and start onboarding institutional clients into Web3.

**A (Action):**
- Mapped the end-to-end OTC trade lifecycle: client inquiry → KYC/onboarding → price discovery → trade execution → settlement → reporting. Built SOPs for each step.
- Designed a risk management framework specific to OTC crypto trades — covering counterparty risk, settlement risk, market risk during trade execution windows, and liquidity risk.
- Built a liquidity monitoring system tracking exchange trading volumes across pairs to ensure we could fill large OTC orders without moving the market.
- Created client engagement playbooks for HNI clients transitioning from traditional finance — many of them needed hand-holding on wallet setup, tax implications, and security practices.
- Authored periodic thematic research reports for clients on market dynamics, used as both education tools and trust-building touchpoints.

**R (Result):** The OTC desk went from zero to fully operational. Institutional clients were successfully onboarded. Liquidity and uptime metrics were maintained even during volatile market periods. The playbooks and frameworks I created became the operational backbone that the desk continued to run on after my departure.

**Reflection:** What I learned is that institutional digital asset adoption isn't about technology — it's about trust, compliance, and operational clarity. The HNI clients I onboarded at WazirX didn't care about blockchain's technical elegance; they cared about "will my money be safe?" and "is this compliant?" That insight is directly relevant to State Street's custodian model: institutional clients need the same operational rigor they get from traditional custody, applied to tokenized assets.

**Best for questions about:** Dealing with ambiguity, building something from scratch, operational excellence, institutional client management, risk framework design, working in fast-paced/startup environments.

---

### [TradFi Discipline / Precision] Zero-Error Financial Control at Goldman Sachs

**Source:** Report #017 — State Street — Digital Assets Product Owner (AVP); Goldman Sachs experience

**S (Situation):** I was the primary financial controller for the EMEA Fixed Income desk at Goldman Sachs. This desk traded billions in bonds, and my role was to ensure every number — daily P&L, weekly commentaries, monthly valuations — was accurate, on time, and audit-ready. There was zero tolerance for error. A misreported P&L figure doesn't just get corrected — it triggers escalation, compliance reviews, and erodes trader trust.

**T (Task):** Deliver flawless daily, weekly, and monthly financial reporting for the EMEA Fixed Income desk, including P&L commentaries that linked trading results to macro trends, and lead monthly Pricing Valuation exercises ensuring accurate bond valuations.

**A (Action):**
- Built a personal checklist and review process for every reporting cycle — daily flash P&L, weekly detailed commentary, monthly valuation reconciliation.
- For P&L commentaries, I didn't just report numbers — I linked each significant P&L movement to macro events (central bank decisions, yield curve shifts, geopolitical events) so traders and management could understand *why* numbers moved, not just *what* moved.
- Led monthly Pricing Valuation exercises: cross-referencing the trading desk's internal valuations against independent market data to catch pricing discrepancies before they became risk events.
- Published periodic macro news summaries for senior management, synthesizing complex economic data into actionable briefings.

**R (Result):** Zero material reporting errors across my entire 18-month tenure. I was recognized as a reliable, detail-obsessed controller by the EMEA bond trading team. My P&L commentaries became the standard reference for management discussions on desk performance.

**Reflection:** Goldman Sachs taught me that in financial services, precision isn't a nice-to-have — it's the product. When you're a custodian of other people's money, your credibility is your accuracy. I bring that discipline to every product I build. At CoinDCX, the 7MQ model had the same ethos: don't guess, measure. At KPMG, the AI products I built had rigorous QA because audit firms can't deploy tools that produce unreliable outputs. State Street's digital asset platform will need that same zero-error DNA.

**Best for questions about:** Working in high-pressure regulated environments, attention to detail, financial reporting expertise, risk management discipline, how your TradFi background adds value.

---

### [Product Strategy / Cross-functional] Balancing Growth and Risk at the TradFi-DeFi Intersection

**Source:** Report #017 — State Street — Digital Assets Product Owner (AVP); CoinDCX experience

**S (Situation):** CoinDCX wanted to aggressively expand its token listings to compete with global exchanges like Binance and KuCoin. But India's regulatory environment for crypto was uniquely uncertain — the government was actively debating crypto bans, and the RBI had historically been hostile. Every new listing carried not just market risk, but existential regulatory risk for the exchange itself.

**T (Task):** Build a product strategy for the new listings pipeline that balanced growth (more tokens = more users = more revenue) against risk (regulatory exposure, fraud, reputation damage) — without killing the business's competitive position.

**A (Action):**
- Spearheaded research on every potential listing — project fundamentals, team background, tokenomics, regulatory classification, community health, and on-chain activity.
- Designed a structured onboarding process: initial screening → deep due diligence → risk scoring (7MQ model) → legal review → compliance sign-off → listing.
- Built cross-functional alignment: trading teams wanted speed, compliance wanted caution, and business development wanted relationships preserved. I created a transparent scoring system so everyone could see *why* a token was approved or rejected.
- Coordinated directly with legal and compliance teams on regulatory edge cases — some tokens were borderline securities, some had unclear jurisdictional status.

**R (Result):** Successfully facilitated multiple exchange listings with the risk framework in place. The strategy became a repeatable, defensible process — not dependent on any individual's judgement. CoinDCX maintained its competitive listing pace while avoiding the fraud/compliance incidents that hit peer exchanges.

**Reflection:** Product development at the intersection of crypto and TradFi requires both domain fluency and process rigor. You can't just move fast — you have to move fast *with controls*. That's the exact challenge at State Street: how do you bring tokenized products to market at institutional speed while maintaining custodian-grade risk management?

**Best for questions about:** Product strategy, balancing competing stakeholder priorities, working in regulated environments, cross-functional collaboration, navigating ambiguity.

---

### [Technical Innovation / Self-Driven] Building an AI-Native Risk Monitoring System

**Source:** Report #017 — State Street — Digital Assets Product Owner (AVP); Personal project (Autonomous Trading System)

**S (Situation):** After working in crypto exchanges (WazirX, CoinDCX), I realized that the risk monitoring tools available were reactive — they flagged problems after they happened. I wanted to build a system that could monitor multiple market signals in real time and make adaptive decisions autonomously, mimicking how a senior trader thinks but at machine speed.

**T (Task):** Design and build a multi-agent trading system with intelligent risk management that could autonomously monitor markets, analyze signals from multiple data providers, and adjust positions — all without human intervention for routine decisions.

**A (Action):**
- Designed a multi-agent architecture on N8N where each agent had a specific role: one monitored technical indicators (TAAPI), another tracked on-chain sentiment (Santiment), another processed market data (CoinMarketCap), and a coordinator agent synthesized signals and made execution decisions.
- Built intelligent risk management protocols: position sizing rules, stop-loss triggers, correlation checks across assets, and "circuit breakers" that would halt trading during extreme volatility.
- Created seamless API integrations across all data providers so the system processed a unified market picture despite disparate data sources.
- Implemented real-time monitoring dashboards so I could observe the system's decision-making and intervene if the agents were behaving unexpectedly.

**R (Result):** Functioning autonomous trading system with real-time multi-source risk management. The system demonstrated that AI-native approaches to financial risk monitoring — where multiple specialized agents collaborate — can process information faster and more comprehensively than any human trader.

**Reflection:** This project convinced me that AI-native risk monitoring is where tokenized finance products are heading. When you have 24/7 markets, atomic settlement, and programmable assets, you need programmatic risk management. This personal project is essentially a working prototype of that thesis. The experience of designing multi-agent coordination, handling API failures gracefully, and building decision-making under uncertainty — all of this translates directly to building institutional-grade digital asset products.

**Best for questions about:** Technical depth, self-driven innovation, AI/ML applied to finance, system design, passion for the digital asset space, how you stay current with technology.

---

### [Stakeholder Management / Translation] Bridging Audit Teams and AI Engineering at KPMG

**Source:** Report #017 — State Street — Digital Assets Product Owner (AVP); KPMG experience

**S (Situation):** KPMG's audit practice wanted to leverage GenAI to transform audit workflows — but there was a massive gap between what auditors needed and what the Azure AI engineering team understood. Audit teams described their problems in accounting language ("we need to test completeness of revenue recognition"); engineers thought in terms of models, APIs, and tokens. Neither side could translate for the other, and early attempts at AI tools for audit had stalled.

**T (Task):** Act as the product bridge: take audit workflow needs, translate them into clear product requirements and user stories, manage Agile delivery, and ensure the resulting AI tools actually worked for auditors in the field.

**A (Action):**
- Ran deep discovery sessions with audit teams to understand their actual workflows — not what they said they needed, but what they actually did day-to-day. Used my CA background to speak their language fluently.
- Translated audit requirements into detailed PRDs and user stories that the Azure engineering team could execute against. Made sure every story had clear acceptance criteria.
- Managed the entire delivery via Jira using Agile/Scrum — sprint planning, backlog grooming, standups, retrospectives. Kept both sides aligned on priorities and timelines.
- Oversaw comprehensive QA testing, ensuring outputs met audit standards — because in audit, "mostly right" is the same as "wrong."
- Designed and delivered training programs for 100+ audit professionals on how to effectively use GenAI tools and prompt engineering in their workflows.

**R (Result):** Delivered multiple AI products within a 12-month cycle. Won 3 internal awards for AI innovation. Trained 100+ professionals on GenAI adoption. The products moved from prototype to production and were actively used in audit engagements.

**Reflection:** The PM's most important job is translation — making the technology real for the people who actually use it. At KPMG, I learned that you can't just hand auditors an AI tool and expect adoption; you have to understand their world deeply enough to build something that fits into their existing workflow, not replace it. At State Street, the same principle applies: tokenized finance products will only succeed if they integrate seamlessly with the existing custody and fund administration workflows that institutional clients already trust.

**Best for questions about:** Stakeholder management, cross-functional leadership, bridging business and technology, Agile/Scrum experience, training and change management, translating complex requirements, product delivery.

---

### [Crisis Management / Resilience] Navigating Crypto Market Turmoil and Regulatory Uncertainty

**Source:** Report #017 — State Street — Digital Assets Product Owner (AVP); WazirX/CoinDCX experience

**S (Situation):** In mid-2022, the crypto market experienced a severe downturn — the Luna/Terra collapse triggered a cascade of failures (Three Arrows Capital, Celsius, FTX later that year). At WazirX, where I was running the OTC desk, trading volumes dropped sharply, institutional clients panicked, and there was a real question of whether the Indian crypto industry itself would survive. Simultaneously, the Indian government introduced a 30% crypto tax and 1% TDS that further crushed trading activity. The operational environment went from "high growth" to "survival mode" almost overnight.

**T (Task):** Keep the OTC desk operational and retain institutional client trust during a period where the entire market was questioning the viability of crypto as an asset class. Ensure that risk frameworks held up under extreme stress, and that client communications maintained confidence without making promises we couldn't keep.

**A (Action):**
- Immediately stress-tested our risk framework against the new market reality: reviewed all counterparty exposures, liquidity positions, and settlement processes for worst-case scenarios.
- Shifted client communications from growth-focused to transparency-focused: proactively reached out to HNI clients with clear, honest assessments of market conditions, our risk posture, and what we were doing to protect their positions.
- Tightened liquidity monitoring — during the crisis, spreads widened dramatically and executing large OTC trades without market impact became much harder. Adjusted our execution protocols accordingly.
- Worked with legal and compliance to assess the impact of the new tax regime on OTC operations and update client guidance.
- Authored research reports specifically addressing the crisis — what happened, why, and what it meant for the Indian crypto market — which clients used for their own internal decision-making.

**R (Result):** The OTC desk survived the crisis intact. No institutional clients lost money through our operations. Several HNI clients specifically credited our transparent communication during the downturn as the reason they stayed with the platform. The risk framework we had built proved resilient under genuine market stress — it didn't just work in good times.

**Reflection:** This experience taught me that the real test of a risk framework isn't how it performs in calm markets — it's how it holds up when everything is on fire. The clients who stayed through the crisis became our most loyal advocates precisely because we didn't hide from bad news. In institutional digital asset custody — which is State Street's business — trust is built in the downturns, not the upturns. I'd bring that same crisis-tested, transparency-first approach to product decisions at State Street.

**Best for questions about:** Handling failure/crisis, resilience, risk management under stress, stakeholder communication during uncertainty, operational risk, how you handle setbacks, what you learned from a difficult situation.

