# GitHub Context

`.github/` contains repository automation, workflows, issue templates, and GitHub-specific contributor instructions.

Keep CI checks aligned with the local validation scripts:

- `node test-all.mjs`
- `node verify-pipeline.mjs`
- dashboard `go test ./...`

Do not reference private local paths or personal user data in public-facing GitHub templates or workflows.

If dependency or security workflows change, verify that they still match the Node and Go module layout in this repository.
