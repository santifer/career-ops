# F-1 Visa Module

Career-ops extension for F-1 international students: visa sponsorship detection, H-1B sponsor history lookup, OPT timeline tracking, and proactive company discovery.

## Overview

The visa module transforms career-ops from "find good companies" into "predict and maximize hiring probability" for F-1 OPT/STEM OPT holders. It combines:

- **JD signal detection** -- Identify sponsorship language in job descriptions
- **H-1B filing history** -- Look up actual USCIS data for employer sponsorship track record
- **Visa score** -- Composite visa-friendliness rating (1-5)
- **OPT timeline tracking** -- Expiration countdown, unemployment day limits, cap season awareness

## Setup

1. Copy `config/visa.example.yml` to `config/visa.yml`
2. Fill in your details (sponsorship preferences, OPT dates, etc.)
3. The visa module activates automatically when `config/visa.yml` exists

## OPT Timeline Tracking

Track your F-1 OPT status, unemployment days, and H-1B cap season timing.

### OPT Setup

1. Copy `config/visa.example.yml` to `config/visa.yml` (if not done already)
2. Fill in the `opt:` section:

```yaml
opt:
  type: stem          # regular (12 months) or stem (36 months)
  start_date: "2025-06-01"   # Your OPT start date
  unemployment_days_used: 0  # Update manually as needed
  # h1b_lottery_status: pending  # Optional: selected | not_selected | pending
```

### Quick Status

Run `/career-ops visa-status` to see your OPT dashboard:
- Days remaining until OPT expiration
- Unemployment days used vs limit (90 regular, 150 STEM)
- Current H-1B cap season phase with actionable advice
- Next key deadline

### Automatic Warnings

When configured, OPT warnings appear automatically in:
- **Evaluations** (Block G) -- includes time-to-hire estimate vs your remaining OPT window
- **Batch evaluations** -- same warnings, works in headless mode
- **Scan results** -- one-line OPT status summary at top

### Warning Thresholds

| Unemployment Days Remaining | Level |
|----------------------------|-------|
| <= 60 days | Info note |
| <= 30 days | Warning |
| <= 14 days | URGENT |

### Time-to-Hire Estimates

The system estimates hiring timelines by company type:
- **Startup** (Series A/B, <100 employees): 2-4 weeks
- **Mid-size**: 4-8 weeks
- **Enterprise** (Fortune 500, 5000+ employees): 8-16 weeks

Customize in `config/visa.yml` under `time_to_hire_defaults:`.

### CLI Usage

```bash
node opt-timeline.mjs              # Human-readable dashboard
node opt-timeline.mjs --test       # Run built-in tests
node opt-timeline.mjs --json       # JSON output for pipeline integration
```

## H-1B Cap Season Phases

The system tracks 5 phases of the annual H-1B cap cycle:

| Phase | Months | What Happens |
|-------|--------|-------------|
| Pre-registration | Oct - Feb | Employers prepare petitions for upcoming fiscal year |
| Registration open | Mar | USCIS electronic registration window |
| Lottery results | Apr | Selections announced |
| Filing window | May - Jun | Selected petitions filed with USCIS |
| Post-cap | Jul - Sep | Focus on cap-exempt employers or next cycle |

## Related Commands

| Command | Description |
|---------|-------------|
| `/career-ops visa-status` | OPT timeline dashboard |
| `/career-ops oferta` | Full evaluation with visa analysis in Block G |
| `/career-ops scan` | Portal scan with sponsorship indicators |
| `/career-ops batch` | Batch evaluation with OPT-aware warnings |
