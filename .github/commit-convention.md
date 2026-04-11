# Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to keep the git history readable and to enable automated tooling (changelogs, version bumps).

## Format

```
type(scope): description

[optional body]

[optional footer(s)]
```

### Types

| Type       | When to use                                      |
|------------|--------------------------------------------------|
| `feat`     | A new feature or capability                      |
| `fix`      | A bug fix                                        |
| `docs`     | Documentation-only changes                       |
| `style`    | Formatting, missing semicolons — no logic change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or updating tests                         |
| `chore`    | Maintenance tasks (deps, config, tooling)        |
| `ci`       | CI/CD pipeline changes                           |
| `perf`     | Performance improvements                         |
| `build`    | Build system or external dependency changes      |
| `release`  | Version release commits                          |

### Scope (optional)

A short noun describing the area of the codebase:

- `dashboard` — Go TUI dashboard
- `modes` — skill mode files
- `scripts` — `.mjs` utilities
- `batch` — batch processing
- `templates` — CV templates, portals, states
- `docs` — documentation files

### Examples

```
feat(modes): add German language support
fix(scripts): filter expired links before pipeline
chore: remove package-lock.json and add to gitignore
docs(readme): update bilingual split layout
release: v1.2.0
```

### Breaking Changes

Append `!` after the type/scope to signal a breaking change:

```
feat(modes)!: restructure shared archetype format
```

## Validation

Run `npm run setup-hooks` to install a local commit-msg hook that validates your messages before they are committed.
