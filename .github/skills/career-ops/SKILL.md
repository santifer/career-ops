---
name: career-ops
description: AI job search command center -- evaluate offers, generate CVs, scan portals, and track applications
---

# career-ops -- Portable Router

`AGENTS.md` is the canonical instruction file for this repository. Read it first.

## Mode Routing

Determine the mode from `{{mode}}`:

| Input | Mode |
|-------|------|
| (empty / no args) | `discovery` |
| JD text or URL (no sub-command) | `auto-pipeline` |
| `oferta` | `oferta` |
| `ofertas` | `ofertas` |
| `contacto` | `contacto` |
| `deep` | `deep` |
| `pdf` | `pdf` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |

If `{{mode}}` is not a known sub-command and looks like a JD or job URL, run `auto-pipeline`.
Otherwise, show discovery.

## Discovery mode

Show the command menu and explain that the user can paste a JD or URL directly.

## Context loading

For `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, and `batch`:
- read `modes/_shared.md`
- read `modes/{mode}.md`

For `tracker`, `deep`, `training`, and `project`:
- read `modes/{mode}.md`

Then execute the instructions from the loaded mode files.
