# Browser Autonomy Enhancement

## Description

> **Required Skill**: You MUST use and analyse the `playwright-mcp-autonomy` skill before doing any modification to this task file or starting implementation of it!
>
> Skill location: `.claude/skills/playwright-mcp-autonomy/SKILL.md`

## Context

- Stack: Node.js (mjs), Playwright ^1.58.1, YAML config, Markdown data
- Modos existentes: scan (buscar portais), apply (preencher formularios), evaluate (ler JDs), pipeline (processar URLs)
- O CLAUDE.md ja define que verificacao de ofertas DEVE usar Playwright (nao WebSearch/WebFetch)
- Regra etica: NUNCA submeter aplicacao sem revisao do usuario

The career-ops agent currently supports browser interaction but requires extensive manual guidance for multi-step flows like portal scanning and application form filling. The user must direct each click, each navigation, and each form fill individually, creating significant time overhead when processing multiple job opportunities across diverse portals.

This enhancement introduces autonomous browser interaction patterns that allow the agent to read page state, make navigation and interaction decisions, execute actions, and loop until a goal is met or a human-in-the-loop gate is triggered. The core principle is a decision loop that chains page-state reading with intelligent action selection, combined with safety boundaries that ensure the user always retains control over irreversible actions like application submission.

Five capability areas are addressed: (1) a decision loop pattern for autonomous read-decide-act cycles, (2) cookie/session import from the user's real Chrome browser for authenticated portal access, (3) a configurable multi-step flow runner for common portal interactions defined in YAML, (4) retry and fallback logic for web obstacles like popups, cookie banners, and dynamic content, and (5) human-in-the-loop gates that stop the agent before submission, on CAPTCHA detection, and on 2FA prompts.

The primary beneficiary is the job-seeking user, who gains the ability to initiate a scan or apply command and have the agent handle the mechanical browser interaction end-to-end, only stopping when human judgment is required. This preserves the ethical constraint defined in CLAUDE.md (never submit without user review) while dramatically reducing the manual effort per application.

**Scope**:
- Included:
  - Decision loop pattern (read page state, decide action, execute, re-read, repeat)
  - Cookie import from user's Chrome browser to establish authenticated portal sessions
  - Multi-step flow runner with YAML-configurable step definitions per portal
  - Obstacle handling: cookie consent banners, newsletter popups, dynamic content loading
  - CAPTCHA detection (detect and escalate to user, not solve)
  - 2FA prompt detection and escalation
  - Submission gate: agent always stops before clicking Submit/Apply/Send
  - Action logging: every autonomous action recorded for user review
- Excluded:
  - CAPTCHA solving (detection only)
  - Visual AI or computer vision beyond text-based page-state analysis
  - New portal discovery beyond what is configured in portals.yml
  - Changes to evaluation modes (oferta.md, ofertas.md, etc.)
  - Changes to batch/headless mode (claude -p) behavior
  - Cross-portal session synchronization or browser fingerprint management

**User Scenarios**:
1. **Primary Flow**: User initiates a scan or apply command. Agent imports cookies (if configured), navigates to target portal, reads page state, processes job listings or fills form fields with profile data, handles obstacles autonomously, and stops at the submission gate presenting a summary of all actions taken and proposed submission for user review.
2. **Alternative Flow -- No Cookies**: Portal requires authentication but cookie import is not configured or has failed. Agent detects the login wall, notifies the user, and requests manual login or credentials before proceeding.
3. **Alternative Flow -- No Flow Definition**: Portal has no YAML flow definition configured. Agent falls back to page-state interpretation and best-effort interaction using the decision loop pattern without pre-mapped selectors.
4. **Error Handling -- CAPTCHA**: Agent encounters a CAPTCHA during a flow, detects it in the page content, stops immediately, and notifies the user with page context so the user can resolve it manually.
5. **Error Handling -- 2FA**: Agent detects a two-factor authentication prompt, stops, and waits for the user to complete authentication before resuming.
6. **Error Handling -- Page Failure**: Page returns 404, times out, or shows unexpected content. Agent retries up to 3 times, then logs the error and moves to the next target or escalates to the user.

---

## Acceptance Criteria

### Functional Requirements

- [ ] **Decision Loop Execution**: Agent autonomously reads page state and selects the next action in a loop
  - Given: The agent is on a job portal page with visible job listing links
  - When: The agent reads the current page state and identifies a target element (e.g., job listing link)
  - Then: The agent clicks the element, confirms navigation to the expected page by reading the updated page state, and continues the loop -- all within 15 seconds per cycle

- [ ] **Authenticated Session via Cookie Import**: Agent uses imported browser cookies to access portals as an authenticated user
  - Given: The user has an active Chrome session on a job portal (e.g., LinkedIn, Indeed)
  - When: The agent imports cookies and navigates to the portal
  - Then: The portal recognizes the session as authenticated (no login prompt displayed), and the import process completes within 30 seconds

- [ ] **Multi-Step Flow Completion**: Agent executes a configured multi-step flow from start to finish without manual intervention
  - Given: A YAML flow definition exists for a portal with at least 5 sequential steps (navigate, filter, select, fill, review)
  - When: The agent initiates the flow
  - Then: All steps complete in sequence, each confirmed by reading page state before proceeding to the next step, and the entire flow finishes within 5 minutes

- [ ] **Cookie Banner Dismissal**: Agent automatically dismisses cookie consent overlays
  - Given: The agent navigates to a page displaying a cookie consent banner or overlay
  - When: The agent detects the banner in the page content
  - Then: The agent dismisses the banner (click accept/close) and the target content becomes accessible within 10 seconds

- [ ] **Popup and Overlay Handling**: Agent closes non-critical popups that obstruct the target content
  - Given: A newsletter signup popup, promotional overlay, or similar non-critical modal appears during navigation
  - When: The agent detects the overlay in the page content
  - Then: The agent closes the overlay and resumes the intended flow without user intervention

- [ ] **CAPTCHA Detection and Escalation**: Agent detects CAPTCHAs and stops for human resolution
  - Given: The agent encounters a CAPTCHA challenge during a portal flow
  - When: The agent detects CAPTCHA-like content in the page (human verification challenges)
  - Then: The agent stops the flow, notifies the user with the current page context, and waits for the user to signal that the CAPTCHA has been resolved

- [ ] **Submission Gate (CRITICAL)**: Agent never submits an application without explicit user approval
  - Given: The agent has filled all form fields and the submit/apply/send button is the next logical action
  - When: The agent identifies the submission button in the page content
  - Then: The agent stops, presents a summary of all filled fields and proposed answers, and does NOT click the submit button under any circumstances

- [ ] **2FA Detection and Escalation**: Agent recognizes two-factor authentication prompts and defers to the user
  - Given: A portal displays a 2FA prompt (SMS code, authenticator app, email verification)
  - When: The agent detects the 2FA prompt in the page content
  - Then: The agent stops and notifies the user to complete 2FA manually, resuming only after the user confirms completion

- [ ] **Retry on Transient Failures**: Agent retries failed navigation or interaction before escalating
  - Given: A page fails to load, returns an error, or an element interaction fails
  - When: The agent detects the failure via page content or navigation error
  - Then: The agent retries the action up to 3 times with increasing wait intervals, and if all retries fail, notifies the user with the error context

- [ ] **Stale Flow Definition Handling**: Agent detects when a YAML flow definition no longer matches the portal's current UI
  - Given: A YAML flow definition references a step or element that no longer exists on the portal (e.g., portal redesigned its UI)
  - When: The agent attempts to execute the step and cannot find the expected element within 10 seconds
  - Then: The agent logs the mismatch, falls back to page-state interpretation for the remaining steps, and notifies the user that the flow definition needs updating

- [ ] **Mid-Flow Session Expiration**: Agent detects and handles session expiration during an active flow
  - Given: The agent is partway through a multi-step flow on an authenticated portal
  - When: The portal redirects to a login page or displays a session-expired message
  - Then: The agent stops the flow, notifies the user that re-authentication is required, and preserves a record of which steps were completed so the flow can be resumed

- [ ] **Concurrent Obstacle Handling**: Agent handles multiple overlapping obstacles on a single page
  - Given: A portal page displays both a cookie consent banner and a newsletter popup simultaneously
  - When: The agent detects multiple obstructing overlays in the page content
  - Then: The agent dismisses each obstacle in sequence (topmost first) and resumes the intended flow within 15 seconds

- [ ] **Partial Form Fill Preservation on Interruption**: Agent preserves form data when a flow is interrupted
  - Given: The agent has partially filled an application form (at least 2 fields completed)
  - When: The flow is interrupted by a gate (CAPTCHA, 2FA) or an error requiring user intervention
  - Then: The action log includes a record of all fields filled and their values, so the user or agent can resume from where the flow stopped without re-entering data

- [ ] **Action Decision Log**: Every autonomous action is logged for user transparency and review
  - Given: The agent performs any autonomous flow (scan, apply, navigate)
  - When: The flow completes or is interrupted by a gate or error
  - Then: The user can review a log showing each action taken, its outcome (success/failure/skipped), and a timestamp for each entry

### Non-Functional Requirements

- [ ] **Performance**: Each decision loop cycle (read page state, decide, act) completes within 15 seconds on a connection with latency under 100ms and bandwidth above 5 Mbps
- [ ] **Reliability**: Agent handles at least 3 categories of common web obstacles (cookie banners, popups, slow-loading dynamic content) without requiring user intervention
- [ ] **Auditability**: Every autonomous browser action is recorded with timestamp, action type, target element, and outcome
- [ ] **Session Security**: Imported cookie data is used only for the active browser session and is not written to logs, persisted to disk, or included in any output files

### Definition of Done

- [ ] All acceptance criteria pass
- [ ] Decision loop pattern documented and tested against at least 3 different portal types
- [ ] YAML flow definition schema documented with at least 2 example flows for common portals
- [ ] Human-in-the-loop gates verified: submission gate, CAPTCHA gate, 2FA gate all tested
- [ ] Action logging verified: user can review complete flow history
- [ ] Existing modes (scan.md, apply.md, pipeline.md) updated to leverage the new autonomous patterns
- [ ] No regressions in existing portal scanning or offer verification functionality
- [ ] Code reviewed

---

## Architecture Overview

### References

- **Skill**: `.claude/skills/playwright-mcp-autonomy/SKILL.md`
- **Codebase Analysis**: `.specs/analysis/analysis-browser-autonomy.md`
- **Scratchpad**: `.specs/scratchpad/bce66a89.md`

### Solution Strategy

**Architecture Pattern**: Layered Prompt-Engineering Architecture -- the project's "code" is Markdown instruction documents organized in layers: `CLAUDE.md` (governance) -> `_shared.md` (shared rules) -> mode-specific files (workflows). This is NOT a traditional software architecture; the "runtime" is Claude reading instructions and making Playwright MCP tool calls.

**Approach**: Create a single new shared reference file (`modes/browser-session.md`) containing all browser autonomy patterns -- decision loop, session/cookie management, obstacle handling, CAPTCHA/2FA detection, submission gate, retry logic, and action logging. Update existing mode files (scan.md, apply.md, pipeline.md, auto-pipeline.md) to reference this shared guide at their browser interaction points. Update `_shared.md` with new tool rules and HITL boundaries. `apply.md` receives the most significant rewrite, transforming from a passive screenshot-reading assistant to an active browser interaction workflow.

**Key Decisions**:

1. **Single new file, not multiple**: `browser-session.md` is the sole new mode file -- follows the project's mode-per-concern pattern where each file is a complete reference. Splitting into 3+ files breaks the established pattern.
2. **No YAML flow runner**: The project's runtime is Claude reading Markdown instructions. YAML flow configs (recommended by the skill file) add complexity without benefit in this prompt-engineering architecture. Portal-specific patterns are documented as prose. If a programmatic flow runner is needed later, that is a separate task.
3. **No new npm dependencies**: All browser interaction is via Playwright MCP tool calls. `storageState` JSON files for session persistence. NDJSON for action logs using `fs.appendFileSync`.

**Trade-offs Accepted**:
- Accepting longer `browser-session.md` file for the benefit of a single reference point
- Accepting prose-based flow patterns instead of YAML configs -- less machine-parseable but consistent with the project's architecture
- Accepting manual German translation effort (Phase 5 depends on EN content being finalized first)

---

### Architecture Decomposition

| Component | Responsibility | Dependencies |
|-----------|---------------|--------------|
| `modes/browser-session.md` (NEW) | Shared browser autonomy patterns: decision loop, sessions, obstacles, HITL gates, logging | Referenced by all browser-using modes |
| `modes/_shared.md` (UPDATE) | New browser tools in Tools table, HITL boundary rules | Read by all modes |
| `modes/scan.md` (UPDATE) | Add obstacle dismissal + retry after navigate | References browser-session.md |
| `modes/apply.md` (UPDATE - Major) | Active browser form interaction, submission gate | References browser-session.md |
| `modes/pipeline.md` (UPDATE) | Retry chain, CAPTCHA -> [!], session handling | References browser-session.md |
| `modes/auto-pipeline.md` (UPDATE) | Obstacle dismissal in Paso 0, CAPTCHA HITL | References browser-session.md |
| `CLAUDE.md` (UPDATE) | Browser autonomy rules section | Governs all modes |
| `templates/portals.example.yml` (UPDATE) | New session/cookie config fields | User copies to portals.yml |
| `modes/de/_shared.md` (UPDATE) | German mirror of _shared.md changes | Mirrors EN _shared.md |
| `modes/de/bewerben.md` (UPDATE) | German mirror of apply.md changes | Mirrors EN apply.md |
| `modes/de/pipeline.md` (UPDATE) | German mirror of pipeline.md changes | Mirrors EN pipeline.md |

**Interactions**:
```
CLAUDE.md (governance)
    |
    v
_shared.md (tools + rules) <--- all modes inherit
    |
    v
browser-session.md (shared patterns) <--- scan, apply, pipeline, auto-pipeline reference
    |
    +---> scan.md:           navigate -> obstacle check -> read listings
    +---> apply.md:          navigate -> session check -> decision loop -> fill -> HITL gate
    +---> pipeline.md:       navigate -> obstacle check -> retry -> extract JD
    +---> auto-pipeline.md:  navigate -> obstacle check -> extract JD -> evaluate
```

---

### Expected Changes

```
modes/
  browser-session.md          # NEW: Shared browser autonomy patterns (decision loop, sessions,
                              #   obstacles, CAPTCHA/2FA, submission gate, retry, logging)
  _shared.md                  # UPDATE: Add browser tools to Tools table, add HITL rules
  scan.md                     # UPDATE: Add obstacle dismissal + retry after navigate
  apply.md                    # UPDATE: Major -- active browser interaction, submission gate
  pipeline.md                 # UPDATE: Add retry chain, CAPTCHA -> [!], session handling
  auto-pipeline.md            # UPDATE: Add obstacle dismissal in Paso 0, CAPTCHA detection
  de/_shared.md               # UPDATE: Mirror EN _shared.md changes in German
  de/bewerben.md              # UPDATE: Mirror EN apply.md changes in German
  de/pipeline.md              # UPDATE: Mirror EN pipeline.md changes in German

templates/
  portals.example.yml         # UPDATE: Add requires_login, cookie_file, captcha_strategy fields

CLAUDE.md                     # UPDATE: Add browser autonomy section after Offer Verification

.gitignore                    # UPDATE: Add data/sessions/ and logs/ entries
```

---

### Runtime Scenarios

**Scenario: Autonomous Portal Scan with Obstacle**
```
User --"scan"--> scan.md reads portals.yml
  -> browser_navigate(careers_url)
  -> browser_snapshot()
  -> [Cookie banner detected]
     -> browser_click("Accept all")
     -> browser_snapshot() [verify dismissed]
  -> Read job listings from clean snapshot
  -> Filter + dedup -> Append to pipeline.md
  -> Log actions to logs/
```

**Scenario: Autonomous Apply with Submission Gate**
```
User --"apply URL"--> apply.md
  -> Load session from data/sessions/<portal>.json
  -> browser_navigate(form_url)
  -> browser_snapshot()
  -> [Newsletter popup detected] -> browser_click("Close")
  -> Identify form fields from snapshot
  -> For each field: browser_fill_form(ref, value) -> re-snapshot to verify
  -> [Submit button detected] --> SUBMISSION GATE (MANDATORY)
     -> STOP. Present: "Filled fields: Name=X, Email=Y, Cover Letter=Z..."
     -> Wait for user: "go" or "abort"
  -> Log all actions to logs/
```

**Scenario: CAPTCHA Encountered Mid-Flow**
```
Agent navigating portal -> browser_snapshot()
  -> [CAPTCHA signal: "verify you are human"]
  -> IMMEDIATE STOP
  -> Output: { hitl: true, reason: "captcha", message: "CAPTCHA detected -- please solve it and type 'resume'" }
  -> Wait for user "resume"
  -> browser_snapshot() [verify CAPTCHA resolved]
  -> Continue flow
```

**State Transitions:**
```
[Idle] --command--> [Session Check] --valid--> [Navigate]
                                    --no session--> [HITL: login needed]

[Navigate] --loaded--> [Obstacle Check] --clear--> [Main Loop]
                                        --banner--> [Dismiss] --> [Obstacle Check]
                                        --captcha--> [HITL Pause]
                                        --2fa--> [HITL Pause]

[Main Loop] --goal met--> [Complete]
            --submit button--> [Submission Gate (HITL)]
            --error--> [Retry (3x)] --max--> [Escalate/Skip]

[HITL Pause] --user resumes--> [Re-snapshot] --> [Obstacle Check]

[Submission Gate] --"go"--> [Submit] --> [Complete]
                  --"abort"--> [Complete]
```

---

### Architecture Decisions

#### Decision 1: Single Shared Reference File

**Status**: Accepted

**Context**: Browser autonomy patterns (decision loop, obstacle handling, session management) are needed across 4+ mode files.

**Options**:
1. Single file: `modes/browser-session.md`
2. Multiple files: `browser-loop.md` + `browser-session.md` + `browser-obstacles.md`
3. Inline everything into existing modes

**Decision**: Single file (`browser-session.md`) -- follows the project's established mode-per-concern pattern where each mode file is a self-contained reference.

**Consequences**:
- `browser-session.md` will be ~200-300 lines but complete
- Single point of maintenance for all shared browser patterns
- Consistent with how `_shared.md` serves as the single shared context file

#### Decision 2: No YAML Flow Runner

**Status**: Accepted

**Context**: The skill file recommends YAML flow configs in `config/flows/` with a programmatic flow runner.

**Options**:
1. YAML flow configs + programmatic runner
2. Prose-based patterns in Markdown

**Decision**: Prose-based patterns -- the project has no programmatic runtime. All logic is Claude reading instructions and making MCP tool calls.

**Consequences**:
- Portal-specific patterns documented as prose in `browser-session.md`
- Less machine-parseable but consistent with architecture
- If a programmatic flow runner is needed later, that is a separate enhancement

#### Decision 3: Action Logging via NDJSON

**Status**: Accepted

**Context**: Every autonomous action must be logged for user review and audit.

**Options**:
1. NDJSON files in `logs/`
2. Append to `pipeline.md` or `applications.md`
3. In-memory only (lost on session end)

**Decision**: NDJSON files in `logs/` -- one file per flow execution, flushed after each entry.

**Consequences**:
- `logs/` directory added to `.gitignore` (may contain PII)
- Recoverable partial runs (flush-per-entry)
- Structured format parseable by future tooling

---

### High-Level Structure

```
Browser Autonomy Enhancement
+-- Governance: CLAUDE.md (ethical rules, HITL mandate)
+-- Shared Rules: modes/_shared.md (tools table, constraints)
+-- Shared Patterns: modes/browser-session.md (NEW)
|   +-- Decision Loop Protocol
|   +-- Session Management (storageState load, validity, expiry)
|   +-- Obstacle Dismissal (cookie banners, popups, overlays)
|   +-- CAPTCHA/2FA Detection (signal lists, HITL output)
|   +-- Submission Gate (mandatory HITL before Submit/Apply/Send)
|   +-- Retry Policy (3 retries, increasing wait, then escalate)
|   +-- Action Logging (NDJSON schema, log path convention)
|   +-- Stale Flow Detection (element not found -> fallback)
|   +-- Session Expiry Mid-Flow (login redirect -> HITL)
+-- Mode Updates:
|   +-- scan.md (obstacle check + retry)
|   +-- apply.md (full browser interaction + HITL gates)
|   +-- pipeline.md (retry + CAPTCHA marking)
|   +-- auto-pipeline.md (obstacle check in Paso 0)
+-- Config: templates/portals.example.yml (session fields)
+-- German Mirrors: modes/de/ (_shared.md, bewerben.md, pipeline.md)
```

---

### Workflow Steps (Build Sequence)

```
Phase 1: Foundation               Phase 2: Obstacle Integration     Phase 3: Apply Rewrite
  browser-session.md (NEW)          scan.md (UPDATE)                  apply.md (UPDATE-Major)
  _shared.md (UPDATE)               pipeline.md (UPDATE)
  CLAUDE.md (UPDATE)                auto-pipeline.md (UPDATE)
       |                                 |                                 |
       v                                 v                                 v
Phase 4: Config                   Phase 5: German Mirrors           Phase 6: Verification
  portals.example.yml               de/_shared.md                     Manual tests x4
  .gitignore                         de/bewerben.md                    Regression check
                                     de/pipeline.md
```

**Phase dependencies:** Phase 1 must complete first (other phases reference `browser-session.md`). Phases 2, 3, 4 can proceed in parallel after Phase 1. Phase 5 requires Phases 1-3 (EN content finalized). Phase 6 requires all previous phases.

---

### Contracts

**Action Log Entry Schema** (NDJSON, one entry per line in `logs/flow-run-<timestamp>.ndjson`):
```
{
  "timestamp": "ISO 8601",
  "step_id": "string (e.g., 'dismiss_cookie_banner', 'fill_name')",
  "action": "navigate | click | fill | snapshot | hitl | wait",
  "target_ref": "string | null (ARIA ref e.g., 'e12')",
  "outcome": "success | failure | skipped | hitl_pause",
  "detail": "string (optional -- error message or HITL reason)"
}
```

**HITL Signal Output Format**:
```
{
  "hitl": true,
  "reason": "captcha | 2fa | submit | session_expired",
  "portal": "string (portal slug)",
  "step": "string (current step id)",
  "message": "string (user-facing instruction)"
}
```

**portals.example.yml New Fields** (per company entry):
```yaml
requires_login: false          # true if portal needs authentication
cookie_file: ""                # path to storageState JSON (e.g., data/sessions/example.json)
captcha_strategy: "stop"       # "stop" (HITL) or "skip" (mark [!] and move on)
```

---

## Implementation Process

You MUST launch for each step a separate agent, instead of performing all steps yourself. And for each step marked as parallel, you MUST launch separate agents in parallel.

**CRITICAL:** For each agent you MUST:
1. Use the **Agent** type specified in the step (e.g., `haiku`, `sonnet`, `sdd:developer`)
2. Provide path to task file and prompt which step to implement
3. Require agent to implement exactly that step, not more, not less, not other steps

### Parallelization Overview

```
Step 1 [haiku]     Step 2 [opus]     Step 3 [opus]
(config)           (CLAUDE.md)       (_shared.md)
                        |                 |
                        |            +----+-------+
                        |            |            |
                        +-------> Step 4      Step 9 [sonnet]
                                  [opus]      (de/_shared.md)
                              (browser-session.md)
                                    |
                   +--------+-------+--------+
                   |        |       |        |
                   v        v       v        v
                Step 5   Step 6  Step 7   Step 8
                [opus]   [opus]  [opus]   [opus]
               (scan)  (pipeline)(auto-p) (apply)
                          |                 |
                          v                 v
                       Step 10          Step 11
                       [sonnet]         [sonnet]
                     (de/pipeline)    (de/bewerben)
                          |                 |
                          +--------+--------+
                                   |
                                   v (+ Steps 1, 5, 7, 9)
                                Step 12
                                [opus]
                             (verification)
```

### Implementation Strategy

**Approach**: Bottom-Up (Building-Blocks-First)
**Rationale**: The project is a layered prompt-engineering architecture where lower layers (governance in CLAUDE.md, shared rules in _shared.md) MUST be correct before higher layers (mode workflows) can reference them. The core building block is `modes/browser-session.md`, which defines all reusable patterns. All mode updates are consumers of these patterns, so building from the bottom ensures each layer is self-consistent before dependents are authored.

### Decomposition Chain

| Level | Subproblem | Depends On | Why This Order |
|-------|------------|------------|----------------|
| 0 | .gitignore update | -- | Infrastructure, zero dependencies |
| 0 | portals.example.yml update | -- | Config schema, zero dependencies |
| 1 | CLAUDE.md browser autonomy section | -- | Governance defines ethical boundaries first |
| 1 | _shared.md tools + HITL rules | -- | Shared rules inherited by all modes |
| 2 | browser-session.md (NEW) | Level 1 | Central reference; all modes will point here |
| 2 | de/_shared.md mirror | Level 1 (_shared.md only) | German translation of _shared.md changes |
| 3 | scan.md update | Level 2 | References browser-session.md obstacle patterns |
| 3 | pipeline.md update | Level 2 | References browser-session.md retry/CAPTCHA patterns |
| 3 | auto-pipeline.md update | Level 2 | References browser-session.md obstacle/CAPTCHA patterns |
| 3 | apply.md major rewrite | Level 2 | Most complex; uses decision loop + submission gate from browser-session.md |
| 4 | de/bewerben.md mirror | Level 3 (apply.md) | German translation of apply.md changes |
| 4 | de/pipeline.md mirror | Level 3 (pipeline.md) | German translation of pipeline.md changes |
| 5 | Verification | All previous | Cannot verify until all content exists |

---

### Step 1: Update Configuration Files

**Model:** haiku
**Agent:** haiku
**Depends on:** None
**Parallel with:** Step 2, Step 3

**Goal**: Add session/log directory exclusions to `.gitignore` and new portal authentication fields to the example config, establishing the infrastructure for session data and action logs.

#### Expected Output

- `.gitignore`: Updated with `data/sessions/` and `logs/` entries
- `templates/portals.example.yml`: Updated with `requires_login`, `cookie_file`, `captcha_strategy` fields per company entry

#### Success Criteria

- [ ] `.gitignore` contains `data/sessions/` entry (session storage files excluded from git)
- [ ] `.gitignore` contains `logs/` entry (NDJSON action logs excluded from git)
- [ ] `templates/portals.example.yml` has `requires_login: false` field with inline comment explaining purpose
- [ ] `templates/portals.example.yml` has `cookie_file: ""` field with inline comment referencing `data/sessions/` path convention
- [ ] `templates/portals.example.yml` has `captcha_strategy: "stop"` field with inline comment explaining "stop" vs "skip" options
- [ ] New fields are added to at least one example company entry (e.g., Anthropic) as a reference pattern
- [ ] Existing portals.example.yml content is not broken (all existing fields preserved)

#### Verification

**Level:** ❌ NOT NEEDED
**Rationale:** Simple additive config changes (.gitignore entries, YAML fields). Success is binary -- fields are either present or not. No judgment needed.

#### Subtasks

- [ ] Read current `.gitignore` at `C:/Projetos/Carrer Ops/.gitignore`
- [ ] Add `data/sessions/` and `logs/` entries to `.gitignore` in the "Personal data" section
- [ ] Read current `templates/portals.example.yml` at `C:/Projetos/Carrer Ops/templates/portals.example.yml`
- [ ] Add `requires_login`, `cookie_file`, `captcha_strategy` fields with inline comments to the tracked_companies section header comment block
- [ ] Add the three new fields to one example company entry (Anthropic) as a usage example
- [ ] Verify no existing content was modified or removed

**Complexity**: Small
**Uncertainty**: Low
**Blockers**: None
**Risks**: None significant -- additive changes only.
**Integration Points**: `portals.yml` (user-layer) will need manual update by user; `portals.example.yml` serves as documentation.

---

### Step 2: Update CLAUDE.md with Browser Autonomy Governance

**Model:** opus
**Agent:** sdd:developer
**Depends on:** None
**Parallel with:** Step 1, Step 3

**Goal**: Add a new "Browser Autonomy" section to `CLAUDE.md` after the existing "Offer Verification" section, establishing ethical boundaries and HITL mandates that all mode files must respect.

#### Expected Output

- `CLAUDE.md`: New "Browser Autonomy" section with rules for decision loops, HITL stops, session security, and action logging mandate

#### Success Criteria

- [ ] New section titled "## Browser Autonomy" exists after "## Offer Verification -- MANDATORY" section (around line 215)
- [ ] Section defines: decision loop is the standard pattern for autonomous browser interaction
- [ ] Section mandates: HITL stop before ANY submission (Submit/Apply/Send)
- [ ] Section mandates: HITL stop on CAPTCHA detection
- [ ] Section mandates: HITL stop on 2FA detection
- [ ] Section mandates: session expiry detection triggers HITL stop
- [ ] Section defines: action logging is mandatory for every autonomous browser flow
- [ ] Section defines: imported cookies/sessions must not be written to logs or output files
- [ ] Section references `modes/browser-session.md` as the implementation guide
- [ ] Section preserves the existing "NEVER submit without user review" rule from Ethical Use section (cross-reference, not duplicate)
- [ ] No existing CLAUDE.md content is modified or removed

#### Verification

**Level:** ✅ CRITICAL - Panel of 2 Judges with Aggregated Voting
**Artifact:** `CLAUDE.md`
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Ethical Completeness | 0.30 | All HITL mandates present: submission gate, CAPTCHA stop, 2FA stop, session expiry stop |
| Accuracy | 0.25 | Rules are correct and consistent with existing CLAUDE.md ethical constraints |
| Non-Regression | 0.20 | No existing CLAUDE.md content modified or removed |
| Cross-Reference Quality | 0.15 | References browser-session.md and existing ethical rules without duplication |
| Style Consistency | 0.10 | Follows project Markdown style (Spanish-English mix, direct tone) |

**Reference Pattern:** Existing `CLAUDE.md` sections (Ethical Use, Offer Verification)

#### Subtasks

- [ ] Read full `CLAUDE.md` at `C:/Projetos/Carrer Ops/CLAUDE.md`
- [ ] Draft "## Browser Autonomy" section content following the project's Markdown style (Spanish-English mix, direct tone)
- [ ] Insert section after "Offer Verification" and before "Stack and Conventions"
- [ ] Cross-reference ethical rules (line ~198-203) without duplicating them
- [ ] Reference `modes/browser-session.md` as the detailed implementation guide
- [ ] Verify no existing content was modified

**Complexity**: Small
**Uncertainty**: Low
**Blockers**: None
**Risks**: Must not weaken existing ethical rules. Mitigation: cross-reference rather than rewrite.
**Integration Points**: Every mode file inherits CLAUDE.md governance.

---

### Step 3: Update _shared.md with Browser Tools and HITL Rules

**Model:** opus
**Agent:** sdd:developer
**Depends on:** None
**Parallel with:** Step 1, Step 2

**Goal**: Expand the Tools table in `modes/_shared.md` to include new Playwright browser tool calls (browser_click, browser_fill_form, browser_type, browser_wait_for) and add explicit HITL boundary rules.

#### Expected Output

- `modes/_shared.md`: Updated Tools table and new HITL rules subsection

#### Success Criteria

- [ ] Tools table (currently line 89-99) includes `browser_click`, `browser_fill_form`, `browser_type`, `browser_wait_for` tool calls with usage descriptions
- [ ] Tools table preserves existing Playwright constraint: "NEVER 2+ agents with Playwright in parallel"
- [ ] New subsection "### HITL Boundaries" or equivalent added under Global Rules
- [ ] HITL rules define the three mandatory stop conditions: submission, CAPTCHA, 2FA
- [ ] HITL rules define session expiry as a stop-and-notify condition
- [ ] Reference to `modes/browser-session.md` for full patterns
- [ ] No existing _shared.md content is modified or removed (additive only)

#### Verification

**Level:** ✅ CRITICAL - Panel of 2 Judges with Aggregated Voting
**Artifact:** `modes/_shared.md`
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Tool Table Completeness | 0.25 | All 4 new browser tools (browser_click, browser_fill_form, browser_type, browser_wait_for) added with correct usage descriptions |
| HITL Rules Completeness | 0.25 | Three mandatory stops (submission, CAPTCHA, 2FA) + session expiry defined |
| Constraint Preservation | 0.25 | "NEVER 2+ agents with Playwright in parallel" preserved and reinforced |
| Non-Regression | 0.15 | No existing _shared.md content modified or removed |
| Reference Quality | 0.10 | browser-session.md referenced appropriately |

**Reference Pattern:** Existing `modes/_shared.md` Tools table structure (lines 89-99)

#### Subtasks

- [ ] Read current `modes/_shared.md` at `C:/Projetos/Carrer Ops/modes/_shared.md`
- [ ] Add new browser tool calls to the Tools table with appropriate usage descriptions
- [ ] Add HITL boundary rules section after the Tools section
- [ ] Ensure sequential Playwright constraint (line 95) is preserved and reinforced
- [ ] Add reference to `modes/browser-session.md`
- [ ] Verify no existing content was modified

**Complexity**: Small
**Uncertainty**: Low
**Blockers**: None
**Risks**: Must preserve the "NEVER 2+ agents with Playwright in parallel" constraint. Mitigation: explicitly check after editing.
**Integration Points**: All modes inherit _shared.md. German mirror `de/_shared.md` will need matching update in Step 9.

---

### Step 4: Create modes/browser-session.md

**Model:** opus
**Agent:** sdd:developer
**Depends on:** Step 2, Step 3
**Parallel with:** Step 9 (Step 9 only needs Step 3, not Step 4)

**Goal**: Author the central browser autonomy reference file containing all shared patterns: decision loop protocol, session management (storageState), obstacle dismissal, CAPTCHA/2FA detection, submission gate, retry policy, action logging schema, stale flow detection, and session expiry handling.

#### Expected Output

- `modes/browser-session.md` (NEW): ~200-300 line Markdown file structured as a self-contained reference for all browser autonomy patterns

#### Success Criteria

- [ ] File exists at `modes/browser-session.md`
- [ ] Contains section: Decision Loop Protocol (snapshot -> decide -> act -> re-snapshot -> repeat)
- [ ] Decision loop specifies max cycle count or timeout to prevent infinite loops
- [ ] Contains section: Session Management (storageState JSON load, path convention `data/sessions/<portal>.json`, validity check, expiry detection)
- [ ] Contains section: Obstacle Dismissal (cookie banners, newsletter popups, promotional overlays; sequential dismissal for concurrent obstacles; common dismiss patterns: "Accept all", "Close", X button)
- [ ] Contains section: CAPTCHA Detection (signal phrases list: "verify you are human", "recaptcha", "hcaptcha", "I'm not a robot"; immediate HITL stop; output format matching the HITL Signal contract)
- [ ] Contains section: 2FA Detection (signal phrases: "verification code", "authenticator", "two-factor"; HITL stop)
- [ ] Contains section: Submission Gate (mandatory HITL before Submit/Apply/Send; present filled-fields summary; wait for user "go" or "abort")
- [ ] Contains section: Retry Policy (3 retries with increasing wait: 2s, 5s, 10s; then escalate to user or mark [!])
- [ ] Contains section: Action Logging (NDJSON schema matching the contract in Architecture Overview; file path convention `logs/flow-run-<timestamp>.ndjson`; flush after each entry)
- [ ] Contains section: Stale Flow Detection (element not found within 10s -> fallback to page-state interpretation; notify user flow definition needs updating)
- [ ] Contains section: Session Expiry Mid-Flow (login redirect detection -> HITL stop; preserve record of completed steps)
- [ ] Contains section: Partial Form Preservation (on interruption, log all filled fields and values to action log)
- [ ] File follows project Markdown style: Spanish section headers are acceptable, direct tone, no fluff
- [ ] References governance rules in CLAUDE.md and _shared.md (cross-reference, not duplicate)

#### Verification

**Level:** ✅ CRITICAL - Panel of 2 Judges with Aggregated Voting
**Artifact:** `modes/browser-session.md`
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Section Completeness | 0.25 | All 12 required sections present: decision loop, session mgmt, obstacle dismissal, CAPTCHA, 2FA, submission gate, retry, logging, stale flow, session expiry, partial form, cross-refs |
| Pattern Correctness | 0.25 | Decision loop, retry policy (2s/5s/10s), HITL signals match Architecture contracts (NDJSON schema, HITL output format) |
| Safety Gates | 0.20 | Submission gate, CAPTCHA stop, 2FA stop are unambiguous and mandatory |
| Internal Consistency | 0.15 | NDJSON schema matches contract; HITL output format matches contract; terminology consistent throughout |
| Style and Usability | 0.15 | Follows project Markdown style; actionable for Claude reading instructions; ~200-300 lines |

**Reference Pattern:** Architecture contracts in task file (Action Log Entry Schema, HITL Signal Output Format)

#### Subtasks

- [ ] Create `modes/browser-session.md` with document header and purpose description
- [ ] Write Decision Loop Protocol section with snapshot-decide-act-resnap cycle, max iterations, timeout
- [ ] Write Session Management section with storageState path convention, load pattern, validity check
- [ ] Write Obstacle Dismissal section with cookie banner, popup, overlay patterns and sequential handling
- [ ] Write CAPTCHA Detection section with signal phrases and HITL output format
- [ ] Write 2FA Detection section with signal phrases and HITL output format
- [ ] Write Submission Gate section with mandatory stop, summary presentation, user confirmation flow
- [ ] Write Retry Policy section with 3-retry pattern, increasing delays, escalation
- [ ] Write Action Logging section with NDJSON schema, file path convention, flush-per-entry rule
- [ ] Write Stale Flow Detection section with element-not-found fallback
- [ ] Write Session Expiry section with login redirect detection and step preservation
- [ ] Write Partial Form Preservation section
- [ ] Add cross-references to CLAUDE.md and _shared.md governance rules
- [ ] Review full file for internal consistency and completeness against all acceptance criteria

**Complexity**: Large
**Uncertainty**: Medium -- content is well-defined in architecture, but prose quality and completeness require careful authoring
**Blockers**: Steps 2 and 3 must complete first (governance rules must exist before referencing them)
**Risks**: File may be too long or too terse. Mitigation: target 200-300 lines; review against acceptance criteria checklist.
**Integration Points**: Referenced by scan.md, apply.md, pipeline.md, auto-pipeline.md. This is the single source of truth for browser patterns.

---

### Step 5: Update scan.md with Obstacle Dismissal and Retry

**Model:** opus
**Agent:** sdd:developer
**Depends on:** Step 4
**Parallel with:** Step 6, Step 7, Step 8

**Goal**: Add obstacle dismissal (cookie banners) and retry-on-failure logic to the Playwright scan loop in `modes/scan.md`, referencing `browser-session.md` patterns.

#### Expected Output

- `modes/scan.md`: Updated Nivel 1 Playwright scan workflow with obstacle check after navigate and retry on failure

#### Success Criteria

- [ ] After `browser_navigate` + `browser_snapshot` (currently step 4a-b around line 59), an obstacle check step is added: "If cookie banner or popup detected in snapshot, follow obstacle dismissal from browser-session.md"
- [ ] After obstacle dismissal, a re-snapshot step confirms content is now accessible
- [ ] Retry logic added to step 4g (careers_url failure): retry up to 3 times per browser-session.md retry policy before falling back to scan_query
- [ ] Reference to `modes/browser-session.md` added at the top of the file or in the Nivel 1 section
- [ ] Existing scan workflow logic is preserved (3-level priority chain, dedup, filtering)
- [ ] No existing scan.md content is removed (additive changes)

#### Verification

**Level:** ✅ Single Judge
**Artifact:** `modes/scan.md`
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Obstacle Check Added | 0.25 | After navigate+snapshot, obstacle check references browser-session.md |
| Retry Logic Added | 0.25 | Retry up to 3 times on failure before fallback to scan_query |
| Non-Regression | 0.25 | 3-level priority chain, dedup, filtering preserved intact |
| Reference Quality | 0.15 | browser-session.md referenced appropriately |
| Consistency | 0.10 | Terminology matches browser-session.md patterns |

**Reference Pattern:** `modes/browser-session.md` obstacle dismissal and retry sections

#### Subtasks

- [ ] Read current `modes/scan.md` at `C:/Projetos/Carrer Ops/modes/scan.md`
- [ ] Add obstacle check step after browser_snapshot in Nivel 1 workflow (between current steps 4b and 4c)
- [ ] Add retry logic to the failure handling in step 4g
- [ ] Add reference to browser-session.md for full pattern details
- [ ] Verify existing workflow is preserved

**Complexity**: Small
**Uncertainty**: Low
**Blockers**: Step 4 (browser-session.md) must exist
**Risks**: None significant -- additive changes to existing workflow steps.
**Integration Points**: References browser-session.md. No German mirror exists for scan.md.

---

### Step 6: Update pipeline.md with Retry Chain, CAPTCHA Detection, and Session Handling

**Model:** opus
**Agent:** sdd:developer
**Depends on:** Step 4
**Parallel with:** Step 5, Step 7, Step 8

**Goal**: Add retry chain on navigation failure, CAPTCHA detection with HITL escalation, and session handling to `modes/pipeline.md`.

#### Expected Output

- `modes/pipeline.md`: Updated JD extraction step with retry, CAPTCHA detection, and session import reference

#### Success Criteria

- [ ] JD extraction step (currently step 2b, line 10-11) includes retry: "If navigate/snapshot fails, retry up to 3 times per browser-session.md retry policy"
- [ ] CAPTCHA detection added: "If CAPTCHA detected in snapshot, mark as `- [!]` with note 'CAPTCHA -- requires manual resolution' and continue to next URL (or stop if `captcha_strategy: stop`)"
- [ ] Session handling mentioned: "For portals with `requires_login: true` in portals.yml, load session from `data/sessions/<portal>.json` per browser-session.md"
- [ ] Cookie banner dismissal added after navigate step
- [ ] Reference to `modes/browser-session.md` added
- [ ] Existing pipeline.md content preserved (special cases like LinkedIn [!] marker)

#### Verification

**Level:** ✅ Single Judge
**Artifact:** `modes/pipeline.md`
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Retry Logic Added | 0.20 | JD extraction retry up to 3 times per browser-session.md retry policy |
| CAPTCHA Detection Added | 0.20 | CAPTCHA detected -> [!] marking with captcha_strategy respect |
| Session Handling Added | 0.20 | requires_login portals load session from data/sessions/ |
| Non-Regression | 0.25 | LinkedIn [!] marker, local: prefix, all special cases preserved |
| Reference Quality | 0.15 | browser-session.md referenced appropriately |

**Reference Pattern:** `modes/browser-session.md` retry and CAPTCHA sections

#### Subtasks

- [ ] Read current `modes/pipeline.md` at `C:/Projetos/Carrer Ops/modes/pipeline.md`
- [ ] Add retry logic to step 2b (JD extraction via Playwright)
- [ ] Add CAPTCHA detection and `[!]` marking between steps 2b and 2c
- [ ] Add cookie banner dismissal after navigate
- [ ] Add session import reference for authenticated portals
- [ ] Add reference to browser-session.md
- [ ] Verify existing content preserved (LinkedIn special case, `local:` prefix, etc.)

**Complexity**: Small
**Uncertainty**: Low
**Blockers**: Step 4 (browser-session.md) must exist
**Risks**: None significant.
**Integration Points**: References browser-session.md. German mirror `de/pipeline.md` will need matching update in Step 10.

---

### Step 7: Update auto-pipeline.md with Obstacle Dismissal and CAPTCHA HITL

**Model:** opus
**Agent:** sdd:developer
**Depends on:** Step 4
**Parallel with:** Step 5, Step 6, Step 8

**Goal**: Add obstacle dismissal in Paso 0 (JD extraction from URL) and CAPTCHA HITL detection to `modes/auto-pipeline.md`.

#### Expected Output

- `modes/auto-pipeline.md`: Updated Paso 0 with obstacle check and CAPTCHA detection

#### Success Criteria

- [ ] Paso 0 Playwright section (lines 11-13) includes obstacle check: "After browser_snapshot, check for cookie banners/popups per browser-session.md; dismiss before reading JD"
- [ ] CAPTCHA detection added to Paso 0: "If CAPTCHA detected, stop and notify user per browser-session.md CAPTCHA protocol"
- [ ] Retry logic added for URL extraction failure
- [ ] Reference to `modes/browser-session.md` added
- [ ] Existing auto-pipeline.md content preserved (all 5 Pasos, Section G logic, tone framework)

#### Verification

**Level:** ✅ Single Judge
**Artifact:** `modes/auto-pipeline.md`
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Obstacle Check Added | 0.25 | Paso 0 includes obstacle dismissal after browser_snapshot |
| CAPTCHA Detection Added | 0.25 | CAPTCHA detected -> HITL stop in Paso 0 per browser-session.md |
| Non-Regression | 0.30 | All 5 Pasos, Section G logic, tone framework preserved intact |
| Reference Quality | 0.20 | browser-session.md referenced appropriately |

**Reference Pattern:** `modes/browser-session.md` obstacle and CAPTCHA sections

#### Subtasks

- [ ] Read current `modes/auto-pipeline.md` at `C:/Projetos/Carrer Ops/modes/auto-pipeline.md`
- [ ] Add obstacle dismissal step to Paso 0 after browser_snapshot
- [ ] Add CAPTCHA detection and HITL stop to Paso 0
- [ ] Add retry logic for extraction failure
- [ ] Add reference to browser-session.md
- [ ] Verify all existing content preserved

**Complexity**: Small
**Uncertainty**: Low
**Blockers**: Step 4 (browser-session.md) must exist
**Risks**: None significant.
**Integration Points**: References browser-session.md. No separate German mirror for auto-pipeline.md.

---

### Step 8: Major Rewrite of apply.md for Active Browser Interaction

**Model:** opus
**Agent:** sdd:developer
**Depends on:** Step 4
**Parallel with:** Step 5, Step 6, Step 7

**Goal**: Transform `modes/apply.md` from a passive screenshot-reading assistant to an active browser interaction workflow with decision loop, form filling via Playwright tools, obstacle handling, and mandatory submission gate.

#### Expected Output

- `modes/apply.md`: Rewritten workflow with active browser interaction, decision loop for form analysis, browser_fill_form/browser_click/browser_type calls, HITL submission gate, and action logging

#### Success Criteria

- [ ] Paso 1 (Detectar) updated: uses browser_snapshot actively (not just reading screenshots); includes obstacle dismissal from browser-session.md
- [ ] Paso 4 (Analizar preguntas) updated: uses decision loop to identify ALL form fields via successive snapshots + scrolling via browser_evaluate
- [ ] New step added between Paso 5 and Paso 6: "Fill Form Fields" using browser_fill_form, browser_type, browser_click for dropdowns; each fill followed by re-snapshot to verify
- [ ] Scroll handling (currently Paso 6 "ask user to scroll") replaced: agent uses browser_evaluate for scroll + re-snapshot; manual fallback preserved if browser_evaluate fails
- [ ] Submission Gate (CRITICAL) explicitly documented: before any click that could trigger form submission, agent MUST stop, present all filled fields summary, and wait for user "go" or "abort"
- [ ] CAPTCHA detection integrated: if CAPTCHA appears during form fill, stop immediately per browser-session.md
- [ ] 2FA detection integrated: if 2FA prompt appears, stop per browser-session.md
- [ ] Session import added: for portals with `requires_login: true`, load session from data/sessions/ before navigating
- [ ] Action logging integrated: every form field fill, every click, every obstacle dismissal logged per browser-session.md NDJSON schema
- [ ] Partial form preservation: on any interruption (CAPTCHA, 2FA, error), action log records all filled fields and values for resumption
- [ ] Reference to `modes/browser-session.md` added prominently
- [ ] "Sin Playwright" fallback preserved: the existing manual/screenshot workflow remains as a fallback when Playwright is unavailable
- [ ] Paso 6 (Post-apply) preserved: tracker update logic unchanged

#### Verification

**Level:** ✅ CRITICAL - Panel of 2 Judges with Aggregated Voting
**Artifact:** `modes/apply.md`
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Submission Gate (CRITICAL) | 0.25 | Mandatory HITL stop before Submit/Apply/Send; filled-fields summary presented; user "go"/"abort" flow |
| Active Browser Workflow | 0.20 | Decision loop with browser_fill_form/click/type calls, each followed by re-snapshot verification |
| Safety Integrations | 0.15 | CAPTCHA detection, 2FA detection, session expiry handling all integrated into workflow |
| Passive Fallback Preserved | 0.15 | "Sin Playwright" section fully preserved as fallback when Playwright unavailable |
| Non-Regression | 0.10 | Paso 6 (Post-apply) tracker update logic unchanged |
| Action Logging | 0.10 | Every action logged per NDJSON schema; partial form preservation on interruption |
| Reference Quality | 0.05 | browser-session.md referenced prominently at top of file |

**Reference Pattern:** `modes/browser-session.md` (all sections); existing `modes/apply.md` "Sin Playwright" section

#### Subtasks

- [ ] Read current `modes/apply.md` at `C:/Projetos/Carrer Ops/modes/apply.md`
- [ ] Rewrite "Requisitos" section to emphasize Playwright-first with manual fallback
- [ ] Rewrite Paso 1 (Detectar) with active browser_snapshot + obstacle dismissal + session import
- [ ] Update Paso 4 (Analizar preguntas) with decision loop: snapshot -> identify fields -> scroll -> re-snapshot -> repeat until all fields found
- [ ] Add new workflow step: "Fill Form Fields" with browser_fill_form/browser_type/browser_click calls, each followed by verification re-snapshot
- [ ] Replace scroll handling with browser_evaluate scroll + re-snapshot pattern; keep manual fallback
- [ ] Add Submission Gate step with explicit HITL stop, filled-fields summary, user confirmation
- [ ] Integrate CAPTCHA and 2FA detection at any point during the form fill loop
- [ ] Add session import from data/sessions/ at the start of the workflow
- [ ] Add action logging references throughout the workflow
- [ ] Add partial form preservation note for interruption scenarios
- [ ] Add reference to browser-session.md at the top of the file
- [ ] Verify "Sin Playwright" fallback and Paso 6 (Post-apply) are preserved
- [ ] Review full rewritten file for consistency with browser-session.md patterns

**Complexity**: Large (major rewrite of the most complex mode file)
**Uncertainty**: Medium -- the existing passive workflow must be carefully preserved as fallback while adding active interaction
**Blockers**: Step 4 (browser-session.md) must exist
**Risks**:
- Breaking the existing passive workflow. Mitigation: preserve "Sin Playwright" section explicitly.
- Scroll handling via browser_evaluate may fail on portals that block JS injection. Mitigation: keep manual fallback.
- HITL boundary timing -- stopping on wrong page could confuse user. Mitigation: re-snapshot before any submission-related click.
**Integration Points**: References browser-session.md. German mirror `de/bewerben.md` will need matching rewrite in Step 11.

---

### Step 9: Update de/_shared.md (German Mirror)

**Model:** sonnet
**Agent:** sonnet
**Depends on:** Step 3
**Parallel with:** Step 4 (Step 9 only needs Step 3, not Step 4)

**Goal**: Mirror the _shared.md changes (new browser tools in Tools table, HITL boundary rules) into the German language version.

#### Expected Output

- `modes/de/_shared.md`: Updated with German translations of new tools and HITL rules matching Step 3 changes

#### Success Criteria

- [ ] Tools table (around line 191-201) includes same browser tool calls as EN version, with German usage descriptions
- [ ] Playwright constraint "NIEMALS 2+ Agenten parallel mit Playwright" preserved
- [ ] HITL boundary rules section added in German, matching EN content from Step 3
- [ ] Reference to `modes/browser-session.md` added (browser-session.md stays in English -- single reference)
- [ ] No existing de/_shared.md content modified or removed

#### Verification

**Level:** ✅ Single Judge
**Artifact:** `modes/de/_shared.md`
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Translation Accuracy | 0.30 | German translations match EN content from Step 3 in meaning and completeness |
| Tool Table Completeness | 0.25 | Same 4 browser tools as EN version with German usage descriptions |
| Constraint Preservation | 0.20 | "NIEMALS 2+ Agenten parallel mit Playwright" preserved |
| Non-Regression | 0.15 | No existing de/_shared.md content modified or removed |
| Reference Quality | 0.10 | browser-session.md referenced (EN path, not translated) |

**Reference Pattern:** Finalized `modes/_shared.md` (EN source from Step 3)

#### Subtasks

- [ ] Read current `modes/de/_shared.md` at `C:/Projetos/Carrer Ops/modes/de/_shared.md`
- [ ] Read finalized `modes/_shared.md` to get exact EN content to mirror
- [ ] Translate new browser tool entries from EN _shared.md to German
- [ ] Translate HITL boundary rules to German
- [ ] Add reference to browser-session.md (EN, not translated)
- [ ] Verify existing content preserved

**Complexity**: Small
**Uncertainty**: Low
**Blockers**: Step 3 (_shared.md EN) must be finalized
**Risks**: Translation quality. Mitigation: follow existing German style in de/_shared.md (natural Tech-German, no forced translations of technical terms).
**Integration Points**: Mirrors EN _shared.md.

---

### Step 10: Update de/pipeline.md (German Mirror)

**Model:** sonnet
**Agent:** sonnet
**Depends on:** Step 6
**Parallel with:** Step 11 (both are German mirrors, but with different dependencies)

**Goal**: Mirror the pipeline.md changes (retry chain, CAPTCHA detection, session handling, cookie banner dismissal) into the German language version.

#### Expected Output

- `modes/de/pipeline.md`: Updated with German translations of new pipeline patterns matching Step 6 changes

#### Success Criteria

- [ ] JD extraction step includes retry logic in German
- [ ] CAPTCHA detection and `[!]` marking added in German
- [ ] Cookie banner dismissal added in German
- [ ] Session import reference added
- [ ] Reference to `modes/browser-session.md` added
- [ ] Existing de/pipeline.md content preserved (StepStone/XING/kununu cookie banner note, Bundesagentur note)

#### Verification

**Level:** ✅ Single Judge
**Artifact:** `modes/de/pipeline.md`
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Translation Accuracy | 0.30 | German translations match EN pipeline.md changes from Step 6 |
| Feature Completeness | 0.25 | Retry, CAPTCHA [!] marking, cookie banner dismissal, session import all present in German |
| Non-Regression | 0.25 | StepStone/XING/kununu cookie banner note, Bundesagentur note preserved |
| Reference Quality | 0.10 | browser-session.md referenced |
| Style Consistency | 0.10 | Natural Tech-German, consistent with existing de/ file style |

**Reference Pattern:** Finalized `modes/pipeline.md` (EN source from Step 6)

#### Subtasks

- [ ] Read current `modes/de/pipeline.md` at `C:/Projetos/Carrer Ops/modes/de/pipeline.md`
- [ ] Read finalized `modes/pipeline.md` to get exact EN content to mirror
- [ ] Translate retry, CAPTCHA, cookie banner, and session changes from EN pipeline.md to German
- [ ] Add reference to browser-session.md
- [ ] Verify existing content preserved

**Complexity**: Small
**Uncertainty**: Low
**Blockers**: Step 6 (pipeline.md EN) must be finalized
**Risks**: None significant.
**Integration Points**: Mirrors EN pipeline.md.

---

### Step 11: Update de/bewerben.md (German Mirror)

**Model:** sonnet
**Agent:** sonnet
**Depends on:** Step 8
**Parallel with:** Step 10 (both are German mirrors, but with different dependencies)

**Goal**: Mirror the apply.md major rewrite into the German language version, transforming `de/bewerben.md` from passive to active browser interaction with all HITL gates.

#### Expected Output

- `modes/de/bewerben.md`: Rewritten to match apply.md changes from Step 8, in German

#### Success Criteria

- [ ] All workflow changes from Step 8 reflected in German: active browser interaction, decision loop, form filling, submission gate, CAPTCHA/2FA detection
- [ ] Scroll handling updated to match EN version (browser_evaluate + manual fallback)
- [ ] Submission Gate explicitly documented in German with HITL stop
- [ ] German-specific form fields section preserved (Gehaltsvorstellung, Eintrittsdatum, Arbeitserlaubnis, Sprachkenntnisse, Anrede)
- [ ] Reference to `modes/browser-session.md` added
- [ ] "Ohne Playwright" fallback preserved
- [ ] Schritt 6 (Nach dem Absenden) preserved

#### Subtasks

- [ ] Read current `modes/de/bewerben.md` at `C:/Projetos/Carrer Ops/modes/de/bewerben.md`
- [ ] Read finalized `modes/apply.md` to get exact EN content to mirror
- [ ] Rewrite Schritt 1 (Erkennen) with active browser interaction in German
- [ ] Update Schritt 4 (Analysieren) with decision loop in German
- [ ] Add form fill step with browser tools in German
- [ ] Replace scroll handling with browser_evaluate pattern in German
- [ ] Add Submission Gate (Absendetor) in German with HITL stop
- [ ] Add CAPTCHA/2FA detection in German
- [ ] Preserve German-specific form fields section
- [ ] Add reference to browser-session.md
- [ ] Verify "Ohne Playwright" fallback and Schritt 6 preserved

#### Verification

**Level:** ✅ Single Judge
**Artifact:** `modes/de/bewerben.md`
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Submission Gate in German | 0.25 | Absendetor/HITL stop explicitly documented with mandatory stop before Absenden/Bewerben |
| Feature Completeness | 0.25 | All Step 8 workflow changes reflected: decision loop, browser tools, CAPTCHA/2FA detection |
| German-Specific Preservation | 0.20 | Gehaltsvorstellung, Eintrittsdatum, Arbeitserlaubnis, Sprachkenntnisse, Anrede sections preserved |
| Passive Fallback Preserved | 0.15 | "Ohne Playwright" section fully preserved as fallback |
| Non-Regression | 0.15 | Schritt 6 (Nach dem Absenden) tracker update preserved |

**Reference Pattern:** Finalized `modes/apply.md` (EN source from Step 8)

**Complexity**: Medium
**Uncertainty**: Low -- translating finalized EN content
**Blockers**: Step 8 (apply.md EN) must be finalized
**Risks**: German-specific content (salary format, form field naming) must not be lost. Mitigation: explicitly check Gehaltsvorstellung, Eintrittsdatum, Anrede sections.
**Integration Points**: Mirrors EN apply.md.

---

### Step 12: Manual Verification Against Portal Types

**Model:** opus
**Agent:** sdd:qa-engineer
**Depends on:** Steps 1-11 (all previous steps)
**Parallel with:** None (final step)

**Goal**: Verify the complete browser autonomy enhancement works correctly by reviewing all documentation for consistency and defining manual test scenarios for at least 3 different portal types.

#### Expected Output

- Verification checklist document or section confirming all acceptance criteria pass
- At least 4 manual test scenarios defined and ready for execution

#### Success Criteria

- [ ] All 14 functional acceptance criteria from the task file verified against the documentation (each criterion traceable to specific section in browser-session.md and/or mode files)
- [ ] All 4 non-functional requirements verified
- [ ] Cross-reference check: every mode file that references browser-session.md uses consistent terminology
- [ ] Cross-reference check: CLAUDE.md governance rules are not contradicted by any mode file
- [ ] Cross-reference check: _shared.md tools table matches the tool calls used in mode files
- [ ] Cross-reference check: German mirrors match their EN counterparts in structure and coverage
- [ ] Manual test scenario 1: Scan a portal with a cookie banner (e.g., StepStone) -- verify scan.md obstacle dismissal pattern
- [ ] Manual test scenario 2: Navigate to a LinkedIn URL requiring login -- verify pipeline.md [!] marking and HITL escalation
- [ ] Manual test scenario 3: Run apply mode on a form -- verify form fill workflow, scroll handling, and submission gate
- [ ] Manual test scenario 4: Simulate CAPTCHA detection -- verify immediate stop and user notification
- [ ] No regressions: existing portal scanning and offer verification logic unchanged
- [ ] Action log NDJSON schema is consistent across all references

#### Verification

**Level:** ✅ Single Judge
**Artifact:** Verification checklist document and test scenarios
**Threshold:** 4.0/5.0

**Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Acceptance Criteria Traceability | 0.25 | All 14 functional + 4 non-functional criteria traced to specific file sections |
| Cross-Reference Consistency | 0.25 | Terminology, tool names, HITL rules consistent across all EN and DE files |
| Test Scenario Quality | 0.20 | 4 scenarios cover different portal types (cookie banner, login wall, form fill, CAPTCHA) with expected behavior |
| German Mirror Accuracy | 0.15 | DE files match EN counterparts in structure and coverage |
| NDJSON Schema Consistency | 0.15 | Action log schema consistent between browser-session.md and Architecture Overview contract |

#### Subtasks

- [ ] Read all modified/created EN files and verify internal cross-references
- [ ] Read all modified DE files and verify they mirror EN content
- [ ] Trace each of the 14 functional acceptance criteria to specific documentation sections
- [ ] Trace each of the 4 non-functional requirements to specific documentation sections
- [ ] Document 4 manual test scenarios with expected behavior
- [ ] Verify no regressions in existing scan.md, pipeline.md, auto-pipeline.md workflows
- [ ] Verify NDJSON action log schema is consistent in browser-session.md and Architecture Overview contract

**Complexity**: Medium
**Uncertainty**: Low -- verification of completed work
**Blockers**: All previous steps must be complete
**Risks**: Discovering inconsistencies that require revisiting earlier steps. Mitigation: incremental review during each step's DoD.
**Integration Points**: Validates all components together.

---

## Implementation Summary

| Step | Goal | Key Output | Agent | Model | Depends on | Parallel with | Effort |
|------|------|------------|-------|-------|------------|---------------|--------|
| 1 | Config foundations | `.gitignore`, `portals.example.yml` | haiku | haiku | None | 2, 3 | S |
| 2 | CLAUDE.md governance | Browser Autonomy section | sdd:developer | opus | None | 1, 3 | S |
| 3 | _shared.md tools/rules | Tools table + HITL rules | sdd:developer | opus | None | 1, 2 | S |
| 4 | browser-session.md (NEW) | Central reference file (~200-300 lines) | sdd:developer | opus | 2, 3 | 9 | L |
| 5 | scan.md obstacle + retry | Updated Nivel 1 workflow | sdd:developer | opus | 4 | 6, 7, 8 | S |
| 6 | pipeline.md retry + CAPTCHA | Updated JD extraction | sdd:developer | opus | 4 | 5, 7, 8 | S |
| 7 | auto-pipeline.md obstacles | Updated Paso 0 | sdd:developer | opus | 4 | 5, 6, 8 | S |
| 8 | apply.md active interaction | Full browser workflow + HITL | sdd:developer | opus | 4 | 5, 6, 7 | L |
| 9 | de/_shared.md | German tools + HITL rules | sonnet | sonnet | 3 | 4 | S |
| 10 | de/pipeline.md | German retry + CAPTCHA | sonnet | sonnet | 6 | 11 | S |
| 11 | de/bewerben.md | German active apply workflow | sonnet | sonnet | 8 | 10 | M |
| 12 | Verification | Checklist + test scenarios | sdd:qa-engineer | opus | 1-11 | None | M |

**Total Steps**: 12 (no merges needed -- each step produces distinct artifacts)
**Critical Path**: Steps 2+3 (parallel) -> Step 4 -> Step 8 -> Step 11 -> Step 12
**Max Parallel Depth**: 4 steps simultaneously (Steps 5, 6, 7, 8 after Step 4)
**Key Optimization**: Step 9 (de/_shared.md) MUST start after Step 3, parallel with Step 4 -- does NOT need to wait for browser-session.md

---

## Verification Summary

| Step | Verification Level | Judges | Threshold | Artifacts |
|------|-------------------|--------|-----------|-----------|
| 1 | ❌ None | - | - | .gitignore, portals.example.yml |
| 2 | ✅ Panel (2) | 2 | 4.0/5.0 | CLAUDE.md governance section |
| 3 | ✅ Panel (2) | 2 | 4.0/5.0 | _shared.md tools + HITL rules |
| 4 | ✅ Panel (2) | 2 | 4.0/5.0 | browser-session.md (NEW central reference) |
| 5 | ✅ Single Judge | 1 | 4.0/5.0 | scan.md obstacle + retry |
| 6 | ✅ Single Judge | 1 | 4.0/5.0 | pipeline.md retry + CAPTCHA |
| 7 | ✅ Single Judge | 1 | 4.0/5.0 | auto-pipeline.md obstacles |
| 8 | ✅ Panel (2) | 2 | 4.0/5.0 | apply.md major rewrite + submission gate |
| 9 | ✅ Single Judge | 1 | 4.0/5.0 | de/_shared.md German mirror |
| 10 | ✅ Single Judge | 1 | 4.0/5.0 | de/pipeline.md German mirror |
| 11 | ✅ Single Judge | 1 | 4.0/5.0 | de/bewerben.md German mirror |
| 12 | ✅ Single Judge | 1 | 4.0/5.0 | Verification checklist + test scenarios |

**Total Evaluations:** 15
**Implementation Command:** `/implement C:/Projetos/Carrer Ops/.specs/tasks/draft/browser-autonomy.feature.md`

---

## Risks & Blockers Summary

### High Priority

| Risk/Blocker | Impact | Likelihood | Mitigation |
|--------------|--------|------------|------------|
| apply.md rewrite breaks passive workflow | High | Medium | Preserve "Sin Playwright" section explicitly; test both paths |
| Shared Playwright instance -- new loops must stay sequential | High | Low | Reinforce constraint in _shared.md and browser-session.md; never document parallel browser calls |
| HITL boundary timing -- agent stops on wrong page | High | Medium | Re-snapshot before any submission-related action; document explicitly in browser-session.md |
| portals.yml is user-layer -- cannot auto-deploy new fields | Medium | High (certain) | Document clearly in portals.example.yml; add migration note to CLAUDE.md |
| German mirrors drift from EN content | Medium | Medium | Each step that modifies EN has a corresponding DE step; verify in Step 12 |
| browser_evaluate for scroll may be blocked by some portals | Low | Low | Keep manual fallback ("ask user to scroll") in apply.md |

---

## Definition of Done (Task Level)

- [ ] All 12 implementation steps completed
- [ ] All 14 functional acceptance criteria verified (traceable to documentation sections)
- [ ] All 4 non-functional requirements verified
- [ ] modes/browser-session.md created with all required sections
- [ ] CLAUDE.md, _shared.md, scan.md, apply.md, pipeline.md, auto-pipeline.md updated
- [ ] German mirrors (de/_shared.md, de/bewerben.md, de/pipeline.md) updated
- [ ] templates/portals.example.yml and .gitignore updated
- [ ] Cross-reference consistency verified across all files
- [ ] No regressions in existing portal scanning or offer verification
- [ ] 4 manual test scenarios defined and documented
- [ ] Action log NDJSON schema consistent across all references
