# Pulse Engine — Live Submission Protocol

Escalate through the modes in order. Do not skip a step.

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
