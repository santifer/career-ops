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
      "fresh": true
    }
  ],
  "actual": [
    {
      "provider": "greenhouse",
      "company": "Example Inc",
      "title": "Senior AI Engineer",
      "location": "Berlin",
      "fresh": true
    }
  ]
}
```

## Metrics

- `coverage`: expected postings matched by actual provider output
- `freshness`: actual postings marked fresh
- `noise`: actual postings that do not match any expected posting
- `duplicate_rate`: duplicate normalized postings in actual output

Live network benchmarks can be added later, but provider PRs should be able to include deterministic fixture evidence first.

