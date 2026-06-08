---
name: job-pulse-golden-path
description: Operate on Rahil's single canonical Job Pulse Kanban HTML — the Pulse Engine 3.0 board. Use this skill whenever the user mentions "job pulse", "kanban", "pulse engine", "the board", "live jobs", a `vN-live-jobs` SEED_VERSION, REAL JOB cards, refreshing or adding live job cards, updating the LinkedIn connections array, debugging the kanban UI/UX, dispatching a Cowork kaizen on the board, or any work that even hints at producing a new job-tracking HTML file. This skill is the anti-fork governance layer — it forces every refresh, edit, debug pass, and cover-letter generation to land on the ONE golden file at C:\Users\rahil\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\local-agent-mode-sessions\2622c7c0-f3b3-4deb-9739-ef9e53939676\32cc5b5e-9c8c-46cb-8d2f-7a6ba0d58861\local_76be79d0-28f8-4807-a360-0215a9d77d5f\outputs\job-pulse-kanban.html. If the user is in any Cowork chat asking to update, refresh, audit, redesign, translate, or "the kanban", trigger this skill — even if they don't name the file. Do NOT create new boards, new outputs folders, or sibling clones; this skill will refuse forks and redirect to the golden path.
---

# Job Pulse Golden Path

## What this skill is for

There is exactly one Pulse Engine 3.0 Kanban file. Every Cowork chat that touches "the board" must land on that same file. This skill is the gate: it carries the canonical path, the real schema observed in the file, the anti-fork policy, and the deterministic scripts to inspect / patch / validate the file without drifting from its current shape.

The story to keep in your head: think of the golden file as a **single living organism**. Every Cowork chat is a different doctor. Without a shared chart, each one prescribes a different treatment and the patient ends up with three boards, four outputs folders, and a graveyard of `job-pulse-kanban (1).html` clones. This skill **is** the chart. Read it before you touch the patient.

## The golden path (canonical, immutable)

```
C:\Users\rahil\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\local-agent-mode-sessions\2622c7c0-f3b3-4deb-9739-ef9e53939676\32cc5b5e-9c8c-46cb-8d2f-7a6ba0d58861\local_76be79d0-28f8-4807-a360-0215a9d77d5f\outputs\job-pulse-kanban.html
```

Forward-slash form (for browsers and tools that prefer it):

```
file:///C:/Users/rahil/AppData/Local/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude/local-agent-mode-sessions/2622c7c0-f3b3-4deb-9739-ef9e53939676/32cc5b5e-9c8c-46cb-8d2f-7a6ba0d58861/local_76be79d0-28f8-4807-a360-0215a9d77d5f/outputs/job-pulse-kanban.html
```

This path is also stored in `assets/golden-path.txt` and consumed by every script in `scripts/`. If the path ever needs to change, edit one place — `assets/golden-path.txt` — and the entire skill follows.

## When this skill triggers (and what to do)

| User intent | First move |
|---|---|
| "Refresh job pulse" / "scan for new jobs" / "1 AM run" | Run `scripts/inspect-kanban.mjs`, then add cards via `scripts/splice-cards.mjs` |
| "Add this job to the board" / "drop this URL on the kanban" | Build a single card (see `references/card-schema.md`), then splice |
| "Update my LinkedIn connections list" | Use `scripts/update-connections.mjs` to edit `LINKEDIN_CONNECTIONS` in place |
| "Debug the UI" / "the freshness filter is broken" / "fix the dark theme" | Read the file, propose targeted CSS/JS edits — never rewrite the whole HTML |
| "Translate the board to Spanish" / "kaizen pass on the column copy" | Same — targeted text edits, never a fork |
| "Make me a new job board" | **Refuse the fork.** Redirect to the golden path. Tell the user this skill maintains exactly one board by design |
| "Where's the file?" | Print the golden path |
| The user pastes a different `.html` they think is the board | Diff it against the golden file. If the golden file is newer or richer, treat the paste as stale and discard. If the paste is genuinely newer, ask before overwriting. |

## The operating model (read → diff → splice → validate → backup → write)

Every change to the golden file follows the same loop. Skipping a step is how forks and bugs get born.

1. **Read.** Always read the current file first via `scripts/inspect-kanban.mjs`. Capture: current `SEED_VERSION`, live card count, schema variant (do cards use `id:'rN'` or `id:'live-N'`? what anchor comment style?). Never assume; the file evolves.
2. **Diff.** Compare your intended change against what's already there. If you're adding a Samsara TPM card and Samsara TPM is already on the board, that's a duplicate — abort.
3. **Splice.** Use `scripts/splice-cards.mjs` (anchor-aware, idempotent) to add new cards. The script preserves the existing card-id pattern and inserts after the last existing card.
4. **Validate.** Run `scripts/validate-kanban.mjs`. It checks: HTML still well-formed, the `<script>` block still parses as JS (via `node --check`), `SEED_VERSION` matches the new pattern, every card has the required keys.
5. **Backup.** Before the final write, the splice script writes a timestamped `.bak-<ISO>` next to the golden file. Don't disable this — it's how rollbacks happen.
6. **Write.** Atomic `.tmp` → rename. No partial files on disk.

If any step fails, the file is left untouched. That's the contract.

## Data contract (what a card actually looks like in this file)

The file's current schema, observed live (do not invent variants):

```javascript
{
  id: 'r17',                                  // string, unique, follows existing pattern
  company: 'Samsara',                          // string
  role: 'Program Manager, Customer Support Enablement',
  platform: 'greenhouse',                      // 'greenhouse' | 'lever' | 'ashby' | 'workday'
  columnId: 'new-hot',                         // existing kanban column id
  url: 'https://...',                          // full posting URL, must resolve
  connectionName: '',                          // empty string if no connection
  hasConnection: false,                        // mirrors connectionName presence
  connectionLinkedinUrl: '',                   // empty string if no connection
  keywords: ['...', '...'],                    // up to 7 strings, Title Case
  jobDescText: '...',                          // 2-3 sentence summary
  createdAt: new Date(now - N*h).toISOString(),
  lastRefreshed: new Date(now - N/2*h).toISOString(),
  closedAt: null,                              // ISO string when the posting is closed
}
```

Comment block above each card:

```javascript
    // ── REAL JOB N ─────────────────────────────────────────────
    // {Company} · {Role} · {Platform}
    // Verified live {Month YYYY}: {URL}
```

Full schema details, including the `LINKEDIN_CONNECTIONS` shape, the `SEED_VERSION` rule, and the `extractKeywords()` helper that lives in the file, are in `references/card-schema.md`. Read that file before writing any patch.

## Governance (the anti-fork laws)

1. **One file. One path.** Never write a new `job-pulse-kanban*.html`, `kanban-v2.html`, `pulse-engine-4.html`, or any sibling. If the user asks for "a new board", explain that this skill is exactly the rule against that. Offer to enhance the existing board instead.
2. **No new outputs folders.** Don't create `outputs2/`, `kanban/`, `pulse-board/`, or any parallel directory. Targeted writes only, into the path stored in `assets/golden-path.txt`.
3. **Bump `SEED_VERSION` on every content change.** The file's `SEED_VERSION` (currently `v15-live-jobs` as of last inspection) is what forces the browser to re-seed local state. If you don't bump it, the user reloads and sees stale data — looks like the change failed. Splice script auto-bumps; do not skip this step.
4. **Backups before writes, always.** `.bak-<ISO>` next to the file. Cleanup is the user's call, not yours.
5. **Validate before write, never after.** Validate against the staged copy, then atomic-rename. A broken HTML on disk is worse than a refused write.
6. **No silent schema migrations.** If you discover a card has an extra field you've never seen, do not "normalize" it. Surface it to the user, propose a migration, get sign-off.

More detail on the rules and the reasoning behind them is in `references/golden-path-policy.md`.

## Data quality

- **Verify URLs.** Every new card URL must resolve. The splice script accepts a `--verify` flag that does a `HEAD` and refuses to insert 404s.
- **Dedupe by `(company, role)` tuple.** Same company + same role title = duplicate; refuse.
- **Dates as ISO strings.** `createdAt` and `lastRefreshed` must be valid ISO. The splice script generates them from `now - N*h`.
- **Keywords as Title Case, max 7.** Match the existing convention.
- **`hasConnection` mirrors `connectionName`.** Either both populated or both blank — never inconsistent.
- **`LINKEDIN_CONNECTIONS` entries** use the compact shape `{n, c, p, u}` (name, company, position, url). Don't switch to long-form keys.

## Security and privacy

This file contains PII — real LinkedIn names, companies, positions, and profile URLs. Treat it accordingly:

- **Never paste the `LINKEDIN_CONNECTIONS` array into a chat or external system** unless the user explicitly asks. When summarizing changes, say "added 2 connections" — don't list them.
- **Do not exfiltrate the file** to web tools (Slack uploads, GitHub gists, Google Docs) without confirmation.
- **No credentials or tokens in the file.** If you ever spot one, refuse the edit and tell the user.
- **Backup files inherit the same sensitivity** as the source. The skill writes them next to the golden path; don't move them off-machine.

Full threat model in `references/governance-and-security.md`.

## Bundled scripts (the deterministic muscle)

All scripts live in `scripts/`, take the golden path from `assets/golden-path.txt` by default, and accept overrides via CLI args.

| Script | Purpose | Mental model |
|---|---|---|
| `inspect-kanban.mjs` | Read SEED_VERSION, card count, schema variant, last few card titles. Use first, every time. | "Stethoscope" |
| `splice-cards.mjs` | Insert one or more cards after the last existing card, preserve id pattern, bump SEED_VERSION, write `.bak`. | "Surgeon" |
| `update-connections.mjs` | Insert/update entries in `LINKEDIN_CONNECTIONS` in place. | "Address book editor" |
| `validate-kanban.mjs` | HTML well-formedness + JS syntax check + schema sanity. Run after every splice. | "Post-op X-ray" |
| `golden-path.mjs` | Print the canonical path. Useful when the user asks "where's the file?" | "GPS pin" |

Each script prints what it did and exits non-zero on failure. Read the source if you want to see exactly how the anchors are matched.

## Workflow examples

### Example 1: User pastes a JD URL and says "drop this on the board"

1. Read the JD (browse if needed), extract company / role / platform / URL.
2. Run `node scripts/inspect-kanban.mjs` to get the current card-id pattern (e.g. `r1…r25`) and `SEED_VERSION`.
3. Build a single card object using the next id (`r26`).
4. Optional: lookup `LINKEDIN_CONNECTIONS` for that company; populate connection fields if present.
5. Run `node scripts/splice-cards.mjs --cards stdin` and pipe the JS object in.
6. Run `node scripts/validate-kanban.mjs`.
7. Tell the user: "Added Samsara TPM as r26, SEED_VERSION v15→v16, backup at …".

### Example 2: User says "the freshness filter shows wrong counts"

1. Read the file. Locate the freshness filter logic.
2. Diagnose. Propose a single-line or single-block fix.
3. Use `Edit` (not Write) on the golden file directly — but only after copying the file to a `.bak-<ISO>` first.
4. Validate with `validate-kanban.mjs`.
5. Bump SEED_VERSION (in this case the user explicitly chose UI fix, but bumping is still safe and forces reload).

### Example 3: User says "make me a new kanban"

1. **Refuse politely.** Explain: this skill exists specifically to keep one canonical board. Forking creates clones, drift, and the exact problem the user originally asked to solve.
2. Offer alternatives: enhance the existing board, add a new column, add a new sample-data variant behind a feature flag inside the same file.
3. If the user insists after hearing the reasoning, surface the trade-off clearly and let them decide. Don't unilaterally fork.

## When in doubt

Print the golden path, run `inspect-kanban.mjs`, and report what you see. That's never the wrong move. The skill is designed to make "do less, but on the right file" the path of least resistance.
