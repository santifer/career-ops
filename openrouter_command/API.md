# Career-Ops API Documentation

Technical details about OpenRouter API integration and prompt engineering.

## OpenRouter API Integration

### API Endpoint

```
Base URL: https://openrouter.ai/api/v1
Endpoint: /chat/completions
Method: POST
```

### Authentication

```javascript
Headers: {
  'Authorization': 'Bearer sk-or-v1-...',
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://career-ops.local',
  'X-Title': 'Career-Ops CLI'
}
```

### Request Format

```json
{
  "model": "openrouter/auto",
  "messages": [
    {
      "role": "system",
      "content": "You are a career coach..."
    },
    {
      "role": "user",
      "content": "Prompt content..."
    }
  ],
  "max_tokens": 4000,
  "temperature": 0.7
}
```

### Response Format

```json
{
  "id": "gen-123",
  "model": "anthropic/claude-3.5-sonnet",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "AI response text..."
      }
    }
  ],
  "usage": {
    "prompt_tokens": 1500,
    "completion_tokens": 800,
    "total_tokens": 2300
  }
}
```

## Available Models

### Free Models (No Cost)

| Model | Max Tokens | Best For |
|-------|-----------|----------|
| `google/gemma-4-31b-it:free` | 4000 | Quick evaluations |
| `mistralai/mistral-7b-instruct:free` | 4000 | Simple tasks |

### Paid Models (Better Quality)

| Model | Cost per 1K tokens | Best For |
|-------|-------------------|----------|
| `openrouter/auto` | ~$0.003 | General use (recommended) |
| `anthropic/claude-3.5-sonnet` | ~$0.003 | Complex analysis |
| `anthropic/claude-3-opus` | ~$0.015 | Deep research |
| `meta-llama/llama-3.1-70b-instruct` | ~$0.001 | Large context |

## Prompt Engineering

### 1. Job Evaluation Prompt

**Purpose**: Compare CV against job description

**Prompt Structure**:
```
You are a career coach evaluating a job opportunity for a Front-End Developer.

# CANDIDATE CV
{cv_content}

# JOB DESCRIPTION
Company: {company}
Role: {title}
Description: {description}

# EVALUATION CRITERIA
1. Match Score (0-100): How well CV matches requirements
2. Red Flags: Warning signs in the job posting
3. CV Gaps: Missing skills to add
4. Talking Points: What to highlight in interviews
5. Recommendation: Apply / Consider / Skip

Provide output in this format:

## Match Analysis
**Score**: X/100
**Verdict**: [Strong Match / Partial Match / Weak Match]

## Red Flags
- [If any, list them]

## CV Tailoring Suggestions
- [Specific improvements]

## Interview Talking Points
- [What to emphasize]

## Final Recommendation
[Apply / Apply with caution / Skip]
```

**Example Output**:
```markdown
## Match Analysis
**Score**: 85/100
**Verdict**: Strong Match

## Red Flags
- None identified

## CV Tailoring Suggestions
- Add Next.js projects section
- Highlight Vercel deployment experience

## Interview Talking Points
- 5 years React experience
- Led migration to TypeScript

## Final Recommendation
Apply - Strong technical fit
```

### 2. Company Discovery Prompt

**Purpose**: Find companies matching CV in specific regions

**Prompt Structure**:
```
You are a career research assistant helping find companies that match a candidate's profile.

# CANDIDATE CV
{cv_content}

# TARGET ROLES
{target_roles}

# REGIONS TO SEARCH
{regions}

# TASK
Find 10-15 companies in the specified regions that:
1. Match the candidate's skills and experience
2. Have active hiring for tech roles
3. Are reputable companies with good work culture
4. Have clear career growth opportunities

For each company, provide:
- Company name
- Careers page URL (must be real)
- Brief description (what they do, tech stack if known)
- Region/country
- Why they match the candidate

FORMAT YOUR RESPONSE AS JSON:
[
  {
    "name": "Company Name",
    "careers_url": "https://company.com/careers",
    "notes": "Brief description and why they match",
    "region": "Country/Region"
  }
]

ONLY return valid JSON. No markdown, no extra text.
```

**Example Output**:
```json
[
  {
    "name": "Vercel",
    "careers_url": "https://vercel.com/careers",
    "notes": "Frontend infrastructure platform. Heavy React/Next.js usage. Matches candidate's React expertise.",
    "region": "Remote"
  }
]
```

### 3. Job Search Prompt

**Purpose**: Find specific job openings

**Prompt Structure**:
```
You are an expert job search assistant. Find REAL, CURRENT job openings that match this candidate.

# CANDIDATE CV
{cv_content}

# SEARCH CRITERIA
Target Roles: {target_roles}
Locations: {locations}

# TASK
Find 10-15 specific job openings that:
1. Are actively hiring (current open positions)
2. Match the candidate's skills and experience level
3. Are at real companies with career pages
4. Fit the location preferences (remote or specified countries)

For each job, provide:
- Specific job title
- Company name
- Location (city/country or Remote)
- Direct application URL (careers page or job posting)
- Why this job matches the candidate's profile
- Recommended action (apply now, check requirements, etc.)

FORMAT YOUR RESPONSE AS JSON:
[
  {
    "title": "Senior Frontend Engineer",
    "company": "Vercel",
    "location": "Remote",
    "url": "https://vercel.com/careers/senior-frontend",
    "match_reason": "Matches React/Next.js skills from CV",
    "action": "Apply directly - strong match"
  }
]

IMPORTANT: Only include real companies and actual job URLs. If you don't know a specific URL, indicate to search the company's careers page.

ONLY return valid JSON. No markdown, no extra text.
```

### 4. Company Research Prompt

**Purpose**: Deep research for interview preparation

**Prompt Structure**:
```
You are a research analyst preparing a briefing for a job interview.

# COMPANY
Name: {company_name}
Role applying for: {role}

# RESEARCH TASK
Gather and summarize:
1. Company Overview
   - What they do
   - Industry and market position
   - Size and stage (startup/enterprise)

2. Culture & Values
   - Mission and values
   - Work environment
   - Glassdoor summary (if known)

3. Recent News
   - Last 6 months headlines
   - Funding rounds or acquisitions
   - Product launches

4. Tech Stack
   - Technologies they use
   - Engineering blog insights
   - Open source contributions

5. Interview Insights
   - Typical interview process
   - Known interview questions
   - What they look for

6. Questions to Ask
   - Strategic questions
   - Culture questions
   - Role-specific questions

Provide structured report with actionable insights.
```

## Response Parsing

### JSON Extraction

```javascript
function parseAIResponse(result) {
  try {
    // Try direct JSON parse
    return JSON.parse(result);
  } catch (e) {
    // Extract JSON from markdown code block
    const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // Extract JSON array/object directly
    const directMatch = result.match(/\[[\s\S]*\]/);
    if (directMatch) {
      return JSON.parse(directMatch[0]);
    }
  }
  
  // Fallback: return raw text
  return { raw: result };
}
```

### Markdown Table Parsing

```javascript
function parseMarkdownTable(markdown) {
  const lines = markdown.split('\n');
  const data = [];
  
  for (const line of lines) {
    if (line.startsWith('|') && !line.includes('---')) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.length > 0 && cells[0] !== '#') {
        data.push(cells);
      }
    }
  }
  
  return data;
}
```

## Error Handling

### API Errors

```javascript
async function callOpenRouter(prompt) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { /* ... */ },
      body: JSON.stringify({ /* ... */ })
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key. Check OPENROUTER_API_KEY in .env');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Wait 1 minute and retry.');
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('Empty response from AI. Try again.');
    }
    
    return data.choices[0].message.content;
    
  } catch (error) {
    if (error.name === 'FetchError') {
      throw new Error('Network error. Check internet connection.');
    }
    throw error;
  }
}
```

### Retry Logic

```javascript
async function callWithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await callOpenRouter(prompt);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff
      await sleep(1000 * Math.pow(2, i));
    }
  }
}
```

## Rate Limiting

### Free Tier Limits

- **Requests**: ~10 per minute
- **Daily**: ~100 requests
- **Concurrency**: 1 request at a time

### Best Practices

```javascript
// Add delay between batch requests
async function processBatch(urls) {
  for (const url of urls) {
    await evaluateJob(url);
    await sleep(6000); // Wait 6 seconds between calls
  }
}

// Sequential processing (not parallel)
async function evaluateMultiple(urls) {
  const results = [];
  for (const url of urls) {
    results.push(await evaluateJob(url)); // Sequential
  }
  return results;
}
```

## Cost Calculation

### Token Counting

```javascript
// Approximate token count (1 token ≈ 4 characters)
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// Calculate cost
function calculateCost(promptTokens, completionTokens, model) {
  const pricing = {
    'openrouter/auto': { prompt: 0.003, completion: 0.003 },
    'anthropic/claude-3.5-sonnet': { prompt: 0.003, completion: 0.003 },
    'google/gemma-4-31b-it:free': { prompt: 0, completion: 0 }
  };
  
  const rate = pricing[model] || pricing['openrouter/auto'];
  const cost = (promptTokens * rate.prompt + completionTokens * rate.completion) / 1000;
  
  return cost.toFixed(4);
}
```

### Cost Per Command

| Command | Prompt Tokens | Completion Tokens | Cost |
|---------|--------------|-------------------|------|
| evaluate | ~1500 | ~800 | ~$0.007 |
| scan | ~2000 | ~1000 | ~$0.009 |
| add-companies | ~1800 | ~900 | ~$0.008 |
| job-search | ~2200 | ~1200 | ~$0.010 |
| deep | ~2500 | ~1500 | ~$0.012 |

## Testing

### Mock API for Testing

```javascript
// test/mock-llm.js
export class MockLLMClient {
  async chat(prompt) {
    // Return canned responses based on prompt type
    if (prompt.includes('evaluate')) {
      return JSON.stringify({
        matchScore: 85,
        redFlags: [],
        recommendation: 'Apply'
      });
    }
    
    if (prompt.includes('company discovery')) {
      return JSON.stringify([
        { name: 'Test Company', careers_url: 'https://test.com', region: 'Remote' }
      ]);
    }
    
    return 'Mock response';
  }
}
```

### API Test

```javascript
// test/api-test.js
async function testAPI() {
  const llm = new LLMClient(process.env.OPENROUTER_API_KEY);
  
  const response = await llm.chat('Say "Career-Ops API test successful"', {
    maxTokens: 50
  });
  
  console.log('Test result:', response);
  return response.includes('successful');
}
```

## Security

### API Key Storage

```bash
# Good: .env file
echo "OPENROUTER_API_KEY=sk-or-v1-..." > .env

# Good: Environment variable
export OPENROUTER_API_KEY=sk-or-v1-...

# Bad: Never do this
const apiKey = "sk-or-v1-..."; // Hardcoded!
```

### Key Rotation

```javascript
// Check key validity
async function validateKey(apiKey) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

---

*API documentation for Career-Ops v1.0*
