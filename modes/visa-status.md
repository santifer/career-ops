# visa-status -- OPT Timeline Dashboard

Quick-glance view of your F-1 OPT status, unemployment day counter, H-1B cap season phase, and upcoming deadlines.

## Prerequisites

- `config/visa.yml` must exist with `opt:` section configured
- If missing, tell user: "OPT tracking not configured. Copy config/visa.example.yml to config/visa.yml and fill in your OPT details."

## Steps

1. Run `node opt-timeline.mjs` (no args -- human-readable dashboard mode)
2. Display the output directly to the user
3. If any warnings are present (unemployment severity or OPT expiration approaching), highlight them prominently

## Output Format

The script produces a formatted dashboard. Display it as-is. Example:

```
=== F-1 OPT Status ===

Type:           STEM OPT
Start Date:     2025-06-01
Expiration:     2028-06-01
Remaining:      792 days

--- Unemployment Counter ---
Used:           45 / 150 days
Remaining:      105 days
Status:         OK

--- H-1B Cap Season ---
Current Phase:  Filing window (Apr - Jun)
Advice:         Selected petitions being filed. If not selected, focus on cap-exempt employers.
Lottery Status: pending

--- Next Key Deadline ---
Oct 1, 2026:    H-1B employment start date for FY2027 selectees
```

## Warnings

If unemployment remaining <= 60 days or OPT remaining is within warning thresholds, the script output includes warning banners. Make sure these are visible and not buried.

## Tips

After displaying status, suggest:
- "Update your unemployment days: edit `opt.unemployment_days_used` in config/visa.yml"
- "Run `/career-ops oferta` to evaluate a job with OPT-aware timing analysis"
