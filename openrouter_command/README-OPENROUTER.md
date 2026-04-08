# Career-Ops with OpenRouter AI

This guide explains how to use Career-Ops job search automation with **OpenRouter AI** and free LLM models.

---

## What is OpenRouter?

[OpenRouter](https://openrouter.ai) is a unified API that provides access to multiple LLM providers (Anthropic, OpenAI, Meta, Mistral, etc.) through a single interface. It offers **free tiers** for many models, making it a cost-effective alternative to paid Claude Code subscriptions.

**Key Benefits:**
- ✅ Free models available (Llama, Mistral, Gemma)
- ✅ No subscription required
- ✅ Pay-as-you-go option (very cheap)
- ✅ Same API format as OpenAI
- ✅ Supports models from multiple providers

---

## Quick Start (5 Minutes)

### 1. Get OpenRouter API Key (Free)

1. Visit [https://openrouter.ai](https://openrouter.ai)
2. Sign up with Google or GitHub account
3. Go to **Keys** section
4. Click **Create Key**
5. Copy your API key (starts with `sk-or-v1-...`)

### 2. Configure Career-Ops

Your API key is already saved in `.env` file:

```bash
# Check if key is saved
cat .env
```

If not, add it manually:
```bash
echo "OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY" >> .env
```

### 3. Verify Setup

```bash
node evaluate-job.mjs
```

If you see the usage message, you're ready!

---

## Usage

### Evaluate a Single Job

```bash
# Basic usage
node evaluate-job.mjs "https://job-url-here.com" "Job Title at Company"

# Real examples
node evaluate-job.mjs "https://boards.greenhouse.io/vercel/jobs/123" "Frontend Engineer at Vercel"
node evaluate-job.mjs "https://jobs.lever.co/stripe/456" "React Developer at Stripe"
```

### What Happens?

1. **Fetches job description** from the URL
2. **Analyzes your CV** against job requirements
3. **Generates evaluation report** with:
   - Role summary
   - CV match analysis (strengths & gaps)
   - Fit score (1-5 scale)
   - Recommendation (apply/skip)
   - Next steps suggestions
4. **Saves report** to `reports/` folder

---

## Available Free Models

### Recommended for Job Evaluation

| Model | Provider | Context | Best For |
|-------|----------|---------|----------|
| `meta-llama/llama-3.1-8b-instruct:free` | Meta | 128K | Fast general evaluation |
| `mistralai/mistral-7b-instruct:free` | Mistral | 32K | Instruction following |
| `google/gemma-2-9b-it:free` | Google | 8K | Quick summaries |
| `nvidia/llama-3.1-nemotron-70b:free` | NVIDIA | 128K | Deep analysis (slower) |

### Change the Model

Edit `evaluate-job.mjs`:

```javascript
const model = 'meta-llama/llama-3.1-8b-instruct:free'; // Change this line
```

Available models: [https://openrouter.ai/models](https://openrouter.ai/models)

---

## Project Structure

```
career-ops/
├── evaluate-job.mjs          # ⭐ Main evaluation script
├── cv.md                       # ⭐ Your CV (edit this)
├── config/
│   └── profile.yml             # ⭐ Your profile & preferences
├── portals.yml                 # ⭐ 40+ companies to track
├── .env                        # API keys (gitignored)
├── modes/
│   ├── oferta.md               # Evaluation framework
│   ├── _shared.md              # Shared context
│   └── ...                     # Other modes
├── reports/                    # Generated evaluations
└── README-OPENROUTER.md        # This file
```

---

## Daily Workflow

### Morning: Scan for New Jobs

```bash
# Open a job portal manually
# Example: LinkedIn, Greenhouse, Lever, etc.
# Find 3-5 interesting jobs
```

### Evaluate Each Job

```bash
# For each job URL you find:
node evaluate-job.mjs "URL_HERE" "Job Title"

# Review the report in terminal
# Check the score (4.0+ recommended)
```

### Decide & Act

| Score | Action |
|-------|--------|
| **4.5-5.0** | ⭐ High priority - Apply immediately |
| **4.0-4.4** | ✅ Good fit - Apply today |
| **3.5-3.9** | 🤔 Decent - Apply if interested |
| **< 3.5** | ❌ Skip - Not a good match |

### Track Applications

Add to `data/applications.md`:

```markdown
| # | Date | Company | Role | Score | Status | Notes |
|---|------|---------|------|-------|--------|-------|
| 1 | 2026-04-08 | Vercel | Frontend Engineer | 4.2/5 | Applied | Report saved |
```

---

## Advanced Usage

### Batch Evaluate Multiple Jobs

Create a file `jobs-to-evaluate.txt`:
```
https://boards.greenhouse.io/vercel/jobs/123
https://jobs.lever.co/stripe/456
https://jobs.ashbyhq.com/airtable/789
```

Then run:
```bash
# PowerShell
Get-Content jobs-to-evaluate.txt | ForEach-Object { node evaluate-job.mjs "$_" }

# Bash
while read url; do node evaluate-job.mjs "$url"; done < jobs-to-evaluate.txt
```

### Customize Evaluation Prompt

Edit `modes/oferta.md` or create your own mode:

```bash
cp modes/oferta.md modes/my-custom-evaluation.md
# Edit my-custom-evaluation.md
# Update evaluate-job.mjs to load your custom mode
```

### Generate Custom PDF (Manual)

For PDF generation, you still need Playwright:

```bash
npm run pdf
# Or manually edit templates/cv-template.html
# Then use browser print to PDF
```

---

## Troubleshooting

### API Key Not Found

```bash
# Check .env file exists
cat .env

# Should contain:
# OPENROUTER_API_KEY=sk-or-v1-...

# If missing, recreate:
echo "OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY" > .env
```

### Model Not Available

```bash
# Check available free models
curl https://openrouter.ai/api/v1/models | grep -i "free"

# Switch to working model in evaluate-job.mjs
const model = 'mistralai/mistral-7b-instruct:free';
```

### Rate Limits

Free models have rate limits. If you hit limits:
1. Wait a few minutes
2. Switch to another free model
3. Or upgrade to paid (very cheap: ~$0.10 per evaluation)

### Job URL Not Accessible

If the script can't fetch a job URL:
1. Copy job description manually
2. Create a temporary file `temp-job.md`
3. Modify script to read from file instead of URL

---

## Cost Comparison

| Method | Cost | Setup Complexity |
|--------|------|------------------|
| **OpenRouter Free** | $0 | Easy ⭐ |
| OpenRouter Paid | ~$0.01-0.05 per evaluation | Easy |
| Claude Code | $20/month | Medium |
| Direct Claude API | ~$0.03 per evaluation | Hard |

**Recommendation:** Start with OpenRouter Free, upgrade to paid if you need more than 20 evaluations/day.

---

## Tips for Best Results

### 1. Keep CV Updated

Regularly update `cv.md` with:
- New projects
- New skills
- New certifications
- Updated metrics

### 2. Customize Profile

Edit `config/profile.yml`:
- Target roles
- Salary expectations
- Location preferences
- Superpowers & proof points

### 3. Use Portals Scanner

Check `portals.yml` - it has 40+ companies configured. Visit their career pages directly and copy job URLs.

### 4. Save Good Reports

When you find a high-scoring job:
1. Save the evaluation report
2. Customize your CV for that specific role
3. Write a tailored cover letter
4. Apply within 24 hours

---

## Next Steps

1. ✅ Verify setup: `node evaluate-job.mjs`
2. ✅ Find your first job URL (LinkedIn, Greenhouse, Lever)
3. ✅ Run evaluation: `node evaluate-job.mjs "URL" "Title"`
4. ✅ Review report and decide
5. ✅ Apply to high-scoring jobs!

---

## Support

- OpenRouter Docs: [https://openrouter.ai/docs](https://openrouter.ai/docs)
- Career-Ops Original: [https://github.com/santifer/career-ops](https://github.com/santifer/career-ops)
- Free Models List: [https://openrouter.ai/models?order=pricing-low-to-high](https://openrouter.ai/models?order=pricing-low-to-high)

---

## License

Same as Career-Ops - MIT License. Feel free to customize and share!
