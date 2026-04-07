# Intelligence Sources

Source modules are implemented in Phase 2. Each module wraps a single external API and exposes a standard interface.

## Standard Interface

Every source module exports three functions:

### `execute(query)`

Runs a query against the source and returns structured results.

**Parameters:**
- `query` — an object containing the search parameters (varies by source type)

**Returns:** an array of result objects with normalized fields (title, url, snippet, metadata).

### `estimateCost(queryType)`

Returns the estimated cost in USD for a given query type before executing it. Used by the router to stay within budget constraints.

**Parameters:**
- `queryType` — string identifying the type of query (e.g., "search", "scrape", "enrich")

**Returns:** a number representing the estimated cost in USD.

### `isAvailable()`

Checks whether the source is configured and operational (API key present, service reachable).

**Returns:** a boolean indicating availability.

## Planned Source Modules

| Module | File | API | Primary Use |
|--------|------|-----|-------------|
| Exa | `exa.mjs` | Exa | Semantic search for jobs, companies, and people |
| Bright Data | `brightdata.mjs` | Bright Data | LinkedIn profile scraping, hiring manager discovery |
| Tavily | `tavily.mjs` | Tavily | Web search for job boards and company news |
| Firecrawl | `firecrawl.mjs` | Firecrawl | Structured extraction from career pages |
| Valyu | `valyu.mjs` | Valyu | Real-time data marketplace queries |
| Parallel | `parallel.mjs` | Parallel | Data enrichment and analysis |
