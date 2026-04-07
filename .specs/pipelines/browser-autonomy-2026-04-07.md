# Pipeline Execution Spec: Browser Autonomy Enhancement

**Date**: 2026-04-07
**Task**: `.specs/tasks/todo/browser-autonomy.feature.md`
**Status**: Spec generated, ready for execution

---

## Pipeline Loadout

| # | Skill | Plugin | Invocation | Moment | Est. | Gate |
|---|-------|--------|------------|--------|------|------|
| 1 | sdd:brainstorm | sdd | `Skill('sdd:brainstorm')` | Clarification | ~10min | Spec produced with autonomy requirements per mode |
| 2 | superpowers:writing-plans | superpowers | `Skill('superpowers:writing-plans')` | Planning | ~15min | Written plan with architecture, decision loop, cookie layer, flow runner |
| 3 | setup-browser-cookies | global | `Skill('setup-browser-cookies')` | Implementation | ~10min | Cookies imported from Chrome, authenticated session verified |
| 4 | feature-dev:feature-dev | feature-dev | `Skill('feature-dev:feature-dev')` | Implementation | ~40min | All 12 implementation steps from task spec executed |
| 5 | webapp-testing | global | `Skill('webapp-testing')` | Quality | ~15min | E2E validation against real portal, screenshot diffs pass |

## Phase Details

### Phase 1: Clarification (sdd:brainstorm)

**Prompt**: Refine autonomy requirements for career-ops browser navigation. Define what "autonomous" means for each mode (scan, apply, evaluate, pipeline). Identify failure modes (CAPTCHA, 2FA, session expiry). Clarify HITL boundaries. Use task spec at `.specs/tasks/todo/browser-autonomy.feature.md` as input.

**Input**: Task spec, CLAUDE.md, modes/*.md
**Output**: Refined requirements document with per-mode autonomy definitions
**Gate**: Requirements cover all 5 capability areas from task spec

### Phase 2: Planning (superpowers:writing-plans)

**Prompt**: Create implementation plan for browser autonomy enhancement based on task spec at `.specs/tasks/todo/browser-autonomy.feature.md`. Plan must cover: browser-session.md creation, mode file updates (scan, apply, pipeline, auto-pipeline), cookie management, HITL gates, action logging. Follow the 12-step decomposition in the task spec.

**Input**: Task spec (with architecture and implementation steps), skill file
**Output**: Executable plan with file-level changes
**Gate**: Plan covers all 12 implementation steps from task spec

### Phase 3: Cookie Setup (setup-browser-cookies)

**Prompt**: Import cookies from user's Chrome browser to establish authenticated sessions for job portals. Save storageState JSON to `data/sessions/`. Test with at least one portal.

**Input**: User's Chrome browser session
**Output**: `data/sessions/<portal>.json` files with valid cookies
**Gate**: At least one portal session verified as authenticated

### Phase 4: Implementation (feature-dev:feature-dev)

**Prompt**: Implement browser autonomy enhancement following task spec at `.specs/tasks/todo/browser-autonomy.feature.md`. Execute all 12 implementation steps in the parallelized order defined in the spec. Key deliverables: modes/browser-session.md (new), updates to CLAUDE.md, modes/_shared.md, scan.md, apply.md, pipeline.md, auto-pipeline.md. German mirrors for de/ directory.

**Input**: Task spec, skill file, analysis file, plan from Phase 2
**Output**: All mode files created/updated per spec
**Gate**: All 14 acceptance criteria addressed, HITL gates in place

### Phase 5: Quality (webapp-testing)

**Prompt**: Validate browser autonomy flows against a real job portal. Test: decision loop execution, cookie-authenticated navigation, obstacle dismissal (cookie banners), HITL gate triggers, action logging. Use Playwright MCP tools.

**Input**: Updated mode files, cookie sessions
**Output**: Test report with pass/fail per acceptance criterion
**Gate**: All functional acceptance criteria verified

---

## Artifacts

| Artifact | Path |
|----------|------|
| Task Spec | `.specs/tasks/todo/browser-autonomy.feature.md` |
| Skill | `.claude/skills/playwright-mcp-autonomy/SKILL.md` |
| Analysis | `.specs/analysis/analysis-browser-autonomy.md` |
| Pipeline Spec | `.specs/pipelines/browser-autonomy-2026-04-07.md` |

## Quality Gates Summary (from sdd:plan)

| Phase | Score | Verdict |
|-------|-------|---------|
| 2a: Research | 3.20/5.0 | PROCEEDED (max iter) |
| 2b: Codebase Analysis | 3.85/5.0 | PASS |
| 2c: Business Analysis | 3.85/5.0 | PASS |
| 3: Architecture | 3.55/5.0 | PASS |
| 4: Decomposition | 3.50/5.0 | PASS |
| 5: Parallelization | 3.80/5.0 | PASS |
| 6: Verifications | 3.80/5.0 | PASS |
