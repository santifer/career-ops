# English-Default Mode Layout Design

## Goal

Make the repository English-first by turning the root `modes/` directory into the canonical English prompt set, while preserving the current Spanish prompt set under `modes/esp/` and keeping old Spanish command names working as aliases.

## Scope

- Move the current Spanish root mode files into `modes/esp/`
- Rename canonical root mode files to English names
- Translate the moved root Spanish prompt contents into English for the new canonical files
- Keep `modes/de/`, `modes/fr/`, and `modes/pt/` unchanged
- Update routers, wrappers, docs, and verification references

## Canonical Mode Map

| Old root name | New canonical name |
|---|---|
| `oferta.md` | `offer.md` |
| `ofertas.md` | `compare.md` |
| `contacto.md` | `outreach.md` |
| `apply.md` | `apply.md` |
| `auto-pipeline.md` | `auto-pipeline.md` |
| `batch.md` | `batch.md` |
| `deep.md` | `deep.md` |
| `interview-prep.md` | `interview-prep.md` |
| `patterns.md` | `patterns.md` |
| `pdf.md` | `pdf.md` |
| `pipeline.md` | `pipeline.md` |
| `project.md` | `project.md` |
| `scan.md` | `scan.md` |
| `tracker.md` | `tracker.md` |
| `training.md` | `training.md` |

## Compatibility Rules

- Existing Spanish subcommands remain valid aliases:
  - `oferta` -> `offer`
  - `ofertas` -> `compare`
  - `contacto` -> `outreach`
- English names become the canonical names in docs and routing.
- OpenCode wrappers should expose English canonical commands while still documenting Spanish alias compatibility where useful.

## File Layout

- Root `modes/` contains English canonical prompts.
- New `modes/esp/` contains the preserved Spanish versions from the old root layout.
- Existing language folders remain:
  - `modes/de/`
  - `modes/fr/`
  - `modes/pt/`

## Non-Goals

- Do not rewrite user-specific files such as `modes/_profile.md`
- Do not change application status alias handling like `oferta` meaning `Offer` in tracker scripts
- Do not rename German, French, or Portuguese localized files

## Risks

- Router and docs can drift if references are not updated together.
- Cross-language README files mention the old Spanish root filenames; those references need to point to the new English canonical names or the new `modes/esp/` location as appropriate.
- Tests and update manifests may fail if they still expect removed root filenames.

## Verification

- Run repo verification scripts that cover required files and consistency.
- Grep for stale references to old canonical root filenames.
- Inspect the final diff for:
  - `modes/esp/` creation
  - root English canonical files present
  - router alias support in place
