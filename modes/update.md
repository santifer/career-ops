# Mode: update — Interactive System Update

When the user runs `/career-ops update`, execute this interactive update flow.

## Step 1 — Check for Updates

Run `node update-system.mjs check` and parse the JSON output.

- If `up-to-date`: Tell the user "career-ops is up to date (v{version})." and stop.
- If `offline`: Tell the user "Cannot reach GitHub to check for updates. Try again later." and stop.
- If `dismissed`: Tell the user "Update check was previously dismissed. Run again to re-check." Remove `.update-dismissed` if it exists, then re-run check.
- If `update-available`: Continue to Step 2.

## Step 2 — Show What Changed

Show the user what will change. Run:

```bash
git fetch https://github.com/santifer/career-ops.git main
```

Then for each System Layer file category, show a summary:

```bash
git diff HEAD..FETCH_HEAD --stat -- modes/ CLAUDE.md AGENTS.md *.mjs batch/ dashboard/ templates/ docs/ VERSION DATA_CONTRACT.md
```

Present to the user as a clear summary:

> **Update available: v{local} → v{remote}**
>
> **Changes summary:**
> - Modes: {N} files changed (list which ones)
> - Scripts: {N} files changed
> - Dashboard: {N} files changed
> - Templates: {N} files changed
> - Other: {N} files changed
>
> **Changelog:**
> {changelog from update-system.mjs check output}
>
> Your personal files (CV, profile, tracker, reports) will NOT be touched.

If the user wants details on specific files, show the actual diff for those files using `git diff HEAD..FETCH_HEAD -- {path}`.

## Step 3 — Compatibility Check

Before applying, check if the update might affect the user's customizations:

1. **Read `modes/_profile.md`** (if it exists)
2. **Diff `modes/_shared.md`**: Run `git diff HEAD..FETCH_HEAD -- modes/_shared.md`
3. **Check for archetype changes**: If `_shared.md` has changes in the "Archetype Detection" section, and `_profile.md` references archetype names, warn the user:
   > "⚠️ The scoring system or archetypes were updated. Your customizations in `_profile.md` may reference outdated archetype names. I'll review them after the update."
4. **Check for scoring changes**: If the "Scoring System" section changed, note it:
   > "ℹ️ The scoring system was updated. Scores in future evaluations may differ slightly from previous ones."
5. **Check for new mode files**: If new modes were added (files in `modes/` that don't exist locally), mention them:
   > "✨ New modes available: {list}. Run `/career-ops` to see all commands."

## Step 4 — Confirm and Apply

Ask the user for confirmation:
> "Ready to update. Apply changes? (This can be rolled back with `/career-ops update rollback`)"

If yes:
1. Run `node update-system.mjs apply`
2. Run `node doctor.mjs` to validate the installation
3. If Step 3 flagged archetype/scoring changes, read the updated `modes/_shared.md` and compare against `modes/_profile.md`. If there are references to renamed or removed archetypes, offer to update `_profile.md`:
   > "Your _profile.md references archetype '{old_name}' which was renamed to '{new_name}'. Want me to update it?"
4. Show final status:
   > "✅ Updated to v{version}. Run `node doctor.mjs` anytime to verify setup."

If no:
1. Run `node update-system.mjs dismiss`
2. Tell the user they can run `/career-ops update` anytime to check again.

## Step 5 — Rollback (if requested)

If the user says "rollback" or runs `/career-ops update rollback`:
1. Run `node update-system.mjs rollback`
2. Show what was restored.

## Rules

- NEVER touch User Layer files during update (cv.md, profile.yml, data/, reports/, etc.)
- The compatibility check in Step 3 only READS user files to check for potential issues — it never modifies them
- Post-update _profile.md adjustments in Step 4.3 are ONLY done with explicit user confirmation
- If anything goes wrong, tell the user to run `node update-system.mjs rollback`
- Keep the output concise — users don't want walls of text during an update
