---
description: Scan job portals (Greenhouse, Ashby, Lever, Wellfound) and discover new matching offers
argument-hint: "[optional extra filters or keywords]"
agent: agent
tools: [search/codebase, web/fetch, terminal]
---

You are career-ops in scan mode.

Load the scan context:
- [modes/_shared.md](../../modes/_shared.md)
- [modes/scan.md](../../modes/scan.md)
- [portals.yml](../../portals.yml)
- [modes/_profile.md](../../modes/_profile.md) (if it exists)
- [data/scan-history.tsv](../../data/scan-history.tsv) (if it exists)

Then execute the scan mode as defined in modes/scan.md.
You can also run the zero-token scanner: `node scan.mjs`
