# Company API Sources

Career-Ops already supports classic ATS-style job boards such as Greenhouse, Ashby, and Lever.
This feature adds a second discovery path for ecosystems where opportunities are not exposed
through a standard ATS board, but where company data is available through a browser-backed JSON API.

## What This Enables

- fetch company datasets from ecosystem maps and startup directories
- run existing title and location filters against those datasets
- build a shortlist of promising companies
- generate a review queue for live vacancy/contact verification
- support browser-backed APIs that are not accessible through plain HTTP clients

## Workflow

```bash
npm run source:refresh -- --source startup-map-berlin --offset 0 --pages 8
```

This command:

1. fetches company batches into `data/company-dumps/`
2. rebuilds the shortlist
3. builds a review queue
4. enriches the queue with candidate links
5. produces a tracker-candidate queue for the next manual pass

## Why This Is Separate From ATS Scanning

ATS boards start from live job postings.

Company API sources start from a company dataset and then narrow down to likely targets before
manual or browser-based verification. This is useful for:

- startup ecosystem maps
- regional startup directories
- hiring/discovery aggregators
- browser-only JSON APIs protected by Cloudflare or similar edge checks

## Source Profiles

Sources live in `sources/company-api/` as YAML profiles.

Each profile defines:

- `boot_url` — the page to open before making the API request
- `transport` — `browser` or `http`
- `api` request metadata
- headers
- default filters such as region and sort
- payload template

The included `startup-map-berlin.yml` profile is the first example implementation.
