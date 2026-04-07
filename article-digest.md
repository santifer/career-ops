# Article Digest — Proof Point Catalog

Compact catalog of quantified achievements used by career-ops evaluations. The evaluation system reads this file for detailed proof points (per `modes/_shared.md` rule: "For article/project metrics, article-digest.md takes precedence over cv.md").

All metrics below trace directly to bullets in `cv.md`. Do not invent new numbers — update `cv.md` first, then mirror here.

---

## Hero Proof Points (lead with these)

### 1. Built a FINRA-regulated AI-powered broker-dealer from 0
- **Where:** SMBX (CTO & Co-Founder, 2017–Present)
- **Hero metric:** $100M+ bond volume, 0 audit findings across 6 years of FINRA/SEC audits
- **Context:** Co-founded Series A fintech — FINRA-regulated funding portal, broker-dealer, and Alternative Trading System (ATS) for Small Business Bonds. Raised $25M+ across multiple rounds. Achieved SOC 2 Type II, CCPA, PCI-DSS, GDPR in 6 months.
- **Source:** cv.md (Executive Summary + SMBX)
- **Use for:** Regulated AI, fintech, 0→1 founder, compliance-heavy roles

### 2. Production RAG that beats human baselines
- **Where:** SMBX
- **Hero metric:** 97.2% extraction accuracy vs 94.1% human baseline; 90% hallucination reduction (23%→2.3%); 50× cost reduction ($85→<$2 per extraction)
- **Stack:** BM25 + pgvector + cross-encoder reranking; 4-layer verification (semantic chunking, in-house reranking, source-cited prompts, Pydantic validators); 3-tier model routing via LLM abstraction layer
- **Evaluation:** 500-case framework (gold + synthetic + adversarial), 98.7% faithfulness, CI/CD gates blocking degrading deployments
- **Retrieval:** 93% recall
- **Use for:** Applied AI, LLMOps, RAG platform, AI infrastructure, AI evaluation roles

### 3. Scaled eng org 0→50 with 85% retention
- **Where:** SMBX
- **Hero metric:** 0→50 engineers across U.S., Europe, and Asia; 85% retention (vs 65% industry avg); 92% satisfaction
- **How:** Competency frameworks and data-driven performance systems
- **Use for:** VP Eng, Head of Eng, engineering leadership, org scaling roles

### 4. Grew ARR 15× via B2B2C pivot
- **Where:** SMBX
- **Hero metric:** ARR $200K → $3M (15×); 3× addressable market expansion
- **How:** Pivoted B2C→B2B2C via modular white-label architecture; consulting-style technical advisory, compliance guidance, and implementation support to 100+ enterprise partners
- **Use for:** Forward Deployed Eng, enterprise sales-engineering, Head of Product, platform/partnerships roles

### 5. AI lead-gen engine replaced 11-person sales team
- **Where:** SMBX
- **Hero metric:** 3-4× revenue growth, 60%+ marketing cost reduction, 70% CAC improvement
- **Use for:** Applied AI, go-to-market tech, AI-for-growth, growth engineering roles

### 6. TD Merchant Solutions — $100B payment platform later acquired by Fiserv
- **Where:** TD Bank (Engineering Manager, Digital Banking)
- **Hero metric:** 80,000+ merchants, 100K+ locations, ~1.5B transactions/year, ~$100B volume, $150M+ revenue
- **Outcome:** Platform subsequently acquired by Fiserv
- **Use for:** Payments, enterprise platforms, M&A context, Fortune 500 scale

### 7. Canada's first Apple Pay (RBC) + Apple Pay Phase II (TD)
- **Where:** RBC (founding tech lead) + TD Bank (EM)
- **Hero metric:** 500K activations first month at RBC; 3M activations in 6 months at TD Phase II
- **Scope:** End-to-end Apple/Visa/Mastercard integration; rebuilt tokenization architecture at TD with PCI-DSS compliance
- **Use for:** Payments, mobile banking, fintech, enterprise partnerships

### 8. McDonald's global mobile platform foundation (now 150M+ users, #1 food app)
- **Where:** McDonald's Global Technology (Staff SE, Singapore/India)
- **Hero metric:** Built foundation of platform now powering 150M+ 90-day active users, #1 food app globally
- **During tenure:** 10M+ active users, 99% crash-free sessions, 4.8+ App Store rating
- **Scope:** Region-adaptive architecture (dynamic UI + region-aware backends) for single codebase across 20+ markets, cutting maintenance overhead 50%
- **Use for:** Consumer-scale, global products, mobile platforms

---

## Grouped by Theme

### Regulated AI & Compliance
- FINRA-regulated broker-dealer: 6 years, 0 audit findings
- SOC 2 Type II, CCPA, PCI-DSS, GDPR certification in 6 months
- KYC/AML ML pipelines → ~80% synthetic fraud reduction → $2M+ annual savings
- RAG with source-cited prompts + Pydantic validators for full audit trail
- Hybrid underwriting: LLMs extract → rule engine applies credit criteria → yield within risk spreads → <5% default rates with audit trail
- Secure Vault authentication/encryption framework at RBC (FINTRAC + PCI-DSS) → 70% credential incident reduction

### AI / GenAI Production Systems
- RAG pipeline: 93% retrieval recall, 97.2% extraction accuracy (vs 94.1% human baseline)
- Hallucination reduction: 23% → 2.3% (90% drop) via 4-layer verification
- Cost reduction: 50× via 3-tier model routing ($85 → <$2 per extraction)
- 500-case evaluation framework (gold + synthetic + adversarial), 98.7% faithfulness, CI/CD gates
- Agentic hybrid underwriting (LLM extraction + rule engine + yield calculation)
- AI lead-gen engine replacing 11-person sales team (3-4× revenue, 60%+ marketing cost cut, 70% CAC improvement)
- Standardized repeatable deployment playbooks for regulated AI: RAG architecture patterns, compliance frameworks, evaluation methodologies adopted across multiple partner implementations
- **Stack:** GPT-4, Claude, Mistral, LangChain, pgvector, Pinecone, BM25, cross-encoder reranking, SageMaker, TensorFlow, PyTorch, BERT

### Engineering Leadership & Org Scaling
- 0→50 engineers across 3 continents (U.S., Europe, Asia)
- 85% retention (vs 65% industry average), 92% satisfaction
- Competency frameworks + data-driven performance systems
- Led technical due diligence for institutional investors managing multi-billion AUM
- C-suite partnership at Fortune 500 financial institutions (TD Bank, RBC) on platform strategy and digital transformation
- Cross-functional stakeholder alignment across regulatory bodies (FINRA, SEC), banking partners, payment networks (Visa, Mastercard, Apple Pay), and enterprise clients across three continents

### Enterprise Platforms & Forward Deployed
- SMBX enterprise partnership program: white-label bond platform, 100+ B2B2C partners, 3× addressable market, 15× ARR growth
- TD merchant SDK: 100+ partners, integration time 6 months → 4 weeks, new recurring revenue stream
- RBC developer API/SDK platform: 100+ enterprise clients, $5M+ new revenue, integration 6 months → 3 weeks
- Consulting-style technical advisory, compliance guidance, and implementation support to enterprise partners

### Fortune 500 Consumer Scale
- TD Bank digital banking: 11M+ customers
- RBC mobile banking: 18M+ retail customers (Canada's first native mobile banking platform)
- McDonald's global mobile: foundation of platform now powering 150M+ 90-day active users (#1 food app globally)
- TD Merchant Solutions: ~$100B payment volume, ~1.5B txns/year, $150M+ revenue

### Real-Time Systems & Infrastructure
- SMBX proprietary ATS with 150ns latency for secondary market bond trading (creating liquidity for private securities)
- TD real-time analytics (Kafka + Spark): 2M+ daily transactions, 99.99% uptime, near-real-time fraud anomaly detection
- TD ML-based transaction monitoring: 40% reduction in fraud false positives
- TD Facebook Messenger banking chatbot (Canada's first): 450K monthly interactions, 40% faster response time
- RBC native mobile platform (Swift/Kotlin): 50k+ TPS, 99.9% uptime, 3× faster feature releases than hybrid predecessor
- RBC cloud infrastructure: 35% cost reduction, 40% response time improvement via automated scaling

### Mobile & Consumer Products
- McDonald's region-adaptive architecture for 20+ markets, 50% maintenance overhead reduction
- McDonald's mobile payment workflows across country-specific processors: 20% increase in completed orders
- McDonald's personalization (collaborative filtering + real-time purchase data): 15% increase in average order value
- McDonald's telemetry pipelines and analytics dashboards for real-time regional campaign optimization

### Fundraising & Business Outcomes
- SMBX: $25M+ venture funding secured across multiple rounds
- SMBX: ARR 15× ($200K → $3M)
- SMBX: AI lead-gen → 3-4× revenue growth, 60%+ marketing cost cut, 70% CAC improvement
- SMBX: Passed institutional investor technical due diligence (multi-billion AUM investors)
- TD Merchant Solutions platform acquired by Fiserv

---

## Tech Stack Index

- **AI/ML:** LLMs (GPT-4, Claude, Mistral), RAG Architecture, Vector Databases (Pinecone, pgvector), LangChain, Evaluation Frameworks, MLOps (SageMaker, TensorFlow, PyTorch), Agentic Workflows, NLP (BERT)
- **Infrastructure:** Distributed Systems, Microservices, Event Sourcing (CQRS), Kafka, Kubernetes, Docker, AWS, GCP, CI/CD, Observability
- **Languages & Frameworks:** Python, TypeScript, Node.js, React, Swift, Java, PostgreSQL, Redis
- **Compliance:** FINRA, SEC, SOC 2 Type II, PCI-DSS, GDPR, CCPA, KYC/AML, FINTRAC
- **Enterprise Delivery:** Technical Due Diligence, Architecture Advisory, Implementation Playbooks, Risk Assessment Frameworks, Stakeholder Management, Program Governance, Partner Enablement, SLA Management, C-Suite Communication

---

## Recognition & Credentials

- **EB-1A Green Card** (Extraordinary Ability classification)
- **UC Berkeley SkyDeck Accelerator** (Batch 8, Nov 2018 Demo Day — covered by TechCrunch)
- **Featured in:** TechCrunch, Wall Street Journal
- **B.E., Biotechnology** — Panjab University
