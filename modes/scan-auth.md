# Mode: scan-auth — Authenticated Portal Scanner

Scan job portals that require login (LinkedIn, Naukri, Indeed, Instahyre) using persistent browser sessions managed via agent-browser.

**Requires:** `node scan-auth.mjs --login <portal>` first (one-time manual login).

## Workflow

### First-time Setup (once per portal)

```bash
node scan-auth.mjs --login linkedin
```

- Opens visible browser to portal login page
- User logs in manually
- Session persisted to `~/.agent-browser/sessions/{portal}-default.json`
- Subsequent runs reuse the session automatically

### Run Scan

```bash
node scan-auth.mjs --scan linkedin
node scan-auth.mjs --scan naukri
node scan-auth.mjs --scan indeed
node scan-auth.mjs --scan instahyre
node scan-auth.mjs --scan              # default: linkedin
```

### Session Management

```bash
node scan-auth.mjs --status            # Check all sessions
node scan-auth.mjs --status linkedin   # Check specific session
node scan-auth.mjs --logout linkedin   # Clear session
node scan-auth.mjs --list             # Show session status
node scan-auth.mjs --scan --dry-run    # Preview without writing
```

## Configuration (portals.yml)

```yaml
# Authenticated search config
linkedin_searches:
  keywords: ["Smart Contract Engineer", "Blockchain Developer", "Solidity Engineer"]
  date_posted: r86400       # r86400 (24h), r604800 (week), r2592000 (month) — or plain: 24, week, month
  experience_level: [Senior, Manager, Director]  # Entry-level, Senior, Manager, Director, Executive
  max_results_per_search: 25
  delay_between_pages_ms: [3000, 8000]   # randomized between min and max
  delay_between_searches_ms: [5000, 15000]
  employer_blocklist: ["jobs via dice", "pwc", "accenture"]  # case-insensitive partial match

# Standard title filter (applied to title AND full JD text in scan-auth)
title_filter:
  positive:
    - "Smart Contract"
    - "Blockchain"
    - "Solidity"
    - "Protocol"
  negative:
    - "Junior"
    - "Intern"
    - "iOS"
    - "Android"
```

### Filters Applied

| Filter | What it checks | Where |
|--------|---------------|-------|
| `employer_blocklist` | Company name | Title only, case-insensitive |
| `title_filter.negative` | Title keywords | Title only |
| `title_filter.positive` | Title + full JD text | Both — clicks job to expand before filtering |
| `dedup` | URL vs scan-history.tsv | URL match |

## How it Works

1. **agent-browser** with `--session-name {portal}` auto-saves cookies/localStorage
2. Reuses same session across runs (no re-login needed)
3. Scrapes job listings via XPath selectors in headless-ish mode
4. Applies title filter from `portals.yml`
5. Deduplicates against `data/scan-history.tsv` and `data/pipeline.md`
6. Appends new offers to `pipeline.md`

## Session Persistence

| Layer | Mechanism | Location |
|-------|-----------|----------|
| Browser cookies | agent-browser native | `~/.agent-browser/sessions/{portal}-default.json` |
| career-ops metadata | `.sessions/{portal}/state.json` | project root |

**LinkedIn tip:** Sessions typically survive weeks/months until LinkedIn invalidates server-side. If `--status` shows expired, just re-run `--login linkedin` (no need to re-configure).

## Anti-Detection

For aggressive portals (LinkedIn is the toughest), use the `agent-browser-stealth` fork:

```bash
npm install -g agent-browser-stealth
abs install
# Then use `abs` instead of `agent-browser` in scan-auth.mjs
```

The stealth fork applies: webdriver flag masking, UA normalization, navigator.webdriver removal, WebGL fingerprint hardening.

## Delegation

Launch as subagent for full scan pipeline:

```
Agent(
  subagent_type="general-purpose",
  prompt="[content of modes/_shared.md]\n\n[content of modes/scan-auth.md]\n\n[portals.yml config]\n\nRun: node scan-auth.mjs --scan linkedin\nValidate: node scan-auth.mjs --status linkedin\nReport results.",
  description="career-ops scan-auth"
)
```