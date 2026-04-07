# OpenCode Compatibility - Test Checklist

## Pre-flight Checks

- [ ] OpenCode installed and configured with API keys
- [ ] In career-ops project directory
- [ ] Run `/init` - verify it reads AGENTS.md successfully
- [ ] Confirm onboarding works (if cv.md, profile.yml, portals.yml are missing)

---

## Command Tests

### 1. Discovery Menu
**Test:** `/career-ops`

**Expected:** 
- Shows command menu with all available modes
- Menu is in English
- Lists all commands (scan, offer, pdf, etc.)

**Verify:**
- [ ] Menu displays correctly
- [ ] All commands are listed
- [ ] Language is English

---

### 2. Auto-Pipeline (Most Critical)
**Test:** `/career-ops {paste a real job URL}`

**Example URL:** Use any active job posting (Greenhouse, Lever, Ashby, etc.)

**Expected:** 
- Extracts JD using Playwright
- Runs A-F evaluation blocks
- Saves report to `reports/`
- Generates PDF to `output/`
- Updates `data/applications.md`

**Verify:**
- [ ] JD extracted successfully (Playwright or WebFetch)
- [ ] Evaluation completes (blocks A-F)
- [ ] Report saved with correct numbering (001, 002, etc.)
- [ ] Report includes `**URL:**` in header
- [ ] PDF generated in `output/` directory
- [ ] PDF is readable and tailored
- [ ] Tracker entry added to `data/applications.md`
- [ ] Status is `Evaluated`
- [ ] PDF column shows ✅
- [ ] All communication in English

---

### 3. Portal Scanner
**Test:** `/career-ops scan`

**Prerequisites:** 
- `portals.yml` exists and has some tracked companies
- `data/scan-history.tsv` may or may not exist

**Expected:**
- Reads `portals.yml` configuration
- Scans companies via Playwright (Level 1)
- Optionally uses Greenhouse API (Level 2) and WebSearch (Level 3)
- Filters by title keywords
- Adds new offers to `data/pipeline.md`
- Updates `data/scan-history.tsv`
- Runs as subagent (separate context)
- Shows summary with counts

**Verify:**
- [ ] Scanner reads portals.yml
- [ ] Playwright navigates to careers pages
- [ ] Job listings extracted (title + URL)
- [ ] Title filtering works (positive/negative keywords)
- [ ] Deduplication works (no duplicates in pipeline)
- [ ] New offers added to `data/pipeline.md`
- [ ] Scan history updated
- [ ] Summary shows: found, filtered, duplicates, new
- [ ] Runs as subagent (check context)
- [ ] Communication in English

---

### 4. CV PDF Generator
**Test:** `/career-ops pdf`

**Then:** Provide a JD (paste text or URL)

**Prerequisites:**
- `cv.md` exists with candidate's CV
- `templates/cv-template.html` exists

**Expected:**
- Reads `cv.md`
- Extracts 15-20 keywords from JD
- Detects language (default English)
- Detects paper format (US=letter, else=A4)
- Customizes Professional Summary
- Selects top 3-4 relevant projects
- Builds competency grid
- Generates HTML
- Runs `node generate-pdf.mjs`
- Creates PDF in `output/`
- Reports path, pages, keyword coverage

**Verify:**
- [ ] cv.md read successfully
- [ ] Keywords extracted from JD
- [ ] Summary rewritten with keywords
- [ ] Projects selected and prioritized
- [ ] HTML generated from template
- [ ] PDF generation script executes
- [ ] PDF created in `output/cv-candidate-{company}-{YYYY-MM-DD}.pdf`
- [ ] PDF is ATS-optimized (single column, standard headers)
- [ ] Keywords injected naturally (not fabricated skills)
- [ ] Communication in English

---

### 5. Single Offer Evaluation
**Test:** `/career-ops offer`

**Then:** Provide JD (paste or URL)

**Expected:**
- Runs A-F evaluation blocks:
  - A) Extract & Verify
  - B) Archetype scoring
  - C) Compensation analysis
  - D) Culture/WLB assessment
  - E) Growth potential
  - F) Final recommendation
- Saves report to `reports/`
- Does NOT generate PDF
- Does NOT update tracker

**Verify:**
- [ ] All evaluation blocks complete (A-F)
- [ ] Archetype scores calculated (1-5 scale)
- [ ] Overall score provided (X.X/5)
- [ ] Pros/cons listed
- [ ] Recommendation given (Apply/Maybe/Skip)
- [ ] Report saved in `reports/`
- [ ] Report numbering correct (sequential)
- [ ] Report includes `**URL:**` in header
- [ ] PDF NOT generated (❌ in report header)
- [ ] Tracker NOT updated
- [ ] Communication in English

---

## Integration Tests

### 6. File References
**Test:** In any command, reference files using `@cv.md` or `@data/applications.md`

**Expected:** AI can read and use file contents

**Verify:**
- [ ] `@cv.md` loads CV content
- [ ] `@data/applications.md` loads tracker
- [ ] File references work consistently

---

### 7. Shell Commands
**Test:** During pdf mode, verify `node generate-pdf.mjs` executes

**Expected:** Script runs successfully and generates PDF

**Verify:**
- [ ] Shell command executes
- [ ] PDF appears in `output/` directory
- [ ] No errors in execution

---

### 8. Onboarding Flow (Fresh Setup)
**Test:** Delete `cv.md`, `config/profile.yml`, `portals.yml`, then run `/career-ops scan`

**Expected:**
- Detects missing files
- Enters onboarding mode
- Guides through setup step-by-step
- Creates required files
- Can proceed after setup

**Verify:**
- [ ] Missing files detected
- [ ] Onboarding starts automatically
- [ ] Guided setup in English
- [ ] `cv.md` created (from paste, LinkedIn, or draft)
- [ ] `config/profile.yml` created
- [ ] `portals.yml` created
- [ ] `data/applications.md` created
- [ ] Can proceed with commands after setup

---

## Data Integrity Tests

### 9. Tracker Deduplication
**Test:** Run auto-pipeline on same company+role twice

**Expected:** Updates existing entry, doesn't create duplicate

**Verify:**
- [ ] First run creates new entry
- [ ] Second run updates existing entry
- [ ] Only one entry exists in `data/applications.md`
- [ ] No duplicate entries

---

### 10. Report Numbering
**Test:** Generate multiple evaluation reports

**Expected:** Sequential numbering (001, 002, 003...)

**Verify:**
- [ ] First report is 001
- [ ] Second report is 002
- [ ] Third report is 003
- [ ] No gaps in numbering
- [ ] No duplicate numbers

---

## Cross-Tool Compatibility

### 11. Shared Data
**Test:** Create report in OpenCode, then open project in Claude Code (or vice versa)

**Expected:** Both tools read same files with no conflicts

**Verify:**
- [ ] Reports visible in both tools
- [ ] Tracker data consistent
- [ ] PDFs accessible from both
- [ ] No file conflicts
- [ ] Same data displayed

---

### 12. Mode Files Translation
**Test:** Verify OpenCode reads Spanish `modes/*.md` correctly

**Expected:** AI translates and executes instructions in English

**Verify:**
- [ ] Mode files (Spanish) loaded correctly
- [ ] AI understands Spanish instructions
- [ ] User sees English output
- [ ] Workflows execute correctly despite language difference

---

## Edge Cases

### 13. Closed Job Offer
**Test:** Provide URL to a closed job posting

**Expected:** Detects offer is closed (Playwright verification)

**Verify:**
- [ ] Navigates to URL
- [ ] Detects closed status (no JD, only footer/navbar)
- [ ] Informs user offer is closed
- [ ] Suggests marking as Discarded

---

### 14. Invalid URL
**Test:** Provide invalid or broken URL

**Expected:** Handles gracefully, asks for alternative

**Verify:**
- [ ] Error detected (404, timeout, etc.)
- [ ] User informed
- [ ] Alternative suggested (paste JD text)

---

### 15. Low-Fit Offer (Score < 3.0)
**Test:** Evaluate an obviously poor-fit job

**Expected:** Low score, discourages application

**Verify:**
- [ ] Score below 3.0/5
- [ ] Recommendation: Skip or Maybe
- [ ] Explicitly tells user this is weak match
- [ ] Ethical guidance provided

---

## Performance Tests

### 16. Large Scan (10+ Companies)
**Test:** Configure portals.yml with 10+ companies, run `/career-ops scan`

**Expected:** Completes within reasonable time, handles rate limits

**Verify:**
- [ ] Scan completes (may take several minutes)
- [ ] Rate limits respected (delays between requests)
- [ ] All companies scanned
- [ ] Results accurate

---

### 17. Batch Pipeline Processing
**Test:** Add 5+ URLs to `data/pipeline.md`, run `/career-ops pipeline`

**Expected:** Processes all URLs sequentially or in batches

**Verify:**
- [ ] All URLs processed
- [ ] Reports generated for each
- [ ] Tracker updated for all
- [ ] User can interrupt between batches

---

## Summary

**Total Tests:** 17

**Passing:** ___ / 17

**Notes:**

---

## Common Issues & Solutions

### Issue: Playwright not installed
**Solution:** Run `npx playwright install chromium`

### Issue: cv.md not found
**Solution:** Run onboarding or create cv.md manually

### Issue: generate-pdf.mjs fails
**Solution:** Check Node.js version (requires v16+), verify Playwright installed

### Issue: Commands not recognized
**Solution:** Verify `.opencode/commands/` directory exists with .md files

### Issue: Mode files not loading
**Solution:** Check `modes/` directory exists with Spanish .md files

### Issue: Translation issues
**Solution:** AI should auto-translate; if issues persist, check mode file syntax

---

## Next Steps After Testing

If all tests pass:
- [ ] Document any issues found
- [ ] Create GitHub issues for bugs
- [ ] Update documentation with findings
- [ ] Add remaining commands (offers, contact, deep, training, etc.)
- [ ] Create OpenCode-specific guide in `docs/`

If tests fail:
- [ ] Note which tests failed
- [ ] Debug and fix issues
- [ ] Re-run failed tests
- [ ] Update commands or skill files as needed
