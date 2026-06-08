# Fix Plan — Anthropic TPM Consumer Engineering Duplicate

Detected by `validate-kanban.mjs` on 2026-04-29 against `SEED_VERSION = v15-live-jobs`.

## What's wrong

The board has two cards for the same posting:

| Card | id | Lines (approx) | Anchor style | Schema | Verdict |
|---|---|---|---|---|---|
| Original | `r1` | 3115–3126 | `// ── REAL JOB 1` | Clean — matches the rest of the file | **Keep** |
| Clone | `live-5` | 3475–3488 | `// ── LIVE JOB CARD 5` | Has stray `isWarmReferral: false` field that doesn't exist anywhere else; uses `live-N` id pattern | **Remove** |

Both point to the same URL: `https://job-boards.greenhouse.io/anthropic/jobs/5062968008`.

## Why this happened

The `live-5` clone came from the 2026-04-29 1 AM scheduled run (the one that prompted you to ask for this skill). That run patched against the wrong assumed schema — `LIVE JOB CARD` anchors and `live-N` ids — when the file's real convention is `REAL JOB` anchors and `rN` ids. The skill's `inspect-kanban.mjs` is built specifically to prevent this from happening again.

## The fix (no code execution required from you — just a plan)

When you next run the skill against the live golden file, do this:

1. **Read the current file:**
   ```powershell
   node "C:\Users\rahil\career-ops\skills\job-pulse-golden-path\scripts\inspect-kanban.mjs"
   ```
   Confirm the report still shows the duplicate and 12 stray `LIVE JOB CARD` anchors.

2. **Make a manual edit (one block, one save):**
   Open the golden file in an editor, find the `// ── LIVE JOB CARD 5` block (≈line 3475), and delete from that comment line through the closing `},` of the `live-5` card object — about 14 lines. Save.

3. **Validate immediately:**
   ```powershell
   node "C:\Users\rahil\career-ops\skills\job-pulse-golden-path\scripts\validate-kanban.mjs"
   ```
   The `no-duplicate-cards` check should now pass. All 10 checks should be green.

4. **Bump SEED_VERSION** (since content changed):
   Change `'v15-live-jobs'` → `'v16-live-jobs'`. This forces the browser to re-seed.

5. **Reload the kanban** — the Anthropic TPM card should appear once.

## Optional bigger cleanup (recommended in a follow-up session)

The 12 other `LIVE JOB CARD` anchors are likely the rest of that botched 2026-04-29 batch (Hudl, Raft, Samsara, Twilio, Pinterest, Tala, BJSS, OpenTable, 84.51°, Smartsheet, plus two more). They're not strict duplicates but they are schema-drifted. A second cleanup pass should:

1. Re-run `inspect-kanban.mjs` after the dup fix.
2. For each `LIVE JOB CARD` block: either rename to the next available `rN` id and remove `isWarmReferral`, or delete if the role isn't a strong fit.
3. One bump of `SEED_VERSION` at the end.

That's a separate session — don't conflate it with the dup fix above.

## Why I'm not auto-applying

The skill's contract is that schema migrations and cleanup are **explicit, never silent.** This document is the explicit step. When you're ready, run the manual edit above (or ask me to do it in this chat after I have access to the live golden path).
