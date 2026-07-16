# Evaluation

LLM-powered job offer evaluators. Score offers against candidate profile, generate tailored recommendations.

## Provider Modules

### `openai_eval.py`
OpenAI-compatible evaluator. Works with any provider exposing the `/chat/completions` endpoint (OpenAI, DeepSeek, Together, Groq, OpenRouter, local LM Studio/vLLM).

```
python -m scripts.python.evaluation.openai_eval --file ./jds/job.txt
python -m scripts.python.evaluation.openai_eval --url https://boards.greenhouse.io/acme/jobs/123
npm run openai:eval
```

### `gemini_eval.py`
Google Gemini evaluator. Free tier available (15 RPM) via Google AI Studio.

```
python -m scripts.python.evaluation.gemini_eval "Job description text..."
python -m scripts.python.evaluation.gemini_eval --file ./jds/my-job.txt
npm run gemini:eval
```

### `ollama_eval.py`
Local Ollama evaluator. 100% local, no API keys needed.

```
python -m scripts.python.evaluation.ollama_eval --file ./jds/job.txt
npm run ollama:eval
```

### `openai_tailor.py`
CV tailoring for a specific job. Generates tailored CV sections based on evaluation results.

```
python -m scripts.python.evaluation.openai_tailor
npm run openai:tailor
```

## Utility Modules

### `jd_skill_gap.py`
Zero-LLM JD skill-gap checker. Classifies a JD's required skills against `cv.md` into `existing` / `supportedByResume` / `gap`. Never auto-adds claims.

```
python -m scripts.python.evaluation.jd_skill_gap --file jds/job.txt
python -m scripts.python.evaluation.jd_skill_gap --url-text https://...
```

### `eval_golden.py`
Golden-set evaluation harness for cheap-model routing. Tests evaluation quality across model tiers.

```
python -m scripts.python.evaluation.eval_golden
npm run eval:golden
```

## Spend Tiers

Set in `config/profile.yml`:
- `economy` — cheapest, fastest (Gemini Flash / small models)
- `standard` — balanced cost/quality (GPT-4o-mini / Claude Haiku)
- `premium` — most capable (GPT-4o / Claude Sonnet)
