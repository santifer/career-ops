# Career-Ops Workflow Guide

Step-by-step guides for using Career-Ops CLI to automate your job search.

## Table of Contents

1. [First-Time Setup](#first-time-setup)
2. [Daily Workflow](#daily-workflow)
3. [Weekly Workflow](#weekly-workflow)
4. [Application Workflow](#application-workflow)
5. [Interview Preparation](#interview-preparation)

---

## First-Time Setup

### 1. Install & Configure

```bash
# Navigate to project
cd d:\career-ops

# Install dependencies
npm install

# Verify setup
npm run cli:doctor
```

### 2. Set Up OpenRouter API Key

```bash
# Get your API key from https://openrouter.ai
# Then save it:
echo "OPENROUTER_API_KEY=sk-or-v1-..." > .env

# Or edit .env file directly:
# OPENROUTER_API_KEY=sk-or-v1-...
# OPENROUTER_MODEL=openrouter/auto
```

### 3. Configure Your Profile

Edit `config/profile.yml`:

```yaml
profile:
  target_roles:
    primary:
      - "Senior Frontend Engineer"
      - "React Developer"
    secondary:
      - "Full Stack Developer"
  
  preferred_locations:
    - "Remote"
    - "UAE"
    - "Saudi Arabia"
    - "Egypt"
  
  skills:
    - "React"
    - "Next.js"
    - "TypeScript"
    - "Node.js"
  
  salary_expectation: "$80k - $120k"
```

### 4. Create Your CV

Edit `cv.md` with your resume content:

```markdown
# Mohamed

## Summary
Frontend developer with 5 years experience...

## Skills
- React, Next.js, TypeScript
- Node.js, Express
- PostgreSQL, MongoDB

## Experience
### Company Name (2020-2024)
- Built React applications...
- Led team of 3 developers...

## Projects
- E-commerce platform...
- SaaS dashboard...
```

### 5. Verify Everything Works

```bash
# Test API connection
npm run cli:doctor

# Test job evaluation
npm run cli:evaluate "https://example.com/careers" -- -t "Test Job"
```

---

## Daily Workflow

### Morning: Check for New Jobs

```bash
# 1. Scan all tracked companies (5-10 minutes)
npm run cli:scan

# Interactive workflow:
# - Shows table of companies
# - AI ranks jobs by relevance
# - Select jobs to evaluate
# - Automatically runs evaluate command
```

### Mid-Day: Evaluate Interesting Jobs

```bash
# 2. Evaluate specific jobs you found
npm run cli:evaluate "https://company.com/jobs/123" -- -t "Senior Frontend"

# Or from a file:
echo "Job description..." > job.txt
npm run cli:evaluate job.txt -- -t "Backend Developer"
```

### Evening: Update Tracker

```bash
# 3. View your application status
npm run cli:tracker

# 4. Generate daily report
npm run cli:tracker -- --report
```

---

## Weekly Workflow

### Monday: Discover New Companies

```bash
# 1. AI-powered company discovery
npm run cli:add-companies

# Workflow:
# - Select 🤖 AI Search
# - Choose regions (UAE, Saudi, Egypt, Remote)
# - AI finds 10-15 matching companies
# - Review and confirm
# - Added to portals.yml automatically
```

### Wednesday: Search for Specific Jobs

```bash
# 2. AI job search
npm run cli:job-search -- -l "UAE,Saudi,Remote" -s

# Workflow:
# - AI searches for actual job postings
# - Shows 10-15 specific opportunities
# - Includes company, location, URL
# - Select jobs to auto-evaluate
# - Saves results to jobs-found.md
```

### Friday: Weekly Review

```bash
# 3. Generate comprehensive report
npm run cli:tracker -- --report

# 4. Review all applications
npm run cli:tracker

# 5. Check system health
npm run cli:doctor
```

---

## Application Workflow

### Step 1: Find a Job

```bash
# Option A: Scan companies
npm run cli:scan

# Option B: Search specific jobs
npm run cli:job-search -- -r "Senior Frontend" -l "Remote"

# Option C: Direct URL
npm run cli:evaluate "https://company.com/careers/job-123"
```

### Step 2: Evaluate Match

```bash
# Evaluate the job
npm run cli:evaluate "https://company.com/careers/job-123" -- -t "Senior Frontend"

# Review the output:
# - Match score (0-100)
# - Red flags (if any)
# - CV tailoring suggestions
# - Interview talking points
```

### Step 3: Research Company (if score > 70)

```bash
# Deep research for interview prep
npm run cli:deep "Company Name"

# Generates report with:
# - Company overview
# - Culture & values
# - Recent news
# - Tech stack
# - Interview questions
```

### Step 4: Prepare Application Materials

```bash
# Generate tailored CV highlights
npm run cli:apply "https://company.com/careers/job-123"

# Creates:
# - Tailored CV summary
# - Cover letter draft
# - Key talking points
```

### Step 5: Apply & Track

```bash
# After applying, update tracker
npm run cli:tracker -- --add "Company Name" "Role Title" "Applied"

# Or manually edit applications.md
```

---

## Interview Preparation

### Before Interview: Research

```bash
# 1. Deep company research
npm run cli:deep "Company Name"

# 2. Study relevant skills
npm run cli:training "System Design"
npm run cli:training "React Advanced Patterns"
```

### After Interview: Update Status

```bash
# Update application status
npm run cli:tracker -- --update "Company Name" "Interview Completed"

# Generate follow-up email
npm run cli:contact "Company Name"
```

---

## Batch Processing

### Process Multiple Jobs

Create `jobs-to-evaluate.txt`:

```
https://company1.com/jobs/1	Senior Frontend
https://company2.com/jobs/2	Full Stack Developer
https://company3.com/jobs/3	React Engineer
```

Run batch evaluation:

```bash
npm run cli:batch jobs-to-evaluate.txt

# Results:
# - Evaluates all jobs sequentially
# - Generates PDF for each
# - Updates tracker
# - Summary report at end
```

---

## Advanced Workflows

### Remote-First Job Search

```bash
# 1. Add remote-friendly companies
npm run cli:add-companies remote

# 2. Search remote jobs only
npm run cli:job-search -- -l "Remote" -s

# 3. Scan remote companies daily
npm run cli:scan
```

### Target Specific Region

```bash
# 1. Add companies in specific region
npm run cli:add-companies
# Select: 🤖 AI Search
# Regions: 🇦🇪 UAE/Dubai only

# 2. Search jobs in that region
npm run cli:job-search -- -l "UAE"

# 3. Set location preference
# Edit config/profile.yml
```

### Focus on Startups

```bash
# 1. Add startup companies
npm run cli:add-companies startups

# 2. Evaluate with startup focus
npm run cli:evaluate "https://startup.jobs/123" -- -t "Founding Engineer"
```

---

## Tips & Best Practices

### Cost Management (FREE Available)

```bash
# 🎉 FREE TIER - No cost at all!
npm run cli:evaluate "url" -- -m google/gemma-4-31b-it:free
npm run cli:scan -- -m google/gemma-4-31b-it:free
npm run cli:add-companies ai-search  # Select free model when prompted

# Optional: Paid models for better quality
npm run cli:evaluate "url" -- -m openrouter/auto  # ~$0.01-0.03 per eval
```

**Free tier limits:** ~10 requests/minute, no credit card required
**Paid models:** Only if you want faster/higher quality responses

### Time Management

- **Morning**: Scan (10 min)
- **Mid-day**: Evaluate 2-3 jobs (20 min)
- **Evening**: Track & plan (10 min)
- **Weekly**: Deep research (1 hour)

### Quality Thresholds

- **Score 80-100**: Strong match, apply immediately
- **Score 60-79**: Good match, apply with tailored CV
- **Score 40-59**: Partial match, consider if desperate
- **Score <40**: Skip unless unique opportunity

### Red Flags to Avoid

CLI automatically detects:
- Unrealistic requirements (10 years React in 2013)
- Vague descriptions
- Missing salary ranges
- No tech stack mentioned

---

## Troubleshooting Common Issues

### "No companies discovered by AI"

```bash
# Check CV content
cat cv.md | head -50

# Verify profile.yml
cat config/profile.yml

# Try different regions
npm run cli:add-companies
# Select broader regions
```

### "API Error"

```bash
# Verify API key
cat .env | grep OPENROUTER

# Check key is valid
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/auth/key

# Try different model
npm run cli:doctor
```

### "Command not found"

```bash
# Always use npm scripts
npm run cli:evaluate "..."
# NOT: career-ops evaluate "..."
```

---

## Weekly Schedule Template

| Day | Morning | Afternoon | Evening |
|-----|---------|-----------|---------|
| **Monday** | Scan companies | Add new companies | Review tracker |
| **Tuesday** | Evaluate 3 jobs | Research best match | Apply to top 1 |
| **Wednesday** | Job search AI | Evaluate findings | Update tracker |
| **Thursday** | Follow-ups | Deep research | Prepare materials |
| **Friday** | Weekly report | Plan next week | System check |

---

## Monthly Goals

- **Week 1**: Setup + Discover 50 companies
- **Week 2**: Evaluate 20 jobs, Apply to 5
- **Week 3**: 3 Interviews, Follow-ups
- **Week 4**: Review, adjust strategy

---

## Success Metrics

Track these metrics weekly:

- **Companies added**: Target 10-15/week
- **Jobs evaluated**: Target 15-20/week
- **Applications sent**: Target 5-10/week
- **Interview rate**: Target 20-30%
- **Response rate**: Track in tracker

Use `npm run cli:tracker -- --report` to generate metrics.

---

*Workflow guide for Career-Ops CLI v1.0*
