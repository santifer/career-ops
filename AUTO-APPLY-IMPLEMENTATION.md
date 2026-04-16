# Auto-Apply Feature — Complete Implementation

## Overview

Full automatic job application system for career-ops. Scans job portals, detects pending applications, fills forms, and submits automatically every N minutes.

---

## What's New

### 🎯 New Commands

| Command | Purpose |
|---------|---------|
| `node auto-apply.mjs help` | Show help menu |
| `node auto-apply.mjs setup` | Initialize system (one-time) |
| `node auto-apply.mjs status` | Check current pipeline status |
| `node auto-apply.mjs scan` | Scan for new jobs (default) |
| `node auto-apply.mjs scan bogota` | Scan only Bogotá/Colombia |
| `node auto-apply.mjs scan global` | Scan worldwide jobs |
| `node auto-apply.mjs apply` | Apply to all pending jobs |
| `node auto-apply.mjs loop` | Run scan+apply every 5 minutes |
| `node auto-apply.mjs loop 10` | Run every 10 minutes (custom) |
| `node auto-apply.mjs test <url>` | Debug single job URL |
| `node auto-apply.mjs test-login` | Verify login credentials |

### 📄 New Files

#### Main Scripts (~1500 lines total)

- **`auto-apply.mjs`** (200 lines)
  - CLI entry point for all auto-apply commands
  - Simple, user-friendly interface
  - Handles: scan, apply, loop, status, help, setup, test

- **`apply-auto.mjs`** (330 lines)
  - Core auto-apply logic
  - For each job URL:
    - Navigates to job posting
    - Detects if already applied
    - Attempts login if needed
    - Fills form with candidate data
    - Submits application
    - Detects success (checkmark/confirmation)
    - Logs results
  - Uses Playwright for headless browser automation
  - Reads profile.yml for candidate data
  - Reads credentials.yml for login info

- **`apply-loop.mjs`** (50 lines)
  - Wrapper to run `apply-auto.mjs` on schedule
  - Spawns child process every N minutes
  - Runs: `node apply-auto.mjs` repeatedly
  - Can also run as: `node apply-auto.mjs --loop 5`

- **`apply-pipeline.mjs`** (150 lines)
  - Complete workflow orchestrator
  - Combines: scan → apply → report
  - Logs each cycle to pipeline-history.jsonl
  - Generates summary statistics

- **`apply-computrabajo.mjs`** (200 lines)
  - Specialized for Computrabajo.com
  - Handles Computrabajo-specific:
    - Form field names
    - "Postulado" status detection
    - Checkmark success confirmation
    - candidato.co.computrabajo.com redirect
  - Can run standalone or via main pipeline
  - Useful for debugging specific URLs

- **`diagnose-auto-apply.mjs`** (250 lines)
  - Diagnostic tool
  - Checks:
    - ✓ File existence (cv.md, profile.yml, credentials.yml, pipeline.md)
    - ✓ YAML validity
    - ✓ Profile completeness (name, email, phone, location)
    - ✓ Credentials configured
    - ✓ Network connectivity (Computrabajo, LinkedIn)
    - ✓ Browser support (Playwright/Chromium)
    - ✓ Form field detection
    - ✓ Git/repository status
    - ✓ Dependencies installed
  - Run: `node diagnose-auto-apply.mjs`

#### Documentation

- **`AUTO-APPLY.md`** (200 lines)
  - Full feature documentation
  - Setup requirements
  - Usage examples
  - Status codes & troubleshooting
  - Architecture diagram
  - Limitations & customization

- **`QUICKSTART-ES.md`** (300 lines)
  - Spanish quick-start guide
  - Perfect for your workflow
  - Direct copy-paste commands
  - Common scenarios
  - Troubleshooting in Spanish

#### Configuration

- **`config/credentials.example.yml`** (NEW)
  - Template for login credentials
  - Example format:
    ```yaml
    computrabajo:
      email: "your-email@example.com"
      password: "your-password"
    linkedin:
      email: "your-email@example.com"
      password: "your-password"
    ```
  - Copy to `config/credentials.yml` and edit

### 🔧 Modified Files

- **`.gitignore`**
  - Added: `config/credentials.yml` (already had it)
  - Added: `logs/`
  - Added: `data/*-log.md`

### 📊 New Data Files (Generated)

During operation, the system creates:

- **`data/applications-log.md`** (expanded)
  - Detailed log of every application attempt
  - Format: timestamp | company | role | status | details
  - Statuses: success, already-applied, error, no-apply-button, form-not-submitted, etc.

- **`data/pipeline-history.jsonl`** (NEW)
  - Machine-readable history of each automation cycle
  - Format: one JSON object per line
  - Fields: cycle, timestamp, pending, total_applications, scan_type

- **`logs/auto-apply.log`** (NEW when running in background)
  - Stdout/stderr from background processes
  - View with: `tail -f logs/auto-apply.log`

---

## How It Works

### Flow Diagram

```
┌─ auto-apply.mjs (CLI)
│  └─ Parses command: scan | apply | loop | status | setup | test
│
├─ SCAN MODE
│  └─ Calls: scan.mjs, scan-bogota.mjs, or scan-international.mjs
│     └─ Finds new job URLs
│     └─ Appends to data/pipeline.md
│
├─ APPLY MODE
│  └─ Calls: apply-auto.mjs
│     └─ For each URL in pipeline.md:
│        ├─ Launch headless browser
│        ├─ Navigate to job URL
│        ├─ Check if already applied
│        ├─ Attempt login
│        ├─ Fill form fields from profile.yml
│        ├─ Click submit
│        ├─ Detect success
│        └─ Append to data/applications-log.md
│
├─ LOOP MODE
│  └─ setInterval(scan + apply, N minutes)
│     └─ Runs continuously until Ctrl+C
│
├─ STATUS MODE
│  └─ Show: pending jobs, applied count, success/error ratio
│
├─ TEST MODE
│  └─ Calls: apply-computrabajo.mjs <url>
│     └─ Run single URL with visible browser (debug mode)
│
└─ SETUP MODE
   └─ Initialize required files
      └─ cv.md, profile.yml, credentials.yml, pipeline.md
```

### Form Auto-Filling

Maps form field names to profile.yml data:

```
Form Field          →  Profile Data
─────────────────────────────────────
name, nombre        →  candidate.full_name
email               →  candidate.email
phone, teléfono     →  candidate.phone
location, ciudad    →  candidate.location
linkedin            →  candidate.linkedin
portfolio, website  →  candidate.portfolio_url
message, motivation →  Auto-generated text
```

### Success Detection

Looks for any of these indicators:

1. **Computrabajo:**
   - SVG element with `class*="checkmark"`
   - Text: "¡Aplicaste correctamente!"
   - Div with `class*="postulado"` (status_prev)

2. **LinkedIn:**
   - Text: "Application sent"
   - Generic Success DIV indicators

3. **Fallback:**
   - Form submitted without visual error

---

## Usage Scenarios

### 👉 Scenario 1: Manual One-Time Apply

```bash
# 1. Scan for jobs (search once)
node auto-apply.mjs scan bogota

# 2. Review what was found
node auto-apply.mjs status

# 3. Apply to all
node auto-apply.mjs apply

# 4. Check results
tail data/applications-log.md
```

**Time:** 5-15 minutes

### 👉 Scenario 2: Daily Automation

```bash
# Background job: scan + apply every morning
# (Run this from cron or Task Scheduler)
node auto-apply.mjs loop 30
```

Runs every 30 minutes, forever.

### 👉 Scenario 3: Overnight Continuous

```bash
# Terminal 1: Start background process
nohup node auto-apply.mjs loop 5 > logs/auto-apply.log 2>&1 &

# Terminal 2: Monitor status (check anytime)
tail -f logs/auto-apply.log

# Anytime: Check results
node auto-apply.mjs status
cat data/applications-log.md
```

System runs 24/7, applies to jobs as they're discovered.

### 👉 Scenario 4: Debug Single Job

```bash
# Test a specific URL (will open browser for debugging)
node auto-apply.mjs test https://co.computrabajo.com/trabajo-123

# Or with the Computrabajo specialist:
node apply-computrabajo.mjs https://co.computrabajo.com/trabajo-456
```

---

## Configuration

### Before First Run

1. **Create `config/credentials.yml`**
   ```bash
   cp config/credentials.example.yml config/credentials.yml
   ```

2. **Edit `config/credentials.yml`** with your login credentials
   ```yaml
   computrabajo:
     email: "your-email@computrabajo.com"
     password: "your-password"
   linkedin:
     email: "your-email@linkedin.com"
     password: "your-password"
   ```

3. **Verify `config/profile.yml`** has your data
   - full_name
   - email
   - phone
   - location

4. **Check `cv.md`** exists and is formatted

5. **Run diagnostic**
   ```bash
   node diagnose-auto-apply.mjs
   ```

---

## API Reference

### `apply-auto.mjs` Functions

```javascript
// Main entry point
main()

// Login to platform if needed
async login(page, url, credentials)

// Check if already applied to this job
async hasAlreadyApplied(page, url)

// Find and click the apply button
async findAndClickApplyButton(page)

// Auto-fill form fields from profile data
async fillForm(page, candidate)

// Click submit button
async submitApplication(page)

// Look for success indicators
async detectSuccess(page)

// Map form field names to profile data
guessValue(name, placeholder, candidate)

// Process a single job URL
async processJob(job, profile, credentials)

// Parse pipeline.md for job URLs
parsePipeline()

// Generate markdown report
buildReport(results)
```

### `auto-apply.mjs` Commands

```bash
auto-apply.mjs help              # Show help
auto-apply.mjs status            # Show status
auto-apply.mjs setup             # Initialize
auto-apply.mjs scan [bogota|global]  # Search for jobs
auto-apply.mjs apply [--dry]     # Apply once
auto-apply.mjs loop [N]          # Apply every N minutes
auto-apply.mjs test <url>        # Debug URL
auto-apply.mjs test-login        # Verify credentials
```

---

## Limitations & Known Issues

| Issue | Workaround |
|-------|-----------|
| **No 2FA support** | Disable 2FA on automation accounts |
| **No file uploads** | Paste URLs (portfolio_url) instead of file uploads |
| **Session not persistent** | Fresh login for each application (slower but reliable) |
| **Complex forms may not fill** | Manually fill special forms or add custom selectors |
| **JavaScript-heavy sites** | May not wait long enough; increase timeout values |
| **Rate limiting** | Increase interval to 10-15 minutes if you hit limits |

---

## Troubleshooting

### System won't start
```bash
node diagnose-auto-apply.mjs
```
Tells you exactly what's missing.

### Forms not filling
- Verify `config/profile.yml` has all fields
- Edit `apply-auto.mjs` → `guessValue()` to add custom field names
- Run: `node auto-apply.mjs test <url>` to debug

### Login fails
- Verify credentials in `config/credentials.yml`
- Check if 2FA is enabled (not supported, disable it)
- Test manually in browser first

### Nothing happens
```bash
node auto-apply.mjs status
```
Check if pipeline.md has URLs. If not:
```bash
node auto-apply.mjs scan bogota
```

### Too slow
The system waits for network idle between steps. To speed up:
- Edit timeouts in `apply-auto.mjs` (reduce from 15000 to 10000 ms)
- Run scan only once per hour instead of every 5 minutes
- Increase loop interval to 10-15 minutes

---

## Security Notes

✅ **Design Principles:**
- Credentials stored locally (never transmitted to Claude)
- Headless browser runs on your machine
- No cloud backend
- All data in local files
- Git-ignored secrets

⚠️ **Best Practices:**
- Use separate passwords for automation (not your main passwords)
- Keep `config/credentials.yml` in `.gitignore`
- Back up credentials securely
- Never share `config/credentials.yml`
- Review generated applications before they're sent

---

## Future Enhancements (Optional)

- [ ] Persistent browser context (faster, session-preserving)
- [ ] Multi-account support (apply from different profiles)
- [ ] Custom form field mappings per job board
- [ ] Email notifications on success/failure
- [ ] Web dashboard to monitor status
- [ ] Integration with notion.so or Airtable
- [ ] AI-powered cover letter generation
- [ ] Video interview prep detection
- [ ] Salary negotiation scripts

---

## Quick Reference

| Task | Command |
|------|---------|
| First setup | `node auto-apply.mjs setup` |
| Find problems | `node diagnose-auto-apply.mjs` |
| Show help | `node auto-apply.mjs help` |
| Search Bogotá | `node auto-apply.mjs scan bogota` |
| Apply once | `node auto-apply.mjs apply` |
| Auto all night | `node auto-apply.mjs loop 5` |
| Check results | `node auto-apply.mjs status` |
| Test one URL | `node auto-apply.mjs test <url>` |
| Test login | `node auto-apply.mjs test-login` |
| See full reports | `cat data/applications-log.md` |
| Monitor live | `tail -f logs/auto-apply.log` |

---

## Summary

The auto-apply system transforms career-ops from a **passive evaluation tool** into an **active recruitment engine**:

**Before:** You evaluate offers, generate CVs, track applications (manually)
**After:** You set it and forget it; system finds jobs, applies, reports

**Key Achievement:** Automates the most tedious part of job search—mindless form filling and application submission.
