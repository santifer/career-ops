# Golden Path Policy

## Why this exists

Cowork sessions are like parallel universes — every chat starts with a blank context. Without a shared anchor, each chat invents its own version of "the kanban", drops cards in `outputs/`, then disappears. After a week you have 11 board files, 4 outputs folders, and a graveyard of `job-pulse-kanban (3).html` clones. The board you actually use is now the worst-maintained one because nobody remembers which is canonical.

This policy is the anchor. **One file. One path.** Every Cowork chat that touches the board lands on the same target.

It's the same principle as a database having one primary key per table. The moment you allow two, you stop being a database and start being a folder of CSVs.

## The single source of truth

```
C:\Users\rahil\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\local-agent-mode-sessions\2622c7c0-f3b3-4deb-9739-ef9e53939676\32cc5b5e-9c8c-46cb-8d2f-7a6ba0d58861\local_76be79d0-28f8-4807-a360-0215a9d77d5f\outputs\job-pulse-kanban.html
```

Stored in `assets/golden-path.txt`. Every script reads from there. To move the file, change one line; everything follows.

## The seven anti-fork laws

1. **Never write a sibling file.** No `kanban-v2.html`, `pulse-engine-4.html`, `job-pulse-new.html`, no copies for "experiments". Experiments live behind feature flags inside the same file.
2. **Never create a parallel outputs folder.** `output/`, `outputs2/`, `kanban/`, `pulse-board/` — all forks. Targeted writes to the existing path only.
3. **Never write to the file without backing it up first.** `.bak-<ISO>` next to the source. The splice and update-connections scripts do this automatically. Don't bypass them.
4. **Never skip the `SEED_VERSION` bump on content changes.** The browser caches state. If the version doesn't change, the user reloads and sees the old board — looks like the change failed, prompting another fork.
5. **Never silently change the schema.** New field = surface to user, update reference docs, update validator, then patch.
6. **Never leak `LINKEDIN_CONNECTIONS` outside the file.** PII boundary.
7. **Never assume — always inspect.** Every patch session begins with `inspect-kanban.mjs`. The file's truth beats your memory of the file.

## Triggering this policy

If a Cowork chat asks for any of the following, this skill should fire:

- "Make a new job board" → refuse, redirect to the golden path
- "Save another version of the kanban" → refuse, explain backups
- "Put the cards in a fresh outputs folder" → refuse, explain the path
- "Spin up a v4 with extra columns" → enhance the existing file behind a flag instead

If the user insists on a true fork after hearing the trade-offs, that's their call — but the conversation should not slip into forking by default.

## Refusal template

Use this voice (warm, not bureaucratic):

> "The Job Pulse skill is designed to keep one canonical board so we don't end up with three half-maintained versions. Let me update the existing one at `<golden-path>` instead — same outcome, no drift. If you actually want a parallel experiment, I'll set it up behind a feature flag inside the same file so it stays unified."

## When the policy can be relaxed

- **One-off exports.** Generating a static read-only snapshot of the board for sharing is fine. Save it under `output/snapshots/job-pulse-snapshot-<date>.html` and treat it as immutable.
- **Backup files.** `.bak-<ISO>` files are fine and expected. They are not forks; they're rollback points.
- **Migration windows.** If the schema is being intentionally changed, you can keep the old file around with a `.pre-migration` suffix for one cycle, then delete.

## Health check (run weekly)

The user can ask: "Is my Job Pulse healthy?" Run:

1. `node scripts/inspect-kanban.mjs` — confirms the file exists, schema is clean, SEED_VERSION is current.
2. `node scripts/validate-kanban.mjs` — confirms the file parses and has no duplicates.
3. List `.bak-*` files older than 30 days; suggest cleanup.
4. Search the user's filesystem for any other `*kanban*.html` or `pulse-engine*.html` files. If found, surface them as suspected forks and propose archive or delete.

That's the maintenance loop. It's small on purpose.
