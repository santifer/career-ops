# Plugins

Plugins extend career-ops with integrations that need an API key or talk to an
external service — things the zero-keys, local-first core doesn't carry. They are
**opt-in**, sandboxed-by-convention, and additive: with no plugins enabled, the
core runs exactly as it always has.

> This is **not** the Claude Code plugin (`.claude-plugin/`). These plugins
> extend career-ops itself.

## Using plugins

```bash
node plugins.mjs list          # what's installed + its trust badge
node plugins.mjs available     # bundled + community plugins we've approved
node plugins.mjs add <name>    # install an approved community plugin
node plugins.mjs enable <id>   # show the capability card (then add --confirm)
node plugins.mjs skill <id>    # print a plugin's how-to (if it ships one)
```

Two gates must both be satisfied for a plugin to run: it must be **enabled**
(`node plugins.mjs enable <id> --confirm`, which records your consent) **and** its
keys must be in your `.env`. `node doctor.mjs` shows what's missing.

### Trust badges

| Badge | Meaning |
|-------|---------|
| `📦 bundled` | Shipped in `plugins/`, reviewed in-tree, auto-updated with the core. |
| `✓ approved` | A community plugin we reviewed at an exact pinned commit (in the registry). |
| `❓ community-unverified` | You installed it from a repo we haven't reviewed — you're trusting the author. |
| `⚠️ off-registry` | Installed commit differs from the approved one. |

If a plugin's files change without a version bump, career-ops **blocks it** and
asks you to review + `node plugins.mjs trust <id>` to re-pin (tamper detection).

## Writing a plugin

```bash
node plugins.mjs new my-plugin     # scaffolds plugins.local/my-plugin/
```

A plugin is a directory with a `manifest.json` (validated before any code is
imported), an `index.mjs` (default-exports your hooks), and optionally a
`skill.md` + `_helpers`. Hooks: **provider / ingest / search / notify / export**
— there is no auto-submit hook. Producers **return** `Job[]`; the engine writes
them. Reach the network **only** through `ctx.fetch` (your manifest
`allowedHosts` is enforced, with SSRF protection). Keys arrive via `ctx.env`,
non-secret settings via `ctx.settings`.

See `plugins/README.md` for the full contract + the honest trust model (plain
ESM has no hard sandbox — bundled plugins are code-reviewed; your own are your
trust).

## Publishing + getting approved

1. Develop locally, then publish your plugin as its **own public GitHub repo**
   named exactly `career-ops-plugin-<name>` (the template repo gives you the
   right shape + a release workflow). Minimum files: `manifest.json`,
   `index.mjs`, `README.md`, `LICENSE`, plus `skill.md` + `test/smoke.mjs` to be
   listable.
2. File a **Plugin registration** issue (becomes your plugin's home/changelog).
3. Open a **registry PR** (the `?template=plugin-registry.md` template — the
   template repo's release workflow can open it for you on a release tag) that
   adds your entry to `plugins-registry.json`, pinned to an exact commit. CI
   (`plugin-registry-validate`) checks the naming, manifest, min-files, license,
   egress, and a static audit before a maintainer reviews. Once merged, users can
   `node plugins.mjs add <name>` and your plugin ships to them via the normal
   update.
4. **Updates** = one more registry PR bumping your entry's `sha` + `version`
   (your release workflow opens it from your own fork). Users only ever get the
   commit we approved.

Broadly-useful, low/zero-key plugins may be promoted from listed to **bundled**
(shipped in `plugins/`). See `docs/PLUGIN_REVIEW.md`.

## Not a plugin

- **Centralized infrastructure** the project would run (hosted aggregation,
  shared services, proxies) → a separate, opt-in service, see
  [Discussion #904](https://github.com/santifer/career-ops/discussions/904).
- **Auto-submitting / blind-applying** → out of the core everywhere. career-ops
  drafts for you to review and submit; it is a decision-support tool, not a bot.
