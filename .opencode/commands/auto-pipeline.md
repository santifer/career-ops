---
description: Complete workflow - evaluate offer, generate PDF, update tracker
agent: general
---

# Auto-Pipeline (Full Job Evaluation Workflow)

Run the complete pipeline: extract JD → evaluate → save report → generate PDF → update tracker.

Arguments: $ARGUMENTS

**What to do:**

1. Load `modes/_shared.md` and `modes/auto-pipeline.md` (Spanish - translate as you go)
2. Run all 5 steps:
   - **Step 0:** Extract the JD
     - If it's a URL: use Playwright (preferred for job boards like Lever, Greenhouse, Workday)
     - If Playwright fails: try WebFetch for static pages
     - If it's pasted text: use directly
   - **Step 1:** Full evaluation A-F (same workflow as offer mode)
     - A) Extract and verify offer
     - B) Score archetypes (1-5)
     - C) Compensation analysis
     - D) Culture/WLB assessment
     - E) Career growth potential
     - F) Final recommendation
   - **Step 2:** Save report to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`
   - **Step 3:** Generate tailored CV PDF (run pdf workflow)
   - **Step 4:** Draft application answers (if score >= 4.5)
     - Extract form questions or use generic ones
     - Follow tone guidelines: confident, selective, proof-based
   - **Step 5:** Add entry to `data/applications.md` tracker

3. If any step fails, keep going and mark it as pending in the tracker

**This is the most common workflow** - user pastes a job URL, everything gets done automatically.

**Critical rules:**
- Report MUST include `**URL:**` in header
- Use sequential numbering for reports (001, 002, 003...)
- PDF emoji: ✅ if generated, ❌ if not
- Status: `Evaluated` for new entries
- Communicate with user in English throughout
