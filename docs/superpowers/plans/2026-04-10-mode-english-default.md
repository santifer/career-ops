# English-Default Mode Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make root `modes/` the canonical English prompt set, move current Spanish root prompts into `modes/esp/`, and preserve Spanish command compatibility via aliases.

**Architecture:** The change is content-first and routing-aware. Prompt files are reorganized first, then the router and command wrappers are updated to resolve English canonical names while accepting Spanish aliases. Docs and validation files are updated last so the repository reflects the new layout consistently.

**Tech Stack:** Markdown prompt files, YAML-free file moves, regex-based repo updates, Node.js verification scripts

---

### Task 1: Add the internal docs

**Files:**
- Create: `docs/superpowers/specs/2026-04-10-mode-english-default-design.md`
- Create: `docs/superpowers/plans/2026-04-10-mode-english-default.md`

- [ ] **Step 1: Write the docs**

Create the design doc and this implementation plan with the approved rename map, compatibility rules, and verification strategy.

- [ ] **Step 2: Verify the docs exist**

Run: `find docs/superpowers -maxdepth 3 -type f | sort`
Expected: both files appear in the output

### Task 2: Preserve the current Spanish root prompts

**Files:**
- Create: `modes/esp/`
- Create: `modes/esp/apply.md`
- Create: `modes/esp/auto-pipeline.md`
- Create: `modes/esp/batch.md`
- Create: `modes/esp/contacto.md`
- Create: `modes/esp/deep.md`
- Create: `modes/esp/oferta.md`
- Create: `modes/esp/ofertas.md`
- Create: `modes/esp/pdf.md`
- Create: `modes/esp/pipeline.md`
- Create: `modes/esp/project.md`
- Create: `modes/esp/scan.md`
- Create: `modes/esp/tracker.md`
- Create: `modes/esp/training.md`

- [ ] **Step 1: Copy current Spanish root content into `modes/esp/`**

Preserve the current root file content exactly for the Spanish versions.

- [ ] **Step 2: Verify the Spanish folder**

Run: `find modes/esp -maxdepth 1 -type f | sort`
Expected: all moved Spanish prompt files are present

### Task 3: Establish the English canonical root files

**Files:**
- Create: `modes/offer.md`
- Create: `modes/compare.md`
- Create: `modes/outreach.md`
- Modify: `modes/apply.md`
- Modify: `modes/auto-pipeline.md`
- Modify: `modes/batch.md`
- Modify: `modes/deep.md`
- Modify: `modes/pdf.md`
- Modify: `modes/pipeline.md`
- Modify: `modes/project.md`
- Modify: `modes/scan.md`
- Modify: `modes/tracker.md`
- Modify: `modes/training.md`
- Delete: `modes/oferta.md`
- Delete: `modes/ofertas.md`
- Delete: `modes/contacto.md`

- [ ] **Step 1: Translate the canonical root prompts into English**

Translate file contents, headings, workflow steps, and examples while preserving behavior.

- [ ] **Step 2: Rename the canonical Spanish filenames to English**

Replace `oferta.md`, `ofertas.md`, and `contacto.md` with `offer.md`, `compare.md`, and `outreach.md`.

- [ ] **Step 3: Verify root mode layout**

Run: `find modes -maxdepth 1 -type f | sort`
Expected: English canonical files are present and the old Spanish-only canonical filenames are gone

### Task 4: Update routing and command wrappers

**Files:**
- Modify: `.claude/skills/career-ops/SKILL.md`
- Modify: `.opencode/commands/career-ops-evaluate.md`
- Modify: `.opencode/commands/career-ops-compare.md`
- Modify: `.opencode/commands/career-ops-contact.md`
- Modify: `.opencode/commands/career-ops.md`
- Modify: `docs/CODEX.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Make English names canonical in routing**

Update mode routing tables and context-loading references to point to `offer`, `compare`, and `outreach`.

- [ ] **Step 2: Keep Spanish aliases**

Ensure `oferta`, `ofertas`, and `contacto` still resolve to the new canonical mode names.

- [ ] **Step 3: Verify routing references**

Run: `rg -n "career-ops (oferta|ofertas|contacto)|modes/(oferta|ofertas|contacto)\\.md" .claude .opencode CLAUDE.md docs -S`
Expected: only alias documentation or Spanish-folder references remain

### Task 5: Update docs, manifests, and tests

**Files:**
- Modify: `DATA_CONTRACT.md`
- Modify: `README.md`
- Modify: `README.es.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `test-all.mjs`
- Modify: `update-system.mjs`
- Modify: `interview-prep/story-bank.md`

- [ ] **Step 1: Replace canonical root references**

Update references from old root Spanish filenames to English canonical filenames.

- [ ] **Step 2: Preserve Spanish-language docs where needed**

Where docs describe localized behavior, point Spanish references at `modes/esp/`.

- [ ] **Step 3: Verify no stale canonical references remain**

Run: `rg -n "modes/oferta\\.md|modes/ofertas\\.md|modes/contacto\\.md" . -g '!modes/esp/*' -g '!node_modules' -S`
Expected: no stale canonical root references remain

### Task 6: Full verification

**Files:**
- Test: `test-all.mjs`

- [ ] **Step 1: Run repo verification**

Run: `npm run verify`
Expected: exit code 0

- [ ] **Step 2: Run the repo smoke test**

Run: `node test-all.mjs`
Expected: exit code 0

- [ ] **Step 3: Inspect the diff**

Run: `git diff --stat`
Expected: shows the new `modes/esp/` files, English canonical mode updates, and routing/docs/test changes
