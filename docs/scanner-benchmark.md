# Scanner Benchmark Suite

Issue: #1034

The scanner benchmark suite measures whether providers improve useful coverage or merely add stale/noisy postings. It starts with deterministic fixtures so CI does not depend on live job boards.

## Fixture Format

```json
{
  "schema_version": "career-ops.scanner-benchmark/v1",
  "name": "core-ai-roles",
  "expected": [
    {
      "id": "expected-1",
      "company": "Example Inc",
      "title": "Senior AI Engineer",
      "location": "Berlin",
      "fresh": true,
      "compensation_expected": true
    }
  ],
  "actual": [
    {
      "provider": "greenhouse",
      "company": "Example Inc",
      "title": "Senior AI Engineer",
      "location": "Berlin",
      "fresh": true,
      "compensation": {
        "min": 120000,
        "max": 160000,
        "currency": "EUR"
      }
    }
  ],
  "provider_results": [
    { "provider": "greenhouse", "status": "ok" },
    { "provider": "lever", "status": "timeout" }
  ]
}
```

## Metrics

- `coverage`: expected postings matched by actual provider output
- `freshness`: actual postings marked fresh
- `noise`: actual postings that do not match any expected posting
- `location_accuracy`: matched postings whose location matches the expected location
- `compensation_extraction`: expected compensation-bearing postings where the provider returned compensation
- `duplicate_rate`: duplicate normalized postings in actual output
- `provider_failure_rate`: provider runs with a non-OK status
- `timeout_rate`: provider runs that timed out

Live network benchmarks can be added later, but provider PRs should be able to include deterministic fixture evidence first.
