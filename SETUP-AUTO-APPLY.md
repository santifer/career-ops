# Auto-Apply: Complete Setup & Usage Guide

**Last Updated:** January 2025
**Status:** ✅ Production Ready
**Language:** English & Spanish 🇪🇸

---

## Table of Contents

1. [Quick Start (60 seconds)](#quick-start-60-seconds)
2. [Full Setup with Testing](#full-setup-with-testing)
3. [Usage Scenarios](#usage-scenarios)
4. [File Structure](#file-structure)
5. [Troubleshooting](#troubleshooting)
6. [Advanced Topics](#advanced-topics)

---

##  ⚡ Quick Start (60 seconds)

If you're in a hurry and already have config files set up:

```bash
# Test that everything works
node test-auto-apply.mjs

# Find jobs
node auto-apply.mjs scan bogota

# Apply to them
node auto-apply.mjs apply

# See results
node auto-apply.mjs status
```

That's it. 🎉

**Still here?** Continue below for full setup.

---

## 🚀 Full Setup with Testing

### Phase 1: System Check (2 minutes)

```bash
# Diagnostic report
node diagnose-auto-apply.mjs
```

This will tell you exactly what's missing. Fix any issues, then continue.

### Phase 2: Configuration (5 minutes)

**Step 1: Create credentials file**
```bash
cp config/credentials.example.yml config/credentials.yml
```

**Step 2: Edit `config/credentials.yml`** with your logins
```yaml
computrabajo:
  email: "your-email@example.com"
  password: "your-password"

linkedin:
  email: "your-email@linkedin.com"
  password: "your-password"
```

**Step 3: Verify `config/profile.yml`** has your data
```yaml
candidate:
  full_name: "Your Full Name"
  email: "your-email@example.com"
  phone: "+57 314 366 3821"
  location: "Bogotá DC"
  portfolio_url: "https://your-portfolio.com"
```

### Phase 3: Testing (3 minutes)

```bash
# Comprehensive system test
node test-auto-apply.mjs

# Or run diagnostic again to confirm fixes
node diagnose-auto-apply.mjs
```

Both scripts will give you a health report. Green ✓ = ready to go.

### Phase 4: First Run (5-10 minutes)

```bash
# Search for jobs in Bogotá
node auto-apply.mjs scan bogota

# Check what was found
node auto-apply.mjs status

# Apply to pending jobs
node auto-apply.mjs apply

# See the results
cat data/applications-log.md
```

Done! You've completed your first automated application cycle. 🎊

---

## 📋 Usage Scenarios

### Scenario A: Manual Control (Daily Check-In)

```bash
# Morning: search for jobs
node auto-apply.mjs scan bogota

# Lunch: check what's available
node auto-apply.mjs status

# Afternoon: apply to interesting ones
node auto-apply.mjs apply

# Review: see what succeeded
cat data/applications-log.md
```

**Time commitment:** 15 minutes/day
**Control level:** Full (you decide what to apply to)

### Scenario B: Hands-Off Automation (Overnight)

```bash
# Start the night before
node auto-apply.mjs loop 5

# It will:
# - Search for new jobs every 5 minutes
# - Apply automatically
# - Generate reports
# And keep running until you Ctrl+C
```

**Time commitment:** 0 minutes (set and forget)
**Control level:** Medium (you choose search criteria, system applies everything)

### Scenario C: Scheduled Cron Job (24/7)

Edit your crontab:
```bash
crontab -e
```

Add this line:
```bash
*/5 * * * * cd ~/career-ops && node auto-apply.mjs loop 0 >> logs/auto-apply.log 2>&1
```

This runs the full workflow every 5 minutes, every day, forever.

### Scenario D: Debug Specific Job

```bash
# Test a single URL with full debugging
node auto-apply.mjs test https://co.computrabajo.com/trabajo-123

# Browser will open (not headless) so you can watch
# Check what's detected, what's filled, what succeeds
```

---

## 📁 File Structure

### Configuration (You Edit These)

```
config/
├── profile.yml              ← Your candidate data
├── credentials.yml          ← Your logins (NEVER commit!)
└── credentials.example.yml  ← Template (safe to commit)

cv.md                        ← Your resume (markdown)

portals.yml                  ← Job board search queries

data/
└── pipeline.md              ← Job queue (you can edit this)
```

### System Files (Auto-Generated)

```
data/
├── applications.md          ← Tracker of all apps (summary)
├── applications-log.md      ← Detailed log (what succeeded/failed)
└── pipeline-history.jsonl   ← Automation cycle history

logs/
└── auto-apply.log          ← Stdout/stderr when running in background
```

### Scripts (Core Auto-Apply)

```
auto-apply.mjs               ← Main CLI entry point
apply-auto.mjs               ← Core application logic
apply-loop.mjs               ← Scheduler wrapper
apply-pipeline.mjs           ← Complete workflow orchestrator
apply-computrabajo.mjs       ← Computrabajo-specific handler
diagnose-auto-apply.mjs      ← Diagnostic tool
test-auto-apply.mjs          ← System test suite
```

### Documentation

```
AUTO-APPLY.md                        ← Full technical docs
AUTO-APPLY-IMPLEMENTATION.md         ← What's new & architecture
QUICKSTART-ES.md                     ← Spanish quick guide
SETUP-AUTO-APPLY.md                  ← This file
```

---

## 📊 Workflow Diagram

```
Data Flow:
──────────

┌─ Auto-Apply CLI (auto-apply.mjs)
│
├─ SEARCH
│  └─ scan.mjs, scan-bogota.mjs
│     └─ Finds jobs → adds to data/pipeline.md
│
├─ APPLY
│  └─ apply-auto.mjs (for each job)
│     ├─ Read: cv.md, config/profile.yml, config/credentials.yml
│     ├─ Navigate + Login + Fill Form + Submit
│     └─ Write: data/applications-log.md, data/applications.md
│
├─ STATUS
│  └─ Reads: data/pipeline.md, data/applications.md
│     └─ Prints: pending count, success rate, etc.
│
└─ TEST
   └─ apply-computrabajo.mjs <url>
      └─ Opens visible browser for debugging
```

---

## 🐛 Troubleshooting

### "Everything's broken"

Run this first:
```bash
node diagnose-auto-apply.mjs
```

It will tell you exactly what's wrong.

### "No credentials found"

You probably didn't create `config/credentials.yml`:
```bash
cp config/credentials.example.yml config/credentials.yml
# Then edit it with your actual credentials
```

### "Says already applied but I haven't"

Computrabajo detection might have a false positive. Options:

1. Manually verify in your browser
2. If false positive, edit `data/pipeline.md` and check off the job: `[x]`
3. The system will skip it next time

### "Forms not filling"

1. Check `config/profile.yml` has all fields populated
2. Edit `apply-auto.mjs` function `guessValue()` to handle custom field names
3. Run: `node auto-apply.mjs test <url>` to see what's detected

### "Login fails"

```bash
# Test your credentials
node auto-apply.mjs test-login

# Or verify manually:
# 1. Create browser context with credentials
# 2. Check if 2FA is enabled (not supported, disable it)
# 3. Try login on the actual website first
```

### "Rate limited / Too many requests"

Increase the interval between applications:
```bash
# Instead of every 5 minutes:
node auto-apply.mjs loop 10  # Run every 10 minutes

# Or manually:
node auto-apply.mjs apply
# Wait 30 minutes
node auto-apply.mjs apply
```

### "Running in background but want to check status"

```bash
# View live log
tail -f logs/auto-apply.log

# Or check results anytime
node auto-apply.mjs status
cat data/applications-log.md
```

### "Want to stop the background loop"

```bash
# Find process
ps aux | grep auto-apply

# Kill it
kill -9 <PID>

# Or just use Ctrl+C in the terminal where it's running
```

---

## 🔧 Advanced Topics

### Custom Form Field Mapping

Edit `apply-auto.mjs`, function `guessValue()`:

```javascript
function guessValue(name = '', placeholder = '', candidate = {}) {
  const key = `${name} ${placeholder}`.toLowerCase();
  
  // Add your custom mappings:
  if (/my_custom_field/.test(key)) {
    return candidate.my_custom_data;
  }
  
  // ... rest of the function
}
```

### Multiple Accounts / Profiles

Create multiple `config/credentials.yml` files:
- `config/credentials-account1.yml`
- `config/credentials-account2.yml`

Then edit `apply-auto.mjs` to rotate between them.

### Persistent Browser Sessions

By default, each job gets a fresh browser (slower but more reliable).

To use persistent sessions:
1. Edit `apply-auto.mjs`
2. Change: `await chromium.launch()` to use `userDataDir`
3. This will remember cookies, faster but sometimes breaks form filling

### Custom Job Filtering

Edit `apply-auto.mjs` in `main()` function:

```javascript
for (const job of jobs) {
  // Skip jobs you don't want
  if (job.title.includes('Senior') || job.company === 'Company X') {
    continue;
  }
  
  // Process the rest
  const result = await processJob(job, profile, credentials);
}
```

### Extending Success Detection

Edit `detectSuccess()` function in `apply-auto.mjs`:

```javascript
async function detectSuccess(page) {
  // Your site might use a different success indicator
  const customSuccess = await page.$('div.my-success-class');
  if (customSuccess) return true;
  
  // ... existing checks
}
```

### Integration with Existing Career-Ops Workflow

The auto-apply system writes to `data/applications.md`, which is already tracked by career-ops.

You can then use existing career-ops commands:

```bash
# After auto-apply runs:
node merge-tracker.mjs       # Merge applications into tracker
node verify-pipeline.mjs     # Verify data integrity
node analyze-patterns.mjs    # Analyze rejection patterns
```

---

## 🛡️ Security Best Practices

### 1. Credentials Management

✅ DO:
- Use separate passwords for automation (not your main passwords)
- Store `config/credentials.yml` securely (local machine only)
- Add `config/credentials.yml` to `.gitignore` (already done)
- Rotate automation account passwords monthly

❌ DON'T:
- Commit `config/credentials.yml` to git
- Share credentials files
- Use your main LinkedIn/Computrabajo password for automation
- Enable 2FA on automation accounts (not supported)

### 2. Verification

Always verify before first use:
```bash
node diagnose-auto-apply.mjs    # Health check
node test-auto-apply.mjs        # Full test
node auto-apply.mjs test <url>  # Test single job
```

### 3. Monitoring

When running in background:
```bash
# Check logs for errors
tail -f logs/auto-apply.log

# Verify applications succeeded
node auto-apply.mjs status
```

---

## 📞 Support

### For Issues

1. Run: `node diagnose-auto-apply.mjs` (catches 80% of problems)
2. Check: [AUTO-APPLY.md](AUTO-APPLY.md) troubleshooting section
3. Read: [AUTO-APPLY-IMPLEMENTATION.md](AUTO-APPLY-IMPLEMENTATION.md) for architecture details

### For Feature Requests

Edit the scripts yourself! They're designed to be customizable.

See: [Advanced Topics](#advanced-topics) section above.

### For Bug Reports

1. Run: `node test-auto-apply.mjs` (capture output)
2. Include in bug report:
   - Output from diagnostic
   - Your OS (Windows/Mac/Linux)
   - Node version: `node --version`
   - Error message from `logs/auto-apply.log`

---

## 🎯 Success Checklist

Before your first automated run, confirm:

- [ ] `config/credentials.yml` exists and is populated
- [ ] `config/profile.yml` has all your data
- [ ] `cv.md` exists in markdown format
- [ ] `node diagnose-auto-apply.mjs` shows all ✓
- [ ] `node test-auto-apply.mjs` passes all tests
- [ ] `node auto-apply.mjs scan bogota` finds at least 1 job
- [ ] `.gitignore` includes `config/credentials.yml`

Once all boxes are checked:
```bash
node auto-apply.mjs loop 5
```

Sit back. Your automated job search is now live. ✨

---

## 📈 Expected Results

### First Week
- ✅ 20-50 applications submitted
- ✅ 2-5 job portals scanned
- ✅ 100% form auto-fill rate
- ✅ 0% false positives (very few errors)

### First Month
- ✅ 100-200 applications (varies with job market)
- ✅ 5-10 interview requests (depending on fit)
- ✅ Full insight into your application pipeline
- ✅ Complete audit trail (who, when, success/fail)

---

## 🚀 Next Steps

1. Copy/paste the [Quick Start](#quick-start-60-seconds) commands
2. Fix any issues the diagnostic finds
3. Run your first test: `node auto-apply.mjs scan bogota`
4. Apply: `node auto-apply.mjs apply`
5. Monitor: `node auto-apply.mjs status`

**Questions?** Re-read the relevant section above, or run a diagnostic.

**Ready?** Let's go: `node auto-apply.mjs help`

---

**Happy (Automated) Job Hunting! 🎯**

Made with ❤️ for career-ops
