---
company: AWS
project: Strategic Intelligence & Relationship Mapping Tool
dates: 2023
archetypes:
  - AI Product Manager
  - AI Solutions Architect
capabilities:
  - product-incubation
  - pipeline-analytics
  - gtm-automation
hero_metrics:
  - 1300+ accounts mapped
  - VP-level buy-in
  - 30% reduced deal cycle times
---

# STAR Framework: AWS Strategic Intelligence Tool

**Interview Context:** External audience (CTO, VP Product, startup founder, technical leadership); demonstrates independent contribution, strategic product thinking, competitive advantage mindset

---

## SITUATION

AWS Professional Services was competing for massive enterprise deals ($100M+). The presales teams knew it was critical to understand the relationship landscape — who at the target company could be a champion? Who sits on their board that also advises an AWS customer? Where are the warm paths in?

But that intelligence was invisible. Teams were dialing prospects cold without realizing that a board member at the target company also sat on the board of Company X, which was already a major AWS customer. They couldn't quickly surface those relationship intersections, and we were losing strategic leverage.

**The Strategic Problem:** If you can say "Your board member also advises Company X, which is growing their AWS infrastructure by $50M next year," that's a very different conversation than cold outreach. That's the kind of insight that wins deals.

**The Data Problem:** The information existed, but it was fragmented. Salesforce had our customer accounts and pipeline. PitchBook had board member and advisor data. Public sources had shareholder and director information. Nobody had integrated these sources to surface relationship intelligence at presales velocity.

This was a gap that could be filled with software. And nobody was doing it at scale.

---

## TASK

I took ownership of building a strategic intelligence platform that would integrate multiple data sources and surface relationship intersections dynamically. The goal was simple in concept, complex in execution: for any target company, quickly identify which of our existing customers have board members or advisors in common, and surface those relationships as strategic leverage points for the presales team.

This wasn't a small project. I had to:
- Build APIs to integrate Salesforce, PitchBook, and public company data
- Implement relationship mapping algorithms that could handle name variations and incomplete data
- Create confidence-scoring systems so presales teams would trust the output
- Design for presales team workflows (fast, operational, easy to act on)
- Make it scalable and performant for regional deployment

And I did it myself in Python, while also managing customer delivery work.

---

## ACTION

**Data Architecture:**
I started by designing the data integration layer. Salesforce had 1,300+ SaaS accounts in our customer database. PitchBook had board member and advisor data for private companies. Public sources had shareholder and director information. The challenge was integrating these data sources without creating a mess of data quality issues.

I built APIs to pull data from each source, then implemented entity recognition and matching logic. This is harder than it sounds. "John Smith" at Company A might be the same person as "John A. Smith" at Company B, or they might be different people. Same with companies — "Acme Corp" vs. "Acme Corporation" vs. "Acme Inc."

I implemented confidence-scoring algorithms to handle this uncertainty. If there was high confidence that entities matched, surface it. If confidence was low, flag it for manual review. This way presales teams could trust the output.

**Relationship Mapping:**
Once I had entity matching working, I built the relationship mapping engine. For each target company, I identified all the board members and advisors. Then I cross-referenced them against our customer database. If we found matches, those were high-value relationship intersections.

The output looked like: "Target Company board member John Smith also sits on the board of Customer X, which is spending $50M annually on AWS infrastructure."

That's the kind of information that changes a sales conversation.

**Strategic Intelligence Extraction:**
I went beyond just "matching board members." I built competitive intelligence: which competitors was this target company's industry peer already on AWS? I built network analysis: how deep is the relationship network? If we have a relationship to a board member, is that board member influential at the target company?

I built for presales workflows. These aren't data scientists sitting in Excel. They need information they can act on in 5 minutes. So the output was clean, prioritized, actionable.

**Scale & Performance:**
This was designed to scale across an entire AWS region, serving hundreds of presales professionals. Every account they were pursuing, they could run through the intelligence tool. That's a lot of data and a lot of queries. I optimized for performance.

**Python Implementation:**
I did all the development myself. Data integration, entity matching, relationship mapping, API design, all of it. This gave me complete ownership of the architecture and allowed me to move fast.

**VP-Level Buy-In:**
Throughout development, I was working directly with the VP of all Professional Services (L8/L9 leadership, few levels below CEO). This wasn't a bottom-up innovation — it had executive sponsorship. The VP understood the competitive advantage and backed the project with resources.

---

## RESULT

**Technical Achievement:**
- Built fully functional strategic intelligence platform in Python
- Successfully integrated 3+ data sources (Salesforce, PitchBook, public markets)
- Implemented intelligent entity matching and confidence scoring
- Created relationship mapping algorithms that surfaced strategic leverage points
- Analyzed across 1,300+ AWS customer accounts

**Business Opportunity:**
- Early presales feedback indicated potential 30% reduction in sales cycle time
- Identified warm paths to key decision makers at target accounts
- Provided competitive intelligence that AWS competitors didn't have
- Designed for region-wide deployment to hundreds of presales professionals

**Leadership Validation:**
- Secured buy-in from VP of all Professional Services (senior AWS leadership)
- Approved for regional deployment
- Demonstrated proof of concept with early presales teams
- Received positive feedback on output quality and usefulness

**Competitive Positioning:**
- Platform would have given AWS meaningful advantage in strategic account competition
- Technology was proprietary to AWS (competitors weren't doing this in 2022)
- Represented significant operational advantage for large deal pursuit

**Project Outcome:**
- Platform was fully functional and ready for deployment
- Derailed by Amazon's 2022 organizational restructuring (~30,000 person layoff)
- Jon was caught in the reduction; project was not deployed region-wide
- Technical work was not wasted — architecture proved the concept

---

## INTERVIEW ANGLES & TALKING POINTS

### For CTO / Technical Leadership:
"I built a complete strategic intelligence platform in Python from architecture through deployment. The interesting technical problem wasn't just data integration — it was intelligent entity matching across multiple data sources with incomplete and sometimes conflicting information. I implemented confidence scoring so that output reliability was provable. The platform was designed to scale across hundreds of users and thousands of queries. This wasn't toy code — it was production-grade architecture for enterprise deployment."

### For VP Product / Product Leadership:
"This teaches me something important about product-market fit. The problem wasn't theoretical — presales teams were losing millions in deals because they didn't have relationship intelligence. I could validate that from talking to teams directly. They said the tool would reduce sales cycle time by 30%. That's not a hypothesis — that's a quantified value prop. I designed the product around presales workflows, not around data scientist capabilities. That's how you build products people actually use."

### For Startup / Founder Context:
"This is an example of a product that could be a $100M+ business if commercialized. Strategic intelligence for B2B sales is a real market. But I was building it inside AWS for internal use. The interesting tension: when you build inside a large organization, you have access to data and credibility, but you don't have the focus and velocity of a startup. If this product had been spun out as a startup with the right go-to-market strategy, it could have been significant."

### For Executive Leadership / Scale:
"I got buy-in from VP-level leadership (few levels below CEO) while executing this as a parallel workstream to customer delivery. That required credibility and clarity about value prop. I could articulate exactly why this mattered for AWS's competitive positioning. I could show early results from presales teams. I could explain the technical architecture confidently. I didn't need anyone's permission to build it, but I did secure executive sponsorship. That's the kind of leadership presence that's needed at scale."

### For AI/ML or Data Integration:
"Entity matching across disparate data sources with incomplete information is a real technical challenge. I implemented confidence scoring that allowed me to surface high-confidence matches while flagging uncertain cases for human review. The relationship mapping algorithms were sophisticated — not just simple matching, but network analysis, influence assessment, and competitive intelligence. This demonstrated AI/ML thinking applied to business problems."

### For Board / Investor Pitch:
"I built a product that would have reduced AWS's sales cycle time by 30% for enterprise deals ($100M+). That translates to millions in annualized revenue impact. The product was fully functional, had executive buy-in for regional deployment, and had been validated with early presales teams. Unfortunately it was derailed by organizational restructuring. But the proof of concept was solid — this demonstrates both technical capability and strategic product thinking."

### For Resilience / Adaptability:
"The project outcome wasn't determined by technical failure — we hit every technical milestone. It was derailed by external organizational events (2022 Amazon layoffs). That taught me something: sometimes your best work doesn't get deployed because of organizational timing. The response isn't to get demoralized — it's to recognize that you delivered technical value and strategic thinking that the organization validated, even if the full deployment didn't happen."

---

## Key Differentiators

1. **Independent Delivery:** Built entire platform myself in Python (not leading a team, not delegating)
2. **Strategic Thinking:** Understood how presales organizations actually work and what intelligence would move the needle
3. **Executive Alignment:** Secured VP-level buy-in (few levels below CEO) from senior AWS leadership
4. **Data Integration:** Solved complex entity matching and relationship mapping problems
5. **Business Impact:** Quantified value (30% sales cycle reduction) based on presales team feedback
6. **Technical Depth:** Full-stack development from architecture through deployment
7. **Operational Excellence:** Designed for scale (hundreds of users, thousands of queries, 1,300+ customer accounts)

---

## Why This Matters for Interviews

This project demonstrates:
- **Technical capability:** Can build complete systems independently
- **Strategic product thinking:** Can identify high-leverage problems and solve them
- **Executive presence:** Can secure support from senior leadership
- **Competitive thinking:** Understands how to build products that create meaningful advantage
- **Execution:** Can deliver quality work even under time pressure and alongside other responsibilities
- **Resilience:** Can ship meaningful work even when external circumstances prevent full deployment

Most leaders excel at one or two dimensions. This project required excellence across all of them.
