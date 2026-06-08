# SKILL_UPDATE_PHASE1.md — Manual paste into job-pulse-1am-refresh/SKILL.md

**Rahil: paste the block below into your OneDrive scheduled task SKILL.md.**
Insert it AFTER Step 0.75 (PRIMARY SCAN) and BEFORE Step 1 (SECONDARY SCAN / WebSearch).
This becomes the new **Step 0.9**.

The sandbox cannot write to OneDrive directly (reparse-point restriction, see BUGS.md K-2026-06-05-3).

---

## Step 0.9 — Greenhouse + Lever via Cloudflare Worker

**Live Worker URL:** `https://pulse-jobs-proxy.rahilnathanipulse.workers.dev`

Fetch structured, ATS-verified job lists from Greenhouse and Lever via the Pulse Jobs Proxy Worker. Results are pre-verified (Worker calls the real ATS API) — no further URL verification needed.

### Greenhouse companies (adjust as needed):

For each company slug, fetch:
```
GET https://pulse-jobs-proxy.rahilnathanipulse.workers.dev/greenhouse/{slug}
```

Default company list:
- `stripe` — fintech infrastructure
- `anthropic` — AI safety
- `databricks` — data/AI platform
- `openai` — AI research/products
- `notion` — productivity/SaaS
- `figma` — design tools
- `linear` — engineering tools

Filter results: keep jobs where `title` matches Scrum Master / Agile Coach / Program Manager / TPM / RTE / Delivery Manager patterns (same A/B/C grading as scan.mjs).

### Lever companies:

For each company slug, fetch:
```
GET https://pulse-jobs-proxy.rahilnathanipulse.workers.dev/lever/{slug}
```

Default company list:
- `figma` — design tools
- `linear` — engineering tools
- `notion-hq` — productivity (try `notion` if 404)
- `hex` — data science
- `retool` — internal tools

### Run ingest-runner to normalize and dedup:

Save each Worker response JSON to temp files, then:
```bash
cd C:/Users/rahil/career-ops
node scripts/ingest-runner.mjs \
  --gh-fixture  data/worker-gh-raw-{date}.json \
  --lv-fixture  data/worker-lv-raw-{date}.json \
  --output      data/jobs-incoming-worker-{date}.json
```

Or pass directly to the --greenhouse / --lever flags with PULSE_WORKER_URL set:
```bash
PULSE_WORKER_URL=https://pulse-jobs-proxy.rahilnathanipulse.workers.dev \
  node scripts/ingest-runner.mjs \
    --greenhouse stripe,anthropic,databricks,openai,notion \
    --lever figma,linear,notion-hq \
    --output data/jobs-incoming-worker-{date}.json
```

All Worker jobs arrive with `verified: true` — skip Step 1.6 ATS verification for these.
Add jobs to candidate pool before Step 3 (Kanban injection).

**Final Report counts:** `greenhouse_raw` / `lever_raw` / `deduped` / `net`

---

**Worker health check:** `https://pulse-jobs-proxy.rahilnathanipulse.workers.dev/health`
Returns: `{"status":"ok","version":"1.0.0","timestamp":"..."}`

**Source config (future):** Company lists should eventually live in `config/sources.yml`
so they're version-controlled and reviewable (see BUGS.md note in K-2026-06-05-2).
