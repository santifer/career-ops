---
description: Scan job portals and discover new offers
agent: general
subtask: true
---

# Portal Scanner

Scan job portals for new offers and add them to your pipeline.

Arguments: $ARGUMENTS

**What to do:**

1. Load `modes/_shared.md` and `modes/scan.md` (Spanish - translate as you execute)

2. Run the 3-level scan strategy:
   
   **Level 1 (Primary) - Playwright Direct:**
   - Read `portals.yml` → get `tracked_companies`
   - For each company with `careers_url` and `enabled: true`:
     - Navigate with Playwright (`browser_navigate`)
     - Snapshot the careers page (`browser_snapshot`)
     - Extract all job listings (title + URL)
     - If the page has filters/departments, navigate relevant sections
   - This is the most reliable method (real-time, works with SPAs)
   
   **Level 2 (Supplement) - Greenhouse API:**
   - For companies with `api:` defined in portals.yml
   - Fetch JSON from Greenhouse boards API
   - Extract structured job data
   - Faster than Playwright but only works for Greenhouse
   
   **Level 3 (Discovery) - WebSearch:**
   - For each query in `search_queries` with `enabled: true`
   - Run WebSearch with site: filters
   - Extract title, URL, company from results
   - Useful for discovering new companies not yet tracked

3. Filter by title using `title_filter` from portals.yml:
   - Must have at least 1 keyword from `positive` list
   - Must have 0 keywords from `negative` list
   - `seniority_boost` keywords are optional but increase priority

4. Deduplicate against:
   - `data/scan-history.tsv` - URLs already seen
   - `data/applications.md` - company+role already evaluated
   - `data/pipeline.md` - URLs already in pending queue

5. For each new offer that passes filters:
   - Add to `data/pipeline.md` in "Pendientes" section: `- [ ] {url} | {company} | {title}`
   - Record in `data/scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

6. For filtered/duplicate offers:
   - Record in scan-history.tsv with status `skipped_title` or `skipped_dup`

7. Show summary:
   ```
   Portal Scan — {YYYY-MM-DD}
   ━━━━━━━━━━━━━━━━━━━━━━━━━━
   Queries executed: N
   Offers found: N total
   Filtered by title: N relevant
   Duplicates: N (already evaluated or in pipeline)
   New offers added to pipeline: N
   
     + {company} | {title} | {source}
     ...
   
   → Run /career-ops pipeline to evaluate the new offers.
   ```

**Run this as a subagent** to avoid cluttering main context.

**Config files:**
- `portals.yml` - companies to track, search queries, title filters
- `data/scan-history.tsv` - deduplication database

**Careers URL management:**
- Each company should have `careers_url` defined
- If missing, try to find it (search or use known patterns for Ashby/Greenhouse/Lever)
- Save discovered URLs back to portals.yml for future scans
