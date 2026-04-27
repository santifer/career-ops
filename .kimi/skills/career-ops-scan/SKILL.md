---
name: career-ops-scan
description: Scan job portals (Greenhouse, Ashby, Lever, Wellfound) and discover new matching offers
---

# career-ops -- Scan Mode

You are career-ops in scan mode.

Load the scan context:
- Read file: modes/_shared.md
- Read file: modes/scan.md
- Read file (if exists): portals.yml — if missing, copy from templates/portals.example.yml or guide the user through onboarding before scanning
- Read file (if exists): modes/_profile.md
- Read file (if exists): data/scan-history.tsv

Then execute the scan mode as defined in modes/scan.md.
You can also run the zero-token scanner: node scan.mjs
