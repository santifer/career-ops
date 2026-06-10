# Pulse Engine — Live Submission Protocol

Escalate through the modes in order. Do not skip a step.

---

## Step 0a — Personal Info Setup (one time, ~5 minutes)

```powershell
# 1. Copy the template
copy config\personal-info.yml.template config\personal-info.yml

# 2. Fill in your info
notepad config\personal-info.yml

# Required fields:  name.first, name.last, contact.email, resume.path
# resume.path must be an absolute Windows path, e.g. C:\Users\rahil\Documents\Resume.pdf
# The .yml is gitignored — your real info will never be committed.

# 3. Verify it loads cleanly
node -e "import('./scripts/load-personal-info.mjs').then(m=>m.loadPersonalInfo()).then(p=>console.log('OK', p.name.full, '<'+p.contact.email+'>'))"
```

Expected output: `OK Jane Doe <you@example.com>`
If you see a `PersonalInfoError`, fix the field it names.

---

## Step 0 — Verify CL stockpile health

Before any submission run, confirm the CL index is populated and files are on disk:

```powershell
# Count individual CL files on disk
(Get-ChildItem "cover-letters\" -File | Where-Object { $_.Name -ne "bulk-export-2026-04-29.md" } | Measure-Object).Count

# Count entries in the index
node -e "import('js-yaml').then(m => { const f = require('fs'); const idx = m.default.load(f.readFileSync('cover-letters/index.yml','utf8')); console.log('index entries:', idx.templates.length); })"
```

Both counts should be non-zero and roughly equal. If the index is missing or has 0 entries:
```bash
node scripts/extract-cls.mjs   # re-extract from bulk-export
```

If the `cover-letters/` directory only has the bulk export file, the dry-run will show `CL: ❌` for every card. Rebuild the stockpile first.

---

## Step 0b — Firefox + SpeedyApply setup (one time, ~5 minutes)

Skip this if you want to use Playwright's built-in Chromium with our selector-based form fill.
Do this if SpeedyApply is already installed in your Firefox profile.

```powershell
# 1. Auto-detect your Firefox install and profile
node scripts/detect-firefox.mjs

# 2. Copy the template and fill in the paths printed above
copy config\browser.yml.template config\browser.yml
notepad config\browser.yml

# Required fields (when preferred: firefox):
#   firefox.executable_path  — full path to firefox.exe
#   firefox.profile_path     — full path to the profile with SpeedyApply installed
# The .yml is gitignored — your real paths will never be committed.

# 3. Verify it loads cleanly
node -e "import('./scripts/load-browser-config.mjs').then(m=>m.loadBrowserConfig()).then(c=>console.log('OK', c.preferred, '| extension_autofill:', c.extension_autofill))"
```

Expected output: `OK firefox | extension_autofill: true`
If you see a `BrowserConfigError`, fix the field it names.

**How it works:** With `extension_autofill: true`, auto-submit launches Firefox using your real
profile, navigates to the job URL, then waits 5 seconds for SpeedyApply to detect the form and
autofill it. Our built-in field selectors (Greenhouse/Lever/Workday) are skipped entirely.

To opt out of extension autofill on a single run:
```powershell
node scripts/auto-submit.mjs --semi-auto --no-extension-autofill --limit 1
```

---

## Step 0c — Export kanban snapshot (when using K2 dashboard)

If you are running the K2 browser kanban instead of a static HTML file, use the Export JSON workflow to feed cards to auto-submit:

```powershell
# 1. Start the kanban server (separate shell)
npm run kanban         # opens http://localhost:7777

# 2. In the browser:
#    a. Click "⬇ Fetch Jobs" to populate from the Cloudflare Worker
#    b. Drag cards you want to submit from "New" → "Evaluated" to mark them for submission
#    c. Click "⬆ Export JSON" — browser downloads pulse-jobs-{date}.json
#    d. Move the downloaded file to the data/ directory:
Move-Item "$env:USERPROFILE\Downloads\pulse-jobs-*.json" "data\kanban-snapshot-$(Get-Date -Format yyyy-MM-dd).json"

# 3. Run dry-run from the snapshot
node scripts/auto-submit.mjs `
  --kanban-json data/kanban-snapshot-$(Get-Date -Format yyyy-MM-dd).json `
  --dry-run --report --limit 10
```

**Eligible states** (cards in any other state are filtered out):
| State | Why eligible |
|-------|-------------|
| `evaluated` | User reviewed/scored the card and wants to proceed to application |

**JSON shape contract** (`exportState()` in dashboard/job-pulse-kanban.html):
```json
{
  "cards": {
    "<id>": {
      "id": "greenhouse-stripe-001",
      "state": "new",
      "title": "Senior Scrum Master",
      "company": "Stripe",
      "url": "https://job-boards.greenhouse.io/stripe/jobs/...",
      "grade": "A",
      "has_connection": false,
      "source": "greenhouse"
    }
  },
  "version": 1
}
```

---

## Step 1 — Dry-run + report (10 cards)

```bash
node scripts/auto-submit.mjs \
  --kanban dashboard/job-pulse-kanban.html \
  --dry-run \
  --report \
  --limit 10
```

Review the markdown table. Log defects in BUGS.md.
Check: Are the right cards eligible? ATS detected correctly? Cover letters present?

---

## Step 2 — Semi-auto (3 cards, your choice)

```bash
node scripts/auto-submit.mjs \
  --kanban dashboard/job-pulse-kanban.html \
  --semi-auto \
  --limit 3
```

A visible Chromium window opens for each card. The submit button is highlighted with a red border.
Review the filled form. Click Submit yourself, or press Ctrl+C to abort.
Check `data/semi-auto-{date}.json` for outcome log.

---

## Step 3 — Whitelist lower-tier companies

Edit `config/lower-tier-test-companies.yml`:

```yaml
enabled: true
companies:
  - slug: company-one
    reason: Fortune 500 mid-tier, approved 2026-MM-DD
  - slug: company-two
    reason: low-priority target, low recruiter volume
```

Company slug = kanban card `company` field, lowercased, spaces/punctuation → hyphens.
Start with 5 companies you'd be comfortable with even if the submission looks slightly off.

---

## Step 4 — Live 3 cards (lower tier only)

```bash
node scripts/auto-submit.mjs \
  --kanban dashboard/job-pulse-kanban.html \
  --live \
  --allow-tier lower \
  --limit 3
```

Watch `data/screenshots/{date}/` as they appear.
Check `data/live-runs-{date}.json` for confirmed/unconfirmed breakdown.
Run `node merge-tracker.mjs` to sync `batch/tracker-additions/` into `data/applications.md`.

---

## Step 5 — Expand lower-tier list

After 2 clean days with no `intermediate-step` or `unconfirmed` surprises:
- Add 5 more companies to `config/lower-tier-test-companies.yml`
- Raise `--limit` to 5

---

## Step 6 — F500 expansion (propose after 1 clean week)

After 1 week of clean lower-tier live runs:
- Propose adding a `production` tier to `config/lower-tier-test-companies.yml`
- A separate `--allow-tier production` flag + separate daily cap will gate Fortune 100 targets
- Set a new daily cap for the production tier (suggest starting at 3)

---

## Safety signals to watch

| Signal | What it means | Action |
|--------|--------------|--------|
| `intermediate-step` in live-runs | Application flow changed (review/confirm page) | **STOP.** Review manually. Do not resume live mode until you've read the page. |
| `unconfirmed` (60s timeout) | Page didn't redirect or show success text | Check screenshot. If page looks submitted, mark manually in applications.md. |
| `requires-human` (CAPTCHA) | Bot detection on that ATS | Skip for now. Try semi-auto on that company. |
| `dead-listing` | Job posting was closed/expired | Remove card from kanban. |
| Daily cap hit | 5 confirmed submissions today | Wait until tomorrow. |
