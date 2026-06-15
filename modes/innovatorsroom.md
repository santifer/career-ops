# Mode: innovatorsroom — InnovatorsRoom newsletter importer

Imports roles from the **InnovatorsRoom** newsletters into the pipeline, filtered
to the user's target paths. Fork-local personal source — see `LOCAL_CHANGES.md`.

**Newsletters covered** (all subscribed; all use the same Beehiiv role-block layout,
so one parser handles them):
- **TechJobs** — monthly highlights (`TechJobs #NNN`).
- **AI-enabler JobDrop** — AI/generalist roles at AI-frontier companies.
- **Senior Operator JobDrop** — CEO/COO/CFO/cofounder roles.
- **Senior Investor JobDrop** — Investment Manager / Principal / Partner roles.
(Product Manager / Chief of Staff / Junior Investor JobDrops are *not* subscribed.)

## Prerequisite (one-time)
Newsletters go to `remo.kyburz1@gmail.com` and are **auto-forwarded** to
`kyburz.remo@gmail.com` (the Gmail account on the Gmail MCP). The forward filter
should match **any** InnovatorsRoom sender — if some JobDrops don't appear, broaden
the source-account filter to `from:innovatorsroom.com`.

## Flow

1. **Find issues.** Use the Gmail MCP `search_threads`:
   `(from:innovatorsroom.com OR subject:JobDrop OR subject:"InnovatorsRoom TechJobs") newer_than:30d`
   — catches direct + forwarded copies of every newsletter.
   Skip already-imported issues: an issue is done if `data/innovatorsroom/{label}.txt`
   exists or `data/scan-history.tsv` contains `innovatorsroom-{label}`, where `{label}`
   is a slug of the subject (e.g. `techjobs-116`, `senior-operator-jobdrop-2026-06-15`).

2. **For each new issue (newest first):**
   a. `get_thread` (messageFormat: `FULL_CONTENT`) → take `messages[0].plaintextBody`.
   b. Save it verbatim to `data/innovatorsroom/{label}.txt`.
   c. Run: `node innovatorsroom.mjs data/innovatorsroom/{label}.txt --issue {label}`
      (prefix with `--dry-run` first to preview without writing).
   d. **First time a JobDrop type arrives:** sanity-check the parsed count vs the
      email; if a JobDrop uses a different layout than TechJobs, tell the user and
      adjust the block parser in `innovatorsroom.mjs` before importing.

   `innovatorsroom.mjs` parses the 6-line role blocks, applies the **same**
   `title_filter`/`location_filter` as the portal scanner (from `portals.yml`),
   resolves each keeper's Beehiiv tracking link to its real ATS/LinkedIn URL
   (stripping `utm_*`/`i12m` params), dedups against
   `scan-history.tsv` + `pipeline.md` + `applications.md`, and appends the
   survivors to `data/pipeline.md` (`## InnovatorsRoom #NNN`) + `scan-history.tsv`.

3. **Report** the per-issue summary (parsed / passed / added) and the new roles.
   Then suggest `/career-ops pipeline` to evaluate them.

## Notes
- Only the ~30 roles explicitly listed per email are imported; the "+N additional
  roles" live behind the InnovatorsRoom Slack (not reachable here).
- Deterministic + idempotent: re-running an issue adds nothing new (dedup). Safe
  to run on every issue.
- Featured/sponsored roles use a different layout and are intentionally skipped.
- The script reuses `buildTitleFilter`/`buildLocationFilter` exported by `scan.mjs`,
  so any tuning of `portals.yml` filters automatically applies here too.
