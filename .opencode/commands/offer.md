---
description: Evaluate a single job offer with A-F grading
agent: general
---

# Job Offer Evaluator

Evaluate a single job offer using the comprehensive scoring system.

Arguments: $ARGUMENTS

**What to do:**

1. Load `modes/_shared.md` and `modes/oferta.md` (Spanish - translate as you execute)

2. Run the A-F evaluation blocks:

   **Block A) Extract & Verify**
   - Get the JD (from arguments, URL, or ask user)
   - If URL: verify offer is still active using Playwright
     - Navigate to URL (`browser_navigate`)
     - Snapshot content (`browser_snapshot`)
     - Check: Title + description + Apply button = active
     - Only footer/navbar = closed
   - Extract: company, role, location, salary (if stated), key requirements
   
   **Block B) Archetype Scoring**
   - Score fit for each archetype on 1-5 scale
   - Archetypes from `modes/_shared.md` (likely AI/automation roles)
   - For each archetype: analyze how well the role matches
   - Calculate weighted average based on candidate's preferences
   
   **Block C) Compensation Analysis**
   - Salary range vs. target
   - Equity/stock options (if applicable)
   - Benefits package
   - Total compensation estimate
   - Market competitiveness
   
   **Block D) Culture & Work-Life Balance**
   - Remote/hybrid/onsite policy
   - Team size and structure
   - Company culture indicators from JD
   - Work-life balance signals
   - Red flags (if any)
   
   **Block E) Career Growth Potential**
   - Learning opportunities
   - Skill development
   - Career trajectory
   - Company growth stage
   - Long-term potential
   
   **Block F) Final Recommendation**
   - Overall score (out of 5)
   - Top 3 pros
   - Top 3 cons
   - Decision guidance: Apply / Maybe / Skip
   - One-sentence summary

3. Save evaluation report:
   - Path: `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`
   - Use sequential 3-digit numbering (find max existing + 1)
   - Include all blocks A-F
   - Must include `**URL:**` in header (between Score and PDF)
   - Format company slug: lowercase, hyphens, no special chars

4. Tell the user:
   - Final score
   - Recommendation
   - Key pros/cons
   - Whether they should apply

**Different from auto-pipeline:** 
- This mode ONLY evaluates
- No PDF generation
- No tracker update
- Use this when you just want to assess fit before committing to full pipeline

**Report format header:**
```markdown
# {Company} – {Role}

**Score:** {X.X}/5  
**URL:** {job-url}  
**PDF:** ❌  
**Date:** {YYYY-MM-DD}

---
```

**Scoring guidance:**
- 4.5-5.0: Excellent fit, definitely apply
- 3.5-4.4: Good fit, likely worth applying
- 3.0-3.4: Moderate fit, apply only if strategic
- Below 3.0: Weak match, probably skip

Communicate all findings to the user in English.
