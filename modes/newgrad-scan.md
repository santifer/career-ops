# Mode: newgrad-scan — newgrad-jobs.com Scanner

Scans newgrad-jobs.com for matching job listings via the Chrome extension,
scores them locally, enriches high-scoring rows, and adds survivors to the pipeline.

## Prerequisites

- Chrome extension installed and configured with bridge token
- Bridge server running (`npm --prefix bridge run start`)

## Execution

This mode uses the Chrome extension for DOM extraction. The CLI coordinates.

### Step 1: Verify bridge is running

Check `/v1/health`. If not reachable, tell the user:

> "Start the bridge first: `npm --prefix bridge run start`"

### Step 2: Direct user to browser

> "Open https://www.newgrad-jobs.com/ in Chrome.
> The career-ops panel will detect the page and show the scanner UI.
> Click **Scan & Score** to extract and filter listings.
> Then click **Enrich detail pages** to gather full JD data.
> Results will be written to `data/pipeline.md`."

### Step 3: Process results

After the user confirms the scan is done, offer:

> "Scan complete. Want me to process the new pipeline entries?
> - `/career-ops pipeline` — evaluate one by one
> - `/career-ops batch` — parallel batch evaluation"

## Scoring Configuration

Scoring is configured in `config/profile.yml → newgrad_scan`. Three dimensions:
1. **Role match** — title keyword matching
2. **Skill keywords** — qualifications text matching
3. **Freshness** — post age

Thresholds:
- `list_threshold` — minimum score to open detail page
- `pipeline_threshold` — minimum score to add to `data/pipeline.md`

To customize: edit `config/profile.yml → newgrad_scan`.
