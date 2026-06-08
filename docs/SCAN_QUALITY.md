# Scan Quality Report

`scan-quality.mjs` summarizes scanner health from local files. It does not call
the network or any AI provider.

```bash
npm run scan:quality
node scan-quality.mjs --json
node scan-quality.mjs --history data/scan-history.tsv --portals portals.yml
```

The report highlights:

- scan-history status distribution
- provider coverage across tracked companies
- duplicate URLs seen by the scanner
- enabled companies missing `careers_url`
- companies that have not appeared recently

Use it after `/career-ops scan` to spot stale targets and configuration gaps.
