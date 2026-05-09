@AGENTS.md
<!-- Add anything Claude Code specific that other agents don't need -->

## Tonight / first-thing pointer

If the user is sitting down to build application materials → open `data/TODAY.md` first (master nav), then `data/APPLY-NOW.md` (ranked queue), then follow `data/HOW-TO-APPLY.md`. Pre-flight via `data/pre-flight-checklist.md` before submitting.

## Session Notes — 2026-05-08 (cost reduction autonomous run)
- Baseline captured: 944/1314 advanced (71.8%) on backlog run — triage too permissive
- cache_control added to batch-runner-batches.mjs (static block ~26,715 tokens)
- triage → JSON schema + 3 few-shot + Zod-style validator + retry loop (max 3)
- triage thresholds raised: T1=3.7, T2=3.9, T3=4.2 (env: TRIAGE_THRESHOLD_T1/T2/T3)
- lib/provider-client.mjs: circuit breaker (3 failures → 5min cooldown) + exponential backoff with 10–30% jitter
- triage provider routing: local Ollama → Haiku → Gemini Flash (env: TRIAGE_PROVIDER_PRIORITY, default: local,anthropic,gemini)
- triage-local.mjs: Ollama with M2 memory check, /api/chat + think:false for qwen3, chain (14B → 8B → 3B)
- qwen3:8b confirmed working via live test — use /api/chat not /api/generate for qwen3 reasoning models
- gemini-eval.mjs: wired as real fallback via --mode=triage flag (GEMINI_API_KEY gated)
- scripts/prebake-context.mjs: hash-gated context bundle (data/baked-context.md, gitignored)
- module-level readCached(): added to batch-runner-batches.mjs + triage.mjs
- triage-benchmark.mjs: 40-item harness (variance, multi-provider, --simulate, --dry-run)
- scripts/token-counter.mjs: static block measurement for cache effectiveness
- Checkpoint files: /tmp/career-ops-phase-{0..8}-complete (delete to re-run a phase)
- Session result: FULL SUCCESS (see /tmp/session-report.md)
- Estimated monthly savings: ~$104–$127/month (thresholds + caching + Ollama + prebake)

## Session Notes — 2026-05-07 (overnight autonomous run)
- Em dash (—) established as formatting convention for all LinkedIn experience entries
- Trans military panel attribution corrected: HuffPost Live (Marc Lamont Hill host), NOT AJ+. File renamed accordingly.
- heartbeat.mjs sends via Gmail SMTP/nodemailer — do NOT use Gmail MCP compose for heartbeats
- Batch launchd schedule updated: 03:00 PT → 08:05 PT (post Claude Max quota reset)
- verify-pipeline.mjs now gates merge-tracker — fix any validation errors before merging
- Voice reference file added: writing-samples/voice-reference.md
- 2026-05-07 evening QA pass: `data/TODAY.md`, `data/APPLY-NOW.md`, `data/HOW-TO-APPLY.md`, `data/pre-flight-checklist.md`, `templates/cover-letter-template.md`, `interview-prep/story-bank.md` (10 STAR+R stories), 8 corpus/companies stubs, `scripts/build-apply-pack.mjs`, `scripts/apply-pending-diff.mjs`, `scripts/grok-research.mjs`, heartbeat patched with "Tonight's Top 5" action-cut section, 13 fresh apply-packs pre-built for the apply-now queue (20 total).
