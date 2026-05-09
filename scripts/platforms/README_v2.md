# Application Automation Scripts (v2) — Per-Company Memory & User Approval

This directory contains improved automation scripts for filling out job applications on **Greenhouse** and **Workday** platforms.

## What's New (v2)

✅ **Per-Company Memory** — Each company gets its own memory file (`field_memory/{company}_memory.json`). No cross-contamination of answers.

✅ **User Approval Workflow** — Before filling any field, the script shows you the AI-generated answer and asks: **Accept (y)? / Edit (e)? / Skip (n)?**

✅ **Manual Fallback** — If AI can't generate an answer or confidence is low, the script asks you to enter the answer manually.

✅ **Smart Answer Caching** — Approved answers are saved to that company's memory file for reuse on future applications.

✅ **Better Field Matching** — Smarter label extraction and fuzzy matching for consistent field identification.

## Files

- `greenhouse_apply_v2.py` — For Greenhouse job postings
- `workday_apply_v2.py` — For Workday job postings

(Original v1 files retained for reference but no longer recommended.)

## Quick Start

### 1. Prerequisites

Make sure you have:
- `applicant.json` — Your personal info (name, email, phone, etc.)
- `candidate_profile.txt` — Your professional summary/experience
- `job_description.txt` — The job posting text
- `resumes/generated/tailored_resume.pdf` — Your resume

And environment variables set:
```bash
export GROQ_API_KEY="your_api_key_here"
# OR
export OPENAI_API_KEY="your_api_key_here"
```

### 2. Run for Greenhouse

```bash
python scripts/platforms/greenhouse_apply_v2.py
```

When prompted:
1. Paste the Greenhouse job URL
2. Watch the script find fields
3. **For each field with an AI answer**, you'll see:
   ```
   [Field Label]
   AI Answer (85% confidence):
     Your suggested answer here
   Accept this? (y/edit/n):
   ```
   - Type `y` to accept
   - Type `edit` to change it
   - Type `n` to skip
4. After review, submit the form manually

### 3. Run for Workday

```bash
python scripts/platforms/workday_apply_v2.py
```

Same workflow as Greenhouse.

## Memory Management

Each company's memory is stored in `field_memory/{company_name}_memory.json`

Example structure:
```json
{
  "email email": "your@email.com",
  "phone phone": "+1234567890",
  "first name first name": "John",
  "desired salary desired salary": "100K - 120K"
}
```

### Clear Memory for a Company

Delete the corresponding memory file:
```bash
rm field_memory/company_name_memory.json
```

### View Saved Answers

```bash
cat field_memory/company_name_memory.json
```

## What Gets Saved

✅ **Approved answers only** — Only answers you accepted or edited are saved.

✅ **Company-specific** — Each company's memory is separate.

✅ **Reused automatically** — On the next application at the same company, saved answers fill in immediately (can be overridden).

## Troubleshooting

### "Login required" message appears

- Complete the login in the opened browser window
- Return to terminal and press ENTER
- Script will continue after login

### "No AI answer generated"

- Check your API key is set (`GROQ_API_KEY` or `OPENAI_API_KEY`)
- The script will fall back to asking you manually

### Script is asking you for every field

- This is intentional on first run (no memory yet)
- Once you approve answers, they're saved and reused

### Want to re-answer a saved field

- When the script shows a saved answer, just type `n` to skip
- Or delete the company's memory file and re-run

## Environment Variables

Set one of these:

```bash
# Using Groq API (recommended for cost)
export GROQ_API_KEY="gsk_your_key_here"

# Using OpenAI API
export OPENAI_API_KEY="sk_your_key_here"

# Or Windows PowerShell
$env:GROQ_API_KEY = "gsk_your_key_here"
```

## Script Behavior Summary

| Step | Behavior |
|------|----------|
| 1. Launch | Opens browser, navigates to job URL |
| 2. Login (if needed) | Detects login screen, pauses for you to sign in |
| 3. Click Apply | Finds and clicks the Apply button |
| 4. Resume | Uploads your tailored resume if a file input exists |
| 5. Fields | For each text/textarea/select/radio/checkbox: |
|    | - Check company memory (reuse saved answers) |
|    | - Try fuzzy match (match against your structured data) |
|    | - Ask AI (generate answer based on profile + JD) |
|    | - Ask you (show AI answer + ask y/edit/n) |
|    | - Save if you approved |
| 6. Auto-actions | Auto-checks terms/privacy/consent checkboxes |
| 7. Done | Saves memory, pauses for manual form review & submit |

## Tips

1. **First pass slower** — First application at a company will ask you many questions. Second pass is much faster.
2. **Edit wisely** — When you edit an answer, that edited version is saved for future use.
3. **Verify salary ranges** — Always check desired salary fields match the role/market.
4. **Review before submit** — Script intentionally does NOT auto-submit. You review and click Submit.
5. **Batch processing** — Run multiple applications in sequence; each builds its own memory.

## Support

If the script fails:
1. Check terminal output for AI errors or field-matching issues
2. Try running with `GROQ_API_KEY` set (usually more reliable)
3. Check that `field_memory/` directory was created
4. Inspect the corresponding `*_memory.json` file to see what was saved

---

**Version:** 2.0  
**Last Updated:** May 2026
