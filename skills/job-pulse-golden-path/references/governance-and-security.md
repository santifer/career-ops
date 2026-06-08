# Governance and Security

The Job Pulse Kanban file holds real personal data — Rahil's career intent, real LinkedIn names, the URLs and roles of his network. Treat it like a private notebook that happens to be HTML, not like a public webpage.

The mental model: **the file is the asset, the network of people inside it is the crown jewel, and `SEED_VERSION` is the audit trail.**

## What lives in the file

| Asset | Sensitivity | Why |
|---|---|---|
| `LINKEDIN_CONNECTIONS` array | High (PII) | Real names + companies + roles + LinkedIn URLs of contacts |
| Live job cards | Medium | URLs are public, but the *aggregation* (which jobs Rahil is targeting) is private |
| `jobDescText` snippets | Low | Public text from job postings |
| Cover letter templates referenced from the file | Medium | Reveal voice, framing, target roles |
| `SEED_VERSION` | Low | Counter only |

## Operating principles

### Confidentiality

- **Never paste connection data into a chat or external system unless explicitly asked.** When summarizing, say "added 2 connections", not "added Naomi at Accenture and Zeeshaan at Ally".
- **Never upload the file to web tools** (Slack, GitHub gists, Pastebin, Google Docs, image-hosts) without confirmation.
- **Never include connection PII in scheduled-task reports** that end up in unattended outputs.
- **Backup files inherit sensitivity.** `.bak-<ISO>` files are still PII. Don't move them off-machine.

### Integrity

- **Atomic writes only.** `.tmp` → rename. A half-written kanban on disk is worse than a refused write.
- **Validate after every edit.** `validate-kanban.mjs` catches HTML breakage, JS parse errors, missing keys, duplicates.
- **Schema migrations are explicit, never silent.** New field? Update reference docs first, validator second, file last.
- **Bump `SEED_VERSION` on every content change.** It's the version stamp. Skipping it makes audits impossible because the file's "version" diverges from its content.

### Availability

- **Backups before every write.** The user can roll back any change by copying a `.bak-<ISO>` over the source.
- **Don't bulk-delete `.bak-*` without listing them first.** Cleanup is the user's call.
- **The golden path is in `assets/golden-path.txt`.** If the path changes, edit one line. Every script follows.

## Threat model

| Threat | Likelihood | Mitigation |
|---|---|---|
| A Cowork chat in another session writes to a different file by accident | High (this happened on 2026-04-29) | This skill — read `assets/golden-path.txt` first, every time |
| Schema drift via partial edits (e.g., `id:'live-N'` vs `id:'rN'`) | High (also happened) | `inspect-kanban.mjs` reports the live pattern; splice script uses it |
| HTML/JS breakage that survives to the browser | Medium | `validate-kanban.mjs` after every edit |
| PII leak via screenshot, paste, or upload | Medium | Refuse to surface raw connection records in chat unless asked |
| Stale board after edit (cache wins) | Medium | Auto-bump `SEED_VERSION` on every content change |
| Lost data from a bad edit | Low | `.bak-<ISO>` backups + atomic write |
| Malicious card insertion (e.g., script injection in `jobDescText`) | Low (single-user, local file) | Splice script escapes single quotes and backslashes when emitting strings; the file's UI text-renders the field, not innerHTML |
| Credentials/tokens accidentally pasted into the file | Low | Validator can be extended to refuse common credential patterns; for now, ad-hoc scan during inspect |

## Data quality contracts

- **URLs are full and resolve.** Splice script accepts `--verify` for HEAD checks.
- **`(company, role)` is unique.** Refuse duplicates.
- **`hasConnection` ↔ `connectionName` ↔ `connectionLinkedinUrl`** are consistent. All populated or all blank.
- **`keywords` are Title Case, max 7.** Match the existing convention.
- **ISO dates only** for `createdAt`, `lastRefreshed`, `closedAt`.

## What "good" looks like end-to-end

A patch session that follows the rules:

1. `node scripts/inspect-kanban.mjs` → confirms `v15-live-jobs`, 25 cards, schema clean.
2. Build new card(s) as a JSON array (with no `id`/`createdAt`/`lastRefreshed` — script fills them).
3. `node scripts/splice-cards.mjs --cards new-cards.json` → writes `.bak-…`, splices after `r25`, bumps to `v16-live-jobs`, prints what changed.
4. `node scripts/validate-kanban.mjs` → 6/6 checks pass.
5. Tell the user what happened in one paragraph; don't list connection PII; offer to roll back if anything looks off.

That's the loop. Boring on purpose.

## Incident response (if something goes wrong)

If a write goes bad:

1. Stop. Don't make another change.
2. Find the most recent `.bak-<ISO>` next to the golden path.
3. Copy it over the golden path: `Copy-Item <bak> <golden> -Force`.
4. Run `validate-kanban.mjs` to confirm the rollback is clean.
5. Diagnose the original failure with `inspect-kanban.mjs` before retrying.

If a fork is discovered (a stray `kanban*.html` somewhere):

1. Don't merge automatically. Diff manually.
2. If the fork is genuinely newer, ask the user before overwriting the golden file with it.
3. After consolidation, archive the fork to `archive/` or delete; never leave it sitting in a parallel outputs folder.
