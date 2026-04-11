# Visa Sponsorship Module

For F-1 OPT/STEM OPT holders and anyone who needs employer visa sponsorship. This module adds visa-friendliness scoring to every evaluation, helping you skip dead-end applications and focus on sponsors.

## How It Works

Three scripts work together:

| Script | Purpose |
|--------|---------|
| `sponsorship-detect.mjs` | Classifies JD text as WILL_SPONSOR / WONT_SPONSOR / UNKNOWN |
| `h1b-lookup.mjs` | Queries USCIS H-1B data for employer petition history |
| `visa-score.mjs` | Combines signals into a 1-5 visa-friendliness score |

The evaluation pipeline (Block G in `modes/oferta.md`) calls these automatically during every offer evaluation.

## Setup

### 1. Download USCIS Data (recommended)

```bash
node download-uscis.mjs
```

Downloads public H-1B employer data CSVs to `data/visa/uscis/`. Works offline after first download. Without this, H-1B history lookups return "no data" (evaluations still work, just without employer history).

A sample file (`data/visa/sample/h1b_sample.csv`) is included for testing.

### 2. Configure Sponsorship Mode

Add to `config/profile.yml`:

```yaml
visa:
  sponsorship_mode: score_penalty  # hard_filter | score_penalty | info_only
  penalties:
    wont_sponsor: -0.7
    unknown: -0.3
```

**Modes:**

| Mode | Behavior |
|------|----------|
| `hard_filter` | WONT_SPONSOR JDs are auto-SKIPped before evaluation (saves tokens) |
| `score_penalty` | Overall A-F score is penalized for WONT_SPONSOR/UNKNOWN JDs |
| `info_only` | Visa info shown in Block G but doesn't affect scoring (default) |

### 3. Add Employer Aliases (optional)

Edit `config/employer-aliases.yml` to map common names to USCIS filing names:

```yaml
google: "ALPHABET INC"
meta: "META PLATFORMS INC"
amazon: "AMAZON COM INC"
```

## Usage

### Automatic (during evaluation)

Just paste a JD or URL -- Block G runs automatically:

```
/career-ops oferta https://jobs.example.com/senior-engineer
```

The report will include:

```
## Block G: Visa Sponsorship Analysis

**Sponsorship Signal:** WILL_SPONSOR (matched: "visa sponsorship available")
**H-1B History:** 2,472 petitions (97.7% approval rate, trending up)
**Visa Score:** 4.8/5
```

### Standalone Scripts

```bash
# Classify a JD file
node sponsorship-detect.mjs < jds/company-role.txt

# Look up employer H-1B history
node h1b-lookup.mjs "Google"
node h1b-lookup.mjs "Google" --json

# Compute composite score
node visa-score.mjs --jd "We sponsor H-1B visas" --company "Google"
```

### Batch Mode

Batch evaluations automatically include visa scoring. The JSON output adds:

```json
{
  "visa_score": 4.8,
  "visa_classification": "WILL_SPONSOR"
}
```

In `hard_filter` mode, WONT_SPONSOR JDs are skipped at Paso 1.5 (pre-filter) without consuming evaluation tokens.

### Portal Scanner

The scanner adds a sponsorship indicator column:

```
[SPONSOR]  Senior ML Engineer - Anthropic
[NO-SPNS]  Staff Engineer - Defense Corp
[?]        Backend Developer - Startup Inc
```

No filtering is applied -- all offers are shown. The indicator helps you prioritize.

## Keyword Configuration

Edit `config/sponsorship-keywords.yml` to tune detection:

```yaml
positive_keywords:
  - "visa sponsorship"
  - "h-1b"
  - "sponsor qualified candidates"
  - "immigration support"

negative_keywords:
  - "no sponsorship"
  - "must be authorized to work"
  - "without sponsorship"

government_blockers:
  - "security clearance required"
  - "us citizen only"
  - "itar"

authorization_blockers:
  - "authorized to work in the united states"
  - "without the need for sponsorship"
```

47 keywords are pre-configured across 4 categories.

## Scoring Weights

The composite score (1-5) is calculated from:

| Signal | Weight | Source |
|--------|--------|--------|
| JD sponsorship classification | 30% | Keyword matching |
| H-1B filing history | 30% | USCIS employer data |
| E-Verify enrollment | 20% | Company data (if available) |
| Company size | 10% | Inferred from headcount |
| STEM-eligible role | 10% | Job title analysis |

## Testing

```bash
node sponsorship-detect.mjs --test   # 8 tests
node h1b-lookup.mjs --test           # 17 tests
node visa-score.mjs --test           # 15 tests
node test-all.mjs                    # Full suite (includes visa sections)
```

## Cache

H-1B lookups are cached for 90 days in `data/visa/cache/`. Clear with:

```bash
node h1b-lookup.mjs --no-cache "Company Name"
```

## Files

| Path | Layer | Purpose |
|------|-------|---------|
| `sponsorship-detect.mjs` | System | JD keyword classifier |
| `h1b-lookup.mjs` | System | USCIS employer lookup |
| `visa-score.mjs` | System | Composite score calculator |
| `download-uscis.mjs` | System | USCIS data downloader |
| `config/sponsorship-keywords.yml` | System | Detection keywords |
| `config/employer-aliases.yml` | System | Employer name mappings |
| `config/visa.yml` | User | Personal visa config (mode, penalties) |
| `data/visa/uscis/` | User | Downloaded USCIS CSVs |
| `data/visa/cache/` | User | Lookup cache (auto-managed) |
