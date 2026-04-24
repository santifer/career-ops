# Templates Context

`templates/` is system layer. It contains reusable templates and canonical shared definitions.

`states.yml` is the source of truth for application statuses. Do not redefine canonical states in scripts, modes, or dashboard code. Add aliases only when mapping a real variant to an existing state.

`cv-template.html` controls the generated CV layout. Keep placeholder tokens intact unless you update the generator and tests at the same time.

`portals.example.yml` is a generic scanner template. User-specific portal choices belong in root `portals.yml`.

When changing templates, check all scripts that consume them before assuming a placeholder or field is unused.
