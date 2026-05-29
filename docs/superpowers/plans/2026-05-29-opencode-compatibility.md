# OpenCode Full Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenCode a first-class citizen alongside Claude Code with platform-specific SKILLs, a native command, and accurate documentation.

**Architecture:** Split the shared SKILL.md into platform-specific versions (`.claude/skills/` for Claude Code, `.opencode/skills/` for OpenCode). Create a single `/career-ops` command for OpenCode. Update all docs to be platform-agnostic.

**Tech Stack:** Markdown (SKILLs, commands, docs), YAML frontmatter

---

## Task 1: Create OpenCode SKILL.md

**Files:**
- Create: `.opencode/skills/career-ops/SKILL.md`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p .opencode/skills/career-ops
```

Run: `ls .opencode/skills/career-ops/`
Expected: empty directory

- [ ] **Step 2: Write OpenCode-specific SKILL.md**

Create `.opencode/skills/career-ops/SKILL.md` with the following content:

```markdown
---
name: career-ops
description: AI job search command center -- evaluate offers, generate CVs, scan portals, track applications
license: MIT
---

# career-ops -- Router

## Mode Routing

Determine the mode from `$ARGUMENTS`:

| Input | Mode |
|-------|------|
| (empty / no args) | `discovery` -- Show command menu |
| JD text or URL (no sub-command) | **`auto-pipeline`** |
| `oferta` | `oferta` |
| `ofertas` | `ofertas` |
| `contacto` | `contacto` |
| `deep` | `deep` |
| `interview-prep` | `interview-prep` |
| `pdf` | `pdf` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |
| `patterns` | `patterns` |
| `followup` | `followup` |
| `update` | `update` |

**Auto-pipeline detection:** If `$ARGUMENTS` is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for", company name + role) or a URL to a JD, execute `auto-pipeline`.

If `$ARGUMENTS` is not a sub-command AND doesn't look like a JD, show discovery.

---

## Discovery Mode (no arguments)

Show this menu:

```
career-ops -- Command Center

Available commands:
  /career-ops {JD}      → AUTO-PIPELINE: evaluate + report + PDF + tracker (paste text or URL)
  /career-ops pipeline  → Process pending URLs from inbox (data/pipeline.md)
  /career-ops oferta    → Evaluation only A-F (no auto PDF)
  /career-ops ofertas   → Compare and rank multiple offers
  /career-ops contacto  → LinkedIn power move: find contacts + draft message
  /career-ops deep      → Deep research prompt about company
  /career-ops interview-prep → Generate company-specific interview prep doc
  /career-ops pdf       → PDF only, ATS-optimized CV
  /career-ops training  → Evaluate course/cert against North Star
  /career-ops project   → Evaluate portfolio project idea
  /career-ops tracker   → Application status overview
  /career-ops apply     → Live application assistant (reads form + generates answers)
  /career-ops scan      → Scan portals and discover new offers
  /career-ops batch     → Batch processing with parallel workers
  /career-ops patterns  → Analyze rejection patterns and improve targeting
  /career-ops followup  → Follow-up cadence tracker: flag overdue, generate drafts
  /career-ops update    → Update career-ops system files with diff preview + compat check

Inbox: add URLs to data/pipeline.md → /career-ops pipeline
Or paste a JD directly to run the full pipeline.
```

---

## Context Loading by Mode

After determining the mode, load the necessary files before executing:

### Modes that require `_shared.md` + their mode file:
Read `modes/_shared.md` + `modes/{mode}.md`

Applies to: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, `batch`

### Standalone modes (only their mode file):
Read `modes/{mode}.md`

Applies to: `tracker`, `deep`, `interview-prep`, `training`, `project`, `patterns`, `followup`

### Modes delegated to subagent:
For `scan`, `apply` (with Playwright), and `pipeline` (3+ URLs): launch as @general subagent with the content of `_shared.md` + `modes/{mode}.md` injected into the subagent prompt.

```
@general [content of modes/_shared.md]

[content of modes/{mode}.md]

[invocation-specific data]
```

Execute the instructions from the loaded mode file.
```

- [ ] **Step 3: Verify frontmatter is valid**

Run: `head -5 .opencode/skills/career-ops/SKILL.md`
Expected: valid YAML frontmatter with `name` and `description`

- [ ] **Step 4: Commit**

```bash
git add .opencode/skills/career-ops/SKILL.md
git commit -m "feat: add OpenCode-specific career-ops skill"
```

---

## Task 2: Create OpenCode Command

**Files:**
- Create: `.opencode/commands/career-ops.md`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p .opencode/commands
```

Run: `ls .opencode/commands/`
Expected: empty directory

- [ ] **Step 2: Write command file**

Create `.opencode/commands/career-ops.md` with the following content:

```markdown
---
description: AI job search command center — evaluate offers, generate CVs, scan portals, track applications
---

Read and follow the skill instructions in .opencode/skills/career-ops/SKILL.md

Mode argument: $ARGUMENTS
```

- [ ] **Step 3: Verify file content**

Run: `cat .opencode/commands/career-ops.md`
Expected: frontmatter with description, then skill reference and $ARGUMENTS

- [ ] **Step 4: Commit**

```bash
git add .opencode/commands/career-ops.md
git commit -m "feat: add OpenCode career-ops command"
```

---

## Task 3: Move Claude Code SKILL to Native Path

**Files:**
- Rename: `.agents/skills/career-ops/SKILL.md` → `.claude/skills/career-ops/SKILL.md`
- Delete: `.agents/skills/career-ops/SKILL.md` (and empty directories)

- [ ] **Step 1: Create Claude Code native directory**

```bash
mkdir -p .claude/skills/career-ops
```

Run: `ls .claude/skills/`
Expected: `career-ops/` directory

- [ ] **Step 2: Move SKILL.md to Claude Code native path**

```bash
cp .agents/skills/career-ops/SKILL.md .claude/skills/career-ops/SKILL.md
```

Run: `head -8 .claude/skills/career-ops/SKILL.md`
Expected: frontmatter with `arguments: mode` (Claude Code specific)

- [ ] **Step 3: Remove old .agents/skills path**

```bash
rm -rf .agents/skills/career-ops
rmdir .agents/skills 2>/dev/null || true
rmdir .agents 2>/dev/null || true
```

Run: `ls .agents/ 2>/dev/null || echo "directory removed"`
Expected: directory removed (or other contents remain)

- [ ] **Step 4: Verify Claude Code SKILL.md is intact**

Run: `cat .claude/skills/career-ops/SKILL.md | head -8`
Expected: same content as before the move, with `arguments: mode` frontmatter

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/career-ops/SKILL.md
git add -u .agents/skills/
git commit -m "refactor: move career-ops skill to .claude/skills/ native path"
```

---

## Task 4: Update AGENTS.md to Be Platform-Agnostic

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the "What is career-ops" section**

In `AGENTS.md`, find the line:

```
AI-powered, CLI-agnostic job search automation: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing. Runs on any AI coding CLI that follows the [open agent skill standard](https://agentskills.io) (Claude Code, Codex, Gemini, OpenCode, Qwen, Copilot, Kimi).
```

This line is already platform-agnostic. No change needed.

- [ ] **Step 2: Verify Headless / Batch Mode table**

In `AGENTS.md`, find the Headless / Batch Mode section (around line 266). Verify it already includes OpenCode:

```
| CLI | Command |
|-----|---------|
| Claude Code | `claude -p "prompt"` |
| Gemini CLI | `gemini -p "prompt"` |
| Copilot CLI | `copilot -p "prompt"` |
| Codex | `codex exec "prompt"` |
| OpenCode | `opencode run "prompt"` |
| Qwen | `qwen -p "prompt"` |
```

This is already correct. No change needed.

- [ ] **Step 3: Update the OpenCode Commands table**

In `AGENTS.md`, find the OpenCode Commands section. It currently references commands that don't exist. Update it to reflect the single command approach:

Replace:

```
### OpenCode Commands

When using [OpenCode](https://opencode.ai), the following slash commands are available (defined in `.opencode/commands/`):

| Command | Claude Code Equivalent | Description |
|---------|------------------------|-------------|
| `/career-ops` | `/career-ops` | Show menu or evaluate JD with args |
| `/career-ops-pipeline` | `/career-ops pipeline` | Process pending URLs from inbox |
| `/career-ops-evaluate` | `/career-ops oferta` | Evaluate job offer (A-F scoring) |
| `/career-ops-compare` | `/career-ops ofertas` | Compare and rank multiple offers |
| `/career-ops-contact` | `/career-ops contacto` | LinkedIn outreach (find contacts + draft) |
| `/career-ops-deep` | `/career-ops deep` | Deep company research |
| `/career-ops-pdf` | `/career-ops pdf` | Generate ATS-optimized CV |
| `/career-ops-latex` | `/career-ops latex` | Export CV as LaTeX/Overleaf .tex |
| `/career-ops-training` | `/career-ops training` | Evaluate course/cert against goals |
| `/career-ops-project` | `/career-ops project` | Evaluate portfolio project idea |
| `/career-ops-tracker` | `/career-ops tracker` | Application status overview |
| `/career-ops-apply` | `/career-ops apply` | Live application assistant |
| `/career-ops-scan` | `/career-ops scan` | Scan portals for new offers |
| `/career-ops-batch` | `/career-ops batch` | Batch processing with parallel workers |
| `/career-ops-patterns` | `/career-ops patterns` | Analyze rejection patterns and improve targeting |
| `/career-ops-followup` | `/career-ops followup` | Follow-up cadence tracker |

**Note:** OpenCode commands invoke the same `.claude/skills/career-ops/SKILL.md` skill used by Claude Code. The `modes/*` files are shared between both platforms.
```

With:

```
### OpenCode Commands

When using [OpenCode](https://opencode.ai), the following slash command is available (defined in `.opencode/commands/`):

| Command | Claude Code Equivalent | Description |
|---------|------------------------|-------------|
| `/career-ops` | `/career-ops` | Show menu or evaluate JD with args (all modes) |

OpenCode uses a single `/career-ops` command with `$ARGUMENTS` routing — the same UX as Claude Code. The skill at `.opencode/skills/career-ops/SKILL.md` handles all mode routing.

**Note:** The `modes/*` files are shared between both platforms.
```

- [ ] **Step 4: Update the Gemini CLI Commands table**

In `AGENTS.md`, find the Gemini CLI Commands section. Update the note at the bottom:

Replace:

```
**Note:** Gemini CLI commands are defined in `.gemini/commands/*.toml`. The project context is auto-loaded from `GEMINI.md`. All `modes/*` files are shared across Claude Code, OpenCode, and Gemini CLI.
```

With:

```
**Note:** Gemini CLI commands are defined in `.gemini/commands/*.toml`. The project context is auto-loaded from `GEMINI.md`. All `modes/*` files are shared across Claude Code, OpenCode, Gemini CLI, and other supported CLIs.
```

- [ ] **Step 5: Verify no stale `claude -p` defaults**

Search AGENTS.md for any remaining `claude -p` references that should be platform-agnostic. The Headless / Batch Mode table is fine (it lists all CLIs). The batch worker exception note should stay as-is since it's in the context of the shared AGENTS.md.

Run: `grep -n "claude -p" AGENTS.md`
Expected: only the table row for Claude Code (line ~272) and the batch exception note (line ~247)

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md
git commit -m "docs: make AGENTS.md platform-agnostic for OpenCode parity"
```

---

## Task 5: Slim Down CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Claude Code-specific notes to CLAUDE.md**

CLAUDE.md is Claude Code's native config file and must contain the full instructions (Claude Code doesn't support the `@AGENTS.md` import syntax that OpenCode uses). Keep the existing content but add Claude Code-specific notes at the bottom.

At the end of `CLAUDE.md`, after the existing `@AGENTS.md` line (line 369) and the comment (line 370), append:

```markdown

## Claude Code Specific

- **Skill path:** `.claude/skills/career-ops/SKILL.md`
- **Slash command:** `/career-ops` (arguments passed via `arguments: mode` frontmatter)
- **Subagent dispatch:** `Agent(subagent_type="general-purpose", ...)`
- **Batch mode:** `claude -p "prompt"`
- **Plugin distribution:** `.claude-plugin/`
```

- [ ] **Step 2: Verify the addition**

Run: `tail -15 CLAUDE.md`
Expected: Claude Code Specific section with skill path, slash command, subagent dispatch, batch mode, plugin distribution

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "refactor: slim CLAUDE.md to thin wrapper over AGENTS.md"
```

---

## Task 6: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update Batch Processing feature row**

In `README.md`, find the feature table row:

```
| **Batch Processing**     | Parallel evaluation with `claude -p` workers                                                                                             |
```

Replace with:

```
| **Batch Processing**     | Parallel evaluation with headless CLI workers (`claude -p`, `opencode run`, etc.)                                                       |
```

- [ ] **Step 2: Update Tech Stack section**

In `README.md`, find the Tech Stack section:

```
- **Agent**: Claude Code with custom skills and modes
```

Replace with:

```
- **Agent**: Claude Code, OpenCode, Gemini CLI, and other [agent-skill-standard](https://agentskills.io) compatible CLIs
```

- [ ] **Step 3: Update the OpenCode badge line**

The README already has an OpenCode badge. No change needed to badges.

- [ ] **Step 4: Update Project Structure tree**

In `README.md`, find the Project Structure section. Update it to include `.opencode/`:

After the line:

```
├── AGENTS.md                    # Canonical agent instructions (all CLIs)
├── CLAUDE.md                    # Claude Code wrapper (imports AGENTS.md)
```

Add:

```
├── .opencode/                   # OpenCode config (commands, skills)
```

And update the modes entry to note they're shared:

```
├── modes/                       # 14 skill modes (shared across all CLIs)
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README for OpenCode parity"
```

---

## Task 7: Update Batch Mode Docs

**Files:**
- Modify: `modes/batch.md`
- Modify: `batch/batch-prompt.md`

- [ ] **Step 1: Update modes/batch.md headless references**

In `modes/batch.md`, find the conductor step that references the headless command (around line 48):

```
      # Use your CLI's headless command (see AGENTS.md — Headless / Batch Mode)
      <headless-cmd> "Process this job. URL: {url}. JD: /tmp/batch-jd-{id}.txt. Report: {num}. ID: {id}"
```

This is already generic (`<headless-cmd>`). No change needed.

- [ ] **Step 2: Verify batch-prompt.md references**

In `batch/batch-prompt.md`, search for any `claude -p` references.

Run: `grep -n "claude -p" batch/batch-prompt.md`
Expected: no matches (batch-prompt.md is self-contained and doesn't reference the CLI command)

- [ ] **Step 3: Update docs/ARCHITECTURE.md**

In `docs/ARCHITECTURE.md`, find the line (around line 66):

```
Each worker is a headless AI CLI instance — the bundled `batch-runner.sh` invokes `claude -p`, but the architecture supports any CLI's headless mode (see the Headless / Batch Mode table in `AGENTS.md` for the correct command per CLI). Workers produce:
```

Replace with:

```
Each worker is a headless AI CLI instance — the bundled `batch-runner.sh` invokes your CLI's headless command (see the Headless / Batch Mode table in `AGENTS.md` for the correct command per CLI). Workers produce:
```

- [ ] **Step 4: Commit**

```bash
git add modes/batch.md docs/ARCHITECTURE.md
git commit -m "docs: remove claude -p default from batch and architecture docs"
```

---

## Task 8: Update Localized READMEs

**Files:**
- Modify: `README.zh-TW.md`
- Modify: `README.pt-BR.md`
- Modify: `README.ja.md`
- Modify: `README.ko-KR.md`
- Modify: `README.ru.md`
- Modify: `README.es.md`
- Modify: `README.cn.md`

- [ ] **Step 1: Update each localized README's batch processing row**

For each localized README, find the batch processing feature row that mentions `claude -p` and update it to be platform-agnostic.

| File | Current | New |
|------|---------|-----|
| `README.zh-TW.md` | `使用 `claude -p` 工作器並行評估` | `使用 headless CLI 工作器並行評估（`claude -p`、`opencode run` 等）` |
| `README.pt-BR.md` | `Avaliação paralela com workers `claude -p`` | `Avaliação paralela com workers headless (`claude -p`, `opencode run`, etc.)` |
| `README.ja.md` | `` `claude -p`ワーカーによる並列評価`` | `headless CLIワーカーによる並列評価（`claude -p`、`opencode run` など）` |
| `README.ko-KR.md` | `` `claude -p` 워커로 병렬 평가`` | `headless CLI 워커로 병렬 평가（`claude -p`, `opencode run` 등）` |
| `README.ru.md` | `Параллельная оценка через `claude -p` воркеры` | `Параллельная оценка через headless CLI воркеры (`claude -p`, `opencode run` и т.д.)` |
| `README.es.md` | `Evaluacion en paralelo con workers `claude -p`` | `Evaluación en paralelo con workers headless (`claude -p`, `opencode run`, etc.)` |
| `README.cn.md` | `使用 `claude -p` worker 并行评估` | `使用 headless CLI worker 并行评估（`claude -p`、`opencode run` 等）` |

- [ ] **Step 2: Commit**

```bash
git add README.zh-TW.md README.pt-BR.md README.ja.md README.ko-KR.md README.ru.md README.es.md README.cn.md
git commit -m "docs: update localized READMEs for OpenCode parity"
```

---

## Verification

After all tasks are complete:

- [ ] **Check OpenCode skill discovery**

```bash
ls -la .opencode/skills/career-ops/SKILL.md
ls -la .opencode/commands/career-ops.md
```

Expected: both files exist

- [ ] **Check Claude Code skill path**

```bash
ls -la .claude/skills/career-ops/SKILL.md
```

Expected: file exists with `arguments: mode` frontmatter

- [ ] **Check old path removed**

```bash
ls .agents/skills/ 2>/dev/null && echo "FAIL: old path still exists" || echo "PASS: old path removed"
```

Expected: `PASS: old path removed`

- [ ] **Check no stale `claude -p` defaults in shared docs**

```bash
grep -rn "claude -p" AGENTS.md CLAUDE.md README.md modes/batch.md batch/batch-prompt.md docs/ARCHITECTURE.md | grep -v "Headless / Batch Mode" | grep -v "CLAUDE.md" | grep -v "Claude Code"
```

Expected: no matches (all remaining references are in the CLI-specific table or CLAUDE.md which is Claude Code-only)

- [ ] **Run pipeline health check**

```bash
node verify-pipeline.mjs
```

Expected: passes (no data files changed)
