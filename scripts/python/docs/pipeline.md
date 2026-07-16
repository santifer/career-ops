# Pipeline

Pipeline management — browser extraction, agent inbox, liveness checking.

## Modules

### `browser_extract.py`
Headless browser extractor for JD/listing pages. Uses Playwright to fetch job description content from live URLs.

```
python -m scripts.python.pipeline.browser_extract <url>
npm run extract
```

### `agent_inbox.py`
Cross-session agent inbox. Append, list, and resolve items between sessions.

```
python -m scripts.python.pipeline.agent_inbox add "..."
python -m scripts.python.pipeline.agent_inbox list
python -m scripts.python.pipeline.agent_inbox resolve <id>
```

## Liveness Checking

### `liveness_core.py`
Shared liveness logic. Determines whether a job posting is still active based on page signals (expired signals win over generic "Apply" text).

### `liveness_api.py`
API-based liveness check. Uses HTTP requests to check posting status via ATS APIs.

### `liveness_browser.py`
Browser-based liveness check. Uses Playwright to render the page and detect expired/unavailable postings.

```
python -m scripts.python.pipeline.liveness_api <url>
python -m scripts.python.pipeline.liveness_browser <url>
```
