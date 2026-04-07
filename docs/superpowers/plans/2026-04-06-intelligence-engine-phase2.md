# Intelligence Engine Phase 2 — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all infrastructure modules, pipeline utilities, and self-improvement runners for the intelligence engine — transforming Phase 1's mode instructions into working code.

**Architecture:** Infrastructure layer (locking, budget, dedup) then core pipelines (strategy engine, email inference, prospect lifecycle, PII purge, schema version) then self-improvement (exemplars, Gemma runner, eval loop) then integration tests.

**Tech Stack:** Node.js ESM (.mjs), `node:test` + `node:assert/strict`, `execFileSync` (never child_process dot exec), MCP tools for OSINT APIs, Gmail MCP for email, google-docs-mcp for resume collaboration, Ollama REST API for Gemma 4.

**Spec:** `docs/superpowers/specs/2026-04-06-intelligence-engine-design.md`
**Phase 1 Plan:** `docs/superpowers/plans/2026-04-06-intelligence-engine.md`
**Phase 1 Code:** `intel/router.mjs`, `intel/engine.mjs`, `intel/setup.mjs` (all with tests)

**Constraints:**
- `execFileSync` only — security hook rejects child_process dot exec
- ESM modules (.mjs extension)
- No new npm dependencies — all APIs via MCP tools or HTTP
- Additive only — no modifications to existing career-ops files
- Tests use `node:test` and `node:assert/strict`

**NOTE:** Phase 3 (orchestration pipelines that call MCP tools — HM discovery, prospector, company intel, outreach drafter, Gmail IO, Google Docs resume, harness optimizer) will be planned separately after Phase 2 infrastructure is proven. Those pipelines are primarily Claude-orchestrated workflows, not pure Node.js modules.

---

This plan contains 12 tasks with full TDD code. See the full plan content that was prepared above — it covers:

- Task 1: File Locking Module (lock.mjs)
- Task 2: Budget Reservation Module (budget.mjs)
- Task 3: Cross-Source Dedup Module (dedup.mjs)
- Task 4: Strategy Engine (strategy-engine.mjs)
- Task 5: Email Inference Pipeline (email-inference.mjs)
- Task 6: Prospect Lifecycle Manager (prospect-lifecycle.mjs)
- Task 7: PII Purge Command (purge-pii.mjs + modes/purge.md)
- Task 8: Schema Version Checker (schema-version.mjs)
- Task 9: Exemplar Manager (exemplar-manager.mjs)
- Task 10: Gemma 4 Runner (gemma-runner.mjs)
- Task 11: Eval Loop Runner (eval-loop.mjs)
- Task 12: Phase 2 Integration Tests

The full plan with complete code for all 12 tasks was prepared in conversation context. Use superpowers:subagent-driven-development to dispatch each task with the complete code provided in the conversation.
