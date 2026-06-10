# Ingest Mode

Capture a source into the local ingest queue and produce a reviewable proposal.

Run:

```bash
node ingest.mjs <path-or-url>
node ingest.mjs inbox
```

Drop-folder workflow:

1. Put files in `data/ingest/inbox/`.
2. Ask the agent to run `/career-ops ingest inbox`, or run
   `node ingest.mjs inbox`.
3. The command processes every regular file in the inbox and skips unchanged
   files already recorded in the manifest. If an unchanged file has an older
   proposal schema, the raw copy is still skipped but the proposal may be
   refreshed in place.

Behavior:

1. Save a raw copy under `data/ingest/raw/`.
2. Record source identity, hash, raw path, proposal path, classification, and
   target files in `data/ingest/manifest.json`.
3. Write a proposal JSON under `data/ingest/proposals/`.
4. Stop. Do not apply the proposal automatically.

Binary files such as PDFs and DOCX files are captured as raw sources. The
proposal may classify them from the filename, but it must mark
`content_extract_status: binary_unparsed` and avoid extracting claims until a
separate parser, OCR step, or human review reads the file contents.

The proposal is intentionally conservative. It may recommend target files such
as `article-digest.md`, `config/profile.yml`, `modes/_profile.md`,
`portals.yml`, `data/pipeline.md`, or `jds/`, but those files must be edited by
a separate reviewed step.

Use `--force` only when the user explicitly wants to re-ingest unchanged
content.
