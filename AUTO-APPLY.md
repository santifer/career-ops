# Auto-Apply Workflow

Automatic job application submission for career-ops.

## Overview

**apply-auto.mjs** reads your job pipeline, applies to each pending job, and generates a report.

**apply-loop.mjs** runs apply-auto.mjs on a schedule (every 5 minutes by default).

## Setup Required

Before using auto-apply, ensure:

1. **cv.md** exists and contains your CV
2. **config/profile.yml** populated with:
   - `candidate.full_name`
   - `candidate.email`
   - `candidate.phone`
   - `candidate.location`
   - `candidate.portfolio_url` (optional)
   - `candidate.linkedin` (optional)
   - `candidate.github` (optional)
3. **config/credentials.yml** populated with login credentials:
   ```yaml
   linkedin:
     email: "your-email@example.com"
     password: "your-password"
   computrabajo:
     email: "your-email@example.com"
     password: "your-password"
   ```
4. **data/pipeline.md** contains URLs to apply to in format:
   ```
   ## Pendientes
   - [ ] https://co.computrabajo.com/job-url | Company | Job Title | Location
   ```

⚠️ **IMPORTANT:** `config/credentials.yml` is git-ignored for security. Never commit it.

## Usage

### Run Once
```bash
node apply-auto.mjs
```

### Auto-Apply Every 5 Minutes
```bash
node apply-loop.mjs
```

### Custom Interval
```bash
node apply-loop.mjs --interval 10    # Apply every 10 minutes
```

### One-Time Run (via apply-loop wrapper)
```bash
node apply-loop.mjs --once
```

## What It Does

For each job URL in pipeline.md:

1. **Navigate to URL** → Open job posting
2. **Check if already applied** → Look for "Postulado" (Computrabajo) or "Already applied" (LinkedIn)
3. **If already applied** → Skip to next job
4. **If not applied**:
   - **Attempt login** → Use credentials from config/credentials.yml
   - **Find apply button** → Click "Aplicar", "Postúlate", etc.
   - **Fill form** → Auto-populate from profile.yml:
     - Name → Full name
     - Email → Email address
     - Phone → Phone number
     - Location → City/Region
     - Portfolio → Portfolio URL
     - Cover letter → Generic motivation text (auto-generated)
   - **Submit application** → Click submit button
   - **Detect success** → Look for checkmark SVG or "¡Aplicaste correctamente!" message

5. **Log results** to **data/applications-log.md**

## Report Format

**data/applications-log.md** contains:
- Timestamp of each application
- Company name
- Job title
- Application status (success, already-applied, error, etc.)
- Details (what went wrong if applicable)

Example:
```
## Company X — Senior Developer
- URL: https://co.computrabajo.com/job-123
- Status: **success**
- Timestamp: 2025-01-30T10:32:15.000Z
- Details:
  - Found and clicked apply button
  - Filled 4 form fields: name, email, phone, location
  - Clicked submit button
  - Success confirmed (checkmark found)
```

## Status Codes

| Status | Meaning |
|--------|---------|
| `success` | Application submitted and success confirmed |
| `submitted-unverified` | Form submitted but success not visually confirmed |
| `already-applied` | You've already applied to this job |
| `no-apply-button` | Could not find or click apply button |
| `form-not-submitted` | Form filled but submit button not found/clicked |
| `error` | Network error, page timeout, or other exception |

## Troubleshooting

### Forms Not Filling
- Wrong profile.yml field names → Check `candidate.full_name`, `candidate.email`, etc.
- Form using non-standard field names → Form auto-fill maps common names (email, phone, etc.) but may miss custom fields
- JavaScript delays → Add more wait time (modify `waitForLoadState('networkidle')` timeout in apply-auto.mjs)

### No Apply Button Detected
- Job site rendered differently than expected
- Apply button is JavaScript-generated
- Job board requires specific scrolling/interaction before button appears
- Add URL selector to `findAndClickApplyButton()` function

### Login Fails
- Credentials incorrect in config/credentials.yml
- Platform changed login UI → Update selectors in `login()` function
- 2FA enabled → Not supported (disable 2FA for auto-apply to work)
- Cookies/session required → Playwright doesn't persist sessions between runs (would need persistent browser context)

### Success Not Detected
- App was submitted but success page differs from expected
- Check DOM with DevTools to find success indicator
- Add selector to `detectSuccess()` function

## Architecture

```
apply-loop.mjs (recurring scheduler)
    ↓
apply-auto.mjs (single run processor)
    ↓
[For each URL in pipeline.md]
  ├─ Launch headless browser
  ├─ Navigate to job URL
  ├─ Check already-applied
  ├─ Login if needed
  ├─ Fill & submit form
  ├─ Detect success
  └─ Append result to data/applications-log.md
    ↓
[Report generated]
    ↓
data/applications-log.md (summary & details)
```

## Security Notes

1. **credentials.yml** contains plaintext passwords → Keep file .gitignored and backed up securely
2. **Headless browser** handles sensitive data → Credentials never leave your machine
3. **No data sent to Claude** → AI only reads local config files
4. **Form autofill** only sends to job platform (Computrabajo, LinkedIn) via HTTPS

## Customization

Edit **apply-auto.mjs** to:
- Add more job sites → Modify `hasAlreadyApplied()`, `findAndClickApplyButton()`, `detectSuccess()`
- Change form field mapping → Update `guessValue()` function
- Adjust timeouts → Change `waitForLoadState` and `waitForTimeout` values
- Filter jobs → Add logic in `main()` to skip certain companies/titles

## Reporting

Generate summary of applications:
```bash
cat data/applications-log.md | grep "Status:" | sort | uniq -c
```

This shows count of each status (success, error, already-applied, etc.)

## Limitations

- **No job board session persistence** → Logs in fresh for each job (slower but more reliable)
- **No 2FA support** → Accounts with two-factor auth will fail to login
- **No custom form handling** → Very complex forms may not fill correctly
- **No file uploads** → Cannot upload resume/portfolio files (enter URLs instead)
- **Single browser tab per job** → Closes browser after each job to prevent memory leaks
- **No JavaScript framework detection** → May not wait long enough for some dynamic forms

## Manual Override

If auto-apply fails on specific jobs, manually add entries to **data/applications.md** and update status:

```markdown
| 123 | 2025-01-30 | Company | Role | Manually Applied | Applied | ✅ | | Filled form manually, submitted, confirmed |
```

Then remove URL from **data/pipeline.md** so apply-auto skips it.
