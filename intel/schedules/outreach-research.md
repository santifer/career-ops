# Schedule: Outreach Research (every 24h)

## Purpose

Enrich high-score prospects with hiring manager (HM) discovery and draft personalized outreach. Also monitor Gmail for replies, classify responses, draft follow-ups, and detect inbound interest from ATS emails and LinkedIn alerts.

This schedule runs two cadences within its 24h cycle:
- **Daily intel mining** (once per run): HM discovery, outreach drafting, LinkedIn/ATS signal parsing
- **Response monitoring** (every 4h sub-cadence): Gmail reply detection and follow-up drafting

## Trigger

- **Interval:** every 24 hours (response monitoring sub-cadence: every 4h)
- **Type:** background agent

---

## Part 1: Daily Intel Mining

### Step 1: Load enrichment targets

- Read `intel/prospects.md` — filter: `score >= 4.0` AND no HM info recorded
- Read `intel/outreach.md` — filter: status `needs_enrichment`
- Take top 5 by score (to avoid tool rate limits and keep quality high)

### Step 2: HM Discovery Pipeline (Stages 1-4, per prospect)

Run for each of the top 5 prospects:

**Stage 1 — Role mapping**
- Identify the likely HM title for this role (e.g., for "Senior AI Engineer" → "VP of Engineering", "Head of AI", "Director of ML")
- Cross-reference with company size and org structure if known

**Stage 2 — LinkedIn discovery**
- Search LinkedIn (via BrightData or Exa) for the HM at the target company
- Target: current employees with titles matching Stage 1 mapping
- Extract: name, title, LinkedIn URL, tenure, recent activity

**Stage 3 — Signal mining**
- **Exa:** search HM's name + company for blog posts, conference talks, interviews, GitHub activity
- **Tavily:** recent news mentions, podcast appearances, published opinions
- Build a "what they care about" profile (2-3 bullet points)

**Stage 4 — Connection path**
- Check for mutual connections or shared communities (alumni networks, Slack communities, newsletters)
- Note any warm intro paths

### Step 3: Draft outreach (Stage 5)

For each enriched prospect, draft a personalized outreach message:
- Reference a specific signal from Stage 3 (article, talk, shared interest)
- Connect to the user's relevant proof point from `article-digest.md` or `cv.md`
- Keep to 3-5 sentences. No generic openers ("I came across your profile...")
- Format: LinkedIn DM preferred; email as fallback if address is discoverable

Write draft to `intel/outreach.md` with status `draft_ready`.

### Step 4: Create artifacts (Stage 6)

For prospects with approved or auto-ready outreach:
- **Gmail draft:** create draft via `gmail_create_draft` with subject line, recipient, and outreach body
- **Google Docs resume:** generate a tailored resume variant (read `cv.md`, adapt to role) and create as Google Doc
- Link both artifacts in `intel/outreach.md` entry

### Step 5: Update outreach tracker

- Update `intel/outreach.md` with HM info, signal summary, outreach draft status, artifact links
- If a prospect couldn't be enriched after 3 attempts: mark `enrichment_failed` and note reason

### Step 6: LinkedIn alerts and ATS email parsing

- **`gmail_search_messages`:** search for ATS system emails (Greenhouse, Lever, Workday, Ashby, etc.) in inbox
  - Detect: application confirmations, stage advances, rejections
  - Suggest tracker updates for matching entries in `data/applications.md` (do not auto-update; flag for user)
- Search for LinkedIn job alert emails — extract job titles and URLs
  - Add to `intel/prospects.md` if not already tracked (mark source: `linkedin-alert`)

---

## Part 2: Response Monitoring (4h sub-cadence)

Run every 4 hours within the 24h schedule window (e.g., at 0h, 4h, 8h, 12h, 16h, 20h).

### Step 1: Scan Gmail for outreach replies

- **`gmail_search_messages`:** query for replies to outreach threads tracked in `intel/outreach.md`
- For each reply found: read thread via `gmail_read_thread`

### Step 2: Classify responses

| Response type | Action |
|---------------|--------|
| Positive / interested | Update `intel/outreach.md` status → `responded_positive`, draft reply |
| Question / needs info | Update status → `responded_question`, draft answer using CV/profile |
| Soft rejection ("not hiring now") | Update status → `responded_soft_no`, note for follow-up in 60d |
| Hard rejection | Update status → `rejected` |
| No reply after 7d | Flag for follow-up → `ghosted` |

### Step 3: Draft replies for questions

- For any `responded_question` status: read the question, pull relevant context from `cv.md` and `config/profile.yml`, draft a concise reply
- Write draft to `intel/outreach.md` and create Gmail draft via `gmail_create_draft`

### Step 4: Draft follow-ups for ghosted threads

- Condition: outreach sent >= 7 days ago, no reply, not previously followed up
- Draft a short follow-up (2-3 sentences, different angle from original)
- Create Gmail draft and update `intel/outreach.md` status → `followup_drafted`

---

## Config

```yaml
daily_cadence: 24h
response_monitoring_cadence: 4h
enrichment_targets:
  min_score: 4.0
  status_filter: [needs_enrichment]
  top_n: 5
tools:
  hm_discovery: [brightdata, exa, linkedin]
  signal_mining: [exa, tavily]
  email: [gmail_create_draft, gmail_search_messages, gmail_read_thread]
  ats_parsing: [gmail_search_messages]
followup_after_days: 7
output:
  outreach: intel/outreach.md
  prospects: intel/prospects.md
  flags: intel/flags.md
```

## Notes

- NEVER send outreach without user review. This schedule only creates drafts — the user clicks send.
- HM discovery may not always succeed (private profiles, small companies). Log attempts in `intel/outreach.md`.
- ATS email parsing produces suggestions only — do not auto-update `data/applications.md`
- Google Docs resume creation requires Google Drive access; skip and note if not available
- Response monitoring runs within the same agent session as the daily intel mining pass when possible; schedule separately if the platform supports sub-cadence triggers
