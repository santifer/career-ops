# Modes Context

`modes/` contains prompt instructions for Career Ops workflows. These files define agent behavior, scoring, report structure, PDF generation, scanning, batching, and application assistance.

User-specific personalization belongs in `modes/_profile.md`. Examples: archetypes, targeting narrative, proof-point emphasis, compensation strategy, deal breakers, preferred geography, and negotiation language.

Reusable system behavior belongs in `_shared.md` or the relevant mode file. Examples: scoring rubric, required report headers, ethical rules, batch process, verification logic, and output format.

Do not put personal data into `_shared.md`, language mode files, or other system-layer mode files unless the user is intentionally changing the reusable product.

Language folders:

- `de/` is for German/DACH modes.
- `fr/` is for French/francophone modes.
- `ja/` may be referenced by project instructions when present.

Use the default English modes for English job postings unless the user or `config/profile.yml` requests a language-specific mode.
