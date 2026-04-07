---
title: Codebase Impact Analysis - Browser Autonomy Enhancement
task_file: C:/Projetos/Carrer Ops/.specs/tasks/draft/browser-autonomy.feature.md
scratchpad: C:/Projetos/Carrer Ops/.specs/scratchpad/browser-autonomy-analysis.md
created: 2026-04-07
status: complete
---

# Codebase Impact Analysis: Browser Autonomy Enhancement

## Summary

- **Files to Modify**: 10 files
- **Files to Create**: 1 file
- **Files to Delete**: 0 files
- **Test Files Affected**: 0 (no test suite exists)
- **Risk Level**: Medium — all Playwright logic lives in prompt-engineering documents (modes/*.md), not in executable Node.js code. Risk is logic drift and breaking the shared-browser constraint.

---

## Files to be Modified/Created

### Primary Changes

```
modes/
├── _shared.md                  # UPDATE: Add browser autonomy rules (decision loops, HITL
│                               #   stops, retry policy, cookie banner dismissal) to Tools
│                               #   section (currently L89-99)
├── scan.md                     # UPDATE: Add decision loop after snapshot (scroll detection,
│                               #   pagination handling, cookie banner dismissal, retry on
│                               #   failure, session import reference)
├── pipeline.md                 # UPDATE: Add retry chain on navigate failure, cookie banner
│                               #   handling, CAPTCHA detection and HITL escalation
├── auto-pipeline.md            # UPDATE: Add decision loop for JD extraction step (Paso 0),
│                               #   popup/banner dismissal, HITL on CAPTCHA
├── apply.md                    # UPDATE: Major — add actual browser_click/browser_fill_form/
│                               #   browser_type calls to Workflow Steps 1-6; add decision
│                               #   loop (snapshot → detect field type → fill → re-snapshot);
│                               #   add explicit HITL stop points (before Submit, 2FA, CAPTCHA)
├── browser-session.md          # NEW: Shared guide for cookie import from Chrome, session
│                               #   reuse across modes, authenticated headless browsing
│                               #   (referenced by scan.md, pipeline.md, apply.md)
└── de/
    ├── _shared.md              # UPDATE: Mirror _shared.md changes in German
    ├── bewerben.md             # UPDATE: Mirror apply.md changes in German
    └── pipeline.md             # UPDATE: Mirror pipeline.md changes in German
```

### Configuration Updates

```
templates/
└── portals.example.yml         # UPDATE: Add session/cookie config fields under each
                                #   company entry (e.g., cookie_file, requires_login,
                                #   captcha_strategy)
```

### Instructions (existing rule enforcement)

```
CLAUDE.md                       # UPDATE: Add browser autonomy section — reinforce HITL
                                #   boundaries, document new browser_session.md reference,
                                #   add CAPTCHA/2FA escalation protocol
```

---

## Useful Resources for Implementation

### Pattern References

```
modes/
├── scan.md                     # Best existing example of Playwright decision logic
│                               #   (Level 1/2/3 priority chain, fallback handling)
└── de/pipeline.md:46           # Only current mention of cookie banners
                                #   ("StepStone/XING/kununu — often cookie banners")
```

---

## Key Interfaces & Contracts

### Functions/Methods to Modify (in prose — these are Claude tool invocations)

| Location | Name | Current Usage | Change Required |
|----------|------|---------------|-----------------|
| `modes/scan.md:59-65` | Playwright scan loop | navigate → snapshot → extract | Add: cookie banner check, scroll/pagination decision, retry on 404/redirect |
| `modes/pipeline.md:10,36-38` | JD extraction chain | navigate → snapshot → WebFetch → WebSearch | Add: retry count, banner dismissal, CAPTCHA detection, HITL escalation |
| `modes/apply.md:13-25` | Detect offer step | snapshot only | Add: browser_click, browser_fill_form, browser_type, browser_wait_for |
| `modes/apply.md:99-107` | Scroll handling | asks user to scroll manually | Replace: use browser_scroll or browser_evaluate for scroll + re-snapshot |
| `modes/auto-pipeline.md:11-13` | JD extraction (Paso 0) | navigate → snapshot priority chain | Add: banner dismissal, retry, CAPTCHA HITL |
| `modes/_shared.md:89-99` | Tools table | Lists Playwright as "verify offers + no parallel" | Add: new tool calls (browser_click, browser_fill_form, browser_type, browser_wait_for); add HITL rules |

### New File Contract: modes/browser-session.md

| Concern | Content |
|---------|---------|
| Cookie import | How to read Chrome cookies (SQLite or JSON export) and pass to Playwright session |
| Session reuse | Pattern for persisting browser context across multi-step flows |
| Login flow | Decision loop: navigate → snapshot → detect login form → fill credentials → snapshot → detect 2FA → HITL |
| CAPTCHA handling | Detect CAPTCHA presence in snapshot → immediately STOP → ask user |
| Cookie banner | Standard dismissal patterns (Accept button, Reject all, close X) |

### Config Fields to Add (portals.example.yml → portals.yml)

| Field | Location | Purpose |
|-------|----------|---------|
| `requires_login: true/false` | Per company entry | Flag to trigger cookie/session import |
| `cookie_file: path` | Per company entry | Path to exported Chrome cookies JSON |
| `captcha_strategy: stop/skip` | Per company entry | What to do when CAPTCHA is detected |

---

## Integration Points

| File | Relationship | Impact | Action Needed |
|------|--------------|--------|---------------|
| `CLAUDE.md:210-215` | Defines mandatory Playwright rule for offer verification | High | Add browser autonomy section; reinforce HITL stops |
| `CLAUDE.md:198-203` | Ethical rule: never submit without review | High | Cross-reference new HITL stop points in apply.md |
| `modes/_shared.md:95` | Hard constraint: NEVER 2+ agents with Playwright in parallel | Critical | Preserve this constraint; new retry logic must be sequential |
| `modes/de/_shared.md:197` | German mirror of same constraint | High | Mirror all _shared.md changes |
| `data/pipeline.md` | Pipeline inbox — [!] entries created when Playwright fails | Medium | New HITL patterns change when [!] is written vs when execution stops |
| `portals.yml` (user layer) | Drives scan.md behavior | Medium | New fields needed but file is user-layer (never auto-updated by system) |
| `templates/portals.example.yml` | System template for portals.yml | Medium | Must be updated to document new fields |
| `generate-pdf.mjs` | Uses playwright chromium for PDF — completely separate concern | None | OUT OF SCOPE — headless PDF rendering, not web scraping |

---

## Similar Implementations

### Pattern 1: Priority Chain with Fallback (scan.md)

- **Location**: `modes/scan.md:44-50`
- **Why relevant**: The three-level fallback (Playwright → Greenhouse API → WebSearch) is the existing pattern for graceful degradation. Retry/fallback logic for the new feature should follow this same tiered approach.
- **Key files**:
  - `modes/scan.md:57-95` — Full Playwright loop including per-company error handling

### Pattern 2: Special Case Escalation (pipeline.md)

- **Location**: `modes/pipeline.md:42`
- **Why relevant**: `[!]` marker pattern for escalating to human when automated flow fails (LinkedIn login wall). The new HITL boundaries follow the same "mark and stop" pattern but with richer detection logic.
- **Key files**:
  - `modes/pipeline.md:36-43` — Detection chain and special cases

### Pattern 3: Ethical Stop (CLAUDE.md)

- **Location**: `CLAUDE.md:198-203`
- **Why relevant**: "NEVER submit without user review" is the prototype for HITL boundaries. New stops (2FA, CAPTCHA) follow the same structure: detect condition → stop execution → inform user → wait.

---

## Test Coverage

No automated test suite exists. The project has:
- `node verify-pipeline.mjs` — data integrity health check (not affected)
- `node cv-sync-check.mjs` — setup validation (not affected)

Manual verification steps for this feature:
1. Scan a portal with a cookie banner — confirm banner is dismissed before content is extracted
2. Navigate to a LinkedIn URL — confirm [!] is written to pipeline.md and execution stops with user message
3. Run apply mode on a form — confirm browser_fill_form is called, confirm execution stops before Submit
4. Trigger a CAPTCHA — confirm execution stops immediately with escalation message

---

## Risk Assessment

### High Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Shared Playwright instance | New decision loops must not spawn parallel Playwright calls; the constraint in `_shared.md:95` must be preserved | Explicitly document sequential execution in every new loop pattern in `browser-session.md` and `_shared.md` |
| portals.yml is user-layer | New cookie/session config fields cannot be auto-deployed; users must manually add them | Document new fields clearly in `templates/portals.example.yml` with inline comments; add migration note to CLAUDE.md |
| apply.md scroll handling rewrite | Replacing "ask user to scroll" with `browser_evaluate` for scroll may break flows where JS injection is blocked by the portal | Keep manual fallback: if `browser_evaluate` fails, fall back to current behavior (ask user) |
| HITL boundary timing | If the agent fills a multi-page form and stops on the wrong page, the user may accidentally submit | Define explicit pre-Submit check: before any click that could trigger form submission, re-snapshot and confirm with user |
| German modes divergence | If EN modes are updated without updating de/ mirrors, German-mode users get inconsistent behavior | Each PR/change must list de/ mirror files as required updates |

---

## Recommended Exploration

Before implementation, developer should read:

1. `C:/Projetos/Carrer Ops/modes/_shared.md:89-105` — Current tools table and Playwright constraint; any new browser tool calls must be added here
2. `C:/Projetos/Carrer Ops/modes/scan.md:44-95` — Best existing decision logic pattern; new retry/fallback should follow the same tiered structure
3. `C:/Projetos/Carrer Ops/modes/apply.md:13-107` — Current apply workflow; the entire workflow section needs rethinking to incorporate actual browser interactions
4. `C:/Projetos/Carrer Ops/CLAUDE.md:198-215` — Ethical rules and mandatory Playwright rule; browser autonomy must strengthen these, not weaken them
5. `C:/Projetos/Carrer Ops/modes/de/_shared.md:190-200` — German mirror constraint; changes to EN _shared.md require mirroring here

---

## Verification Summary

| Check | Status | Notes |
|-------|--------|-------|
| All affected files identified | OK | 10 modify, 1 create, 0 delete |
| Integration points mapped | OK | 8 integration points; critical Playwright constraint preserved |
| Similar patterns found | OK | 3 patterns: priority chain, [!] escalation, ethical stop |
| Test coverage analyzed | OK | No automated tests; manual verification steps defined |
| Risks assessed | OK | 5 risk areas with mitigations |

Limitations/Caveats:
- portals.yml is user-layer and cannot be auto-deployed — new fields require manual user action
- The exact browser_* tool signatures (browser_fill_form vs browser_type vs browser_fill) should be verified against the Playwright MCP plugin before writing mode files
- Cookie import mechanism from Chrome depends on OS and Chrome profile path — implementation details for browser-session.md are platform-specific
