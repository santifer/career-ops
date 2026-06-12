# Free-Tier & Cost-Free LLM Options

By default, `career-ops` is optimized to run with Anthropic's Claude. However, you do **not** need a paid Claude subscription or paid API keys to use this system. 

This guide explains how to configure a completely cost-free setup.

## Option 1: Gemini CLI (Recommended Agentic Workflow)

If you are using an AI coding CLI agent to run `career-ops`, you can run Google's **Gemini CLI** instead of Claude.

1. **Prerequisites:**
   - Node.js 20+ (Gemini CLI requires Node.js 20+)
   - A free Google account.
2. **Setup:**
   - Run the Gemini CLI in your workspace directory:
     ```bash
     gemini
     ```
   - On the first run, the CLI will prompt you to authenticate via your web browser (Google OAuth).
   - This authentication is completely free, and the CLI runs agentic steps using Google's free-tier quotas without requiring any billing setup.

## Option 2: Gemini API & `gemini-eval.mjs`

If you are running the system via Node.js scripts directly rather than inside an interactive CLI agent, you can use the built-in Gemini evaluator script (`gemini-eval.mjs`).

This script uses the `gemini-2.5-flash` model, which features a highly generous free tier (15 requests per minute, 1 million tokens per day) with zero billing required.

### Setup Instructions
1. **Get an API Key:**
   - Visit [Google AI Studio](https://aistudio.google.com/apikey) and generate a free API key.
2. **Configure Environment:**
   - Create or edit the `.env` file in the root of your `career-ops` repository and add your key:
     ```env
     GEMINI_API_KEY=your_free_api_key_here
     ```
3. **Install Dependencies:**
   - Make sure dependencies are installed:
     ```bash
     npm install
     ```
4. **Evaluate Offers:**
   - Pass the job description (JD) text directly:
     ```bash
     node gemini-eval.mjs "We are looking for a Senior AI Engineer..."
     ```
   - Or evaluate a job description from a local text file:
     ```bash
     node gemini-eval.mjs --file ./jds/openai-swe.txt
     ```
